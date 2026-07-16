---@type table Version module; the table returned at end of file. Compares the resource's
---`version` manifest metadata against the latest GitHub release and prints the verdict.
local version = {}

---Parse a version string into its numeric components. Tolerant of stray characters (a 'v1.2.3'
---tag or a suffixed build) - only the digit runs are extracted.
---@param raw string
---@return integer[] semver components, e.g. "1.2.3" -> {1, 2, 3}.
local function parse(raw)
    local parts = {}
    for part in raw:gmatch('%d+') do
        parts[#parts + 1] = tonumber(part)
    end
    return parts
end

---Per-component version comparison, missing components counting as 0 (so "1.2" == "1.2.0").
---Returns -1 / 0 / 1 like strcmp.
---@param a integer[]
---@param b integer[]
---@return -1|0|1
local function compare(a, b)
    for i = 1, math.max(#a, #b) do
        local av, bv = a[i] or 0, b[i] or 0
        if av < bv then return -1 end
        if av > bv then return  1 end
    end
    return 0
end

---Asynchronously check the resource's `version` metadata against the latest GitHub release on
---`repo` and print the verdict. Prereleases are skipped; read-only, no retries.
---@param repo string GitHub repo in `owner/name` form.
function version.check(repo)
    local resource = GetInvokingResource() or GetCurrentResourceName()
    local raw = GetResourceMetadata(resource, 'version', 0)
                or GetResourceMetadata(resource, 'Version', 0)

    local current = raw and raw:match('%d+%.%d+%.%d+')
    if not current then
        return print(('^1Unable to determine current resource version for ^2%s^1^0'):format(resource))
    end

    print(('^3Checking for updates for ^2%s^3...^0'):format(resource))

    SetTimeout(1000, function()
        local url = ('https://api.github.com/repos/%s/releases/latest'):format(repo)
        PerformHttpRequest(url, function(status, response)
            if status ~= 200 then
                return print(('^1Failed to fetch release info for ^2%s^1 (HTTP %s)^0'):format(resource, status))
            end

            local data = json.decode(response)
            if not data       then return print(('^1Failed to parse release info for ^2%s^1^0'):format(resource)) end
            if data.prerelease then return print(('^3Skipping prerelease for ^2%s^3^0'):format(resource)) end

            local latest = data.tag_name and data.tag_name:match('%d+%.%d+%.%d+')
            if not latest then
                return print(('^1Failed to parse latest version tag for ^2%s^1^0'):format(resource))
            end

            local diff = compare(parse(current), parse(latest))
            if diff == 0 then
                print(('^2%s ^3is up to date (^2%s^3)^0'):format(resource, current))
            elseif diff < 0 then
                local notes = data.body or 'No release notes available.'
                local msg   = notes:find('\n')
                    and 'Check release page or changelog for details.'
                    or  notes
                print(('^3An update is available for ^2%s^3 (current: ^2%s^3)\nLatest: ^2%s^3\nRelease Notes: ^7%s'):format(
                    resource, current, latest, msg))
            else
                print(('^2%s^3 has newer local version (^2%s^3) than latest public release (^2%s^3)^0'):format(
                    resource, current, latest))
            end
        end, 'GET', '')
    end)
end

return version
