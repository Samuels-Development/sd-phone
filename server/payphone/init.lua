---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

---@type table sd-phone config root (configs/config.lua).
local config   = require 'configs.config'
---@type table Payphone persistence (server.payphone.store): per-booth static numbers.
local store    = require 'server.payphone.store'
---@type table Call engine (server.calls.actions): dialPayphone + shared teardown.
local calls    = require 'server.calls.actions'
---@type table Player bridge (bridge.server.player): citizenid resolution.
local player   = require 'bridge.server.player'
---@type table Contacts persistence (server.contacts.store): favourites for the notepad.
local contacts = require 'server.contacts.store'
---@type table Settings persistence (server.settings.store): the player's own number.
local settings = require 'server.settings.store'
---@type table Money bridge (bridge.server.money): cash debits for coin-operated calls.
local money    = require 'bridge.server.money'

---@type table Payphone config (configs/payphone.lua).
local cfg = config.Payphone or require 'configs.payphone'

local util = require 'server.util'
local ok, fail, digits = util.ok, util.fail, util.digits

if cfg.Enabled then
    CreateThread(function()
        local success, err = pcall(store.ensureSchema)
        if not success then
            boot.schemaFailed('payphone', err)
            return
        end
        boot.schemaReady()
    end)
end

---@type number Coordinate magnitude a booth key may claim. The playable map fits inside a fifth
---of this, and the bound is what keeps the formatted key inside the VARCHAR(64) primary key.
local MAX_COORD = 20000.0

---Coerces a client-supplied location key ('x,y,z' rounded coords) into the canonical one-decimal
---form the client mints, so textually different spellings of one spot cannot become distinct rows.
---@param raw any
---@return string|nil
local function locationKey(raw)
    if type(raw) ~= 'string' or raw == '' or #raw > 64 then return nil end
    local rx, ry, rz = raw:match('^(-?[%d%.]+),(-?[%d%.]+),(-?[%d%.]+)$')
    local x, y, z = tonumber(rx), tonumber(ry), tonumber(rz)
    if not util.finite(x) or not util.finite(y) or not util.finite(z) then return nil end
    if math.abs(x) > MAX_COORD or math.abs(y) > MAX_COORD or math.abs(z) > MAX_COORD then return nil end
    return ('%.1f,%.1f,%.1f'):format(x, y, z)
end

---@type integer Booth-minting budget window in ms.
local MINT_WINDOW = 60000
---@type integer New booth rows one player may create per window. A booth is minted once ever, by
---whoever uses it first, so a player who spent an hour walking the map would still not reach this.
local MINT_PER_WINDOW = 5

---The booth's number, minting a row only when the caller has mint budget left. Rate-limiting the
---MINT and never the read keeps an already-known booth instant for everyone. Empty rather than nil
---when it refuses: both consumers format this straight into a string.
---@param src number
---@param location string canonical 'x,y,z' key
---@return string number empty when the booth has no row and none may be minted right now
local function boothNumber(src, location)
    local existing = store.lookupNumber(location)
    if existing then return existing end
    if not util.rateLimit(player.getIdentifier(src), 'payphone:mint', MINT_WINDOW, MINT_PER_WINDOW) then return '' end
    return store.numberFor(location) or ''
end

---@type table<number, boolean> Sources holding an unspent coin credit. A coin buys ONE placed
---call: the credit is consumed when a dial succeeds, survives failed dials (wrong number, busy)
---and disconnect drops it. Server-side so a spoofed dial request can't skip the toll.
local credits = {}

---@return table coin the Coin config block (empty table when absent)
local function coinCfg() return cfg.Coin or {} end

---@return boolean enabled whether coin-operated calling is on
local function coinEnabled() return cfg.Enabled and coinCfg().Enabled == true end

---The player must actually be near the booth they claim to be using.
---@param src number
---@param location string 'x,y,z' key
---@return boolean
local function nearLocation(src, location)
    local x, y, z = location:match('^(-?[%d%.]+),(-?[%d%.]+),(-?[%d%.]+)$')
    if not x then return false end
    local ped = GetPlayerPed(src)
    if not ped or ped == 0 then return false end
    local pos = GetEntityCoords(ped)
    return #(pos - vector3(tonumber(x), tonumber(y), tonumber(z))) < 6.0
end

---The caller's own phone number, or nil when their character has none yet.
---@param src number player server id
---@return string|nil number
local function playerNumber(src)
    local cid = player.getIdentifier(src)
    return cid and settings.getPhoneNumber(cid) or nil
end

---Booth state for the dial UI: the booth's static number and the caller's favourite contacts for
---the notepad. The caller's OWN number is deliberately not sent: a booth cannot ring the phone in
---your own pocket, so a shortcut for it is a control that can only fail. Read-only.
lib.callback.register('sd-phone:server:payphone:state', function(src, payload)
    if not cfg.Enabled then return fail('payphone.payphonesDisabled', 'Payphones are disabled') end
    payload = type(payload) == 'table' and payload or {}
    local location = locationKey(payload.location)
    if not location or not nearLocation(src, location) then return fail('payphone.noPayphoneHere', 'No payphone here') end

    local favorites = {}
    local cid = player.getIdentifier(src)
    -- Bounds the contacts read this callback pays for; opening a booth is a target interaction,
    -- so no player reaches a second one inside the gap.
    if not util.cooldown(cid, 'payphone:state', 500) then return fail('payphone.slowDown', 'Slow down') end
    if cid then
        if cfg.ShowFavorites ~= false then
            for _, row in ipairs(contacts.listContacts(cid)) do
                if util.truthy(row.favorite) and #favorites < 6 then
                    favorites[#favorites + 1] = { name = row.name, phone = digits(row.phone) }
                end
            end
        end
    end

    return ok({
        number    = boothNumber(src, location),
        anonymous = cfg.Anonymous == true,
        favorites = favorites,
        coin      = { enabled = coinEnabled(), cost = tonumber(coinCfg().Cost) or 1 },
        credited  = credits[src] == true,
    })
end)

---Feeds the booth a coin: debits the configured cost and grants one call credit. Idempotent
---while a credit is already held (no double charge from repeated clicks).
lib.callback.register('sd-phone:server:payphone:insertCoin', function(src, payload)
    if not coinEnabled() then return ok({ credited = true }) end
    payload = type(payload) == 'table' and payload or {}
    local location = locationKey(payload.location)
    if not location or not nearLocation(src, location) then return fail('payphone.noPayphoneHere', 'No payphone here') end
    if credits[src] then return ok({ credited = true }) end

    local cost = tonumber(coinCfg().Cost) or 1
    local account = coinCfg().Account or 'cash'
    if money.get(src, account) < cost then return fail('payphone.outOfCoins', 'No coins') end
    money.remove(src, account, cost, 'payphone-call')
    credits[src] = true
    return ok({ credited = true })
end)

---Answers a ringing booth: promotes the ring into a live call with the answerer as the booth
---side. The answerer must actually be standing at that booth.
lib.callback.register('sd-phone:server:payphone:answer', function(src, payload)
    if not cfg.Enabled then return fail('payphone.payphonesDisabled', 'Payphones are disabled') end
    payload = type(payload) == 'table' and payload or {}
    local location = locationKey(payload.location)
    if not location or not nearLocation(src, location) then return fail('payphone.noPayphoneHere', 'No payphone here') end
    return calls.answerBoothRing(src, payload.channel)
end)

---Places a call from the booth: caller identity is the booth's static number (or withheld when
---Anonymous), never the player's own.
lib.callback.register('sd-phone:server:payphone:dial', function(src, payload)
    if not cfg.Enabled then return fail('payphone.payphonesDisabled', 'Payphones are disabled') end
    payload = type(payload) == 'table' and payload or {}
    local location = locationKey(payload.location)
    if not location or not nearLocation(src, location) then return fail('payphone.noPayphoneHere', 'No payphone here') end

    -- The one number a booth must never reach is the phone in the caller's own pocket: it rings
    -- a device standing at the booth, and answering it means driving two screens at once. The
    -- phone's own dialler refuses this for the same reason (server.calls.actions), and the booth
    -- offers the number as a shortcut, so the refusal has to live here rather than in the UI.
    local mine = playerNumber(src)
    if mine and digits(mine) ~= '' and digits(mine) == digits(payload.number) then
        return fail('payphone.canTCallYourself', 'You can\'t call yourself')
    end

    -- Coin toll: dialing without a paid credit is refused server-side, and a
    -- successful dial consumes the credit (failed dials keep it for a retry).
    if coinEnabled() and not credits[src] then return fail('payphone.insertCoinFirst', 'Insert coin first') end

    -- The booth-number read below is an argument to dialPayphone, so it is paid BEFORE that
    -- call's own dial budget; without a gate here a refused dial still costs a lookup each time.
    if not util.cooldown(player.getIdentifier(src), 'payphone:dial', 500) then return fail('payphone.slowDown', 'Slow down') end

    local result = calls.dialPayphone(src, {
        number       = payload.number,
        callerName   = cfg.CallerLabel or 'Payphone',
        callerNumber = cfg.Anonymous == true and '' or boothNumber(src, location),
    })
    if coinEnabled() and result and result.success then credits[src] = nil end
    return result
end)

---A dropped player forfeits any unspent coin credit (cache hygiene, not a refund policy).
AddEventHandler('playerDropped', function()
    credits[source] = nil
end)
