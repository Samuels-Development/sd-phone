import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronLeft, Copy, MessageSquare, Phone, Share, Video } from 'lucide-react';

import { ContactAvatar } from '@/shared/ContactAvatar';
import { ShareAction, ShareSheet } from '@/shared/ShareSheet';
import { AlertDialog } from '@/ui/AlertDialog';
import { copyToClipboard } from '@/lib/clipboard';
import { isFiveM } from '@/core/nui';
import { apiData } from '@/core/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import { requestOpenMessages } from '@/shell/deeplink';
import { EditContact } from './EditContact';
import { isNumberBlockedApi, setBlockedApi, shareContactApi } from '../contactsApi';
import { formatPhone, type Contact } from '../data';
import { requestVideoOnConnect } from '../calls/webrtc';
import { encodeWaypoint } from '@/lib/waypointCode';
import { sendMessageApi } from '@/shared/chat/messagesApi';
import { t } from '@/i18n';

export function ContactDetail({ contact, onBack, backLabel = t('phone.contacts','Contacts'), onCall, onUpdate, onDelete, onToggleFavorite, onSaveCard, minimal = false, animateIn = true }: {
    contact:           Contact;
    onBack:            () => void;
    backLabel?:        string;
    onCall?:           (target: { number: string; name?: string }) => void;
    onUpdate?:         (c: Contact) => void;
    onDelete?:         (id: string) => void;
    onToggleFavorite?: (id: string, favorite: boolean) => void;
    onSaveCard?:       (c: Contact) => void;
    minimal?:          boolean;
    animateIn?:        boolean;
}) {
    const [shown, setShown] = useState(!animateIn);
    const [current, setCurrent] = useState(contact);
    const [editing, setEditing] = useState(false);
    const [sharing, setSharing] = useState(false);
    const [copied,  setCopied]  = useState(false);
    const [phoneCopied, setPhoneCopied] = useState(false);
    const [blocked,         setBlocked]         = useState(false);
    const [confirmBlock,    setConfirmBlock]    = useState(false);
    const [confirmLocation, setConfirmLocation] = useState(false);
    useEffect(() => {
        if (!animateIn) return;
        const id = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(id);
    }, [animateIn]);

    // `current` is a local copy so edits/favorites reflect instantly, but the parent re-derives
    // the prop from the live contacts store (My Card's number changes on a SIM swap mid-view) -
    // sync when the prop CONTENT changes, keeping locally-toggled fields like favorite.
    const { name, initials, phone, email, address, avatar } = contact;
    useEffect(() => {
        setCurrent(c => ({ ...c, name, initials, phone, email, address, avatar }));
    }, [name, initials, phone, email, address, avatar]);

    useAsyncData(() => isNumberBlockedApi(current.phone), [current.phone], { enabled: !minimal, onData: setBlocked });

    function onBlockRow() {
        setConfirmBlock(true);
    }
    function doBlock() {
        const next = !blocked;
        setConfirmBlock(false);
        setBlocked(next);
        void setBlockedApi(current.phone, next);
    }

    async function doShareLocation() {
        setConfirmLocation(false);
        let wpCode: string | undefined;
        let wpSub:  string | undefined;
        if (isFiveM) {
            try {
                const r = await apiData<{ x: number; y: number }>('sd-phone:maps:here');
                if (r) {
                    wpCode = encodeWaypoint({ label: t('phone.sharedLocation','Shared Location'), x: r.x, y: r.y, icon: 'MapPin', color: '#eb4b3c' });
                    wpSub  = `${Math.round(r.x)}, ${Math.round(r.y)}`;
                }
            } catch { /* fall back to a coordless share */ }
        }
        void sendMessageApi({ conversation: current.phone, kind: 'location', body: t('phone.currentLocation','Current Location'), wpCode, wpSub });
    }

    return (
        <div
            className="absolute inset-0 flex flex-col bg-[#d4d4d4] dark:bg-base"
            style={{
                transform:  shown ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
            }}
            onTransitionEnd={() => { if (!shown) onBack(); }}
        >
            <div className="flex items-center justify-between px-3 py-2">
                <button type="button" onClick={() => setShown(false)} className="flex items-center text-ios-blue active:opacity-60">
                    <ChevronLeft className="h-[28px] w-[28px]" strokeWidth={2.4} />
                    <span className="-ml-0.5 text-[18px]">{backLabel}</span>
                </button>
                {(!minimal || onSaveCard) && (
                    <button type="button" onClick={() => setEditing(true)} className="px-1 text-[18px] text-ios-blue active:opacity-60">{t('phone.edit','Edit')}</button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-6">
                <div className="flex flex-col items-center pb-5 pt-1">
                    <ContactAvatar contact={current} size={134} />
                    <div className="mt-3 text-center text-[30px] font-semibold text-black dark:text-white">{current.name}</div>
                </div>

                <div className="mb-7 flex gap-3">
                    <ActionButton label={t('phone.actionMessage','message')} disabled={minimal} onClick={() => requestOpenMessages({ number: current.phone, name: current.name })} icon={<MessageSquare className="h-[28px] w-[28px]" strokeWidth={2} fill="currentColor" />} />
                    <ActionButton label={t('phone.actionCall','call')}    disabled={minimal} onClick={() => onCall?.({ number: current.phone, name: current.name })} icon={<Phone className="h-[28px] w-[28px]" strokeWidth={2} fill="currentColor" />} />
                    <ActionButton label={t('phone.actionVideo','video')}   disabled={minimal} onClick={() => { requestVideoOnConnect(); onCall?.({ number: current.phone, name: current.name }); }} icon={<Video className="h-[28px] w-[28px]" strokeWidth={2} fill="currentColor" />} />
                    <ActionButton label={t('phone.actionShare','share')}   onClick={() => setSharing(true)} icon={<Share className="h-[28px] w-[28px]" strokeWidth={2} />} />
                </div>

                <div className="mb-4 flex items-center rounded-[10px] bg-[#e5e5e5] px-4 py-3 dark:bg-surface">
                    <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-black/80 dark:text-white/80">{t('phone.phoneLabel','phone')}</div>
                        <div className="truncate text-[19px] text-ios-blue">{formatPhone(current.phone)}</div>
                    </div>
                    <button
                        type="button"
                        aria-label={phoneCopied ? t('phone.copied','Copied') : t('phone.copyNumber','Copy number')}
                        onClick={() => {
                            copyToClipboard(current.phone);
                            setPhoneCopied(true);
                            window.setTimeout(() => setPhoneCopied(false), 1500);
                        }}
                        className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ios-blue active:opacity-50"
                    >
                        {phoneCopied
                            ? <Check className="h-[20px] w-[20px]" strokeWidth={2.5} />
                            : <Copy className="h-[18px] w-[18px]" strokeWidth={2} />}
                    </button>
                </div>

                {(current.email || current.address) && (
                    <div className="mb-4 overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                        {current.email && <InfoField label={t('phone.email','email')} value={current.email} divider={!!current.address} />}
                        {current.address && <InfoField label={t('phone.address','address')} value={current.address} divider={false} />}
                    </div>
                )}

                {!minimal && (
                    <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                        <ActionRow label={t('phone.shareMyLocation','Share my Location')} onClick={() => setConfirmLocation(true)} />
                        <Divider />
                        <ActionRow
                            label={current.favorite ? t('phone.removeFromFavorites','Remove from Favorites') : t('phone.addToFavorites','Add to Favorites')}
                            onClick={() => {
                                const next = !current.favorite;
                                setCurrent(c => ({ ...c, favorite: next }));
                                onToggleFavorite?.(current.id, next);
                            }}
                        />
                        <Divider />
                        <ActionRow
                            label={blocked ? t('phone.unblockThisCaller','Unblock this Caller') : t('phone.blockThisCaller','Block this Caller')}
                            tone="red"
                            onClick={onBlockRow}
                        />
                    </div>
                )}
            </div>

            {editing && (
                <EditContact
                    contact={current}
                    lockPhone={minimal}
                    allowDelete={!minimal}
                    onCancel={() => setEditing(false)}
                    onSave={c => { setCurrent(c); (minimal ? onSaveCard : onUpdate)?.(c); setEditing(false); }}
                    onDelete={() => onDelete?.(current.id)}
                />
            )}

            {sharing && (
                <ShareSheet
                    onClose={() => { setSharing(false); setCopied(false); }}
                    onShare={(t) => shareContactApi(t.id, current)}
                >
                    <ShareAction
                        icon={<Copy className="h-[23px] w-[23px]" strokeWidth={2} />}
                        label={copied ? t('phone.copiedBang','Copied!') : t('phone.copyNumberTitle','Copy Number')}
                        onClick={() => { copyToClipboard(current.phone); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }}
                    />
                </ShareSheet>
            )}

            {confirmLocation && (
                <AlertDialog
                    title={t('phone.shareLocation','Share Location')}
                    message={t('phone.sendLocationConfirm','Send your current location to {name}?',{ name: current.name })}
                    cancelLabel={t('phone.cancel','Cancel')}
                    confirmLabel={t('phone.share','Share')}
                    onCancel={() => setConfirmLocation(false)}
                    onConfirm={doShareLocation}
                />
            )}

            {confirmBlock && (
                <AlertDialog
                    title={blocked ? t('phone.unblockThisCaller','Unblock this Caller') : t('phone.blockThisCaller','Block this Caller')}
                    message={blocked
                        ? t('phone.unblockMessage','{name} will be able to call and message you again.',{ name: current.name })
                        : t('phone.blockMessage','{name} will no longer be able to call or message you.',{ name: current.name })}
                    confirmLabel={blocked ? t('phone.unblock','Unblock') : t('phone.block','Block')}
                    destructive={!blocked}
                    onCancel={() => setConfirmBlock(false)}
                    onConfirm={doBlock}
                />
            )}
        </div>
    );
}

function ActionButton({ icon, label, disabled, onClick }: { icon: ReactNode; label: string; disabled?: boolean; onClick?: () => void }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className={`flex flex-1 flex-col items-center gap-2 rounded-[12px] py-4 ${
                disabled
                    ? 'bg-[#e5e5e5]/60 text-ios-gray dark:bg-surface/60'
                    : 'bg-[#e5e5e5] text-ios-blue active:opacity-70 dark:bg-surface'
            }`}
        >
            {icon}
            <span className="text-[13px] font-medium">{label}</span>
        </button>
    );
}

function InfoField({ label, value, divider }: { label: string; value: string; divider: boolean }) {
    const [copied, setCopied] = useState(false);
    return (
        <>
            <div className="flex items-center px-4 py-3">
                <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-black/80 dark:text-white/80">{label}</div>
                    <div className="break-all text-[19px] text-ios-blue">{value}</div>
                </div>
                <button
                    type="button"
                    aria-label={copied ? t('phone.copied','Copied') : t('phone.copyField','Copy {label}',{ label })}
                    onClick={() => {
                        copyToClipboard(value);
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1500);
                    }}
                    className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-full text-ios-blue active:opacity-50"
                >
                    {copied
                        ? <Check className="h-[20px] w-[20px]" strokeWidth={2.5} />
                        : <Copy className="h-[18px] w-[18px]" strokeWidth={2} />}
                </button>
            </div>
            {divider && <Divider />}
        </>
    );
}

function ActionRow({ label, tone = 'blue', onClick }: { label: string; tone?: 'blue' | 'red'; onClick?: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full px-4 py-3.5 text-left text-[19px] active:bg-black/5 dark:active:bg-white/5 ${
                tone === 'red' ? 'text-ios-red' : 'text-ios-blue'
            }`}
        >
            {label}
        </button>
    );
}

function Divider() {
    return <div className="pointer-events-none bg-black/10 dark:bg-white/10" style={{ marginLeft: 16, height: '0.5px' }} />;
}
