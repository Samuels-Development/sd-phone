-- Build-presence guard: a source checkout without a compiled NUI (web/build is
-- gitignored and shipped via GitHub Releases) would open to a blank phone.
if not LoadResourceFile(GetCurrentResourceName(), 'web/build/index.html') then
    print('^1[sd-phone] NUI build not found at web/build/index.html.^0')
    print('^3[sd-phone] Download the packaged release from GitHub Releases, or build it: cd web && npm ci && npm run build^0')
end

---@type table sd-phone config root (configs/config.lua).
local config    = require 'configs.config'
---@type table Framework bridge (bridge.shared.framework): active framework detection + name.
local framework = require 'bridge.shared.framework'
---@type table Inventory bridge (bridge.server.inventory): backend-agnostic item ops.
local inv       = require 'bridge.server.inventory'

-- Loaded for side effects: each module self-registers its callbacks, events, commands and exports on require.
-- SIM first: when unique phones are enabled it wraps player.getIdentifier before any app module
-- captures a callback against it (they all resolve identity at call time, but keep it first for
-- clarity - the wrapper must also be live before the boot-time registrations below).
require 'server.sim.init'
require 'server.settings.init'
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
require 'server.darkchat.init'
require 'server.marketplace.init'
require 'server.pages.init'
require 'server.review.init'
require 'server.weazelnews.init'
require 'server.banking.init'
require 'server.services.init'
require 'server.voicememos.init'
require 'server.music.init'
require 'server.share.init'
require 'server.devseed'
require 'server.notifications.init'
require 'server.notes.init'
require 'server.documents.init'
require 'server.homes.init'
require 'server.maps.init'
require 'server.friends.init'
require 'server.cherry.init'
require 'server.photogram.init'
require 'server.vibez.init'
require 'server.voice.init'
require 'server.streaks.init'
require 'server.ryde.init'
require 'server.radio.init'
require 'server.clock.init'
require 'server.cookie.init'
require 'server.stocks.init'
require 'server.chess.init'
require 'server.connectfour.init'
require 'server.games.chips'
require 'server.games.railrunner'
require 'server.games.blackjack'
require 'server.battleship.init'
require 'server.wordle.init'
require 'server.admin.wipe'
require 'server.admin.init'
-- lb-phone -> sd-phone one-time data import (no-op unless lb-phone's tables are present).
require 'server.migrate.init'
-- lb-phone export compatibility shim (inert while the real lb-phone runs; sd_phone_lbcompat kill switch).
require 'server.compat.lbphone.init'

---@type table SIM feature flags (server.sim.state): active + mode.
local simState = require 'server.sim.state'

---Registers each configured phone item (config.Phone.Items) as a usable item; using one opens
---the phone with the variant's frame colour (plus the SIM snapshot under unique phones). The
---used slot marks that exact phone as the active one, so a player carrying several SIM'd
---phones acts (and calls) as whichever phone they actually opened.
local function openPhoneFromSlot(source, usedSlot, itemName)
    local entry
    for _, row in ipairs(config.Phone.Items or {}) do
        if row.item == itemName then entry = row break end
    end
    if not entry then return end

    local deviceHint
    if simState.active then
        usedSlot = tonumber(usedSlot)
        -- Container mode: peel any legacy nested ox container onto the per-device stash so this
        -- USE path opens the UI (ox would otherwise intercept metadata.container client-side).
        if usedSlot and require('server.sim.state').mode == 'container' then
            local siminv = require 'server.sim.inv'
            deviceHint = siminv.migrateNestedContainer(source, usedSlot)
                or siminv.ensureDeviceId(source, usedSlot)
        elseif usedSlot then
            local row = inv.getSlot(source, usedSlot)
            local md = row and row.metadata
            deviceHint = type(md) == 'table' and md.deviceId or nil
        end
        require('server.sim.session').setActive(source, {
            slot     = usedSlot,
            color    = entry.color,
            deviceId = deviceHint,
        })
    end
    -- Open immediately: the SIM resolve does inventory scans + awaited DB writes, so it
    -- runs AFTER the reveal and reconciles through the live simState push.
    TriggerClientEvent('sd-phone:client:openFromItem', source, entry.color, nil, simState.active, deviceHint)
    if simState.active then
        CreateThread(function() require('server.sim.session').push(source) end)
    end
end

local function RegisterPhoneItems()
    for _, entry in ipairs(config.Phone.Items or {}) do
        inv.registerUsable(entry.item, function(source, itemArg, _invArg, slotArg)
            local usedSlot = (type(itemArg) == 'table' and tonumber(itemArg.slot)) or tonumber(slotArg)
            local itemName = (type(itemArg) == 'table' and itemArg.name) or entry.item
            openPhoneFromSlot(source, usedSlot, itemName)
        end)
    end
end

---Client inventory export path (ox client.export): same as usable-item open, keyed by slot.
RegisterNetEvent('sd-phone:server:usePhoneItem', function(slot, itemName)
    local source = source
    openPhoneFromSlot(source, slot, itemName)
end)

---Server-authoritative ownership gate for the keybind: returns the frame colour to open with,
---preferring the client's last-used hint among owned variants, else the first owned variant.
---@param source integer player server id
---@param preferred string|nil last-used frame colour hint
---@return string|nil color frame colour to open with, nil when no phone item is owned
local function ResolveOwnedColor(source, preferred)
    local items = config.Phone.Items or {}
    if preferred then
        for _, entry in ipairs(items) do
            if entry.color == preferred and inv.count(source, entry.item) > 0 then
                return entry.color
            end
        end
    end
    for _, entry in ipairs(items) do
        if inv.count(source, entry.item) > 0 then
            return entry.color
        end
    end
    return nil
end

---Keybind open request: may this player open a phone, and in which colour? Returns the bare
---colour string normally; under unique phones { color, pending = true } and the deferred
---simState push corrects hasSim/number - and the colour, since the SIM'd phone's wins.
lib.callback.register('sd-phone:server:phone:resolveOpen', function(source, preferred)
    local color = ResolveOwnedColor(source, preferred)
    if not simState.active then return color end
    if not color then return nil end
    if type(preferred) == 'string' then
        require('server.sim.session').setActive(source, { color = preferred })
    end
    -- Same deferral as the item path: answer with the colour now, resolve the SIM after.
    CreateThread(function() require('server.sim.session').push(source) end)
    return { color = color, pending = true }
end)

-- Boot: registers the usable phone items once, then prints the startup banner.
CreateThread(function()
    Wait(50)
    RegisterPhoneItems()

    local names = {}
    for _, entry in ipairs(config.Phone.Items or {}) do names[#names + 1] = entry.item end
    local itemList = #names > 0 and table.concat(names, ', ') or 'disabled'

    print('^2╭─────────────────────────────────────────────╮^0')
    print('^2│^0  ^3sd-phone^0 — iOS-themed in-game phone         ^2│^0')
    print('^2╰─────────────────────────────────────────────╯^0')
    print(('^2[sd-phone]^0 Framework: ^3%s^0  Items: ^3%s^0  v0.1.0'):format(
        framework.name, itemList))
end)

---Public export: does this player own a phone - exports['sd-phone']:hasPhone(source). Returns
---the frame colour of the first owned phone item, or nil when the player owns none.
---@param source number player server id
---@return string|nil color owned frame colour, nil when no phone item is owned
exports('hasPhone', function(source)
    if type(source) ~= 'number' then return nil end
    if not GetPlayerName(source) then return nil end
    return ResolveOwnedColor(source, nil)
end)

require 'server.compat.lbphone.clientsupport'
