---@type table Shared shim helpers (server.compat.gksphone.shared): export registration + warn-once.
local shim = require 'server.compat.gksphone.shared'

-- AddCustomApp is registered on both sides by gksphone with the same shape. sd-phone registers a
-- third-party app on the CLIENT only, where the resource that owns the app is the one whose page is
-- iframed and whose lifecycle callbacks fire. Answering the server name by reaching across would
-- register every app as sd-phone's own, so the server half reports the failure and names the side
-- to call from; client/compat/gksphone.lua does the real registration.
shim.stubExport('AddCustomApp', false,
    'must be registered from the CLIENT on sd-phone: call exports.gksphone:AddCustomApp(appData) in a client script, where the owning resource can be identified and its onOpen/onClose callbacks can fire')
