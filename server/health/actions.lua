---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Health persistence (server.health.store): daily row banking + reads.
local store = require 'server.health.store'
---@type table Player bridge (bridge.server.player): citizenid from a server id.
local player = require 'bridge.server.player'

---@type table Health settings (configs/health.lua).
local H <const> = config.Health or {}
---@type table Leaderboard settings; a missing table reads as enabled at the default size.
local LB <const> = H.Leaderboard or {}
---@type integer Ranked rows returned to the app.
local LB_SIZE <const> = math.max(1, math.floor(tonumber(LB.Size) or 20))
---@type integer Days of history the summary carries; the chart draws all of them.
local CHART_DAYS <const> = 7

---@type table Actions module; the table returned at end of file.
local actions = {}

---@type table<number, number> Server id -> os.time of that player's last accepted flush. The gap
---between flushes is the only budget a claim is measured against, so it is held per source and
---dropped when they leave rather than trusted from the client.
local lastFlush = {}

---@type integer How often accepted activity is written to the database (ms). Clients report every
---minute; holding it here turns one write per player per minute into one statement every five.
local SAVE_EVERY_MS <const> = 5 * 60 * 1000
---@type integer Shortest gap between the writes a leaderboard fetch forces (ms), so the board can
---be fresh without letting a client spam writes.
local BOARD_SAVE_GAP_MS <const> = 30 * 1000

---@type table<string, { name: string, steps: integer, distanceM: integer, activeMs: integer, peakHr: integer }>
---Activity accepted but not yet written, per citizenid.
local pending = {}
---@type table<number, string> Server id -> the citizenid its pending activity is held under, so the
---player leaving can write theirs even after the framework has forgotten who they were.
local holder = {}
---@type string|nil The server's date the pending activity was gathered on; a new day writes the old
---day's first, so it is not banked against the wrong row.
local pendingDay = nil
---@type integer GetGameTimer of the last write a leaderboard fetch forced.
local boardSavedAt = -BOARD_SAVE_GAP_MS

---Whether the leaderboard is switched on.
---@return boolean
function actions.leaderboardEnabled()
    return LB.Enabled ~= false
end

---Writes held activity to the database: everyone's, or one character's. What is written leaves
---the buffer first, so a write that fails loses that window rather than repeating it forever.
---@param cid string|nil one citizenid; nil writes everyone's
---@param detached boolean|nil true to send without waiting for the result
---@return integer written rows written
function actions.save(cid, detached)
    local rows = {}
    if cid then
        local entry = pending[cid]
        if entry then
            pending[cid] = nil
            entry.citizenid = cid
            rows[1] = entry
        end
    else
        for key, entry in pairs(pending) do
            entry.citizenid = key
            rows[#rows + 1] = entry
        end
        pending = {}
    end
    if #rows == 0 then return 0 end
    local ok, written = pcall(store.bankMany, rows, detached)
    if not ok then
        print(('^1[sd-phone:health]^0 could not save activity: %s'):format(tostring(written)))
        return 0
    end
    return written
end

---Forgets a player's flush clock and writes whatever they still have held, without waiting on the
---write so the other disconnect sweeps are not held up behind it. A reconnect starts a fresh budget.
---@param source number
function actions.forget(source)
    lastFlush[source] = nil
    local cid = holder[source]
    holder[source] = nil
    if cid then actions.save(cid, true) end
end

---Accepts a flush from one player and holds it in memory until the next save. The elapsed budget
---is the gap since their previous flush, or the flush interval on their first one.
---@param source number
---@param delta table client-reported deltas since its last flush
---@return boolean accepted
function actions.flush(source, delta)
    if type(delta) ~= 'table' then return false end

    local cid = player.getRealIdentifier(source)
    if not cid then return false end

    local now     = os.time()
    local elapsed = lastFlush[source] and (now - lastFlush[source]) or 60
    lastFlush[source] = now

    local got = store.accept(delta, elapsed)
    if got.steps == 0 and got.distanceM == 0 and got.activeMs == 0 and got.peakHr == 0 then return true end

    local today = os.date('%Y-%m-%d')
    if pendingDay and pendingDay ~= today then actions.save() end
    pendingDay = today

    local previous = holder[source]
    if previous and previous ~= cid then actions.save(previous) end
    holder[source] = cid

    local entry = pending[cid]
    if not entry then
        entry = { steps = 0, distanceM = 0, activeMs = 0, peakHr = 0 }
        pending[cid] = entry
    end
    entry.name      = player.getName(source) or ''
    entry.steps     = entry.steps + got.steps
    entry.distanceM = entry.distanceM + got.distanceM
    entry.activeMs  = entry.activeMs + got.activeMs
    if got.peakHr > entry.peakHr then entry.peakHr = got.peakHr end
    return true
end

---Starts the periodic save. Called once by server/health/init.lua.
function actions.startSaving()
    CreateThread(function()
        while true do
            Wait(SAVE_EVERY_MS)
            actions.save()
        end
    end)
end

---Everything the Summary tab draws: today's totals, the last week of daily rows, and the goal the
---ring fills to.
---@param source number
---@return table|nil summary nil when the caller has no character
function actions.summary(source)
    local cid = player.getRealIdentifier(source)
    if not cid then return nil end

    local history = store.history(cid, CHART_DAYS)
    local today   = history[#history] or { steps = 0, distanceM = 0, activeMs = 0, peakHr = 0 }
    local held    = pending[cid]
    if held and pendingDay == os.date('%Y-%m-%d') then
        today.steps     = today.steps + held.steps
        today.distanceM = today.distanceM + held.distanceM
        today.activeMs  = today.activeMs + held.activeMs
        if held.peakHr > (today.peakHr or 0) then today.peakHr = held.peakHr end
    end

    return {
        goal    = math.max(1, math.floor(tonumber(H.StepGoal) or 10000)),
        today   = today,
        history = history,
    }
end

---Today's steps board, with the caller's own standing attached. Returns display names only, never
---citizenids. Held activity is written first (at most every BOARD_SAVE_GAP_MS), so the ranking is
---never more than that behind.
---@param source number
---@return table|nil board nil when the caller has no character or the board is switched off
function actions.leaderboard(source)
    if not actions.leaderboardEnabled() then return nil end

    local cid = player.getRealIdentifier(source)
    if not cid then return nil end

    local now = GetGameTimer()
    if next(pending) and now - boardSavedAt >= BOARD_SAVE_GAP_MS then
        boardSavedAt = now
        actions.save()
    end

    local board = store.leaderboard(cid, LB_SIZE)
    local rows  = {}
    for i = 1, #board.top do
        local entry = board.top[i]
        rows[i] = {
            rank  = i,
            name  = (entry.name ~= nil and entry.name ~= '') and entry.name or 'Unknown',
            steps = math.floor(tonumber(entry.steps) or 0),
            you   = entry.citizenid == cid,
        }
    end

    return { entries = rows, rank = board.rank, steps = board.steps }
end

return actions
