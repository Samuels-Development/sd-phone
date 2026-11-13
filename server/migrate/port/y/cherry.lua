---@type table Cherry porter (server.migrate.port.y.cherry). Carries YSeries' Lovr across: profiles,
---swipes, matches and the messages inside them.
---
---Cherry is keyed by username, as Lovr is, so a username maps straight across. Lovr accounts carry
---no owner column; `lovr_loggedin` is what ties one to a handset and through it to a character.
local M = {}

---@type table Migration data layer (server.migrate.store).
local store = require 'server.migrate.store'
---@type table YSeries source reads (server.migrate.ystore): paged reads + the owner map.
local ystore = require 'server.migrate.ystore'
---@type table Attachment extraction (server.migrate.media): Lovr wraps its photos in an object.
local media = require 'server.migrate.media'
---@type table Shared helpers (server.util): trim, truthy, ids.
local util = require 'server.util'

---@type integer Rows read per page.
local PAGE <const> = 2000

---@type table<string, string> Lovr gender values -> the vocabulary Cherry stores.
local GENDER = { male = 'Man', man = 'Man', female = 'Woman', woman = 'Woman' }

---@type table<string, string> Lovr interested_in values -> Cherry's.
local INTERESTED = {
    male = 'Men', men = 'Men', man = 'Men',
    female = 'Women', women = 'Women', woman = 'Women',
    both = 'Everyone', everyone = 'Everyone', all = 'Everyone',
}

---@type fun(v: any, maxLen: integer): string|nil Trimmed text capped to maxLen bytes on a whole
---UTF-8 character, nil when empty (server.util limitedString).
local clamp = util.limitedString

---@param ctx table migration context (imeiToCid, dryRun)
---@return { profiles: number, swipes: number, matches: number, messages: number, skipped: number }
function M.run(ctx)
    local out = { profiles = 0, swipes = 0, matches = 0, messages = 0, skipped = 0 }
    if not ystore.table('lovr_accounts') then return out end

    local owners = ystore.accountOwners('lovr')
    local landed, logins = {}, {}

    local offset = 0
    while true do
        local page = ystore.page('lovr_accounts',
            '`username`, `display_name`, `password`, `age`, `bio`, `profile_images`, `gender`, `interested_in`, `active`, UNIX_TIMESTAMP(`created_at`) AS ts',
            offset, PAGE, '`username`')
        if #page == 0 then break end
        offset = offset + #page

        local rows, accounts = {}, {}
        for _, a in ipairs(page) do
            local username = clamp(a.username, 64)
            if not username or landed[username] then
                out.skipped = out.skipped + 1
            else
                landed[username] = true
                rows[#rows + 1] = {
                    username, clamp(a.display_name, 50) or username,
                    math.max(18, math.floor(tonumber(a.age) or 21)),
                    (util.trim(a.bio)):sub(1, 300),
                    GENDER[tostring(a.gender or ''):lower()] or 'Man',
                    INTERESTED[tostring(a.interested_in or ''):lower()] or 'Everyone',
                    util.truthy(a.active) and 1 or 0,
                    media.json(a.profile_images),
                    tonumber(a.ts) or os.time(),
                }
                accounts[#accounts + 1] = { 'cherry', username, clamp(a.display_name, 50) or username, a.password }
                out.profiles = out.profiles + 1

                local cid = ctx.imeiToCid[owners[a.username]]
                if cid then logins[#logins + 1] = { app = 'cherry', username = username, cid = cid } end
            end
        end

        if not ctx.dryRun then
            if #rows > 0 then store.insertCherryProfiles(rows) end
            if #accounts > 0 then store.insertPgAccounts(accounts) end
        end
    end

    offset = 0
    while true do
        local page = ystore.page('lovr_likes',
            '`liker_username`, `liked_username`, UNIX_TIMESTAMP(`timestamp`) AS ts',
            offset, PAGE, '`liker_username`, `liked_username`')
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, l in ipairs(page) do
            local swiper = clamp(l.liker_username, 64)
            local target = clamp(l.liked_username, 64)
            if not swiper or not target or not landed[swiper] or not landed[target] then
                out.skipped = out.skipped + 1
            else
                rows[#rows + 1] = { swiper, target, 1, tonumber(l.ts) or os.time() }
                out.swipes = out.swipes + 1
            end
        end
        if not ctx.dryRun and #rows > 0 then store.insertCherrySwipes(rows) end
    end

    -- Lovr passes are the other half of the swipe deck. Without them a player who already rejected
    -- somebody is shown them again on their first open, which is the one thing a dating app must
    -- not do with migrated data.
    if ystore.table('lovr_passes') then
        offset = 0
        while true do
            local page = ystore.page('lovr_passes',
                '`passer_username`, `passed_username`, UNIX_TIMESTAMP(`timestamp`) AS ts',
                offset, PAGE, '`passer_username`, `passed_username`')
            if #page == 0 then break end
            offset = offset + #page

            local rows = {}
            for _, p in ipairs(page) do
                local swiper = clamp(p.passer_username, 64)
                local target = clamp(p.passed_username, 64)
                if not swiper or not target or not landed[swiper] or not landed[target] then
                    out.skipped = out.skipped + 1
                else
                    rows[#rows + 1] = { swiper, target, 0, tonumber(p.ts) or os.time() }
                    out.swipes = out.swipes + 1
                end
            end
            if not ctx.dryRun and #rows > 0 then store.insertCherrySwipes(rows) end
        end
    end

    local matchIds = {}
    offset = 0
    while true do
        local page = ystore.page('lovr_matches',
            '`id`, `user1_username`, `user2_username`, UNIX_TIMESTAMP(`matched_at`) AS ts', offset, PAGE)
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, m in ipairs(page) do
            local a = clamp(m.user1_username, 64)
            local b = clamp(m.user2_username, 64)
            if not a or not b or not landed[a] or not landed[b] then
                out.skipped = out.skipped + 1
            else
                local id = ('yl%s'):format(m.id)
                matchIds[tostring(m.id)] = id
                rows[#rows + 1] = { id, a, b, tonumber(m.ts) or os.time() }
                out.matches = out.matches + 1
            end
        end
        if not ctx.dryRun and #rows > 0 then store.insertCherryMatches(rows) end
    end

    offset = 0
    while true do
        local page = ystore.page('lovr_messages',
            '`id`, `match_id`, `sender_username`, `content`, `attachments`, UNIX_TIMESTAMP(`timestamp`) AS ts',
            offset, PAGE)
        if #page == 0 then break end
        offset = offset + #page

        local rows = {}
        for _, m in ipairs(page) do
            local matchId = matchIds[tostring(m.match_id)]
            local sender = clamp(m.sender_username, 64)
            if not matchId or not sender or not landed[sender] then
                out.skipped = out.skipped + 1
            else
                local urls = media.urls(m.attachments)
                local kind = #urls > 0 and 'image' or 'text'
                local meta = #urls > 0 and json.encode({ mediaUrl = urls[1] }) or nil
                rows[#rows + 1] = {
                    ('ylm%s'):format(m.id), matchId, sender, kind,
                    util.trim(m.content), meta, tonumber(m.ts) or os.time(),
                }
                out.messages = out.messages + 1
            end
        end
        if not ctx.dryRun and #rows > 0 then store.insertCherryMessages(rows) end
    end

    if not ctx.dryRun and #logins > 0 then store.grantMigratedLogins(logins) end
    return out
end

return M
