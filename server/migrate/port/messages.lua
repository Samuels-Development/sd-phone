---@type table SMS porter (server.migrate.port.messages). Rebuilds lb-phone's channel-based threads
---as sd-phone's per-mailbox message copies: each message becomes one row per participating migrated
---player, keyed by that player's citizenid, with the conversation set to the peer's number (1:1) or
---'g-'..groupId (group). Group channels also seed a phone_message_groups row and its members.
---Historical copies are marked read; copy ids are derived from the lb-phone message id.
local M = {}

local store = require 'server.migrate.store'
local util  = require 'server.util'

local function digits(s) return (tostring(s or ''):gsub('%D', '')) end

---Trim and clamp to `n` chars, or nil when empty.
---@param s any
---@param n integer
---@return string|nil
local function clamp(s, n)
    local v = util.trim(s)
    if v == '' then return nil end
    return v:sub(1, n)
end

---Group a flat row list into { [channel_id] = { rows } }, preserving order.
---@param rows table[]
---@return table<any, table[]>
local function groupByChannel(rows)
    local out = {}
    for _, r in ipairs(rows) do
        local bucket = out[r.channel_id]
        if not bucket then bucket = {}; out[r.channel_id] = bucket end
        bucket[#bucket + 1] = r
    end
    return out
end

---The first attachment URL on a message, or nil when there is none.
---@param attachments string|nil JSON array as lb-phone stores it
---@return string|nil
local function firstAttachment(attachments)
    if not attachments or attachments == '' then return nil end
    local ok, arr = pcall(json.decode, attachments)
    if not ok or type(arr) ~= 'table' or not arr[1] then return nil end
    local first = arr[1]
    if type(first) == 'string' then return first end
    if type(first) == 'table' then return first.url or first.src end
    return nil
end

---@type string base64url alphabet, matching web/src/lib/waypointCode.ts.
local B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

---base64url without padding, so the client's decoder accepts it.
---@param data string
---@return string
local function b64url(data)
    local out, len = {}, #data
    for i = 1, len, 3 do
        local a, b, c = data:byte(i, i + 2)
        local n = a * 65536 + (b or 0) * 256 + (c or 0)
        local chunk = {
            B64:sub((n >> 18) + 1, (n >> 18) + 1),
            B64:sub(((n >> 12) & 63) + 1, ((n >> 12) & 63) + 1),
            b and B64:sub(((n >> 6) & 63) + 1, ((n >> 6) & 63) + 1) or '',
            c and B64:sub((n & 63) + 1, (n & 63) + 1) or '',
        }
        out[#out + 1] = table.concat(chunk)
    end
    return table.concat(out)
end

---An sd-phone shared-waypoint code for a world position. Mirrors encodeWaypoint in
---web/src/lib/waypointCode.ts: an `SDW1:` prefix over base64url of { l, x, y, i, c }.
---@param x number
---@param y number
---@return string
local function waypointCode(x, y)
    return 'SDW1:' .. b64url(json.encode({
        l = 'Shared location', x = lib.math.round(x), y = lib.math.round(y),
        i = 'MapPin', c = '#5c6cf3',
    }))
end

---Translates lb-phone's in-body markers into sd-phone message kinds.
---
---lb-phone encodes non-text messages as tokens inside the body (`<!CALL-NO-ANSWER!>`,
---`<!SENT-LOCATION-X=..Y=..!>`, `<!SENT-PAYMENT-500!>`, `<!REQUESTED-PAYMENT-500!>`,
---`<!AUDIO-MESSAGE-...!>`). Migrated as-is they render as that raw text in the conversation.
---There are around a million of them in a busy server's history.
---@param body string
---@return string|nil kind, string|nil newBody, table|nil meta
local function fromMarker(body)
    if not body:find('<!', 1, true) then return nil end

    if body:find('<!CALL-NO-ANSWER!>', 1, true) then
        -- sd-phone has no call kind; the Phone app owns call history. Keeping the entry as text
        -- preserves the place it held in the conversation.
        return 'text', 'Missed call', nil
    end

    local x, y = body:match('<!SENT%-LOCATION%-X=(-?[%d%.]+)Y=(-?[%d%.]+)!>')
    if x and y then
        return 'location', 'Shared location', { wpCode = waypointCode(tonumber(x), tonumber(y)) }
    end

    local requested = body:match('<!REQUESTED%-PAYMENT%-(%d+)!>')
    if requested then
        return 'money', '', { amount = math.floor(tonumber(requested)), requested = true }
    end

    local sent = body:match('<!SENT%-PAYMENT%-(%d+)!>')
    if sent then
        return 'money', '', { amount = math.floor(tonumber(sent)) }
    end

    local audio = body:match('<!AUDIO%-MESSAGE%-.-AUDIO="([^"]+)"')
    if audio then
        local secs = tonumber(body:match('DURATION="(%d+)"')) or 1
        return 'voice', '', { audio = audio:sub(1, 512), duration = math.max(1, math.floor(secs)) }
    end

    return nil
end

---Classifies a migrated message for sd-phone's chat renderer.
---
---An attachment used to be written into the body as a plain link, which rendered the raw URL in the
---conversation instead of the picture. sd-phone shows media as `kind = 'image'` with the URL in
---`meta.gifUrl`, so a message carrying one is emitted as that, keeping any text as the caption.
---@param content string|nil
---@param attachments string|nil
---@return string kind, string body, string|nil metaJson
local function shapeMessage(content, attachments)
    local text = content or ''

    local kind, newBody, meta = fromMarker(text)
    if kind then return kind, newBody or '', meta and json.encode(meta) or nil end

    local url = firstAttachment(attachments)
    if not url or url == '' then return 'text', text, nil end
    return 'image', text, json.encode({ gifUrl = tostring(url):sub(1, 512) })
end

---@param ctx table migration context (numberToCid, dryRun)
---@return { migrated: number, skipped: number, groups: number }
function M.run(ctx)
    if not store.lbSource('message_channels') then
        return { migrated = 0, skipped = 0, groups = 0 }
    end

    local membersByChannel  = groupByChannel(store.lbChannelMembers())
    local messagesByChannel = groupByChannel(store.lbMessages())

    local groupRows, memberRows, msgRows = {}, {}, {}
    local migrated, skipped, groupCount = 0, 0, 0

    for _, ch in ipairs(store.lbChannels()) do
        -- Resolve every channel member to { number, cid, isOwner }.
        local members = {}
        for _, m in ipairs(membersByChannel[ch.id] or {}) do
            local num = digits(m.phone_number)
            members[#members + 1] = { number = num, cid = ctx.numberToCid[num], isOwner = util.truthy(m.is_owner) }
        end

        local msgs = messagesByChannel[ch.id] or {}
        local isGroup = util.truthy(ch.is_group)
        ---@type (fun(m: table): string)|nil resolves a member's conversation key, or nil = skip channel
        local convForMember

        if isGroup then
            -- Owner: first member flagged owner with a cid, else the first member with a cid.
            local ownerCid
            for _, m in ipairs(members) do if m.isOwner and m.cid then ownerCid = m.cid break end end
            if not ownerCid then for _, m in ipairs(members) do if m.cid then ownerCid = m.cid break end end end

            if ownerCid then
                local gid = ('g%s'):format(ch.id)
                groupRows[#groupRows + 1] = { gid, clamp(ch.name, 64) or 'Group', ownerCid, math.floor(tonumber(ch.created_at) or 0) }
                groupCount = groupCount + 1
                -- Everyone who was in the thread is kept, not just the members who resolved to a
                -- character on this server. A dropped member leaves the group looking empty and
                -- their messages unattributed, because the roster is what names a sender. The
                -- citizenid column is NOT NULL and part of the key, so an unresolved member gets a
                -- synthetic one derived from their number; it can never collide with a real
                -- citizenid, and they show up under the number they had.
                for _, m in ipairs(members) do
                    local cid = m.cid or ('lb:%s'):format(m.number)
                    if m.number ~= '' then
                        memberRows[#memberRows + 1] = { gid, cid, m.number, m.number }
                    end
                end
                local convKey = 'g-' .. gid
                convForMember = function() return convKey end
            end
        elseif #members == 2 then
            -- 1:1: each member's conversation key is the other participant's number.
            convForMember = function(m)
                local other = (members[1] == m) and members[2] or members[1]
                return other.number
            end
        end

        if convForMember then
            for _, msg in ipairs(msgs) do
                local sender = digits(msg.sender)
                local mid = ('m%s'):format(msg.id)
                local ts = math.floor(tonumber(msg.ts) or 0)
                local kind, body, meta = shapeMessage(msg.content, msg.attachments)
                local copied = false
                for idx, m in ipairs(members) do
                    if m.cid then
                        local dir = (sender == m.number) and 'outgoing' or 'incoming'
                        msgRows[#msgRows + 1] = {
                            ('m%s_%d'):format(msg.id, idx), mid, m.cid, convForMember(m), sender,
                            dir, kind, body, meta, 1, 0, ts,
                        }
                        copied = true
                    end
                end
                if copied then migrated = migrated + 1 else skipped = skipped + 1 end
            end
        else
            skipped = skipped + #msgs
        end
    end

    if not ctx.dryRun then
        store.insertGroups(groupRows)
        store.insertGroupMembers(memberRows)
        store.insertMessages(msgRows)
    end
    return { migrated = migrated, skipped = skipped, groups = groupCount }
end

return M
