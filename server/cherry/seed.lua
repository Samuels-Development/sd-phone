---@type table Accounts engine store (server.accounts.store): account create/lookup/delete + hashing.
local acctStore = require 'server.accounts.store'
---@type table Cherry persistence layer (server.cherry.store): profile upserts + full user wipes.
local store     = require 'server.cherry.store'

---@type string Username prefix every seeded profile carries - /cherryseedwipe removes exactly this set.
local PREFIX   = 'test_'
---@type string Password every seeded account gets.
local PASSWORD = 'cherry123'

---@type table<string, string[]> Name pools per gender.
local NAMES = {
    Man       = { 'Marcus', 'Diego', 'Tyrone', 'Vince', 'Lukas', 'Andre', 'Nikolai', 'Trevor', 'Dante', 'Jaxon' },
    Woman     = { 'Klara', 'Sofia', 'Mia', 'Aaliyah', 'Ivy', 'Nova', 'Jess', 'Lena', 'Bianca', 'Rosa' },
    Nonbinary = { 'Alex', 'Sam', 'Riley', 'Jordan', 'Quinn', 'Charlie', 'Skyler', 'Rowan', 'Kai', 'Emery' },
}
---@type string[] Weighted gender mix: mostly men/women, a real share of nonbinary profiles.
local GENDERS = { 'Man', 'Man', 'Woman', 'Woman', 'Nonbinary' }

---@type string[] Bio pool for seeded profiles.
local ABOUT = {
    'Looking for someone to cruise Vinewood with.',
    'Bean Machine regular. Fight me on oat milk.',
    'Mechanic by day, street racer by night.',
    "Paramedic. I'll fix your broken heart, literally.",
    'New in Los Santos, show me around?',
    'Surfer. Vespucci beach most mornings.',
    'DJ at the afterparties. Find me there.',
    'Dog parent first, everything else second.',
    'Pilot. Yes, I can fly you to Cayo.',
    'Just here so my friends stop asking.',
    'Gym, grind, Galileo Park sunsets.',
    'Will beat you at pool. Sorry in advance.',
}

---@type string[] Weighted interest mix, leaning toward Everyone.
local INTERESTS = { 'Everyone', 'Everyone', 'Women', 'Men' }

---2-4 photos per profile: a pravatar face for the lead photo and picsum fillers for the
---carousel, seeded off the username.
---@param username string seeded username (keys the picsum seed)
---@param faceId integer pravatar portrait id
---@return string[] photos hosted photo URLs
local function photoUrls(username, faceId)
    local photos = { ('https://i.pravatar.cc/600?img=%d'):format(faceId) }
    for i = 2, math.random(2, 4) do
        photos[#photos + 1] = ('https://picsum.photos/seed/%s-%d/600/900'):format(username, i)
    end
    return photos
end

---/cherryseed [count] (admin-only): fabricates real accounts + visible profiles with random
---names, ages, bios, interests and hosted photos. Count is clamped 1-50 server-side.
---@param source integer player server id (0 when run from console)
---@param args table parsed command args { count? }
lib.addCommand('cherryseed', {
    help = 'Seed Cherry with fake test profiles (random data + photos)',
    restricted = 'group.admin',
    params = {
        { name = 'count', type = 'number', help = 'How many profiles (default 8, max 50)', optional = true },
    },
}, function(source, args)
    local n = math.min(50, math.max(1, math.floor(tonumber(args and args.count) or 8)))
    local made = 0

    for _ = 1, n do
        local gender = GENDERS[math.random(#GENDERS)]
        local pool   = NAMES[gender]
        local name   = pool[math.random(#pool)]
        local username = ('%s%s%04d'):format(PREFIX, name:lower(), math.random(0, 9999))

        if not acctStore.getAccount('cherry', username) then
            acctStore.insertAccount('cherry', username, name, acctStore.hashPassword(PASSWORD), nil, nil)
            store.upsertProfile(username, {
                name       = name,
                age        = math.random(18, 42),
                about      = ABOUT[math.random(#ABOUT)],
                gender     = gender,
                interested = INTERESTS[math.random(#INTERESTS)],
                visible    = true,
                photos     = photoUrls(username, math.random(1, 70)),
            })
            made = made + 1
        end
    end

    local msg = ('[sd-phone:cherry] seeded %d test profile%s (usernames %s*, password %s). /cherryseedwipe removes them.')
        :format(made, made == 1 and '' or 's', PREFIX, PASSWORD)
    print('^2' .. msg .. '^0')
    if source > 0 then
        TriggerClientEvent('sd-phone:client:notify', source, {
            app = 'cherry', appId = 'cherry', title = 'Cherry',
            body = ('Seeded %d test profiles. Reopen Cherry to see them.'):format(made), time = 'now',
        })
    end
end)

---/cherryseedwipe (admin-only): removes every Cherry profile created by /cherryseed, plus their
---accounts, matches and chats.
---@param source integer player server id (0 when run from console)
lib.addCommand('cherryseedwipe', {
    help = 'Remove every Cherry profile created by /cherryseed (and their accounts, matches, chats)',
    restricted = 'group.admin',
}, function(source)
    local rows = MySQL.query.await(
        "SELECT username FROM phone_cherry_profiles WHERE username LIKE ?", { PREFIX:gsub('_', '\\_') .. '%' }
    ) or {}

    for _, r in ipairs(rows) do
        store.wipeUser(r.username)
        local acc = acctStore.getAccount('cherry', r.username)
        if acc then acctStore.deleteAccount(acc.id) end
    end

    local msg = ('[sd-phone:cherry] wiped %d seeded test profile%s.'):format(#rows, #rows == 1 and '' or 's')
    print('^2' .. msg .. '^0')
    if source > 0 then
        TriggerClientEvent('sd-phone:client:notify', source, {
            app = 'cherry', appId = 'cherry', title = 'Cherry',
            body = ('Removed %d seeded test profiles.'):format(#rows), time = 'now',
        })
    end
end)
