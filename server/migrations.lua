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
        reopen_app        = 'reopen_app TINYINT(1) NULL',
        setup_done        = 'setup_done TINYINT(1) NULL',
        custom_wallpapers = 'custom_wallpapers TEXT NULL',
        wallpaper_home    = 'wallpaper_home VARCHAR(512) NULL',
        blur_lock         = 'blur_lock TINYINT(1) NULL',
        blur_home         = 'blur_home TINYINT(1) NULL',
        phone_scale       = 'phone_scale TINYINT UNSIGNED NULL',
        phone_align       = 'phone_align VARCHAR(16) NULL',
        brightness        = 'brightness TINYINT UNSIGNED NULL',
        icon_theme        = 'icon_theme VARCHAR(16) NULL',
        icon_custom       = 'icon_custom LONGTEXT NULL',
        show_app_names    = 'show_app_names TINYINT(1) NULL',
    },

    phone_documents = {
        signable  = '`signable` TINYINT(1) NOT NULL DEFAULT 1',
        deletable = '`deletable` TINYINT(1) NOT NULL DEFAULT 1',
    },

    phone_mail_saved_emails = {
        declined = 'declined TINYINT(1) NOT NULL DEFAULT 0',
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
