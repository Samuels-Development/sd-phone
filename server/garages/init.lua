---@type table Garages bridge (bridge.server.garages): cross-resource garage-system detection +
---DB normalisation into the app's vehicle shape.
local garages = require 'bridge.server.garages'

---Owned-vehicle list for the caller. Read-only; a disabled/undetected system degrades to an
---empty array.
lib.callback.register('sd-phone:server:garages:list', function(src)
    return { success = true, data = garages.list(src) }
end)

---Boot report: prints the garage system the bridge detected.
CreateThread(function()
    Wait(300)
    print(('^2[sd-phone:garages]^0 ready — system: ^3%s^0'):format(garages.activeSystem() or 'none (framework table)'))
end)
