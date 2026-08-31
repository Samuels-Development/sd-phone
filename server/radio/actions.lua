---@type table Radio persistence layer (server.radio.store): prefs row + saved-channel CRUD.
local store  = require 'server.radio.store'
---@type table Player bridge (bridge.server.player): citizenid/job lookups from a server id.
local player = require 'bridge.server.player'
---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type table Actions module; the table returned at end of file.
local actions = {}

---True when `job` appears in a range's allowed-jobs list. A nil list never matches.
---@param job string|nil the caller's current job name (nil when the bridge can't resolve one)
---@param jobs table|nil the range's allowed job names
---@return boolean listed
local function jobInList(job, jobs)
    if not jobs then return false end
    for _, j in ipairs(jobs) do if j == job then return true end end
    return false
end

---@type number Frequency (MHz) handed out when a player has never saved prefs.
local DEFAULT_FREQ   = 1.0
---@type integer Volume (0-100) handed out when a player has never saved prefs.
local DEFAULT_VOLUME = 50

---@type integer Saved-channel cap per character.
local SAVED_CAP = 24

---Stable per-character key (framework citizenid) scoping every read/write, resolved from src via
---the bridge.
---@param src integer player server id
---@return string|nil citizenid (nil when the player can't be resolved)
local function cidOf(src) return player.getIdentifier(src) end

local util = require 'server.util'
local trim = util.trim

---Clamp a client-supplied frequency to the app's 1.0-999.9 band, snapped to one decimal place.
---NaN collapses to the default.
---@param f any raw client value
---@return number frequency one-decimal in-band frequency
local function clampFreq(f)
    f = tonumber(f) or DEFAULT_FREQ
    if f ~= f then f = DEFAULT_FREQ end
    if f < 1.0 then f = 1.0 elseif f > 999.9 then f = 999.9 end
    return lib.math.round(f, 1)
end

---Clamp a client-supplied volume to an integer 0-100. NaN collapses to the default.
---@param v any raw client value
---@return integer volume
local function clampVolume(v)
    v = tonumber(v) or DEFAULT_VOLUME
    if v ~= v then v = DEFAULT_VOLUME end
    v = math.floor(v)
    if v < 0 then v = 0 elseif v > 100 then v = 100 end
    return v
end

---Whether `src` may tune to `freq`, per config.Radio.RestrictedRanges: a band is open unless a
---range covers it, and a covered band needs the caller's CURRENT job to match ANY covering range.
---@param src integer player server id
---@param freq any raw client frequency (clamped here)
---@return table verdict { allowed: boolean, messageKey?: string, message?: string, messageVars?: table }
function actions.canTune(src, freq)
    freq = clampFreq(freq)
    local ranges = config.Radio and config.Radio.RestrictedRanges
    if not ranges or #ranges == 0 then return { allowed = true } end

    local job = player.getJob(src)
    local restricted, label
    for _, r in ipairs(ranges) do
        if freq >= (r.min or 0) and freq <= (r.max or 0) then
            if jobInList(job, r.jobs) then return { allowed = true } end
            restricted = true
            label = label or r.label
        end
    end
    if restricted then
        return {
            allowed     = false,
            messageKey  = 'radio.frequencyReservedFor',
            message     = '{freq} MHz is reserved for {who}.',
            messageVars = { freq = ('%.1f'):format(freq), who = label or 'authorized units' },
        }
    end
    return { allowed = true }
end

---The caller's persisted prefs (last frequency + volume), re-clamped on the way out. Defaults
---when they've never saved. Read-only.
---@param src integer player server id
---@return table result { success, data = { frequency, volume } }
function actions.get(src)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    local row = store.get(cid)
    return {
        success = true,
        data = {
            frequency = row and clampFreq(row.frequency) or DEFAULT_FREQ,
            volume    = row and clampVolume(row.volume)  or DEFAULT_VOLUME,
        },
    }
end

---Persist the caller's last frequency + volume. Both are clamped server-side; the response echoes
---what was stored.
---@param src integer player server id
---@param payload table { frequency?: number, volume?: number }
---@return table result { success, data = { frequency, volume } }
function actions.save(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(payload) ~= 'table' then payload = {} end
    local freq = clampFreq(payload.frequency)
    local vol  = clampVolume(payload.volume)
    store.save(cid, freq, vol)
    return { success = true, data = { frequency = freq, volume = vol } }
end

---Shape one saved-channel row for the UI: the id stringified and the stored frequency re-clamped.
---@param row table store row { id, label, frequency }
---@return table saved { id: string, label: string, freq: number }
local function savedOut(row)
    return { id = tostring(row.id), label = row.label, freq = clampFreq(row.frequency) }
end

---Every saved channel the caller owns, oldest-first, in UI shape. Read-only.
---@param src integer player server id
---@return table result { success, data = { saved = table[] } }
function actions.listSaved(src)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    local out = {}
    for _, row in ipairs(store.listSaved(cid)) do out[#out + 1] = savedOut(row) end
    return { success = true, data = { saved = out } }
end

---Save a named channel. The label is trimmed + capped to the column width, the frequency clamped,
---and the per-character SAVED_CAP enforced. Accepts `freq` or `frequency`.
---@param src integer player server id
---@param payload table { label: string, freq?: number, frequency?: number }
---@return table result { success, data? = { id, label, freq }, message? }
function actions.addSaved(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(payload) ~= 'table' then payload = {} end
    local label = trim(payload.label):sub(1, 40)
    if label == '' then return { success = false, messageKey = 'radio.nameRequired', message = 'Name required' } end
    if store.countSaved(cid) >= SAVED_CAP then return { success = false, messageKey = 'radio.savedListFull', message = 'Saved list is full' } end
    local freq = clampFreq(payload.freq or payload.frequency)
    local id   = store.addSaved(cid, label, freq, os.time())
    return { success = true, data = { id = tostring(id), label = label, freq = freq } }
end

---Rename/retune one saved channel. The id must be a plain integer.
---@param src integer player server id
---@param payload table { id: number|string, label: string, freq?: number, frequency?: number }
---@return table result { success, data? = { id, label, freq }, message? }
function actions.updateSaved(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(payload) ~= 'table' then payload = {} end
    local id = tonumber(payload.id)
    if not id or id % 1 ~= 0 then return { success = false, messageKey = 'radio.badId', message = 'Bad id' } end
    local label = trim(payload.label):sub(1, 40)
    if label == '' then return { success = false, messageKey = 'radio.nameRequired', message = 'Name required' } end
    local freq = clampFreq(payload.freq or payload.frequency)
    store.updateSaved(cid, id, label, freq)
    return { success = true, data = { id = tostring(id), label = label, freq = freq } }
end

---Delete one saved channel. Same integer-id validation as updateSaved.
---@param src integer player server id
---@param payload table { id: number|string }
---@return table result { success, data? = { id }, message? }
function actions.removeSaved(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    if type(payload) ~= 'table' then payload = {} end
    local id = tonumber(payload.id)
    if not id or id % 1 ~= 0 then return { success = false, messageKey = 'radio.badId', message = 'Bad id' } end
    store.removeSaved(cid, id)
    return { success = true, data = { id = tostring(id) } }
end

return actions
