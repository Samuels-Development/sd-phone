---@type table Documents config (configs/documents.lua): document/folder caps, length + depth limits.
local cfg    = require 'configs.documents'
---@type table Documents persistence layer (server.documents.store): folder + document row CRUD.
local store  = require 'server.documents.store'
---@type table Player bridge (bridge.server.player): citizenid/name lookups from a server id.
local player = require 'bridge.server.player'
---@type table AirShare core (server.share.core): nearby/phone-open share request handshake.
local share  = require 'server.share.core'
---@type table Shared server helpers (server.util): envelopes, id + string helpers, TINYINT reader.
local util   = require 'server.util'
local ok, fail, trim, isTruthy = util.ok, util.fail, util.trim, util.truthy

---@type table Actions module; the table returned at end of file. Handlers resolve the acting
---citizenid server-side, validate/clamp client input, then persist scoped to that identity.
local actions = {}

---@type table<string, boolean> Document kinds accepted by every writer; anything else is refused.
local KINDS = { text = true, image = true, file = true }

---A fresh 12-char document/folder id (fits the VARCHAR(16) primary keys).
---@return string
local function newId() return util.newId(12) end

---Reshapes a stored document row into the React shape (camelCase, epoch seconds). Content is
---carried through only when the row includes it (full reads); list rows omit it.
---@param row table stored document row
---@return table
local function serializeDoc(row)
    return {
        id        = row.id,
        name      = row.name,
        kind      = row.kind,
        folderId  = row.folder_id,
        size      = tonumber(row.size) or 0,
        locked    = isTruthy(row.locked),
        source    = row.source,
        url       = row.url,
        content   = row.content,
        createdAt = tonumber(row.created_at) or 0,
        updatedAt = tonumber(row.updated_at) or 0,
    }
end

---Reshapes a stored folder row into the React shape.
---@param row table stored folder row
---@return table
local function serializeFolder(row)
    return { id = row.id, name = row.name, parentId = row.parent_id }
end

---Reshapes a stored signature row into the React shape. The signer's citizenid stays
---server-side; the client only needs the frozen display name.
---@param row table stored signature row
---@return table
local function serializeSig(row)
    return { id = row.id, signer = row.signer, image = row.image, signedAt = tonumber(row.created_at) or 0 }
end

---Attaches the signature list and signed flag to a serialized text document.
---@param doc table serialized document (mutated)
---@param docId string document id
---@return table doc
local function attachSignatures(doc, docId)
    local sigs = {}
    for _, row in ipairs(store.listSignatures(docId)) do sigs[#sigs + 1] = serializeSig(row) end
    doc.signed     = #sigs > 0
    doc.signatures = sigs
    return doc
end

---Validates a client-supplied signature image: a PNG data-URL within the configured length.
---@param v any client-supplied image
---@return string|nil image verbatim data-URL, nil if unusable
local function sanitizeSignatureImage(v)
    if type(v) ~= 'string' or #v > cfg.MaxSignatureLength then return nil end
    if not v:match('^data:image/png;base64,[A-Za-z0-9+/=]+$') then return nil end
    return v
end

---Resolves a client-supplied target folder id: nil/empty means root, otherwise the id must
---belong to the caller. Returns (nil) for root, (id) when valid, or (nil, err) when missing.
---@param cid string acting citizenid
---@param folderId any client-supplied folder id
---@return string|nil folderId
---@return string? err
local function resolveFolderId(cid, folderId)
    if type(folderId) ~= 'string' or folderId == '' then return nil end
    for _, row in ipairs(store.listFolders(cid)) do
        if row.id == folderId then return folderId end
    end
    return nil, 'Folder not found'
end

---Resolves a folder NAME under root case-insensitively for the export path, auto-creating the
---folder when absent (subject to the folder cap). An empty name means root.
---@param cid string acting citizenid
---@param name any folder name
---@return string|nil folderId
---@return string? err
local function resolveFolderName(cid, name)
    local n = trim(name)
    if n == '' then return nil end
    if #n > cfg.MaxNameLength then n = n:sub(1, cfg.MaxNameLength) end
    local lower = n:lower()
    for _, row in ipairs(store.listFolders(cid)) do
        if not row.parent_id and type(row.name) == 'string' and row.name:lower() == lower then
            return row.id
        end
    end
    if store.countFolders(cid) >= cfg.MaxFolders then return nil, 'Folder limit reached' end
    local id = newId()
    store.createFolder(cid, id, n, nil, os.time())
    return id
end

---Builds a parent-of lookup and a set of the caller's folder ids in a single pass.
---@param cid string acting citizenid
---@return table<string, string|nil> parentOf, table<string, boolean> exists
local function folderMaps(cid)
    local parentOf, exists = {}, {}
    for _, row in ipairs(store.listFolders(cid)) do
        exists[row.id] = true
        parentOf[row.id] = row.parent_id or nil
    end
    return parentOf, exists
end

---Depth of a folder (root folders are depth 1), walking the parent chain with a cycle guard.
---@param parentOf table<string, string|nil>
---@param id string|nil
---@return integer
local function depthOf(parentOf, id)
    local depth, cur, guard = 0, id, 0
    while cur do
        depth = depth + 1
        cur = parentOf[cur]
        guard = guard + 1
        if guard > 64 then break end
    end
    return depth
end

---All of the caller's folders and content-free documents, scoped to their citizenid. Read-only.
---@param src integer player server id
---@return table result envelope with { folders, docs }
function actions.list(src)
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local folders = {}
    for _, row in ipairs(store.listFolders(cid)) do folders[#folders + 1] = serializeFolder(row) end

    local signed = store.listSignedDocIds(cid)
    local docs = {}
    for _, row in ipairs(store.listDocs(cid)) do
        local doc = serializeDoc(row)
        doc.signed = signed[row.id] == true
        docs[#docs + 1] = doc
    end

    return ok({ folders = folders, docs = docs })
end

---A single document including its content, scoped to the caller.
---@param src integer player server id
---@param payload { id?: string }
---@return table result envelope with { doc }
function actions.get(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local id = type(payload.id) == 'string' and payload.id or ''
    local row = store.getDoc(cid, id)
    if not row then return fail('Document not found') end
    local doc = serializeDoc(row)
    if row.kind == 'text' then attachSignatures(doc, id) end
    return ok({ doc = doc })
end

---Creates a folder for the caller. The name is required, the folder cap applies, and the new
---folder's depth must stay within the configured maximum.
---@param src integer player server id
---@param payload { name?: string, parentId?: string }
---@return table result envelope with { folder }
function actions.createFolder(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local name = trim(payload.name)
    if name == '' then return fail('A name is required') end
    if #name > cfg.MaxNameLength then name = name:sub(1, cfg.MaxNameLength) end

    if store.countFolders(cid) >= cfg.MaxFolders then
        return fail(('You can store at most %d folders'):format(cfg.MaxFolders))
    end

    local parentId
    if type(payload.parentId) == 'string' and payload.parentId ~= '' then
        local parentOf, exists = folderMaps(cid)
        if not exists[payload.parentId] then return fail('Folder not found') end
        if depthOf(parentOf, payload.parentId) + 1 > cfg.MaxFolderDepth then
            return fail(('Folders can be nested at most %d deep'):format(cfg.MaxFolderDepth))
        end
        parentId = payload.parentId
    end

    local id, ts = newId(), os.time()
    store.createFolder(cid, id, name, parentId, ts)
    return ok({ folder = { id = id, name = name, parentId = parentId } })
end

---Creates an empty text document for the caller under an optional folder. The document cap
---applies; the folder, when given, must belong to the caller.
---@param src integer player server id
---@param payload { name?: string, folderId?: string }
---@return table result envelope with { doc }
function actions.createDoc(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local name = trim(payload.name)
    if name == '' then return fail('A name is required') end
    if #name > cfg.MaxNameLength then name = name:sub(1, cfg.MaxNameLength) end

    if store.countDocs(cid) >= cfg.MaxDocuments then
        return fail(('You can store at most %d documents'):format(cfg.MaxDocuments))
    end

    local folderId, ferr = resolveFolderId(cid, payload.folderId)
    if ferr then return fail(ferr) end

    local id, ts = newId(), os.time()
    store.createDoc(cid, {
        id = id, folderId = folderId, name = name, kind = 'text',
        content = '', url = nil, size = 0, locked = 0, source = nil, ts = ts,
    })
    return ok({ doc = serializeDoc({
        id = id, folder_id = folderId, name = name, kind = 'text', content = '', url = nil,
        size = 0, locked = 0, source = nil, created_at = ts, updated_at = ts,
    }) })
end

---Saves a text document's content. Refuses a locked or missing document and content over the
---configured length; the store also enforces the locked guard in SQL.
---@param src integer player server id
---@param payload { id?: string, content?: string }
---@return table result envelope with { updatedAt, size }
function actions.save(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local id = type(payload.id) == 'string' and payload.id or ''
    local content = type(payload.content) == 'string' and payload.content or ''
    if #content > cfg.MaxTextLength then
        return fail(('Document must be %d characters or fewer'):format(cfg.MaxTextLength))
    end

    local row = store.getDoc(cid, id)
    if not row then return fail('Document not found') end
    if isTruthy(row.locked) then return fail('This document is locked') end
    if store.hasSignatures(id) then return fail('This document has been signed and can no longer be edited') end

    local ts, size = os.time(), #content
    if store.updateContent(cid, id, content, size, ts) == 0 then return fail('Could not save document') end
    return ok({ updatedAt = ts, size = size })
end

---Renames a document. Refuses a locked or missing document, scoped to the caller.
---@param src integer player server id
---@param payload { id?: string, name?: string }
---@return table result envelope
function actions.rename(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local id = type(payload.id) == 'string' and payload.id or ''
    local name = trim(payload.name)
    if name == '' then return fail('A name is required') end
    if #name > cfg.MaxNameLength then name = name:sub(1, cfg.MaxNameLength) end

    local row = store.getDoc(cid, id)
    if not row then return fail('Document not found') end
    if isTruthy(row.locked) then return fail('This document is locked') end
    if store.hasSignatures(id) then return fail('This document has been signed and can no longer be renamed') end

    if store.renameDoc(cid, id, name, os.time()) == 0 then return fail('Could not rename document') end
    return ok({})
end

---Renames a folder, scoped to the caller.
---@param src integer player server id
---@param payload { id?: string, name?: string }
---@return table result envelope
function actions.renameFolder(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local id = type(payload.id) == 'string' and payload.id or ''
    local name = trim(payload.name)
    if name == '' then return fail('A name is required') end
    if #name > cfg.MaxNameLength then name = name:sub(1, cfg.MaxNameLength) end

    if store.renameFolder(cid, id, name) == 0 then return fail('Folder not found') end
    return ok({})
end

---Moves a document into a folder (or to root when the target is nil/empty). The target folder
---must exist and belong to the caller.
---@param src integer player server id
---@param payload { id?: string, folderId?: string }
---@return table result envelope
function actions.move(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local id = type(payload.id) == 'string' and payload.id or ''
    if id == '' then return fail('Document id is required') end

    local row = store.getDoc(cid, id)
    if not row then return fail('Document not found') end
    if isTruthy(row.locked) then return fail('This document is locked') end

    local folderId, ferr = resolveFolderId(cid, payload.folderId)
    if ferr then return fail(ferr) end

    if store.moveDoc(cid, id, folderId) == 0 then return fail('Document not found') end
    return ok({})
end

---Deletes a document. Refuses a locked or missing document, scoped to the caller.
---@param src integer player server id
---@param payload { id?: string }
---@return table result envelope
function actions.delete(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local id = type(payload.id) == 'string' and payload.id or ''
    local row = store.getDoc(cid, id)
    if not row then return fail('Document not found') end
    if isTruthy(row.locked) then return fail('This document is locked') end

    if store.deleteDoc(cid, id) == 0 then return fail('Could not delete document') end
    store.deleteSignaturesForDocs({ id })
    return ok({})
end

---Deletes a folder and everything beneath it. Descendant folder ids are collected here; locked
---documents survive by re-parenting to root, then the rest and the folders are batch-removed.
---@param src integer player server id
---@param payload { id?: string }
---@return table result envelope with { removedDocs }
function actions.deleteFolder(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local id = type(payload.id) == 'string' and payload.id or ''
    if id == '' then return fail('Folder id is required') end

    local childrenOf, exists = {}, {}
    for _, row in ipairs(store.listFolders(cid)) do
        exists[row.id] = true
        if row.parent_id then
            local bucket = childrenOf[row.parent_id]
            if not bucket then bucket = {}; childrenOf[row.parent_id] = bucket end
            bucket[#bucket + 1] = row.id
        end
    end
    if not exists[id] then return fail('Folder not found') end

    local idList, inSet, stack = {}, {}, { id }
    while #stack > 0 do
        local cur = table.remove(stack)
        if not inSet[cur] then
            inSet[cur] = true
            idList[#idList + 1] = cur
            for _, child in ipairs(childrenOf[cur] or {}) do stack[#stack + 1] = child end
        end
    end

    local removedDocs, removedIds = 0, {}
    for _, row in ipairs(store.listDocs(cid)) do
        if row.folder_id and inSet[row.folder_id] and not isTruthy(row.locked) then
            removedDocs = removedDocs + 1
            removedIds[#removedIds + 1] = row.id
        end
    end

    store.reparentLockedToRoot(cid, idList)
    store.deleteDocsInFolders(cid, idList)
    store.deleteFolders(cid, idList)
    store.deleteSignaturesForDocs(removedIds)
    return ok({ removedDocs = removedDocs })
end

---Duplicates a document as a fresh, never-locked copy with a " copy" suffix, scoped to the
---caller. The document cap applies.
---@param src integer player server id
---@param payload { id?: string }
---@return table result envelope with { doc }
function actions.duplicate(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local id = type(payload.id) == 'string' and payload.id or ''
    local row = store.getDoc(cid, id)
    if not row then return fail('Document not found') end

    if store.countDocs(cid) >= cfg.MaxDocuments then
        return fail(('You can store at most %d documents'):format(cfg.MaxDocuments))
    end

    local name = (trim(row.name) .. ' copy')
    if #name > cfg.MaxNameLength then name = name:sub(1, cfg.MaxNameLength) end

    local newDocId, ts = newId(), os.time()
    local size = tonumber(row.size) or 0
    store.createDoc(cid, {
        id = newDocId, folderId = row.folder_id, name = name, kind = row.kind,
        content = row.content, url = row.url, size = size, locked = 0, source = row.source, ts = ts,
    })
    return ok({ doc = serializeDoc({
        id = newDocId, folder_id = row.folder_id, name = name, kind = row.kind, content = row.content,
        url = row.url, size = size, locked = 0, source = row.source, created_at = ts, updated_at = ts,
    }) })
end

---Imports an external image as an image document under an optional folder. The URL must start
---http(s) and stay within the column length; the folder, when given, must belong to the caller.
---@param src integer player server id
---@param payload { name?: string, url?: string, folderId?: string }
---@return table result envelope with { doc }
function actions.importImage(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local name = trim(payload.name)
    if name == '' then return fail('A name is required') end
    if #name > cfg.MaxNameLength then name = name:sub(1, cfg.MaxNameLength) end

    local url = trim(payload.url)
    if not url:match('^https?://') then return fail('A valid image URL is required') end
    if #url > 1024 then return fail('Image URL is too long') end

    if store.countDocs(cid) >= cfg.MaxDocuments then
        return fail(('You can store at most %d documents'):format(cfg.MaxDocuments))
    end

    local folderId, ferr = resolveFolderId(cid, payload.folderId)
    if ferr then return fail(ferr) end

    local id, ts = newId(), os.time()
    store.createDoc(cid, {
        id = id, folderId = folderId, name = name, kind = 'image',
        content = nil, url = url, size = 0, locked = 0, source = nil, ts = ts,
    })
    return ok({ doc = serializeDoc({
        id = id, folder_id = folderId, name = name, kind = 'image', content = nil, url = url,
        size = 0, locked = 0, source = nil, created_at = ts, updated_at = ts,
    }) })
end

---Creates a document directly for a resolved citizenid; the shared core behind both create
---exports. Validates the payload, applies caps, and resolves/auto-creates the named folder.
---@param cid string acting citizenid
---@param opts table export options { name, kind?, content?, url?, folder?, locked? }
---@param sourceLabel string|nil the invoking resource, stored on the row
---@return string|nil docId
---@return string? err
---@return table? doc serialized document for the live push
function actions.createForCid(cid, opts, sourceLabel)
    if type(cid) ~= 'string' or cid == '' then return nil, 'Player not found' end
    if type(opts) ~= 'table' then return nil, 'Options are required' end

    local name = trim(opts.name)
    if name == '' then return nil, 'A name is required' end
    if #name > cfg.MaxNameLength then name = name:sub(1, cfg.MaxNameLength) end

    local kind = (type(opts.kind) == 'string' and KINDS[opts.kind]) and opts.kind or 'text'

    local content, url, size = nil, nil, 0
    if kind == 'image' then
        url = trim(opts.url)
        if not url:match('^https?://') then return nil, 'A valid image URL is required' end
        if #url > 1024 then return nil, 'Image URL is too long' end
    else
        content = type(opts.content) == 'string' and opts.content or ''
        if #content > cfg.MaxTextLength then return nil, 'Content is too long' end
        size = #content
        if content == '' then content = kind == 'file' and nil or '' end
        local rawUrl = trim(opts.url)
        if rawUrl ~= '' then
            if #rawUrl > 1024 then return nil, 'URL is too long' end
            url = rawUrl
        end
    end

    if store.countDocs(cid) >= cfg.MaxDocuments then return nil, 'Document limit reached' end

    local folderId, ferr = resolveFolderName(cid, opts.folder)
    if ferr then return nil, ferr end

    local locked = opts.locked == true and 1 or 0
    local source = type(sourceLabel) == 'string' and sourceLabel ~= '' and sourceLabel or nil
    local id, ts = newId(), os.time()
    store.createDoc(cid, {
        id = id, folderId = folderId, name = name, kind = kind,
        content = content, url = url, size = size, locked = locked, source = source, ts = ts,
    })
    return id, nil, serializeDoc({
        id = id, folder_id = folderId, name = name, kind = kind, content = content, url = url,
        size = size, locked = locked, source = source, created_at = ts, updated_at = ts,
    })
end

---Content-free documents for a citizenid, optionally filtered to a named root folder. Read-only;
---an unknown folder name yields an empty list.
---@param cid string acting citizenid
---@param folderName string|nil optional root folder name filter
---@return table[] docs
function actions.listForCid(cid, folderName)
    if type(cid) ~= 'string' or cid == '' then return {} end

    local wantFolder
    if type(folderName) == 'string' and trim(folderName) ~= '' then
        local lower = trim(folderName):lower()
        for _, row in ipairs(store.listFolders(cid)) do
            if not row.parent_id and type(row.name) == 'string' and row.name:lower() == lower then
                wantFolder = row.id
                break
            end
        end
        if not wantFolder then return {} end
    end

    local out = {}
    for _, row in ipairs(store.listDocs(cid)) do
        if not wantFolder or row.folder_id == wantFolder then out[#out + 1] = serializeDoc(row) end
    end
    return out
end

---A document's raw content for a citizenid, or nil. Read-only.
---@param cid string acting citizenid
---@param docId any document id
---@return string|nil
function actions.getContentForCid(cid, docId)
    if type(cid) ~= 'string' or cid == '' then return nil end
    if type(docId) ~= 'string' or docId == '' then return nil end
    local row = store.getDoc(cid, docId)
    return row and row.content or nil
end

---Deletes a document by id for a citizenid, bypassing the locked guard (export-owned). Answers
---whether a row was removed.
---@param cid string acting citizenid
---@param docId any document id
---@return boolean removed
function actions.deleteForCid(cid, docId)
    if type(cid) ~= 'string' or cid == '' then return false end
    if type(docId) ~= 'string' or docId == '' then return false end
    if store.deleteDoc(cid, docId) == 0 then return false end
    store.deleteSignaturesForDocs({ docId })
    return true
end

---True when a citizenid's document carries at least one signature. Read-only; false when the
---document doesn't exist or belong to the player.
---@param cid string acting citizenid
---@param docId any document id
---@return boolean signed
function actions.isSignedForCid(cid, docId)
    if type(cid) ~= 'string' or cid == '' then return false end
    if type(docId) ~= 'string' or docId == '' then return false end
    if not store.getDoc(cid, docId) then return false end
    return store.hasSignatures(docId)
end

---A document's signatures for a citizenid, for other resources. Read-only; an empty array when
---the document doesn't exist or belong to the player.
---@param cid string acting citizenid
---@param docId any document id
---@return table[] signatures
function actions.listSignaturesForCid(cid, docId)
    if type(cid) ~= 'string' or cid == '' then return {} end
    if type(docId) ~= 'string' or docId == '' then return {} end
    if not store.getDoc(cid, docId) then return {} end
    local out = {}
    for _, row in ipairs(store.listSignatures(docId)) do out[#out + 1] = serializeSig(row) end
    return out
end

---The caller's saved personal signature image, or nil when never drawn.
---@param src integer player server id
---@return table result envelope with { image }
function actions.getSignature(src)
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end
    return ok({ image = store.getPersonalSignature(cid) })
end

---Saves the caller's personal signature image (a PNG data-URL within the configured length).
---@param src integer player server id
---@param payload { image?: string }
---@return table result envelope
function actions.setSignature(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local image = sanitizeSignatureImage(payload.image)
    if not image then return fail('That signature could not be saved') end
    store.setPersonalSignature(cid, image, os.time())
    return ok({})
end

---Signs one of the caller's text documents with their saved personal signature. The image is
---snapshotted onto the signature row, so redrawing the personal signature later never rewrites
---history; the presence of any signature freezes the document's content and name.
---@param src integer player server id
---@param payload { id?: string }
---@return table result envelope with { doc }
function actions.sign(src, payload)
    if type(payload) ~= 'table' then payload = {} end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local id = type(payload.id) == 'string' and payload.id or ''
    local row = store.getDoc(cid, id)
    if not row then return fail('Document not found') end
    if row.kind ~= 'text' then return fail('Only text documents can be signed') end
    if store.hasSigned(id, cid) then return fail('You have already signed this document') end

    local image = store.getPersonalSignature(cid)
    if not image then return fail('Draw your signature first') end

    store.addSignature({
        id = newId(), docId = id, citizenid = cid,
        signer = player.getName(src) or 'Unknown', image = image, ts = os.time(),
    })
    return ok({ doc = attachSignatures(serializeDoc(row), id) })
end

---Opens an AirShare request offering one of the caller's documents to a nearby player. The
---document is read at request time; the copy is delivered only if the recipient accepts.
---@param src integer sender server id
---@param target any client-supplied recipient server id (validated by share.request)
---@param payload { id?: string }
---@return table result envelope
function actions.requestShare(src, target, payload)
    if type(payload) ~= 'table' then payload = {} end
    if not cfg.AllowShare then return fail('Sharing is disabled') end
    local cid = player.getIdentifier(src)
    if not cid then return fail('Player not found') end

    local id = type(payload.id) == 'string' and payload.id or ''
    local row = store.getDoc(cid, id)
    if not row then return fail('Document not found') end
    if isTruthy(row.locked) then return fail('This document cannot be shared') end

    -- Signatures travel with the copy (read server-side here, re-inserted server-side on
    -- delivery), so a signed contract stays verifiably signed on the recipient's phone.
    local sigs = {}
    for _, s in ipairs(store.listSignatures(id)) do
        sigs[#sigs + 1] = { citizenid = s.citizenid, signer = s.signer, image = s.image, created_at = s.created_at }
    end

    local okSent, msg = share.request(src, target, 'document', {
        name    = row.name,
        kind    = row.kind,
        content = row.content,
        url     = row.url,
        size    = tonumber(row.size) or 0,
        source  = row.source,
        fromName = player.getName(src),
        signatures = sigs,
    })
    if not okSent then return fail(msg or 'Could not send request') end
    return ok({})
end

---Delivers an accepted document share as a fresh, never-locked copy into the recipient's
---library; runs only as the AirShare 'document' handler. The recipient's document cap applies.
---@param targetSrc number recipient server id
---@param payload table vetted share payload { name, kind, content, url, size, source, fromName }
---@return boolean delivered
function actions.deliverShare(targetSrc, payload)
    local tcid = player.getIdentifier(targetSrc)
    if not tcid then return false end
    if type(payload) ~= 'table' then return false end
    if store.countDocs(tcid) >= cfg.MaxDocuments then return false end

    local name = trim(payload.name)
    if name == '' then name = 'Shared document' end
    if #name > cfg.MaxNameLength then name = name:sub(1, cfg.MaxNameLength) end

    local kind = (type(payload.kind) == 'string' and KINDS[payload.kind]) and payload.kind or 'text'

    local content, url, size = nil, nil, tonumber(payload.size) or 0
    if kind == 'image' then
        url = trim(payload.url)
        if not url:match('^https?://') or #url > 1024 then return false end
        size = 0
    else
        content = type(payload.content) == 'string' and payload.content or ''
        if #content > cfg.MaxTextLength then content = content:sub(1, cfg.MaxTextLength) end
        size = #content
        local rawUrl = trim(payload.url)
        url = (rawUrl ~= '' and #rawUrl <= 1024) and rawUrl or nil
    end

    local source = type(payload.source) == 'string' and payload.source ~= '' and payload.source or nil
    local id, ts = newId(), os.time()
    store.createDoc(tcid, {
        id = id, folderId = nil, name = name, kind = kind,
        content = content, url = url, size = size, locked = 0, source = source, ts = ts,
    })

    -- Re-attach the sender's signature rows to the delivered copy; the payload was built
    -- server-side in requestShare, so the rows stay authentic.
    if kind == 'text' and type(payload.signatures) == 'table' then
        for _, s in ipairs(payload.signatures) do
            if type(s) == 'table' and type(s.citizenid) == 'string' and s.citizenid ~= '' then
                store.addSignature({
                    id = newId(), docId = id, citizenid = s.citizenid,
                    signer = type(s.signer) == 'string' and s.signer:sub(1, 64) or 'Unknown',
                    image = sanitizeSignatureImage(s.image),
                    ts = tonumber(s.created_at) or ts,
                })
            end
        end
    end

    local doc = serializeDoc({
        id = id, folder_id = nil, name = name, kind = kind, content = content, url = url,
        size = size, locked = 0, source = source, created_at = ts, updated_at = ts,
    })
    if kind == 'text' then attachSignatures(doc, id) end
    local fromName = type(payload.fromName) == 'string' and payload.fromName ~= '' and payload.fromName or 'Someone'
    TriggerClientEvent('sd-phone:client:documents:receive', targetSrc, { doc = doc, fromName = fromName })
    TriggerClientEvent('sd-phone:client:notify', targetSrc, {
        app = 'documents', appId = 'documents', time = 'now',
        title = 'Files', body = ('%s shared "%s" with you'):format(fromName, name),
    })
    return true
end

return actions
