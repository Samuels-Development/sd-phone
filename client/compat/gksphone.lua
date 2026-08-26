---Whether a started resource named gksphone is the sd-phone name-holder shim rather than the real
---product.
---@return boolean
local function isShimGksphone()
    return GetResourceMetadata('gksphone', 'sd_phone_shim', 0) == 'yes'
end

---Whether the real gksphone resource is started. sd-phone holds the same resource name through
---`provide` and is deliberately ignored.
---@return boolean
local function realGksphoneStarted()
    for i = 0, GetNumResources() - 1 do
        if GetResourceByFindIndex(i) == 'gksphone' then return not isShimGksphone() end
    end
    return false
end

-- Registration proceeds unless sd_phone_gkscompat is explicitly disabled or the real gksphone is
-- running.
local compatConvar = GetConvar('sd_phone_gkscompat', 'true')
if compatConvar == 'false' or compatConvar == '0' or realGksphoneStarted() then return end

---@type table Self-export proxy for the sd-phone client surface.
local sd = exports['sd-phone']

---@type table Custom third-party app registry (client.customapps): registration keyed on the
---resource that actually owns the app, which an export proxy could not identify from in here.
local customApps = require 'client.customapps'

---@type any[] AddEventHandler cookies for every registered export handler.
local exportCookies = {}

---Registers fn on the client export registry under the gksphone name via the __cfx_export event.
---gksphone spells its exports inconsistently (isPhoneOpen and heavyJammer sit beside PhoneOpen and
---AddCustomApp), so `name` is passed through exactly as gksphone documents it.
---@param name string gksphone export name
---@param fn function implementation
local function registerExport(name, fn)
    exportCookies[#exportCookies + 1] = AddEventHandler(('__cfx_export_gksphone_%s'):format(name), function(setCB)
        setCB(fn)
    end)
end

---@type table<string, boolean> Surfaces that have already warned this session.
local warned = {}

---Prints one console breadcrumb the first time an unsupported surface is touched.
---@param name string warn key (export name, or name.arg for a partially supported argument)
---@param why string what is unsupported and what happened instead
local function warnOnce(name, why)
    if warned[name] then return end
    warned[name] = true
    print(('^3[sd-phone]^0 gksphone compat: %s'):format(why))
end

---Registers a stubbed export: warns once on first call, then returns the fixed default.
---@param name string gksphone export name
---@param default any fixed return value
---@param why string reason clause, appended after the export name
local function stubExport(name, default, why)
    registerExport(name, function()
        warnOnce(name, ('%s %s'):format(name, why))
        return default
    end)
end

---Registers a stubbed export whose contract is a MULTI-value return, which gksphone's virtual
---number pair has: its own example reads `local ok, reason = exports['gksphone']:CreateCallNumber()`.
---@param name string gksphone export name
---@param why string reason clause, appended after the export name
---@param ... any fixed return values, in order
local function stubExportMulti(name, why, ...)
    local defaults = table.pack(...)
    registerExport(name, function()
        warnOnce(name, ('%s %s'):format(name, why))
        return table.unpack(defaults, 1, defaults.n)
    end)
end

---@type { number: string|nil, phoneId: string|nil, at: number } The caller's own number and handset
---id, cached for a minute. Both come back in one round trip because a caller asking for one nearly
---always wants the other, and both are stable for the life of a character.
local selfCache = { at = 0 }

---Refreshes the cached number and handset id when the cache is cold, and returns it.
---@return table cache
local function selfInfo()
    if selfCache.phoneId and GetGameTimer() - selfCache.at < 60000 then return selfCache end

    local ok, info = pcall(lib.callback.await, 'sd-phone:server:compat:gks:self', false)
    if ok and type(info) == 'table' and info.phoneId then
        selfCache = { number = info.number, phoneId = info.phoneId, at = GetGameTimer() }
    end
    return selfCache
end

---Drops the cached identity when the character changes, so a second character never reports the
---first one's number.
local function clearSelfCache() selfCache = { at = 0 } end
RegisterNetEvent('QBCore:Client:OnPlayerLoaded', clearSelfCache)
RegisterNetEvent('QBCore:Client:OnPlayerUnload', clearSelfCache)
RegisterNetEvent('esx:playerLoaded', clearSelfCache)
RegisterNetEvent('esx:onPlayerLogout', clearSelfCache)

---@type boolean Live cell-camera state, tracked off the first-party client event because the camera
---is UI-driven and has no Lua getter.
local cameraOpen = false
AddEventHandler('sd-phone:client:cameraMode', function(on) cameraOpen = on == true end)

---@type string|nil The reason PhoneOpenBlock was last given, reported back by PhoneOpenBlockStatus.
local blockReason = nil

-- General shell control. gksphone renamed every one of these between V1 and V2, so both spellings
-- register against the same implementation.

registerExport('isPhoneOpen', function() return sd:isOpen() end)
registerExport('CheckOpenPhone', function() return sd:isOpen() end)
registerExport('PhoneOpen', function() sd:open() end)
registerExport('OpenPhone', function() sd:open() end)
registerExport('PhoneClose', function() sd:close() end)
registerExport('ClosePhone', function() sd:close() end)

---PhoneOpenBlock(reason): locks the player out of their phone and remembers why. sd-phone's lockout
---closes an open phone and kills the flashlight with it, but it draws no reason text on screen, so
---`reason` is only reported back through PhoneOpenBlockStatus.
registerExport('PhoneOpenBlock', function(reason)
    if type(reason) == 'string' and reason ~= '' then
        blockReason = reason
        warnOnce('PhoneOpenBlock.reason', 'PhoneOpenBlock shows no reason text on sd-phone; the phone was blocked and the reason is readable through PhoneOpenBlockStatus')
    end
    sd:setDisabled(true)
end)

registerExport('PhoneOpenUnBlock', function()
    blockReason = nil
    sd:setDisabled(false)
end)

registerExport('PhoneOpenBlockStatus', function()
    return sd:isDisabled(), blockReason
end)

---BlockOpenPhone(state): gksphone V1's lockout, which takes a boolean where V2's PhoneOpenBlock
---takes a reason string.
registerExport('BlockOpenPhone', function(state)
    if state == true then
        sd:setDisabled(true)
    else
        blockReason = nil
        sd:setDisabled(false)
    end
end)

registerExport('PhoneNumber', function() return selfInfo().number end)
registerExport('PhoneUniqueId', function() return selfInfo().phoneId end)
registerExport('IsCameraOpen', function() return cameraOpen end)
registerExport('CheckFlightMode', function() return LocalPlayer.state.airplaneMode == true end)

-- Calls. sd-phone drives calls from the server, so the client half asks across for the ones that
-- return a value and fires an event for the ones that do not.

---CreateCall(data): places a call from the local player. `data.job` rings a company instead of a
---number, matching gksphone's Config.JOBServices calls. Returns gksphone's (ok, reason) pair.
registerExport('CreateCall', function(data)
    if type(data) ~= 'table' then return false, 'invalid_data' end
    if data.videoCall then
        warnOnce('CreateCall.videoCall', 'CreateCall videoCall is not supported from a script on sd-phone; a voice call was placed instead')
    end

    local ok, result = pcall(lib.callback.await, 'sd-phone:server:compat:gks:call', false, data)
    if not ok or type(result) ~= 'table' then return false, 'invalid_data' end
    return result.ok == true, result.reason
end)

---StartingCall(number): gksphone V1's dialler, which takes a bare number where V2's CreateCall
---takes a table.
registerExport('StartingCall', function(number)
    pcall(lib.callback.await, 'sd-phone:server:compat:gks:call', false, { number = number })
end)

registerExport('EndCall', function() TriggerServerEvent('sd-phone:server:compat:gks:endCall') end)
registerExport('IsInCall', function() return LocalPlayer.state.inCall == true end)
registerExport('IsCall', function() return LocalPlayer.state.inCall == true end)

-- Script-owned virtual numbers. sd-phone routes every call through its own number registry, with no
-- hook for a resource to answer one itself, so all three report the failure rather than silently
-- swallowing a number the phone will never ring.
stubExportMulti('CreateCallNumber',
    'has no sd-phone equivalent: sd-phone has no script-owned virtual numbers, so nothing was registered. Add the number as a company in configs/services.lua to have the phone ring a job instead',
    false, 'not_supported')
stubExportMulti('RemoveCallNumber',
    'has no sd-phone equivalent: sd-phone has no script-owned virtual numbers, so there was nothing to remove',
    false, 'not_supported')
registerExport('CallEndCustom', function() TriggerServerEvent('sd-phone:server:compat:gks:endCall') end)

-- Notifications. gksphone moved the icon field between versions (V2 `icon`, V1 `img`) and split the
-- entry point in two, so both names read both fields.

---Shows one gksphone notification payload as an sd-phone banner. `buttonactive` / `button` is
---dropped: sd-phone banners are not tappable call-backs.
---@param data any gksphone NotifData
local function notify(data)
    if type(data) ~= 'table' then return end
    if data.buttonactive or data.button then
        warnOnce('Notification.button', 'notification tap buttons are not supported on sd-phone; the banner was shown without one')
    end

    sd:showNotification({
        title = type(data.title) == 'string' and data.title or 'Notification',
        body  = type(data.message) == 'string' and data.message or nil,
        image = type(data.icon) == 'string' and data.icon or (type(data.img) == 'string' and data.img or nil),
        time  = 'now',
    })
end

registerExport('Notification', notify)
registerExport('SendNotification', notify)

-- Mail. sd-phone stores mail server-side, so the client half hands the payload across.

---SendNewMail(MailData): mail into the local player's own mailbox.
registerExport('SendNewMail', function(MailData)
    if type(MailData) ~= 'table' then return end
    TriggerServerEvent('sd-phone:server:compat:gks:mail', MailData)
end)

---SendNewMailOffline(PlayerId, MailData): gksphone's V1 client mail, addressed by identity. Only the
---caller's own mailbox is accepted: a client event that mailed an arbitrary character would be an
---escalation any player with an executor could reach, so a foreign identity is refused and the
---server export answers those instead.
registerExport('SendNewMailOffline', function(PlayerId, MailData)
    if type(MailData) ~= 'table' then return end
    if PlayerId ~= nil and PlayerId ~= selfInfo().phoneId then
        warnOnce('SendNewMailOffline', 'SendNewMailOffline can only reach your own mailbox from the client on sd-phone; call the SERVER export exports.gksphone:SendNewMailOffline(citizenID, MailData) to mail somebody else')
        return
    end
    TriggerServerEvent('sd-phone:server:compat:gks:mail', MailData)
end)

-- Dispatch reports. All three names carry the same four arguments; JobDispatch is V1's, and its
-- `job` is a JSON string rather than a table.

---Files one dispatch report from the local player.
---@param message any report body
---@param photo any attached image URL
---@param job any company the report is addressed to
---@param anonymous any whether the reporter asked to stay unnamed
local function report(message, photo, job, anonymous)
    TriggerServerEvent('sd-phone:server:compat:gks:report', {
        message = message, photo = photo, job = job, anonymous = anonymous == true,
    })
end

registerExport('SendReport', report)
registerExport('SendDispatch', report)

---JobDispatch(message, image, job, anonymous): gksphone V1's report. `job` arrives as a JSON string
---('["police", "sheriff"]') rather than a table, so it is decoded and the first company named takes
---the report: sd-phone files a company message against exactly one inbox.
registerExport('JobDispatch', function(message, image, job, anonymous)
    local target = job
    if type(job) == 'string' and job:find('%[') then
        local ok, decoded = pcall(json.decode, job)
        if ok and type(decoded) == 'table' and decoded[1] then
            if decoded[2] then
                warnOnce('JobDispatch.job', 'JobDispatch was given several companies; sd-phone files a report against one inbox, so only the first was used')
            end
            target = decoded[1]
        end
    end
    report(message, image ~= '' and image or nil, target, anonymous)
end)

-- Battery. sd-phone's battery is a cosmetic status-bar counter that drains while the phone is open:
-- the reads are answered from it, and the writes have nothing durable to write to.

registerExport('GetPhoneBattery', function() return sd:getBattery() end)
registerExport('IsPhoneBatteryDead', function() return (sd:getBattery() or 100) <= 0 end)

stubExport('SetPhoneBattery', nil,
    'has no sd-phone equivalent: the battery is a cosmetic drain counter, not a stored charge')
stubExport('SavePhoneBattery', nil,
    'has no sd-phone equivalent: the battery is a cosmetic drain counter with nothing to persist')
stubExport('ToggleCharging', nil, 'has no sd-phone equivalent: sd-phone models no charging')
stubExport('IsPhoneCharging', false, 'has no sd-phone equivalent: sd-phone models no charging')

-- Handset condition. sd-phone models no screen damage and no battery wear, so every read reports a
-- factory-fresh handset and every write is refused. The client shapes are deliberately smaller than
-- the server ones, exactly as gksphone documents them.
stubExport('GetScreenHealth', 100, 'has no sd-phone equivalent: the phone models no screen damage')
stubExport('GetScreenSeverity', 'none', 'has no sd-phone equivalent: the phone models no screen damage')
stubExport('IsPhoneWaterDamaged', false, 'has no sd-phone equivalent: the phone models no water damage')
stubExport('GetScreenCondition', { health = 100, severity = 'none', waterDamage = false, damaged = false },
    'has no sd-phone equivalent: the phone models no screen damage, so every handset reads as intact')
stubExport('RepairPhoneScreen', nil,
    'has no sd-phone equivalent: a screen is never damaged, so there is nothing to repair and no gksphone:client:screenRepairResult follows')
stubExport('RefreshScreenHealth', nil, 'has no sd-phone equivalent: the phone models no screen damage')
stubExport('GetBatteryHealth', 100, 'has no sd-phone equivalent: the battery carries no wear')
stubExport('GetBatteryCondition', 'good', 'has no sd-phone equivalent: the battery carries no wear')
stubExport('GetPhoneHealth', { batteryHealth = 100, batteryCondition = 'good', chargeCycles = 0 },
    'has no sd-phone equivalent: the battery carries no wear, so every cell reads as new')
stubExport('GetBatteryDrainMultiplier', 1.0, 'has no sd-phone equivalent: the battery carries no wear to scale drain by')
registerExport('GetBatteryDrainInterval', function(baseMs)
    warnOnce('GetBatteryDrainInterval', 'GetBatteryDrainInterval has no sd-phone equivalent: the battery carries no wear, so the base interval came straight back')
    return tonumber(baseMs) or 0
end)
stubExport('ReplacePhoneBattery', nil,
    'has no sd-phone equivalent: a battery never wears, so there is nothing to replace and no gksphone:client:batteryReplaceResult follows')
stubExport('RefreshBatteryHealth', nil, 'has no sd-phone equivalent: the battery carries no wear')

-- Live activities. sd-phone has a real lock-screen card surface, but it belongs to the resource that
-- registered the app carrying it, so a shim opening one would register every card as sd-phone's own
-- and no caller could ever remove it.
---@type string Shared reason clause, so every live-activity line reads the same in the console.
local ACTIVITY_WHY = 'has no drop-in sd-phone equivalent: lock-screen cards belong to the resource that registered their app, so declare a lockscreenWidget on your addCustomApp and drive it with showLockscreenWidget / hideLockscreenWidget'

stubExport('StartLiveActivity', false, ACTIVITY_WHY)
stubExport('UpdateLiveActivity', nil, ACTIVITY_WHY)
stubExport('EndLiveActivity', nil, ACTIVITY_WHY)
stubExport('GetLiveActivity', nil, ACTIVITY_WHY)
stubExport('ClearLiveActivities', nil, ACTIVITY_WHY)
stubExport('ResyncLiveActivities', nil, ACTIVITY_WHY)

-- Custom apps. sd-phone registers a third-party app against the resource that owns it, which is why
-- this goes through client.customapps directly: an export proxy called from in here would name
-- sd-phone as the owner and lock the real owner out of its own app.

---@type table<string, string> Resource name -> the app identifier it registered through this shim,
---so NuiSendMessage can find the caller's own app without being handed an id.
local appOwners = {}

---A stable identifier for a gksphone app, which names its apps but never ids them.
---@param name string
---@return string
local function slug(name)
    return (name:lower():gsub('[^%w]+', '-'):gsub('^%-+', ''):gsub('%-+$', ''))
end

---AddCustomApp(appData): registers a third-party app on the home screen. gksphone keys an app on
---`name` and frames `appurl`, where sd-phone takes an `identifier` and a `ui`; `blockedjobs`,
---`signal` and `labelLangs` have no sd-phone counterpart and are dropped.
registerExport('AddCustomApp', function(appData)
    if type(appData) ~= 'table' then return false, 'app data must be a table' end
    if type(appData.name) ~= 'string' or appData.name == '' then
        return false, 'name is required and must be a non-empty string'
    end

    local resource = GetInvokingResource()
    if not resource or resource == '' then return false, 'could not determine the calling resource' end

    if appData.blockedjobs or appData.signal or appData.labelLangs then
        warnOnce('AddCustomApp.extras', 'AddCustomApp blockedjobs, signal and labelLangs have no sd-phone counterpart and were dropped; allowjob became the app job gate and the app label is the name you gave')
    end

    local identifier = slug(appData.name)
    local ok, err = customApps.add({
        identifier  = identifier,
        name        = appData.name,
        ui          = appData.appurl,
        icon        = type(appData.icons) == 'string' and appData.icons or nil,
        description = appData.description,
        defaultApp  = appData.startapp == true,
        job         = appData.allowjob,
        onOpen      = appData.onOpen,
        onClose     = appData.onClose,
    }, resource)

    if ok then appOwners[resource] = identifier end
    return ok, err
end)

---NuiSendMessage(payload): pushes a message into the calling resource's own app iframe. gksphone
---takes no app id here, so the app this resource registered through AddCustomApp is the target.
registerExport('NuiSendMessage', function(payload)
    local resource = GetInvokingResource()
    local identifier = resource and appOwners[resource]
    if not identifier then
        warnOnce('NuiSendMessage', 'NuiSendMessage could not tell which app to message: register the app with AddCustomApp from the same resource first')
        return false
    end
    return customApps.sendMessage(identifier, payload, resource)
end)

-- Home-screen widgets. sd-phone declares a widget on the app that owns it rather than registering
-- one on its own, so there is no standalone widget to add or remove.
stubExport('AddCustomWidget', false,
    "has no standalone form on sd-phone: declare the widget in the `widgets` array of your addCustomApp definition instead, where it inherits the app's owner and gates")
stubExport('RemoveCustomWidget', nil,
    'has no standalone form on sd-phone: a widget is removed with the app that declared it, through removeCustomApp')

-- Focus and input. sd-phone owns its own NUI focus for the whole shell, including the frames a
-- custom app renders in, so a caller does not hand focus in or out per input field.
stubExport('ToggleFocus', nil,
    "is not supported: sd-phone owns NUI focus for the whole shell, so a custom app's inputs already take focus without being asked")
stubExport('ToogleFocus', nil,
    "is not supported: sd-phone owns NUI focus for the whole shell, so a custom app's inputs already take focus without being asked. (This is gksphone's own misspelling of ToggleFocus, registered because its docs heading uses it)")
stubExport('InputChange', nil,
    'is not supported: sd-phone already stops the character moving while its shell holds focus, so there is no per-field toggle to flip')

---UsePhoneItem(): opens the phone. Every gksphone inventory snippet points its phone item at this
---name, either as an ox_inventory `export` or by triggering gksphone:client:usePhone.
local function usePhoneItem()
    sd:open()
end

registerExport('UsePhoneItem', usePhoneItem)
RegisterNetEvent('gksphone:client:usePhone')
AddEventHandler('gksphone:client:usePhone', usePhoneItem)

---Re-resolves the acting handset after an inventory move, which is what gksphone used these two
---events for once unique phones were on. The cached number goes with it.
local function rescanHandset()
    clearSelfCache()
    TriggerServerEvent('sd-phone:server:sim:requestPush')
end

RegisterNetEvent('gksphone:client:ItemAdded')
AddEventHandler('gksphone:client:ItemAdded', rescanHandset)
RegisterNetEvent('gksphone:client:ItemRemoved')
AddEventHandler('gksphone:client:ItemRemoved', rescanHandset)

-- Signal jamming zones. sd-phone models coverage from the cell towers in configs/celltowers.lua and
-- exposes no runtime zone registry, so a jam zone cannot be raised from a script.
stubExport('addSignal', nil,
    'has no sd-phone equivalent: coverage comes from the masts in configs/celltowers.lua, with no runtime zone to add')
stubExport('destroySignal', nil,
    'has no sd-phone equivalent: coverage comes from the masts in configs/celltowers.lua, with no runtime zone to remove')

---heavyJammer(status, message, phoneUniqueId): jams the LOCAL player's phone, closing it and keeping
---it closed. The persistent per-handset form (with phoneUniqueId) stays on the server export: a
---client naming another handset could lock any player out of their phone.
registerExport('heavyJammer', function(status, message, phoneUniqueId)
    if phoneUniqueId ~= nil and phoneUniqueId ~= selfInfo().phoneId then
        warnOnce('heavyJammer.target', 'heavyJammer can only jam your own phone from the client on sd-phone; call the SERVER export exports.gksphone:heavyJammerByPhone(phoneUniqueId, status, message) to jam somebody else')
        return
    end
    if message then
        warnOnce('heavyJammer.message', 'heavyJammer shows no jam message on sd-phone; the phone was locked out without one')
    end
    TriggerServerEvent('sd-phone:server:compat:gks:jam', status == true)
end)

-- Map locations. The client forms act on the local player's own Maps pins; the server forms take a
-- target and gksphone's -1 wildcard.

registerExport('AddMapLocation', function(data)
    TriggerServerEvent('sd-phone:server:compat:gks:map', 'add', data)
end)

registerExport('RemoveMapLocation', function(id)
    TriggerServerEvent('sd-phone:server:compat:gks:map', 'remove', id)
end)

registerExport('UpdateMapLocation', function(id, patch)
    TriggerServerEvent('sd-phone:server:compat:gks:map', 'update', id, patch)
end)

-- Job Center. sd-phone tracks group membership and a leader, but none of gksphone's staged job task
-- lists, so leadership answers for real and the task surface reports what it cannot do.

---IsGroupLeader(): whether the local player leads their active group. The cached group is the
---server's export view, which names its leader by citizenid, so the local player is identified by
---matching their own server id against the pre-resolved `source` on each member.
registerExport('IsGroupLeader', function()
    local group = sd:getActiveGroup()
    if type(group) ~= 'table' or not group.leaderCitizenid then return false end

    local mySource = GetPlayerServerId(PlayerId())
    for _, member in ipairs(group.members or {}) do
        if member.source == mySource then
            return member.citizenid == group.leaderCitizenid
        end
    end
    return false
end)

---@type string Shared reason clause for the Job Center task surface.
local TASK_WHY = 'has no sd-phone equivalent: sd-phone groups carry no job task list, so there is no task state to read or advance'

stubExport('IsTaskStatus', false, TASK_WHY)
stubExport('TaskUpdate', nil, TASK_WHY)
stubExport('TaskListUpdate', nil, TASK_WHY)
stubExport('TaskList', {}, TASK_WHY)

-- gksphone's own state bags, mirrored from sd-phone's. sd-phone publishes phoneOpen, softOpen,
-- batteryLevel, airplaneMode, phoneDisabled, inCall, callId and callStatus already; the four below
-- are gksphone's own names for values sd-phone has, written replicated so a server-side reader sees
-- them too. phoneIsCharging and phoneIsChargingStation are absent rather than published false: they
-- describe a charging model sd-phone does not have, and a hard false would read as a live answer.

---Publishes one gksphone-named state bag on the local player, replicated so a server-side reader
---resolves it as well.
---@param key string gksphone state bag key
---@param value any
local function publish(key, value)
    pcall(function() LocalPlayer.state:set(key, value, true) end)
end

---Reports the shell state only the client can know to the server, which does the replicated write
---for sd-phone's OWN bags (phoneOpen, softOpen, batteryLevel, airplaneMode) and gives the server
---half a per-player heartbeat to re-apply a jam on.
---@param open boolean|nil
local function reportUp(open)
    TriggerServerEvent('sd-phone:server:statebags:report', {
        open    = open,
        soft    = sd:isCompanionOpen() == true,
        battery = sd:getBattery(),
    })
end

---Republishes every gksphone-named bag from sd-phone's live state. `phoneSignal` follows gksphone's
---own wording, which describes a BROKEN signal, so it is the inverse of sd-phone's coverage read.
---The number is published only once the cache is warm, so a cold read never blocks an open.
local function publishAll(number)
    if number then publish('phoneNumber', number) end
    publish('phoneOpen', sd:isOpen() == true)
    publish('phoneBattery', sd:getBattery())
    publish('phoneSignal', sd:hasService('data') ~= true)
end

AddEventHandler('sd-phone:client:openState', function(open)
    publish('phoneOpen', open == true)
    publish('phoneSignal', sd:hasService('data') ~= true)
    if selfCache.number then publish('phoneNumber', selfCache.number) end
    reportUp(open == true)
end)

AddEventHandler('sd-phone:client:battery', function(level)
    publish('phoneBattery', level)
    TriggerServerEvent('sd-phone:server:statebags:report', { battery = level })
end)

-- A resource restart lands mid-session, where no open/close edge is coming. The wait lets the
-- character load before the first number lookup, which would otherwise cache a nil.
CreateThread(function()
    Wait(5000)
    publishAll(selfInfo().number)
    reportUp(sd:isOpen() == true)
end)

-- gksphone's own commands, registered for the muscle memory of a server moving off it. Only the
-- three that sd-phone can actually answer do something; the rest report why they cannot, so a player
-- typing one gets an explanation instead of an "unknown command" line that reads as a broken phone.
--
-- gksphone V1's /answer and /endcall are deliberately NOT registered: those names are claimed by
-- ambulance, police and radio scripts across the ecosystem, and quietly taking them from a server
-- that never ran gksphone would break something else.

RegisterCommand('phone', function() sd:open() end, false)
RegisterCommand('endPhoneCall', function() TriggerServerEvent('sd-phone:server:compat:gks:endCall') end, false)

RegisterCommand('answerPhoneCall', function()
    if LocalPlayer.state.inCall ~= true then return end
    warnOnce('answerPhoneCall', 'answerPhoneCall has no sd-phone equivalent: a call is answered on the phone itself, so the phone was opened for you instead')
    sd:open()
end, false)

RegisterCommand('togglePhoneCursor', function()
    warnOnce('togglePhoneCursor', 'togglePhoneCursor has no sd-phone equivalent: the shell owns its own cursor and the phone is driven with the mouse whenever it is open')
end, false)

RegisterCommand('delphone', function()
    warnOnce('delphone', 'delphone has no sd-phone equivalent: sd-phone rebuilds the phone prop from its hold pose every time, so a stuck prop clears itself on the next open or close')
end, false)
