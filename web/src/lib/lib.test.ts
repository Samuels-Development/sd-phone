import { describe, expect, it } from 'vitest';

import { colorFor, digits, hashColor, hashIndex, initials, initialsFor, isNumericName, newId } from './format';
import { formatDuration, format12h, relTimeCompact } from './time';
import { hashSeed, seededRandom } from './random';

describe('format.initials', () => {
    it('takes the first letter of the first words', () => {
        expect(initials('John Smith')).toBe('JS');
        expect(initials('John Ray Smith')).toBe('JR');
    });
    it('handles single words and empties', () => {
        expect(initials('Madison')).toBe('M');
        expect(initials('')).toBe('?');
        expect(initials('   ')).toBe('?');
    });
    it('respects max', () => {
        expect(initials('a b c d', 3)).toBe('ABC');
    });
});

describe('format.digits', () => {
    it('strips non-digits', () => {
        expect(digits('(555) 123-4567')).toBe('5551234567');
        expect(digits('no digits')).toBe('');
    });
});

describe('format.isNumericName', () => {
    it('is true for phone numbers and digit-only strings', () => {
        expect(isNumericName('(213) 555-0148')).toBe(true);
        expect(isNumericName('2135550148')).toBe(true);
        expect(isNumericName('+1 213 555 0148')).toBe(true);
    });
    it('is false for real contact names', () => {
        expect(isNumericName('Amir Vance')).toBe(false);
        expect(isNumericName('LS Mechanics')).toBe(false);
        expect(isNumericName('Ghost')).toBe(false);
    });
});

describe('format.hashIndex / hashColor', () => {
    it('is deterministic and in range', () => {
        expect(hashIndex('alice', 7)).toBe(hashIndex('alice', 7));
        for (const name of ['a', 'bob', 'Charlie Delta', '🎉']) {
            const i = hashIndex(name, 5);
            expect(i).toBeGreaterThanOrEqual(0);
            expect(i).toBeLessThan(5);
        }
    });
    it('picks from the palette deterministically', () => {
        const palette = ['red', 'green', 'blue'] as const;
        expect(hashColor('alice', palette)).toBe(hashColor('alice', palette));
        expect(palette).toContain(hashColor('zed', palette));
    });
});

describe('format.colorFor', () => {
    it('is deterministic and picks from the fixed palette', () => {
        expect(colorFor('Amir Vance')).toBe(colorFor('Amir Vance'));
        expect(colorFor('Amir Vance')).toBe('#5e5ce6');
        expect(colorFor('Bree Larsen')).toBe('#ff453a');
    });
});

describe('format.initialsFor', () => {
    it('takes the first letter of the first two words', () => {
        expect(initialsFor('John Smith')).toBe('JS');
        expect(initialsFor('Madison')).toBe('M');
    });
    it('falls back to # for a blank name', () => {
        expect(initialsFor('')).toBe('#');
    });
    it('trims before splitting into words', () => {
        expect(initialsFor('  John   Smith  ')).toBe('JS');
    });
});

describe('format.newId', () => {
    it('is unique and prefixed', () => {
        const a = newId('x');
        const b = newId('x');
        expect(a).not.toBe(b);
        expect(a.startsWith('x')).toBe(true);
    });
});

describe('time.formatDuration', () => {
    it('formats m:ss by default', () => {
        expect(formatDuration(0)).toBe('0:00');
        expect(formatDuration(61)).toBe('1:01');
        expect(formatDuration(599)).toBe('9:59');
    });
    it('pads minutes and adds hours on request', () => {
        expect(formatDuration(61, { padMinutes: true })).toBe('01:01');
        expect(formatDuration(3661, { withHours: true })).toBe('1:01:01');
    });
    it('floors garbage to zero', () => {
        expect(formatDuration(-5)).toBe('0:00');
        expect(formatDuration(NaN)).toBe('0:00');
    });
});

describe('time.format12h', () => {
    it('converts around noon and midnight', () => {
        expect(format12h(0, 5)).toBe('12:05 AM');
        expect(format12h(12, 0)).toBe('12:00 PM');
        expect(format12h(23, 59)).toBe('11:59 PM');
    });
});

describe('time.relTimeCompact', () => {
    const now = 1_800_000_000_000;
    it('buckets minutes/hours/days', () => {
        expect(relTimeCompact(now - 30_000, { now })).toBe('now');
        expect(relTimeCompact(now - 5 * 60_000, { now })).toBe('5m');
        expect(relTimeCompact(now - 3 * 3_600_000, { now })).toBe('3h');
        expect(relTimeCompact(now - 2 * 86_400_000, { now })).toBe('2d');
    });
    it('honours nowLabel and yesterdayLabel', () => {
        expect(relTimeCompact(now - 10_000, { now, nowLabel: 'Just now' })).toBe('Just now');
        expect(relTimeCompact(now - 86_400_000, { now, yesterdayLabel: 'Yesterday' })).toBe('Yesterday');
    });
});

describe('random.seededRandom', () => {
    it('is deterministic per seed and within [0,1)', () => {
        const a = seededRandom(1234);
        const b = seededRandom(1234);
        const seqA = [a(), a(), a()];
        const seqB = [b(), b(), b()];
        expect(seqA).toEqual(seqB);
        for (const v of seqA) {
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
    it('differs across seeds', () => {
        expect(seededRandom(1)()).not.toBe(seededRandom(2)());
    });
});

describe('random.hashSeed', () => {
    it('is stable and 32-bit unsigned', () => {
        expect(hashSeed('MZB:1d')).toBe(hashSeed('MZB:1d'));
        expect(hashSeed('a')).not.toBe(hashSeed('b'));
        expect(hashSeed('anything')).toBeGreaterThanOrEqual(0);
    });
});
