---@type fun(nuiAction: string, serverEvent: string, onAccepted?: fun(), transform?: fun(res: table)) NUI->server pass-through registrar (client.nui).
local proxy = require 'client.nui'
---@type fun(res: table) Completes an HTTP upload slot with this client's server address (client.uploadurl).
local uploadUrl = require 'client.uploadurl'

-- Thin delegates into server/voicememos.
proxy('sd-phone:voice:list',   'sd-phone:server:voice:list')
proxy('sd-phone:voice:rename', 'sd-phone:server:voice:rename')
proxy('sd-phone:voice:delete', 'sd-phone:server:voice:delete')
proxy('sd-phone:voice:share',  'sd-phone:server:voice:share')

---Uploads the base64 recording via a fire-and-forget server event and returns immediately.
---The outcome arrives on the voice:added / voice:uploadFailed pushes below.
---@param payload table { audio: string, ... } base64 recording from the NUI
RegisterNUICallback('sd-phone:voice:upload', function(payload, cb)
    TriggerServerEvent('sd-phone:server:voice:upload', payload)
    cb('ok')
end)

---Server push: a memo was saved for us (our own upload finished, or a nearby player shared
---one). Relays it to the list.
---@param memo table memo record from server/voicememos
RegisterNetEvent('sd-phone:client:voice:added', function(memo)
    SendNUIMessage({ action = 'sd-phone:voice:added', data = memo })
end)

---Server push: our upload was rejected (bad payload, too long, or the upstream upload
---failed); relays the reason to the app.
---@param message string human-readable failure reason from server/voicememos/init.lua
RegisterNetEvent('sd-phone:client:voice:uploadFailed', function(message, messageKey)
    SendNUIMessage({ action = 'sd-phone:voice:uploadFailed', data = { message = message, messageKey = messageKey } })
end)

-- Direct upload. The event path above hands the whole recording to the server in one ordinary
-- event, which blocks the net thread for everyone while it arrives; these two let the phone put
-- it on the CDN itself over HTTPS instead. The server mints the slot and checks what comes back,
-- and the event path stays as the fallback for whenever that cannot run.
proxy('sd-phone:voice:uploadSlot', 'sd-phone:server:voice:uploadSlot')
proxy('sd-phone:voice:uploadDone', 'sd-phone:server:voice:uploadDone')

-- HTTP upload: the recording goes to the server over its HTTP port instead of a game network event.
proxy('sd-phone:voice:httpSlot', 'sd-phone:server:voice:httpSlot', nil, uploadUrl)
