import { useCallback, useEffect, useState } from 'react';
import { Car, ChevronRight, KeyRound, LogOut, Star, Trash2, Users, X } from 'lucide-react';

import { AppAuth } from '@/shared/AppAuth';
import { AccountSwitcher } from '@/shared/AccountSwitcher';
import { ChangePasswordPage } from '@/shared/ChangePasswordPage';
import { InitialsAvatar } from '@/shared/ContactAvatar';
import { AlertDialog } from '@/ui/AlertDialog';
import { ListGroup } from '@/ui/ListGroup';
import { t } from '@/i18n';
import {
    MAIL_DOMAIN, accountsConfirmReset, accountsLogin, accountsLogout,
    accountsMe, accountsMyEmail, accountsMyNumber, accountsRegister, accountsRequestReset,
    accountsSavePassword, accountsSavedLogin, accountsSignInOptions, accountsSuggestCode, accountsSwitch,
    type SwitchableAccount,
} from '@/core/accountsApi';
import { signOutAllForApp } from '@/shared/signOutAll';
import { logOutOrSwitch, switchTargetLabel } from '@/shared/logOutOrSwitch';
import { driverStats, useRyde } from '../store';
import { money } from '../data';
import { rydeDeleteAccount } from '../rydeApi';

export function Account({ onClose }: { onClose: () => void }) {
    const g = useRyde();

    const { authChecked, authed, me, setAuth } = g;
    const [myNumber,    setMyNumber]    = useState<string | null>(null);
    const [myEmails,    setMyEmails]    = useState<string[]>([]);
    const [savedAccounts, setSavedAccounts] = useState<SwitchableAccount[]>([]);
    const [savedLogin,  setSavedLogin]  = useState<{ username: string; password: string } | null>(null);
    const [confirmSignOut, setConfirmSignOut] = useState(false);
    const [confirmSignOutAll, setConfirmSignOutAll] = useState(false);
    const [switching,      setSwitching]      = useState(false);
    const [adding,         setAdding]         = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [pwOpen, setPwOpen] = useState(false);

    const refreshAccounts = useCallback(() => {
        void accountsSavedLogin('ryde').then(setSavedLogin);
        void accountsSignInOptions('ryde').then(setSavedAccounts);
    }, []);

    // Ryde keeps rides and the driver profile locally and only syncs them on mount, so without
    // this wipe the new account inherits the previous one's history, earnings and driver status.
    const afterAccountChange = useCallback(() => {
        g.wipeAccount();
        void accountsMe('ryde').then(s => setAuth(s.loggedIn, s.me));
        refreshAccounts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshAccounts, setAuth]);

    useEffect(() => {
        void accountsMyNumber().then(setMyNumber);
        void accountsMyEmail().then(setMyEmails);
        refreshAccounts();
    }, [refreshAccounts, authed]);

    const done = g.rides.filter(r => r.role === 'rider' && r.status === 'completed');
    const spent = Math.round(done.reduce((s, r) => s + r.fare, 0) * 100) / 100;
    const rating = driverStats(g.rides).avgRating;

    if (!authChecked) {
        return <div className="absolute inset-0 bg-ios-gray6 dark:bg-base" />;
    }

    const authScreen = (
            <AppAuth
                appId="ryde"
                appName="Ryde"
                tagline={t('ryde.tagline', 'Your ride, your schedule.')}
                icon="ryde"
                theme={{ accent: '#111111', welcomeBg: '#ffffff', welcomeText: 'dark' }}
                myNumber={myNumber}
                savedLogin={adding ? null : savedLogin}
                myEmails={myEmails}
                savedAccounts={savedAccounts}
                onPickAccount={u => accountsSwitch('ryde', u)}
                fields={[
                    { key: 'username', label: t('ryde.fieldUsername', 'Username') },
                    { key: 'name',     label: t('ryde.fieldName', 'Name') },
                    { key: 'password', label: t('ryde.fieldPassword', 'Password'), type: 'password' },
                    { key: 'email',    label: t('ryde.fieldEmail', 'Email'), suffix: `@${MAIL_DOMAIN}`, createOnly: true },
                    { key: 'phone',    label: t('ryde.fieldPhone', 'Phone'), type: 'tel', createOnly: true },
                ]}
                onSubmit={async (mode, vals) => {
                    const r = mode === 'create'
                        ? await accountsRegister('ryde', vals)
                        : await accountsLogin('ryde', vals);
                    return { ok: r.ok, message: r.message };
                }}
                onAuthed={() => {
                    if (adding) { setAdding(false); afterAccountChange(); }
                    else void accountsMe('ryde').then(s => setAuth(true, s.me));
                }}
                onDismiss={adding ? () => setAdding(false) : onClose}
                modal={adding}
                onRequestReset={(id) => accountsRequestReset('ryde', id)}
                onConfirmReset={(id, code, pw) => accountsConfirmReset('ryde', id, code, pw)}
                onSuggestCode={(id) => accountsSuggestCode('ryde', id)}
                onSaveCredentials={(vals) => accountsSavePassword('ryde', vals)}
            />
    );

    if (!authed) return authScreen;

    async function signOut() {
        const switched = await logOutOrSwitch('ryde');
        setConfirmSignOut(false);
        if (switched) { afterAccountChange(); return; }
        g.wipeAccount();
        setAuth(false, null);
        refreshAccounts();
    }

    async function signOutAll() {
        await signOutAllForApp('ryde');
        setConfirmSignOutAll(false);
        g.wipeAccount();
        setAuth(false, null);
        refreshAccounts();
    }

    async function deleteAccount() {
        await rydeDeleteAccount();
        await accountsLogout('ryde');
        g.wipeAccount();
        setConfirmDelete(false);
        setAuth(false, null);
        refreshAccounts();
    }

    const displayName = me?.name || me?.username || t('ryde.you', 'You');

    return (
        <div className="absolute inset-0 flex flex-col bg-[#d4d4d4] font-sf dark:bg-base">
            <div className="flex shrink-0 items-center justify-between px-5 pb-2" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
                <h1 className="text-[34px] font-bold tracking-tight text-black dark:text-white">{t('ryde.account', 'Account')}</h1>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('ryde.close', 'Close')}
                    className="-mr-1 flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.08] text-black active:opacity-60 dark:bg-white/10 dark:text-white"
                >
                    <X className="h-[20px] w-[20px]" strokeWidth={2.4} />
                </button>
            </div>

            <div className="no-scrollbar flex-1 overflow-y-auto pb-10">
                <div className="mx-4 mt-1 flex items-center gap-4 rounded-[12px] bg-[#e5e5e5] p-4 dark:bg-surface">
                    <InitialsAvatar name={displayName} color="#111" size={64} />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[23px] font-bold tracking-tight text-black dark:text-white">{displayName}</p>
                        <p className="mt-0.5 inline-flex items-center gap-1.5 text-[16px] text-ios-gray">
                            {rating != null && <Star className="h-[17px] w-[17px]" style={{ color: '#FF9600', fill: '#FF9600' }} />}
                            {rating != null ? t('ryde.ratingRider', '{rating} · Rider', { rating: rating.toFixed(2) }) : t('ryde.rider', 'Rider')}
                        </p>
                        {me?.username && <p className="mt-0.5 truncate text-[15px] text-ios-gray3">@{me.username}</p>}
                    </div>
                </div>

                <div className="mx-4 mt-3 grid grid-cols-2 gap-3">
                    <Stat label={t('ryde.tripsTaken', 'Trips taken')} value={String(done.length)} />
                    <Stat label={t('ryde.totalSpent', 'Total spent')} value={money(spent)} />
                </div>

                <Section title={t('ryde.driving', 'Driving')}>
                    <Row icon={<Car className="h-[24px] w-[24px] text-white" strokeWidth={2.1} />} iconBg="#FF9600" label={g.driver.enabled ? t('ryde.driverDashboard', 'Driver dashboard') : t('ryde.driveWithRyde', 'Drive with Ryde')} value={g.driver.enabled ? t('ryde.tripsCount', '{n} trips', { n: g.driver.trips }) : t('ryde.earnMoney', 'Earn money')} onClick={() => { onClose(); g.setTab('driver'); }} />
                </Section>

                <Section title={t('ryde.account', 'Account')}>
                    <button
                        onClick={() => setPwOpen(true)}
                        className="relative flex w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-black/5 dark:active:bg-white/5"
                    >
                        <div className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[9px] shadow-sm" style={{ background: '#0A84FF' }}>
                            <KeyRound className="h-[21px] w-[21px] text-white" strokeWidth={2.2} />
                        </div>
                        <span className="flex-1 text-[18px] font-medium text-black dark:text-white">{t('ryde.changePassword', 'Change password')}</span>
                        <ChevronRight className="h-[19px] w-[19px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
                        <div className="pointer-events-none absolute bottom-0 right-0 bg-ios-gray4 dark:bg-control" style={{ left: '70px', height: '0.5px' }} />
                    </button>
                    <button
                        onClick={() => setSwitching(true)}
                        className="relative flex w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-black/5 dark:active:bg-white/5"
                    >
                        <div className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[9px] shadow-sm" style={{ background: '#0A84FF' }}>
                            <Users className="h-[22px] w-[22px] text-white" strokeWidth={2.2} />
                        </div>
                        <span className="flex-1 text-[18px] font-medium text-black dark:text-white">{t('accounts.switchAccount', 'Switch account')}</span>
                        <ChevronRight className="h-[19px] w-[19px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
                        <div className="pointer-events-none absolute bottom-0 right-0 bg-ios-gray4 dark:bg-control" style={{ left: '70px', height: '0.5px' }} />
                    </button>
                    <button
                        onClick={() => setConfirmSignOut(true)}
                        className="relative flex w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-black/5 dark:active:bg-white/5"
                    >
                        <div className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[9px] shadow-sm" style={{ background: '#FF3B30' }}>
                            <LogOut className="h-[22px] w-[22px] text-white" strokeWidth={2.2} />
                        </div>
                        <span className="flex-1 text-[18px] font-medium text-ios-red">{t('ryde.signOut', 'Sign out')}</span>
                        <div className="pointer-events-none absolute bottom-0 right-0 bg-ios-gray4 dark:bg-control" style={{ left: '70px', height: '0.5px' }} />
                    </button>
                    <button
                        onClick={() => setConfirmSignOutAll(true)}
                        className="relative flex w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-black/5 dark:active:bg-white/5"
                    >
                        <div className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[9px] shadow-sm" style={{ background: '#FF3B30' }}>
                            <LogOut className="h-[22px] w-[22px] text-white" strokeWidth={2.2} />
                        </div>
                        <span className="flex-1 text-[18px] font-medium text-ios-red">{t('accounts.signOutAll', 'Log Out of All Accounts')}</span>
                        <div className="pointer-events-none absolute bottom-0 right-0 bg-ios-gray4 dark:bg-control" style={{ left: '70px', height: '0.5px' }} />
                    </button>
                    <button
                        onClick={() => setConfirmDelete(true)}
                        className="flex w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-black/5 dark:active:bg-white/5"
                    >
                        <div className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[9px] shadow-sm" style={{ background: '#FF3B30' }}>
                            <Trash2 className="h-[20px] w-[20px] text-white" strokeWidth={2.2} />
                        </div>
                        <span className="flex-1 text-[18px] font-medium text-ios-red">{t('ryde.deleteAccount', 'Delete account')}</span>
                    </button>
                </Section>
            </div>

            {switching && (
                <AccountSwitcher
                    app="ryde"
                    onClose={() => setSwitching(false)}
                    onSwitched={afterAccountChange}
                    onAdd={() => setAdding(true)}
                />
            )}

            {confirmSignOut && (
                <AlertDialog
                    title={t('ryde.signOutTitle', 'Sign out of Ryde?')}
                    message={switchTargetLabel(savedAccounts[0])
                        ? t('accounts.signOutSwitchMessage', "You'll be switched to {name}.", { name: switchTargetLabel(savedAccounts[0]) as string })
                        : t('ryde.signOutMessage', "You'll need to log in again to view your account.")}
                    confirmLabel={t('ryde.signOutConfirm', 'Sign Out')}
                    destructive
                    onCancel={() => setConfirmSignOut(false)}
                    onConfirm={() => { void signOut(); }}
                />
            )}

            {confirmSignOutAll && (
                <AlertDialog
                    title={t('accounts.signOutAllTitle', 'Log out of all accounts?')}
                    message={t('accounts.signOutAllMessage', 'Every account you have in this app will be signed out. Saved passwords are kept.')}
                    confirmLabel={t('accounts.signOutAllConfirm', 'Log Out')}
                    destructive
                    onCancel={() => setConfirmSignOutAll(false)}
                    onConfirm={() => { void signOutAll(); }}
                />
            )}

            {confirmDelete && (
                <AlertDialog
                    title={t('ryde.deleteTitle', 'Delete Ryde account?')}
                    message={t('ryde.deleteMessage', "This permanently deletes your Ryde account, driver profile and stats, and removes its saved login from the Passwords app. This can't be undone.")}
                    confirmLabel={t('ryde.deleteConfirm', 'Delete')}
                    destructive
                    onCancel={() => setConfirmDelete(false)}
                    onConfirm={() => { void deleteAccount(); }}
                />
            )}

            {pwOpen && (
                <ChangePasswordPage
                    app="ryde"
                    appName="Ryde"
                    icon="ryde"
                    theme={{ accent: '#111111', welcomeBg: '#ffffff', welcomeText: 'dark' }}
                    identity={me?.username}
                    onClose={() => setPwOpen(false)}
                />
            )}

            {adding && <div className="absolute inset-0 z-[70]">{authScreen}</div>}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-[12px] bg-[#e5e5e5] p-3.5 dark:bg-surface">
            <p className="text-[26px] font-extrabold tracking-tight text-black dark:text-white">{value}</p>
            <p className="mt-0.5 text-[14px] text-ios-gray">{label}</p>
        </div>
    );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="mt-6">
            <ListGroup header={title}>{children}</ListGroup>
        </div>
    );
}

const ROW_DIVIDER_LEFT = 70;
function Row({ icon, iconBg, label, value, onClick, divider = false }: {
    icon: React.ReactNode; iconBg: string; label: string; value?: string; onClick?: () => void; divider?: boolean;
}) {
    return (
        <button onClick={onClick} className="relative flex w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-black/5 dark:active:bg-white/5">
            <div className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[9px] shadow-sm" style={{ background: iconBg }}>
                {icon}
            </div>
            <span className="min-w-0 flex-1 truncate text-[18px] leading-snug text-black dark:text-white">{label}</span>
            {value && <span className="shrink-0 text-[16px] text-ios-gray">{value}</span>}
            <ChevronRight className="h-[19px] w-[19px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
            {divider && (
                <div className="pointer-events-none absolute bottom-0 right-0 bg-ios-gray4 dark:bg-control" style={{ left: `${ROW_DIVIDER_LEFT}px`, height: '0.5px' }} />
            )}
        </button>
    );
}
