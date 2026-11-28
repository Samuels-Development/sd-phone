---@type table Shared shim helpers (server.compat.qbphone.shared): registration and identities.
local shim = require 'server.compat.qbphone.shared'
---@type table sd-phone config root (configs/config.lua): configured company labels.
local config = require 'configs.config'
---@type table Business-invoices store (server.services.invoicestore): the Wallet invoice rows.
local store = require 'server.services.invoicestore'
---@type table Settings persistence layer (server.settings.store): sender and recipient numbers.
local settings = require 'server.settings.store'
---@type table Job bridge (bridge.server.job): framework job labels.
local job = require 'bridge.server.job'
---@type table Player bridge (bridge.server.player): recipient display names.
local player = require 'bridge.server.player'
---@type table Shared server helpers (server.util): per-player cooldown.
local util = require 'server.util'

---@type string Prefix that marks a Wallet invoice imported from a phone_invoices row. It keeps the
---Wallet's own `bill_` shape, so the reference code on both wallets reads Q plus the qb-phone id.
local PREFIX = 'bill_q'
---@type integer Rows imported per query; a sweep pages until it runs dry.
local PAGE = 200
---@type integer Gap between background sweeps, in ms. Scripts that bill an offline player fire no
---client event, so this is what picks their rows up.
local SWEEP_MS = 30000
---@type integer Minimum gap between client-requested sweeps, per player.
local REQUEST_GAP_MS = 2000

---@type table<string, string> Configured company label by job name.
local companyLabel = {}
for _, c in ipairs(config.Services.Companies or {}) do companyLabel[c.job] = c.label end

---@type integer Highest phone_invoices id already looked at this session.
local lastId = 0
---@type boolean Whether a sweep is running, so overlapping requests do not import a row twice.
local sweeping = false

---Formats a whole-dollar amount the way the Wallet shows it.
---@param amount number
---@return string
local function money(amount)
    return '$' .. lib.math.groupdigits(math.floor(amount), ',')
end

---Imports one phone_invoices row as a Wallet invoice. A row already imported is skipped, and one
---whose Wallet invoice was cancelled is removed so other scripts stop seeing it as owed.
---@param row table phone_invoices row
local function import(row)
    local id = PREFIX .. tostring(row.id)
    local existing = store.get(id)
    if existing then
        if existing.status == 'cancelled' then
            MySQL.update.await('DELETE FROM phone_invoices WHERE id = ?', { row.id })
        end
        return
    end

    local amount = math.floor(tonumber(row.amount) or 0)
    local billed = shim.text(row.citizenid)
    if amount <= 0 or billed == '' then return end

    local society = shim.text(row.society)
    local jobName = society ~= '' and society or nil
    local senderName = shim.text(row.sender)
    local target, tsrc = shim.identityOf(billed)
    local sender = shim.text(row.sendercitizenid)
    local senderIdentity = sender ~= '' and (shim.identityOf(sender)) or ''
    local label = jobName and (companyLabel[jobName] or job.getLabel(jobName) or jobName) or senderName

    store.insert({
        id           = id,
        job          = jobName,
        label        = label,
        senderCid    = senderIdentity,
        senderName   = senderName ~= '' and senderName or nil,
        senderNumber = senderIdentity ~= '' and settings.getPhoneNumber(senderIdentity) or nil,
        targetCid    = target,
        targetName   = tsrc and player.getName(tsrc) or nil,
        targetNumber = settings.getPhoneNumber(target),
        amount       = amount,
        note         = shim.text(row.reason) ~= '' and shim.text(row.reason):sub(1, 140) or nil,
        createdAt    = os.time(),
    })

    if tsrc then
        local shown = money(amount)
        TriggerClientEvent('sd-phone:client:notify', tsrc, {
            app = 'bank', appId = 'bank', title = label,
            bodyKey = 'services.sentYouInvoice', body = ('%s sent you an invoice for %s.'):format(label, shown),
            bodyVars = { name = label, amount = shown },
            time = 'now',
        })
        TriggerClientEvent('sd-phone:client:services:invoices', tsrc)
    end
end

---Imports every phone_invoices row past `from`, paging until the table runs dry.
---@param from integer phone_invoices id to start after
local function sweep(from)
    if sweeping then return end
    sweeping = true
    local ok, err = pcall(function()
        local after = from
        while true do
            local rows = MySQL.query.await('SELECT * FROM phone_invoices WHERE id > ? ORDER BY id ASC LIMIT ?',
                { after, PAGE }) or {}
            for i = 1, #rows do
                import(rows[i])
                after = rows[i].id
            end
            if after > lastId then lastId = after end
            if #rows < PAGE then break end
        end
    end)
    sweeping = false

    if not ok then
        shim.warnOnce('billing.sweep', ('importing phone_invoices failed: %s'):format(err))
    end
end

---Creates qb-phone's invoice table when it is missing, so a script inserting into it still works on
---a server that never ran qb-phone. Then imports every row once, and new ones on an interval.
CreateThread(function()
    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS phone_invoices (
            id              INT(10)      NOT NULL AUTO_INCREMENT,
            citizenid       VARCHAR(50)  DEFAULT NULL,
            amount          INT(11)      NOT NULL DEFAULT 0,
            society         TINYTEXT     DEFAULT NULL,
            sender          VARCHAR(50)  DEFAULT NULL,
            sendercitizenid VARCHAR(50)  DEFAULT NULL,
            candecline      INT(1)       NOT NULL DEFAULT 1,
            reason          VARCHAR(256) DEFAULT NULL,
            PRIMARY KEY (id),
            KEY citizenid (citizenid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
    Wait(5000)
    if shim.stopped then return end
    sweep(0)
    while not shim.stopped do
        Wait(SWEEP_MS)
        if not shim.stopped then sweep(lastId) end
    end
end)

---The client half's relay of AcceptorDenyInvoice and RefreshPhone: a script just billed this
---player, so new rows are imported now rather than on the next interval.
shim.onEvent('sd-phone:server:compat:qb:invoices', function()
    local cid = player.getRealIdentifier(source)
    if not cid or not util.cooldown(cid, 'qbphone:invoices', REQUEST_GAP_MS) then return end
    sweep(lastId)
end, true)

---Settles the phone_invoices row behind a paid Wallet invoice and tells listeners the way qb-phone
---did.
shim.onEvent('sd-phone:server:services:invoicePaid', function(data)
    local id = type(data) == 'table' and shim.text(data.id) or ''
    local qbId = tonumber(id:match('^' .. PREFIX .. '(%d+)$'))
    if not qbId then return end
    MySQL.update.await('DELETE FROM phone_invoices WHERE id = ?', { qbId })
    TriggerEvent('qb-phone:server:paidInvoice', data.targetSource, qbId)
end, false)
