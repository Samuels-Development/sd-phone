---@type table Raw vRP Proxy transport (bridge.server.vrp.rpc). Every primitive below is one or more
---calls over it; nothing in this file speaks to vRP any other way.
local rpc = require 'bridge.server.vrp.rpc'

---@type table Group to job/grade/boss/duty translator (bridge.server.vrp.groups). Pure function of
---(group set, permissions, config), so this module only has to supply it with live state.
local groups = require 'bridge.server.vrp.groups'

---@type table Direct reads of vRP's schema (bridge.server.vrp.sql). Required here only for its key
---formatter, so the two modules can never disagree about what an sd-phone identifier looks like.
local sql = require 'bridge.server.vrp.sql'

---@type table vRP lineage + adapter config (bridge.shared.vrp_version), the sole owner of
---configs/vrp.lua. This module is only ever reached behind a `major == 1` check in core.lua, so
---nothing here loads on a QBox, QBCore or ESX server.
local ver = require 'bridge.shared.vrp_version'

---@type table configs/vrp.lua, or an empty table when the admin's configs/ folder predates vRP
---support. Every read below carries its own default rather than assuming a key exists.
local cfg = type(ver.cfg) == 'table' and ver.cfg or {}

---@type string The Proxy interface vRP 1 publishes its ENTIRE function table on
---(vrp-v1/vrp/base.lua: `Proxy.addInterface("vRP", vRP)`). vRP 1 has no `loadScript`, so no code
---injection is possible and this flat interface is the only surface there is.
local IFACE = 'vRP'

---@type string vRP 1's getUserGroupByType answers with an EMPTY STRING, never nil, when the player
---holds no group of that type (vrp-v1/vrp/modules/group.lua). Tested in exactly one place.
local NO_GROUP = ''

---@type integer Milliseconds a resolved user id, group set, gtype-active group and permission
---verdict are served from memory. Most callers ask for job, grade and boss status in one breath,
---and this collapses that burst into a single round trip. 0 disables the cache entirely.
local CACHE_TTL = math.max(0, math.floor(tonumber(cfg.JobCacheTtl) or 250))

---@type table<string, boolean> Shared empty group set, returned when vRP could not be read. Never
---mutated: every writer below builds its own table.
local EMPTY_SET = {}

---@type table Compiled configs/vrp.lua Jobs table, bound once at load.
local JOBS = groups.compile(cfg, 'job')

---@type table Compiled configs/vrp.lua Gangs table, bound once at load.
local GANGS = groups.compile(cfg, 'gang')

---@type table Impl module; the table returned at end of file. Every vRP 1 primitive sd-phone needs,
---expressed over the flat "vRP" proxy. It owns the money compositions vRP 1 forces on us, the
---inventory notify suppression, and the four vRP 1 lifecycle events.
local impl = {}

---@type table<number, table> source -> cached vRP state. `uid`, `key`, `shim` and `identity` live
---until the lifecycle handlers drop them; `groupSet`, `active` and `perms` live for CACHE_TTL.
local users = {}

---@type boolean Sticky "this install cannot answer inventory weight". vRP 1's
---getInventoryMaxWeight goes through the aptitude module, so on an install that dropped it the call
---raises inside vRP and never replies, costing a full rpc timeout. One is unavoidable; the flag
---makes sure it is also the only one.
local weightUnavailable = false

---@type table<string, true> Warning keys already printed, so a permanently unsupported operation
---costs one console line rather than one per call.
local warned = {}

---Print `msg` the first time `key` is seen and stay silent afterwards.
---@param key string dedupe key
---@param msg string fully formatted line, colour codes included
local function warnOnce(key, msg)
    if warned[key] then return end
    warned[key] = true
    print(msg)
end

for i = 1, #JOBS.warnings do
    print(('^3[sd-phone:vrp]^0 configs/vrp.lua Jobs: %s'):format(JOBS.warnings[i]))
end
for i = 1, #GANGS.warnings do
    print(('^3[sd-phone:vrp]^0 configs/vrp.lua Gangs: %s'):format(GANGS.warnings[i]))
end

---The compiled translator for one half of the config.
---@param kind? 'job'|'gang' Default 'job'.
---@return table compiled
local function translator(kind)
    return kind == 'gang' and GANGS or JOBS
end

---A positive whole amount, or nil when the caller passed something that must not reach vRP. Money
---and item counts are both filtered through this: vRP 1 stores both as plain integers and a
---fractional or negative value would either be silently truncated or invert the operation.
---@param value any
---@return integer|nil
local function whole(value)
    local n = math.floor(tonumber(value) or 0)
    if n <= 0 then return nil end
    return n
end

---Which vRP 1 account a caller-supplied money type names. vRP has a wallet and a bank and nothing
---else, so black money and any other account answers nil and the caller degrades to 0/false.
---@param moneyType any
---@return 'wallet'|'bank'|nil
local function accountOf(moneyType)
    if moneyType == 'bank' then return 'bank' end
    if moneyType == 'wallet' or moneyType == 'cash' or moneyType == 'money' then return 'wallet' end
    return nil
end

---The cached record for a source, refreshing the parts that have aged out. Nil when the source is
---not a connected vRP user, which is the signal every public function fails closed on.
---A user id that changed under a source drops the whole record: sources are reused across
---reconnects, and serving the previous player's identity would leak their phone.
---@param source any player server id
---@return table|nil rec
local function entryFor(source)
    local src = tonumber(source)
    if not src then return nil end

    local rec = users[src]
    local now = GetGameTimer()
    if rec and rec.uid and (now - rec.at) < CACHE_TTL then return rec end

    local uid = tonumber(rpc.call(IFACE, 'getUserId', src))
    if not uid then
        users[src] = nil
        return nil
    end

    if rec and rec.uid ~= uid then rec = nil end
    if not rec then
        rec = { uid = uid, key = sql.keyFor(uid) }
        users[src] = rec
    end

    rec.at       = now
    rec.groupSet = nil
    rec.active   = {}
    rec.perms    = {}
    return rec
end

---Drop every cached read for a source. Called on both lifecycle edges and after any write that
---changes what vRP would answer, so the next question is asked of vRP rather than of a stale copy.
---@param source number player server id
function impl.forget(source)
    local src = tonumber(source)
    if src then users[src] = nil end
end

---Invalidate only the TTL-scoped half of a record, keeping the identity and the shim table alive.
---Used after a group write, where the player is unchanged but their memberships are not.
---@param rec table
local function invalidate(rec)
    rec.at       = 0
    rec.groupSet = nil
    rec.active   = {}
    rec.perms    = {}
end

---Copy a resolved identity into the shim table the bridge already handed out. The shim's `identity`
---is a stable reference other modules may be holding, so it is filled in place and never replaced,
---and the copy runs from both directions: the identity can land before or after the shim is built.
---@param rec table cached record
local function syncShim(rec)
    if not rec.shim or not rec.identity then return end
    for k, v in pairs(rec.identity) do rec.shim.identity[k] = v end
end

---The vRP user_id behind a source, or nil when the source is not a connected vRP user.
---@param source number player server id
---@return integer|nil
function impl.userId(source)
    local rec = entryFor(source)
    return rec and rec.uid or nil
end

---The sd-phone identifier for a source, in this server's key space (`vrp:u<user_id>`). vRP 1 has no
---characters at all: `vrp_user_identities` is keyed PRIMARY KEY(user_id) and buying a new identity
---UPDATEs that row, so the account IS the character and the account id is the right key.
---@param source number player server id
---@return string|nil
function impl.key(source)
    local rec = entryFor(source)
    return rec and rec.key or nil
end

---The source currently holding an sd-phone key, or nil when that user is offline. The key is
---rejected outright when it belongs to another key space, rather than being reinterpreted: a
---`vrp:c17` key names a vRP 2 character and has no meaning here.
---@param key string sd-phone identifier
---@return number|nil source
function impl.sourceFor(key)
    local uid = sql.idFor(key)
    if not uid then return nil end
    return tonumber(rpc.call(IFACE, 'getUserSource', uid))
end

---Every connected vRP user as `{ [key] = source }`. Read straight from vRP's own user_id -> source
---map, so it is exactly as authoritative as vRP itself.
---@return table<string, number>
function impl.online()
    local out = {}
    local raw = rpc.call(IFACE, 'getUsers')
    if type(raw) ~= 'table' then return out end

    for uid, src in pairs(raw) do
        local id, source = tonumber(uid), tonumber(src)
        if id and source then out[sql.keyFor(id)] = source end
    end
    return out
end

---The player's vRP identity row, normalised. This is the one read here that YIELDS: it is SQL
---backed, so it costs a real await and is cached until the player leaves. vRP's `firstname` is the
---given name and `name` is the family name, which is the opposite of what those column names
---suggest to a reader used to the qb and esx schemas.
---@param source number player server id
---@return table|nil identity { firstname, lastname, phone, registration, age }
function impl.identity(source)
    local rec = entryFor(source)
    if not rec then return nil end
    if rec.identity then return rec.identity end

    local row = rpc.call(IFACE, 'getUserIdentity', rec.uid)
    if type(row) ~= 'table' then return nil end

    local identity = {
        firstname    = tostring(row.firstname or ''),
        lastname     = tostring(row.name or ''),
        phone        = tostring(row.phone or ''),
        registration = tostring(row.registration or ''),
        age          = tonumber(row.age) or 0,
    }
    rec.identity = identity
    syncShim(rec)
    return identity
end

---The player's display name, or nil when their identity row cannot be read or is blank.
---@param source number player server id
---@return string|nil
function impl.name(source)
    local identity = impl.identity(source)
    if not identity then return nil end
    local full = (identity.firstname .. ' ' .. identity.lastname):gsub('^%s+', ''):gsub('%s+$', '')
    return full ~= '' and full or nil
end

---The stable per-source table `player.get()` hands to the rest of the server bridge. It carries no
---`PlayerData` and no `.job` ON PURPOSE: any call site missed in the audit reads nil there and takes
---its existing "unsupported framework" branch instead of reading a wrong value. It must never be nil
---for a loaded player, because a nil player object is the universal "not a player" signal.
---@param source number player server id
---@return table|nil shim
function impl.state(source)
    local rec = entryFor(source)
    if not rec then return nil end

    if not rec.shim then
        rec.shim = { vrp = true, id = rec.uid, cid = nil, key = rec.key, identity = {}, source = tonumber(source) }
        -- Fills rec.shim.identity in place when the row is already cached or readable from here; a
        -- caller outside a coroutine simply gets an empty identity until the lifecycle prime lands
        -- it, because the identity read is the one call here that yields.
        impl.identity(source)
        syncShim(rec)
    end
    return rec.shim
end

---The player's vRP group membership set. An unreadable set answers empty, so every lookup misses
---and the player resolves to no job, which is the fail-closed direction.
---@param source number player server id
---@return table<string, boolean>
function impl.groupSet(source)
    local rec = entryFor(source)
    if not rec then return EMPTY_SET end
    if rec.groupSet then return rec.groupSet end

    local set = {}
    local raw = rpc.call(IFACE, 'getUserGroups', rec.uid)
    if type(raw) == 'table' then
        for name, held in pairs(raw) do
            if type(name) == 'string' and held then set[name] = true end
        end
    end

    rec.groupSet = set
    return set
end

---The player's group of a given gtype, using vRP's own one-group-per-gtype exclusivity rule. Nil
---rather than the empty string vRP answers with, so callers never see a group named "".
---@param source number player server id
---@param gtype string vRP group type, e.g. 'job'
---@return string|nil
function impl.activeGroup(source, gtype)
    local rec = entryFor(source)
    if not rec or type(gtype) ~= 'string' or gtype == '' then return nil end

    local hit = rec.active[gtype]
    if hit ~= nil then return hit or nil end

    local name = rpc.call(IFACE, 'getUserGroupByType', rec.uid, gtype)
    if type(name) ~= 'string' or name == NO_GROUP then
        rec.active[gtype] = false
        return nil
    end

    rec.active[gtype] = name
    return name
end

---True when the player holds `perm`. The "!name.arg" function-permission form is REFUSED rather
---than evaluated: vRP hands those to registered permission functions, and although vRP 1's own two
---(`not`, `is`) do not yield, any third-party script can register one that does. Refusing keeps the
---rule identical on both lineages and keeps a permission check from ever blocking.
---@param source number player server id
---@param perm string plain permission, never the "!" form
---@return boolean
function impl.hasPermission(source, perm)
    if not groups.isPlainPermission(perm) then return false end

    local rec = entryFor(source)
    if not rec then return false end

    local hit = rec.perms[perm]
    if hit ~= nil then return hit end

    local granted = rpc.call(IFACE, 'hasPermission', rec.uid, perm) == true
    rec.perms[perm] = granted
    return granted
end

---The live state the groups translator reads: membership set, gtype-active group, and a permission
---predicate bound to this source. Built per call rather than cached, because everything expensive
---inside it is already cached one level down.
---@param source number player server id
---@param kind? 'job'|'gang' Default 'job'.
---@return { groups: table<string, boolean>, active: string|nil, hasPermission: fun(perm: string): boolean }
function impl.groupState(source, kind)
    local compiled = translator(kind)
    return {
        groups        = impl.groupSet(source),
        active        = impl.activeGroup(source, compiled.gtype),
        hasPermission = function(perm) return impl.hasPermission(source, perm) end,
    }
end

---Add or remove one vRP group. Returns whether the write was DISPATCHED, not whether vRP applied
---it: addUserGroup silently does nothing for a group that is not declared in vRP's cfg/groups.lua,
---and vRP reports that to nobody, so a group named in configs/vrp.lua must also exist there.
---@param source number player server id
---@param group string vRP group name
---@param add boolean true to join, false to leave
---@return boolean dispatched
function impl.setGroup(source, group, add)
    if type(group) ~= 'string' or group == '' then return false end

    local rec = entryFor(source)
    if not rec then return false end

    -- Both members return nothing at all, so there is no verdict worth waiting for and rid = -1
    -- saves vRP the reply entirely.
    rpc.post(IFACE, add and 'addUserGroup' or 'removeUserGroup', rec.uid, group)
    invalidate(rec)
    return true
end

---The player's current job name, or nil when no configured job matches their groups.
---@param source number player server id
---@param kind? 'job'|'gang' Default 'job'.
---@return string|nil
function impl.getJob(source, kind)
    return groups.jobName(translator(kind), impl.groupState(source, kind))
end

---The player's current grade. 0 both for "grade zero" and for "no job", exactly as the ESX path
---answers, because every caller pairs it with the job name.
---@param source number player server id
---@param kind? 'job'|'gang' Default 'job'.
---@return integer
function impl.getGrade(source, kind)
    return groups.grade(translator(kind), impl.groupState(source, kind))
end

---Every configured job whose groups the player holds, mapped to its grade. Real data on vRP, since
---membership is a set: a player genuinely can hold two mapped jobs at once. Reporting only.
---@param source number player server id
---@param kind? 'job'|'gang' Default 'job'.
---@return table<string, integer>
function impl.getAllJobs(source, kind)
    return groups.getAll(translator(kind), impl.groupState(source, kind))
end

---True when the player is on `jobName` and a boss of it. With neither bossGroups nor bossPermission
---configured this degrades to grade >= esxBossGrade, so an unconfigured vRP server gates company
---management exactly like an ESX one.
---@param source number player server id
---@param jobName string
---@param esxBossGrade? integer Threshold the caller already passes from configs/services.lua.
---@param kind? 'job'|'gang' Default 'job'.
---@return boolean
function impl.isBoss(source, jobName, esxBossGrade, kind)
    return groups.isBoss(translator(kind), impl.groupState(source, kind), jobName, esxBossGrade)
end

---The player's on-duty state, or nil when their job has no duty model configured. Nil is meaningful
---and is the default: callers already read it as "use the phone's own stored duty preference",
---exactly as they do on ESX.
---@param source number player server id
---@param jobName? string When given, duty is only reported for that job.
---@param kind? 'job'|'gang' Default 'job'.
---@return boolean|nil
function impl.getDuty(source, jobName, kind)
    return groups.getDuty(translator(kind), impl.groupState(source, kind), jobName)
end

---Drive the player's on-duty state by joining or leaving the job's configured duty group. False
---when the job has no duty group, because duty is then unwritable and pretending otherwise would
---leave the UI showing a state vRP does not hold.
---@param source number player server id
---@param jobName string
---@param onDuty boolean
---@param kind? 'job'|'gang' Default 'job'.
---@return boolean applied
function impl.setDuty(source, jobName, onDuty, kind)
    local group = groups.dutyGroup(translator(kind), jobName)
    if not group then return false end
    return impl.setGroup(source, group, onDuty == true)
end

---Move an online player to `jobName` at `grade`. vRP has no job field: this adds the mapped rank
---group and lets vRP's own gtype exclusivity evict the previous rank, which is why every group in
---configs/vrp.lua must carry _config.gtype = JobGtype.
---An UNMAPPED jobName is treated as a REVOKE, not as an error: society.fire() reaches this with
---configs/services.lua's 'unemployed', which no vRP server has a group for, and silently leaving the
---old rank attached would be a privilege leak. Revoking is the safe failure direction.
---@param source number player server id
---@param jobName string
---@param grade? number Default 0. Indexes the entry's rank list, so grade 1 is the second group.
---@param kind? 'job'|'gang' Default 'job'.
---@return boolean
function impl.setJob(source, jobName, grade, kind)
    local compiled = translator(kind)
    local plan = groups.setJobPlan(compiled, impl.groupState(source, kind), jobName, grade)
    if not plan.ok then return false end

    -- Revokes go first: a plan that both revokes and adds must never leave the old rank attached
    -- because the add failed.
    local applied = true
    for i = 1, #plan.remove do
        if not impl.setGroup(source, plan.remove[i], false) then applied = false end
    end
    if plan.add and not impl.setGroup(source, plan.add, true) then applied = false end
    return applied
end

---A job's display label, from config. vRP has no label of its own to read.
---@param jobName string
---@param kind? 'job'|'gang' Default 'job'.
---@return string|nil
function impl.jobLabel(jobName, kind)
    return groups.label(translator(kind), jobName)
end

---A single grade's label, e.g. 'Sergeant' for police grade 1.
---@param jobName string
---@param grade? number Default 0.
---@param kind? 'job'|'gang' Default 'job'.
---@return string|nil
function impl.gradeLabel(jobName, grade, kind)
    return groups.gradeLabel(translator(kind), jobName, grade)
end

---Every grade of a job, in society.getGrades' shape. vRP has no grade table, so the configured rank
---list IS the grade list.
---@param jobName string
---@param kind? 'job'|'gang' Default 'job'.
---@return { level: integer, label: string }[]
function impl.grades(jobName, kind)
    return groups.grades(translator(kind), jobName)
end

---The player's balance for one account. 0 for an account vRP does not have (black money), which is
---the same shape the ESX path degrades to.
---@param source number player server id
---@param moneyType string 'wallet'|'cash'|'money'|'bank'
---@return number
function impl.balance(source, moneyType)
    local account = accountOf(moneyType)
    if not account then return 0 end

    local rec = entryFor(source)
    if not rec then return 0 end

    return tonumber(rpc.call(IFACE, account == 'bank' and 'getBankMoney' or 'getMoney', rec.uid)) or 0
end

---Debit `amount` from a vRP 1 user's BANK account. vRP 1 has no bank-debit primitive: the only
---race-free composition it offers is tryWithdraw (bank -> wallet) followed by tryPayment (wallet
---debit). Both legs are pure in-memory writes that never yield, so under rpc's inline fast path no
---other coroutine can observe the intermediate state.
---
---The recovery leg is tryDeposit and NOT giveBankMoney, which is the one detail here that has to be
---right. tryWithdraw moves money between two accounts of the SAME player, so a failure of leg 2
---cannot destroy anything - the amount is either already spent or still sitting in that player's
---wallet. An unconditional giveBankMoney would therefore mint in every branch it can reach: on an
---explicit `false` the wallet was drained by a third party who now legitimately holds the money, and
---on a nil (timeout, or a vRP function that raised) the debit may well have landed. tryDeposit is
---safe in all three cases because it debits the wallet BEFORE crediting the bank, so it moves the
---amount home only when it is genuinely still there and no-ops otherwise.
---
---Worst case on a failed debit is that the player is left holding cash instead of bank. That is an
---inconvenience; a mint is not.
---
---setBankMoney is deliberately never called anywhere in this module: it is an ABSOLUTE setter, so a
---get-then-set debit would be a money-duplication race across two proxy round trips.
---@param uid integer vRP user_id
---@param amount integer positive whole amount
---@return boolean debited
local function bankDebitV1(uid, amount)
    if amount <= 0 then return false end
    if rpc.call(IFACE, 'tryWithdraw', uid, amount) ~= true then return false end
    if rpc.call(IFACE, 'tryPayment', uid, amount) == true then return true end
    rpc.post(IFACE, 'tryDeposit', uid, amount)
    return false
end

---Credit one of the player's vRP accounts. Both credits are void members that no-op on a
---non-positive amount, so there is no verdict to wait for and the write is posted without a reply;
---true means "dispatched to a resolved user", which is the same promise the ESX path makes.
---@param source number player server id
---@param moneyType string 'wallet'|'cash'|'money'|'bank'
---@param amount number positive whole amount
---@return boolean
function impl.addMoney(source, moneyType, amount)
    local account = accountOf(moneyType)
    local n = whole(amount)
    if not account or not n then return false end

    local rec = entryFor(source)
    if not rec then return false end

    rpc.post(IFACE, account == 'bank' and 'giveBankMoney' or 'giveMoney', rec.uid, n)
    return true
end

---Debit one of the player's vRP accounts. Wallet is vRP's own tryPayment; bank is the composition
---above, because vRP 1 has no bank debit. False means nothing left the player.
---@param source number player server id
---@param moneyType string 'wallet'|'cash'|'money'|'bank'
---@param amount number positive whole amount
---@return boolean removed
function impl.removeMoney(source, moneyType, amount)
    local account = accountOf(moneyType)
    local n = whole(amount)
    if not account or not n then return false end

    local rec = entryFor(source)
    if not rec then return false end

    if account == 'bank' then return bankDebitV1(rec.uid, n) end
    return rpc.call(IFACE, 'tryPayment', rec.uid, n) == true
end

---Give the player an item. The fourth argument to giveInventoryItem is `notify`, which vRP DEFAULTS
---TO TRUE and which pops a vRP GUI notification on top of sd-phone's own feedback, so it is passed
---false explicitly. The member returns nothing, so true means dispatched to a resolved user.
---@param source number player server id
---@param item string vRP item idname
---@param count? number Default 1.
---@return boolean
function impl.addItem(source, item, count)
    local n = whole(count == nil and 1 or count)
    if type(item) ~= 'string' or item == '' or not n then return false end

    local rec = entryFor(source)
    if not rec then return false end

    rpc.post(IFACE, 'giveInventoryItem', rec.uid, item, n, false)
    return true
end

---Take an item from the player, returning vRP's own verdict. `notify` is passed false for the same
---reason as above, and here it matters twice: vRP notifies on the FAILURE path too, so a silent
---"do you have this item" probe would otherwise tell the player they are missing something.
---@param source number player server id
---@param item string vRP item idname
---@param count? number Default 1.
---@return boolean removed
function impl.removeItem(source, item, count)
    local n = whole(count == nil and 1 or count)
    if type(item) ~= 'string' or item == '' or not n then return false end

    local rec = entryFor(source)
    if not rec then return false end

    return rpc.call(IFACE, 'tryGetInventoryItem', rec.uid, item, n, false) == true
end

---How many of an item the player is carrying. 0 when they carry none or cannot be resolved.
---@param source number player server id
---@param item string vRP item idname
---@return number
function impl.itemCount(source, item)
    if type(item) ~= 'string' or item == '' then return 0 end

    local rec = entryFor(source)
    if not rec then return 0 end

    return tonumber(rpc.call(IFACE, 'getInventoryItemAmount', rec.uid, item)) or 0
end

---An item's display name from vRP's item definitions. Nil for an item vRP does not define, so the
---caller can fall back to its own label rather than rendering the raw idname.
---@param item string vRP item idname
---@return string|nil
function impl.itemLabel(item)
    if type(item) ~= 'string' or item == '' then return nil end
    local label = rpc.call(IFACE, 'getItemDefinition', item)
    return type(label) == 'string' and label ~= '' and label or nil
end

---Whether the player could carry `count` more of an item. Advisory only: vRP 1's
---giveInventoryItem does not enforce weight at all, weight is enforced in vRP's own inventory menu,
---so this exists to keep the phone from offering a transfer that would leave the player overloaded.
---An install whose getInventoryMaxWeight cannot be read (it goes through the aptitude module)
---answers true from then on, matching what vRP itself would do with the item.
---@param source number player server id
---@param item string vRP item idname
---@param count? number Default 1.
---@return boolean
function impl.canCarry(source, item, count)
    local n = whole(count == nil and 1 or count)
    if not n then return true end
    if type(item) ~= 'string' or item == '' then return false end

    local rec = entryFor(source)
    if not rec then return false end
    if weightUnavailable then return true end

    local max = tonumber(rpc.call(IFACE, 'getInventoryMaxWeight', rec.uid))
    if not max then
        weightUnavailable = true
        warnOnce('weight', '^3[sd-phone:vrp]^0 vRP did not answer getInventoryMaxWeight; carry checks are disabled')
        return true
    end

    local used = tonumber(rpc.call(IFACE, 'getInventoryWeight', rec.uid)) or 0
    local unit = tonumber(rpc.call(IFACE, 'getItemWeight', item)) or 0
    return (max - used) >= (unit * n)
end

---Register a usable item. IMPOSSIBLE on vRP 1: an item's menu choices are Lua FUNCTIONS held in
---vRP's own state, and a function cannot cross the proxy boundary, so there is no way to reach them
---from another resource. A warn-once no-op rather than an error, because both call sites run at
---file scope during resource start and raising there would stop the server half from loading.
---@param item string
---@param cb fun(source: number, item?: any, inv?: table, slot?: any, data?: any)
---@return boolean registered always false
function impl.registerUsable(item, cb)
    warnOnce('usable', '^3[sd-phone:vrp]^0 vRP 1 cannot register usable items from another resource; the phone item is unusable')
    return false
end

---Cache the source to user_id mapping the moment vRP knows it, and pull the identity row in a
---coroutine so the shim is already populated by the time an app asks for it. Both connect paths
---prime; neither is a character-load edge, because they fire inside vRP's `playerConnecting`
---deferral where the player has no ped yet.
---@param user_id any vRP user id
---@param source any player server id
local function prime(user_id, source)
    local src, uid = tonumber(source), tonumber(user_id)
    if not src or not uid then return end

    users[src] = { uid = uid, key = sql.keyFor(uid), at = GetGameTimer(), active = {}, perms = {} }
    CreateThread(function() impl.identity(src) end)
end

AddEventHandler('vRP:playerJoin', function(user_id, source) prime(user_id, source) end)
AddEventHandler('vRP:playerRejoin', function(user_id, source) prime(user_id, source) end)

-- The character-load edge. vRP:playerSpawn also fires on every death respawn, with first_spawn
-- false, which is why the flag test is mandatory; vRP:playerRejoin deliberately is NOT an edge,
-- because it zeroes the reconnecting player's spawn count and so guarantees this fires again.
AddEventHandler('vRP:playerSpawn', function(user_id, source, first_spawn)
    if first_spawn ~= true then return end
    prime(user_id, source)
    TriggerEvent('sd-phone:vrp:characterLoad', tonumber(source), tonumber(user_id))
end)

-- The character-unload edge. vRP clears its own user tables immediately after firing this, so the
-- relay goes out before the cache is dropped and every handler still gets a resolvable player.
AddEventHandler('vRP:playerLeave', function(user_id, source)
    TriggerEvent('sd-phone:vrp:characterUnload', tonumber(source), tonumber(user_id))
    impl.forget(source)
end)

return impl
