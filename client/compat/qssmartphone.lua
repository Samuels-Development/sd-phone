---@type string[] Every resource name Quasar's phone line answers on. The shim claims each one
---separately, because a server may genuinely run one of the siblings (qs-base ships with every
---Quasar script) while wanting sd-phone to answer for the phone itself.
local NAMES <const> = { 'qs-smartphone', 'qs-smartphone-pro', 'qs-smartphone-lite', 'qs-base' }

---@type string[] Every phone product's own name. The legacy surface lands on all three: PRO and
---Lite ship the same phone under their own folder names, and a caller picks whichever name it saw.
local PHONES <const> = { 'qs-smartphone', 'qs-smartphone-pro', 'qs-smartphone-lite' }

---@type string[] The names PRO's own surface answers on. PRO is routinely installed in a folder
---still called qs-smartphone and its own docs write exports['qs-smartphone'], so both are claimed.
local PRO <const> = { 'qs-smartphone', 'qs-smartphone-pro' }

---Whether a started resource of `name` is an sd-phone name-holder stub rather than a real Quasar
---product.
---@param name string
---@return boolean
local function isShimResource(name)
    return GetResourceMetadata(name, 'sd_phone_shim', 0) == 'yes'
end

---Whether a REAL resource of `name` is running. sd-phone holds the Quasar names through `provide`,
---so a GetResourceState check alone would find itself; the resource list is enumerated instead.
---@param name string
---@return boolean
local function realIsRunning(name)
    for i = 0, GetNumResources() - 1 do
        if GetResourceByFindIndex(i) == name then
            if isShimResource(name) then return false end
            local state = GetResourceState(name)
            return state == 'started' or state == 'starting'
        end
    end
    return false
end

-- Registration proceeds unless sd_phone_qscompat is explicitly disabled or the real qs-smartphone
-- is running.
local compatConvar = GetConvar('sd_phone_qscompat', 'true')
if compatConvar == 'false' or compatConvar == '0' or realIsRunning('qs-smartphone') then return end

---@type table<string, boolean> Resource names this half may answer for.
local allowed = {}
for _, name in ipairs(NAMES) do allowed[name] = not realIsRunning(name) end

---@type table Self-export proxy for the sd-phone client surface.
local sd = exports['sd-phone']

---@type table Custom third-party app registry (client.customapps): registration keyed on the
---resource that actually owns the app, which an export proxy could not identify from in here.
local customApps = require 'client.customapps'

---@type table<string, any[]> AddEventHandler cookies per resource name, so a real Quasar resource
---starting mid-session takes back its own name and leaves the shim answering for the others.
local exportCookies = {}

---@type table<string, boolean> Resource + name pairs already registered, so a name mirrored onto
---the same resource twice keeps its first implementation instead of racing it.
local taken = {}

---Registers fn on the client export registry under `resource` via the __cfx_export event. A name
---the shim does not hold is skipped so a real Quasar resource keeps answering for itself.
---@param resource string resource name the export is published under
---@param name string export name
---@param fn function implementation
local function registerOn(resource, name, fn)
    if not allowed[resource] then return end

    local key = resource .. '\0' .. name
    if taken[key] then return end
    taken[key] = true

    local list = exportCookies[resource]
    if not list then
        list = {}
        exportCookies[resource] = list
    end
    list[#list + 1] = AddEventHandler(('__cfx_export_%s_%s'):format(resource, name), function(setCB)
        setCB(fn)
    end)
end

---Registers one implementation under the same name on several Quasar resource names at once, which
---is how the legacy, lite and PRO lines all reach the same behaviour.
---@param resources string[]
---@param name string
---@param fn function
local function registerMany(resources, name, fn)
    for _, resource in ipairs(resources) do registerOn(resource, name, fn) end
end

---@type table<string, boolean> Surfaces that have already warned this session.
local warned = {}

---Prints one console breadcrumb the first time an unsupported surface is touched.
---@param key string warn key
---@param why string what is unsupported and what happens instead
local function warnOnce(key, why)
    if warned[key] then return end
    warned[key] = true
    print(('^3[sd-phone]^0 qs-smartphone compat: %s'):format(why))
end

---Registers a stubbed export on several resource names: warns once on first call, then returns the
---fixed default.
---@param resources string[]
---@param name string
---@param default any
---@param why string reason clause
local function stubMany(resources, name, default, why)
    registerMany(resources, name, function()
        warnOnce(name, ('%s %s'):format(name, why))
        return default
    end)
end

---@type table<string, string> qs-smartphone app id -> sd-phone app id, spanning V3's renamed apps
---and the legacy Config.Battery id set. An id with no counterpart is left out, which OpenPhoneApp
---answers with false rather than opening the wrong app.
local APP_MAP <const> = {
    tweedle         = 'birdy',
    twitter         = 'birdy',
    pictagram       = 'photogram',
    instagram       = 'photogram',
    beatzy          = 'music',
    spotify         = 'music',
    music           = 'music',
    chitchat        = 'messages',
    whatsapp        = 'messages',
    messages        = 'messages',
    finder          = 'marketplace',
    advert          = 'pages',
    yellowpages     = 'pages',
    zapp            = 'ryde',
    uber            = 'ryde',
    uberdriver      = 'ryde',
    qchat           = 'groups',
    ['group-chats'] = 'groups',
    darkchat        = 'darkchat',
    darkweb         = 'darkchat',
    weazel          = 'weazelnews',
    tiktok          = 'vibez',
    tinder          = 'cherry',
    business        = 'services',
    society         = 'services',
    state           = 'documents',
    meos            = 'emsmdt',
    garage          = 'garages',
    rentel          = 'garages',
    store           = 'appstore',
    ping            = 'maps',
    phone           = 'phone',
    mail            = 'mail',
    bank            = 'bank',
    photos          = 'photos',
    camera          = 'camera',
    clock           = 'clock',
    calendar        = 'calendar',
    notes           = 'notes',
    calculator      = 'calculator',
    settings        = 'settings',
    racing          = 'racing',
    flappy          = 'flappy',
}

---Maps a qs-smartphone app reference onto an sd-phone app id. The same field carries a bare name, a
---'./img/apps/whatsapp.png' path inside the phone's own NUI, or an absolute URL, so a path is
---reduced to its file stem before the lookup.
---@param app any
---@return string|nil
local function appIdOf(app)
    if type(app) ~= 'string' or app == '' then return nil end
    local key = app:match('([^/\\]+)%.%w+$') or app
    key = key:lower():gsub('[%s_]+', '')
    return APP_MAP[key]
end

---Shows one banner, accepting every qs-smartphone notification spelling at once: title/head,
---text/msg/description, app/appId/icon.
---@param data any
local function banner(data)
    if type(data) ~= 'table' then return end

    local app = appIdOf(data.appId or data.app or data.icon)
    local title = data.title or data.head or data.sender
    local body = data.text or data.msg or data.message or data.description
    if type(title) ~= 'string' or title == '' then
        title = type(body) == 'string' and body or nil
        body = nil
    end
    if not title then return end

    sd:showNotification({
        app   = app,
        appId = app,
        title = title,
        body  = type(body) == 'string' and body ~= '' and body or nil,
    })
end

-- Shell state: open, disabled and the app launcher.

---IsPhoneOpen() / isPhoneOpen() / InPhone(): whether the phone interface is up. All three spellings
---have live callers, and the lite and PRO lines publish the same read under their own names.
local function isPhoneOpen()
    return sd:isOpen() == true
end

registerMany(NAMES, 'IsPhoneOpen', isPhoneOpen)
registerMany(NAMES, 'isPhoneOpen', isPhoneOpen)
registerMany(NAMES, 'InPhone', isPhoneOpen)

---canUsePhone(bool) / SetCanOpenPhone(bool): a SETTER despite the interrogative name - true unblocks
---the phone, false blocks it and closes an open one. PRO renamed it to what it always was.
local function setCanUsePhone(allowedToUse)
    sd:setDisabled(allowedToUse == false)
end

registerMany(NAMES, 'canUsePhone', setCanUsePhone)
registerMany(PRO, 'SetCanOpenPhone', setCanUsePhone)

---ClosePhone(): closes the phone. No parameters.
registerMany(PRO, 'ClosePhone', function() sd:close() end)

---OpenPhoneApp(appId): opens an app. False when the app is closed to the player, when the id has no
---sd-phone counterpart, or when the phone will not open.
local function openPhoneApp(appId)
    local mapped = appIdOf(appId)
    if not mapped then
        warnOnce('OpenPhoneApp.' .. tostring(appId), ('OpenPhoneApp was asked for the app id %s, which has no sd-phone counterpart; nothing was opened'):format(tostring(appId)))
        return false
    end
    return sd:openApp(mapped) == true
end

registerMany(PHONES, 'OpenPhoneApp', openPhoneApp)

-- Battery and signal: sd-phone's battery is a cosmetic status-bar drain and its signal is cell
-- tower coverage, and both reads are real.

local function getBattery() return sd:getBattery() end
local function checkSignal() return sd:hasService('data') == true end

registerMany(NAMES, 'getBattery', getBattery)
registerMany(NAMES, 'CheckSignal', checkSignal)

-- Calls. sd-phone drives calls from the server, so the client exports round-trip through the compat
-- callbacks rather than reaching a client-side call API that does not exist.

---call(phoneNumber, callType) -> { success }: starts a call. The documented return is a TABLE, so a
---caller reading .success off it still works.
registerMany(PHONES, 'call', function(phoneNumber, callType)
    if callType == 'video' then
        warnOnce('call.video', 'call was asked for a video call; sd-phone starts every call as audio and the participants upgrade it to video from the in-call screen')
    end
    local ok, result = pcall(lib.callback.await, 'sd-phone:server:compat:qs:dial', false, phoneNumber)
    return { success = ok and type(result) == 'table' and result.success == true }
end)

---createCall(name, number, image, anonymous): PRO's outgoing call. sd-phone resolves the callee's
---display name and avatar from the recipient's own contact book, so the name and image arguments
---have nowhere to be applied and the number is what is dialled.
registerMany(PRO, 'createCall', function(name, number, image, anonymous)
    if name ~= nil or image ~= nil or anonymous ~= nil then
        warnOnce('createCall.display', 'createCall name/image/anonymous are not supported; sd-phone shows the callee whatever their own contact book says about the calling number, so only the number was dialled')
    end
    local ok, result = pcall(lib.callback.await, 'sd-phone:server:compat:qs:dial', false, number)
    return ok and type(result) == 'table' and result.success == true
end)

---endCall(): ends the active call immediately.
registerMany(PRO, 'endCall', function()
    pcall(lib.callback.await, 'sd-phone:server:compat:qs:endCall', false)
end)

---isInCall(): whether the player is in a call. Answered from the replicated state bag, so it costs
---no round trip.
registerMany(PRO, 'isInCall', function()
    return LocalPlayer.state.inCall == true
end)

---getCall(): the current call object. Its INNER fields are PascalCase on qs-smartphone even though
---the export is camelCase, so InCall and TargetData are spelled its way.
registerMany(PRO, 'getCall', function()
    local ok, call = pcall(lib.callback.await, 'sd-phone:server:compat:qs:call', false)
    if not ok or type(call) ~= 'table' then
        return { InCall = false, TargetData = {}, CallType = 'audio', CallTime = 0 }
    end
    return {
        InCall     = true,
        TargetData = { name = call.name, number = call.number },
        CallType   = 'audio',
        CallTime   = call.elapsed or 0,
        CallId     = call.channel,
        Phase      = call.phase,
    }
end)

-- Camera: tracked off sd-phone's own camera-mode event, which is the only view of it.

---@type boolean Whether the phone camera is live, so a HUD can hide the minimap.
local cameraOn = false
AddEventHandler('sd-phone:client:cameraMode', function(on) cameraOn = on == true end)

registerMany(PRO, 'IsInCamera', function() return cameraOn end)

-- Dynamic Island. sd-phone has no island, so each one is shown as a notification banner and its
-- state is kept here, which keeps the four read exports honest about what is live.

---@type table<string, table> Live islands by id.
local islands = {}

---showDynamicIsland({ id, title, subtitle, progress }): registers an island and shows its content
---as a banner. Action buttons are not supported, so phone:dynamicIsland:action never fires.
registerMany(PHONES, 'showDynamicIsland', function(config)
    if type(config) ~= 'table' or type(config.id) ~= 'string' then return false end
    warnOnce('showDynamicIsland', 'sd-phone has no Dynamic Island; each island is shown as a notification banner instead, and its action buttons never fire phone:dynamicIsland:action')

    islands[config.id] = config
    banner({ title = config.title, text = config.subtitle })
    return true
end)

---updateDynamicIsland(id, config): a partial update, so only the fields given change. The banner is
---re-shown only when the visible text moves, a progress tick alone being invisible on a banner.
registerMany(PHONES, 'updateDynamicIsland', function(id, config)
    local island = type(id) == 'string' and islands[id] or nil
    if not island or type(config) ~= 'table' then return false end

    local before = tostring(island.title) .. '|' .. tostring(island.subtitle)
    for key, value in pairs(config) do island[key] = value end
    if before ~= tostring(island.title) .. '|' .. tostring(island.subtitle) then
        banner({ title = island.title, text = island.subtitle })
    end
    return true
end)

registerMany(PHONES, 'hideDynamicIsland', function(id)
    if type(id) ~= 'string' or not islands[id] then return false end
    islands[id] = nil
    return true
end)

registerMany(PHONES, 'getDynamicIsland', function(id)
    return type(id) == 'string' and islands[id] or nil
end)

registerMany(PHONES, 'getAllDynamicIslands', function()
    local out = {}
    for id, island in pairs(islands) do out[id] = island end
    return out
end)

registerMany(PHONES, 'hasDynamicIsland', function()
    return next(islands) ~= nil
end)

---SendTempNotification / SendTempNotificationOld({ title, text, app, timeout, disableBadge }): PRO's
---island pop-up, which sd-phone shows as its own banner. The icon comes from the app name, exactly
---as PRO derives it.
local function sendTempNotification(notification)
    banner(notification)
end

registerMany(PRO, 'SendTempNotification', sendTempNotification)
registerMany(PRO, 'SendTempNotificationOld', sendTempNotification)
registerMany(PRO, 'SendNotification', sendTempNotification)

---Lang(key): PRO's undocumented locale helper. sd-phone keeps its copy inside the UI, where Lua
---cannot read it, so the key is handed back - which is what a missing lookup returns anyway.
registerMany(PRO, 'Lang', function(key)
    warnOnce('Lang', 'Lang cannot be answered: sd-phone keeps its translations inside the UI bundle, where Lua cannot read them, so the key was returned unchanged')
    return type(key) == 'string' and key or ''
end)

-- Housing chargers: the battery is a cosmetic drain counter with no charging, so there is nothing
-- for a charging point to charge.
stubMany(PHONES, 'BatteryRegisterHousingCharger', false,
    'has no sd-phone equivalent: the battery is a cosmetic status-bar drain with no charging')
stubMany(PHONES, 'BatteryUnregisterHousingCharger', false,
    'has no sd-phone equivalent: the battery is a cosmetic status-bar drain with no charging')

-- Custom apps. qs keys an app on `id` and nests its page under `iframe.url`; sd-phone uses
-- `identifier` and a flat `ui`.

---Translates a qs-smartphone app config onto sd-phone's registration shape.
---@param cfg any
---@return table|nil
local function translateApp(cfg)
    if type(cfg) ~= 'table' then return nil end
    local id = cfg.id or cfg.identifier or cfg.appId
    if type(id) ~= 'string' or id == '' then return nil end

    local ui = cfg.ui
    if type(cfg.iframe) == 'table' then ui = cfg.iframe.url or ui end

    return {
        identifier = id,
        name       = cfg.label or cfg.name or id,
        ui         = ui,
        icon       = type(cfg.icon) == 'table' and (cfg.icon.url or cfg.icon.default) or cfg.icon,
    }
end

---@type string Owner recorded for apps the SERVER registry relays. The server half already holds
---the real attribution and does its own per-resource cleanup, so the relay owns its copies here.
local RELAY_OWNER <const> = 'sd-phone'

---addCustomApp(config): registers the CALLING resource's app. Attribution is taken here rather than
---through the export proxy, which would name sd-phone and leave the app behind when its owner stops.
---@param cfg any qs-smartphone app config
---@return boolean ok, string? err
registerMany(PHONES, 'addCustomApp', function(cfg)
    local app = translateApp(cfg)
    if not app then return false, 'app config must name an id' end

    local resource = GetInvokingResource()
    if not resource or resource == '' then return false, 'could not determine the calling resource' end

    return customApps.add(app, resource)
end)

---removeCustomApp(appId): removes an app the CALLING resource registered; another resource's app is
---refused by the registry's own ownership check.
---@param appId any
---@return boolean ok, string? err
registerMany(PHONES, 'removeCustomApp', function(appId)
    local resource = GetInvokingResource()
    if not resource or resource == '' then return false, 'could not determine the calling resource' end

    return customApps.remove(appId, resource)
end)

---The server registry pushes its instructions here, since qs-smartphone registers custom apps for
---every player from the server while sd-phone registers them per client.
RegisterNetEvent('sd-phone:client:compat:qs:customApps', function(instruction)
    if type(instruction) ~= 'table' then return end
    if instruction.action == 'add' and type(instruction.app) == 'table' then
        customApps.add(instruction.app, RELAY_OWNER)
    elseif instruction.action == 'remove' then
        customApps.remove(instruction.id, RELAY_OWNER)
    end
end)

-- Server-driven shell actions that only the client can perform.

RegisterNetEvent('sd-phone:client:compat:qs:toggle', function()
    if sd:isOpen() then sd:close() else sd:open() end
end)

RegisterNetEvent('sd-phone:client:compat:qs:openSimTray', function(slot)
    sd:openSimTray(slot)
end)

-- Outbound: sd-phone's own client lifecycle, re-fired under qs-smartphone's event names.

---@type table|nil The caller's own phone identity, fetched once so the open/close payloads carry a
---number without a round trip per edge.
local selfPhone = nil

---Refreshes the cached identity from the server. Cheap, and only run on an open edge or a SIM swap.
local function refreshSelf()
    local ok, result = pcall(lib.callback.await, 'sd-phone:server:compat:qs:self', false)
    if ok and type(result) == 'table' then selfPhone = result end
end

---Open/close edges -> phone:opened / phone:closed, plus phone:usable:open, which qs-smartphone fires
---when the phone ITEM is used and the device starts opening. sd-phone announces one open edge for
---both paths, so the item event rides with it.
AddEventHandler('sd-phone:client:openState', function(open)
    if open then
        refreshSelf()
        TriggerEvent('phone:usable:open')
        TriggerEvent('phone:opened', {
            phoneNumber = selfPhone and selfPhone.number,
            scope       = selfPhone and selfPhone.scope,
            mode        = sd:isCompanionOpen() and 'companion' or 'full',
        })
        return
    end

    local payload = { reason = 'closed', phoneNumber = selfPhone and selfPhone.number, scope = selfPhone and selfPhone.scope }
    TriggerEvent('phone:closed', payload)
    TriggerEvent('qs-smartphone-pro:handleClosePhone', payload)
end)

---Every banner sd-phone shows -> phone:pushNotification (a table) and phone:notification (two
---positional arguments, which is the same event under a different contract).
AddEventHandler('sd-phone:client:notify', function(data)
    if type(data) ~= 'table' then return end
    TriggerEvent('phone:pushNotification', data)
    TriggerEvent('phone:notification', data.body or data.title, data.appId or data.app or 'phone')
end)

---Incoming call -> phone:incomingCall + phone:callState with the ringing phase.
AddEventHandler('sd-phone:client:call:incoming', function(data)
    if type(data) ~= 'table' then return end
    local callData = {
        callerNumber = data.number,
        callerName   = data.name,
        sessionId    = data.channel,
        video        = data.video == true,
    }
    TriggerEvent('phone:incomingCall', callData)
    TriggerEvent('phone:callState', { id = data.channel, phase = 'ringing', callerNumber = data.number })
end)

AddEventHandler('sd-phone:client:call:outgoing', function(data)
    if type(data) ~= 'table' then return end
    TriggerEvent('phone:callState', { id = data.channel, phase = 'ringing', callerNumber = data.number })
end)

AddEventHandler('sd-phone:client:call:connected', function(data)
    if type(data) ~= 'table' then return end
    TriggerEvent('phone:callState', { id = data.channel, phase = 'connected', callerNumber = data.number })
end)

AddEventHandler('sd-phone:client:call:ended', function(data)
    TriggerEvent('phone:callState', {
        id = type(data) == 'table' and data.channel or nil,
        phase = 'ended',
    })
end)

---A SIM or device swap -> phone:device:phoneChanged, which is what qs-smartphone fires when the
---player equips another phone or moves a SIM.
RegisterNetEvent('sd-phone:client:simState', function(state)
    if type(state) ~= 'table' then return end
    refreshSelf()
    TriggerEvent('phone:device:phoneChanged', {
        phoneNumber = state.number,
        scope       = state.profile,
        hasSim      = state.hasSim == true,
    })
end)

-- Inbound: the events third-party scripts trigger AT the phone on this side.

---The legacy pop-up notification, in all three spellings that have live callers, plus the two other
---notification events found in public integration code. Every one is the same banner.
for _, name in ipairs({
    'qs-smartphone:client:notify',
    'qs-smartphone:client:Notify',
    'qs-smartphone:client:notification',
    'qs-smartphone:client:CustomNotification',
    'qs-smartphone:client:NewMailNotify',
}) do
    RegisterNetEvent(name, banner)
end

---The legacy police MDT alert, broadcast server-side to every client. Shown as a banner; its coords
---are named in the body, sd-phone banners carrying no waypoint.
RegisterNetEvent('qs-smartphone:client:addPoliceAlert', function(alert)
    if type(alert) ~= 'table' then return end
    local body = alert.description
    if type(alert.coords) == 'table' then
        body = ('%s (%.1f, %.1f)'):format(body or '', tonumber(alert.coords.x) or 0, tonumber(alert.coords.y) or 0)
    end
    banner({ app = 'business', title = alert.title or 'Alert', text = body })
end)

---The legacy Messages-app dispatch. Its `phone` key holds a JOB NAME rather than a number, and the
---documented usage sends the prose and the location as two triggers 300ms apart, so each is
---forwarded on its own.
RegisterNetEvent('qs-smartphone:sendJobMessage', function(payload)
    if type(payload) ~= 'table' then return end
    TriggerServerEvent('sd-phone:server:compat:qs:jobMessage', payload)
end)

---Registers an event qs-smartphone answers and sd-phone cannot, so a caller's trigger is received
---rather than dropped as unregistered, and the server owner is told once what happened.
---@param name string event name, spelled exactly as qs-smartphone registers it
---@param why string what is unsupported and what to do instead
local function unsupportedEvent(name, why)
    RegisterNetEvent(name, function()
        warnOnce('event.' .. name, ('%s was triggered but %s'):format(name, why))
    end)
end

unsupportedEvent('qs-smartphone:client:GiveContactDetails',
    'sd-phone shares a contact card through AirShare in the Contacts app instead')
unsupportedEvent('qs-smartphone:client:UpdateMails',
    'sd-phone pushes mail changes to the Mail app itself, so no external refresh is needed')
unsupportedEvent('qs-smartphone:client:addMessage',
    'its payload shape was never documented; deliver texts with exports["sd-phone"]:sendSystemMessage from the server')
unsupportedEvent('qs-smartphone:client:AddTransaction',
    'log a Wallet entry with exports["sd-phone"]:addBankTransaction from the server instead')
unsupportedEvent('qs-smartphone:client:TransferMoney',
    'sd-phone moves money through the framework bank, not through a client event')
unsupportedEvent('qs-smartphone:client:GetCalled',
    'sd-phone rings a phone from the server; start a call with exports["sd-phone"]:startCall(source, number)')
unsupportedEvent('qs-smartphone:client:AnswerCall',
    'sd-phone answers a call from the ringing phone\'s own UI and exposes no external accept')
unsupportedEvent('qs-smartphone:client:CancelCall',
    'end a call with exports["sd-phone"]:endCallFor(source) from the server instead')
unsupportedEvent('qs-smartphone:client:RefreshGroupChat',
    'sd-phone pushes group changes to the Messages app itself, so no external refresh is needed')
unsupportedEvent('qs-smartphone:client:RaceNotify',
    'sd-phone has its own Racing app, which does not take external race pushes')
unsupportedEvent('qs-smartphone:client:TriggerPhoneHack',
    'sd-phone has no phone-hacking minigame')
unsupportedEvent('qs-smartphone:client:openChannelMenu',
    'sd-phone Dark Chat channels are joined from inside the app')
unsupportedEvent('qs-smartphone:client:openChannelHackedMenu',
    'sd-phone Dark Chat has no hacked-channel menu')
unsupportedEvent('qs-smartphone:client:CustomClientDispatch',
    'its payload shape was never documented; reach employees with the job inbox through exports["sd-phone"]:messageCompany')
unsupportedEvent('qs-smartphone:sendEmail',
    'its payload shape was never documented; send mail with exports["sd-phone"]:sendMail from the server')
unsupportedEvent('qs-smartphone:sendMessage',
    'its payload shape was never documented; send texts with exports["sd-phone"]:sendSystemMessage from the server')
unsupportedEvent('qs-smartphone-pro:addToPersistent',
    'sd-phone has no persistent-app tray for an app to be pinned into')
unsupportedEvent('qs-smartphone-pro:triggerServerCallback',
    'it is PRO\'s internal callback transport; sd-phone uses ox_lib callbacks and cannot answer it')

-- A resource restart lands mid-session, where no open edge is coming to fetch the identity, and the
-- server registry already holds custom apps that were registered before this client loaded.
CreateThread(function()
    refreshSelf()

    local ok, apps = pcall(lib.callback.await, 'sd-phone:server:compat:qs:customApps', false)
    if not ok or type(apps) ~= 'table' then return end
    for _, app in ipairs(apps) do customApps.add(app, RELAY_OWNER) end
end)

---Hands ONE name back when the real resource holding it starts mid-session. Only that name's
---handlers are dropped: a real qs-base must not take the phone's own client surface with it.
AddEventHandler('onClientResourceStart', function(resource)
    if not allowed[resource] or isShimResource(resource) then return end
    allowed[resource] = false

    local list = exportCookies[resource]
    if list then
        for i = 1, #list do RemoveEventHandler(list[i]) end
        exportCookies[resource] = nil
    end
    print(('^3[sd-phone]^0 qs-smartphone compat: the REAL %s resource just started, so the compat layer deregistered the client export handlers it held under THAT name.'):format(resource))
end)
