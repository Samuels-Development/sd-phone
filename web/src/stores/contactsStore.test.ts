import { beforeEach, describe, expect, it } from 'vitest';

import { resetContacts, syncSimNumber, useContactsStore } from './contactsStore';

const MOCK_NUMBER = '2051189847';

function flush(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
    useContactsStore.setState({ contacts: [], recents: [], myNumber: '', myName: '', card: {}, loaded: false });
});

describe('contactsStore.syncSimNumber', () => {
    it('does nothing while the store has not loaded', async () => {
        syncSimNumber({ enabled: true, hasSim: true, number: '5550001111' });
        await flush();
        expect(useContactsStore.getState().loaded).toBe(false);
        expect(useContactsStore.getState().myNumber).toBe('');
    });

    it('does nothing when the pushed number matches the cached one', async () => {
        useContactsStore.setState({ loaded: true, myNumber: '5550001111' });
        syncSimNumber({ enabled: true, hasSim: true, number: '5550001111' });
        await flush();
        expect(useContactsStore.getState().myNumber).toBe('5550001111');
        expect(useContactsStore.getState().contacts).toEqual([]);
    });

    it('does nothing when the SIM feature is off or the push is absent', async () => {
        useContactsStore.setState({ loaded: true, myNumber: '5550001111' });
        syncSimNumber(undefined);
        syncSimNumber({ enabled: false, hasSim: true, number: '5550009999' });
        await flush();
        expect(useContactsStore.getState().myNumber).toBe('5550001111');
    });

    it('refetches when a different SIM number arrives', async () => {
        useContactsStore.setState({ loaded: true, myNumber: '5550001111' });
        syncSimNumber({ enabled: true, hasSim: true, number: '5550009999' });
        await flush();
        expect(useContactsStore.getState().myNumber).toBe(MOCK_NUMBER);
    });

    it('refetches when the SIM is ejected (number gone)', async () => {
        useContactsStore.setState({ loaded: true, myNumber: '5550001111' });
        syncSimNumber({ enabled: true, hasSim: false });
        await flush();
        expect(useContactsStore.getState().myNumber).toBe(MOCK_NUMBER);
    });
});

describe('contactsStore.resetContacts', () => {
    it('drops the cache and refetches when it was loaded', async () => {
        useContactsStore.setState({ loaded: true, myNumber: '5550001111', myName: 'Old Name' });
        resetContacts();
        await flush();
        expect(useContactsStore.getState().loaded).toBe(true);
        expect(useContactsStore.getState().myNumber).toBe(MOCK_NUMBER);
    });

    it('only clears when nothing had loaded it yet', async () => {
        useContactsStore.setState({ myNumber: 'stale' });
        resetContacts();
        await flush();
        expect(useContactsStore.getState().loaded).toBe(false);
        expect(useContactsStore.getState().myNumber).toBe('');
    });
});
