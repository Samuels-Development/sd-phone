---@type fun(nuiAction: string, serverEvent: string) NUI->server pass-through registrar (client.nui).
local proxy = require 'client.nui'

-- Thin delegates into server/documents: folder + document CRUD, moves, duplication, image
-- import and nearby sharing.
proxy('sd-phone:documents:list',         'sd-phone:server:documents:list')
proxy('sd-phone:documents:get',          'sd-phone:server:documents:get')
proxy('sd-phone:documents:createFolder', 'sd-phone:server:documents:createFolder')
proxy('sd-phone:documents:createDoc',    'sd-phone:server:documents:createDoc')
proxy('sd-phone:documents:save',         'sd-phone:server:documents:save')
proxy('sd-phone:documents:rename',       'sd-phone:server:documents:rename')
proxy('sd-phone:documents:renameFolder', 'sd-phone:server:documents:renameFolder')
proxy('sd-phone:documents:move',         'sd-phone:server:documents:move')
proxy('sd-phone:documents:delete',       'sd-phone:server:documents:delete')
proxy('sd-phone:documents:deleteFolder', 'sd-phone:server:documents:deleteFolder')
proxy('sd-phone:documents:duplicate',    'sd-phone:server:documents:duplicate')
proxy('sd-phone:documents:importImage',  'sd-phone:server:documents:importImage')
proxy('sd-phone:documents:signature:get', 'sd-phone:server:documents:signature:get')
proxy('sd-phone:documents:signature:set', 'sd-phone:server:documents:signature:set')
proxy('sd-phone:documents:sign',          'sd-phone:server:documents:sign')
proxy('sd-phone:documents:share',        'sd-phone:server:documents:share')

---Server push: a document was created for us elsewhere (an export or another resource); relays
---it to the open app so the listing updates live.
---@param data table { doc } from server/documents
RegisterNetEvent('sd-phone:client:documents:added', function(data)
    SendNUIMessage({ action = 'sd-phone:documents:added', data = data })
end)

---Server push: an AirShared document was accepted into our library; relays the copy plus the
---sender's name.
---@param data table { doc, fromName } from server/documents
RegisterNetEvent('sd-phone:client:documents:receive', function(data)
    SendNUIMessage({ action = 'sd-phone:documents:receive', data = data })
end)
