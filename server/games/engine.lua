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

---@type table Engine module; the table returned at end of file. Generalized online-game engine -
---lobbies, invites, session relay, wagers, and stats - shared by every online game. The server
---owns session lifecycle + turn order; sessions are ephemeral, held in memory.
local engine = {}

---@type table<string, table> Registered game configs, game -> { sides = {sideA, sideB}, title, currency?, freeRelay? }.
local configs = {}

---@type table<string, table> Live sessions, gameId -> { game, players = {[side]=src}, turn, wager, pot, settled, reports, deadline? }.
local games   = {}
---@type table<string, table> Lobbies, lobbyId -> { id, game, host, hostName, public, side, wager, members = {{src,name,ready?,returned?}}, gameId?, starting? }.
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

---Per-viewer snapshot of a lobby for the room UI. Each member carries canAfford / ready /
---returned flags; canStart requires a full lobby with everyone affording, readied and returned.
---@param lobby table lobby record
---@param viewer integer src the snapshot is for
---@return table state { id, host, public, wager, isHost, canStart, members }
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
        local ready = isHost or (m.ready == true)
        if not isHost then oppReady = ready end
        local returned = m.returned ~= false
        if not returned then allReturned = false end
        members[i] = { name = m.name, you = m.src == viewer, host = isHost, color = side, canAfford = canAfford, ready = ready, returned = returned }
    end
    return {
        id = lobby.id, host = lobby.hostName, public = lobby.public, wager = wager,
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

---Removes a player from whatever lobby they're in. A host leaving disbands the lobby and voids
---its invites; a non-host leaving frees the seat.
---@param src integer player server id
local function leaveLobbyOf(src)
    local id = inLobby[src]
    local lobby = id and lobbies[id]
    inLobby[src] = nil
    if not lobby then return end
    if lobby.host == src then
        lobbies[id] = nil
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

---Frees a session and both players' in-game markers. Returns the removed record.
---@param gameId string session id
---@return table|nil g the removed session record (nil if already gone)
local function endGame(gameId)
    local g = games[gameId]
    if not g then return nil end
    games[gameId] = nil
    for _, src in pairs(g.players) do inGame[src] = nil end
    return g
end

---Creates a lobby (the host joins it). public = false makes it invite-only; the side choice is
---whitelisted against the game's registered sides and the wager is sanitized.
lib.callback.register('sd-phone:server:games:createLobby', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local game = payload.game
    if not configs[game] then return fail('Unknown game') end
    if busy(src) then return fail("You're already in a lobby or game") end
    local sides = sidesOf(game)
    local side = payload.color
    if side ~= sides[1] and side ~= sides[2] then side = 'random' end
    local wager = sanitizeWager(payload.wager)
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
    if busy(src) then return fail("You're already in a lobby or game") end
    local lobby = payload.id and lobbies[payload.id]
    if not lobby then return fail('That lobby no longer exists') end
    if lobby.gameId or lobby.starting then return fail('That lobby is mid-game') end
    if #lobby.members >= 2 then return fail('That lobby is full') end
    local invited = invites[src] and invites[src].lobbyId == lobby.id
    if not lobby.public and not invited then return fail('That lobby is private') end
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
    if not lobby or lobby.host ~= src then return fail("You're not hosting a lobby") end
    if #lobby.members >= 2 then return fail('Your lobby is full') end
    local target = tonumber(payload.target)
    if not target or target ~= target or target == math.huge then return fail('Enter a valid server ID') end
    target = math.floor(target)
    if target < 1 then return fail('Enter a valid server ID') end
    if target == src then return fail("You can't invite yourself") end
    if not online(target) then return fail('That player is not online') end
    if busy(target) then return fail('That player is busy') end
    invites[target] = { lobbyId = lobby.id, fromName = lobby.hostName }
    pushClient(target, lobby.game, 'invited', { fromSrc = tostring(src), fromName = lobby.hostName, lobbyId = lobby.id })
    local title = titleOf(lobby.game)
    TriggerClientEvent('sd-phone:client:notify', target, {
        app = lobby.game, appId = lobby.game, title = title .. ' invite',
        body = ('%s invited you to a %s lobby'):format(lobby.hostName, title), time = 'now',
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
    if not lobby or lobby.host ~= src then return fail("You're not hosting a lobby") end
    if lobby.gameId or lobby.starting then return fail('The game is in progress') end
    for i = #lobby.members, 1, -1 do
        local m = lobby.members[i]
        if m.src ~= lobby.host then
            inLobby[m.src] = nil
            pushClient(m.src, lobby.game, 'lobbyClosed', {})
            if online(m.src) then
                TriggerClientEvent('sd-phone:client:notify', m.src, { app = lobby.game, appId = lobby.game, title = titleOf(lobby.game), body = 'You were removed from the lobby', time = 'now' })
            end
            table.remove(lobby.members, i)
        end
    end
    pushLobby(lobby)
    return ok(lobbyState(lobby, src))
end)

---Host changes the wager while in-lobby; locked once the opponent has readied. The amount is
---sanitized like createLobby's.
lib.callback.register('sd-phone:server:games:setWager', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local lobby = inLobby[src] and lobbies[inLobby[src]]
    if not lobby or lobby.host ~= src then return fail("You're not hosting a lobby") end
    local opp = lobbyOpponent(lobby)
    if opp and opp.ready then return fail('Wager is locked, your opponent is ready') end
    lobby.wager = sanitizeWager(payload.wager)
    pushLobby(lobby)
    return ok(lobbyState(lobby, src))
end)

---The joiner readies up or cancels. Only the non-host can ready; readiness locks the wager and
---is required before the host may start.
lib.callback.register('sd-phone:server:games:setReady', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local lobby = inLobby[src] and lobbies[inLobby[src]]
    if not lobby then return fail('Not in a lobby') end
    if lobby.host == src then return fail('The host sets the terms') end
    for _, m in ipairs(lobby.members) do
        if m.src == src then m.ready = payload.ready and true or false break end
    end
    pushLobby(lobby)
    return ok(lobbyState(lobby, src))
end)

---Returns a player to the lobby for a rematch after a natural game end. The first returner frees
---the finished session and clears the opponent's ready; refused while a pot is unsettled.
lib.callback.register('sd-phone:server:games:returnToLobby', function(src)
    local lobby = inLobby[src] and lobbies[inLobby[src]]
    if not lobby then return fail('Lobby no longer exists') end
    local gid = lobby.gameId
    if gid then
        local g = games[gid]
        if g and g.wager and g.wager > 0 and not g.settled then return fail('Settling the wager, one moment') end
        if g then endGame(gid) end
        lobby.gameId = nil
        for _, m in ipairs(lobby.members) do if m.src ~= lobby.host then m.ready = false end end
    end
    for _, m in ipairs(lobby.members) do if m.src == src then m.returned = true break end end
    inGame[src] = nil
    pushLobby(lobby)
    return ok(lobbyState(lobby, src))
end)

---Host starts the game with the joined, readied opponent. Escrows the wager from both wallets
---before the session exists; refused while a session is live or another start is mid-escrow.
lib.callback.register('sd-phone:server:games:startLobby', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local lobby = payload.id and lobbies[payload.id]
    if not lobby or lobby.host ~= src then return fail("You're not hosting that lobby") end
    if lobby.gameId or lobby.starting then return fail('A game is already in progress') end
    if #lobby.members < 2 then return fail('Waiting for an opponent') end
    local oppm = lobbyOpponent(lobby)
    if not oppm or not oppm.ready then return fail('Waiting for your opponent to ready up') end

    local game  = lobby.game
    local sides = sidesOf(game)
    local hostSrc, oppSrc = lobby.members[1].src, lobby.members[2].src

    lobby.starting = true
    local wager = lobby.wager or 0
    if wager > 0 then
        if wagerGet(hostSrc, game) < wager then
            lobby.starting = nil
            return fail('You can’t cover the wager')
        end
        if wagerGet(oppSrc, game) < wager then
            lobby.starting = nil
            return fail('Your opponent can’t cover the wager')
        end
        if not wagerTake(hostSrc, game, wager, 'wager') then
            lobby.starting = nil
            return fail('You can’t cover the wager')
        end
        if not wagerTake(oppSrc, game, wager, 'wager') then
            wagerGive(hostSrc, game, wager, 'wager-refund')
            if currencyOf(game) == 'chips' then pushChips(hostSrc, game) end
            lobby.starting = nil
            return fail('Your opponent can’t cover the wager')
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
    games[gameId] = {
        game = game, turn = sides[1], wager = wager, pot = wager * 2,
        settled = wager == 0, reports = {},
        players = { [hostSide] = hostSrc, [oppSide] = oppSrc },
    }
    lobby.gameId = gameId
    lobby.starting = nil
    for _, m in ipairs(lobby.members) do m.returned = false end
    inGame[hostSrc], inGame[oppSrc] = gameId, gameId

    pushClient(hostSrc, game, 'start', { gameId = gameId, color = hostSide, opponent = nameOf(oppSrc), pot = wager * 2 })
    pushClient(oppSrc,  game, 'start', { gameId = gameId, color = oppSide,  opponent = nameOf(hostSrc), pot = wager * 2 })
    return ok()
end)

---Relays an opaque move to the opponent. Only a session participant may move, and for turn-based
---games only on their own turn; freeRelay games forward moves without enforcing alternation.
lib.callback.register('sd-phone:server:games:move', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local g = games[payload.gameId]
    if not g then return fail('Game over') end
    local mySide = sideOf(g, src)
    if not mySide then return fail('Not your game') end
    if configs[g.game] and configs[g.game].freeRelay then
        local opp = opponentOf(g, src)
        if online(opp) then pushClient(opp, g.game, 'move', { gameId = payload.gameId, move = payload.move }) end
        return ok()
    end
    if g.turn ~= mySide then return fail('Not your turn') end

    g.turn = otherSide(g.game, mySide)
    local opp = g.players[g.turn]
    if online(opp) then pushClient(opp, g.game, 'move', { gameId = payload.gameId, move = payload.move }) end
    return ok()
end)

---Resign: forfeits the pot to the opponent and ends the session; a non-participant call is a
---no-op.
lib.callback.register('sd-phone:server:games:resign', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local g = games[payload.gameId]
    if not g then return ok() end
    local opp = opponentOf(g, src)
    if not opp then return ok() end
    settlePot(g, opp)
    endGame(payload.gameId)
    if online(opp) then pushClient(opp, g.game, 'ended', { reason = 'resign' }) end
    return ok()
end)

---A player disconnected: settles their live game as a forfeit to the opponent, frees the session,
---and drops their invite / lobby membership.
AddEventHandler('playerDropped', function()
    local src = source
    local gid = inGame[src]
    if gid then
        local g = games[gid]
        local opp = g and opponentOf(g, src)
        settlePot(g, opp)
        endGame(gid)
        if opp and g and online(opp) then pushClient(opp, g.game, 'ended', { reason = 'left' }) end
    end
    clearInvolving(src)
end)

---Frees a finished game (natural end). Only a participant may free it, and a wagered game stays
---until its pot settles.
lib.callback.register('sd-phone:server:games:finish', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local g = games[payload.gameId]
    if not g then return ok() end
    if not sideOf(g, src) then return ok() end
    if g.wager and g.wager > 0 and not g.settled then return ok() end
    endGame(payload.gameId)
    return ok()
end)

---Wagered-game outcome reports: a loss concession pays the opponent, agreed draws refund, and
---anything else arms a one-shot refund timeout. Non-participants are rejected.
lib.callback.register('sd-phone:server:games:report', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local g = games[payload.gameId]
    if not g or not g.wager or g.wager <= 0 or g.settled then return ok() end
    local opp = opponentOf(g, src)
    if not opp then return ok() end
    g.reports[src] = payload.result
    if payload.result == 'loss' then
        settlePot(g, opp); endGame(payload.gameId)
    elseif payload.result == 'draw' and g.reports[opp] == 'draw' then
        settlePot(g, nil); endGame(payload.gameId)
    elseif not g.deadline then
        g.deadline = true
        SetTimeout(30000, function()
            local gg = games[payload.gameId]
            if gg and not gg.settled then settlePot(gg, nil); endGame(payload.gameId) end
        end)
    end
    return ok()
end)

---Read the caller's own stats for one game (identity from source only). Read-only.
lib.callback.register('sd-phone:server:games:stats', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = cidOf(src)
    if not cid then return fail('Player not found') end
    return ok(stats.statsFor(cid, payload.game))
end)

---Records a client-reported finished result on the caller's own row (validated and clamped in
---stats.record).
lib.callback.register('sd-phone:server:games:record', function(src, payload)
    payload = type(payload) == 'table' and payload or {}
    local cid = cidOf(src)
    if not cid then return fail('Player not found') end
    local s = stats.record(cid, payload.game, payload.mode, payload.result, nameOf(src), payload.amount)
    if not s then return fail('Bad result') end
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
    if not cid then return fail('Player not found') end
    local s = stats.submitScore(cid, payload.game, payload.score, nameOf(src))
    if not s then return fail('Bad score') end
    return ok(s)
end)

---Global high-score board for a game. Read-only; exposes only display names and scores.
lib.callback.register('sd-phone:server:games:scoreboard', function(_src, payload)
    payload = type(payload) == 'table' and payload or {}
    return ok(stats.scoreboard(payload.game))
end)

---Registers a game with the engine. cfg = { sides = {sideA, sideB}, title, currency?, freeRelay? };
---sides[1] moves first, currency = 'chips' settles wagers in chips, freeRelay skips turn enforcement.
---@param game string game id (matches the app id the web sends)
---@param cfg table game config
function engine.register(game, cfg)
    configs[game] = cfg or {}
end

-- One-shot boot thread: creates the shared stats schema.
CreateThread(function()
    local good, err = pcall(stats.ensureSchema)
    if not good then print(('^1[sd-phone:games]^0 stats schema bootstrap failed: %s'):format(err)) end
end)

return engine
