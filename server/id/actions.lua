---@type table sd-phone config root (configs/config.lua).
local config    = require 'configs.config'
---@type table Framework detection (bridge.shared.framework): name + qb flag for the grade label read.
local framework = require 'bridge.shared.framework'
---@type table Player bridge (bridge.server.player): identifier, name, raw handle and job name.
local player    = require 'bridge.server.player'
---@type table Job bridge (bridge.server.job): display labels for a job name and its grade.
local job       = require 'bridge.server.job'
---@type table Records bridge (bridge.server.records): the framework's citizen row, normalised.
local records   = require 'bridge.server.records'
---@type table ID persistence layer (server.id.store): the portrait row.
local store     = require 'server.id.store'
---@type table AirShare core (server.share.core): the nearby-share handshake the show flow rides on.
local share     = require 'server.share.core'
---@type table Shared server helpers (server.util): envelopes, hashing colour, string caps.
local util      = require 'server.util'
local ok, fail  = util.ok, util.fail

---@type table ID app config (config.Id): licence catalogue, job colours, issuer, show duration.
local CFG = config.Id

---@type string Card face for the State ID; every licence and badge picks its own from config.
local STATE_COLOR <const> = '#2C3440'

---@type table Actions module; the table returned at end of file.
local actions = {}

---Stable per-character key (citizenid on qb/qbx, identifier on ESX), resolved from the server id.
---@param src integer player server id
---@return string|nil citizenid nil when the player can't be resolved
local function cidOf(src) return player.getIdentifier(src) end

---The display label for the player's current job grade, read from the live player object where
---the framework keeps one. qb/QBox carry it as `job.grade.name`, ESX as `job.grade_label`; ox_core
---and ND keep only the level, so those fall back to "Grade N".
---@param src integer player server id
---@return string label
local function gradeLabel(src)
    local p = player.get(src)
    if framework.qb then
        local g = p and p.PlayerData and p.PlayerData.job and p.PlayerData.job.grade
        if type(g) == 'table' and type(g.name) == 'string' and g.name ~= '' then return g.name end
    elseif framework.name == 'esx' then
        local j = p and p.job
        if type(j) == 'table' then
            if type(j.grade_label) == 'string' and j.grade_label ~= '' then return j.grade_label end
            if type(j.grade_name) == 'string' and j.grade_name ~= '' then return j.grade_name end
        end
    end
    return ('Grade %d'):format(job.getGrade(src))
end

---Whether a character holds a licence key on the qb family, read from the live object so a
---licence granted this session shows without a relog. Falls back to the DB row elsewhere.
---@param src integer player server id
---@param citizen table normalised citizen from records.getCitizen
---@return string[] held licence keys
local function heldLicences(src, citizen)
    if framework.qb then
        local live = player.getMetadata(src, 'licences') or player.getMetadata(src, 'licenses')
        if type(live) == 'table' then
            local out = {}
            for key, held in pairs(live) do
                if held == true and type(key) == 'string' then out[#out + 1] = key end
            end
            return out
        end
    end
    return citizen.licences or {}
end

---Licence keys in config order first, then any held key the order list forgot, alphabetically.
---Keys missing from the catalogue are dropped: a card needs a label and a colour.
---@param held string[] licence keys the character holds
---@return string[] ordered keys with a catalogue entry
local function orderedLicences(held)
    local have = {}
    for _, key in ipairs(held) do
        if CFG.Licences[key] then have[key] = true end
    end
    local out, placed = {}, {}
    for _, key in ipairs(CFG.LicenceOrder or {}) do
        if have[key] and not placed[key] then
            out[#out + 1] = key
            placed[key] = true
        end
    end
    local rest = {}
    for key in pairs(have) do
        if not placed[key] then rest[#rest + 1] = key end
    end
    table.sort(rest)
    for _, key in ipairs(rest) do out[#out + 1] = key end
    return out
end

---A field row for a card; empty values are skipped by the caller.
---@param key string field key the frontend labels
---@param value any
---@return table|nil
local function field(key, value)
    if value == nil then return nil end
    local s = tostring(value)
    if s == '' then return nil end
    return { key = key, value = s:sub(1, 80) }
end

---Appends the non-empty fields to a list.
---@param list table
---@param ... table|nil
local function push(list, ...)
    for i = 1, select('#', ...) do
        local f = select(i, ...)
        if f then list[#list + 1] = f end
    end
end

---Every card the caller can show, top of the stack first: the State ID, one card per held licence
---in the catalogue, then the job badge. Identity comes from the framework's records; the client
---never supplies any of it.
---@param src integer player server id
---@return table[]|nil cards nil when the player can't be resolved
---@return string|nil portrait
function actions.buildCards(src)
    local cid = cidOf(src)
    if not cid then return nil end

    local citizen  = records.getCitizen(cid) or {}
    local name     = citizen.name
    if not name or name == '' or name == cid then name = player.getName(src) end
    local portrait = store.getPortrait(cid)
    local issuer   = CFG.Issuer or 'State of San Andreas'

    local cards = {}

    local stateFields = {}
    push(stateFields,
        field('dob', citizen.dob),
        field('sex', citizen.sex),
        field('nationality', citizen.nationality),
        field('citizen', cid),
        field('phone', citizen.phone))
    cards[#cards + 1] = {
        key = 'state', kind = 'state', title = '', color = STATE_COLOR,
        name = name, portrait = portrait, issuer = issuer, fields = stateFields,
    }

    for _, key in ipairs(orderedLicences(heldLicences(src, citizen))) do
        local def = CFG.Licences[key]
        local fields = {}
        push(fields, field('class', key), field('citizen', cid), field('dob', citizen.dob))
        cards[#cards + 1] = {
            key = 'licence:' .. key, kind = 'licence', title = def.label, color = def.color,
            name = name, portrait = portrait, issuer = issuer, fields = fields,
        }
    end

    local jobName = player.getJob(src) or citizen.job
    if jobName and jobName ~= '' and jobName ~= 'unemployed' then
        local label = job.getLabel(jobName) or jobName
        local fields = {}
        push(fields, field('employer', label), field('rank', gradeLabel(src)), field('callsign', citizen.callsign))
        cards[#cards + 1] = {
            key = 'job', kind = 'job', title = label, subtitle = gradeLabel(src),
            color = (CFG.JobColors or {})[jobName] or util.colorFor(jobName),
            name = name, portrait = portrait, issuer = label, fields = fields,
        }
    end

    return cards, portrait
end

---The caller's card stack.
---@param src integer player server id
---@return table envelope { cards, portrait }
function actions.list(src)
    local cards, portrait = actions.buildCards(src)
    if not cards then return fail('id.playerNotFound', 'Player not found') end
    return ok({ cards = cards, portrait = portrait })
end

---Sets the caller's portrait from a Camera upload, or clears it with a nil url.
---@param src integer player server id
---@param payload table { url?: string }
---@return table envelope { portrait }
function actions.setPortrait(src, payload)
    local cid = cidOf(src)
    if not cid then return fail('id.playerNotFound', 'Player not found') end
    payload = type(payload) == 'table' and payload or {}

    local url = payload.url
    if url ~= nil then
        url = util.trim(url)
        if not lib.string.startsWith(url, 'http') then return fail('id.invalidPhoto', 'Invalid photo') end
        url = url:sub(1, 512)
    end
    store.setPortrait(cid, url)
    return ok({ portrait = url })
end

---@type integer Largest inline face render a share may carry, in bytes. The game's headshot is a
---128px square, which encodes to a few tens of KB; anything near this cap is not one.
local MAX_HEADSHOT_BYTES <const> = 256 * 1024

---A client-rendered face for a share, accepted only as an inline PNG or JPEG data URL under the
---size cap. The recipient's phone cannot read the sender's game textures, so the pixels travel
---with the card; they live in the request and on the recipient's screen, never in a table.
---@param v any client-supplied portrait
---@return string|nil portrait
local function inlineHeadshot(v)
    if type(v) ~= 'string' or #v > MAX_HEADSHOT_BYTES then return nil end
    if v:sub(1, 22) == 'data:image/png;base64,' or v:sub(1, 23) == 'data:image/jpeg;base64,' then return v end
    return nil
end

---Opens an AirShare request that shows one of the caller's cards to a nearby phone. The card is
---rebuilt from the caller's records right here, so the client's only inputs are which card and,
---when no photo was taken, the face render its own game produced.
---@param src integer player server id
---@param payload table { target: number, card: string, portrait?: string }
---@return table envelope
function actions.requestShare(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local cards, stored = actions.buildCards(src)
    if not cards then return fail('id.playerNotFound', 'Player not found') end

    local want = type(payload.card) == 'string' and payload.card or ''
    local card
    for _, c in ipairs(cards) do
        if c.key == want then card = c break end
    end
    if not card then return fail('id.noSuchCard', 'That card is not on your phone') end
    if not stored then card.portrait = inlineHeadshot(payload.portrait) end

    local sent, refusal = share.request(src, payload.target, 'id-card', {
        card = card, fromName = player.getName(src):sub(1, 80),
    })
    if sent then return ok() end
    return refusal or fail('id.shareFailed', 'Could not show the card')
end

---AirShare 'id-card' delivery: the recipient accepted, so their phone gets the card for the
---configured window. Nothing is stored; the client drops it when the clock runs out.
---@param targetSrc integer recipient server id
---@param payload table { card: table, fromName: string }
---@return boolean delivered
function actions.deliver(targetSrc, payload)
    if type(payload) ~= 'table' or type(payload.card) ~= 'table' then return false end
    local minutes = tonumber(CFG.ShareMinutes) or 5
    TriggerClientEvent('sd-phone:client:id:received', targetSrc, {
        id        = util.newId(12),
        card      = payload.card,
        fromName  = payload.fromName,
        expiresAt = (os.time() + math.floor(minutes * 60)) * 1000,
    })
    return true
end

return actions
