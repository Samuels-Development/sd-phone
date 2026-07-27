---@type table Import planner (server.migrate.plan). Decides which domains run on this start, given
---what is already marked done and what the config disables.
local plan = {}

---Splits the porter list into the domains to run now, those already imported, and those turned off
---in the config. `force` ignores the completed set so every enabled domain runs again.
---@param ports { key: string, label: string }[] porters in run order
---@param done table<string, boolean> domain keys already imported
---@param domains table<string, boolean>|nil config.Migrate.domains
---@param force boolean|nil re-run domains already marked done
---@return { queue: table[], alreadyDone: string[], disabled: string[] }
function plan.build(ports, done, domains, force)
    local queue, alreadyDone, disabled = {}, {}, {}
    done = done or {}

    for _, port in ipairs(ports) do
        if domains and domains[port.key] == false then
            disabled[#disabled + 1] = port.key
        elseif not force and done[port.key] then
            alreadyDone[#alreadyDone + 1] = port.key
        else
            queue[#queue + 1] = port
        end
    end

    return { queue = queue, alreadyDone = alreadyDone, disabled = disabled }
end

return plan
