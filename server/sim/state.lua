-- Leaf module (no requires) so any store can ask "is SIM mode live?" without dependency cycles.
-- `active` is flipped on by server/sim/init.lua only when config.Sim.Enabled is true AND the
-- running inventory backend supports the feature; every other module must treat false as
-- "behave exactly as stock sd-phone".
return {
    ---@type boolean True while unique-phones/SIM indirection is fully enabled this session.
    active = false,
    ---@type 'container'|'metadata'|nil How SIMs attach to phones; nil while inactive.
    mode = nil,
    ---@type boolean True in DEVICE-identity mode (config.Sim.DeviceIdentity): the phone item
    ---owns the data and a SIM only lends a number. False = LEGACY, where the SIM is the identity.
    ---Only meaningful while `active`.
    device = false,
}
