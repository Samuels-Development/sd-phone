---@type FrameworkInfo Framework detection (bridge.shared.framework): name ('qbx'|'qb'|'esx'|'vrp').
local framework = require 'bridge.shared.framework'

---@type table Lifecycle module; the table returned at end of file. The client mirror of
---bridge/server/lifecycle: the single owner of the framework character-load/unload event names on
---this side, so no client file carries a per-framework RegisterNetEvent block any more.
local lifecycle = {}

---@type fun()[] Fired once the local player's character has finished loading.
local loadedListeners = {}

---@type fun()[] Fired as the local player's character goes away.
local unloadedListeners = {}

-- RegisterNetEvent(name) is what whitelists a name for NETWORK delivery, per resource;
-- AddEventHandler alone never receives a server-triggered event. Every framework's character
-- events are server-triggered, and this module is now the only place in sd-phone that registers
-- them - so it registers ALL of them unconditionally, for every framework, before branching on
-- which one is actually running. Registering a name the running framework never fires is free;
-- omitting one drops the phone's character-load path on that framework with no error anywhere.
RegisterNetEvent('QBCore:Client:OnPlayerLoaded')
RegisterNetEvent('QBCore:Client:OnPlayerUnload')
RegisterNetEvent('esx:playerLoaded')
RegisterNetEvent('esx:onPlayerLogout')
RegisterNetEvent('sd-phone:client:vrp:characterLoaded')
RegisterNetEvent('sd-phone:client:vrp:characterUnloaded')

---Notify one listener list. Every callback is pcall'd because these run on the framework's own
---event thread: one subscriber raising must not stop the remaining subscribers from ever seeing
---the edge, which on a load event would leave the phone half-initialised for the session.
---@param list fun()[]
local function fire(list)
    for i = 1, #list do
        local ok, err = pcall(list[i])
        if not ok then
            print(('^1[sd-phone:lifecycle]^0 handler error: %s'):format(err))
        end
    end
end

---Subscribe to "the local player's character finished loading". Fires on QBCore/QBox's
---OnPlayerLoaded, ESX's playerLoaded, and - on vRP - the server bridge's own push, since vRP has
---no client-side data API and emits nothing a client can subscribe to. Listeners live for the
---resource's lifetime. The callback takes no argument: on the client there is only ever one
---character, the local one.
---@param cb fun()
function lifecycle.onCharacterLoaded(cb)
    if type(cb) ~= 'function' then return end
    loadedListeners[#loadedListeners + 1] = cb
end

---Subscribe to "the local player's character is going away". QBCore/QBox OnPlayerUnload, ESX
---onPlayerLogout, and the server bridge's push on vRP. Note the ESX name differs from the server
---side's `esx:playerLogout`; both are correct for their own side.
---@param cb fun()
function lifecycle.onCharacterUnloaded(cb)
    if type(cb) ~= 'function' then return end
    unloadedListeners[#unloadedListeners + 1] = cb
end

---Fire the load edge. Named so the branch below reads as a mapping rather than as behaviour.
local function fireLoaded() fire(loadedListeners) end

---Fire the unload edge.
local function fireUnloaded() fire(unloadedListeners) end

-- The framework subscription itself: chosen once here, so no consumer ever branches on a
-- framework name again. framework.qb covers QBox as well as QBCore, which several of the call
-- sites this replaces did not.
if framework.qb then
    AddEventHandler('QBCore:Client:OnPlayerLoaded', fireLoaded)
    AddEventHandler('QBCore:Client:OnPlayerUnload', fireUnloaded)
elseif framework.name == 'esx' then
    AddEventHandler('esx:playerLoaded', fireLoaded)
    AddEventHandler('esx:onPlayerLogout', fireUnloaded)
elseif framework.name == 'vrp' then
    AddEventHandler('sd-phone:client:vrp:characterLoaded', fireLoaded)
    AddEventHandler('sd-phone:client:vrp:characterUnloaded', fireUnloaded)
end

return lifecycle
