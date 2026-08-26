---@type table Migration SQL (server.migrate.store): table probing for the presence check.
local store = require 'server.migrate.store'
---@type table Owner matching (server.migrate.identity): lb phone owner -> citizenid.
local identity = require 'server.migrate.identity'

---@type table lb-phone import source; the table returned at end of file. Describes where the rows
---come from, who owns them and which porters read them, so the runner never names lb-phone itself.
local source = {}

source.key = 'lbphone'
source.label = 'lb-phone'
source.title = 'lb-phone'
source.blurb = 'Import phone numbers, contacts, messages, photos, mail and app accounts from an lb-phone database.'

---@type string|nil Marker prefix. Nil rather than 'lbphone', because installs that migrated before
---a second source existed wrote their marks unprefixed, and re-running every domain on upgrade
---would be both slow and wrong.
source.markPrefix = nil

---@type { key: string, label: string, run: fun(ctx: table): table }[] Domains, in run order.
source.ports = {
    { key = 'numbers',    label = 'numbers',    run = require('server.migrate.port.numbers').run },
    { key = 'contacts',   label = 'contacts',   run = require('server.migrate.port.contacts').run },
    { key = 'blocked',    label = 'blocked',    run = require('server.migrate.port.blocked').run },
    { key = 'calls',      label = 'calls',      run = require('server.migrate.port.calls').run },
    { key = 'messages',   label = 'messages',   run = require('server.migrate.port.messages').run },
    -- After messages: joins on the `m<id>` mid values that porter writes.
    { key = 'reactions',  label = 'reactions',  run = require('server.migrate.port.reactions').run },
    { key = 'photos',     label = 'photos',     run = require('server.migrate.port.photos').run },
    { key = 'notes',      label = 'notes',      run = require('server.migrate.port.notes').run },
    { key = 'settings',   label = 'settings',   run = require('server.migrate.port.settings').run },
    { key = 'photogram',  label = 'photogram',  run = require('server.migrate.port.photogram').run },
    { key = 'birdy',      label = 'birdy',      run = require('server.migrate.port.birdy').run },
    { key = 'vibez',      label = 'clout',      run = require('server.migrate.port.vibez').run },
    { key = 'mail',       label = 'mail',       run = require('server.migrate.port.mail').run },
    { key = 'wallet',     label = 'wallet',     run = require('server.migrate.port.wallet').run },
    { key = 'voicememos', label = 'voicememos', run = require('server.migrate.port.voicememos').run },
    -- Last: links sessions to the accounts the photogram and Squawk porters created.
    { key = 'sessions',   label = 'sessions',   run = require('server.migrate.port.sessions').run },
}

---@type table<string, string> Domains that cannot land without another having run first.
source.requires = {
    reactions = 'messages',
    sessions  = 'photogram',
}

---@type string Whole-import marker written before domains were marked individually.
source.legacyMark = 'lbphone-import-v1'

---@type string[] Domains the legacy marker covered, backfilled so they are not re-run.
source.legacyDomains = {
    'numbers', 'contacts', 'blocked', 'calls', 'messages', 'photos', 'notes',
}

---@type table<string, string[]> Source tables per domain, for the scan's row counts.
source.domainSources = {
    numbers    = { 'phones' },
    contacts   = { 'phone_contacts' },
    blocked    = { 'phone_blocked_numbers' },
    calls      = { 'phone_calls' },
    messages   = { 'message_channels', 'message_members', 'message_messages' },
    reactions  = { 'message_reactions' },
    photos     = { 'photos', 'photo_albums', 'photo_album_photos' },
    notes      = { 'notes' },
    settings   = { 'phones' },
    photogram  = {
        'instagram_accounts', 'instagram_posts', 'instagram_comments', 'instagram_likes',
        'instagram_follows', 'instagram_follow_requests', 'instagram_stories',
        'instagram_stories_views', 'instagram_messages', 'instagram_notifications',
    },
    birdy      = {
        'twitter_accounts', 'twitter_tweets', 'twitter_likes', 'twitter_retweets',
        'twitter_follows', 'twitter_messages', 'twitter_notifications',
    },
    vibez      = {
        'tiktok_accounts', 'tiktok_videos', 'tiktok_comments', 'tiktok_likes', 'tiktok_saves',
        'tiktok_comments_likes', 'tiktok_follows', 'tiktok_notifications',
    },
    mail       = { 'phone_mail_accounts', 'phone_mails' },
    wallet     = { 'phone_transactions' },
    voicememos = { 'phone_notes_voice' },
    sessions   = { 'phone_last_phone' },
}

---Whether an lb-phone database is present to read from.
---@return boolean
function source.detect()
    return store.tableExists(store.lbTable('phones'))
end

---Counts the rows one domain would read.
---@param domain string domain key
---@return integer
function source.rowCount(domain)
    local tables = source.domainSources[domain]
    return tables and store.lbRowCount(tables) or 0
end

---Builds the owner context every porter receives.
---@param cfg table config.Migrate
---@param framework table framework detection
---@return table
function source.identity(cfg, framework)
    return identity.build(cfg, framework)
end

return source
