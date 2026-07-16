---@type table sd-phone config root (configs/config.lua): Voice section drives transmit gating.
local config = require 'configs.config'

---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'

-- Thin delegates for the WebRTC voice plumbing: ICE config and nearby-player lookups.
proxyCallback('sd-phone:voice:ice',    'sd-phone:server:voice:ice')
proxyCallback('sd-phone:voice:nearby', 'sd-phone:server:voice:nearby')

---NUI to server: forwards one signaling message (offer/answer/ICE) to a specific player via the
---server broker. Fire-and-forget.
---@param payload table { to: integer, sid: any, kind: string, data: any }
RegisterNUICallback('sd-phone:voice:signal', function(payload, cb)
    if payload and payload.to then
        TriggerServerEvent('sd-phone:server:voice:signal', {
            to   = payload.to,
            sid  = payload.sid,
            kind = payload.kind,
            data = payload.data,
        })
    end
    cb({ ok = true })
end)

---Server to NUI: a signaling message arrived from another player; relay it unchanged.
---@param payload table brokered signaling message
RegisterNetEvent('sd-phone:client:voice:signal', function(payload)
    SendNUIMessage({ action = 'sd-phone:voice:signalIn', data = payload })
end)

-- Transmit gating: while a nearby player records us, our voice only streams while we're
-- transmitting in-game. Disabled via configs/voice.lua TransmitGated = false.
---@type boolean Whether outgoing voice is gated on the in-game transmit state.
local GATED = not (config.Voice and config.Voice.TransmitGated == false)
---@type boolean Whether the transmit-watch loop should keep running (mic shared to a recorder).
local talkLoopActive = false
---@type integer Generation stamp for the transmit-watch loop; bumped on every start.
local talkLoopGen = 0

---Returns whether the local player is transmitting voice in-game; fails open (treated as
---talking) when the Mumble native is unavailable.
---@return boolean transmitting
local function isTransmitting()
    local ok, talking = pcall(MumbleIsPlayerTalking, PlayerId())
    if not ok then return true end
    return talking == true or talking == 1
end

---Mic-share start/stop from the NUI. Ungated, start reports talking = true for the whole share;
---gated, a watch loop polls the talking state every 75ms with a 250ms hangover.
---@param data table { on: boolean }
RegisterNUICallback('sd-phone:voice:micActive', function(data, cb)
    local on = data and data.on and true or false
    if on then
        if not GATED then
            SendNUIMessage({ action = 'sd-phone:voice:talkingState', data = { on = true } })
        elseif not talkLoopActive then
            talkLoopActive = true
            talkLoopGen = talkLoopGen + 1
            local gen = talkLoopGen
            CreateThread(function()
                local emitted, lastTrue = nil, 0
                while talkLoopActive and gen == talkLoopGen do
                    if isTransmitting() then lastTrue = GetGameTimer() end
                    local talking = (GetGameTimer() - lastTrue) <= 250
                    if talking ~= emitted then
                        emitted = talking
                        SendNUIMessage({ action = 'sd-phone:voice:talkingState', data = { on = talking } })
                    end
                    Wait(75)
                end
            end)
        end
    else
        talkLoopActive = false
        SendNUIMessage({ action = 'sd-phone:voice:talkingState', data = { on = false } })
    end
    cb({ ok = true })
end)
