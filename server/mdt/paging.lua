---@type table sd-phone config root (configs/config.lua); read for the paging bounds.
local config = require 'configs.config'
---@type table Shared server helpers (server.util): the finite-number check.
local util   = require 'server.util'

---@type integer Highest page a client may ask for.
local MAX_PAGE = math.floor(tonumber((config.Mdt.Paging or {}).MaxPage) or 400)

---@type table MDT paging helpers; the table returned at end of file.
local paging = {}

---Coerces a client page number to a whole page inside the served range.
---@param v any
---@return integer page 1..MAX_PAGE
function paging.pageOf(v)
    local n = tonumber(v)
    if not util.finite(n) or n ~= math.floor(n) or n < 1 then return 1 end
    return n > MAX_PAGE and MAX_PAGE or n
end

return paging
