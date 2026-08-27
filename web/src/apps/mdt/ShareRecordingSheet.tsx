import { useMemo, useState } from 'react';
import { Check, Images, MonitorSmartphone } from 'lucide-react';

import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { Scroller } from '@/ui/Scroller';
import { SearchBar } from '@/ui/SearchBar';
import { Sheet } from '@/ui/Sheet';
import { useAsyncData } from '@/hooks/useAsyncData';
import { mdtRecordingShare, mdtRoster } from './mdtApi';
import { mdtRowMeta } from './mdtTheme';
import type { BodycamRecording, OfficerRow } from './data';

interface Props {
    recording: BodycamRecording;
    onClose:   () => void;
    onSent:    (message: string) => void;
}

function Destination({ icon: Icon, label, hint, on, onToggle }: {
    icon:     typeof Images;
    label:    string;
    hint:     string;
    on:       boolean;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className={`flex flex-1 items-start gap-3 rounded-[12px] px-3.5 py-3 text-left ring-1 transition-colors ${
                on
                    ? 'bg-ios-blue/12 ring-ios-blue/45'
                    : 'bg-black/[0.04] ring-black/[0.06] dark:bg-white/[0.06] dark:ring-white/[0.08]'
            }`}
        >
            <span className={`mt-[1px] flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] ${
                on ? 'bg-ios-blue text-white' : 'bg-black/[0.06] text-ios-gray dark:bg-white/[0.10]'
            }`}>
                {on ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" strokeWidth={2.2} />}
            </span>
            <span className="flex min-w-0 flex-col">
                <span className="text-[14px] font-semibold text-black dark:text-white">{label}</span>
                <span className={`${mdtRowMeta} leading-snug`}>{hint}</span>
            </span>
        </button>
    );
}

export function ShareRecordingSheet({ recording, onClose, onSent }: Props) {
    const [query, setQuery] = useState('');
    const [toMdt, setToMdt] = useState(true);
    const [toPhone, setToPhone] = useState(false);
    const [sending, setSending] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { data } = useAsyncData(() => mdtRoster({ page: 1 }), []);

    const officers = useMemo(() => {
        const rows: OfficerRow[] = data?.rows ?? [];
        const needle = query.trim().toLowerCase();
        if (!needle) return rows;
        return rows.filter(o =>
            o.name.toLowerCase().includes(needle)
            || (o.callsign ?? '').toLowerCase().includes(needle)
            || (o.rank ?? '').toLowerCase().includes(needle));
    }, [data, query]);

    const send = async (officer: OfficerRow) => {
        if (!toMdt && !toPhone) {
            setError(t('mdt.sharePickWhere', 'Pick where to send it first.'));
            return;
        }
        setError(null);
        setSending(officer.citizenid);
        const failed = await mdtRecordingShare(recording.id, officer.citizenid, toMdt, toPhone);
        setSending(null);
        if (failed) {
            setError(failed);
            return;
        }
        onSent(t('mdt.shareSent', 'Sent to {name}', { name: officer.name }));
        onClose();
    };

    return (
        <Sheet onClose={onClose} fit="content" className="bg-base" title={t('mdt.shareTitle', 'Send footage')}>
            {() => (
            <div className="flex min-h-0 flex-col gap-3 px-4 pb-4">
                <p className={mdtRowMeta}>
                    {t('mdt.shareSub', '{kind} of {officer}, {duration}', {
                        kind: recording.kind === 'dashcam' ? t('mdt.dashcam', 'Dashcam') : t('mdt.bodycam', 'Bodycam'),
                        officer: recording.officer,
                        duration: `${Math.floor(recording.duration / 60)}m ${recording.duration % 60}s`,
                    })}
                </p>

                <div className="flex gap-2">
                    <Destination
                        icon={MonitorSmartphone}
                        label={t('mdt.shareToMdt', 'Their terminal')}
                        hint={t('mdt.shareToMdtHint', 'Appears in their Recordings')}
                        on={toMdt}
                        onToggle={() => setToMdt(v => !v)}
                    />
                    <Destination
                        icon={Images}
                        label={t('mdt.shareToPhone', 'Their phone')}
                        hint={t('mdt.shareToPhoneHint', 'Saves into their Photos')}
                        on={toPhone}
                        onToggle={() => setToPhone(v => !v)}
                    />
                </div>

                <SearchBar
                    value={query}
                    onChange={setQuery}
                    placeholder={t('mdt.shareSearch', 'Search the roster')}
                />

                {error && <p className="text-[12.5px] font-medium text-ios-red">{error}</p>}

                <Scroller className="min-h-0 max-h-[42vh]">
                    {officers.length === 0 ? (
                        <div className="py-8">
                            <EmptyState
                                center
                                icon={MonitorSmartphone}
                                title={t('mdt.shareNoOfficers', 'Nobody to send to')}
                                subtitle={t('mdt.shareNoOfficersSub', 'No officer on the roster matches that search.')}
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            {officers.map(officer => (
                                <button
                                    key={officer.citizenid}
                                    type="button"
                                    disabled={sending !== null}
                                    onClick={() => { void send(officer); }}
                                    className="flex items-center gap-3 rounded-[12px] bg-black/[0.04] px-3.5 py-3 text-left active:opacity-70 disabled:opacity-50 dark:bg-white/[0.06]"
                                >
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="flex min-w-0 items-center gap-2">
                                            <span className="truncate text-[15px] font-semibold text-black dark:text-white">
                                                {officer.name}
                                            </span>
                                            {officer.callsign && (
                                                <span className="shrink-0 rounded-[5px] bg-black/[0.06] px-1.5 py-[1px] text-[11.5px] font-bold tabular-nums text-ios-gray dark:bg-white/[0.10]">
                                                    {officer.callsign}
                                                </span>
                                            )}
                                        </span>
                                        <span className={`truncate ${mdtRowMeta}`}>
                                            {officer.rank}
                                            {officer.online ? ` · ${t('mdt.shareOnline', 'On shift')}` : ''}
                                        </span>
                                    </span>
                                    {sending === officer.citizenid && (
                                        <span className={mdtRowMeta}>{t('mdt.shareSending', 'Sending')}</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </Scroller>
            </div>
            )}
        </Sheet>
    );
}
