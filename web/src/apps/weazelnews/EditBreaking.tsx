import { useRef, useState } from 'react';
import { GripVertical, Plus, X } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { WEAZEL_RED } from './data';

const MAX_LINES = 8;

export function EditBreaking({ initial, dark, onClose, onSave }: {
    initial:  string[];
    dark:     boolean;
    onClose:  () => void;
    onSave:   (lines: string[]) => Promise<boolean>;
}) {
    const { goBack, pageStyle } = useIosPush(onClose);
    const [busy, setBusy]   = useState(false);
    const [lines, setLines] = useState<string[]>(initial.length > 0 ? [...initial] : ['']);

    const setAt = (i: number, v: string) => setLines(p => p.map((l, j) => (j === i ? v : l)));
    const removeAt = (i: number) => setLines(p => (p.length === 1 ? [''] : p.filter((_, j) => j !== i)));
    const add = () => setLines(p => (p.length >= MAX_LINES ? p : [...p, '']));

    function reorder(from: number, to: number) {
        setLines(p => {
            if (from === to || from < 0 || to < 0 || from >= p.length || to >= p.length) return p;
            const n = [...p];
            const [moved] = n.splice(from, 1);
            n.splice(to, 0, moved);
            return n;
        });
    }

    const dragFrom = useRef<number | null>(null);
    const [dragging, setDragging] = useState<number | null>(null);

    function onGripDown(e: React.PointerEvent, i: number) {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragFrom.current = i;
        setDragging(i);
    }
    function onGripMove(e: React.PointerEvent) {
        if (dragFrom.current === null) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const row = el?.closest('[data-row]');
        if (!row) return;
        const to = Number(row.getAttribute('data-row'));
        const from = dragFrom.current;
        if (Number.isNaN(to) || to === from) return;
        reorder(from, to);
        dragFrom.current = to;
        setDragging(to);
    }
    function onGripUp(e: React.PointerEvent) {
        if (dragFrom.current === null) return;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
        dragFrom.current = null;
        setDragging(null);
    }

    const cleaned = lines.map(l => l.trim()).filter(Boolean);

    async function submit() {
        if (busy) return;
        setBusy(true);
        const ok = await onSave(cleaned);
        setBusy(false);
        if (ok) goBack();
    }

    const card  = dark ? 'bg-surface text-white placeholder:text-white/90' : 'bg-surface text-black placeholder:text-black/75';
    const sheet = dark ? 'bg-black' : 'bg-[#d4d4d4]';

    return (
        <div className={`absolute inset-0 z-40 flex flex-col font-sf ${sheet}`} style={pageStyle}>
            <div className="h-[54px] shrink-0" aria-hidden />

            <div className="flex h-11 shrink-0 items-center justify-between px-4">
                <button type="button" onClick={goBack} className="text-[16px]" style={{ color: WEAZEL_RED }}>{t('weazelnews.cancel', 'Cancel')}</button>
                <span className={`text-[15px] font-semibold ${dark ? 'text-white' : 'text-black'}`}>{t('weazelnews.breakingHeadlines', 'Breaking Headlines')}</span>
                <button
                    type="button"
                    disabled={busy}
                    onClick={submit}
                    className="text-[16px] font-semibold disabled:opacity-40"
                    style={{ color: WEAZEL_RED }}
                >
                    {t('weazelnews.save', 'Save')}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-8 pt-2">
                <p className="px-1 pb-4 text-[15px] font-medium leading-snug text-ios-gray">
                    {t('weazelnews.breakingHint', 'These scroll across the red bar at the top of Weazel News. Keep them short and punchy, and drag the handle to reorder.')}
                </p>

                <div className="flex flex-col gap-2.5">
                    {lines.map((line, i) => (
                        <div
                            key={i}
                            data-row={i}
                            className={`flex items-center gap-2 rounded-xl pl-1.5 pr-2 transition-shadow ${card} ${
                                dragging === i ? 'shadow-lg ring-2 ring-inset' : ''
                            }`}
                            style={dragging === i ? { boxShadow: `0 6px 18px rgba(0,0,0,0.25)`, ['--tw-ring-color' as string]: WEAZEL_RED } : undefined}
                        >
                            <span
                                onPointerDown={e => onGripDown(e, i)}
                                onPointerMove={onGripMove}
                                onPointerUp={onGripUp}
                                onPointerCancel={onGripUp}
                                aria-label={t('weazelnews.dragToReorder', 'Drag to reorder')}
                                className="flex h-12 w-8 shrink-0 items-center justify-center"
                                style={{ touchAction: 'none', cursor: dragging === i ? 'grabbing' : 'grab' }}
                            >
                                <GripVertical className={`h-[22px] w-[22px] ${dark ? 'text-white/40' : 'text-black/35'}`} strokeWidth={2} />
                            </span>
                            <input
                                value={line}
                                onChange={e => setAt(i, e.target.value)}
                                maxLength={200}
                                placeholder={t('weazelnews.breakingHeadlinePlaceholder', 'Breaking headline…')}
                                className="min-w-0 flex-1 bg-transparent py-3.5 text-[16px] outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => removeAt(i)}
                                aria-label={t('weazelnews.removeHeadline', 'Remove headline')}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ios-red active:bg-ios-red/15"
                            >
                                <X className="h-[19px] w-[19px]" strokeWidth={2.6} />
                            </button>
                        </div>
                    ))}
                </div>

                {lines.length < MAX_LINES && (
                    <button
                        type="button"
                        onClick={add}
                        className="mt-4 flex items-center gap-1.5 text-[16px] font-semibold active:opacity-60"
                        style={{ color: WEAZEL_RED }}
                    >
                        <Plus className="h-[21px] w-[21px]" strokeWidth={2.6} /> {t('weazelnews.addHeadline', 'Add headline')}
                    </button>
                )}
            </div>
        </div>
    );
}
