---@type table sd-phone config root (configs/config.lua).
local config      = require 'configs.config'
---@type table Inventory bridge (bridge.server.inventory): counts, slot metadata, usable items.
local inventory   = require 'bridge.server.inventory'
---@type table Job bridge (bridge.server.job): the player's live framework job.
local job         = require 'bridge.server.job'
---@type table Player bridge (bridge.server.player): character identity and framework metadata.
local player      = require 'bridge.server.player'
---@type table Notify bridge (bridge.server.notify): server -> client toasts.
local notify      = require 'bridge.server.notify'
---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot        = require 'server.boot'
---@type table Admin ace checks (server.admin.permissions): who may act on another player.
local permissions = require 'server.admin.permissions'

---@type table Gate evaluator; the table returned at end of file. Answers one question for both app
---catalogs: may THIS player see this app right now? A `requires` spec on a configs/apps.lua entry
---and a `requires` on an addCustomApp registration are read here and nowhere else, so a built-in
---app and a third-party one gate the same way and gain new condition types together.
---
---A gate decides whether an icon is DRAWN. It authorises nothing: a player can still fire the app's
---events and callbacks directly, so an app with anything worth protecting has to check server-side
---as well. The same warning is already on `devices` and `job` in exports/addCustomApp.
local gates = {}

---@type string Ledger of permanent unlocks: one row per character per app. Only `consume` gates
---read it, and only server-side grants write it, so a client can never award itself a row.
local UNLOCK_TABLE = 'phone_secret_apps'

---@type integer Most gates one client may ask the server to evaluate in a single call. Custom apps
---come from third-party resources, so the count is theirs to inflate, not ours to trust.
local MAX_BATCH = 64

---Creates the unlock ledger.
function gates.ensureSchema()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_secret_apps (
            citizenid   VARCHAR(64) NOT NULL,
            app_id      VARCHAR(64) NOT NULL,
            unlocked_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid, app_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

CreateThread(function()
    local ok, err = pcall(gates.ensureSchema)
    if not ok then
        boot.schemaFailed('gates', err)
        return
    end
    boot.schemaReady()
end)

---@type table<string, table<string, true>> citizenid -> unlocked app ids, read from the ledger once
---per character. Keyed on the identifier rather than the source so a multichar switch cannot serve
---one character's unlocks to another.
local unlocked = {}

---@type table<number, string> Player server id -> the identifier its set was cached under, so a
---disconnect drops that one entry instead of leaking a set per character the server ever saw.
local cachedFor = {}

---The caller's unlocked app ids, filled from the ledger on first use. Nil when the player has no
---resolvable character, which fails every `consume` gate closed.
---@param src integer player server id
---@return table<string, true>|nil
local function unlockSet(src)
    local cid = player.getRealIdentifier(src)
    if not cid then return nil end

    local set = unlocked[cid]
    if set then
        cachedFor[src] = cid
        return set
    end

    set = {}
    local rows = MySQL.query.await(('SELECT app_id FROM %s WHERE citizenid = ?'):format(UNLOCK_TABLE), { cid }) or {}
    for i = 1, #rows do set[rows[i].app_id] = true end

    unlocked[cid], cachedFor[src] = set, cid
    return set
end

AddEventHandler('playerDropped', function()
    local src = source
    local cid = cachedFor[src]
    if not cid then return end
    unlocked[cid], cachedFor[src] = nil, nil
end)

---An item condition as `{name, count, metadata}`, from a bare item name or a table. Nil when the
---caller named no usable item, which leaves that half of the gate open.
---@param value any
---@return {name: string, count: integer, metadata: table|nil}|nil
local function readItem(value)
    if type(value) == 'string' then value = { name = value } end
    if type(value) ~= 'table' then return nil end

    local name = value.name
    if type(name) ~= 'string' or name == '' then return nil end

    local metadata = type(value.metadata) == 'table' and next(value.metadata) ~= nil and value.metadata or nil
    return { name = name, count = math.max(1, math.floor(tonumber(value.count) or 1)), metadata = metadata }
end

---A job condition as `{ [jobName] = minGrade }`, from a name, an array of names, or a name->grade
---map. Nil when the caller named none. Mirrors readJobs in client/customapps.lua deliberately: the
---two catalogs accept the same shapes.
---@param value any
---@return table<string, integer>|nil
local function readJobs(value)
    if type(value) == 'string' then value = { value } end
    if type(value) ~= 'table' then return nil end

    local out, count = {}, 0
    for key, entry in pairs(value) do
        if type(key) == 'string' and key ~= '' then
            out[key] = math.max(0, math.floor(tonumber(entry) or 0))
            count = count + 1
        elseif type(entry) == 'string' and entry ~= '' then
            out[entry] = 0
            count = count + 1
        end
    end
    if count == 0 then return nil end
    return out
end

---A `resource.exportName` escape hatch split into its two halves. Nil when the string is not in that
---shape, which leaves the condition off rather than calling something unintended.
---@param value any
---@return {resource: string, fn: string}|nil
local function readCheck(value)
    if type(value) ~= 'string' then return nil end
    local resource, fn = value:match('^([%w_%-]+)%.([%w_]+)$')
    if not resource then return nil end
    return { resource = resource, fn = fn }
end

---A raw `requires` table sanitised into the spec the evaluator understands. Nil when nothing
---recognisable survives, which is what leaves an app ungated.
---@param value any
---@return table|nil spec
function gates.read(value)
    if type(value) ~= 'table' then return nil end

    local spec = {
        item     = readItem(value.item),
        jobs     = readJobs(value.jobs or value.job),
        metadata = type(value.metadata) == 'table' and next(value.metadata) ~= nil and value.metadata or nil,
        check    = readCheck(value.check),
        consume  = value.consume == true,
    }
    if not (spec.item or spec.jobs or spec.metadata or spec.check or spec.consume) then return nil end
    return spec
end

---Whether the player holds enough of the item, honouring per-slot metadata when the condition names
---any. Backends with no slot metadata fall back to a plain count: a narrower gate would refuse
---every player on those servers rather than the ones the server owner meant.
---@param src integer player server id
---@param item table sanitised item condition
---@return boolean
local function itemAllows(src, item)
    if not item.metadata or not inventory.supportsSlotMetadata() then
        return inventory.has(src, item.name, item.count)
    end

    local held = 0
    for _, slot in ipairs(inventory.searchSlots(src, item.name) or {}) do
        local matches = true
        for key, want in pairs(item.metadata) do
            if slot.metadata[key] ~= want then
                matches = false
                break
            end
        end
        if matches then held = held + (slot.count or 0) end
    end
    return held >= item.count
end

---Whether every named framework metadata key holds the value the gate asks for.
---@param src integer player server id
---@param want table key -> expected value
---@return boolean
local function metadataAllows(src, want)
    for key, expected in pairs(want) do
        if player.getMetadata(src, key) ~= expected then return false end
    end
    return true
end

---Whether the player's job clears the gate. Any one named job is enough, matching how the custom
---app job gate already reads.
---@param src integer player server id
---@param gate table<string, integer>
---@return boolean
local function jobAllows(src, gate)
    for name, minGrade in pairs(gate) do
        if job.has(src, name, minGrade) then return true end
    end
    return false
end

---@type table<string, true> Checks already reported as unreachable, so a stopped resource costs one
---console line rather than one per app per phone open.
local warned = {}

---Whether the escape-hatch export says yes. Anything other than a literal true - a missing resource,
---an error inside the export, a nil return - fails the gate closed.
---@param src integer player server id
---@param appId string
---@param check {resource: string, fn: string}
---@return boolean
local function checkAllows(src, appId, check)
    local key = ('%s.%s'):format(check.resource, check.fn)
    if GetResourceState(check.resource) ~= 'started' then
        if not warned[key] then
            warned[key] = true
            print(('^3[sd-phone]^0 gate check %s is unreachable (%s is not started); refusing %s')
                :format(key, check.resource, appId))
        end
        return false
    end

    local ok, result = pcall(function()
        return exports[check.resource][check.fn](exports[check.resource], src, appId)
    end)
    if not ok then
        if not warned[key] then
            warned[key] = true
            print(('^1[sd-phone]^0 gate check %s errored: %s'):format(key, result))
        end
        return false
    end
    return result == true
end

---Whether this character has permanently unlocked an app. Read-only.
---@param src integer player server id
---@param appId string
---@return boolean
function gates.isUnlocked(src, appId)
    local set = unlockSet(src)
    return (set and set[appId]) == true
end

---Whether the player may see this app right now. An unreadable or absent spec leaves the app
---visible: a gate is opt-in, and a typo in one entry must not blank someone's home screen.
---
---`consume` swaps the item half of the gate for the ledger - the item was spent to earn the row, so
---it is no longer required - while every other condition stays live.
---@param src integer player server id
---@param appId string
---@param raw any the entry's `requires` value
---@return boolean
function gates.passes(src, appId, raw)
    local spec = gates.read(raw)
    if not spec then return true end

    if spec.consume then
        if not gates.isUnlocked(src, appId) then return false end
    elseif spec.item and not itemAllows(src, spec.item) then
        return false
    end

    if spec.jobs and not jobAllows(src, spec.jobs) then return false end
    if spec.metadata and not metadataAllows(src, spec.metadata) then return false end
    if spec.check and not checkAllows(src, appId, spec.check) then return false end
    return true
end

---Grants a permanent unlock. Idempotent: the composite key makes a second grant a no-op rather than
---a duplicate row.
---@param src integer player server id
---@param appId string
---@return boolean ok
function gates.grant(src, appId)
    if type(appId) ~= 'string' or appId == '' then return false end

    local cid = player.getRealIdentifier(src)
    if not cid then return false end

    MySQL.query.await(('INSERT IGNORE INTO %s (citizenid, app_id) VALUES (?, ?)'):format(UNLOCK_TABLE), { cid, appId })

    local set = unlockSet(src)
    if set then set[appId] = true end

    TriggerClientEvent('sd-phone:client:gates:refresh', src)
    return true
end

---Revokes a permanent unlock.
---@param src integer player server id
---@param appId string
---@return boolean removed false when the character never had it
function gates.revoke(src, appId)
    if type(appId) ~= 'string' or appId == '' then return false end

    local cid = player.getRealIdentifier(src)
    if not cid then return false end

    local affected = MySQL.update.await(
        ('DELETE FROM %s WHERE citizenid = ? AND app_id = ?'):format(UNLOCK_TABLE), { cid, appId }
    )

    local set = unlockSet(src)
    if set then set[appId] = nil end

    TriggerClientEvent('sd-phone:client:gates:refresh', src)
    return (affected or 0) > 0
end

---@type table<string, any> App id -> its raw `requires`, for every configs/apps.lua entry carrying
---one. Built once; the catalog is static per boot.
local BASE_GATES = {}

---@type table<string, string> App id -> the label configs/apps.lua gives it, so a toast can say
---"Health" where the catalog says `health`.
local BASE_LABELS = {}

for _, app in ipairs(config.Apps.Apps or {}) do
    if type(app.id) == 'string' and app.id ~= '' then
        if app.requires ~= nil then BASE_GATES[app.id] = app.requires end
        if type(app.label) == 'string' and app.label ~= '' then BASE_LABELS[app.id] = app.label end
    end
end

---An app's display name. Falls back to the id, which is all there is for a third-party app the
---built-in catalog has never heard of.
---@param appId string
---@return string
function gates.label(appId)
    return BASE_LABELS[appId] or appId
end

---Every built-in app id this player must not be shown, folded into server/appgate.lua's answer.
---@param src integer player server id
---@return string[] ids
function gates.hiddenBaseApps(src)
    local out = {}
    for appId, raw in pairs(BASE_GATES) do
        if not gates.passes(src, appId, raw) then out[#out + 1] = appId end
    end
    return out
end

---Spends the item that earns a `consume` gate's unlock. The item is removed here rather than by the
---inventory's own `consume` field so that a player who fails a condition, or who already owns the
---app, keeps it: an unlock item is usually one-of-a-kind and eating it on a refusal is unrecoverable.
---@param appId string
---@param spec table sanitised spec, known to carry `consume` and `item`
---@param src integer player server id
local function spendUnlockItem(appId, spec, src)
    local label = gates.label(appId)

    if gates.isUnlocked(src, appId) then
        notify.to(src, ('The %s app is already on your phone.'):format(label), 'info')
        return
    end

    -- One deliberately vague refusal for every condition. Naming the one that failed would tell a
    -- player exactly which job or item to go and get, which is the opposite of what a hidden app is
    -- for; the console line above each check is where a server owner debugs it instead.
    if (spec.jobs and not jobAllows(src, spec.jobs))
        or (spec.metadata and not metadataAllows(src, spec.metadata))
        or (spec.check and not checkAllows(src, appId, spec.check)) then
        notify.to(src, 'Nothing happens.', 'info')
        return
    end

    if not inventory.has(src, spec.item.name, spec.item.count) then return end
    if not inventory.remove(src, spec.item.name, spec.item.count) then return end

    gates.grant(src, appId)
    notify.to(src, ("You've installed the %s app on your phone."):format(label), 'success')
end

-- Built-in apps whose gate is earned by using an item register that item as usable. Backends with no
-- registration path raise, which would take the module down with them, so each one is contained.
for appId, raw in pairs(BASE_GATES) do
    local spec = gates.read(raw)
    if spec and spec.consume and spec.item then
        local ok, err = pcall(inventory.registerUsable, spec.item.name, function(src)
            spendUnlockItem(appId, spec, src)
        end)
        if not ok then
            print(('^1[sd-phone]^0 could not make %q usable for %s: %s'):format(spec.item.name, appId, err))
        end
    end
end

---Evaluates the gates a client's registered custom apps carry. The specs come from the client
---because that is where third-party resources register, so a modified client can ask about a gate
---it invented - and learn only whether its own icon is drawn. Nothing here writes, and `consume`
---answers from the ledger, so an invented spec cannot award an unlock.
---@param specs table<string, any> app id -> raw requires
---@return table<string, boolean> verdicts
lib.callback.register('sd-phone:server:gates:custom', function(src, specs)
    local out = {}
    if type(specs) ~= 'table' then return out end

    local seen = 0
    for appId, raw in pairs(specs) do
        if type(appId) == 'string' and appId ~= '' then
            seen = seen + 1
            if seen > MAX_BATCH then break end
            out[appId] = gates.passes(src, appId, raw)
        end
    end
    return out
end)

---Grants a permanent app unlock - exports['sd-phone']:unlockApp(source, appId). The counterpart to a
---`requires = { consume = true }` gate for anything the phone cannot spend an item for itself, which
---is every third-party custom app.
---@param source integer player server id
---@param appId string
---@return boolean ok
exports('unlockApp', function(source, appId)
    return gates.grant(source, appId)
end)

---Revokes a permanent app unlock - exports['sd-phone']:revokeApp(source, appId).
---@param source integer player server id
---@param appId string
---@return boolean removed
exports('revokeApp', function(source, appId)
    return gates.revoke(source, appId)
end)

---Whether a player has a permanent unlock - exports['sd-phone']:hasAppUnlock(source, appId).
---@param source integer player server id
---@param appId string
---@return boolean
exports('hasAppUnlock', function(source, appId)
    return gates.isUnlocked(source, appId)
end)

---/appunlock <grant|revoke> <app> [target] - manages a permanent unlock. Acting on anyone but
---yourself needs the same aces as the admin panel.
lib.addCommand('appunlock', {
    help = 'Grant or revoke a permanently unlocked phone app',
    params = {
        { name = 'action', type = 'string', help = 'grant or revoke' },
        { name = 'app',    type = 'string', help = 'App id, as configs/apps.lua or addCustomApp names it' },
        { name = 'target', type = 'playerId', help = 'Target player (defaults to yourself; admins only)', optional = true },
    },
}, function(source, args)
    local action = args.action:lower()
    if action ~= 'grant' and action ~= 'revoke' then
        return notify.to(source, 'Use grant or revoke', 'error')
    end

    local target = args.target or source
    if target ~= source and not permissions.isAllowed(source) then
        return notify.to(source, 'You may only manage your own apps', 'error')
    end
    if target == 0 then
        return print('^1[sd-phone]^0 appunlock needs a target player id from the console.')
    end

    local ok = action == 'grant' and gates.grant(target, args.app) or gates.revoke(target, args.app)
    local msg = ok
        and ('%s %sed for %s'):format(args.app, action, target)
        or ('%s was not %sed (nothing to change, or the player is offline)'):format(args.app, action)

    if source == 0 then
        return print(('%s[sd-phone]^0 %s'):format(ok and '^2' or '^1', msg))
    end
    notify.to(source, msg, ok and 'success' or 'error')
end)

return gates
