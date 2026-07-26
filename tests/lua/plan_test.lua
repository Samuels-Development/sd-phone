local H = require 'support.harness'

local plan = dofile('server/migrate/plan.lua')

local PORTS = {
    { key = 'numbers', label = 'numbers' }, { key = 'contacts', label = 'contacts' },
    { key = 'messages', label = 'messages' }, { key = 'settings', label = 'settings' },
    { key = 'photogram', label = 'photogram' }, { key = 'sessions', label = 'sessions' },
}

---Comma-joined keys of a queue, for readable assertions.
local function keys(queue)
    local out = {}
    for i, p in ipairs(queue) do out[i] = p.key end
    return table.concat(out, ',')
end

-- A fresh install has nothing marked done, so everything runs.
local fresh = plan.build(PORTS, {}, nil, false)
H.eq(keys(fresh.queue), 'numbers,contacts,messages,settings,photogram,sessions', 'fresh install runs all')
H.eq(#fresh.alreadyDone, 0, 'fresh install has nothing done')

-- The case this exists for: a server that already ran the original import must pick up only the
-- domains added since, not re-read millions of already-imported rows.
local upgraded = plan.build(PORTS, {
    numbers = true, contacts = true, messages = true,
}, nil, false)
H.eq(keys(upgraded.queue), 'settings,photogram,sessions', 'upgrade runs only the new domains')
H.eq(#upgraded.alreadyDone, 3, 'the original domains are reported as done')

-- Everything done is the steady state after a completed import.
local settled = plan.build(PORTS, {
    numbers = true, contacts = true, messages = true,
    settings = true, photogram = true, sessions = true,
}, nil, false)
H.eq(#settled.queue, 0, 'a fully imported server has nothing to do')

-- force re-runs everything regardless of markers.
local forced = plan.build(PORTS, { numbers = true, contacts = true }, nil, true)
H.eq(keys(forced.queue), 'numbers,contacts,messages,settings,photogram,sessions', 'force ignores markers')
H.eq(#forced.alreadyDone, 0, 'force reports nothing as already done')

-- A disabled domain never runs, even when it has no marker.
local off = plan.build(PORTS, {}, { photogram = false, sessions = false }, false)
H.eq(keys(off.queue), 'numbers,contacts,messages,settings', 'disabled domains are excluded')
H.eq(#off.disabled, 2, 'disabled domains are reported')

-- Disabled beats force: an operator turning a domain off should not be overridden by a manual run.
local offForced = plan.build(PORTS, {}, { photogram = false }, true)
H.eq(keys(offForced.queue), 'numbers,contacts,messages,settings,sessions', 'force does not re-enable a disabled domain')

-- Run order is preserved, which matters because reactions must follow messages and sessions is last.
local ordered = plan.build(PORTS, { numbers = true }, nil, false)
H.eq(keys(ordered.queue), 'contacts,messages,settings,photogram,sessions', 'order is preserved')

return true
