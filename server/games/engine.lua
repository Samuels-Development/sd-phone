---@type table Boot reporter (server.boot): one console summary instead of per-module prints.
local boot = require 'server.boot'

---@type table Player bridge (bridge.server.player): identity + display names from a server-trusted src.
local player  = require 'bridge.server.player'
---@type table Money bridge (bridge.server.money): framework-agnostic bank account read/credit/debit.
local money   = require 'bridge.server.money'
---@type table Banking actions (server.banking.actions): Wallet transaction log (log-only, moves no money).
local banking = require 'server.banking.actions'
---@type table Unified per-character game stats (server.games.stats): W/L/D + chip totals + boards.
local stats   = require 'server.games.stats'
---@type table Shared casino-chip wallet (server.games.chips): persistent per-character chip balance.
local chips   = require 'server.games.chips'

---@type table Online-game limits and clocks (configs/games.lua).
local gamesConfig = require 'configs.games'

---@type table Engine module; the table returned at end of file. Generalized online-game engine -
---lobbies, invites, sessions, wagers, and stats - shared by every online game. The server owns
---session lifecycle, turn order and, through each game's rules module, every board and every
---result; sessions are ephemeral, held in memory.
local engine = {}

---@type table<string, table> Registered game configs, game -> { sides = {sideA, sideB}, title, rules, currency? }.
local configs = {}

---@type table<string, table> Live sessions, gameId -> { game, rules, state, players = {[side]=src}, cids, names, turn, wager, pot, settled, ready, begun?, over?, drawOffer?, clock? }.
local games   = {}
---@type table<string, table> Lobbies, lobbyId -> { id, game, host, hostName, public, side, wager, members = {{src,name,ready?,readyWager?,returned?}}, gameId?, starting? }.
local lobbies = {}
---@type table<integer, string> src -> lobbyId they belong to (kept while in-game; the lobby survives for rematches).
local inLobby = {}
---@type table<integer, table> Pending invites, target src -> { lobbyId, fromName } (one at a time, last wins).
local invites = {}
---@type table<integer, string> src -> gameId of the session they're playing.
local inGame  = {}

---@type integer, integer Monotonic counters behind newId/newLobbyId.
local nextId, nextLobby = 0, 0

local util = require 'server.util'
local ok, fail = util.ok, util.fail
local function newId() return util.newId(7) end
---@return string lobbyId next sequential lobby id ('lb1', 'lb2', ...)
local function newLobbyId() nextLobby = nextLobby + 1 return ('lb%d'):format(nextLobby) end


---@return string display name for src (bridge already falls back to 'Unknown' when unresolvable)
local function nameOf(src) return player.getName(src) or ('Player ' .. tostring(src)) end
---@return boolean true when src maps to a connected player (GetPlayerName goes nil on disconnect)
local function online(src) return src and GetPlayerName(src) ~= nil end
---@return string|nil per-character identifier for a server-trusted src (nil when offline)
local function cidOf(src)   return player.getIdentifier(src) end
---@return string display title for a registered game (falls back to the raw game id)
local function titleOf(game) return (configs[game] and configs[game].title) or game end
---@return string wager currency for a game: 'chips' or the default 'bank'
local function currencyOf(game) return (configs[game] and configs[game].currency) or 'bank' end

local sanitizeWager = util.wholeAmount

---@type integer Largest stake one player may put up; 0 switches wagers off for every online game.
local MAX_WAGER = sanitizeWager(gamesConfig.MaxWager == nil and 50000 or gamesConfig.MaxWager)

---@type integer Extra time a timed race stays open past its clock, so a last guess still in
---flight when the client's countdown hits zero is not thrown away.
local LATE_MS = 3000

---Reads a per-game clock from configs/games.lua, floored at ten seconds so a typo there cannot
---forfeit games the moment they start.
---@param tbl any one of the config's per-game tables
---@param game string game id
---@param fallback integer seconds when the game has no entry
---@return integer seconds
local function secondsFor(tbl, game, fallback)
    local n = tonumber(type(tbl) == 'table' and tbl[game] or nil)
    if not n or n ~= n or n == math.huge then n = fallback end
    return math.max(10, math.floor(n))
end

---@type integer, integer, integer Budget for one move / setup payload: nodes walked, nesting depth
---and total string bytes. A battleship fleet (four ships with their cells) is the largest payload
---any shipped game sends, so this sits far above real play.
local PAYLOAD_NODES, PAYLOAD_DEPTH, PAYLOAD_BYTES = 512, 5, 4096

---@type integer, integer Rolling budget for move calls: every shipped game spends one per human
---action, so this cannot be reached by hand.
local RELAY_WINDOW, RELAY_MAX = 10000, 60

---@type integer, integer Walk accumulators, reset by boundedPayload. Safe as upvalues because the
---walk never yields.
local walkNodes, walkBytes = 0, 0

---Walks a client table against the shared node, depth and byte budget.
---@param tbl table
---@param depth integer current nesting level, 1 at the root
---@return boolean ok
local function walkPayload(tbl, depth)
    if depth > PAYLOAD_DEPTH then return false end
    for k, v in pairs(tbl) do
        walkNodes = walkNodes + 1
        if walkNodes > PAYLOAD_NODES then return false end
        if type(k) == 'string' then walkBytes = walkBytes + #k end
        local vt = type(v)
        if vt == 'table' then
            if not walkPayload(v, depth + 1) then return false end
        elseif vt == 'string' then
            walkBytes = walkBytes + #v
        elseif vt == 'function' or vt == 'thread' then
            return false
        end
        if walkBytes > PAYLOAD_BYTES then return false end
    end
    return true
end

---True when an opaque client payload is small enough to serialise on to the opponent. Only tables
---and strings can carry size, so everything else passes; a table is walked rather than encoded, so
---nesting can never blow the encoder's stack.
---@param v any raw client value
---@return boolean ok
local function boundedPayload(v)
    local t = type(v)
    if t == 'string' then return #v <= PAYLOAD_BYTES end
    if t == 'function' or t == 'thread' then return false end
    if t ~= 'table' then return true end
    walkNodes, walkBytes = 0, 0
    return walkPayload(v, 1)
end

---Read a player's balance in the game's wager currency: the shared casino chip wallet when the
---game sets currency = 'chips', bank cash otherwise. Read-only.
---@param src integer player server id
---@param game string game id
---@return number balance
local function wagerGet(src, game)
    if currencyOf(game) == 'chips' then return chips.get(cidOf(src)) end
    return money.get(src, 'bank')
end

---Debits a wager stake in the game's currency. The chips path is all-or-nothing; the bank path
---always reports success.
---@param src integer player server id
---@param game string game id
---@param amount integer stake to take
---@param reason string framework money-log reason
---@return boolean taken false when the chips debit could not cover the full stake
local function wagerTake(src, game, amount, reason)
    if currencyOf(game) == 'chips' then return chips.remove(cidOf(src), amount) ~= nil end
    money.remove(src, 'bank', amount, reason)
    return true
end

---Credit a wager payout / refund in the game's currency.
---@param src integer player server id
---@param game string game id
---@param amount integer amount to credit
---@param reason string framework money-log reason
local function wagerGive(src, game, amount, reason)
    if currencyOf(game) == 'chips' then chips.add(cidOf(src), amount)
    else money.add(src, 'bank', amount, reason) end
end

---An amount in the game's wager currency for player-facing text: '$50,000' or '50,000 chips'.
---@param game string game id
---@param n integer amount
---@return string label
local function amountLabel(game, n)
    local s, k = tostring(n), 0
    repeat s, k = s:gsub('^(%d+)(%d%d%d)', '%1,%2') until k == 0
    return currencyOf(game) == 'chips' and (s .. ' chips') or ('$' .. s)
end

---Checks a stake against the configured cap. Returns a failure envelope to send back, or nil when
---the stake is allowed.
---@param game string game id
---@param wager integer sanitized stake
---@return table|nil failure
local function wagerRefusal(game, wager)
    if wager <= 0 then return nil end
    if MAX_WAGER <= 0 then return fail('games.wagersOff', 'Wagers are turned off on this server') end
    if wager > MAX_WAGER then
        return fail('games.wagerTooHigh', 'Wagers are capped at {max}', { max = amountLabel(game, MAX_WAGER) })
    end
    return nil
end

---@return boolean true when src is already in a lobby or a game (one at a time)
local function busy(src) return inLobby[src] ~= nil or inGame[src] ~= nil end

---The (single) non-host member of a lobby, or nil while the seat is open.
---@param lobby table lobby record
---@return table|nil member { src, name, ready?, returned? }
local function lobbyOpponent(lobby)
    for _, m in ipairs(lobby.members) do if m.src ~= lobby.host then return m end end
    return nil
end

---@return table|nil sides the registered side pair for a game
local function sidesOf(game) return configs[game] and configs[game].sides end

---The opposing side label for a game.
---@param game string game id
---@param side string one of the game's two sides
---@return string other side
local function otherSide(game, side)
    local s = sidesOf(game)
    if not s then return side end
    return side == s[1] and s[2] or s[1]
end

---The side src is playing in a session; nil when they're not a participant.
---@param g table session record
---@param src integer player server id
---@return string|nil side
local function sideOf(g, src)
    for side, psrc in pairs(g.players) do if psrc == src then return side end end
    return nil
end

---The opposing player's src in a session (nil when src isn't a participant).
---@param g table session record
---@param src integer player server id
---@return integer|nil opponent src
local function opponentOf(g, src)
    local side = sideOf(g, src)
    return side and g.players[otherSide(g.game, side)] or nil
end

---Push a UI event to a client through the shared games relay. The client fans it out to NUI
---action `<game>:<action>` (e.g. chess:lobby, connectfour:start). No-op for offline srcs.
---@param src integer player server id
---@param game string game id
---@param action string relay action name
---@param data? table payload
local function pushClient(src, game, action, data)
    if online(src) then
        TriggerClientEvent('sd-phone:client:games', src, { game = game, action = action, data = data or {} })
    end
end

---Push a chip-currency player's updated wallet balance to their client.
---@param src integer player server id
---@param game string game id
local function pushChips(src, game) pushClient(src, game, 'chips', { chips = chips.get(cidOf(src)) }) end

---Logs a wager money movement to a player's Wallet (banking app), tagged with the game.
---Log-only; moves no money.
---@param src integer player server id
---@param game string game id
---@param label string transaction label prefix
---@param amount integer signed amount: -wager / +pot / +refund
---@param oppName string opponent display name
local function logBankTx(src, game, label, amount, oppName)
    local cid = cidOf(src)
    if not cid then return end
    banking.addExternal(cid, { label = ('%s vs %s'):format(label, oppName), amount = amount, category = game })
end

---True when a lobby member has readied up for the stake the lobby holds now. A ready given for a
---different stake does not count, so a host cannot raise the wager under an opponent who agreed
---to a smaller one.
---@param lobby table lobby record
---@param m table member
---@return boolean
local function readyForWager(lobby, m)
    return m.ready == true and m.readyWager == (lobby.wager or 0)
end

---Per-viewer snapshot of a lobby for the room UI. Each member carries canAfford / ready /
---returned flags; canStart requires a full lobby with everyone affording, readied and returned.
---@param lobby table lobby record
---@param viewer integer src the snapshot is for
---@return table state { id, host, public, wager, maxWager, isHost, canStart, members }
local function lobbyState(lobby, viewer)
    local wager = lobby.wager or 0
    local members, allAfford, oppReady, allReturned = {}, true, false, true
    for i, m in ipairs(lobby.members) do
        local isHost = m.src == lobby.host
        local side
        if isHost then side = lobby.side
        elseif lobby.side == 'random' then side = 'random'
        else side = otherSide(lobby.game, lobby.side) end
        local canAfford = wager <= 0 or wagerGet(m.src, lobby.game) >= wager
        if not canAfford then allAfford = false end
        local ready = isHost or readyForWager(lobby, m)
        if not isHost then oppReady = ready end
        local returned = m.returned ~= false
        if not returned then allReturned = false end
        members[i] = { name = m.name, you = m.src == viewer, host = isHost, color = side, canAfford = canAfford, ready = ready, returned = returned }
    end
    return {
        id = lobby.id, host = lobby.hostName, public = lobby.public, wager = wager, maxWager = MAX_WAGER,
        isHost = lobby.host == viewer, canStart = lobby.host == viewer and #lobby.members >= 2 and allAfford and oppReady and allReturned,
        members = members,
    }
end

---Push each member their own per-viewer snapshot of the lobby.
---@param lobby table lobby record
local function pushLobby(lobby)
    for _, m in ipairs(lobby.members) do pushClient(m.src, lobby.game, 'lobby', lobbyState(lobby, m.src)) end
end

---Settles a wagered session's pot exactly once. winnerSrc is paid the full pot; nil refunds both
---stakes.
---@param g table session record
---@param winnerSrc integer|nil winner src, nil to refund both
local function settlePot(g, winnerSrc)
    if not g or not g.wager or g.wager <= 0 or g.settled then return end
    g.settled = true
    local isChips = currencyOf(g.game) == 'chips'
    local s = sidesOf(g.game)
    local a, b = g.players[s[1]], g.players[s[2]]
    if winnerSrc then
        local loser = winnerSrc == a and b or a
        wagerGive(winnerSrc, g.game, g.pot, 'wager')
        if isChips then pushChips(winnerSrc, g.game)
        else logBankTx(winnerSrc, g.game, 'Winnings', g.pot, nameOf(loser)) end
        if online(winnerSrc) then
            local body = isChips and ('You won %d chips'):format(g.pot) or ('You won $%d'):format(g.pot)
            TriggerClientEvent('sd-phone:client:notify', winnerSrc, { app = g.game, appId = g.game, title = titleOf(g.game), body = body, time = 'now' })
        end
    else
        wagerGive(a, g.game, g.wager, 'wager-refund')
        wagerGive(b, g.game, g.wager, 'wager-refund')
        if isChips then pushChips(a, g.game); pushChips(b, g.game)
        else logBankTx(a, g.game, 'Refund', g.wager, nameOf(b)); logBankTx(b, g.game, 'Refund', g.wager, nameOf(a)) end
    end
end

---Frees a session and both players' in-game markers. Returns the removed record.
---@param gameId string session id
---@return table|nil g the removed session record (nil if already gone)
local function endGame(gameId)
    local g = games[gameId]
    if not g then return nil end
    games[gameId] = nil
    for _, src in pairs(g.players) do if inGame[src] == gameId then inGame[src] = nil end end
    return g
end

---@type table<string, boolean> Reasons a player has already left by the time the result lands.
local DEPARTED = { resign = true, left = true }

---Ends a live session with the server's verdict, exactly once: settles the pot, frees both players
---to start something else, then records the result on each player's stats and tells them. After a
---resign or a disconnect the one who left only gets their stats and the one still there gets
---'ended'; every other ending sends both players the full 'result'.
---@param gameId string session id
---@param g table session record
---@param winner string|nil winning side, nil for a draw (any wager is refunded)
---@param reason string 'win' | 'draw' | 'material' | 'agreed' | 'timeout' | 'time' | 'resign' | 'left'
local function conclude(gameId, g, winner, reason)
    if g.over then return end
    g.over = true
    g.clock = (g.clock or 0) + 1
    settlePot(g, winner and g.players[winner] or nil)
    for _, psrc in pairs(g.players) do if inGame[psrc] == gameId then inGame[psrc] = nil end end
    local reveal = g.rules.reveal and g.rules.reveal(g.state) or nil
    local gone = DEPARTED[reason] and winner and otherSide(g.game, winner) or nil
    local void = winner == nil and reason == 'timeout'
    CreateThread(function()
        for side, psrc in pairs(g.players) do
            local result = winner == nil and 'draw' or (side == winner and 'win' or 'loss')
            local s
            if not void and g.cids[side] then
                local good, row = pcall(stats.record, g.cids[side], g.game, 'online', result, g.names[side], 0)
                s = good and row or nil
            end
            if side == gone then
                pushClient(psrc, g.game, 'stats', { stats = s })
            elseif gone then
                pushClient(psrc, g.game, 'ended', { gameId = gameId, reason = reason, reveal = reveal, stats = s })
            else
                pushClient(psrc, g.game, 'result', { gameId = gameId, winner = winner, reason = reason, reveal = reveal, stats = s })
            end
        end
    end)
end

---Arms the one clock a session runs, replacing whichever ran before it. The callback only fires
---while the session is still live and nothing has re-armed the clock since.
---@param gameId string session id
---@param g table session record
---@param ms integer delay
---@param onExpire fun()
local function armClock(gameId, g, ms, onExpire)
    g.clock = (g.clock or 0) + 1
    local seq = g.clock
    SetTimeout(ms, function()
        if games[gameId] ~= g or g.over or g.clock ~= seq then return end
        onExpire()
    end)
end

---Starts the clock on the side to move; running it out forfeits to the other side.
---@param gameId string session id
---@param g table session record
local function armTurn(gameId, g)
    armClock(gameId, g, secondsFor(gamesConfig.TurnSeconds, g.game, 60) * 1000, function()
        conclude(gameId, g, otherSide(g.game, g.turn), 'timeout')
    end)
end

---Removes a player from whatever lobby they're in. A host leaving disbands the lobby, voids its
---invites and frees a finished session still parked on it; a non-host leaving frees the seat.
---@param src integer player server id
local function leaveLobbyOf(src)
    local id = inLobby[src]
    local lobby = id and lobbies[id]
    inLobby[src] = nil
    if not lobby then return end
    if lobby.host == src then
        lobbies[id] = nil
        local parked = lobby.gameId and games[lobby.gameId]
        if parked and parked.over then endGame(lobby.gameId) end
        for _, m in ipairs(lobby.members) do
            if m.src ~= src then
                inLobby[m.src] = nil
                pushClient(m.src, lobby.game, 'lobbyClosed', {})
            end
        end
        for tgt, inv in pairs(invites) do if inv.lobbyId == id then invites[tgt] = nil end end
    else
        for i, m in ipairs(lobby.members) do if m.src == src then table.remove(lobby.members, i) break end end
        pushLobby(lobby)
    end
end

---Drop every piece of engine state tied to src (pending invite + lobby membership).
---@param src integer player server id
local function clearInvolving(src)
    invites[src] = nil
    leaveLobbyOf(src)
end

---Creates a lobby (the host joins it). public = false makes it invite-only; the side choice is
---whitelisted against the game's registered sides and the wager is sanitized and capped.
lib.callback.register('sd-phone:server:games:createLobby', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local game = payload.game
    if not configs[game] then return fail('games.unknownGame', 'Unknown game') end
    if busy(src) then return fail('games.reAlreadyLobbyGame', "You're already in a lobby or game") end
    local sides = sidesOf(game)
    local side = payload.color
    if side ~= sides[1] and side ~= sides[2] then side = 'random' end
    local wager = sanitizeWager(payload.wager)
    local refused = wagerRefusal(game, wager)
    if refused then return refused end
    local id = newLobbyId()
    lobbies[id] = {
        id = id, game = game, host = src, hostName = nameOf(src),
        public = payload.public and true or false, side = side, wager = wager,
        members = { { src = src, name = nameOf(src), returned = true } },
    }
    inLobby[src] = id
    return ok(lobbyState(lobbies[id], src))
end)

---Public lobbies (for one game) with an open seat - the browse list. Read-only; exposes only
---host name, member count and wager.
lib.callback.register('sd-phone:server:games:lobbies', function(_src, payload)
    payload = type(payload) == 'table' and payload or {}
    local list = {}
    for _, lb in pairs(lobbies) do
        if lb.game == payload.game and lb.public and not lb.gameId and #lb.members < 2 then
            list[#list + 1] = { id = lb.id, host = lb.hostName, count = #lb.members, wager = lb.wager or 0 }
        end
    end
    return ok(list)
end)

---Joins a lobby (public, or one you were invited to). Refused while the lobby's session is live
---or mid-escrow, or when the lobby is full or private.
lib.callback.register('sd-phone:server:games:joinLobby', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    if busy(src) then return fail('games.reAlreadyLobbyGame', "You're already in a lobby or game") end
    local lobby = payload.id and lobbies[payload.id]
    if not lobby then return fail('games.lobbyNoLongerExists', 'That lobby no longer exists') end
    if lobby.gameId or lobby.starting then return fail('games.lobbyMidGame', 'That lobby is mid-game') end
    if #lobby.members >= 2 then return fail('games.lobbyFull', 'That lobby is full') end
    local invited = invites[src] and invites[src].lobbyId == lobby.id
    if not lobby.public and not invited then return fail('games.lobbyPrivate', 'That lobby is private') end
    invites[src] = nil
    lobby.members[#lobby.members + 1] = { src = src, name = nameOf(src), ready = false, returned = true }
    inLobby[src] = lobby.id
    pushLobby(lobby)
    return ok(lobbyState(lobby, src))
end)

---Re-surfaces a pending invite when the game app (re)mounts, scoped to the asking game. Read-only.
lib.callback.register('sd-phone:server:games:pending', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local inv = invites[src]
    local lobby = inv and lobbies[inv.lobbyId]
    if lobby and lobby.game == payload.game then
        return ok({ invite = { lobbyId = inv.lobbyId, fromName = inv.fromName } })
    end
    return ok({})
end)

---Invites a player (by server id) into the lobby you host. Host-only with an open seat; the
---target id is coerced to a positive integer.
lib.callback.register('sd-phone:server:games:inviteLobby', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local lobby = inLobby[src] and lobbies[inLobby[src]]
    if not lobby or lobby.host ~= src then return fail('games.reNotHostingLobby', "You're not hosting a lobby") end
    if #lobby.members >= 2 then return fail('games.lobbyFull2', 'Your lobby is full') end
    local target = tonumber(payload.target)
    if not target or target ~= target or target == math.huge then return fail('games.enterValidServerId', 'Enter a valid server ID') end
    target = math.floor(target)
    if target < 1 then return fail('games.enterValidServerId', 'Enter a valid server ID') end
    if target == src then return fail('games.canTInviteYourself', "You can't invite yourself") end
    if not online(target) then return fail('games.playerNotOnline', 'That player is not online') end
    if busy(target) then return fail('games.playerBusy', 'That player is busy') end
    -- Checked last so a mistyped server id never spends the budget, and gated on the TARGET as
    -- well as the host so colluding lobbies still cannot flood one player's notifications.
    if not util.cooldown(cidOf(src), 'games:invite', 3000) then return fail('games.slowDown', 'Slow down') end
    if not util.cooldown(cidOf(target), 'games:invited', 10000) then return fail('games.playerJustInvited', 'That player was just invited') end
    invites[target] = { lobbyId = lobby.id, fromName = lobby.hostName }
    pushClient(target, lobby.game, 'invited', { fromSrc = tostring(src), fromName = lobby.hostName, lobbyId = lobby.id })
    local title = titleOf(lobby.game)
    TriggerClientEvent('sd-phone:client:notify', target, {
        app = lobby.game, appId = lobby.game,
        titleKey = 'games.gameInvite', title = ('%s invite'):format(title),
        titleVars = { game = title },
        bodyKey = 'games.invitedToLobby', body = ('%s invited you to a %s lobby'):format(lobby.hostName, title),
        bodyVars = { name = lobby.hostName, game = title }, time = 'now',
    })
    return ok()
end)

---Declines (clears) your own pending invite.
lib.callback.register('sd-phone:server:games:declineInvite', function(src)
    invites[src] = nil
    return ok()
end)

---Leave whatever lobby you're in (host leaving disbands it - see leaveLobbyOf).
lib.callback.register('sd-phone:server:games:leaveLobby', function(src)
    leaveLobbyOf(src)
    return ok()
end)

---Host removes the (single) non-host member; the seat reopens for a new invite. Host-only, and
---refused while the session is live or mid-escrow.
lib.callback.register('sd-phone:server:games:kickMember', function(src)
    local lobby = inLobby[src] and lobbies[inLobby[src]]
    if not lobby or lobby.host ~= src then return fail('games.reNotHostingLobby', "You're not hosting a lobby") end
    if lobby.gameId or lobby.starting then return fail('games.gameProgress', 'The game is in progress') end
    for i = #lobby.members, 1, -1 do
        local m = lobby.members[i]
        if m.src ~= lobby.host then
            inLobby[m.src] = nil
            pushClient(m.src, lobby.game, 'lobbyClosed', {})
            if online(m.src) then
                TriggerClientEvent('sd-phone:client:notify', m.src, {
                    app = lobby.game, appId = lobby.game, title = titleOf(lobby.game),
                    bodyKey = 'games.removedFromLobby', body = 'You were removed from the lobby',
                    time = 'now',
                })
            end
            table.remove(lobby.members, i)
        end
    end
    pushLobby(lobby)
    return ok(lobbyState(lobby, src))
end)

---Host changes the wager while in-lobby; locked once the opponent has readied. The amount is
---sanitized and capped like createLobby's. A refusal still pushes the lobby, so a client that
---showed the new stake early snaps back to the real one.
lib.callback.register('sd-phone:server:games:setWager', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local lobby = inLobby[src] and lobbies[inLobby[src]]
    if not lobby or lobby.host ~= src then return fail('games.reNotHostingLobby', "You're not hosting a lobby") end
    local opp = lobbyOpponent(lobby)
    if opp and opp.ready then
        pushLobby(lobby)
        return fail('games.wagerLockedOpponentReady', 'Wager is locked, your opponent is ready')
    end
    local wager = sanitizeWager(payload.wager)
    local refused = wagerRefusal(lobby.game, wager)
    if refused then
        pushLobby(lobby)
        return refused
    end
    lobby.wager = wager
    pushLobby(lobby)
    return ok(lobbyState(lobby, src))
end)

---The joiner readies up or cancels. Only the non-host can ready, and a ready carries the stake the
---player was shown: if the host changed it in the meantime the player stays not ready and sees the
---new one. Readiness locks the wager and is required before the host may start.
lib.callback.register('sd-phone:server:games:setReady', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local lobby = inLobby[src] and lobbies[inLobby[src]]
    if not lobby then return fail('games.notLobby', 'Not in a lobby') end
    if lobby.host == src then return fail('games.hostSetsTerms', 'The host sets the terms') end
    local want = payload.ready and true or false
    local stale = want and sanitizeWager(payload.wager) ~= (lobby.wager or 0)
    for _, m in ipairs(lobby.members) do
        if m.src == src then
            m.ready = want and not stale
            m.readyWager = m.ready and (lobby.wager or 0) or nil
            break
        end
    end
    pushLobby(lobby)
    if stale then return fail('games.wagerChangedCheck', 'The wager changed. Check it and ready up again') end
    return ok(lobbyState(lobby, src))
end)

---Returns a player to the lobby for a rematch after a game end. The first returner frees the
---finished session and clears the opponent's ready; refused while the game is still being played.
lib.callback.register('sd-phone:server:games:returnToLobby', function(src)
    local lobby = inLobby[src] and lobbies[inLobby[src]]
    if not lobby then return fail('games.lobbyNoLongerExists2', 'Lobby no longer exists') end
    local gid = lobby.gameId
    if gid then
        local g = games[gid]
        if g and not g.over then return fail('games.gameProgress', 'The game is in progress') end
        if g then endGame(gid) end
        lobby.gameId = nil
        for _, m in ipairs(lobby.members) do
            if m.src ~= lobby.host then m.ready, m.readyWager = false, nil end
        end
    end
    for _, m in ipairs(lobby.members) do if m.src == src then m.returned = true break end end
    inGame[src] = nil
    pushLobby(lobby)
    return ok(lobbyState(lobby, src))
end)

---Starts whichever clock a fresh session opens with: the deployment clock for a game with a setup
---phase, the race clock for a timed game, otherwise the first player's turn clock.
---@param gameId string session id
---@param g table session record
local function armOpening(gameId, g)
    if g.rules.requiresSetup then
        armClock(gameId, g, secondsFor(gamesConfig.SetupSeconds, g.game, 90) * 1000, function()
            local s = sidesOf(g.game)
            local a, b = g.ready[s[1]], g.ready[s[2]]
            local winner = (a and not b) and s[1] or (b and not a) and s[2] or nil
            conclude(gameId, g, winner, 'timeout')
        end)
    elseif g.limitMs then
        armClock(gameId, g, g.limitMs + LATE_MS, function()
            local res = g.rules.expire(g.state)
            conclude(gameId, g, res.winner, res.reason)
        end)
    elseif g.rules.turnBased then
        armTurn(gameId, g)
    end
end

---Host starts the game with the joined, readied opponent. Escrows the wager from both wallets
---before the session exists; refused while a session is live or another start is mid-escrow, and
---when the opponent's ready was given for a different stake.
lib.callback.register('sd-phone:server:games:startLobby', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local lobby = payload.id and lobbies[payload.id]
    if not lobby or lobby.host ~= src then return fail('games.reNotHostingLobby2', "You're not hosting that lobby") end
    if lobby.gameId or lobby.starting then return fail('games.gameAlreadyProgress', 'A game is already in progress') end
    if #lobby.members < 2 then return fail('games.waitingOpponent', 'Waiting for an opponent') end
    local oppm = lobbyOpponent(lobby)
    if not oppm or not readyForWager(lobby, oppm) then return fail('games.waitingOpponentReadyUp', 'Waiting for your opponent to ready up') end

    local game  = lobby.game
    local sides = sidesOf(game)
    local rules = configs[game].rules
    local hostSrc, oppSrc = lobby.members[1].src, lobby.members[2].src

    local wager = lobby.wager or 0
    local refused = wagerRefusal(game, wager)
    if refused then return refused end

    lobby.starting = true
    if wager > 0 then
        if wagerGet(hostSrc, game) < wager then
            lobby.starting = nil
            return fail('games.canTCoverWager', 'You can’t cover the wager')
        end
        if wagerGet(oppSrc, game) < wager then
            lobby.starting = nil
            return fail('games.opponentCanTCoverWager', 'Your opponent can’t cover the wager')
        end
        if not wagerTake(hostSrc, game, wager, 'wager') then
            lobby.starting = nil
            return fail('games.canTCoverWager', 'You can’t cover the wager')
        end
        if not wagerTake(oppSrc, game, wager, 'wager') then
            wagerGive(hostSrc, game, wager, 'wager-refund')
            if currencyOf(game) == 'chips' then pushChips(hostSrc, game) end
            lobby.starting = nil
            return fail('games.opponentCanTCoverWager', 'Your opponent can’t cover the wager')
        end
        if currencyOf(game) == 'chips' then
            pushChips(hostSrc, game); pushChips(oppSrc, game)
        else
            logBankTx(hostSrc, game, 'Wager', -wager, nameOf(oppSrc))
            logBankTx(oppSrc,  game, 'Wager', -wager, nameOf(hostSrc))
        end
    end

    local hostSide = lobby.side
    if hostSide == 'random' then hostSide = (math.random(2) == 1) and sides[1] or sides[2] end
    local oppSide = otherSide(game, hostSide)

    local gameId = newId()
    local limitMs = rules.timed and secondsFor(gamesConfig.MatchSeconds, game, 120) * 1000 or nil
    local g = {
        game = game, rules = rules, turn = sides[1], wager = wager, pot = wager * 2,
        settled = wager == 0, ready = {}, limitMs = limitMs,
        players = { [hostSide] = hostSrc, [oppSide] = oppSrc },
        cids    = { [hostSide] = cidOf(hostSrc), [oppSide] = cidOf(oppSrc) },
        names   = { [hostSide] = nameOf(hostSrc), [oppSide] = nameOf(oppSrc) },
    }
    g.state = rules.new(sides, { now = GetGameTimer, random = math.random, limitMs = limitMs and limitMs + LATE_MS })
    games[gameId] = g
    lobby.gameId = gameId
    lobby.starting = nil
    for _, m in ipairs(lobby.members) do m.returned = false end
    inGame[hostSrc], inGame[oppSrc] = gameId, gameId
    armOpening(gameId, g)

    local turnSeconds  = rules.turnBased and secondsFor(gamesConfig.TurnSeconds, game, 60) or nil
    local setupSeconds = rules.requiresSetup and secondsFor(gamesConfig.SetupSeconds, game, 90) or nil
    local timeLimit    = limitMs and limitMs // 1000 or nil
    for side, psrc in pairs(g.players) do
        pushClient(psrc, game, 'start', {
            gameId = gameId, color = side, opponent = g.names[otherSide(game, side)], pot = wager * 2,
            turnSeconds = turnSeconds, setupSeconds = setupSeconds, timeLimit = timeLimit,
        })
    end
    return ok()
end)

---Takes this side's setup (battleship: its fleet) and checks it with the game's rules. Once BOTH
---sides are in, the first side's turn clock starts and 'begin' goes to both clients - the ONLY
---point from which moves are accepted in a `requiresSetup` game. Idempotent once accepted.
lib.callback.register('sd-phone:server:games:setupReady', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local gameId = payload.gameId
    local g = games[gameId]
    if not g or g.over then return fail('games.gameOver', 'Game over') end
    local mySide = sideOf(g, src)
    if not mySide then return fail('games.notGame', 'Not your game') end
    if not g.rules.requiresSetup or g.ready[mySide] then return ok() end
    if not boundedPayload(payload.fleet) then return fail('games.badFleet', 'That fleet is not valid') end
    local good, key, msg = g.rules.setup(g.state, mySide, payload.fleet)
    if not good then return fail(key, msg) end
    g.ready[mySide] = true

    local opp = opponentOf(g, src)
    if online(opp) then pushClient(opp, g.game, 'oppReady', { gameId = gameId }) end

    local sides = sidesOf(g.game)
    if not (g.ready[sides[1]] and g.ready[sides[2]]) then return ok() end

    g.begun = true
    g.turn = sides[1]
    armTurn(gameId, g)
    for _, side in ipairs(sides) do
        pushClient(g.players[side], g.game, 'begin', { gameId = gameId, turn = g.turn, you = side })
    end
    return ok()
end)

---Plays one move through the game's rules. Only a participant may move, in a turn-based game only
---on their own turn, and in a game with a setup phase only once both setups are in. The rules
---decide what each player is shown and whether the move ends the game; a refused move changes
---nothing and its reason goes back to the mover.
lib.callback.register('sd-phone:server:games:move', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local gameId = payload.gameId
    local g = games[gameId]
    if not g or g.over then return fail('games.gameOver', 'Game over') end
    local mySide = sideOf(g, src)
    if not mySide then return fail('games.notGame', 'Not your game') end
    if not boundedPayload(payload.move) then return fail('games.badMove', 'Bad move') end
    if not util.rateLimit(cidOf(src), 'games:relay', RELAY_WINDOW, RELAY_MAX) then return fail('games.slowDown', 'Slow down') end
    local rules = g.rules
    if rules.requiresSetup and not g.begun then return fail('games.opponentStillDeploying', 'Opponent is still deploying') end
    if rules.turnBased and g.turn ~= mySide then return fail('games.notTurn', 'Not your turn') end

    local res, key, msg = rules.move(g.state, mySide, payload.move)
    if not res then return fail(key, msg) end
    g.drawOffer = nil

    local opp = opponentOf(g, src)
    if res.mover then pushClient(src, g.game, 'move', { gameId = gameId, move = res.mover }) end
    if res.opponent and online(opp) then pushClient(opp, g.game, 'move', { gameId = gameId, move = res.opponent }) end
    if res.winner or res.draw then
        conclude(gameId, g, res.winner, res.reason or (res.winner and 'win' or 'draw'))
    elseif rules.turnBased then
        g.turn = otherSide(g.game, mySide)
        armTurn(gameId, g)
    end
    return ok()
end)

---Resign: forfeits a live game, and its pot, to the opponent and frees the session. On a game that
---is already over it only frees the session. A non-participant call is a no-op.
lib.callback.register('sd-phone:server:games:resign', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local gameId = payload.gameId
    local g = games[gameId]
    if not g then return ok() end
    local mySide = sideOf(g, src)
    if not mySide then return ok() end
    conclude(gameId, g, otherSide(g.game, mySide), 'resign')
    endGame(gameId)
    return ok()
end)

---A player disconnected: their live game is forfeited to the opponent, the session freed, and
---their invite / lobby membership dropped.
AddEventHandler('playerDropped', function()
    local src = source
    local gid = inGame[src]
    local g = gid and games[gid]
    if g then
        local mySide = sideOf(g, src)
        conclude(gid, g, mySide and otherSide(g.game, mySide) or nil, 'left')
        endGame(gid)
    end
    clearInvolving(src)
end)

---Frees a finished game. Only a participant may free it, and only once the server has decided it.
lib.callback.register('sd-phone:server:games:finish', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local g = games[payload.gameId]
    if not g or not g.over or not sideOf(g, src) then return ok() end
    endGame(payload.gameId)
    return ok()
end)

---Draw offers, the one outcome the players settle between them. An offer is passed to the
---opponent and stands until the next move; once both sides have offered, the game ends drawn and
---any wager is refunded. Every other result is the server's, so nothing else a client reports is
---read.
lib.callback.register('sd-phone:server:games:report', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local gameId = payload.gameId
    local g = games[gameId]
    if not g or g.over or payload.result ~= 'draw' then return ok() end
    local mySide = sideOf(g, src)
    if not mySide then return ok() end
    local oppSide = otherSide(g.game, mySide)
    if g.drawOffer == oppSide then
        conclude(gameId, g, nil, 'agreed')
    elseif g.drawOffer ~= mySide then
        g.drawOffer = mySide
        pushClient(g.players[oppSide], g.game, 'drawOffer', { gameId = gameId })
    end
    return ok()
end)

---Read the caller's own stats for one game (identity from source only). Read-only.
lib.callback.register('sd-phone:server:games:stats', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = cidOf(src)
    if not cid then return fail('games.playerNotFound', 'Player not found') end
    return ok(stats.statsFor(cid, payload.game))
end)

---Records a client-reported finished result on the caller's own row (validated and clamped in
---stats.record). Online results of engine games are written by the server when it decides them,
---so a client cannot add online wins of its own.
lib.callback.register('sd-phone:server:games:record', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = cidOf(src)
    if not cid then return fail('games.playerNotFound', 'Player not found') end
    if payload.mode == 'online' and configs[payload.game] then return fail('games.badResult', 'Bad result') end
    local s = stats.record(cid, payload.game, payload.mode, payload.result, nameOf(src), payload.amount)
    if not s then return fail('games.badResult', 'Bad result') end
    return ok(s)
end)

---Global leaderboards for a game. Read-only; exposes only display names and counts.
lib.callback.register('sd-phone:server:games:leaderboard', function(_src, payload)
    payload = type(payload) == 'table' and payload or {}
    return ok(stats.leaderboard(payload.game))
end)

---Submits a single-player high score on the caller's own row (validated and clamped in
---stats.submitScore). Returns { best, isRecord }.
lib.callback.register('sd-phone:server:games:submitScore', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = cidOf(src)
    if not cid then return fail('games.playerNotFound', 'Player not found') end
    local s = stats.submitScore(cid, payload.game, payload.score, nameOf(src))
    if not s then return fail('games.badScore', 'Bad score') end
    return ok(s)
end)

---Global high-score board for a game. Read-only; exposes only display names and scores.
lib.callback.register('sd-phone:server:games:scoreboard', function(_src, payload)
    payload = type(payload) == 'table' and payload or {}
    return ok(stats.scoreboard(payload.game))
end)

---Registers a game with the engine. cfg = { sides = {sideA, sideB}, title, rules, currency? };
---sides[1] moves first and currency = 'chips' settles wagers in chips. `rules` is the game's
---server referee (server/games/rules/*): new, move, and optionally setup, expire and reveal, plus
---the turnBased / requiresSetup / timed flags. A game without one would leave its winner to the
---clients, so it is refused.
---@param game string game id (matches the app id the web sends)
---@param cfg table game config
function engine.register(game, cfg)
    assert(type(cfg) == 'table' and type(cfg.rules) == 'table', ('games: %s registered without rules'):format(tostring(game)))
    configs[game] = cfg
end

-- One-shot boot thread: creates the shared stats schema.
CreateThread(function()
    local good, err = pcall(stats.ensureSchema)
    if good then boot.schemaReady() else boot.schemaFailed('games:stats', err) end
end)

return engine
