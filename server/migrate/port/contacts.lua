---@type table Contacts porter (server.migrate.port.contacts). Copies each player's lb-phone
---contacts into sd-phone, keeping the contact's number as-is and synthesising the avatar colour.
---Dedupes against contacts the player already has.
local M = {}

local store = require 'server.migrate.store'
local util  = require 'server.util'

local function digits(s) return (tostring(s or ''):gsub('%D', '')) end

---Trim and clamp to `n` chars, or nil when empty (stores as SQL NULL).
---@param s any
---@param n integer
---@return string|nil
local function clamp(s, n)
    local v = util.trim(s)
    if v == '' then return nil end
    return v:sub(1, n)
end

---@param ctx table migration context (numberToCid, dryRun)
---@return { migrated: number, skipped: number }
function M.run(ctx)
    if not store.tableExists(store.lbTable('phone_contacts')) then return { migrated = 0, skipped = 0 } end

    local seen = store.existingContactKeys()
    local rows, migrated, skipped = {}, 0, 0

    for _, c in ipairs(store.lbContacts()) do
        local cid = ctx.numberToCid[digits(c.phone_number)]
        local phone = digits(c.contact_phone_number)
        if not cid or phone == '' then
            skipped = skipped + 1
        else
            local key = ('%s|%s'):format(cid, phone)
            if seen[key] then
                skipped = skipped + 1
            else
                seen[key] = true
                local name = clamp(('%s %s'):format(c.firstname or '', c.lastname or ''), 64) or phone
                rows[#rows + 1] = {
                    util.newId(16), cid, name, phone:sub(1, 32),
                    clamp(c.email, 128), clamp(c.address, 128),
                    util.colorFor(name), clamp(c.profile_image, 512),
                    util.truthy(c.favourite) and 1 or 0,
                }
                migrated = migrated + 1
            end
        end
    end

    if not ctx.dryRun then store.insertContacts(rows) end
    return { migrated = migrated, skipped = skipped }
end

return M
