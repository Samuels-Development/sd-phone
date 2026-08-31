import { useEffect, useState } from 'react';
import { Camera, ChevronRight } from 'lucide-react';

import { t } from '@/i18n';
import { formatMoney } from '@/lib/money';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { AlertDialog } from '@/ui/AlertDialog';
import { Toggle } from '@/ui/Toggle';
import { apiDeleteAccount, apiPurchaseVerification, apiUpdateProfile, apiVerificationOffer, type VerificationOffer } from '../birdyApi';
import { ChangePasswordPage } from '@/shared/ChangePasswordPage';
import { AVATAR_EMPTY, BG, BLUE, CARD, LINE_STRONG, META, TEXT, type BirdyProfile } from '../data';
import { VerifiedBadge } from '../ui';
import { failText } from '@/core/api';

const RED = '#ff3b30';

export function EditProfile({ profile, onCancel, onSaved, onSignOut, onSignOutAll, onSwitchAccount, onDeleted, switchTo }: {
    profile:         BirdyProfile;
    onCancel:        () => void;
    onSaved:         (p: BirdyProfile) => void;
    onSignOut:       () => void;
    switchTo?:       string | null;
    onSignOutAll:    () => void;
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
    const [confirmAll,     setConfirmAll]     = useState(false);
    const [confirmDel,     setConfirmDel]     = useState(false);
    const [closing,        setClosing]        = useState(false);
    const [pwOpen,         setPwOpen]         = useState(false);
    const [offer,          setOffer]          = useState<VerificationOffer | null>(null);
    const [confirmVerify,  setConfirmVerify]  = useState(false);
    const [verifyError,    setVerifyError]    = useState<string | null>(null);

    useEffect(() => { void apiVerificationOffer().then(setOffer); }, []);

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
        onDeleted();
    }

    async function buyVerification() {
        if (busy || closing) return;
        setBusy(true);
        const res = await apiPurchaseVerification();
        setBusy(false);
        setConfirmVerify(false);
        if (res.ok) dismiss(() => onSaved({ ...profile, verified: true, verifiedType: 'blue' }));
        else setVerifyError(failText(res, t('squawk.verifyFailed', 'Something went wrong. Please try again.')));
    }

    return (
        <div
            className="absolute inset-0 z-40 flex flex-col text-label"
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
                <div className="text-[17px] font-semibold">{t('squawk.editProfile', 'Edit profile')}</div>
                <button type="button" onClick={save} disabled={busy} className="text-[17px] font-bold disabled:opacity-50" style={{ color: BLUE }}>{t('squawk.save', 'Save')}</button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                <div className="relative h-32 bg-hairline/10">
                    {banner && <img src={banner} alt="" draggable={false} className="h-full w-full object-cover" />}
                    <button type="button" onClick={() => setPicking('banner')} aria-label={t('squawk.changeCover', 'Change cover')} className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white" style={{ background: 'rgba(0,0,0,0.4)' }}>
                        <Camera className="h-[22px] w-[22px]" />
                    </button>
                    <button type="button" onClick={() => setPicking('avatar')} aria-label={t('squawk.changeAvatar', 'Change avatar')} className="absolute -bottom-10 left-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 text-white" style={{ borderColor: BG, background: AVATAR_EMPTY }}>
                        {avatar
                            ? <img src={avatar} alt="" draggable={false} className="h-full w-full object-cover" />
                            : <Camera className="h-7 w-7" />}
                    </button>
                </div>
                <div className="h-14" aria-hidden />

                <div className="flex flex-col gap-6 px-4 pb-8">
                    <Group>
                        <FieldRow label={t('squawk.name', 'Name')} divider>
                            <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-transparent text-[17px] text-label outline-none" style={{ caretColor: BLUE }} />
                        </FieldRow>

                        <FieldRow label={t('squawk.bio', 'Bio')} align="top" divider>
                            <textarea
                                value={bio}
                                onChange={e => setBio(e.target.value)}
                                rows={3}
                                placeholder={t('squawk.bioPlaceholder', 'Tell people about yourself')}
                                className="w-full resize-none bg-transparent text-[17px] leading-snug text-label outline-none placeholder:text-label/30"
                                style={{ caretColor: BLUE }}
                            />
                        </FieldRow>

                        <FieldRow label={t('squawk.joinDate', 'Join Date')} divider>
                            <span className="block text-[17px]" style={{ color: META }}>{profile.joined}</span>
                        </FieldRow>

                        <div className="flex items-center px-4 py-3">
                            <span className="flex-1 text-[17px] text-label">{t('squawk.privateAccount', 'Private account')}</span>
                            <div className="-my-1"><Toggle on={protect} onChange={setProtect} activeColor={BLUE} /></div>
                        </div>
                    </Group>

                    {offer?.enabled && !offer.verified && (
                        <Group footer={t('squawk.getVerifiedFooter', 'A blue check tells people this account is the real one. Business and government badges are issued by staff.')}>
                            <ActionRow
                                label={t('squawk.getVerified', 'Get Verified')}
                                left={<VerifiedBadge size={22} type="blue" />}
                                value={offer.price > 0 ? formatMoney(offer.price, { whole: true }) : undefined}
                                onPress={() => setConfirmVerify(true)}
                            />
                        </Group>
                    )}

                    <Group>
                        <ActionRow label={t('squawk.changePassword', 'Change Password')} divider onPress={() => setPwOpen(true)} />
                        <ActionRow label={t('accounts.switchAccount', 'Switch account')} onPress={() => dismiss(onSwitchAccount)} />
                    </Group>

                    <Group>
                        <ActionRow label={t('squawk.signOut', 'Sign Out')} tint={RED} chevron={false} divider onPress={() => setConfirmSignOut(true)} />
                        <ActionRow label={t('accounts.signOutAll', 'Log Out of All Accounts')} tint={RED} chevron={false} onPress={() => setConfirmAll(true)} />
                    </Group>

                    <Group>
                        <ActionRow label={t('squawk.deleteAccount', 'Delete Account')} tint={RED} chevron={false} onPress={() => setConfirmDel(true)} />
                    </Group>
                </div>

            </div>

            {confirmSignOut && (
                <AlertDialog
                    title={t('squawk.signOutTitle', 'Sign out of Squawk?')}
                    message={switchTo
                        ? t('accounts.signOutSwitchMessage', "You'll be switched to {name}.", { name: switchTo })
                        : t('squawk.signOutMessage', 'You can sign back in anytime.')}
                    confirmLabel={t('squawk.signOut', 'Sign Out')}
                    onCancel={() => setConfirmSignOut(false)}
                    onConfirm={signOut}
                />
            )}
            {confirmAll && (
                <AlertDialog
                    title={t('accounts.signOutAllTitle', 'Log out of all accounts?')}
                    message={t('accounts.signOutAllMessage', 'Every account you have in this app will be signed out. Saved passwords are kept.')}
                    confirmLabel={t('accounts.signOutAllConfirm', 'Log Out')}
                    destructive
                    onCancel={() => setConfirmAll(false)}
                    onConfirm={onSignOutAll}
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

            {confirmVerify && offer && (
                <AlertDialog
                    title={t('squawk.getVerifiedTitle', 'Get verified?')}
                    message={offer.price > 0
                        ? t('squawk.getVerifiedMessage', 'A blue check will be added to your profile. {price} will be taken from your {account} balance.', { price: formatMoney(offer.price, { whole: true }), account: offer.account })
                        : t('squawk.getVerifiedFree', 'A blue check will be added to your profile.')}
                    confirmLabel={t('squawk.getVerifiedConfirm', 'Verify')}
                    onCancel={() => setConfirmVerify(false)}
                    onConfirm={buyVerification}
                />
            )}
            {verifyError && (
                <AlertDialog
                    title={t('squawk.getVerifiedFailed', 'Could not verify')}
                    message={verifyError}
                    hideCancel
                    onCancel={() => setVerifyError(null)}
                    onConfirm={() => setVerifyError(null)}
                />
            )}

            {pwOpen && (
                <ChangePasswordPage
                    app="birdy"
                    appName="Birdy"
                    icon="birdy"
                    theme={{ accent: BLUE, welcomeBg: CARD, welcomeText: 'dark' }}
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

const HAIRLINE = 'pointer-events-none absolute inset-x-0 bottom-0 bg-hairline/[0.08]';

function Group({ children, footer }: { children: React.ReactNode; footer?: string }) {
    return (
        <div>
            <div className="overflow-hidden rounded-[12px] bg-surface">{children}</div>
            {footer && <p className="px-3 pt-2 text-[13px] leading-snug" style={{ color: META }}>{footer}</p>}
        </div>
    );
}

function FieldRow({ label, children, align = 'center', divider }: {
    label:     string;
    children:  React.ReactNode;
    align?:    'center' | 'top';
    divider?:  boolean;
}) {
    return (
        <div className={`relative flex gap-4 px-4 py-3 ${align === 'top' ? 'items-start' : 'items-center'}`}>
            <div className="w-[86px] shrink-0 text-[17px] text-label">{label}</div>
            <div className="min-w-0 flex-1">{children}</div>
            {divider && <span className={HAIRLINE} style={{ height: '0.5px' }} />}
        </div>
    );
}

function ActionRow({ label, tint, left, value, chevron = true, divider, onPress }: {
    label:    string;
    tint?:    string;
    left?:    React.ReactNode;
    value?:   string;
    chevron?: boolean;
    divider?: boolean;
    onPress:  () => void;
}) {
    return (
        <button type="button" onClick={onPress} className="relative flex w-full items-center gap-3 px-4 py-3 text-left active:bg-hairline/[0.04]">
            {left}
            <span className="flex-1 text-[17px]" style={{ color: tint ?? TEXT }}>{label}</span>
            {value && <span className="shrink-0 text-[17px]" style={{ color: META }}>{value}</span>}
            {chevron && <ChevronRight className="h-[17px] w-[17px] shrink-0" style={{ color: LINE_STRONG }} strokeWidth={2.5} />}
            {divider && <span className={HAIRLINE} style={{ height: '0.5px' }} />}
        </button>
    );
}

