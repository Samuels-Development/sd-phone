---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'
---@type table Maps persistence layer (server.maps.store): one JSON pin array per identity.
local store = require 'server.maps.store'
---@type table Maps app config (configs/maps.lua): the pin cap and label length the app enforces.
local config = require 'configs.maps'
---@type table Player bridge (bridge.server.player): source -> identity, and the online roster.
local player = require 'bridge.server.player'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---@type table<string, boolean> Pin icon keys the Maps UI can draw (mirrors ICON_KEYS in
---server/maps/actions.lua). gksphone names icons freely, so anything outside this falls back.
local ICON_KEYS = {
    MapPin = true, Home = true, Star = true, Flag = true, Skull = true,
    DollarSign = true, Car = true, Crosshair = true, Heart = true,
    Wrench = true, ShoppingCart = true, Fuel = true,
}

---@type string Default pin swatch, matching the Maps app's own first colour.
local DEFAULT_COLOR = '#f0c43a'

---The pin array saved for one identity, always a table.
---@param identity string
---@return table[]
local function pinsOf(identity)
    local raw = store.forPlayer(identity)
    if not raw or raw == '' then return {} end
    local ok, decoded = pcall(json.decode, raw)
    return (ok and type(decoded) == 'table') and decoded or {}
end

---Persists a pin array for one identity, capped exactly as the app caps its own saves.
---@param identity string
---@param pins table[]
local function savePins(identity, pins)
    while #pins > config.MaxMarkers do table.remove(pins) end
    store.save(identity, json.encode(pins), os.date('!%Y-%m-%dT%H:%M:%S.000Z'))
end

---Turns a gksphone location into an sd-phone Maps pin, or nil when it carries no usable position.
---gksphone's `description` and `category` have no counterpart on an sd-phone pin and are dropped.
---@param data any gksphone location table
---@param existing table|nil the pin being patched, whose fields survive an absent key
---@return table|nil pin
local function toPin(data, existing)
    if type(data) ~= 'table' then return nil end

    local position = data.position or data
    local x = tonumber(position.x or position[1])
    local y = tonumber(position.y or position[2])
    if not x or not y then
        if not existing then return nil end
        x, y = existing.x, existing.y
    end

    local label = shim.text(data.name) or (existing and existing.label) or 'Location'
    if #label > config.MaxLabel then label = label:sub(1, config.MaxLabel) end

    local icon = shim.text(data.icon)
    return {
        id    = shim.text(data.id) or (existing and existing.id),
        label = label,
        x     = x + 0.0,
        y     = y + 0.0,
        icon  = (icon and ICON_KEYS[icon]) and icon or (existing and existing.icon) or 'MapPin',
        color = (existing and existing.color) or DEFAULT_COLOR,
    }
end

---Every identity a server-side map call targets: one player, or every connected one when
---gksphone's -1 wildcard is given.
---@param playerSource any
---@return string[]
local function targets(playerSource)
    local src = tonumber(playerSource)
    if src == -1 then
        local out = {}
        for cid in pairs(player.onlineCidMap()) do out[#out + 1] = cid end
        return out
    end
    local identity = src and player.getIdentifier(src)
    return identity and { identity } or {}
end

---AddMapLocation(playerSource, data): saves a pin into a player's own Maps app, or into everyone's
---when playerSource is -1. gksphone draws these as read-only overlay markers; sd-phone has no
---script-owned overlay layer, so the pin is written as one the player owns and can delete.
local function addLocation(playerSource, data)
    warnOnce('AddMapLocation', ('map locations are saved as ordinary player pins (called by %s); sd-phone has no read-only overlay layer, so the player can rename or delete one'):format(shim.invoker()))

    local pin = toPin(data)
    if not pin or not pin.id then return false end

    local wrote = false
    for _, identity in ipairs(targets(playerSource)) do
        local pins = pinsOf(identity)
        local slot = #pins + 1
        for i = 1, #pins do
            if pins[i].id == pin.id then slot = i break end
        end
        pins[slot] = pin
        savePins(identity, pins)
        wrote = true
    end
    return wrote
end

---RemoveMapLocation(playerSource, id): deletes one pin by id, from every player when -1 is given.
local function removeLocation(playerSource, id)
    local pinId = shim.text(id)
    if not pinId then return false end

    local removed = false
    for _, identity in ipairs(targets(playerSource)) do
        local pins = pinsOf(identity)
        for i = #pins, 1, -1 do
            if pins[i].id == pinId then
                table.remove(pins, i)
                removed = true
            end
        end
        savePins(identity, pins)
    end
    return removed
end

---UpdateMapLocation(playerSource, id, patch): merges a patch into an existing pin; keys the patch
---leaves out keep their stored value. An unknown id is left alone rather than created.
local function updateLocation(playerSource, id, patch)
    local pinId = shim.text(id)
    if not pinId or type(patch) ~= 'table' then return false end

    local updated = false
    for _, identity in ipairs(targets(playerSource)) do
        local pins = pinsOf(identity)
        for i = 1, #pins do
            if pins[i].id == pinId then
                local merged = toPin(patch, pins[i])
                if merged then
                    merged.id = pinId
                    pins[i] = merged
                    updated = true
                end
                break
            end
        end
        if updated then savePins(identity, pins) end
    end
    return updated
end

registerExport('AddMapLocation', addLocation)
registerExport('RemoveMapLocation', removeLocation)
registerExport('UpdateMapLocation', updateLocation)

-- Returned so the client-support half can write a pin without going back out through the export
-- registry, which would resolve to the real gksphone the moment this shim deregisters.
return { addLocation = addLocation, removeLocation = removeLocation, updateLocation = updateLocation }
