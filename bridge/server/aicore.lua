---@type integer Milliseconds an AI Core callback export is waited on before it counts as no answer.
local CALLBACK_TIMEOUT = 5000

---@type integer Milliseconds a character's name is served from memory before it is read again.
local NAME_TTL_MS = 300000

---@type integer Members asked for per GetJobMembers page (AI Core's own maximum).
local MEMBERS_PAGE = 500

---@type integer GetJobMembers / SearchCharacters pages walked at most for one answer.
local MAX_PAGES = 20

---@type table AI Core module; the table returned at end of file. Helpers for the bridges that call
---AI Core's own exports: character ids, names, searches and its callback-style (offline) exports.
---Nothing here reads AI Core's tables: they trail its memory and their columns are internal.
local aicore = {}

---@type table Marks where the answer callback goes in an awaitOn argument list, for exports that
---take it before other arguments (`SearchCharacters(text, done, cursor)`). Appended when absent.
aicore.ANSWER = setmetatable({}, { __name = 'aicore.ANSWER' })

---Starts a callback-style export call. The promise resolves with the answer, or nil when the call
---errors or no answer arrives within CALLBACK_TIMEOUT.
---@param resource string
---@param name string
---@param args table packed export arguments, possibly holding aicore.ANSWER
---@return table promise
local function start(resource, name, args)
    local p = promise.new()
    local settled = false

    local function answer(result)
        if settled then return end
        settled = true
        p:resolve(result)
    end

    local placed = false
    for i = 1, args.n do
        if args[i] == aicore.ANSWER then
            args[i] = answer
            placed = true
        end
    end
    if not placed then
        args.n = args.n + 1
        args[args.n] = answer
    end

    local ok = pcall(function()
        exports[resource][name](exports[resource], table.unpack(args, 1, args.n))
    end)
    if not ok then
        answer(nil)
        return p
    end

    SetTimeout(CALLBACK_TIMEOUT, function() answer(nil) end)
    return p
end

---Calls an AI Core resource's export that answers through a callback and waits for the answer.
---The callback goes where aicore.ANSWER sits in the arguments, else last. Nil when the call errors
---or no answer arrives within CALLBACK_TIMEOUT.
---@param resource string resource name ('ai-core', 'ai-vehicles', ...)
---@param name string export name
---@param ... any export arguments
---@return any
function aicore.awaitOn(resource, name, ...)
    return Citizen.Await(start(resource, name, table.pack(...)))
end

---aicore.awaitOn for an ai-core export.
---@param name string export name
---@param ... any export arguments
---@return any
function aicore.await(name, ...)
    return aicore.awaitOn('ai-core', name, ...)
end

---True when an AI Core change result reports success (`{ ok = true }`).
---@param result any
---@return boolean
function aicore.succeeded(result)
    return type(result) == 'table' and result.ok == true
end

---@type table<string, integer> citizenid -> AI Core character id, kept once known. A citizenid
---belongs to one character for good, so an answer never goes stale.
local charIds = {}

---@type table<integer, string> AI Core character id -> citizenid, the reverse of charIds.
local citizenIds = {}

---Records a citizenid / character id pair in both directions.
---@param citizenid any
---@param charId any
local function remember(citizenid, charId)
    local id = math.tointeger(tonumber(charId))
    if type(citizenid) ~= 'string' or citizenid == '' or not id then return end
    charIds[citizenid] = id
    citizenIds[id] = citizenid
end

---A citizenid as the string AI Core keys it by, nil when unusable.
---@param citizenid any
---@return string|nil
local function asCitizenId(citizenid)
    if type(citizenid) == 'number' then citizenid = ('%.0f'):format(citizenid) end
    if type(citizenid) ~= 'string' or citizenid == '' then return nil end
    return citizenid
end

---AI Core's numeric character id behind a citizenid, from GetCharIdByCitizenId. A citizenid is
---never read as the id itself: AI Core does not promise the two match. Nil when unknown.
---@param citizenid any
---@return integer|nil
function aicore.charId(citizenid)
    local cid = asCitizenId(citizenid)
    if not cid then return nil end

    local known = charIds[cid]
    if known then return known end

    local id = math.tointeger(tonumber(aicore.await('GetCharIdByCitizenId', cid)))
    if id then remember(cid, id) end
    return id
end

---The stored or loaded character behind an AI Core character id: `{ info = { id, citizenid,
---firstname, lastname, birthdate, sex, nationality }, jobs = { { job, grade } }, metadata, ... }`.
---Nil when unknown.
---@param charId any
---@return table|nil
local function characterById(charId)
    local id = math.tointeger(tonumber(charId))
    if not id then return nil end

    local character = aicore.await('GetOfflineCharacter', id)
    if type(character) ~= 'table' or type(character.info) ~= 'table' then return nil end
    remember(character.info.citizenid, id)
    return character
end

---The citizenid behind an AI Core character id, nil when unknown. A loaded character answers from
---ai-core's memory without waiting.
---@param charId any
---@return string|nil
function aicore.citizenId(charId)
    local id = math.tointeger(tonumber(charId))
    if not id then return nil end
    if citizenIds[id] then return citizenIds[id] end

    local ok, info = pcall(function()
        local src = exports['ai-core']:GetSourceByCharId(id)
        return src and exports['ai-core']:GetCharacter(src) or nil
    end)
    if ok and type(info) == 'table' and type(info.citizenid) == 'string' then
        remember(info.citizenid, id)
        return info.citizenid
    end

    local character = characterById(id)
    return character and character.info.citizenid or nil
end

---The stored or loaded character behind a citizenid (see characterById), nil when unknown.
---@param citizenid any
---@return table|nil
function aicore.character(citizenid)
    local id = aicore.charId(citizenid)
    return id and characterById(id) or nil
end

---The stored or loaded character behind each citizenid (see characterById), all asked at once.
---@param cids any[]
---@return table<string, table> characters by citizenid; unknown ones are left out
function aicore.characters(cids)
    local asks = {}
    for i = 1, #cids do
        local cid = asCitizenId(cids[i])
        local id = cid and not asks[cid] and aicore.charId(cid)
        if id then asks[cid] = start('ai-core', 'GetOfflineCharacter', table.pack(id)) end
    end

    local out = {}
    for cid, p in pairs(asks) do
        local character = Citizen.Await(p)
        if type(character) == 'table' and type(character.info) == 'table' then out[cid] = character end
    end
    return out
end

---"First Last" from a character info table, nil when both are blank.
---@param info any
---@return string|nil
local function nameOf(info)
    if type(info) ~= 'table' then return nil end
    local name = ('%s %s'):format(info.firstname or '', info.lastname or ''):gsub('^%s+', ''):gsub('%s+$', '')
    return name ~= '' and name or nil
end

---@type table<string, { name: string, at: integer }> citizenid -> its character's name.
local names = {}

---A loaded character's name, answered from ai-core's memory without waiting. Nil when the
---citizenid is not loaded.
---@param cid string
---@return string|nil
local function loadedName(cid)
    local ok, info = pcall(function()
        local src = exports['ai-core']:GetSourceByCitizenId(cid)
        return src and exports['ai-core']:GetCharacter(src) or nil
    end)
    return ok and nameOf(info) or nil
end

---The character's "First Last" behind each citizenid, read from ai-core: loaded characters from
---memory, the rest through GetOfflineCharacter, all asked at once. Missing ones are left out.
---@param cids any[]
---@return table<string, string> names
function aicore.names(cids)
    local out, pending = {}, {}
    local now = GetGameTimer()

    for i = 1, #cids do
        local cid = asCitizenId(cids[i])
        if cid and not out[cid] then
            local hit = names[cid]
            local name = (hit and now - hit.at < NAME_TTL_MS) and hit.name or loadedName(cid)
            if name then
                out[cid] = name
                names[cid] = { name = name, at = now }
            else
                pending[#pending + 1] = cid
            end
        end
    end

    for cid, character in pairs(aicore.characters(pending)) do
        local name = nameOf(character.info)
        if name then
            out[cid] = name
            names[cid] = { name = name, at = now }
        end
    end
    return out
end

---One citizenid's character name, nil when unknown.
---@param citizenid any
---@return string|nil
function aicore.name(citizenid)
    local cid = asCitizenId(citizenid)
    return cid and aicore.names({ cid })[cid] or nil
end

---Characters matching a typed text through SearchCharacters (first / last name prefixes,
---citizenid, account ids), walking its pages until `want` are found. Each row is `{ charId,
---citizenid, firstname, lastname, source }`.
---@param text string
---@param want integer rows wanted at most
---@return table[] characters
---@return boolean more true when AI Core holds further matches
function aicore.search(text, want)
    local out, cursor = {}, nil
    for _ = 1, MAX_PAGES do
        local page = aicore.await('SearchCharacters', text, aicore.ANSWER, cursor)
        if type(page) ~= 'table' or type(page.characters) ~= 'table' then break end

        for _, c in ipairs(page.characters) do
            if #out >= want then return out, true end
            remember(c.citizenid, c.charId)
            out[#out + 1] = c
        end

        cursor = page.next
        if cursor == nil then return out, false end
    end
    return out, cursor ~= nil
end

---Every holder of a job, loaded or not, through GetJobMembers. Each row is `{ charId, citizenid,
---firstname, lastname, grade, source }`; a loaded member's grade comes from memory.
---@param job string
---@return table[] members
function aicore.jobMembers(job)
    local out, after = {}, nil
    for _ = 1, MAX_PAGES do
        local page = aicore.await('GetJobMembers', job, aicore.ANSWER, after, MEMBERS_PAGE)
        if type(page) ~= 'table' or type(page.members) ~= 'table' then break end

        for _, m in ipairs(page.members) do
            remember(m.citizenid, m.charId)
            out[#out + 1] = m
        end

        after = page.next
        if after == nil then break end
    end
    return out
end

---The ai-vehicles owner key for a citizenid's character, nil when unknown.
---@param citizenid any
---@return { type: string, id: integer }|nil
function aicore.vehicleOwner(citizenid)
    local id = aicore.charId(citizenid)
    return id and { type = 'character', id = id } or nil
end

return aicore
