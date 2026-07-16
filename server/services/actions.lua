---@type table sd-phone config root (configs/config.lua).
local config   = require 'configs.config'
---@type table Services prefs store (server.services.store): per-(character, job) duty/calls/messages toggles.
local store    = require 'server.services.store'
---@type table Company inbox store (server.services.msgstore): shared (job, customer) message rows + read state.
local msgstore = require 'server.services.msgstore'
---@type table Saved-jobs store (server.services.jobstore): phone multijob list, job offers, pending fires.
local jobstore = require 'server.services.jobstore'
---@type table Society bridge (bridge.server.society): company balance, grade ladders, roster, hire/fire.
local society  = require 'bridge.server.society'
---@type table Banking bridge (bridge.server.banking): the caller's personal bank balance + credit/debit.
local bank     = require 'bridge.server.banking'
---@type table Job bridge (bridge.server.job): current job/grade/duty reads + SetJob/SetJobDuty writes.
local job      = require 'bridge.server.job'
---@type table Player bridge (bridge.server.player): citizenid/name/source lookups.
local player   = require 'bridge.server.player'
---@type table Settings store (server.settings.store): phone-number ownership lookups.
local settings = require 'server.settings.store'
---@type table Calls actions (server.calls.actions): the group-ring plumbing company calls reuse.
local calls    = require 'server.calls.actions'

---@type table Services config (configs/services.lua): companies, boss grades, employee caps.
local SV           = config.Services
---@type table[] Configured company entries (SV.Companies), in directory order.
local COMPANIES    = SV.Companies or {}
---@type integer ESX-only fallback boss grade for companies without their own bossGrade override.
local DEFAULT_BOSS = SV.DefaultBossGrade or 3
---@type string Job a fired or resigning employee is reset to.
local UNEMPLOYED   = SV.UnemployedJob or 'unemployed'
---@type integer Cap on how many rows the boss roster returns.
local EMP_LIMIT    = SV.EmployeeLimit or 100

---@type table<string, table> Company config entry by job name, for O(1) lookup of the caller's own company.
local byJob = {}
for _, c in ipairs(COMPANIES) do byJob[c.job] = c end

-- Jobs that count as "no job" (no Actions tab). Unemployed is always included.
---@type table<string, boolean> Set of jobs the Services app treats as not employed.
local BLACKLIST = {}
for _, j in ipairs(SV.JobBlacklist or { 'unemployed' }) do BLACKLIST[j] = true end
BLACKLIST[UNEMPLOYED] = true

---ESX boss-grade threshold for a job: the per-company bossGrade override, else DefaultBossGrade.
---QBCore/QBox ignore this - job.isBoss reads the grade's isboss flag there.
---@param jobName string framework job name
---@return integer
local function esxBossGrade(jobName)
    local entry = byJob[jobName]
    return (entry and entry.bossGrade) or DEFAULT_BOSS
end

---@type table Actions module; every handler returns the { success, data?, message? } envelope
---(matching the Banking module). The table returned at end of file.
local actions = {}

local util = require 'server.util'
local ok, fail, digits, trim = util.ok, util.fail, util.digits, util.trim



---Parses a client message draft into a kind, a body, and a JSON meta blob of the extras, with
---every client string length-capped. Returns `nil, errorMessage` when the draft is empty/invalid.
---@param payload { kind?: string, body?: string, mediaUrl?: string, wpCode?: string, wpSub?: string }
---@return string|nil kind, string body, string|nil meta
local function parseDraft(payload)
    local kind = tostring(payload.kind or 'text')
    if kind == 'image' then
        local url = trim(payload.mediaUrl):sub(1, 512)
        if url == '' then return nil, 'No image' end
        return 'image', '📷 Photo', json.encode({ mediaUrl = url })
    elseif kind == 'location' then
        local wp = trim(payload.wpCode):sub(1, 256)
        if wp == '' then return nil, 'No location' end
        local meta = { wpCode = wp }
        local sub = trim(payload.wpSub):sub(1, 128)
        if sub ~= '' then meta.wpSub = sub end
        return 'location', '📍 Location', json.encode(meta)
    end
    local body = trim(payload.body)
    if body == '' then return nil, 'Empty message' end
    if #body > 300 then body = body:sub(1, 300) end
    return 'text', body, nil
end

---Asserts the caller is a boss of their current job. Returns `(jobName, citizenid)` on success,
---or `(nil, errorMessage)`.
---@param src number caller server id
---@return string|nil jobName, string citizenidOrError
local function requireBoss(src)
    local cid = player.getIdentifier(src)
    if not cid then return nil, 'Player not found' end
    local myJob = job.getName(src)
    if not myJob or BLACKLIST[myJob] then return nil, "You're not in a job" end
    if not job.isBoss(src, myJob, esxBossGrade(myJob)) then return nil, 'You must be the boss to do that' end
    return myJob, cid
end

---Builds the `myCompany` block for the caller, or nil when they hold no real job; balance and
---the merged framework + saved-job roster (sorted, capped at EMP_LIMIT) ship only for bosses.
---@param src number caller server id
---@return table|nil
local function buildMyCompany(src)
    local cid   = player.getIdentifier(src)
    local myJob = job.getName(src)
    if not cid or not myJob or BLACKLIST[myJob] then return nil end

    local entry  = byJob[myJob]
    local grade  = job.getGrade(src)
    local isBoss = job.isBoss(src, myJob, esxBossGrade(myJob))
    local prefs  = store.getPrefs(cid, myJob)

    local fwDuty = job.getDuty(src)
    local duty   = prefs.duty
    if fwDuty ~= nil then duty = fwDuty end

    local mc = {
        job         = myJob,
        label       = entry and entry.label or (job.getLabel(myJob) or myJob),
        isCompany   = entry ~= nil,
        isBoss      = isBoss,
        available   = society.available(),
        duty        = duty,
        jobCalls    = prefs.jobCalls,
        jobMessages = prefs.jobMessages,
        myGrade     = grade,
    }

    if isBoss then
        mc.balance = society.available() and society.getBalance(myJob) or nil
        mc.grades  = society.getGrades(myJob)

        local gradeMap = {}
        for _, g in ipairs(mc.grades) do gradeMap[g.level] = g.label end

        local online = player.onlineCidMap()

        local byCid, order = {}, {}
        local function ensure(ecid)
            local r = byCid[ecid]
            if not r then r = { id = ecid }; byCid[ecid] = r; order[#order + 1] = ecid end
            return r
        end
        for _, e in ipairs(society.listEmployees(myJob)) do
            local r = ensure(e.citizenid); r.name = e.name; r.fwGrade = e.grade
        end
        for _, s in ipairs(jobstore.savedJobMembers(myJob)) do
            ensure(s.citizenid).savedGrade = s.grade
        end

        local needNames = {}
        for ecid, r in pairs(byCid) do if not r.name then needNames[#needNames + 1] = ecid end end
        if #needNames > 0 then
            local names = society.namesByCids(needNames)
            for _, ecid in ipairs(needNames) do byCid[ecid].name = names[ecid] or ecid end
        end

        local fired  = jobstore.pendingFireCids(myJob)
        local roster = {}
        for _, ecid in ipairs(order) do
            if fired[ecid] then goto continue end
            local r    = byCid[ecid]
            local esrc = online[ecid]
            local status, grade
            if esrc and job.getName(esrc) == myJob then
                local d = job.getDuty(esrc)
                status = (d == nil or d) and 'duty' or 'offduty'
                grade  = r.fwGrade or r.savedGrade or 0
            else
                status = 'away'
                grade  = r.savedGrade or r.fwGrade or 0
            end
            roster[#roster + 1] = {
                id     = ecid,
                name   = r.name or ecid,
                rank   = gradeMap[grade] or ('Grade ' .. tostring(grade)),
                grade  = grade,
                status = status,
                online = esrc ~= nil,
                self   = ecid == cid or nil,
            }
            if #roster >= EMP_LIMIT then break end
            ::continue::
        end
        local statusRank = { duty = 0, offduty = 1, away = 2 }
        table.sort(roster, function(a, b)
            if a.status ~= b.status then return (statusRank[a.status] or 9) < (statusRank[b.status] or 9) end
            if a.grade  ~= b.grade  then return a.grade > b.grade end
            return a.name < b.name
        end)
        mc.employees = roster
    end

    return mc
end

---Tells every online boss of a job to refresh their roster; the push carries no data.
---@param jobName string|nil
function actions.notifyRoster(jobName)
    if not jobName or BLACKLIST[jobName] then return end
    local esxBoss = esxBossGrade(jobName)
    for _, tsrc in pairs(player.onlineCidMap()) do
        if job.getName(tsrc) == jobName and job.isBoss(tsrc, jobName, esxBoss) then
            TriggerClientEvent('sd-phone:client:services:rosterChanged', tsrc, {})
        end
    end
end

---Returns public directory rows for every configured company, built fresh per call.
---@return table[] companies
function actions.companyList()
    local companies = {}
    for _, c in ipairs(COMPANIES) do
        companies[#companies + 1] = {
            id         = c.job,
            name       = c.label,
            location   = c.location,
            color      = c.color,
            emoji      = c.emoji,
            canCall    = c.canCall == true,
            callNumber = c.callNumber,
            coords     = c.coords and { x = c.coords.x, y = c.coords.y, z = c.coords.z } or nil,
        }
    end
    return companies
end

---Returns the public company directory plus the caller's own company block, `multijob`, and
---`pendingOffers`. Read-only.
---@param src number
function actions.directory(src)
    local cid = player.getIdentifier(src)
    return ok({
        companies     = actions.companyList(),
        myCompany     = buildMyCompany(src),
        multijob      = job.supportsMultijob(),
        pendingOffers = cid and #jobstore.listInvites(cid) or 0,
    })
end

---Toggles the caller's duty status for their current job: sets the framework duty state,
---persists the pref, fires the dutyChanged pushes, and nudges the bosses' rosters.
---@param src number
---@param payload { on?: boolean }
function actions.setDuty(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end
    local myJob = job.getName(src)
    if not myJob or BLACKLIST[myJob] then return fail("You're not in a job") end

    local on = payload.on == true
    job.setDuty(src, on)
    store.setDuty(cid, myJob, on)
    TriggerClientEvent('sd-phone:client:services:dutyChanged', src, { job = myJob, duty = on })
    TriggerEvent('sd-phone:services:dutyChanged', src, myJob, on)
    actions.notifyRoster(myJob)
    return ok({ myCompany = buildMyCompany(src) })
end

---Toggles whether the caller receives customer job calls for their current configured company.
---@param src number
---@param payload { on?: boolean }
function actions.setJobCalls(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end
    local myJob = job.getName(src)
    if not (myJob and byJob[myJob]) then return fail("You're not in a company") end

    store.setJobCalls(cid, myJob, payload.on == true)
    return ok({ myCompany = buildMyCompany(src) })
end

---Toggles whether the caller is notified of messages sent to their company.
---@param src number
---@param payload { on?: boolean }
function actions.setJobMessages(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end
    local myJob = job.getName(src)
    if not (myJob and byJob[myJob]) then return fail("You're not in a company") end

    store.setJobMessages(cid, myJob, payload.on == true)
    return ok({ myCompany = buildMyCompany(src) })
end

---Moves money from the boss's personal bank into the company account; the amount is coerced to
---a positive integer with NaN/inf rejected, and a failed society credit refunds the debit.
---@param src number
---@param payload { amount?: number }
function actions.deposit(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local myJob, cidOrErr = requireBoss(src)
    if not myJob then return fail(cidOrErr) end

    local amount = math.floor(tonumber(payload.amount) or 0)
    if amount <= 0 or amount ~= amount or amount == math.huge then return fail('Enter a valid amount') end
    if not society.available() then return fail('No company bank is available') end
    if (bank.getBalance(src) or 0) < amount then return fail('Insufficient personal funds') end

    bank.removeMoney(src, amount, 'Company deposit')
    if not society.addMoney(myJob, amount, 'Phone deposit') then
        bank.addMoney(src, amount, 'Deposit refund')
        return fail('Could not reach the company account')
    end
    return ok({ myCompany = buildMyCompany(src) })
end

---Moves money from the company account into the boss's personal bank; the society debit runs
---first and its return is checked before the personal credit.
---@param src number
---@param payload { amount?: number }
function actions.withdraw(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local myJob, cidOrErr = requireBoss(src)
    if not myJob then return fail(cidOrErr) end

    local amount = math.floor(tonumber(payload.amount) or 0)
    if amount <= 0 or amount ~= amount or amount == math.huge then return fail('Enter a valid amount') end
    if not society.available() then return fail('No company bank is available') end
    if society.getBalance(myJob) < amount then
        return fail('Insufficient company funds')
    end

    if not society.removeMoney(myJob, amount, 'Phone withdrawal') then
        return fail('Could not reach the company account')
    end
    bank.addMoney(src, amount, 'Company withdrawal')
    return ok({ myCompany = buildMyCompany(src) })
end

---Sends a job offer to an online player by server ID, with the offered grade clamped below the
---caller's own; re-offering upserts on (citizenid, job).
---@param src number
---@param payload { serverId?: number, grade?: number }
function actions.hire(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local myJob, cid = requireBoss(src)
    if not myJob then return fail(cid) end
    local label = job.getLabel(myJob) or myJob

    local targetId = math.floor(tonumber(payload.serverId) or 0)
    if targetId <= 0 then return fail('Enter a valid server ID') end
    local grade = math.max(0, math.floor(tonumber(payload.grade) or 0))
    if grade >= job.getGrade(src) then return fail("You can't hire someone at or above your own rank") end

    local targetCid = player.getIdentifier(targetId)
    if not targetCid then return fail('No player with that ID is online') end
    if targetCid == cid then return fail("You can't hire yourself") end
    if jobstore.getSaved(targetCid)[myJob] then return fail('They already work here') end

    jobstore.addInvite({
        id        = jobstore.newId(),
        cid       = targetCid,
        job       = myJob,
        grade     = grade,
        invitedBy = player.getName(src),
        createdAt = os.time(),
    })

    TriggerClientEvent('sd-phone:client:notify', targetId, {
        app = 'services', appId = 'services', title = label,
        body = ('You have a job offer from %s. Open Services → Jobs to accept.'):format(label),
        time = 'now',
    })
    TriggerClientEvent('sd-phone:client:services:jobsChanged', targetId, {})

    return ok({ myCompany = buildMyCompany(src) })
end

---Resolves a target's standing in `myJob`: active/saved membership, the currently applicable
---grade, and online state; nil when they are not an employee.
---@param myJob string the boss's company job
---@param targetCid string target citizenid (payload-supplied; validated here by membership)
---@return { src?: number, online: boolean, activeHere: boolean, grade: number, fw: boolean, saved: boolean }|nil
local function memberInfo(myJob, targetCid)
    local fwGrade
    for _, e in ipairs(society.listEmployees(myJob)) do
        if e.citizenid == targetCid then fwGrade = e.grade break end
    end
    local saved      = jobstore.getSaved(targetCid)[myJob]
    local savedGrade = saved and math.floor(tonumber(saved.grade) or 0) or nil
    if fwGrade == nil and savedGrade == nil then return nil end

    local tsrc       = player.getSourceByIdentifier(targetCid)
    local activeHere = tsrc ~= nil and job.getName(tsrc) == myJob
    local grade      = activeHere and (fwGrade or savedGrade or 0) or (savedGrade or fwGrade or 0)
    return { src = tsrc, online = tsrc ~= nil, activeHere = activeHere, grade = grade, fw = fwGrade ~= nil, saved = savedGrade ~= nil }
end

---Removes an employee from the caller's company (boss-only, self-fire blocked, rank-gated):
---framework fire when actively working, pending fire when offline, saved entry dropped.
---@param src number
---@param payload { citizenid?: string }
function actions.fire(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local myJob, cid = requireBoss(src)
    if not myJob then return fail(cid) end

    local targetCid = tostring(payload.citizenid or '')
    if targetCid == '' then return fail('No employee selected') end
    if targetCid == cid then return fail("You can't fire yourself") end

    local info = memberInfo(myJob, targetCid)
    if not info then return fail('Employee not found') end
    if info.grade >= job.getGrade(src) then return fail("You can't fire someone of equal or higher rank") end

    if info.activeHere then
        if not society.fire(targetCid, UNEMPLOYED) then return fail('That player must be online to be fired') end
        if info.saved then jobstore.removeSaved(targetCid, myJob) end
    else
        if info.saved then jobstore.removeSaved(targetCid, myJob) end
        if info.fw then jobstore.addPendingFire(targetCid, myJob) end
        if info.src then TriggerClientEvent('sd-phone:client:services:jobsChanged', info.src, {}) end
    end

    actions.notifyRoster(myJob)
    return ok({ myCompany = buildMyCompany(src) })
end

---Promotes an employee one grade up the company's ladder, kept below the caller's own rank:
---framework write when actively working, saved grade only when working elsewhere.
---@param src number
---@param payload { citizenid?: string }
function actions.promote(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local myJob, cid = requireBoss(src)
    if not myJob then return fail(cid) end
    local label = job.getLabel(myJob) or myJob

    local targetCid = tostring(payload.citizenid or '')
    if targetCid == '' then return fail('No employee selected') end
    if targetCid == cid then return fail("You can't promote yourself") end

    local info = memberInfo(myJob, targetCid)
    if not info then return fail('Employee not found') end

    local nextGrade
    for _, g in ipairs(society.getGrades(myJob)) do
        if g.level > info.grade then nextGrade = g.level; break end
    end
    if not nextGrade then return fail('They are already at the highest rank') end
    if nextGrade >= job.getGrade(src) then return fail("You can't promote someone to your own rank") end

    if info.activeHere then
        if not job.set(info.src, myJob, nextGrade) then return fail('Could not update their grade') end
        jobstore.addSaved(targetCid, myJob, nextGrade)
    elseif info.saved then
        jobstore.addSaved(targetCid, myJob, nextGrade)
    else
        return fail('That player must be online to be promoted')
    end

    if info.src then
        TriggerClientEvent('sd-phone:client:notify', info.src, {
            app = 'services', appId = 'services', title = label,
            body = ('You were promoted to %s.'):format(society.gradeLabel(myJob, nextGrade)),
            time = 'now',
        })
        TriggerClientEvent('sd-phone:client:services:jobsChanged', info.src, {})
    end
    actions.notifyRoster(myJob)

    return ok({ myCompany = buildMyCompany(src) })
end

---Demotes an employee one grade down the company's ladder (boss-only, rank-gated): framework
---write when actively working, saved grade only when working elsewhere.
---@param src number
---@param payload { citizenid?: string }
function actions.demote(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local myJob, cid = requireBoss(src)
    if not myJob then return fail(cid) end
    local label = job.getLabel(myJob) or myJob

    local targetCid = tostring(payload.citizenid or '')
    if targetCid == '' then return fail('No employee selected') end
    if targetCid == cid then return fail("You can't demote yourself") end

    local info = memberInfo(myJob, targetCid)
    if not info then return fail('Employee not found') end
    if info.grade >= job.getGrade(src) then return fail("You can't demote someone of equal or higher rank") end

    local prevGrade
    for _, g in ipairs(society.getGrades(myJob)) do
        if g.level < info.grade then prevGrade = g.level end
    end
    if not prevGrade then return fail('They are already at the lowest rank') end

    if info.activeHere then
        if not job.set(info.src, myJob, prevGrade) then return fail('Could not update their grade') end
        jobstore.addSaved(targetCid, myJob, prevGrade)
    elseif info.saved then
        jobstore.addSaved(targetCid, myJob, prevGrade)
    else
        return fail('That player must be online to be demoted')
    end

    if info.src then
        TriggerClientEvent('sd-phone:client:notify', info.src, {
            app = 'services', appId = 'services', title = label,
            body = ('You were demoted to %s.'):format(society.gradeLabel(myJob, prevGrade)),
            time = 'now',
        })
        TriggerClientEvent('sd-phone:client:services:jobsChanged', info.src, {})
    end
    actions.notifyRoster(myJob)

    return ok({ myCompany = buildMyCompany(src) })
end

---Resigns the caller from their current job: resets to the unemployed job, forgets the saved
---entry, drops the framework membership, and refreshes the roster.
---@param src number
---@return table
function actions.quit(src)
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end
    local myJob = job.getName(src)
    if not myJob or BLACKLIST[myJob] then return fail("You're not in a job") end
    if not job.set(src, UNEMPLOYED, 0) then return fail('Could not update your job') end
    jobstore.removeSaved(cid, myJob)
    job.leave(src, myJob)
    actions.notifyRoster(myJob)
    return ok({ myCompany = buildMyCompany(src) })
end

---Calls a company: rings every online, on-duty, call-accepting employee of the whitelisted job
---at once via the group-ring plumbing; calling your own company is refused.
---@param src number
---@param payload { job?: string }
---@return table
function actions.callCompany(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local entry = byJob[tostring(payload.job or '')]
    if not entry then return fail('Unknown company') end
    if not entry.canCall then return fail("You can't call this company") end
    if not player.getIdentifier(src) then return fail('Player not found') end
    if job.getName(src) == entry.job then return fail("You can't call the company you work for") end

    local targets   = {}
    local anyOnDuty = false
    for cid, tsrc in pairs(player.onlineCidMap()) do
        if tsrc ~= src and job.getName(tsrc) == entry.job then
            local prefs   = store.getPrefs(cid, entry.job)
            local onDuty  = job.getDuty(tsrc)
            if onDuty == nil then onDuty = prefs.duty end
            if onDuty then
                anyOnDuty = true
                if prefs.jobCalls then
                    targets[#targets + 1] = { src = tsrc, cid = cid }
                end
            end
        end
    end
    if #targets == 0 then
        return fail(anyOnDuty and 'No one is available to take your call' or 'No one is on duty right now')
    end

    return calls.callGroup(src, targets, entry.label, entry.callNumber)
end

---Reshapes stored inbox rows for a viewer; `viewerKind` decides which side renders as "me", and
---rich extras are unpacked from the JSON meta blob under a pcall guard.
---@param rows table[]
---@param viewerKind 'citizen'|'staff'
---@return table[]
local function serializeInbox(rows, viewerKind)
    local out = {}
    for _, r in ipairs(rows) do
        local mine = (viewerKind == 'citizen' and r.sender == 'citizen')
                  or (viewerKind == 'staff'   and r.sender == 'staff')
        local m = {
            id   = r.id,
            from = mine and 'me' or 'them',
            name = r.sender == 'staff' and (r.staff_name or 'Staff') or (r.citizen_name or ''),
            body = r.body or '',
            kind = r.kind or 'text',
            ts   = (tonumber(r.created_at) or 0) * 1000,
        }
        if r.meta and r.meta ~= '' then
            local okj, decoded = pcall(json.decode, r.meta)
            if okj and type(decoded) == 'table' then
                m.mediaUrl = decoded.mediaUrl
                m.wpCode   = decoded.wpCode
                m.wpSub    = decoded.wpSub
            end
        end
        out[#out + 1] = m
    end
    return out
end

---Returns the caller's full Services inbox: `personal` threads keyed by their own number and
---`job` customer threads for their configured company, with per-viewer unread counts. Read-only.
---@param src number
---@return table
function actions.inbox(src)
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local myNumber = digits(settings.getPhoneNumber(cid) or '')
    local myJob    = job.getName(src)

    local personal = {}
    if myNumber ~= '' then
        local unread = msgstore.personalUnread(cid, myNumber)
        for _, t in ipairs(msgstore.citizenThreads(myNumber)) do
            local e = byJob[t.job]
            personal[#personal + 1] = {
                key      = t.job,
                name     = (e and e.label) or t.job,
                color    = (e and e.color) or '#8E8E93',
                emoji    = (e and e.emoji) or '💬',
                preview  = t.last_body or '',
                ts       = (tonumber(t.created_at) or 0) * 1000,
                unread   = unread[t.job] or 0,
                messages = serializeInbox(msgstore.threadMessages(t.job, myNumber, 100), 'citizen'),
            }
        end
    end

    local jobThreads = {}
    local e = myJob and byJob[myJob]
    if e then
        local unread = msgstore.jobUnread(cid, myJob)
        for _, t in ipairs(msgstore.jobThreads(myJob)) do
            jobThreads[#jobThreads + 1] = {
                key      = t.citizen_number,
                name     = (t.citizen_name and t.citizen_name ~= '') and t.citizen_name or t.citizen_number,
                color    = e.color,
                emoji    = e.emoji,
                preview  = t.last_body or '',
                ts       = (tonumber(t.created_at) or 0) * 1000,
                unread   = unread[t.citizen_number] or 0,
                messages = serializeInbox(msgstore.threadMessages(myJob, t.citizen_number, 100), 'staff'),
            }
        end
    end

    return ok({ personal = personal, job = jobThreads, hasJob = e ~= nil })
end

---Marks a message thread read for the caller: scope 'job' keys by the customer's number,
---anything else is 'personal' keyed by the company job. Idempotent.
---@param src number
---@param payload { scope?: string, key?: string }
---@return table
function actions.markThreadRead(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end
    local key = tostring(payload.key or '')
    if key == '' then return fail('Missing thread') end

    if payload.scope == 'job' then
        local myJob = job.getName(src)
        if myJob and byJob[myJob] then msgstore.markRead(cid, myJob, key:sub(1, 32), os.time()) end
    else
        local myNumber = digits(settings.getPhoneNumber(cid) or '')
        if myNumber ~= '' then msgstore.markRead(cid, key:sub(1, 64), myNumber, os.time()) end
    end
    return ok()
end

---Notifies and live-refreshes every online, on-duty employee of a job about a customer message;
---the banner is opt-in (Job Messages toggle) and quiet inside the Services app.
---@param jobName string
---@param title string
---@param body string
local function notifyStaff(jobName, title, body)
    for ecid, esrc in pairs(player.onlineCidMap()) do
        if job.getName(esrc) == jobName then
            local prefs  = store.getPrefs(ecid, jobName)
            local onDuty = job.getDuty(esrc)
            if onDuty == nil then onDuty = prefs.duty end
            if onDuty then
                if prefs.jobMessages then
                    TriggerClientEvent('sd-phone:client:notify', esrc, {
                        app = 'services', appId = 'services', title = title, body = body, time = 'now',
                        quietInApp = true,
                    })
                end
                TriggerClientEvent('sd-phone:client:services:inbox', esrc, {})
            end
        end
    end
end

---Sends a customer message to a whitelisted company: files it into the (job, my number) thread,
---pings on-duty staff, and returns the customer's refreshed inbox.
---@param src number
---@param payload { job?: string, kind?: string, body?: string, mediaUrl?: string, wpCode?: string, wpSub?: string }
---@return table
function actions.messageCompany(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local entry = byJob[tostring(payload.job or '')]
    if not entry then return fail('Unknown company') end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local kind, body, meta = parseDraft(payload)
    if not kind then return fail(body) end

    local myNumber = digits(settings.ensurePhoneNumber(cid) or '')
    if myNumber == '' then return fail('No phone number') end
    local myName = player.getName(src)

    msgstore.insert({
        id = msgstore.newId(), job = entry.job,
        citizenNumber = myNumber, citizenName = myName,
        sender = 'citizen', body = body, kind = kind, meta = meta, createdAt = os.time(),
    })
    notifyStaff(entry.job, entry.label, myName .. ': ' .. body)

    ---First-party hook: fires once per stored customer -> company message.
    TriggerEvent('sd-phone:server:services:message', {
        source = src, citizenid = cid, job = entry.job, label = entry.label,
        number = myNumber, name = myName, kind = kind, body = body, meta = meta,
    })

    return ok({ inbox = actions.inbox(src).data })
end

---Sends a staff reply to a customer on behalf of the caller's current company; notifies the
---customer if online and returns the staff member's refreshed inbox.
---@param src number
---@param payload { citizen?: string, kind?: string, body?: string, mediaUrl?: string, wpCode?: string, wpSub?: string }
---@return table
function actions.replyCompany(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end
    local myJob = job.getName(src)
    local entry = myJob and byJob[myJob]
    if not entry then return fail("You're not in a company") end

    local citizenNumber = digits(payload.citizen):sub(1, 32)
    if citizenNumber == '' then return fail('No recipient') end
    local kind, body, meta = parseDraft(payload)
    if not kind then return fail(body) end

    msgstore.insert({
        id = msgstore.newId(), job = entry.job,
        citizenNumber = citizenNumber, sender = 'staff',
        staffCid = cid, staffName = player.getName(src),
        body = body, kind = kind, meta = meta, createdAt = os.time(),
    })

    local custCid = settings.getCitizenByNumber(citizenNumber)
    local custSrc = custCid and player.getSourceByIdentifier(custCid)
    if custSrc then
        TriggerClientEvent('sd-phone:client:notify', custSrc, {
            app = 'services', appId = 'services', title = entry.label, body = body, time = 'now',
            quietInApp = true,
        })
        TriggerClientEvent('sd-phone:client:services:inbox', custSrc, {})
    end

    return ok({ inbox = actions.inbox(src).data })
end

---@type table<number, string> Cached citizenid per connected src (set on load, cleared on drop).
local srcToCid = {}

---Applies phone-managed job changes from while the player was offline: consumes a pending fire,
---syncs the active job's grade to the saved grade, or seeds a missing saved entry; caches src -> cid.
---@param src number
function actions.reconcileJobs(src)
    local cid = player.getIdentifier(src)
    if not cid then return end
    srcToCid[src] = cid

    local activeJob = job.getName(src)
    if not activeJob or activeJob == '' or BLACKLIST[activeJob] then return end

    if jobstore.takePendingFire(cid, activeJob) then
        job.set(src, UNEMPLOYED, 0)
        return
    end

    local saved = jobstore.getSaved(cid)[activeJob]
    if saved then
        local savedGrade = math.floor(tonumber(saved.grade) or 0)
        if savedGrade ~= (job.getGrade(src) or 0) then
            job.set(src, activeJob, savedGrade)
        end
    else
        jobstore.addSaved(cid, activeJob, job.getGrade(src) or 0)
    end
end

---Refreshes the rosters of every company a disconnecting player belonged to, using the cached
---citizenid and their saved jobs on a fresh thread.
---@param src number
function actions.onPlayerDropped(src)
    local cid = srcToCid[src]
    srcToCid[src] = nil
    if not cid then return end
    CreateThread(function()
        for jobName in pairs(jobstore.getSaved(cid)) do
            actions.notifyRoster(jobName)
        end
    end)
end

return actions
