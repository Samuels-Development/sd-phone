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

    MySQL.query.await("DELETE FROM `pages_posts` WHERE citizenid = ? OR (citizenid = ? AND title = 'Looking for a new job')", { OTHER, cid })
    MySQL.query.await("DELETE FROM `marketplace_listings` WHERE citizenid = ? OR (citizenid = ? AND title IN ('X80 Proto', 'Dominator'))", { OTHER, cid })

    pagesStore.insert(OTHER, '2018+ Sanchez',
        'Looking for a 2018 or newer model Sanchez. I am willing to pay a fair price for the right bike.',
        nil, nil, nil, '3105550123', nil, at(2026, 5, 23, 9, 10))
    pagesStore.insert(OTHER, 'Banshee Detailing Service',
        'Professional mobile car detailing. I come to you, full valet inside and out. Banshee in the photo is my own.',
        nil, VEH .. 'banshee.webp', nil, '2135550192', 'mike.banshee@lsmail.com', at(2026, 5, 25, 14, 0))
    pagesStore.insert(cid, 'Looking for a new job',
        'I am looking for a new job in the field of software development. Reliable, experienced, references available.',
        nil, nil, nil, '2135550148', nil, os.time())

    mpStore.insert(OTHER, 'Mechanic tools — full set',
        'Complete socket and wrench set, barely used. Selling as I am leaving the city. Can deliver locally.',
        850, nil, nil, '2135550133', nil, at(2026, 5, 20, 10, 0))
    mpStore.insert(OTHER, 'Looking for a Faggio',
        'In the market for a cheap runaround scooter. Condition is not important as long as it runs — cash waiting.',
        nil, nil, nil, '3105550160', nil, at(2026, 5, 21, 10, 0))
    mpStore.insert(cid, 'Dominator',
        'Vapid Dominator GTX, well maintained with a recent full service. Serious buyers only.',
        38500, VEH .. 'dominator.webp', nil, '2135550174', nil, at(2026, 5, 22, 10, 0))
    mpStore.insert(OTHER, 'Sanchez, 2018 Model',
        'Selling my 2018 Sanchez. It has low mileage and is in perfect condition. Price is negotiable.',
        1999, VEH .. 'sanchez.webp', nil, '3105550123', nil, at(2026, 5, 24, 10, 0))
    mpStore.insert(OTHER, 'Banshee',
        'Selling my 2020 model Bravado Banshee, low mileage and in perfect condition. Price is negotiable.',
        74999, VEH .. 'banshee.webp', nil, '2135550192', 'mike.banshee@lsmail.com', at(2026, 5, 25, 10, 52))
    mpStore.insert(cid, 'X80 Proto',
        'X80 Proto, white with red details. Has been driven carefully and is in mint condition.',
        2000000, VEH .. 'x80proto.webp', nil, '2135550148', nil, os.time())

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
    local count = math.min(math.max(tonumber(args.count) or 12, 1), 30)
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
    local convoCount = math.min(math.max(tonumber(args.count) or 6, 1), 15)

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
