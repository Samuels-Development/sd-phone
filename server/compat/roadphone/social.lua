---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'
---@type table Account persistence layer (server.accounts.store): social account deletion.
local accounts = require 'server.accounts.store'
---@type table Settings persistence layer (server.settings.store): number -> identity resolution.
local settings = require 'server.settings.store'
---@type table Ryde persistence layer (server.ryde.store): finished-trip rows.
local ryde = require 'server.ryde.store'
---@type table Player bridge (bridge.server.player): identity -> source + display name.
local player = require 'bridge.server.player'
---@type table Shared server helpers (server.util): id minting + trim at the shim boundary.
local util = require 'server.util'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

local registerExport, stubExport, warnOnce = shim.registerExport, shim.stubExport, shim.warnOnce

---@type table Social module; the table returned at end of file, so the event bridge delivers a drop
---through exactly the same path the export does.
local social = {}

---Sends a RoadDrop as a notification to a list of players. sd-phone's own AirShare asks the
---recipient to accept before anything is written, so a drop that arrives unannounced is delivered
---as a banner rather than being pushed straight into their gallery or contacts.
---@param data any RoadPhone drop table { sender, message?, image?, targetPlayers? }
local function drop(data)
    if type(data) ~= 'table' then return end
    local sender = util.trim(data.sender)
    if sender == '' then return end

    if type(data.targetPlayers) ~= 'table' then
        warnOnce('sendRoadDrop.nearby', ('sendRoadDrop needs targetPlayers (called by %s); sd-phone has no nearby-phone discovery reachable without a sending player, so the drop was dropped'):format(GetInvokingResource() or 'unknown'))
        return
    end

    warnOnce('sendRoadDrop', ('RoadDrops arrive as a notification (called by %s); sd-phone\'s AirShare asks the recipient to accept before it writes anything to their phone'):format(GetInvokingResource() or 'unknown'))

    for _, id in ipairs(data.targetPlayers) do
        local src = shim.source(id)
        if src then
            sd:notify(src, {
                title = sender,
                body  = util.trim(data.message),
                image = type(data.image) == 'string' and data.image or nil,
            })
        end
    end
end

social.drop = drop

---sendRoadDrop(data): AirDrop-style share at a list of players.
registerExport('sendRoadDrop', drop)

---sendAirdrop(data): RoadPhone's deprecated alias of sendRoadDrop, identical in behaviour.
registerExport('sendAirdrop', drop)

---Deletes one account on an sd-phone account app, leaving that app's content rows in place.
---@param app string sd-phone account app key
---@param username any account username
---@return boolean deleted
local function deleteAccount(app, username)
    if type(username) ~= 'string' or username == '' then return false end

    local account = accounts.getAccount(app, username)
    if not account then return false end

    warnOnce('deleteAccount.' .. app, ('deleting a %s account removes the credentials and sessions only (called by %s); its posts, likes and comments stay, which /wipephoneaccounts %s clears'):format(app, GetInvokingResource() or 'unknown', app))
    accounts.deleteAccount(account.id)
    return true
end

---deleteConnectAccount(username): removes a Connect account. Connect is Photogram on sd-phone.
registerExport('deleteConnectAccount', function(username)
    return deleteAccount('photogram', username)
end)

---deleteTweetWaveAccount(username): removes a TweetWave account. TweetWave is Birdy on sd-phone.
registerExport('deleteTweetWaveAccount', function(username)
    return deleteAccount('birdy', username)
end)

---The citizenid holding a phone number. Nil when the number is unassigned.
---@param number any
---@return string|nil citizenid
local function citizenFor(number)
    local digits = shim.digits(number)
    return digits and settings.getCitizenByNumber(digits) or nil
end

---The Ryde account username of whoever holds a phone number. Nil when the number is unassigned or
---its owner never signed into Ryde.
---@param number any
---@return string|nil username
local function rydeUser(number)
    local cid = citizenFor(number)
    local account = cid and sd:getSessionAccount('ryde', cid) or nil
    return account and account.username or nil
end

---saveTaxiTripToHistory(customerPhone, driverPhone?, driverName?, pickupStreet?, destinationStreet?,
---price?, vehicleType?): writes a finished trip into the customer's Ryde history.
---
---Ryde keys a ride's rider side by CITIZENID and its driver side by Ryde account username, so the
---customer number is resolved to the character holding it and the driver number to that character's
---signed-in Ryde account. A customer number nobody owns has no history to write to and the row is
---skipped. `vehicleType` is dropped: Ryde stores the driver's vehicle on the driver record, not per
---trip.
registerExport('saveTaxiTripToHistory', function(customerPhone, driverPhone, driverName, pickupStreet, destinationStreet, price, vehicleType)
    local rider = citizenFor(customerPhone)
    if not rider then
        warnOnce('saveTaxiTripToHistory', ('saveTaxiTripToHistory could not resolve the customer number to a character (called by %s); the trip was not written'):format(GetInvokingResource() or 'unknown'))
        return
    end
    if vehicleType ~= nil then
        warnOnce('saveTaxiTripToHistory.vehicle', ('saveTaxiTripToHistory drops vehicleType (called by %s); Ryde stores a vehicle on the driver record rather than per trip'):format(GetInvokingResource() or 'unknown'))
    end

    local riderSrc = player.getSourceByIdentifier(rider)
    local riderAccount = sd:getSessionAccount('ryde', rider)
    local riderName = (riderSrc and player.getName(riderSrc))
        or (riderAccount and riderAccount.name)
        or ''

    pcall(ryde.insertRide, {
        id             = util.newId(16),
        riderUsername  = rider,
        riderName      = util.trim(riderName):sub(1, 64),
        driverUsername = rydeUser(driverPhone),
        driverName     = util.trim(driverName):sub(1, 64),
        pickup         = { label = util.trim(pickupStreet):sub(1, 96), x = 0.0, y = 0.0 },
        dropoff        = { label = util.trim(destinationStreet):sub(1, 96), x = 0.0, y = 0.0 },
        distance       = 0.0,
        fare           = tonumber(price) or 0,
        payment        = 'cash',
        paid           = true,
        status         = 'completed',
    })
end)

-- Music: sd-phone's Music app plays from each player's own library, held on their phone rather than
-- in a server-side catalogue, so there is nothing to search and no server-side playlist to read.
stubExport('getMusicLibrary', {},
    'has no sd-phone equivalent: the Music app plays each player\'s own library rather than a server-side catalogue, so a search has nothing to scan')
stubExport('getPlayerPlaylists', { playlists = {}, songs = {} },
    'has no sd-phone equivalent: playlists live on the player\'s own phone, so the server holds none to hand back')

return social
