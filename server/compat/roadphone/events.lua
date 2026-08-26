-- Two halves. Inbound: RoadPhone's documented integration events, the ones a third-party resource
-- fires at the phone, answered here through the same paths the matching exports use. Outbound: each
-- handler listens on a first-party 'sd-phone:server:*' lifecycle event and re-fires it under
-- RoadPhone's event name with the payload reshaped to its contract.

---@type table Shared shim helpers (server.compat.roadphone.shared): warn-once breadcrumbs.
local shim = require 'server.compat.roadphone.shared'
---@type table Player bridge (bridge.server.player): identity, name and source resolution.
local player = require 'bridge.server.player'
---@type table Contacts compat module (server.compat.roadphone.contacts): the give-details path.
local contacts = require 'server.compat.roadphone.contacts'
---@type table Dispatch compat module (server.compat.roadphone.dispatch): the job fan-out.
local dispatch = require 'server.compat.roadphone.dispatch'
---@type table Mail compat module (server.compat.roadphone.mail): the offline-mail delivery path.
local mail = require 'server.compat.roadphone.mail'
---@type table Bank compat module (server.compat.roadphone.bank): the IBAN-addressed transaction log.
local bank = require 'server.compat.roadphone.bank'
---@type table Social compat module (server.compat.roadphone.social): the RoadDrop delivery path.
local social = require 'server.compat.roadphone.social'
---@type table Mail persistence layer (server.mail.store): who is signed into a recipient address.
local mailStore = require 'server.mail.store'
---@type table Shared server helpers (server.util): per-character rate limiting on the client path.
local util = require 'server.util'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

---The acting player behind one of these events. RoadPhone net-registers them, so a handler may be
---reached either by a server-side TriggerEvent (no player, `claimed` is trusted) or by a client
---(the connected id wins over anything the payload claims, and the caller is rate limited).
---@param net any the ambient event source, captured by the handler before anything else
---@param claimed any source the payload claims
---@param key string rate-limit bucket for the client path
---@return number|nil source, boolean allowed
local function actingSource(net, claimed, key)
    net = tonumber(net)
    if net and net > 0 and GetPlayerName(net) then
        local cid = player.getIdentifier(net)
        if not cid or not util.cooldown(cid, key, 1000) or not util.rateLimit(cid, key, 60000, 20) then
            return net, false
        end
        return net, true
    end

    local trusted = tonumber(claimed)
    return (trusted and GetPlayerName(trusted)) and trusted or nil, true
end

---roadphone:sendDispatch(claimedSource, message, job, coords?, anonym?, image?, deathcause?): the
---backing handler for the sendDispatch export. An anonymous dispatch drops the sender's name.
RegisterNetEvent('roadphone:sendDispatch', function(claimedSource, message, job, coords, anonym, image)
    local src, allowed = actingSource(source, claimedSource, 'roadphone:sendDispatch')
    if not allowed then return end

    local sender = (anonym ~= true and src) and player.getName(src) or 'Dispatch'
    dispatch.send(job, sender, message, coords, image)
end)

---roadphone:addBankTransfer(senderIban, receiverIban, reason, amount, endamount): the backing
---handler for the addBankTransaction export, routed through the same synthesised-IBAN registry.
RegisterNetEvent('roadphone:addBankTransfer', function(senderIban, receiverIban, reason, amount)
    local _, allowed = actingSource(source, nil, 'roadphone:addBankTransfer')
    if not allowed then return end
    bank.addTransaction(senderIban, receiverIban, reason, amount)
end)

---roadphone:roaddrop:receive(data): the backing handler for sendRoadDrop. `data.playerId` names the
---recipient, so it is folded into the export's own targetPlayers list.
RegisterNetEvent('roadphone:roaddrop:receive', function(data)
    local _, allowed = actingSource(source, nil, 'roadphone:roaddrop')
    if not allowed or type(data) ~= 'table' then return end

    social.drop({
        sender        = data.sender or 'RoadDrop',
        message       = data.message,
        image         = data.picturelink,
        targetPlayers = data.playerId and { data.playerId } or data.targetPlayers,
    })
end)

---roadphone:receiveMail:offline(identifier, mailData): the backing handler for sendMailOffline.
RegisterNetEvent('roadphone:receiveMail:offline', function(identifier, mailData)
    local _, allowed = actingSource(source, nil, 'roadphone:receiveMail')
    if not allowed then return end
    mail.sendOffline(identifier, mailData)
end)

---roadphone:playerLoad(playerSource): reloads a player's phone data and pushes it back, which is
---what /fixphone does. sd-phone reloads by resetting the phone's NUI, which refetches everything.
RegisterNetEvent('roadphone:playerLoad', function(playerSource)
    local src, allowed = actingSource(source, playerSource, 'roadphone:playerLoad')
    if not src or not allowed then return end

    sd:pushBadges(src)
    TriggerClientEvent('sd-phone:client:profileReset', src)
end)

---roadphone:server:GiveContactDetails(playerId): offers the caller's name and number to another
---player. sd-phone delivers it as an AirShare request the recipient accepts.
RegisterNetEvent('roadphone:server:GiveContactDetails', function(playerId)
    local src, allowed = actingSource(source, nil, 'roadphone:giveContact')
    if not src or not allowed then return end
    contacts.giveDetails(src, playerId)
end)

---roadphone:fetchallmails(source, mail): RoadPhone reloads a whole mailbox and pushes it down. The
---Mail app refetches its own mailbox whenever it opens, so only the unread badge is corrected here.
---@param playerSource any target player server id
AddEventHandler('roadphone:fetchallmails', function(playerSource)
    local src = tonumber(playerSource)
    if not src or not GetPlayerName(src) then return end

    shim.warnOnce('fetchallmails', 'roadphone:fetchallmails only refreshes the unread badge; sd-phone\'s Mail app refetches its own mailbox when it opens, so there is no whole-mailbox push to replay')
    sd:pushBadges(src)
end)

---roadphone:taxi:sync / roadphone:taxi:sync:remove: RoadPad's taxi-job bridge. sd-phone's Ryde owns
---the whole request/accept/complete lifecycle, so there is no foreign job table to write into.
local function taxiSync()
    shim.warnOnce('taxi:sync', 'roadphone:taxi:sync has no sd-phone counterpart: Ryde owns its own ride requests end to end, so a job written from outside would never be matched, quoted or paid; use the saveTaxiTripToHistory export to file a finished trip instead')
end

AddEventHandler('roadphone:taxi:sync', taxiSync)
AddEventHandler('roadphone:taxi:sync:remove', taxiSync)

---Call teardown -> roadphone:server:addCallHistory, once per party, with each side's own view of
---the call. RoadPhone's callType is 'voice' throughout: sd-phone reports a video upgrade on the
---call payload rather than as a separate history kind.
---@param call table eventCall payload from server.calls.actions
AddEventHandler('sd-phone:server:call:ended', function(call)
    if type(call) ~= 'table' then return end

    local caller, callee = call.caller, call.callee
    if not caller or not callee then return end

    local missed = call.answered ~= true
    if caller.source then
        TriggerEvent('roadphone:server:addCallHistory', caller.source, callee.number, false, callee.number == nil, 'voice', missed)
    end
    if callee.source then
        TriggerEvent('roadphone:server:addCallHistory', callee.source, caller.number, true, caller.number == nil, 'voice', missed)
    end
end)

---Mail delivery -> roadphone:receivemail:notify (source, sender), fired once per connected reader of
---each recipient address. Note RoadPhone's own lowercase 'receivemail' here, unlike its
---receiveMail:offline. `to` is a list of addresses, so each is resolved to whoever is signed into it.
---@param m table mail:sent payload from server.mail.actions
AddEventHandler('sd-phone:server:mail:sent', function(m)
    if type(m) ~= 'table' or type(m.to) ~= 'table' then return end

    local sender = m.from and (m.from.email or m.from.name) or nil
    for _, address in ipairs(m.to) do
        local account = type(address) == 'string' and mailStore.getAccount(address) or nil
        for _, cid in ipairs((account and account.logged_in_citizens) or {}) do
            local src = player.getSourceByIdentifier(cid)
            if src then TriggerEvent('roadphone:receivemail:notify', src, sender) end
        end
    end
end)

-- roadphone:server:call:eventnumber (and its client twin) is deliberately never fired. RoadPhone
-- raises it only for a number listed in its own Config.EventNumbers, a list that lives inside the
-- product and has no sd-phone counterpart: sd-phone routes company lines through
-- configs/services.lua and everything else as an ordinary call, so there is no set of numbers this
-- shim could test a dial against. Firing it for every dialled number would be a different event
-- than the one the docs describe, and a listener written against RoadPhone would misfire on it.

-- roadphone:sendNotification:offline is deliberately not mirrored: it is RoadPhone's own internal
-- spool for a notification aimed at a number nobody is holding, and sd-phone drops those rather
-- than queueing them, so a listener would never see the matching drain.
