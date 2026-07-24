import { describe, expect, it } from 'vitest';

import { extractHashtags, postHasTag, trendingFromBodies } from './hashtags';

describe('extractHashtags', () => {
    it('finds tags with letters, digits and underscores', () => {
        expect(extractHashtags('big #Win_2 today')).toEqual(['Win_2']);
    });

    it('stops at punctuation and finds multiple tags', () => {
        expect(extractHashtags('#one, #two! #three.')).toEqual(['one', 'two', 'three']);
    });

    it('returns empty for a body with no tags', () => {
        expect(extractHashtags('nothing here')).toEqual([]);
    });
});

describe('postHasTag', () => {
    it('matches exact tags case-insensitively, with or without a leading #', () => {
        expect(postHasTag('go #Gamer go', '#gamer')).toBe(true);
        expect(postHasTag('go #Gamer go', 'GAMER')).toBe(true);
    });

    it('does not match tag prefixes', () => {
        expect(postHasTag('living the #gamerlife', '#gamer')).toBe(false);
    });
});

describe('trendingFromBodies', () => {
    it('counts posts, not occurrences, grouped case-insensitively', () => {
        const tags = trendingFromBodies(['#Gamer #gamer twice in one post', 'also #Gamer', 'no tags']);
        expect(tags).toEqual([{ tag: '#Gamer', count: 2 }]);
    });

    it('sorts by count and honours the limit', () => {
        const bodies = ['#a #b', '#a #b', '#a', '#c'];
        expect(trendingFromBodies(bodies, 2)).toEqual([
            { tag: '#a', count: 3 },
            { tag: '#b', count: 2 },
        ]);
    });

    it('displays the most-used casing', () => {
        expect(trendingFromBodies(['#LosSantos', '#lossantos', '#LosSantos'])).toEqual([
            { tag: '#LosSantos', count: 3 },
        ]);
    });
});
