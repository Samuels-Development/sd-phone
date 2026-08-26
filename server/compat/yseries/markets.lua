---@type table Shared shim helpers (server.compat.yseries.shared): export registration + warn-once.
local shim = require 'server.compat.yseries.shared'
---@type table Stocks persistence layer (server.stocks.store): per-character holdings.
local store = require 'server.stocks.store'
---@type table Account persistence layer (server.accounts.store): username -> owner resolution.
local accounts = require 'server.accounts.store'
---@type table Settings persistence layer (server.settings.store): number -> identity resolution.
local settings = require 'server.settings.store'

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---@type string[] Account apps searched for a Markets username, in order. sd-phone's Stocks app has
---NO account of its own - holdings are keyed on the character identity - so a YSeries caller's
---"username" has nothing to match against directly. These are the apps whose usernames a server
---owner is most likely to have reused when wiring a Markets integration.
local USERNAME_APPS = { 'photogram', 'birdy', 'vibez' }

---The sd-phone identity behind a Markets username. Tried in order: a character identity passed
---straight through (which is how sd-phone itself keys holdings), then a phone number, then an app
---account username on any of USERNAME_APPS.
---@param username any
---@return string|nil
local function identityFor(username)
    if type(username) ~= 'string' or username == '' then return nil end

    if settings.hasData(username) then return username end

    local byNumber = settings.getCitizenByNumber(username)
    if byNumber then return byNumber end

    for _, app in ipairs(USERNAME_APPS) do
        local account = accounts.getAccount(app, username)
        if type(account) == 'table' and account.citizenid then return account.citizenid end
    end

    warnOnce('markets.username', ("Markets is addressed by username in YSeries, but sd-phone's Stocks app has no account of its own (called by %s); pass a character identifier or phone number instead"):format(GetInvokingResource() or 'unknown'))
    return nil
end

---Applies a signed delta to one holding and returns YSeries' result shape. A position driven to
---zero or below is deleted rather than left as a zero row.
---@param username any Markets account username
---@param data any { symbol, amount, price?, reason?, metadata? }
---@param sign integer 1 to add, -1 to remove
---@param reasonTag string transaction tag YSeries records
---@return table
local function adjust(username, data, sign, reasonTag)
    if type(data) ~= 'table' then
        return { success = false, message = 'data must be a table' }
    end

    local symbol = type(data.symbol) == 'string' and data.symbol:upper() or nil
    local amount = tonumber(data.amount)
    if not symbol or not amount or amount <= 0 then
        return { success = false, message = 'symbol and a positive amount are required' }
    end

    local identity = identityFor(username)
    if not identity then
        return { success = false, message = 'no Markets account for that username' }
    end

    if data.metadata ~= nil then
        warnOnce('markets.metadata', ('Markets metadata is not stored (called by %s); the adjustment was applied without it'):format(GetInvokingResource() or 'unknown'))
    end

    local existing = store.getHolding(identity, symbol)
    local held = tonumber(existing and existing.quantity) or 0
    local avgCost = tonumber(existing and existing.avg_cost) or 0
    local price = tonumber(data.price) or avgCost

    local newHeld = held + (sign * amount)
    if newHeld <= 0 then
        store.deleteHolding(identity, symbol)
        newHeld, avgCost = 0, 0
    else
        if sign > 0 and price > 0 then
            avgCost = ((held * avgCost) + (amount * price)) / newHeld
        end
        store.upsertHolding(identity, symbol, newHeld, avgCost)
    end

    return {
        success    = true,
        message    = reasonTag,
        symbol     = symbol,
        amount     = amount,
        price      = price,
        totalValue = amount * price,
        reason     = type(data.reason) == 'string' and data.reason or reasonTag,
        holding    = {
            amount          = newHeld,
            averageBuyPrice = avgCost,
            totalInvested   = newHeld * avgCost,
        },
    }
end

---AddCrypto(username, data): credits a Markets holding and reports the resulting position.
registerExport('AddCrypto', function(username, data)
    return adjust(username, data, 1, 'adjustment_add')
end)

---RemoveCrypto(username, data): debits a Markets holding and reports the resulting position.
registerExport('RemoveCrypto', function(username, data)
    return adjust(username, data, -1, 'adjustment_remove')
end)
