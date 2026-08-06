import { useState } from 'react';
import { ChevronLeft, Plus, Trash2, Pencil, BookmarkPlus, Radio as RadioGlyph } from 'lucide-react';

import { useIosPush } from '@/hooks/useIosPush';
import { PromptDialog } from '@/ui/PromptDialog';
import { AlertDialog } from '@/ui/AlertDialog';
import type { SavedStation } from './radioApi';
import { t } from '@/i18n';

const fmtFreq = (f: number) => f.toFixed(1);
const cleanFreq = (v: string) => {
    v = v.replace(/[^\d.]/g, '');
    const hasDot = v.includes('.');
    const [int = '', ...rest] = v.split('.');
    return int.slice(0, 3) + (hasDot ? '.' + rest.join('').slice(0, 1) : '');
};

export function SavedChannels({ saved, currentFreq, canSave, activeFreq, onTune, onAdd, onUpdate, onRemove, onBack }: {
    saved:       SavedStation[];
    currentFreq: number;
    canSave:     boolean;
    activeFreq:  number | null;
    onTune:      (freq: number) => void;
    onAdd:       (name: string, freq: number) => void;
    onUpdate:    (id: string, label: string, freq: number) => void;
    onRemove:    (id: string) => void;
    onBack:      () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const [adding,        setAdding]        = useState(false);
    const [savingCurrent, setSavingCurrent] = useState(false);
    const [editing,       setEditing]       = useState<SavedStation | null>(null);
    const [confirmDel,    setConfirmDel]     = useState<SavedStation | null>(null);

    return (
        <div className="absolute inset-0 z-20 flex flex-col bg-base font-sf text-black dark:text-white" style={pageStyle}>
            <div className="h-[54px] shrink-0" aria-hidden />

            <div className="px-2 pb-0.5">
                <button type="button" onClick={goBack} className="flex items-center gap-0.5 text-ios-blue active:opacity-60">
                    <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.5} />
                    <span className="text-[17px]">{t('radio.title', 'Radio')}</span>
                </button>
            </div>
            <div className="flex items-center justify-between px-5 pb-3 pt-0.5">
                <span className="text-[34px] font-bold tracking-tight">{t('radio.saved', 'Saved')}</span>
                <button type="button" aria-label={t('radio.addChannel', 'Add channel')} onClick={() => setAdding(true)} className="text-ios-blue active:opacity-60">
                    <Plus className="h-[28px] w-[28px]" strokeWidth={2.4} />
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-10">
                <button
                    type="button"
                    onClick={() => setSavingCurrent(true)}
                    disabled={!canSave}
                    className="mb-4 flex w-full items-center justify-center gap-2.5 rounded-[16px] bg-surface py-4 text-[18px] font-semibold text-ios-blue active:opacity-70 disabled:opacity-40"
                >
                    <BookmarkPlus className="h-[21px] w-[21px]" strokeWidth={2.2} /> {t('radio.saveCurrentFrequency', 'Save current frequency ({freq})', { freq: fmtFreq(currentFreq) })}
                </button>

                {saved.length === 0 ? (
                    <div className="mt-16 flex flex-col items-center gap-3 px-10 text-center">
                        <RadioGlyph className="h-[52px] w-[52px] text-black/20 dark:text-white/20" strokeWidth={1.6} />
                        <p className="text-[16px] leading-snug text-ios-gray">{t('radio.noSavedChannels', 'No saved channels yet. Tap + to add one.')}</p>
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-[16px] bg-surface">
                        {saved.map((s, i) => (
                            <div key={s.id}>
                                <div className="flex items-stretch">
                                    <button
                                        type="button"
                                        onClick={() => onTune(s.freq)}
                                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-[18px] text-left active:bg-black/[0.04] dark:active:bg-white/[0.05]"
                                    >
                                        <span className={`h-[10px] w-[10px] shrink-0 rounded-full ${activeFreq === s.freq ? 'bg-[#34c759]' : 'bg-black/20 dark:bg-white/25'}`} />
                                        <span className="min-w-0 flex-1 truncate text-[20px] font-semibold">{s.label}</span>
                                        <span className="shrink-0 text-[18px] tabular-nums text-ios-gray">{fmtFreq(s.freq)}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditing(s)}
                                        aria-label={t('radio.editStation', 'Edit {label}', { label: s.label })}
                                        className="flex items-center px-3 text-ios-gray transition-colors hover:bg-black/[0.05] hover:text-ios-blue active:opacity-60 dark:hover:bg-white/[0.06]"
                                    >
                                        <Pencil className="h-[19px] w-[19px]" strokeWidth={2} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmDel(s)}
                                        aria-label={t('radio.deleteStation', 'Delete {label}', { label: s.label })}
                                        className="flex items-center px-3.5 text-ios-gray transition-colors hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] active:opacity-60"
                                    >
                                        <Trash2 className="h-[20px] w-[20px]" strokeWidth={2} />
                                    </button>
                                </div>
                                {i < saved.length - 1 && <div className="ml-4 h-px bg-black/[0.08] dark:bg-white/[0.08]" />}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {savingCurrent && (
                <PromptDialog
                    title={t('radio.saveChannel', 'Save Channel')}
                    message={t('radio.nameThisChannel', 'Name this {freq} MHz channel', { freq: fmtFreq(currentFreq) })}
                    placeholder={t('radio.stationNamePlaceholder', 'e.g. Crew, Police, EMS')}
                    confirmLabel={t('radio.save', 'Save')}
                    maxLength={40}
                    onCancel={() => setSavingCurrent(false)}
                    onConfirm={name => { setSavingCurrent(false); onAdd(name, currentFreq); }}
                />
            )}

            {adding && (
                <PromptDialog
                    title={t('radio.addChannelTitle', 'Add Channel')}
                    label={t('radio.name', 'Name')}
                    placeholder={t('radio.stationNamePlaceholder', 'e.g. Crew, Police, EMS')}
                    maxLength={40}
                    secondField={{ label: t('radio.frequencyMhz', 'Frequency (MHz)'), initialValue: fmtFreq(currentFreq), inputMode: 'decimal', sanitize: cleanFreq }}
                    confirmLabel={t('radio.add', 'Add')}
                    onCancel={() => setAdding(false)}
                    onConfirm={(name, freqStr) => { setAdding(false); onAdd(name, parseFloat(freqStr ?? '0') || 0); }}
                />
            )}

            {editing && (
                <PromptDialog
                    title={t('radio.editChannel', 'Edit Channel')}
                    label={t('radio.name', 'Name')}
                    initialValue={editing.label}
                    placeholder={t('radio.stationNamePlaceholder', 'e.g. Crew, Police, EMS')}
                    maxLength={40}
                    secondField={{
                        label: t('radio.frequencyMhz', 'Frequency (MHz)'),
                        initialValue: editing.freq.toFixed(1),
                        inputMode: 'decimal',
                        sanitize: cleanFreq,
                    }}
                    confirmLabel={t('radio.save', 'Save')}
                    onCancel={() => setEditing(null)}
                    onConfirm={(name, freqStr) => { setEditing(null); onUpdate(editing.id, name, parseFloat(freqStr ?? '0') || 0); }}
                />
            )}

            {confirmDel && (
                <AlertDialog
                    title={t('radio.deleteChannel', 'Delete Channel')}
                    message={t('radio.removeChannel', 'Remove "{label}" ({freq} MHz)?', { label: confirmDel.label, freq: fmtFreq(confirmDel.freq) })}
                    confirmLabel={t('radio.delete', 'Delete')}
                    cancelLabel={t('radio.cancel', 'Cancel')}
                    destructive
                    onCancel={() => setConfirmDel(null)}
                    onConfirm={() => { const id = confirmDel.id; setConfirmDel(null); onRemove(id); }}
                />
            )}
        </div>
    );
}
