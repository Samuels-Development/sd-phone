---@type table<string, boolean> Which vRP modules are actually live. Probed once per boot because
---every vRP module opens with `if not vRP.modules.X then return end`, and a disabled module means
---its User mixin was never composed onto the User class - so `user:getWallet()` would be a nil call
---rather than a missing value. Each primitive below consults this and degrades to the ESX-shaped
---0/false/nil/{} instead of raising inside vRP's own Lua state. Global because vrp/boot.lua is
---frozen and reads it by name from _G.
SDPHONE_CAPS = {
    money     = vRP.EXT.Money ~= nil,
    group     = vRP.EXT.Group ~= nil,
    identity  = vRP.EXT.Identity ~= nil,
    inventory = vRP.EXT.Inventory ~= nil,
}

---@type table<string, boolean> Item ids already made usable, kept across boots. vRP's item registry
---survives a re-run of this chunk but the menu builders it holds close over the previous chunk's
---upvalues, so every boot re-applies the whole set.
SDPHONE_USABLE = SDPHONE_USABLE or {}

---@type table<string, boolean> Export names already bound on the vrp resource. CFX exports are
---registered by adding an event handler, so binding the same name twice leaves two handlers behind
---forever. Re-entrancy is achieved by resolving the implementation through vRP.EXT.SDPhone at call
---time instead, which means a name only ever has to be bound once.
SDPHONE_EXPORTS = SDPHONE_EXPORTS or {}

---@type table<string, boolean> Primitives that have already logged a fault, so a broken call site
---costs one console line rather than one per invocation.
SDPHONE_WARNED = SDPHONE_WARNED or {}

---@type string Prefix for every event relayed out of vRP's state into sd-phone's.
local RELAY = 'sd-phone:vrp:'

---@type string Title of the menu entry added to a usable item. vRP's lang tables carry no generic
---"use" string, so this is plain text rather than a lookup that would break on a trimmed locale.
local USE_TITLE = 'Use'

---@type table<string, fun(self: table, ...): ...> Primitive implementations, keyed by the export
---name they are published under. Also the source of the .proxy interface, so the export path and
---the proxy fallback can never drift apart.
local methods = {}

---@type table<string, fun(self: table, ...)> vRP lifecycle listeners, keyed by vRP event name.
local events = {}

---The vRP user behind a player source, or nil when that source has no loaded user.
---
---The source is coerced rather than type-checked: it crosses a resource boundary to get here, and
---vRP keys users_by_source numerically, so a string "12" would otherwise miss every entry.
---@param source number|string player server id
---@return table|nil
local function userOf(source)
    local src = tonumber(source)
    if not src then return nil end
    return vRP.users_by_source[src]
end

---Invoke a primitive by name against the LIVE extension instance, never against a captured closure.
---
---Two things ride on the indirection. Re-entrancy: a later boot swaps the methods on the instance
---and every already-bound export and proxy member picks up the new code with no re-registration.
---Isolation: the pcall stops a fault in phone code from surfacing as a vRP error, which matters more
---than usual here because vRP's Proxy emits its reply only AFTER the target returns, so a raise on
---the proxy path would leave the caller waiting for a reply that is never sent.
---@param name string primitive name
---@param ... any
---@return ... any Nil when the primitive is missing or raised.
local function invoke(name, ...)
    local ext = vRP.EXT.SDPhone
    local fn = ext and ext[name]
    if type(fn) ~= 'function' then return nil end

    local rets = table.pack(pcall(fn, ext, ...))
    if not rets[1] then
        if not SDPHONE_WARNED[name] then
            SDPHONE_WARNED[name] = true
            print('[sd-phone] vRP adapter fault in ' .. name .. ': ' .. tostring(rets[2]))
        end
        return nil
    end

    return table.unpack(rets, 2, rets.n)
end

---@type table<string, fun(self: table, ...): ...> Proxy interface published as vRP.EXT.SDPhone. It
---mirrors the export names one for one so inject.lua can fall back to the proxy wire without a
---second name table, for the case where exports registered from a runtime-loaded chunk turn out not
---to be visible to other resources.
local proxy = {}

---The player's vRP account and character state.
---
---Identity fields are nil rather than absent when the identity module is disabled, which the phone
---renders as a blank name instead of failing to resolve the player at all.
---@param source number player server id
---@return { id: integer, cid: integer|nil, identity: table|nil }|nil
function methods:sdp_state(source)
    local user = userOf(source)
    if not user then return nil end

    local identity
    if SDPHONE_CAPS.identity and type(user.identity) == 'table' then
        identity = {
            firstname    = user.identity.firstname,
            name         = user.identity.name,
            phone        = user.identity.phone,
            registration = user.identity.registration,
            age          = user.identity.age,
        }
    end

    return { id = user.id, cid = user.cid, identity = identity }
end

---Read or move money on one of the character's two vRP accounts.
---
---`tryBank` is a guarded setBank rather than the tryWithdraw-then-tryPayment composition the vRP 1
---path is forced into. Inside vRP's own state the read and the write are a single uninterrupted
---step, so there is no window to compensate for; the composition would additionally push the money
---through the wallet and fire three playerMoneyUpdate events for one debit, and vRP dispatches
---those listeners immediately, so the phone's money relay would observe money it never had.
---@param source number player server id
---@param op 'getWallet'|'getBank'|'addWallet'|'tryWallet'|'addBank'|'tryBank'
---@param amount? number positive; required by every op except the two reads
---@return number|boolean
function methods:sdp_money(source, op, amount)
    local read = op == 'getWallet' or op == 'getBank'
    if not SDPHONE_CAPS.money then return read and 0 or false end

    local user = userOf(source)
    if not user then return read and 0 or false end

    if op == 'getWallet' then return user:getWallet() or 0 end
    if op == 'getBank' then return user:getBank() or 0 end

    if type(amount) ~= 'number' or amount ~= amount or amount <= 0 then return false end

    if op == 'addWallet' then
        user:setWallet((user:getWallet() or 0) + amount)
        return true
    end

    if op == 'addBank' then
        user:setBank((user:getBank() or 0) + amount)
        return true
    end

    if op == 'tryWallet' then
        return user:tryPayment(amount) == true
    end

    if op == 'tryBank' then
        local bank = user:getBank() or 0
        if bank < amount then return false end
        user:setBank(bank - amount)
        return true
    end

    return false
end

---The character's vRP groups as a set.
---
---A fresh table is built rather than handing back user.cdata.groups, so nothing on the far side of
---the export boundary can mutate vRP's live group state by accident.
---@param source number player server id
---@return table<string, boolean>
function methods:sdp_groups(source)
    if not SDPHONE_CAPS.group then return {} end

    local user = userOf(source)
    if not user then return {} end

    local out = {}
    local groups = user:getGroups()
    if type(groups) == 'table' then
        for name in pairs(groups) do
            if type(name) == 'string' then out[name] = true end
        end
    end
    return out
end

---True when `perm` is granted.
---
---Function permissions (the "!name.arg" form) are REFUSED, not evaluated: vRP dispatches them to
---registered permission functions and several stock ones - inside, in_vehicle, in_owned_vehicle,
---home, item, aptitude - make a blocking Tunnel round trip to the client. Yielding inside a
---cross-resource export invocation is not supported, so anything starting with "!" answers false
---and configs/vrp.lua documents the restriction.
---@param source number player server id
---@param perm string plain permission, never the "!" form
---@return boolean
function methods:sdp_perm(source, perm)
    if not SDPHONE_CAPS.group then return false end
    if type(perm) ~= 'string' or perm == '' or perm:sub(1, 1) == '!' then return false end

    local user = userOf(source)
    return (user and user:hasPermission(perm)) or false
end

---Add or remove a vRP group on the character.
---
---Adding is how a job change is expressed: vRP evicts any group sharing the new group's gtype, so
---the previous rank goes away on its own provided every configured group declares that gtype.
---@param source number player server id
---@param group string vRP group name
---@param add boolean true to join, false to leave
---@return boolean applied
function methods:sdp_setGroup(source, group, add)
    if not SDPHONE_CAPS.group then return false end
    if type(group) ~= 'string' or group == '' then return false end

    local user = userOf(source)
    if not user then return false end

    if add then
        user:addGroup(group)
    else
        user:removeGroup(group)
    end
    return true
end

---The value an inventory op answers when it cannot be served. Each op keeps the shape its caller
---expects, so a trimmed vRP install reads as "nothing in the inventory" rather than as an error.
---@param op string
---@return boolean|number|nil
local function itemFallback(op)
    if op == 'count' then return 0 end
    if op == 'label' then return nil end
    return false
end

---Inventory read and write.
---
---Both mutating ops pass `dry = false, no_notify = true`: vRP notifies by default, and every
---phone-driven item movement would otherwise pop a vRP GUI toast on top of sd-phone's own feedback.
---The weight-dependent ops are pcall'd because getInventoryMaxWeight() reaches into the Aptitude
---extension, which a trimmed install can have disabled independently of the inventory module.
---@param source number player server id
---@param op 'add'|'remove'|'count'|'label'|'canCarry'
---@param item string vRP item fullid
---@param count? number Default 1.
---@return boolean|number|string|nil
function methods:sdp_item(source, op, item, count)
    if not SDPHONE_CAPS.inventory then return itemFallback(op) end
    if type(item) ~= 'string' or item == '' then return itemFallback(op) end

    local Inv = vRP.EXT.Inventory

    if op == 'label' then
        local citem = Inv:computeItem(item)
        return citem and citem.name or nil
    end

    local user = userOf(source)
    if not user then return itemFallback(op) end

    if op == 'count' then return user:getItemAmount(item) or 0 end

    local n = tonumber(count) or 1
    if n <= 0 then return false end

    if op == 'add' then
        local ok, res = pcall(user.tryGiveItem, user, item, n, false, true)
        return ok and res == true
    end

    if op == 'remove' then
        local ok, res = pcall(user.tryTakeItem, user, item, n, false, true)
        return ok and res == true
    end

    if op == 'canCarry' then
        local citem = Inv:computeItem(item)
        if not citem then return false end
        local ok, free = pcall(function()
            return user:getInventoryMaxWeight() - user:getInventoryWeight()
        end)
        if not ok then return false end
        return (free or 0) >= (citem.weight or 0) * n
    end

    return false
end

---Every ready character currently connected, as character id -> player source.
---
---Not capability gated: this is vRP core state, so it stays correct on the most trimmed install.
---@return table<integer, number>
function methods:sdp_online()
    local out = {}
    for _, user in pairs(vRP.users) do
        if user.cid and user:isReady() then out[user.cid] = user.source end
    end
    return out
end

---Make `id` usable from vRP's inventory menu.
---
---NEVER calls Inventory:defineItem for an item the server already defines: defineItem replaces the
---whole record, so it would clobber that server's own name, description and WEIGHT and corrupt the
---weight accounting that computeItemsWeight does. For an existing item only menu_builder is mutated
---in place. Either way every computed_items entry derived from `id` is dropped, because computeItem
---memoises and defineItem does not invalidate that cache - and the cache is warm the moment any
---player's inventory weight has been evaluated, which would make the whole registration a silent
---no-op.
---@param id string base item id, with no "." or "|"
---@return boolean
function methods:sdp_defineUsable(id)
    if not SDPHONE_CAPS.inventory then return false end
    if type(id) ~= 'string' or id == '' then return false end
    if id:find('[%.|]') then return false end

    local Inv = vRP.EXT.Inventory

    local function builder(_, menu)
        menu:addOption(USE_TITLE, function(m)
            local user = m.user
            if not user then return end
            TriggerEvent(RELAY .. 'useItem', user.source, id)
            pcall(user.closeMenu, user, m)
        end)
    end

    local item = Inv.items[id]
    if item then
        item.menu_builder = builder
    else
        Inv:defineItem(id, id, '', builder, 0)
    end

    for fullid in pairs(Inv.computed_items) do
        local parts = Inv:parseItem(fullid)
        if parts and parts[1] == id then Inv.computed_items[fullid] = nil end
    end

    SDPHONE_USABLE[id] = true
    return true
end

---Relay: a character finished loading. Carries the cid because the phone keys its rows on it and
---vRP re-keys a player mid-session on a character switch, with no reconnect and no source change.
---@param user table vRP user
function events:characterLoad(user)
    if not user then return end
    TriggerEvent(RELAY .. 'characterLoad', user.source, user.cid)
end

---Relay: a character is being swapped out or the player is leaving. Paired with characterLoad, this
---is what lets the phone drop its identity cache on the exact edge instead of waiting out a TTL.
---@param user table vRP user
function events:characterUnload(user)
    if not user then return end
    TriggerEvent(RELAY .. 'characterUnload', user.source, user.cid)
end

---Relay: the player spawned. `first` distinguishes the initial spawn from a respawn.
---@param user table vRP user
---@param first boolean
function events:playerSpawn(user, first)
    if not user then return end
    TriggerEvent(RELAY .. 'playerSpawn', user.source, first == true)
end

---Relay: the player disconnected.
---@param user table vRP user
function events:playerLeave(user)
    if not user then return end
    TriggerEvent(RELAY .. 'playerLeave', user.source, user.cid)
end

---Relay: the character's money changed.
---
---vRP passes only the user, and it emits absolute balances rather than a delta, so the phone side
---diffs these against its own snapshot. This is the one signal vRP has that ESX does not, and it is
---what makes an externally initiated bank movement show up in the phone's wallet log.
---@param user table vRP user
function events:playerMoneyUpdate(user)
    if not user or not SDPHONE_CAPS.money then return end

    local ok, wallet, bank = pcall(function()
        return user:getWallet(), user:getBank()
    end)
    if not ok then return end

    TriggerEvent(RELAY .. 'money', user.source, wallet or 0, bank or 0)
end

---Relay: the character joined a group. `gtype` is what the phone matches against its configured job
---and gang group types.
---@param user table vRP user
---@param group string
---@param gtype string|nil
function events:playerJoinGroup(user, group, gtype)
    if not user then return end
    TriggerEvent(RELAY .. 'group', user.source, group, gtype, true)
end

---Relay: the character left a group.
---@param user table vRP user
---@param group string
---@param gtype string|nil
function events:playerLeaveGroup(user, group, gtype)
    if not user then return end
    TriggerEvent(RELAY .. 'group', user.source, group, gtype, false)
end

for name in pairs(methods) do
    proxy[name] = function(_, ...) return invoke(name, ...) end
end

---Publish every primitive as a CFX export on the vrp resource, exactly once per name.
---
---The bodies resolve through invoke() rather than closing over an implementation, so a later boot
---needs no re-registration and cannot leave a stale closure bound. Names added by a future version
---of this chunk are still picked up, because the guard is per name and not per chunk.
local function registerExports()
    for name in pairs(methods) do
        if not SDPHONE_EXPORTS[name] then
            SDPHONE_EXPORTS[name] = true
            exports(name, function(...) return invoke(name, ...) end)
        end
    end
end

---Re-apply every previously registered usable item.
---
---Needed on every boot: the menu builders vRP holds were created by the previous chunk, and the
---phone's own queue is only replayed on the ready edge. Re-applying is safe by construction because
---sdp_defineUsable mutates rather than replaces an existing item definition.
local function reapplyUsable()
    local ext = vRP.EXT.SDPhone
    if not ext then return end
    for id in pairs(SDPHONE_USABLE) do
        pcall(ext.sdp_defineUsable, ext, id)
    end
end

---@type table|nil The instance left behind by a previous boot, if any.
local existing = vRP.EXT.SDPhone

if existing then
    for name, exts in pairs(vRP.ext_listeners) do
        if exts[existing] ~= nil and events[name] == nil then exts[existing] = nil end
    end

    for name, cb in pairs(events) do
        local exts = vRP.ext_listeners[name]
        if not exts then
            exts = {}
            vRP.ext_listeners[name] = exts
        end
        exts[existing] = cb
    end

    for name, fn in pairs(methods) do existing[name] = fn end

    if type(existing.proxy_interface) == 'table' then
        for name, fn in pairs(proxy) do
            existing.proxy_interface[name] = function(...) return fn(existing, ...) end
        end
    end

    existing.proxy = proxy
    existing.caps = SDPHONE_CAPS

    registerExports()
    reapplyUsable()

    print('[sd-phone] vRP adapter rebound')
    return true
end

---@type table vRP extension class. It deliberately declares no .User mixin: User composes its
---mixins once, at first construction, so an extension registered later than the first connecting
---player would silently contribute nothing.
local SDPhone = class('SDPhone', vRP.Extension)

SDPhone.event = events
SDPhone.proxy = proxy

for name, fn in pairs(methods) do SDPhone[name] = fn end

---Construct the extension. Beyond vRP's own extension setup this only pins the capability map onto
---the instance, so a later boot can refresh it without touching the globals.
function SDPhone:__construct()
    vRP.Extension.__construct(self)
    self.caps = SDPHONE_CAPS
end

vRP:registerExtension(SDPhone)

registerExports()
reapplyUsable()

print('[sd-phone] vRP adapter loaded')

return true
