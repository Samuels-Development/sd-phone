import { useRef } from 'react';
import { Image as ImageIcon, Plus } from 'lucide-react';

import { t } from '@/i18n';
import { Sheet } from '@/ui/Sheet';
import type { Album } from '@/core/photosApi';

export function AlbumPickerSheet({ albums, count, onPick, onNewAlbum, onClose }: {
    albums:     Album[];
    count:      number;
    onPick:     (albumId: string) => void;
    onNewAlbum: () => void;
    onClose:    () => void;
}) {
    // Run the chosen action only after the sheet's exit animation settles, so the picker
    // doesn't jump while a new album screen mounts underneath it.
    const pending = useRef<(() => void) | null>(null);

    function handleClose() {
        const action = pending.current;
        pending.current = null;
        if (action) { action(); return; }
        onClose();
    }

    const noun = count === 1 ? t('photos.photoSingular', 'Photo') : t('photos.photoPlural', 'Photos');

    return (
        <Sheet onClose={handleClose} fit="top" top={76} grabber={false} className="bg-[#d4d4d4] dark:bg-base">
            {({ close }) => {
                function runThenClose(action: () => void) { pending.current = action; close(); }
                return (
                    <div className="flex min-h-0 flex-1 flex-col">
                        <div className="relative flex h-12 shrink-0 items-center justify-end px-4">
                            <span className="pointer-events-none absolute inset-x-0 text-center text-[18px] font-semibold text-black dark:text-white">
                                {t('photos.addToAlbum', 'Add to Album')}
                            </span>
                            <button type="button" onClick={close} className="relative z-10 text-[17px] text-ios-blue active:opacity-60">
                                {t('photos.cancel', 'Cancel')}
                            </button>
                        </div>
                        <p className="shrink-0 px-4 pb-3 text-center text-[14px] font-medium text-black/55 dark:text-white/55">
                            {t('photos.itemsSelected', '{count} {noun} selected', { count, noun })}
                        </p>

                        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-[calc(var(--safe-bottom)+24px)]">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                                <button type="button" onClick={() => runThenClose(onNewAlbum)} className="text-left active:opacity-70">
                                    <span className="flex aspect-square w-full items-center justify-center rounded-[12px] border-2 border-dashed border-ios-blue/40 bg-ios-blue/[0.06]">
                                        <Plus className="h-11 w-11 text-ios-blue" strokeWidth={1.5} />
                                    </span>
                                    <span className="mt-2 block truncate px-0.5 text-[16px] font-semibold text-ios-blue">{t('photos.newAlbum', 'New Album')}</span>
                                    <span className="block px-0.5 text-[14px] text-ios-blue/55">{t('photos.createAlbumSub', 'Create album')}</span>
                                </button>

                                {albums.map(a => (
                                    <button key={a.id} type="button" onClick={() => runThenClose(() => onPick(a.id))} className="text-left active:opacity-70">
                                        <span className="block aspect-square w-full overflow-hidden rounded-[12px] bg-black/10 dark:bg-white/10">
                                            {a.cover
                                                ? <img src={a.cover} alt="" className="h-full w-full object-cover" draggable={false} />
                                                : <span className="flex h-full w-full items-center justify-center">
                                                      <ImageIcon className="h-9 w-9 text-black/25 dark:text-white/25" strokeWidth={1.8} />
                                                  </span>}
                                        </span>
                                        <span className="mt-2 block truncate px-0.5 text-[16px] font-semibold text-black dark:text-white">{a.name}</span>
                                        <span className="block px-0.5 text-[14px] text-black/45 dark:text-white/45">{a.count}</span>
                                    </button>
                                ))}
                            </div>

                            {albums.length === 0 && (
                                <p className="px-4 pt-10 text-center text-[14px] text-black/45 dark:text-white/45">
                                    {t('photos.noAlbumsYetCreate', 'No albums yet — create one above.')}
                                </p>
                            )}
                        </div>
                    </div>
                );
            }}
        </Sheet>
    );
}
