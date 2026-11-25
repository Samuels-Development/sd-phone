-- Build-presence guard: a source checkout without a compiled NUI (web/build is
-- gitignored and shipped via GitHub Releases) would open to a blank phone.
if not LoadResourceFile(GetCurrentResourceName(), 'web/build/index.html') then
    print('^1[sd-phone] NUI build not found at web/build/index.html.^0')
    print('^3[sd-phone] Download the packaged release from GitHub Releases, or build it: cd web && npm ci && npm run build^0')
end

---@type table sd-phone config root (configs/config.lua).
local config    = require 'configs.config'
---@type table Inventory bridge (bridge.server.inventory): backend-agnostic item ops.
local inv       = require 'bridge.server.inventory'
---@type table Shared server helpers (server.util): the failure envelope a crashed handler answers with.
local util      = require 'server.util'

-- Every callback handler the app modules register below runs under pcall. A handler that throws
-- (a schema mismatch, a nil field) would otherwise never resolve, and the phone would spin on
-- the promise until ox_lib's timeout instead of showing an error.
do
    local register = lib.callback.register
    lib.callback.register = function(name, handler)
        return register(name, function(...)
            local results = table.pack(pcall(handler, ...))
            if results[1] then return table.unpack(results, 2, results.n) end
            print(('^1[sd-phone] callback %s failed: %s^0'):format(tostring(name), tostring(results[2])))
            return util.fail('common.serverError', 'Something went wrong')
        end)
    end
end

-- Phone banners are gated here, once, for every module: a player who carries no phone item gets
-- none, emergency alerts excepted. Wrapping the send covers every place that fires the banner
-- event, so no client has to call the server back before it may show one.
do
    local trigger = TriggerClientEvent
    TriggerClientEvent = function(eventName, target, ...)
        if eventName == util.BANNER_EVENT then return util.pushBanner(target, ...) end
        return trigger(eventName, target, ...)
    end
end

-- Loaded for side effects: each module self-registers its callbacks, events, commands and exports on require.
-- SIM first: when unique phones are enabled it wraps player.getIdentifier before any app module
-- captures a callback against it (they all resolve identity at call time, but keep it first for
-- clarity - the wrapper must also be live before the boot-time registrations below).
require 'server.sim.init'
-- ESX only, and only without a dedicated inventory resource: puts the phone items in the `items`
-- table so ESX will honour them. Reads config.Sim, so it sits after the SIM module.
require 'server.esxitems'
require 'server.settings.init'
require 'server.service'
require 'server.wifi'
require 'server.bluetooth.init'
require 'server.apps.init'
require 'server.groups.init'
require 'server.mail.init'
require 'server.messages.init'
require 'server.photos.init'
require 'server.birdy.init'
require 'server.accounts.init'
require 'server.contacts.init'
require 'server.calls.init'
require 'server.payphone.init'
require 'server.badges.init'
require 'server.gifs.init'
require 'server.garages.init'
require 'server.garages.valet'
require 'server.darkchat.init'
require 'server.marketplace.init'
require 'server.pages.init'
require 'server.weazelnews.init'
require 'server.banking.init'
require 'server.services.init'
require 'server.voicememos.init'
require 'server.callrec.init'
require 'server.voicemail.init'
require 'server.music.init'
require 'server.share.init'
require 'server.devseed.init'
-- Optional local-only helpers; absent on every install but a developer's, so a missing file is
-- expected rather than an error.
pcall(require, 'server.devswap')
require 'server.notifications.init'
require 'server.notes.init'
require 'server.search.init'
require 'server.calendar.init'
require 'server.documents.init'
require 'server.homes.init'
require 'server.maps.init'
require 'server.friends.init'
require 'server.cherry.init'
-- Ahead of the three features that stream live video, so the relay's gate is resolved and its
-- feature registry is there to be registered against before any of them takes a viewer.
require 'server.media.init'
require 'server.photogram.init'
require 'server.webhooks.init'
require 'server.vibez.init'
require 'server.voice.init'
require 'server.streaks.init'
require 'server.id.init'
require 'server.mdt.init'
require 'server.racing.init'
require 'server.health.init'
require 'server.medical.init'
require 'server.gates'
require 'server.appgate'
require 'server.ryde.init'
require 'server.radio.init'
require 'server.clock.init'
require 'server.cookie.init'
require 'server.stocks.init'
require 'server.cases.init'
require 'server.chess.init'
require 'server.connectfour.init'
require 'server.games.chips'
require 'server.games.blackjack'
require 'server.games.casino.roulette'
require 'server.games.casino.slots'
require 'server.games.casino.baccarat'
require 'server.games.casino.crash.init'
require 'server.games.casino.holdem.init'
require 'server.battleship.init'
require 'server.wordle.init'
require 'server.admin.wipe'
require 'server.admin.init'
-- lb-phone -> sd-phone one-time data import (no-op unless lb-phone's tables are present).
require 'server.migrate.init'
-- Loaded for side effects: publishes the phone's live per-player state onto player state bags.
require 'server.statebags'

-- lb-phone export compatibility shim (inert while the real lb-phone runs; sd_phone_lbcompat kill switch).
require 'server.compat.lbphone.init'
-- lb-tablet dispatch export compatibility shim (inert while the real lb-tablet runs; sd_phone_lbtabletcompat kill switch).
require 'server.compat.lbtablet.init'
-- yseries export compatibility shim (inert while the real yseries runs; sd_phone_yseriescompat kill switch).
require 'server.compat.yseries.init'
-- qs-smartphone export compatibility shim (sd_phone_qscompat kill switch).
require 'server.compat.qssmartphone.init'
-- gksphone export compatibility shim (sd_phone_gkscompat kill switch).
require 'server.compat.gksphone.init'
-- roadphone export compatibility shim (sd_phone_roadphonecompat kill switch).
require 'server.compat.roadphone.init'
-- qb-phone event and export compatibility shim (sd_phone_qbphonecompat kill switch).
require 'server.compat.qbphone.init'

---@type table SIM feature flags (server.sim.state): active + mode.
local simState = require 'server.sim.state'

---@type fun(entry: table): boolean Whether a phone item is a foldable (shared.phonefold).
local folds = require('shared.phonefold').entry
---@type fun(entry: table): string The design a phone item is (shared.phonefold).
local lookOf = require('shared.phonefold').look

---Registers each configured phone item (config.Phone.Items) as a usable item; using one opens
---the phone with the variant's frame colour (plus the SIM snapshot under unique phones). The
---used slot marks that exact phone as the active one, so a player carrying several SIM'd
---phones acts (and calls) as whichever phone they actually opened.
local function RegisterPhoneItems()
    for _, entry in ipairs(config.Phone.Items or {}) do
        inv.registerUsable(entry.item, function(source, itemArg, invArg, slotArg)
            local deviceHint
            local usedSlot = (type(itemArg) == 'table' and tonumber(itemArg.slot)) or tonumber(slotArg)
                or (type(invArg) == 'table' and tonumber(invArg.slot)) or nil
            require('server.cases.actions').phoneOpened(source, entry.item, usedSlot)
            if simState.active then
                require('server.sim.session').setActive(source, { slot = usedSlot, color = entry.color })
                -- Synchronous metadata peek (no DB): hands the client this phone's device
                -- identity with the open, so switching phones tears the old profile down AT the
                -- reveal instead of a server round-trip later.
                if usedSlot then
                    local row = inv.getSlot(source, usedSlot)
                    local md = row and row.metadata
                    deviceHint = type(md) == 'table' and md.deviceId or nil
                end
            end
            -- Open immediately: the SIM resolve does inventory scans + awaited DB writes, so it
            -- runs AFTER the reveal and reconciles through the live simState push.
            TriggerClientEvent('sd-phone:client:openFromItem', source, entry.color, nil, simState.active, deviceHint, folds(entry), lookOf(entry))
            if simState.active then
                CreateThread(function() require('server.sim.session').push(source) end)
            end
        end)
    end
end

---@type string[] Every configured phone item name once, in config order: the list a single
---inventory read asks about, instead of one search per item.
local PHONE_ITEM_NAMES = {}
do
    local seen = {}
    for _, entry in ipairs(config.Phone.Items or {}) do
        if type(entry.item) == 'string' and not seen[entry.item] then
            seen[entry.item] = true
            PHONE_ITEM_NAMES[#PHONE_ITEM_NAMES + 1] = entry.item
        end
    end
end

---Server-authoritative ownership gate for the keybind: returns the phone to open, preferring the
---one the client used last among those owned (that colour and kind, then that colour of any kind),
---else the first owned. Every phone item is counted in one inventory read up front.
---@param source integer player server id
---@param preferred string|nil last-used frame colour hint
---@param preferFold boolean|nil whether the last-used phone was a foldable
---@param preferLook string|nil the design of the last-used phone
---@return string|nil color frame colour to open with, nil when no phone item is owned
---@return boolean fold whether that phone is a foldable
---@return string look the design of that phone
---@return string? item that phone's item name
local function ResolveOwnedColor(source, preferred, preferFold, preferLook)
    local items = config.Phone.Items or {}
    if #PHONE_ITEM_NAMES == 0 then return nil, false, 'classic', nil end
    local held = inv.countMany(source, PHONE_ITEM_NAMES)
    if preferred then
        local other
        for _, entry in ipairs(items) do
            if entry.color == preferred and (held[entry.item] or 0) > 0 then
                if (preferFold == nil or folds(entry) == preferFold) and (preferLook == nil or lookOf(entry) == preferLook) then
                    return entry.color, folds(entry), lookOf(entry), entry.item
                end
                other = other or entry
            end
        end
        if other then return other.color, folds(other), lookOf(other), other.item end
    end
    for _, entry in ipairs(items) do
        if (held[entry.item] or 0) > 0 then
            return entry.color, folds(entry), lookOf(entry), entry.item
        end
    end
    return nil, false, 'classic', nil
end

---Clears the cached carry answer of every player a phone item just moved for. Deferred a tick:
---inventory hooks fire before the move lands, and a read in between would cache the old state.
---@param ... any server ids or inventory ids from a hook payload; non-numeric ones are ignored
local function PhoneMoved(...)
    local ids = { ... }
    SetTimeout(0, function()
        for i = 1, #ids do
            local id = tonumber(ids[i])
            if id then util.forgetCarry(id) end
        end
    end)
end

---@type table<string, true> Phone item names as a set, the item filter every hook below uses.
local PHONE_ITEM_SET = {}
for _, name in ipairs(PHONE_ITEM_NAMES) do PHONE_ITEM_SET[name] = true end

---Hooks the running inventory so a phone item moving (swapped, dropped, given, created) clears its
---holder's cached carry answer at once. Called at boot and again whenever the inventory restarts,
---since its hooks die with it. Inventories with no such hook fall back to the cache's short life.
local function WatchPhoneMoves()
    if #PHONE_ITEM_NAMES == 0 then return end
    if GetResourceState('one_inventory') == 'started' then
        for _, hook in ipairs({ 'beforeItemSwap', 'beforeItemDrop', 'beforeItemGive' }) do
            pcall(function()
                exports.one_inventory:RegisterHook(hook, function(payload)
                    PhoneMoved(payload.source, payload.fromInventory, payload.toInventory, payload.target)
                end, { itemFilter = PHONE_ITEM_SET })
            end)
        end
    elseif GetResourceState('ox_inventory') == 'started' then
        pcall(function()
            exports.ox_inventory:registerHook('swapItems', function(payload)
                PhoneMoved(payload.source, payload.fromInventory, payload.toInventory)
            end, { itemFilter = PHONE_ITEM_SET })
        end)
        pcall(function()
            exports.ox_inventory:registerHook('createItem', function(payload)
                PhoneMoved(payload.inventoryId)
            end, { itemFilter = PHONE_ITEM_SET })
        end)
    end
end

---An inventory resource coming back up has forgotten every hook registered with it.
AddEventHandler('onResourceStart', function(resource)
    if resource == 'ox_inventory' or resource == 'one_inventory' then WatchPhoneMoves() end
end)

-- ESX's own inventory reports item changes as plain server events rather than hooks.
if require('bridge.shared.framework').name == 'esx' then
    ---@param src number player server id
    ---@param name string item name
    local function onEsxItem(src, name)
        if PHONE_ITEM_SET[name] then PhoneMoved(src) end
    end
    AddEventHandler('esx:onAddInventoryItem', onEsxItem)
    AddEventHandler('esx:onRemoveInventoryItem', onEsxItem)
end

---Keybind open request: may this player open a phone, and in which colour? Returns the bare
---colour string normally; under unique phones { color, pending = true } and the deferred
---simState push corrects hasSim/number - and the colour, since the session's active phone wins.
lib.callback.register('sd-phone:server:phone:resolveOpen', function(source, preferred, preferFold, preferLook)
    local color, fold, look, item = ResolveOwnedColor(source, preferred, preferFold, preferLook)
    if item then require('server.cases.actions').phoneOpened(source, item, nil) end
    if not simState.active then return color, fold, look end
    if not color then return nil end
    if type(preferred) == 'string' then
        require('server.sim.session').setActive(source, { color = preferred })
    end
    -- Same deferral as the item path: answer with the colour now, resolve the SIM after.
    CreateThread(function() require('server.sim.session').push(source) end)
    return { color = color, pending = true }, fold, look
end)

-- Boot: registers the usable phone items once, then prints the startup banner.
CreateThread(function()
    Wait(50)
    RegisterPhoneItems()
    WatchPhoneMoves()
end)

---Public export: does this player own a phone - exports['sd-phone']:hasPhone(source). Returns
---the frame colour of the first owned phone item, or nil when the player owns none.
---@param source number player server id
---@return string|nil color owned frame colour, nil when no phone item is owned
exports('hasPhone', function(source)
    if type(source) ~= 'number' then return nil end
    if not GetPlayerName(source) then return nil end
    return (ResolveOwnedColor(source, nil))
end)

require 'server.compat.lbphone.clientsupport'
