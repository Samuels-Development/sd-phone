---@type table YSeries source reads (server.migrate.ystore): holders, sims, settings.
local ystore = require 'server.migrate.ystore'
---@type table Migration SQL (server.migrate.store): the existing-character roster.
local store = require 'server.migrate.store'

---@type table YSeries owner matching; the table returned at end of file. YSeries keys every table
---by phone_imei, so the whole import hangs off resolving an imei to a character and a number.
local yidentity = {}

---Digits-only view of a phone number, so YSeries formatting never decides a lookup.
---@param v any
---@return string
local function digits(v)
    if v == nil then return '' end
    return (tostring(v):gsub('%D', ''))
end

---Builds the identity context every YSeries porter receives.
---
---`holders` is authoritative for ownership. `settings.citizen_id` is a weaker second hint used only
---for a device holders has no row for, because YSeries writes it on setup and never clears it when
---a phone changes hands, so trusting it first would attribute a stolen phone to its old owner.
---@param cfg table config.Migrate
---@param framework table framework detection
---@return { imeiToCid: table<string, string>, cidToImei: table<string, string>, imeiToNumber: table<string, string>, numberToCid: table<string, string>, cids: string[], pins: table<string, string>, stats: table }
function yidentity.build(cfg, framework)
    local roster = store.loadRoster(framework.name)
    local known = roster.cids or {}

    local imeiToCid, cidToImei = {}, {}
    local stats = { holders = 0, resolved = 0, unknownCharacter = 0, fromSettings = 0, numbers = 0 }

    for _, row in ipairs(ystore.holders()) do
        stats.holders = stats.holders + 1
        local cid = row.citizenid
        local imei = row.imei
        if cid and cid ~= '' and imei and imei ~= '' then
            if next(known) ~= nil and not known[cid] then
                stats.unknownCharacter = stats.unknownCharacter + 1
            else
                imeiToCid[imei] = cid
                if not cidToImei[cid] then cidToImei[cid] = imei end
                stats.resolved = stats.resolved + 1
            end
        end
    end

    local pins = {}
    for _, row in ipairs(ystore.settings()) do
        local imei = row.phone_imei
        if imei and imei ~= '' then
            if not imeiToCid[imei] then
                local cid = row.citizen_id
                if cid and cid ~= '' and (next(known) == nil or known[cid]) then
                    imeiToCid[imei] = cid
                    if not cidToImei[cid] then cidToImei[cid] = imei end
                    stats.fromSettings = stats.fromSettings + 1
                end
            end
            local pin = row.pin
            if type(pin) == 'string' and pin:match('^%d%d%d%d$') then pins[imei] = pin end
        end
    end

    -- Sims are read primary-first, so the first number seen for a device is the one the phone
    -- actually carries; later SIMs in other slots are still mapped for inbound attribution.
    local imeiToNumber, numberToCid = {}, {}
    for _, row in ipairs(ystore.sims()) do
        local imei = row.imei
        local number = digits(row.number)
        if imei and number ~= '' then
            if not imeiToNumber[imei] then
                imeiToNumber[imei] = number
                stats.numbers = stats.numbers + 1
            end
            local cid = imeiToCid[imei]
            if cid and not numberToCid[number] then numberToCid[number] = cid end
        end
    end

    local cids = {}
    for cid in pairs(cidToImei) do cids[#cids + 1] = cid end

    return {
        imeiToCid    = imeiToCid,
        cidToImei    = cidToImei,
        imeiToNumber = imeiToNumber,
        numberToCid  = numberToCid,
        cids         = cids,
        pins         = pins,
        stats        = stats,
        digits       = digits,
    }
end

return yidentity
