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
    ---@type boolean True in built-in-numbers mode (config.Sim.BuiltInNumbers): unique phones
    ---WITHOUT SIM items - every phone mints its own permanent number on first use ("eSIM").
    ---SIM install/eject does not exist. Only meaningful while `active`.
    builtin = false,
    ---@type boolean True in CHARACTER-data mode (config.Sim.DataOwner = 'character'): the stock
    ---data model - every phone opens the holder's own character profile - with SIMs only
    ---changing the NUMBER. Mutually exclusive with `device`. Only meaningful while `active`.
    character = false,
}
