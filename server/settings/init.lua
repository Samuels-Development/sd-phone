---@type table Player bridge (bridge.server.player): citizenid/name/job lookups from a server id.
local player = require 'bridge.server.player'
---@type table Settings persistence layer (server.settings.store): phone_settings row CRUD plus
---custom tones and per-app notification prefs, all keyed by citizenid.
local store  = require 'server.settings.store'

-- Schema bootstrap.
CreateThread(function()
    local success, err = pcall(store.ensureSchema)
    if not success then
        print(('^1[sd-phone:settings]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:settings]^0 schema ready')
end)

---Server export: returns a player's phone number by server id, assigning one on first access;
---an unresolvable player yields nil.
---@param source number player server id
---@return string|nil number raw-digit phone number
exports('getPhoneNumber', function(source)
    local cid = player.getIdentifier(source)
    if not cid then return nil end
    return store.ensurePhoneNumber(cid)
end)

-- Client-reachable settings callbacks; the acting character always resolves from src.

---Returns the caller's full settings snapshot: tone selections, custom tones, airplane mode,
---clock preferences, wallpaper, chat text scale, locale and lock security. Read-only.
lib.callback.register('sd-phone:server:settings:get', function(source)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, message = 'Player not found' } end
    local data = store.getTones(cid)
    data.customRingtones         = store.listCustomTones(cid, 'ringtone')
    data.customNotificationTones = store.listCustomTones(cid, 'notification')
    data.airplaneMode            = store.isAirplane(cid)
    data.hour24                  = store.getHour24(cid)
    data.lockClock               = store.getLockClock(cid)
    data.wallpaper               = store.getWallpaper(cid)
    data.chatTextScale           = store.getChatTextScale(cid)
    data.locale                  = store.getLocale(cid)
    local sec = store.getSecurity(cid)
    data.passcode                = sec.passcode
    data.faceId                  = sec.faceId
    return { success = true, data = data }
end)

---Persists the caller's selected wallpaper key.
lib.callback.register('sd-phone:server:settings:setWallpaper', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    store.setWallpaper(cid, payload.wallpaper)
    return { success = true }
end)

---Persists the caller's lock security (passcode + Face Unlock), overwriting both fields.
lib.callback.register('sd-phone:server:settings:setSecurity', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    store.setSecurity(cid, payload.passcode, payload.faceId == true)
    return { success = true }
end)

---Persists the caller's lockscreen clock customization (font/layout/colour/scale).
lib.callback.register('sd-phone:server:settings:setLockClock', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, message = 'Player not found' } end
    store.setLockClock(cid, payload or {})
    return { success = true }
end)

---Persists the caller's chat-bubble text size multiplier.
lib.callback.register('sd-phone:server:settings:setChatTextScale', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    store.setChatTextScale(cid, payload.scale)
    return { success = true }
end)

---Persists the caller's chosen phone language.
lib.callback.register('sd-phone:server:settings:setLocale', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    store.setLocale(cid, payload.locale)
    return { success = true }
end)

---Toggles the caller's airplane mode; turning it off fires the server-local release event.
lib.callback.register('sd-phone:server:settings:setAirplane', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    local on = payload.on == true
    store.setAirplane(cid, on)
    if not on then TriggerEvent('sd-phone:server:airplane:released', source) end
    return { success = true }
end)

---Persists the caller's 24-hour time preference, coerced to a strict boolean.
lib.callback.register('sd-phone:server:settings:setHour24', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    store.setHour24(cid, payload.on == true)
    return { success = true }
end)

---Persists the caller's tone selections; a missing or invalid field is left unchanged.
lib.callback.register('sd-phone:server:settings:setTones', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    store.setTones(cid, payload.ringtone, payload.notificationTone)
    return { success = true }
end)

---Returns the caller's notification preference for one app, defaulting to enabled. Read-only.
lib.callback.register('sd-phone:server:settings:getNotifPref', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    return { success = true, data = { enabled = store.getNotifPref(cid, payload.app) } }
end)

---Persists the caller's notification preference for one app.
lib.callback.register('sd-phone:server:settings:setNotifPref', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    store.setNotifPref(cid, payload.app, payload.on == true)
    return { success = true }
end)

---Saves a custom (YouTube) tone, ringtone or notification; the store's boolean result becomes
---the envelope's success flag.
lib.callback.register('sd-phone:server:settings:tones:add', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    return { success = store.addCustomTone(cid, payload.kind, payload.id, payload.name, payload.url) }
end)

---Removes one of the caller's custom tones.
lib.callback.register('sd-phone:server:settings:tones:remove', function(source, payload)
    local cid = player.getIdentifier(source)
    if not cid then return { success = false, message = 'Player not found' } end
    payload = type(payload) == 'table' and payload or {}
    store.removeCustomTone(cid, payload.id)
    return { success = true }
end)

---Server export: returns a character's phone number by citizenid. Pass ensure == true to assign
---a number on first access; otherwise a never-assigned character yields nil.
---@param citizenid string framework per-character id
---@param ensure boolean|nil assign a number when none exists yet
---@return string|nil number raw-digit phone number
exports('getPhoneNumberByIdentifier', function(citizenid, ensure)
    if type(citizenid) ~= 'string' or citizenid == '' then return nil end
    if ensure == true then return store.ensurePhoneNumber(citizenid) end
    return store.getPhoneNumber(citizenid)
end)

---Server export: returns the citizenid that owns a phone number, or nil when unassigned.
---@param number string phone number in any formatting
---@return string|nil citizenid
exports('getIdentifierByNumber', function(number)
    return store.getCitizenByNumber(number)
end)

---Server export: the connected server id of the character that owns a phone number. Nil when the
---number is unassigned or its owner is offline.
---@param number string phone number in any formatting
---@return number|nil source
exports('getSourceByNumber', function(number)
    local cid = store.getCitizenByNumber(number)
    if not cid then return nil end
    return player.getSourceByIdentifier(cid)
end)

---Server export: returns true when a phone number is assigned to any character.
---@param number string phone number in any formatting
---@return boolean inService
exports('isNumberInService', function(number)
    local digits = (tostring(number or ''):gsub('%D', ''))
    if digits == '' then return false end
    return store.numberExists(digits)
end)

---Server export: returns true when a player currently has airplane mode on; an unresolvable
---source reads as false.
---@param source number player server id
---@return boolean on
exports('isAirplaneMode', function(source)
    if type(source) ~= 'number' then return false end
    local cid = player.getIdentifier(source)
    if not cid then return false end
    return store.isAirplane(cid)
end)
