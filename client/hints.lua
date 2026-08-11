---@type table sd-phone config root (configs/config.lua).
local config = require 'configs.config'

---@type table Module table; the table returned at end of file.
local hints = {}

---@type table<string, boolean> Corners the hint list may sit in.
local CORNERS <const> = {
    ['top-right'] = true, ['top-left'] = true, ['bottom-right'] = true, ['bottom-left'] = true,
}

---The on-screen keybind hints, normalised so the page never has to defend against a typo in
---configs/phone.lua. Shared by every surface that can hand the mouse to the game, so the camera
---viewfinder and a FaceTime call place their hints the same way and one config key moves both.
---@return { enabled: boolean, corner: string, columns: integer }
function hints.config()
    local cfg    = config.Phone.CameraHints or {}
    local corner = cfg.Corner
    return {
        enabled = cfg.Enabled ~= false,
        corner  = CORNERS[corner] and corner or 'top-right',
        columns = cfg.Columns == 1 and 1 or 2,
    }
end

return hints
