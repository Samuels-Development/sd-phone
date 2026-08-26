---Whether a started resource named roadphone is the sd-phone name-holder shim rather than the real
---product.
---@return boolean
local function isShimRoadphone()
    return GetResourceMetadata('roadphone', 'sd_phone_shim', 0) == 'yes'
end

---Returns whether the real roadphone resource is started. sd-phone holds the same resource name
---through `provide` and is deliberately ignored.
---@return boolean
local function realRoadphoneStarted()
    for i = 0, GetNumResources() - 1 do
        if GetResourceByFindIndex(i) == 'roadphone' then return not isShimRoadphone() end
    end
    return false
end

-- Registration proceeds unless sd_phone_roadphonecompat is explicitly disabled or the real roadphone
-- is running.
local compatConvar = GetConvar('sd_phone_roadphonecompat', 'true')
if compatConvar == 'false' or compatConvar == '0' or realRoadphoneStarted() then return end

---@type table Self-export proxy for the sd-phone client surface.
local sd = exports['sd-phone']

---@type table sd-phone config root (configs/config.lua): phone prop prefix + default frame colour.
local config = require 'configs.config'

---@type table Weather bridge (bridge.client.weather): the live reading behind getWeather.
local weather = require 'bridge.client.weather'

---@type any[] AddEventHandler cookies for every registered export handler.
local exportCookies = {}

---@type any[] Handler cookies for the event bridge, inbound RoadPhone events and the state trackers.
local eventCookies = {}

---Registers fn on the client export registry under the roadphone name via the __cfx_export event.
---@param name string RoadPhone export name, verbatim including its casing
---@param fn function implementation
local function registerExport(name, fn)
    exportCookies[#exportCookies + 1] = AddEventHandler(('__cfx_export_roadphone_%s'):format(name), function(setCB)
        setCB(fn)
    end)
end

---@type table<string, boolean> Surfaces that have already warned this session.
local warned = {}

---Prints one console breadcrumb the first time an unsupported surface is touched.
---@param name string warn key
---@param why string what is unsupported and what happens instead
local function warnOnce(name, why)
    if warned[name] then return end
    warned[name] = true
    print(('^3[sd-phone]^0 roadphone compat: %s %s'):format(name, why))
end

---Registers a stubbed export: warns once on first call, then returns the fixed default.
---@param name string RoadPhone export name
---@param default any fixed return value
---@param why string reason clause
local function stubExport(name, default, why)
    registerExport(name, function()
        warnOnce(name, why)
        return default
    end)
end

---@type boolean Live flashlight beam state, tracked off the first-party client event because the
---torch is UI-driven and has no Lua getter.
local flashlightOn = false
eventCookies[#eventCookies + 1] = AddEventHandler('sd-phone:client:flashlight', function(on)
    flashlightOn = on == true
end)

---@type string Frame colour of the phone last opened, which is what its held prop is modelled on.
local frameColor = config.Phone.DefaultColor or 'black'
eventCookies[#eventCookies + 1] = RegisterNetEvent('sd-phone:client:openFromItem', function(color)
    if type(color) == 'string' and color ~= '' then frameColor = color end
end)

---@type { state: string, number: string|nil, name: string|nil, channel: number|nil } The local
---player's live call, tracked off the call lifecycle events the phone already listens to. sd-phone
---answers call state on the SERVER, so this is the only client-side view of it.
local call = { state = 'idle' }

---Records one call-state transition.
---@param state 'idle'|'incoming'|'outgoing'|'active'
---@param data table|nil { channel, number, name } from the lifecycle event
local function setCall(state, data)
    if state == 'idle' then
        call = { state = 'idle' }
        return
    end
    call = {
        state   = state,
        number  = data and data.number or call.number,
        name    = data and data.name or call.name,
        channel = data and data.channel or call.channel,
    }
end

eventCookies[#eventCookies + 1] = RegisterNetEvent('sd-phone:client:call:incoming', function(data)
    setCall('incoming', data)
    TriggerEvent('roadphone:client:incomingcall', data and data.number, (data and data.number or '') == '', nil, false)
end)
eventCookies[#eventCookies + 1] = RegisterNetEvent('sd-phone:client:call:outgoing', function(data)
    setCall('outgoing', data)
end)
eventCookies[#eventCookies + 1] = RegisterNetEvent('sd-phone:client:call:connected', function(data)
    setCall('active', data)
    TriggerEvent('roadphone:client:acceptIncomingCall', data and data.channel)
end)
eventCookies[#eventCookies + 1] = RegisterNetEvent('sd-phone:client:call:ended', function()
    setCall('idle', nil)
end)

---Runs one sd-phone server callback, tolerating a phone that is mid-restart. Callbacks yield, which
---an export called from a coroutine may do.
---@param name string callback name
---@param payload any
---@return any|nil result
local function ask(name, payload)
    local ok, result = pcall(lib.callback.await, name, false, payload)
    return ok and result or nil
end

---The envelope data behind one callback, or nil when the call failed or was refused.
---@param name string callback name
---@param payload any
---@return table|nil data
local function askData(name, payload)
    local result = ask(name, payload)
    if type(result) ~= 'table' or result.success ~= true then return nil end
    return result.data
end

-- Shell state: open, blocked and the phone box, all of which sd-phone models directly.

registerExport('isPhoneOpen', function() return sd:isOpen() end)
registerExport('isBlocked', function() return sd:isDisabled() end)

---blockPhone(): RoadPhone documents the return as "always true" because it reports the new blocked
---state rather than success. Mirrored literally so a caller branching on it behaves the same.
registerExport('blockPhone', function()
    sd:setDisabled(true)
    return true
end)

---unblockPhone(): the same, documented as "always false" - again the new blocked state.
registerExport('unblockPhone', function()
    sd:setDisabled(false)
    return false
end)

registerExport('togglePhone', function()
    if sd:isOpen() then sd:close() else sd:open() end
end)

registerExport('closePhone', function() sd:close() end)

---setPhoneBoxActive(active): while a phone box owns the call, the player's own phone stands down.
---sd-phone expresses that as the same lockout ToggleDisabled uses, which is what RoadPhone's own
---warning about leaving it true describes.
registerExport('setPhoneBoxActive', function(active)
    sd:setDisabled(active == true)
end)

---getPhoneProp(itemName?): the prop model the phone is held with. sd-phone models the prop on the
---FRAME COLOUR of the phone last opened rather than on an item name, so the argument is ignored.
registerExport('getPhoneProp', function(_itemName)
    return (config.Phone.PropPrefix or 'sd_phone_') .. frameColor
end)

-- Identity and shell readings.

---@type { value: string|nil, at: integer } Own-number cache, refreshed lazily after a minute. The
---number lives server-side, so this rides the same callback the lb-phone shim uses.
local numberCache = { value = nil, at = 0 }

---Drops the cached number when the character changes.
local function clearNumberCache()
    numberCache.value, numberCache.at = nil, 0
end
eventCookies[#eventCookies + 1] = RegisterNetEvent('QBCore:Client:OnPlayerLoaded', clearNumberCache)
eventCookies[#eventCookies + 1] = RegisterNetEvent('QBCore:Client:OnPlayerUnload', clearNumberCache)
eventCookies[#eventCookies + 1] = RegisterNetEvent('esx:playerLoaded', clearNumberCache)
eventCookies[#eventCookies + 1] = RegisterNetEvent('esx:onPlayerLogout', clearNumberCache)

registerExport('getPhoneNumber', function()
    if numberCache.value and GetGameTimer() - numberCache.at < 60000 then return numberCache.value end

    local number = ask('sd-phone:server:compat:selfNumber')
    if type(number) == 'string' and number ~= '' then
        numberCache.value, numberCache.at = number, GetGameTimer()
    end
    return numberCache.value
end)

registerExport('isFlightmode', function() return LocalPlayer.state.airplaneMode == true end)
registerExport('isFlashlight', function() return flashlightOn end)
registerExport('isInPhoneCall', function() return call.state ~= 'idle' or LocalPlayer.state.inCall == true end)

-- Calls: the phone drives these from its UI through server callbacks, so the shim drives the same
-- callbacks with the channel it tracked off the lifecycle events.

registerExport('getCallState', function()
    return { state = call.state, number = call.number, isMuted = false, contactName = call.name }
end)

registerExport('acceptCall', function()
    if call.state ~= 'incoming' then return false end
    local result = ask('sd-phone:server:call:accept', { channel = call.channel })
    return type(result) == 'table' and result.success == true
end)

registerExport('declineCall', function()
    if call.state ~= 'incoming' then return false end
    local result = ask('sd-phone:server:call:decline', { channel = call.channel })
    return type(result) == 'table' and result.success == true
end)

registerExport('endCall', function()
    if call.state == 'idle' then return false end
    local result = ask('sd-phone:server:call:hangup', { channel = call.channel })
    return type(result) == 'table' and result.success == true
end)

---startCall(number, anonym?): places an outgoing call, opening the phone first as RoadPhone does.
---`anonym` is ignored: sd-phone withholds a caller id from the phone's own settings rather than per
---call, so a call placed here always shows the caller's number.
registerExport('startCall', function(number, anonym)
    if anonym == true then
        warnOnce('startCall.anonym', 'cannot place an anonymous call: sd-phone withholds a caller id from the phone\'s own settings, so the call went out with the caller\'s number')
    end

    sd:open()
    ask('sd-phone:server:call:dial', { number = tostring(number or '') })
end)

-- Messaging, mail and dispatch: each rides the same server path the phone's own composer does, or
-- the compat support handler where RoadPhone's client export has no server export to reach.

---sendMessage(phoneNumber, message): the CLIENT two-argument form, sent from the local player's own
---number. The server export of the same name is three-argument and lives in the server half.
registerExport('sendMessage', function(phoneNumber, message)
    ask('sd-phone:server:messages:send', {
        conversation = (tostring(phoneNumber or ''):gsub('%D', '')),
        body         = tostring(message or ''),
    })
end)

registerExport('sendMail', function(mailData)
    if type(mailData) ~= 'table' then return end
    TriggerServerEvent('sd-phone:server:compat:roadphone:mailSelf', mailData)
end)

registerExport('sendMailOffline', function(identifier, mailData)
    if type(identifier) ~= 'string' or type(mailData) ~= 'table' then return end
    TriggerServerEvent('sd-phone:server:compat:roadphone:mailOffline', identifier, mailData)
end)

---sendDispatch(message, job, image?): the CLIENT three-argument form, with no source and no
---coordinates. The server export of the same name takes (source, message, job, coords, image).
registerExport('sendDispatch', function(message, job, image)
    TriggerServerEvent('sd-phone:server:compat:roadphone:dispatch', message, job, image)
end)

---sendNotification(notifydata): shows one banner. `apptitle` names the app, `img` the icon.
registerExport('sendNotification', function(notifydata)
    if type(notifydata) ~= 'table' then return end
    sd:showNotification({
        title = notifydata.title or notifydata.apptitle,
        body  = notifydata.message,
        image = type(notifydata.img) == 'string' and notifydata.img or nil,
        app   = notifydata.app,
        appId = notifydata.app,
    })
end)

-- Cached readers: sd-phone keeps none of these on the client, so each is fetched through the same
-- server callback the app itself uses. They yield, which an export call may do.

registerExport('getContacts', function()
    local data = askData('sd-phone:server:contacts:list')
    return data and data.contacts or {}
end)

registerExport('getFavouriteContacts', function()
    local data = askData('sd-phone:server:contacts:list')
    local out = {}
    for _, contact in ipairs(data and data.contacts or {}) do
        if contact.favorite == true or contact.favorite == 1 then out[#out + 1] = contact end
    end
    return out
end)

registerExport('getRecentCalls', function()
    local data = askData('sd-phone:server:contacts:list')
    return data and data.recents or {}
end)

---getMessages(): every conversation, in sd-phone's own thread shape rather than RoadPhone's flat
---message rows - sd-phone threads by participant pair and never holds a flat list.
registerExport('getMessages', function()
    warnOnce('getMessages', 'returns sd-phone conversations rather than RoadPhone\'s flat message rows; the field names differ')
    local data = askData('sd-phone:server:messages:list')
    return data and data.conversations or {}
end)

---getUnreadMessages(): the conversations carrying unread messages, for the same reason.
registerExport('getUnreadMessages', function()
    warnOnce('getUnreadMessages', 'returns unread sd-phone conversations rather than RoadPhone\'s flat message rows; the field names differ')
    local data = askData('sd-phone:server:messages:list')
    local out = {}
    for _, conversation in ipairs(data and data.conversations or {}) do
        if (tonumber(conversation.unread) or 0) > 0 then out[#out + 1] = conversation end
    end
    return out
end)

registerExport('getNotes', function()
    local data = askData('sd-phone:server:notes:list')
    return data and (data.notes or data) or nil
end)

registerExport('getBankTransactions', function()
    local data = askData('sd-phone:server:banking:overview')
    return data and (data.transactions or {}) or {}
end)

---getWeather(): the live reading. `temp` is absent: sd-phone derives a temperature inside the
---Weather app from the code below rather than publishing one on the client.
registerExport('getWeather', function()
    warnOnce('getWeather', 'reports the weather code and clock only; sd-phone derives temperature inside the Weather app rather than publishing it')
    local snapshot = weather.read()
    return { type = snapshot.current, next = snapshot.next, time = snapshot.time }
end)

-- Map pins: drawn as world blips, with an optional GPS route. Ownership is the invoking resource,
-- so one resource can never remove another's pin. The server half drives the same table through
-- sd-phone:client:compat:roadphone:pin.

---@type table<string, { blip: number|nil, resource: string, route: boolean }> Live pins by id; a
---pin asked for with `blip = false` is tracked with no blip handle.
local pins = {}

---@type integer Ordinal behind each locally minted pin id.
local pinSeq = 0

---Removes one pin, clearing its route with it. A pin placed with `blip = false` carries no blip to
---remove, so it only leaves the table.
---@param id string pin handle
---@return boolean removed
local function removePin(id)
    local pin = pins[id]
    if not pin then return false end
    if pin.blip then
        if pin.route then SetBlipRoute(pin.blip, false) end
        RemoveBlip(pin.blip)
    end
    pins[id] = nil
    return true
end

---Draws one pin as a world blip and starts its route when asked. `blip = false` is RoadPhone's "no
---blip at all", which leaves nothing drawn but still tracks the handle so a removal answers true.
---@param id string pin handle
---@param resource string owning resource
---@param data table { x, y, z?, label?, route?, blip? }
local function addPin(id, resource, data)
    if pins[id] then removePin(id) end

    if data.blip == false then
        warnOnce('AddMapPin.noblip', 'was asked for a pin with no map blip, which leaves nothing on screen; sd-phone renders a foreign pin only as a world blip and its Maps app keeps its own per-character markers')
        pins[id] = { blip = nil, resource = resource, route = false }
        return
    end

    local opts = type(data.blip) == 'table' and data.blip or nil
    local sprite = (opts and tonumber(opts.sprite)) or 162
    local color = (opts and tonumber(opts.color)) or 5
    local scale = (opts and tonumber(opts.scale)) or 0.9
    local short = not opts or opts.short ~= false

    local blip = AddBlipForCoord(data.x + 0.0, data.y + 0.0, (tonumber(data.z) or 0) + 0.0)
    SetBlipSprite(blip, sprite)
    SetBlipColour(blip, color)
    SetBlipScale(blip, scale + 0.0)
    SetBlipAsShortRange(blip, short)
    if type(data.label) == 'string' and data.label ~= '' then
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(data.label)
        EndTextCommandSetBlipName(blip)
    end
    if data.route == true then
        SetBlipRoute(blip, true)
        SetBlipRouteColour(blip, color)
    end

    pins[id] = { blip = blip, resource = resource, route = data.route == true }
end

---AddMapPin(data): places a pin and answers its handle. A caller-supplied `data.id` comes back
---verbatim so the same string removes it again; without one, a handle is minted.
---
---sd-phone's Maps app owns its markers per character, so a foreign pin is a world blip rather than
---a saved marker.
registerExport('AddMapPin', function(data)
    if type(data) ~= 'table' then return nil end
    local x, y = tonumber(data.x), tonumber(data.y)
    if not x or not y then return nil end

    warnOnce('AddMapPin', 'draws a world blip; sd-phone\'s Maps app keeps its own per-character markers, which a foreign pin never joins')

    local resource = GetInvokingResource() or 'unknown'
    local own = type(data.id) == 'string' and data.id ~= '' and data.id or nil

    local key
    if own then
        key = ('ext:%s:%s'):format(resource, own)
    else
        pinSeq = pinSeq + 1
        key = ('ext:%s:%d'):format(resource, pinSeq)
    end

    addPin(key, resource, data)
    return own or key
end)

---RemoveMapPin(id): false when the pin does not exist or belongs to another resource. A caller's
---own id is namespaced to that resource before the lookup, so it can only ever match its own pins.
registerExport('RemoveMapPin', function(id)
    if type(id) ~= 'string' or id == '' then return false end

    local resource = GetInvokingResource() or 'unknown'
    local key = pins[id] and id or ('ext:%s:%s'):format(resource, id)
    local pin = pins[key]
    if not pin or pin.resource ~= resource then return false end
    return removePin(key)
end)

---RemoveMapPins(): drops every pin the calling resource placed and answers how many went.
registerExport('RemoveMapPins', function()
    local resource = GetInvokingResource() or 'unknown'
    local removed = 0
    for id, pin in pairs(pins) do
        if pin.resource == resource then
            removePin(id)
            removed = removed + 1
        end
    end
    return removed
end)

---Server-driven pins from AddMapPinForPlayer / RemoveMapPinForPlayer, which mint the handle there.
---@param action 'add'|'remove'
---@param data table the pin, or { id } on a removal
eventCookies[#eventCookies + 1] = RegisterNetEvent('sd-phone:client:compat:roadphone:pin', function(action, data)
    if type(data) ~= 'table' or type(data.id) ~= 'string' then return end
    if action == 'add' then
        addPin(data.id, 'server', data)
    else
        removePin(data.id)
    end
end)

-- Inbound RoadPhone client events: the ones a third-party resource fires AT the phone.

---roadphone:sendNotification(data): RoadPhone's primary integration event, the event form of the
---sendNotification export.
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:sendNotification', function(data)
    if type(data) ~= 'table' then return end
    sd:showNotification({
        title = data.title or data.apptitle,
        body  = data.message,
        image = type(data.img) == 'string' and data.img or nil,
        app   = data.app,
        appId = data.app,
    })
end)

---roadphone:sendOffNotification(text): a framework game notification outside the phone UI.
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:sendOffNotification', function(text)
    if type(text) ~= 'string' or text == '' then return end
    lib.notify({ description = text })
end)

---roadphone:use(): the canonical "player used the phone item" hook.
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:use', function() sd:open() end)

---roadphone:closePhone(): closes the phone if it is open.
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:closePhone', function() sd:close() end)

---roadphone:client:call(number, isAnonym): starts an outgoing call. The phonebox variant shares it.
---@param number string|number the number to dial
local function startCall(number)
    sd:open()
    ask('sd-phone:server:call:dial', { number = tostring(number or '') })
end
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:client:call', startCall)
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:client:call:phonebox', startCall)

---roadphone:client:endCall(): tears down whatever call the player is in.
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:client:endCall', function()
    if call.state == 'idle' then return end
    ask('sd-phone:server:call:hangup', { channel = call.channel })
end)

---roadphone:client:addContact(firstname, lastname, number, picture, note, mail, company): saves a
---contact through the phone's own validated add path.
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:client:addContact', function(firstname, lastname, number, picture, _note, mail)
    local name = ('%s %s'):format(firstname or '', lastname or '')
    ask('sd-phone:server:contacts:add', {
        name   = (name:gsub('^%s+', ''):gsub('%s+$', '')),
        phone  = tostring(number or ''),
        avatar = picture,
        email  = mail,
    })
end)

---The closest other player within `radius` metres, as a server id. Nil when nobody is that near.
---@param radius number metres
---@return number|nil serverId
local function closestPlayer(radius)
    local me = PlayerPedId()
    local origin = GetEntityCoords(me)
    local bestId, bestDist

    for _, p in ipairs(GetActivePlayers()) do
        local ped = GetPlayerPed(p)
        if ped ~= 0 and ped ~= me then
            local dist = #(GetEntityCoords(ped) - origin)
            if dist <= radius and (not bestDist or dist < bestDist) then
                bestId, bestDist = GetPlayerServerId(p), dist
            end
        end
    end
    return bestId
end

---roadphone:client:GiveContactDetails(): offers the local player's name and number to the closest
---player within 2.5m. sd-phone delivers it as an AirShare request they accept before it is saved.
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:client:GiveContactDetails', function()
    local target = closestPlayer(2.5)
    if not target then return end
    TriggerServerEvent('sd-phone:server:compat:roadphone:giveContact', target)
end)

---roadphone:client:joinradio(frequency): tunes the phone's Radio, subject to the same restricted
---band check the app runs. The Radio app owns the voice channel, so this stores what it opens on.
---@param frequency number|string the frequency to tune to
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:client:joinradio', function(frequency)
    local freq = tonumber(frequency)
    if not freq then return end

    local verdict = ask('sd-phone:server:radio:canTune', freq)
    if type(verdict) == 'table' and verdict.allowed == false then return end

    warnOnce('joinradio', 'stored the frequency for the Radio app to open on; sd-phone joins the voice channel from the Radio app itself, so the player still taps to go live')
    local prefs = askData('sd-phone:server:radio:get') or {}
    ask('sd-phone:server:radio:save', { frequency = freq, volume = prefs.volume })
end)

---roadphone:client:leaveradio(): leaves the radio channel through the same path a server-side
---band restriction uses, so the voice channel drops and the Radio app follows.
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:client:leaveradio', function()
    TriggerEvent('sd-phone:client:radio:forceoff', { message = 'You left the radio channel.' })
end)

---roadphone:service:newDispatch(dispatch): the client end of RoadPhone's dispatch flow. sd-phone's
---Services app reads its dispatches from the server, so one injected here arrives as a banner.
---@param dispatch table { message?, sender?, coords?, ... }
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:service:newDispatch', function(dispatch)
    if type(dispatch) ~= 'table' then return end

    warnOnce('newDispatch', 'shows a banner rather than a row in the Services app; sd-phone reads its dispatches from the server, so use the sendDispatch export to reach the whole job')
    sd:showNotification({
        title = type(dispatch.sender) == 'string' and dispatch.sender or 'Dispatch',
        body  = dispatch.message,
        app   = 'services',
        appId = 'services',
    })
end)

---roadphone:health:stressUpdate(stressLevel): RoadPhone's entry point for drug and combat scripts.
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:health:stressUpdate', function()
    warnOnce('stressUpdate', 'has nothing to update: sd-phone\'s Health app models steps, distance and heart rate but no stress value, so the injected level is dropped')
end)

---roadphone:setWeather(weather): pushes a foreign weather reading into the phone.
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:setWeather', function()
    warnOnce('setWeather', 'cannot be honoured: sd-phone\'s Weather app reads the live game weather through whichever weather script is running rather than accepting a pushed reading')
end)

---roadphone:checkWeather(): forces a refresh from the current game weather. sd-phone reads the live
---weather on every look, so there is no cached reading for this to invalidate.
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:checkWeather', function()
    warnOnce('checkWeather', 'had nothing to refresh: sd-phone reads the live game weather on every look rather than caching a reading')
end)

---roadphone:nui(data): RoadPhone's raw NUI passthrough.
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:nui', function()
    warnOnce('roadphone:nui', 'is not supported: sd-phone\'s UI answers its own message contract, so a raw RoadPhone payload would be ignored. Use the custom-app SDK instead')
end)

---camera:phone(): opens the photo camera.
eventCookies[#eventCookies + 1] = RegisterNetEvent('camera:phone', function()
    sd:openApp('camera')
end)

---camera:facetime:menu(): opens the FaceTime selfie camera. sd-phone has no separate selfie
---picker, so the Camera app is opened and the player flips to the front lens there.
eventCookies[#eventCookies + 1] = RegisterNetEvent('camera:facetime:menu', function()
    warnOnce('camera:facetime:menu', 'opened the Camera app: sd-phone has no separate FaceTime selfie picker, and the front lens is a toggle inside the camera')
    sd:openApp('camera')
end)

---roadphone:invalidatePhoneCache(): RoadPhone caches "does this player hold a phone" on the client.
---sd-phone resolves ownership on the server at every open, so there is no cache to clear.
eventCookies[#eventCookies + 1] = RegisterNetEvent('roadphone:invalidatePhoneCache', function()
    warnOnce('invalidatePhoneCache', 'has nothing to clear: sd-phone asks the server which phone a player owns at every open, so an inventory change outside the normal flow is already picked up')
end)

-- roadphone:client:call:eventnumber is deliberately never fired. RoadPhone raises it only for a
-- number listed in its own Config.EventNumbers, which lives inside the product and has no sd-phone
-- counterpart: company lines come from configs/services.lua and everything else is an ordinary
-- call, so there is no set of numbers a dial could be tested against. Firing it for every dialled
-- number would be a different signal than the one the docs describe.

-- Compat commands from the server half: /TogglePhone, /stopphone and /fixphoneprop, none of which
-- have a server-side action to run.

eventCookies[#eventCookies + 1] = RegisterNetEvent('sd-phone:client:compat:roadphone:toggle', function()
    if sd:isOpen() then sd:close() else sd:open() end
end)

eventCookies[#eventCookies + 1] = RegisterNetEvent('sd-phone:client:compat:roadphone:stop', function()
    sd:close()
    SetNuiFocus(false, false)
end)

---Deletes every object attached to the local ped, which is what RoadPhone's /fixphoneprop does.
eventCookies[#eventCookies + 1] = RegisterNetEvent('sd-phone:client:compat:roadphone:fixprop', function()
    local ped = PlayerPedId()
    local handle, entity = FindFirstObject()
    local finished = false
    repeat
        if IsEntityAttachedToEntity(entity, ped) then
            SetEntityAsMissionEntity(entity, true, true)
            DeleteEntity(entity)
        end
        finished, entity = FindNextObject(handle)
    until not finished
    EndFindObject(handle)
end)

-- Stubs, grouped by family. Each warns once and returns a type-correct default.

stubExport('isPlayerMuted', false,
    'cannot be answered: sd-phone drives call muting through the running voice script and publishes no Lua view of it')
stubExport('setHeaderBlack', nil,
    'has no sd-phone equivalent: the status bar picks its own contrast from what is behind it')
stubExport('inputFocus', nil,
    'is not supported: sd-phone owns its own NUI focus, and handing it out mid-session strands the shell')
stubExport('SendMessageNUI', nil,
    'is not supported: sd-phone\'s UI answers its own message contract, so a raw RoadPhone payload would be ignored. Use the custom-app SDK instead')

stubExport('getBankIban', '',
    'has no client counterpart: IBANs are synthesised server-side, so read one with the server getPlayerIBAN export')

-- Live Bar / Dynamic Island: sd-phone's island shows its own call, music and timer activities and
-- takes no third-party ones, so a start reports that nothing was placed.
stubExport('StartIslandActivity', nil,
    'has no sd-phone equivalent: the Dynamic Island shows the phone\'s own activities and takes no third-party ones')
stubExport('UpdateIslandActivity', false,
    'has no sd-phone equivalent: there is no third-party island activity to patch')
stubExport('StopIslandActivity', false,
    'has no sd-phone equivalent: there is no third-party island activity to stop')

-- Music: the Music app plays each player's own library from inside the UI, with no Lua transport
-- controls. Reads report nothing playing and every control reports it did nothing.
stubExport('getMusicState', {
    isPlaying = false, isPaused = false, title = nil, artist = nil, image = nil,
    length = 0, current = 0, lengthFormatted = '0:00', currentFormatted = '0:00',
    volume = 0, isRadio = false,
}, 'has no sd-phone equivalent: the Music app owns playback inside the UI and publishes no Lua transport state')
stubExport('watchPauseMusic', false, 'has no sd-phone equivalent: the Music app has no Lua transport controls')
stubExport('watchResumeMusic', false, 'has no sd-phone equivalent: the Music app has no Lua transport controls')
stubExport('watchNextSong', false, 'has no sd-phone equivalent: the Music app has no Lua transport controls')
stubExport('watchPreviousSong', false, 'has no sd-phone equivalent: the Music app has no Lua transport controls')
stubExport('watchSetVolume', false, 'has no sd-phone equivalent: the Music app has no Lua transport controls')
stubExport('watchPlaySong', false, 'has no sd-phone equivalent: use the sd-phone server giveTrack export to put a track in a player\'s library')

-- Health: sd-phone samples steps, distance and heart rate on the client but keeps them inside the
-- Health app, so each reader reports RoadPhone's own documented default.
stubExport('getClientHealthData', {
    steps = 0, distance = 0, calories = 0, activeMinutes = 0, heartRate = 70, stress = 0,
    bloodPressure = { systolic = 120, diastolic = 80 }, spo2 = 98, isSleeping = false,
}, 'has no Lua reader: sd-phone samples health inside the Health app and publishes no Lua view of it')
stubExport('getClientHeartRate', 70, 'has no Lua reader: sd-phone samples health inside the Health app')
stubExport('getClientStress', 0, 'has no Lua reader: sd-phone models no stress')
stubExport('getClientSteps', 0, 'has no Lua reader: sd-phone counts steps inside the Health app')

-- Valet: sd-phone's Garages app locates and retrieves vehicles through whichever garage script is
-- running, driven by the player from the app rather than by a plate handed in from outside.
stubExport('searchCar', nil,
    'has no sd-phone equivalent: the Garages app locates a vehicle from the app itself, through the running garage script')
stubExport('deliverOrMarkCar', nil,
    'has no sd-phone equivalent: the Garages app retrieves a vehicle from the app itself, through the running garage script')

---Replays onResourceStart under roadphone's name once per sd-phone client start, so third-party
---RoadPhone apps that re-register on a phone restart also re-register after an sd-phone restart.
CreateThread(function()
    Wait(500)
    TriggerEvent('onResourceStart', 'roadphone')
end)

---Removes every shim handler, exports and event bridge alike, when the real roadphone starts
---mid-session, and drops the blips it drew.
AddEventHandler('onClientResourceStart', function(resource)
    if resource ~= 'roadphone' or isShimRoadphone() then return end

    for i = 1, #exportCookies do RemoveEventHandler(exportCookies[i]) end
    exportCookies = {}
    for i = 1, #eventCookies do RemoveEventHandler(eventCookies[i]) end
    eventCookies = {}
    for id in pairs(pins) do removePin(id) end
    print('^3[sd-phone]^0 roadphone compat: the REAL roadphone resource just started, so the compat shim deregistered its client exports and event handlers and new lookups now resolve to roadphone. Only already-cached callers keep the shim\'s functions until roadphone next stops.')
end)
