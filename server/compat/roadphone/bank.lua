---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'
---@type table Player bridge (bridge.server.player): identity resolution + framework player objects.
local player = require 'bridge.server.player'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

local registerExport, stubExport, warnOnce = shim.registerExport, shim.stubExport, shim.warnOnce

---@type table Bank module; the table returned at end of file, so the event bridge logs a transfer
---through exactly the same path the export does.
local bank = {}

---@type string RoadPhone's default Cfg.BankIBANPrefix. sd-phone has no IBAN concept, so the shim
---mints its own in RoadPhone's documented shape: the prefix plus six digits.
local IBAN_PREFIX = 'DE'

---@type table<string, string> citizenid -> minted IBAN.
local ibans = {}
---@type table<string, string> minted IBAN -> citizenid, so getPlayerFromIBAN can reverse one.
local owners = {}

---A stable six-digit value for a character id, so the same character keeps the same IBAN across
---restarts without a table to persist it in.
---@param citizenid string
---@return integer
local function digest(citizenid)
    local h = 5381
    for i = 1, #citizenid do
        h = (h * 33 + citizenid:byte(i)) % 1000000
    end
    return h
end

---The IBAN for a character, minted on first ask. Collisions walk to the next free number, so two
---characters never share one within a session.
---@param citizenid string
---@return string iban
local function ibanFor(citizenid)
    local existing = ibans[citizenid]
    if existing then return existing end

    local n = digest(citizenid)
    local iban = ('%s%06d'):format(IBAN_PREFIX, n)
    while owners[iban] and owners[iban] ~= citizenid do
        n = (n + 1) % 1000000
        iban = ('%s%06d'):format(IBAN_PREFIX, n)
    end

    ibans[citizenid], owners[iban] = iban, citizenid
    return iban
end

---getPlayerIBAN(source): the player's IBAN, created on first access.
---
---sd-phone identifies bank accounts by character rather than by IBAN, so this is a synthesised
---handle: stable per character and reversible through getPlayerFromIBAN, but it is not a number the
---server's banking script knows.
registerExport('getPlayerIBAN', function(source)
    local src = shim.source(source)
    local cid = src and player.getIdentifier(src) or nil
    if not cid then return '' end
    warnOnce('getPlayerIBAN', ('IBANs are synthesised by the compat layer (called by %s); sd-phone keys bank accounts by character, so the value round-trips here but means nothing to your banking script'):format(GetInvokingResource() or 'unknown'))
    return ibanFor(cid)
end)

---getPlayerFromIBAN(iban): the framework player object behind one of the synthesised IBANs, nil
---when the IBAN was never minted or its owner is offline.
registerExport('getPlayerFromIBAN', function(iban)
    local cid = type(iban) == 'string' and owners[iban] or nil
    local src = cid and player.getSourceByIdentifier(cid) or nil
    return src and player.get(src) or nil
end)

---Appends a transaction ROW to the receiving character's phone log. Like RoadPhone's own, it moves
---no money.
---
---Both parties are addressed by IBAN, so only IBANs this shim minted resolve; the sender's IBAN
---becomes the counterparty label.
---@param sender any sender IBAN
---@param receiver any receiver IBAN
---@param reason any transaction label
---@param amount any signed amount
function bank.addTransaction(sender, receiver, reason, amount)
    local cid = type(receiver) == 'string' and owners[receiver] or nil
    if not cid then
        warnOnce('addBankTransaction.iban', ('addBankTransaction only resolves IBANs minted by getPlayerIBAN (called by %s); the transaction was dropped'):format(GetInvokingResource() or 'unknown'))
        return
    end

    sd:addBankTransaction(cid, {
        label        = reason,
        amount       = tonumber(amount) or 0,
        category     = 'transfer',
        counterparty = type(sender) == 'string' and sender or nil,
    })
end

---addBankTransaction(sender, receiver, reason, amount): the export form of bank.addTransaction.
registerExport('addBankTransaction', bank.addTransaction)

-- Crypto: sd-phone's market app is Stocks - symbol-keyed holdings bought with real money through
-- the player's own brokerage wallet, with no per-coin wallet a resource may credit or debit by
-- numeric coin id. Reads report an empty holding so a caller's balance check simply fails rather
-- than crediting an account that does not exist.
stubExport('addcrypto', nil,
    'has no sd-phone equivalent: the Stocks app holds symbol-keyed positions bought through the player\'s own brokerage wallet, not coin-id wallets a resource can credit')
stubExport('removecrypto', nil,
    'has no sd-phone equivalent: the Stocks app holds symbol-keyed positions bought through the player\'s own brokerage wallet, not coin-id wallets a resource can debit')
stubExport('checkcryptoamount', false,
    'has no sd-phone equivalent: there is no coin-id wallet to check, so every holding reads as empty')
stubExport('getcryptoamount', 0,
    'has no sd-phone equivalent: there is no coin-id wallet to read, so every balance reads as zero')

return bank
