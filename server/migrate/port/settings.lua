---@type table Settings porter (server.migrate.port.settings). Copies each lb-phone phone's
---settings blob onto its owner's sd-phone settings row. Fill-only: a value the player has already
---chosen is never overwritten.
---
---The home-screen layout is deliberately NOT imported. lb-phone stores pages of apps (an array of
---arrays) named in PascalCase, while sd-phone stores a flat slot list of lowercase app ids, and each
---has apps the other does not. There is no faithful mapping, and the wrong shape crashes the phone
---during render.
local M = {}

---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'

local function digits(s) return (tostring(s or ''):gsub('%D', '')) end

---A 0-100 integer from an lb 0.0-1.0 float (values above 1 pass through), nil when absent.
---@param v any
---@return integer|nil
local function pct(v)
    local n = tonumber(v)
    if not n then return nil end
    if n <= 1 then n = n * 100 end
    n = math.floor(n + 0.5)
    if n < 0 then return 0 end
    if n > 100 then return 100 end
    return n
end

---1/0 for a present boolean, nil when the key was absent.
---@param v any
---@return integer|nil
local function flag(v)
    if v == nil then return nil end
    return v and 1 or 0
end

---A string capped at `len`, nil when absent or empty.
---@param v any
---@param len integer
---@return string|nil
local function str(v, len)
    if v == nil then return nil end
    local s = tostring(v)
    if s == '' then return nil end
    return s:sub(1, len)
end

---@param ctx table migration context (numberToCid, dryRun)
---@return { imported: number, skipped: number }
function M.run(ctx)
    local rows, imported, skipped = {}, 0, 0
    if not store.lbSource('phones') then
        return { imported = 0, skipped = 0 }
    end

    for _, p in ipairs(store.lbPhoneSettings()) do
        local cid = ctx.numberToCid[digits(p.phone_number)]
        local s = cid and store.decodeJson(p.settings) or nil
        if s and next(s) ~= nil then
            local display = type(s.display) == 'table' and s.display or {}
            local sound   = type(s.sound) == 'table' and s.sound or {}
            local wall    = type(s.wallpaper) == 'table' and s.wallpaper or {}
            local clock   = type(s.time) == 'table' and s.time or {}

            local blur = flag(wall.blur)
            local hour24
            if clock.twelveHourClock ~= nil then hour24 = clock.twelveHourClock and 0 or 1 end

            rows[#rows + 1] = {
                cid,
                str(wall.background, 512),
                blur, blur,
                str(display.theme, 8),
                pct(display.brightness),
                pct(display.size),
                hour24,
                str(sound.ringtone, 64),
                str(sound.texttone, 64),
                pct(sound.volume),
                pct(sound.callVolume),
            }
            imported = imported + 1
        else
            skipped = skipped + 1
        end
    end

    if not ctx.dryRun then store.fillSettings(rows) end
    return { imported = imported, skipped = skipped }
end

return M
