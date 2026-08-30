---@type table Shared server helpers (server.util): ensureColumns.
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

    marketplace_listings = {
        images = '`images` TEXT NULL AFTER `image`',
    },

    pages_posts = {
        images = '`images` TEXT NULL AFTER `image`',
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
}

---Brings one table up to date, in a single information_schema read and at most one ALTER. Called
---from the owning store's ensureSchema right after its CREATE TABLE, where the table is known to
---exist - that keeps execution order correct without a central boot sequence.
---@param tbl string table name
---@return boolean added true when at least one column was created
function M.apply(tbl)
    local defs = COLUMNS[tbl]
    if not defs then return false end
    return util.ensureColumns(tbl, defs)
end

return M
