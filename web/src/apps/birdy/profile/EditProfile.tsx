import { useState } from 'react';
import { Camera } from 'lucide-react';

import { t } from '@/i18n';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { AlertDialog } from '@/ui/AlertDialog';
import { Toggle } from '@/ui/Toggle';
import { apiDeleteAccount, apiUpdateProfile } from '../birdyApi';
import { accountsForgetPassword } from '@/core/accountsApi';
import { ChangePasswordPage } from '@/shared/ChangePasswordPage';
import { BG, BLUE, type BirdyProfile } from '../data';

const RED = '#ff3b30';

export function EditProfile({ profile, onCancel, onSaved, onSignOut, onSwitchAccount, onDeleted }: {
    profile:         BirdyProfile;
    onCancel:        () => void;
    onSaved:         (p: BirdyProfile) => void;
    onSignOut:       () => void;
    onSwitchAccount: () => void;
    onDeleted:       () => void;
}) {
    const [name,       setName]       = useState(profile.name);
    const [bio,        setBio]        = useState(profile.bio);
    const [protect,    setProtect]    = useState(profile.protected);
    const [avatar,     setAvatar]     = useState(profile.avatar);
    const [banner,     setBanner]     = useState(profile.banner);
    const [picking,    setPicking]    = useState<'avatar' | 'banner' | null>(null);
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
        const p = await apiUpdateProfile({ name, bio, protected: protect, avatar, banner });
        setBusy(false);
        if (p) dismiss(() => onSaved(p));
    }

    function signOut() {
        onSignOut();
    }

    async function remove() {
        await apiDeleteAccount();
        await accountsForgetPassword('birdy');
        onDeleted();
    }

    return (
        <div
            className="absolute inset-0 z-40 flex flex-col text-black"
            style={{
                background: BG,
                animation: closing
                    ? 'ios-sheet-down 0.34s cubic-bezier(0.4,0,1,1) forwards'
                    : 'ios-sheet-up 0.42s cubic-bezier(0.19,1,0.22,1)',
                willChange: 'transform',
            }}
        >
            <div className="h-[54px] shrink-0" aria-hidden />
            <header className="flex items-center justify-between px-4 py-2.5">
                <button type="button" onClick={() => dismiss(onCancel)} className="text-[17px]" style={{ color: BLUE }}>{t('squawk.cancel', 'Cancel')}</button>
                <div className="text-[18px] font-bold">{t('squawk.editProfile', 'Edit profile')}</div>
                <button type="button" onClick={save} disabled={busy} className="text-[17px] font-bold disabled:opacity-50" style={{ color: BLUE }}>{t('squawk.save', 'Save')}</button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                <div className="relative h-32 bg-black/10">
                    {banner && <img src={banner} alt="" draggable={false} className="h-full w-full object-cover" />}
                    <button type="button" onClick={() => setPicking('banner')} aria-label={t('squawk.changeCover', 'Change cover')} className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white" style={{ background: 'rgba(0,0,0,0.4)' }}>
                        <Camera className="h-[22px] w-[22px]" />
                    </button>
                    <button type="button" onClick={() => setPicking('avatar')} aria-label={t('squawk.changeAvatar', 'Change avatar')} className="absolute -bottom-10 left-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 text-white" style={{ borderColor: BG, background: '#5b6671' }}>
                        {avatar
                            ? <img src={avatar} alt="" draggable={false} className="h-full w-full object-cover" />
                            : <Camera className="h-7 w-7" />}
                    </button>
                </div>
                <div className="h-14" aria-hidden />

                <div className="mx-4 overflow-hidden rounded-[12px] bg-white">
                    <Row label={t('squawk.name', 'Name')}>
                        <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-transparent text-right text-[17px] text-black outline-none" style={{ caretColor: BLUE }} />
                    </Row>

                    <div className="border-b border-black/10 px-4 py-3.5">
                        <div className="text-[17px] font-bold text-black">{t('squawk.bio', 'Bio')}</div>
                        <textarea
                            value={bio}
                            onChange={e => setBio(e.target.value)}
                            rows={3}
                            placeholder={t('squawk.bioPlaceholder', 'Tell people about yourself')}
                            className="mt-1 w-full resize-none bg-transparent text-[17px] leading-snug text-black outline-none placeholder:text-black/35"
                            style={{ caretColor: BLUE }}
                        />
                    </div>

                    <Row label={t('squawk.joinDate', 'Join Date')}>
                        <span className="block w-full text-right text-[17px] text-black/45">{profile.joined}</span>
                    </Row>

                    <div className="flex items-center justify-between px-4 py-3.5">
                        <span className="text-[17px] font-bold">{t('squawk.privateAccount', 'Private account')}</span>
                        <Toggle on={protect} onChange={setProtect} activeColor={BLUE} />
                    </div>
                </div>

                <div className="flex flex-col gap-3 px-4 py-6">
                    <button type="button" onClick={() => setPwOpen(true)} className="w-full rounded-[12px] bg-white py-4 text-[18px] font-semibold active:opacity-70" style={{ color: BLUE }}>{t('squawk.changePassword', 'Change Password')}</button>
                    <button type="button" onClick={() => dismiss(onSwitchAccount)} className="w-full rounded-[12px] bg-white py-4 text-[18px] font-semibold active:opacity-70" style={{ color: BLUE }}>{t('accounts.switchAccount', 'Switch account')}</button>
                    <button type="button" onClick={() => setConfirmSignOut(true)} className="w-full rounded-[12px] bg-white py-4 text-[18px] font-semibold active:opacity-70" style={{ color: RED }}>{t('squawk.signOut', 'Sign Out')}</button>
                    <button type="button" onClick={() => setConfirmDel(true)} className="w-full rounded-[12px] bg-white py-4 text-[18px] font-semibold active:opacity-70" style={{ color: RED }}>{t('squawk.deleteAccount', 'Delete Account')}</button>
                </div>
            </div>

            {confirmSignOut && (
                <AlertDialog
                    title={t('squawk.signOutTitle', 'Sign out of Squawk?')}
                    message={t('squawk.signOutMessage', 'You can sign back in anytime.')}
                    confirmLabel={t('squawk.signOut', 'Sign Out')}
                    onCancel={() => setConfirmSignOut(false)}
                    onConfirm={signOut}
                />
            )}
            {confirmDel && (
                <AlertDialog
                    title={t('squawk.deleteAccountTitle', 'Delete account?')}
                    message={t('squawk.deleteAccountMessage', "This permanently removes your profile, posts and messages, and its saved login from the Passwords app. This can't be undone.")}
                    confirmLabel={t('squawk.delete', 'Delete')}
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

            {picking && (
                <MediaPickerSheet
                    filter={p => !p.video}
                    onSelect={p => { (picking === 'avatar' ? setAvatar : setBanner)(p.url); setPicking(null); }}
                    onClose={() => setPicking(null)}
                />
            )}
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex gap-4 border-b border-black/10 px-4 py-3.5">
            <div className="w-24 shrink-0 pt-0.5 text-[17px] font-bold text-black">{label}</div>
            <div className="flex-1">{children}</div>
        </div>
    );
}

