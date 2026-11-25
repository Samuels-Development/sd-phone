---@type table Voicemail offers module; the table returned at end of file. Shared between the calls
---module, which opens an offer whenever it tells a caller they may leave a message, and the
---voicemail module, which refuses a message no offer stands behind.
local offers = {}

---@type integer How long after an unanswered call its caller may still leave a message (ms). The
---recorder stops at a minute, so this leaves room to hesitate, record and upload.
local OFFER_TTL <const> = 10 * 60 * 1000

---@type integer How often expired offers are swept (ms).
local SWEEP_MS <const> = 5 * 60 * 1000

---@type table<string, integer> "<caller citizenid>\0<dialed number>" -> GetGameTimer() it opened.
local open = {}

---The offer key for one caller and one dialed number.
---@param callerCid string caller's framework per-character id
---@param number string dialed number, digits only
---@return string key
local function keyOf(callerCid, number)
    return tostring(callerCid) .. '\0' .. tostring(number)
end

---Records that `callerCid`'s call to `number` went unanswered, which is what lets them leave a
---message on it. A repeat call refreshes the offer rather than stacking a second one.
---@param callerCid string|nil caller's framework per-character id
---@param number string|nil dialed number, digits only
function offers.record(callerCid, number)
    if type(callerCid) ~= 'string' or callerCid == '' or type(number) ~= 'string' or number == '' then return end
    open[keyOf(callerCid, number)] = GetGameTimer()
end

---Spends the caller's offer on `number`. True when a live one was there; it is gone afterwards,
---so one unanswered call buys one message. A stamp in the future (the game timer wrapping) counts
---as expired rather than as an offer that never ends.
---@param callerCid string caller's framework per-character id
---@param number string dialed number, digits only
---@return boolean taken
function offers.take(callerCid, number)
    local key = keyOf(callerCid, number)
    local at = open[key]
    if not at then return false end
    open[key] = nil
    local age = GetGameTimer() - at
    return age >= 0 and age < OFFER_TTL
end

-- Expired offers are dropped here so a caller who never records leaves nothing behind.
CreateThread(function()
    while true do
        Wait(SWEEP_MS)
        local now = GetGameTimer()
        for key, at in pairs(open) do
            local age = now - at
            if age < 0 or age >= OFFER_TTL then open[key] = nil end
        end
    end
end)

return offers
