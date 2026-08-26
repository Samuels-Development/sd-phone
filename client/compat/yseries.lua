---Whether a started resource named yseries is the sd-phone name-holder shim rather than the real
---product.
---@return boolean
local function isShimYseries()
    return GetResourceMetadata('yseries', 'sd_phone_shim', 0) == 'yes'
end

---Returns whether the real yseries resource is started. sd-phone holds the same resource name
---through `provide` and is deliberately ignored.
---@return boolean
local function realYseriesStarted()
    for i = 0, GetNumResources() - 1 do
        if GetResourceByFindIndex(i) == 'yseries' then return not isShimYseries() end
    end
    return false
end

-- Registration proceeds unless sd_phone_yseriescompat is explicitly disabled or the real yseries
-- is running.
local compatConvar = GetConvar('sd_phone_yseriescompat', 'true')
if compatConvar == 'false' or compatConvar == '0' or realYseriesStarted() then return end

---@type table Self-export proxy for the sd-phone client surface.
local sd = exports['sd-phone']

---@type table Cell service (client.service): level, bars + the SetServiceBars override.
local service = require 'client.service'

---@type any[] AddEventHandler cookies for every registered export handler.
local exportCookies = {}

---Registers fn on the client export registry under the yseries name via the __cfx_export event.
---@param name string PascalCase YSeries export name
---@param fn function implementation
local function registerExport(name, fn)
    exportCookies[#exportCookies + 1] = AddEventHandler(('__cfx_export_yseries_%s'):format(name), function(setCB)
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
    print(('^3[sd-phone]^0 yseries compat: %s'):format(why))
end

---Registers a stubbed export: warns once on first call, then returns the fixed default.
---@param name string PascalCase YSeries export name
---@param default any fixed return value
---@param why string reason clause
local function stubExport(name, default, why)
    registerExport(name, function()
        warnOnce(name, ('%s %s'):format(name, why))
        return default
    end)
end

---@type boolean Live flashlight beam state, tracked off the first-party client event because the
---torch is UI-driven and has no Lua getter.
local flashlightOn = false
AddEventHandler('sd-phone:client:flashlight', function(on) flashlightOn = on == true end)


-- General shell control: open state, lockout and the in-app back action.

---ToggleOpen(open): true opens the phone, false closes it.
registerExport('ToggleOpen', function(open)
    if open == false then sd:close() else sd:open() end
end)

registerExport('IsOpen', function() return sd:isOpen() end)
registerExport('IsDisabled', function() return sd:isDisabled() end)
registerExport('ToggleDisabled', function(disable) sd:setDisabled(disable == true) end)

---CloseApp(): returns to the home screen without closing the phone. sd-phone drives navigation
---from the UI, so this closes the shell, which is the closest reachable behaviour.
registerExport('CloseApp', function()
    warnOnce('CloseApp', 'CloseApp has no in-app back action in sd-phone; the phone was closed instead of returning to the home screen')
    sd:close()
end)

-- Calls are server-side only in sd-phone: the client shell drives them through NUI callbacks, and
-- there is no client Lua surface to dial, read or hang up one. Every call export here is a stub
-- that names the server shim to use instead, matching how the lb-phone client half handles it.
stubExport('CreateCall', false,
    'is unsupported client-side; use the server CallContact shim (or the sd-phone startCall export) instead')
stubExport('IsInCall', false,
    'is unsupported client-side: call state is server-side only in sd-phone; use the server IsInCall shim')
stubExport('CancelCall', nil,
    'is unsupported client-side; use the server EndCall shim (or the sd-phone endCallFor export) instead')
stubExport('GetTargetPlayerCallStatus', { busy = false, canCall = true, isOnline = false, inCall = false },
    'cannot be answered on the client: sd-phone resolves call availability server-side, so a permissive default is returned')
stubExport('GetCallConfig', { CallRepeats = 1, RepeatTimeout = 0 },
    'has no sd-phone equivalent: ring cadence lives in configs/phone.lua')

-- Signal towers: fully backed by client.service, which owns bars, towers and the pin override.

registerExport('GetCurrentService', function() return service.bars() end)
registerExport('GetAllTowers', function() return service.towers() end)
registerExport('UpdateSignalStrength', function() return service.bars() end)

---SetServiceBars(level, disable): pins the displayed bars. `disable` stops automatic recalculation,
---which is exactly what the override does, so a nil level releases it.
registerExport('SetServiceBars', function(level, disable)
    local n = tonumber(level)
    if disable == false or n == nil then
        service.setBarsOverride(nil)
        return
    end
    service.setBarsOverride(math.max(0, math.min(4, math.floor(n))))
end)

-- Misc shell surfaces: airplane mode and the flashlight are real; streamer mode and landscape are not.

registerExport('AirplaneModeEnabled', function() return LocalPlayer.state.airplaneMode == true end)
registerExport('GetFlashlightState', function() return flashlightOn end)

stubExport('IsAppInstalled', true,
    'cannot be answered on the client: sd-phone resolves app unlocks server-side (hasAppUnlock), so every app reports installed')
stubExport('GetCurrentAppId', nil,
    'has no sd-phone equivalent: the shell tracks the foreground app inside the UI and publishes no Lua view of it')

---SendAppMessage(appId, data): forwards a message into a custom app's iframe.
registerExport('SendAppMessage', function(appId, data)
    return sd:sendCustomAppMessage(appId, data)
end)

stubExport('ToggleFlashlight', nil,
    'has no Lua setter in sd-phone (the torch is UI-driven); GetFlashlightState does read the real beam state')
stubExport('StreamerModeEnabled', false, 'has no sd-phone equivalent: the phone has no streamer mode')
stubExport('UpdateStreamerMode', nil, 'has no sd-phone equivalent: the phone has no streamer mode')
stubExport('ToggleLandscape', false,
    'has no sd-phone equivalent: the phone shell is portrait-only, the tablet being a separate resource')
stubExport('SetNuiFocusKeepInput', nil,
    'is not supported: sd-phone owns its own NUI focus, and handing it out mid-session strands the shell')

-- Groups: sd-phone tracks membership and a leader, but none of YSeries side-job staging.

registerExport('GetGroupId', function() return sd:getActiveGroupId() end)

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

stubExport('GetJobStage', nil, 'has no sd-phone equivalent: groups carry no job stage')

-- Companies: dispatch-style messaging is a server export in sd-phone.

stubExport('SendCompanyMessage', false,
    'is unsupported client-side; use the sd-phone server messageCompany export instead')

-- Custom apps: YSeries keys apps on `key` where sd-phone uses `identifier`.

---AddCustomApp(data): registers a third-party app. YSeries keys apps on `key` where sd-phone uses
---`identifier`, and nests icons under yos/humanoid rather than taking a single URL.
registerExport('AddCustomApp', function(data)
    if type(data) ~= 'table' then return false, 'app data must be a table' end

    local icon = data.icon
    if type(icon) == 'table' then icon = icon.yos or icon.humanoid end

    return sd:addCustomApp({
        identifier = data.key,
        name       = data.name,
        ui         = data.ui,
        icon       = icon,
        defaultApp = data.defaultApp,
    })
end)

registerExport('RemoveCustomApp', function(key) return sd:removeCustomApp(key) end)

-- Battery: sd-phone's battery is a cosmetic status-bar counter that drains while the phone is open,
-- with no charge persistence, no charging and no per-device state. The reads are answered from it;
-- the writes have nothing durable to write to and say so.
registerExport('GetBatteryLevel', function() return sd:getBattery() end)

registerExport('GetBatteryInfo', function()
    return { level = sd:getBattery(), charging = false, cosmetic = true }
end)

stubExport('SetBatteryLevel', false,
    'has no sd-phone equivalent: the battery is a cosmetic drain counter, not a stored charge')
stubExport('ChargeBattery', false,
    'has no sd-phone equivalent: the battery is a cosmetic drain counter, not a stored charge')
stubExport('StartCharging', false, 'has no sd-phone equivalent: sd-phone models no charging')
stubExport('StopCharging', false, 'has no sd-phone equivalent: sd-phone models no charging')

-- Phone items: sd-phone gates phone ownership on its own configured items and resolves the frame
-- colour from which one is held, so a caller cannot hand it an arbitrary YSeries model name.
stubExport('UsePhoneItem', false,
    'has no sd-phone equivalent: phone items are configured in configs/phone.lua and used through the inventory directly')
stubExport('VerifyPhoneItemName', true,
    'has no sd-phone equivalent: sd-phone accepts whichever items configs/phone.lua names, so every name verifies')

-- Weather override: sd-phone derives its weather on the CLIENT from whichever sync resource is
-- running, so the server-side YSeries setters cannot write to a store. The bridge's single read
-- choke point is wrapped instead, layering an override over the live reading when one is set and
-- delegating untouched when it is not.
do
    local weatherBridge = require 'bridge.client.weather'
    local liveRead = weatherBridge.read
    local override = nil

    RegisterNetEvent('sd-phone:client:yseries:weather', function(data)
        override = type(data) == 'table' and next(data) ~= nil and data or nil
    end)

    weatherBridge.read = function(...)
        local snapshot = liveRead(...)
        if not override then return snapshot end
        for k, v in pairs(override) do snapshot[k] = v end
        return snapshot
    end
end

-- Player lifecycle: YSeries fires these off its own death handler, which sd-phone does not own, so
-- they are re-fired from the framework's death state instead.
do
    local wasDead = false
    CreateThread(function()
        while true do
            Wait(1000)
            local dead = IsPlayerDead(PlayerId())
            if dead ~= wasDead then
                wasDead = dead
                TriggerEvent(dead and 'yseries:player:died' or 'yseries:player:revived')
            end
        end
    end)
end

-- Battery + phone-item lifecycle mirrored under YSeries names. The state bag FEED itself is
-- first-party (client/statebags.lua), so it runs whether or not this shim is enabled.

---Mirrors the cosmetic battery percentage under YSeries' own battery event.
AddEventHandler('sd-phone:client:battery', function(level)
    TriggerEvent('yseries:battery:update', level)
end)

-- Phone item lifecycle -> YSeries' item events. sd-phone announces a SIM/device state push rather
-- than an inventory add/remove, so the two item edges are derived from whether the acting phone
-- currently carries a SIM. Only meaningful while unique phones are on; with them off there is one
-- permanent phone per character and no swap to report.
do
    local lastIdentity = nil

    RegisterNetEvent('sd-phone:client:simState', function(state)
        if type(state) ~= 'table' then return end

        local identity = state.profile or state.number
        if identity == lastIdentity then return end
        lastIdentity = identity

        TriggerEvent('yseries:client:device-changed', identity)
        TriggerEvent(state.hasSim and 'yseries:phone-item-added' or 'yseries:phone-item-removed', identity)
    end)
end
