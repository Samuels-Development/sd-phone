---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'
---@type table Authoritative contact handlers (server.contacts.actions): validated edit + delete.
local actions = require 'server.contacts.actions'
---@type table Player bridge (bridge.server.player): display name for the caller.
local player = require 'bridge.server.player'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

local registerExport, stubMeta = shim.registerExport, shim.stubMeta

---@type table Contacts module; the table returned at end of file, so the client half's support
---handler and RoadPhone's own server event share one give-details path.
local contacts = {}

---Projects a RoadPhone contact table onto sd-phone's contact fields. RoadPhone spells the number
---`number` and the picture `picture`, and splits the name in two on some of its screens.
---@param contact table
---@return table fields
local function fields(contact)
    local name = contact.name
    if type(name) ~= 'string' or name == '' then
        name = ('%s %s'):format(contact.firstname or '', contact.lastname or ''):gsub('^%s+', ''):gsub('%s+$', '')
    end

    return {
        name   = name,
        phone  = contact.phone or contact.number,
        email  = contact.email or contact.mail,
        avatar = contact.avatar or contact.picture,
    }
end

---GetPhoneContacts(source): the player's address book, in sd-phone's serialized contact shape.
registerExport('GetPhoneContacts', function(source)
    local src = shim.source(source)
    return (src and sd:getContacts(src)) or {}
end)

---AddContactToMetadata(source, contact): saves a contact, walking the same validation the phone's
---own composer does (number in service, not the caller's own, not already saved, list cap).
registerExport('AddContactToMetadata', function(source, contact)
    local src = shim.source(source)
    if not src or type(contact) ~= 'table' then return false end

    local result = sd:addContact(src, fields(contact))
    return type(result) == 'table' and result.success == true
end)

---UpdateContactInMetadata(source, contactId, updatedContact): edits one of the caller's own
---contacts. The id is sd-phone's own contact id, which is what GetPhoneContacts hands back.
registerExport('UpdateContactInMetadata', function(source, contactId, updatedContact)
    local src = shim.source(source)
    if not src or type(updatedContact) ~= 'table' then return false end

    local payload = fields(updatedContact)
    payload.id = tostring(contactId or '')
    return actions.update(src, payload).success == true
end)

---DeleteContactFromMetadata(source, contactId): removes one of the caller's own contacts. A value
---that looks like a phone number is treated as one, since RoadPhone callers address either way.
registerExport('DeleteContactFromMetadata', function(source, contactId)
    local src = shim.source(source)
    if not src then return false end

    local id = tostring(contactId or '')
    if id == '' then return false end
    if actions.delete(src, { id = id }).success == true then return true end

    local number = shim.digits(id)
    if not number then return false end

    local removed = sd:removeContactByNumber(src, number)
    return type(removed) == 'table' and removed.success == true
        and (removed.data and removed.data.removed or 0) > 0
end)

stubMeta('UpdatePhoneContacts', false,
    'contacts are rows owned by a character, so replacing the whole list would delete every contact the player added between the read and the write')

---Offers the caller's own name and number to another player, the way GiveContactDetails does.
---sd-phone shares a card through AirShare, so the recipient accepts before anything is written.
---@param src number caller server id
---@param target any recipient server id
---@return boolean offered
function contacts.giveDetails(src, target)
    local number = sd:getPhoneNumber(src)
    if not number then return false end

    local result = actions.requestShare(src, target, {
        name  = player.getName(src),
        phone = number,
    })
    return type(result) == 'table' and result.success == true
end

return contacts
