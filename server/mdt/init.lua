---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot      = require 'server.boot'
---@type table sd-phone config root (configs/config.lua).
local config    = require 'configs.config'
---@type table Shared server helpers (server.util): the configs/apps.lua switch, cleanup hooks.
local util      = require 'server.util'

---@type table MDT persistence (server.mdt.store): schema bootstrap, profiles, shift sessions.
local store     = require 'server.mdt.store'
---@type table Shell handlers (server.mdt.actions): bootstrap and the Home dashboard.
local actions   = require 'server.mdt.actions'
---@type table Persons and vehicles (server.mdt.records).
local records   = require 'server.mdt.records'
---@type table Firearms registry (server.mdt.weapons): serials, owners and their registry state.
local weapons   = require 'server.mdt.weapons'
---@type table Bodycams and dashcams (server.mdt.cameras): the demand-gated live relay behind the
---Cameras section.
local cameras   = require 'server.mdt.cameras'
---@type table Fixed CCTV cameras (server.mdt.cctv): the police-only gate on looking through one.
local cctv      = require 'server.mdt.cctv'
---@type table Bodycam recordings (server.mdt.recordings): what a terminal watched and kept.
local recordings = require 'server.mdt.recordings'
---@type table Reports and cases (server.mdt.paperwork).
local paperwork = require 'server.mdt.paperwork'
---@type table Warrants (server.mdt.warrants).
local warrants  = require 'server.mdt.warrants'
---@type table Penal code (server.mdt.offences).
local offences  = require 'server.mdt.offences'
---@type table Booking and sentencing (server.mdt.jail).
local jail      = require 'server.mdt.jail'
---@type table Department personnel (server.mdt.roster).
local roster    = require 'server.mdt.roster'
---@type table CAD (server.mdt.dispatch): in-memory units and calls.
local dispatch  = require 'server.mdt.dispatch'
---@type table Dispatch ingest (bridge.server.dispatch): the quarantined path onto the call board,
---behind the mdtMirrorCall export below. Already loaded by bridge/server/init.lua, so this resolves
---the cached module rather than registering a second set of handlers.
local ingest    = require 'bridge.server.dispatch'
---@type table Department channel (server.mdt.chat).
local chat      = require 'server.mdt.chat'
---@type table Bulletin board (server.mdt.bulletins).
local bulletins = require 'server.mdt.bulletins'
---@type table Audit viewer (server.mdt.logs).
local logs      = require 'server.mdt.logs'
---@type table Patients and medical files (server.mdt.medical): the medical terminal's person half.
local medical   = require 'server.mdt.medical'
---@type table Treatment protocols (server.mdt.protocols): the medical counterpart of the penal code.
local protocols = require 'server.mdt.protocols'
---@type table Handset forensics (server.mdt.phone): a read of one citizen's phone for the police terminal.
local handset   = require 'server.mdt.phone'
---@type table Standing orders (server.mdt.sops): the SOP set a terminal publishes, from config.
local sops      = require 'server.mdt.sops'
---@type table Internal Affairs (server.mdt.affairs): complaints against officers, police terminal only.
local affairs   = require 'server.mdt.affairs'
---@type table Docket and expungements (server.mdt.court): the court terminal's paperwork.
local court     = require 'server.mdt.court'

---@type table MDT config (configs/mdt.lua): the enable switch and the dispatch sweep interval.
local MDT = config.Mdt

---@type boolean Whether this server runs a terminal at all (configs/mdt.lua Enabled). Kept apart
---from configs/apps.lua because that decides which icons a device shows, not whether the backend
---exists: a companion device carries its own catalog and this server never reads it.
local ENABLED = MDT.Enabled == true

---@type integer Seconds between expiry sweeps of the in-memory call board.
local SWEEP_SECONDS = math.max(5, math.floor(tonumber((MDT.Dispatch or {}).SweepSeconds) or 15))

---@type boolean Whether the terminals are built and answering. Set once the schema is up.
local available = false

if ENABLED then
    CreateThread(function()
        local ok, err = pcall(store.ensureSchema)
        if not ok then
            boot.schemaFailed('mdt', err)
            return
        end
        available = true
        boot.schemaReady()
    end)
end

---@type { [1]: string, [2]: table, [3]: string }[] NUI action suffix -> owning module and the
---handler on it. Every handler is already wrapped in access.gated / access.audited by its own
---module, so nothing here decides policy.
local ROUTES = {
    { 'bootstrap',           actions,   'bootstrap' },
    { 'home',                actions,   'home' },

    { 'dispatch:state',      dispatch,  'state' },
    { 'dispatch:setStatus',  dispatch,  'setStatus' },
    { 'dispatch:attach',     dispatch,  'attach' },
    { 'dispatch:detach',     dispatch,  'detach' },
    { 'dispatch:locate',     dispatch,  'locate' },

    { 'persons:search',      records,   'personsSearch' },
    { 'persons:get',         records,   'personsGet' },
    { 'persons:notes',       records,   'personsNotes' },
    { 'persons:flags',       records,   'personsFlags' },
    { 'persons:mugshot',     records,   'personsMugshot' },

    { 'vehicles:search',     records,   'vehiclesSearch' },
    { 'vehicles:get',        records,   'vehiclesGet' },
    { 'vehicles:update',     records,   'vehiclesUpdate' },

    { 'weapons:search',      weapons,   'search' },
    { 'weapons:get',         weapons,   'get' },
    { 'weapons:create',      weapons,   'create' },
    { 'weapons:update',      weapons,   'update' },

    { 'cameras:list',        cameras,   'list' },
    { 'cameras:watch',       cameras,   'watch' },
    { 'cameras:unwatch',     cameras,   'unwatch' },
    { 'recordings:list',     recordings, 'list' },
    { 'recordings:delete',   recordings, 'delete' },
    { 'recordings:share',    recordings, 'share' },
    { 'cctv:watch',          cctv,      'watch' },

    { 'reports:list',        paperwork, 'reportsList' },
    { 'reports:get',         paperwork, 'reportsGet' },
    { 'reports:save',        paperwork, 'reportsSave' },
    { 'reports:delete',      paperwork, 'reportsDelete' },

    { 'cases:list',          paperwork, 'casesList' },
    { 'cases:get',           paperwork, 'casesGet' },
    { 'cases:save',          paperwork, 'casesSave' },
    { 'cases:delete',        paperwork, 'casesDelete' },
    { 'cases:note',          paperwork, 'casesNote' },
    { 'cases:assign',        paperwork, 'casesAssign' },
    { 'cases:linkReport',    paperwork, 'casesLinkReport' },

    { 'warrants:list',       warrants,  'list' },
    { 'warrants:get',        warrants,  'get' },
    { 'warrants:issue',      warrants,  'issue' },
    { 'warrants:close',      warrants,  'close' },
    { 'warrants:void',       warrants,  'void' },

    { 'offences:list',       offences,  'list' },

    { 'jail:list',           jail,      'list' },
    { 'jail:quote',          jail,      'quote' },
    { 'jail:book',           jail,      'book' },

    { 'roster:list',         roster,    'list' },
    { 'roster:setCallsign',  roster,    'setCallsign' },
    { 'roster:setRadio',     roster,    'setRadio' },
    { 'roster:setGrade',     roster,    'setGrade' },
    { 'roster:dismiss',      roster,    'dismiss' },
    { 'roster:page',         roster,    'page' },
    { 'me:update',           roster,    'meUpdate' },

    { 'chat:history',        chat,      'history' },
    { 'chat:send',           chat,      'send' },

    { 'bulletins:list',      bulletins, 'list' },
    { 'bulletins:save',      bulletins, 'save' },
    { 'bulletins:delete',    bulletins, 'delete' },

    { 'logs:list',           logs,      'list' },

    { 'patients:search',     medical,   'patientsSearch' },
    { 'patients:get',        medical,   'patientsGet' },
    { 'patients:update',     medical,   'patientsUpdate' },

    { 'protocols:list',      protocols, 'list' },
    { 'protocols:save',      protocols, 'save' },
    { 'protocols:delete',    protocols, 'delete' },

    { 'phone:summary',       handset,   'summary' },
    { 'phone:contacts',      handset,   'contacts' },
    { 'phone:calls',         handset,   'calls' },
    { 'phone:threads',       handset,   'threads' },
    { 'phone:thread',        handset,   'thread' },
    { 'phone:media',         handset,   'media' },
    { 'phone:notes',         handset,   'notes' },
    { 'phone:note',          handset,   'note' },
    { 'phone:accounts',      handset,   'accounts' },

    { 'sops:list',           sops,      'list' },

    { 'affairs:list',        affairs,   'list' },
    { 'affairs:get',         affairs,   'get' },
    { 'affairs:officer',     affairs,   'forOfficer' },
    { 'affairs:file',        affairs,   'file' },
    { 'affairs:update',      affairs,   'update' },
    { 'affairs:note',        affairs,   'note' },
    { 'affairs:close',       affairs,   'close' },

    { 'court:list',          court,     'list' },
    { 'court:get',           court,     'get' },
    { 'court:citizen',       court,     'forCitizen' },
    { 'court:file',          court,     'fileCase' },
    { 'court:manage',        court,     'manage' },
    { 'court:note',          court,     'note' },
    { 'court:rule',          court,     'rule' },

    { 'expunge:list',        court,     'petitions' },
    { 'expunge:file',        court,     'petition' },
    { 'expunge:rule',        court,     'rulePetition' },
}

---Registers one MDT callback under the app's 'sd-phone:server:mdt:' prefix, normalising a
---non-table payload at the boundary.
---@param action string callback name suffix
---@param fn fun(src: integer, payload: table): table
local function register(action, fn)
    lib.callback.register('sd-phone:server:mdt:' .. action, function(src, payload)
        if type(payload) ~= 'table' then payload = {} end
        return fn(src, payload)
    end)
end

---@type table Refusal answered while the terminal is switched off in the config.
local DISABLED = util.fail('mdt.thereNoTerminalNetwork', 'There is no terminal on this network')

---@type table Refusal answered while the tables are still being built, or after they failed to
---build. Worded as a retry because the first case clears itself a moment later.
local NOT_READY = util.fail('mdt.terminalStillStartingUp', 'The terminal is still starting up')

---@type boolean Whether the refusal hint has already been printed this session.
local hinted = false

---Answers one MDT callback while the terminal cannot serve, and says why once. Registering a
---refusal rather than nothing is the point of it: an unregistered callback never answers at all,
---so the terminal would sit on its loading screen forever instead of reaching its locked one.
---@return table envelope
local function refuse()
    if not hinted then
        hinted = true
        if not ENABLED then
            print('^3[sd-phone:mdt]^0 a device opened the MDT, but it is off (configs/mdt.lua Enabled = false)')
        else
            print('^3[sd-phone:mdt]^0 a device opened the MDT before its tables were ready, check for a schema error above')
        end
    end
    if ENABLED then return NOT_READY end
    return DISABLED
end

for i = 1, #ROUTES do
    local action, module, name = ROUTES[i][1], ROUTES[i][2], ROUTES[i][3]
    local fn = type(module) == 'table' and module[name] or nil
    if not ENABLED then
        register(action, refuse)
    elseif type(fn) == 'function' then
        -- Checked per call, not at load: the schema thread may not have finished when a callback
        -- registers, and a device can open the terminal inside that window.
        register(action, function(src, payload)

            if not available then return refuse() end
            return fn(src, payload)
        end)
    else
        print(('^1[sd-phone:mdt]^0 no handler for %s (expected %s on its module)'):format(action, name))
    end
end

if ENABLED then
    -- Call board expiry.
    CreateThread(function()
        while true do
            Wait(SWEEP_SECONDS * 1000)
            if available then
                local ok, err = pcall(dispatch.sweep)
                if not ok then print(('^1[sd-phone:mdt]^0 dispatch sweep failed: %s'):format(err)) end
            end
        end
    end)

    ---Closes a departing officer's shift row and drops their unit off the call board.
    util.onCleanup(function(src, citizenid)
        pcall(dispatch.drop, src)
        if citizenid then pcall(store.closeSession, citizenid) end
    end)

    ---Flushes every open shift on stop, so a restart cannot leave shifts that look like they ran
    ---for days. Guarded to this resource only.
    ---@param resource string name of the resource that stopped
    AddEventHandler('onResourceStop', function(resource)
        if resource ~= GetCurrentResourceName() then return end
        pcall(store.closeOpenSessions)
    end)
end

-- Every export stays registered with the terminal off, answering inertly. A caller that reaches for
-- a missing export errors where it stands, and a dispatch script has no business dying because
-- this server does not run an MDT.

---Pushes a call onto the CAD from another resource (exports['sd-phone']:mdtCreateCall). Bypasses
---the officer gate because the caller is a resource rather than a player, while keeping every
---clamp. This is the TRUSTED path: the call it files ranks and evicts exactly like one an officer
---raised, so it belongs to alerts a resource decides on by itself. Anything a client handed the
---caller goes through mdtMirrorCall instead. Returns the new call id, or nil when the payload was
---unusable.
---@param call table { code, type, priority, location, coords, suspect?, weapon?, ttl? }
---@return string|nil callId
exports('mdtCreateCall', function(call)
    if not ENABLED then return nil end
    return dispatch.createCall(call)
end)

---Mirrors a third-party dispatch alert onto the CAD (exports['sd-phone']:mdtMirrorCall), for the
---systems that publish alerts through an export instead of an event and so cannot be picked up
---automatically. Same payload shape as mdtCreateCall, and everything else is different: the call is
---marked as mirrored, so it holds the mirrored share of the board rather than the whole board, is
---the first thing evicted from it and can never be filed at priority 1, and it takes the ingest's
---rate limit and dedupe on the way in. That is what makes it safe for a snippet whose payload
---reached the server across a client, which is what every one of those systems hands an operator.
---@param call table { code, type, priority, location, coords, domain?, jobs?, suspect?, weapon? }
---@return boolean mirrored true when the alert reached at least one board
exports('mdtMirrorCall', function(call)
    if not ENABLED then return false end
    return ingest.mirrorCall(call)
end)

---Whether a citizen has an active warrant (exports['sd-phone']:mdtIsWanted). The cheap predicate
---plate readers and NPC patrols read.
---@param citizenid string
---@return boolean wanted
exports('mdtIsWanted', function(citizenid)
    if not ENABLED then return false end
    return warrants.isWanted(citizenid) == true
end)

---Files a firearm on the registry from outside the terminal
---(exports['sd-phone']:mdtRegisterWeapon). This is the hook a gun shop, crafting bench or admin
---script calls the moment it hands a weapon over, so the serial on the frame is on the registry
---before an officer ever runs it. Omit `serial` and one is minted and handed back.
---@param data table { serial?, name, class?, owner?, notes?, registeredBy? }
---@return string|false serial the serial it was filed under, false on refusal
---@return string? message refusal reason
exports('mdtRegisterWeapon', function(data)
    if not ENABLED then return false, 'The MDT is disabled' end
    local serial, refusal = weapons.register(data)
    return serial or false, refusal and refusal.message or nil
end)

---One registry record by serial (exports['sd-phone']:mdtGetWeapon).
---@param serial string
---@return table|nil weapon
exports('mdtGetWeapon', function(serial)
    if not ENABLED then return nil end
    return weapons.find(serial)
end)

---Every firearm registered to a citizen (exports['sd-phone']:mdtGetWeaponsByOwner).
---@param citizenid string
---@return table[] weapons
exports('mdtGetWeaponsByOwner', function(citizenid)
    if not ENABLED then return {} end
    return weapons.byOwner(citizenid)
end)

---Moves a firearm to another registry state (exports['sd-phone']:mdtSetWeaponStatus): the hook for
---the script that seized it into evidence, destroyed it, or logged it stolen.
---@param serial string
---@param status string 'registered' | 'stolen' | 'seized' | 'destroyed'
---@param byCitizenid? string who to record as having changed it
---@return boolean ok
---@return string? message refusal reason
exports('mdtSetWeaponStatus', function(serial, status, byCitizenid)
    if not ENABLED then return false, 'The MDT is disabled' end
    return weapons.setStatus(serial, status, byCitizenid)
end)
