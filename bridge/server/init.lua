-- Loaded for side effects: eager-loads every server bridge module.
require 'bridge.server.player'
require 'bridge.server.notify'
require 'bridge.server.inventory'
require 'bridge.server.money'
require 'bridge.server.job'
require 'bridge.server.gang'
require 'bridge.server.version'

---@type table Framework detection (bridge.shared.framework): name ('qb'|'esx') + live core handle.
local framework   = require 'bridge.shared.framework'
---@type table Inventory resource detection (bridge.shared.inventory_id): first started candidate.
local inventoryId = require 'bridge.shared.inventory_id'

print(('^2[SD-PHONE]^0 Bridge initialised — Framework: ^3%s^0, Inventory: ^3%s^0'):format(
    framework.name, inventoryId.name or 'framework-default'))
