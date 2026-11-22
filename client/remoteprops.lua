---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'
---@type table Hold pose (client.pose): createProp builds the welded copy.
local pose = require 'client.pose'
---@type table<string, boolean> Valid frame colours (client.framecolors).
local FRAME_COLORS = require 'client.framecolors'
---@type table Cases (client.cases): checks and names the case a holder broadcasts.
local cases = require 'client.cases'

---@type table Module table; the table returned at end of file. Owns the local phone-prop copies
---welded onto OTHER players, driven by the replicated `sdPhone` statebag each holder broadcasts.
local remoteprops = {}

---@type table<integer, { obj: integer, color: string }> Server id -> welded copy, keyed by variant.
local props = {}
---@type table<integer, string> Server id -> the variant that holder is currently broadcasting, held
---whether or not a copy is welded yet, so a holder who was out of scope still gets one later.
local wanted = {}

---@type string Marks the unfolded body in a variant key.
local OPEN_TAG <const> = '|open'
---@type string Separates the case signature from the rest of a variant key.
local CASE_TAG <const> = '#'
---@type string Separates the phone style's signature from the rest of a variant key.
local STYLE_TAG <const> = '~'
---@type table<integer, CaseDesign> Server id -> the case that holder is broadcasting, checked.
local caseOf = {}
---@type table<integer, PhoneStyle> Server id -> the phone design and trims that holder is broadcasting, checked.
local styleOf = {}

---Reads a broadcast `sdPhone` value into the variant a copy has to match. Holders shut (and every
---older client) broadcast a bare colour string; an unfolded holder or one with a case broadcasts
---{ c = , f = true, k = <case>, s = <phone style> }. Keeping the result one string leaves the
---generation and up-to-date checks single comparisons, so the case and the style go into it as their
---signatures.
---@param value any the holder's statebag value
---@return string? variant, string? colour, boolean open, CaseDesign? case, PhoneStyle? style
local function variantOf(value)
    local colour, open, case, style
    if type(value) == 'table' then
        colour, open, case, style = value.c, value.f == true, cases.clean(value.k), cases.offered(value.s)
    else
        colour, open = value, false
    end
    if type(colour) ~= 'string' or not FRAME_COLORS[colour] then return nil, nil, false, nil, nil end
    if cases.blocked(colour) then case = nil end
    local variant = colour .. (open and OPEN_TAG or '')
    if style then variant = variant .. STYLE_TAG .. cases.styleSignature(style) end
    if case then variant = variant .. CASE_TAG .. cases.signature(case) end
    return variant, colour, open, case, style
end

---Splits a variant key back into the colour and whether it is the unfolded body.
---@param variant string
---@return string colour, boolean open
local function splitVariant(variant)
    local body = variant:match('^(.-)' .. CASE_TAG) or variant
    body = body:match('^(.-)' .. STYLE_TAG) or body
    local colour = body:match('^(.-)%' .. OPEN_TAG .. '$')
    if colour then return colour, true end
    return body, false
end
---@type table<integer, integer> Server id -> weld generation. Welding streams the model, which
---yields, so a weld can finish after another has replaced it or after the holder stowed their
---phone; comparing this tells it to delete what it built rather than orphan a prop nothing tracks.
local seq = {}

---@type integer Seconds between reconcile sweeps.
local SWEEP_INTERVAL <const> = 1000

---Deletes a holder's welded copy, if any. Idempotent, and cancels any weld still streaming.
---@param source integer server id of the remote holder
function remoteprops.remove(source)
    seq[source] = (seq[source] or 0) + 1
    local entry = props[source]
    if entry and entry.obj then pose.deleteProp(entry.obj) end
    props[source] = nil
end

---Forgets a holder entirely: the copy, the colour they were broadcasting, and the generation.
---@param source integer server id of the remote holder
local function forget(source)
    remoteprops.remove(source)
    wanted[source] = nil
    caseOf[source] = nil
    styleOf[source] = nil
    seq[source] = nil
end

---The ped a holder is currently on for this client, or 0 when they are out of scope.
---@param source integer server id
---@return integer ped
local function pedOf(source)
    local plyr = GetPlayerFromServerId(source)
    if plyr == -1 then return 0 end
    return GetPlayerPed(plyr)
end

---Welds a fresh copy of `variant` onto `ped`. A weld superseded or stowed while its model streamed
---deletes what it built instead of claiming the slot.
---@param source integer server id of the remote holder
---@param ped integer that holder's ped
---@param variant string frame colour, optionally tagged as the unfolded body
local function weld(source, ped, variant)
    local mine = (seq[source] or 0) + 1
    seq[source] = mine

    local colour, open = splitVariant(variant)
    local obj = pose.createProp(ped, colour, nil, open, caseOf[source], styleOf[source])
    if not obj then return end

    if seq[source] ~= mine or wanted[source] ~= variant then
        pose.deleteProp(obj)
        return
    end

    remoteprops.remove(source)
    seq[source] = mine
    props[source] = { obj = obj, color = variant }
end

---Whether the copy welded for a holder already matches what they are broadcasting.
---@param source integer server id
---@param variant string frame colour, optionally tagged as the unfolded body
---@return boolean
local function upToDate(source, variant)
    local entry = props[source]
    return entry ~= nil and entry.color == variant and DoesEntityExist(entry.obj)
end

---Records what a holder is broadcasting and welds the copy when they are in scope. A falsy value
---means they stowed the phone; an unknown colour is ignored rather than trusted.
---@param source integer server id of the remote holder
---@param value any the holder's `sdPhone` statebag value: a frame colour, `{ c =, f = }`, or false
function remoteprops.set(source, value)
    if not value then
        forget(source)
        return
    end
    local variant, _, _, case, style = variantOf(value)
    if not variant then return end

    if case then case.owner = source end
    wanted[source] = variant
    caseOf[source] = case
    styleOf[source] = style
    if upToDate(source, variant) then return end

    local ped = pedOf(source)
    if ped ~= 0 then weld(source, ped, variant) end
end

---Brings every holder's copy back in line with what they are broadcasting: welds one for a holder
---who came into scope, and drops copies whose owner left or whose prop is gone.
function remoteprops.reconcile()
    for source, variant in pairs(wanted) do
        local ped = pedOf(source)
        if ped == 0 or not DoesEntityExist(ped) then
            remoteprops.remove(source)
        elseif not upToDate(source, variant) then
            weld(source, ped, variant)
        end
    end

    for source in pairs(props) do
        if not wanted[source] then remoteprops.remove(source) end
    end
end

---Drops every copy this client has welded.
function remoteprops.clear()
    for source in pairs(props) do remoteprops.remove(source) end
    wanted, seq, caseOf, styleOf = {}, {}, {}, {}
end

if config.Phone.PropVisibleToOthers then
    ---Resolves a `player:<serverId>` bag name to the server id it belongs to.
    ---@param bagName string
    ---@return integer|nil source
    local function bagOwner(bagName)
        return tonumber(bagName:match('player:(%d+)'))
    end

    AddStateBagChangeHandler('sdPhone', nil, function(bagName, _key, value)
        local source = bagOwner(bagName)
        if not source or source == cache.serverId then return end
        remoteprops.set(source, value)
    end)

    CreateThread(function()
        while true do
            Wait(SWEEP_INTERVAL)
            remoteprops.reconcile()
        end
    end)
end

return remoteprops
