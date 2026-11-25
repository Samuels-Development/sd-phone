---@type table Shared server helpers (server.util): ensureColumns, tableExists, ensureIndex.
local util = require 'server.util'

---@type table Migrations module; the table returned at end of file. The single place column
---back-fills live, so a store's ensureSchema states the table's CURRENT shape and nothing else.
---
---v0.9.0 was the first public release, so no install predates it: any column already declared in
---that release's CREATE TABLE exists on every database that has ever run sd-phone and needs no
---back-fill. Only columns added SINCE v0.9.0 appear here.
---
---Adding a column from now on: put it in the store's CREATE TABLE (so fresh installs get it) AND
---in the table below (so servers already running pick it up on their next boot). Nothing else.
local M = {}

---@type table<string, table<string, string>> table name -> column name -> full DDL fragment.
---The DDL is what follows ADD COLUMN, so it may carry defaults and AFTER clauses.
local COLUMNS = {
    phone_settings = {
        theme             = 'theme VARCHAR(8) NULL',
        dark_theme        = 'dark_theme VARCHAR(16) NULL',
        light_theme       = 'light_theme VARCHAR(16) NULL',
        accent            = 'accent VARCHAR(16) NULL',
        shell             = 'shell VARCHAR(16) NULL',
        game_time         = 'game_time TINYINT(1) NULL',
        caller_id         = 'caller_id TINYINT(1) NULL',
        streamer_mode     = 'streamer_mode TINYINT(1) NULL',
        streamer_hide     = 'streamer_hide VARCHAR(255) NULL',
        reopen_app        = 'reopen_app TINYINT(1) NULL',
        setup_done        = 'setup_done TINYINT(1) NULL',
        custom_wallpapers = 'custom_wallpapers TEXT NULL',
        wallpaper_home    = 'wallpaper_home VARCHAR(512) NULL',
        blur_lock         = 'blur_lock TINYINT(1) NULL',
        blur_home         = 'blur_home TINYINT(1) NULL',
        phone_scale       = 'phone_scale TINYINT UNSIGNED NULL',
        phone_align       = 'phone_align VARCHAR(16) NULL',
        phone_tilt        = 'phone_tilt VARCHAR(48) NULL',
        dock_style        = 'dock_style VARCHAR(12) NULL',
        open_anim         = 'open_anim VARCHAR(12) NULL',
        wallpaper_parallax = 'wallpaper_parallax TINYINT(1) NULL',
        brightness        = 'brightness TINYINT UNSIGNED NULL',
        icon_theme        = 'icon_theme VARCHAR(16) NULL',
        icon_custom       = 'icon_custom LONGTEXT NULL',
        palette_custom    = 'palette_custom LONGTEXT NULL',
        show_app_names    = 'show_app_names TINYINT(1) NOT NULL DEFAULT 1',
        island_pet        = 'island_pet VARCHAR(16) NULL',
        device            = "device VARCHAR(16) NOT NULL DEFAULT 'phone'",
        home_density      = 'home_density VARCHAR(12) NULL',
        home_icon_scale   = 'home_icon_scale SMALLINT NULL',
        dnd               = 'dnd TINYINT(1) NOT NULL DEFAULT 0',
        rotation_lock     = 'rotation_lock TINYINT(1) NOT NULL DEFAULT 0',
    },

    -- Verification tier shown next to a handle: blue (individual), gold (business), grey
    -- (government). NULL means the legacy plain blue tick, so existing rows keep their badge.
    phone_birdy_profiles = {
        verified_type = 'verified_type VARCHAR(8) NULL',
    },

    phone_documents = {
        signable  = '`signable` TINYINT(1) NOT NULL DEFAULT 1',
        deletable = '`deletable` TINYINT(1) NOT NULL DEFAULT 1',
    },

    phone_mail_saved_emails = {
        declined = 'declined TINYINT(1) NOT NULL DEFAULT 0',
    },

    -- Unread inbox mail per mailbox, kept beside the messages blob so a badge reads a number
    -- instead of decoding the blob. NULL means not counted yet; the mail store fills it in.
    phone_mail_accounts = {
        unread_inbox = 'unread_inbox INT NULL',
    },

    -- Which terminal filed the report. Defaulting to 'leo' is what keeps the back-fill safe: every
    -- row that predates the medical terminal was written by a police department, and the default
    -- states exactly that rather than leaving a NULL for the scoping clause to interpret.
    phone_mdt_reports = {
        domain   = "`domain` VARCHAR(8) NOT NULL DEFAULT 'leo' AFTER `department`",
        evidence = '`evidence` MEDIUMTEXT NULL AFTER `body`',
    },

    -- Evidence is a JSON array of { url, label } attached to the paperwork, held on the row
    -- rather than its own table: it is written and read whole, never queried across.
    phone_mdt_cases = {
        evidence = '`evidence` MEDIUMTEXT NULL AFTER `summary`',
    },

    -- A granted expungement hides a charge line from the priors sheet without deleting the row the
    -- report it was filed on still owns, so the paperwork stays whole and the record reads clean.
    phone_mdt_report_charges = {
        expunged = '`expunged` TINYINT(1) NOT NULL DEFAULT 0 AFTER `fine`',
    },

    -- Scheduled publishing: a row waits at status 'scheduled' carrying its publish_at stamp until
    -- the due sweep flips it live. Every row written before this existed is already live, which is
    -- exactly what the 'published' default states.
    marketplace_listings = {
        images     = '`images` TEXT NULL AFTER `image`',
        status     = "`status` VARCHAR(12) NOT NULL DEFAULT 'published'",
        publish_at = '`publish_at` BIGINT NULL',
    },

    -- The same scheduled-publishing pair on the noticeboard's posts.
    pages_posts = {
        images     = '`images` TEXT NULL AFTER `image`',
        status     = "`status` VARCHAR(12) NOT NULL DEFAULT 'published'",
        publish_at = '`publish_at` BIGINT NULL',
    },

    -- The same scheduled-publishing pair on the newsroom's articles.
    phone_weazel_articles = {
        status     = "`status` VARCHAR(12) NOT NULL DEFAULT 'published'",
        publish_at = '`publish_at` BIGINT NULL',
    },

    phone_sim_cards = {
        adopted_by = 'adopted_by VARCHAR(64) NULL',
    },

    phone_cloud_backups = {
        device_identity = 'device_identity VARCHAR(64) NULL',
        auto_sync       = 'auto_sync TINYINT(1) NOT NULL DEFAULT 1',
        synced_at       = 'synced_at BIGINT NULL',
    },
    -- The run's best lap and that lap's sector splits, so the HUD has something to show a live
    -- delta against. Rows written before these existed carry NULL and simply have no delta.
    phone_racing_results = {
        best_lap_ms = 'best_lap_ms INT NULL',
        sectors     = 'sectors VARCHAR(64) NULL',
    },

    -- Track approval workflow. publish_status tracks pending/published/rejected state.
    -- rejection_reason stores admin feedback when a track is rejected.
    phone_racing_tracks = {
        publish_status    = "publish_status VARCHAR(20) NOT NULL DEFAULT 'published'",
        rejection_reason  = 'rejection_reason TEXT NULL',
    },

    -- The milestone counter, kept per CHARACTER on the row of their real identity, so a streak
    -- run on a fresh SIM cannot pay the same milestones again. NULL reward_date means not counted
    -- yet, which the first post after the upgrade seeds from that phone's own streak.
    phone_streaks = {
        reward_streak = 'reward_streak INT NOT NULL DEFAULT 0',
        reward_date   = 'reward_date DATE NULL',
    },

    -- How many sketches a note holds and how big they are, so the list and the storage caps never
    -- read the sketches themselves. NULL marks a row written before these existed; the notes store
    -- measures those the first time their owner opens Notes.
    phone_notes = {
        sketch_count = '`sketch_count` SMALLINT UNSIGNED NULL',
        sketch_bytes = '`sketch_bytes` INT UNSIGNED NULL',
    },
}

---@type table<string, table<string, string>> table name -> index name -> column list incl. parens.
---Indexes added since v0.9.0, back-filled the same way. An index on a table its module owns is
---declared in that store's CREATE TABLE too, so fresh installs get it, and is applied by M.apply
---after COLUMNS, so it may cover a column that list adds. An index for a scan one module runs
---against a table another module owns is applied by the scanning module through M.applyIndexes.
local INDEXES = {
    -- The thread list's preview query filters each mailbox on withheld, groups it by conversation
    -- and reads created_at, direction and is_read; covering all of it keeps that one query off the
    -- table rows for a mailbox of any size.
    phone_messages = {
        idx_phone_messages_preview = '(citizenid, withheld, conversation, created_at, direction, is_read)',
    },

    -- Cloud backup (server/sim/backup.lua) reads, copies and clears every row of one identity in
    -- both, and neither table's keys lead with citizenid, so each of those statements read the
    -- whole table.
    phone_message_reactions = {
        idx_phone_message_reactions_cid = '(citizenid)',
    },
    phone_app_sessions = {
        idx_phone_app_sessions_cid = '(citizenid)',
    },
}

---Adds the catalogued lookup indexes to one table; a no-op for tables the catalog does not list.
---A table that does not exist yet is skipped rather than reported: on a fresh install its owner
---creates it on another boot thread, and an empty table needs no index before the next boot.
---@param tbl string table name
---@return integer added indexes created on this call
function M.applyIndexes(tbl)
    local defs = INDEXES[tbl]
    if not defs or not util.tableExists(tbl) then return 0 end
    local added = 0
    for name, ddl in pairs(defs) do
        if util.ensureIndex(tbl, name, ddl) then added = added + 1 end
    end
    return added
end

---Brings one table up to date: its missing columns in a single information_schema read and at
---most one ALTER, then any missing index. Called from the owning store's ensureSchema once the
---table and every column an index covers are known to exist - that keeps execution order correct
---without a central boot sequence.
---@param tbl string table name
---@return boolean added true when at least one column or index was created
function M.apply(tbl)
    local added = false
    local defs = COLUMNS[tbl]
    if defs then added = util.ensureColumns(tbl, defs) end
    for name, columns in pairs(INDEXES[tbl] or {}) do
        if util.ensureIndex(tbl, name, columns) then added = true end
    end
    return added
end

return M
