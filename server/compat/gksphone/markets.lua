---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'
---@type table Phone-id translation (server.compat.gksphone.phones): source -> identity.
local phones = require 'server.compat.gksphone.phones'
---@type table Stocks persistence layer (server.stocks.store): holding reads + absolute upserts.
local store = require 'server.stocks.store'
---@type table Live market (server.stocks.engine): symbol whitelist + the price a grant books at.
local engine = require 'server.stocks.engine'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---Moves a holding by `delta` units, keeping the weighted-average cost basis honest: units granted
---outright book at the live price, and a debit leaves the basis alone. A position driven to zero is
---deleted rather than left as an empty row.
---@param identity string phone identity the holding is keyed on
---@param symbol string asset symbol, already whitelist-checked
---@param delta number signed unit change
---@return boolean ok false when the holder cannot cover a debit
local function move(identity, symbol, delta)
    local held = store.getHolding(identity, symbol)
    local quantity = held and tonumber(held.quantity) or 0
    local basis = held and tonumber(held.avg_cost) or 0
    local next_ = quantity + delta

    if next_ < 0 then return false end
    if next_ == 0 then
        store.deleteHolding(identity, symbol)
        return true
    end

    if delta > 0 then
        local price = engine.priceOf(symbol) or basis
        basis = ((quantity * basis) + (delta * price)) / next_
    end
    store.upsertHolding(identity, symbol, next_, basis)
    return true
end

---Resolves a gksphone coin id to an sd-phone asset symbol, or nil when the market carries nothing
---by that name. gksphone names its coins in Config.Crytos; sd-phone whitelists its own in
---configs/stocks.lua, so a coin only credits when both sides list it.
---@param coinid any
---@return string|nil symbol
local function symbolFor(coinid)
    local raw = shim.text(coinid)
    if not raw then return nil end

    if engine.meta(raw) then return raw end
    local upper = raw:upper()
    if engine.meta(upper) then return upper end

    warnOnce('crypto.symbol', ('coin id %s is not a configured sd-phone asset (called by %s); add it to configs/stocks.lua or the credit is refused'):format(raw, shim.invoker()))
    return nil
end

---Credits or debits a holding, addressed the way gksphone addresses it: by the handset id when one
---is given, otherwise by the acting player.
---@param source any player server id
---@param coinid any
---@param amount any unit count, always taken as a magnitude
---@param phoneUniqID any handset id, V2 only
---@param sign number 1 to credit, -1 to debit
---@return boolean ok
local function apply(source, coinid, amount, phoneUniqID, sign)
    local symbol = symbolFor(coinid)
    local units = math.abs(tonumber(amount) or 0)
    local identity = shim.text(phoneUniqID) or phones.forSource(tonumber(source))
    if not symbol or units == 0 or not identity then return false end
    return move(identity, symbol, sign * units)
end

---stockMarketAdd(src, coinid, amount, phoneUniqID): gksphone V2's crypto credit. Lower-case leading
---'s', which is gksphone's own spelling.
registerExport('stockMarketAdd', function(src, coinid, amount, phoneUniqID)
    return apply(src, coinid, amount, phoneUniqID, 1)
end)

---stockMarketRemove(src, coinid, amount, phoneUniqID): gksphone V2's crypto debit. Refused rather
---than clamped when the holder is short.
registerExport('stockMarketRemove', function(src, coinid, amount, phoneUniqID)
    return apply(src, coinid, amount, phoneUniqID, -1)
end)

---cryptoadd(source, coinid, amount): gksphone V1's credit, the same call without the handset id.
registerExport('cryptoadd', function(source, coinid, amount)
    return apply(source, coinid, amount, nil, 1)
end)

---cryptoremove(source, coinid, amount): gksphone V1's debit.
registerExport('cryptoremove', function(source, coinid, amount)
    return apply(source, coinid, amount, nil, -1)
end)
