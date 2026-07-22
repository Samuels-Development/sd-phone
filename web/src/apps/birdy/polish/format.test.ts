import { describe, expect, it } from 'vitest';

import { compactCount } from './format';

describe('birdy compactCount', () => {
    it('passes small numbers through', () => {
        expect(compactCount(0)).toBe('0');
        expect(compactCount(7)).toBe('7');
        expect(compactCount(999)).toBe('999');
    });

    it('compacts thousands with one decimal, trimming .0', () => {
        expect(compactCount(1000)).toBe('1K');
        expect(compactCount(1200)).toBe('1.2K');
        expect(compactCount(9950)).toBe('9.9K');
        expect(compactCount(345600)).toBe('345.6K');
    });

    it('compacts millions', () => {
        expect(compactCount(1000000)).toBe('1M');
        expect(compactCount(3400000)).toBe('3.4M');
    });

    it('never shows a decimal at three digits', () => {
        expect(compactCount(123400)).toBe('123.4K');
        expect(compactCount(999949)).toBe('999.9K');
    });
});
