---@type table vRP lineage + adapter config (bridge.shared.vrp_version). Every caller of this
---module is already gated on framework.name == 'vrp', and this require pulls in nothing else, so
---nothing here reaches a QBox/QBCore/ESX boot.
local ver = require 'bridge.shared.vrp_version'

---@type table configs/vrp.lua, re-exported by vrp_version, which is its sole owner. It is `{}` when
---the admin's configs/ folder predates vRP support, so every read of it below carries its own
---default rather than assuming a key exists.
local cfg = type(ver.cfg) == 'table' and ver.cfg or {}

---@type 1|2 vRP lineage. Falls back to 2 exactly as vrp_version's unknown-fork branch does, so this
---module still loads under a plain-Lua test harness where nothing was detected.
local MAJOR = ver.major == 1 and 1 or 2

---@type boolean True when the phone is keyed on the vRP ACCOUNT rather than on one character. vRP 1
---has no characters at all, so it is always account-scoped; on vRP 2 this follows IdentityScope.
---Identity and group rows are still per-character on vRP 2 either way, which is why the account
---scope needs a join in every query and the character scope needs none.
local ACCOUNT_SCOPE = MAJOR == 1 or cfg.IdentityScope == 'account'

---@type string sd-phone identifier prefix for this server. The `u`/`c` discriminator keeps the two
---key spaces disjoint, so a vRP 1 -> vRP 2 migration cannot collapse user_id 5 onto cid 5.
local KEY_PREFIX = ACCOUNT_SCOPE and 'vrp:u' or 'vrp:c'

---@type string Lua pattern matching a key of this server and capturing its numeric id. Safe to
---build by concatenation because KEY_PREFIX holds no pattern-magic character.
local KEY_PATTERN = '^' .. KEY_PREFIX .. '(%d+)$'

---@type string vRP's identity table for this lineage. Confirmed against vrp/modules/identity.lua in
---both trees: it carries (registration, phone, firstname, name, age) and nothing else, which is why
---the MDT's DOB, sex and metadata fields stay blank on vRP.
local IDENT_TABLE = MAJOR == 1 and 'vrp_user_identities' or 'vrp_character_identities'

---@type string Primary key column of IDENT_TABLE.
local IDENT_ID = MAJOR == 1 and 'user_id' or 'character_id'

---@type string Persisted datatable holding the group map. vRP 1 writes json.encode into a TEXT
---column; vRP 2 writes msgpack.pack into a BLOB through UNHEX(tohex(v)). Both keep the map at
---`groups` and both key it by group name with a `true` value.
local DATA_TABLE = MAJOR == 1 and 'vrp_user_data' or 'vrp_character_data'

---@type string Owning-entity column of DATA_TABLE.
local DATA_ID = MAJOR == 1 and 'user_id' or 'character_id'

---@type string The single dkey both lineages persist the datatable under.
local DATA_KEY = 'vRP:datatable'

---@type string FROM clause for identity reads, aliased `i` (and `c` where the account scope forces
---a join through vrp_characters). Built once, because the join is a property of the lineage and the
---configured scope, never of the individual call.
local IDENT_FROM = (MAJOR == 2 and ACCOUNT_SCOPE)
    and ('`vrp_characters` c JOIN `%s` i ON i.`%s` = c.`id`'):format(IDENT_TABLE, IDENT_ID)
    or ('`%s` i'):format(IDENT_TABLE)

---@type string The column carrying the value an sd-phone key is built from.
local IDENT_KEYCOL = (MAJOR == 2 and ACCOUNT_SCOPE) and 'c.`user_id`' or ('i.`%s`'):format(IDENT_ID)

---@type string Projection for every identity read. `keyid` is what the phone key is made of and
---`id` is the vRP row's own id; they differ only in the vRP 2 account scope.
local IDENT_SELECT = ('%s AS keyid, i.`%s` AS id, i.`registration`, i.`phone`, i.`firstname`, i.`name`, i.`age`')
    :format(IDENT_KEYCOL, IDENT_ID)

---@type string Ordering for browse and search pages. vRP's identity tables carry no timestamp, so
---the id is the only stable ordering available, and stability is what makes paging correct.
local IDENT_ORDER = ('i.`%s` ASC'):format(IDENT_ID)

---@type string FROM clause for datatable scans, aliased `d`, joined the same way as identities.
local DATA_FROM = (MAJOR == 2 and ACCOUNT_SCOPE)
    and ('`vrp_characters` c JOIN `%s` d ON d.`%s` = c.`id`'):format(DATA_TABLE, DATA_ID)
    or ('`%s` d'):format(DATA_TABLE)

---@type string The column a datatable scan builds its phone key from.
local DATA_KEYCOL = (MAJOR == 2 and ACCOUNT_SCOPE) and 'c.`user_id`' or ('d.`%s`'):format(DATA_ID)

---@type integer Characters below which a search term is not a filter at all, so the caller is
---browsing and gets an unfiltered page. Mirrors bridge/server/records.lua, which enforces the same
---floor on the qb and esx paths.
local MIN_TERM <const> = 2

---@type integer Hard ceiling on rows one search page may return. vRP indexes only `registration`
---and `phone`, and a substring LIKE over `firstname`/`name` cannot use an index anyway, so every
---search is a table scan and the page size is the only thing bounding its cost.
local SEARCH_CAP <const> = 100

---@type integer Hard ceiling on rows one offline group scan may read. On vRP 2 every returned row
---is msgpack-unpacked in Lua, so an unbounded scan on a large server would block the server thread;
---past this the roster is simply truncated, which the caller merges with the online list anyway.
local SCAN_CAP <const> = 5000

---@type integer Milliseconds an offline group roster is served before the scan is repeated. The
---roster feeds Services and the MDT department list, both of which are opened repeatedly in a
---session, and neither needs sub-minute freshness for OFFLINE members.
local ROSTER_TTL <const> = 60000

---@type table Sql module; the table returned at end of file. Direct reads of vRP's own schema for
---the things the Proxy cannot answer at all: offline identities, offline rosters, and the vRP 1
---offline bank balance. Every query is pcall-guarded, because this resource does not own these
---tables and a fork that renamed a column must degrade rather than propagate out of the callback
---that asked.
local sql = {}

---@type table<string, { at: number, keys: string[] }> Offline roster cache keyed by group name.
local rosterCache = {}

---Rows, or nil when the query raised. Nil is deliberately distinct from an empty result: an offline
---roster that failed to scan must fall back to the online-only list, and an empty one must not.
---@param text string
---@param params? table
---@return table[]|nil rows
local function query(text, params)
    local ok, rows = pcall(function() return MySQL.query.await(text, params) end)
    return (ok and type(rows) == 'table') and rows or nil
end

---A number, or nil when the query raised.
---@param text string
---@param params? table
---@return number|nil
local function scalar(text, params)
    local ok, value = pcall(function() return MySQL.scalar.await(text, params) end)
    return ok and tonumber(value) or nil
end

---Trims a value to a plain string; anything non-string coerces, and nil becomes ''.
---@param v any
---@return string
local function str(v)
    if v == nil then return '' end
    if type(v) ~= 'string' then return tostring(v) end
    return (v:gsub('^%s+', ''):gsub('%s+$', ''))
end

---Escapes the LIKE wildcards in user input so a search for `%` matches a literal percent sign
---rather than every row in the table.
---@param s string
---@return string
local function escapeLike(s)
    return (s:gsub('([%%_\\])', '\\%1'))
end

---The sd-phone identifier for a vRP id, in this server's key space.
---@param id integer|string user_id on vRP 1 and in the account scope, cid on vRP 2
---@return string key
function sql.keyFor(id)
    return KEY_PREFIX .. tostring(id)
end

---The numeric vRP id inside an sd-phone identifier, or nil when the key belongs to another key
---space. A vRP 1 key reaching a vRP 2 server (or the reverse) is rejected rather than reinterpreted,
---because the two id spaces name different entities.
---@param key string|nil
---@return integer|nil id
function sql.idFor(key)
    if type(key) ~= 'string' then return nil end
    local digits = key:match(KEY_PATTERN)
    return digits and tonumber(digits) or nil
end

---Normalises one identity row into the shape the bridge hands upward. vRP's `firstname` is the
---given name and `name` is the family name, which is the opposite of what the column names suggest
---to a reader used to the qb/esx schemas.
---@param row table raw row carrying keyid, id and the five identity columns
---@return table identity
local function identityOf(row)
    return {
        key          = sql.keyFor(row.keyid),
        id           = tonumber(row.id) or 0,
        firstname    = str(row.firstname),
        lastname     = str(row.name),
        phone        = str(row.phone),
        registration = str(row.registration),
        age          = tonumber(row.age) or 0,
    }
end

---Identities for a set of sd-phone keys, offline characters included, as `{ [key] = identity }`.
---One query. Keys outside this server's key space are dropped rather than queried. In the vRP 2
---account scope an account can own several characters and only one phone, so the account's LOWEST
---character id wins - it is the only choice that is stable across a rename or a new character.
---@param keys string[]
---@return table<string, table> identities
function sql.identities(keys)
    local out = {}
    if type(keys) ~= 'table' then return out end

    local seen, ids = {}, {}
    for i = 1, #keys do
        local id = sql.idFor(keys[i])
        if id and not seen[id] then
            seen[id] = true
            ids[#ids + 1] = id
        end
    end
    if #ids == 0 then return out end

    local marks = {}
    for i = 1, #ids do marks[i] = '?' end

    local rows = query(('SELECT %s FROM %s WHERE %s IN (%s) ORDER BY %s')
        :format(IDENT_SELECT, IDENT_FROM, IDENT_KEYCOL, table.concat(marks, ','), IDENT_ORDER), ids)
    if not rows then return out end

    for i = 1, #rows do
        local identity = identityOf(rows[i])
        if not out[identity.key] then out[identity.key] = identity end
    end
    return out
end

---One identity by sd-phone key, or nil when the key is unknown or the read failed.
---@param key string
---@return table|nil identity
function sql.identity(key)
    return sql.identities({ key })[key]
end

---Display names for a set of sd-phone keys as `{ [key] = 'First Last' }`. Keys whose identity row
---is missing or blank are absent from the result, so the caller can apply its own placeholder.
---@param keys string[]
---@return table<string, string> names
function sql.names(keys)
    local out = {}
    for key, identity in pairs(sql.identities(keys)) do
        local full = str(identity.firstname .. ' ' .. identity.lastname)
        if full ~= '' then out[key] = full end
    end
    return out
end

---A page of identities matching a free-text term across first name, family name and phone. A term
---under MIN_TERM characters is not a filter, so the page comes back unfiltered rather than empty.
---Neither lineage indexes the name columns, and a substring LIKE could not use such an index anyway,
---so the page size is capped hard and the term is escaped before it reaches the pattern.
---@param term string search term
---@param limit integer rows per page
---@param offset integer rows to skip
---@return table[] rows normalised identities
---@return integer total matching rows
function sql.searchIdentities(term, limit, offset)
    term   = str(term)
    limit  = math.min(SEARCH_CAP, math.max(1, math.floor(tonumber(limit) or 25)))
    offset = math.max(0, math.floor(tonumber(offset) or 0))

    local where, args = '', {}
    if #term >= MIN_TERM then
        local like = '%' .. escapeLike(term) .. '%'
        where = 'WHERE i.`firstname` LIKE ? OR i.`name` LIKE ? OR i.`phone` LIKE ?'
        args  = { like, like, like }
    end

    local total = scalar(('SELECT COUNT(DISTINCT %s) FROM %s %s'):format(IDENT_KEYCOL, IDENT_FROM, where), args)
    local rows  = query(('SELECT %s FROM %s %s ORDER BY %s LIMIT %d OFFSET %d')
        :format(IDENT_SELECT, IDENT_FROM, where, IDENT_ORDER, limit, offset), args)
    if not rows then return {}, 0 end

    local out, seen = {}, {}
    for i = 1, #rows do
        local identity = identityOf(rows[i])
        if not seen[identity.key] then
            seen[identity.key] = true
            out[#out + 1] = identity
        end
    end
    return out, total or #out
end

---Decodes one vRP 2 datatable BLOB. It is read as HEX() because oxmysql's handling of a raw BLOB
---column is unverified, and vRP itself writes the column through UNHEX(tohex(v)), which proves the
---round trip. Nil on anything unexpected, so one corrupt row cannot fail a whole roster scan.
---@param hex string|nil hex string as returned by HEX(dvalue)
---@return table|nil data
local function decodeCdata(hex)
    if type(hex) ~= 'string' or hex == '' or #hex % 2 ~= 0 then return nil end
    if type(msgpack) ~= 'table' or type(msgpack.unpack) ~= 'function' then return nil end

    local ok, packed = pcall(string.gsub, hex, '%x%x', function(byte)
        return string.char(tonumber(byte, 16))
    end)
    if not ok or type(packed) ~= 'string' then return nil end

    local decoded
    ok, decoded = pcall(msgpack.unpack, packed)
    return (ok and type(decoded) == 'table') and decoded or nil
end

---Pick the offline group-membership scan once at module load. vRP 1 stores the datatable as JSON
---TEXT, so the whole test happens in MySQL; vRP 2 stores it as a msgpack BLOB, which no SQL function
---can look inside, so the scan prefilters on the group name appearing literally in the packed bytes
---and then unpacks only the candidate rows. Both return nil on failure, which the caller must read
---as "unavailable" and fall back to its online-only roster; an empty list means "nobody holds it".
---@return fun(group: string): string[]|nil
local function chooseGroupScan()
    if MAJOR == 1 then
        return function(group)
            -- A group name carrying a quote or a backslash cannot be expressed in a JSON path
            -- without escaping rules that differ between MySQL and MariaDB. Refuse rather than
            -- build a path that might silently match the wrong key.
            if group:find('["\\]') then return nil end

            -- IF(JSON_VALID(...)) because JSON_EXTRACT raises on a malformed document and would
            -- take the entire scan down with it over one hand-edited row.
            local rows = query(([[
                SELECT %s AS keyid FROM %s
                WHERE d.`dkey` = ?
                  AND JSON_EXTRACT(IF(JSON_VALID(d.`dvalue`), d.`dvalue`, '{}'), ?) IS NOT NULL
                LIMIT %d
            ]]):format(DATA_KEYCOL, DATA_FROM, SCAN_CAP), { DATA_KEY, ('$.groups."%s"'):format(group) })
            if not rows then return nil end

            local out, seen = {}, {}
            for i = 1, #rows do
                local key = sql.keyFor(rows[i].keyid)
                if not seen[key] then
                    seen[key] = true
                    out[#out + 1] = key
                end
            end
            return out
        end
    end

    return function(group)
        local rows = query(([[
            SELECT %s AS keyid, HEX(d.`dvalue`) AS packed FROM %s
            WHERE d.`dkey` = ? AND d.`dvalue` LIKE ?
            LIMIT %d
        ]]):format(DATA_KEYCOL, DATA_FROM, SCAN_CAP),
            { DATA_KEY, '%' .. escapeLike(group) .. '%' })
        if not rows then return nil end

        local out, seen = {}, {}
        for i = 1, #rows do
            local data = decodeCdata(rows[i].packed)
            local groups = type(data) == 'table' and data.groups or nil
            -- The LIKE above matches any row whose packed bytes merely CONTAIN the name, so
            -- `police` prefilters rows holding only `police_chief`; the decoded map is what
            -- actually decides membership.
            if type(groups) == 'table' and groups[group] ~= nil then
                local key = sql.keyFor(rows[i].keyid)
                if not seen[key] then
                    seen[key] = true
                    out[#out + 1] = key
                end
            end
        end
        return out
    end
end

---@type fun(group: string): string[]|nil Offline group scan, bound once at load.
local groupScan = chooseGroupScan()

---Every sd-phone key holding `group`, offline members included, or nil when the scan is unavailable
---on this server. Cached for ROSTER_TTL, because both consumers (the Services roster and the MDT
---department list) reopen far more often than membership changes. ONLINE members are included too,
---since their persisted datatable row still exists, but it is only as fresh as vRP's last save tick
---so the caller must still merge its own live list over the top.
---@param group string vRP group name
---@return string[]|nil keys
function sql.groupMembers(group)
    if type(group) ~= 'string' or group == '' then return nil end

    local hit = rosterCache[group]
    if hit and (GetGameTimer() - hit.at) < ROSTER_TTL then return hit.keys end

    local keys = groupScan(group)
    if not keys then return nil end

    rosterCache[group] = { at = GetGameTimer(), keys = keys }
    return keys
end

---Drops the cached offline rosters. Called after a hire, fire, promote or demote, so the roster the
---acting boss sees next reflects the change instead of up to a minute of stale membership.
function sql.forgetRosters()
    rosterCache = {}
end

---Whether the holder of `key` is currently connected. Tri-state on purpose: nil means the question
---could not be answered, and the one caller that asks treats that as "assume online" so an offline
---write is never attempted on a guess.
---
---vRP is asked directly rather than going through bridge/server/player, which resolves players by
---calling the framework's own GetPlayer and has no vRP implementation to call: on this lineage it
---raises the moment any player is connected, which would answer nil forever and confine the offline
---credit to a completely empty server. vRP owns the authoritative map, and on vRP 1 getUserSource is
---a plain in-memory read of `vRP.user_sources` that never yields.
---@param key string sd-phone identifier
---@return boolean|nil online
local function isOnline(key)
    local id = sql.idFor(key)
    if not id then return nil end

    local okReq, rpc = pcall(require, 'bridge.server.vrp.rpc')
    if not okReq or type(rpc) ~= 'table' or type(rpc.call) ~= 'function' then return nil end

    local okCall, src = pcall(rpc.call, 'vRP', 'getUserSource', id)
    if not okCall then return nil end
    return src ~= nil
end

---Pick the offline bank credit once at module load.
---
---vRP 1 keeps money in a real `vrp_user_moneys` table. It is loaded into the user's tmp table on
---`vRP:playerJoin` and written back on `vRP:playerLeave` and on the periodic `vRP:save`, which
---iterates `vRP.user_tmp_tables` only - that is, connected users. An offline user has no tmp table,
---so nothing can overwrite the row behind us and `bank = bank + ?` is safe.
---
---vRP 2 keeps money inside the character's cdata, persisted as one msgpack blob that the save tick
---rewrites WHOLESALE. An offline write there is not merely lost, it races a full-blob rewrite and
---can destroy money, so it is refused outright and the caller tells the sender to wait for the
---recipient to come online.
---@return fun(key: string, amount: integer): boolean
local function chooseBankAddOffline()
    if MAJOR ~= 1 then
        return function() return false end
    end

    return function(key, amount)
        local id = sql.idFor(key)
        if not id then return false end
        if isOnline(key) ~= false then return false end

        local ok, affected = pcall(function()
            return MySQL.update.await('UPDATE `vrp_user_moneys` SET `bank` = `bank` + ? WHERE `user_id` = ?',
                { amount, id })
        end)
        return ok and (tonumber(affected) or 0) > 0
    end
end

---@type fun(key: string, amount: integer): boolean Offline bank credit, bound once at load.
local bankAddOffline = chooseBankAddOffline()

---Credit an OFFLINE character's bank balance directly in vRP's schema. False when the target is
---online, when their connection state cannot be determined, when the lineage cannot support it, or
---when no row was updated - in every one of those cases the caller must refund the sender, which it
---already does. Never debits: a negative or zero amount is refused.
---@param key string sd-phone identifier of the recipient
---@param amount number positive whole amount
---@return boolean credited
function sql.addOfflineBank(key, amount)
    amount = math.floor(tonumber(amount) or 0)
    if amount <= 0 then return false end
    return bankAddOffline(key, amount)
end

---Add INDEX(firstname) and INDEX(name) to vRP's identity table, exactly once, and only when
---configs/vrp.lua opts in. This is the only statement in sd-phone that ALTERs a table it does not
---own, so the flag is checked here as well as at the call site. A failure leaves no migration row
---behind, so a later boot retries rather than recording a migration that never ran.
---@return boolean ran true only when the migration executed on this boot
function sql.ensureSearchIndexes()
    if cfg.AddSearchIndexes ~= true then return false end

    local okReq, util = pcall(require, 'server.util')
    if not okReq or type(util) ~= 'table' or type(util.runOnce) ~= 'function' then return false end

    local ok, ran = pcall(util.runOnce, 'vrp_identity_search_indexes', function()
        util.ensureIndex(IDENT_TABLE, 'idx_sdp_vrp_firstname', '(`firstname`)')
        util.ensureIndex(IDENT_TABLE, 'idx_sdp_vrp_name', '(`name`)')
        return { table = IDENT_TABLE }
    end)
    if not ok then
        print(('^1[sd-phone:vrp]^0 could not add search indexes to %s: %s'):format(IDENT_TABLE, ran))
        return false
    end
    return ran == true
end

return sql
