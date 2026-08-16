---@type integer Hard ceiling in ms on how long one Proxy request may wait for its reply. This is
---the PRIMARY safety net rather than a nicety: vRP emits the reply only AFTER the target function
---returns, in the same handler body, so a vRP function that raises aborts the handler and never
---replies at all. Without the bound the caller's coroutine would wait forever.
local RPC_TIMEOUT_MS = 5000

---@type integer Upper bound on how many values one reply may carry. vRP members in this bridge
---return at most three, so anything beyond this is a malformed or hostile payload; unpacking an
---arbitrary numeric key straight off the wire would blow the Lua stack.
local MAX_RETURNS = 16

---@type string The `identifier` half of vRP's reply event name, `<iface>:<identifier>:proxy_res`.
---Derived from the resource name rather than fixed, because that event name is a server-GLOBAL CFX
---name and replies are matched by a bare numeric request id. Two resources speaking this protocol
---under the same identifier would each receive the other's replies and consume them by rid, handing
---one caller the other's answer. vRP does not care what the string is, only that it round-trips.
local PROXY_IDENT = (function()
    local ok, name = pcall(GetCurrentResourceName)
    return (ok and type(name) == 'string' and name ~= '') and name or 'sd-phone'
end)()

---@type table Rpc module; the table returned at end of file. Speaks vRP's Proxy wire protocol
---directly, so sd-phone needs no manifest reference to `vrp` and no vRP library on its own side.
---One request encoding serves both lineages: vRP 1 unpacks with its `table.maxn` shim, which
---ignores the string key `n`, and vRP 2 unpacks with `args.n`.
local rpc = {}

---@type table<integer, { done: boolean, rets: table|nil, p: table|nil }> In-flight requests keyed
---by request id. A slot lives only for the duration of one rpc.call: every exit path clears it, and
---a reply for an id that is no longer here is a late or duplicate answer and is dropped.
local pending = {}

---@type table<string, true> Proxy interfaces whose reply handler has been registered. Registration
---is lazy so that merely requiring this module on a non-vRP server adds no event handlers.
local wired = {}

---@type table<string, true> Warning keys already printed, so a permanently broken vRP member costs
---one console line rather than one per call.
local warned = {}

---@type integer Monotonic source of request ids. Never reused and never freed, which is what makes
---ids collision-proof across concurrent calls: a slow yielding call still owns its id while any
---number of later calls come and go. vRP echoes the id back untouched, so this counter is the sole
---authority over the id space of the `sd-phone` identifier.
local nextRid = 0

---Print `msg` the first time `key` is seen and stay silent afterwards.
---@param key string dedupe key, normally 'iface:member'
---@param msg string fully formatted line, colour codes included
local function warnOnce(key, msg)
    if warned[key] then return end
    warned[key] = true
    print(msg)
end

---Decode a Proxy reply payload into its original values. The two lineages disagree on the shape:
---vRP 1 replies with a plain array built as `{f(...)}` and no `n` field, vRP 2 replies with a
---`table.pack` that carries one. Trusting `#rets` would silently truncate a multi-return whose
---first value is nil, so the length is `rets.n` when present and the largest numeric key otherwise,
---which keeps interior nil holes intact through table.unpack.
---@param rets table|nil raw reply payload as it came off the wire
---@param label? string 'iface:member', used only to name the source of a clamped payload
---@return ... any Nothing at all when the payload is absent or empty.
function rpc.decode(rets, label)
    if type(rets) ~= 'table' then return end

    local n = tonumber(rets.n)
    if not n then
        n = 0
        for k in pairs(rets) do
            local i = tonumber(k)
            if i and i > n then n = i end
        end
    end

    n = math.tointeger(n) or 0
    if n <= 0 then return end
    if n > MAX_RETURNS then
        warnOnce('clamp:' .. (label or '?'), ('^3[sd-phone:vrp]^0 %s replied with %d values, clamping to %d')
            :format(label or 'proxy reply', n, MAX_RETURNS))
        n = MAX_RETURNS
    end

    return table.unpack(rets, 1, n)
end

---Resolve the slot a reply belongs to. Runs inside vRP's own TriggerEvent, which in the common
---case is still inside ours, so this is what makes the inline fast path possible. A reply whose
---slot is gone or already settled is dropped: that is a duplicate, or an answer that arrived after
---the bounded await gave up.
---@param rid integer request id echoed back by vRP
---@param rets table|nil reply payload
local function onReply(rid, rets)
    local slot = pending[rid]
    if not slot or slot.done then return end
    slot.done = true
    slot.rets = rets
    if slot.p then slot.p:resolve(rets or false) end
end

---Register the reply handler for one Proxy interface, once. The event is same-side, so no
---RegisterNetEvent is involved, and one handler serves every request on that interface because
---request ids are unique across all of them.
---@param iface string
local function wire(iface)
    if wired[iface] then return end
    wired[iface] = true
    AddEventHandler(iface .. ':' .. PROXY_IDENT .. ':proxy_res', onReply)
end

---Serialise and dispatch one Proxy request. Guarded because the payload is msgpack-encoded inside
---our own runtime before any handler sees it, so an argument vRP could never accept (a function, a
---userdata) raises here rather than on vRP's side.
---@param iface string
---@param fname string
---@param rid integer request id, or -1 for a request vRP must not answer
---@param args table table.pack of the call arguments
---@return boolean sent
local function fire(iface, fname, rid, args)
    local ok, err = pcall(TriggerEvent, iface .. ':proxy', fname, args, PROXY_IDENT, rid)
    if not ok then
        warnOnce('fire:' .. iface .. ':' .. fname,
            ('^3[sd-phone:vrp]^0 could not dispatch %s:%s: %s'):format(iface, fname, tostring(err)))
    end
    return ok
end

---True when the current execution context can yield into the FiveM scheduler. Both Lua dialects
---have to be satisfied: LuaJIT returns nil from the main thread while Lua 5.4 returns the main
---coroutine plus a true flag, and yielding from either is an error rather than a wait.
---@return boolean
local function inCoroutine()
    local co, isMain = coroutine.running()
    return co ~= nil and isMain ~= true
end

---Fire a vRP Proxy request and return its results. The reply frequently lands INLINE (vRP's
---handler runs inside our TriggerEvent and most vRP 1 reads never yield), in which case this
---returns without ever touching a promise. Only a yielding vRP function costs an await, and that
---await is bounded: nil is returned on timeout rather than hanging the caller's coroutine. A
---timeout is NOT the same as a nil answer - vRP's Proxy emits its reply AFTER invoking the target,
---so a raising vRP function produces no reply at all, which is why every timeout is logged.
---@param iface string Proxy interface name ('vRP' on v1, 'vRP.EXT.SDPhone' on v2).
---@param fname string
---@param ... any
---@return ... any Nil when vRP never answered, or when called outside a Citizen coroutine.
function rpc.call(iface, fname, ...)
    wire(iface)

    local rid = nextRid
    nextRid = rid + 1

    local slot = { done = false }
    pending[rid] = slot

    if not fire(iface, fname, rid, table.pack(...)) then
        pending[rid] = nil
        return nil
    end

    -- The fast path, and on vRP 1 the common one: the whole exchange already completed inside the
    -- TriggerEvent above, so there is nothing to wait for.
    if slot.done then
        pending[rid] = nil
        return rpc.decode(slot.rets, iface .. ':' .. fname)
    end

    -- vRP yielded. Awaiting is only legal inside a scheduler coroutine, and hanging a file-scope
    -- caller is never acceptable, so bail with a warning instead.
    if not inCoroutine() then
        pending[rid] = nil
        warnOnce('sync:' .. iface .. ':' .. fname,
            ('^3[sd-phone:vrp]^0 %s:%s yielded but was called outside a coroutine; returning nil')
            :format(iface, fname))
        return nil
    end

    slot.p = promise.new()
    SetTimeout(RPC_TIMEOUT_MS, function()
        if slot.done then return end
        slot.done = true
        slot.p:resolve(false)
    end)

    local ok, rets = pcall(Citizen.Await, slot.p)
    pending[rid] = nil

    if not ok or rets == false then
        warnOnce('timeout:' .. iface .. ':' .. fname,
            ('^3[sd-phone:vrp]^0 no reply from %s:%s after %dms'):format(iface, fname, RPC_TIMEOUT_MS))
        return nil
    end

    return rpc.decode(rets, iface .. ':' .. fname)
end

---Fire a vRP Proxy request with rid = -1: vRP skips the reply entirely. Use for writes whose
---verdict the caller does not read, and for compensating writes on an error path.
---@param iface string
---@param fname string
---@param ... any
function rpc.post(iface, fname, ...)
    fire(iface, fname, -1, table.pack(...))
end

return rpc
