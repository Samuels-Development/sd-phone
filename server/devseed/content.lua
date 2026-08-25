---@type table Seed identities (server.devseed.cast): the stand-ins content is attributed to.
local cast            = require 'server.devseed.cast'
---@type table Shared server helpers (server.util): newId for the row ids stores do not generate.
local util            = require 'server.util'
---@type table Photogram persistence (server.photogram.store): posts, comments, likes, profiles.
local photogramStore  = require 'server.photogram.store'
---@type table Photogram actions (server.photogram.actions): the real create path for the caller.
local photogramActs   = require 'server.photogram.actions'
---@type table Clout persistence (server.vibez.store): video posts, comments, likes, profiles.
local vibezStore      = require 'server.vibez.store'
---@type table Clout actions (server.vibez.actions): the real create path for the caller.
local vibezActs       = require 'server.vibez.actions'
---@type table Squawk persistence (server.birdy.store): posts and likes keyed by handle.
local birdyStore      = require 'server.birdy.store'
---@type table Squawk actions (server.birdy.actions): the real create path for the caller.
local birdyActs       = require 'server.birdy.actions'
---@type table Cherry persistence (server.cherry.store): profiles, matches and match messages.
local cherryStore     = require 'server.cherry.store'
---@type table Messages persistence (server.messages.store): the per-mailbox message rows.
local messagesStore   = require 'server.messages.store'
---@type table Messages actions (server.messages.actions): the real send path for the caller.
local messagesActs    = require 'server.messages.actions'
---@type table Dark Chat persistence (server.darkchat.store): rooms, members and message rows.
local darkchatStore   = require 'server.darkchat.store'
---@type table Mail persistence (server.mail.store): mailbox lookup for the caller's addresses.
local mailStore       = require 'server.mail.store'
---@type table Mail actions (server.mail.actions): systemSend, the real delivery path.
local mailActs        = require 'server.mail.actions'
---@type table Documents persistence (server.documents.store): document rows and signatures.
local documentsStore  = require 'server.documents.store'
---@type table Documents actions (server.documents.actions): the real create/save path.
local documentsActs   = require 'server.documents.actions'
---@type table Notes persistence (server.notes.store): the note upsert.
local notesStore      = require 'server.notes.store'
---@type table Notes actions (server.notes.actions): the real save path for the caller.
local notesActs       = require 'server.notes.actions'
---@type table Voice memo persistence (server.voicememos.store): memo rows.
local voiceStore      = require 'server.voicememos.store'
---@type table Voice memo actions (server.voicememos.actions): the real upload-complete path.
local voiceActs       = require 'server.voicememos.actions'
---@type table Weazel News persistence (server.weazelnews.store): article rows.
local weazelStore     = require 'server.weazelnews.store'
---@type table Groups persistence (server.groups.store): group rows and their member lists.
local groupsStore     = require 'server.groups.store'
---@type table Gallery persistence (server.photos.store): photo rows.
local photosStore     = require 'server.photos.store'
---@type table Marketplace persistence (server.marketplace.store): listing rows.
local marketplaceStore = require 'server.marketplace.store'
---@type table Yellow Pages persistence (server.pages.store): post rows.
local pagesStore      = require 'server.pages.store'
---@type table Mail config (configs.mail): the domain the seeded senders write from.
local mailCfg         = require 'configs.mail'

local content = {}

---@type string Deterministic placeholder image; the seed keeps a given row's picture stable.
local IMG = 'https://picsum.photos/seed/%s/900/900'
---@type string Deterministic placeholder avatar.
local AVATAR = 'https://i.pravatar.cc/160?img=%d'
---@type string A short public sample video, for the Clout posts and the video branch of the media pane.
local VIDEO = 'https://download.samplelib.com/mp4/sample-5s.mp4'
---@type string A short public sample recording, so a seeded voice memo actually plays.
local AUDIO = 'https://download.samplelib.com/mp3/sample-9s.mp3'
---@type string Base URL for in-game-loadable vehicle photos, as used by /seedclassifieds.
local VEH = 'https://docs.fivem.net/vehicles/'

---A picture URL that stays the same for the same key across re-seeds.
---@param key string stable seed key
---@return string url
local function img(key)
    return IMG:format(key)
end

---Unix timestamp `days` days and `hours` hours ago, so seeded rows spread over a plausible window
---instead of all landing in the same minute.
---@param days number days back
---@param hours? number additional hours back
---@return integer ts unix seconds
local function ago(days, hours)
    return os.time() - math.floor(days * 86400) - math.floor((hours or 0) * 3600)
end

---Timestamp for a row carrying watchlist bait. A sweep only reads back configs/moderation.lua's
---LookbackHours, so bait stamped older than that window is invisible to it and the Flags queue
---stays empty however obvious the line is. Everything else is free to be backdated for realism.
---@param hours? number hours back, kept well inside the shortest sensible window (default 2)
---@return integer ts unix seconds
local function baited(hours)
    return ago(0, hours or 2)
end

---An ISO-8601 UTC stamp, the format Notes and Mail persist rather than an epoch.
---@param ts integer unix seconds
---@return string iso
local function iso(ts)
    return os.date('!%Y-%m-%dT%H:%M:%S.000Z', ts) --[[@as string]]
end

---Lines that trip a rule in configs/moderation.lua, one per app the sweep reads. Seeding these
---is the only way to put anything in the Flags queue without typing bait into the apps by hand.
---@type table<string, string>
local BAIT = {
    birdy       = 'clearing out the lockup, everything must go. paypal only, no holds.',
    messages    = 'not doing irl cash for it mate, in game or nothing',
    darkchat    = 'everyone get on teamspeak, ts3server is back up on the old address',
    photogram   = 'prints available, dm me. paypal or venmo, your choice',
    vibez       = 'full version is up on discord.gg/lscustoms if you want the whole run',
    marketplace = 'open to offers but I would take real money for the right price',
    pages       = 'ten percent off if you pay by venmo instead of cash',
    cherry      = 'easier to talk off here, discord.gg/notacatfish, same name',
    weazelnews  = 'The station has denied that any of the funds were moved by paypal, ' ..
                  'though it has not said where they went instead.',
    notes       = 'kayla - 40 for the parts, cash app not bank transfer',
}

---Wraps a seeder result so every app reports the same shape.
---@param rows integer rows written
---@param live boolean whether the caller's own row went through the app's real action path
---@param note? string what stopped the live path, when it did not run
---@return table result
local function result(rows, live, note)
    return { rows = rows, live = live, note = note }
end

---@type table<string, string> The exact text each app's caller-side row carries. Seeding writes it
---and a clear finds the row by it. The caller's rows go in through the apps' own actions, so their
---ids are generated server-side and nothing else about the row says it was seeded; matching on the
---text keeps the two halves in one place instead of in a list that has to survive a restart.
local MINE = {
    photogram  = 'Finally got round to putting these up.',
    vibez      = 'First one of these I have actually kept.',
    birdy      = 'testing this thing, ignore me',
    notes      = 'Seeder note',
    documents  = 'Yard camera quote',
    voicememos = 'Seeded memo',
}

content.seed = {}

content.seed.photogram = function(ctx)
    local handles = cast.handlesFor('photogram')
    if #handles == 0 then return result(0, false, 'no stand-in accounts could be created') end

    local rows, posts = 0, {}
    for i, handle in ipairs(handles) do
        local member = cast.at(i)
        photogramStore.upsertProfile(handle, {
            displayName = member.name,
            bio         = ({ 'Vinewood, mostly', 'Photos and not much else', 'Paleto born',
                              'Ask me about the car', 'Nights only', 'Here for the food' })[i] or '',
            avatar      = AVATAR:format(i + 10),
            createdAt   = ago(90),
        })
        rows = rows + 1
    end

    ---@type table[] Captions paired with the stand-in who posts them and how far back.
    local seeded = {
        { 1, 'Sun went down behind the Maze Bank before I got the shot I wanted.', 2, 4 },
        { 2, 'Second coffee of the morning and the first one that worked.', 3, 1 },
        { 3, BAIT.photogram, 0, 2 },
        { 4, 'Rained the whole way up to Paleto and cleared the second we parked.', 6, 2 },
        { 5, 'New wheels finally on. Took three weekends and two wrong orders.', 8, 5 },
        { 6, 'Nobody tells you the pier smells like this at six in the morning.', 11, 3 },
        { 2, 'Beach day. Sand in everything, worth it.', 14, 7 },
    }
    for i, s in ipairs(seeded) do
        local handle = handles[((s[1] - 1) % #handles) + 1]
        local id = photogramStore.newId()
        photogramStore.insertPost(id, handle, { img('pg' .. i), img('pg' .. i .. 'b') }, s[2], nil, ago(s[3], s[4]))
        posts[#posts + 1] = { id = id, ts = ago(s[3], s[4]) }
        rows = rows + 1
    end

    -- Comments and likes from the rest of the cast, so a row expands into a real thread and the
    -- engagement counts the panel reads are not all zero.
    ---@type string[] Replies dropped under the seeded posts, cycled across them.
    local replies = {
        'this is the one', 'where is this?', 'unreal', 'told you it was worth the drive',
        'send me the full size one', 'ok that is my new wallpaper', 'you were up at six?',
        'the light on this is ridiculous', 'been looking for this spot for months',
    }
    for i, post in ipairs(posts) do
        for j = 1, 3 do
            local handle = handles[((i + j) % #handles) + 1]
            photogramStore.insertComment(photogramStore.newId(), post.id, handle,
                replies[((i + j) % #replies) + 1], nil, post.ts + j * 600)
            photogramStore.addLike(post.id, handle, post.ts + j * 300)
            rows = rows + 2
        end
    end

    local live, note = false, nil
    local res = photogramActs.create(ctx.src, {
        images  = { img('pgme'), img('pgme2') },
        caption = MINE.photogram,
    })
    if res and res.success then
        live = true
        rows = rows + 1
        local postId = res.data and res.data.post and res.data.post.id
        if postId then
            for j = 1, 4 do
                local handle = handles[((j - 1) % #handles) + 1]
                photogramStore.insertComment(photogramStore.newId(), postId, handle,
                    replies[j], nil, os.time() - (5 - j) * 300)
                photogramStore.addLike(postId, handle, os.time() - (5 - j) * 240)
                rows = rows + 2
            end
        end
    else
        note = res and res.message or 'sign into Photogram first'
    end

    return result(rows, live, note)
end

content.seed.vibez = function(ctx)
    local handles = cast.handlesFor('vibez')
    if #handles == 0 then return result(0, false, 'no stand-in accounts could be created') end

    local rows = 0
    for i, handle in ipairs(handles) do
        vibezStore.upsertProfile(handle, {
            displayName = cast.at(i).name,
            bio         = 'Clips, mostly',
            avatar      = AVATAR:format(i + 30),
            createdAt   = ago(70),
        })
        rows = rows + 1
    end

    ---@type table[] Caption, poster index, days back.
    local seeded = {
        { 'Third attempt and I still clipped the barrier.', 1, 1 },
        { BAIT.vibez, 2, 0 },
        { 'Tell me why this worked first go.', 3, 5 },
        { 'The whole convoy took the wrong exit.', 4, 8 },
        { 'Sound on for this one.', 5, 12 },
    }
    for i, s in ipairs(seeded) do
        local handle = handles[((s[2] - 1) % #handles) + 1]
        local id = vibezStore.newId()
        local ts = ago(s[3])
        vibezStore.insertPost(id, handle, VIDEO, img('vz' .. i), s[1], 'original sound', ts)
        for j = 1, 3 do
            local other = handles[((i + j) % #handles) + 1]
            vibezStore.insertComment(vibezStore.newId(), id, other,
                ({ 'no way', 'run it back', 'how', 'that barrier had it coming' })[j], ts + j * 480, nil)
            vibezStore.addLike(id, other, ts + j * 200)
            vibezStore.addView(id)
            rows = rows + 2
        end
        rows = rows + 1
    end

    local live, note = false, nil
    local res = vibezActs.create(ctx.src, {
        video   = VIDEO,
        thumb   = img('vzme'),
        caption = MINE.vibez,
        sound   = 'original sound',
    })
    if res and res.success then
        live = true
        rows = rows + 1
    else
        note = res and res.message or 'sign into Clout first'
    end

    return result(rows, live, note)
end

content.seed.birdy = function(ctx)
    local handles = cast.handlesFor('birdy')
    if #handles == 0 then return result(0, false, 'no stand-in accounts could be created') end

    ---@type table[] Body, poster index, whether it carries a picture.
    local seeded = {
        { 'the tunnel on the great ocean highway has been shut for three days and nobody will say why', 1, false },
        { BAIT.birdy, 2, false },
        { 'found this parked outside the bank like it was nothing', 3, true },
        { 'six hours at the DMV. six.', 4, false },
        { 'if you left a grey holdall at the pier it is behind the bait shop counter', 5, false },
        { 'new sign went up on the old Bean Machine, looks like another laundromat', 6, true },
        { 'whoever keeps parking across two bays at the Rockford lot, we know', 1, false },
    }
    local rows = 0
    for i, s in ipairs(seeded) do
        local handle = handles[((s[2] - 1) % #handles) + 1]
        local id = birdyStore.newId()
        birdyStore.insertPost(id, handle, s[1], nil, s[3] and { img('bd' .. i) } or nil)
        for j = 1, 2 do
            birdyStore.addLike(id, handles[((i + j) % #handles) + 1])
        end
        rows = rows + 1
    end

    local live, note = false, nil
    local res = birdyActs.create(ctx.src, { body = MINE.birdy })
    if res and res.success then
        live = true
        rows = rows + 1
    else
        note = res and res.message or 'sign into Squawk first'
    end

    return result(rows, live, note)
end

content.seed.cherry = function()
    local handles = cast.handlesFor('cherry')
    if #handles == 0 then return result(0, false, 'no stand-in accounts could be created') end

    ---@type string[] Profile blurbs, one per stand-in.
    local about = {
        'Mechanic. I will talk about the car for longer than you want me to.',
        'Nurse, nights. Coffee at four in the afternoon is a normal breakfast.',
        BAIT.cherry,
        'Two dogs, one boat, no plans.',
        'I cook properly and I do not share dessert.',
        'Looking for someone who can read a map without the phone.',
    }
    local rows = 0
    for i, handle in ipairs(handles) do
        local member = cast.at(i)
        cherryStore.upsertProfile(handle, {
            name       = member.name:match('^%S+') or member.name,
            age        = member.age,
            about      = about[i] or about[1],
            gender     = member.gender,
            interested = 'everyone',
            visible    = true,
            photos     = { img('ch' .. i), img('ch' .. i .. 'b') },
        })
        rows = rows + 1
    end

    -- A match plus both halves of its thread, which is the only way the conversation reads as a
    -- conversation rather than one person talking into the air.
    local a, b = handles[1], handles[2]
    local matchId = cherryStore.createMatch(a, b)
    ---@type table[] Sender handle and line, oldest first.
    local thread = {
        { a, 'so the photo with the boat, is that yours or are you just standing near it' },
        { b, 'it is my brothers. I am allowed to stand near it' },
        { a, 'honest at least' },
        { b, 'are you free thursday' },
        { a, 'after seven, yeah' },
    }
    for i, line in ipairs(thread) do
        cherryStore.insertMessage(cherryStore.newId(), matchId, line[1], 'text', line[2], {}, ago(1, 6 - i))
        rows = rows + 1
    end

    return result(rows + 1, false, 'Cherry rows are profiles, which the caller already owns')
end

content.seed.messages = function(ctx)
    local rows = 0

    -- These rows belong to the caller's mailbox, not to a stand-in, so the cast-scoped clear
    -- cannot find them and a re-seed would stack another copy of every thread. Scoping the delete
    -- to the stand-ins' numbers keeps it away from anything the character actually said.
    local numbers, marks = {}, {}
    for i = 1, #cast.members do
        numbers[i] = cast.members[i].number
        marks[i] = '?'
    end
    MySQL.update.await(
        ('DELETE FROM phone_messages WHERE citizenid = ? AND conversation IN (%s)')
            :format(table.concat(marks, ',')),
        { ctx.cid, table.unpack(numbers) })

    -- The admin tab lists outgoing lines only, so a thread is only visible here through the
    -- caller's own copies. Both directions are written so the thread pane has both halves.
    ---@type table[] Partner index, and the lines as { incoming, body }.
    local threads = {
        { 1, {
            { true,  'you around later? the thing with the van' },
            { false, 'yeah after six, where' },
            { true,  'same place as last time' },
            { false, 'fine. bring the paperwork this time' },
        } },
        { 2, {
            { false, 'did you get the deposit back' },
            { true,  'half of it. they kept the rest for the carpet' },
            { false, 'the carpet was like that when you moved in' },
            { true,  'I know. I have photos. I am not letting it go' },
        } },
        { 3, {
            { true,  'how much do you want for the spare wheel' },
            { false, BAIT.messages },
            { true,  'fair enough, 300 then' },
        } },
        { 4, {
            { false, 'running late, ten minutes' },
            { true,  'you said that ten minutes ago' },
        } },
    }

    for _, t in ipairs(threads) do
        local member = cast.at(t[1])
        -- The thread carrying the bait line has to sit inside the sweep's lookback; the rest are
        -- spread over the past week so the tab is not one solid block of the same afternoon.
        local baits = false
        for _, line in ipairs(t[2]) do
            if line[2] == BAIT.messages then baits = true end
        end
        local ts = baits and baited(7) or ago(math.random(1, 6), math.random(0, 12))
        for _, line in ipairs(t[2]) do
            local incoming = line[1]
            local id = messagesStore.newId()
            messagesStore.insertMessage(
                id, id, ctx.cid, member.number,
                incoming and member.number or ctx.number,
                incoming and 'incoming' or 'outgoing',
                'text', line[2], nil, true, ts, false
            )
            ts = ts + math.random(120, 900)
            rows = rows + 1
        end
    end

    -- One image text, because Messages keeps the picture in `meta` rather than a column and that
    -- branch used to read as "(no text)" in the panel.
    local member = cast.at(5)
    local imgId = messagesStore.newId()
    messagesStore.insertMessage(
        imgId, imgId, ctx.cid, member.number, ctx.number, 'outgoing',
        'image', '', { gifUrl = img('msg1') }, true, ago(2, 3), false
    )
    rows = rows + 1

    local live, note = false, nil
    -- Into a thread that already exists, because the real send path refuses a new conversation
    -- once the mailbox is at its thread cap and the rows above may well have reached it.
    local res = messagesActs.send(ctx.src, {
        conversation = cast.at(1).number,
        kind         = 'text',
        body         = 'sent from the seeder, ignore this one',
    })
    if res and res.success then
        live = true
        rows = rows + 1
    else
        note = res and res.message or 'the real send path was refused'
    end

    return result(rows, live, note)
end

---@type string Join code, and therefore room id, of the seeded Dark Chat room.
local DARKCHAT_CODE = 'devseed'

content.seed.darkchat = function(ctx)
    local roomId = 'p-' .. DARKCHAT_CODE
    if not darkchatStore.roomByCode(DARKCHAT_CODE) then
        darkchatStore.createRoom(roomId, DARKCHAT_CODE, 'Yard talk', ctx.cid, ago(20))
    end
    darkchatStore.addMember(roomId, ctx.cid, ago(20))

    local rows = 1
    for i = 1, #cast.members do
        darkchatStore.addMember(roomId, cast.members[i].id, ago(19, i))
        rows = rows + 1
    end

    ---@type table[] Speaker index (0 is the caller), and the line.
    local log = {
        { 1, 'anyone got eyes on the blue flatbed that was here yesterday' },
        { 2, 'it went out about four, driver was not one of ours' },
        { 3, 'that is the second one this month' },
        { 0, 'did anyone actually log it going out' },
        { 2, 'no. nobody has logged anything since the clipboard walked off' },
        { 4, BAIT.darkchat },
        { 1, 'we are not doing that again' },
        { 5, 'put a camera on the gate and stop arguing' },
        { 0, 'camera is ordered, it turns up thursday' },
        { 6, 'thursday meaning thursday or thursday meaning next month' },
        { 3, 'be nice' },
        { 1, 'I will be here friday either way' },
    }
    local ts = baited(9)
    for _, line in ipairs(log) do
        if line[1] == 0 then
            darkchatStore.insertMessage(roomId, ctx.cid, ctx.name, line[2], ts, 'text', nil)
        else
            local member = cast.at(line[1])
            darkchatStore.insertMessage(roomId, member.id, member.name:match('^%S+') or member.name,
                line[2], ts, 'text', nil)
        end
        ts = ts + math.random(90, 700)
        rows = rows + 1
    end

    return result(rows, false, 'Dark Chat sends need a nickname set in the app')
end

content.seed.mail = function(ctx)
    local rows = 0

    -- Mail is one admin row per mailbox, so the stand-ins get their own before anything is
    -- delivered: without them the tab has a single row and nothing to compare against.
    for i = 1, #cast.members do
        cast.mailbox(cast.members[i])
        rows = rows + 1
    end

    ---@type table[] Subject and body, delivered to every seeded mailbox and the caller's own.
    local letters = {
        { 'Your booking at Pearls', 'Table for two, Thursday at eight. Reply to this message if you need to move it.' },
        { 'Invoice 4471 is overdue', 'The balance of $340 was due on the third. A late fee applies after the fifteenth.' },
        { 'Re: the flatbed', 'I checked the yard log and there is nothing written down for that afternoon at all.' },
        { 'Weazel News: this week', 'The stories our readers opened most, and one nobody did.' },
    }

    local addresses = {}
    for i = 1, #cast.members do addresses[#addresses + 1] = cast.email(cast.members[i]) end

    local ownMailboxes = mailStore.listAccountsForCitizen(ctx.cid)
    for i = 1, #ownMailboxes do addresses[#addresses + 1] = ownMailboxes[i].email end

    local delivered = 0
    for _, letter in ipairs(letters) do
        local res = mailActs.systemSend({
            to      = addresses,
            subject = letter[1],
            body    = letter[2],
            from    = { name = 'Dev Seed', email = 'devseed@' .. mailCfg.Domain },
        })
        if res and res.success then
            delivered = delivered + (res.data and res.data.delivered or 0)
        end
    end
    rows = rows + delivered

    return result(rows, delivered > 0,
        #ownMailboxes == 0 and 'you are not signed into a mailbox, so only the stand-ins got mail' or nil)
end

content.seed.documents = function(ctx)
    local rows = 0

    ---@type table[] Name, kind, body/url, owner index (0 is the caller), and how many signed it.
    local docs = {
        { 'Bill of sale - Seminole', 'text',
          'Sold as seen to the buyer named below for eleven thousand two hundred dollars. ' ..
          'The vehicle is sold with a tow bar and roof bars fitted. No warranty is given or implied.', 1, 2 },
        { 'Yard access list', 'text',
          'The following people may open the gate outside working hours. Anyone not on this list ' ..
          'needs to be signed in by someone who is.', 2, 3 },
        { 'Tenancy agreement', 'text',
          'Twelve months from the first of the month, deposit held at one month rent. ' ..
          'The carpet in the second bedroom is noted as already marked at the start of the term.', 3, 2 },
        { 'Scanned permit', 'image', img('doc1'), 4, 1 },
    }

    for i, d in ipairs(docs) do
        local member = cast.at(d[4])
        local id = util.newId(10)
        local ts = ago(i * 3)
        documentsStore.createDoc(member.id, {
            id = id, folderId = nil, name = d[1], kind = d[2],
            content = d[2] == 'text' and d[3] or '', url = d[2] == 'image' and d[3] or nil,
            size = d[2] == 'text' and #d[3] or 0, locked = i == 1, signable = true,
            deletable = true, source = 'Dev Seed', ts = ts,
        })
        rows = rows + 1
        for s = 1, d[5] do
            local signer = cast.at(d[4] + s)
            documentsStore.addSignature({
                id = util.newId(10), docId = id, citizenid = signer.id,
                signer = signer.name, image = nil, ts = ts + s * 3600,
            })
            rows = rows + 1
        end
    end

    local live, note = false, nil
    local created = documentsActs.createDoc(ctx.src, { name = MINE.documents })
    if created and created.success then
        local id = created.data and created.data.doc and created.data.doc.id
        if id then
            documentsActs.save(ctx.src, {
                id = id,
                content = 'Two cameras on the gate, one on the office door, recorder in the back room. ' ..
                          'Quoted at nineteen hundred fitted, half up front.',
            })
        end
        live = true
        rows = rows + 1
    else
        note = created and created.message or 'the real create path was refused'
    end

    return result(rows, live, note)
end

content.seed.notes = function(ctx)
    ---@type table[] Body and owner index (0 is the caller).
    local notes = {
        { 'Gate camera\n\nTwo on the gate, one on the office. Ask about the recorder warranty ' ..
          'before signing anything.', 1 },
        { 'Shopping\n\nmilk\nbread\nthe good coffee not the other one\nbin bags', 2 },
        { BAIT.notes, 3 },
        { 'Plate numbers seen at the yard\n\n46 KLM 992\n11 TRV 040\nthe blue flatbed, no plate visible', 4 },
        { 'Thursday\n\nDMV at nine. Bring both letters, they turned me away last time for one.', 5 },
    }
    local rows = 0
    for i, n in ipairs(notes) do
        local member = cast.at(n[2])
        local ts = n[1] == BAIT.notes and baited(4) or ago(i * 2, 3)
        notesStore.upsert(member.id, util.newId(12), n[1], '[]',
            json.encode(i == 4 and { img('note4') } or {}), iso(ts), iso(ts))
        rows = rows + 1
    end

    local live, note = false, nil
    local id = util.newId(12)
    local res = notesActs.save(ctx.src, {
        id   = id,
        body = MINE.notes .. '\n\nWritten through the app\'s own save path, so this one is as real as it gets.',
    })
    if res and res.success then
        live = true
        rows = rows + 1
    else
        note = res and res.message or 'the real save path was refused'
    end

    return result(rows, live, note)
end

content.seed.voicememos = function(ctx)
    ---@type table[] Memo name, length in seconds, and owner index.
    local memos = {
        { 'Gate camera quote', 47, 1 },
        { 'Voicemail from the yard', 22, 2 },
        { 'Reminder - thursday', 9, 3 },
        { 'The noise it is making', 63, 4 },
    }
    local rows = 0
    for i, m in ipairs(memos) do
        voiceStore.insert(cast.at(m[3]).id, m[1], AUDIO, m[2], ago(i * 2, 5))
        rows = rows + 1
    end

    local live, note = false, nil
    -- saveUploaded hands back the memo itself rather than an envelope, and nil when the caller is
    -- unresolvable or already at the per-player cap.
    local memo = voiceActs.saveUploaded(ctx.src, AUDIO, MINE.voicememos, 31)
    if memo and memo.id then
        live = true
        rows = rows + 1
    else
        note = 'the real upload path was refused, most likely the per-player memo cap'
    end

    return result(rows, live, note)
end

content.seed.weazelnews = function()
    ---@type table[] Category, headline, dek, body, author index, featured.
    local articles = {
        { 'City', 'Great Ocean Highway tunnel stays shut with no date given',
          'Three days on, the detour is adding forty minutes to the run north.',
          'Drivers heading for Paleto are being sent inland with no published reason for the closure. ' ..
          'The city has confirmed only that the tunnel is closed and that it will reopen when it reopens.', 1, true },
        { 'Business', 'Another laundromat for the old Bean Machine site',
          'The third coffee shop on that block to close this year.',
          'The unit has been empty since March. Neighbouring traders say they were not consulted, ' ..
          'which the leaseholder disputes.', 2, false },
        { 'Crime', 'Questions over missing yard funds',
          'Nobody at the depot will say who signed for what.',
          BAIT.weazelnews, 3, false },
        { 'Sport', 'Pier swim goes ahead in the rain',
          'Two hundred started, one hundred and ninety finished.',
          'The water was colder than advertised and the coffee ran out before the last swimmer was in. ' ..
          'Organisers called it the best turnout in six years.', 4, false },
    }
    local rows = 0
    for i, a in ipairs(articles) do
        local member = cast.at(a[5])
        local ts = a[4] == BAIT.weazelnews and baited(5) or ago(i * 2)
        weazelStore.insertArticle({
            category = a[1], headline = a[2], dek = a[3], body = a[4],
            author = member.name, author_cid = member.id, image = img('wz' .. i),
            featured = a[6] and 1 or 0, created_at = ts, updated_at = ts,
        })
        rows = rows + 1
    end
    return result(rows, false, 'publishing needs a newsroom job, so these go in as rows')
end

content.seed.groups = function(ctx)
    ---@type table[] Name, colour, leader index, and how many stand-ins join.
    local groups = {
        { 'Yard crew', '#ff9f0a', 1, 4 },
        { 'Thursday five a side', '#34c759', 2, 5 },
        { 'Paleto run', '#5ac8fa', 3, 2 },
    }
    local rows = 0
    for i, g in ipairs(groups) do
        local leader = cast.at(g[3])
        local id = util.newId(8)
        groupsStore.insertGroup(id, g[1], leader.id, g[2],
            { { citizenid = leader.id, name = leader.name, joined_at = ago(i * 4) } })
        for m = 1, g[4] do
            local member = cast.at(g[3] + m)
            groupsStore.addMember(id, member.id, member.name)
        end
        -- The caller joins the first one, so at least one group is visible from their own phone.
        if i == 1 then groupsStore.addMember(id, ctx.cid, ctx.name) end
        rows = rows + 1
    end
    return result(rows, false, 'group creation is bound to the creator being online')
end

content.seed.gallery = function(ctx)
    local rows = 0

    -- The caller's own three are keyed to nothing but their URL, so a re-seed replaces them by it.
    MySQL.update.await(
        'DELETE FROM phone_photos WHERE citizenid = ? AND url LIKE ?',
        { ctx.cid, IMG:format('galme%') })

    for i = 1, 6 do
        photosStore.insertPhoto(photosStore.newId(), cast.at(i).id, img('gal' .. i))
        rows = rows + 1
    end
    for i = 1, 3 do
        photosStore.insertPhoto(photosStore.newId(), ctx.cid, img('galme' .. i))
        rows = rows + 1
    end
    return result(rows, false, 'the camera writes these, so there is no action to call')
end

content.seed.classifieds = function()
    local rows = 0

    ---@type table[] Title, body, price, image, owner index.
    local listings = {
        { 'Sultan, one owner', 'Serviced last month and the belt is done. Two keys, both work. ' ..
          'The dent in the rear quarter is honest and priced in.', 16500, VEH .. 'sultan.webp', 1 },
        { 'Toolbox, full', 'Everything in the photo comes with it. Some of the sockets are missing ' ..
          'and I am not pretending otherwise.', 450, nil, 2 },
        { 'Kuruma, quick sale', BAIT.marketplace, 21000, VEH .. 'kuruma.webp', 3 },
        { 'Two dining chairs', 'Solid, one has a wobble that a screwdriver would fix in a minute. ' ..
          'Collection from Mirror Park.', 60, nil, 4 },
    }
    for i, l in ipairs(listings) do
        local member = cast.at(l[5])
        marketplaceStore.insert(member.id, l[1], l[2], l[3], l[4], nil, member.number, nil, l[2] == BAIT.marketplace and baited(3) or ago(i * 2, 4))
        rows = rows + 1
    end

    ---@type table[] Title, body, owner index.
    local posts = {
        { 'Gate and fence repairs', 'Welding, hinges, drop bolts. I cover the industrial units and ' ..
          'the yards out past the docks. Same day if it is a security job.', 1 },
        { 'Guitar lessons', BAIT.pages, 2 },
        { 'Airport runs, any hour', 'Fixed price both ways and I wait if the flight is late. ' ..
          'Text rather than ring, I am usually driving.', 5 },
    }
    for i, p in ipairs(posts) do
        local member = cast.at(p[3])
        pagesStore.insert(member.id, p[1], p[2], nil, nil, nil, member.number, nil, p[2] == BAIT.pages and baited(6) or ago(i * 3, 2))
        rows = rows + 1
    end

    return result(rows, false, 'covered separately by /seedclassifieds for your own character')
end

---Removes the rows the caller owns: the ones written through each app's own action path, found by
---the marker text they carry, plus the message threads (which exist only as the caller's copies,
---because the admin tab reads outgoing lines) and the gallery photos. Posts go through their app's
---delete so the comments and likes hanging off them go too.
---@param cid string the caller's citizenid
---@return integer removed rows deleted
local function clearMine(cid)
    local removed = 0

    ---Deletes the caller's post in one handle-keyed app, cascading through the app's own delete.
    ---@param tbl string posts table
    ---@param col string column carrying the marker text
    ---@param marker string the text the seeded post was written with
    ---@param deletePost fun(id: string) the app's cascading delete
    local function posts(tbl, col, marker, deletePost)
        local rows = MySQL.query.await(
            ('SELECT id FROM %s WHERE %s = ?'):format(tbl, col), { marker }) or {}
        for i = 1, #rows do
            pcall(deletePost, rows[i].id)
            removed = removed + 1
        end
    end

    posts('phone_photogram_posts', 'caption', MINE.photogram, photogramStore.deletePost)
    posts('phone_vibez_posts', 'caption', MINE.vibez, vibezStore.deletePost)
    posts('phone_birdy_posts', 'body', MINE.birdy, birdyStore.deletePost)

    ---@param sql string a DELETE scoped to the caller plus one marker
    ---@param marker string
    local function wipeMine(sql, marker)
        removed = removed + (tonumber(MySQL.update.await(sql, { cid, marker })) or 0)
    end

    MySQL.update.await([[
        DELETE FROM phone_document_signatures WHERE doc_id IN
            (SELECT id FROM phone_documents WHERE citizenid = ? AND name = ?)
    ]], { cid, MINE.documents })
    wipeMine('DELETE FROM phone_documents WHERE citizenid = ? AND name = ?', MINE.documents)
    wipeMine('DELETE FROM phone_notes WHERE citizenid = ? AND body LIKE CONCAT(?, \'%\')', MINE.notes)
    wipeMine('DELETE FROM phone_voice_memos WHERE citizenid = ? AND name = ?', MINE.voicememos)

    local numbers, marks = {}, {}
    for i = 1, #cast.members do
        numbers[i] = cast.members[i].number
        marks[i] = '?'
    end
    removed = removed + (tonumber(MySQL.update.await(
        ('DELETE FROM phone_messages WHERE citizenid = ? AND conversation IN (%s)')
            :format(table.concat(marks, ',')),
        { cid, table.unpack(numbers) })) or 0)
    removed = removed + (tonumber(MySQL.update.await(
        'DELETE FROM phone_photos WHERE citizenid = ? AND url LIKE ?',
        { cid, IMG:format('galme%') })) or 0)

    return removed
end

---Removes every seeded row: everything the stand-ins own, found by their citizenid, and everything
---the caller owns, found by the marker text each seeder wrote.
---@param cid string|nil the caller's citizenid; without it only the stand-ins' rows go
---@return integer removed rows deleted
function content.clearCast(cid)
    local like = cast.PREFIX .. '%'
    local removed = 0

    if cid then
        removed = removed + clearMine(cid)
    end

    ---@param sql string a DELETE with a single LIKE placeholder
    local function wipe(sql)
        removed = removed + (tonumber(MySQL.update.await(sql, { like })) or 0)
    end

    for i = 1, #cast.members do
        photogramStore.wipeUser(cast.members[i].handle)
        vibezStore.wipeUser(cast.members[i].handle)
    end

    wipe('DELETE FROM phone_birdy_posts WHERE author IN (SELECT handle FROM phone_birdy_profiles WHERE citizenid LIKE ?)')
    wipe('DELETE FROM phone_cherry_profiles WHERE username IN (SELECT username FROM phone_app_accounts WHERE app = \'cherry\' AND created_by LIKE ?)')
    wipe('DELETE FROM phone_messages WHERE citizenid LIKE ?')
    wipe('DELETE FROM darkchat_messages WHERE citizenid LIKE ?')
    wipe('DELETE FROM phone_document_signatures WHERE citizenid LIKE ?')
    wipe('DELETE FROM phone_documents WHERE citizenid LIKE ?')
    wipe('DELETE FROM phone_notes WHERE citizenid LIKE ?')
    wipe('DELETE FROM phone_voice_memos WHERE citizenid LIKE ?')
    wipe('DELETE FROM phone_weazel_articles WHERE author_cid LIKE ?')
    wipe('DELETE FROM phone_groups WHERE leader_cid LIKE ?')
    wipe('DELETE FROM phone_photos WHERE citizenid LIKE ?')
    wipe('DELETE FROM marketplace_listings WHERE citizenid LIKE ?')
    wipe('DELETE FROM pages_posts WHERE citizenid LIKE ?')

    -- The Dark Chat room outlives its messages, and its membership rows go with it.
    local roomId = 'p-' .. DARKCHAT_CODE
    MySQL.update.await('DELETE FROM darkchat_members WHERE room_id = ?', { roomId })
    MySQL.update.await('DELETE FROM darkchat_messages WHERE room_id = ?', { roomId })
    MySQL.update.await('DELETE FROM darkchat_rooms WHERE id = ?', { roomId })

    removed = removed + cast.clear()
    return removed
end

---@type string[] Seeder keys in the order the command runs them; accounts first, because the
---apps that key on a handle need one to exist before they can attribute anything to it.
content.order = {
    'mail', 'photogram', 'vibez', 'birdy', 'cherry', 'messages', 'darkchat',
    'documents', 'notes', 'voicememos', 'weazelnews', 'groups', 'gallery', 'classifieds',
}

return content
