import { beforeEach, describe, expect, it } from 'vitest';

import { useBadgeStore } from './badgeStore';

// Mirrors what useBadges() renders (server counts over local bumps) without needing a React
// renderer; these tests are about the store's state transitions.
function badges() {
    const { local, server } = useBadgeStore.getState();
    return { ...local, ...server };
}

beforeEach(() => {
    useBadgeStore.setState({ local: {}, server: {} });
});

describe('badgeStore server counts', () => {
    it('setServer replaces the whole map, as a full snapshot should', () => {
        useBadgeStore.getState().setServer({ messages: 2, mail: 5 });
        useBadgeStore.getState().setServer({ groups: 1 });
        expect(badges()).toEqual({ groups: 1 });
    });

    it('patchServer merges one app over the rest', () => {
        useBadgeStore.getState().setServer({ messages: 2, phone: 3, mail: 5, groups: 1 });
        useBadgeStore.getState().patchServer({ birdy: 7 });
        expect(badges()).toEqual({ messages: 2, phone: 3, mail: 5, groups: 1, birdy: 7 });
    });

    it('a patch clearing one app to zero leaves the others untouched', () => {
        useBadgeStore.getState().setServer({ messages: 2, mail: 5 });
        useBadgeStore.getState().patchServer({ birdy: 7 });
        useBadgeStore.getState().patchServer({ birdy: 0 });
        expect(badges()).toEqual({ messages: 2, mail: 5, birdy: 0 });
    });

    it('a patch overwrites only its own key', () => {
        useBadgeStore.getState().setServer({ messages: 2, mail: 5 });
        useBadgeStore.getState().patchServer({ mail: 9 });
        expect(badges()).toEqual({ messages: 2, mail: 9 });
    });

    it('an empty or missing patch is a no-op', () => {
        useBadgeStore.getState().setServer({ messages: 2 });
        useBadgeStore.getState().patchServer({});
        expect(badges()).toEqual({ messages: 2 });
    });

    it('server counts still win over local bumps', () => {
        useBadgeStore.getState().bump('birdy');
        useBadgeStore.getState().patchServer({ birdy: 4 });
        expect(badges().birdy).toBe(4);
    });
});
