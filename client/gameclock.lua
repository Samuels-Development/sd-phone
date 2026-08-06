---@type table Game-clock module; the table returned at end of file.
---The NUI has no way to read the game clock: `Date` inside CEF is the player's PC clock, and there
---is no native reachable from the browser. So the client watches GetClock* and pushes a change to
---the UI, which decides whether to show it based on the player's Date & Time setting.
local M = {}

---@type integer How often the game clock is sampled (ms). A GTA minute is roughly two real
---seconds at the default cycle, so this catches every minute change without spinning.
local SAMPLE_MS = 500

---@type table<string, integer>|nil Last pushed value, so an unchanged minute costs nothing.
local last = nil

---@return table clock the current in-game date and time
local function read()
    return {
        hour   = GetClockHours(),
        minute = GetClockMinutes(),
        day    = GetClockDayOfMonth(),
        month  = GetClockMonth() + 1,
        year   = GetClockYear(),
    }
end

---@param a table|nil
---@param b table
---@return boolean
local function same(a, b)
    if not a then return false end
    return a.hour == b.hour and a.minute == b.minute
        and a.day == b.day and a.month == b.month and a.year == b.year
end

---Pushes the current game clock to the UI whether or not it changed. Called on open so the phone
---never shows a stale minute while waiting for the next sample.
function M.push()
    local now = read()
    last = now
    SendNUIMessage({ action = 'sd-phone:gameClock', data = now })
end

---Starts the sampler. Runs only while the phone is up: a closed phone cannot show a clock, and
---this is the one loop that would otherwise tick for every player all session.
---@param isOpen fun(): boolean phone open predicate
function M.start(isOpen)
    CreateThread(function()
        while true do
            if isOpen() then
                local now = read()
                if not same(last, now) then
                    last = now
                    SendNUIMessage({ action = 'sd-phone:gameClock', data = now })
                end
                Wait(SAMPLE_MS)
            else
                last = nil
                Wait(1000)
            end
        end
    end)
end

return M
