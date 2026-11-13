import { create } from 'zustand';


export type PhoneResetScope = 'erase' | 'settings';

interface PhoneResetState {
    nonce: number;
    scope: PhoneResetScope;
    request: (scope: PhoneResetScope) => void;
}

export const usePhoneReset = create<PhoneResetState>(set => ({
    nonce: 0,
    scope: 'settings',
    request: scope => set(s => ({ nonce: s.nonce + 1, scope })),
}));

export function requestPhoneReset(scope: PhoneResetScope): void {
    usePhoneReset.getState().request(scope);
}
