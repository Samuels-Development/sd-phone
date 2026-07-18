import { useState } from 'react';
import { Camera } from 'lucide-react';

import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { Toggle } from '@/ui/Toggle';
import { apiDeleteAccount, apiLogout, apiUpdateProfile } from '../birdyApi';
import { accountsForgetPassword } from '@/core/accountsApi';
import { ChangePasswordPage } from '@/shared/ChangePasswordPage';
import { BLUE, META, type BirdyProfile } from '../data';

const RED = '#f4212e';

export function EditProfile({ profile, onCancel, onSaved, onSignOut, onDeleted }: {
    profile:   BirdyProfile;
    onCancel:  () => void;
    onSaved:   (p: BirdyProfile) => void;
    onSignOut: () => void;
    onDeleted: () => void;
}) {
    const [name,       setName]       = useState(profile.name);
    const [bio,        setBio]        = useState(profile.bio);
    const [protect,    setProtect]    = useState(profile.protected);
    const [busy,       setBusy]       = useState(false);
    const [confirmSignOut, setConfirmSignOut] = useState(false);
    const [confirmDel,     setConfirmDel]     = useState(false);
    const [closing,        setClosing]        = useState(false);
    const [pwOpen,         setPwOpen]         = useState(false);

    function dismiss(after: () => void) {
        if (closing) return;
        setClosing(true);
        window.setTimeout(after, 340);
    }

    async function save() {
        if (busy || closing) return;
        setBusy(true);
        const p = await apiUpdateProfile({ name, bio, protected: protect });
        setBusy(false);
        if (p) dismiss(() => onSaved(p));
    }

    async function signOut() {
        await apiLogout();
        onSignOut();
    }

    async function remove() {
        await apiDeleteAccount();
        await accountsForgetPassword('birdy');
        onDeleted();
    }

    return (
        <div
            className="absolute inset-0 z-40 flex flex-col bg-[#f2f3f5] text-black"
            style={{
                animation: closing
                    ? 'ios-sheet-down 0.34s cubic-bezier(0.4,0,1,1) forwards'
                    : 'ios-sheet-up 0.42s cubic-bezier(0.19,1,0.22,1)',
                willChange: 'transform',
            }}
        >
            <div className="h-[54px] shrink-0" aria-hidden />
            <header className="flex items-center justify-between px-4 py-2.5">
                <button type="button" onClick={() => dismiss(onCancel)} className="text-[15px]" style={{ color: META }}>{t('birdy.cancel', 'Cancel')}</button>
                <div className="text-[18px] font-bold">{t('birdy.editProfile', 'Edit profile')}</div>
                <button type="button" onClick={save} disabled={busy} className="text-[15px] font-bold disabled:opacity-50" style={{ color: BLUE }}>{t('birdy.save', 'Save')}</button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="relative h-28 bg-black/10">
                    <button type="button" aria-label={t('birdy.changeCover', 'Change cover')} className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white" style={{ background: 'rgba(0,0,0,0.4)' }}>
                        <Camera className="h-5 w-5" />
                    </button>
                    <button type="button" aria-label={t('birdy.changeAvatar', 'Change avatar')} className="absolute -bottom-7 left-4 flex h-16 w-16 items-center justify-center rounded-full border-4 text-white" style={{ borderColor: '#f2f3f5', background: '#5b6671' }}>
                        <Camera className="h-6 w-6" />
                    </button>
                </div>
                <div className="h-9" aria-hidden />

                <div className="bg-white">
                    <Row label={t('birdy.name', 'Name')}>
                        <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-transparent text-right text-[17px] outline-none" style={{ color: BLUE }} />
                    </Row>

                    <div className="border-b border-black/[0.07] px-4 py-3.5">
                        <div className="text-[17px] font-bold text-black">{t('birdy.bio', 'Bio')}</div>
                        <textarea
                            value={bio}
                            onChange={e => setBio(e.target.value)}
                            rows={3}
                            className="mt-2 w-full resize-none rounded-xl border border-black/15 bg-white px-3 py-2.5 text-[17px] leading-snug outline-none focus:border-[#1d9bf0]"
                            style={{ color: BLUE }}
                        />
                    </div>

                    {/* Read-only: the join date comes from the account's created_at, so it is
                        shown rather than edited. */}
                    <Row label={t('birdy.joinDate', 'Join Date')}>
                        <span className="block w-full text-right text-[17px] text-black/45">{profile.joined}</span>
                    </Row>

                    <div className="flex items-center justify-between px-4 py-3.5">
                        <span className="text-[17px] font-bold">{t('birdy.privateAccount', 'Private account')}</span>
                        <Toggle on={protect} onChange={setProtect} activeColor={BLUE} scale={0.85} />
                    </div>
                </div>

                <div className="flex flex-col gap-3.5 px-4 py-8">
                    <button type="button" onClick={() => setPwOpen(true)} className="w-full rounded-full bg-black/[0.06] py-4 text-[18px] font-bold text-black active:opacity-70">{t('birdy.changePassword', 'Change Password')}</button>
                    <button type="button" onClick={() => setConfirmSignOut(true)} className="w-full rounded-full py-4 text-[18px] font-bold text-white" style={{ background: BLUE }}>{t('birdy.signOut', 'Sign Out')}</button>
                    <button type="button" onClick={() => setConfirmDel(true)} className="w-full rounded-full py-4 text-[18px] font-bold text-white" style={{ background: RED }}>{t('birdy.deleteAccount', 'Delete Account')}</button>
                </div>
            </div>

            {confirmSignOut && (
                <AlertDialog
                    title={t('birdy.signOutTitle', 'Sign out of Birdy?')}
                    message={t('birdy.signOutMessage', 'You can sign back in anytime.')}
                    confirmLabel={t('birdy.signOut', 'Sign Out')}
                    onCancel={() => setConfirmSignOut(false)}
                    onConfirm={signOut}
                />
            )}
            {confirmDel && (
                <AlertDialog
                    title={t('birdy.deleteAccountTitle', 'Delete account?')}
                    message={t('birdy.deleteAccountMessage', "This permanently removes your profile, posts and messages, and its saved login from the Passwords app. This can't be undone.")}
                    confirmLabel={t('birdy.delete', 'Delete')}
                    destructive
                    onCancel={() => setConfirmDel(false)}
                    onConfirm={remove}
                />
            )}

            {pwOpen && (
                <ChangePasswordPage
                    app="birdy"
                    appName="Birdy"
                    icon="birdy"
                    theme={{ accent: BLUE, welcomeBg: '#f2f3f5', welcomeText: 'dark' }}
                    onClose={() => setPwOpen(false)}
                />
            )}
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex gap-4 border-b border-black/[0.07] px-4 py-3.5">
            <div className="w-24 shrink-0 pt-0.5 text-[17px] font-bold text-black">{label}</div>
            <div className="flex-1">{children}</div>
        </div>
    );
}

