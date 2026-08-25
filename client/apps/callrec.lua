---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxy = require 'client.nui'

-- Thin delegates into server/callrec.
proxy('sd-phone:callrec:list',    'sd-phone:server:callrec:list')
proxy('sd-phone:callrec:delete',  'sd-phone:server:callrec:delete')
proxy('sd-phone:callrec:enabled', 'sd-phone:server:callrec:enabled')

---Uploads a finished call recording and returns immediately; the outcome arrives on the
---callrec:added / callrec:failed pushes below. The whole file goes in one event because a
---recording has no live viewer waiting on it, unlike the bodycam relay.
---@param payload table { audio: string, duration: number, oneSided: boolean, peerNumber: string, ... }
RegisterNUICallback('sd-phone:callrec:upload', function(payload, cb)
    TriggerServerEvent('sd-phone:server:callrec:upload', payload)
    cb('ok')
end)

---Server push: a recording finished uploading and was saved.
---@param rec table recording record from server/callrec
RegisterNetEvent('sd-phone:client:callrec:added', function(rec)
    SendNUIMessage({ action = 'sd-phone:callrec:added', data = rec })
end)

---Server push: an upload was rejected or the upstream host failed.
---@param message string human-readable failure reason from server/callrec/init.lua
RegisterNetEvent('sd-phone:client:callrec:failed', function(message)
    SendNUIMessage({ action = 'sd-phone:callrec:failed', data = { message = message } })
end)
