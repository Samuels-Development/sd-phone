---@type table Garages bridge (bridge.server.garages): cross-resource garage-system detection +
---DB normalisation into the app's vehicle shape.
local garages = require 'bridge.server.garages'
---@type table Player bridge (bridge.server.player): citizenid lookups from a server id.
local player  = require 'bridge.server.player'
---@type table Shared server helpers (server.util): onCleanup, ok, fail.
local util    = require 'server.util'
---@type table Custom vehicle pictures (server.garages.images): schema + per-plate photo overrides.
local images  = require 'server.garages.images'
---@type table Garages app config (configs.garages): the CustomImages switch.
local G       = require 'configs.garages'

---@type boolean Whether players may set their own vehicle pictures. Off leaves the table uncreated
---and every write refused, so the list never carries an override either.
local CUSTOM_IMAGES = G.Enabled ~= false and G.CustomImages ~= false

if CUSTOM_IMAGES then
    CreateThread(function()
        local ok, err = pcall(images.ensureSchema)
        if not ok then
            print(('^1[sd-phone:garages]^0 custom image schema failed, the option is off: %s'):format(tostring(err)))
            CUSTOM_IMAGES = false
        end
    end)
end

---@type integer Seconds a built list stays warm. garages.list reads the garage table, calls the
---active garage resource, then walks every vehicle entity on the server with a plate native each.
local LIST_TTL = 2

---@type table<string, { at: integer, data: table }> citizenid -> last built list.
local listCache = {}

util.onCleanup(function(_src, cid) if cid then listCache[cid] = nil end end)

---Drops every entry past its TTL. Each one holds a whole vehicle list, and onCleanup only gets a
---citizenid on a best-effort basis, so the cache must also be able to empty itself.
---@param now integer os.time of the call sweeping it
local function sweep(now)
    for cid, entry in pairs(listCache) do
        if (now - entry.at) >= LIST_TTL then listCache[cid] = nil end
    end
end

---Owned-vehicle list for the caller. Read-only; a disabled/undetected system degrades to an
---empty array. Repeat calls inside LIST_TTL are served from the last result.
lib.callback.register('sd-phone:server:garages:list', function(src)
    local cid = player.getRealIdentifier(src)
    local hit = cid and listCache[cid]
    if hit and (os.time() - hit.at) < LIST_TTL then return { success = true, data = hit.data } end
    sweep(os.time())

    local data = garages.list(src)
    if CUSTOM_IMAGES and cid and type(data) == 'table' then
        local byPlate = images.forCitizen(cid)
        if next(byPlate) then
            for i = 1, #data do
                local key = images.key(data[i].plate)
                if key and byPlate[key] then data[i].customImage = byPlate[key] end
            end
        end
    end
    if cid then listCache[cid] = { at = os.time(), data = data } end
    return { success = true, data = data }
end)

---Whether the caller owns a vehicle with this plate key, read through the same list the app shows.
---@param src number caller server id
---@param key string plate key from images.key
---@return boolean
local function ownsPlate(src, key)
    local list = garages.list(src)
    for i = 1, #(list or {}) do
        if images.key(list[i].plate) == key then return true end
    end
    return false
end

---Sets or clears the caller's own picture for one of their vehicles. A nil url clears. The photo
---must already be in the caller's Photos library and the plate must be one of their vehicles.
lib.callback.register('sd-phone:server:garages:setImage', function(src, payload)
    if not CUSTOM_IMAGES then return util.fail('garages.customImagesOff', 'Custom vehicle photos are turned off') end
    local cid = player.getRealIdentifier(src)
    if not cid then return util.fail('common.notAuthorized', 'Not authorized') end

    local key = images.key(type(payload) == 'table' and payload.plate or nil)
    if not key then return util.fail('garages.invalidPlate', 'Invalid plate') end
    if not ownsPlate(src, key) then return util.fail('garages.notYourVehicle', 'That is not one of your vehicles') end

    local url = type(payload) == 'table' and payload.url or nil
    if url == nil or url == '' then
        images.clear(cid, key)
    elseif not images.set(cid, key, url) then
        return util.fail('garages.photoNotYours', 'Pick a photo from your own library')
    end

    listCache[cid] = nil
    return util.ok({ plate = key, url = (url ~= '' and url) or nil })
end)

-- No boot print: the detected garage system is available via garages.activeSystem() when needed.

---The bridge's resolution report as printable lines.
---@param src number caller server id
---@return string[] lines
local function diagnosticLines(src)
    local d = garages.diagnose(src)
    return {
        ('system      : %s'):format(d.system),
        ('table       : %s (%d row(s) for you)'):format(d.table, d.rows),
        ('garage col  : %s'):format(d.garageCol or 'NONE of the profile candidates'),
        ('state col   : %s'):format(d.stateCol or 'NONE of the profile candidates'),
        ('parked table: %s'):format(d.parkedTable and (d.parkedTable .. (d.parkedCols and ' (present)' or ' (MISSING)')) or 'n/a'),
        ('garages     : %d with usable coords'):format(d.garages),
        ('row columns : %s'):format(table.concat(d.columns, ', ')),
    }
end

---Prints what the garage bridge resolved for the caller, for diagnosing a garage system whose
---schema is not published. Always logged to the server console; a player also gets it in chat.
lib.addCommand('garagediag', {
    help = 'Print what the sd-phone garage bridge detected: system, table, resolved columns and garage coords',
    restricted = 'group.admin',
}, function(source)
    local lines = diagnosticLines(source)
    for i = 1, #lines do
        print('^5[sd-phone:garagediag]^0 ' .. lines[i])
        if source and source > 0 then
            TriggerClientEvent('chat:addMessage', source, { args = { 'garagediag', lines[i] } })
        end
    end
end)
