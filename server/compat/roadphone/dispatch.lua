---@type table Shared shim helpers (server.compat.roadphone.shared): export registration + warn-once.
local shim = require 'server.compat.roadphone.shared'
---@type table Player bridge (bridge.server.player): job + display-name lookups.
local player = require 'bridge.server.player'
---@type table Shared server helpers (server.util): trim at the shim boundary.
local util = require 'server.util'

---@type table Self-export proxy for sd-phone's own server surface.
local sd = exports['sd-phone']

local registerExport, warnOnce = shim.registerExport, shim.warnOnce

---@type table Dispatch module; the table returned at end of file, so the client half's support
---handler reaches the same fan-out the export does.
local dispatch = {}

---Renders coordinates into the body text. sd-phone notifications carry no map payload, so the
---position travels as text rather than being silently dropped.
---@param coords any vector3 or { x, y, z }
---@return string|nil suffix
local function positionText(coords)
    if type(coords) ~= 'table' and type(coords) ~= 'vector3' and type(coords) ~= 'vector2' then return nil end
    local x, y = tonumber(coords.x), tonumber(coords.y)
    if not x or not y then return nil end
    return (' (%.0f, %.0f)'):format(x, y)
end

---Pushes one dispatch banner at every connected member of a job.
---
---sd-phone routes company traffic through configured company inboxes rather than a dispatch board,
---so the alert is delivered as a phone notification to the job's online members - which is what
---RoadPhone's own dispatch is from the recipient's point of view.
---@param job any framework job name
---@param title any what the recipients see as the sender
---@param message any dispatch body
---@param coords any position, rendered into the body when present
---@param image any banner image URL
---@return number reached members notified
function dispatch.send(job, title, message, coords, image)
    local jobName = type(job) == 'string' and job ~= '' and job or nil
    local body = util.trim(message)
    if not jobName or body == '' then return 0 end

    warnOnce('sendDispatch', ('dispatches are delivered as phone notifications to a job\'s online members (called by %s); sd-phone has no dispatch board, so no blip or map route is placed'):format(GetInvokingResource() or 'unknown'))

    local suffix = positionText(coords)
    if suffix then body = body .. suffix end

    local reached = 0
    for _, id in ipairs(GetPlayers()) do
        local src = tonumber(id)
        if src and player.getJob(src) == jobName then
            sd:notify(src, {
                app   = 'services',
                appId = 'services',
                title = type(title) == 'string' and title ~= '' and title or 'Dispatch',
                body  = body,
                image = type(image) == 'string' and image or nil,
            })
            reached = reached + 1
        end
    end
    return reached
end

---sendDispatch(source, message, job, coords?, image?): the SERVER five-argument, source-FIRST form.
---The caller's own display name is the sender, which is what a job member sees on the banner. The
---client export of the same name takes (message, job, image) and lives in the client half.
registerExport('sendDispatch', function(source, message, job, coords, image)
    local src = shim.source(source)
    local sender = src and player.getName(src) or 'Dispatch'
    dispatch.send(job, sender, message, coords, image)
end)

---sendDispatchAnonym(job, title, message, coords, image?): an automated-system alert, where `title`
---is the shown sender name and there is no calling player at all.
registerExport('sendDispatchAnonym', function(job, title, message, coords, image)
    dispatch.send(job, title, message, coords, image)
end)

return dispatch
