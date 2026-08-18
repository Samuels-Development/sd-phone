-- Loaded for side effects: eager-loads every server bridge module.
require 'bridge.server.player'
require 'bridge.server.notify'
require 'bridge.server.inventory'
require 'bridge.server.money'
require 'bridge.server.job'
require 'bridge.server.gang'
require 'bridge.server.version'
-- Registers a handler per supported dispatch resource, so an alert raised by one of them lands on
-- the MDT call board. Loaded here because the handlers have to exist before any of those resources
-- fires, whether or not a terminal has ever been opened.
require 'bridge.server.dispatch'

-- Detection modules, loaded here so they resolve once at boot rather than on first use.
require 'bridge.shared.framework'
require 'bridge.shared.inventory_id'
