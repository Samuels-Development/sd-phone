---@type table Framework detection (bridge.shared.framework): name + live core handle. Required
---unconditionally because every bridge module already requires it, so it adds nothing to a boot.
local framework = require 'bridge.shared.framework'

---@type table vRP lineage + adapter config (bridge.shared.vrp_version), the sole owner of
---configs/vrp.lua. Safe on every framework: it only probes files on disk and loads that config
---through a pcall, so requiring it can never take a QBox, QBCore or ESX boot down.
local ver = require 'bridge.shared.vrp_version'

---@type boolean Whether a real implementation may be bound. Callers are expected to gate their own
---require of this module on framework.name == 'vrp', but the flag is checked here as well: a module
---under bridge/server/vrp/ must never raise at load time on a server that has no vRP, and binding
---the degraded surface below is what guarantees that even if some future caller forgets the gate.
local ACTIVE = framework.name == 'vrp' and ver.present == true

---@type 1|2 vRP lineage. Falls back to 2 exactly as vrp_version's unknown-fork branch does, so this
---module still binds something coherent under a plain-Lua test harness where nothing was detected.
local MAJOR = ver.major == 1 and 1 or 2

---@type table<string, boolean> Capability map reported on vRP 1. There is no capability probe on
---that lineage - it publishes its whole function table and nothing announces which modules an admin
---switched off - so every capability is assumed present and each primitive degrades on its own.
local ALL_CAPS = { money = true, group = true, identity = true, inventory = true }

---@type table<string, boolean> Shared empty capability map, handed out while nothing is bound.
---Never mutated.
local NO_CAPS = {}

---@type table<string, string> Relay event names carrying vRP's lifecycle out of its own state. The
---two character edges fire on BOTH lineages (impl_v1 raises them from vRP 1's own events, impl_v2
---from the injected adapter), so bridge/server/lifecycle.lua can subscribe to them without knowing
---the version. The other three are vRP 2 only: vRP 1 emits no money signal, no group signal and no
---usable-item signal at all.
local EVENTS = {
    characterLoad   = 'sd-phone:vrp:characterLoad',
    characterUnload = 'sd-phone:vrp:characterUnload',
    playerLeave     = 'sd-phone:vrp:playerLeave',
    money           = 'sd-phone:vrp:money',
    group           = 'sd-phone:vrp:group',
    useItem         = 'sd-phone:vrp:useItem',
}

---@type table Core module; the table returned at end of file. The ONLY vRP module the rest of the
---bridge is allowed to know about: it binds impl_v1 or impl_v2 once at load and republishes them
---under one stable set of names, so no bridge module ever learns that vRP has two lineages, that one
---of them is reached over a Proxy and the other over injected exports, or that some answers come
---from vRP's own schema rather than from vRP itself.
local core = {}

---The degraded primitive set, used when no vRP was detected.
---
---It exists so every public function below can be an unconditional one-line call instead of carrying
---a "is vRP here" branch, and so that requiring this module on a non-vRP server is inert rather than
---fatal. Every value matches what the ESX path of the calling bridge module already returns, which is
---the shape all ~294 call sites are written against.
---@return table ops
local function nullOps()
    local function no() return false end
    local function none() return nil end
    local function zero() return 0 end
    local function empty() return {} end

    return {
        ready = no,
        caps  = function() return NO_CAPS end,

        forget     = function() end,
        player     = none,
        identifier = none,
        identity   = none,
        name       = none,
        sourceFor  = none,
        online     = empty,
        keyFor     = none,
        idFor      = none,

        job           = none,
        grade         = zero,
        allJobs       = empty,
        isBoss        = no,
        getDuty       = none,
        setDuty       = no,
        setJob        = no,
        jobLabel      = none,
        gradeLabel    = none,
        grades        = empty,
        groups        = empty,
        hasPermission = no,
        setGroup      = no,

        balance        = zero,
        addMoney       = no,
        removeMoney    = no,
        addOfflineBank = no,

        addItem        = no,
        removeItem     = no,
        itemCount      = zero,
        itemLabel      = none,
        canCarry       = no,
        registerUsable = no,

        offlineIdentity     = none,
        offlineIdentities   = empty,
        offlineNames        = empty,
        searchIdentities    = function() return {}, 0 end,
        groupMembers        = none,
        forgetRosters       = function() end,
        ensureSearchIndexes = no,
    }
end

---Normalise one vRP identity row into the single shape the bridge hands upward.
---
---The two implementations disagree at the source: impl_v1 already renames vRP's `name` column to
---`lastname`, while impl_v2 passes the adapter's payload through with vRP's own column names. That
---disagreement must not reach a caller, because `name` reads as "the whole name" to anyone used to
---the qb and esx schemas when it is actually the family name.
---@param raw table|nil identity row as the implementation answered it
---@return table|nil identity { firstname, lastname, phone, registration, age }
local function normaliseIdentity(raw)
    if type(raw) ~= 'table' then return nil end
    return {
        firstname    = tostring(raw.firstname or ''),
        lastname     = tostring(raw.lastname or raw.name or ''),
        phone        = tostring(raw.phone or ''),
        registration = tostring(raw.registration or ''),
        age          = tonumber(raw.age) or 0,
    }
end

---The vRP 1 primitive set, renamed to the facade's vocabulary.
---
---vRP 1 needs no readiness gate: its whole API is published on one Proxy interface that answers from
---the moment vrp starts, so there is no handshake to wait for and `ready` is a constant true.
---@param impl table bridge.server.vrp.impl_v1
---@return table ops
local function v1Ops(impl)
    return {
        ready = function() return true end,
        caps  = function() return ALL_CAPS end,

        forget     = impl.forget,
        player     = impl.state,
        identifier = impl.key,
        identity   = function(source) return normaliseIdentity(impl.identity(source)) end,
        name       = impl.name,
        sourceFor  = impl.sourceFor,
        online     = impl.online,

        job           = impl.getJob,
        grade         = impl.getGrade,
        allJobs       = impl.getAllJobs,
        isBoss        = impl.isBoss,
        getDuty       = impl.getDuty,
        setDuty       = impl.setDuty,
        setJob        = impl.setJob,
        jobLabel      = impl.jobLabel,
        gradeLabel    = impl.gradeLabel,
        grades        = impl.grades,
        groups        = impl.groupSet,
        hasPermission = impl.hasPermission,
        setGroup      = impl.setGroup,

        balance     = impl.balance,
        addMoney    = impl.addMoney,
        removeMoney = impl.removeMoney,

        addItem        = impl.addItem,
        removeItem     = impl.removeItem,
        itemCount      = impl.itemCount,
        itemLabel      = impl.itemLabel,
        canCarry       = impl.canCarry,
        registerUsable = impl.registerUsable,
    }
end

---The vRP 2 primitive set, renamed to the facade's vocabulary.
---
---Three things differ from vRP 1 beyond the names. Readiness is real here, because every primitive
---travels to a chunk injected into vRP's Lua state and that injection is an asynchronous handshake.
---The label helpers have no implementation-side equivalent, so they are composed here from the
---translator and the implementation's compiled config rather than compiling configs/vrp.lua a second
---time and printing every warning twice. And `sourceFor` is a lookup in the online map, since the
---adapter answers with the whole map in one call and vRP 2 has no cid-to-source primitive of its own.
---@param impl table bridge.server.vrp.impl_v2
---@param groups table bridge.server.vrp.groups
---@param inject table bridge.server.vrp.inject
---@return table ops
local function v2Ops(impl, groups, inject)
    -- Hand the implementation what the handshake proved instead of letting it rediscover the same
    -- answer: an unpinned module that has to fall back pays a bounded proxy timeout on its first
    -- call. The hook also runs on every later flush, which is why it must stay idempotent - vrp/ext
    -- is re-executed on every sd-phone start and drops whatever the previous chunk installed.
    inject.onReady(function()
        impl.setTransport(inject.viaProxy() and 'proxy' or 'export')
        impl.flushUsable()
    end)

    return {
        ready = inject.ready,
        caps  = inject.caps,

        forget     = impl.forget,
        player     = impl.player,
        identifier = impl.identifier,
        identity   = function(source) return normaliseIdentity(impl.identity(source)) end,
        name       = impl.name,
        sourceFor  = function(key) return impl.online()[key] end,
        online     = impl.online,

        job           = impl.jobName,
        grade         = impl.jobGrade,
        allJobs       = impl.jobAll,
        isBoss        = impl.isBoss,
        getDuty       = impl.getDuty,
        setDuty       = impl.setDuty,
        setJob        = impl.setJob,
        jobLabel      = function(jobName, kind) return groups.label(impl.compiled(kind), jobName) end,
        gradeLabel    = function(jobName, grade, kind)
            return groups.gradeLabel(impl.compiled(kind), jobName, grade)
        end,
        grades        = function(jobName, kind) return groups.grades(impl.compiled(kind), jobName) end,
        groups        = impl.groups,
        hasPermission = impl.hasPermission,
        setGroup      = impl.setGroup,

        balance     = impl.balance,
        addMoney    = impl.addMoney,
        removeMoney = impl.removeMoney,

        addItem    = impl.addItem,
        removeItem = impl.removeItem,
        itemCount  = impl.itemCount,
        itemLabel  = impl.itemLabel,
        canCarry   = impl.canCarry,
        -- Registration is deliberately NOT routed through inject.queueUsable as well: impl_v2 already
        -- subscribes to the use relay, so queueing in both places would invoke the app's callback
        -- twice for one use. True means "accepted", not "vRP applied it" - the queue is flushed on
        -- the handshake's ready edge and again after every re-injection.
        registerUsable = function(item, cb)
            impl.registerUsable(item, cb)
            return true
        end,
    }
end

---Bind the whole vRP primitive set exactly once, at module load.
---
---This is the house chooseX() pattern one level up, as the design requires: rather than each function
---branching on the lineage per call, the entire surface is chosen here and every public function
---below is a straight call into the bound table. The two implementations are required from inside
---this function rather than at file scope so that the degraded branch pulls in neither of them, and
---so that nothing under bridge/server/vrp/ can ever be dragged onto a non-vRP boot.
---@return table ops
local function chooseOps()
    if not ACTIVE then return nullOps() end

    ---@type table Direct reads of vRP's schema (bridge.server.vrp.sql). Lineage-aware internally, so
    ---the offline half of the facade needs no branch of its own.
    local sql = require 'bridge.server.vrp.sql'

    local ops
    if MAJOR == 1 then
        ops = v1Ops(require 'bridge.server.vrp.impl_v1')
    else
        ops = v2Ops(
            require 'bridge.server.vrp.impl_v2',
            require 'bridge.server.vrp.groups',
            require 'bridge.server.vrp.inject'
        )
    end

    ops.keyFor = sql.keyFor
    ops.idFor  = sql.idFor

    ops.offlineIdentity     = sql.identity
    ops.offlineIdentities   = sql.identities
    ops.offlineNames        = sql.names
    ops.searchIdentities    = sql.searchIdentities
    ops.groupMembers        = sql.groupMembers
    ops.forgetRosters       = sql.forgetRosters
    ops.ensureSearchIndexes = sql.ensureSearchIndexes

    -- The offline bank credit is a lineage decision sql.lua already made: vRP 1 has a real money
    -- table whose save tick only writes connected users, while vRP 2 keeps money inside a msgpack
    -- blob that tick rewrites wholesale, so there it refuses outright rather than racing the server.
    ops.addOfflineBank = sql.addOfflineBank

    return ops
end

---@type table The bound primitive set. Every public function below reads from it and nothing else.
local ops = chooseOps()

---True when a vRP implementation is bound. False on every other framework, where the whole surface
---answers the degraded nil/0/false/{} instead.
---@return boolean
function core.active()
    return ACTIVE
end

---Which vRP lineage this server runs, or nil when it is not a vRP server at all.
---@return 1|2|nil
function core.major()
    return ACTIVE and MAJOR or nil
end

---True once vRP can actually answer. Always true on vRP 1, where the Proxy is live from the moment
---vrp starts; on vRP 2 it is false until the injection handshake has bound a transport. Callers do
---not need to check it before making a call - every primitive already degrades - but a feature that
---would otherwise round trip only to be told "nothing yet" can skip the work.
---@return boolean
function core.ready()
    return ops.ready()
end

---Which vRP modules are live, as `{ money, group, identity, inventory }`. Read-only: this is the
---live map, not a copy. Every capability reads true on vRP 1, which has no probe to answer with.
---@return table<string, boolean>
function core.caps()
    return ops.caps()
end

---The relay event names vRP's lifecycle arrives on. Read-only. `characterLoad` and `characterUnload`
---fire on both lineages; the rest are vRP 2 only.
---@return table<string, string>
function core.events()
    return EVENTS
end

---Drop every cached answer for a source. Must be called on both character edges: vRP 2 re-keys a
---player mid-session with no reconnect, so the same source can carry a different character and a
---stale entry would serve the previous one's identity.
---@param source number player server id
function core.forget(source)
    ops.forget(source)
end

---The stand-in bridge/server/player.get() returns on vRP: `{ vrp, id, cid, key, identity, source }`.
---
---It carries no `PlayerData` and no `.job` on purpose, so any call site missed in the audit reads nil
---there and takes its existing "unsupported framework" branch instead of acting on a wrong value. Nil
---only when the source has no loaded character, which is the universal "not a player" signal.
---@param source number player server id
---@return table|nil
function core.player(source)
    return ops.player(source)
end

---The player's sd-phone identifier: `vrp:u<user_id>` on vRP 1 and in the account scope, `vrp:c<cid>`
---on vRP 2 in the default character scope. Nil when the source has no loaded character.
---@param source number player server id
---@return string|nil
function core.identifier(source)
    return ops.identifier(source)
end

---The player's vRP identity row, normalised to one shape across both lineages. Nil when the identity
---module is switched off on this install, which the phone renders as a blank name.
---@param source number player server id
---@return { firstname: string, lastname: string, phone: string, registration: string, age: integer }|nil
function core.identity(source)
    return ops.identity(source)
end

---The player's display name, 'First Last'. Nil when their identity row cannot be read or is blank,
---so the caller applies its own placeholder rather than rendering a stray space.
---@param source number player server id
---@return string|nil
function core.name(source)
    return ops.name(source)
end

---The source currently holding an sd-phone identifier, or nil when that character is offline. A key
---from the other lineage's key space is rejected rather than reinterpreted.
---@param key string sd-phone identifier
---@return number|nil source
function core.sourceFor(key)
    return ops.sourceFor(key)
end

---Every loaded character currently connected, as `{ [identifier] = source }`. Empty rather than nil
---when vRP cannot be reached, which callers already read as "nobody is online".
---@return table<string, number>
function core.online()
    return ops.online()
end

---The sd-phone identifier for a raw vRP id, in this server's key space. The one place that decides
---the key format, shared with every offline read, so an online key can never drift from an offline
---one for the same character.
---@param id integer|string user_id on vRP 1 and in the account scope, cid on vRP 2
---@return string|nil
function core.keyFor(id)
    return ops.keyFor(id)
end

---The raw vRP id inside an sd-phone identifier, or nil when the key belongs to another key space.
---@param key string|nil sd-phone identifier
---@return integer|nil
function core.idFor(key)
    return ops.idFor(key)
end

---The player's current job name, or nil when no configured job matches their vRP groups. Nil fails
---closed: every job-gated app stays hidden rather than opening on a guess.
---@param source number player server id
---@param kind? 'job'|'gang' Which half of configs/vrp.lua to resolve against. Default 'job'.
---@return string|nil
function core.getJob(source, kind)
    return ops.job(source, kind)
end

---The player's grade in their current job. 0 both for grade zero and for no job, exactly as the ESX
---path answers, because every caller pairs it with the job name.
---@param source number player server id
---@param kind? 'job'|'gang' Default 'job'.
---@return integer
function core.getGrade(source, kind)
    return ops.grade(source, kind)
end

---Every configured job whose groups the player holds, mapped to its grade. Real data on vRP, since
---group membership is a set, but reporting only - see core.supportsMultijob.
---@param source number player server id
---@param kind? 'job'|'gang' Default 'job'.
---@return table<string, integer> jobName -> grade
function core.getAllJobs(source, kind)
    return ops.allJobs(source, kind)
end

---True when the player is on `jobName` at grade >= `minGrade`. The ACTIVE job only, matching the
---qb and esx paths, even though vRP could report several at once: a job gate must mean "this is what
---they are doing", not "this is something they could do".
---@param source number player server id
---@param jobName string
---@param minGrade? integer Default 0.
---@param kind? 'job'|'gang' Default 'job'.
---@return boolean
function core.hasJob(source, jobName, minGrade, kind)
    if type(jobName) ~= 'string' or jobName == '' then return false end
    if ops.job(source, kind) ~= jobName then return false end
    return ops.grade(source, kind) >= (tonumber(minGrade) or 0)
end

---True if the player matches any `{ name = ..., minGrade = ? }` entry. An empty list returns true,
---which is the "ungated" contract job.hasAny and gang.hasAny already have on every framework.
---@param source number player server id
---@param options { name: string, minGrade?: integer }[]
---@param kind? 'job'|'gang' Default 'job'.
---@return boolean
function core.hasAnyJob(source, options, kind)
    if type(options) ~= 'table' or #options == 0 then return true end
    for i = 1, #options do
        local option = options[i]
        if type(option) == 'table' and core.hasJob(source, option.name, option.minGrade, kind) then
            return true
        end
    end
    return false
end

---True when the player is on `jobName` and a boss of it. With neither bossGroups nor bossPermission
---configured this degrades to grade >= esxBossGrade, the threshold the caller already passes from
---configs/services.lua, so an unconfigured vRP server gates company management exactly like ESX.
---@param source number player server id
---@param jobName string
---@param esxBossGrade? integer Default 0.
---@param kind? 'job'|'gang' Default 'job'.
---@return boolean
function core.isBoss(source, jobName, esxBossGrade, kind)
    return ops.isBoss(source, jobName, esxBossGrade, kind)
end

---The player's on-duty state, or nil when their job has no duty model configured. Nil is the default
---and it is meaningful: vRP has no duty flag, and callers already read nil as "use the phone's own
---stored duty preference", exactly as they do on ESX.
---@param source number player server id
---@param jobName? string When given, duty is only reported for that job.
---@param kind? 'job'|'gang' Default 'job'.
---@return boolean|nil
function core.getDuty(source, jobName, kind)
    return ops.getDuty(source, jobName, kind)
end

---Drive the player's on-duty state by toggling the job's configured duty group. False when the job
---has no dutyGroup, because duty is then unwritable and reporting success would leave the UI showing
---a state vRP never took.
---@param source number player server id
---@param jobName string
---@param onDuty boolean
---@param kind? 'job'|'gang' Default 'job'.
---@return boolean applied
function core.setDuty(source, jobName, onDuty, kind)
    return ops.setDuty(source, jobName, onDuty, kind)
end

---Move an online player to `jobName` at `grade`.
---
---An UNMAPPED job is a REVOKE, not an error: society.fire() arrives here with configs/services.lua's
---'unemployed', which no vRP server has a group for, and reporting a failed fire while leaving the
---employee's rank group attached would be a privilege leak.
---@param source number player server id
---@param jobName string
---@param grade? number Default 0. Indexes the entry's rank list, so grade 1 is the second group.
---@param kind? 'job'|'gang' Default 'job'.
---@return boolean
function core.setJob(source, jobName, grade, kind)
    return ops.setJob(source, jobName, grade, kind)
end

---A job's display label, from configs/vrp.lua. vRP has no label of its own to read.
---@param jobName string
---@param kind? 'job'|'gang' Default 'job'.
---@return string|nil
function core.jobLabel(jobName, kind)
    return ops.jobLabel(jobName, kind)
end

---A single grade's label, e.g. 'Sergeant' for police grade 1.
---@param jobName string
---@param grade? number Default 0.
---@param kind? 'job'|'gang' Default 'job'.
---@return string|nil
function core.gradeLabel(jobName, grade, kind)
    return ops.gradeLabel(jobName, grade, kind)
end

---Every grade of a job in society.getGrades' shape. vRP has no grade table, so the configured rank
---list IS the grade list.
---@param jobName string
---@param kind? 'job'|'gang' Default 'job'.
---@return { level: integer, label: string }[]
function core.grades(jobName, kind)
    return ops.grades(jobName, kind)
end

---False, always, and deliberately. getAllJobs could populate the Jobs tab, but that tab lets a
---player SWITCH active job, and on vRP a switch is a live permission grant rather than a saved-job
---pointer - letting someone self-grant police_chief because it appeared in their list is privilege
---escalation. Every caller already handles false cleanly.
---@return boolean
function core.supportsMultijob()
    return false
end

---The player's raw vRP group membership set. Read-only by contract: implementations return their own
---cached table, so a caller that mutates it corrupts every job answer until the cache ages out.
---@param source number player server id
---@return table<string, boolean>
function core.groups(source)
    return ops.groups(source)
end

---True when the player holds `perm`. The "!name.arg" function-permission form always answers false:
---vRP dispatches those to registered permission functions and several stock ones block on a round
---trip to the client, which nothing on this path is allowed to do.
---@param source number player server id
---@param perm string plain permission, never the "!" form
---@return boolean
function core.hasPermission(source, perm)
    return ops.hasPermission(source, perm)
end

---Add or remove one vRP group on the player. Exposed because a group is vRP's only unit of
---authority, so anything the job helpers cannot express has to be expressible here.
---@param source number player server id
---@param group string vRP group name
---@param add boolean true to join, false to leave
---@return boolean applied
function core.setGroup(source, group, add)
    return ops.setGroup(source, group, add)
end

---The player's balance on one of vRP's two accounts. 0 for an account vRP does not have - black
---money above all - which is the shape the ESX path already degrades to.
---@param source number player server id
---@param moneyType string 'cash'|'money'|'wallet'|'bank'
---@return number
function core.balance(source, moneyType)
    return ops.balance(source, moneyType)
end

---Credit one of vRP's two accounts. False when the account is unknown, the amount is not a positive
---whole number, or the player could not be resolved.
---@param source number player server id
---@param moneyType string 'cash'|'money'|'wallet'|'bank'
---@param amount number positive whole amount
---@return boolean added
function core.addMoney(source, moneyType, amount)
    return ops.addMoney(source, moneyType, amount)
end

---Debit one of vRP's two accounts. True only when the full amount left the player; nothing is
---partially consumed on a refusal. vRP 1 has no bank-debit primitive at all, so the implementation
---composes one - callers do not need to know which.
---@param source number player server id
---@param moneyType string 'cash'|'money'|'wallet'|'bank'
---@param amount number positive whole amount
---@return boolean removed
function core.removeMoney(source, moneyType, amount)
    return ops.removeMoney(source, moneyType, amount)
end

---Credit an OFFLINE character's bank balance straight in vRP's schema. True only on vRP 1, and only
---when the target really is offline: vRP 2 keeps money inside a msgpack blob its save tick rewrites
---wholesale, so a write there would race the server and could destroy money. False means the caller
---must refund the sender, which every caller already does.
---@param key string sd-phone identifier of the recipient
---@param amount number positive whole amount
---@return boolean credited
function core.addOfflineBank(key, amount)
    return ops.addOfflineBank(key, amount)
end

---Give the player `count` of an item. vRP's own notification is suppressed, so a phone-driven item
---movement does not pop a vRP GUI toast over the phone's own feedback.
---@param source number player server id
---@param item string vRP item id
---@param count? number Default 1.
---@return boolean added
function core.addItem(source, item, count)
    return ops.addItem(source, item, count)
end

---Take `count` of an item from the player. True only when the full amount was removed.
---@param source number player server id
---@param item string vRP item id
---@param count? number Default 1.
---@return boolean removed
function core.removeItem(source, item, count)
    return ops.removeItem(source, item, count)
end

---How many of an item the player is carrying. 0 when they carry none, cannot be resolved, or the
---inventory module is switched off on this install.
---@param source number player server id
---@param item string vRP item id
---@return number
function core.itemCount(source, item)
    return ops.itemCount(source, item)
end

---An item's display name from vRP's own item registry, or nil when it is undefined there, so the
---caller can fall back to its own label rather than rendering the raw id.
---@param item string vRP item id
---@return string|nil
function core.itemLabel(item)
    return ops.itemLabel(item)
end

---True when the player has room for `count` of an item. vRP has no slots, so this is purely a weight
---comparison and no slot argument is honoured.
---@param source number player server id
---@param item string vRP item id
---@param count? number Default 1.
---@return boolean
function core.canCarry(source, item, count)
    return ops.canCarry(source, item, count)
end

---Make an item usable from vRP's inventory menu, calling `cb` when a player uses it.
---
---False on vRP 1 and that is permanent: an item's menu choices are Lua functions held inside vRP's
---own state, and a function cannot cross the Proxy boundary. True on vRP 2 means the registration was
---ACCEPTED, not that vRP applied it - registration is queued because this is called at file scope
---during resource start, long before the injection handshake can have produced a working adapter.
---@param item string vRP item id
---@param cb fun(source: number, item?: any, inv?: table, slot?: any, data?: any)
---@return boolean accepted
function core.registerUsable(item, cb)
    return ops.registerUsable(item, cb)
end

---One identity by sd-phone identifier, offline characters included, read straight from vRP's schema.
---Nil when the key is unknown or the read failed. This is the offline counterpart of core.identity.
---@param key string sd-phone identifier
---@return table|nil identity { key, id, firstname, lastname, phone, registration, age }
function core.offlineIdentity(key)
    return ops.offlineIdentity(key)
end

---Identities for a set of sd-phone identifiers as `{ [key] = identity }`, in one query. Keys outside
---this server's key space are dropped rather than queried.
---@param keys string[]
---@return table<string, table>
function core.offlineIdentities(keys)
    return ops.offlineIdentities(keys)
end

---Display names for a set of sd-phone identifiers as `{ [key] = 'First Last' }`. A key whose identity
---row is missing or blank is absent from the result, so the caller applies its own placeholder.
---@param keys string[]
---@return table<string, string>
function core.offlineNames(keys)
    return ops.offlineNames(keys)
end

---A page of identities matching a free-text term across first name, family name and phone. Neither
---lineage indexes the name columns and a substring match could not use such an index anyway, so the
---page size is capped hard inside the implementation.
---@param term string raw search text; this function owns its own wildcard wrapping and escaping
---@param limit integer rows per page
---@param offset integer rows to skip
---@return table[] rows
---@return integer total matching rows
function core.searchIdentities(term, limit, offset)
    return ops.searchIdentities(term, limit, offset)
end

---Every sd-phone identifier holding a vRP group, offline members included, or NIL when the scan is
---unavailable on this server. Nil and empty are different answers on purpose: nil means the caller
---must fall back to its online-only roster, while empty means nobody holds the group.
---@param group string vRP group name
---@return string[]|nil keys
function core.groupMembers(group)
    return ops.groupMembers(group)
end

---Drop the cached offline rosters. Call after a hire, fire, promote or demote so the acting boss
---sees the change immediately instead of up to a minute of stale membership.
function core.forgetRosters()
    ops.forgetRosters()
end

---Add the opt-in search indexes to vRP's identity table, exactly once, and only when configs/vrp.lua
---asks for it. This is the only statement in sd-phone that ALTERs a table it does not own.
---@return boolean ran true only when the migration executed on this boot
function core.ensureSearchIndexes()
    return ops.ensureSearchIndexes()
end

return core
