---@type table YSeries source reads (server.migrate.ystore): presence + row counts.
local ystore = require 'server.migrate.ystore'
---@type table YSeries owner matching (server.migrate.yidentity): imei -> character + number.
local yidentity = require 'server.migrate.yidentity'

---@type table YSeries import source; the table returned at end of file. Describes where the rows
---come from, who owns them and which porters read them, so the runner never names YSeries itself.
local source = {}

source.key = 'yseries'
source.label = 'YSeries'
source.title = 'YSeries'
source.blurb = 'Import phone numbers, contacts, call history, messages, photos, notes, wallet history and voice memos from a YSeries database.'

---@type string Marker prefix, so a server that migrated from lb-phone first does not read those
---marks as YSeries domains already done.
source.markPrefix = 'yseries'

---@type { key: string, label: string, run: fun(ctx: table): table }[] Domains, in run order.
---numbers runs first: every other porter attributes rows through the identity it adopts.
source.ports = {
    { key = 'numbers',    label = 'numbers',    run = require('server.migrate.port.y.numbers').run },
    { key = 'contacts',   label = 'contacts',   run = require('server.migrate.port.y.contacts').run },
    { key = 'blocked',    label = 'blocked',    run = require('server.migrate.port.y.blocked').run },
    { key = 'calls',      label = 'calls',      run = require('server.migrate.port.y.calls').run },
    { key = 'messages',   label = 'messages',   run = require('server.migrate.port.y.messages').run },
    { key = 'photos',     label = 'photos',     run = require('server.migrate.port.y.photos').run },
    { key = 'notes',      label = 'notes',      run = require('server.migrate.port.y.notes').run },
    { key = 'settings',   label = 'settings',   run = require('server.migrate.port.y.settings').run },
    { key = 'wallet',     label = 'wallet',     run = require('server.migrate.port.y.wallet').run },
    { key = 'voicememos', label = 'voicememos', run = require('server.migrate.port.y.voicememos').run },
}

---@type table<string, string> Domains that cannot land without another having run first. None yet:
---the YSeries porters each attribute through the identity map rather than through each other.
source.requires = {}

---@type string|nil No whole-import marker ever existed for YSeries, so nothing to backfill.
source.legacyMark = nil

---@type string[] Domains a legacy marker covered. Empty for the same reason.
source.legacyDomains = {}

---@type table<string, string[]> Source tables per domain, for the scan's row counts.
source.domainSources = {
    numbers    = { 'holders', 'sim_cards' },
    contacts   = { 'contacts' },
    blocked    = { 'blocked_numbers' },
    calls      = { 'recents' },
    messages   = { 'messages_channels', 'messages_members', 'messages_messages' },
    photos     = { 'gallery', 'gallery_albums' },
    notes      = { 'notes' },
    settings   = { 'settings' },
    wallet     = { 'banking_transactions' },
    voicememos = { 'voice_memos' },
}

---Whether a YSeries database is present to read from.
---@return boolean
function source.detect()
    return ystore.present()
end

---Counts the rows one domain would read.
---@param domain string domain key
---@return integer
function source.rowCount(domain)
    local tables = source.domainSources[domain]
    return tables and ystore.rowCount(tables) or 0
end

---Builds the owner context every porter receives.
---@param cfg table config.Migrate
---@param framework table framework detection
---@return table
function source.identity(cfg, framework)
    return yidentity.build(cfg, framework)
end

return source
