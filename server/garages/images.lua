---@type table Shared server helpers (server.util): ensureTable.
local util   = require 'server.util'
---@type table Photos persistence (server.photos.store): the ownership check for a picked URL.
local photos = require 'server.photos.store'

---@type integer Longest URL kept, matching phone_photos.url so anything the Photos app stored fits.
local MAX_URL = 512

---@type integer Longest plate kept. Every supported garage system stores 8 or fewer characters;
---the headroom covers systems that keep the trailing padding.
local MAX_PLATE = 16

local images = {}

---Creates phone_garage_images: one row per character and plate, holding the URL of the photo that
---character picked for that vehicle.
function images.ensureSchema()
    util.ensureTable('phone_garage_images', 'citizenid', [[
        CREATE TABLE IF NOT EXISTS phone_garage_images (
            citizenid  VARCHAR(64)  NOT NULL,
            plate      VARCHAR(16)  NOT NULL,
            url        VARCHAR(512) NOT NULL,
            updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (citizenid, plate)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ]])
end

---The plate as it is keyed: upper-cased with every space removed, so the same physical plate read
---from two garage systems with different padding lands on one row.
---@param plate any raw plate text
---@return string|nil key nil when the plate is not usable
function images.key(plate)
    if type(plate) ~= 'string' then return nil end
    local key = plate:upper():gsub('%s+', '')
    if key == '' or #key > MAX_PLATE then return nil end
    return key
end

---Every custom picture a character has set, keyed by plate.
---@param citizenid string framework per-character id
---@return table<string, string> byPlate plate key -> photo URL
function images.forCitizen(citizenid)
    local out = {}
    if not citizenid or citizenid == '' then return out end
    local rows = MySQL.query.await('SELECT plate, url FROM phone_garage_images WHERE citizenid = ?', { citizenid })
    for i = 1, #(rows or {}) do
        local row = rows[i]
        if type(row.plate) == 'string' and type(row.url) == 'string' then out[row.plate] = row.url end
    end
    return out
end

---Sets a vehicle's picture. The URL must already be one of the character's own Photos, so a
---player can only ever show something the phone itself uploaded for them.
---@param citizenid string framework per-character id
---@param plate string plate key from images.key
---@param url string photo URL
---@return boolean ok false when the URL is not one of the character's photos
function images.set(citizenid, plate, url)
    if type(url) ~= 'string' or url == '' or #url > MAX_URL then return false end
    if not photos.hasUrl(citizenid, url) then return false end
    MySQL.update.await([[
        INSERT INTO phone_garage_images (citizenid, plate, url) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE url = VALUES(url)
    ]], { citizenid, plate, url })
    return true
end

---Removes a vehicle's picture, so it falls back to the stock photo or the icon.
---@param citizenid string framework per-character id
---@param plate string plate key from images.key
function images.clear(citizenid, plate)
    MySQL.update.await('DELETE FROM phone_garage_images WHERE citizenid = ? AND plate = ?', { citizenid, plate })
end

return images
