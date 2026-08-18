---@type table sd-phone config root (configs.config): Phone.Items and the SIM feature flags.
local config      = require 'configs.config'
---@type table Framework detection (bridge.shared.framework): name ('qb'|'qbx'|'esx') + core handle.
local framework   = require 'bridge.shared.framework'
---@type table Inventory resource detection (bridge.shared.inventory_id): first-started candidate.
local inventoryId = require 'bridge.shared.inventory_id'
---@type table Shared server helpers (server.util): tableExists.
local util        = require 'server.util'
---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot        = require 'server.boot'

---@type table Seeder module; the table returned at end of file. ESX keeps its item catalogue in
---the `items` database table and nowhere else: ESX.UseItem refuses to fire a callback for an item
---missing from it, and xPlayer.addInventoryItem silently no-ops because the player's inventory
---array is built by walking ESX.Items at load. So on a stock ESX install the phone registers
---fine, gives fine and simply never opens. This seeds the rows sd-phone needs.
local M = {}

---@type integer Weight for a generated row. ESX's own schema defaults to 1 and its weight budget
---is small, so a phone that "weighs" a realistic 190 would eat most of a player's capacity.
local DEFAULT_WEIGHT = 1

---Title-cases a word for a generated label ('black' -> 'Black').
---@param s any
---@return string
local function titled(s)
    s = tostring(s or '')
    return (s:gsub('^%l', string.upper))
end

---Every item sd-phone needs to exist in the ESX catalogue: one row per phone variant, plus the
---SIM card when SIMs are on. BuiltInNumbers has no SIM item at all, so it contributes nothing.
---@return { name: string, label: string, weight: integer }[]
function M.wantedItems()
    local out = {}

    for _, entry in ipairs((config.Phone or {}).Items or {}) do
        if entry.item then
            out[#out + 1] = {
                name   = entry.item,
                label  = entry.label or (entry.color and (titled(entry.color) .. ' Phone')) or 'Phone',
                weight = tonumber(entry.weight) or DEFAULT_WEIGHT,
            }
        end
    end

    local sim = config.Sim or {}
    if sim.Enabled and not sim.BuiltInNumbers and sim.SimItem then
        out[#out + 1] = {
            name   = sim.SimItem,
            label  = sim.SimItemLabel or 'SIM Card',
            weight = DEFAULT_WEIGHT,
        }
    end

    return out
end

---Inserts the missing rows into ESX's `items` table and refreshes the catalogue in place.
---Idempotent: a boot where nothing is missing costs one SELECT and writes nothing.
---@return { skipped?: string, inserted?: integer, names?: string[], unresolved?: string[] }
function M.seed()
    -- Only ESX keeps items in SQL. QBCore and QBox declare them in qb-core/shared/items.lua,
    -- a Lua file this has no business writing.
    if framework.name ~= 'esx' then return { skipped = 'framework' } end

    -- A dedicated inventory resource owns its own item registry, so the ESX table is dead weight
    -- to it. This deliberately seeds only the framework-native path, which is the broken one.
    if inventoryId.name then return { skipped = 'inventory' } end

    if (config.Phone or {}).SeedEsxItems == false then return { skipped = 'disabled' } end

    -- No `items` table means es_extended's own schema was never imported. That is a broken ESX
    -- install with problems far past the phone; say so and stop, rather than create another
    -- resource's table and half-fix it.
    if not util.tableExists('items') then
        print('^1[sd-phone]^0 ESX detected but the `items` table is missing - import es_extended.sql. The phone items cannot be registered until you do.')
        return { skipped = 'no-table' }
    end

    local wanted = M.wantedItems()
    if #wanted == 0 then return { inserted = 0, names = {}, unresolved = {} } end

    local names = {}
    for i = 1, #wanted do names[i] = wanted[i].name end

    local rows = MySQL.query.await(
        ('SELECT name FROM items WHERE name IN (%s)'):format(string.rep('?', #names, ',')),
        names
    )

    local have = {}
    for _, row in ipairs(rows or {}) do have[row.name] = true end

    local chunks, params, inserted = {}, {}, {}
    for _, row in ipairs(wanted) do
        if not have[row.name] then
            chunks[#chunks + 1]   = '(?, ?, ?, 0, 1)'
            params[#params + 1]   = row.name
            params[#params + 1]   = row.label
            params[#params + 1]   = row.weight
            inserted[#inserted + 1] = row.name
        end
    end

    if #inserted > 0 then
        MySQL.query.await(
            ('INSERT IGNORE INTO items (name, label, weight, rare, can_remove) VALUES %s')
                :format(table.concat(chunks, ', ')),
            params
        )

        -- ESX reads the whole catalogue into memory once, at its own boot, and sd-phone starts
        -- after it. Without this the rows sit in the database and the phone stays broken until
        -- the next server restart.
        if framework.core and framework.core.RefreshItems then
            framework.core.RefreshItems()
        end

        print(('^2[sd-phone]^0 registered %d ESX item(s): %s'):format(#inserted, table.concat(inserted, ', ')))

        -- A player's inventory array is built from ESX.Items at load, so anyone already connected
        -- still has no row for the new item. Only true on a live restart, never at server boot.
        if GetNumPlayerIndices and GetNumPlayerIndices() > 0 then
            print('^3[sd-phone]^0 players online must relog before they can be given the new item(s).')
        end
    end

    -- Catches the case the seed cannot fix: an item renamed in configs/phone.lua that the
    -- catalogue still does not know about. Silent failure is what made this bug hard to spot.
    local catalogue = (framework.core and framework.core.Items) or {}
    local unresolved = {}
    for _, row in ipairs(wanted) do
        if not catalogue[row.name] then unresolved[#unresolved + 1] = row.name end
    end
    if #unresolved > 0 then
        print(('^1[sd-phone]^0 %d item(s) still unknown to ESX after seeding: %s'):format(
            #unresolved, table.concat(unresolved, ', ')))
    end

    return { inserted = #inserted, names = inserted, unresolved = unresolved }
end

-- Boot-time seed. Contained, because a failure here must not take the rest of the boot with it.
CreateThread(function()
    local ok, res = pcall(M.seed)
    if not ok then
        boot.schemaFailed('esx items', res)
        return
    end
    -- A skip is not a schema; counting it would inflate the boot summary on every QB server.
    if not res.skipped then boot.schemaReady() end
end)

return M
