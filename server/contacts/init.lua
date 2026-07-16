---@type table Player bridge (bridge.server.player): citizenid lookups for the number-scoped exports.
local player  = require 'bridge.server.player'
---@type table Contacts persistence layer (server.contacts.store): table DDL + row CRUD.
local store   = require 'server.contacts.store'
---@type table Authoritative contact/recents handlers (server.contacts.actions).
local actions = require 'server.contacts.actions'
---@type table AirShare core (server.share.core): nearby-share request handshake + delivery routing.
local share   = require 'server.share.core'
---@type table Shared server helpers (server.util): the failure envelope for the export guards.
local util    = require 'server.util'
local fail    = util.fail

-- Deliver an accepted contact AirShare into the recipient's contacts.
share.registerHandler('contact', actions.deliverShare)

---Boots the contacts schema; a failure is printed and non-fatal.
CreateThread(function()
    local success, err = pcall(store.ensureSchema)
    if not success then
        print(('^1[sd-phone:contacts]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:contacts]^0 schema ready')
end)

-- Authoritative contact/recents callbacks: thin delegates into server.contacts.actions.
lib.callback.register('sd-phone:server:contacts:list', function(src) return actions.list(src) end)
lib.callback.register('sd-phone:server:contacts:add', function(src, payload) return actions.add(src, payload) end)
lib.callback.register('sd-phone:server:contacts:update', function(src, payload) return actions.update(src, payload) end)
lib.callback.register('sd-phone:server:contacts:delete', function(src, payload) return actions.delete(src, payload) end)

---AirShares a contact card to a nearby player; the payload carries both the recipient and the
---card fields.
lib.callback.register('sd-phone:server:contacts:share', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    return actions.requestShare(src, payload.target, payload)
end)

-- More thin delegates into server.contacts.actions.
lib.callback.register('sd-phone:server:contacts:favorite', function(src, payload) return actions.favorite(src, payload) end)
lib.callback.register('sd-phone:server:contacts:logCall', function(src, payload) return actions.logCall(src, payload) end)
lib.callback.register('sd-phone:server:contacts:deleteRecent', function(src, payload) return actions.deleteRecent(src, payload) end)
lib.callback.register('sd-phone:server:contacts:clearRecents', function(src) return actions.clearRecents(src) end)

---Marks missed calls acknowledged when the Phone app opens.
lib.callback.register('sd-phone:server:calls:seen', function(src)
    return actions.markCallsSeen(src)
end)

-- Block-list delegates into server.contacts.actions.
lib.callback.register('sd-phone:server:contacts:block', function(src, payload) return actions.block(src, payload) end)
lib.callback.register('sd-phone:server:contacts:unblock', function(src, payload) return actions.unblock(src, payload) end)
lib.callback.register('sd-phone:server:contacts:isBlocked', function(src, payload) return actions.isBlocked(src, payload) end)
lib.callback.register('sd-phone:server:contacts:saveCard', function(src, payload) return actions.saveCard(src, payload) end)

---Log a call into a player's recents from another resource (e.g. a calling system). Mirrors the
---logCall action payload, which re-validates every field regardless of caller.
---@param source number
---@param payload { number: string, name?: string, direction?: string, duration?: number }
---@return table
exports('logCall', function(source, payload)
    return actions.logCall(source, payload)
end)

---Read a player's contacts, already serialized to the React shape. Read-only.
---@param source number
---@return table[]|nil
exports('getContacts', function(source)
    local result = actions.list(source)
    return result.success and result.data.contacts or nil
end)

---Creates a contact for a player from another resource. Mirrors the NUI `add` payload and
---walks the same validation; on success the player's open phone is pushed the new card live.
---@param source number acting player's server id
---@param fields { name?: string, phone: string, email?: string, address?: string, avatar?: string }
---@return table
exports('addContact', function(source, fields)
    if type(source) ~= 'number' then return fail('Invalid source') end
    local result = actions.add(source, fields)
    if result.success then
        TriggerClientEvent('sd-phone:client:contacts:shared', source, result.data)
    end
    return result
end)

---Removes every contact matching a number from a player's list, for other resources. Answers
---{ success, data = { removed = n } }; no match still succeeds with removed = 0.
---@param source number acting player's server id
---@param number string|number phone number, any format
---@return table
exports('removeContactByNumber', function(source, number)
    if type(source) ~= 'number' then return fail('Invalid source') end
    return actions.removeByNumber(source, number)
end)

---Looks up one of a player's own contacts by number, serialized to the React shape. The number
---is digit-normalised before matching. Read-only; nil when nothing resolves.
---@param source number acting player's server id
---@param number string|number phone number, any format
---@return table|nil
exports('getContactByNumber', function(source, number)
    if type(source) ~= 'number' then return nil end
    local digits = util.digits(number)
    if digits == '' then return nil end
    local cid = player.getIdentifier(source)
    if not cid then return nil end
    for _, row in ipairs(store.listContacts(cid)) do
        if (tostring(row.phone):gsub('%D', '')) == digits then
            return actions.serializeContact(row)
        end
    end
    return nil
end)

---Whether a player has a number on their block list, for other resources. Read-only; garbage
---input answers false.
---@param source number acting player's server id
---@param number string|number phone number, any format
---@return boolean
exports('isNumberBlocked', function(source, number)
    if type(source) ~= 'number' then return false end
    local result = actions.isBlocked(source, { number = number })
    return result.success == true and result.data.blocked == true
end)
