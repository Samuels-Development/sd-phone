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

-- Tiers, weakest first. An action declares the tier it needs and the check passes when the
-- caller holds that tier's ace OR any of the blanket ACES above - so a server that has only
-- ever granted `group.admin` keeps every action it has today and nothing has to be re-granted.
-- Splitting them exists so a server CAN hand out reading without handing out wiping:
--   add_ace identifier.license:xxx sdphone.admin.view allow
---@type table<string, string> tier -> the ace that grants it on its own.
local TIER_ACE = {
    view      = 'sdphone.admin.view',
    moderate  = 'sdphone.admin.moderate',
    destroy   = 'sdphone.admin.destroy',
}

-- A tier also inherits everything weaker than it, so granting `moderate` implies `view`.
---@type table<string, string[]> tier -> tiers whose ace also satisfies it.
local IMPLIED_BY = {
    view     = { 'view', 'moderate', 'destroy' },
    moderate = { 'moderate', 'destroy' },
    destroy  = { 'destroy' },
}

---Whether this player may use the phone admin panel at all. Console (source 0) is refused; every
---admin callback re-checks this server-side, so the client-side gate is cosmetic only.
---@param source integer player server id
---@return boolean
function permissions.isAllowed(source)
    if type(source) ~= 'number' or source <= 0 then return false end
    for _, ace in ipairs(ACES) do
        if IsPlayerAceAllowed(source, ace) then return true end
    end
    for _, ace in pairs(TIER_ACE) do
        if IsPlayerAceAllowed(source, ace) then return true end
    end
    return false
end

---Whether this player may run an action of the given tier. A blanket admin ace satisfies every
---tier, which is what keeps existing setups working unchanged.
---@param source integer player server id
---@param tier string 'view' | 'moderate' | 'destroy'
---@return boolean
function permissions.allows(source, tier)
    if type(source) ~= 'number' or source <= 0 then return false end
    for _, ace in ipairs(ACES) do
        if IsPlayerAceAllowed(source, ace) then return true end
    end
    for _, name in ipairs(IMPLIED_BY[tier] or IMPLIED_BY.destroy) do
        if IsPlayerAceAllowed(source, TIER_ACE[name]) then return true end
    end
    return false
end

---The strongest tier this player holds, for the panel to grey out what they cannot run. Advisory
---only - every callback still re-checks.
---@param source integer player server id
---@return string|nil tier
function permissions.tierOf(source)
    if permissions.allows(source, 'destroy')  then return 'destroy' end
    if permissions.allows(source, 'moderate') then return 'moderate' end
    if permissions.allows(source, 'view')     then return 'view' end
    return nil
end

return permissions
