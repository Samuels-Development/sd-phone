import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { portalToPhoneScreen } from '@/ui/portal';
import { AlertDialog } from '@/ui/AlertDialog';
import { ChangePasswordForm } from './AppAuth';
import type { AppAuthTheme } from './AppAuth';
import { accountsChangePassword, accountsListPasswords, accountsMe, accountsSavePassword } from '@/core/accountsApi';

export function ChangePasswordPage({ app, appName, icon, theme, identity: identityProp, onClose }: {
    app:       string;
    appName:   string;
    icon?:     string;
    theme:     AppAuthTheme;
    identity?: string;
    onClose:   () => void;
}) {
    const [identity, setIdentity] = useState<string | null>(identityProp ?? null);
    const [savedPassword, setSavedPassword] = useState<string | null>(null);
    const hasVaultEntry = useRef(false);
    // Set after a successful change when no vault row exists; triggers the save offer on close.
    const pendingOffer = useRef<string | null>(null);
    const [offer, setOffer] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        void (async () => {
            let id = identityProp ?? null;
            if (!id) {
                const { me } = await accountsMe(app);
                id = me?.username ?? null;
            }
            if (!alive) return;
            setIdentity(id);
            const entries = await accountsListPasswords();
            const entry = entries.find(e => e.app === app && (e.username === id || e.email === id));
            if (alive) {
                hasVaultEntry.current = !!entry;
                setSavedPassword(entry?.password ?? null);
            }
        })();
        return () => { alive = false; };
    }, [app, identityProp]);

    function handleBack() {
        if (pendingOffer.current) { setOffer(pendingOffer.current); return; }
        onClose();
    }

    async function saveToVault(password: string) {
        await accountsSavePassword(app, {
            username: identity ?? '',
            password,
            email: identity?.includes('@') ? identity : undefined,
        });
        onClose();
    }

    const form = (
        <div className="absolute inset-0 z-50">
            <ChangePasswordForm
                appName={appName}
                icon={icon}
                theme={theme}
                identity={identity ?? undefined}
                savedPassword={savedPassword}
                onSubmit={async (current, next) => {
                    const r = await accountsChangePassword(app, identity ?? '', current, next);
                    if (!r.ok) return r.message ?? t('common.couldNotChangePassword', 'Could not change password');
                    // The server only UPDATEs an existing vault row; offer to create one otherwise.
                    if (!hasVaultEntry.current) pendingOffer.current = next;
                    return null;
                }}
                onBack={handleBack}
            />

            {offer && (
                <AlertDialog
                    title={t('common.saveToPasswords', 'Save to Passwords?')}
                    message={t('common.savePasswordsBody', 'Keep your {appName} username and password in the Passwords app so you can always find them.', { appName })}
                    confirmLabel={t('common.save', 'Save')}
                    cancelLabel={t('common.notNow', 'Not Now')}
                    onCancel={onClose}
                    onConfirm={() => void saveToVault(offer)}
                />
            )}
        </div>
    );

    return portalToPhoneScreen(form);
}
