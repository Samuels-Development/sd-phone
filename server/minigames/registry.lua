---@type table Anagram, the scrambled word (server.minigames.games.anagram).
local anagram = require 'server.minigames.games.anagram'
---@type table Bypass, the keypad code cracker (server.minigames.games.bypass).
local bypass = require 'server.minigames.games.bypass'
---@type table Circuit, the logic board (server.minigames.games.circuit).
local circuit = require 'server.minigames.games.circuit'
---@type table Decode, the cipher key (server.minigames.games.decode).
local decode = require 'server.minigames.games.decode'
---@type table Intrusion, the honeypot network (server.minigames.games.intrusion).
local intrusion = require 'server.minigames.games.intrusion'
---@type table Lockpick, the barrel and its pins (server.minigames.games.lockpick).
local lockpick = require 'server.minigames.games.lockpick'
---@type table Maze, the fog-of-war labyrinth (server.minigames.games.maze).
local maze = require 'server.minigames.games.maze'
---@type table Memory, the light-up tile grid (server.minigames.games.memory).
local memory = require 'server.minigames.games.memory'
---@type table Router, the packet maze (server.minigames.games.router).
local router = require 'server.minigames.games.router'
---@type table Sequencer, the ordered exploit (server.minigames.games.sequencer).
local sequencer = require 'server.minigames.games.sequencer'
---@type table Scanner, the signature lineup (server.minigames.games.scanner).
local scanner = require 'server.minigames.games.scanner'
---@type table Simon, the played-back sequence (server.minigames.games.simon).
local simon = require 'server.minigames.games.simon'
---@type table Skill check, the rotating dial (server.minigames.games.skillcheck).
local skillcheck = require 'server.minigames.games.skillcheck'
---@type table Sweep, the hidden node hunt (server.minigames.games.sweep).
local sweep = require 'server.minigames.games.sweep'
---@type table Rewire, the junction box (server.minigames.games.rewire).
local rewire = require 'server.minigames.games.rewire'
---@type table Sync, the sweeping window (server.minigames.games.sync).
local sync = require 'server.minigames.games.sync'
---@type table Var hack, the register pull (server.minigames.games.varhack).
local varhack = require 'server.minigames.games.varhack'
---@type table Wires, the live wire (server.minigames.games.wires).
local wires = require 'server.minigames.games.wires'
---@type table Tune, the hidden frequency (server.minigames.games.tune).
local tune = require 'server.minigames.games.tune'
---@type table Vent, the pressure gauge (server.minigames.games.vent).
local vent = require 'server.minigames.games.vent'

---@type table<string, table> Game id -> its module. A new game is one require and one line here.
local registry = {
    anagram    = anagram,
    bypass    = bypass,
    circuit   = circuit,
    decode    = decode,
    intrusion = intrusion,
    lockpick   = lockpick,
    maze      = maze,
    memory    = memory,
    router    = router,
    sequencer = sequencer,
    scanner    = scanner,
    simon      = simon,
    skillcheck = skillcheck,
    sweep     = sweep,
    rewire    = rewire,
    sync      = sync,
    tune      = tune,
    varhack    = varhack,
    vent      = vent,
    wires      = wires,
}

return registry
