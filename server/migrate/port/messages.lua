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

---Best-effort body: keeps text as text and, when a message is attachment-only, surfaces the first
---attachment as a plain link.
---@param content string|nil
---@param attachments string|nil
---@return string|nil
local function bodyFor(content, attachments)
    if content and content ~= '' then return content end
    if attachments and attachments ~= '' then
        local ok, arr = pcall(json.decode, attachments)
        if ok and type(arr) == 'table' and arr[1] then
            local first = arr[1]
            if type(first) == 'string' then return first end
            if type(first) == 'table' then return first.url or first.src end
        end
    end
    return content
end

---@param ctx table migration context (numberToCid, dryRun)
---@return { migrated: number, skipped: number, groups: number }
function M.run(ctx)
    if not store.tableExists(store.lbTable('message_channels')) then
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
                for _, m in ipairs(members) do
                    if m.cid then memberRows[#memberRows + 1] = { gid, m.cid, m.number, m.number } end
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
                local body = bodyFor(msg.content, msg.attachments)
                local copied = false
                for idx, m in ipairs(members) do
                    if m.cid then
                        local dir = (sender == m.number) and 'outgoing' or 'incoming'
                        msgRows[#msgRows + 1] = {
                            ('m%s_%d'):format(msg.id, idx), mid, m.cid, convForMember(m), sender,
                            dir, 'text', body, nil, 1, 0, ts,
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
