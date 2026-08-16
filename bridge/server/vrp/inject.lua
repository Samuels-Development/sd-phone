---@type table Framework detection (bridge.shared.framework): name + live core handle. Required
---unconditionally because every bridge module already does, so it adds nothing to a non-vRP boot.
local framework = require 'bridge.shared.framework'

---@type table vRP lineage + adapter config (bridge.shared.vrp_version). Safe on every framework: it
---only probes files on disk and loads configs/vrp.lua through a pcall.
local ver = require 'bridge.shared.vrp_version'

---@type boolean Whether this server is one this module has any business running on. Everything
---below the stub guard depends on it: vRP 1 has no loadScript and therefore no injection at all, and
---a non-vRP server must not gain a single event handler or timer from requiring this file.
local ACTIVE = framework.name == 'vrp' and ver.present == true and ver.major == 2

---@type table<string, boolean> Shared empty capability map handed out by the stub. Never mutated.
local EMPTY_CAPS = {}

---@class VrpInject
---@field ready fun(): boolean True once a live adapter has been proven to answer.
---@field caps fun(): table<string, boolean> Which vRP modules are enabled. Read-only.
---@field viaProxy fun(): boolean True when primitives are travelling over vRP's Proxy wire.
---@field call fun(name: string, ...): ... Invoke one adapter primitive; nil until ready.
---@field queueUsable fun(item: string, cb: fun(source: number, item: string)): boolean
---@field flushUsable fun(): integer How many queued items the adapter accepted.
---@field onReady fun(fn: fun()): nil Re-apply hook; see inject.onReady.

---@type VrpInject Inert stand-in returned on every server that is not vRP 2. It registers nothing,
---starts nothing and answers every question with the same degraded value the real module answers
---before its handshake completes, so a caller cannot tell the two apart and never has to ask.
local stub = {
    ready       = function() return false end,
    caps        = function() return EMPTY_CAPS end,
    viaProxy    = function() return false end,
    call        = function() return nil end,
    queueUsable = function() return false end,
    flushUsable = function() return 0 end,
    onReady     = function() end,
}

if not ACTIVE then return stub end

---@type table vRP Proxy client (bridge.server.vrp.rpc). Required below the stub guard on purpose:
---on a non-vRP server it would be dead weight, and the gated require is the rule §2.4 of the design
---makes non-negotiable for everything under bridge/server/vrp/.
local rpc = require 'bridge.server.vrp.rpc'

---@type string Resource whose vrp/ chunks are injected. Read live rather than hardcoded so a
---renamed sd-phone folder still hands vRP a path it can resolve; the pcall covers a plain-Lua test
---harness where the native does not exist.
local OWNER = (function()
    local ok, name = pcall(GetCurrentResourceName)
    return (ok and type(name) == 'string' and name ~= '') and name or 'sd-phone'
end)()

---@type string Resource the adapter runs inside. Both vRP lineages ship under this one name.
local VRP_RESOURCE = 'vrp'

---@type string vRP's own Proxy interface. It publishes exactly one member, loadScript, which is
---vRP's module loader and the single door into its Lua state.
local IFACE_VRP = 'vRP'

---@type string Proxy interface vRP publishes for our injected extension, named for the class in
---vrp/ext.lua. This is the fallback wire for the case where exports registered from a runtime-loaded
---chunk turn out not to be visible across resources.
local IFACE_EXT = 'vRP.EXT.SDPhone'

---@type string Loader path of the frozen bootstrap chunk, without its .lua suffix: vRP's module()
---appends that itself.
local BOOT_PATH = 'vrp/boot'

---@type string Loader path of the adapter chunk. Only ever loaded this way on the proxy fallback -
---the normal path goes through sdp_boot, which re-reads it from disk on every sd-phone start and so
---sidesteps module()'s permanent memoisation.
local EXT_PATH = 'vrp/ext'

---@type string Export that identifies the injected adapter and reports its capabilities.
local PING = 'sdp_ping'

---@type string Export that loads and runs vrp/ext.lua inside vRP's state.
local BOOT = 'sdp_boot'

---@type string Primitive used to probe the proxy fallback. It is the only one that is not gated on
---a vRP module being enabled, so a table answer proves the adapter is live rather than proving
---anything about the server's configuration.
local PROBE = 'sdp_online'

---@type string Primitive that makes an item usable from vRP's inventory menu.
local DEFINE_USABLE = 'sdp_defineUsable'

---@type integer Injection contract version. The handshake refuses to bind unless sdp_ping answers
---exactly this, which is what makes it self-verifying on a vRP 2 fork that renamed the marker files
---the lineage probe looks for.
local PROTOCOL = 2

---@type integer Attempts on the export path before the proxy fallback is tried. vRP may still be
---starting when we are, so the handshake has to survive the window rather than assume it lost.
local ATTEMPTS = 20

---@type integer Attempts on the proxy fallback. Kept small because each miss costs a full rpc
---timeout, and by this point the export path has already spent its whole budget.
local PROXY_ATTEMPTS = 2

---@type integer Milliseconds between attempts.
local ATTEMPT_DELAY = 250

---@type string[] Capability names the adapter reports, in the order they are printed.
local CAP_NAMES = { 'money', 'group', 'identity', 'inventory' }

---@type string Event vRP's state fires when a player uses a registered item.
local RELAY_USE = 'sd-phone:vrp:useItem'

---@type table Inject module; the table returned at end of file. It owns the vRP 2 handshake and
---everything decided by it: the ready flag, the capability map, and the choice between the export
---wire and the Proxy wire. That choice cannot be made at module load the way the rest of the bridge
---makes its choices, because it is not knowable until vRP has answered, so it is made once on the
---ready edge and stored as a transport closure instead.
local inject = {}

---@type boolean True once a transport has been proven to answer.
local isReady = false

---@type boolean True when that transport is the Proxy wire rather than exports.
local proxied = false

---@type table<string, boolean> Live capability map; empty until the handshake resolves it.
local caps = EMPTY_CAPS

---@type fun(name: string, ...): ...|nil The bound transport, chosen once on the ready edge.
local transport = nil

---@type table<string, fun(source: number, item: string)> Queued usable-item registrations, keyed by
---item id. Registration has to be queued rather than performed: inventory.registerUsable is bound at
---module load and its call sites run at file scope, long before this handshake can have finished.
local usable = {}

---@type fun()[] Re-apply hooks, run on the ready edge and on every later flush.
local hooks = {}

---@type table<string, true> Warning keys already printed, so a permanently broken primitive costs
---one console line rather than one per call.
local warned = {}

---Print `msg` the first time `key` is seen and stay silent afterwards.
---@param key string dedupe key
---@param msg string fully formatted line, colour codes included
local function warnOnce(key, msg)
    if warned[key] then return end
    warned[key] = true
    print(msg)
end

---Invoke an export on the vrp resource, guarded. The call is wrapped rather than made directly
---because resolving an export that was never registered raises, and during the handshake that is the
---expected answer rather than a fault.
---@param name string export name
---@param ... any
---@return boolean ok, ... any Results of the export when ok is true.
local function callExport(name, ...)
    local args = table.pack(...)
    return pcall(function()
        return exports[VRP_RESOURCE][name](nil, table.unpack(args, 1, args.n))
    end)
end

---Transport: primitives travel as CFX exports registered by the injected chunk on the vrp resource.
---The fast wire, and the only one that does not need the caller to be inside a coroutine.
---@param name string primitive name
---@param ... any
---@return ... any Nil when the export is missing or raised.
local function exportTransport(name, ...)
    local rets = table.pack(callExport(name, ...))
    if not rets[1] then
        warnOnce('export:' .. name,
            ('^3[sd-phone:vrp]^0 export %s failed: %s'):format(name, tostring(rets[2])))
        return nil
    end
    return table.unpack(rets, 2, rets.n)
end

---Transport: primitives travel over vRP's Proxy wire to the extension's own interface. Slower, and
---bound by rpc.call's rules about coroutines, but it needs nothing from the export system.
---@param name string primitive name
---@param ... any
---@return ... any
local function proxyTransport(name, ...)
    return rpc.call(IFACE_EXT, name, ...)
end

---Every capability assumed present. Used whenever the adapter could not tell us which vRP modules
---are enabled. Optimistic on purpose: each primitive re-checks its own capability inside vRP's state
---and returns the degraded value there, so guessing "present" costs at worst one wasted round trip,
---while guessing "absent" would switch off features that actually work.
---@return table<string, boolean>
local function optimisticCaps()
    local out = {}
    for i = 1, #CAP_NAMES do out[CAP_NAMES[i]] = true end
    return out
end

---Normalise a reported capability map. A payload naming none of the known capabilities is treated as
---"not reported" rather than as "nothing is enabled", which is the difference between an adapter that
---has not run its probe yet and a vRP install stripped to the core.
---@param raw any caps field as it came back from sdp_ping
---@return table<string, boolean>|nil nil when the payload carried nothing usable
local function normaliseCaps(raw)
    if type(raw) ~= 'table' then return nil end

    local out, reported = {}, false
    for i = 1, #CAP_NAMES do
        local name = CAP_NAMES[i]
        if raw[name] ~= nil then reported = true end
        out[name] = raw[name] == true
    end

    if not reported then return nil end
    return out
end

---The enabled capabilities as a printable list.
---@param map table<string, boolean>
---@return string
local function capsList(map)
    local out = {}
    for i = 1, #CAP_NAMES do
        if map[CAP_NAMES[i]] then out[#out + 1] = CAP_NAMES[i] end
    end
    if #out == 0 then return 'none' end
    return table.concat(out, ', ')
end

---Handshake probe. Answers only when a chunk of ours is loaded in vRP's state AND it speaks this
---exact contract version, so a fork with an unrelated export of the same name cannot bind us.
---@return table|nil payload The ping payload, or nil when nothing valid answered.
local function ping()
    local rets = table.pack(callExport(PING))
    if not rets[1] then return nil end

    local payload = rets[2]
    if type(payload) ~= 'table' or payload.protocol ~= PROTOCOL then return nil end
    return payload
end

---Load (or reload) the adapter chunk inside vRP's state. OWNER is passed rather than left to the
---injected chunk's default: boot.lua is frozen for vRP's lifetime, so it cannot discover our name on
---its own and a folder renamed on the way out of a zip would otherwise never bind.
---@return boolean loaded
local function boot()
    local ok, res = callExport(BOOT, OWNER)
    return ok and res == true
end

---Ask vRP to load one of our chunks into its own Lua state. Fire-and-forget because vRP's loader
---raises when a file is missing, and a raising proxy member never replies at all - waiting on it
---would only burn a timeout. Idempotent: vRP's module() memoises by path, so a repeat is free.
---@param path string chunk path relative to this resource, without the .lua suffix
local function loadScript(path)
    rpc.post(IFACE_VRP, 'loadScript', OWNER, path)
end

---Bind the adapter and announce it. Everything the rest of the bridge reads from this module is
---settled here, in one place, on one edge.
---@param useProxy boolean true to route primitives over the Proxy wire
---@param capMap table<string, boolean> resolved capability map
local function bind(useProxy, capMap)
    proxied = useProxy
    transport = useProxy and proxyTransport or exportTransport
    caps = capMap
    isReady = true

    print(('^2[sd-phone:vrp]^0 adapter live over %s (caps: %s)')
        :format(useProxy and 'proxy' or 'exports', capsList(capMap)))

    inject.flushUsable()
end

---True once the injected adapter has answered and a transport is bound. Everything routed through
---this module answers the degraded nil/0/false/{} until then.
---@return boolean
function inject.ready()
    return isReady
end

---Which vRP modules are live. Empty until the handshake resolves, and never nil, so a caller can
---index it unconditionally. Treat it as read-only: it is the live map, not a copy.
---@return table<string, boolean>
function inject.caps()
    return caps
end

---True when primitives are travelling over vRP's Proxy wire instead of over exports. Callers do not
---need this to make a call, only to understand why one might need a coroutine.
---@return boolean
function inject.viaProxy()
    return proxied
end

---Invoke one adapter primitive over whichever transport was bound.
---
---Returns nil before the handshake completes, which is the same answer every primitive gives for an
---unresolvable player, so no caller needs a readiness check of its own.
---@param name string primitive name, e.g. 'sdp_money'
---@param ... any
---@return ... any
function inject.call(name, ...)
    if not transport then return nil end
    return transport(name, ...)
end

---Register a hook to re-apply state that lives inside vRP's Lua state.
---
---It runs on the ready edge and again on every flush, so it must be idempotent. That is the point:
---vrp/ext.lua is re-executed on every sd-phone start, and anything a caller installed into vRP has to
---be reapplied rather than assumed to have survived. Registering while already ready runs it once
---immediately, so a late caller is never left waiting for an edge that has already passed.
---@param fn fun()
function inject.onReady(fn)
    if type(fn) ~= 'function' then return end
    hooks[#hooks + 1] = fn
    if isReady then pcall(fn) end
end

---Queue an item to be made usable from vRP's inventory menu, and flush now if the adapter is already
---up.
---
---Queueing is not an optimisation. inventory.registerUsable is bound at module load and both of its
---call sites run at file scope during resource start, while this module's handshake is still inside
---its first Wait - so a direct registration would always be too early. Re-registering the same item
---replaces its callback rather than stacking a second one.
---@param item string vRP item id
---@param cb fun(source: number, item: string) invoked when a player uses the item
---@return boolean queued False when the arguments are unusable.
function inject.queueUsable(item, cb)
    if type(item) ~= 'string' or item == '' then return false end
    if type(cb) ~= 'function' then return false end

    usable[item] = cb
    if isReady then inject.flushUsable() end
    return true
end

---Push every queued usable item into vRP and run the re-apply hooks.
---
---Safe to call at any time and safe to call repeatedly: the adapter mutates an existing item
---definition rather than replacing it, so a re-flush cannot clobber a server's own item weight or
---label. A no-op before the handshake completes, because there is nothing to push it into yet.
---@return integer applied How many items the adapter accepted.
function inject.flushUsable()
    if not isReady then return 0 end

    local applied = 0
    for item in pairs(usable) do
        if inject.call(DEFINE_USABLE, item) == true then
            applied = applied + 1
        else
            warnOnce('usable:' .. item,
                ('^3[sd-phone:vrp]^0 vRP would not make item %q usable'):format(item))
        end
    end

    for i = 1, #hooks do pcall(hooks[i]) end
    return applied
end

---Relay: a player used one of our registered items inside vRP's inventory menu. The callback is
---pcall'd because it belongs to an app rather than to the bridge, and a raise here would surface as
---a fault on an event our own injected chunk fired.
---@param source number player server id
---@param item string vRP item id
AddEventHandler(RELAY_USE, function(source, item)
    local cb = usable[item]
    if not cb then return end

    local ok, err = pcall(cb, source, item)
    if not ok then
        warnOnce('use:' .. tostring(item),
            ('^3[sd-phone:vrp]^0 use handler for %q failed: %s'):format(tostring(item), tostring(err)))
    end
end)

---Run the handshake to completion, binding the adapter or giving up.
---
---Named rather than inlined into the startup thread because it has to be runnable a second time: see
---the resource-start handler below.
local function handshake()
    -- The bootstrap chunk is re-requested every attempt rather than once up front: vRP may start
    -- after us, and until it has there is no handler on the other end of loadScript at all. vRP
    -- memoises the chunk by path, so every repeat after the first one costs nothing.
    for _ = 1, ATTEMPTS do
        loadScript(BOOT_PATH)

        local payload = ping()
        if payload and boot() then
            -- Re-ping after booting: the capability probe lives in the adapter chunk sdp_boot just
            -- ran, so the first ping can only have reported an empty map.
            local booted = ping() or payload
            bind(false, normaliseCaps(booted.caps) or optimisticCaps())
            return
        end

        Wait(ATTEMPT_DELAY)
    end

    -- Exports registered from a chunk vRP loaded at runtime are the one part of this design that
    -- could not be verified against a live server. If they turn out not to be visible here, the
    -- adapter itself is still perfectly reachable: it publishes the same primitives as a Proxy
    -- interface. Loading ext.lua directly is what makes that reachable without sdp_boot, and it
    -- stays reachable across an sd-phone restart because the extension vRP already holds keeps its
    -- interface registered.
    for _ = 1, PROXY_ATTEMPTS do
        loadScript(EXT_PATH)

        if type(rpc.call(IFACE_EXT, PROBE)) == 'table' then
            bind(true, optimisticCaps())
            return
        end

        Wait(ATTEMPT_DELAY)
    end

    print('^3[sd-phone:vrp]^0 no adapter answered on vrp; vRP-backed features will stay empty')
end

CreateThread(handshake)

-- Everything this adapter consists of lives inside vRP's Lua state, so `restart vrp` destroys all of
-- it while this module carries on reporting ready and calling a transport with nobody behind it.
-- Nothing recovers that on its own: vRP's module() memoisation resets with the state, so the chunks
-- are gone too. Tear the binding down on the edge and run the handshake again.
AddEventHandler('onServerResourceStart', function(resource)
    if resource ~= VRP_RESOURCE then return end

    isReady, proxied, transport, caps = false, false, nil, EMPTY_CAPS
    print('^3[sd-phone:vrp]^0 vrp restarted, re-injecting the adapter')
    CreateThread(handshake)
end)

return inject
