---@type table Yellow Pages persistence layer (server.pages.store): post row CRUD.
local pagesStore = require 'server.pages.store'
---@type table Marketplace persistence layer (server.marketplace.store): listing row CRUD.
local mpStore    = require 'server.marketplace.store'
---@type table Contacts persistence layer (server.contacts.store): contact + call-log row CRUD.
local contactsStore = require 'server.contacts.store'
---@type table Messages persistence layer (server.messages.store): mailbox row CRUD.
local messagesStore = require 'server.messages.store'
---@type table Settings persistence (server.settings.store): the caller's own number for outgoing rows.
local settingsStore = require 'server.settings.store'
---@type table Badge engine (server.badges.init): unread-count push after seeding unread rows.
local badges     = require 'server.badges.init'
---@type table Shared server helpers (server.util): newId for row ids.
local util       = require 'server.util'
---@type table Player bridge (bridge.server.player): citizenid/name/phone-number lookups.
local player     = require 'bridge.server.player'
---@type table Call actions (server.calls.actions): the dev fake-call registry.
local callActions = require 'server.calls.actions'

---@type string Sentinel citizenid that owns the "someone else's" seed rows.
local OTHER = 'DEVSEED'

---Unix timestamp for a fixed past date.
---@param y integer year
---@param m integer month
---@param d integer day
---@param hh? integer hour (default 12)
---@param mm? integer minute (default 0)
---@return integer ts unix seconds
local function at(y, m, d, hh, mm)
    return os.time({ year = y, month = m, day = d, hour = hh or 12, min = mm or 0, sec = 0 })
end

---@type string Base URL for in-game-loadable vehicle photos (docs.fivem.net renders).
local VEH = 'https://docs.fivem.net/vehicles/'

---/seedclassifieds - DEV TOOL: seeds the Yellow Pages + Marketplace tables with the entries from
---the web dev mock data (web/src/apps/{pages,marketplace}/data.ts). Idempotent; admin-gated.
---@param source integer player server id
lib.addCommand('seedclassifieds', {
    help = 'Dev: seed Yellow Pages + Marketplace with the dev mock entries',
    restricted = 'group.admin',
}, function(source)
    local cid = player.getIdentifier(source)
    if not cid then return end

    MySQL.query.await("DELETE FROM `pages_posts` WHERE citizenid = ? OR (citizenid = ? AND title = 'Tiling and bathroom fitting')", { OTHER, cid })
    MySQL.query.await("DELETE FROM `marketplace_listings` WHERE citizenid = ? OR (citizenid = ? AND title IN ('Tornado, restored', 'Seminole, tow bar'))", { OTHER, cid })

    pagesStore.insert(OTHER, 'Dog walking, Mirror Park',
        'Two walks a day, small groups only, and a photo once they are back inside. Full for August, taking names for September.',
        nil, nil, nil, '2135550739', nil, at(2026, 6, 4, 7, 45))
    pagesStore.insert(OTHER, 'Locksmith, out of hours',
        'Locked out, lost keys, snapped cylinders. I cover the city and Sandy Shores overnight. Have ID that matches the address ready before I open anything.',
        nil, nil, nil, '3105550205', nil, at(2026, 6, 8, 23, 20))
    pagesStore.insert(OTHER, 'Piano lessons, beginners welcome',
        'Half hour and hour slots at my place in Rockford Hills, weekday evenings. Children and adults. The first lesson is free so you can decide if it suits you.',
        nil, nil, nil, '2135550478', nil, at(2026, 6, 11, 18, 5))
    pagesStore.insert(OTHER, 'Paleto Bay Bakery, new hours',
        'We open at six and shut when the shelves are empty, usually around two. Closed Mondays. Custom cakes need three days notice.',
        nil, nil, nil, '3105550348', 'paletobakery@lsmail.com', at(2026, 6, 13, 6, 30))
    pagesStore.insert(cid, 'Tiling and bathroom fitting',
        'Twelve years on the tools. Wet rooms, splashbacks, regrouting, tile repairs. I quote in person and the quote is the price you pay.',
        nil, nil, nil, '2135550107', nil, os.time())

    mpStore.insert(OTHER, 'Alloys and tyres',
        'Eighteens off a Sultan, so they will go on anything with that stud pattern. Most of the tread is left and one wheel has a kerb mark on the lip. Collection only, they are heavier than they look.',
        900, nil, nil, '2135550362', nil, at(2026, 6, 2, 16, 40))
    mpStore.insert(OTHER, 'Wanted: Sentinel',
        'After an Ubermacht Sentinel, any year, running or not. Ring me rather than message, I miss messages. If it is off the road, tell me what is wrong with it and I will still come and look.',
        nil, nil, nil, '3105550557', nil, at(2026, 6, 5, 13, 15))
    mpStore.insert(cid, 'Seminole, tow bar',
        'This Canis has been the family car, so expect crumbs in the back. Tow bar and roof bars stay with it. It is due a service in about six hundred miles and I would rather price that in than pretend otherwise.',
        11200, VEH .. 'seminole.webp', nil, '2135550107', nil, at(2026, 6, 7, 9, 5))
    mpStore.insert(OTHER, 'Carbon RS, tidy',
        'Nagasaki, chain and sprockets done last month and there is fresh rubber on the rear. A spare fairing in black comes with it, plus the original exhaust in a box. No test rides without a licence, sorry.',
        14400, VEH .. 'carbonrs.webp', nil, '3105550194', nil, at(2026, 6, 9, 20, 30))
    mpStore.insert(OTHER, 'Gauntlet, will swap',
        'Bravado, supercharged, coilovers, cage in the back. My situation has changed, so I would look at a part exchange against anything with four doors and a boot. Email is better than ringing, I am underground most of the day.',
        28750, VEH .. 'gauntlet.webp', nil, '2135550416', 'r.okafor@lsmail.com', at(2026, 6, 11, 11, 50))
    mpStore.insert(OTHER, 'Warrener, project',
        'The Vulcar turns over and will not fire. I have run out of both patience and driveway. Interior is complete and all the glass is good. Bring a trailer, it is not driving out of here.',
        3200, VEH .. 'warrener.webp', nil, '2135550623', nil, at(2026, 6, 12, 22, 10))
    mpStore.insert(OTHER, 'Futo, cheap to run',
        'Daily drove this Karin for three years and it never once left me stranded. The rear arch on the driver side has started bubbling, which is why it is priced where it is. Viewings at the Sandy Shores yard.',
        9500, VEH .. 'futo.webp', nil, '3105550281', nil, at(2026, 6, 14, 12, 25))
    mpStore.insert(cid, 'Tornado, restored',
        'Two years of evenings went into this Declasse. New loom, rebuilt carb, and the paint is a respray in the colour it left the factory in. Every receipt is in a folder and you can read the lot before you decide anything.',
        42000, VEH .. 'tornado.webp', nil, '2135550107', nil, os.time())

    print('^2[sd-phone]^0 seeded Yellow Pages + Marketplace dev entries')
    TriggerClientEvent('sd-phone:client:notify', source, {
        app = 'phone', title = 'Dev Seed', body = 'Seeded Yellow Pages + Marketplace entries. Reopen the apps to view.',
    })
end)

---@type string[] First names for filler contacts.
local FIRST = {
    'Marcus', 'Tommy', 'Vinnie', 'Ray', 'Lena', 'Sofia', 'Dre', 'Kayla', 'Big Mike', 'Eddie',
    'Rosa', 'Jamal', 'Nina', 'Frankie', 'Deshawn', 'Carla', 'Pete', 'Yusuf', 'Tanya', 'Otis',
}
---@type string[] Last names / tags for filler contacts.
local LAST = {
    'Delgado', 'V', 'from the docks', 'Mechanic', 'Sanchez', 'the Barber', 'Ortiz', 'Kowalski',
    'from Vespucci', 'Reyes', 'Tow Guy', 'Nguyen', 'the Realtor', 'Jackson', 'from LSC', 'Kim',
}
---@type string[] Avatar bubble colours (the contact-list initials circle).
local COLORS = { '#5ac8fa', '#34c759', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#ffd60a', '#ff453a' }

---A fake bare-digit number no player owns: 555 exchange, random suffix.
---@return string digits
local function fakeNumber()
    return ('%d555%04d'):format(math.random(200, 899), math.random(0, 9999))
end

---Seeds `count` filler contacts (plus a small call log for some) for `cid`. Returns the
---inserted { name, phone } pairs so the message seeder can thread against them.
---@param cid string acting identity
---@param count integer contacts to insert
---@return { name: string, phone: string }[] made
local function seedContacts(cid, count)
    local made = {}
    local now = os.time()
    for i = 1, count do
        local name = FIRST[math.random(#FIRST)] .. ' ' .. LAST[math.random(#LAST)]
        local phone = fakeNumber()
        contactsStore.insertContact(util.newId(7), cid, {
            name    = name,
            phone   = phone,
            email   = math.random() < 0.3 and (name:lower():gsub('[^%a]', '') .. '@lsmail.com') or nil,
            address = math.random() < 0.25 and ('%d Vespucci Blvd'):format(math.random(10, 999)) or nil,
            color   = COLORS[(i % #COLORS) + 1],
            avatar  = nil,
        })
        if math.random() < 0.6 then
            contactsStore.insertCall(util.newId(7), cid, {
                number    = phone,
                name      = name,
                direction = math.random() < 0.5 and 'incoming' or 'outgoing',
                duration  = math.random() < 0.3 and 0 or math.random(15, 600),
                calledAt  = now - math.random(3600, 6 * 86400),
            })
        end
        made[#made + 1] = { name = name, phone = phone }
    end
    return made
end

---@type string[] Dummy message bodies, mixed registers so threads read naturally.
local LINES = {
    'yo you up?', 'be there in 10', 'can you cover my shift tomorrow', 'lol no way',
    'send me the location', 'that price is a robbery and you know it', 'ok deal',
    'did you see what happened at the pier??', 'call me when you can', 'on my way',
    'still waiting on that money btw', 'meet at the usual spot?', 'cheers, appreciate it',
    'nah I passed on it, engine sounded rough', 'you left your jacket at my place',
    'the mechanic says two more days', 'we still on for tonight?', 'sure, bring cash',
    'stop texting me while you drive', 'got the parts in, swing by whenever',
}

---Seeds `convoCount` fake 1:1 threads for `cid` against filler numbers, each 2-7 messages over
---the past week; roughly half the threads end on an unread incoming message.
---@param cid string acting identity
---@param partners { name: string, phone: string }[] candidate thread partners
---@param convoCount integer threads to create
---@return integer threads, integer unread threads ending unread
local function seedMessages(cid, partners, convoCount)
    local myNumber = tostring(settingsStore.getPhoneNumber(cid) or ''):gsub('%D', '')
    local now = os.time()
    local unread = 0
    for c = 1, convoCount do
        local partner = partners[((c - 1) % #partners) + 1]
        local msgCount = math.random(2, 7)
        local ts = now - math.random(0, 6) * 86400 - math.random(0, 14400) - msgCount * 240
        local endUnread = math.random() < 0.5
        for m = 1, msgCount do
            local incoming = (m % 2 == (c % 2)) -- alternate, offset per thread for variety
            local last = m == msgCount
            if last and endUnread then incoming = true end
            local id = messagesStore.newId()
            messagesStore.insertMessage(
                id, id, cid, partner.phone,
                incoming and partner.phone or myNumber,
                incoming and 'incoming' or 'outgoing',
                'text', LINES[math.random(#LINES)], nil,
                not (last and endUnread and incoming),
                ts, false
            )
            ts = ts + math.random(60, 900)
        end
        if endUnread then unread = unread + 1 end
    end
    return convoCount, unread
end

---/seedcontacts [count] - DEV TOOL: fills the caller's phone book with filler contacts (and a
---sprinkling of call-log entries). Numbers are fake 555 ones no player owns.
lib.addCommand('seedcontacts', {
    help = 'Dev: seed filler contacts (+ some recents) into your phone book',
    restricted = 'group.admin',
    params = { { name = 'count', type = 'number', help = 'How many (default 12, max 30)', optional = true } },
}, function(source, args)
    local cid = player.getIdentifier(source)
    if not cid then return end
    local count = lib.math.clamp(tonumber(args.count) or 12, 1, 30)
    local made = seedContacts(cid, count)
    print(('^2[sd-phone]^0 seeded %d contacts for %s'):format(#made, cid))
    TriggerClientEvent('sd-phone:client:notify', source, {
        app = 'phone', title = 'Dev Seed',
        body = ('Seeded %d contacts. Reopen the Phone app to view.'):format(#made),
    })
end)

---/seedmessages [count] - DEV TOOL: fills Messages with fake 1:1 threads (filler partners are
---seeded into the phone book first when it has none). About half the threads end unread.
lib.addCommand('seedmessages', {
    help = 'Dev: seed fake message conversations with dummy chatter',
    restricted = 'group.admin',
    params = { { name = 'count', type = 'number', help = 'How many threads (default 6, max 15)', optional = true } },
}, function(source, args)
    local cid = player.getIdentifier(source)
    if not cid then return end
    local convoCount = lib.math.clamp(tonumber(args.count) or 6, 1, 15)

    local partners = {}
    for _, row in ipairs(contactsStore.listContacts(cid)) do
        partners[#partners + 1] = { name = row.name, phone = (tostring(row.phone):gsub('%D', '')) }
    end
    if #partners < convoCount then
        for _, p in ipairs(seedContacts(cid, convoCount - #partners)) do partners[#partners + 1] = p end
    end

    local threads, unread = seedMessages(cid, partners, convoCount)
    badges.push(source)
    print(('^2[sd-phone]^0 seeded %d message threads (%d unread) for %s'):format(threads, unread, cid))
    TriggerClientEvent('sd-phone:client:notify', source, {
        app = 'messages', appId = 'messages', title = 'Dev Seed',
        body = ('Seeded %d conversations (%d unread). Reopen Messages to view.'):format(threads, unread),
    })
end)

---/testmail [address|all] - DEV TOOL: sends a system email to one of the caller's mailboxes so
---the inbox, badge and notification path can be exercised without a second player. Defaults to
---the first mailbox: which one the UI has selected is client-only state the server cannot see.
---@param source integer player server id
lib.addCommand('testmail', {
    help = 'Dev: send yourself an email (defaults to your first mailbox)',
    restricted = 'group.admin',
    params = { { name = 'address', type = 'string', help = "Mailbox to send to, or 'all'", optional = true } },
}, function(source, args)
    local cid = player.getIdentifier(source)
    if not cid then return end

    local mailStore   = require 'server.mail.store'
    local mailActions = require 'server.mail.actions'

    local accounts = mailStore.listAccountsForCitizen(cid)
    if #accounts == 0 then
        TriggerClientEvent('sd-phone:client:notify', source, {
            app = 'mail', appId = 'mail', title = 'Dev Mail',
            body = 'You are not signed into any mailbox. Open Mail and sign in first.',
        })
        return
    end

    local want = (args.address or ''):lower()
    local to = {}
    if want == 'all' then
        for i = 1, #accounts do to[i] = accounts[i].email end
    elseif want ~= '' then
        for i = 1, #accounts do
            if accounts[i].email:lower() == want then to[1] = accounts[i].email break end
        end
        if not to[1] then
            local known = {}
            for i = 1, #accounts do known[i] = accounts[i].email end
            TriggerClientEvent('sd-phone:client:notify', source, {
                app = 'mail', appId = 'mail', title = 'Dev Mail',
                body = ('Not signed into %s. Yours: %s'):format(want, table.concat(known, ', ')),
            })
            return
        end
    else
        to[1] = accounts[1].email
    end

    local subject = ('Test email %s'):format(os.date('%H:%M:%S'))

    local res = mailActions.systemSend({
        to      = to,
        subject = subject,
        from    = { name = 'Dev Tools', email = 'devtools@' .. (require 'configs.mail').Domain },
        body    = ('This is a test email sent by /testmail at %s.\n\nDelivered to: %s')
            :format(os.date('%H:%M:%S'), table.concat(to, ', ')),
    })

    local delivered = res.success and res.data and res.data.delivered or 0
    -- systemSend pushes the message itself, but the unread badge is a separate snapshot.
    if delivered > 0 then badges.push(source) end
    print(('^2[sd-phone]^0 /testmail delivered %d for %s (%s)'):format(delivered, cid, table.concat(to, ', ')))

    TriggerClientEvent('sd-phone:client:notify', source, {
        app = 'mail', appId = 'mail', title = 'Dev Mail',
        body = res.success
            and ('Sent to %d mailbox(es).'):format(delivered)
            or ('Failed: %s'):format(res.message or 'unknown error'),
    })
end)

---@type table Seed content (server.devseed.content): the per-app seeders and their cleanup.
local seedContent = require 'server.devseed.content'

---Every seeder key, for the help text on an unrecognised argument.
---@return string names comma-separated
local function seederNames()
    local names = {}
    for i = 1, #seedContent.order do names[i] = seedContent.order[i] end
    table.sort(names)
    return table.concat(names, ', ')
end

---/seedphone [app|all|clear] - DEV TOOL: fills every app the admin panel reads with test content,
---so the content tabs, the thread panes, the Flags queue and the Recycle bin all have something
---real to work against without creating it by hand in each app.
---
---One row per app goes in through that app's own action path, as the caller: the same auth,
---throttles, notifications, badge pushes and live broadcasts a player would trigger. The bulk is
---attributed to stand-in characters through each app's store, because every write action is bound
---to a live player source and there is no such source for someone who does not exist.
---@param source integer player server id
---@param args table { app?: string }
lib.addCommand('seedphone', {
    help = 'Dev: fill every app the admin panel reads with test content',
    restricted = 'group.admin',
    params = { { name = 'app', type = 'string', help = "One app, 'all' (default) or 'clear'", optional = true } },
}, function(source, args)
    local cid = player.getIdentifier(source)
    if not cid then return end

    local want = (args.app or 'all'):lower()

    if want == 'clear' then
        local removedRows = seedContent.clearCast(cid)
        print(('^2[sd-phone]^0 /seedphone clear removed %d seeded rows'):format(removedRows))
        TriggerClientEvent('sd-phone:client:notify', source, {
            app = 'phone', title = 'Dev Seed',
            body = ('Removed %d seeded rows. Flags filed against them stay until dismissed.')
                :format(removedRows),
        })
        badges.push(source)
        return
    end

    local apps
    if want == 'all' then
        apps = seedContent.order
    elseif seedContent.seed[want] then
        apps = { want }
    else
        TriggerClientEvent('sd-phone:client:notify', source, {
            app = 'phone', title = 'Dev Seed',
            body = ('Unknown app. Try one of: %s'):format(seederNames()),
        })
        return
    end

    local myNumber = (tostring(settingsStore.getPhoneNumber(cid) or ''):gsub('%D', ''))
    local ctx = {
        src    = source,
        cid    = cid,
        name   = player.getName(source) or 'You',
        number = myNumber,
    }

    -- A full run replaces what the last one left rather than adding to it, so re-seeding while
    -- testing does not turn every tab into the same four posts six times over. Seeding a single
    -- app deliberately does not, because the clear is not scoped to one app.
    if want == 'all' then
        seedContent.clearCast(cid)
    end

    local total, liveApps = 0, 0
    for _, app in ipairs(apps) do
        local ok, res = pcall(seedContent.seed[app], ctx)
        if ok and type(res) == 'table' then
            total = total + (res.rows or 0)
            if res.live then
                liveApps = liveApps + 1
                print(('^2[sd-phone]^0 seedphone %s: %d rows, yours through the app'):format(app, res.rows or 0))
            else
                print(('^3[sd-phone]^0 seedphone %s: %d rows, store only (%s)')
                    :format(app, res.rows or 0, res.note or 'no action path for this app'))
            end
        else
            print(('^1[sd-phone]^0 seedphone %s failed: %s'):format(app, tostring(res)))
        end
    end

    badges.push(source)
    print(('^2[sd-phone]^0 /seedphone wrote %d rows across %d apps for %s (%d through a real action path)')
        :format(total, #apps, cid, liveApps))
    TriggerClientEvent('sd-phone:client:notify', source, {
        app = 'phone', title = 'Dev Seed',
        body = ('Seeded %d rows across %d apps. Open the admin panel, then hit Scan now on Flags.')
            :format(total, #apps),
    })
end)

---@type integer Channel the fake call uses. Far above anything the real allocator hands out, so
---a test call can never collide with a live one.
local FAKE_CALL_CHANNEL = 990001

---/fakecall [name] - DEV TOOL: drops the caller straight into the in-call panel, talking to
---themselves. The client drives the panel directly, so nothing on the server is
---holding a session: the red hangup button ends it because hangup on an unknown channel already
---replies with call:ended.
---
---There is no voice behind it. Speaker and Mute talk to the voice script about a call that does
---not exist, and a recording started here has no peer to answer, so it saves as one-sided.
---@param source integer player server id
---@param args table { name?: string }
lib.addCommand('fakecall', {
    help = 'Dev: put yourself in the in-call panel to test the call UI',
    restricted = 'group.admin',
    params = { { name = 'name', type = 'longString', help = 'Caller name to show', optional = true } },
}, function(source, args)
    local cid = player.getIdentifier(source)
    if not cid then return end

    local myNumber = (tostring(settingsStore.getPhoneNumber(cid) or ''):gsub('%D', ''))
    local display  = args.name
    if type(display) ~= 'string' or display == '' then display = player.getName(source) or 'Test Call' end

    callActions.devFake(source, {
        channel   = FAKE_CALL_CHANNEL,
        number    = myNumber ~= '' and myNumber or '5550100',
        name      = display,
        startedAt = os.time(),
    })

    TriggerClientEvent('sd-phone:client:call:devFake', source, {
        channel = FAKE_CALL_CHANNEL,
        name    = display,
        number  = myNumber ~= '' and myNumber or '5550100',
        video   = false,
    })

    print(('^2[sd-phone]^0 /fakecall opened the call panel for %s as "%s"'):format(cid, display))
end)
