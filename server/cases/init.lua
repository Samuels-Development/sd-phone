---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'
---@type table Inventory bridge (bridge.server.inventory): makes the case item usable.
local inventory = require 'bridge.server.inventory'
---@type table Cases persistence (server.cases.store): schema bootstrap.
local store = require 'server.cases.store'
---@type table Cases handlers (server.cases.actions): validation, money movement, the item and storage.
local actions = require 'server.cases.actions'

-- Client-facing callbacks: thin delegates into server.cases.actions.
lib.callback.register('sd-phone:server:cases:state',    function(src)          return actions.state(src)           end)
lib.callback.register('sd-phone:server:cases:equipped', function(src)          return actions.equipped(src)        end)
lib.callback.register('sd-phone:server:cases:buy',      function(src, payload) return actions.buy(src, payload)    end)
lib.callback.register('sd-phone:server:cases:takeoff',  function(src, payload) return actions.takeOff(src, payload) end)
lib.callback.register('sd-phone:server:cases:wardrobe', function(src)          return actions.wardrobe(src)        end)
lib.callback.register('sd-phone:server:cases:fit',      function(src, payload) return actions.fitTo(src, payload)  end)
lib.callback.register('sd-phone:server:cases:collect',  function(src)          return actions.collect(src)         end)
lib.callback.register('sd-phone:server:cases:equip',    function(src, payload) return actions.equip(src, payload)  end)
lib.callback.register('sd-phone:server:cases:remove',   function(src, payload) return actions.remove(src, payload) end)
lib.callback.register('sd-phone:server:cases:photo',    function(src, payload) return actions.photo(src, payload)  end)

-- Using the case item puts it on the phone. Backends with no registration path raise, which would
-- take the module down with them, so the registration is contained.
if actions.ITEMS then
    local ok, err = pcall(inventory.registerUsable, actions.ITEM, function(source, itemArg, invArg, slotArg)
        local slot = (type(itemArg) == 'table' and itemArg.slot) or slotArg or (type(invArg) == 'table' and invArg.slot) or nil
        if type(slot) == 'table' then slot = slot.slot end
        actions.useItem(source, slot)
    end)
    if not ok then
        print(('^1[sd-phone]^0 could not make %q usable, so cases cannot be put on from the inventory: %s'):format(actions.ITEM, err))
    end
end

-- Boot: creates the schema and reports it.
CreateThread(function()
    local ok, err = pcall(store.ensureSchema)
    if not ok then
        boot.schemaFailed('cases', err)
        return
    end
    boot.schemaReady()
end)
