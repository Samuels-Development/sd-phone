---@type table sd-phone config root (configs/config.lua).
local config   = require 'configs.config'
---@type table Player bridge (bridge.server.player): acting identity, real citizenid, coordinates.
local player   = require 'bridge.server.player'
---@type table SIM feature flags (server.sim.state): whether unique phones are live.
local simState = require 'server.sim.state'
---@type table Find My persistence layer (server.findmy.store): sighting + Lost Mode row CRUD.
local store    = require 'server.findmy.store'
---@type table Settings persistence (server.settings.store): the row an Erase resets, plus the
---passcode a Lost Mode unlock is checked against.
local settings = require 'server.settings.store'
---@type table Shared server helpers (server.util): envelopes, string caps, rate limits.
local util     = require 'server.util'

---@type table Find My config (config.FindMy): tick cadence, sound length, message cap.
local CFG = config.FindMy or require 'configs.findmy'

---@type table Actions module; the table returned at end of file.
local actions = {}

local ok, fail = util.ok, util.fail

---@type table<string, boolean> Device kinds a sighting may be recorded for. Mirrors the settings
---module's device whitelist: anything else is a hand-edited client and is dropped.
local KINDS = { phone = true, tablet = true }

---@type table<number, table<string, string>> src -> kind -> device key, for every device whose
---screen is currently up. The only readers are the sighting tick and the "is it online" flag, so
---this never has to survive a restart.
local open = {}

---A device's stable key: the profile it stores its data under, then the kind of device it is.
---Under unique phones the profile key IS the phone's minted device identity, so each physical
---phone keys its own row; without them it is the citizenid, giving citizenid:phone and
---citizenid:tablet. Either way the two halves are exactly phone_settings' primary key, which is
---what makes an Erase a straight row reset.
---@param src integer player server id
---@param kind string 'phone' | 'tablet'
---@return string|nil key nil when the player cannot be resolved (or holds no phone)
local function deviceKey(src, kind)
    local profile = player.getIdentifier(src)
    if type(profile) ~= 'string' or profile == '' then return nil end
    return profile .. ':' .. kind
end

---Splits a device key back into the (citizenid, device) pair phone_settings is keyed by.
---@param key string device key
---@return string|nil profileKey, string|nil kind
local function splitKey(key)
    local profile, kind = key:match('^(.*):([^:]+)$')
    if not profile or profile == '' or not KINDS[kind] then return nil, nil end
    return profile, kind
end

---Whether the player holding this device is the character who owns it. Without unique phones a
---phone only ever opens its holder's own profile, so the holder is always the owner; with them
---the SIM module's first-activator gate decides, which is what stops a thief claiming a stolen
---phone off the owner's Find My list.
---@param src integer player server id
---@return boolean owner
local function holderIsOwner(src)
    if not simState.active then return true end
    return require('server.sim.session').isOwner(src)
end

---Records where a device is, right now, from server-read coordinates. Client input never reaches
---the position: the payload only ever says which device is open.
---@param src integer player server id
---@param kind string 'phone' | 'tablet'
---@param key string device key
local function sight(src, kind, key)
    local cid = player.getRealIdentifier(src)
    if not cid then return end
    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return end
    local c = GetEntityCoords(ped)
    store.recordSighting(key, cid, kind, c.x, c.y, c.z, os.time(), holderIsOwner(src))
end

---Whether a device is open right now, and on whose screen. Read-only.
---@param key string device key
---@return integer|nil src the player holding it, string|nil kind
local function onlineSource(key)
    for src, kinds in pairs(open) do
        for kind, k in pairs(kinds) do
            if k == key then return src, kind end
        end
    end
    return nil, nil
end

---Pushes a device's Lost Mode state to the player holding it. `kind` rides along so the phone and
---the tablet can each ignore a push meant for the other: a companion device mirrors every NUI
---message, so both frames see this one.
---@param src integer player server id
---@param kind string 'phone' | 'tablet'
---@param row table|nil sighting row, nil clears Lost Mode
local function pushLost(src, kind, row)
    local on = row ~= nil and util.truthy(row.lost)
    local data = { kind = kind, on = on }
    if on then
        data.message = row.lost_message
        data.contact = row.lost_contact
        -- How the holder may get back in. A passcode (this device's, else the owner's) is checked
        -- server-side; Face Unlock is offered only to the character who owns the device, so a
        -- thief on a face-only phone is left with the banner and no way through.
        local profile, deviceKind = splitKey(row.device_key)
        local security = profile and settings.getSecurity(profile, deviceKind) or nil
        local pin = security and security.passcode or nil
        if not pin or pin == '' then
            local ownerSec = settings.getSecurity(row.citizenid, 'phone')
            pin = ownerSec and ownerSec.passcode or nil
        end
        if pin and pin ~= '' then
            data.unlock    = 'passcode'
            data.pinLength = #pin
        elseif security and security.faceId and holderIsOwner(src) then
            data.unlock = 'face'
        else
            data.unlock = 'blocked'
        end
    end
    TriggerClientEvent('sd-phone:client:findmy:lost', src, data)
end

---Marks a device's screen as up or down and records a sighting on the edge. Opening also replays
---the device's Lost Mode state, which is how a phone marked lost while its holder was offline
---locks itself the moment it is next opened.
---@param src integer player server id
---@param kind string 'phone' | 'tablet'
---@param on boolean whether the screen is now up
function actions.presence(src, kind, on)
    if CFG.Enabled == false then return end
    if not KINDS[kind] then return end
    local cid = player.getRealIdentifier(src)
    if not cid then return end
    if not util.cooldown(cid, 'findmy:presence:' .. kind, 900) then return end

    local key = deviceKey(src, kind)
    if not key then return end

    if on then
        open[src] = open[src] or {}
        open[src][kind] = key
    elseif open[src] then
        open[src][kind] = nil
        if not next(open[src]) then open[src] = nil end
    end

    sight(src, kind, key)
    if on then pushLost(src, kind, store.get(key)) end
end

---Re-records every open device. Called on the config tick; the walk is over open screens only, so
---a server with every phone pocketed costs one empty table scan a minute.
function actions.tick()
    if CFG.Enabled == false then return end
    for src, kinds in pairs(open) do
        if GetPlayerName(src) then
            for kind in pairs(kinds) do
                local key = deviceKey(src, kind)
                if key then
                    kinds[kind] = key
                    sight(src, kind, key)
                end
            end
        else
            open[src] = nil
        end
    end
end

---Drops a departing player's open screens.
---@param src integer player server id
function actions.dropped(src)
    open[src] = nil
end

---Whether Lost Mode is on for a profile's phone. The outgoing call and text paths read this the
---way they read airplane mode, so a lost number cannot be used to call or text out.
---@param profileKey string acting identity (what player.getIdentifier returns)
---@return boolean lost
function actions.isLost(profileKey)
    if CFG.Enabled == false then return false end
    if type(profileKey) ~= 'string' or profileKey == '' then return false end
    return store.isLost(profileKey .. ':phone')
end

---DB row -> the React device shape.
---@param row table sighting row
---@param thisKey string|nil the key of the device asking
---@return table device
local function serialize(row, thisKey)
    local lost = util.truthy(row.lost)
    local profile, deviceKind = splitKey(row.device_key)
    local security = profile and settings.getSecurity(profile, deviceKind) or nil
    return {
        hasPasscode = security ~= nil and security.passcode ~= nil,
        key         = row.device_key,
        kind        = row.kind,
        x           = tonumber(row.x) or 0,
        y           = tonumber(row.y) or 0,
        z           = tonumber(row.z) or 0,
        seenAt      = tonumber(row.seen_at) or 0,
        lost        = lost,
        lostMessage = lost and row.lost_message or nil,
        lostContact = lost and row.lost_contact or nil,
        lostAt      = lost and tonumber(row.lost_at) or nil,
        isThis      = thisKey ~= nil and row.device_key == thisKey,
        online      = onlineSource(row.device_key) ~= nil,
    }
end

---Reads a device row the caller is allowed to act on. Ownership is the recorded owner citizenid
---against the caller's real character, never the acting phone identity: a thief holding the
---phone resolves to their own citizenid and is refused.
---@param src integer player server id
---@param key any client-supplied device key
---@return table|nil row, table|nil failure
local function ownedRow(src, key)
    local cid = player.getRealIdentifier(src)
    if not cid then return nil, fail('findmy.playerNotFound', 'Player not found') end
    if type(key) ~= 'string' or key == '' or #key > 96 then
        return nil, fail('findmy.deviceNotFound', 'Device not found')
    end
    local row = store.get(key)
    if not row or row.citizenid ~= cid then
        return nil, fail('findmy.deviceNotFound', 'Device not found')
    end
    return row, nil
end

---Every device this character owns, newest sighting first, plus which one is asking. Read-only.
---@param src integer player server id
---@return table result
function actions.list(src)
    if CFG.Enabled == false then return fail('findmy.unavailable', 'Find My is not available') end
    local cid = player.getRealIdentifier(src)
    if not cid then return fail('findmy.playerNotFound', 'Player not found') end

    local thisKey = deviceKey(src, 'phone')
    local out = {}
    for _, row in ipairs(store.devicesFor(cid)) do
        out[#out + 1] = serialize(row, thisKey)
    end
    return ok({ devices = out, thisKey = thisKey })
end

---Rings a device the caller owns for config.FindMy.SoundSeconds, if its screen is up right now.
---@param src integer player server id
---@param payload table { key: string }
---@return table result
function actions.playSound(src, payload)
    if CFG.Enabled == false then return fail('findmy.unavailable', 'Find My is not available') end
    if type(payload) ~= 'table' then payload = {} end
    local row, refusal = ownedRow(src, payload.key)
    if not row then return refusal end

    local cid = player.getRealIdentifier(src)
    if not util.cooldown(cid, 'findmy:sound', (tonumber(CFG.SoundCooldown) or 15) * 1000) then
        return fail('findmy.soundTooSoon', 'Wait a moment before playing another sound')
    end

    local target, kind = onlineSource(row.device_key)
    if not target then return fail('findmy.deviceOffline', 'That device is not switched on') end

    TriggerClientEvent('sd-phone:client:findmy:sound', target, {
        kind    = kind,
        seconds = math.max(1, math.floor(tonumber(CFG.SoundSeconds) or 5)),
    })
    return ok()
end

---Turns Lost Mode on for a device the caller owns: it locks, shows the message and callback
---number on its lock screen, and its number stops placing calls and texts.
---@param src integer player server id
---@param payload table { key: string, message?: string, contact?: string }
---@return table result
function actions.setLost(src, payload)
    if CFG.Enabled == false then return fail('findmy.unavailable', 'Find My is not available') end
    if type(payload) ~= 'table' then payload = {} end
    local row, refusal = ownedRow(src, payload.key)
    if not row then return refusal end

    local cid = player.getRealIdentifier(src)
    if not util.cooldown(cid, 'findmy:lost', 2000) then
        return fail('findmy.tooSoon', 'Wait a moment before trying again')
    end

    local message = util.limitedString(payload.message, math.min(120, tonumber(CFG.MaxMessageLength) or 120))
    local contact = util.digits(payload.contact):sub(1, 24)
    if contact == '' then contact = nil end

    -- A lost phone with no passcode would have no way back in, so Lost Mode sets one first. The
    -- owner types it here, exactly as iOS asks for a code when none is set.
    local profile, deviceKind = splitKey(row.device_key)
    local security = profile and settings.getSecurity(profile, deviceKind) or nil
    if not (security and security.passcode) then
        local pin = type(payload.passcode) == 'string' and payload.passcode:match('^%d%d%d%d%d?%d?$') or nil
        if not pin then return fail('findmy.passcodeRequired', 'Set a 4 to 6 digit passcode so you can unlock it again') end
        if profile then settings.setSecurity(profile, pin, false, deviceKind) end
    end

    store.setLost(row.device_key, message, contact, os.time())

    local target, kind = onlineSource(row.device_key)
    if target then pushLost(target, kind, store.get(row.device_key)) end
    return ok()
end

---Turns Lost Mode off again and restores the device.
---@param src integer player server id
---@param payload table { key: string }
---@return table result
function actions.clearLost(src, payload)
    if CFG.Enabled == false then return fail('findmy.unavailable', 'Find My is not available') end
    if type(payload) ~= 'table' then payload = {} end
    local row, refusal = ownedRow(src, payload.key)
    if not row then return refusal end

    local cid = player.getRealIdentifier(src)
    if not util.cooldown(cid, 'findmy:lost', 2000) then
        return fail('findmy.tooSoon', 'Wait a moment before trying again')
    end

    store.clearLost(row.device_key)

    local target, kind = onlineSource(row.device_key)
    if target then pushLost(target, kind, nil) end
    return ok()
end

---Turns Lost Mode off on every device a character owns. The recovery hatch for an owner who
---locked themselves out; reached from the admin console command, never from a phone.
---@param cid string owner citizenid
---@return integer cleared devices that were in Lost Mode
function actions.clearLostFor(cid)
    local cleared = 0
    for _, row in ipairs(store.devicesFor(cid)) do
        if util.truthy(row.lost) then
            store.clearLost(row.device_key)
            cleared = cleared + 1
            local target, kind = onlineSource(row.device_key)
            if target then pushLost(target, kind, nil) end
        end
    end
    return cleared
end

---Wipes a device the caller owns: its settings row goes back to factory, which takes its
---installed apps and its lock with it exactly as Erase All Content does in Settings, and its
---sightings are dropped so it reports no position until someone opens it again.
---
---Only that device's own row is touched. The content a profile owns (messages, photos, contacts)
---is shared with the character's other device on a stock server, so wiping it from here would
---erase a phone that was never lost.
---@param src integer player server id
---@param payload table { key: string }
---@return table result
function actions.erase(src, payload)
    if CFG.Enabled == false then return fail('findmy.unavailable', 'Find My is not available') end
    if type(payload) ~= 'table' then payload = {} end
    local row, refusal = ownedRow(src, payload.key)
    if not row then return refusal end

    local cid = player.getRealIdentifier(src)
    if not util.cooldown(cid, 'findmy:erase', 30000) then
        return fail('findmy.tooSoon', 'Wait a moment before trying again')
    end

    local profile, kind = splitKey(row.device_key)
    if not profile then return fail('findmy.deviceNotFound', 'Device not found') end

    settings.resetSettings(profile, kind, 'erase')
    store.forget(row.device_key)

    local target = onlineSource(row.device_key)
    if target then
        pushLost(target, kind, nil)
        TriggerClientEvent('sd-phone:client:profileReset', target)
    end
    return ok()
end

---Lock-screen check for a device in Lost Mode: does this PIN open it? The passcode never leaves
---the server, so a thief cannot read it out of the push that put the banner on screen.
---@param src integer player server id
---@param payload table { pin: string }
---@return table result { ok: boolean }
function actions.unlock(src, payload)
    if CFG.Enabled == false then return fail('findmy.unavailable', 'Find My is not available') end
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getRealIdentifier(src)
    if not cid then return fail('findmy.playerNotFound', 'Player not found') end
    if not util.rateLimit(cid, 'findmy:unlock', 60000, 12) then
        return fail('findmy.tooManyAttempts', 'Too many attempts. Wait a moment.')
    end

    local key = deviceKey(src, 'phone')
    local row = key and store.get(key) or nil
    if not row or not util.truthy(row.lost) then return ok({ ok = true }) end

    local pin = util.digits(tostring(payload.pin or ''))
    if pin == '' then return ok({ ok = false }) end

    local profile, kind = splitKey(row.device_key)
    local security = profile and settings.getSecurity(profile, kind) or nil
    local expected = security and security.passcode or nil
    if not expected or expected == '' then
        local ownerSec = settings.getSecurity(row.citizenid, 'phone')
        expected = ownerSec and ownerSec.passcode or nil
    end
    if not expected or expected == '' then return ok({ ok = false }) end
    return ok({ ok = pin == expected })
end

return actions
