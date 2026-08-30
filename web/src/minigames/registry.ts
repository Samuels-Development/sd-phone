import type { ComponentType } from 'react';

import { Anagram } from './games/Anagram';
import { Bypass } from './games/Bypass';
import { Circuit } from './games/Circuit';
import { Decode } from './games/Decode';
import { Intrusion } from './games/Intrusion';
import { Lockpick } from './games/Lockpick';
import { Maze } from './games/Maze';
import { Memory } from './games/Memory';
import { Router } from './games/Router';
import { Sequencer } from './games/Sequencer';
import { Scanner } from './games/Scanner';
import { Simon } from './games/Simon';
import { Skillcheck } from './games/Skillcheck';
import { Sweep } from './games/Sweep';
import { Rewire } from './games/Rewire';
import { Sync } from './games/Sync';
import { Tune } from './games/Tune';
import { Varhack } from './games/Varhack';
import { Vent } from './games/Vent';
import { Wires } from './games/Wires';
import type { GameProps } from './data';

export const MINIGAMES: Record<string, ComponentType<GameProps>> = {
    anagram:    Anagram,
    bypass:    Bypass,
    circuit:   Circuit,
    decode:    Decode,
    intrusion: Intrusion,
    lockpick:  Lockpick,
    maze:      Maze,
    memory:    Memory,
    rewire:    Rewire,
    router:    Router,
    sequencer: Sequencer,
    scanner:   Scanner,
    simon:     Simon,
    skillcheck: Skillcheck,
    sweep:     Sweep,
    sync:      Sync,
    tune:      Tune,
    varhack:   Varhack,
    vent:      Vent,
    wires:     Wires,
};
