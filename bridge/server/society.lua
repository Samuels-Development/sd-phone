---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx') + live core handle.
local framework = require 'bridge.shared.framework'
---@type table Job bridge (bridge.server.job): job.set powers the online-only hire/fire paths.
local job       = require 'bridge.server.job'
---@type table|nil ox_core helpers (bridge.shared.oxcore); nil on every other framework.
local oxc       = framework.name == 'ox' and require 'bridge.shared.oxcore' or nil
---@type table|nil ND_Core helpers (bridge.shared.ndcore); nil on every other framework.
local ndc       = framework.name == 'nd' and require 'bridge.shared.ndcore' or nil
---@type table Player bridge (bridge.server.player): identifier -> online source resolution.
local player    = require 'bridge.server.player'

---@type table Society module; the table returned at end of file. Reads and moves a company's
---shared balance and reads its employee roster across the supported money + management resources;
---a provider decline propagates as false.
local society = {}

-- Society money provider export shapes:
--   qb-banking      : GetAccountBalance / AddMoney / RemoveMoney (account, amount, reason)
--   Renewed-Banking : getAccountMoney / addAccountMoney / removeAccountMoney (account, amount)
--   qbx_management  : GetAccount / AddMoney / RemoveMoney (account[, amount])
--   qb-management   : GetAccount / AddMoney / RemoveMoney (account[, amount])
--   esx_addonaccount / esx_society : esx_addonaccount:getSharedAccount('society_<job>') ->
--                     { money, addMoney, removeMoney }
---@type string[] Society money providers, in detection-priority order.
local KNOWN = {
    'qb-banking', 'Renewed-Banking', 'qbx_management', 'qb-management',
    'esx_addonaccount', 'esx_society',
}

---@type boolean, string|nil Detection-ran flag + cached provider name (nil = none started).
local resolved, providerName = false, nil

---The active society money provider, resolved lazily and cached on first use. Nil when none is
---started.
---@return string|nil
local function provider()
    if not resolved then
        for _, name in ipairs(KNOWN) do
            if GetResourceState(name) == 'started' then providerName = name; break end
        end
        resolved = true
        print(('^2[sd-phone:society]^0 society provider: ^3%s^0'):format(providerName or 'none'))
    end
    return providerName
end

---Run a provider export/event call. Returns false when it errored or the provider returned an
---explicit `false`; any other no-error result counts as success.
---@param fn function
---@return boolean
local function try(fn)
    local ok, res = pcall(fn)
    if not ok then return false end
    return res ~= false
end

---Default society account name for a job ('society_police'), overridable per company in
---configs/services.lua.
---@param jobName string
---@param override? string
---@return string
local function accName(jobName, override)
    return override or ('society_' .. jobName)
end

---True when a society money provider is running.
---@return boolean
function society.available()
    -- ox_core needs no provider: it creates a shared account per group at setup, so the company
    -- money the other frameworks farm out to qb-banking or esx_addonaccount is built in.
    if framework.name == 'ox' then return true end
    -- ND has no group account and no management resource of its own, and the providers below are
    -- all qb/ESX-only, so there is nothing truthful to read: the Services app hides company money.
    if framework.name == 'nd' then return false end
    return provider() ~= nil
end

---A company's shared balance; 0 when no provider is running or the account can't be read.
---Read-only. Account keys are probed per provider ('society_<job>', bare job name, override).
---@param jobName string
---@param override? string society account name override
---@return number
function society.getBalance(jobName, override)
    if framework.name == 'ox' then
        local acc = oxc.groupAccount(override or jobName)
        return (acc and tonumber(acc.balance)) or 0
    end

    local name = provider()
    local acc  = accName(jobName, override)

    if name == 'qb-banking' then
        for _, key in ipairs({ acc, jobName }) do
            local ok, bal = pcall(function() return exports['qb-banking']:GetAccountBalance(key) end)
            if ok and type(bal) == 'number' and bal ~= 0 then return bal end
        end
        local ok, bal = pcall(function() return exports['qb-banking']:GetAccountBalance(acc) end)
        if ok and type(bal) == 'number' then return bal end

    elseif name == 'Renewed-Banking' then
        for _, key in ipairs({ override or jobName, 'society_' .. jobName }) do
            local ok, bal = pcall(function() return exports['Renewed-Banking']:getAccountMoney(key) end)
            if ok and type(bal) == 'number' then return bal end
        end

    elseif name == 'qbx_management' or name == 'qb-management' then
        local ok, bal = pcall(function() return exports[name]:GetAccount(jobName) end)
        if ok and type(bal) == 'number' then return bal end

    elseif name == 'esx_addonaccount' or name == 'esx_society' then
        local bal
        pcall(function()
            TriggerEvent('esx_addonaccount:getSharedAccount', acc, function(account)
                bal = account and account.money or nil
            end)
        end)
        if type(bal) == 'number' then return bal end
    end

    return 0
end

---Credit a company's shared balance. Returns true only if the credit landed; a provider decline
---propagates as false. Never falls through to personal money.
---@param jobName string
---@param amount number positive magnitude
---@param reason? string
---@param override? string
---@return boolean
function society.addMoney(jobName, amount, reason, override)
    if framework.name == 'ox' then
        local acc = oxc.groupAccount(override or jobName)
        if not acc then return false end
        return oxc.accountCall(acc.accountId, 'addBalance',
            { amount = amount, message = reason or 'Phone society deposit' }) ~= false
    end

    local name = provider()
    if not name then return false end
    local acc = accName(jobName, override)
    reason = reason or 'Phone society deposit'

    if name == 'qb-banking' then
        return try(function() return exports['qb-banking']:AddMoney(acc, amount, reason) end)
    elseif name == 'Renewed-Banking' then
        return try(function() return exports['Renewed-Banking']:addAccountMoney(override or jobName, amount) end)
    elseif name == 'qbx_management' or name == 'qb-management' then
        return try(function() return exports[name]:AddMoney(jobName, amount) end)
    elseif name == 'esx_addonaccount' or name == 'esx_society' then
        local done = false
        pcall(function()
            TriggerEvent('esx_addonaccount:getSharedAccount', acc, function(account)
                if account then account.addMoney(amount); done = true end
            end)
        end)
        return done
    end
    return false
end

---Debit a company's shared balance. Returns true only if the debit landed; the esx_addonaccount
---path checks sufficiency before calling removeMoney.
---@param jobName string
---@param amount number positive magnitude
---@param reason? string
---@param override? string
---@return boolean
function society.removeMoney(jobName, amount, reason, override)
    if framework.name == 'ox' then
        local acc = oxc.groupAccount(override or jobName)
        if not acc then return false end
        -- overdraw false: a company account must refuse rather than go negative.
        return oxc.accountCall(acc.accountId, 'removeBalance',
            { amount = amount, overdraw = false, message = reason or 'Phone society withdrawal' }) ~= false
    end

    local name = provider()
    if not name then return false end
    local acc = accName(jobName, override)
    reason = reason or 'Phone society withdrawal'

    if name == 'qb-banking' then
        return try(function() return exports['qb-banking']:RemoveMoney(acc, amount, reason) end)
    elseif name == 'Renewed-Banking' then
        return try(function() return exports['Renewed-Banking']:removeAccountMoney(override or jobName, amount) end)
    elseif name == 'qbx_management' or name == 'qb-management' then
        return try(function() return exports[name]:RemoveMoney(jobName, amount) end)
    elseif name == 'esx_addonaccount' or name == 'esx_society' then
        local done = false
        pcall(function()
            TriggerEvent('esx_addonaccount:getSharedAccount', acc, function(account)
                if account and (tonumber(account.money) or 0) >= amount then
                    account.removeMoney(amount)
                    done = true
                end
            end)
        end)
        return done
    end
    return false
end

---A job's grade ladder as `{ {level, label}, ... }` ordered by level. Read-only. On 'qb' the
---definition comes from Shared.Jobs, then the qbx_core GetJob export; on ESX from job_grades.
---@param jobName string
---@return { level: number, label: string }[]
function society.getGrades(jobName)
    local out = {}

    if framework.name == 'ox' then
        -- ox_core stores a group's ladder as an array of labels, so the index IS the grade. It is
        -- 1-based: there is no grade 0, that value means "not in the group".
        local def = oxc.group(jobName)
        local grades = def and def.grades
        if type(grades) == 'table' then
            for level, label in ipairs(grades) do
                out[#out + 1] = { level = level, label = label or ('Grade ' .. level) }
            end
        end
        return out
    end

    if framework.name == 'nd' then
        -- ND weights ranks from 1 upward in `nd_group_ranks`, so the weight IS the grade level.
        local def = ndc.group(jobName)
        local ranks = def and def.ranksData
        if type(ranks) == 'table' then
            for weight, rank in pairs(ranks) do
                local lvl = tonumber(weight) or 0
                out[#out + 1] = { level = lvl, label = (type(rank) == 'table' and rank.label) or ('Grade ' .. lvl) }
            end
        end
        table.sort(out, function(a, b) return a.level < b.level end)
        return out
    end

    if framework.qb then
        local def
        if framework.name == 'qbx' then
            pcall(function() def = exports.qbx_core:GetJob(jobName) end)
        end
        if not def and framework.core and framework.core.Shared and framework.core.Shared.Jobs then
            def = framework.core.Shared.Jobs[jobName]
        end
        if not def then
            pcall(function() def = exports.qbx_core:GetJob(jobName) end)
        end
        if def and type(def.grades) == 'table' then
            for level, g in pairs(def.grades) do
                local lvl = tonumber(level) or 0
                out[#out + 1] = { level = lvl, label = (type(g) == 'table' and g.name) or ('Grade ' .. lvl) }
            end
        end

    elseif framework.name == 'esx' then
        local ok, rows = pcall(function()
            return MySQL.query.await(
                'SELECT grade, label FROM job_grades WHERE job_name = ? ORDER BY grade ASC', { jobName })
        end)
        if ok and type(rows) == 'table' then
            for _, r in ipairs(rows) do
                out[#out + 1] = { level = tonumber(r.grade) or 0, label = r.label or ('Grade ' .. tostring(r.grade)) }
            end
        end
    end

    table.sort(out, function(a, b) return a.level < b.level end)
    return out
end

---Resolve a grade level to its label for a job; "Grade N" when the ladder doesn't know the level.
---@param jobName string
---@param level number
---@return string
function society.gradeLabel(jobName, level)
    for _, g in ipairs(society.getGrades(jobName)) do
        if g.level == level then return g.label end
    end
    return 'Grade ' .. tostring(level or 0)
end

---A company's employees from the framework's player table as `{ {citizenid, name, grade}, ... }`,
---offline employees included. Read-only; malformed charinfo/job JSON degrades a row to citizenid + grade 0.
---@param jobName string
---@return { citizenid: string, name: string, grade: number }[]
function society.listEmployees(jobName)
    local out = {}

    if framework.name == 'ox' then
        local ok, rows = pcall(function()
            return MySQL.query.await([[
                SELECT cg.charId, cg.grade, c.firstName, c.lastName
                FROM character_groups cg
                JOIN characters c ON c.charId = cg.charId
                WHERE cg.name = ?
            ]], { jobName })
        end)
        if ok and type(rows) == 'table' then
            for _, r in ipairs(rows) do
                out[#out + 1] = {
                    citizenid = tostring(r.charId),
                    name      = ('%s %s'):format(r.firstName or '', r.lastName or ''),
                    grade     = tonumber(r.grade) or 0,
                }
            end
        end
        return out
    end

    if framework.name == 'nd' then
        -- ND keeps a character's groups as a JSON object keyed by group name rather than in a join
        -- table, so membership is a path test and the rank is read out of the same blob.
        local ok, rows = pcall(function()
            return MySQL.query.await([[
                SELECT charid, firstname, lastname,
                       JSON_EXTRACT(`groups`, CONCAT('$."', ?, '".rank')) AS rank
                FROM nd_characters
                WHERE JSON_CONTAINS_PATH(`groups`, 'one', CONCAT('$."', ?, '"'))
                  AND deleted_at IS NULL
            ]], { jobName, jobName })
        end)
        if ok and type(rows) == 'table' then
            for _, r in ipairs(rows) do
                local cid  = tostring(r.charid)
                local name = ('%s %s'):format(r.firstname or '', r.lastname or ''):gsub('^%s+', ''):gsub('%s+$', '')
                out[#out + 1] = {
                    citizenid = cid,
                    name      = name ~= '' and name or cid,
                    grade     = tonumber(r.rank) or 0,
                }
            end
        end
        return out
    end

    if framework.qb then
        local ok, rows = pcall(function()
            return MySQL.query.await([[
                SELECT citizenid, charinfo, job FROM players
                WHERE JSON_UNQUOTE(JSON_EXTRACT(job, '$.name')) = ?
            ]], { jobName })
        end)
        if ok and type(rows) == 'table' then
            for _, r in ipairs(rows) do
                local name, grade = r.citizenid, 0
                local okc, ci = pcall(json.decode, r.charinfo)
                if okc and type(ci) == 'table' then
                    name = ('%s %s'):format(ci.firstname or '', ci.lastname or ''):gsub('^%s+', ''):gsub('%s+$', '')
                end
                local okj, jb = pcall(json.decode, r.job)
                if okj and type(jb) == 'table' and jb.grade then grade = tonumber(jb.grade.level) or 0 end
                out[#out + 1] = { citizenid = r.citizenid, name = name ~= '' and name or r.citizenid, grade = grade }
            end
        end

    elseif framework.name == 'esx' then
        local ok, rows = pcall(function()
            return MySQL.query.await([[
                SELECT identifier, firstname, lastname, job_grade FROM users WHERE job = ?
            ]], { jobName })
        end)
        if ok and type(rows) == 'table' then
            for _, r in ipairs(rows) do
                local name = ('%s %s'):format(r.firstname or '', r.lastname or ''):gsub('^%s+', ''):gsub('%s+$', '')
                out[#out + 1] = {
                    citizenid = r.identifier,
                    name      = name ~= '' and name or r.identifier,
                    grade     = tonumber(r.job_grade) or 0,
                }
            end
        end
    end

    return out
end

---Resolve character names for a set of citizenids from the framework player table (works for
---offline players): `{ [citizenid] = name }`. Malformed charinfo falls back to the citizenid.
---@param cids string[]
---@return table<string, string>
function society.namesByCids(cids)
    local out = {}
    if not cids or #cids == 0 then return out end

    local placeholders = {}
    for i = 1, #cids do placeholders[i] = '?' end
    local inClause = table.concat(placeholders, ',')

    if framework.qb then
        local ok, rows = pcall(function()
            return MySQL.query.await(('SELECT citizenid, charinfo FROM players WHERE citizenid IN (%s)'):format(inClause), cids)
        end)
        if ok and type(rows) == 'table' then
            for _, r in ipairs(rows) do
                local name = r.citizenid
                local okc, ci = pcall(json.decode, r.charinfo)
                if okc and type(ci) == 'table' then
                    local n = ('%s %s'):format(ci.firstname or '', ci.lastname or ''):gsub('^%s+', ''):gsub('%s+$', '')
                    if n ~= '' then name = n end
                end
                out[r.citizenid] = name
            end
        end
    elseif framework.name == 'esx' then
        local ok, rows = pcall(function()
            return MySQL.query.await(('SELECT identifier, firstname, lastname FROM users WHERE identifier IN (%s)'):format(inClause), cids)
        end)
        if ok and type(rows) == 'table' then
            for _, r in ipairs(rows) do
                local n = ('%s %s'):format(r.firstname or '', r.lastname or ''):gsub('^%s+', ''):gsub('%s+$', '')
                out[r.identifier] = n ~= '' and n or r.identifier
            end
        end
    elseif framework.name == 'nd' then
        local ids = {}
        for i = 1, #cids do ids[i] = tonumber(cids[i]) end
        local ok, rows = pcall(function()
            return MySQL.query.await(('SELECT charid, firstname, lastname FROM nd_characters WHERE charid IN (%s)'):format(inClause), ids)
        end)
        if ok and type(rows) == 'table' then
            for _, r in ipairs(rows) do
                local cid = tostring(r.charid)
                local n = ('%s %s'):format(r.firstname or '', r.lastname or ''):gsub('^%s+', ''):gsub('%s+$', '')
                out[cid] = n ~= '' and n or cid
            end
        end
    end

    return out
end

---Set an online target's job to `jobName` at `grade`. Returns false when the target isn't
---currently connected. No permission checks here.
---@param jobName string
---@param targetCid string
---@param grade? number
---@return boolean
function society.hire(jobName, targetCid, grade)
    local src = player.getSourceByIdentifier(targetCid)
    if not src then return false end
    return job.set(src, jobName, grade or 0) == true
end

---Reset an online target to the unemployed job. Returns false when offline. No permission checks
---here.
---
---`fromJob` is only read on ox_core and ND, neither of which has an unemployed group to move
---someone into: being fired there means the group is REMOVED, so the caller has to say which one.
---The other frameworks ignore it and move the target to `unemployedJob` as before.
---@param targetCid string
---@param unemployedJob string
---@param fromJob? string the job being fired from; required on ox_core and ND
---@return boolean
function society.fire(targetCid, unemployedJob, fromJob)
    local src = player.getSourceByIdentifier(targetCid)
    if not src then return false end
    if framework.name == 'ox' or framework.name == 'nd' then
        if not fromJob then return false end
        return job.leave(src, fromJob) == true
    end
    return job.set(src, unemployedJob, 0) == true
end

return society
