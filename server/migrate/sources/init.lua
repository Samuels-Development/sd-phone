---@type table lb-phone import source (server.migrate.sources.lbphone).
local lbphone = require 'server.migrate.sources.lbphone'
---@type table YSeries import source (server.migrate.sources.yseries).
local yseries = require 'server.migrate.sources.yseries'

---@type table Source registry; the table returned at end of file. Each entry describes one phone
---resource a server can arrive from, so the runner works against a source rather than against
---lb-phone by name.
local sources = {}

---@type table[] Every known source, in detection-preference order. lb-phone leads because it is the
---one an existing install may already have partly migrated.
local ALL = { lbphone, yseries }

sources.all = ALL

---One source by key, or nil when the key is unknown.
---@param key any
---@return table|nil
function sources.get(key)
    for i = 1, #ALL do
        if ALL[i].key == key then return ALL[i] end
    end
    return nil
end

---Every source whose tables are present in this database, cheapest-first. An install that arrived
---from one phone will match exactly one; a database carrying both is offered both.
---@return table[]
function sources.available()
    local out = {}
    for i = 1, #ALL do
        local ok, present = pcall(ALL[i].detect)
        if ok and present then out[#out + 1] = ALL[i] end
    end
    return out
end

---The source to work against when the caller named none: the first one actually present, else
---lb-phone so the panel still has something to describe.
---@param key any caller-supplied key, may be nil
---@return table
function sources.resolve(key)
    local named = key and sources.get(key)
    if named then return named end
    local present = sources.available()
    return present[1] or lbphone
end

---The marker name a domain is recorded under for a source. lb-phone keeps the unprefixed names it
---has always written, so an install that migrated before a second source existed is not asked to
---re-run every domain.
---@param source table
---@param domain string
---@return string
function sources.markFor(source, domain)
    if not source.markPrefix then return domain end
    return ('%s:%s'):format(source.markPrefix, domain)
end

---The domain key a marker name refers to, or nil when the marker belongs to another source.
---@param source table
---@param mark string
---@return string|nil
function sources.domainFor(source, mark)
    if not source.markPrefix then
        return (not mark:find(':', 1, true)) and mark or nil
    end
    local prefix = source.markPrefix .. ':'
    if mark:sub(1, #prefix) ~= prefix then return nil end
    return mark:sub(#prefix + 1)
end

return sources
