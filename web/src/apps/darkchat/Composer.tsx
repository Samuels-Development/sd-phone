import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Images, MapPin, Mic, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { isFiveM } from '@/core/nui';
import { apiData } from '@/core/api';
import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';
import { AlertDialog } from '@/ui/AlertDialog';
import { encodeWaypoint } from '@/lib/waypointCode';
import { EmojiPanel } from '@/shared/chat/EmojiPanel';
import { GifPickerSheet } from '@/shared/chat/GifPickerSheet';
import { VoicePanel } from '@/shared/chat/VoicePanel';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { warmGifCategories } from '@/shared/chat/gifsApi';
import { warmPhotos } from '@/core/photosApi';
import type { DarkChatDraft } from './data';

type Panel = 'emoji' | 'voice' | null;

const ACTION_BTNS: { id: string; label: string; emoji?: string; Icon?: LucideIcon }[] = [
    { id: 'emoji',    label: 'Emoji',    emoji: '😊' },
    { id: 'photos',   label: 'Photos',   Icon: Images },
    { id: 'gif',      label: 'GIF' },
    { id: 'location', label: 'Location', Icon: MapPin },
    { id: 'voice',    label: 'Voice',    Icon: Mic },
];

export function Composer({ onSend, reply, onCancelReply }: {
    onSend:        (draft: DarkChatDraft) => void;
    reply:         { name: string; body: string } | null;
    onCancelReply: () => void;
}) {
    const [draft,       setDraft]       = useSessionState('darkchat:draft', '');
    const [panel,       setPanel]       = useState<Panel>(null);
    const [attachments, setAttachments] = useState<string[]>([]);
    const [picking,     setPicking]     = useState(false);
    const [gifPicking,  setGifPicking]  = useState(false);
    const [confirmLocation, setConfirmLocation] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { warmGifCategories(); warmPhotos(); }, []);

    useEffect(() => { if (reply) inputRef.current?.focus(); }, [reply]);

    function togglePanel(p: Panel) {
        setPanel(prev => (prev === p ? null : p));
        inputRef.current?.blur();
    }

    function openPhotos() { setPicking(true);    setPanel(null); inputRef.current?.blur(); }
    function openGif()    { setGifPicking(true); setPanel(null); inputRef.current?.blur(); }
    function openShareLocation() { setConfirmLocation(true); setPanel(null); inputRef.current?.blur(); }

    function sendText() {
        const text = draft.trim();
        if (!text && attachments.length === 0) return;
        attachments.forEach(url => onSend({ kind: 'image', mediaUrl: url, body: '📷 Photo' }));
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

    return (
        <div className="dark relative shrink-0">
            {panel === 'emoji' && (
                <div className="absolute inset-x-0 bottom-full z-20">
                    <EmojiPanel isDark onSelect={e => setDraft(d => d + e)} />
                </div>
            )}

            {reply && (
                <div className="flex items-center gap-2 px-4 pt-2 pb-1">
                    <div className="w-[3px] self-stretch rounded-full bg-ios-blue" />
                    <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold text-ios-blue">{t('darkchat.replyTo', 'In reply to {name}', { name: reply.name })}</div>
                        <div className="truncate text-[13px] text-white/55">{reply.body}</div>
                    </div>
                    <button
                        type="button"
                        onClick={onCancelReply}
                        aria-label={t('darkchat.cancelReply', 'Cancel reply')}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 active:opacity-60"
                    >
                        <X className="h-[14px] w-[14px] text-white/55" strokeWidth={2.5} />
                    </button>
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
                                aria-label={t('darkchat.removeImage', 'Remove image')}
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
                    style={{ background: '#1C1C1E', border: '0.5px solid rgba(255,255,255,0.12)' }}
                >
                    <input
                        ref={inputRef}
                        type="text"
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onKeyDown={handleKey}
                        onFocus={() => setPanel(null)}
                        placeholder={t('darkchat.messagePlaceholder', 'Message…')}
                        className="min-w-0 flex-1 bg-transparent py-[5px] text-[18px] text-white placeholder-white/35 outline-none"
                    />
                    {hasContent && (
                        <button
                            type="button"
                            onClick={sendText}
                            aria-label={t('darkchat.send', 'Send')}
                            className="flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full bg-ios-blue active:opacity-70"
                        >
                            <ArrowUp className="h-[19px] w-[19px] text-white" strokeWidth={2.75} />
                        </button>
                    )}
                </div>
            </div>

            <div
                className="flex items-center justify-around px-4 pb-11 pt-2.5"
                style={{ background: '#1C1C1E', borderTop: '0.5px solid rgba(255,255,255,0.10)' }}
            >
                {ACTION_BTNS.map(btn => {
                    const Icon = btn.Icon;
                    return (
                        <button
                            key={btn.id}
                            type="button"
                            onClick={() => (btn.id === 'photos' ? openPhotos() : btn.id === 'gif' ? openGif() : btn.id === 'location' ? openShareLocation() : togglePanel(btn.id as Panel))}
                            className="flex h-[48px] w-[54px] items-center justify-center rounded-[16px] transition-opacity active:opacity-60"
                            style={{ background: '#2C2C2E', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}
                        >
                            {Icon ? (
                                <Icon
                                    className={`text-white ${btn.id === 'location' ? 'h-[27px] w-[27px]' : 'h-[25px] w-[25px]'}`}
                                    strokeWidth={2}
                                />
                            ) : btn.emoji ? (
                                <span className="text-[23px] leading-none">{btn.emoji}</span>
                            ) : (
                                <span className="text-[15px] font-black tracking-tight text-ios-blue">{btn.label}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {picking && (
                <MediaPickerSheet
                    multiple
                    forceDark
                    onSelectMany={ps => { setAttachments(prev => [...prev, ...ps.map(p => p.url)]); setPicking(false); }}
                    onClose={() => setPicking(false)}
                />
            )}

            {gifPicking && (
                <GifPickerSheet
                    forceDark
                    onSelect={url => { onSend({ kind: 'gif', mediaUrl: url, body: 'GIF' }); setGifPicking(false); }}
                    onClose={() => setGifPicking(false)}
                />
            )}

            {panel === 'voice' && (
                <VoicePanel
                    forceDark
                    onSend={(dur, url, wave) => { onSend({ kind: 'voice', duration: dur, audioUrl: url, waveform: wave, body: '🎤 Voice message' }); setPanel(null); }}
                    onClose={() => setPanel(null)}
                />
            )}

            {confirmLocation && (
                <AlertDialog
                    title={t('darkchat.shareLocationTitle', 'Share Location')}
                    message={t('darkchat.shareLocationMessage', 'Are you sure you want to share your location?')}
                    cancelLabel={t('darkchat.cancel', 'Cancel')}
                    confirmLabel={t('darkchat.share', 'Share')}
                    forceDark
                    onCancel={() => setConfirmLocation(false)}
                    onConfirm={async () => {
                        setConfirmLocation(false);
                        const d: DarkChatDraft = { kind: 'location', body: 'Current Location' };
                        if (isFiveM) {
                            try {
                                const r = await apiData<{ x: number; y: number }>('sd-phone:maps:here');
                                if (r) {
                                    d.wpCode = encodeWaypoint({ label: t('darkchat.sharedLocationPin', 'Shared Location'), x: r.x, y: r.y, icon: 'MapPin', color: '#eb4b3c' });
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
