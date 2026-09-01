import { useMemo, useState } from 'react';

import { t } from '@/i18n';
import { groupByDay, type Photo } from '@/core/photosApi';
import { PhotoTile } from './PhotoTile';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

export function PhotoPicker({ photos, existingIds, onConfirm, onClose }: {
    photos:      Photo[];
    existingIds: Set<string>;
    onConfirm:   (ids: string[]) => void;
    onClose:     () => void;
}) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [leaving, setLeaving] = useState(false);

    const dismiss = (after: () => void) => {
        if (leaving) return;
        setLeaving(true);
        window.setTimeout(after, 260);
    };

    const candidates = useMemo(
        () => photos.filter(p => !existingIds.has(p.id)),
        [photos, existingIds],
    );
    const groups = useMemo(() => groupByDay(candidates), [candidates]);

    function toggle(id: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    return (
        <div
            className="absolute inset-0 z-50 flex flex-col bg-base"
            style={{ animation: leaving ? 'ios-sheet-down 0.26s cubic-bezier(0.32,0,0.68,1) forwards' : 'ios-sheet-up 0.34s cubic-bezier(0.32,0.72,0,1)' }}
        >
            <StatusBarSpacer />
            <div className="flex h-11 shrink-0 items-center justify-between px-4">
                <button type="button" onClick={() => dismiss(onClose)} className="text-[16px] font-medium text-ios-blue">
                    {t('photos.cancel', 'Cancel')}
                </button>
                <span className="text-[15px] font-semibold">{t('photos.addPhotosTitle', 'Add Photos')}</span>
                <button
                    type="button"
                    disabled={selected.size === 0}
                    onClick={() => dismiss(() => onConfirm(Array.from(selected)))}
                    className="text-[16px] font-semibold text-ios-blue disabled:opacity-40"
                >
                    {t('photos.add', 'Add')}{selected.size > 0 ? ` (${selected.size})` : ''}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-2">
                {candidates.length === 0 ? (
                    <p className="px-4 pt-10 text-center text-[14px] text-black/45 dark:text-white/45">
                        {t('photos.everyPhotoInAlbum', 'Every photo is already in this album.')}
                    </p>
                ) : (
                    groups.map(group => (
                        <section key={group.key} className="mb-3">
                            <h2 className="px-4 pb-2 pt-1 text-[15px] font-bold tracking-tight">{group.label}</h2>
                            <div className="grid grid-cols-3 gap-[2px]">
                                {group.photos.map(p => (
                                    <PhotoTile
                                        key={p.id}
                                        photo={p}
                                        selectable
                                        selected={selected.has(p.id)}
                                        onClick={() => toggle(p.id)}
                                    />
                                ))}
                            </div>
                        </section>
                    ))
                )}
            </div>
        </div>
    );
}
