---@type table Settings porter (server.migrate.port.y.settings). Carries each character's YSeries
---wallpapers and theme across. Fill-only: a value the player has already chosen on sd-phone wins.
local M = {}

---@type table Migration SQL (server.migrate.store): the fill-only settings merge.
local store = require 'server.migrate.store'
---@type table YSeries source reads (server.migrate.ystore): the settings rows.
local ystore = require 'server.migrate.ystore'
---@type table Shared server helpers (server.util): trim.
local util = require 'server.util'

---A wallpaper reference sd-phone can render, or nil. YSeries stores some wallpapers as inline data
---URIs, which its own UI decodes but sd-phone's wallpaper column cannot hold.
---@param v any
---@return string|nil
local function wallpaper(v)
    if type(v) ~= 'string' then return nil end
    local s = util.trim(v)
    if s == '' or #s > 512 or s:lower():sub(1, 5) == 'data:' then return nil end
    return s
end

---@param ctx table migration context (imeiToCid, dryRun)
---@return { migrated: number, skipped: number }
function M.run(ctx)
    if not ystore.table('settings') then return { migrated = 0, skipped = 0 } end

    local rows, migrated, skipped = {}, 0, 0
    local seen = {}

    for _, s in ipairs(ystore.settings()) do
        local cid = ctx.imeiToCid[s.phone_imei]
        if not cid or seen[cid] then
            skipped = skipped + 1
        else
            seen[cid] = true
            local paper = wallpaper(s.homescreen_wallpaper) or wallpaper(s.lockscreen_wallpaper)
            local theme = (s.theme == 'dark' or s.theme == 'light') and s.theme or nil
            if not paper and not theme then
                skipped = skipped + 1
            else
                rows[#rows + 1] = {
                    cid, paper, nil, nil, theme, nil, nil, nil, nil, nil, nil, nil,
                }
                migrated = migrated + 1
            end
        end
    end

    if not ctx.dryRun and #rows > 0 then store.fillSettings(rows) end
    return { migrated = migrated, skipped = skipped }
end

return M
