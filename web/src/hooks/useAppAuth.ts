import { useCallback, useEffect, useState } from 'react';

import { accountsMyEmail, accountsMyNumber, accountsSavedLogin, accountsSwitchable, type SwitchableAccount } from '@/core/accountsApi';

export interface AppAuthState {
    authed:        boolean;
    setAuthed:     (v: boolean) => void;
    authChecked:   boolean;
    justAuthed:    boolean;
    setJustAuthed: (v: boolean) => void;
    myNumber:      string | null;
    myEmails:      string[];
    savedLogin:    { username: string; password: string } | null;
    /** Saved logins for this app, minus whichever one is in use. */
    savedAccounts: SwitchableAccount[];
    refreshAccounts: () => void;
}

export function useAppAuth(appId: string, checkSession: () => Promise<boolean>): AppAuthState {
    const [authed,      setAuthed]      = useState(false);
    const [authChecked, setAuthChecked] = useState(false);
    const [justAuthed,  setJustAuthed]  = useState(false);
    const [myNumber,    setMyNumber]    = useState<string | null>(null);
    const [myEmails,    setMyEmails]    = useState<string[]>([]);
    const [savedLogin,  setSavedLogin]  = useState<{ username: string; password: string } | null>(null);
    const [savedAccounts, setSavedAccounts] = useState<SwitchableAccount[]>([]);
    const [accountsNonce, setAccountsNonce] = useState(0);

    useEffect(() => {
        void checkSession().then(ok => { setAuthed(ok); setAuthChecked(true); });
        void accountsMyNumber().then(setMyNumber);
        void accountsMyEmail().then(setMyEmails);
        void accountsSavedLogin(appId).then(setSavedLogin);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // The picker must never offer the account already in use, and which one that is changes on
    // every sign-in, switch and sign-out, so this refetches on the same nonce those bump.
    useEffect(() => {
        void accountsSwitchable(appId).then(d => {
            setSavedAccounts(d.accounts.filter(a => a.username !== d.active));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authed, accountsNonce]);

    const refreshAccounts = useCallback(() => setAccountsNonce(n => n + 1), []);

    return { authed, setAuthed, authChecked, justAuthed, setJustAuthed, myNumber, myEmails, savedLogin, savedAccounts, refreshAccounts };
}
