-- Loaded for side effects: notify registers the 'sd-phone:client:toast' net-event handler;
-- target and inventory resolve their backends at require time. Housing, vehiclekeys, and
-- weather are required by the client modules that use them.
require 'bridge.client.notify'
require 'bridge.client.target'
require 'bridge.client.inventory'
-- Relays the one supported dispatch system that announces its alerts to clients rather than through
-- a server event; the server half discards what it cannot use.
require 'bridge.client.dispatch'
