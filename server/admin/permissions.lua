---@type table Permissions module; the table returned at end of file.
local permissions = {}

-- Any of these aces grants panel access. Most servers put admins in the *principal*
-- `group.admin` without ever granting an ace of that name, so the literal 'group.admin' check
-- alone is not enough: /phoneadmin below is registered through ox_lib with
-- `restricted = 'group.admin'`, which makes ox_lib run `add_ace group.admin
-- command.phoneadmin allow` — members of the admin group then *inherit* that ace, and it is
-- what the callbacks check. 'sdphone.admin' stays as an explicit opt-in for phone-only staff
-- (`add_ace identifier.license:xxx sdphone.admin allow`).
---@type string[] Aces that grant phone-admin access, checked in order.
local ACES = {
    'sdphone.admin',       -- explicit per-player/per-group opt-in
    'command.phoneadmin',  -- inherited by group.admin via ox_lib's restricted command
    'group.admin',         -- setups that grant the group name as a literal ace
}

---Whether this player may use the phone admin panel. Console (source 0) is refused; every
---admin callback re-checks this server-side, so the client-side gate is cosmetic only.
---@param source integer player server id
---@return boolean
function permissions.isAllowed(source)
    if type(source) ~= 'number' or source <= 0 then return false end
    for _, ace in ipairs(ACES) do
        if IsPlayerAceAllowed(source, ace) then return true end
    end
    return false
end

return permissions
