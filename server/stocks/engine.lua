---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Stocks persistence layer (server.stocks.store): persisted price/history rows.
local store  = require 'server.stocks.store'

---@type table Stocks config (config.Stocks): tick/impact/supply knobs + the asset list.
local ST   = config.Stocks
---@type table Configured asset list (config.Stocks.Assets): per-asset trend/volatility/bounds.
local META = ST.Assets

---@type table Engine module; the table returned at end of file. Holds the live price + rolling
---history for every configured asset in memory - the single server-side source of truth every
---trade fills against. Prices seed from configs/stocks.lua basePrice on first boot, then
---persist via store.savePrices.
local engine = {}

---@type table<string, { price: number, history: number[] }> Live in-memory market, per symbol.
local market = {}

---A standard-normal sample via the Box-Muller transform. u1 is floored away from zero.
---@return number sample standard-normal random value
local function gaussian()
    local u1 = math.random()
    local u2 = math.random()
    if u1 < 1e-9 then u1 = 1e-9 end
    return math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)
end

---Clamp `v` into [lo, hi].
---@param v number value
---@param lo number lower bound
---@param hi number upper bound
---@return number clamped
local function clamp(v, lo, hi)
    if v < lo then return lo end
    if v > hi then return hi end
    return v
end

---Percentage change measured against the OLDEST retained history point - i.e. across the whole
---window the sparkline shows - not against the previous tick.
---@param history number[] rolling price history, oldest first
---@param price number current price
---@return number changePct fractional change (0 when there's no usable baseline)
local function changePct(history, price)
    local first = history[1]
    if not first or first == 0 then return 0 end
    return (price - first) / first
end

---Config meta for a symbol (nil if unknown); the whitelist trade callbacks validate
---client-supplied symbols against.
---@param symbol string asset symbol
---@return table|nil meta the configured asset entry, nil when not configured
function engine.meta(symbol)
    for _, a in ipairs(META) do
        if a.symbol == symbol then return a end
    end
    return nil
end

---Seeds the in-memory market at boot: a persisted price (with its history) wins, otherwise the
---asset starts at basePrice with a short flat history. Also seeds math.random.
function engine.init()
    math.randomseed(os.time())
    local persisted = store.loadPrices()
    for _, a in ipairs(META) do
        local p = persisted[a.symbol]
        if p and p.price and p.price > 0 then
            market[a.symbol] = {
                price   = p.price,
                history = (type(p.history) == 'table' and #p.history > 0) and p.history or { p.price },
            }
        else
            local hist = {}
            local seed = math.min(ST.HistoryPoints or 48, 12)
            for i = 1, seed do hist[i] = a.basePrice end
            market[a.symbol] = { price = a.basePrice, history = hist }
        end
    end
end

---One simulation step for every asset: a trend + volatility random-walk move, the new price
---clamped to the asset's [min, max] and appended to the rolling history.
function engine.tick()
    local cap = ST.HistoryPoints or 48
    for _, a in ipairs(META) do
        local m = market[a.symbol]
        if m then
            local movePct = (a.trend or 0) * (ST.DriftScale or 1)
                + (a.volatility or 0.01) * (ST.VolatilityScale or 1) * gaussian()
            local np = clamp(m.price * (1 + movePct), a.min or 0.01, a.max or 1e12)
            m.price = np
            m.history[#m.history + 1] = np
            while #m.history > cap do table.remove(m.history, 1) end
        end
    end
end

---The live server-side price for a symbol (nil if unknown); the only price trades fill at.
---@param symbol string asset symbol
---@return number|nil price
function engine.priceOf(symbol)
    local m = market[symbol]
    return m and m.price or nil
end

---Fixed total shares outstanding for a symbol: MarketCap / basePrice.
---@param symbol string asset symbol
---@return integer supply total shares outstanding (0 for an unknown symbol)
function engine.supplyOf(symbol)
    local a = engine.meta(symbol)
    if not a then return 0 end
    local cap  = a.marketCap or ST.MarketCap or 5e7
    local base = a.basePrice or 1
    return math.max(1, math.floor(cap / base))
end

---Moves the shared price in response to a trade of dollar size `value`. Buying pushes the price
---up, selling down, scaled by the asset's liquidity, capped at ST.MaxImpact, recorded in history.
---@param symbol string asset symbol
---@param value number dollar size of the order (server-computed)
---@param isBuy boolean true pushes the price up, false down
---@return number|nil newPrice the post-impact price, nil for an unknown symbol/value
function engine.applyImpact(symbol, value, isBuy)
    local m = market[symbol]
    local a = engine.meta(symbol)
    if not m or not a or not value or value <= 0 then return end

    local liq    = a.liquidity or ST.Liquidity or 1e6
    local impact = math.min(ST.MaxImpact or 0.5, (ST.ImpactScale or 0) * value / liq)
    if impact <= 0 then return m.price end

    local np = clamp(m.price * (1 + (isBuy and impact or -impact)), a.min or 0.01, a.max or 1e12)
    m.price = np
    m.history[#m.history + 1] = np
    while #m.history > (ST.HistoryPoints or 48) do table.remove(m.history, 1) end
    return np
end

---Full per-asset state for the market() fetch: price, % change, and the whole history array.
---Read-only.
---@return table[] snapshot { symbol, price, changePct, history }[]
function engine.snapshot()
    local out = {}
    for _, a in ipairs(META) do
        local m = market[a.symbol]
        if m then
            out[#out + 1] = {
                symbol    = a.symbol,
                price     = m.price,
                changePct = changePct(m.history, m.price),
                history   = m.history,
            }
        end
    end
    return out
end

---Lightweight per-tick broadcast payload: price + % change only. Read-only.
---@return table[] ticks { symbol, price, changePct }[]
function engine.ticks()
    local out = {}
    for _, a in ipairs(META) do
        local m = market[a.symbol]
        if m then
            out[#out + 1] = { symbol = a.symbol, price = m.price, changePct = changePct(m.history, m.price) }
        end
    end
    return out
end

---Rows for batched persistence (store.savePrices). Read-only.
---@return table[] rows { symbol, price, history }[]
function engine.persistRows()
    local rows = {}
    for _, a in ipairs(META) do
        local m = market[a.symbol]
        if m then rows[#rows + 1] = { symbol = a.symbol, price = m.price, history = m.history } end
    end
    return rows
end

return engine
