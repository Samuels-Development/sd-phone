---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'
---@type table SIM mode state (server.sim.state): whether unique phones are live.
local simState = require 'server.sim.state'
---@type table SIM session resolver (server.sim.session): the phones a player carries.
local session = require 'server.sim.session'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

local registerExport, stubExport, warnOnce = shim.registerExport, shim.stubExport, shim.warnOnce

---@type string RoadPhone's own error code for "the SIM Card DLC is switched off", which is exactly
---what an sd-phone install with unique phones disabled looks like from outside.
local DISABLED = 'simcard_disabled'

---giveSimCard(source, options?): issues a SIM to a player. options = { number?, credits?, insert? }.
---
---`credits` and `insert` are ignored: sd-phone SIMs carry no prepaid balance, and a new card lands
---in the inventory for the player to slot in themselves.
registerExport('giveSimCard', function(source, options)
    if not simState.active then return shim.simError(DISABLED) end

    local src = shim.source(source)
    if not src then return shim.simError('invalid_player') end

    options = type(options) == 'table' and options or {}
    if options.credits ~= nil or options.insert ~= nil then
        warnOnce('giveSimCard.options', ('giveSimCard ignores credits and insert (called by %s); sd-phone SIMs carry no prepaid balance and a new card lands in the inventory'):format(GetInvokingResource() or 'unknown'))
    end

    local wanted = shim.digits(options.number)
    if wanted and not sd:isNumberAvailable(wanted) then return shim.simError('number_in_use') end

    local number = sd:giveSimCard(src, wanted and { number = wanted } or nil)
    if not number then return shim.simError('inventory_full') end

    return { ok = true, number = number, simId = number, credits = 0, inserted = false }
end)

---setActiveSimCard(source, simNumber): makes one of the player's carried SIMs the active one, which
---is what changes the number they call and write from.
registerExport('setActiveSimCard', function(source, simNumber)
    if not simState.active then return shim.simError(DISABLED) end

    local src = shim.source(source)
    local wanted = shim.digits(simNumber)
    if not src then return shim.simError('invalid_player') end
    if not wanted then return shim.simError('invalid_number') end

    local carried = session.resolve(src)
    for _, entry in ipairs(carried and carried.sims or {}) do
        if entry.number == wanted then
            session.setActive(src, { slot = entry.slot, number = wanted, color = entry.color })
            CreateThread(function() session.push(src) end)
            return { ok = true }
        end
    end
    return shim.simError('sim_not_found')
end)

---getSimCards(source): every SIM the player carries. sd-phone tracks SIMs by the phone holding
---them rather than as loose inventory rows, so `inventory` is always empty and every carried card
---is reported as inserted.
registerExport('getSimCards', function(source)
    if not simState.active then return { inserted = {}, activeSim = nil, inventory = {} } end

    local src = shim.source(source)
    local carried = src and session.resolve(src) or nil
    if not carried then return { inserted = {}, activeSim = nil, inventory = {} } end

    local inserted, activeSim = {}, nil
    for _, entry in ipairs(carried.sims or {}) do
        if entry.number then
            inserted[#inserted + 1] = {
                sim_id      = entry.number,
                sim_number  = entry.number,
                sim_credits = 0,
                carrier     = nil,
                label       = entry.name,
                is_esim     = simState.builtin,
            }
            if entry.number == carried.number then activeSim = #inserted end
        end
    end
    return { inserted = inserted, activeSim = activeSim, inventory = {} }
end)

---getActiveSimNumber(source): the number the player currently calls and writes from.
registerExport('getActiveSimNumber', function(source)
    local src = shim.source(source)
    if not src then return nil end
    if simState.active then return sd:getSimNumber(src) end
    return sd:getPhoneNumber(src)
end)

---isSimNumberInUse(simNumber): whether a number is already claimed by a SIM or by a character
---assignment. Covers offline owners and cards nobody is carrying.
registerExport('isSimNumberInUse', function(simNumber)
    local digits = shim.digits(simNumber)
    if not digits then return false end
    return not sd:isNumberAvailable(digits)
end)

-- Card handling: sd-phone's SIM tray is driven from the phone UI by the player holding the card,
-- and a SIM is destroyed by consuming the item rather than by releasing a number. None of those
-- have a server-side entry point another resource may drive, so each reports RoadPhone's own
-- failure shape instead of half-moving a card.
stubExport('removeSimCard', shim.simError('unsupported'),
    'has no sd-phone counterpart: a SIM is destroyed by removing its inventory item, and there is no number-release path to call')
stubExport('insertSimCard', shim.simError('unsupported'),
    'has no sd-phone counterpart: SIMs are slotted from the phone\'s own SIM tray by the player holding the card')
stubExport('ejectSimCard', shim.simError('unsupported'),
    'has no sd-phone counterpart: SIMs are ejected from the phone\'s own SIM tray by the player holding the card')

-- Prepaid credit is not modelled: sd-phone gates calls and texts on cell service rather than on a
-- balance, so there is no ledger to add to, spend from or read.
stubExport('addSimCredits', shim.simError('unsupported'),
    'has no sd-phone counterpart: SIMs carry no prepaid balance, service being gated on cell coverage instead')
stubExport('removeSimCredits', shim.simError('unsupported'),
    'has no sd-phone counterpart: SIMs carry no prepaid balance, service being gated on cell coverage instead')
stubExport('getSimCredits', nil,
    'has no sd-phone counterpart: SIMs carry no prepaid balance to read')
