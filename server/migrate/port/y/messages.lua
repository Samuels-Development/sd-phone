---@type table Messages porter (server.migrate.port.y.messages). Copies YSeries channels, their
---members and every message into sd-phone, writing one mailbox copy per participant that resolves
---to a character, all correlated by a shared mid.
local M = {}

---@type table Migration SQL (server.migrate.store): group, member and message writers.
local store = require 'server.migrate.store'
---@type table YSeries source reads (server.migrate.ystore): paged table reads.
local ystore = require 'server.migrate.ystore'
---@type table Shared server helpers (server.util): trim + truthiness.
local util = require 'server.util'

---@type integer Channels processed per batch. Members and messages are fetched per batch of
---channels rather than whole-table, so a live server's 90k messages never land in Lua at once.
local CHANNEL_PAGE <const> = 400

---Trim and clamp to `n` chars, or nil when empty.
---@param s any
---@param n integer
---@return string|nil
local function clamp(s, n)
    local v = util.trim(s)
    if v == '' then return nil end
    return v:sub(1, n)
end

---The message kind and body for one YSeries row. Attachments arrive as a JSON blob that may hold a
---url or a full base64 data URI; only a url is carried across, because sd-phone's meta column holds
---a link and an inline image would be megabytes of base64 in a message row.
---@param content any
---@param attachments any
---@return string kind, string body, string|nil metaJson
local function shape(content, attachments)
    local body = util.trim(content)

    if type(attachments) == 'string' and attachments ~= '' then
        local ok, decoded = pcall(json.decode, attachments)
        if ok and type(decoded) == 'table' then
            local url = decoded.url or decoded.image or decoded.photo or decoded[1]
            if type(url) == 'table' then url = url.url or url.image end
            if type(url) == 'string' and url ~= '' and url:lower():sub(1, 5) ~= 'data:' and #url <= 1024 then
                return 'image', body, json.encode({ mediaUrl = url })
            end
            if type(url) == 'string' and url:lower():sub(1, 5) == 'data:' then
                return 'text', body ~= '' and body or '[photo]', nil
            end
        end
    end

    return 'text', body, nil
end

---Groups rows by their channel_id.
---@param rows table[]
---@return table<string, table[]>
local function byChannel(rows)
    local out = {}
    for _, r in ipairs(rows) do
        local bucket = out[r.channel_id]
        if not bucket then bucket = {}; out[r.channel_id] = bucket end
        bucket[#bucket + 1] = r
    end
    return out
end

---Reads the members and messages belonging to one batch of channels.
---@param ids string[] channel ids
---@return table<string, table[]> members, table<string, table[]> messages
local function loadBatch(ids)
    if #ids == 0 then return {}, {} end

    -- Placeholders, never interpolation: channel ids are YSeries' own strings, and %q is LUA
    -- escaping rather than SQL escaping, so formatting them into the query would be both wrong
    -- and injectable.
    local marks = {}
    for i = 1, #ids do marks[i] = '?' end
    local inClause = table.concat(marks, ',')

    local memberTbl = ystore.table('messages_members')
    local messageTbl = ystore.table('messages_messages')

    local members = memberTbl and MySQL.query.await((
        'SELECT channel_id, phone_number, is_owner FROM `%s` WHERE channel_id IN (%s) AND `deleted` = 0'
    ):format(memberTbl, inClause), ids) or {}

    local messages = messageTbl and MySQL.query.await((
        'SELECT id, channel_id, sender, content, attachments, UNIX_TIMESTAMP(`timestamp`) AS ts FROM `%s` WHERE channel_id IN (%s) ORDER BY id ASC'
    ):format(messageTbl, inClause), ids) or {}

    return byChannel(members), byChannel(messages)
end

---@param ctx table migration context (numberToCid, digits, dryRun, report)
---@return { migrated: number, skipped: number, groups: number }
function M.run(ctx)
    if not ystore.table('messages_channels') then
        return { migrated = 0, skipped = 0, groups = 0 }
    end

    local total = ystore.count('messages_channels')
    local migrated, skipped, groupCount, offset = 0, 0, 0, 0

    while true do
        local channels = ystore.page('messages_channels',
            '`channel_id`, `is_group`, `name`, UNIX_TIMESTAMP(`last_message_timestamp`) AS ts',
            offset, CHANNEL_PAGE, '`channel_id`')
        if #channels == 0 then break end
        offset = offset + #channels
        if ctx.report then ctx.report(offset, total) end

        local ids = {}
        for i = 1, #channels do ids[i] = channels[i].channel_id end
        local membersByChannel, messagesByChannel = loadBatch(ids)

        local groupRows, memberRows, msgRows = {}, {}, {}

        for _, ch in ipairs(channels) do
            local members = {}
            for _, m in ipairs(membersByChannel[ch.channel_id] or {}) do
                local num = ctx.digits(m.phone_number)
                members[#members + 1] = {
                    number = num, cid = ctx.numberToCid[num], isOwner = util.truthy(m.is_owner),
                }
            end

            local msgs = messagesByChannel[ch.channel_id] or {}
            local isGroup = util.truthy(ch.is_group)
            ---@type (fun(m: table): string)|nil
            local convForMember

            if isGroup then
                local ownerCid
                for _, m in ipairs(members) do if m.isOwner and m.cid then ownerCid = m.cid break end end
                if not ownerCid then for _, m in ipairs(members) do if m.cid then ownerCid = m.cid break end end end

                if ownerCid then
                    local gid = ('yg%s'):format(ch.channel_id)
                    groupRows[#groupRows + 1] = {
                        gid, clamp(ch.name, 64) or 'Group', ownerCid, math.floor(tonumber(ch.ts) or 0),
                    }
                    groupCount = groupCount + 1
                    -- Members who did not resolve to a character are kept under a synthetic id, or
                    -- the group reads as empty and their messages lose their sender name.
                    for _, m in ipairs(members) do
                        if m.number ~= '' then
                            memberRows[#memberRows + 1] = {
                                gid, m.cid or ('ys:%s'):format(m.number), m.number, m.number,
                            }
                        end
                    end
                    local convKey = 'g-' .. gid
                    convForMember = function() return convKey end
                end
            elseif #members == 2 then
                convForMember = function(m)
                    local other = (members[1] == m) and members[2] or members[1]
                    return other.number
                end
            end

            if convForMember then
                for _, msg in ipairs(msgs) do
                    local sender = ctx.digits(msg.sender)
                    local mid = ('ym%s'):format(msg.id)
                    local ts = math.floor(tonumber(msg.ts) or 0)
                    local kind, body, meta = shape(msg.content, msg.attachments)
                    local copied = false
                    for idx, m in ipairs(members) do
                        if m.cid then
                            local dir = (sender == m.number) and 'outgoing' or 'incoming'
                            msgRows[#msgRows + 1] = {
                                ('ym%s_%d'):format(msg.id, idx), mid, m.cid, convForMember(m), sender,
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
            if #groupRows > 0 then store.insertGroups(groupRows) end
            if #memberRows > 0 then store.insertGroupMembers(memberRows) end
            if #msgRows > 0 then store.insertMessages(msgRows) end
        end
    end

    return { migrated = migrated, skipped = skipped, groups = groupCount }
end

return M
