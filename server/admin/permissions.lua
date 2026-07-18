---@type table Permissions module; the table returned at end of file.
local permissions = {}

-- Either ace grants access: the dedicated one for phone-only staff, or the
-- blanket admin group the other sd-phone admin commands already use.
---@type string Dedicated ace permission for the phone admin panel.
local ACE_PHONE = 'sdphone.admin'
---@type string Blanket admin group ace (matches /wipemyphone & friends).
local ACE_GROUP = 'group.admin'

---Whether this player may use the phone admin panel. Console (source 0) is refused; every
---admin callback re-checks this server-side, so the client-side gate is cosmetic only.
---@param source integer player server id
---@return boolean
function permissions.isAllowed(source)
    if type(source) ~= 'number' or source <= 0 then return false end
    return IsPlayerAceAllowed(source, ACE_PHONE) or IsPlayerAceAllowed(source, ACE_GROUP)
end

return permissions
