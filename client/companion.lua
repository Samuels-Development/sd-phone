-- Companion-device bus: lets a sibling resource (sd-tablet) reuse this client's NUI callbacks
-- and receive its NUI pushes, without duplicating a single app module.
--
-- Two shadows do all the work:
--   RegisterNUICallback  records every handler this resource registers, so a companion can
--                        invoke one by name instead of re-implementing it.
--   SendNUIMessage       re-emits every push as a client event, so a companion's own NUI frame
--                        sees the same server data this one does.
--
-- Both are installed before any app module loads (client/main.lua requires this first) and
-- nothing in the resource caches either global, so all 459 registrations and every push are
-- covered - including the ones app modules build at runtime.
--
-- Inert with no companion running: the registry is a table write per registration, and the
-- mirror is a nil check per push.

---@class CompanionHook
---@field companionOpen boolean a companion device currently owns the screen
---@field phoneOpen boolean our own NUI is up (mirrored from client/main.lua)
local hook = {
    companionOpen = false,
    phoneOpen     = false,
    mirroring     = false,
}

---@type table<string, fun(payload: any, cb: fun(result: any))> Every NUI callback this resource registers.
local handlers = {}

-- Voice calling is the phone's alone. A companion may neither invoke these nor be told about
-- them, so a tablet can never dial, answer, ring, or run the video (FaceTime) leg - and neither
-- can a hand-edited companion build, because the refusal lives on this side of the seam.
local DENY_PREFIX = { 'sd-phone:call:', 'sd-phone:video:', 'sd-phone:payphone:' }
local DENY = {
    ['sd-phone:calls:seen']           = true,
    ['sd-phone:services:callCompany'] = true,
}

---Whether an action is closed to companion devices.
---@param action string
---@return boolean
local function denied(action)
    if DENY[action] then return true end
    for _, prefix in ipairs(DENY_PREFIX) do
        if action:sub(1, #prefix) == prefix then return true end
    end
    return false
end

hook.denied = denied

-------------------------------------------------------------------- registration shadow

local realRegister = RegisterNUICallback

---Records the handler, then registers it normally.
---@param action string
---@param handler fun(payload: any, cb: fun(result: any))
function RegisterNUICallback(action, handler)
    handlers[action] = handler
    realRegister(action, handler)
end

-------------------------------------------------------------------- push mirror

local realSend = SendNUIMessage

---Sends to our own frame, then mirrors to an armed companion. Call pushes are dropped here so
---an incoming call can never ring on a device that isn't allowed to answer it.
---@param data table NUI message { action = string, data = any }
function SendNUIMessage(data)
    realSend(data)
    if not hook.mirroring then return end
    if type(data) ~= 'table' or type(data.action) ~= 'string' then return end
    if denied(data.action) then return end
    TriggerEvent('sd-phone:client:companion:push', data)
end

-------------------------------------------------------------------- focus arbitration

local realFocus     = SetNuiFocus
local realKeepInput = SetNuiFocusKeepInput

---While a companion owns the screen and our own phone is closed, our (hidden) frame must never
---take focus back: a forwarded handler - the Camera app above all - is asking on behalf of the
---device that is actually visible, so the request is handed to it instead.
---@param hasFocus boolean
---@param hasCursor boolean
function SetNuiFocus(hasFocus, hasCursor)
    if hook.companionOpen and not hook.phoneOpen then
        TriggerEvent('sd-phone:client:companion:focus', hasFocus, hasCursor)
        return
    end
    realFocus(hasFocus, hasCursor)
end

---@param keepInput boolean
function SetNuiFocusKeepInput(keepInput)
    if hook.companionOpen and not hook.phoneOpen then
        TriggerEvent('sd-phone:client:companion:keepInput', keepInput)
        return
    end
    realKeepInput(keepInput)
end

-------------------------------------------------------------------- invoke

---Replies to one companion invocation. Tokens are the companion's; we only echo them back.
---@param token any
---@param result any
local function reply(token, result)
    TriggerEvent('sd-phone:client:companion:reply', token, result)
end

---Runs one of our recorded NUI handlers on a companion's behalf and echoes its response back.
---The handler runs in this event's coroutine, so the `lib.callback.await` inside a proxied
---callback yields exactly as it does for our own frame.
---@param token any opaque request id, echoed to the reply
---@param action string NUI action name
---@param payload any handler payload
AddEventHandler('sd-phone:client:companion:invoke', function(token, action, payload)
    if type(action) ~= 'string' or action == '' then
        return reply(token, { success = false, message = 'Bad request' })
    end
    if denied(action) then
        return reply(token, { success = false, message = 'Not available on this device', unsupported = true })
    end

    local handler = handlers[action]
    if not handler then
        return reply(token, { success = false, message = ('Unknown action: %s'):format(action), unsupported = true })
    end

    -- A handler that answers twice (or throws after answering) must not desync the companion's
    -- pending map, so only the first response is forwarded.
    local answered = false
    local ok, err = pcall(handler, payload, function(result)
        if answered then return end
        answered = true
        reply(token, result)
    end)
    if not ok and not answered then
        answered = true
        print(('^1[sd-phone:companion]^0 %s failed: %s'):format(action, err))
        reply(token, { success = false, message = 'Handler error' })
    end
end)

-------------------------------------------------------------------- exports

---exports['sd-phone']:setCompanionMirror(enabled) - start or stop re-emitting NUI pushes.
exports('setCompanionMirror', function(enabled)
    hook.mirroring = enabled == true
end)

---exports['sd-phone']:setCompanionOpen(open) - a companion device took or released the screen.
exports('setCompanionOpen', function(open)
    hook.companionOpen = open == true
    TriggerEvent('sd-phone:client:companionState', hook.companionOpen)
end)

---exports['sd-phone']:isCompanionOpen()
exports('isCompanionOpen', function() return hook.companionOpen end)

-- A companion that stops mid-session must not leave the mirror or the focus guard armed.
AddEventHandler('onResourceStop', function(resource)
    if resource == GetCurrentResourceName() then return end
    if hook.mirroring or hook.companionOpen then
        hook.mirroring     = false
        hook.companionOpen = false
    end
end)

return hook
