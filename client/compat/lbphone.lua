---Whether a started resource named lb-phone is the sd-phone name-holder shim rather than the
---real product.
---@return boolean
local function isShimLbPhone()
    return GetResourceMetadata('lb-phone', 'sd_phone_shim', 0) == 'yes'
end

---Returns whether the real lb-phone resource is started. The sd-phone shim holds the same
---resource name and is deliberately ignored.
---@return boolean
local function realLbPhoneStarted()
    for i = 0, GetNumResources() - 1 do
        if GetResourceByFindIndex(i) == 'lb-phone' then return not isShimLbPhone() end
    end
    return false
end

-- Registration proceeds unless sd_phone_lbcompat is explicitly disabled or the real lb-phone is
-- running.
local compatConvar = GetConvar('sd_phone_lbcompat', 'true')
if compatConvar == 'false' or compatConvar == '0' or realLbPhoneStarted() then return end

---@type table Self-export proxy for the sd-phone client surface.
local sd = exports['sd-phone']

---@type table sd-phone config root (configs/config.lua), read here only for the Debug flag.
local config = require 'configs.config'

---@type table Custom third-party app registry (client.customapps): identifier resolution + forwards.
local customApps = require 'client.customapps'

---@type any[] AddEventHandler cookies for every registered export handler.
local exportCookies = {}

---@type any[] Handler cookies for the event bridge (outbound mirrors, inbound lb-phone net
---events, the flashlight tracker).
local eventCookies = {}

---Registers fn on the client export registry under lb-phone's name via the __cfx_export event;
---the handler cookie lands in exportCookies.
---@param name string PascalCase lb-phone export name
---@param fn function implementation
local function registerLbExport(name, fn)
    exportCookies[#exportCookies + 1] = AddEventHandler(('__cfx_export_lb-phone_%s'):format(name), function(setCB)
        setCB(fn)
    end)
end

---@type table<string, boolean> Surfaces that have already warned this session.
local warned = {}

---Prints one console breadcrumb the first time an unsupported surface is touched.
---@param name string warn key (export name, or name.arg for partially supported arguments)
---@param why string what is unsupported and what happens instead
local function warnOnce(name, why)
    if warned[name] then return end
    warned[name] = true
    print(('[sd-phone:lbcompat] %s %s'):format(name, why))
end

---Register a stubbed lb-phone export: warns once on first call, then returns the fixed safe
---default. A nil result doubles as a plain no-op.
---@param name string PascalCase lb-phone export name
---@param result any fixed return value
---@param why string|nil override for the warning text
local function stubLbExport(name, result, why)
    registerLbExport(name, function()
        warnOnce(name, why or 'has no sd-phone equivalent; returning a safe default')
        return result
    end)
end

---Registers a tray-family stub that warns once and returns false plus a reason string.
---@param name string PascalCase lb-phone export name
local function stubLbTrayExport(name)
    registerLbExport(name, function()
        warnOnce(name, 'has no sd-phone tray equivalent; returning false')
        return false, 'not supported'
    end)
end

---@type table<string, true> Every sd-phone app id the home screen knows (shared reserved-id set).
local SD_APPS = require('client.appids').set

---@type table<string, string> lb-phone app name -> sd-phone app id, for the names that differ.
local APP_MAP = {
    twitter     = 'birdy',
    instapic    = 'photogram',
    instagram   = 'photogram',
    trendy      = 'vibez',
    tiktok      = 'vibez',
    tinder      = 'cherry',
    spotify     = 'music',
    wallet      = 'bank',
    garage      = 'garages',
    home        = 'homes',
    yellowpages = 'pages',
}

---Maps an lb-phone app name onto an sd-phone app id: exact registered custom identifiers first,
---then known renames, then a lowercase passthrough. Unknown names yield nil.
---@param app any lb-phone app id
---@return string|nil
local function mapApp(app)
    if type(app) ~= 'string' or app == '' then return nil end
    if customApps.has(app) then return app end
    local key = app:lower():gsub('%s+', '')
    return APP_MAP[key] or (SD_APPS[key] and key) or nil
end

-- Real mappings: lb-phone client exports sd-phone honours.

registerLbExport('IsOpen', function() return sd:isOpen() end)

-- Maps to sd-phone's single open state.
registerLbExport('IsPhoneOnScreen', function() return sd:isOpen() end)

---ToggleOpen(open?, noFocus?): nil toggles, true opens, false closes. noFocus == true opens
---normally and warns once.
registerLbExport('ToggleOpen', function(open, noFocus)
    if noFocus == true then
        warnOnce('ToggleOpen.noFocus', 'noFocus is unsupported; the phone opens with focus as normal')
    end
    if open == nil then open = not sd:isOpen() end
    if open then sd:open() else sd:close() end
end)

registerLbExport('IsDisabled', function() return sd:isDisabled() end)

---ToggleDisabled(disabled): forwards to sd setDisabled.
registerLbExport('ToggleDisabled', function(disabled) sd:setDisabled(disabled) end)

---@type {value: string?, at: integer} Own-number cache for GetEquippedPhoneNumber; refreshes
---lazily after a minute.
local numberCache = { value = nil, at = 0 }

---Clears the cached number when the character changes.
local function clearNumberCache()
    numberCache.value, numberCache.at = nil, 0
end
RegisterNetEvent('QBCore:Client:OnPlayerLoaded', clearNumberCache)
RegisterNetEvent('QBCore:Client:OnPlayerUnload', clearNumberCache)
RegisterNetEvent('esx:playerLoaded', clearNumberCache)
RegisterNetEvent('esx:onPlayerLogout', clearNumberCache)

registerLbExport('GetEquippedPhoneNumber', function()
    if numberCache.value and GetGameTimer() - numberCache.at < 60000 then
        return numberCache.value
    end
    local ok, number = pcall(lib.callback.await, 'sd-phone:server:compat:selfNumber', false)
    if ok and type(number) == 'string' and number ~= '' then
        numberCache.value = number
        numberCache.at = GetGameTimer()
        return number
    end
    return numberCache.value
end)

---HasPhoneItem(number?): resolves ownership server-side; the per-number argument is ignored.
registerLbExport('HasPhoneItem', function(_number)
    local ok, has = pcall(lib.callback.await, 'sd-phone:server:compat:selfHasPhone', false)
    return ok and has == true
end)

---SendNotification(data { app, title, content?, thumbnail? }) -> sd showNotification, with the
---app id mapped through mapApp. A non-table payload or missing title is dropped.
registerLbExport('SendNotification', function(data)
    if type(data) ~= 'table' or type(data.title) ~= 'string' then return end
    local app = mapApp(data.app)
    sd:showNotification({
        app   = app,
        appId = app,
        title = data.title,
        body  = data.content,
        image = data.thumbnail,
    })
end)

---OpenApp(app, data?) -> sd openApp, opening the phone first when closed. Returns false on a
---bad app name or a refused open.
registerLbExport('OpenApp', function(app, data)
    local id = mapApp(app)
    if not id then return false end
    return sd:openApp(id, type(data) == 'table' and data or nil)
end)

---CloseApp(options?): warns once and no-ops.
registerLbExport('CloseApp', function(_options)
    warnOnce('CloseApp', 'has no per-app close in sd-phone; leaving the phone as-is')
end)

---FormatNumber(number): digit-normalisation passthrough with an integral-float guard.
registerLbExport('FormatNumber', function(number)
    if math.type(number) == 'float' and number % 1 == 0 then
        number = ('%.0f'):format(number)
    end
    return (tostring(number or ''):gsub('%D', ''))
end)

-- Event bridge: re-fires sd-phone's first-party local events under lb-phone's names. Every
-- cookie lands in eventCookies.

---Mirrors the sd-phone visibility announcement as lb-phone's phoneToggled and setOnScreen.
eventCookies[#eventCookies + 1] = AddEventHandler('sd-phone:client:openState', function(open)
    TriggerEvent('lb-phone:phoneToggled', open == true)
    TriggerEvent('lb-phone:setOnScreen', open == true)
end)

---Mirrors sd-phone:client:cameraMode as lb-phone:toggleHud, coerced to a strict boolean.
eventCookies[#eventCookies + 1] = AddEventHandler('sd-phone:client:cameraMode', function(on)
    TriggerEvent('lb-phone:toggleHud', on and true or false)
end)

---Mirrors framework job changes as lb-phone:jobUpdated with { job = <name>, grade = <number> }.
---Malformed payloads are dropped.
eventCookies[#eventCookies + 1] = RegisterNetEvent('QBCore:Client:OnJobUpdate', function(job)
    if type(job) ~= 'table' or type(job.grade) ~= 'table' then return end
    TriggerEvent('lb-phone:jobUpdated', { job = job.name, grade = job.grade.level })
end)
eventCookies[#eventCookies + 1] = RegisterNetEvent('esx:setJob', function(job)
    if type(job) ~= 'table' then return end
    TriggerEvent('lb-phone:jobUpdated', { job = job.name, grade = job.grade })
end)

---@type boolean Tracked lockscreen beam state, fed by the announcement below.
local flashlightOn = false
eventCookies[#eventCookies + 1] = AddEventHandler('sd-phone:client:flashlight', function(on)
    flashlightOn = on == true
end)

registerLbExport('GetFlashlight', function() return flashlightOn end)

---Inbound lb-phone:usePhoneItem: opens the phone; the item payload is ignored.
eventCookies[#eventCookies + 1] = RegisterNetEvent('lb-phone:usePhoneItem', function(_item)
    if config.Debug then
        print('[sd-phone:lbcompat] usePhoneItem received; opening the phone (item payload ignored)')
    end
    sd:open()
end)

---lb-phone:itemAdded / itemRemoved: registered as documented no-ops.
eventCookies[#eventCookies + 1] = RegisterNetEvent('lb-phone:itemAdded', function() end)
eventCookies[#eventCookies + 1] = RegisterNetEvent('lb-phone:itemRemoved', function() end)

---Converts an sd-phone 0-100 slider to the 0-1 fraction lb-phone published. nil stays nil.
---@param v number|nil
---@return number|nil
local function slider01(v)
    local n = tonumber(v)
    if not n then return nil end
    return n / 100
end

---Projects an sd-phone settings snapshot onto lb-phone's settings object. Shape and ranges follow
---lb-phone's config/defaultSettings.json; settings it never published are left out.
---@param s table snapshot from sd-phone:server:settings:get
---@return table settings
local function lbSettings(s)
    return {
        display = {
            theme      = s.theme,
            brightness = slider01(s.brightness),
            size       = slider01(s.phoneScale),
        },
        sound = {
            ringtone   = s.ringtone,
            texttone   = s.notificationTone,
            volume     = slider01(s.ringtoneVol),
            callVolume = slider01(s.callVol),
        },
        wallpaper = {
            background = s.wallpaper,
            blur       = s.blurLock,
        },
        time = {
            twelveHourClock = not s.hour24,
        },
    }
end

---@type table|nil Last known lb-phone-shaped settings. Cached so GetSettings answers without yielding.
local settingsCache

---Re-reads the snapshot into settingsCache. Yields, so never called from the export.
---@return table|nil settings nil when the read failed
local function refreshSettings()
    local res = lib.callback.await('sd-phone:server:settings:get', false)
    if type(res) ~= 'table' or res.success ~= true or type(res.data) ~= 'table' then return nil end
    settingsCache = lbSettings(res.data)
    return settingsCache
end

---Re-reads the cache and mirrors it as lb-phone's settingsUpdated once the read lands.
local function refreshAndAnnounce()
    local settings = refreshSettings()
    if settings then TriggerEvent('lb-phone:settingsUpdated', settings) end
end

---Drops the snapshot when the character goes away, so GetSettings answers nil rather than the
---departed character's settings.
local function clearSettingsCache()
    settingsCache = nil
end

-- Primed at load, then tracked across characters. Settings resolve only once the citizenid
-- exists (the constraint client/main.lua's pushCharacterLoaded is built around), so on a normal
-- join the load-time read answers before the character is picked and would otherwise leave the
-- cache empty for the whole session. Switching characters matters just as much: without this the
-- cache keeps serving the PREVIOUS character's settings until the new one happens to write one.
-- Same four events the number cache above already tracks, for the same reason.
--
-- Note this runs on every server, not only ones with an lb-phone consumer: the compat convar
-- defaults to on, and nothing can detect whether anyone listens to lb-phone:settingsUpdated. So
-- each accepted settings write costs one extra callback round trip regardless. That is cheap
-- (writes are user-paced, and slider persists are already debounced to one per gesture), but the
-- only way to pay nothing is sd_phone_lbcompat=false, which turns off the whole shim.
CreateThread(refreshSettings)
eventCookies[#eventCookies + 1] = RegisterNetEvent('QBCore:Client:OnPlayerLoaded', refreshAndAnnounce)
eventCookies[#eventCookies + 1] = RegisterNetEvent('esx:playerLoaded', refreshAndAnnounce)
eventCookies[#eventCookies + 1] = RegisterNetEvent('QBCore:Client:OnPlayerUnload', clearSettingsCache)
eventCookies[#eventCookies + 1] = RegisterNetEvent('esx:onPlayerLogout', clearSettingsCache)

---Mirrors an accepted sd-phone settings write as lb-phone's settingsUpdated.
eventCookies[#eventCookies + 1] = AddEventHandler('sd-phone:client:settingsUpdated', refreshAndAnnounce)

-- Stubs: the rest of lb-phone's client surface, grouped by family; each warns once and returns
-- a safe default.

-- Config and settings readers.
stubLbExport('GetConfig', {})
stubLbExport('GetCellTowers', {})
---GetSettings() -> table|nil, from the cache refreshed alongside lb-phone:settingsUpdated.
registerLbExport('GetSettings', function()
    return settingsCache
end)
stubLbExport('GetStreamerMode', false)

-- Airplane mode reads as off.
stubLbExport('GetAirplaneMode', false, 'state is server-side only in sd-phone; returning false')

-- Flashlight: only the toggle is stubbed; GetFlashlight is real.
stubLbExport('ToggleFlashlight', nil, 'has no Lua setter in sd-phone (the torch is UI-driven); GetFlashlight does read the real beam state')

-- Call family.
stubLbExport('IsInCall', false, 'call state is server-side only in sd-phone; returning false')
stubLbExport('CreateCall', nil, 'is unsupported client-side; use the server CreateCall shim (or the sd-phone startCall export) instead')
stubLbExport('CreateCustomNumber', false)
stubLbExport('RemoveCustomNumber', false)
stubLbExport('CreateDynamicCustomNumber', false)
stubLbExport('RemoveDynamicCustomNumber', false)
stubLbExport('EndCustomCall', false)

-- Open-condition checks.
stubLbExport('AddCheck', 0, 'is unsupported; use exports["sd-phone"]:setDisabled(true) instead')
stubLbExport('RemoveCheck', false, 'is unsupported; use exports["sd-phone"]:setDisabled(false) instead')

-- Battery family reads as a healthy phone.
stubLbExport('GetBattery', 100)
stubLbExport('SetBattery', nil)
stubLbExport('IsCharging', false)
stubLbExport('ToggleCharging', nil)
stubLbExport('IsPhoneDead', false)

-- Appearance and shell tweaks with no sd-phone counterpart.
stubLbExport('SetPhoneVariation', nil)
stubLbExport('SetServiceBars', nil)
stubLbExport('ReloadPhone', nil)
stubLbExport('ToggleHomeIndicator', nil)
stubLbExport('ToggleLandscape', nil)
stubLbExport('SetAnimations', nil)
stubLbExport('ResetAnimations', nil)

-- Camera family.
stubLbExport('EnableWalkableCam', nil)
stubLbExport('DisableWalkableCam', nil)
stubLbExport('ToggleSelfieCam', nil)
stubLbExport('ToggleCameraFrozen', nil)
stubLbExport('IsWalkingCamEnabled', false)
stubLbExport('IsSelfieCam', false)
stubLbExport('IsCameraOpen', false)
stubLbExport('SetCameraComponent', nil)
stubLbExport('SaveToGallery', nil, 'is unsupported client-side; use the sd-phone server addPhoto export instead')

-- UI component and overlay injection.
stubLbExport('ShowComponent', nil)
stubLbExport('SetPopUp', nil)
stubLbExport('SetContextMenu', nil)

-- Custom apps: forward to the first-party sd-phone registry, tagging each app with the calling
-- resource. Field names already match, so nothing is translated.

---AddCustomApp(data) -> ok, err. Attribution is the resource invoking this lb-phone export.
registerLbExport('AddCustomApp', function(data)
    return customApps.add(data, GetInvokingResource())
end)

---RemoveCustomApp(identifier) -> ok, err. Only the owning resource may remove its app.
registerLbExport('RemoveCustomApp', function(identifier)
    return customApps.remove(identifier, GetInvokingResource())
end)

---SendCustomAppMessage(identifier, message) -> ok, err. The reserved id 'any' broadcasts to all.
registerLbExport('SendCustomAppMessage', function(identifier, message)
    return customApps.sendMessage(identifier, message, GetInvokingResource())
end)

-- Music and live tray surfaces.
stubLbTrayExport('ShowMusicTray')
stubLbTrayExport('UpdateMusicTray')
stubLbTrayExport('RemoveMusicTray')
stubLbTrayExport('ShowLiveTray')
stubLbTrayExport('UpdateLiveTray')
stubLbTrayExport('RemoveLiveTray')
stubLbExport('IsLive', false)
stubLbExport('PostBirdy', false)

-- Home-screen management: resolve the app id (built-in rename or registered custom identifier),
-- then warn once and no-op - sd-phone has no Lua setter for install/hidden state.

---SetAppHidden(app, hidden): resolves the app id, then no-ops.
registerLbExport('SetAppHidden', function(app, _hidden)
    if not mapApp(app) then return end
    warnOnce('SetAppHidden', 'cannot change home-screen visibility from Lua in sd-phone; the request was ignored')
end)

---SetAppInstalled(app, installed): resolves the app id, then no-ops.
registerLbExport('SetAppInstalled', function(app, _installed)
    if not mapApp(app) then return end
    warnOnce('SetAppInstalled', 'install state is managed by the sd-phone App Store; the request was ignored')
end)

-- Crypto app readers.
stubLbExport('GetCoinValue', 0)
stubLbExport('GetCryptoWallet', {})
stubLbExport('GetOwnedCoin', false)

-- Notification and contact mutations.
stubLbExport('DeleteNotification', false)
stubLbExport('AddContact', false, 'is unsupported client-side; use the sd-phone server contact exports instead')
stubLbExport('UpdateContact', false, 'is unsupported client-side; use the sd-phone server contact exports instead')
stubLbExport('RemoveContact', false, 'is unsupported client-side; use the sd-phone server contact exports instead')
stubLbExport('SetContactModal', nil)

-- Company phone surfaces.
stubLbExport('SendCompanyMessage', false, 'is unsupported client-side; use the sd-phone server messageCompany export instead')
stubLbExport('SendCompanyCoords', false, 'is unsupported client-side; use the sd-phone server messageCompany export instead')
stubLbExport('GetCompanyCallsStatus', false)
stubLbExport('ToggleCompanyCalls', false)

-- Custom callback wire.
stubLbExport('RegisterClientCallback', nil, 'lb-phone custom callbacks are not bridged')
stubLbExport('TriggerCallback', nil, 'lb-phone custom callbacks are not bridged')
stubLbExport('AwaitCallback', nil, 'lb-phone custom callbacks are not bridged')

---Replays onResourceStart under lb-phone's name once per sd-phone client start, so third-party
---lb apps that re-register on lb-phone restarts also re-register after an sd-phone restart.
---onClientResourceStart is deliberately not faked: the deregistration guard below listens to it.
CreateThread(function()
    Wait(500)
    TriggerEvent('onResourceStart', 'lb-phone')
end)

---Removes every shim handler, exports and event bridge alike, when the real lb-phone starts
---mid-session.
AddEventHandler('onClientResourceStart', function(resource)
    if resource ~= 'lb-phone' or isShimLbPhone() then return end
    for i = 1, #exportCookies do
        RemoveEventHandler(exportCookies[i])
    end
    exportCookies = {}
    for i = 1, #eventCookies do
        RemoveEventHandler(eventCookies[i])
    end
    eventCookies = {}
    print('[sd-phone:lbcompat] the real lb-phone just started, so the compat shim deregistered its client exports and event handlers and new lookups now resolve to lb-phone. Only already-cached callers keep the shim\'s functions until lb-phone next stops.')
end)
