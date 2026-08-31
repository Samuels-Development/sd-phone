---@type table Shared server helpers (server.util): the { success, message?, data? } envelope.
local util   = require 'server.util'
---@type table MDT permissions (server.mdt.access): the read gate every handler is registered through.
local access = require 'server.mdt.access'
---@type table CCTV settings (configs/cctv.lua), read here only to answer whether it is on at all.
local CFG    = require 'configs.cctv'

---@type table CCTV module; the table returned at end of file. The camera list itself lives on the
---client, because a fixed camera is only coordinates and the client is the thing that renders it.
---What lives here is the permission: without it a tampered client could point its own camera into
---a bank whenever it liked, which is exactly the thing a police-only section is meant to stop.
local cctv = {}

---@type boolean Whether the section works at all.
local ENABLED = CFG.Enabled ~= false

---@type table<string, boolean> Camera ids this build knows, so a request naming anything else is
---refused rather than passed to the client to interpret.
local KNOWN = {}
for _, cam in ipairs(CFG.Cameras or {}) do
    if type(cam) == 'table' and type(cam.id) == 'string' then KNOWN[cam.id] = true end
end

---Authorises one officer to look through one fixed camera, and writes the audit row. Answering with
---the id back rather than the coordinates keeps the camera list out of reach of anything that has
---not already been handed it.
---@param payload table { cameraId }
---@param me table resolved MDT identity
---@return table envelope
---@return table audit row written by access.audited
cctv.watch = access.audited('cctv.view', function(_, payload, me)
    if not ENABLED then return util.fail('mdt.camerasNotAvailable', 'Cameras are not available') end

    local id = util.limitedString(payload.cameraId, 64)
    if not id or not KNOWN[id] then return util.fail('mdt.noSuchCamera', 'No such camera') end

    return util.ok({ cameraId = id }), {
        entityType = 'camera',
        entityId   = id,
        details    = { kind = 'cctv', by = me.citizenid },
    }
end)

return cctv
