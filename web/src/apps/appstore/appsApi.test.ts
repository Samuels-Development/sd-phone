import { describe, it, expect } from 'vitest';
import { parseLayout } from './appsApi';

describe('parseLayout', () => {
    it('accepts a flat slot array', () => {
        expect(parseLayout('["phone","messages",null]')).toEqual({
            slots: ['phone', 'messages', null],
            folders: [],
        });
    });

    it('accepts the object form with folders', () => {
        expect(parseLayout('{"slots":["phone"],"folders":[]}')).toEqual({
            slots: ['phone'],
            folders: [],
        });
    });

    // Regression: lb-phone stores the home screen as PAGES of apps, an array of arrays. That passes
    // Array.isArray and used to be cast straight to slots, so a slot held an array. Rendering then
    // called icon.startsWith(...) on it, React threw mid-render, the phone unmounted and NUI focus
    // was never released, leaving the player's mouse stuck on screen.
    it('rejects an array of arrays rather than trusting the cast', () => {
        expect(parseLayout('[["Phone","Messages"],["Settings","Mail"]]')).toBeNull();
    });

    it('rejects slots that are not strings or null', () => {
        expect(parseLayout('[1,2,3]')).toBeNull();
        expect(parseLayout('[{"a":1}]')).toBeNull();
        expect(parseLayout('{"slots":[["a"]],"folders":[]}')).toBeNull();
    });

    it('returns null for absent or malformed input', () => {
        expect(parseLayout(null)).toBeNull();
        expect(parseLayout(undefined)).toBeNull();
        expect(parseLayout('')).toBeNull();
        expect(parseLayout('not json')).toBeNull();
        expect(parseLayout('{"slots":"nope"}')).toBeNull();
    });
});
