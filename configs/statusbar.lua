-- Status bar - cosmetic carrier text + signal/battery indicators. The phone
-- has no real connectivity model yet, so these are static for now.
return {
    Carrier      = 'LifeInvader',
    SignalBars   = 4,        -- 0..4
    ShowWifi     = true,
    BatteryStart = 100,      -- 0..100; superseded by configs/battery.lua StartLevel, still read as its fallback
}
