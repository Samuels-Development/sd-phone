import type { JSX } from 'react';

import { t } from '@/i18n';

export type IslandPetId =
    | 'none' | 'cat' | 'dog' | 'fox' | 'bunny' | 'hamster' | 'hedgehog' | 'raccoon'
    | 'panda' | 'duck' | 'penguin' | 'owl' | 'frog' | 'turtle' | 'axolotl' | 'dragon'
    | 'capybara' | 'sloth' | 'koala' | 'deer' | 'crab'
    | 'octopus' | 'snail' | 'redpanda';

export type PetMood = 'idle' | 'resting' | 'sleepy' | 'happy' | 'dancing' | 'startled';

export const ISLAND_PETS: readonly IslandPetId[] = [
    'none', 'cat', 'dog', 'fox', 'bunny', 'hamster', 'hedgehog', 'raccoon',
    'panda', 'duck', 'penguin', 'owl', 'frog', 'turtle', 'axolotl', 'dragon',
    'capybara', 'sloth', 'koala', 'deer', 'crab',
    'octopus', 'snail', 'redpanda',
] as const;

export const SPRITE_W = 16;
export const SPRITE_H = 13;

interface Palette {
    B: string;
    D: string;
    L: string;
    E: string;
    A: string;
}

interface PetSprite {
    palette: Palette;
    walk:    [string[], string[]];
    sit:     string[];
}

const CAT: PetSprite = {
    palette: { B: '#E8963C', D: '#B4661F', L: '#FFE0B8', E: '#241A12', A: '#FF9FB4' },
    walk: [[
        '................',
        '..D...D.........',
        '..DBD.DBD.......',
        '..DBBBBBD.....D.',
        '..BBEBBEB.....DB',
        '..BBBABBB....DB.',
        '.DBBBBBBBBBBBB..',
        '.BBBBBBBBBBBBB..',
        '.BLLLLLLLLLLB...',
        '.BBBBBBBBBBB....',
        '..DD.....DD.....',
        '..DD.....DD.....',
        '................',
    ], [
        '................',
        '..D...D.........',
        '..DBD.DBD.......',
        '..DBBBBBD......D',
        '..BBEBBEB.....DB',
        '..BBBABBB....DB.',
        '.DBBBBBBBBBBBB..',
        '.BBBBBBBBBBBBB..',
        '.BLLLLLLLLLLB...',
        '.BBBBBBBBBBB....',
        '..DD.....DD.....',
        '.DD.......DD....',
        '................',
    ]],
    sit: [
        '................',
        '..D...D.........',
        '..DBD.DBD.......',
        '..DBBBBBD.......',
        '..BBEBBEB.....D.',
        '..BBBABBB....DB.',
        '.DBBBBBBBBBBBB..',
        '.BBBBBBBBBBBB...',
        '.BLLLLLLLLLB....',
        '.BBBBBBBBBBB....',
        '.BBBBBBBBBBB....',
        '..DDDDDDDDD.....',
        '................',
    ],
};

const DOG: PetSprite = {
    palette: { B: '#C08A4E', D: '#7A5330', L: '#F3E2C8', E: '#241A12', A: '#3A2A1E' },
    walk: [[
        '................',
        '.DD.............',
        '.DBD............',
        '.DBBBBBD......D.',
        '.DBBEBBBD....DB.',
        '.DBBBBBBAD..DB..',
        '.DDBBBBBB.BBBB..',
        '.BBBBBBBBBBBBB..',
        '.BLLLLLLLLLLB...',
        '.BBBBBBBBBBB....',
        '..DD.....DD.....',
        '..DD.....DD.....',
        '................',
    ], [
        '................',
        '.DD.............',
        '.DBD............',
        '.DBBBBBD.......D',
        '.DBBEBBBD.....DB',
        '.DBBBBBBAD...DB.',
        '.DDBBBBBB.BBBB..',
        '.BBBBBBBBBBBBB..',
        '.BLLLLLLLLLLB...',
        '.BBBBBBBBBBB....',
        '..DD.....DD.....',
        '.DD.......DD....',
        '................',
    ]],
    sit: [
        '................',
        '.DD.............',
        '.DBD............',
        '.DBBBBBD........',
        '.DBBEBBBD.....D.',
        '.DBBBBBBAD...DB.',
        '.DDBBBBBB.BBBB..',
        '.BBBBBBBBBBBB...',
        '.BLLLLLLLLLB....',
        '.BBBBBBBBBBB....',
        '.BBBBBBBBBBB....',
        '..DDDDDDDDD.....',
        '................',
    ],
};

const FOX: PetSprite = {
    palette: { B: '#E8702A', D: '#A8431A', L: '#FFF3E4', E: '#241A12', A: '#241A12' },
    walk: [[
        '................',
        '..D...D.........',
        '..DBD.DBD.......',
        '..DBBBBBD.....LL',
        '..BBEBBEB....LLL',
        '..BLLALLB...LLB.',
        '.DBBBBBBBBBBBB..',
        '.BBBBBBBBBBBBB..',
        '.BLLLLLLLLLLB...',
        '.BBBBBBBBBBB....',
        '..DD.....DD.....',
        '..DD.....DD.....',
        '................',
    ], [
        '................',
        '..D...D.........',
        '..DBD.DBD.......',
        '..DBBBBBD......L',
        '..BBEBBEB.....LL',
        '..BLLALLB....LLB',
        '.DBBBBBBBBBBBB..',
        '.BBBBBBBBBBBBB..',
        '.BLLLLLLLLLLB...',
        '.BBBBBBBBBBB....',
        '..DD.....DD.....',
        '.DD.......DD....',
        '................',
    ]],
    sit: [
        '................',
        '..D...D.........',
        '..DBD.DBD.......',
        '..DBBBBBD.....LL',
        '..BBEBBEB....LLL',
        '..BLLALLB...LLB.',
        '.DBBBBBBBBBBB...',
        '.BBBBBBBBBBBB...',
        '.BLLLLLLLLLB....',
        '.BBBBBBBBBBB....',
        '.BBBBBBBBBBB....',
        '..DDDDDDDDD.....',
        '................',
    ],
};

const BUNNY: PetSprite = {
    palette: { B: '#F0EAE2', D: '#B9AEA2', L: '#FFFFFF', E: '#241A12', A: '#F2A6C0' },
    walk: [[
        '..DD.DD.........',
        '..DAD.DAD.......',
        '..DAD.DAD.......',
        '..DBBBBD........',
        '..BBEBBBD.......',
        '..BBBABBD.......',
        '.DBBBBBBBBBL....',
        '.BBBBBBBBBBLLD..',
        '.BLLLLLLLLBLLD..',
        '.BBBBBBBBBB.....',
        '..DD.....DD.....',
        '..DD.....DD.....',
        '................',
    ], [
        '..DD.DD.........',
        '..DAD.DAD.......',
        '..DAD.DAD.......',
        '..DBBBBD........',
        '..BBEBBBD.......',
        '..BBBABBD.......',
        '.DBBBBBBBBBL....',
        '.BBBBBBBBBBLLD..',
        '.BLLLLLLLLBLLD..',
        '.BBBBBBBBBB.....',
        '..DD.....DD.....',
        '.DD.......DD....',
        '................',
    ]],
    sit: [
        '..DD.DD.........',
        '..DAD.DAD.......',
        '..DAD.DAD.......',
        '..DBBBBD........',
        '..BBEBBBD.......',
        '..BBBABBD.......',
        '.DBBBBBBBBBL....',
        '.BBBBBBBBBBLLD..',
        '.BLLLLLLLLBLLD..',
        '.BBBBBBBBBB.....',
        '.BBBBBBBBBB.....',
        '..DDDDDDDD......',
        '................',
    ],
};

const HEDGEHOG: PetSprite = {
    palette: { B: '#7A5F49', D: '#4A382A', L: '#E4CBAE', E: '#241A12', A: '#2A2018' },
    walk: [[
        '................',
        '.......D.D.D....',
        '......DBDBDBD...',
        '.....DBDBDBDBD..',
        '....DBDBDBDBDBD.',
        '..LLDBBBBBBBBBD.',
        '.LLLLBBBBBBBBBBD',
        'ALELLBBBBBBBBBBD',
        '.LLLLLBBBBBBBBD.',
        '..LLLLLLLLLLLD..',
        '...DD.....DD....',
        '...DD.....DD....',
        '................',
    ], [
        '................',
        '.......D.D.D....',
        '......DBDBDBD...',
        '.....DBDBDBDBD..',
        '....DBDBDBDBDBD.',
        '..LLDBBBBBBBBBD.',
        '.LLLLBBBBBBBBBBD',
        'ALELLBBBBBBBBBBD',
        '.LLLLLBBBBBBBBD.',
        '..LLLLLLLLLLLD..',
        '...DD.....DD....',
        '..DD.......DD...',
        '................',
    ]],
    sit: [
        '................',
        '.......D.D.D....',
        '......DBDBDBD...',
        '.....DBDBDBDBD..',
        '....DBDBDBDBDBD.',
        '..LLDBBBBBBBBBD.',
        '.LLLLBBBBBBBBBBD',
        'ALELLBBBBBBBBBBD',
        '.LLLLLBBBBBBBBD.',
        '..LLLLLLLLLLLD..',
        '..LLLLLLLLLLLD..',
        '...DDDDDDDDDD...',
        '................',
    ],
};

const RACCOON: PetSprite = {
    palette: { B: '#8E939B', D: '#3A3F47', L: '#E8EBEF', E: '#F4F6F8', A: '#2A2E34' },
    walk: [[
        '................',
        '..D...D.........',
        '..DBD.DBD.......',
        '..LBBBBBL.....DB',
        '..AAEAAEAA....AD',
        '..LLAALL.....DB.',
        '.DBBBBBBBBBBAD..',
        '.BBBBBBBBBBBD...',
        '.BLLLLLLLLLB....',
        '.BBBBBBBBBBB....',
        '..DD.....DD.....',
        '..DD.....DD.....',
        '................',
    ], [
        '................',
        '..D...D.........',
        '..DBD.DBD.......',
        '..LBBBBBL.....DB',
        '..AAEAAEAA....AD',
        '..LLAALL.....DB.',
        '.DBBBBBBBBBBAD..',
        '.BBBBBBBBBBBD...',
        '.BLLLLLLLLLB....',
        '.BBBBBBBBBBB....',
        '..DD.....DD.....',
        '.DD.......DD....',
        '................',
    ]],
    sit: [
        '................',
        '..D...D.........',
        '..DBD.DBD.......',
        '..LBBBBBL.....DB',
        '..AAEAAEAA....AD',
        '..LLAALL.....DB.',
        '.DBBBBBBBBBBAD..',
        '.BBBBBBBBBBBD...',
        '.BLLLLLLLLLB....',
        '.BBBBBBBBBBB....',
        '.BBBBBBBBBBB....',
        '..DDDDDDDDD.....',
        '................',
    ],
};

const DUCK: PetSprite = {
    palette: { B: '#FFD84D', D: '#D9A62B', L: '#FFF0B8', E: '#241A12', A: '#F0872A' },
    walk: [[
        '................',
        '....DBBBD.......',
        '...DBBBBBD......',
        '..AABBEBBBD.....',
        '..AAABBBBBD.....',
        '....DBBBBBD.....',
        '...DBBBBBBBD....',
        '..DBBBBBBBBBD...',
        '..DBLLLLLLBBD...',
        '..DBBBBBBBBBD...',
        '...DDBBBBBDD....',
        '....A......A....',
        '...AAA...AAA....',
    ], [
        '................',
        '....DBBBD.......',
        '...DBBBBBD......',
        '..AABBEBBBD.....',
        '..AAABBBBBD.....',
        '....DBBBBBD.....',
        '...DBBBBBBBD....',
        '..DBBBBBBBBBD...',
        '..DBLLLLLLBBD...',
        '..DBBBBBBBBBD...',
        '...DDBBBBBDD....',
        '.....A....A.....',
        '....AAA..AAA....',
    ]],
    sit: [
        '................',
        '....DBBBD.......',
        '...DBBBBBD......',
        '..AABBEBBBD.....',
        '..AAABBBBBD.....',
        '....DBBBBBD.....',
        '...DBBBBBBBD....',
        '..DBBBBBBBBBD...',
        '..DBLLLLLLBBD...',
        '..DBBBBBBBBBD...',
        '...DBBBBBBBD....',
        '....DDDDDDD.....',
        '................',
    ],
};

const PENGUIN: PetSprite = {
    palette: { B: '#2E3440', D: '#171B22', L: '#F4F6F8', E: '#171B22', A: '#F5A524' },
    walk: [[
        '................',
        '....DBBBBD......',
        '...DBBBBBBD.....',
        '...DBLEBLEBD....',
        '...DBBAABBBD....',
        '...DBLLLLLBD....',
        '..DBLLLLLLLBD...',
        '..DBLLLLLLLBD...',
        '.DBBLLLLLLLBBD..',
        '..DBLLLLLLLBD...',
        '...DBLLLLLBD....',
        '....AA...AA.....',
        '...AAA...AAA....',
    ], [
        '................',
        '....DBBBBD......',
        '...DBBBBBBD.....',
        '...DBLEBLEBD....',
        '...DBBAABBBD....',
        '...DBLLLLLBD....',
        '..DBLLLLLLLBD...',
        '..DBLLLLLLLBD...',
        '.DBBLLLLLLLBBD..',
        '..DBLLLLLLLBD...',
        '...DBLLLLLBD....',
        '.....AA.AA......',
        '....AAA.AAA.....',
    ]],
    sit: [
        '................',
        '....DBBBBD......',
        '...DBBBBBBD.....',
        '...DBLEBLEBD....',
        '...DBBAABBBD....',
        '...DBLLLLLBD....',
        '..DBLLLLLLLBD...',
        '..DBLLLLLLLBD...',
        '.DBBLLLLLLLBBD..',
        '..DBLLLLLLLBD...',
        '...DBLLLLLBD....',
        '....DDDDDDD.....',
        '................',
    ],
};

const FROG: PetSprite = {
    palette: { B: '#7BC96F', D: '#3F7A38', L: '#D8F2CE', E: '#1A2416', A: '#E86A7C' },
    walk: [[
        '................',
        '..DD......DD....',
        '.DBBD....DBBD...',
        '.DBEBD..DBEBD...',
        '.DBBBDDDDBBBD...',
        '..DBBBBBBBBD....',
        '.DBBBBBBBBBBD...',
        'DBBBBBBBBBBBBD..',
        'DBLLLLLLLLLLBD..',
        'DBBBBBBBBBBBBD..',
        '.DBBBBBBBBBBD...',
        '..DD......DD....',
        '.DD........DD...',
    ], [
        '................',
        '..DD......DD....',
        '.DBBD....DBBD...',
        '.DBEBD..DBEBD...',
        '.DBBBDDDDBBBD...',
        '..DBBBBBBBBD....',
        '.DBBBBBBBBBBD...',
        'DBBBBBBBBBBBBD..',
        'DBLLLLLLLLLLBD..',
        'DBBBBBBBBBBBBD..',
        '.DBBBBBBBBBBD...',
        '...DD....DD.....',
        '..DD......DD....',
    ]],
    sit: [
        '................',
        '..DD......DD....',
        '.DBBD....DBBD...',
        '.DBEBD..DBEBD...',
        '.DBBBDDDDBBBD...',
        '..DBBBBBBBBD....',
        '.DBBBBBBBBBBD...',
        'DBBBBBBBBBBBBD..',
        'DBLLLLLLLLLLBD..',
        'DBBBBBBBBBBBBD..',
        '.DBBBBBBBBBBD...',
        '..DDDDDDDDDD....',
        '................',
    ],
};

const AXOLOTL: PetSprite = {
    palette: { B: '#F7A8C4', D: '#D4708F', L: '#FFD9E6', E: '#3A2430', A: '#FF7FA8' },
    walk: [[
        '................',
        '......A.A.A.....',
        '......A.A.A.....',
        '..DBBBBABABAD...',
        '.DBBEBBBBBBBBD..',
        '.DBBABBBBBBBBDD.',
        '.DBBBBBBBBBBBDD.',
        '.BBBBBBBBBBBBD..',
        '.BLLLLLLLLLLB...',
        '.BBBBBBBBBBB....',
        '..DD.....DD.....',
        '..DD.....DD.....',
        '................',
    ], [
        '................',
        '......A.A.A.....',
        '......A.A.A.....',
        '..DBBBBABABAD...',
        '.DBBEBBBBBBBBD..',
        '.DBBABBBBBBBBDD.',
        '.DBBBBBBBBBBBDD.',
        '.BBBBBBBBBBBBD..',
        '.BLLLLLLLLLLB...',
        '.BBBBBBBBBBB....',
        '..DD.....DD.....',
        '.DD.......DD....',
        '................',
    ]],
    sit: [
        '................',
        '......A.A.A.....',
        '......A.A.A.....',
        '..DBBBBABABAD...',
        '.DBBEBBBBBBBBD..',
        '.DBBABBBBBBBBDD.',
        '.DBBBBBBBBBBBDD.',
        '.BBBBBBBBBBBBD..',
        '.BLLLLLLLLLLB...',
        '.BBBBBBBBBBB....',
        '.BBBBBBBBBBB....',
        '..DDDDDDDDD.....',
        '................',
    ],
};

const PANDA: PetSprite = {
    palette: { B: '#F4F4F2', D: '#25252A', L: '#FFFFFF', E: '#FFFFFF', A: '#1A1A1E' },
    walk: [[
        '................',
        '.DD...DD........',
        '.DDD..DDD.......',
        '..BBBBBB........',
        '.BDDBBDDB.......',
        '.BDEBBDEB.......',
        '.BBBABBDDBBBBBD.',
        '.BBBBBDDDBBBBBBD',
        '.BBLLLDDDLLLBBD.',
        '..BBBDDDDBBBBD..',
        '..DD.....DD.....',
        '..DD.....DD.....',
        '................',
    ], [
        '................',
        '.DD...DD........',
        '.DDD..DDD.......',
        '..BBBBBB........',
        '.BDDBBDDB.......',
        '.BDEBBDEB.......',
        '.BBBABBDDBBBBBD.',
        '.BBBBBDDDBBBBBBD',
        '.BBLLLDDDLLLBBD.',
        '..BBBDDDDBBBBD..',
        '..DD.....DD.....',
        '.DD.......DD....',
        '................',
    ]],
    sit: [
        '................',
        '.DD...DD........',
        '.DDD..DDD.......',
        '..BBBBBB........',
        '.BDDBBDDB.......',
        '.BDEBBDEB.......',
        '.BBBABBDDBBBBBD.',
        '.BBBBBDDDBBBBBBD',
        '.BBLLLDDDLLLBBD.',
        '..BBBDDDDBBBBD..',
        '..BBBDDDDBBBBD..',
        '..DDDDDDDDDD....',
        '................',
    ],
};

const HAMSTER: PetSprite = {
    palette: { B: '#E8B65C', D: '#B8843A', L: '#FFF0D0', E: '#241A12', A: '#F2A6C0' },
    walk: [[
        '................',
        '..DD..DD........',
        '..DAD.DAD.......',
        '.DBBBBBD........',
        '.BLEBBBBBD......',
        '.BLLABBBBBBD....',
        '.BLLBBBBBBBBD...',
        '.BLLLBBBBBBBD...',
        '.DBLLLLLLLLBD...',
        '..DBBBBBBBBD....',
        '..DD.....DD.....',
        '..DD.....DD.....',
        '................',
    ], [
        '................',
        '..DD..DD........',
        '..DAD.DAD.......',
        '.DBBBBBD........',
        '.BLEBBBBBD......',
        '.BLLABBBBBBD....',
        '.BLLBBBBBBBBD...',
        '.BLLLBBBBBBBD...',
        '.DBLLLLLLLLBD...',
        '..DBBBBBBBBD....',
        '..DD.....DD.....',
        '.DD.......DD....',
        '................',
    ]],
    sit: [
        '................',
        '..DD..DD........',
        '..DAD.DAD.......',
        '.DBBBBBD........',
        '.BLEBBBBBD......',
        '.BLLABBBBBBD....',
        '.BLLBBBBBBBBD...',
        '.BLLLBBBBBBBD...',
        '.DBLLLLLLLLBD...',
        '..DBBBBBBBBD....',
        '..DBBBBBBBBD....',
        '...DDDDDDDD.....',
        '................',
    ],
};

const TURTLE: PetSprite = {
    palette: { B: '#5FA845', D: '#2F6B28', L: '#C9E8A8', E: '#1A2416', A: '#8FCB6B' },
    walk: [[
        '................',
        '................',
        '......DDDDD.....',
        '....DDBLBLBDD...',
        '...DBLBBBBBLBD..',
        '..DBBBLBBLBBBBD.',
        'AAADBBBBBBBBBBD.',
        'AEAADDDDDDDDDDD.',
        'AAA.LLLLLLLLLL..',
        '.AA.LLLLLLLLLL..',
        '...AA.....AA....',
        '...AA.....AA....',
        '................',
    ], [
        '................',
        '................',
        '......DDDDD.....',
        '....DDBLBLBDD...',
        '...DBLBBBBBLBD..',
        '..DBBBLBBLBBBBD.',
        'AAADBBBBBBBBBBD.',
        'AEAADDDDDDDDDDD.',
        'AAA.LLLLLLLLLL..',
        '.AA.LLLLLLLLLL..',
        '...AA.....AA....',
        '..AA.......AA...',
        '................',
    ]],
    sit: [
        '................',
        '................',
        '......DDDDD.....',
        '....DDBLBLBDD...',
        '...DBLBBBBBLBD..',
        '..DBBBLBBLBBBBD.',
        'AAADBBBBBBBBBBD.',
        'AEAADDDDDDDDDDD.',
        'AAA.LLLLLLLLLL..',
        '.AA.LLLLLLLLLL..',
        '.AA.LLLLLLLLLL..',
        '....DDDDDDDDD...',
        '................',
    ],
};

const OWL: PetSprite = {
    palette: { B: '#8A6E52', D: '#54402F', L: '#EFE2CC', E: '#F2B01E', A: '#E3873A' },
    walk: [[
        '................',
        '..DD.......DD...',
        '..DBD.....DBD...',
        '..DBBBBBBBBBBD..',
        '..DBEEBBBBEEBD..',
        '..DBEDBBBBDEBD..',
        '..DBBBBAABBBBD..',
        '..DBLLLLLLLLBD..',
        '..DBLLLLLLLLBD..',
        '...DLLLLLLLLD...',
        '....AA....AA....',
        '...AAA...AAA....',
        '................',
    ], [
        '................',
        '..DD.......DD...',
        '..DBD.....DBD...',
        '..DBBBBBBBBBBD..',
        '..DBEEBBBBEEBD..',
        '..DBEDBBBBDEBD..',
        '..DBBBBAABBBBD..',
        '..DBLLLLLLLLBD..',
        '..DBLLLLLLLLBD..',
        '...DLLLLLLLLD...',
        '.....AA..AA.....',
        '....AAA..AAA....',
        '................',
    ]],
    sit: [
        '................',
        '..DD.......DD...',
        '..DBD.....DBD...',
        '..DBBBBBBBBBBD..',
        '..DBEEBBBBEEBD..',
        '..DBEDBBBBDEBD..',
        '..DBBBBAABBBBD..',
        '..DBLLLLLLLLBD..',
        '..DBLLLLLLLLBD..',
        '...DLLLLLLLLD...',
        '...DLLLLLLLLD...',
        '....DDDDDDDD....',
        '................',
    ],
};

const DRAGON: PetSprite = {
    palette: { B: '#5FBF7A', D: '#2E7A46', L: '#D8F5C0', E: '#241A12', A: '#F2C14E' },
    walk: [[
        '................',
        '..A.............',
        '..ABBD..LL......',
        '.DBEBBD.LLL.....',
        '.DBBBBD.LLLL....',
        '..DBBBBBBBBBD...',
        '.DBBBBBBBBBBBD.A',
        '.BBBBBBBBBBBBDA.',
        '.BLLLLLLLLLBDA..',
        '.DBBBBBBBBBD....',
        '..DD.....DD.....',
        '..DD.....DD.....',
        '................',
    ], [
        '................',
        '..A.............',
        '..ABBD..LL......',
        '.DBEBBD.LLL.....',
        '.DBBBBD.LLLL....',
        '..DBBBBBBBBBD...',
        '.DBBBBBBBBBBBD.A',
        '.BBBBBBBBBBBBDA.',
        '.BLLLLLLLLLBDA..',
        '.DBBBBBBBBBD....',
        '..DD.....DD.....',
        '.DD.......DD....',
        '................',
    ]],
    sit: [
        '................',
        '..A.............',
        '..ABBD..LL......',
        '.DBEBBD.LLL.....',
        '.DBBBBD.LLLL....',
        '..DBBBBBBBBBD...',
        '.DBBBBBBBBBBBD.A',
        '.BBBBBBBBBBBBDA.',
        '.BLLLLLLLLLBDA..',
        '.DBBBBBBBBBD....',
        '.DBBBBBBBBBD....',
        '..DDDDDDDDD.....',
        '................',
    ],
};

const CAPYBARA: PetSprite = {
    palette: { B: '#9A7048', D: '#66492C', L: '#C9A87C', E: '#241A12', A: '#3A2A1E' },
    walk: [[
        '................',
        '..DD...DD.......',
        '.DBBD.DBBD......',
        '.DBBBBBBBD......',
        'ADBBEBBEBD......',
        '.DBBBBBBBDDDDD..',
        '.BBBBBBBBBBBBBD.',
        '.BBBBBBBBBBBBBD.',
        '.DBLLLLLLLLLBD..',
        '..BBBBBBBBBBD...',
        '..DD.....DD.....',
        '..DD.....DD.....',
        '................',
    ], [
        '................',
        '..DD...DD.......',
        '.DBBD.DBBD......',
        '.DBBBBBBBD......',
        'ADBBEBBEBD......',
        '.DBBBBBBBDDDDD..',
        '.BBBBBBBBBBBBBD.',
        '.BBBBBBBBBBBBBD.',
        '.DBLLLLLLLLLBD..',
        '..BBBBBBBBBBD...',
        '..DD.....DD.....',
        '.DD.......DD....',
        '................',
    ]],
    sit: [
        '................',
        '..DD...DD.......',
        '.DBBD.DBBD......',
        '.DBBBBBBBD......',
        'ADBBEBBEBD......',
        '.DBBBBBBBDDDDD..',
        '.BBBBBBBBBBBBBD.',
        '.BBBBBBBBBBBBBD.',
        '.DBLLLLLLLLLBD..',
        '..BBBBBBBBBBD...',
        '..BBBBBBBBBBD...',
        '..DDDDDDDDDD....',
        '................',
    ],
};

const SLOTH: PetSprite = {
    palette: { B: '#8C7E6A', D: '#584C3C', L: '#DCCDB2', E: '#241A12', A: '#B9A98C' },
    walk: [[
        '................',
        '................',
        '..DDDD..........',
        '.DLLLLD.........',
        '.LELLEL.DDDD....',
        '.LLALLLDBBBBBD..',
        '.DLLLLDBBBBBBBD.',
        '..DDDDBBBBBBBBD.',
        '...DBBLLLLLLBD..',
        '...DBBBBBBBBD...',
        '...AA....AA.....',
        '...AA....AA.....',
        '................',
    ], [
        '................',
        '................',
        '..DDDD..........',
        '.DLLLLD.........',
        '.LELLEL.DDDD....',
        '.LLALLLDBBBBBD..',
        '.DLLLLDBBBBBBBD.',
        '..DDDDBBBBBBBBD.',
        '...DBBLLLLLLBD..',
        '...DBBBBBBBBD...',
        '...AA....AA.....',
        '..AA......AA....',
        '................',
    ]],
    sit: [
        '................',
        '................',
        '..DDDD..........',
        '.DLLLLD.........',
        '.LELLEL.DDDD....',
        '.LLALLLDBBBBBD..',
        '.DLLLLDBBBBBBBD.',
        '..DDDDBBBBBBBBD.',
        '...DBBLLLLLLBD..',
        '...DBBBBBBBBD...',
        '...DBBBBBBBBD...',
        '....AAAAAAAA....',
        '................',
    ],
};

const KOALA: PetSprite = {
    palette: { B: '#A6ADB4', D: '#69727A', L: '#E6EAEE', E: '#241A12', A: '#2B2B30' },
    walk: [[
        '................',
        '.DD....DD.......',
        'DLLD..DLLD......',
        'DLLD..DLLD......',
        '.DBBBBBBD.......',
        '.BEBBBBEBDDDD...',
        '.BBBABBBBBBBBBD.',
        '.DBBBBBBBBBBBBD.',
        '..BLLLLLLLLLBD..',
        '..BBBBBBBBBBD...',
        '..DD.....DD.....',
        '..DD.....DD.....',
        '................',
    ], [
        '................',
        '.DD....DD.......',
        'DLLD..DLLD......',
        'DLLD..DLLD......',
        '.DBBBBBBD.......',
        '.BEBBBBEBDDDD...',
        '.BBBABBBBBBBBBD.',
        '.DBBBBBBBBBBBBD.',
        '..BLLLLLLLLLBD..',
        '..BBBBBBBBBBD...',
        '..DD.....DD.....',
        '.DD.......DD....',
        '................',
    ]],
    sit: [
        '................',
        '.DD....DD.......',
        'DLLD..DLLD......',
        'DLLD..DLLD......',
        '.DBBBBBBD.......',
        '.BEBBBBEBDDDD...',
        '.BBBABBBBBBBBBD.',
        '.DBBBBBBBBBBBBD.',
        '..BLLLLLLLLLBD..',
        '..BBBBBBBBBBD...',
        '..BBBBBBBBBBD...',
        '..DDDDDDDDDD....',
        '................',
    ],
};

const DEER: PetSprite = {
    palette: { B: '#C08F5E', D: '#7C5836', L: '#F5E7D0', E: '#241A12', A: '#8B6B47' },
    walk: [[
        '.A....A.........',
        '.AA..AA.........',
        '..AAAA..........',
        '..DBBD..........',
        '.DBEBBD.........',
        '.DBBBABD........',
        '..DBBBBDDDDD....',
        '...BBBBBBBBBBD..',
        '...BLBBLBBLBBD..',
        '...BBBBBBBBBD...',
        '...DD....DD.....',
        '...DD....DD.....',
        '................',
    ], [
        '.A....A.........',
        '.AA..AA.........',
        '..AAAA..........',
        '..DBBD..........',
        '.DBEBBD.........',
        '.DBBBABD........',
        '..DBBBBDDDDD....',
        '...BBBBBBBBBBD..',
        '...BLBBLBBLBBD..',
        '...BBBBBBBBBD...',
        '...DD....DD.....',
        '..DD......DD....',
        '................',
    ]],
    sit: [
        '.A....A.........',
        '.AA..AA.........',
        '..AAAA..........',
        '..DBBD..........',
        '.DBEBBD.........',
        '.DBBBABD........',
        '..DBBBBDDDDD....',
        '...BBBBBBBBBBD..',
        '...BLBBLBBLBBD..',
        '...BBBBBBBBBD...',
        '...BBBBBBBBBD...',
        '...DDDDDDDDD....',
        '................',
    ],
};

const CRAB: PetSprite = {
    palette: { B: '#E05A3E', D: '#A3341F', L: '#F7A98E', E: '#241A12', A: '#FFE9D2' },
    walk: [[
        '................',
        '.DD..........DD.',
        'DBBD........DBBD',
        'DBBD........DBBD',
        '.DD...A..A...DD.',
        '..D..DDDDDD..D..',
        '..DBBBBBBBBBBD..',
        '.DBBBBBBBBBBBBD.',
        '.DBLLLLLLLLLLBD.',
        '..DBBBBBBBBBBD..',
        '...D.D....D.D...',
        '..D...D..D...D..',
        '................',
    ], [
        '................',
        '.DD..........DD.',
        'DBBD........DBBD',
        'DBBD........DBBD',
        '.DD...A..A...DD.',
        '..D..DDDDDD..D..',
        '..DBBBBBBBBBBD..',
        '.DBBBBBBBBBBBBD.',
        '.DBLLLLLLLLLLBD.',
        '..DBBBBBBBBBBD..',
        '..D..D....D..D..',
        '.D....D..D....D.',
        '................',
    ]],
    sit: [
        '................',
        '.DD..........DD.',
        'DBBD........DBBD',
        'DBBD........DBBD',
        '.DD...A..A...DD.',
        '..D..DDDDDD..D..',
        '..DBBBBBBBBBBD..',
        '.DBBBBBBBBBBBBD.',
        '.DBLLLLLLLLLLBD.',
        '..DBBBBBBBBBBD..',
        '..DBBBBBBBBBBD..',
        '...DDDDDDDDDD...',
        '................',
    ],
};

const OCTOPUS: PetSprite = {
    palette: { B: '#B061C9', D: '#77398B', L: '#E3B6F0', E: '#241A12', A: '#F4D8FB' },
    walk: [[
        '................',
        '.....DDDD.......',
        '...DDBBBBDD.....',
        '..DBBBBBBBBD....',
        '..DBBBBBBBBD....',
        '.DBEBBBBBBEBD...',
        '.DBBBBAABBBBD...',
        '.DBBBBBBBBBBD...',
        '..DBBBBBBBBD....',
        '..LLLLLLLLL.....',
        '..L.L.L.L.L.....',
        '..L.L.L.L.L.....',
        '................',
    ], [
        '................',
        '.....DDDD.......',
        '...DDBBBBDD.....',
        '..DBBBBBBBBD....',
        '..DBBBBBBBBD....',
        '.DBEBBBBBBEBD...',
        '.DBBBBAABBBBD...',
        '.DBBBBBBBBBBD...',
        '..DBBBBBBBBD....',
        '..LLLLLLLLL.....',
        '..L.L.L.L.L.....',
        '.L.L.L.L.L......',
        '................',
    ]],
    sit: [
        '................',
        '.....DDDD.......',
        '...DDBBBBDD.....',
        '..DBBBBBBBBD....',
        '..DBBBBBBBBD....',
        '.DBEBBBBBBEBD...',
        '.DBBBBAABBBBD...',
        '.DBBBBBBBBBBD...',
        '..DBBBBBBBBD....',
        '..LLLLLLLLL.....',
        '..LLLLLLLLL.....',
        '..DDDDDDDDD.....',
        '................',
    ],
};

const SNAIL: PetSprite = {
    palette: { B: '#D98A2B', D: '#8A5214', L: '#F0DCC0', E: '#241A12', A: '#BFA282' },
    walk: [[
        '..E.E...........',
        '..L.L...........',
        '..LLL...DDDD....',
        '.LLLLL.DBBBBD...',
        'LLLLLLLDBDDBBD..',
        'LLLLLLLDBDBBBBD.',
        '.LLLLLLDBBDBBBD.',
        '.LLLLLLDBBBBBBD.',
        '..LLLLLLDBBBBD..',
        '...LLLLLLDDDD...',
        '..LLLLLLLLLLL...',
        '...AAAAAAAAA....',
        '................',
    ], [
        '..E.E...........',
        '..L.L...........',
        '..LLL...DDDD....',
        '.LLLLL.DBBBBD...',
        'LLLLLLLDBDDBBD..',
        'LLLLLLLDBDBBBBD.',
        '.LLLLLLDBBDBBBD.',
        '.LLLLLLDBBBBBBD.',
        '..LLLLLLDBBBBD..',
        '...LLLLLLDDDD...',
        '..LLLLLLLLLLL...',
        '..AAAAAAAAA.....',
        '................',
    ]],
    sit: [
        '..E.E...........',
        '..L.L...........',
        '..LLL...DDDD....',
        '.LLLLL.DBBBBD...',
        'LLLLLLLDBDDBBD..',
        'LLLLLLLDBDBBBBD.',
        '.LLLLLLDBBDBBBD.',
        '.LLLLLLDBBBBBBD.',
        '..LLLLLLDBBBBD..',
        '...LLLLLLDDDD...',
        '..LLLLLLLLLLL...',
        '..AAAAAAAAAAA...',
        '................',
    ],
};

const REDPANDA: PetSprite = {
    palette: { B: '#C8632E', D: '#7C3A18', L: '#F5E6D2', E: '#241A12', A: '#4A2A16' },
    walk: [[
        '................',
        '.DLD...DLD......',
        '.DBD...DBD......',
        '..DBBBBBBD......',
        '.LBEBBBEBL......',
        '.LLBBABBLL......',
        '..DBBBBBBDDDDD..',
        '..BBBBBBBBBABAD.',
        '..BLLLLLLLBABAD.',
        '..BBBBBBBBBABAD.',
        '..DD.....DD.....',
        '..DD.....DD.....',
        '................',
    ], [
        '................',
        '.DLD...DLD......',
        '.DBD...DBD......',
        '..DBBBBBBD......',
        '.LBEBBBEBL......',
        '.LLBBABBLL......',
        '..DBBBBBBDDDDD..',
        '..BBBBBBBBBABAD.',
        '..BLLLLLLLBABAD.',
        '..BBBBBBBBBABAD.',
        '..DD.....DD.....',
        '.DD.......DD....',
        '................',
    ]],
    sit: [
        '................',
        '.DLD...DLD......',
        '.DBD...DBD......',
        '..DBBBBBBD......',
        '.LBEBBBEBL......',
        '.LLBBABBLL......',
        '..DBBBBBBDDDDD..',
        '..BBBBBBBBBABAD.',
        '..BLLLLLLLBABAD.',
        '..BBBBBBBBBABAD.',
        '..BBBBBBBBBBBD..',
        '..DDDDDDDDDDD...',
        '................',
    ],
};

const SPRITES: Record<Exclude<IslandPetId, 'none'>, PetSprite> = {
    cat: CAT, dog: DOG, fox: FOX, bunny: BUNNY, hamster: HAMSTER,
    hedgehog: HEDGEHOG, raccoon: RACCOON, panda: PANDA, duck: DUCK, penguin: PENGUIN,
    owl: OWL, frog: FROG, turtle: TURTLE, axolotl: AXOLOTL, dragon: DRAGON,
    capybara: CAPYBARA, sloth: SLOTH, koala: KOALA, deer: DEER, crab: CRAB,
    octopus: OCTOPUS, snail: SNAIL, redpanda: REDPANDA,
};

export function islandPetLabel(id: IslandPetId): string {
    switch (id) {
        case 'cat':       return t('shell.petCat', 'Cat');
        case 'dog':       return t('shell.petDog', 'Dog');
        case 'fox':       return t('shell.petFox', 'Fox');
        case 'bunny':     return t('shell.petBunny', 'Bunny');
        case 'hamster':   return t('shell.petHamster', 'Hamster');
        case 'hedgehog':  return t('shell.petHedgehog', 'Hedgehog');
        case 'raccoon':   return t('shell.petRaccoon', 'Raccoon');
        case 'panda':     return t('shell.petPanda', 'Panda');
        case 'duck':      return t('shell.petDuck', 'Duck');
        case 'penguin':   return t('shell.petPenguin', 'Penguin');
        case 'owl':       return t('shell.petOwl', 'Owl');
        case 'frog':      return t('shell.petFrog', 'Frog');
        case 'turtle':    return t('shell.petTurtle', 'Turtle');
        case 'axolotl':   return t('shell.petAxolotl', 'Axolotl');
        case 'dragon':    return t('shell.petDragon', 'Dragon');
        case 'capybara':  return t('shell.petCapybara', 'Capybara');
        case 'sloth':     return t('shell.petSloth', 'Sloth');
        case 'koala':     return t('shell.petKoala', 'Koala');
        case 'deer':      return t('shell.petDeer', 'Deer');
        case 'crab':      return t('shell.petCrab', 'Crab');
        case 'octopus':   return t('shell.petOctopus', 'Octopus');
        case 'snail':     return t('shell.petSnail', 'Snail');
        case 'redpanda':  return t('shell.petRedPanda', 'Red Panda');
        default:          return t('shell.petNone', 'Off');
    }
}

function Frame({ rows, palette, dx = 0 }: { rows: string[]; palette: Palette; dx?: number }) {
    const px: JSX.Element[] = [];
    for (let y = 0; y < rows.length; y++) {
        const row = rows[y];
        for (let x = 0; x < row.length; x++) {
            const ch = row[x] as keyof Palette | '.';
            if (ch === '.') continue;
            const fill = palette[ch];
            if (!fill) continue;
            px.push(<rect key={`${x}-${y}`} x={x + dx} y={y} width={1} height={1} fill={fill} />);
        }
    }
    return <>{px}</>;
}

export function IslandPetArt({ id, mood, height = 26 }: {
    id: IslandPetId;
    mood: PetMood;
    height?: number;
}) {
    if (id === 'none') return null;
    const sprite = SPRITES[id];
    const still = mood === 'sleepy' || mood === 'resting';
    const width = height * (SPRITE_W / SPRITE_H);

    return (
        <svg
            viewBox={`0 0 ${SPRITE_W} ${SPRITE_H}`}
            width={width}
            height={height}
            shapeRendering="crispEdges"
            className={`sd-pet sd-pet-${mood}`}
            aria-hidden
            focusable="false"
        >
            {still ? (
                <Frame rows={sprite.sit} palette={sprite.palette} />
            ) : (
                <g className="sd-pet-sheet">
                    <Frame rows={sprite.walk[0]} palette={sprite.palette} />
                    <Frame rows={sprite.walk[1]} palette={sprite.palette} dx={SPRITE_W} />
                </g>
            )}
        </svg>
    );
}
