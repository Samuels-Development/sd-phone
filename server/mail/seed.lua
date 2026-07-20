---@type table Player bridge (bridge.server.player): citizenid lookup for the calling admin.
local player  = require 'bridge.server.player'
---@type table Mail persistence layer (server.mail.store): resolves the caller's signed-in accounts.
local store   = require 'server.mail.store'
---@type table Authoritative mail handlers (server.mail.actions): systemSend routes seeds through
---the real persistence + banner + badge path.
local actions = require 'server.mail.actions'
---@type table Photos persistence layer (server.photos.store): the caller's real photo URLs.
local photoStore = require 'server.photos.store'
---@type table Voice memo persistence layer (server.voicememos.store): the caller's real recordings.
local memoStore = require 'server.voicememos.store'

---@type { name: string, email: string }[] Rotating sender identities for seeded mail.
local SENDERS = {
    { name = 'Fleeca Bank',        email = 'statements@fleeca.ls' },
    { name = 'LifeInvader',        email = 'no-reply@lifeinvader.ls' },
    { name = 'Los Santos Customs', email = 'service@lscustoms.ls' },
    { name = 'Diamond Casino',     email = 'offers@diamond.ls' },
    { name = 'City of Los Santos', email = 'notices@lossantos.gov' },
    { name = 'Ron Jakowski',       email = 'ron@ronsravingblog.ls' },
    { name = 'Bishops Chicken',    email = 'deals@bishops.ls' },
    { name = 'Premium Deluxe',     email = 'simeon@premiumdeluxe.ls' },
}

---@type string[] Subject pool, mixed lengths to exercise list truncation.
local SUBJECTS = {
    'Your monthly statement is ready',
    'Security alert: new sign-in to your account',
    'Vehicle service reminder',
    'You have won a free spin!',
    'Parking citation notice #%04d',
    'RE: that thing we talked about',
    'Limited offer: 2-for-1 family bucket this weekend only',
    'Action required: confirm your contact details before the end of the month',
    'Hey',
}

---@type string[] Body pool: one-liners through multi-paragraph, for detail-view testing.
local BODIES = {
    'Just checking in. Reply when you can.',
    'Your statement for this period is attached to your online banking profile.\n\nIf you did not expect this email, please contact your nearest branch.',
    'We detected a sign-in from a new device in Los Santos.\n\nIf this was you, no action is needed. If not, change your password immediately from the app.\n\nStay safe,\nThe security team',
    'Your vehicle is due for its scheduled service. Book a slot at any of our garages and mention this email for 10% off labour.\n\nLos Santos Customs - performance you can trust.',
    'Congratulations! You have been selected for a complimentary spin on the Lucky Wheel.\n\nVisit the casino floor and speak to a host to claim. Offer valid for 7 days.\n\nTerms apply. Please gamble responsibly.',
    'This is a notice regarding a citation issued to a vehicle registered in your name. Payment is due within 14 days.\n\nFailure to pay may result in additional penalties. Pay online or at City Hall.\n\nCity of Los Santos\nDepartment of Parking Enforcement',
    'Listen, I have been thinking about the numbers again and I am telling you, the desert is the future. Real estate out there is dirt cheap and dirt is exactly what people want these days.\n\nCall me. Do not text, call. This is a call conversation.\n\nRon',
    'This weekend only: bring a friend and split a family bucket for the price of a solo meal.\n\nNo coupon needed, just walk in hungry.',
}

---@type string[] Stand-in photo URLs (docs.fivem.net vehicle renders) when the caller has none.
local FALLBACK_PHOTOS = {
    'https://docs.fivem.net/vehicles/adder.webp',
    'https://docs.fivem.net/vehicles/sultan.webp',
    'https://docs.fivem.net/vehicles/banshee.webp',
    'https://docs.fivem.net/vehicles/dominator.webp',
}

---@type { title: string, body: string }[] Fabricated note snapshots for note attachments.
local NOTE_SNAPSHOTS = {
    { title = 'Shopping list', body = 'Shopping list\n- Eggs\n- Coffee\n- Engine oil\n- Duct tape (a lot)' },
    { title = 'Meeting notes', body = 'Meeting notes\nTalked to S about the warehouse lease. He wants 15k up front, non-negotiable.\nCounter with 12k and the promise of repeat business.\nFollow up Thursday.' },
    { title = 'Ideas', body = 'Ideas\n1. Food truck by the pier\n2. Detailing service, mobile\n3. That thing R mentioned, look into permits first' },
}

---Rolls the attachment set for one seeded mail: nil most of the time, otherwise 1-3 entries
---mixed from the caller's real photos/memos and fabricated note snapshots.
---@param photos string[] photo URLs available to attach
---@param memos table[] memo rows { name, url, duration } available to attach
---@return table[]|nil
local function rollAttachments(photos, memos)
    if math.random() > 0.4 then return nil end
    local out = {}
    for _ = 1, math.random(1, 3) do
        local roll = math.random(3)
        if roll == 1 and #photos > 0 then
            out[#out + 1] = { kind = 'photo', url = photos[math.random(#photos)] }
        elseif roll == 2 and #memos > 0 then
            local m = memos[math.random(#memos)]
            out[#out + 1] = { kind = 'audio', url = m.url, name = m.name, duration = tonumber(m.duration) or 0 }
        else
            local n = NOTE_SNAPSHOTS[math.random(#NOTE_SNAPSHOTS)]
            out[#out + 1] = { kind = 'note', title = n.title, body = n.body }
        end
    end
    return out
end

---/mailseed [count] (admin-only, in-game): sends count test emails to every mail account the
---caller is signed into, through the real send path (persistence, banner, badge, live insert).
---Roughly 40% of seeds carry 1-3 attachments mixed from the caller's real photos and voice
---memos (fallback stock photos when the library is empty) plus fabricated note snapshots.
lib.addCommand('mailseed', {
    help = 'Mail: send yourself a batch of test emails (needs a signed-in mail account)',
    restricted = 'group.admin',
    params = {
        { name = 'count', type = 'number', help = 'How many emails (default 10, max 50)', optional = true },
    },
}, function(source, args)
    if source <= 0 then
        print('[sd-phone:mail] /mailseed must be run in-game (it targets your own accounts)')
        return
    end
    local cid = player.getIdentifier(source)
    if not cid then return end
    local accounts = store.listAccountsForCitizen(cid)
    if #accounts == 0 then
        TriggerClientEvent('sd-phone:client:notify', source, {
            app = 'mail', appId = 'mail', title = 'Mail',
            body = 'Sign in to a mail account first, then run /mailseed again.', time = 'now',
        })
        return
    end

    local photos = {}
    local photoRows = photoStore.listForCitizen(cid)
    for i = 1, math.min(#photoRows, 6) do photos[#photos + 1] = photoRows[i].url end
    if #photos == 0 then photos = FALLBACK_PHOTOS end
    local memos = memoStore.recent(cid, 10)

    local n = math.min(50, math.max(1, math.floor(tonumber(args and args.count) or 10)))
    local sent, withAtt = 0, 0
    for i = 1, n do
        local acc     = accounts[((i - 1) % #accounts) + 1]
        local sender  = SENDERS[math.random(#SENDERS)]
        local subject = SUBJECTS[math.random(#SUBJECTS)]
        if subject:find('%%04d') then subject = subject:format(math.random(0, 9999)) end
        local attachments = rollAttachments(photos, memos)
        local result = actions.systemSend({
            to          = { acc.email },
            from        = sender,
            subject     = subject,
            body        = BODIES[math.random(#BODIES)],
            attachments = attachments,
        })
        if result.success then
            sent = sent + 1
            if attachments then withAtt = withAtt + 1 end
        end
        Wait(150)
    end

    print(('^2[sd-phone:mail]^0 seeded %d test email%s (%d with attachments) across %d account%s')
        :format(sent, sent == 1 and '' or 's', withAtt, #accounts, #accounts == 1 and '' or 's'))
end)
