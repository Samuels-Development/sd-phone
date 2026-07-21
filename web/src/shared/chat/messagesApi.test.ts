import { describe, expect, it } from 'vitest';

import { appendThreadMessage, contactFromNumber, patchThreadMessage, resolveConvParticipant } from './messagesApi';
import type { Contact, Conversation } from './data';

interface TestMsg { id: string; body: string }
interface TestThread { id: string; topic?: string; messages: TestMsg[] }

function thread(id: string, messages: TestMsg[]): TestThread {
    return { id, messages };
}

describe('messagesApi.appendThreadMessage', () => {
    it('appends a message to the matching thread and moves it to the front', () => {
        const threads = [thread('a', []), thread('b', []), thread('c', [])];
        const msg = { id: 'm1', body: 'hi' };
        const next = appendThreadMessage(threads, 'b', msg);
        expect(next.map(t => t.id)).toEqual(['b', 'a', 'c']);
        expect(next[0].messages).toEqual([msg]);
    });

    it('returns the same array reference when threadId is not found', () => {
        const threads = [thread('a', [])];
        const next = appendThreadMessage(threads, 'missing', { id: 'm1', body: 'hi' });
        expect(next).toBe(threads);
    });

    it('does not duplicate a message with an id already present', () => {
        const existing = { id: 'm1', body: 'hi' };
        const threads = [thread('a', [existing])];
        const next = appendThreadMessage(threads, 'a', { id: 'm1', body: 'again' });
        expect(next).toBe(threads);
        expect(threads[0].messages).toEqual([existing]);
    });

    it('preserves other thread fields when appending', () => {
        const threads: TestThread[] = [{ id: 'a', topic: 'General', messages: [] }];
        const next = appendThreadMessage(threads, 'a', { id: 'm1', body: 'hi' });
        expect(next[0]).toEqual({ id: 'a', topic: 'General', messages: [{ id: 'm1', body: 'hi' }] });
    });
});

describe('messagesApi.patchThreadMessage', () => {
    it('patches the matching message inside the matching thread', () => {
        const threads = [thread('a', [{ id: 'm1', body: 'hi' }, { id: 'm2', body: 'yo' }])];
        const next = patchThreadMessage(threads, 'a', 'm2', m => ({ ...m, body: 'edited' }));
        expect(next[0].messages).toEqual([{ id: 'm1', body: 'hi' }, { id: 'm2', body: 'edited' }]);
    });

    it('leaves other threads untouched (same reference)', () => {
        const other = thread('b', [{ id: 'x', body: 'unrelated' }]);
        const threads = [thread('a', [{ id: 'm1', body: 'hi' }]), other];
        const next = patchThreadMessage(threads, 'a', 'm1', m => ({ ...m, body: 'edited' }));
        expect(next[1]).toBe(other);
    });

    it('keeps thread order unchanged', () => {
        const threads = [thread('a', [{ id: 'm1', body: 'hi' }]), thread('b', []), thread('c', [])];
        const next = patchThreadMessage(threads, 'a', 'm1', m => ({ ...m, body: 'edited' }));
        expect(next.map(t => t.id)).toEqual(['a', 'b', 'c']);
    });

    it('leaves messages unmodified when messageId does not match anything', () => {
        const msg = { id: 'm1', body: 'hi' };
        const threads = [thread('a', [msg])];
        const next = patchThreadMessage(threads, 'a', 'missing', m => ({ ...m, body: 'nope' }));
        expect(next[0].messages).toEqual([msg]);
    });
});

describe('messagesApi.resolveConvParticipant', () => {
    function conv(id: string, participant: Contact): Conversation {
        return { id, participants: [participant], messages: [], pinned: false, muted: false };
    }
    const card = (over: Partial<Contact>): Contact => ({
        id: '5551234567', name: 'Card', initials: 'C', color: '#000', phone: '5551234567', ...over,
    });

    it('reverts to the formatted number when a saved contact was deleted', () => {
        const c = conv('5551234567', card({ name: 'John Smith' }));
        const next = resolveConvParticipant(c, new Map());
        expect(next.participants[0].name).toBe('(555) 123-4567');
        expect(next.participants[0].avatar).toBeUndefined();
    });

    it('uses the live contact card when the number is saved (add / rename)', () => {
        const c = conv('5551234567', card({ name: '(555) 123-4567', phone: '5551234567' }));
        const map = new Map<string, Contact>([['5551234567', card({ name: 'Jane Doe', avatar: 'a.png' })]]);
        const next = resolveConvParticipant(c, map);
        expect(next.participants[0].name).toBe('Jane Doe');
        expect(next.participants[0].avatar).toBe('a.png');
    });

    it('keeps a short service-code label (no revert to number)', () => {
        const c = conv('74682', card({ id: '74682', name: 'Photogram', phone: '74682' }));
        const next = resolveConvParticipant(c, new Map());
        expect(next).toBe(c);
        expect(next.participants[0].name).toBe('Photogram');
    });

    it('leaves group conversations untouched', () => {
        const c: Conversation = { ...conv('g-1', card({ name: 'Anyone' })), groupName: 'Wolfpack' };
        const next = resolveConvParticipant(c, new Map());
        expect(next).toBe(c);
    });

    it('returns the same reference when an unsaved number already shows its formatted form', () => {
        const c = conv('5551234567', contactFromNumber('5551234567'));
        const next = resolveConvParticipant(c, new Map());
        expect(next).toBe(c);
    });
});
