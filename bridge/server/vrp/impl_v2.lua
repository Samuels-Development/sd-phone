---@type table Proxy wire protocol (bridge.server.vrp.rpc). Only the fallback transport here: vRP 2
---is reached through the CFX exports vrp/ext.lua registers, and the proxy is what keeps the design
---working if exports published from a runtime-loaded chunk turn out to be invisible to other
---resources on a live server.
local rpc = require 'bridge.server.vrp.rpc'

---@type table Group translator (bridge.server.vrp.groups): the pure config -> job/grade/boss/duty
---mapping, shared with impl_v1 so both lineages answer a job question identically.
local groups = require 'bridge.server.vrp.groups'

---@type table Direct schema reads (bridge.server.vrp.sql). Used here only for keyFor, so the
---sd-phone identifier format has exactly one owner on the vRP path and an online key can never
---drift from the offline one a SQL read produced.
local sql = require 'bridge.server.vrp.sql'

---@type table vRP lineage + adapter config (bridge.shared.vrp_version), the sole owner of
---configs/vrp.lua. Requiring it here costs nothing: every path into this module is already gated on
---framework.name == 'vrp' and a major of 2.
local ver = require 'bridge.shared.vrp_version'

---@type table configs/vrp.lua, or an empty table when the admin's configs/ folder predates vRP
---support. Every read below carries its own default rather than assuming a key exists.
local cfg = type(ver.cfg) == 'table' and ver.cfg or {}

---@type string CFX resource hosting the injected adapter. vRP ships under this name in both
---lineages and the community fork, and vrp/boot.lua registers its exports on it.
local ADAPTER_RESOURCE = 'vrp'

---@type string Proxy interface the adapter's `.proxy` table is published under. vRPShared builds the
---name as 'vRP.EXT.'..class.name(extension) and vrp/ext.lua names the extension SDPhone.
local PROXY_IFACE = 'vRP.EXT.SDPhone'

---@type integer Milliseconds the proxy fallback is left alone after an attempt that answered
---nothing. rpc.call has to wait out its own 5s bound before it can conclude the interface is not
---there, so probing it on every primitive while the adapter is still booting would stall the caller
---once per call instead of once per window.
local PROXY_RETRY_MS <const> = 15000

---@type integer Milliseconds a resolved vRP state is served before it is read again. The lifecycle
---relay clears it on the edges that matter, including vRP 2's mid-session character switch where the
---source is unchanged but the character behind it is not, so this is only the backstop for an edge
---that never arrived.
local STATE_TTL <const> = 2000

---@type integer Milliseconds a group set is served before it is read again. Collapses the
---getName + getGrade + isBoss burst most callers do into a single adapter round trip; the relay
---clears it on every group change, so the window can only ever serve a set nothing has altered.
local GROUP_TTL <const> = math.max(0, math.floor(tonumber(cfg.JobCacheTtl) or 250))

---@type boolean True when the phone is keyed on the vRP ACCOUNT rather than on one character.
---Identity, money and groups are all per-character on vRP 2 either way; this only decides which id
---the sd-phone key is built from, and changing it after go-live orphans every row.
local ACCOUNT_SCOPE <const> = cfg.IdentityScope == 'account'

---@type table<string, string> sd-phone money account name -> vRP account. bridge/server/money.lua's
---convertType is a no-op on vRP, so both the qb spelling ('cash') and the ESX one ('money') arrive
---here untranslated. Anything absent from this map (black money) has no vRP account at all.
local ACCOUNTS = { cash = 'wallet', money = 'wallet', wallet = 'wallet', bank = 'bank' }

---@type string Relay event carrying the character-load edge out of vRP's Lua state.
local EV_CHARACTER_LOAD = 'sd-phone:vrp:characterLoad'

---@type string Relay event carrying the character-unload edge, which also fires on a mid-session
---character switch.
local EV_CHARACTER_UNLOAD = 'sd-phone:vrp:characterUnload'

---@type string Relay event carrying the disconnect edge.
local EV_PLAYER_LEAVE = 'sd-phone:vrp:playerLeave'

---@type string Relay event carrying absolute wallet and bank balances after any money change.
local EV_MONEY = 'sd-phone:vrp:money'

---@type string Relay event carrying a group join or leave.
local EV_GROUP = 'sd-phone:vrp:group'

---@type string Relay event fired when a player uses an item this module made usable.
local EV_USE_ITEM = 'sd-phone:vrp:useItem'

---@type string Normalised money change, emitted for server/banking/init.lua. Deliberately the same
---shape on every framework, so that handler carries no vRP branch.
local OUT_MONEY = 'sd-phone:server:moneyChanged'

---@type string Client nudge telling an open Wallet screen to re-read its balance.
local OUT_CLIENT_MONEY = 'sd-phone:client:moneyChanged'

---@type string Client push carrying (jobName, grade). vRP has no client data API, so this is the
---only way bridge/client/job.lua ever learns the player's job.
local OUT_CLIENT_JOB = 'sd-phone:client:vrp:jobState'

---@type table Impl module; the table returned at end of file. Every vRP 2 primitive, expressed over
---the adapter injected into vRP's own Lua state by vrp/boot.lua + vrp/ext.lua. Nothing in here
---speaks to vRP's stock API directly: vRP 2 publishes exactly one proxy member (loadScript), so the
---adapter is the entire surface and this module is its client.
local impl = {}

---@type 'export'|'proxy'|nil Transport proven to reach the adapter, pinned on the first call that
---got through. This is the one piece of dispatch in the file that is NOT bound at module load, and
---it cannot be: which transport works is settled by an asynchronous handshake that has not run when
---this module is required, so the choice is made once at first contact instead.
local transport

---@type number GetGameTimer() value before which the proxy fallback is not attempted again.
local proxyBlockedUntil = 0

---@type table<number, { at: number, id: integer|nil, cid: integer|nil, identity: table|nil, shim: table }>
---Per-source vRP state. The shim table inside an entry is stable for as long as the character behind
---the source stays loaded and is refreshed in place, because bridge/server/player.get() hands it to
---call sites that may hold on to it. A character switch drops the entry outright rather than
---refreshing it, so a reference captured for the previous character can never quietly start
---answering for the new one.
local stateCache = {}

---@type table<number, { at: number, set: table<string, boolean>, perms: table<string, boolean>, state: table }>
---Per-source group membership plus the permission answers resolved during the same window.
local groupCache = {}

---@type table<number, { wallet: integer, bank: integer }> Last balances seen per source. vRP emits
---absolute values, so this is what turns its money event into the signed delta the rest of the
---resource speaks.
local snapshots = {}

---@type string[] Item ids that must be made usable inside vRP, in registration order. Entries are
---never removed: sdp_defineUsable is idempotent, and keeping them lets a later flush re-apply the
---whole set after the adapter has been re-injected.
local usableItems = {}

---@type table<string, fun(source: number, item?: any, inv?: table, slot?: any, data?: any)> Handlers
---registered for a usable item, keyed by item id.
local usableHandlers = {}

---@type table Compiled job translator for configs/vrp.lua -> Jobs, built once at module load.
local jobsConfig = groups.compile(cfg, 'job')

---@type table Compiled gang translator for configs/vrp.lua -> Gangs, built once at module load.
local gangsConfig = groups.compile(cfg, 'gang')

for i = 1, #jobsConfig.warnings do
    print(('^3[sd-phone:vrp]^0 configs/vrp.lua Jobs: %s'):format(jobsConfig.warnings[i]))
end
for i = 1, #gangsConfig.warnings do
    print(('^3[sd-phone:vrp]^0 configs/vrp.lua Gangs: %s'):format(gangsConfig.warnings[i]))
end

---Subscribe to one relay event. AddEventHandler is guarded so this module stays loadable under a
---plain-Lua harness with no CFX event API; on a live server it cannot fail. These events arrive by
---same-side TriggerEvent from the vrp resource, so RegisterNetEvent would only expose them to
---spoofing from a client.
---@param name string event name
---@param handler function
local function subscribe(name, handler)
    pcall(AddEventHandler, name, handler)
end

---Milliseconds since server start. Every cache in this file compares against it. The os.clock
---fallback is only reachable under a plain-Lua harness with no CFX API, and it is a real clock
---rather than a constant so a cached entry there still ages out instead of being served forever.
---@return number
local function timer()
    local ok, ms = pcall(GetGameTimer)
    return (ok and tonumber(ms)) or (os.clock() * 1000)
end

---Invoke one adapter export. The pcall's boolean is the only usable signal for "this export is not
---registered": CFX raises on an unknown export name, while a registered one answering nil is an
---ordinary result, so `ok` decides the transport and the returned value never does. Only the first
---return value is kept, which every sdp_* member honours by design.
---@param name string sdp_* export name
---@param ... any
---@return boolean ok False only when the export could not be reached at all.
---@return any value
local function callExport(name, ...)
    local args = table.pack(...)
    local ok, res = pcall(function()
        return exports[ADAPTER_RESOURCE][name](exports[ADAPTER_RESOURCE], table.unpack(args, 1, args.n))
    end)
    return ok, res
end

---Invoke one adapter primitive over the Proxy wire. Guarded for the same reason every other
---external call in this file is: rpc.call awaits a promise, and an await that raises must degrade to
---"vRP did not answer" rather than propagate out of the app callback that asked.
---@param name string sdp_* primitive name
---@param ... any
---@return any
local function callProxy(name, ...)
    local ok, answer = pcall(rpc.call, PROXY_IFACE, name, ...)
    if not ok then return nil end
    return answer
end

---Call one adapter primitive over whichever transport reaches it.
---
---The export path is tried first and pinned the moment it answers, because it is a plain function
---call that never yields. The proxy is the documented fallback for the one unproven assumption in
---this design (exports registered from a chunk vRP loaded at runtime), and it is rate limited: an
---attempt that answers nothing means the interface is probably not there yet, and rpc.call can only
---reach that conclusion by waiting out its own timeout, so retrying it per call would stall the
---caller repeatedly while the adapter is still booting.
---@param name string sdp_* primitive name
---@param ... any
---@return any Nil when neither transport reached the adapter.
local function invoke(name, ...)
    if transport == 'proxy' then return callProxy(name, ...) end

    local ok, res = callExport(name, ...)
    if ok then
        transport = 'export'
        return res
    end

    -- The export could not be reached at all, so any earlier pin is stale: probe both again.
    transport = nil

    local now = timer()
    if now < proxyBlockedUntil then return nil end

    local answer = callProxy(name, ...)
    if answer ~= nil then
        transport = 'proxy'
        return answer
    end

    proxyBlockedUntil = now + PROXY_RETRY_MS
    return nil
end

---Pin the transport every primitive uses, or clear the pin to let it be probed again.
---
---Exists so bridge/server/vrp/inject.lua can hand down what its handshake proved instead of letting
---this module rediscover it, which is worth one call at boot: an unpinned module that has to fall
---back pays a bounded proxy timeout the first time.
---@param kind 'export'|'proxy'|nil
function impl.setTransport(kind)
    transport = (kind == 'export' or kind == 'proxy') and kind or nil
    proxyBlockedUntil = 0
end

---Pick the "vRP state -> sd-phone identifier" builder once at module load. The scope is a property
---of configs/vrp.lua and never of the player, and the `u`/`c` discriminator in the key is what keeps
---the account and character id spaces disjoint after a vRP 1 -> vRP 2 migration.
---@return fun(state: table): string|nil
local function chooseKeyOf()
    if ACCOUNT_SCOPE then
        return function(state) return state.id and sql.keyFor(state.id) or nil end
    end
    return function(state) return state.cid and sql.keyFor(state.cid) or nil end
end

---@type fun(state: table): string|nil Identifier builder, bound once at load.
local keyOf = chooseKeyOf()

---Read one source's vRP state straight from the adapter, with no cache in the way.
---@param source number player server id
---@return { id: integer|nil, cid: integer|nil, identity: table|nil }|nil
local function readState(source)
    local raw = invoke('sdp_state', source)
    if type(raw) ~= 'table' then return nil end
    return {
        id       = tonumber(raw.id),
        cid      = tonumber(raw.cid),
        identity = type(raw.identity) == 'table' and raw.identity or nil,
    }
end

---The cached vRP state for a source, refreshing it when the entry has aged out.
---
---A miss is cached too, and deliberately: an unloaded source is the common answer for most of the
---connected population, and the relay clears the entry on the load edge so a real login is never
---made to wait out the TTL.
---@param source number|string player server id
---@return table|nil entry cache entry, or nil when the source has no loaded character
local function entryFor(source)
    local src = tonumber(source)
    if not src then return nil end

    local now = timer()
    local entry = stateCache[src]
    if entry and (now - entry.at) < STATE_TTL then
        return entry.id ~= nil and entry or nil
    end

    local state = readState(src)
    if not state then
        stateCache[src] = { at = now, shim = entry and entry.shim or nil }
        return nil
    end

    local shim = entry and entry.shim or { vrp = true, source = src }
    shim.id       = state.id
    shim.cid      = state.cid
    shim.key      = keyOf(state)
    shim.identity = state.identity

    stateCache[src] = {
        at       = now,
        id       = state.id,
        cid      = state.cid,
        identity = state.identity,
        shim     = shim,
    }
    return stateCache[src]
end

---Drop every cached answer for a source. Called on each lifecycle edge and exposed so
---bridge/server/player.forget can reach the same state through the facade.
---@param source number|string player server id
function impl.forget(source)
    local src = tonumber(source)
    if not src then return end
    stateCache[src] = nil
    groupCache[src] = nil
end

---The player's vRP account and character ids plus their vRP identity row.
---@param source number player server id
---@return { id: integer|nil, cid: integer|nil, identity: table|nil }|nil
function impl.state(source)
    local entry = entryFor(source)
    if not entry then return nil end
    return { id = entry.id, cid = entry.cid, identity = entry.identity }
end

---The stand-in bridge/server/player.get() returns on vRP.
---
---It carries no `PlayerData` and no `.job` on purpose: any call site missed in the audit reads nil
---and takes its existing "unsupported framework" branch instead of acting on a wrong value. It must
---never be nil for a loaded character, because a nil player object is the universal "not a loaded
---player" signal the whole server half treats as fatal-but-clean.
---@param source number player server id
---@return { vrp: boolean, id: integer|nil, cid: integer|nil, key: string|nil, identity: table|nil, source: number }|nil
function impl.player(source)
    local entry = entryFor(source)
    return entry and entry.shim or nil
end

---The player's sd-phone identifier, 'vrp:c<cid>' or 'vrp:u<user_id>' depending on IdentityScope.
---@param source number player server id
---@return string|nil
function impl.identifier(source)
    local entry = entryFor(source)
    return entry and entry.shim.key or nil
end

---The player's vRP identity row: firstname, name, phone, registration, age. Nil when the identity
---module is disabled on this install, which the phone renders as a blank name.
---@param source number player server id
---@return table|nil
function impl.identity(source)
    local entry = entryFor(source)
    return entry and entry.identity or nil
end

---The player's full character name. vRP's `firstname` is the given name and `name` is the family
---name, which reads backwards to anyone used to the qb and esx schemas.
---@param source number player server id
---@return string|nil
function impl.name(source)
    local identity = impl.identity(source)
    if not identity then return nil end

    local first = type(identity.firstname) == 'string' and identity.firstname or ''
    local last  = type(identity.name) == 'string' and identity.name or ''
    local full  = (first .. ' ' .. last):gsub('^%s+', ''):gsub('%s+$', '')
    return full ~= '' and full or nil
end

---Pick the "online map" builder once at module load. The adapter answers with character id ->
---source, which is already the answer in the character scope; the account scope has to resolve each
---source's user_id, and that goes through the state cache so a full sweep costs at most one adapter
---call per connected player.
---@return fun(raw: table): table<string, number>
local function chooseOnlineMap()
    if ACCOUNT_SCOPE then
        return function(raw)
            local out = {}
            for _, source in pairs(raw) do
                local src = tonumber(source)
                local entry = src and entryFor(src) or nil
                if entry and entry.id then out[sql.keyFor(entry.id)] = src end
            end
            return out
        end
    end

    return function(raw)
        local out = {}
        for cid, source in pairs(raw) do
            local id, src = tonumber(cid), tonumber(source)
            if id and src then out[sql.keyFor(id)] = src end
        end
        return out
    end
end

---@type fun(raw: table): table<string, number> Online map builder, bound once at load.
local onlineMap = chooseOnlineMap()

---Every ready character currently connected, as sd-phone identifier -> player source. Empty when
---the adapter cannot be reached, which callers already treat as "nobody is online" rather than as an
---error.
---@return table<string, number>
function impl.online()
    local raw = invoke('sdp_online')
    if type(raw) ~= 'table' then return {} end
    return onlineMap(raw)
end

---The vRP account behind an sd-phone money type, or nil when there is none. vRP has a wallet and a
---bank and nothing else, so black money resolves to nil and every caller degrades to 0/false exactly
---as it does on a framework with no black-money account.
---@param moneyType any
---@return 'wallet'|'bank'|nil
local function accountOf(moneyType)
    return ACCOUNTS[moneyType]
end

---The player's balance on one of vRP's two accounts. 0 for an unknown account, an unresolvable
---player, or a vRP install with the money module switched off.
---@param source number player server id
---@param moneyType string 'cash'|'money'|'wallet'|'bank'
---@return number
function impl.balance(source, moneyType)
    local account = accountOf(moneyType)
    if not account then return 0 end

    local op = account == 'bank' and 'getBank' or 'getWallet'
    return tonumber(invoke('sdp_money', source, op)) or 0
end

---Credit one of vRP's two accounts. False when the account is unknown, the amount is not a positive
---whole number, or the adapter declined.
---@param source number player server id
---@param moneyType string
---@param amount number
---@return boolean added
function impl.addMoney(source, moneyType, amount)
    local account = accountOf(moneyType)
    if not account then return false end

    local n = math.floor(tonumber(amount) or 0)
    if n <= 0 then return false end

    local op = account == 'bank' and 'addBank' or 'addWallet'
    return invoke('sdp_money', source, op, n) == true
end

---Debit one of vRP's two accounts. True only when the full amount left the account: the adapter
---checks the balance and writes it inside vRP's own state, so there is no window between the two and
---no partial debit is possible.
---@param source number player server id
---@param moneyType string
---@param amount number
---@return boolean removed
function impl.removeMoney(source, moneyType, amount)
    local account = accountOf(moneyType)
    if not account then return false end

    local n = math.floor(tonumber(amount) or 0)
    if n <= 0 then return false end

    local op = account == 'bank' and 'tryBank' or 'tryWallet'
    return invoke('sdp_money', source, op, n) == true
end

---Credit an OFFLINE character's bank balance. Always false on vRP 2, and not for want of trying:
---money lives inside the character's cdata, which the live save tick rewrites as one msgpack blob,
---so a direct SQL write does not merely get lost - it races that rewrite and can destroy money. The
---caller refunds the sender and the phone says the recipient must be online.
---@param key string sd-phone identifier of the recipient
---@param amount number
---@return boolean credited Always false.
function impl.addOfflineBank(key, amount)
    return false
end

---The compiled translator for one half of configs/vrp.lua. Exposed so the facade above can reuse it
---rather than compiling the same config a second time and printing the same warnings twice.
---@param kind? 'job'|'gang' Default 'job'.
---@return table
function impl.compiled(kind)
    return kind == 'gang' and gangsConfig or jobsConfig
end

---The cached group entry for a source, refreshing it when the entry has aged out. The permission
---memo shares the entry's lifetime, so a boss check answered during one window can never be served
---after the group change that invalidated it.
---@param source number|string player server id
---@return table|nil entry
local function groupEntryFor(source)
    local src = tonumber(source)
    if not src then return nil end

    local now = timer()
    local entry = groupCache[src]
    if entry and (now - entry.at) < GROUP_TTL then return entry end

    local raw = invoke('sdp_groups', src)
    local set = type(raw) == 'table' and raw or {}

    entry = { at = now, set = set, perms = {} }
    entry.state = {
        -- vRP 2 exposes no per-gtype active group through the adapter, so the translator resolves
        -- the job by scanning the membership set instead. That is the same fallback it uses on
        -- vRP 1 when the active group is one nobody mapped.
        groups        = set,
        active        = nil,
        hasPermission = function(perm)
            local memo = entry.perms[perm]
            if memo ~= nil then return memo end
            local granted = invoke('sdp_perm', src, perm) == true
            entry.perms[perm] = granted
            return granted
        end,
    }

    groupCache[src] = entry
    return entry
end

---The player's vRP groups as a set. Read-only by contract: the returned table is the cached one, so
---a caller that mutates it corrupts every job answer until the entry ages out.
---@param source number player server id
---@return table<string, boolean>
function impl.groups(source)
    local entry = groupEntryFor(source)
    return entry and entry.set or {}
end

---The state table bridge/server/vrp/groups.lua takes. One state serves both the job and the gang
---translator, because on vRP 2 neither has an active-group hint to disagree about.
---@param source number player server id
---@return { groups: table<string, boolean>, active: string|nil, hasPermission: fun(perm: string): boolean }
function impl.groupState(source)
    local entry = groupEntryFor(source)
    if not entry then return { groups = {}, active = nil, hasPermission = function() return false end } end
    return entry.state
end

---True when the player holds `perm`. Function permissions (the "!name.arg" form) always answer
---false: the adapter refuses them because several stock vRP permission functions block on a round
---trip to the client, which a cross-resource export invocation cannot do.
---@param source number player server id
---@param perm string plain permission
---@return boolean
function impl.hasPermission(source, perm)
    if not groups.isPlainPermission(perm) then return false end
    local entry = groupEntryFor(source)
    return entry ~= nil and entry.state.hasPermission(perm)
end

---Add or remove a vRP group on the player. The cache is dropped immediately rather than waiting for
---the relay, so a caller that reads the job back on the next line sees the write it just made even
---if the relay is not running.
---@param source number player server id
---@param group string vRP group name
---@param add boolean
---@return boolean applied
function impl.setGroup(source, group, add)
    if type(group) ~= 'string' or group == '' then return false end

    local applied = invoke('sdp_setGroup', source, group, add == true) == true

    local src = tonumber(source)
    if src then groupCache[src] = nil end
    return applied
end

---The player's current job name, or nil when no configured job matches their groups. Nil fails
---closed: every job-gated app in the phone stays hidden rather than opening on a guess.
---@param source number player server id
---@param kind? 'job'|'gang' Default 'job'.
---@return string|nil
function impl.jobName(source, kind)
    return groups.jobName(impl.compiled(kind), impl.groupState(source))
end

---The player's grade in their current job. 0 both for grade zero and for no job, exactly as the ESX
---path answers.
---@param source number player server id
---@param kind? 'job'|'gang' Default 'job'.
---@return integer
function impl.jobGrade(source, kind)
    return groups.grade(impl.compiled(kind), impl.groupState(source))
end

---Every configured job whose groups the player holds, mapped to its grade. Real data on vRP, since
---membership is a set, but reporting only: job.supportsMultijob() stays false because switching job
---on vRP means granting a live permission group.
---@param source number player server id
---@param kind? 'job'|'gang' Default 'job'.
---@return table<string, integer>
function impl.jobAll(source, kind)
    return groups.getAll(impl.compiled(kind), impl.groupState(source))
end

---True when the player is on `jobName` and a boss of it. With neither bossGroups nor bossPermission
---configured this degrades to grade >= esxBossGrade, the threshold the caller already passes, so an
---unconfigured vRP server gates company management exactly like ESX.
---@param source number player server id
---@param jobName string
---@param esxBossGrade? integer Default 0.
---@param kind? 'job'|'gang' Default 'job'.
---@return boolean
function impl.isBoss(source, jobName, esxBossGrade, kind)
    return groups.isBoss(impl.compiled(kind), impl.groupState(source), jobName, esxBossGrade)
end

---The player's on-duty state, or nil when their job has no duty model configured. Nil is meaningful
---and is the default: callers read it as "use the phone's own stored duty preference", which is what
---they already do on ESX.
---@param source number player server id
---@param jobName? string When given, duty is only reported for that job.
---@param kind? 'job'|'gang' Default 'job'.
---@return boolean|nil
function impl.getDuty(source, jobName, kind)
    return groups.getDuty(impl.compiled(kind), impl.groupState(source), jobName)
end

---Drive the player's on-duty state by toggling their configured duty group. False when the job has
---no dutyGroup, because duty is then unwritable and reporting success would leave the UI showing a
---state vRP never took.
---@param source number player server id
---@param jobName string
---@param onDuty boolean
---@param kind? 'job'|'gang' Default 'job'.
---@return boolean applied
function impl.setDuty(source, jobName, onDuty, kind)
    local group = groups.dutyGroup(impl.compiled(kind), jobName)
    if not group then return false end
    return impl.setGroup(source, group, onDuty == true)
end

---Move an online player to `jobName` at `grade`.
---
---vRP has no job field, so a mapped job is a single group add and vRP's own gtype exclusivity evicts
---the previous rank - which is why every group in configs/vrp.lua must carry _config.gtype.
---An UNMAPPED job is treated as a REVOKE rather than as an error: society.fire() arrives here with
---configs/services.lua's 'unemployed', which no vRP server has a group for, and reporting a failed
---fire while leaving the employee's police_chief group attached would be a privilege leak. Revoking
---is the only safe failure direction.
---@param source number player server id
---@param jobName string
---@param grade? number Default 0. Indexes the entry's rank list, so grade 1 is the second group.
---@param kind? 'job'|'gang' Default 'job'.
---@return boolean
function impl.setJob(source, jobName, grade, kind)
    local plan = groups.setJobPlan(impl.compiled(kind), impl.groupState(source), jobName, grade)
    if not plan.ok then return false end

    -- Revokes run first: an add whose gtype evicts the old rank must not then be undone by a remove
    -- that was planned against the pre-add membership set.
    local applied = true
    for i = 1, #plan.remove do
        if not impl.setGroup(source, plan.remove[i], false) then applied = false end
    end
    if plan.add and not impl.setGroup(source, plan.add, true) then applied = false end

    return applied
end

---Give the player `count` of an item. The adapter suppresses vRP's own notification, which is on by
---default and would otherwise pop a vRP GUI toast over the phone's own feedback on every SIM card
---and every item grant the phone makes.
---@param source number player server id
---@param item string vRP item id
---@param count? number Default 1.
---@return boolean added
function impl.addItem(source, item, count)
    return invoke('sdp_item', source, 'add', item, math.floor(tonumber(count) or 1)) == true
end

---Take `count` of an item from the player. True only when the full amount was removed.
---@param source number player server id
---@param item string vRP item id
---@param count? number Default 1.
---@return boolean removed
function impl.removeItem(source, item, count)
    return invoke('sdp_item', source, 'remove', item, math.floor(tonumber(count) or 1)) == true
end

---How many of an item the player is carrying. 0 when the inventory module is disabled.
---@param source number player server id
---@param item string vRP item id
---@return number
function impl.itemCount(source, item)
    return tonumber(invoke('sdp_item', source, 'count', item)) or 0
end

---An item's display name from vRP's own item registry, or nil when it is undefined there.
---@param item string vRP item id
---@return string|nil
function impl.itemLabel(item)
    -- Source 0: the label op reads vRP's item registry and never touches a user, so there is no
    -- player to name here and the adapter answers it before it resolves one.
    local label = invoke('sdp_item', 0, 'label', item)
    return type(label) == 'string' and label ~= '' and label or nil
end

---True when the player has room for `count` of an item, by vRP's weight model. vRP has no slots, so
---this is purely a weight comparison and no slot argument is honoured.
---@param source number player server id
---@param item string vRP item id
---@param count? number Default 1.
---@return boolean
function impl.canCarry(source, item, count)
    return invoke('sdp_item', source, 'canCarry', item, math.floor(tonumber(count) or 1)) == true
end

---Push every queued usable item into vRP.
---
---Public because bridge/server/vrp/inject.lua calls it on the handshake's ready edge, which is the
---only moment this can first succeed. Re-applying an already defined item is deliberate and safe:
---the adapter mutates an existing definition's menu_builder rather than replacing the record, so a
---flush after a re-injection costs nothing and repairs the builder the previous chunk installed.
---@return integer applied number of items vRP accepted
function impl.flushUsable()
    local applied = 0
    for i = 1, #usableItems do
        if invoke('sdp_defineUsable', usableItems[i]) == true then applied = applied + 1 end
    end
    return applied
end

---Make an item usable from vRP's inventory menu, calling `cb` when a player uses it.
---
---Registration is QUEUED rather than applied: bridge/server/inventory.registerUsable is bound at
---module load and both of its call sites fire at file scope during resource start, long before the
---injection handshake has produced a working adapter. The queue is flushed here only once some
---primitive has proven the adapter is reachable, and otherwise by inject.lua on the ready edge -
---attempting it blind at boot would make the proxy fallback warn about being called outside a
---coroutine on every single start.
---@param item string vRP item id
---@param cb fun(source: number, item?: any, inv?: table, slot?: any, data?: any)
function impl.registerUsable(item, cb)
    if type(item) ~= 'string' or item == '' or type(cb) ~= 'function' then return end

    if not usableHandlers[item] then usableItems[#usableItems + 1] = item end
    usableHandlers[item] = cb

    if transport then impl.flushUsable() end
end

---Prime the money snapshot for a source from the adapter's live balances.
---
---Priming on the load edge rather than on the first money event is what makes the FIRST external
---change of a session loggable: with no snapshot the diff has nothing to subtract from, so that
---change would have to be swallowed to avoid reporting the whole balance as a credit.
---@param source number player server id
local function primeMoney(source)
    local wallet = tonumber(invoke('sdp_money', source, 'getWallet'))
    local bank   = tonumber(invoke('sdp_money', source, 'getBank'))

    -- A snapshot is only meaningful when both reads actually answered. Defaulting a missing answer to
    -- zero would be indistinguishable from a genuinely empty account, and the next relayed change
    -- would then diff against zero and report the player's ENTIRE balance as a credit, writing a
    -- phantom row into the Wallet log. Leaving the snapshot absent is already handled: the money
    -- handler primes on a miss and swallows that first event.
    if wallet == nil or bank == nil then
        snapshots[source] = nil
        return
    end

    snapshots[source] = { wallet = math.floor(wallet), bank = math.floor(bank) }
end

---Turn vRP's absolute money event into the signed, per-account delta the rest of the resource reads.
---
---This is one half of a three-part contract, and the halves must not be merged. Here: diff the
---absolute balances against the per-source snapshot, emit one OUT_MONEY per account that actually
---moved, and nudge the client so an open Wallet re-reads its balance. In server/banking/init.lua:
---filter to the bank account, filter to a real add or remove, and call bank.consumeExpected before
---logging, which is what stops a phone-initiated transfer from being written to the Wallet log twice
---(once as the rich phone row, once as a generic Bank Credit). consumeExpected is deliberately NOT
---called here: the registration it consumes is single use, so consuming it in this handler would
---leave the logger with nothing to match and reinstate the double row it exists to prevent.
---
---vRP fires playerMoneyUpdate synchronously inside setWallet/setBank, so a phone-initiated write is
---diffed while impl.addMoney is still on the stack - after bridge/server/banking.lua registered its
---expectation, which is the ordering consumeExpected depends on.
---@param source number player server id
---@param wallet number absolute wallet balance after the change
---@param bank number absolute bank balance after the change
local function onMoney(source, wallet, bank)
    local src = tonumber(source)
    if not src then return end

    local latest = { wallet = math.floor(tonumber(wallet) or 0), bank = math.floor(tonumber(bank) or 0) }
    local was = snapshots[src]
    snapshots[src] = latest
    if not was then return end

    local dWallet = latest.wallet - was.wallet
    local dBank   = latest.bank - was.bank
    if dWallet == 0 and dBank == 0 then return end

    if dWallet ~= 0 then TriggerEvent(OUT_MONEY, src, 'wallet', dWallet) end
    if dBank ~= 0 then TriggerEvent(OUT_MONEY, src, 'bank', dBank) end
    TriggerClientEvent(OUT_CLIENT_MONEY, src)
end

---Push the player's resolved job and grade to their own client. vRP has no client data API and
---sd-phone deliberately does no client RPC, so this push is the only thing that ever refreshes the
---client job cache: without it every job-gated screen on the client would read the job it saw at
---login for the rest of the session.
---@param source number player server id
local function pushJobState(source)
    local resolved = groups.resolve(jobsConfig, impl.groupState(source))
    TriggerClientEvent(OUT_CLIENT_JOB, source, resolved.job, resolved.grade)
end

-- The relay subscriptions. They are registered while bridge/server/player.lua is still being
-- required (player -> core -> here), so they always precede bridge/server/lifecycle.lua's handler
-- for the same events: this module's caches are therefore empty before any lifecycle subscriber
-- runs, which is what makes vRP 2's mid-session character switch safe. The switch keeps the same
-- source while replacing the character behind it, so a stale entry would serve the previous
-- character's identity to everything that reacts to the edge.

subscribe(EV_CHARACTER_LOAD, function(source)
    local src = tonumber(source)
    if not src then return end
    impl.forget(src)
    primeMoney(src)
    pushJobState(src)
end)

subscribe(EV_CHARACTER_UNLOAD, function(source)
    local src = tonumber(source)
    if not src then return end
    impl.forget(src)
    snapshots[src] = nil
end)

subscribe(EV_PLAYER_LEAVE, function(source)
    local src = tonumber(source)
    if not src then return end
    impl.forget(src)
    snapshots[src] = nil
    stateCache[src] = nil
end)

subscribe(EV_MONEY, onMoney)

subscribe(EV_GROUP, function(source)
    local src = tonumber(source)
    if not src then return end
    -- vRP triggers this AFTER the membership map was mutated, so the re-read below sees the new set.
    groupCache[src] = nil
    pushJobState(src)
end)

subscribe(EV_USE_ITEM, function(source, item)
    local handler = usableHandlers[item]
    if not handler then return end

    local ok, err = pcall(handler, tonumber(source), item)
    if not ok then
        print(('^1[sd-phone:vrp]^0 usable item %s handler error: %s'):format(tostring(item), err))
    end
end)

return impl
