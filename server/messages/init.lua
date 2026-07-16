---@type table sd-phone config root (configs/config.lua).
local config  = require 'configs.config'
---@type table Shared server helpers (server.util): digit / trim sanitizers for the export boundary.
local util    = require 'server.util'
---@type table Messages persistence layer (server.messages.store): mailbox rows, groups, reactions.
local store   = require 'server.messages.store'
---@type table Authoritative message handlers (server.messages.actions): validation + delivery fan-out.
local actions = require 'server.messages.actions'

---Boots the message schema; a failure is printed and leaves the module inert.
CreateThread(function()
    local success, err = pcall(store.ensureSchema)
    if not success then
        print(('^1[sd-phone:messages]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:messages]^0 schema ready')
end)

-- Authoritative NUI callbacks: thin delegates into server.messages.actions.
lib.callback.register('sd-phone:server:messages:list', function(src) return actions.list(src) end)
lib.callback.register('sd-phone:server:messages:send', function(src, payload) return actions.send(src, payload) end)
lib.callback.register('sd-phone:server:messages:uploadVoice', function(src, payload) return actions.uploadVoice(src, payload) end)
lib.callback.register('sd-phone:server:messages:createGroup', function(src, payload) return actions.createGroup(src, payload) end)
lib.callback.register('sd-phone:server:messages:addGroupMember', function(src, payload) return actions.addGroupMember(src, payload) end)
lib.callback.register('sd-phone:server:messages:updateGroup', function(src, payload) return actions.updateGroup(src, payload) end)
lib.callback.register('sd-phone:server:messages:removeGroupMember', function(src, payload) return actions.removeGroupMember(src, payload) end)
lib.callback.register('sd-phone:server:messages:markRead', function(src, payload) return actions.markRead(src, payload) end)
lib.callback.register('sd-phone:server:messages:delete', function(src, payload) return actions.deleteConversation(src, payload) end)
lib.callback.register('sd-phone:server:messages:react', function(src, payload) return actions.react(src, payload) end)

---Delivers everything held back while airplane mode was on, when the settings module fires
---this server-side event.
---@param source number player server id
AddEventHandler('sd-phone:server:airplane:released', function(source)
    actions.releaseWithheld(source)
end)

---Sends a message on a player's behalf from another resource. Mirrors the NUI `send` payload;
---the payload walks the full composer validation in actions.send.
---@param source number acting player's server id (the sender's identity resolves from it)
---@param payload table
---@return table
exports('sendMessage', function(source, payload)
    return actions.send(source, payload)
end)

---Coerces an export argument to a trimmed string: integral floats stringify as plain integers,
---other numbers via tostring, any other non-string becomes ''.
---@param v any
---@return string
local function str(v)
    if math.type(v) == 'float' and v % 1 == 0 then
        v = ('%.0f'):format(v)
    elseif type(v) == 'number' then
        v = tostring(v)
    end
    return util.trim(v)
end

---Delivers a one-way system text to a phone number from another resource, with
---digit-normalised numbers, a trimmed and capped body, and capped sender fields.
---@param senderNumber string|number service short code the recipient's thread files under
---@param senderName string|number display name for the banner and thread header
---@param targetNumber string|number recipient phone number
---@param body string|number message body
---@param opts table|nil presentation-safe kind + its fields (see above)
---@return boolean delivered
exports('sendSystemMessage', function(senderNumber, senderName, targetNumber, body, opts)
    local sender = util.digits(str(senderNumber)):sub(1, 32)
    local target = util.digits(str(targetNumber))
    if sender == '' or target == '' then return false end

    local name = str(senderName):sub(1, 64)
    local text = str(body)
    local maxBody = config.Messages.MaxBodyLength
    if #text > maxBody then text = text:sub(1, maxBody) end

    return actions.systemText(sender, name, target, text, type(opts) == 'table' and opts or nil)
end)
