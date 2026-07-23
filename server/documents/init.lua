---@type table Documents persistence layer (server.documents.store): table DDL + folder/doc CRUD.
local store         = require 'server.documents.store'
---@type table Authoritative Documents handlers (server.documents.actions): validation + scoping.
local actions       = require 'server.documents.actions'
---@type table Player bridge (bridge.server.player): citizenid + connected-source lookups.
local player        = require 'bridge.server.player'
---@type table AirShare core (server.share.core): per-kind delivery handler registry.
local share         = require 'server.share.core'
---@type table Settings persistence (server.settings.store): phone-number -> citizenid lookups.
local settings      = require 'server.settings.store'
---@type table Notifications module (server.notifications.init): identity-addressed banner routing.
local notifications = require 'server.notifications.init'
---@type table Shared server helpers (server.util): the failure envelope for the export guards.
local util          = require 'server.util'
local fail          = util.fail

-- Delivers an accepted document AirShare into the recipient's library.
share.registerHandler('document', actions.deliverShare)

---Boot-time schema bootstrap; a failure is printed and non-fatal.
CreateThread(function()
    local success, err = pcall(store.ensureSchema)
    if not success then
        print(('^1[sd-phone:documents]^0 schema bootstrap failed: %s'):format(err))
        return
    end
    print('^2[sd-phone:documents]^0 schema ready')
end)

-- NUI callbacks: thin delegates into server.documents.actions.
lib.callback.register('sd-phone:server:documents:list', function(src) return actions.list(src) end)
lib.callback.register('sd-phone:server:documents:get', function(src, payload) return actions.get(src, payload) end)
lib.callback.register('sd-phone:server:documents:createFolder', function(src, payload) return actions.createFolder(src, payload) end)
lib.callback.register('sd-phone:server:documents:createDoc', function(src, payload) return actions.createDoc(src, payload) end)
lib.callback.register('sd-phone:server:documents:save', function(src, payload) return actions.save(src, payload) end)
lib.callback.register('sd-phone:server:documents:rename', function(src, payload) return actions.rename(src, payload) end)
lib.callback.register('sd-phone:server:documents:renameFolder', function(src, payload) return actions.renameFolder(src, payload) end)
lib.callback.register('sd-phone:server:documents:move', function(src, payload) return actions.move(src, payload) end)
lib.callback.register('sd-phone:server:documents:delete', function(src, payload) return actions.delete(src, payload) end)
lib.callback.register('sd-phone:server:documents:deleteFolder', function(src, payload) return actions.deleteFolder(src, payload) end)
lib.callback.register('sd-phone:server:documents:duplicate', function(src, payload) return actions.duplicate(src, payload) end)
lib.callback.register('sd-phone:server:documents:importImage', function(src, payload) return actions.importImage(src, payload) end)
lib.callback.register('sd-phone:server:documents:signature:get', function(src) return actions.getSignature(src) end)
lib.callback.register('sd-phone:server:documents:signature:set', function(src, payload) return actions.setSignature(src, payload) end)
lib.callback.register('sd-phone:server:documents:sign', function(src, payload) return actions.sign(src, payload) end)

---AirShares a document to a nearby player; the payload carries both the recipient and the id.
lib.callback.register('sd-phone:server:documents:share', function(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    return actions.requestShare(src, payload.target, payload)
end)

---Announces an export-created document (server-local hook), pushes it into the owner's open
---phone, and fires a notification banner unless the caller opted out.
---@param cid string owner citizenid
---@param doc table serialized document for the live push
---@param opts table export options (only `notify` is read here)
---@param resource string|nil the resource that invoked the export
local function announce(cid, doc, opts, resource)
    TriggerEvent('sd-phone:server:documents:created', {
        citizenid = cid, docId = doc.id, name = doc.name, kind = doc.kind, resource = resource,
    })
    local src = player.getSourceByIdentifier(cid)
    if src then
        TriggerClientEvent('sd-phone:client:documents:added', src, { doc = doc })
    end
    if not (type(opts) == 'table' and opts.notify == false) then
        notifications.notifyCid(cid, {
            app = 'documents', appId = 'documents', time = 'now',
            title = 'Files', body = ('New document: %s'):format(doc.name),
        })
    end
end

---Creates a document for a player from another resource. Validates every field and applies the
---same caps as the app; on success the owner's open phone is pushed the new document live.
---@param source number acting player's server id
---@param opts table { name: string, kind?: 'text'|'image'|'file', content?: string, url?: string, folder?: string, locked?: boolean, notify?: boolean }
---@return string|nil docId new document id, nil on failure
---@return string? err refusal message when docId is nil
exports('createDocument', function(source, opts)
    if type(source) ~= 'number' then return nil, 'Invalid source' end
    local resource = GetInvokingResource()
    local cid = player.getIdentifier(source)
    if not cid then return nil, 'Player not found' end

    local docId, err, doc = actions.createForCid(cid, opts, resource)
    if not docId then return nil, err end
    announce(cid, doc, opts, resource)
    return docId
end)

---Creates a document addressed by phone number instead of server id. The number is resolved to
---its owner; when that owner is online their open phone is pushed the new document live.
---@param number string|number phone number in any formatting
---@param opts table { name: string, kind?: 'text'|'image'|'file', content?: string, url?: string, folder?: string, locked?: boolean, notify?: boolean }
---@return string|nil docId new document id, nil on failure
---@return string? err refusal message when docId is nil
exports('createDocumentForNumber', function(number, opts)
    local resource = GetInvokingResource()
    local digits = util.digits(number)
    if digits == '' then return nil, 'A number is required' end
    local cid = settings.getCitizenByNumber(digits)
    if not cid then return nil, 'Number not in service' end

    local docId, err, doc = actions.createForCid(cid, opts, resource)
    if not docId then return nil, err end
    announce(cid, doc, opts, resource)
    return docId
end)

---Reads a player's documents (content-free), optionally filtered to a named root folder, for
---other resources. Read-only; always an array, empty when nothing resolves.
---@param source number acting player's server id
---@param folderName string|nil optional root folder name filter
---@return table[] documents
exports('getPlayerDocuments', function(source, folderName)
    if type(source) ~= 'number' then return {} end
    local cid = player.getIdentifier(source)
    if not cid then return {} end
    return actions.listForCid(cid, folderName)
end)

---Reads one document's raw content for a player, for other resources. Read-only; nil when the
---document doesn't exist or belong to the player.
---@param source number acting player's server id
---@param docId string document id
---@return string|nil content
exports('getDocumentContent', function(source, docId)
    if type(source) ~= 'number' then return nil end
    local cid = player.getIdentifier(source)
    if not cid then return nil end
    return actions.getContentForCid(cid, docId)
end)

---Deletes a document by id for a player, for other resources. Bypasses the locked guard so an
---owning resource can remove read-only documents it created. Answers whether a row was removed.
---@param source number acting player's server id
---@param docId string document id
---@return boolean removed
exports('deleteDocumentById', function(source, docId)
    if type(source) ~= 'number' then return false end
    local cid = player.getIdentifier(source)
    if not cid then return false end
    return actions.deleteForCid(cid, docId)
end)

---Reads a document's signatures for a player, for other resources: each entry carries the
---frozen signer name, the epoch signing time and the signature image. Read-only; always an
---array, empty when the document doesn't exist or belong to the player.
---@param source number acting player's server id
---@param docId string document id
---@return table[] signatures { id, signer, image, signedAt }
exports('getDocumentSignatures', function(source, docId)
    if type(source) ~= 'number' then return {} end
    local cid = player.getIdentifier(source)
    if not cid then return {} end
    return actions.listSignaturesForCid(cid, docId)
end)

---True when one of a player's documents carries at least one signature - the quick boolean
---twin of getDocumentSignatures for scripts that only need a yes/no gate.
---@param source number acting player's server id
---@param docId string document id
---@return boolean signed
exports('isDocumentSigned', function(source, docId)
    if type(source) ~= 'number' then return false end
    local cid = player.getIdentifier(source)
    if not cid then return false end
    return actions.isSignedForCid(cid, docId)
end)
