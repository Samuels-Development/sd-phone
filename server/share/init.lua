---@type table AirShare core (server.share.core): open-phone tracking + request handshake + proximity.
local core = require 'server.share.core'

---Tracks a client's phone open/close state; players appear in others' share sheets only while
---their phone is out.
---@param open boolean whether the phone is now open
RegisterNetEvent('sd-phone:server:phone:setOpen', function(open)
    core.setOpen(source, open and true or false)
end)

---Drops a departing player's open flag + pending AirShare requests.
AddEventHandler('playerDropped', function()
    core.clear(source)
end)

---Nearby phone-open players this client may share to right now, measured from live server-side
---coords. Read-only.
lib.callback.register('sd-phone:server:share:nearby', function(src)
    return { success = true, data = { targets = core.nearby(src) } }
end)

---Recipient accepts/declines an AirShare request; core.respond enforces that the responder is
---the request's addressed target.
---@param payload table { id: string, accept: boolean }
lib.callback.register('sd-phone:server:airshare:respond', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    return core.respond(src, payload.id, payload.accept == true)
end)
