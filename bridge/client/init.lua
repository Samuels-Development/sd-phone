-- Loaded for side effects: notify registers the 'sd-phone:client:notify' net-event handler;
-- target and inventory resolve their backends at require time. Housing, vehiclekeys, and
-- weather are required by the client modules that use them.
require 'bridge.client.notify'
require 'bridge.client.target'
require 'bridge.client.inventory'
