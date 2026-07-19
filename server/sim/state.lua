-- Leaf module (no requires) so any store can ask "is SIM mode live?" without dependency cycles.
-- `active` is flipped on by server/sim/init.lua only when config.Sim.Enabled is true AND the
-- running inventory backend supports the feature; every other module must treat false as
-- "behave exactly as stock sd-phone".
return {
    ---@type boolean True while unique-phones/SIM indirection is fully enabled this session.
    active = false,
    ---@type 'container'|'metadata'|nil How SIMs attach to phones; nil while inactive.
    mode = nil,
}
