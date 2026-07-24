import { describe, expect, it } from 'vitest';

import { applySuggestion, isEmailish, suggestEmails } from './mailSuggest';

const SAVED = ['samuelwhite@lifeinvader.com', 'marcus@lifeinvader.com', 'sam@fib.gov'];

describe('suggestEmails', () => {
    it('prefix-matches the typed fragment case-insensitively', () => {
        expect(suggestEmails('Samuelw', SAVED)).toEqual(['samuelwhite@lifeinvader.com']);
    });

    it('matches only the fragment after the last separator', () => {
        expect(suggestEmails('a@b.com, marc', SAVED)).toEqual(['marcus@lifeinvader.com']);
    });

    it('needs at least 2 fragment characters', () => {
        expect(suggestEmails('s', SAVED)).toEqual([]);
    });

    it('excludes an exact match and respects the limit', () => {
        expect(suggestEmails('sam@fib.gov', SAVED)).toEqual([]);
        expect(suggestEmails('sa', SAVED, 1)).toEqual(['samuelwhite@lifeinvader.com']);
    });
});

describe('applySuggestion', () => {
    it('replaces the current fragment, keeping earlier recipients', () => {
        expect(applySuggestion('a@b.com, marc', 'marcus@lifeinvader.com'))
            .toBe('a@b.com, marcus@lifeinvader.com');
    });

    it('replaces a lone fragment entirely', () => {
        expect(applySuggestion('sam', 'samuelwhite@lifeinvader.com'))
            .toBe('samuelwhite@lifeinvader.com');
    });
});

describe('isEmailish', () => {
    it('accepts local@host and rejects whitespace or missing @', () => {
        expect(isEmailish('samuelwhite@lifeinvader.com')).toBe(true);
        expect(isEmailish('not an email')).toBe(false);
        expect(isEmailish('nobody')).toBe(false);
    });
});
