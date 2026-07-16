---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Stocks persistence layer (server.stocks.store): wallet/holdings/price rows.
local store  = require 'server.stocks.store'
---@type table Shared price simulation (server.stocks.engine): live prices, impact, snapshots.
local engine = require 'server.stocks.engine'
---@type table Banking bridge (bridge.server.banking): personal bank balance reads/moves.
local bank   = require 'bridge.server.banking'
---@type table Player bridge (bridge.server.player): citizenid lookups from a server id.
local player = require 'bridge.server.player'

---@type table Stocks config (config.Stocks): fees, trade bounds, market knobs, asset list.
local ST = config.Stocks
---@type table Actions module; the table returned at end of file. Every handler returns the
---{ success, message?, data? } envelope. Trades run against a SEPARATE brokerage wallet
---(deposit/withdraw moves money between the bank and the wallet); buys/sells only ever touch
---the wallet, never the bank directly. Everything is server-authoritative - amount, price and
---balances are all re-checked here.
local actions = {}

---Stable per-character key (framework citizenid) every wallet/holding row is scoped to.
---Resolved from `src` only.
---@param src integer player server id
---@return string|nil citizenid, nil when the player isn't loaded
local function cidOf(src) return player.getIdentifier(src) end

local util = require 'server.util'
local wholeDollars = util.wholeAmount

---@type table<string, boolean> Citizenids with a wallet-mutating call currently in flight.
local tradeBusy = {}

---Runs a handler body while holding the caller's per-character trade gate, releasing it on every
---path; errors are re-raised.
---@param cid string citizenid whose wallet the body mutates
---@param fn fun(): table handler body returning the response envelope
---@return table result response envelope, or the busy rejection
local function withTradeGate(cid, fn)
    if tradeBusy[cid] then return { success = false, message = 'Please wait' } end
    tradeBusy[cid] = true
    local ok, result = pcall(fn)
    tradeBusy[cid] = nil
    if not ok then error(result, 0) end
    return result
end

---Pushes a fresh price snapshot to every online player. Ticks carry symbol/price/% change only.
local function broadcastPrices()
    local ticks = engine.ticks()
    local players = GetPlayers()
    for i = 1, #players do
        TriggerClientEvent('sd-phone:client:stocks:prices', players[i], { assets = ticks })
    end
end

---Full market + the caller's positions + brokerage cash, for the app's main screen. Creates the
---wallet row (seeded with ST.StartingCash) on first open; read-only otherwise.
---@param src integer player server id
---@return table result { success, data = { assets, cash } }
function actions.market(src)
    local cid = cidOf(src)
    if not cid then return { success = false } end

    local cash = store.ensureWallet(cid, ST.StartingCash)

    local holdings = {}
    for _, h in ipairs(store.listHoldings(cid)) do
        holdings[h.symbol] = { quantity = tonumber(h.quantity) or 0, avgCost = tonumber(h.avg_cost) or 0 }
    end

    local snap = {}
    for _, s in ipairs(engine.snapshot()) do snap[s.symbol] = s end

    local assets = {}
    for _, a in ipairs(ST.Assets) do
        local s   = snap[a.symbol] or { price = a.basePrice, changePct = 0, history = { a.basePrice } }
        local pos = holdings[a.symbol]
        assets[#assets + 1] = {
            symbol    = a.symbol,
            name      = a.name,
            kind      = a.kind,
            color     = a.color,
            price     = s.price,
            changePct = s.changePct,
            history   = s.history,
            units     = pos and pos.quantity or 0,
            avgCost   = pos and pos.avgCost or 0,
        }
    end

    return { success = true, data = { assets = assets, cash = cash } }
end

---Moves whole dollars from the bank into the brokerage wallet. The amount is coerced + bounded
---server-side and the bank balance is pre-checked; runs under the trade gate.
---@param src integer player server id
---@param payload any client-supplied { amount: number }; normalized to a table
---@return table result { success, message? } or { success, data = { cash, bank } }
function actions.deposit(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    payload = type(payload) == 'table' and payload or {}
    return withTradeGate(cid, function()
        local amount = wholeDollars(payload.amount)
        if amount < (ST.MinTrade or 1)         then return { success = false, message = 'Enter a valid amount' } end
        if amount > (ST.MaxTrade or math.huge) then return { success = false, message = 'Amount is too large' } end

        local bal = bank.getBalance(src) or 0
        if bal < amount then return { success = false, message = 'Insufficient bank funds' } end

        bank.removeMoney(src, amount, 'Brokerage deposit')
        local cash = store.ensureWallet(cid, ST.StartingCash) + amount
        store.setWallet(cid, cash)

        return { success = true, data = { cash = cash, bank = bank.getBalance(src) or (bal - amount) } }
    end)
end

---Moves whole dollars from the brokerage wallet back to the bank. The wallet floor is enforced
---against a freshly-read balance; runs under the trade gate.
---@param src integer player server id
---@param payload any client-supplied { amount: number }; normalized to a table
---@return table result { success, message? } or { success, data = { cash, bank } }
function actions.withdraw(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    payload = type(payload) == 'table' and payload or {}
    return withTradeGate(cid, function()
        local amount = wholeDollars(payload.amount)
        if amount < (ST.MinTrade or 1) then return { success = false, message = 'Enter a valid amount' } end

        local cash = store.ensureWallet(cid, ST.StartingCash)
        if cash < amount then return { success = false, message = 'Insufficient brokerage cash' } end

        cash = cash - amount
        store.setWallet(cid, cash)
        bank.addMoney(src, amount, 'Brokerage withdrawal')

        return { success = true, data = { cash = cash, bank = bank.getBalance(src) or 0 } }
    end)
end

---Buys `amount` dollars' worth of `symbol` (fee charged on top) from the brokerage wallet at the
---live server price. Moves the shared price, broadcasts it, and runs under the trade gate.
---@param src integer player server id
---@param payload any client-supplied { symbol: string, amount: number }; normalized to a table
---@return table result { success, message? } or { success, data = { cash, units, avgCost } }
function actions.buy(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    payload = type(payload) == 'table' and payload or {}
    return withTradeGate(cid, function()
        local symbol = tostring(payload.symbol or '')
        if not engine.meta(symbol) then return { success = false, message = 'Unknown asset' } end

        local amount = wholeDollars(payload.amount)
        if amount < (ST.MinTrade or 1)         then return { success = false, message = 'Enter a valid amount' } end
        if amount > (ST.MaxTrade or math.huge) then return { success = false, message = 'Amount is too large' } end

        local price = engine.priceOf(symbol)
        if not price or price <= 0 then return { success = false, message = 'No price available' } end

        local fee       = math.floor(amount * (ST.Commission or 0) + 0.5)
        local totalCost = amount + fee

        local cash = store.ensureWallet(cid, ST.StartingCash)
        if cash < totalCost then return { success = false, message = 'Insufficient brokerage cash' } end

        local units    = amount / price
        local existing = store.getHolding(cid, symbol)
        local oldQty   = existing and tonumber(existing.quantity) or 0
        local oldAvg   = existing and tonumber(existing.avg_cost) or 0
        local newQty   = oldQty + units
        local newAvg   = newQty > 0 and (((oldQty * oldAvg) + amount) / newQty) or price

        cash = cash - totalCost
        store.setWallet(cid, cash)
        store.upsertHolding(cid, symbol, newQty, newAvg)

        engine.applyImpact(symbol, amount, true)
        broadcastPrices()

        return { success = true, data = { cash = cash, units = newQty, avgCost = newAvg } }
    end)
end

---Sells `amount` dollars' worth of `symbol` (or the whole position when `payload.all`) at the
---live server price, crediting the net proceeds. Moves the shared price and runs under the trade gate.
---@param src integer player server id
---@param payload any client-supplied { symbol: string, amount?: number, all?: boolean }; normalized to a table
---@return table result { success, message? } or { success, data = { cash, units } }
function actions.sell(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    payload = type(payload) == 'table' and payload or {}
    return withTradeGate(cid, function()
        local symbol = tostring(payload.symbol or '')
        if not engine.meta(symbol) then return { success = false, message = 'Unknown asset' } end

        local existing = store.getHolding(cid, symbol)
        local heldQty  = existing and tonumber(existing.quantity) or 0
        if heldQty <= 0 then return { success = false, message = "You don't own any" } end

        local price = engine.priceOf(symbol)
        if not price or price <= 0 then return { success = false, message = 'No price available' } end

        local unitsToSell
        if payload.all then
            unitsToSell = heldQty
        else
            local amount = wholeDollars(payload.amount)
            if amount < (ST.MinTrade or 1) then return { success = false, message = 'Enter a valid amount' } end
            unitsToSell = math.min(amount / price, heldQty)
        end
        if unitsToSell <= 0 then return { success = false, message = 'Nothing to sell' } end

        local gross = unitsToSell * price
        local fee   = math.floor(gross * (ST.Commission or 0) + 0.5)
        local net   = math.floor(gross - fee + 0.5)

        local remaining = heldQty - unitsToSell
        if remaining <= 1e-8 then
            store.deleteHolding(cid, symbol)
            remaining = 0
        else
            store.upsertHolding(cid, symbol, remaining, existing and tonumber(existing.avg_cost) or 0)
        end

        local cash = store.ensureWallet(cid, ST.StartingCash) + net
        store.setWallet(cid, cash)

        engine.applyImpact(symbol, gross, false)
        broadcastPrices()

        return { success = true, data = { cash = cash, units = remaining } }
    end)
end

---Public ownership for an asset: the market float plus the top player holders, each as a share
---of the fixed total supply. Citizenids feed only the caller's `isYou` flag. Read-only.
---@param src integer player server id
---@param payload any client-supplied { symbol: string }; normalized to a table, symbol whitelist-checked here
---@return table result { success, data = { holders, investorCount, supply, topPlayerPct, whaleThreshold } }
function actions.holders(src, payload)
    local cid = cidOf(src)
    if not cid then return { success = false } end
    payload = type(payload) == 'table' and payload or {}
    local symbol = tostring(payload.symbol or '')
    if not engine.meta(symbol) then return { success = false, message = 'Unknown asset' } end

    local supply = engine.supplyOf(symbol)
    local stats  = store.holderStats(symbol)
    local held   = math.min(stats.total, supply)
    local float  = math.max(0, supply - held)

    local holders = {
        { units = float, pct = supply > 0 and float / supply or 0, isYou = false, isMarket = true },
    }
    local topPlayerPct = 0
    for _, r in ipairs(store.topHolders(symbol, 5)) do
        local q   = tonumber(r.quantity) or 0
        local pct = supply > 0 and (q / supply) or 0
        if pct > topPlayerPct then topPlayerPct = pct end
        holders[#holders + 1] = { units = q, pct = pct, isYou = r.citizenid == cid, isMarket = false }
    end

    return { success = true, data = {
        holders        = holders,
        investorCount  = stats.holders,
        supply         = supply,
        topPlayerPct   = topPlayerPct,
        whaleThreshold = ST.WhaleThreshold or 0.1,
    } }
end

return actions
