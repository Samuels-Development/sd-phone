---@type table sd-phone config root (configs/config.lua).
local config   = require 'configs.config'
---@type table Payphone persistence (server.payphone.store): per-booth static numbers.
local store    = require 'server.payphone.store'
---@type table Call engine (server.calls.actions): dialPayphone + shared teardown.
local calls    = require 'server.calls.actions'
---@type table Player bridge (bridge.server.player): citizenid resolution.
local player   = require 'bridge.server.player'
---@type table Contacts persistence (server.contacts.store): favourites for the notepad.
local contacts = require 'server.contacts.store'
---@type table Settings persistence (server.settings.store): the player's own number.
local settings = require 'server.settings.store'

---@type table Payphone config (configs/payphone.lua).
local cfg = config.Payphone

local util = require 'server.util'
local ok, fail, digits = util.ok, util.fail, util.digits

if cfg.Enabled then
    CreateThread(function()
        local success, err = pcall(store.ensureSchema)
        if not success then
            print(('^1[sd-phone:payphone]^0 schema bootstrap failed: %s'):format(err))
            return
        end
        print('^2[sd-phone:payphone]^0 schema ready')
    end)
end

---Coerces a client-supplied location key ('x,y,z' rounded coords) into a bounded string.
---@param raw any
---@return string|nil
local function locationKey(raw)
    if type(raw) ~= 'string' or raw == '' or #raw > 64 then return nil end
    return raw
end

---The player must actually be near the booth they claim to be using.
---@param src number
---@param location string 'x,y,z' key
---@return boolean
local function nearLocation(src, location)
    local x, y, z = location:match('^(-?[%d%.]+),(-?[%d%.]+),(-?[%d%.]+)$')
    if not x then return false end
    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return false end
    local pos = GetEntityCoords(ped)
    return #(pos - vector3(tonumber(x), tonumber(y), tonumber(z))) < 6.0
end

---Booth state for the dial UI: the booth's static number, the caller's own number, and their
---favourite contacts for the notepad. Read-only.
lib.callback.register('sd-phone:server:payphone:state', function(src, payload)
    if not cfg.Enabled then return fail('Payphones are disabled') end
    payload = type(payload) == 'table' and payload or {}
    local location = locationKey(payload.location)
    if not location or not nearLocation(src, location) then return fail('No payphone here') end

    local favorites = {}
    local myNumber = nil
    local cid = player.getIdentifier(src)
    if cid then
        myNumber = settings.getPhoneNumber(cid)
        if cfg.ShowFavorites ~= false then
            for _, row in ipairs(contacts.listContacts(cid)) do
                if util.truthy(row.favorite) and #favorites < 6 then
                    favorites[#favorites + 1] = { name = row.name, phone = digits(row.phone) }
                end
            end
        end
    end

    return ok({
        number    = store.numberFor(location),
        anonymous = cfg.Anonymous == true,
        myNumber  = myNumber,
        favorites = favorites,
    })
end)

---Answers a ringing booth: promotes the ring into a live call with the answerer as the booth
---side. The answerer must actually be standing at that booth.
lib.callback.register('sd-phone:server:payphone:answer', function(src, payload)
    if not cfg.Enabled then return fail('Payphones are disabled') end
    payload = type(payload) == 'table' and payload or {}
    local location = locationKey(payload.location)
    if not location or not nearLocation(src, location) then return fail('No payphone here') end
    return calls.answerBoothRing(src, payload.channel)
end)

---Places a call from the booth: caller identity is the booth's static number (or withheld when
---Anonymous), never the player's own.
lib.callback.register('sd-phone:server:payphone:dial', function(src, payload)
    if not cfg.Enabled then return fail('Payphones are disabled') end
    payload = type(payload) == 'table' and payload or {}
    local location = locationKey(payload.location)
    if not location or not nearLocation(src, location) then return fail('No payphone here') end

    return calls.dialPayphone(src, {
        number       = payload.number,
        callerName   = cfg.CallerLabel or 'Payphone',
        callerNumber = cfg.Anonymous == true and '' or store.numberFor(location),
    })
end)
