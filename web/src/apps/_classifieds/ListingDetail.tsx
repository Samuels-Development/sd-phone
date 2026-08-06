import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon, Pencil, Trash2 } from 'lucide-react';

import { device } from '@device';
import { AlertDialog } from '@/ui/AlertDialog';
import { Scroller } from '@/ui/Scroller';
import { MailGlyph, MessageGlyph, PhoneGlyph } from '@/shell/AppGlyphs';
import { fmtPrice, type ClassifiedItem } from './types';
import { t } from '@/i18n';

export function ListingDetail({ item, backLabel, itemNoun = t('classifieds.post', 'Post'), onBack, onMessage, onCall, onEmail, onEdit, onDelete, animateIn = true }: {
    item:      ClassifiedItem;
    backLabel: string;
    itemNoun?: string;
    onBack:    () => void;
    onMessage: () => void;
    onCall:    () => void;
    onEmail?:  () => void;
    onEdit?:   () => void;
    onDelete:  () => void;
    animateIn?: boolean;
}) {
    const images = item.images && item.images.length ? item.images : item.image ? [item.image] : [];
    const n = images.length;
    const [idx, setIdx] = useState(0);
    const [exiting, setExiting] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const multi = n > 1;

    const [drag, setDrag] = useState(0);
    const [dragging, setDragging] = useState(false);
    const down  = useRef(false);
    const start = useRef({ x: 0, y: 0 });
    const horiz = useRef(false);
    const wRef  = useRef(1);

    function onPointerDown(e: ReactPointerEvent) {
        if (!multi) return;
        down.current = true;
        setDragging(true);
        start.current = { x: e.clientX, y: e.clientY };
        horiz.current = false;
        wRef.current = (e.currentTarget as HTMLElement).clientWidth || 1;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    function onPointerMove(e: ReactPointerEvent) {
        if (!down.current) return;
        const dx = e.clientX - start.current.x;
        const dy = e.clientY - start.current.y;
        if (!horiz.current && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) horiz.current = true;
        if (horiz.current) {
            const w = wRef.current;
            const tx = Math.max(-(n - 1) * w, Math.min(0, -idx * w + dx));
            setDrag(tx + idx * w);
        }
    }
    function endDrag(e: ReactPointerEvent) {
        if (!down.current) return;
        down.current = false;
        setDragging(false);
        const dx = e.clientX - start.current.x;
        if (horiz.current) {
            const threshold = wRef.current * 0.18;
            if (dx <= -threshold && idx < n - 1) setIdx(idx + 1);
            else if (dx >= threshold && idx > 0) setIdx(idx - 1);
        }
        setDrag(0);
    }

    function dismiss(after: () => void) {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(after, 300);
    }

    return (
        <div
            className="absolute inset-0 z-40 flex flex-col bg-elevated font-sf dark:bg-base"
            style={{
                animation: exiting
                    ? 'ios-pop 0.3s cubic-bezier(0.32,0.72,0,1) forwards'
                    : animateIn ? 'ios-push 0.3s cubic-bezier(0.32,0.72,0,1)' : undefined,
                willChange: 'transform',
            }}
        >
            <div className="h-[58px] shrink-0" aria-hidden />

            <div className="flex h-11 shrink-0 items-center px-2">
                <button type="button" onClick={() => dismiss(onBack)} className="flex items-center gap-0.5 text-[17px] text-ios-blue active:opacity-60">
                    <ChevronLeft className="h-[24px] w-[24px]" strokeWidth={2.4} />
                    {backLabel}
                </button>
            </div>

            <Scroller className="min-h-0 flex-1 pb-8">
                <div
                    className="relative aspect-square w-full touch-none select-none overflow-hidden bg-surface"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={() => { down.current = false; setDragging(false); setDrag(0); }}
                >
                    {n ? (
                        <div
                            className="flex h-full w-full"
                            style={{
                                transform: `translateX(calc(${-idx * 100}% + ${drag}px))`,
                                transition: dragging ? 'none' : 'transform 0.32s cubic-bezier(0.22,0.61,0.36,1)',
                            }}
                        >
                            {images.map((src, i) => (
                                <img key={i} src={src} alt={item.title} draggable={false} className="h-full w-full shrink-0 object-cover" />
                            ))}
                        </div>
                    ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-black/45 dark:text-white/45">
                            <div className="flex h-[78px] w-[78px] items-center justify-center rounded-full bg-black/[0.08] dark:bg-white/10">
                                <ImageIcon className="h-10 w-10" strokeWidth={1.6} />
                            </div>
                            <span className="text-[17px] font-semibold">{t('classifieds.noPhoto', 'No Photo')}</span>
                        </div>
                    )}

                    {multi && (
                        <>
                            <Arrow side="left"  disabled={idx === 0}     onClick={() => setIdx(i => Math.max(0, i - 1))} />
                            <Arrow side="right" disabled={idx === n - 1}  onClick={() => setIdx(i => Math.min(n - 1, i + 1))} />
                            <div
                                className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-[6px]"
                                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}
                            >
                                {images.map((_, i) => (
                                    <span
                                        key={i}
                                        className="rounded-full transition-all duration-200"
                                        style={{ height: 7, width: 7, background: i === idx ? '#fff' : 'rgba(255,255,255,0.5)' }}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className="px-5 pt-4">
                    <h1 className="text-[26px] font-bold leading-tight text-black dark:text-white">{item.title}</h1>
                    {item.price !== undefined && (
                        <div className="mt-0.5 text-[20px] font-semibold text-black dark:text-white">{fmtPrice(item.price)}</div>
                    )}
                    <p className="mt-3 whitespace-pre-wrap text-[19px] leading-[1.5] text-black/90 dark:text-white/90">{item.body}</p>
                    {item.date && <div className="mt-2.5 text-[15px] font-medium text-ios-gray">{item.date}</div>}

                    <div className="mt-5 flex flex-col gap-2.5">
                        {(item.number || (item.email && onEmail)) && (
                            <div className="flex gap-2.5">
                                {item.number && (
                                    <>
                                        <Tile color="#34C759" label={t('classifieds.message', 'Message')} onClick={onMessage}>
                                            <MessageGlyph className="h-[32px] w-[32px]" />
                                        </Tile>
                                        {device.calls && (
                                            <Tile color="#0A84FF" label={t('classifieds.call', 'Call')} onClick={onCall}>
                                                <PhoneGlyph className="h-[30px] w-[30px]" />
                                            </Tile>
                                        )}
                                    </>
                                )}
                                {item.email && onEmail && (
                                    <Tile color="#5E5CE6" label={t('classifieds.email', 'Email')} onClick={onEmail}>
                                        <MailGlyph className="h-[30px] w-[30px]" />
                                    </Tile>
                                )}
                            </div>
                        )}
                        {item.mine && (
                            <div className="flex gap-2.5">
                                {onEdit && (
                                    <Action color="#8E8E93" onClick={onEdit}>
                                        <Pencil className="h-[21px] w-[21px]" strokeWidth={2.2} /> {t('classifieds.editNoun', 'Edit {noun}', { noun: itemNoun })}
                                    </Action>
                                )}
                                <Action color="#FF3B30" onClick={() => setConfirmingDelete(true)}>
                                    <Trash2 className="h-[21px] w-[21px]" strokeWidth={2.2} /> {t('classifieds.remove', 'Remove')}
                                </Action>
                            </div>
                        )}
                    </div>
                </div>
            </Scroller>

            {confirmingDelete && (
                <AlertDialog
                    title={t('classifieds.removeItemTitle', 'Remove {noun}?', { noun: itemNoun })}
                    message={t('classifieds.removeItemMessage', 'This will permanently remove your {noun}.', { noun: itemNoun.toLowerCase() })}
                    confirmLabel={t('classifieds.remove', 'Remove')}
                    destructive
                    onCancel={() => setConfirmingDelete(false)}
                    onConfirm={() => { setConfirmingDelete(false); dismiss(onDelete); }}
                />
            )}
        </div>
    );
}

function Arrow({ side, disabled, onClick }: { side: 'left' | 'right'; disabled: boolean; onClick: () => void }) {
    const Icon = side === 'left' ? ChevronLeft : ChevronRight;
    return (
        <button
            type="button"
            onClick={onClick}
            onPointerDown={e => e.stopPropagation()}
            disabled={disabled}
            aria-label={side === 'left' ? t('classifieds.previousImage', 'Previous image') : t('classifieds.nextImage', 'Next image')}
            className={`absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white active:opacity-70 disabled:opacity-25 ${side === 'left' ? 'left-2' : 'right-2'}`}
        >
            <Icon className="h-6 w-6" strokeWidth={2.4} />
        </button>
    );
}

function Tile({ color, label, onClick, children }: { color: string; label: string; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[18px] py-[18px] text-white shadow-sm active:opacity-80"
            style={{ background: color }}
        >
            {children}
            <span className="text-[19px] font-semibold tracking-tight">{label}</span>
        </button>
    );
}

function Action({ color, onClick, children }: { color: string; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex flex-1 items-center justify-center gap-2 rounded-full py-[14px] text-[18px] font-semibold text-white shadow-sm active:opacity-80"
            style={{ background: color }}
        >
            {children}
        </button>
    );
}
