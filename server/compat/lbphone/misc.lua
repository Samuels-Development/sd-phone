---@type table Shared shim helpers (server.compat.lbphone.shared): export registration + warn-once.
local shim = require 'server.compat.lbphone.shared'
---@type table Authoritative banking handlers (server.banking.actions): external transaction log.
local banking = require 'server.banking.actions'
---@type table Settings persistence layer (server.settings.store): number -> citizenid resolution.
local settings = require 'server.settings.store'
---@type table Shared server helpers (server.util): digit/trim/finite guards at the shim boundary.
local util = require 'server.util'

local registerLbExport, stubLbExport = shim.registerLbExport, shim.stubLbExport

---FormatNumber(number): returns the digit-normalised number.
registerLbExport('FormatNumber', function(number)
    return util.digits(number)
end)

---ContainsBlacklistedWord(source, text): always false; sd-phone has no word blacklist.
registerLbExport('ContainsBlacklistedWord', function(_source, _text)
    return false
end)

---AddTransaction(phoneNumber, amount, company, logo?): appends a log-only Wallet row for the
---number's owner via actions.addExternal; `amount` is signed, incoming amounts notify, the logo drops.
registerLbExport('AddTransaction', function(phoneNumber, amount, company, logo)
    local cid = settings.getCitizenByNumber(phoneNumber)
    if not cid then return false end
    local n = tonumber(amount)
    if not util.finite(n) then return false end

    local label = util.trim(type(company) == 'number' and tostring(company) or company)
    if label == '' then label = 'Transaction' end

    return banking.addExternal(cid, {
        label        = label,
        amount       = n,
        counterparty = label,
        notify       = n > 0,
    })
end)

-- Misc surfaces with no sd-phone equivalent; GetConfig/GetCellTowers answer with empty tables.
stubLbExport('GetConfig', {})
stubLbExport('GetCellTowers', {})
stubLbExport('AirShare', nil)
stubLbExport('AddCheck', 0, 'is not supported; use exports["sd-phone"]:setDisabled(true) on the client instead')
stubLbExport('RemoveCheck', false, 'is not supported; use exports["sd-phone"]:setDisabled(false) on the client instead')

-- Social media: none of lb's remote mutation surface is bridged.
stubLbExport('GetSocialMediaUsername', nil)
stubLbExport('ToggleVerified', false)
stubLbExport('IsVerified', false)
stubLbExport('ChangePassword', false)
stubLbExport('PostBirdy', false)
stubLbExport('GetBirdyPost', nil)
stubLbExport('DeleteBirdyAccount', false)
stubLbExport('DeleteInstaPicAccount', false)
stubLbExport('DeleteTrendyAccount', false)

-- DarkChat: sd-phone's darkchat is its own system with no external mutation surface.
stubLbExport('SendDarkChatMessage', false)
stubLbExport('SendDarkChatLocation', false)
stubLbExport('CreateDarkChatChannel', false)
stubLbExport('DeleteDarkChatChannel', false)
stubLbExport('AddUserToDarkChatChannel', false)
stubLbExport('RemoveUserFromDarkChatChannel', false)

-- Crypto: sd-phone has no crypto wallet.
stubLbExport('AddCrypto', false)
stubLbExport('RemoveCrypto', false)
stubLbExport('AddCustomCoin', nil)
stubLbExport('GetCoin', nil)
stubLbExport('GetOwnedCoin', false)

-- lb-phone's custom callback wire and the custom-app ecosystem built on it are not bridged.
stubLbExport('RegisterCallback', nil, 'is not bridged: the lb-phone callback wire and custom-app ecosystem are out of scope')
stubLbExport('BaseCallback', nil, 'is not bridged: the lb-phone callback wire and custom-app ecosystem are out of scope')
stubLbExport('TriggerClientCallback', nil, 'is not bridged: the lb-phone callback wire and custom-app ecosystem are out of scope')
stubLbExport('AwaitClientCallback', nil, 'is not bridged: the lb-phone callback wire and custom-app ecosystem are out of scope')
