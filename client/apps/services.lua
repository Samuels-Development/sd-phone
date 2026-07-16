---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxy = require 'client.nui'

-- Thin delegates: directory, duty + contact toggles, company account, and roster management all
-- proxy straight into server callbacks.
proxy('sd-phone:services:directory',   'sd-phone:server:services:directory')
proxy('sd-phone:services:setDuty',        'sd-phone:server:services:setDuty')
proxy('sd-phone:services:setJobCalls',    'sd-phone:server:services:setJobCalls')
proxy('sd-phone:services:setJobMessages', 'sd-phone:server:services:setJobMessages')
proxy('sd-phone:services:deposit',     'sd-phone:server:services:deposit')
proxy('sd-phone:services:withdraw',    'sd-phone:server:services:withdraw')
proxy('sd-phone:services:hire',        'sd-phone:server:services:hire')
proxy('sd-phone:services:fire',        'sd-phone:server:services:fire')
proxy('sd-phone:services:promote',     'sd-phone:server:services:promote')
proxy('sd-phone:services:demote',      'sd-phone:server:services:demote')
proxy('sd-phone:services:quit',        'sd-phone:server:services:quit')

-- Thin delegates: company calls and the company message inbox.
proxy('sd-phone:services:callCompany',    'sd-phone:server:services:callCompany')
proxy('sd-phone:services:inbox',          'sd-phone:server:services:inbox')
proxy('sd-phone:services:markRead',       'sd-phone:server:services:markRead')
proxy('sd-phone:services:messageCompany', 'sd-phone:server:services:messageCompany')
proxy('sd-phone:services:replyCompany',   'sd-phone:server:services:replyCompany')

-- Thin delegates for the Jobs tab (multi-job): list saved jobs + offers, switch active job,
-- accept/decline an offer.
proxy('sd-phone:services:listJobs',       'sd-phone:server:services:listJobs')
proxy('sd-phone:services:switchJob',      'sd-phone:server:services:switchJob')
proxy('sd-phone:services:removeJob',      'sd-phone:server:services:removeJob')
proxy('sd-phone:services:acceptInvite',   'sd-phone:server:services:acceptInvite')
proxy('sd-phone:services:declineInvite',  'sd-phone:server:services:declineInvite')

---Server nudge: re-pull the jobs/offers list. No payload.
RegisterNetEvent('sd-phone:client:services:jobsChanged', function()
    SendNUIMessage({ action = 'sd-phone:services:jobsChanged' })
end)

---Server nudge: a boss should re-pull the employee roster (someone joined/left/ranked).
RegisterNetEvent('sd-phone:client:services:rosterChanged', function()
    SendNUIMessage({ action = 'sd-phone:services:rosterChanged' })
end)

---Server nudge: re-pull the company inbox (new company message / staff reply).
RegisterNetEvent('sd-phone:client:services:inbox', function()
    SendNUIMessage({ action = 'sd-phone:services:inbox' })
end)

---Drops a GPS waypoint on the company's coords; nil-guarded.
---@param payload table { coords: { x: number, y: number } }
RegisterNUICallback('sd-phone:services:locate', function(payload, cb)
    local c = payload and payload.coords
    if c and c.x and c.y then
        SetNewWaypoint(c.x + 0.0, c.y + 0.0)
        cb({ success = true })
    else
        cb({ success = false, message = 'No location set' })
    end
end)

---Relays server-pushed duty changes into the app.
---@param data table duty-change payload from the server
RegisterNetEvent('sd-phone:client:services:dutyChanged', function(data)
    SendNUIMessage({ action = 'sd-phone:services:dutyChanged', data = data })
end)
