---@type table Shared server helpers (server.util): envelopes, clamping, TINYINT reads.
local util = require 'server.util'
---@type table Framework record bridge (bridge.server.records): read-only citizen reads.
local frameworkRecords = require 'bridge.server.records'
---@type table MDT permission layer (server.mdt.access): gated wrapper and identity.
local access = require 'server.mdt.access'
---@type table MDT persistence (server.mdt.store): the audit write.
local store = require 'server.mdt.store'

---@type table Phone module; the table returned at end of file. A forensic read of one citizen's
---handset for the police terminal: everything the device itself holds, and nothing that would
---require anything but the handset to obtain.
local phone = {}

---@type integer Rows returned per page by every paginated read here.
local PAGE_SIZE = 30
---@type integer Highest page number a client may ask for.
local MAX_PAGE = 400
---@type integer Rows a summary counts up to, so a count never walks a million-row table.
local COUNT_CAP = 5000

---@param value any
---@return integer
local function pageOf(value)
    return lib.math.clamp(math.floor(tonumber(value) or 1), 1, MAX_PAGE)
end

---The citizenid a payload is asking about, or nil when it is not a usable id.
---@param payload table
---@return string|nil
local function subjectOf(payload)
    return util.limitedString(payload.citizenid, 64)
end

---An empty page in the shape every list handler here returns.
---@return table
local function emptyPage()
    return { rows = {}, total = 0, page = 1, pageSize = PAGE_SIZE }
end

---Wraps rows and a total in the paging envelope the panes expect.
---@param rows table[]
---@param total any
---@param page integer
---@return table
local function paged(rows, total, page)
    return { rows = rows or {}, total = tonumber(total) or 0, page = page, pageSize = PAGE_SIZE }
end

---The handset's own number, read from the owner's settings row.
---@param citizenid string
---@return string|nil
local function numberOf(citizenid)
    return MySQL.scalar.await('SELECT phone_number FROM phone_settings WHERE citizenid = ?', { citizenid })
end

---Counts rows for a citizen, capped so a summary never scans an unbounded table.
---@param sql string a COUNT query with one `?` for the citizenid
---@param citizenid string
---@return integer
local function countFor(sql, citizenid)
    local n = MySQL.scalar.await(sql, { citizenid, COUNT_CAP })
    return tonumber(n) or 0
end

---Resolves numbers to the citizens who hold them, so a call log reads as names rather than digits.
---@param numbers string[]
---@return table<string, { citizenid: string, name: string }>
local function ownersOf(numbers)
    local out = {}
    if #numbers == 0 then return out end

    local marks = string.rep('?,', #numbers):sub(1, -2)
    local rows = MySQL.query.await(
        ('SELECT citizenid, phone_number FROM phone_settings WHERE phone_number IN (%s)'):format(marks),
        numbers) or {}

    local cids = {}
    for i = 1, #rows do cids[i] = rows[i].citizenid end
    local names = frameworkRecords.namesFor(cids) or {}

    for i = 1, #rows do
        local row = rows[i]
        out[tostring(row.phone_number)] = {
            citizenid = row.citizenid,
            name      = names[row.citizenid] or '',
        }
    end
    return out
end

---The handset itself: who it is registered to, what it holds, and who it refuses.
phone.summary = access.gated('phone.view', function(_, payload, me)
    local citizenid = subjectOf(payload)
    if not citizenid then return util.fail('mdt.noCitizenGiven', 'No citizen given') end

    local number = numberOf(citizenid)
    if not number then
        return util.ok({ device = nil })
    end

    local sim = MySQL.single.await(
        'SELECT number, identity, owner_cid, adopted_by, created_at FROM phone_sim_cards WHERE number = ?',
        { number })

    local blocked = MySQL.query.await(
        'SELECT number, created_at FROM phone_blocked WHERE citizenid = ? ORDER BY created_at DESC LIMIT 100',
        { citizenid }) or {}

    local settings = MySQL.single.await(
        'SELECT card_name, card_email, card_address, installed_apps, locale, updated_at FROM phone_settings WHERE citizenid = ?',
        { citizenid }) or {}

    local apps = 0
    if type(settings.installed_apps) == 'string' then
        local ok, list = pcall(json.decode, settings.installed_apps)
        if ok and type(list) == 'table' then apps = #list end
    end

    -- One audit row per handset opened, not per tab paged through: the meaningful event is that
    -- this officer looked at this person's phone.
    store.audit(me, 'phone.view', 'person', citizenid, { number = number })

    return util.ok({
        device = {
            number   = number,
            name     = settings.card_name or '',
            email    = settings.card_email or '',
            address  = settings.card_address or '',
            locale   = settings.locale or '',
            apps     = apps,
            lastSeen = settings.updated_at,
            sim      = sim and {
                identity = sim.identity,
                owner    = sim.owner_cid,
                adopted  = sim.adopted_by,
                since    = sim.created_at,
            } or nil,
        },
        counts = {
            contacts = countFor('SELECT COUNT(*) FROM (SELECT 1 FROM phone_contacts WHERE citizenid = ? LIMIT ?) c', citizenid),
            calls    = countFor('SELECT COUNT(*) FROM (SELECT 1 FROM phone_calls WHERE citizenid = ? LIMIT ?) c', citizenid),
            photos   = countFor('SELECT COUNT(*) FROM (SELECT 1 FROM phone_photos WHERE citizenid = ? LIMIT ?) c', citizenid),
            notes    = countFor('SELECT COUNT(*) FROM (SELECT 1 FROM phone_notes WHERE citizenid = ? LIMIT ?) c', citizenid),
            memos    = countFor('SELECT COUNT(*) FROM (SELECT 1 FROM phone_voice_memos WHERE citizenid = ? LIMIT ?) c', citizenid),
        },
        blocked = blocked,
    })
end)

---The address book, newest first.
phone.contacts = access.gated('phone.view', function(_, payload)
    local citizenid = subjectOf(payload)
    if not citizenid then return util.ok(emptyPage()) end
    local page = pageOf(payload.page)

    local total = MySQL.scalar.await('SELECT COUNT(*) FROM phone_contacts WHERE citizenid = ?', { citizenid })
    local rows = MySQL.query.await([[
        SELECT name, phone, email, favorite, created_at
        FROM phone_contacts WHERE citizenid = ?
        ORDER BY favorite DESC, name ASC LIMIT ? OFFSET ?
    ]], { citizenid, PAGE_SIZE, (page - 1) * PAGE_SIZE }) or {}

    for i = 1, #rows do rows[i].favorite = util.truthy(rows[i].favorite) end
    return util.ok(paged(rows, total, page))
end)

---The call log, newest first, with the other party resolved to a citizen where the number is known.
phone.calls = access.gated('phone.view', function(_, payload)
    local citizenid = subjectOf(payload)
    if not citizenid then return util.ok(emptyPage()) end
    local page = pageOf(payload.page)

    local total = MySQL.scalar.await('SELECT COUNT(*) FROM phone_calls WHERE citizenid = ?', { citizenid })
    local rows = MySQL.query.await([[
        SELECT number, name, direction, duration, called_at
        FROM phone_calls WHERE citizenid = ?
        ORDER BY called_at DESC LIMIT ? OFFSET ?
    ]], { citizenid, PAGE_SIZE, (page - 1) * PAGE_SIZE }) or {}

    local numbers = {}
    for i = 1, #rows do numbers[#numbers + 1] = tostring(rows[i].number) end
    local owners = ownersOf(numbers)

    for i = 1, #rows do
        local hit = owners[tostring(rows[i].number)]
        rows[i].ownerCid  = hit and hit.citizenid or nil
        rows[i].ownerName = hit and hit.name or nil
    end
    return util.ok(paged(rows, total, page))
end)

---Message threads on the handset, most recent first. The mailbox holds one row per participant
---keyed by the other party's number, so a thread is a `conversation` group rather than a channel.
phone.threads = access.gated('phone.view', function(_, payload)
    local citizenid = subjectOf(payload)
    if not citizenid then return util.ok(emptyPage()) end
    local page = pageOf(payload.page)

    local total = MySQL.scalar.await(
        'SELECT COUNT(DISTINCT conversation) FROM phone_messages WHERE citizenid = ?', { citizenid })
    local rows = MySQL.query.await([[
        SELECT conversation,
               COUNT(*)            AS messages,
               MAX(created_at)     AS last_at,
               SUBSTRING_INDEX(GROUP_CONCAT(body ORDER BY created_at DESC SEPARATOR '\n'), '\n', 1) AS last_body
        FROM phone_messages WHERE citizenid = ?
        GROUP BY conversation
        ORDER BY last_at DESC LIMIT ? OFFSET ?
    ]], { citizenid, PAGE_SIZE, (page - 1) * PAGE_SIZE }) or {}

    local numbers = {}
    for i = 1, #rows do numbers[#numbers + 1] = tostring(rows[i].conversation) end
    local owners = ownersOf(numbers)

    for i = 1, #rows do
        local hit = owners[tostring(rows[i].conversation)]
        rows[i].id                     = rows[i].conversation
        rows[i].isGroup                = false
        rows[i].name                   = hit and hit.name or nil
        rows[i].last_message           = rows[i].last_body
        rows[i].last_message_timestamp = rows[i].last_at
        rows[i].members = { {
            number = rows[i].conversation,
            name   = hit and hit.name or nil,
            cid    = hit and hit.citizenid or nil,
        } }
        rows[i].last_body = nil
        rows[i].last_at = nil
    end
    return util.ok(paged(rows, total, page))
end)

---One thread, newest first. Scoped to the subject's own mailbox, so it can only ever return
---messages that handset actually holds a copy of.
phone.thread = access.gated('phone.view', function(_, payload)
    local citizenid = subjectOf(payload)
    local conversation = util.limitedString(payload.channelId, 64)
    if not citizenid or not conversation then return util.ok(emptyPage()) end

    local page = pageOf(payload.page)
    local total = MySQL.scalar.await(
        'SELECT COUNT(*) FROM phone_messages WHERE citizenid = ? AND conversation = ?',
        { citizenid, conversation })
    local rows = MySQL.query.await([[
        SELECT id, sender, direction, kind, body, created_at
        FROM phone_messages WHERE citizenid = ? AND conversation = ?
        ORDER BY created_at DESC LIMIT ? OFFSET ?
    ]], { citizenid, conversation, PAGE_SIZE, (page - 1) * PAGE_SIZE }) or {}

    local numbers = {}
    for i = 1, #rows do numbers[#numbers + 1] = tostring(rows[i].sender) end
    local owners = ownersOf(numbers)

    for i = 1, #rows do
        local hit = owners[tostring(rows[i].sender)]
        rows[i].outgoing    = rows[i].direction == 'outgoing'
        rows[i].senderName  = hit and hit.name or nil
        rows[i].content     = rows[i].body
        rows[i].timestamp   = rows[i].created_at
        rows[i].attachments = rows[i].kind ~= 'text' and rows[i].kind or nil
        rows[i].body = nil
        rows[i].created_at = nil
    end
    return util.ok(paged(rows, total, page))
end)

---The camera roll and the voice memos, newest first.
phone.media = access.gated('phone.view', function(_, payload)
    local citizenid = subjectOf(payload)
    if not citizenid then return util.ok(emptyPage()) end
    local page = pageOf(payload.page)

    local total = MySQL.scalar.await('SELECT COUNT(*) FROM phone_photos WHERE citizenid = ?', { citizenid })
    local rows = MySQL.query.await([[
        SELECT id, url, created_at FROM phone_photos WHERE citizenid = ?
        ORDER BY created_at DESC LIMIT ? OFFSET ?
    ]], { citizenid, PAGE_SIZE, (page - 1) * PAGE_SIZE }) or {}

    local memos = MySQL.query.await([[
        SELECT id, name, url, duration, created_at FROM phone_voice_memos WHERE citizenid = ?
        ORDER BY created_at DESC LIMIT 50
    ]], { citizenid }) or {}

    local out = paged(rows, total, page)
    out.memos = memos
    return util.ok(out)
end)

---Decodes one of the notes JSON array columns, dropping anything that is not a string.
---@param raw any
---@param limit integer most entries to keep
---@return string[]
local function decodeArr(raw, limit)
    if type(raw) ~= 'string' or #raw < 3 then return {} end
    local ok, list = pcall(json.decode, raw)
    if not ok or type(list) ~= 'table' then return {} end
    local out = {}
    for i = 1, #list do
        if type(list[i]) == 'string' and list[i] ~= '' then
            out[#out + 1] = list[i]
            if #out >= limit then break end
        end
    end
    return out
end

---Notes, newest first. Image entries are hosted URLs so they ride along; sketches are
---phone-screen PNG data URLs of up to a megabyte each, so a page of thirty would be tens of
---megabytes over NUI. Only their count travels here, and `phone.note` fetches the one that is
---actually opened.
phone.notes = access.gated('phone.view', function(_, payload)
    local citizenid = subjectOf(payload)
    if not citizenid then return util.ok(emptyPage()) end
    local page = pageOf(payload.page)

    local total = MySQL.scalar.await('SELECT COUNT(*) FROM phone_notes WHERE citizenid = ?', { citizenid })
    local rows = MySQL.query.await([[
        SELECT id, body, sketches, images, created_at, updated_at
        FROM phone_notes WHERE citizenid = ?
        ORDER BY updated_at DESC LIMIT ? OFFSET ?
    ]], { citizenid, PAGE_SIZE, (page - 1) * PAGE_SIZE }) or {}

    for i = 1, #rows do
        local sketches = decodeArr(rows[i].sketches, 24)
        rows[i].images     = decodeArr(rows[i].images, 24)
        rows[i].sketches   = nil
        rows[i].sketchCount = #sketches
        rows[i].hasImage   = #rows[i].images > 0
        rows[i].hasSketch  = #sketches > 0
    end
    return util.ok(paged(rows, total, page))
end)

---The sketches on one note, fetched only when that note is opened.
phone.note = access.gated('phone.view', function(_, payload)
    local citizenid = subjectOf(payload)
    local id = util.limitedString(payload.id, 64)
    if not citizenid or not id then return util.ok({ sketches = {} }) end

    local row = MySQL.single.await(
        'SELECT sketches FROM phone_notes WHERE citizenid = ? AND id = ?', { citizenid, id })
    return util.ok({ sketches = row and decodeArr(row.sketches, 8) or {} })
end)

---Accounts the handset is signed in to: the mailbox, and every app account it holds.
phone.accounts = access.gated('phone.view', function(_, payload)
    local citizenid = subjectOf(payload)
    if not citizenid then return util.ok({ mail = {}, apps = {} }) end

    local mail = MySQL.query.await([[
        SELECT email, display_name, created_at FROM phone_mail_accounts WHERE created_by_cid = ?
        ORDER BY created_at ASC LIMIT 20
    ]], { citizenid }) or {}

    -- Credentials are never selected: an account's existence is the finding, its password is not.
    local apps = MySQL.query.await([[
        SELECT a.app, a.username, a.display_name, a.created_at
        FROM phone_app_sessions s
        JOIN phone_app_accounts a ON a.id = s.account_id
        WHERE s.citizenid = ?
        ORDER BY a.app ASC, a.username ASC LIMIT 50
    ]], { citizenid }) or {}

    return util.ok({ mail = mail, apps = apps })
end)

return phone
