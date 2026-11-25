---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

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
---@type table SIM tray (server.sim.tray): per-phone stash, its access hooks and the legacy
---container migration.
local tray     = require 'server.sim.tray'
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
-- active phone's - calls addressed to any of their numbers ring them (a pocketed phone rings).
-- These four read the session index (server.sim.session) rather than resolving every online
-- player per lookup.
local baseGetAnySource = player.getAnySourceByIdentifier
function player.getAnySourceByIdentifier(citizenid)
    if not state.active then return baseGetAnySource(citizenid) end
    if not citizenid or citizenid == '' then return nil end
    return session.sourceCarrying(citizenid)
end

-- Live-UI delivery: every push resolved through this lands only when `citizenid` is the phone
-- the player is currently acting as. A push for the OTHER phone in their pocket is skipped -
-- its data is already stored, and that phone surfaces it (threads, badges) on its next open.
local baseGetSource = player.getSourceByIdentifier
function player.getSourceByIdentifier(citizenid)
    if not state.active then return baseGetSource(citizenid) end
    if not citizenid or citizenid == '' then return nil end
    return session.sourceActingAs(citizenid)
end

-- Batch form of getSourceByIdentifier above, and it must track it: ACTIVE identity only, so a
-- fan-out that indexes this map still skips the other phone in a player's pocket.
local baseActiveCidMap = player.activeCidMap
function player.activeCidMap()
    if not state.active then return baseActiveCidMap() end
    return session.actingMap()
end

local baseCidMap = player.onlineCidMap
function player.onlineCidMap()
    if not state.active then return baseCidMap() end
    return session.carryingMap()
end

---Sends a simple ox_lib toast to a player.
---@param source number player server id
---@param description string toast text
---@param kind string 'success' | 'error' | 'inform'
local function toast(source, description, kind)
    TriggerClientEvent('ox_lib:notify', source, { title = 'Phone', description = description, type = kind })
end

---Item names whose moves change a player's SIM state: the SIM item and every phone item.
---@return table<string, true>
local function watchedItems()
    local watched = { [config.Sim.SimItem] = true }
    for item in pairs(siminv.phoneColors) do watched[item] = true end
    return watched
end

---The players a hook payload's move touched: whoever made it, plus the owner of the inventory on
---either side when that side is a player's (a give, or taking from a searched player). Stash,
---drop, glovebox and tray ids are nobody's, and tray moves are made by the phone's holder.
---@param payload table ox_inventory or one_inventory hook payload
---@return number[] sources
local function movedPlayers(payload)
    local out, seen = {}, {}
    for _, side in ipairs({
        { payload.source },
        { payload.fromInventory, payload.fromType },
        { payload.toInventory, payload.toType },
    }) do
        local src = (side[2] == nil or side[2] == 'player') and tonumber(side[1]) or nil
        if src and src > 0 and not seen[src] then
            seen[src] = true
            out[#out + 1] = src
        end
    end
    return out
end

---Re-reads the SIM state of every player a move touched and pushes it to them on the next tick,
---after the inventory has finished the move. Only those players: every other session is
---unaffected by the move, and flushing them all made each phone drag cost a re-scan per player.
---@param payload table hook payload
local function refreshAfterMove(payload)
    local players = movedPlayers(payload)
    SetTimeout(0, function()
        for _, src in ipairs(players) do
            if GetPlayerName(src) then session.push(src) end
        end
    end)
end

---ox_inventory: watch SIM/phone item moves so a pulled SIM cuts service within a swap, not a
---cache TTL. The item filter keeps ox from calling in for any other item; it matches either side
---of a swap, so a phone displaced by another item is caught too. Tray mode adds two guards: only
---the phone's holder may open its tray, and only a SIM may go in it.
local function registerOxHooks()
    local watched = watchedItems()
    pcall(function()
        exports.ox_inventory:registerHook('swapItems', function(payload)
            local moved = payload.fromSlot and payload.fromSlot.name
            local displaced = type(payload.toSlot) == 'table' and payload.toSlot.name
            if not watched[moved or ''] and not watched[displaced or ''] then return end
            refreshAfterMove(payload)
        end, { itemFilter = watched })
    end)

    if state.mode ~= 'tray' then return end

    -- A tray id ships to the client inside the phone's own metadata, and a stash id alone is
    -- enough to open a stash from anywhere. Containers were gated on holding the item; a stash
    -- is not, so without this anyone who ever held the phone could lift its SIM remotely.
    pcall(function()
        exports.ox_inventory:registerHook('openInventory', function(payload)
            local src = tonumber(payload.source)
            if not src or not tray.holderSlot(src, payload.inventoryId) then return false end
        end, { inventoryFilter = { '^simtray:' } })
    end)

    -- Stashes have no whitelist property, which the container did.
    pcall(function()
        exports.ox_inventory:registerHook('swapItems', function(payload)
            local moved = payload.fromSlot and payload.fromSlot.name
            if moved and moved ~= config.Sim.SimItem then return false end
        end, { inventoryFilter = { '^simtray:' } })
    end)
end

---one_inventory: the same move watch and tray guards as registerOxHooks, with drops and gives
---watched alongside swaps. The tray guards run unfiltered and match the tray reference themselves.
---Tray mode also adds a SIM Tray entry to each phone item's right-click menu.
local function registerOneHooks()
    local watched = watchedItems()
    local function onMove(payload) refreshAfterMove(payload) end
    for _, hook in ipairs({ 'beforeItemSwap', 'beforeItemDrop', 'beforeItemGive' }) do
        pcall(function() exports.one_inventory:RegisterHook(hook, onMove, { itemFilter = watched }) end)
    end

    if state.mode ~= 'tray' then return end

    pcall(function()
        exports.one_inventory:RegisterHook('beforeInventoryOpen', function(payload)
            local data = type(payload.data) == 'table' and payload.data or {}
            local id = tray.fromOneRef(payload.inventoryId) or tray.fromOneRef(data.id)
            if not id then return end
            local src = tonumber(payload.source)
            if not src or not tray.holderSlot(src, id) then return false end
        end, {})
    end)

    pcall(function()
        exports.one_inventory:RegisterHook('beforeItemSwap', function(payload)
            local sim = config.Sim.SimItem
            if tray.fromOneRef(payload.toInventory) and payload.item ~= sim then return false end
            local displaced = type(payload.toItem) == 'table' and payload.toItem.name
            if tray.fromOneRef(payload.fromInventory) and displaced and displaced ~= sim then return false end
        end, {})
    end)

    for item in pairs(siminv.phoneColors) do
        pcall(function()
            exports.one_inventory:RegisterItemButton(item, 'SIM Tray', function(payload)
                local src = tonumber(payload and payload.source)
                if src and not tray.open(src, payload.slot) then
                    toast(src, 'That phone has no SIM tray.', 'error')
                end
            end)
        end)
    end
end

---@type table<string, fun()> Hook registration per slot backend; other inventories get none.
local HOOKS = { ox_inventory = registerOxHooks, one_inventory = registerOneHooks }

-- Boot: wait for the backend (ox_inventory or one_inventory may start after sd-phone - prefer
-- them for up to 10s before settling on a fallback), then create the schema and activate.
CreateThread(function()
    for _ = 1, 100 do
        if tray.supported() then break end
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
        boot.schemaFailed('sim', err)
        return
    end
    if config.Sim.Backup and config.Sim.Backup.Enabled ~= false then
        pcall(backup.ensureIndexes)
    end

    state.builtin = config.Sim.BuiltInNumbers == true
    -- Data owner: 'device' | 'sim' | 'character'. The legacy DeviceIdentity boolean still
    -- resolves for configs written before DataOwner existed. Built-in numbers can't pair with
    -- SIM-owned data (there is no SIM identity), so that combination coerces to device.
    local owner = config.Sim.DataOwner
    if owner ~= 'device' and owner ~= 'sim' and owner ~= 'character' then
        owner = (config.Sim.DeviceIdentity ~= false) and 'device' or 'sim'
    end
    if state.builtin and owner == 'sim' then owner = 'device' end
    state.device    = owner == 'device'
    state.character = owner == 'character'
    -- Attach mode is always metadata without SIM items (nothing to drag into a tray).
    state.mode   = (not state.builtin and tray.configured and tray.supported()) and 'tray' or 'metadata'
    state.active = true
    local registerHooks = HOOKS[siminv.backendName() or '']
    if registerHooks then registerHooks() end
    print(('^2[sd-phone:sim]^0 unique phones active (%s mode, %s identity%s, %s backend)')
        :format(state.mode, owner, state.builtin and ', built-in numbers' or '', siminv.backendName()))
end)

---Extracts the used item's slot + SIM number for every usable-item callback shape: ox passes a
---slot argument, qb passes the item table second, and ESX with one_inventory passes it third.
---@param source number player server id
---@param itemArg any second usable-callback argument
---@param invArg any third usable-callback argument
---@param slotArg any fourth usable-callback argument
---@return number|nil slot, string|nil number
local function usedSim(source, itemArg, invArg, slotArg)
    local used = type(itemArg) == 'table' and itemArg
        or (type(invArg) == 'table' and tonumber(invArg.slot) and invArg)
        or nil
    local slot, number
    if used then
        slot = tonumber(used.slot)
        local md = used.metadata or used.info
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

-- Using a sim_card: metadata mode installs it into the first phone without service (consuming
-- the item); container mode reads the number back (installation is dragging it into the tray).
-- A blank card (spawned raw by any shop or script) self-activates with a fresh minted number.
-- Built-in-numbers mode has no SIM items at all, so the usable item never registers (config
-- gate, not state: registration happens at load, before the boot thread flips the flags).
if config.Sim.BuiltInNumbers ~= true then
inv.registerUsable(config.Sim.SimItem, function(source, itemArg, invArg, slotArg)
    local slot, number = usedSim(source, itemArg, invArg, slotArg)
    local blank = number == nil
    if blank and (config.Sim.ActivateBlankSims == false or not slot) then
        toast(source, 'This SIM card is blank.', 'error')
        return
    end

    if state.mode == 'tray' then
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
end

---The phone item's inventory button: opens that exact phone's SIM tray. Fire-and-forget, because
---the slot is the only input and the server re-derives everything else from it - a hand-crafted
---event can still only open a tray belonging to a phone the sender actually carries.
---@param slot number inventory slot holding the phone
RegisterNetEvent('sd-phone:server:sim:openTray', function(slot)
    local source = source
    if state.mode ~= 'tray' then return end
    if not tray.open(source, slot) then
        toast(source, 'That phone has no SIM tray.', 'error')
    end
end)

---@type table<number, number> Last requestPush per source (GetGameTimer ms); floods are dropped.
local lastRequestPush = {}

---@type table<number, boolean> Per-source snapshot/restore in progress; drops overlapping
---attempts on the manual, automatic and restore paths.
local syncBusy = {}

---Client asks for a fresh SIM snapshot (fired once after character load, so the closed-phone
---frame colour is right before the first open). Cooldown-guarded: push does a full inventory
---rescan, so a flooding client only gets one every 5s.
RegisterNetEvent('sd-phone:server:sim:requestPush', function()
    local source = source
    if not state.active then return end
    -- No character yet (a resource-restart probe firing before the multichar pick): stay
    -- silent and leave the cooldown unarmed, so the real character-load request still lands.
    if not player.getRealIdentifier(source) then return end
    local now = GetGameTimer()
    if lastRequestPush[source] and (now - lastRequestPush[source]) < 5000 then return end
    lastRequestPush[source] = now
    session.push(source)
end)

AddEventHandler('playerDropped', function()
    lastRequestPush[source] = nil
    syncBusy[source] = nil
end)

---The player's SIM panel snapshot for Settings -> SIM & Backup. Drops the session cache first,
---at most once every 5s, so the panel reflects the live inventory. Read-only.
lib.callback.register('sd-phone:server:sim:get', function(source)
    local realCid = player.getRealIdentifier(source)
    if not realCid then return util.fail('sim.playerNotFound', 'Player not found') end
    -- A rescan reads the inventory and writes the registry. Shares the push window so the
    -- panel is never more than one session-cache generation behind either way.
    local now = GetGameTimer()
    if not lastRequestPush[source] or (now - lastRequestPush[source]) >= 5000 then
        lastRequestPush[source] = now
        session.invalidate(source)
    end
    local s = session.resolve(source)
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

    -- Backup profiles: one per phone. A profile restores once its snapshot exists (legacy
    -- pointer rows never do), and never onto the phone that made it outside character mode.
    local myProfile
    local profiles = {}
    local restorable = false
    for _, p in ipairs(simStore.listProfiles(realCid)) do
        local isCloud = lib.string.startsWith(p.identity, 'cloud:')
        local thisPhone = s ~= nil and s.identity == p.deviceIdentity
        local canUse = (state.character or not thisPhone) and isCloud and p.syncedAt ~= nil
        if thisPhone then myProfile = p end
        profiles[#profiles + 1] = {
            device     = p.deviceIdentity,
            color      = p.color,
            number     = p.number,
            syncedAt   = p.syncedAt,
            thisPhone  = thisPhone,
            restorable = canUse,
        }
        if canUse then restorable = true end
    end

    -- Physically installed SIM in the active phone; distinct from hasSim (= has service),
    -- which character mode satisfies with an innate number even without a card.
    local simInstalled = s ~= nil and s.active ~= nil and s.active.number ~= nil
    return util.ok({
        mode          = state.mode,
        device        = state.device or state.character,
        builtin       = state.builtin,
        hasSim        = s ~= nil and s.hasSim or false,
        simInstalled  = simInstalled,
        number        = s and s.number or nil,
        color         = s and s.color or nil,
        sims          = sims,
        ejectable     = state.mode == 'metadata' and config.Sim.AllowEject ~= false
                        and not state.builtin and simInstalled or false,
        backupOn      = config.Sim.Backup and config.Sim.Backup.Enabled ~= false or false,
        -- A password only binds while profiles exist (no profiles = enabling may set a new one).
        hasPassword   = simStore.getBackupPassword(realCid) ~= nil
                        and #profiles > 0 or false,
        backupEnabled = myProfile ~= nil and myProfile.enabled or false,
        autoSync      = myProfile ~= nil and myProfile.autoSync or false,
        syncedAt      = myProfile and myProfile.syncedAt or nil,
        profiles      = profiles,
        maxProfiles   = tonumber(config.Sim.Backup and config.Sim.Backup.MaxProfiles) or 3,
        -- Device/character mode restore onto the acting identity (no SIM required); legacy
        -- needs the installed SIM.
        canRestore    = restorable and s ~= nil and s.identity ~= nil
                        and (state.device or state.character or s.hasSim) or false,
    })
end)

---Ejects the installed SIM (metadata mode): clears the phone item's number and hands the
---sim_card item back with its number intact. The phone loses service immediately.
lib.callback.register('sd-phone:server:sim:eject', function(source)
    if state.builtin then return util.fail('sim.phoneSSimBuilt', 'This phone\'s SIM is built in.') end
    if state.mode ~= 'metadata' or config.Sim.AllowEject == false then
        return util.fail('sim.takeSimOutPhoneS', 'Take the SIM out of the phone\'s SIM tray instead.')
    end
    local s = session.resolve(source)
    -- The ACTIVE ENTRY's number is the physically installed SIM; the session-level number can
    -- be a character-mode innate number that no card carries.
    local simNumber = s and s.active and s.active.number or nil
    if not s or not simNumber or not s.active.slot then
        return util.fail('sim.noSimCardInstalled', 'No SIM card is installed.')
    end
    if not inv.canCarry(source, config.Sim.SimItem, 1) then
        return util.fail('sim.haveNoRoomSimCard', 'You have no room for the SIM card.')
    end
    if not siminv.setPhoneSim(source, s.active.slot, nil) then
        return util.fail('sim.couldNotEjectSimCard', 'Could not eject the SIM card.')
    end
    siminv.giveSimItem(source, simNumber)
    session.push(source)
    return util.ok()
end)

---True when a backup identity is a snapshot namespace (vs a legacy pointer at a phone).
---@param identity string|nil
---@return boolean
local function isCloudIdentity(identity)
    return type(identity) == 'string' and lib.string.startsWith(identity, 'cloud:')
end

---@type integer Auto-sync throttle: the enrolled phone re-snapshots at most this often (seconds).
local AUTO_SYNC_MIN_GAP = 300

---@type integer Manual "Back Up Now" throttle. Shorter than the auto gap so the button stays
---responsive, but enough that the ~88-statement run can't be looped at will.
local MANUAL_SYNC_MIN_GAP = 30

---Milliseconds one character waits between two restores: Backup.RestoreCooldown seconds, 600 when
---a config predates the key. Read per call so a config edit applies on the next restore.
---@return integer
local function restoreGap()
    local secs = tonumber(config.Sim.Backup and config.Sim.Backup.RestoreCooldown) or 600
    return math.max(0, math.floor(secs * 1000))
end

---@type integer Rolling window for backup-password checks (ms), shared by enabling and restoring.
local GUESS_WINDOW = 300000

---@type integer Backup-password checks one character may make inside GUESS_WINDOW.
local GUESS_MAX = 10

---@type integer Minimum gap between two backup-password checks by one character (ms).
local GUESS_GAP = 1000

---True when the character may have their backup password checked now. Called BEFORE the check
---on both paths that take the password, under one shared key, so alternating between enabling
---and restoring buys no extra guesses: one a second, ten per five minutes.
---@param realCid string real (framework) citizenid
---@return boolean
local function mayCheckPassword(realCid)
    return util.cooldown(realCid, 'sim:backupPassword', GUESS_GAP)
        and util.rateLimit(realCid, 'sim:backupPassword', GUESS_WINDOW, GUESS_MAX)
end

---Takes a fresh snapshot of `s.identity` into ITS profile, converting a legacy pointer row to
---a `cloud:` namespace on first use, and stamps the picker labels (colour + number).
---@param realCid string real (framework) citizenid
---@param profile table this phone's profile row (simStore.getProfile shape)
---@param s SimSession resolved session of the syncing phone
---@return number syncedAt
local function runProfileSync(realCid, profile, s)
    local cloudId = profile.identity
    if not isCloudIdentity(cloudId) then
        cloudId = 'cloud:' .. util.newId(16)
        simStore.setProfileIdentity(realCid, profile.deviceIdentity, cloudId)
    end
    backup.sync(s.identity, cloudId)
    local syncedAt = os.time()
    local entry
    for _, e in ipairs(s.sims) do
        if e.identity == s.identity then entry = e break end
    end
    simStore.setProfileSynced(realCid, profile.deviceIdentity, syncedAt,
        entry and entry.color or s.color, entry and entry.number or s.number)
    return syncedAt
end

---Toggles cloud backup FOR THIS PHONE (each phone owns its profile, up to MaxProfiles).
---Enabling requires the character's backup password - set on first use, verified after - and
---takes the first snapshot immediately. A copy of the password lands in the Passwords app.
lib.callback.register('sd-phone:server:sim:backup:set', function(source, payload)
    if not (config.Sim.Backup and config.Sim.Backup.Enabled ~= false) then
        return util.fail('sim.cloudBackupDisabled', 'Cloud backup is disabled.')
    end
    local realCid = player.getRealIdentifier(source)
    if not realCid then return util.fail('sim.playerNotFound', 'Player not found') end
    payload = type(payload) == 'table' and payload or {}
    local s = session.resolve(source)
    if not s or not s.identity then return util.fail('sim.installSimCardFirst', 'Install a SIM card first.') end

    if payload.on == true then
        local password = type(payload.password) == 'string' and payload.password or ''
        if #password < 4 or #password > 32 then
            return util.fail('sim.backupPasswordMust432', 'Backup password must be 4-32 characters.')
        end
        local accounts = require 'server.accounts.store'
        local existing = simStore.getBackupPassword(realCid)
        -- With no profiles left there is nothing the password protects: the entered password
        -- becomes the new one (also the recovery path for a forgotten password).
        if existing and simStore.profileCount(realCid) > 0 then
            if not mayCheckPassword(realCid) then
                return util.fail('sim.tooManyPasswordAttempts', 'Too many password attempts. Try again shortly.')
            end
            if not accounts.verifyPassword(password, existing) then
                return util.fail('sim.wrongBackupPasswordSSaved', 'Wrong backup password. It\'s saved in the Passwords app of your backed-up phone.')
            end
        else
            simStore.setBackupPassword(realCid, accounts.hashPassword(password))
        end

        local profile = simStore.getProfile(realCid, s.identity)
        if not profile then
            local cap = tonumber(config.Sim.Backup.MaxProfiles) or 3
            if simStore.profileCount(realCid) >= cap then
                return util.fail('sim.backUpAtMostPhones', 'You can back up at most {n} phones. Delete a backup first.', { n = cap })
            end
        end
        -- Enabling a phone that is already enrolled and freshly snapshotted changes nothing, so
        -- don't pay the ~60-statement run for it.
        if profile and profile.enabled and (os.time() - (profile.syncedAt or 0)) < MANUAL_SYNC_MIN_GAP then
            return util.ok()
        end
        if syncBusy[source] then return util.fail('sim.backupAlreadyRunning', 'A backup is already running.') end
        -- Armed only here, so a wrong password or a disable still answers immediately: enabling
        -- runs the same ~60-statement snapshot as "Back Up Now", and off/on cycling reaches it.
        if not util.cooldown(realCid, 'sim:backupSet', 5000) then
            return util.fail('sim.backedUpMomentsAgoTry', 'Backed up moments ago. Try again in a few seconds.')
        end

        local cloudId = (profile and isCloudIdentity(profile.identity)) and profile.identity
            or ('cloud:' .. util.newId(16))
        syncBusy[source] = true
        local okRun, err = pcall(function()
            simStore.upsertProfile(realCid, s.identity, cloudId)
            accounts.saveVaultEntry(s.identity, 'cloud', 'Cloud Backup', password, nil, s.number)
            profile = simStore.getProfile(realCid, s.identity)
            if profile then runProfileSync(realCid, profile, s) end
        end)
        syncBusy[source] = nil
        if not okRun then error(err, 0) end
    else
        simStore.setProfileEnabled(realCid, s.identity, false)
    end
    return util.ok()
end)

---Manual "Back Up Now" for the caller's phone (its own profile only).
lib.callback.register('sd-phone:server:sim:backup:sync', function(source)
    if not (config.Sim.Backup and config.Sim.Backup.Enabled ~= false) then
        return util.fail('sim.cloudBackupDisabled', 'Cloud backup is disabled.')
    end
    local realCid = player.getRealIdentifier(source)
    if not realCid then return util.fail('sim.playerNotFound', 'Player not found') end
    local s = session.resolve(source)
    if not s or not s.identity then return util.fail('sim.noPhoneBackUp', 'No phone to back up.') end
    local profile = simStore.getProfile(realCid, s.identity)
    if not profile or not profile.enabled then
        return util.fail('sim.cloudBackupNotEnabledPhone', 'Cloud Backup is not enabled on this phone.')
    end

    if syncBusy[source] then return util.fail('sim.backupAlreadyRunning', 'A backup is already running.') end
    local since = os.time() - (profile.syncedAt or 0)
    if since < MANUAL_SYNC_MIN_GAP then
        return util.fail('sim.backedUpMomentsAgoTryIn', 'Backed up moments ago. Try again in {seconds}s.', { seconds = MANUAL_SYNC_MIN_GAP - since })
    end

    syncBusy[source] = true
    local okRun, syncedAt = pcall(runProfileSync, realCid, profile, s)
    syncBusy[source] = nil
    if not okRun then error(syncedAt, 0) end
    return util.ok({ syncedAt = syncedAt })
end)

---Toggles auto-sync (snapshot on holster, throttled) for the caller's phone.
lib.callback.register('sd-phone:server:sim:backup:setAuto', function(source, payload)
    local realCid = player.getRealIdentifier(source)
    if not realCid then return util.fail('sim.playerNotFound', 'Player not found') end
    local s = session.resolve(source)
    if not s or not s.identity then return util.fail('sim.noPhone', 'No phone.') end
    if not simStore.getProfile(realCid, s.identity) then
        return util.fail('sim.cloudBackupNotEnabledPhone', 'Cloud Backup is not enabled on this phone.')
    end
    payload = type(payload) == 'table' and payload or {}
    simStore.setProfileAuto(realCid, s.identity, payload.on == true)
    return util.ok()
end)

---Deletes one backup profile AND its snapshot data. Any of the character's profiles may be
---deleted from any phone (freeing a slot for a new phone).
lib.callback.register('sd-phone:server:sim:backup:delete', function(source, payload)
    local realCid = player.getRealIdentifier(source)
    if not realCid then return util.fail('sim.playerNotFound', 'Player not found') end
    payload = type(payload) == 'table' and payload or {}
    local device = type(payload.device) == 'string' and payload.device or ''
    local profile = simStore.getProfile(realCid, device)
    if not profile then return util.fail('sim.backupProfileNotFound', 'Backup profile not found.') end
    if isCloudIdentity(profile.identity) then backup.wipe(profile.identity) end
    simStore.deleteProfile(realCid, device)
    return util.ok()
end)

---Auto-sync trigger: holstering the phone is the natural save point. A phone only ever syncs
---ITS OWN profile, so a lost or stolen phone can never overwrite another phone's backup.
---Second listener on the share module's open-state event.
RegisterNetEvent('sd-phone:server:phone:setOpen', function(open)
    local source = source
    if open or not state.active then return end
    if not (config.Sim.Backup and config.Sim.Backup.Enabled ~= false) then return end
    if syncBusy[source] then return end
    syncBusy[source] = true
    CreateThread(function()
        local okRun, err = pcall(function()
            local realCid = player.getRealIdentifier(source)
            if not realCid then return end
            local s = session.resolve(source)
            if not s or not s.identity then return end
            local profile = simStore.getProfile(realCid, s.identity)
            if not profile or not profile.enabled or not profile.autoSync then return end
            if (os.time() - (profile.syncedAt or 0)) < AUTO_SYNC_MIN_GAP then return end
            runProfileSync(realCid, profile, s)
        end)
        if not okRun then print(('^1[sd-phone:sim]^0 auto-sync failed for %s: %s'):format(source, err)) end
        syncBusy[source] = nil
    end)
end)

---Restores a chosen backup profile onto the current phone: settings, contacts, messages,
---photos and app data are copied over - the phone NUMBER never is (it lives on the SIM; a lost
---number is lost), and neither is anything of value (see VALUE in server/sim/backup.lua).
---`payload.device` picks the profile (optional when only one restores). Requires the
---character's backup password. Restoring does NOT touch the snapshot or move any profile
---enrollment - the source phone keeps backing itself up. In device and sim mode a profile never
---restores onto the phone that made it, which already holds everything the backup does. Character
---mode allows it, since every phone there is the character: it brings back what was deleted.
---A legacy pointer backup (made before cloud snapshots) is refused: it could only copy whatever
---its phone holds today. With no pick, a character holding only such a backup is told so rather
---than told they have none. One character restores at most once per Backup.RestoreCooldown,
---checked before the password and armed after it, since each restore adds the backup's rows again.
lib.callback.register('sd-phone:server:sim:backup:restore', function(source, payload)
    if not (config.Sim.Backup and config.Sim.Backup.Enabled ~= false) then
        return util.fail('sim.cloudBackupDisabled', 'Cloud backup is disabled.')
    end
    local realCid = player.getRealIdentifier(source)
    if not realCid then return util.fail('sim.playerNotFound', 'Player not found') end
    payload = type(payload) == 'table' and payload or {}
    local s = session.resolve(source)
    -- Device mode restores onto the phone's own identity, no SIM/number required; legacy needs
    -- the installed SIM (its identity + number ARE the phone).
    if not s or not s.identity then return util.fail('sim.installSimCardFirst', 'Install a SIM card first.') end
    if not state.device and not s.number then return util.fail('sim.installSimCardFirst', 'Install a SIM card first.') end

    local profile
    if type(payload.device) == 'string' and payload.device ~= '' then
        profile = simStore.getProfile(realCid, payload.device)
    else
        -- No pick: allowed only when exactly one profile can restore here.
        local candidates, legacy = {}, nil
        for _, p in ipairs(simStore.listProfiles(realCid)) do
            local mine = not state.character and p.deviceIdentity == s.identity
            if not isCloudIdentity(p.identity) then
                if p.identity ~= s.identity then legacy = legacy or p end
            elseif p.syncedAt ~= nil and not mine then
                candidates[#candidates + 1] = p
            end
        end
        if #candidates > 1 then return util.fail('sim.pickWhichBackupRestore', 'Pick which backup to restore.') end
        profile = candidates[1] or legacy
    end
    if not profile then return util.fail('sim.noCloudBackupFoundCharacter', 'No cloud backup found for this character.') end
    local isCloud = isCloudIdentity(profile.identity)
    if isCloud and profile.syncedAt == nil then return util.fail('sim.backupHasNeverCompleted', 'That backup has never completed.') end
    local ownPhone = profile.deviceIdentity == s.identity and not state.character
    if ownPhone or (not isCloud and profile.identity == s.identity) then
        return util.fail('sim.phoneAlreadyHoldsBackedUp', 'This phone already holds the backed-up data.')
    end
    if not isCloud then
        return util.fail('sim.oldBackupMakeNew', 'This is an old backup and can no longer be restored. Make a new Cloud Backup instead.')
    end

    local cooldownLeft = util.cooldownLeft(realCid, 'sim:backupRestore', restoreGap())
    if cooldownLeft > 0 then
        return util.fail('sim.restoreCooldown', 'You restored a backup recently. Try again in {minutes} min.',
            { minutes = math.ceil(cooldownLeft / 60000) })
    end

    local stored = simStore.getBackupPassword(realCid)
    if stored then
        if not mayCheckPassword(realCid) then
            return util.fail('sim.tooManyPasswordAttempts', 'Too many password attempts. Try again shortly.')
        end
        local given = type(payload.password) == 'string' and payload.password or ''
        local accounts = require 'server.accounts.store'
        if not accounts.verifyPassword(given, stored) then
            return util.fail('sim.wrongBackupPassword', 'Wrong backup password.')
        end
    end

    if syncBusy[source] then return util.fail('sim.backupAlreadyRunning', 'A backup is already running.') end
    -- Armed only past the password, so a fumbled one does not start the wait.
    if not util.cooldown(realCid, 'sim:backupRestore', restoreGap()) then
        return util.fail('sim.restoreCooldown', 'You restored a backup recently. Try again in {minutes} min.',
            { minutes = math.ceil(restoreGap() / 60000) })
    end

    -- Snapshot untouched: restore copies OUT of the cloud (see backup.restore).
    syncBusy[source] = true
    local okRun, rows = pcall(backup.restore, profile.identity, s.identity, s.number or '',
        profile.deviceIdentity, state.character)
    syncBusy[source] = nil
    if not okRun then error(rows, 0) end
    print(('^3[sd-phone:sim]^0 restored backup %s -> %s for %s (%d rows)')
        :format(profile.identity, s.identity, realCid, rows))
    -- The restored data replaced the acting profile in place: the client resets the NUI (kept-
    -- alive apps, hydrated settings, caches) so nothing keeps showing pre-restore state.
    TriggerClientEvent('sd-phone:client:profileReset', source)
    return util.ok({ rows = rows })
end)

---Server export: create a sim_card and put it in a player's inventory. `opts.citizenid` makes a
---character-bound SIM (their existing data/number carry over); otherwise the SIM is blank with
---a fresh number. `opts.number` requests a specific number (fails if taken).
---@param source number player server id
---@param opts? { number?: string, citizenid?: string }
---@return string|nil number bare-digit number on success, nil on failure
exports('giveSimCard', function(source, opts)
    -- Built-in-numbers mode has no usable SIM items - a handed-out card would be inert.
    if state.builtin then return nil end
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
---identity/data. This is the hook for server-owned "buy a custom number" implementations. The
---number must be a length the server accepts (config.Phone.Number: Length, a Formats length, or
---the Custom range) and cannot start with 0. Returns false with 'invalid' | 'reserved' |
---'no_sim' | 'taken' on failure; 'reserved' is a company or emergency line.
---@param source number player server id
---@param number string requested phone number (digits kept)
---@return boolean ok
---@return string|nil err
exports('setSimNumber', function(source, number)
    if not state.active then return false, 'invalid' end
    if type(source) ~= 'number' or not GetPlayerName(source) then return false, 'invalid' end
    local digits = util.digits(number)
    local why = util.numberAssignError(digits)
    if why == 'reserved' then return false, 'reserved' end
    if why then return false, 'invalid' end

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
