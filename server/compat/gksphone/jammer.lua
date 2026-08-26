---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'
---@type table Phone-id translation (server.compat.gksphone.phones): handset id -> source.
local phones = require 'server.compat.gksphone.phones'
---@type table State bag publisher (server.statebags): server-authoritative phone lockout.
local statebags = require 'server.statebags'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---@type table<string, table> Jam records by handset id: { message, jammedAt }. sd-phone's lockout
---is a live per-source switch with no message and no persistence, so the human-readable half of a
---jam is remembered here and dies with the resource, exactly as the warn line says.
local jammed = {}

---Applies or lifts a jam on one handset. A jam closes the phone and keeps it closed, which is
---sd-phone's lockout switch; an offline handset records the intent but has nothing to close.
---@param phoneUniqueId any handset id
---@param status any true jams, false lifts
---@param message any reason text, remembered for getJammedPhones
---@return boolean ok false when no handset id was given
local function setJam(phoneUniqueId, status, message)
    local identity = shim.text(phoneUniqueId)
    if not identity then return false end

    local on = status == true
    if on then
        jammed[identity] = { message = shim.text(message), jammedAt = os.time() }
    else
        jammed[identity] = nil
    end

    local src = phones.toSource(identity)
    if src then statebags.setDisabled(src, on) end
    return true
end

---heavyJammerByPhone(phoneUniqueId, status, message): jams or unjams one handset. Note the argument
---order, which is inverted from the client's heavyJammer(status, message, phoneUniqueId).
---
---gksphone persists a jam across restarts; sd-phone's lockout does not, so a jam lifts when the
---resource stops.
registerExport('heavyJammerByPhone', function(phoneUniqueId, status, message)
    warnOnce('heavyJammerByPhone', ('a jam is session-local on sd-phone (called by %s); the phone is locked out for as long as this resource runs, but the jam does not survive a restart'):format(shim.invoker()))
    return setJam(phoneUniqueId, status, message)
end)

---heavyJammerByPhones(phoneIds, status, message): the same jam over a list, answering with the
---number of handsets it reached.
registerExport('heavyJammerByPhones', function(phoneIds, status, message)
    if type(phoneIds) ~= 'table' then return 0 end

    local count = 0
    for i = 1, #phoneIds do
        if setJam(phoneIds[i], status, message) then count = count + 1 end
    end
    return count
end)

---isPhoneJammed(phoneUniqueId): whether a handset is jammed, nil for an unusable id. Lower-case
---leading 'i', which is gksphone's own spelling.
registerExport('isPhoneJammed', function(phoneUniqueId)
    local identity = shim.text(phoneUniqueId)
    if not identity then return nil end
    return jammed[identity] ~= nil
end)

---getJammedPhones(): every live jam as { [phoneUniqueId] = { status, message, jammedAt } }.
registerExport('getJammedPhones', function()
    local out = {}
    for identity, record in pairs(jammed) do
        out[identity] = { status = true, message = record.message, jammedAt = record.jammedAt }
    end
    return out
end)

---clearAllJammers(): lifts every jam, answering with how many were cleared.
registerExport('clearAllJammers', function()
    local count = 0
    for identity in pairs(jammed) do
        local src = phones.toSource(identity)
        if src then statebags.setDisabled(src, false) end
        count = count + 1
    end
    jammed = {}
    return count
end)

---Re-applies a jam when its owner turns up, so a handset jammed while its player was offline is
---still locked out once they load in. The shell-state report is the heartbeat this rides on: the
---compat client half sends one on every open and close. Nothing to re-apply is the common case and
---costs one table lookup.
AddEventHandler('sd-phone:server:statebags:report', function()
    local src = source
    if type(src) ~= 'number' or next(jammed) == nil then return end

    local identity = phones.forSource(src)
    if identity and jammed[identity] then statebags.setDisabled(src, true) end
end)
