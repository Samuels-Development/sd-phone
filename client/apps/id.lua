---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'

---@type string[] NUI action suffixes proxied 1:1 to sd-phone:server:id:<action>.
local ACTIONS = { 'list', 'setPortrait', 'share' }

---@type integer How long a headshot render may take before the request gives up, in ms.
local HEADSHOT_TIMEOUT <const> = 4000

---@type integer|nil The one live headshot handle. The game caps these at 34 per client and the
---texture dies with the handle, so the previous one is released only once its replacement is ready
---and the NUI has had its chance to copy the pixels out.
local headshot

-- Thin delegates into server/id.
for _, action in ipairs(ACTIONS) do
    proxyCallback('sd-phone:id:' .. action, 'sd-phone:server:id:' .. action)
end

---Renders the player's face the way the pause menu does and returns the texture name the NUI can
---load through `https://nui-img/<txd>/<txd>`. Transparent background, so the card supplies its own.
---@return string|nil txd nil when the render never became ready
local function renderHeadshot()
    local handle = RegisterPedheadshotTransparent(PlayerPedId())
    if not handle then return nil end
    local deadline = GetGameTimer() + HEADSHOT_TIMEOUT
    while not (IsPedheadshotReady(handle) and IsPedheadshotValid(handle)) do
        if GetGameTimer() > deadline then
            UnregisterPedheadshot(handle)
            return nil
        end
        Wait(50)
    end
    if headshot then UnregisterPedheadshot(headshot) end
    headshot = handle
    return GetPedheadshotTxdString(handle)
end

---React -> Lua: the ID app wants a fresh face render for its cards.
RegisterNUICallback('sd-phone:id:headshot', function(_, cb)
    cb({ txd = renderHeadshot() })
end)

---React -> Lua: the NUI has copied the render out, so the texture can go.
RegisterNUICallback('sd-phone:id:headshotDone', function(_, cb)
    if headshot then
        UnregisterPedheadshot(headshot)
        headshot = nil
    end
    cb({ success = true })
end)

---Server push: a nearby player showed us a card and we accepted; hands it to the phone for the
---configured window.
---@param data table { id: string, card: table, fromName: string, expiresAt: number }
RegisterNetEvent('sd-phone:client:id:received', function(data)
    SendNUIMessage({ action = 'sd-phone:id:received', data = data })
end)

---Releases the headshot handle with the resource, so a restart never leaks one.
AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() or not headshot then return end
    UnregisterPedheadshot(headshot)
    headshot = nil
end)
