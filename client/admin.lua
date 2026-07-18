---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxyCallback = require 'client.nui'

---@type boolean True while the admin panel NUI is on screen.
local adminOpen = false
---@type boolean Mirror of the phone's open state (sd-phone:client:openState).
local phoneOpen = false

AddEventHandler('sd-phone:client:openState', function(open)
    phoneOpen = open and true or false
    -- The phone releases NUI focus when it closes; re-assert it while the panel is still up.
    if not phoneOpen and adminOpen then SetNuiFocus(true, true) end
end)

---Opens the panel. Fired by the server-side /phoneadmin command (server/admin/init.lua), which
---is the permission gate - this event never opens anything the callbacks wouldn't refuse.
---@param adminName string acting admin's display name for the panel header
RegisterNetEvent('sd-phone:client:admin:open', function(adminName)
    if adminOpen then return end
    adminOpen = true
    SetNuiFocus(true, true)
    SendNUIMessage({ action = 'sd-phone:admin:open', data = { adminName = adminName } })
end)

---React to Lua: the panel requests to close (X button / Escape).
---@param _ table|nil unused payload
---@param cb fun(result: table) NUI response
RegisterNUICallback('sd-phone:admin:close', function(_, cb)
    adminOpen = false
    if not phoneOpen then SetNuiFocus(false, false) end
    cb({ ok = true })
end)

-- Thin delegates into server/admin: every callback re-checks the admin ace server-side.
proxyCallback('sd-phone:admin:search',               'sd-phone:server:admin:search')
proxyCallback('sd-phone:admin:overview',             'sd-phone:server:admin:overview')
proxyCallback('sd-phone:admin:setNumber',            'sd-phone:server:admin:setNumber')
proxyCallback('sd-phone:admin:resetPasscode',        'sd-phone:server:admin:resetPasscode')
proxyCallback('sd-phone:admin:setApp',               'sd-phone:server:admin:setApp')
proxyCallback('sd-phone:admin:resetAccountPassword', 'sd-phone:server:admin:resetAccountPassword')
proxyCallback('sd-phone:admin:forceLogout',          'sd-phone:server:admin:forceLogout')
proxyCallback('sd-phone:admin:birdyPosts',           'sd-phone:server:admin:birdyPosts')
proxyCallback('sd-phone:admin:birdyDeletePost',      'sd-phone:server:admin:birdyDeletePost')
proxyCallback('sd-phone:admin:birdySetVerified',     'sd-phone:server:admin:birdySetVerified')
proxyCallback('sd-phone:admin:messages',             'sd-phone:server:admin:messages')
proxyCallback('sd-phone:admin:calls',                'sd-phone:server:admin:calls')
proxyCallback('sd-phone:admin:mute',                 'sd-phone:server:admin:mute')
proxyCallback('sd-phone:admin:unmute',               'sd-phone:server:admin:unmute')
proxyCallback('sd-phone:admin:mutes',                'sd-phone:server:admin:mutes')
proxyCallback('sd-phone:admin:wipePhone',            'sd-phone:server:admin:wipePhone')
proxyCallback('sd-phone:admin:audit',                'sd-phone:server:admin:audit')
proxyCallback('sd-phone:admin:stats',                'sd-phone:server:admin:stats')
