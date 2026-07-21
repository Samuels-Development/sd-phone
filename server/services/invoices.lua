---@type table sd-phone config root (configs/config.lua).
local config      = require 'configs.config'
---@type table Business-invoices store (server.services.invoicestore): the phone_service_invoices rows.
local store       = require 'server.services.invoicestore'
---@type table Society bridge (bridge.server.society): company account credit + name resolution.
local society     = require 'bridge.server.society'
---@type table Banking bridge (bridge.server.banking): the target's personal bank debit + credit.
local bank        = require 'bridge.server.banking'
---@type table Job bridge (bridge.server.job): current job/duty reads + the multijob capability probe.
local job         = require 'bridge.server.job'
---@type table Player bridge (bridge.server.player): citizenid/name/source lookups.
local player      = require 'bridge.server.player'
---@type table Settings store (server.settings.store): phone-number ownership lookups.
local settings    = require 'server.settings.store'
---@type table Banking actions (server.banking.actions): log-only Wallet entries for both sides.
local bankActions = require 'server.banking.actions'
---@type table Shared server helpers (server.util): envelope constructors + string/number guards.
local util        = require 'server.util'

---@type table Services config (configs/services.lua).
local SV       = config.Services
---@type table[] Configured company entries (SV.Companies).
local COMPANIES = SV.Companies or {}
---@type integer Smallest invoice amount.
local MIN      = SV.MinInvoiceAmount or 1
---@type integer Largest invoice amount.
local MAX_AMT  = SV.MaxInvoiceAmount or 1000000
---@type integer Cap on how many rows the sent/received lists return.
local LIST_CAP = 50

---@type table<string, table> Company config entry by job name, for O(1) directory-metadata lookups.
local byJob = {}
for _, c in ipairs(COMPANIES) do byJob[c.job] = c end

-- Jobs that never count as employment for invoicing (unemployed is always included).
---@type table<string, boolean>
local BLACKLIST = {}
for _, j in ipairs(SV.JobBlacklist or { 'unemployed' }) do BLACKLIST[j] = true end
BLACKLIST[SV.UnemployedJob or 'unemployed'] = true

local ok, fail, digits, trim, finite = util.ok, util.fail, util.digits, util.trim, util.finite

---@type table Invoices module; every handler returns the { success, data?, message? } envelope. The
---table returned at end of file.
local invoices = {}

---Formats an amount as "$1,234" with thousands separators, sign dropped, for notification copy.
---@param amount number
---@return string
local function formatMoney(amount)
    local s = tostring(math.floor(math.abs(tonumber(amount) or 0)))
    local k
    repeat s, k = s:gsub('^(%d+)(%d%d%d)', '%1,%2') until k == 0
    return '$' .. s
end

---A business's display label: the configured company label, then the framework label, then the
---raw job name.
---@param jobName string
---@return string
local function labelOf(jobName)
    local e = byJob[jobName]
    if e then return e.label end
    return job.getLabel(jobName) or jobName
end

---Resolves the caller's active business for invoicing. Succeeds only on a duty-capable framework
---(QBCore/QBox) when the caller holds a real (non-blacklisted) job and is on duty. Returns
---`(jobName, citizenid)` on success, `(nil, errorMessage)` otherwise.
---@param src number
---@return string|nil jobName, string citizenidOrError
local function requireOnDutyBusiness(src)
    if not job.supportsMultijob() then return nil, 'Not available here' end
    local cid = player.getIdentifier(src)
    if not cid then return nil, 'Player not found' end
    local myJob = job.getName(src)
    if not myJob or BLACKLIST[myJob] then return nil, "You're not in a job" end
    if job.getDuty(src) ~= true then return nil, 'You must be on duty to do that' end
    return myJob, cid
end

---Pushes a live "re-pull your invoices" nudge to every online member of a business.
---@param jobName string
local function notifyBusiness(jobName)
    if not jobName or BLACKLIST[jobName] then return end
    for _, tsrc in pairs(player.onlineCidMap()) do
        if job.getName(tsrc) == jobName then
            TriggerClientEvent('sd-phone:client:services:invoices', tsrc, {})
        end
    end
end

---Shapes one invoice row for the business's sent list.
---@param r table phone_service_invoices row
---@return table
local function shapeSent(r)
    return {
        id       = r.id,
        amount   = tonumber(r.amount) or 0,
        note     = r.note or '',
        status   = r.status or 'pending',
        toName   = (r.target_name and r.target_name ~= '') and r.target_name or util.formatNumber(r.target_number or ''),
        toNumber = r.target_number or '',
        from     = (r.sender_name and r.sender_name ~= '') and r.sender_name or '',
        ts       = (tonumber(r.created_at) or 0) * 1000,
        paidAt   = r.paid_at and (tonumber(r.paid_at) * 1000) or nil,
    }
end

---Shapes one pending invoice row for the target's received list (Banking).
---@param r table phone_service_invoices row
---@return table
local function shapeReceived(r)
    local e = byJob[r.job]
    return {
        id     = r.id,
        job    = r.job,
        label  = (r.label and r.label ~= '') and r.label or labelOf(r.job),
        color  = (e and e.color) or '#0A84FF',
        emoji  = (e and e.emoji) or '💼',
        amount = tonumber(r.amount) or 0,
        note   = r.note or '',
        status = r.status or 'pending',
        from   = (r.sender_name and r.sender_name ~= '') and r.sender_name or '',
        ts     = (tonumber(r.created_at) or 0) * 1000,
    }
end

---Returns the invoices sent from the caller's business, newest first. Read-only; returns an empty
---list (never an error) when the caller isn't an employee or the framework can't do multijob, so
---the section renders cleanly.
---@param src number
---@return table
function invoices.list(src)
    if not job.supportsMultijob() then return ok({ invoices = {} }) end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end
    local myJob = job.getName(src)
    if not myJob or BLACKLIST[myJob] then return ok({ invoices = {} }) end

    local out = {}
    for _, r in ipairs(store.listByJob(myJob, LIST_CAP)) do out[#out + 1] = shapeSent(r) end
    return ok({ invoices = out })
end

---Creates an invoice from the caller's business to the owner of a phone number. Trust boundary:
---the caller must be an on-duty employee, the amount a positive integer within the configured
---bounds, and the target an existing character other than the caller.
---@param src number
---@param payload { number?: string, amount?: number, note?: string }
---@return table
function invoices.create(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local myJob, cidOrErr = requireOnDutyBusiness(src)
    if not myJob then return fail(cidOrErr) end
    local cid = cidOrErr

    local amount = tonumber(payload.amount)
    if not finite(amount) then return fail('Enter a valid amount') end
    amount = math.floor(amount)
    if amount < MIN then return fail('Enter a valid amount') end
    if amount > MAX_AMT then return fail('That amount is too large') end

    local number = digits(payload.number)
    if number == '' then return fail('Enter a recipient number') end

    local myNumber = digits(settings.ensurePhoneNumber(cid) or '')
    if number == myNumber then return fail("You can't invoice yourself") end

    local targetCid = settings.getCitizenByNumber(number)
    if not targetCid then return fail('No one owns that number') end
    if targetCid == cid then return fail("You can't invoice yourself") end

    local note = trim(payload.note):sub(1, 140)

    local tsrc       = player.getSourceByIdentifier(targetCid)
    local targetName = tsrc and player.getName(tsrc) or (society.namesByCids({ targetCid })[targetCid])
    local label      = labelOf(myJob)

    local id = store.newId()
    store.insert({
        id           = id,
        job          = myJob,
        label        = label,
        senderCid    = cid,
        senderName   = player.getName(src),
        senderNumber = myNumber,
        targetCid    = targetCid,
        targetName   = targetName,
        targetNumber = number,
        amount       = amount,
        note         = note ~= '' and note or nil,
        createdAt    = os.time(),
    })

    if tsrc then
        TriggerClientEvent('sd-phone:client:notify', tsrc, {
            app = 'bank', appId = 'bank', title = label,
            body = ('%s sent you an invoice for %s.'):format(label, formatMoney(amount)),
            time = 'now',
        })
        TriggerClientEvent('sd-phone:client:services:invoices', tsrc, {})
    end

    ---First-party hook: fires once per created invoice; targetSource is nil when the target is offline.
    TriggerEvent('sd-phone:server:services:invoiceCreated', {
        id = id, source = src, job = myJob, label = label,
        senderCid = cid, senderNumber = myNumber,
        targetCid = targetCid, targetSource = tsrc, targetNumber = number,
        amount = amount, note = note, timestamp = os.time(),
    })

    notifyBusiness(myJob)
    return invoices.list(src)
end

---Cancels a pending invoice. The caller must be an on-duty employee of the business the invoice
---belongs to (the sender or a colleague). Idempotent against an already-settled invoice.
---@param src number
---@param payload { id?: string }
---@return table
function invoices.cancel(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local myJob, cidOrErr = requireOnDutyBusiness(src)
    if not myJob then return fail(cidOrErr) end

    local id  = tostring(payload.id or '')
    local inv = store.get(id)
    if not inv then return fail('Invoice not found') end
    if inv.job ~= myJob then return fail("That invoice isn't from your business") end
    if inv.status ~= 'pending' then return fail('That invoice is no longer pending') end
    if not store.markCancelled(id) then return fail('That invoice is no longer pending') end

    local tsrc = player.getSourceByIdentifier(inv.target_cid)
    if tsrc then TriggerClientEvent('sd-phone:client:services:invoices', tsrc, {}) end
    notifyBusiness(myJob)
    return invoices.list(src)
end

---Returns the pending invoices addressed to the caller. Read-only.
---@param src number
---@return table
function invoices.received(src)
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local out = {}
    for _, r in ipairs(store.listReceivedPending(cid, LIST_CAP)) do out[#out + 1] = shapeReceived(r) end
    return ok({ invoices = out })
end

---Pays a pending invoice addressed to the caller. Target-initiated only: re-checks ownership,
---pending status (atomically) and funds server-side, debits the payer's bank, then credits the
---business society account (or the sending employee's own bank when no society bank exists).
---@param src number
---@param payload { id?: string }
---@return table
function invoices.pay(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local id  = tostring(payload.id or '')
    local inv = store.get(id)
    if not inv then return fail('Invoice not found') end
    if inv.target_cid ~= cid then return fail('That invoice is not yours') end
    if inv.status ~= 'pending' then return fail('That invoice is no longer pending') end

    local amount = math.floor(tonumber(inv.amount) or 0)
    if amount <= 0 then return fail('Invalid invoice') end

    local balance = bank.getBalance(src) or 0
    if balance < amount then return fail('Insufficient funds') end

    local label = (inv.label and inv.label ~= '') and inv.label or labelOf(inv.job)

    -- Flip pending -> paid first: the atomic guard means a second concurrent pay loses here,
    -- before any money moves.
    if not store.markPaid(id, os.time()) then return fail('That invoice is no longer pending') end

    bank.removeMoney(src, amount, ('Invoice · %s'):format(label))

    local credited, viaSociety = false, false
    if society.available() then
        credited   = society.addMoney(inv.job, amount, ('Invoice from %s'):format(inv.sender_number or ''))
        viaSociety = credited
    end
    if not credited then
        local ssrc = player.getSourceByIdentifier(inv.sender_cid)
        if ssrc then
            bank.addMoney(ssrc, amount, ('Invoice payment · %s'):format(label))
            credited = true
        else
            credited = bank.addOffline(inv.sender_cid, amount)
        end
    end

    if not credited then
        -- Payout leg failed: refund the payer and put the invoice back to pending.
        bank.addMoney(src, amount, 'Invoice refund')
        store.revertToPending(id)
        return fail('Could not complete the payment')
    end

    -- Phone Wallet log for both sides (log-only; the money already moved above).
    bankActions.addExternal(inv.target_cid, {
        label = ('Invoice · %s'):format(label), amount = -amount,
        category = 'services', counterparty = inv.sender_number,
    })
    if not viaSociety then
        bankActions.addExternal(inv.sender_cid, {
            label    = ('Invoice paid · %s'):format(inv.target_name or util.formatNumber(inv.target_number or '')),
            amount   = amount,
            category = 'income',
        })
    end

    local ssrc = player.getSourceByIdentifier(inv.sender_cid)
    if ssrc then
        TriggerClientEvent('sd-phone:client:notify', ssrc, {
            app = 'services', appId = 'services', title = label,
            body = ('%s paid your invoice for %s.'):format(inv.target_name or 'A customer', formatMoney(amount)),
            time = 'now',
        })
    end
    notifyBusiness(inv.job)

    ---First-party hook: fires once per paid invoice; viaSociety tells whether the business account
    ---or the sender's personal bank received the money.
    TriggerEvent('sd-phone:server:services:invoicePaid', {
        id = id, job = inv.job, label = label,
        senderCid = inv.sender_cid, targetCid = inv.target_cid, targetSource = src,
        amount = amount, viaSociety = viaSociety, timestamp = os.time(),
    })

    return ok({ balance = bank.getBalance(src) or (balance - amount), invoices = invoices.received(src).data.invoices })
end

return invoices
