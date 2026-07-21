---@type table sd-phone config root (configs/config.lua).
local config   = require 'configs.config'
---@type table SIM feature flags (server.sim.state): active + mode, flipped on here.
local state    = require 'server.sim.state'

-- Feature disabled: leave every flag off and register nothing - stock sd-phone behaviour.
if not config.Sim or not config.Sim.Enabled then return {} end

---@type table SIM registry persistence (server.sim.store).
local simStore = require 'server.sim.store'
---@type table Slot-level inventory access for SIMs (server.sim.inv).
local siminv   = require 'server.sim.inv'
---@type table SIM session resolution (server.sim.session): source -> acting identity.
local session  = require 'server.sim.session'
---@type table Cloud-backup restore engine (server.sim.backup).
local backup   = require 'server.sim.backup'
---@type table Player bridge (bridge.server.player): the getIdentifier funnel wrapped below.
local player   = require 'bridge.server.player'
---@type table Inventory bridge (bridge.server.inventory): usable-item registration + canCarry.
local inv      = require 'bridge.server.inventory'
---@type table Shared server helpers (server.util): ok/fail envelopes + number formatting.
local util     = require 'server.util'

-- The one seam every app module resolves identity through: once active, "who is calling" is
-- the identity of the SIM in their phone. No SIM -> nil -> every callback fails closed (no
-- service). Until the boot thread below flips state.active (backend confirmed), the wrapper
-- passes straight through so a slow-starting inventory never bricks the phone.
-- getRealIdentifier keeps the unwrapped resolver for character-scoped concerns (SIM ownership,
-- cloud backups).
session.setRealResolver(player.getRealIdentifier)
function player.getIdentifier(source)
    if not state.active then return player.getRealIdentifier(source) end
    return session.identity(source)
end

-- Reachability: a player is "online as" EVERY identity whose SIM they carry, not just the
-- active phone's - calls and messages addressed to any of their numbers reach them. (The
-- acting identity above stays the single active phone.)
local baseGetSource = player.getSourceByIdentifier
function player.getSourceByIdentifier(citizenid)
    if not state.active then return baseGetSource(citizenid) end
    if not citizenid or citizenid == '' then return nil end
    for _, src in ipairs(GetPlayers()) do
        local s = tonumber(src)
        if s and session.hasIdentity(s, citizenid) then return s end
    end
    return nil
end

local baseCidMap = player.onlineCidMap
function player.onlineCidMap()
    if not state.active then return baseCidMap() end
    local out = {}
    for _, src in ipairs(GetPlayers()) do
        local s = tonumber(src)
        if s then
            for identity in pairs(session.identities(s)) do out[identity] = s end
        end
    end
    return out
end

---ox_inventory only: watch SIM/phone item moves so a pulled SIM cuts service within a swap, not
---a cache TTL. Any matching move flushes the whole session cache (rare event, cheap rescan) and
---pushes fresh state to the player who moved it.
local function registerHooks()
    local watched = { [config.Sim.SimItem] = true }
    for item in pairs(siminv.phoneColors) do watched[item] = true end
    pcall(function()
        exports.ox_inventory:registerHook('swapItems', function(payload)
            if not watched[payload.fromSlot and payload.fromSlot.name or ''] then return end
            SetTimeout(0, function()
                session.invalidate(nil)
                local src = tonumber(payload.source)
                if src then session.push(src) end
            end)
        end, {})
    end)
end

-- Boot: wait for the backend (ox may start after sd-phone - prefer it for up to 10s before
-- settling on a fallback), then create the schema and activate.
CreateThread(function()
    for _ = 1, 100 do
        if siminv.isOx() then break end
        Wait(100)
    end
    if not siminv.supported() then
        print('^1[sd-phone:sim]^0 Sim.Enabled is on but the running inventory has no per-slot '
            .. 'metadata support (see the bridge slot API in bridge/server/inventory.lua). '
            .. 'Unique phones stay OFF.')
        return
    end

    local ok, err = pcall(simStore.ensureSchema)
    if not ok then
        print(('^1[sd-phone:sim]^0 schema bootstrap failed: %s'):format(err))
        return
    end

    state.mode   = (config.Sim.UseContainers and siminv.isOx()) and 'container' or 'metadata'
    state.device = config.Sim.DeviceIdentity ~= false
    state.active = true
    if state.mode == 'container' then siminv.registerContainers() end
    if siminv.isOx() then registerHooks() end
    print(('^2[sd-phone:sim]^0 unique phones active (%s mode, %s identity, %s backend)')
        :format(state.mode, state.device and 'device' or 'sim', siminv.backendName()))
end)

---Extracts the used item's slot + SIM number for both usable-item callback shapes (ox passes a
---slot argument and metadata lives on the slot; qb passes an item table with .slot/.info).
---@param source number player server id
---@param itemArg any second usable-callback argument
---@param slotArg any fourth usable-callback argument
---@return number|nil slot, string|nil number
local function usedSim(source, itemArg, slotArg)
    local slot, number
    if type(itemArg) == 'table' then
        slot = tonumber(itemArg.slot)
        local md = itemArg.metadata or itemArg.info
        if type(md) == 'table' then number = md.number end
    end
    slot = slot or tonumber(slotArg)
    if slot and not number then
        local row = inv.getSlot(source, slot)
        if row then number = row.metadata.number end
    end
    local digits = util.digits(number)
    return slot, digits ~= '' and digits or nil
end

---Sends a simple ox_lib toast to a player.
---@param source number player server id
---@param description string toast text
---@param kind string 'success' | 'error' | 'inform'
local function toast(source, description, kind)
    TriggerClientEvent('ox_lib:notify', source, { title = 'Phone', description = description, type = kind })
end

-- Using a sim_card: metadata mode installs it into the first phone without service (consuming
-- the item); container mode reads the number back (installation is dragging it into the tray).
-- A blank card (spawned raw by any shop or script) self-activates with a fresh minted number.
inv.registerUsable(config.Sim.SimItem, function(source, itemArg, _invArg, slotArg)
    local slot, number = usedSim(source, itemArg, slotArg)
    local blank = number == nil
    if blank and (config.Sim.ActivateBlankSims == false or not slot) then
        toast(source, 'This SIM card is blank.', 'error')
        return
    end

    if state.mode == 'container' then
        if blank then
            -- Swap the blank item for one stamped with the freshly registered number.
            number = simStore.create({})
            if not number or not siminv.takeSimItem(source, slot) or not siminv.giveSimItem(source, number) then
                toast(source, 'Could not activate the SIM card.', 'error')
                return
            end
            toast(source, ('SIM activated - your number is %s. Right-click a phone to open its SIM tray.')
                :format(util.formatNumber(number)), 'success')
            return
        end
        toast(source, ('SIM number: %s. Right-click a phone to open its SIM tray.')
            :format(util.formatNumber(number)), 'inform')
        return
    end

    local phones = siminv.findPhones(source)
    if #phones == 0 then
        toast(source, 'You need a phone to install a SIM card.', 'error')
        return
    end
    local target
    for _, phone in ipairs(phones) do
        if not siminv.getSimNumber(source, phone) then
            target = phone
            break
        end
    end
    if not target then
        toast(source, 'Every phone you carry already has a SIM installed.', 'error')
        return
    end

    -- Minted only after the phone checks above, so a failed use never orphans a number.
    if blank then
        number = simStore.create({})
        if not number then
            toast(source, 'Could not activate the SIM card.', 'error')
            return
        end
    end

    if not siminv.takeSimItem(source, slot) then
        toast(source, 'Could not take the SIM card.', 'error')
        return
    end
    if not siminv.setPhoneSim(source, target.slot, number) then
        -- The refund keeps the minted number: an activated SIM stays activated.
        siminv.giveSimItem(source, number)
        toast(source, 'Could not install the SIM card.', 'error')
        return
    end

    session.push(source)
    toast(source, (blank and 'SIM activated and installed - your number is %s.'
        or 'SIM installed - your number is %s.'):format(util.formatNumber(number)), 'success')
end)

---The player's SIM panel snapshot for Settings -> SIM & Backup. Drops the session cache first
---so the panel always reflects the live inventory. Read-only.
lib.callback.register('sd-phone:server:sim:get', function(source)
    local realCid = player.getRealIdentifier(source)
    if not realCid then return util.fail('Player not found') end
    session.invalidate(source)
    local s = session.resolve(source)
    local b = simStore.getBackup(realCid)
    local sims = {}
    if s then
        for _, entry in ipairs(s.sims) do
            -- Device mode carries SIM-less phones too; the SIM list only shows numbered ones.
            if entry.number then
                sims[#sims + 1] = {
                    number = entry.number,
                    color  = entry.color,
                    active = s.active ~= nil and entry.slot == s.active.slot,
                }
            end
        end
    end
    return util.ok({
        mode          = state.mode,
        device        = state.device,
        hasSim        = s ~= nil and s.hasSim or false,
        number        = s and s.number or nil,
        color         = s and s.color or nil,
        sims          = sims,
        ejectable     = state.mode == 'metadata' and config.Sim.AllowEject ~= false
                        and s ~= nil and s.hasSim or false,
        backupOn      = config.Sim.Backup and config.Sim.Backup.Enabled ~= false or false,
        backupEnabled = b ~= nil and b.enabled or false,
        -- Device mode restores onto the DEVICE identity (no SIM required); legacy needs the SIM.
        canRestore    = b ~= nil and b.enabled and s ~= nil and s.identity ~= nil
                        and s.identity ~= b.identity
                        and (state.device or s.hasSim) or false,
    })
end)

---Ejects the installed SIM (metadata mode): clears the phone item's number and hands the
---sim_card item back with its number intact. The phone loses service immediately.
lib.callback.register('sd-phone:server:sim:eject', function(source)
    if state.mode ~= 'metadata' or config.Sim.AllowEject == false then
        return util.fail('Take the SIM out of the phone\'s SIM tray instead.')
    end
    local s = session.resolve(source)
    if not s or not s.hasSim or not s.number or not s.slot then
        return util.fail('No SIM card is installed.')
    end
    if not inv.canCarry(source, config.Sim.SimItem, 1) then
        return util.fail('You have no room for the SIM card.')
    end
    if not siminv.setPhoneSim(source, s.slot, nil) then
        return util.fail('Could not eject the SIM card.')
    end
    siminv.giveSimItem(source, s.number)
    session.push(source)
    return util.ok()
end)

---Toggles the caller's cloud backup. Enabling requires a backup password: it protects the
---restore, and a copy is saved into the phone's Passwords app so the player can look it up.
---Backups only ever copy data the caller can already read, never grant new access.
lib.callback.register('sd-phone:server:sim:backup:set', function(source, payload)
    if not (config.Sim.Backup and config.Sim.Backup.Enabled ~= false) then
        return util.fail('Cloud backup is disabled.')
    end
    local realCid = player.getRealIdentifier(source)
    if not realCid then return util.fail('Player not found') end
    payload = type(payload) == 'table' and payload or {}

    if payload.on == true then
        local s = session.resolve(source)
        if not s or not s.identity then return util.fail('Install a SIM card first.') end
        local password = type(payload.password) == 'string' and payload.password or ''
        if #password < 4 or #password > 32 then
            return util.fail('Backup password must be 4-32 characters.')
        end
        local accounts = require 'server.accounts.store'
        simStore.setBackup(realCid, s.identity, true, accounts.hashPassword(password))
        accounts.saveVaultEntry(s.identity, 'cloud', 'Cloud Backup', password, nil, s.number)
    else
        local b = simStore.getBackup(realCid)
        if b then simStore.setBackup(realCid, b.identity, false) end
    end
    return util.ok()
end)

---Restores the caller's cloud backup onto the current SIM profile: the old phone's settings,
---contacts, messages, photos and app data are copied over - the phone NUMBER never is (it lives
---on the old SIM; a lost number is lost). Requires the backup password when one is set.
lib.callback.register('sd-phone:server:sim:backup:restore', function(source, payload)
    if not (config.Sim.Backup and config.Sim.Backup.Enabled ~= false) then
        return util.fail('Cloud backup is disabled.')
    end
    local realCid = player.getRealIdentifier(source)
    if not realCid then return util.fail('Player not found') end
    local b = simStore.getBackup(realCid)
    if not b or not b.enabled then return util.fail('No cloud backup found for this character.') end
    local s = session.resolve(source)
    -- Device mode restores onto the phone's own identity, no SIM/number required; legacy needs
    -- the installed SIM (its identity + number ARE the phone).
    if not s or not s.identity then return util.fail('Install a SIM card first.') end
    if not state.device and not s.number then return util.fail('Install a SIM card first.') end
    if s.identity == b.identity then return util.fail('This phone already holds the backed-up data.') end

    if b.password then
        payload = type(payload) == 'table' and payload or {}
        local given = type(payload.password) == 'string' and payload.password or ''
        local accounts = require 'server.accounts.store'
        if accounts.hashPassword(given) ~= b.password then
            return util.fail('Wrong backup password.')
        end
    end

    local rows = backup.restore(b.identity, s.identity, s.number or '')
    simStore.setBackup(realCid, s.identity, true, nil)
    print(('^3[sd-phone:sim]^0 restored backup %s -> %s for %s (%d rows)')
        :format(b.identity, s.identity, realCid, rows))
    return util.ok({ rows = rows })
end)

---Server export: create a sim_card and put it in a player's inventory. `opts.citizenid` makes a
---character-bound SIM (their existing data/number carry over); otherwise the SIM is blank with
---a fresh number. `opts.number` requests a specific number (fails if taken).
---@param source number player server id
---@param opts? { number?: string, citizenid?: string }
---@return string|nil number bare-digit number on success, nil on failure
exports('giveSimCard', function(source, opts)
    if type(source) ~= 'number' or not GetPlayerName(source) then return nil end
    opts = type(opts) == 'table' and opts or {}
    local number = simStore.create({ number = opts.number, bindCid = opts.citizenid })
    if not number then return nil end
    if not siminv.giveSimItem(source, number) then return nil end
    return number
end)

---Server export: the SIM number installed in a player's active phone, nil without one.
---@param source number player server id
---@return string|nil number bare-digit SIM number
exports('getSimNumber', function(source)
    if type(source) ~= 'number' then return nil end
    local s = session.resolve(source)
    return s and s.number or nil
end)

---Server export: true when the player's active phone has a SIM installed.
---@param source number player server id
---@return boolean
exports('hasSim', function(source)
    if type(source) ~= 'number' then return false end
    local s = session.resolve(source)
    return s ~= nil and s.hasSim or false
end)

---Server export: true while unique phones / SIM mode is live (config on + backend supported).
---@return boolean
exports('isSimModeActive', function()
    return state.active
end)

---Server export: true when a phone number is free to assign to a SIM (not on any SIM and not
---held by a legacy character assignment).
---@param number string phone number in any formatting
---@return boolean
exports('isNumberAvailable', function(number)
    return simStore.numberAvailable(number)
end)

---Server export: assign a specific number to the SIM in a player's ACTIVE phone, keeping its
---identity/data. This is the hook for server-owned "buy a custom number" implementations.
---Returns false with 'invalid' | 'no_sim' | 'taken' on failure.
---@param source number player server id
---@param number string requested phone number (digits kept)
---@return boolean ok
---@return string|nil err
exports('setSimNumber', function(source, number)
    if not state.active then return false, 'invalid' end
    if type(source) ~= 'number' or not GetPlayerName(source) then return false, 'invalid' end
    local digits = util.digits(number)
    if #digits < 3 or #digits > 15 then return false, 'invalid' end

    session.invalidate(source)
    local s = session.resolve(source)
    if not s or not s.active then return false, 'no_sim' end

    local ok, err = simStore.renameNumber(s.number, digits)
    if not ok then return false, err end

    local slotRow = inv.getSlot(source, s.slot)
    if slotRow then
        siminv.rewriteSimNumber(source, { slot = s.slot, metadata = slotRow.metadata }, digits)
    end
    session.push(source)
    return true
end)

---/givesim (admin): hand a player a SIM card. `bind` makes it a character-bound SIM carrying
---the target's existing number/data; default is a blank SIM with a fresh number.
lib.addCommand('givesim', {
    help = 'Give a player a SIM card (unique-phones mode).',
    restricted = 'group.admin',
    params = {
        { name = 'target', type = 'playerId', help = 'Player server id' },
        { name = 'bind',   type = 'string',   help = "'bind' = carry over the target's own number/data", optional = true },
    },
}, function(source, args)
    local target = args.target
    local opts = {}
    if args.bind == 'bind' then opts.citizenid = player.getRealIdentifier(target) end
    local number = exports['sd-phone']:giveSimCard(target, opts)
    local reply = number
        and ('Gave SIM %s to player %d.'):format(util.formatNumber(number), target)
        or 'Could not create the SIM card.'
    if source and source > 0 then
        toast(source, reply, number and 'success' or 'error')
    else
        print('[sd-phone:sim] ' .. reply)
    end
end)

return { }
