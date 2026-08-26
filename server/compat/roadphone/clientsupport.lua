---@type table Player bridge (bridge.server.player): identity + display name for the acting caller.
local player = require 'bridge.server.player'
---@type table Mail compat module (server.compat.roadphone.mail): the offline-mail delivery path.
local mail = require 'server.compat.roadphone.mail'
---@type table Dispatch compat module (server.compat.roadphone.dispatch): the job fan-out.
local dispatch = require 'server.compat.roadphone.dispatch'
---@type table Contacts compat module (server.compat.roadphone.contacts): the give-details path.
local contacts = require 'server.compat.roadphone.contacts'
---@type table Shared server helpers (server.util): per-character cooldown + rate limiting.
local util = require 'server.util'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

-- These handlers back RoadPhone's CLIENT exports, which have no server export to reach on their
-- own. They are net-registered, so every one is gated the way a first-party client write is: a
-- resolvable character, a one-second gap and a bounded window.

---Whether a caller may run one of these writes right now.
---@param source number player server id
---@param key string rate-limit bucket
---@return string|nil citizenid nil when the caller is unresolvable or going too fast
local function allowed(source, key)
    local cid = player.getIdentifier(source)
    if not cid then return nil end
    if not util.cooldown(cid, key, 1000) or not util.rateLimit(cid, key, 60000, 20) then return nil end
    return cid
end

---Backs the client sendMail export: system mail addressed at the caller's own mailbox.
---@param mailData table { senderMail, subject, message, button? }
RegisterNetEvent('sd-phone:server:compat:roadphone:mailSelf', function(mailData)
    local src = source
    local cid = allowed(src, 'roadphone:mailSelf')
    if not cid or type(mailData) ~= 'table' then return end

    local accounts = sd:getMailAccounts(src) or {}
    local address = accounts[1] and accounts[1].email or nil
    if not address then return end

    sd:sendMail({
        to      = address,
        subject = util.trim(mailData.subject),
        body    = util.trim(mailData.message),
        from    = { email = mailData.senderMail, name = mailData.senderName },
    })
end)

---Backs the client sendMailOffline export, which takes the same arguments as the server one.
---@param identifier string framework per-character id
---@param mailData table { senderMail, subject, message, button? }
RegisterNetEvent('sd-phone:server:compat:roadphone:mailOffline', function(identifier, mailData)
    local src = source
    if not allowed(src, 'roadphone:mailOffline') then return end
    mail.sendOffline(identifier, mailData)
end)

---Backs the client sendDispatch export, which carries no source and no coordinates. The caller's
---own display name is the sender, so a job member always sees who raised it.
---@param message string dispatch body
---@param job string framework job name
---@param image string|nil banner image URL
RegisterNetEvent('sd-phone:server:compat:roadphone:dispatch', function(message, job, image)
    local src = source
    if not allowed(src, 'roadphone:dispatch') then return end
    dispatch.send(job, player.getName(src), message, nil, image)
end)

---Backs the client roadphone:client:GiveContactDetails event, which shares the caller's own name
---and number with the player they picked out of proximity.
---@param target any recipient server id
RegisterNetEvent('sd-phone:server:compat:roadphone:giveContact', function(target)
    local src = source
    if not allowed(src, 'roadphone:giveContact') then return end
    contacts.giveDetails(src, target)
end)
