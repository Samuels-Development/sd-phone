-- Online games (Chess, Connect Four, Battleship, Wordle). The server plays the referee: it holds
-- every board, checks every move and decides who wins, so these are only limits and clocks.
return {
    MaxWager = 50000,  -- largest stake one player can put up (the pot is twice this); 0 turns wagers off

    -- Seconds a player has for each move. Running out forfeits the game, and any wager, to the
    -- opponent.
    TurnSeconds = {
        chess       = 120,
        connectfour = 45,
        battleship  = 45,
    },

    -- Seconds to deploy before the first shot. A side still placing then forfeits; if neither
    -- side deployed, the wager is refunded.
    SetupSeconds = {
        battleship = 90,
    },

    -- Length of a race on one clock. Anyone still guessing when it runs out is out.
    MatchSeconds = {
        wordle = 120,
    },
}
