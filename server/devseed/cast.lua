---@type table Account engine actions (server.accounts.actions): the shared createAccount path.
local acctActions = require 'server.accounts.actions'
---@type table Account engine persistence (server.accounts.store): account lookup, session and removal.
local acctStore   = require 'server.accounts.store'
---@type table Mail persistence (server.mail.store): the mailbox rows the cast's accounts recover to.
local mailStore   = require 'server.mail.store'
---@type table Birdy persistence (server.birdy.store): the profile row that sits beside a Birdy account.
local birdyStore  = require 'server.birdy.store'
---@type table Mail config (configs.mail): the address domain the cast's mailboxes use.
local mailCfg     = require 'configs.mail'

local cast = {}

---@type string Citizenid prefix every stand-in shares, so one LIKE finds and removes them all.
cast.PREFIX = 'DEVSEED'

---@type string Password every seeded account is created with; long enough to clear validPassword.
cast.PASSWORD = 'devseed1234'

---@type table[] The stand-ins seeded content is attributed to. `id` doubles as their citizenid.
cast.members = {
    { id = 'DEVSEED1', name = 'Marcus Delgado', handle = 'marcusd',  number = '2135550118', age = 31, gender = 'male' },
    { id = 'DEVSEED2', name = 'Lena Sokolova',  handle = 'lenas',    number = '2135550274', age = 27, gender = 'female' },
    { id = 'DEVSEED3', name = 'Dre Okafor',     handle = 'dreok',    number = '3105550391', age = 34, gender = 'male' },
    { id = 'DEVSEED4', name = 'Kayla Reyes',    handle = 'kaylar',   number = '2135550456', age = 24, gender = 'female' },
    { id = 'DEVSEED5', name = 'Yusuf Karim',    handle = 'yusufk',   number = '3105550513', age = 29, gender = 'male' },
    { id = 'DEVSEED6', name = 'Nina Kowalski',  handle = 'ninak',    number = '2135550682', age = 38, gender = 'female' },
}

---The cast member at `i`, wrapping round so a seeder can index past the end without checking.
---@param i integer any positive index
---@return table member
function cast.at(i)
    return cast.members[((i - 1) % #cast.members) + 1]
end

---A stand-in's mail address on the configured domain.
---@param member table cast member
---@return string email
function cast.email(member)
    return member.handle .. '@' .. mailCfg.Domain
end

---Creates the stand-in's mailbox if it is missing. Every other account app validates its
---recovery email against a real Mail account, so this has to exist before any of them.
---@param member table cast member
---@return string email
function cast.mailbox(member)
    local email = cast.email(member)
    if not mailStore.getAccount(email) then
        mailStore.insertAccount(email, mailStore.hashPassword(cast.PASSWORD), member.name, member.id)
    end
    return email
end

---Creates the stand-in's account in one account app through the engine's real createAccount
---path, so username, password and recovery-contact validation all run. Existing accounts are
---left alone and returned as-is, which is what makes a re-seed cheap.
---@param app string account app key ('photogram', 'vibez', 'cherry', 'birdy')
---@param member table cast member
---@return table|nil account the account row, nil when creation was refused
function cast.account(app, member)
    local existing = acctStore.getAccount(app, member.handle)
    if existing then return existing end

    local res = acctActions.createAccount(app, {
        username = member.handle,
        password = cast.PASSWORD,
        name     = member.name,
        email    = cast.mailbox(member),
    }, member.id)
    if not res.success then return nil end

    -- Birdy keeps a profile row of its own beside the account, and reads that rather than the
    -- account for everything the feed renders. An account without one is invisible in the app.
    if app == 'birdy' and not birdyStore.getProfileByHandle(member.handle) then
        birdyStore.insertAccount(member.handle, member.id, member.name,
            birdyStore.hashPassword(cast.PASSWORD), '', false, os.date('%B %Y'))
    end

    return res.data and res.data.account or nil
end

---Creates every stand-in's account in `app` and returns the handles that came back.
---@param app string account app key
---@return string[] handles
function cast.handlesFor(app)
    local handles = {}
    for i = 1, #cast.members do
        local member = cast.members[i]
        if cast.account(app, member) then handles[#handles + 1] = member.handle end
    end
    return handles
end

---Every stand-in's citizenid, for the seeders that key on characters rather than accounts.
---@return string[] ids
function cast.ids()
    local ids = {}
    for i = 1, #cast.members do ids[i] = cast.members[i].id end
    return ids
end

---Removes every account the cast owns across the account engine, Mail and Birdy. Content rows
---are cleaned up by their own app's seeder; this is only the identities behind them.
---@return integer removed accounts deleted
function cast.clear()
    local removed = 0
    for i = 1, #cast.members do
        local member = cast.members[i]
        for _, app in ipairs({ 'photogram', 'vibez', 'cherry', 'birdy' }) do
            local acc = acctStore.getAccount(app, member.handle)
            if acc then
                acctStore.deleteAccount(acc.id)
                removed = removed + 1
            end
        end
        mailStore.deleteAccount(cast.email(member))
    end
    MySQL.update.await('DELETE FROM phone_birdy_profiles WHERE citizenid LIKE ?', { cast.PREFIX .. '%' })
    return removed
end

return cast
