---@type table Player bridge (bridge.server.player): citizenid/name/live-source lookups.
local player    = require 'bridge.server.player'
---@type table Shared app-accounts store (server.accounts.store): signed-in session -> account rows.
local acctStore = require 'server.accounts.store'
---@type table Money bridge (bridge.server.money): framework-agnostic bank debits/credits.
local money     = require 'bridge.server.money'
---@type table Ryde persistence layer (server.ryde.store): driver profiles + finished rides.
local store     = require 'server.ryde.store'
---@type table Settings store (server.settings.store): phone-number provisioning for trip cards.
local settings  = require 'server.settings.store'
---@type table Banking actions (server.banking.actions): phone Wallet transaction log entries.
local bank      = require 'server.banking.actions'
---@type table Ryde config (configs/ryde.lua): destinations, fare rails, driver cut, leaderboard.
local config    = require 'configs.ryde'

---@type table Actions module; the table returned at end of file.
local actions = {}

-- Live matching state, in-memory only; finished rides persist via store.insertRide. Driver-side
-- keys are the Ryde account username, riders are keyed by citizenid.
---@type table<string, table> On-duty drivers by username: { cid, name, vehicle, plate, color, rating, since }.
local online       = {}
---@type table<string, table> Pending ride requests by id (no driver locked in yet).
local requests     = {}
---@type table<string, table> Engaged trips by id (offered -> enroute_pickup -> arriving -> in_progress -> completed).
local trips        = {}
---@type table<string, string> The request/trip id a rider (citizenid) is currently in.
local riderActive  = {}
---@type table<string, string> The trip id a driver (username) is currently on.
local driverActive = {}
---@type table<integer, string> Citizenid per live src, cached so disconnect cleanup stays reliable.
local srcCid       = {}
---@type table<integer, table> { tripId, role } per src while they watch a trip map (gates the live peer stream).
local tripViewers  = {}

---@type string Client event prefix every Ryde push goes out under.
local EV = 'sd-phone:client:ryde:'

local util = require 'server.util'
local ok, fail = util.ok, util.fail


---Coerces a client-supplied value to a finite number, rejecting non-numbers, NaN and the
---infinities.
---@param v any
---@return number|nil n the finite number, nil when unusable
local function finite(v)
    local n = tonumber(v)
    if not n or n ~= n or n == math.huge or n == -math.huge then return nil end
    return n
end

---Current server source for a citizenid, or nil when they're offline.
---@param cid string|nil
---@return integer|nil
local function srcOf(cid) return cid and player.getSourceByIdentifier(cid) or nil end

---Pushes an event straight to a player by citizenid. No-op when offline.
---@param cid string|nil
---@param event string suffix appended to EV
---@param data table
local function pushTo(cid, event, data)
    local src = srcOf(cid)
    if src then TriggerClientEvent(EV .. event, src, data) end
end

---Fans an event out to every on-duty driver; a driver whose live source can't be resolved is
---logged.
---@param event string suffix appended to EV
---@param data table
local function broadcastToDrivers(event, data)
    for _, d in pairs(online) do
        local src = srcOf(d.cid)
        if src then
            TriggerClientEvent(EV .. event, src, data)
        else
            print(('^1[sd-phone:ryde]^0 online driver %s could not be reached (no live source)'):format(d.cid))
        end
    end
end

---How many riders are waiting on the open board right now (no driver locked in).
---@return integer
local function waitingCount()
    local n = 0
    for _ in pairs(requests) do n = n + 1 end
    return n
end

---Broadcasts the current waiting-rider count to every player.
local function broadcastWaiting()
    TriggerClientEvent(EV .. 'waitingCount', -1, { count = waitingCount() })
end

---Fires a Ryde phone notification (quietInApp) to a player by citizenid for a trip milestone.
---@param cid string|nil
---@param body string
local function notifyRyde(cid, body)
    local src = srcOf(cid)
    if not src then return end
    TriggerClientEvent('sd-phone:client:notify', src, {
        app = 'ryde', appId = 'ryde', quietInApp = true, time = 'now', title = 'Ryde', body = body,
    })
end

---Fires a Bank/Wallet notification (quietInApp) for a Ryde money movement.
---@param cid string|nil
---@param body string
local function notifyBank(cid, body)
    local src = srcOf(cid)
    if not src then return end
    TriggerClientEvent('sd-phone:client:notify', src, {
        app = 'bank', appId = 'bank', quietInApp = true, time = 'now', title = 'Bank', body = body,
    })
end

---Resolves the caller's signed-in Ryde account from src, attaching the citizenid as `_cid` and
---the resolved display name; refreshes the src -> citizenid cache.
---@param src integer player server id
---@return table|nil account
local function account(src)
    local cid = player.getIdentifier(src)
    if not cid then return nil end
    local acc = acctStore.getSessionAccount('ryde', cid)
    if not acc then return nil end
    acc._cid  = cid
    acc.name  = (acc.displayName and acc.displayName ~= '') and acc.displayName or acc.username
    srcCid[src] = cid
    return acc
end

---Resolves the caller as a rider (no Ryde account required): citizenid from src, character
---name; refreshes the src -> citizenid cache.
---@param src integer player server id
---@return table|nil rider { cid, name }
local function rider(src)
    local cid = player.getIdentifier(src)
    if not cid then return nil end
    srcCid[src] = cid
    return { cid = cid, name = player.getName(src) }
end

---How many drivers are currently on duty.
---@return integer
local function onlineCount()
    local n = 0
    for _ in pairs(online) do n = n + 1 end
    return n
end

---Straight-line 2D distance in km between two {x, y} points.
---@param a table
---@param b table
---@return number
local function distanceKm(a, b)
    return math.sqrt((a.x - b.x) ^ 2 + (a.y - b.y) ^ 2) / 1000
end

---Trims a pending request down to a driver's board card, omitting the rider's citizenid and
---payment choice.
---@param r table request record
---@return table
local function publicRequest(r)
    return {
        id = r.id, riderName = r.riderName,
        pickup = r.pickup, dropoff = r.dropoff,
        distance = r.distance, createdAt = r.createdAt,
    }
end

---Builds the trip as seen by one side; `role` tags which end the payload is for, and each side
---gets the other party's phone number.
---@param t table trip record
---@param role string 'rider'|'driver'
---@return table
local function publicTrip(t, role)
    return {
        id = t.id, requestId = t.requestId, status = t.status, role = role,
        riderName = t.riderName, driverName = t.driverName,
        vehicle = t.vehicle, plate = t.plate, color = t.color, rating = t.driverRating,
        number = (role == 'driver') and t.riderNumber or t.driverNumber,
        fare = t.fare, payment = t.payment,
        pickup = t.pickup, dropoff = t.dropoff, distance = t.distance,
    }
end

---Tears down an engaged trip, records it as cancelled, and notifies the party who didn't
---trigger the cancel. `by` is 'rider' | 'driver' | 'disconnect'.
---@param trip table
---@param by string
local function cancelTrip(trip, by)
    trips[trip.id] = nil
    if riderActive[trip.riderUsername] == trip.id then riderActive[trip.riderUsername] = nil end
    driverActive[trip.driverUsername] = nil
    trip.status = 'cancelled'
    trip.paid   = false
    store.insertRide(trip)
    if by ~= 'rider' then
        pushTo(trip.riderCid,  'tripUpdate', { id = trip.id, status = 'cancelled', role = 'rider',  by = by })
    end
    if by ~= 'driver' then
        pushTo(trip.driverCid, 'tripUpdate', { id = trip.id, status = 'cancelled', role = 'driver', by = by })
    end
end

---Drops a single offered trip and frees its driver, leaving the rider's open request untouched;
---a still-open request goes back on this driver's board.
---@param trip table
local function dropOffer(trip)
    trips[trip.id] = nil
    driverActive[trip.driverUsername] = nil
    local req = trip.requestId and requests[trip.requestId] or nil
    if req then
        pushTo(trip.driverCid, 'requestAdded', publicRequest(req))
    end
end

---Drops every outstanding offer on a request except `keepId` (nil = drop all), bumping each
---passed-over driver back to free with a `notify` status push.
---@param requestId string
---@param keepId string|nil
---@param notify string
local function clearOffersFor(requestId, keepId, notify)
    for id, t in pairs(trips) do
        if t.requestId == requestId and t.status == 'offered' and id ~= keepId then
            dropOffer(t)
            pushTo(t.driverCid, 'tripUpdate', { id = id, status = notify, role = 'driver' })
        end
    end
end

---Returns whether the trip's rider and driver currently sit in the same vehicle, read from
---server-side OneSync entities.
---@param trip table
---@return boolean
local function inSameVehicle(trip)
    local driverSrc = srcOf(trip.driverCid)
    local riderSrc  = srcOf(trip.riderCid)
    if not (driverSrc and riderSrc) then return false end
    local dv = GetVehiclePedIsIn(GetPlayerPed(driverSrc), false)
    local rv = GetVehiclePedIsIn(GetPlayerPed(riderSrc), false)
    return dv ~= 0 and dv == rv
end

---Returns whether a live player is within `radius` metres of a world point, using server-side
---ped coords.
---@param src number|nil
---@param x number
---@param y number
---@param radius number
---@return boolean
local function withinOf(src, x, y, radius)
    if not src then return false end
    local c = GetEntityCoords(GetPlayerPed(src))
    local dx, dy = c.x - x, c.y - y
    return (dx * dx + dy * dy) <= (radius * radius)
end

---Posts a rider's ride request onto the open board, one live request/trip per rider; coords are
---coerced finite, labels capped, payment whitelisted, and free on-duty drivers notified.
---@param src integer player server id
---@param payload table { pickup: { label?, x, y }, dropoff: { label?, x, y }, payment?: string }
---@return table result { requestId } on success
function actions.requestRide(src, payload)
    local rdr = rider(src)
    if not rdr then return fail('Could not resolve your character.') end
    if riderActive[rdr.cid] then return fail('You already have an active ride.') end

    local p = type(payload) == 'table' and payload or {}
    local pickup  = type(p.pickup)  == 'table' and p.pickup  or nil
    local dropoff = type(p.dropoff) == 'table' and p.dropoff or nil
    local px = pickup and finite(pickup.x)
    local py = pickup and finite(pickup.y)
    local dx = dropoff and finite(dropoff.x)
    local dy = dropoff and finite(dropoff.y)
    if not (px and py and dx and dy) then
        return fail('Pick a destination first.')
    end

    local req = {
        id            = store.newId(),
        riderUsername = rdr.cid,
        riderName     = rdr.name,
        riderCid      = rdr.cid,
        pickup        = { label = (type(pickup.label) == 'string' and pickup.label or 'Current location'):sub(1, 96), x = px + 0.0, y = py + 0.0 },
        dropoff       = { label = (type(dropoff.label) == 'string' and dropoff.label or 'Destination'):sub(1, 96), x = dx + 0.0, y = dy + 0.0 },
        payment       = (p.payment == 'cash') and 'cash' or 'card',
        createdAt     = os.time() * 1000,
    }
    req.distance = distanceKm(req.pickup, req.dropoff)

    requests[req.id]      = req
    riderActive[rdr.cid]  = req.id
    broadcastToDrivers('requestAdded', publicRequest(req))
    broadcastWaiting()
    for username, d in pairs(online) do
        if not driverActive[username] then
            notifyRyde(d.cid, ('New ride request from %s near %s'):format(rdr.name, req.pickup.label))
        end
    end
    print(('^3[sd-phone:ryde]^0 ride request from %s (%s) broadcast to %d online driver(s)'):format(rdr.name, rdr.cid, onlineCount()))
    return ok({ requestId = req.id })
end

---Rider responds to a driver's offer: accept locks the trip in, pulls the request off the board,
---bounces other bids and pushes the engaged trip to both parties; decline drops just this offer.
---@param src integer player server id
---@param payload table { tripId: string, accept?: boolean }
---@return table result
function actions.respond(src, payload)
    local cid = player.getIdentifier(src)
    local p = type(payload) == 'table' and payload or {}
    local trip = p.tripId and trips[p.tripId] or nil
    if not (trip and trip.riderCid == cid and trip.status == 'offered') then
        return fail('No pending offer.')
    end

    if p.accept then
        if trip.requestId and requests[trip.requestId] then
            requests[trip.requestId] = nil
            broadcastToDrivers('requestRemoved', { id = trip.requestId })
            broadcastWaiting()
        end
        clearOffersFor(trip.requestId, trip.id, 'declined')

        trip.status = 'enroute_pickup'
        riderActive[trip.riderUsername] = trip.id
        local driverView = publicTrip(trip, 'driver')
        driverView.waypoint = trip.pickup
        pushTo(trip.driverCid, 'tripUpdate', driverView)
        pushTo(trip.riderCid,  'tripUpdate', publicTrip(trip, 'rider'))
        notifyRyde(trip.driverCid, ('%s accepted your fare. Head to the pickup.'):format(trip.riderName or 'Your rider'))
        return ok({ tripId = trip.id })
    end

    dropOffer(trip)
    pushTo(trip.driverCid, 'tripUpdate', { id = trip.id, status = 'declined', role = 'driver' })
    return ok({ declined = true })
end

---Goes on/off duty. Going online registers/refreshes the driver's vehicle card and hands back
---the current board; going offline is blocked mid-trip and returns the live waiting count.
---@param src integer player server id
---@param payload table { online: boolean, vehicle?: string, plate?: string, color?: string }
---@return table result
function actions.setOnline(src, payload)
    local acc = account(src)
    if not acc then return fail('Sign in to Ryde first.') end
    local p = type(payload) == 'table' and payload or {}

    if p.online then
        local veh   = tostring(p.vehicle or 'Vehicle'):sub(1, 64)
        local plate = tostring(p.plate or ''):sub(1, 16)
        local color = tostring(p.color or '#111111'):sub(1, 16)
        store.upsertDriver(acc.username, acc.name, veh, plate, color)
        local d = store.getDriver(acc.username)
        local rating = (d and d.rating_count > 0) and (d.rating_sum / d.rating_count) or 5.0
        online[acc.username] = {
            cid = acc._cid, name = acc.name,
            vehicle = veh, plate = plate, color = color, rating = rating, since = os.time() * 1000,
        }
        local pending = {}
        for _, r in pairs(requests) do pending[#pending + 1] = publicRequest(r) end
        print(('^3[sd-phone:ryde]^0 %s went on duty (%d pending request(s) on the board)'):format(acc.name, #pending))
        return ok({ online = true, requests = pending, waiting = #pending })
    end

    if driverActive[acc.username] then return fail('Finish your current trip before going offline.') end
    online[acc.username] = nil
    return ok({ online = false, waiting = waitingCount() })
end

---Returns how many riders are waiting right now, for any signed-in account. Read-only.
---@param src integer player server id
---@return table result { count }
function actions.waitingCount(src)
    local acc = account(src)
    if not acc then return fail('Sign in to Ryde first.') end
    return ok({ count = waitingCount() })
end

---Snapshot of the open requests board (dashboard refresh). On-duty drivers only; anyone else
---gets an empty board rather than an error. Read-only.
---@param src integer player server id
---@return table result { requests }
function actions.requestsBoard(src)
    local acc = account(src)
    if not acc then return fail('Sign in to Ryde first.') end
    if not online[acc.username] then return ok({ requests = {} }) end
    local pending = {}
    for _, r in pairs(requests) do pending[#pending + 1] = publicRequest(r) end
    return ok({ requests = pending })
end

---Driver bids on a pending request by quoting a fare, creating an 'offered' trip; the fare is
---coerced to a finite integer and clamped, and the gates are re-checked after the DB awaits.
---@param src integer player server id
---@param payload table { requestId: string, fare: number }
---@return table result { tripId } on success
function actions.accept(src, payload)
    local acc = account(src)
    if not acc then return fail('Sign in to Ryde first.') end
    if not online[acc.username] then return fail('Go online to accept rides.') end
    if driverActive[acc.username] then return fail('You already have an active trip.') end

    local p = type(payload) == 'table' and payload or {}
    local req = p.requestId and requests[p.requestId] or nil
    if not req then return fail('That ride is no longer available.') end
    if req.riderCid == acc._cid then return fail('You cannot accept your own request.') end

    local fare = finite(p.fare)
    fare = fare and math.floor(fare) or 0
    if fare < (config.MinFare or 1) then return fail('Enter a fare.') end
    if fare > (config.MaxFare or 100000) then return fail('That fare is too high.') end

    local drv = online[acc.username]
    local driverNumber = settings.ensurePhoneNumber(acc._cid)
    local riderNumber  = settings.ensurePhoneNumber(req.riderCid)
    if not online[acc.username] then return fail('Go online to accept rides.') end
    if driverActive[acc.username] then return fail('You already have an active trip.') end
    if not requests[req.id] then return fail('That ride is no longer available.') end

    local trip = {
        id = store.newId(), requestId = req.id,
        riderUsername = req.riderUsername, riderName = req.riderName, riderCid = req.riderCid,
        driverUsername = acc.username, driverName = drv.name, driverCid = acc._cid,
        driverNumber = driverNumber,
        riderNumber  = riderNumber,
        vehicle = drv.vehicle, plate = drv.plate, color = drv.color, driverRating = drv.rating,
        pickup = req.pickup, dropoff = req.dropoff, distance = req.distance,
        payment = req.payment, fare = fare, status = 'offered',
    }
    trips[trip.id]             = trip
    driverActive[acc.username] = trip.id
    pushTo(trip.riderCid, 'offer', publicTrip(trip, 'rider'))
    local riderSrc = srcOf(trip.riderCid)
    if riderSrc then
        TriggerClientEvent('sd-phone:client:notify', riderSrc, {
            app = 'ryde', appId = 'ryde', quietInApp = true, time = 'now',
            title = 'Ryde', body = ('%s offered a fare of $%d'):format(trip.driverName, fare),
        })
    end
    print(('^3[sd-phone:ryde]^0 %s offered $%d on request %s (trip %s)'):format(acc.name, fare, req.id, trip.id))
    return ok({ tripId = trip.id })
end

---Driver advances an accepted trip to 'arriving' or 'in_progress'; only the trip's own driver,
---never from 'offered', and starting requires rider and driver to share a vehicle.
---@param src integer player server id
---@param payload table { tripId: string, status: 'arriving'|'in_progress' }
---@return table result { status }
function actions.tripStatus(src, payload)
    local acc = account(src)
    if not acc then return fail('Sign in to Ryde first.') end
    local p = type(payload) == 'table' and payload or {}
    local trip = p.tripId and trips[p.tripId] or nil
    if not (trip and trip.driverUsername == acc.username) then return fail('No active trip.') end
    if trip.status == 'offered' then return fail('No active trip.') end

    local nextStatus = p.status
    if nextStatus ~= 'arriving' and nextStatus ~= 'in_progress' then return fail('Invalid status.') end
    if nextStatus == 'in_progress' and not inSameVehicle(trip) then
        return fail('Your rider needs to be in your vehicle to start the trip.')
    end
    trip.status = nextStatus

    pushTo(trip.riderCid, 'tripUpdate', publicTrip(trip, 'rider'))
    local driverView = publicTrip(trip, 'driver')
    if nextStatus == 'in_progress' then driverView.waypoint = trip.dropoff end
    pushTo(trip.driverCid, 'tripUpdate', driverView)
    if nextStatus == 'arriving' then
        notifyRyde(trip.riderCid, 'Your driver has arrived. Hop in when you’re ready.')
    else
        notifyRyde(trip.riderCid, ('Trip started. On the way to %s.'):format(trip.dropoff.label))
    end
    return ok({ status = nextStatus })
end

---Driver UI poll: returns whether rider and driver share a vehicle right now. Read-only.
---@param src integer player server id
---@param payload table { tripId: string }
---@return table result { same }
function actions.sameVehicle(src, payload)
    local acc = account(src)
    if not acc then return fail('Sign in to Ryde first.') end
    local p = type(payload) == 'table' and payload or {}
    local trip = p.tripId and trips[p.tripId] or nil
    if not (trip and trip.driverUsername == acc.username) then return fail('No active trip.') end
    return ok({ same = inSameVehicle(trip) })
end

---Driver completes an 'in_progress' trip within 250m of the drop-off: charges the rider bank ->
---bank, pays the driver's cut, persists the ride and bumps stats; unpaid rides record paid = false.
---@param src integer player server id
---@param payload table { tripId: string }
---@return table result { rideId, fare, paid }
function actions.complete(src, payload)
    local acc = account(src)
    if not acc then return fail('Sign in to Ryde first.') end
    local p = type(payload) == 'table' and payload or {}
    local trip = p.tripId and trips[p.tripId] or nil
    if not (trip and trip.driverUsername == acc.username) then return fail('No active trip.') end
    if trip.status ~= 'in_progress' then return fail('Pick up your rider before completing the trip.') end
    if not withinOf(srcOf(trip.driverCid), trip.dropoff.x, trip.dropoff.y, 250.0) then
        return fail('Drive to the drop-off to complete the trip.')
    end

    trips[trip.id] = nil
    riderActive[trip.riderUsername]   = nil
    driverActive[trip.driverUsername] = nil

    local riderSrc  = srcOf(trip.riderCid)
    local driverSrc = srcOf(trip.driverCid)
    local driverEarn = math.floor(trip.fare * (config.DriverCut or 1.0) + 0.5)

    local paid = false
    if riderSrc and money.get(riderSrc, 'bank') >= trip.fare then
        money.remove(riderSrc, 'bank', trip.fare, 'Ryde fare')
        if driverSrc then money.add(driverSrc, 'bank', driverEarn, 'Ryde earnings') end
        paid = true
    end

    if paid then
        bank.addExternal(trip.riderCid, { label = 'Ryde trip', amount = -trip.fare, category = 'ryde', counterparty = trip.driverName })
        notifyBank(trip.riderCid, ('Charged $%d for your Ryde trip'):format(trip.fare))
        if driverSrc then
            bank.addExternal(trip.driverCid, { label = 'Ryde earnings', amount = driverEarn, category = 'ryde', counterparty = trip.riderName })
            notifyBank(trip.driverCid, ('You earned $%d from your Ryde trip'):format(driverEarn))
        end
    end

    trip.status = 'completed'
    trip.paid   = paid
    store.insertRide(trip)
    store.bumpDriverStats(trip.driverUsername, paid and driverEarn or 0)

    pushTo(trip.riderCid, 'tripUpdate', {
        id = trip.id, rideId = trip.id, status = 'completed', role = 'rider',
        fare = trip.fare, paid = paid, driverName = trip.driverName,
    })
    pushTo(trip.driverCid, 'tripUpdate', {
        id = trip.id, status = 'completed', role = 'driver',
        fare = trip.fare, earn = paid and driverEarn or 0, paid = paid,
    })
    notifyRyde(trip.riderCid, ('Ride completed. Fare $%d. Tap to rate your driver.'):format(math.floor(trip.fare)))
    return ok({ rideId = trip.id, fare = trip.fare, paid = paid })
end

---Cancels whatever the caller is currently in, derived from their own live state: a pending
---request, an un-accepted offer, or an engaged trip, with the counterpart notified.
---@param src integer player server id
---@return table result
function actions.cancel(src)
    local cid      = player.getIdentifier(src)
    local riderId  = cid and riderActive[cid] or nil
    if riderId then
        if requests[riderId] then
            requests[riderId] = nil
            riderActive[cid]  = nil
            broadcastToDrivers('requestRemoved', { id = riderId })
            broadcastWaiting()
            clearOffersFor(riderId, nil, 'cancelled')
            return ok({})
        end
        local trip = trips[riderId]
        if trip then cancelTrip(trip, 'rider'); return ok({}) end
    end

    local acc   = account(src)
    local drvId = acc and driverActive[acc.username] or nil
    local trip  = drvId and trips[drvId] or nil
    if trip then
        if trip.status == 'offered' then
            dropOffer(trip)
            pushTo(trip.riderCid, 'offerRemoved', { id = trip.id, requestId = trip.requestId })
        else
            cancelTrip(trip, 'driver')
        end
        return ok({})
    end
    return fail('Nothing to cancel.')
end

---Rider rates their own finished ride 1-5 stars, optionally tipping rider bank -> driver bank;
---the rating is single-shot at the DB level and the driver gets a live update + notification.
---@param src integer player server id
---@param payload table { rideId: string, stars: number, tip?: number }
---@return table result { rated, tipPaid }
function actions.rate(src, payload)
    local cid = player.getIdentifier(src)
    if not cid then return fail('Could not resolve your character.') end
    local p = type(payload) == 'table' and payload or {}
    local stars = finite(p.stars)
    stars = stars and math.floor(stars) or 0
    if stars < 1 or stars > 5 then return fail('Pick 1 to 5 stars.') end

    local ride = type(p.rideId) == 'string' and store.getRide(p.rideId) or nil
    if not (ride and ride.rider_username == cid) then return fail('Ride not found.') end
    if ride.rating ~= nil then return fail('You already rated this trip.') end

    local affected = store.setRideRating(ride.id, stars)
    if not (affected and affected > 0) then return fail('Could not save your rating.') end

    local drvUser = ride.driver_username
    if drvUser and drvUser ~= '' then store.addRating(drvUser, stars) end

    local drv       = drvUser and online[drvUser] or nil
    local driverSrc = drv and srcOf(drv.cid) or nil

    local tip = finite(p.tip)
    tip = tip and math.floor(tip) or 0
    local tipPaid = 0
    if tip > 0 and driverSrc then
        if money.get(src, 'bank') >= tip then
            money.remove(src, 'bank', tip, 'Ryde tip')
            money.add(driverSrc, 'bank', tip, 'Ryde tip')
            tipPaid = tip
        end
    end

    if tipPaid > 0 then
        bank.addExternal(cid, { label = 'Ryde tip', amount = -tipPaid, category = 'ryde', counterparty = ride.driver_name })
        notifyBank(cid, ('You tipped $%d'):format(tipPaid))
        if drv then
            bank.addExternal(drv.cid, { label = 'Ryde tip', amount = tipPaid, category = 'ryde', counterparty = ride.rider_name })
            notifyBank(drv.cid, ('You received a $%d tip'):format(tipPaid))
        end
    end

    if driverSrc then
        pushTo(drv.cid, 'ratingReceived', { id = ride.id, stars = stars, tip = tipPaid })
        local who  = (ride.rider_name and ride.rider_name ~= '') and ride.rider_name or 'Your rider'
        local body = ('%s rated you %d★'):format(who, stars)
        if tipPaid > 0 then body = ('%s and tipped $%d'):format(body, tipPaid) end
        TriggerClientEvent('sd-phone:client:notify', driverSrc, {
            app = 'ryde', appId = 'ryde', time = 'now', title = 'Ryde', body = body,
        })
    end

    return ok({ rated = stars, tipPaid = tipPaid })
end

---Driver-info block for a trip, as the rider's UI expects it.
---@param t table trip record
---@return table
local function tripDriverInfo(t)
    return { name = t.driverName, car = t.vehicle, plate = t.plate, color = t.color, rating = t.driverRating, number = t.driverNumber }
end

---Returns the rider's live ride right now: a pending request with any open offers folded in, or
---an engaged trip.
---@param cid string rider citizenid
---@return table|nil
local function riderActivePayload(cid)
    local id  = riderActive[cid]
    local req = id and requests[id] or nil
    if req then
        local offers = {}
        for tid, t in pairs(trips) do
            if t.requestId == id and t.status == 'offered' then
                offers[#offers + 1] = { tripId = tid, fare = t.fare, driver = tripDriverInfo(t) }
            end
        end
        return {
            id = req.id, status = (#offers > 0) and 'offered' or 'finding',
            pickup = req.pickup, dropoff = req.dropoff, distance = req.distance,
            payment = req.payment, createdAt = req.createdAt, riderName = req.riderName,
            offers = offers,
        }
    end
    local t = id and trips[id] or nil
    if t then
        return {
            id = t.id, tripId = t.id, status = t.status,
            pickup = t.pickup, dropoff = t.dropoff, distance = t.distance,
            payment = t.payment, fare = t.fare, riderName = t.riderName,
            driver = tripDriverInfo(t),
        }
    end
    return nil
end

---The driver's live engaged trip (offered -> in_progress), driver perspective.
---@param username string|nil driver account username
---@return table|nil
local function driverActivePayload(username)
    local id = username and driverActive[username] or nil
    local t  = id and trips[id] or nil
    if not t then return nil end
    return {
        id = t.id, tripId = t.id, status = t.status,
        pickup = t.pickup, dropoff = t.dropoff, distance = t.distance,
        payment = t.payment, fare = t.fare, riderName = t.riderName, riderNumber = t.riderNumber,
    }
end

---Re-syncs the caller's live Ryde state on app open: rider/driver live payloads, the most recent
---persisted ride when nothing is live rider-side, and the open board for on-duty drivers. Read-only.
---@param src integer player server id
---@return table result { rider, driver, lastEnded, requests }
function actions.sync(src)
    local cid = player.getIdentifier(src)
    if not cid then return fail('Could not resolve your character.') end
    local acc    = account(src)
    local rider  = riderActivePayload(cid)
    local driver = acc and driverActivePayload(acc.username) or nil
    local lastEnded
    if not rider then
        local row = store.latestRiderRide(cid)
        if row then lastEnded = { id = row.id, status = row.status, fare = tonumber(row.fare) or 0 } end
    end
    local board
    if acc and online[acc.username] then
        board = {}
        for _, r in pairs(requests) do board[#board + 1] = publicRequest(r) end
    end
    return ok({ rider = rider, driver = driver, lastEnded = lastEnded, requests = board })
end

---Starts/stops the live peer-location stream while the caller looks at a trip map; only the
---trip's own rider or driver may watch, with the role fixed server-side.
---@param src integer player server id
---@param payload table { tripId: string, on: boolean }
---@return table result
function actions.watchTrip(src, payload)
    local p = type(payload) == 'table' and payload or {}
    if not p.on then tripViewers[src] = nil; return ok({}) end
    local trip = p.tripId and trips[p.tripId] or nil
    if not trip then tripViewers[src] = nil; return fail('No such trip.') end
    local cid = player.getIdentifier(src)
    local acc = account(src)
    local isRider  = trip.riderCid == cid
    local isDriver = acc and trip.driverUsername == acc.username
    if not (isRider or isDriver) then return fail('Not your trip.') end
    tripViewers[src] = { tripId = p.tripId, role = isDriver and 'driver' or 'rider' }
    return ok({})
end

-- Live peer-location push loop: every 500ms, pushes each watcher's counterpart position
-- (server-side coords); watchers whose trip ended or who disconnected are dropped.
CreateThread(function()
    while true do
        Wait(500)
        for vsrc, w in pairs(tripViewers) do
            if not GetPlayerName(vsrc) then
                tripViewers[vsrc] = nil
            else
                local trip = w.tripId and trips[w.tripId] or nil
                if not trip then
                    tripViewers[vsrc] = nil
                else
                    local otherCid  = (w.role == 'driver') and trip.riderCid or trip.driverCid
                    local otherRole = (w.role == 'driver') and 'rider' or 'driver'
                    local osrc = otherCid and srcOf(otherCid) or nil
                    if osrc then
                        local ped = GetPlayerPed(osrc)
                        if ped and ped ~= 0 then
                            local c = GetEntityCoords(ped)
                            TriggerClientEvent(EV .. 'peerLocation', vsrc, {
                                tripId = w.tripId, role = otherRole,
                                x = c.x, y = c.y, h = GetEntityHeading(ped),
                            })
                        end
                    end
                end
            end
        end
    end
end)

---Returns every ride the caller took part in, split into rider/driver entries; riders keyed by
---citizenid, drivers by account username. Read-only.
---@param src integer player server id
---@return table result { asRider, asDriver }
function actions.history(src)
    local cid = player.getIdentifier(src)
    if not cid then return fail('Could not resolve your character.') end
    local acc = account(src)
    local driverKey = (acc and acc.username) or cid
    local rows = store.ridesForUser(cid, driverKey)
    local asRider, asDriver = {}, {}
    for _, r in ipairs(rows) do
        local entry = {
            id = r.id, status = r.status, fare = r.fare, paid = r.paid == true or r.paid == 1 or r.paid == '1', payment = r.payment,
            pickup   = { label = r.pickup_label,  x = r.pickup_x,  y = r.pickup_y },
            dropoff  = { label = r.dropoff_label, x = r.dropoff_x, y = r.dropoff_y },
            distance = r.distance, rating = r.rating, createdAt = r.created_at,
            riderName = r.rider_name, driverName = r.driver_name,
        }
        if r.rider_username  == cid       then asRider[#asRider + 1]   = entry end
        if r.driver_username == driverKey then asDriver[#asDriver + 1] = entry end
    end
    return ok({ asRider = asRider, asDriver = asDriver })
end

---Returns the top drivers server-wide (confidence-weighted rating), with avg_rating coerced and
---rounded to two decimals. Read-only.
---@return table result { leaders }
function actions.leaderboard()
    local rows = store.leaderboard(50, config.LeaderboardPriorRating or 4.5, config.LeaderboardWeight or 10)
    local out = {}
    for i, r in ipairs(rows) do
        out[i] = {
            username = r.username,
            name   = (r.display_name and r.display_name ~= '') and r.display_name or r.username,
            rating = math.floor((tonumber(r.avg_rating) or 5) * 100 + 0.5) / 100,
            trips  = tonumber(r.trips) or 0,
            color  = r.color,
        }
    end
    return ok({ leaders = out })
end

---Returns the caller's own Ryde profile: account identity, driver card + lifetime stats,
---current duty state, and whatever ride/trip they're active in. Read-only.
---@param src integer player server id
---@return table result
function actions.me(src)
    local acc = account(src)
    if not acc then return fail('Sign in to Ryde first.') end
    local d = store.getDriver(acc.username)
    local rating = (d and d.rating_count > 0) and (d.rating_sum / d.rating_count) or 5.0
    return ok({
        username = acc.username,
        name     = acc.name,
        driver   = d and {
            vehicle = d.vehicle, plate = d.plate, color = d.color,
            rating = math.floor(rating * 100 + 0.5) / 100,
            trips = d.trips, earnings = d.earnings_total,
        } or nil,
        online = online[acc.username] ~= nil,
        active = riderActive[acc._cid] or driverActive[acc.username] or nil,
    })
end

---Permanently deletes the caller's own Ryde account: pulls them off duty, withdraws an
---un-accepted offer or cancels an engaged trip, then drops the driver record and the account.
---@param src integer player server id
---@return table result
function actions.deleteAccount(src)
    local acc = account(src)
    if not acc then return fail('Sign in to Ryde first.') end

    online[acc.username] = nil
    local tripId = driverActive[acc.username]
    local trip   = tripId and trips[tripId] or nil
    if trip then
        if trip.status == 'offered' then
            dropOffer(trip)
            pushTo(trip.riderCid, 'offerRemoved', { id = trip.id, requestId = trip.requestId })
        else
            cancelTrip(trip, 'driver')
        end
    end

    store.deleteDriver(acc.username)
    acctStore.deleteAccount(acc.id)
    return ok({})
end

---Client-facing slice of configs/ryde.lua: quick-pick destinations, the driver's cut, and the
---leaderboard weighting. Read-only.
---@return table result
function actions.config()
    return ok({
        locations    = config.Locations or {},
        driverCut    = config.DriverCut or 1.0,
        leaderPrior  = config.LeaderboardPriorRating or 4.5,
        leaderWeight = config.LeaderboardWeight or 10,
    })
end

-- DEV/TEST synthetic driver cards for /rydeoffer.
---@type table[] Fake driver cards devOffer picks from at random.
local DEV_DRIVERS = {
    { name = 'Test Driver', car = 'Bravado Buffalo',     color = '#10b981', plate = 'DEV 001' },
    { name = 'Avery R.',    car = 'Annis Elegy RH8',     color = '#3b82f6', plate = 'DEV 002' },
    { name = 'Sam Q.',      car = 'Dewbauchee Rapid GT', color = '#f59e0b', plate = 'DEV 003' },
    { name = 'Jordan P.',   car = 'Vapid Peyote',        color = '#ef4444', plate = 'DEV 004' },
}

---DEV/TEST: drops a synthetic fare offer onto the caller's own open ride request. Returns a
---short status string for the chat ack.
---@param src integer player server id
---@return string message
function actions.devOffer(src)
    local cid = player.getIdentifier(src)
    if not cid then return 'No character.' end
    local reqId = riderActive[cid]
    local req   = reqId and requests[reqId] or nil
    if not req then return 'Request a ride first, then run /rydeoffer to add a test offer.' end

    local d    = DEV_DRIVERS[math.random(#DEV_DRIVERS)]
    local fare = math.random(config.MinFare or 5, math.max((config.MinFare or 5) + 1, 45))
    local trip = {
        id = store.newId(), requestId = req.id,
        riderUsername = req.riderUsername, riderName = req.riderName, riderCid = req.riderCid,
        driverUsername = 'dev:' .. cid, driverName = d.name, driverCid = 'dev',
        driverNumber = '5550000',
        vehicle = d.car, plate = d.plate, color = d.color, driverRating = 4.8,
        pickup = req.pickup, dropoff = req.dropoff, distance = req.distance,
        payment = req.payment, fare = fare, status = 'offered',
    }
    trips[trip.id] = trip
    pushTo(trip.riderCid, 'offer', publicTrip(trip, 'rider'))
    return ('Sent a test offer: %s for $%d.'):format(d.name, fare)
end

---Handles a player leaving: clears the per-src caches, drops them from the duty board, bins
---their pending request and its bids, withdraws an offered trip, and cancels an engaged trip.
---@param src number player server id
function actions.onPlayerDropped(src)
    local cid = srcCid[src] or player.getIdentifier(src)
    srcCid[src] = nil
    tripViewers[src] = nil
    if not cid then return end
    for username, d in pairs(online) do
        if d.cid == cid then online[username] = nil; break end
    end
    for id, r in pairs(requests) do
        if r.riderCid == cid then
            requests[id] = nil
            riderActive[r.riderUsername] = nil
            broadcastToDrivers('requestRemoved', { id = id })
            broadcastWaiting()
            clearOffersFor(id, nil, 'cancelled')
        end
    end
    for id, t in pairs(trips) do
        if t.riderCid == cid or t.driverCid == cid then
            if t.status == 'offered' then
                dropOffer(t)
                if t.driverCid == cid then
                    pushTo(t.riderCid, 'offerRemoved', { id = id, requestId = t.requestId })
                end
            else
                cancelTrip(t, 'disconnect')
            end
        end
    end
end

return actions
