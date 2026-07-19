import { beforeEach, describe, expect, it, vi } from 'vitest';

import { consumeLaunchIntent, resetLaunchIntents, setLaunchIntent, subscribeLaunchIntent } from './launchIntent';

// The hook is a thin wrapper over these; what matters for #13 is the delivery
// semantics, which are pure and testable without a React renderer.
describe('launchIntent', () => {
    beforeEach(() => resetLaunchIntents());

    it('delivers a queued intent to the app it was addressed to', () => {
        setLaunchIntent('camera', { mode: 'VIDEO' });
        expect(consumeLaunchIntent('camera')).toEqual({ mode: 'VIDEO' });
    });

    it('is one-shot, so a later open does not replay a stale intent', () => {
        setLaunchIntent('camera', { mode: 'VIDEO' });
        expect(consumeLaunchIntent('camera')).toEqual({ mode: 'VIDEO' });
        expect(consumeLaunchIntent('camera')).toBeUndefined();
    });

    it('returns undefined when nothing was queued', () => {
        expect(consumeLaunchIntent('camera')).toBeUndefined();
    });

    it('does not deliver one app\'s intent to another', () => {
        setLaunchIntent('camera', { mode: 'VIDEO' });
        expect(consumeLaunchIntent('notes')).toBeUndefined();
        expect(consumeLaunchIntent('camera')).toEqual({ mode: 'VIDEO' });
    });

    it('notifies an app that is already mounted, so a retained app still gets the mode', () => {
        const seen: unknown[] = [];
        subscribeLaunchIntent('camera', () => seen.push(consumeLaunchIntent('camera')));

        setLaunchIntent('camera', { mode: 'VIDEO' });
        // The #13 case: second launch, different mode, no remount in between.
        setLaunchIntent('camera', { mode: 'PHOTO' });

        expect(seen).toEqual([{ mode: 'VIDEO' }, { mode: 'PHOTO' }]);
    });

    it('only wakes subscribers of the target app', () => {
        const camera = vi.fn();
        const notes  = vi.fn();
        subscribeLaunchIntent('camera', camera);
        subscribeLaunchIntent('notes', notes);

        setLaunchIntent('camera', { mode: 'VIDEO' });

        expect(camera).toHaveBeenCalledTimes(1);
        expect(notes).not.toHaveBeenCalled();
    });

    it('stops notifying after unsubscribe', () => {
        const fn = vi.fn();
        const off = subscribeLaunchIntent('camera', fn);
        off();
        setLaunchIntent('camera', { mode: 'VIDEO' });
        expect(fn).not.toHaveBeenCalled();
    });

    it('survives a subscriber unsubscribing during notify', () => {
        const later = vi.fn();
        const off = subscribeLaunchIntent('camera', () => off());
        subscribeLaunchIntent('camera', later);
        expect(() => setLaunchIntent('camera', { mode: 'VIDEO' })).not.toThrow();
        expect(later).toHaveBeenCalledTimes(1);
    });
});
