---@type table Yellow Pages persistence layer (server.pages.store): post row CRUD.
local pagesStore = require 'server.pages.store'
---@type table Marketplace persistence layer (server.marketplace.store): listing row CRUD.
local mpStore    = require 'server.marketplace.store'
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
