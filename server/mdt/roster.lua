---@type table sd-phone config root (configs/config.lua).
local config   = require 'configs.config'
---@type table MDT permissions (server.mdt.access): identity, wrappers, chain of command.
local access   = require 'server.mdt.access'
---@type table MDT persistence (server.mdt.store): officer profiles and shift sessions.
local store    = require 'server.mdt.store'
---@type table CAD (server.mdt.dispatch): keeps a unit on the air in step with a callsign change.
local dispatch = require 'server.mdt.dispatch'
---@type table Shared server helpers (server.util): envelopes, clamps, string caps.
local util     = require 'server.util'
---@type table Player bridge (bridge.server.player): online map and source resolution.
local player   = require 'bridge.server.player'
---@type table Job bridge (bridge.server.job): live grade and duty reads.
local job      = require 'bridge.server.job'
---@type table Society bridge (bridge.server.society): employee list, grade ladder, hire and fire.
local society  = require 'bridge.server.society'

---@type table Roster module; the table returned at end of file.
local roster = {}

---@type table MDT config (configs/mdt.lua).
local MDT = config.Mdt
---@type integer Rows one roster page carries.
local PAGE_SIZE = math.max(1, math.floor(tonumber((MDT.Paging or {}).PageSize) or 25))
---@type integer Members read before paging, so one huge department cannot stall a read.
local ROSTER_LIMIT = 400
---@type integer Longest accepted callsign, in characters.
local MAX_CALLSIGN = math.floor(tonumber((MDT.Limits or {}).Callsign) or 12)
---@type integer Longest accepted radio channel label, in characters.
local MAX_RADIO = math.floor(tonumber((MDT.Limits or {}).RadioChannel) or 12)
---@type string Sequence format an auto-generated callsign is minted with.
local CALLSIGN_FORMAT = (MDT.Dispatch or {}).CallsignFormat or '%s-%03d'
---@type string Job a dismissed member is reset to.
local UNEMPLOYED = (config.Services or {}).UnemployedJob or 'unemployed'

---Comma-separated `?` placeholders for an IN clause of `n` values.
---@param n integer value count
---@return string clause
local function marks(n)
    local out = {}
    for i = 1, n do out[i] = '?' end
    return table.concat(out, ',')
end

---Clocked seconds per citizenid, open shifts included, in one aggregate read.
---@param cids string[] citizenids on the page
---@return table<string, integer> seconds
local function shiftSeconds(cids)
    local out = {}
    if #cids == 0 then return out end

    local params = { os.time() }
    for i = 1, #cids do params[i + 1] = cids[i] end

    local rows = MySQL.query.await(([[
        SELECT citizenid, COALESCE(SUM(COALESCE(logout_at, ?) - login_at), 0) AS seconds
        FROM phone_mdt_profile_sessions WHERE citizenid IN (%s) GROUP BY citizenid
    ]]):format(marks(#cids)), params) or {}

    for i = 1, #rows do out[rows[i].citizenid] = math.max(0, tonumber(rows[i].seconds) or 0) end
    return out
end

---Row counts per citizenid for one column of one table, in one aggregate read.
---@param tbl string table name
---@param column string citizenid column on that table
---@param cids string[] citizenids on the page
---@return table<string, integer> counts
local function countsBy(tbl, column, cids)
    local out = {}
    if #cids == 0 then return out end

    local rows = MySQL.query.await((
        'SELECT `%s` AS cid, COUNT(*) AS n FROM `%s` WHERE `%s` IN (%s) GROUP BY `%s`'
    ):format(column, tbl, column, marks(#cids), column), cids) or {}

    for i = 1, #rows do out[rows[i].cid] = tonumber(rows[i].n) or 0 end
    return out
end

---The department's grade ladder: a level to label map plus the ordered array the rank picker reads.
---@param dept table department config entry
---@return table<integer, string> labels, table[] ladder
local function gradeLadder(dept)
    local labels, ladder = {}, {}
    local bossGrade = tonumber(dept.bossGrade)
    for _, g in ipairs(society.getGrades(dept.job)) do
        labels[g.level] = g.label
        ladder[#ladder + 1] = {
            level  = g.level,
            label  = g.label,
            isboss = bossGrade ~= nil and g.level >= bossGrade,
        }
    end
    return labels, ladder
end

---Provisions an MDT record for a department member who has never opened a terminal, so a callsign
---or radio channel can be assigned to them before their first shift.
---@param me table caller identity from access.identity
---@param member table { citizenid, name, grade }
---@param rank string grade label
---@return table profile
local function ensureMemberProfile(me, member, rank)
    return store.ensureProfile(member.citizenid, {
        name           = member.name,
        department     = me.job,
        grade          = member.grade,
        rank           = rank,
        callsignPrefix = me.department.callsign or me.department.short or 'U',
        callsignFormat = CALLSIGN_FORMAT,
    })
end

---Public officer row: framework identity merged with the MDT profile overlay and the counters.
---@param member table { citizenid, name, grade }
---@param profile table|nil MDT profile
---@param labels table<integer, string> grade level to label
---@param onlineSrc integer|nil the member's live server id
---@param seconds integer clocked seconds
---@param reports integer reports filed
---@param arrests integer arrests made
---@return table officer
local function officerRow(member, profile, labels, onlineSrc, seconds, reports, arrests)
    local duty = onlineSrc ~= nil and job.getDuty(onlineSrc) == true
    return {
        citizenid  = member.citizenid,
        name       = (profile and profile.name) or member.name,
        callsign   = profile and profile.callsign or nil,
        badge      = profile and profile.badge or nil,
        radio      = profile and profile.radio or nil,
        rank       = labels[member.grade] or (profile and profile.rank) or ('Grade ' .. tostring(member.grade)),
        gradeLevel = member.grade,
        avatar     = profile and profile.avatar or nil,
        online     = onlineSrc ~= nil,
        duty       = duty,
        hours      = lib.math.round((seconds / 3600), 1),
        reports    = reports,
        arrests    = arrests,
    }
end

---Every member of a department, capped, with their MDT profiles. Sorted online first, then
---seniority, then name.
---@param dept table department config entry
---@return table[] members, table<string, table> profiles
local function departmentMembers(dept)
    local members = society.listEmployees(dept.job)
    local online = player.onlineCidMap()

    table.sort(members, function(a, b)
        local ao, bo = online[a.citizenid] ~= nil, online[b.citizenid] ~= nil
        if ao ~= bo then return ao end
        if a.grade ~= b.grade then return a.grade > b.grade end
        return a.name < b.name
    end)

    if #members > ROSTER_LIMIT then
        local capped = {}
        for i = 1, ROSTER_LIMIT do capped[i] = members[i] end
        members = capped
    end

    local cids = {}
    for i = 1, #members do cids[i] = members[i].citizenid end

    return members, store.profilesFor(cids)
end

---Resolves a target citizenid inside the caller's own department, so no handler can act on
---somebody outside it.
---@param me table caller identity from access.identity
---@param citizenid any client-supplied citizenid
---@return table|nil member, string? reason
local function memberOf(me, citizenid)
    local cid = util.limitedString(citizenid, 64)
    if not cid then return nil, 'No officer selected' end
    for _, m in ipairs(society.listEmployees(me.job)) do
        if m.citizenid == cid then return m end
    end
    return nil, 'That officer is not in your department'
end

---Rebuilds one officer row, for the envelope a mutation echoes back.
---@param me table caller identity from access.identity
---@param member table { citizenid, name, grade }
---@return table officer
local function rowFor(me, member)
    local labels = gradeLadder(me.department)
    local cids = { member.citizenid }
    return officerRow(
        member,
        store.profilesFor(cids)[member.citizenid],
        labels,
        player.getSourceByIdentifier(member.citizenid),
        shiftSeconds(cids)[member.citizenid] or 0,
        countsBy('phone_mdt_reports', 'author_cid', cids)[member.citizenid] or 0,
        countsBy('phone_mdt_arrests', 'officer_cid', cids)[member.citizenid] or 0
    )
end

---The department roster, paginated. The grade ladder rides along only for a caller who may
---actually re-grade someone, so a constable's terminal never receives the rank list at all.
roster.list = access.gated('roster.view', function(src, payload, me)
    local members, profiles = departmentMembers(me.department)
    local labels, ladder = gradeLadder(me.department)

    local query = (util.limitedString(payload.query, 40) or ''):lower()
    if query ~= '' then
        local filtered = {}
        for _, m in ipairs(members) do
            local profile = profiles[m.citizenid]
            local callsign = (profile and profile.callsign or ''):lower()
            if m.name:lower():find(query, 1, true) or callsign:find(query, 1, true) then
                filtered[#filtered + 1] = m
            end
        end
        members = filtered
    end

    local total = #members
    local pages = math.max(1, math.ceil(total / PAGE_SIZE))
    local page = math.floor(tonumber(payload.page) or 1)
    if page < 1 then page = 1 end
    if page > pages then page = pages end

    local first = (page - 1) * PAGE_SIZE + 1
    local pageMembers, pageCids = {}, {}
    for i = first, math.min(first + PAGE_SIZE - 1, total) do
        pageMembers[#pageMembers + 1] = members[i]
        pageCids[#pageCids + 1] = members[i].citizenid
    end

    local seconds = shiftSeconds(pageCids)
    local reports = countsBy('phone_mdt_reports', 'author_cid', pageCids)
    local arrests = countsBy('phone_mdt_arrests', 'officer_cid', pageCids)
    local online  = player.onlineCidMap()

    local rows = {}
    for i = 1, #pageMembers do
        local m = pageMembers[i]
        rows[i] = officerRow(m, profiles[m.citizenid], labels, online[m.citizenid],
            seconds[m.citizenid] or 0, reports[m.citizenid] or 0, arrests[m.citizenid] or 0)
    end

    return util.ok({
        rows     = rows,
        grades   = access.can(src, 'roster.grade') and ladder or nil,
        total    = total,
        page     = page,
        pageSize = PAGE_SIZE,
    })
end)

---Sets another officer's callsign. The unique index on the column is what actually enforces it.
roster.setCallsign = access.audited('roster.callsign', function(_src, payload, me)
    local member, reason = memberOf(me, payload.citizenid)
    if not member then return util.fail(reason) end

    local callsign = util.limitedString(payload.callsign, MAX_CALLSIGN)
    if not callsign then return util.fail('Enter a callsign') end
    callsign = callsign:upper()

    local labels = gradeLadder(me.department)
    ensureMemberProfile(me, member, labels[member.grade] or '')

    local profile, err = store.updateProfile(member.citizenid, { callsign = callsign })
    if not profile then return util.fail(err or 'That callsign could not be set') end
    dispatch.setCallsign(member.citizenid, callsign)

    return util.ok({ officer = rowFor(me, member) }),
        { entityType = 'officer', entityId = member.citizenid, details = { callsign = callsign } }
end)

---Sets another officer's radio channel.
roster.setRadio = access.audited('roster.radio', function(_src, payload, me)
    local member, reason = memberOf(me, payload.citizenid)
    if not member then return util.fail(reason) end

    local channel = util.limitedString(payload.channel, MAX_RADIO)
    if not channel then return util.fail('Enter a radio channel') end

    local labels = gradeLadder(me.department)
    ensureMemberProfile(me, member, labels[member.grade] or '')

    local profile, err = store.updateProfile(member.citizenid, { radio = channel })
    if not profile then return util.fail(err or 'That channel could not be set') end

    return util.ok({ officer = rowFor(me, member) }),
        { entityType = 'officer', entityId = member.citizenid, details = { radio = channel } }
end)

---Re-grades another officer. Chain of command sits on top of the permission key: never a peer,
---never a superior, never yourself, and never to a grade at or above your own.
roster.setGrade = access.audited('roster.grade', function(src, payload, me)
    local member, reason = memberOf(me, payload.citizenid)
    if not member then return util.fail(reason) end

    local ok, refusal = access.belowMe(src, member.citizenid)
    if not ok then return util.fail(refusal) end

    local grade = math.floor(tonumber(payload.grade) or -1)
    if grade < 0 then return util.fail('Pick a rank') end
    if grade >= me.grade then return util.fail('You cannot set a rank at or above your own') end

    local labels, ladder = gradeLadder(me.department)
    local known = false
    for i = 1, #ladder do
        if ladder[i].level == grade then
            known = true
            break
        end
    end
    if not known then return util.fail('That rank does not exist') end

    if not society.hire(me.job, member.citizenid, grade) then
        return util.fail('That officer has to be online to be re-graded')
    end

    member.grade = grade
    ensureMemberProfile(me, member, labels[grade] or '')
    store.updateProfile(member.citizenid, { grade = grade, rank = labels[grade] or '' })

    return util.ok({ officer = rowFor(me, member) }),
        { entityType = 'officer', entityId = member.citizenid, details = { grade = grade, rank = labels[grade] } }
end)

---Dismisses another officer to the unemployed job. Same chain-of-command guard as setGrade; the
---MDT record is left on file so their paperwork keeps its author.
roster.dismiss = access.audited('roster.dismiss', function(src, payload, me)
    local member, reason = memberOf(me, payload.citizenid)
    if not member then return util.fail(reason) end

    local ok, refusal = access.belowMe(src, member.citizenid)
    if not ok then return util.fail(refusal) end

    if not society.fire(member.citizenid, UNEMPLOYED) then
        return util.fail('That officer has to be online to be dismissed')
    end

    return util.ok({ citizenid = member.citizenid }),
        { entityType = 'officer', entityId = member.citizenid, details = { name = member.name } }
end)

---Resolves an officer's live server id so the caller can page them. A nil source means they are
---not on the air.
roster.page = access.gated('roster.view', function(_src, payload, me)
    local member, reason = memberOf(me, payload.citizenid)
    if not member then return util.fail(reason) end

    return util.ok({
        source = player.getSourceByIdentifier(member.citizenid),
        name   = member.name,
    })
end)

---Updates the signed-in officer's own profile fields.
roster.meUpdate = access.audited('me.update', function(src, payload, me)
    local fields = {}

    if payload.callsign ~= nil then
        local callsign = util.limitedString(payload.callsign, MAX_CALLSIGN)
        if not callsign then return util.fail('Enter a callsign') end
        fields.callsign = callsign:upper()
    end
    if payload.avatar ~= nil then
        fields.avatar = util.limitedString(payload.avatar, math.floor(tonumber((MDT.Limits or {}).MediaUrl) or 512)) or ''
    end
    if payload.notes ~= nil then
        fields.notes = util.limitedString(payload.notes, 4000) or ''
    end
    if next(fields) == nil then return util.fail('Nothing to save') end

    local profile, err = store.updateProfile(me.citizenid, fields)
    if not profile then return util.fail(err or 'That change could not be saved') end
    if fields.callsign then dispatch.setCallsign(me.citizenid, fields.callsign) end

    return util.ok({
        me = {
            citizenid  = me.citizenid,
            name       = profile.name,
            callsign   = profile.callsign,
            badge      = profile.badge,
            radio      = profile.radio,
            rank       = me.rank,
            gradeLevel = me.grade,
            avatar     = profile.avatar,
            duty       = job.getDuty(src) ~= false,
        },
    }), { entityType = 'officer', entityId = me.citizenid, details = fields }
end)

return roster
