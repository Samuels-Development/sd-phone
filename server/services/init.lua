---@type table Services prefs store (server.services.store): per-(character, job) toggle rows.
local store     = require 'server.services.store'
---@type table Company inbox store (server.services.msgstore): shared (job, customer) message rows.
local msgstore  = require 'server.services.msgstore'
---@type table Saved-jobs store (server.services.jobstore): multijob list, job offers, pending fires.
local jobstore  = require 'server.services.jobstore'
---@type table Authoritative Services handlers (server.services.actions): directory, money, roster, inbox.
local actions   = require 'server.services.actions'
---@type table Jobs-tab handlers (server.services.jobs): saved-job list/switch/remove + offer accept/decline.
local jobs      = require 'server.services.jobs'
---@type table Framework detection (bridge.shared.framework): name is 'qb' or 'esx'.
local framework = require 'bridge.shared.framework'
---@type table Shared server helpers (server.util): the { success, message? } envelope constructors.
local util      = require 'server.util'

-- Schema bootstrap for the prefs, inbox, and saved-jobs tables.
CreateThread(function()
    local ok, err = pcall(function()
        store.ensureSchema()
        msgstore.ensureSchema()
        jobstore.ensureSchema()
    end)
    if not ok then
        print(('^1[sd-phone:services]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:services]^0 schema ready')
end)

-- Reconciles phone-managed offline job changes when a player loads in (actions.reconcileJobs).
if framework.name == 'qb' then
    AddEventHandler('QBCore:Server:PlayerLoaded', function(pl)
        local src = pl and pl.PlayerData and pl.PlayerData.source
        if src then SetTimeout(1500, function() actions.reconcileJobs(src) end) end
    end)
elseif framework.name == 'esx' then
    AddEventHandler('esx:playerLoaded', function(playerId)
        if playerId then SetTimeout(1500, function() actions.reconcileJobs(playerId) end) end
    end)
end

---Refreshes a disconnecting player's company rosters.
AddEventHandler('playerDropped', function()
    actions.onPlayerDropped(source)
end)

-- Authoritative NUI-facing callbacks: thin delegates into server.services.actions.
lib.callback.register('sd-phone:server:services:directory', function(src) return actions.directory(src) end)
lib.callback.register('sd-phone:server:services:setDuty', function(src, payload) return actions.setDuty(src, payload) end)
lib.callback.register('sd-phone:server:services:setJobCalls', function(src, payload) return actions.setJobCalls(src, payload) end)
lib.callback.register('sd-phone:server:services:setJobMessages', function(src, payload) return actions.setJobMessages(src, payload) end)
lib.callback.register('sd-phone:server:services:deposit', function(src, payload) return actions.deposit(src, payload) end)
lib.callback.register('sd-phone:server:services:withdraw', function(src, payload) return actions.withdraw(src, payload) end)
lib.callback.register('sd-phone:server:services:hire', function(src, payload) return actions.hire(src, payload) end)
lib.callback.register('sd-phone:server:services:fire', function(src, payload) return actions.fire(src, payload) end)
lib.callback.register('sd-phone:server:services:promote', function(src, payload) return actions.promote(src, payload) end)
lib.callback.register('sd-phone:server:services:demote', function(src, payload) return actions.demote(src, payload) end)
lib.callback.register('sd-phone:server:services:quit', function(src) return actions.quit(src) end)
lib.callback.register('sd-phone:server:services:callCompany', function(src, payload) return actions.callCompany(src, payload) end)
lib.callback.register('sd-phone:server:services:inbox', function(src) return actions.inbox(src) end)
lib.callback.register('sd-phone:server:services:markRead', function(src, payload) return actions.markThreadRead(src, payload) end)
lib.callback.register('sd-phone:server:services:messageCompany', function(src, payload) return actions.messageCompany(src, payload) end)
lib.callback.register('sd-phone:server:services:replyCompany', function(src, payload) return actions.replyCompany(src, payload) end)

-- Jobs tab (multi-job) callbacks: thin delegates into server.services.jobs.
lib.callback.register('sd-phone:server:services:listJobs', function(src) return jobs.list(src) end)
lib.callback.register('sd-phone:server:services:switchJob', function(src, payload) return jobs.switch(src, payload) end)
lib.callback.register('sd-phone:server:services:removeJob', function(src, payload) return jobs.remove(src, payload) end)
lib.callback.register('sd-phone:server:services:acceptInvite', function(src, payload) return jobs.accept(src, payload) end)
lib.callback.register('sd-phone:server:services:declineInvite', function(src, payload) return jobs.decline(src, payload) end)

---Public export: exports['sd-phone']:getCompanyDirectory(). Returns the configured company
---directory rows in config order, as a fresh array each call.
---@return table[] companies
exports('getCompanyDirectory', function()
    return actions.companyList()
end)

---Public export: exports['sd-phone']:messageCompany(source, payload). Sends a customer message
---{ job, kind?, body, mediaUrl?, wpCode?, wpSub? } to a company; returns { success, message? }.
---@param source number acting player's server id (the sender's identity resolves from it)
---@param payload table
---@return { success: boolean, message?: string }
exports('messageCompany', function(source, payload)
    if type(source) ~= 'number' then return util.fail('Player not found') end
    local result = actions.messageCompany(source, payload)
    return { success = result.success == true, message = result.message }
end)
