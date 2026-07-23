---@type table Store module; the table returned at end of file. Documents and folders, one row
---per item scoped to a citizenid; every statement filters by citizenid, that WHERE clause is the
---ownership boundary.
local store = {}

---@type table Shared server helpers (server.util): legacy-table rescue and index bootstrap.
local util = require 'server.util'

---Creates the phone_documents and phone_document_folders tables idempotently and adds their
---secondary indexes. Runs once at boot; an lb-phone-shaped same-named table is moved aside first.
function store.ensureSchema()
    util.rescueLegacyTable('phone_documents', 'citizenid')
    util.rescueLegacyTable('phone_document_folders', 'citizenid')

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_documents` (
            `id`         VARCHAR(16)   NOT NULL,
            `citizenid`  VARCHAR(64)   NOT NULL,
            `folder_id`  VARCHAR(16)   NULL,
            `name`       VARCHAR(80)   NOT NULL,
            `kind`       VARCHAR(16)   NOT NULL DEFAULT 'text',
            `content`    MEDIUMTEXT    NULL,
            `url`        VARCHAR(1024) NULL,
            `size`       INT           NOT NULL DEFAULT 0,
            `locked`     TINYINT(1)    NOT NULL DEFAULT 0,
            `source`     VARCHAR(64)   NULL,
            `created_at` BIGINT        NOT NULL,
            `updated_at` BIGINT        NOT NULL,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_document_folders` (
            `id`         VARCHAR(16) NOT NULL,
            `citizenid`  VARCHAR(64) NOT NULL,
            `name`       VARCHAR(60) NOT NULL,
            `parent_id`  VARCHAR(16) NULL,
            `created_at` BIGINT      NOT NULL,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_document_signatures` (
            `id`         VARCHAR(16) NOT NULL,
            `doc_id`     VARCHAR(16) NOT NULL,
            `citizenid`  VARCHAR(64) NOT NULL,
            `signer`     VARCHAR(64) NOT NULL,
            `image`      MEDIUMTEXT  NULL,
            `created_at` BIGINT      NOT NULL,
            PRIMARY KEY (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    MySQL.query.await([[
        CREATE TABLE IF NOT EXISTS `phone_signatures` (
            `citizenid`  VARCHAR(64) NOT NULL,
            `image`      MEDIUMTEXT  NOT NULL,
            `updated_at` BIGINT      NOT NULL,
            PRIMARY KEY (`citizenid`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])

    util.ensureIndex('phone_documents', 'idx_phone_documents_folder', '(citizenid, folder_id)')
    util.ensureIndex('phone_documents', 'idx_phone_documents_updated', '(citizenid, updated_at)')
    util.ensureIndex('phone_document_folders', 'idx_phone_document_folders_cid', '(citizenid)')
    util.ensureIndex('phone_document_signatures', 'idx_phone_document_signatures_doc', '(doc_id)')
end

---All of a player's folders. Read-only.
---@param cid string owner citizenid
---@return table[] rows {id, name, parent_id, created_at}
function store.listFolders(cid)
    return MySQL.query.await([[
        SELECT id, name, parent_id, created_at
        FROM `phone_document_folders` WHERE citizenid = ? ORDER BY name ASC
    ]], { cid }) or {}
end

---All of a player's documents without their content bodies, newest-edited first. Read-only.
---@param cid string owner citizenid
---@return table[] rows {id, folder_id, name, kind, url, size, locked, source, created_at, updated_at}
function store.listDocs(cid)
    return MySQL.query.await([[
        SELECT id, folder_id, name, kind, url, size, locked, source, created_at, updated_at
        FROM `phone_documents` WHERE citizenid = ? ORDER BY updated_at DESC
    ]], { cid }) or {}
end

---Reads one document in full, including its content body; nil when missing or not the caller's.
---Read-only.
---@param cid string owner citizenid
---@param id string document id
---@return table|nil row
function store.getDoc(cid, id)
    if not id or id == '' then return nil end
    return MySQL.single.await([[
        SELECT id, folder_id, name, kind, content, url, size, locked, source, created_at, updated_at
        FROM `phone_documents` WHERE citizenid = ? AND id = ?
    ]], { cid, id })
end

---Inserts a new folder row.
---@param cid string owner citizenid
---@param id string folder id
---@param name string folder name
---@param parentId string|nil parent folder id, nil for a root folder
---@param ts number epoch-seconds creation time
function store.createFolder(cid, id, name, parentId, ts)
    MySQL.insert.await([[
        INSERT INTO `phone_document_folders` (id, citizenid, name, parent_id, created_at)
        VALUES (?, ?, ?, ?, ?)
    ]], { id, cid, name, parentId, ts })
end

---Renames a folder. The citizenid in the WHERE clause is the ownership boundary.
---@param cid string owner citizenid
---@param id string folder id
---@param name string new name
---@return number affected rows updated
function store.renameFolder(cid, id, name)
    return MySQL.update.await(
        'UPDATE `phone_document_folders` SET name = ? WHERE citizenid = ? AND id = ?',
        { name, cid, id }
    ) or 0
end

---Deletes a set of folders by id in one parameterized IN statement. A no-op on an empty list.
---@param cid string owner citizenid
---@param idList string[] folder ids
function store.deleteFolders(cid, idList)
    if not idList or #idList == 0 then return end
    local placeholders = {}
    local params = { cid }
    for i = 1, #idList do
        placeholders[i] = '?'
        params[i + 1] = idList[i]
    end
    MySQL.update.await(
        ('DELETE FROM `phone_document_folders` WHERE citizenid = ? AND id IN (%s)')
            :format(table.concat(placeholders, ', ')),
        params
    )
end

---Inserts a new document row. Both timestamps are set to `doc.ts` on insert.
---@param cid string owner citizenid
---@param doc { id: string, folderId: string|nil, name: string, kind: string, content: string|nil, url: string|nil, size: number, locked: boolean, source: string|nil, ts: number }
function store.createDoc(cid, doc)
    MySQL.insert.await([[
        INSERT INTO `phone_documents`
            (id, citizenid, folder_id, name, kind, content, url, size, locked, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ]], {
        doc.id, cid, doc.folderId, doc.name, doc.kind, doc.content, doc.url,
        doc.size or 0, doc.locked and 1 or 0, doc.source, doc.ts, doc.ts,
    })
end

---Replaces a document's content body and size, touching updated_at. Locked rows refuse the
---write in SQL (AND locked = 0). The citizenid in the WHERE clause is the ownership boundary.
---@param cid string owner citizenid
---@param id string document id
---@param content string new content body
---@param size number new byte size
---@param ts number epoch-seconds edit time
---@return number affected rows updated (0 when missing, not theirs, or locked)
function store.updateContent(cid, id, content, size, ts)
    return MySQL.update.await([[
        UPDATE `phone_documents` SET content = ?, size = ?, updated_at = ?
        WHERE citizenid = ? AND id = ? AND locked = 0
    ]], { content, size, ts, cid, id }) or 0
end

---Renames a document, touching updated_at. The citizenid in the WHERE clause is the ownership
---boundary.
---@param cid string owner citizenid
---@param id string document id
---@param name string new name
---@param ts number epoch-seconds edit time
---@return number affected rows updated
function store.renameDoc(cid, id, name, ts)
    return MySQL.update.await(
        'UPDATE `phone_documents` SET name = ?, updated_at = ? WHERE citizenid = ? AND id = ?',
        { name, ts, cid, id }
    ) or 0
end

---Moves a document into a folder (nil folderId is the root). The citizenid in the WHERE clause is
---the ownership boundary.
---@param cid string owner citizenid
---@param id string document id
---@param folderId string|nil destination folder id, nil for root
---@return number affected rows updated
function store.moveDoc(cid, id, folderId)
    return MySQL.update.await(
        'UPDATE `phone_documents` SET folder_id = ? WHERE citizenid = ? AND id = ?',
        { folderId, cid, id }
    ) or 0
end

---Hard-deletes a document. The citizenid in the WHERE clause is the ownership boundary.
---@param cid string owner citizenid
---@param id string document id
---@return number affected rows deleted
function store.deleteDoc(cid, id)
    return MySQL.update.await(
        'DELETE FROM `phone_documents` WHERE citizenid = ? AND id = ?',
        { cid, id }
    ) or 0
end

---Deletes every unlocked document sitting in any of the given folders, in one parameterized IN
---statement. Locked documents are left untouched. A no-op on an empty list.
---@param cid string owner citizenid
---@param idList string[] folder ids
function store.deleteDocsInFolders(cid, idList)
    if not idList or #idList == 0 then return end
    local placeholders = {}
    local params = { cid }
    for i = 1, #idList do
        placeholders[i] = '?'
        params[i + 1] = idList[i]
    end
    MySQL.update.await(
        ('DELETE FROM `phone_documents` WHERE citizenid = ? AND locked = 0 AND folder_id IN (%s)')
            :format(table.concat(placeholders, ', ')),
        params
    )
end

---Re-parents any locked document in the given folders to root (folder_id = NULL) so a folder
---delete cannot destroy it. A no-op on an empty list.
---@param cid string owner citizenid
---@param idList string[] folder ids
function store.reparentLockedToRoot(cid, idList)
    if not idList or #idList == 0 then return end
    local placeholders = {}
    local params = { cid }
    for i = 1, #idList do
        placeholders[i] = '?'
        params[i + 1] = idList[i]
    end
    MySQL.update.await(
        ('UPDATE `phone_documents` SET folder_id = NULL WHERE citizenid = ? AND locked = 1 AND folder_id IN (%s)')
            :format(table.concat(placeholders, ', ')),
        params
    )
end

---A document's signatures, oldest first. Ownership of the parent document is the caller's
---responsibility (check getDoc first). Read-only.
---@param docId string document id
---@return table[] rows {id, citizenid, signer, image, created_at}
function store.listSignatures(docId)
    if not docId or docId == '' then return {} end
    return MySQL.query.await([[
        SELECT id, citizenid, signer, image, created_at
        FROM `phone_document_signatures` WHERE doc_id = ? ORDER BY created_at ASC
    ]], { docId }) or {}
end

---The ids of a player's documents that carry at least one signature, as a set. Read-only.
---@param cid string owner citizenid
---@return table<string, boolean> signed
function store.listSignedDocIds(cid)
    local rows = MySQL.query.await([[
        SELECT DISTINCT s.doc_id FROM `phone_document_signatures` s
        JOIN `phone_documents` d ON d.id = s.doc_id
        WHERE d.citizenid = ?
    ]], { cid }) or {}
    local set = {}
    for i = 1, #rows do set[rows[i].doc_id] = true end
    return set
end

---True when this signer already has a signature on the document. Read-only.
---@param docId string document id
---@param cid string signer citizenid
---@return boolean signed
function store.hasSigned(docId, cid)
    return MySQL.scalar.await(
        'SELECT 1 FROM `phone_document_signatures` WHERE doc_id = ? AND citizenid = ? LIMIT 1',
        { docId, cid }) ~= nil
end

---True when the document carries any signature (drives the content-freeze guards). Read-only.
---@param docId string document id
---@return boolean signed
function store.hasSignatures(docId)
    return MySQL.scalar.await(
        'SELECT 1 FROM `phone_document_signatures` WHERE doc_id = ? LIMIT 1', { docId }) ~= nil
end

---Inserts a signature row.
---@param sig { id: string, docId: string, citizenid: string, signer: string, image: string|nil, ts: number }
function store.addSignature(sig)
    MySQL.insert.await([[
        INSERT INTO `phone_document_signatures` (id, doc_id, citizenid, signer, image, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    ]], { sig.id, sig.docId, sig.citizenid, sig.signer, sig.image, sig.ts })
end

---Removes every signature on a set of documents, in one parameterized IN statement. A no-op on
---an empty list.
---@param docIds string[] document ids
function store.deleteSignaturesForDocs(docIds)
    if not docIds or #docIds == 0 then return end
    local placeholders = {}
    for i = 1, #docIds do placeholders[i] = '?' end
    MySQL.update.await(
        ('DELETE FROM `phone_document_signatures` WHERE doc_id IN (%s)')
            :format(table.concat(placeholders, ', ')),
        docIds
    )
end

---A player's saved personal signature image, or nil when never drawn. Read-only.
---@param cid string owner citizenid
---@return string|nil image PNG data-URL
function store.getPersonalSignature(cid)
    if not cid or cid == '' then return nil end
    return MySQL.scalar.await('SELECT image FROM `phone_signatures` WHERE citizenid = ?', { cid })
end

---Saves a player's personal signature image (upsert).
---@param cid string owner citizenid
---@param image string PNG data-URL
---@param ts number epoch-seconds save time
function store.setPersonalSignature(cid, image, ts)
    MySQL.update.await([[
        INSERT INTO `phone_signatures` (citizenid, image, updated_at) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE image = VALUES(image), updated_at = VALUES(updated_at)
    ]], { cid, image, ts })
end

---Counts a player's documents (drives the per-player cap). Read-only.
---@param cid string owner citizenid
---@return number
function store.countDocs(cid)
    return MySQL.scalar.await('SELECT COUNT(*) FROM `phone_documents` WHERE citizenid = ?', { cid }) or 0
end

---Counts a player's folders (drives the per-player cap). Read-only.
---@param cid string owner citizenid
---@return number
function store.countFolders(cid)
    return MySQL.scalar.await('SELECT COUNT(*) FROM `phone_document_folders` WHERE citizenid = ?', { cid }) or 0
end

return store
