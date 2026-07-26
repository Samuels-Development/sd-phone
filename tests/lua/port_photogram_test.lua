local H = require 'support.harness'

local store = H.newStore()
for _, t in ipairs({
    'phone_instagram_accounts', 'phone_instagram_posts', 'phone_instagram_comments',
    'phone_instagram_likes', 'phone_instagram_follows', 'phone_instagram_follow_requests',
    'phone_instagram_stories', 'phone_instagram_stories_views', 'phone_instagram_messages',
    'phone_instagram_notifications',
}) do store.tables[t] = true end

store.rows = {
    accounts = { { username = 'jay', display_name = 'Jay', password = '$2a$11$abc', bio = 'hi',
                   profile_image = 'http://img', private = true, verified = false,
                   phone_number = '(555) 010-0001', ts = 1700000000 },
                 { username = 'kim', display_name = 'Kim', password = '$2a$11$def', bio = '',
                   profile_image = nil, private = false, verified = false,
                   phone_number = '(555) 010-9999', ts = 1700000000 } },
    posts = { { id = 'p1', username = 'jay', media = '["a.png"]', caption = 'cap',
                location = 'LS', ts = 1700000100 } },
    comments = { { id = 'c1', post_id = 'p1', username = 'jay', comment = 'nice', ts = 1700000200 } },
    likes = { { id = 'p1', username = 'jay', is_comment = false },
              { id = 'c1', username = 'jay', is_comment = true } },
    follows = { { followed = 'jay', follower = 'kim' } },
    requests = { { requester = 'kim', requestee = 'jay', ts = 1700000300 } },
    stories = { { id = 's1', username = 'jay', image = 'http://s', ts = 1700000400 } },
    views = { { story_id = 's1', username = 'kim', ts = 1700000500 } },
    dms = { { id = 'd1', sender = 'jay', recipient = 'kim', content = 'yo',
              attachments = nil, ts = 1700000600 } },
    notifications = { { id = 'n1', username = 'jay', from_user = 'kim', type = 'like',
                        post_id = 'p1', ts = 1700000700 } },
}
store.lbIgAccounts      = function() return store.rows.accounts end
store.lbIgPosts         = function() return store.rows.posts end
store.lbIgComments      = function() return store.rows.comments end
store.lbIgLikes         = function() return store.rows.likes end
store.lbIgFollows       = function() return store.rows.follows end
store.lbIgRequests      = function() return store.rows.requests end
store.lbIgStories       = function() return store.rows.stories end
store.lbIgStoryViews    = function() return store.rows.views end
store.lbIgMessages      = function() return store.rows.dms end
store.lbIgNotifications = function() return store.rows.notifications end
store.existingPhotogramUsernames = function() return {} end
for _, k in ipairs({ 'Profiles', 'Posts', 'Comments', 'Likes', 'CommentLikes', 'Follows',
                     'Stories', 'StoryViews', 'Dms', 'Notifications', 'Accounts', 'Sessions' }) do
    store['insertPg' .. k] = function(rows) store.record(k, rows); return #rows end
end

local M = H.load('server/migrate/port/photogram.lua', store)
local res = M.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = false })

H.eq(res.profiles, 2, 'both profiles')
H.eq(res.posts, 1, 'one post')
H.eq(res.likes, 1, 'post like only')
H.eq(res.commentLikes, 1, 'comment like fans out separately')
H.eq(res.follows, 2, 'accepted follow plus pending request')
H.eq(res.accounts, 2, 'an accounts-engine row per profile, no sessions')

H.eq(store.calls.Profiles[1][1], 'jay',   'profile username unprefixed')
H.eq(store.calls.Profiles[1][5], 1,       'is_private')
H.eq(store.calls.Posts[1][1],    'ip1',   'post id prefixed')
H.eq(store.calls.Posts[1][2],    'jay',   'post author')
H.eq(store.calls.Comments[1][2], 'ip1',   'comment points at prefixed post id')
H.eq(store.calls.Likes[1][1],    'ip1',   'post like target')
H.eq(store.calls.CommentLikes[1][1], 'ic1', 'comment like target')
H.eq(store.calls.Follows[1][3],  'accepted', 'follow status')
H.eq(store.calls.Follows[2][3],  'pending',  'request status')
H.eq(store.calls.Dms[1][2],      'jay',   'dm from_user')
H.eq(store.calls.Dms[1][3],      'kim',   'dm to_user')
H.eq(store.calls.Accounts[1][2], 'jay',   'accounts-engine username')
H.eq(store.calls.Accounts[1][4], '$2a$11$abc', 'bcrypt hash preserved verbatim')

-- Regression: children pointing at a parent that was not migrated must never be written.
-- sd-phone's own foreign keys either delete such rows on boot or refuse to install at all, and on
-- a real server 2026-07-26 this left fk_photogram_likes_post permanently missing and silently
-- deleted every migrated comment.
local orph = H.newStore()
for _, t in ipairs({ 'phone_instagram_accounts', 'phone_instagram_posts', 'phone_instagram_comments',
                     'phone_instagram_likes', 'phone_instagram_stories', 'phone_instagram_stories_views',
                     'phone_instagram_notifications' }) do orph.tables[t] = true end
orph.lbIgAccounts = function() return { store.rows.accounts[1] } end
orph.lbIgPosts    = function() return { { id = 'p1', username = 'jay', media = '[]', caption = '',
                                          location = nil, ts = 1 } } end
-- Every one of these points at something that does not exist.
orph.lbIgComments = function() return { { id = 'c9', post_id = 'MISSING', username = 'jay',
                                          comment = 'x', ts = 1 } } end
orph.lbIgLikes    = function() return { { id = 'MISSING', username = 'jay', is_comment = false },
                                        { id = 'MISSING', username = 'jay', is_comment = true } } end
orph.lbIgStories  = function() return {} end
orph.lbIgStoryViews = function() return { { story_id = 'MISSING', username = 'jay', ts = 1 } } end
orph.lbIgNotifications = function() return {
    { id = 'n1', username = 'jay', from_user = 'jay', type = 'like', post_id = 'MISSING', ts = 1 },
    { id = 'n2', username = 'jay', from_user = 'jay', type = 'follow', post_id = nil, ts = 1 } } end
orph.existingPhotogramUsernames = function() return {} end
for _, k in ipairs({ 'Profiles', 'Posts', 'Comments', 'Likes', 'CommentLikes', 'Follows',
                     'Stories', 'StoryViews', 'Dms', 'Notifications', 'Accounts', 'Sessions' }) do
    orph['insertPg' .. k] = function(rows) orph.record(k, rows); return #rows end
end
local MO = H.load('server/migrate/port/photogram.lua', orph)
local resO = MO.run({ numberToCid = {}, dryRun = false })
H.eq(resO.posts, 1, 'the real post imports')
H.eq(resO.comments, 0, 'a comment on a missing post is dropped')
H.eq(resO.likes, 0, 'a like on a missing post is dropped')
H.eq(resO.commentLikes, 0, 'a like on a missing comment is dropped')
H.eq(resO.views, 0, 'a view of a missing story is dropped')
H.eq(resO.notifications, 1, 'the follow notification with no post survives')
H.eq(resO.orphan, 5, 'every dropped child is counted')
H.eq(#(orph.calls.Comments or {}), 0, 'no orphaned comment reaches the database')
H.eq(#(orph.calls.Likes or {}), 0, 'no orphaned like reaches the database')

local taken = H.newStore()
taken.tables = store.tables
for k, v in pairs(store) do if taken[k] == nil then taken[k] = v end end
taken.existingPhotogramUsernames = function() return { jay = true } end
for _, k in ipairs({ 'Profiles', 'Posts' }) do
    taken['insertPg' .. k] = function(rows) taken.record(k, rows); return #rows end
end
local M2 = H.load('server/migrate/port/photogram.lua', taken)
local res2 = M2.run({ numberToCid = { ['5550100001'] = 'CID1' }, dryRun = false })
H.eq(res2.profiles, 1, 'existing username is not overwritten')
-- The account plus its content: a pre-existing account is left alone deliberately, so its children
-- are skipped rather than reported as orphans. A re-run otherwise reads like data loss.
H.eq(res2.skipped, 5, 'the existing account and its content all count as skipped')
H.eq(res2.posts, 0, 'content of a skipped account is not imported')

local dry = H.newStore()
dry.tables = store.tables
for k, v in pairs(store) do if dry[k] == nil then dry[k] = v end end
dry.existingPhotogramUsernames = function() return {} end
for _, k in ipairs({ 'Profiles', 'Posts', 'Accounts' }) do
    dry['insertPg' .. k] = function(rows) dry.record(k, rows); return #rows end
end
local M3 = H.load('server/migrate/port/photogram.lua', dry)
local res3 = M3.run({ numberToCid = {}, dryRun = true })
H.eq(res3.profiles, 2, 'dry run counts profiles')
H.eq(dry.calls.Profiles, nil, 'dry run writes nothing')
H.eq(res3.accounts, 2, 'accounts are created regardless of owner resolution')

return true
