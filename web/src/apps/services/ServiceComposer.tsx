import { useEffect, useRef, useState } from 'react';
import { ArrowUp, MapPin, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { isFiveM } from '@/core/nui';
import { apiData } from '@/core/api';
import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { PhotosIcon } from '@/shell/AppIconSVG';
import { encodeWaypoint } from '@/lib/waypointCode';
import { EmojiPanel } from '@/shared/chat/EmojiPanel';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { warmPhotos } from '@/core/photosApi';
import type { ServiceDraft } from './servicesApi';

type Panel = 'emoji' | null;

const ACTION_BTNS: { id: string; label: string; emoji?: string; Icon?: LucideIcon }[] = [
    { id: 'emoji',    label: 'Emoji',    emoji: '😊' },
    { id: 'photos',   label: 'Photos' },   // rendered with the Photos app icon
    { id: 'location', label: 'Location', Icon: MapPin },
];

export function ServiceComposer({ isDark, onSend }: {
    isDark: boolean;
    onSend: (draft: ServiceDraft) => void;
}) {
    const [draft,       setDraft]       = useState('');
    const [panel,       setPanel]       = useState<Panel>(null);
    const [attachments, setAttachments] = useState<string[]>([]);
    const [picking,     setPicking]     = useState(false);
    const [confirmLocation, setConfirmLocation] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { warmPhotos(); }, []);

    function togglePanel(p: Panel) { setPanel(prev => (prev === p ? null : p)); inputRef.current?.blur(); }
    function openPhotos()        { setPicking(true);    setPanel(null); inputRef.current?.blur(); }
    function openShareLocation() { setConfirmLocation(true); setPanel(null); inputRef.current?.blur(); }

    function sendText() {
        const text = draft.trim();
        if (!text && attachments.length === 0) return;
        attachments.forEach(url => onSend({ kind: 'image', mediaUrl: url, body: t('services.photoLabel', '📷 Photo') }));
        if (text) onSend({ kind: 'text', body: text });
        setDraft('');
        setAttachments([]);
        setPanel(null);
        inputRef.current?.focus();
    }

    function removeAttachment(idx: number) {
        setAttachments(prev => prev.filter((_, i) => i !== idx));
    }

    function handleKey(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
    }

    const hasContent = draft.trim().length > 0 || attachments.length > 0;

    const trayBg  = isDark ? 'rgb(var(--surface))' : 'rgb(var(--base))';
    const btnBg   = isDark ? 'rgb(var(--elevated))' : '#fff';
    const pillBg  = isDark ? 'rgb(var(--surface))' : 'rgb(var(--base))';
    const pillBdr = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

    return (
        <div className="relative shrink-0">
            {panel === 'emoji' && (
                <div className="absolute inset-x-0 bottom-full z-20">
                    <EmojiPanel isDark={isDark} onSelect={e => setDraft(d => d + e)} />
                </div>
            )}

            {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 px-4 pb-1 pt-2">
                    {attachments.map((url, i) => (
                        <div key={`${url}-${i}`} className="relative">
                            <img src={url} alt="" className="h-[85px] w-[85px] rounded-[12px] object-cover" />
                            <button
                                type="button"
                                onClick={() => removeAttachment(i)}
                                aria-label={t('services.removeImage', 'Remove image')}
                                className="absolute right-1 top-1 flex h-[20px] w-[20px] items-center justify-center rounded-full bg-black/55 active:opacity-70"
                            >
                                <X className="h-[12px] w-[12px] text-white" strokeWidth={2.75} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="px-3 pb-2 pt-1.5">
                <div
                    className={`flex items-center gap-1 rounded-[22px] py-[9px] pl-4 ${hasContent ? 'pr-[5px]' : 'pr-4'}`}
                    style={{ background: pillBg, border: `0.5px solid ${pillBdr}` }}
                >
                    <input
                        ref={inputRef}
                        type="text"
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={handleKey}
                        onFocus={() => setPanel(null)}
                        placeholder={t('services.messagePlaceholder', 'Message')}
                        maxLength={300}
                        className="min-w-0 flex-1 bg-transparent py-[5px] text-[18px] text-black placeholder-black/35 outline-none dark:text-white dark:placeholder-white/35"
                    />
                    {hasContent && (
                        <button
                            type="button"
                            onClick={sendText}
                            aria-label={t('services.send', 'Send')}
                            className="flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full bg-ios-blue active:opacity-70"
                        >
                            <ArrowUp className="h-[19px] w-[19px] text-white" strokeWidth={2.75} />
                        </button>
                    )}
                </div>
            </div>

            <div
                className="flex items-center justify-around px-4 pb-11 pt-2.5"
                style={{ background: trayBg, borderTop: `0.5px solid ${pillBdr}` }}
            >
                {ACTION_BTNS.map(btn => {
                    const Icon = btn.Icon;
                    return (
                        <button
                            key={btn.id}
                            type="button"
                            onClick={() => (btn.id === 'photos' ? openPhotos() : btn.id === 'location' ? openShareLocation() : togglePanel(btn.id as Panel))}
                            className="flex h-[48px] w-[64px] items-center justify-center rounded-[16px] transition-opacity active:opacity-60"
                            style={{ background: btnBg, boxShadow: '0 1px 3px rgba(0,0,0,0.18)' }}
                        >
                            {btn.id === 'photos' ? (
                                <span
                                    className="block overflow-hidden rounded-[7px] [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
                                    style={{ width: 30, height: 30 }}
                                >
                                    <PhotosIcon />
                                </span>
                            ) : Icon ? (
                                <Icon
                                    className={`text-black dark:text-white ${btn.id === 'location' ? 'h-[27px] w-[27px]' : 'h-[25px] w-[25px]'}`}
                                    strokeWidth={2}
                                />
                            ) : (
                                <span className="text-[23px] leading-none">{btn.emoji}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {picking && (
                <MediaPickerSheet
                    multiple
                    forceDark={isDark}
                    onSelectMany={ps => { setAttachments(prev => [...prev, ...ps.map(p => p.url)]); setPicking(false); }}
                    onClose={() => setPicking(false)}
                />
            )}

            {confirmLocation && (
                <AlertDialog
                    title={t('services.shareLocation', 'Share Location')}
                    message={t('services.shareLocationMsg', 'Are you sure you want to share your location?')}
                    cancelLabel={t('services.cancel', 'Cancel')}
                    confirmLabel={t('services.share', 'Share')}
                    forceDark={isDark}
                    onCancel={() => setConfirmLocation(false)}
                    onConfirm={async () => {
                        setConfirmLocation(false);
                        const d: ServiceDraft = { kind: 'location', body: t('services.currentLocation', 'Current Location') };
                        if (isFiveM) {
                            try {
                                const r = await apiData<{ x: number; y: number }>('sd-phone:maps:here');
                                if (r) {
                                    d.wpCode = encodeWaypoint({ label: t('services.sharedLocation', 'Shared Location'), x: r.x, y: r.y, icon: 'MapPin', color: '#eb4b3c' });
                                    d.wpSub  = `${Math.round(r.x)}, ${Math.round(r.y)}`;
                                }
                            } catch { /* fall back to a coordless share */ }
                        }
                        onSend(d);
                    }}
                />
            )}
        </div>
    );
}
