import { useLayoutEffect, useRef, useState } from 'react';
import {
    ArrowDownLeft, ArrowUpRight, AtSign, Ban, ChevronRight, FileText, Image as ImageIcon, Mic,
    Paperclip, Play, PhoneOff, Smartphone, User,
} from 'lucide-react';

import { t } from '@/i18n';
import { isVideoUrl } from '@/core/photosApi';
import { EmptyState } from '@/ui/EmptyState';
import { ImageLightbox } from '@/ui/ImageLightbox';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { Pager } from '@/ui/Pager';
import { Pill } from '@/ui/Pill';
import { Scroller } from '@/ui/Scroller';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { format12h, formatDuration, formatMediumDate } from '@/lib/time';

import { CitizenRow } from './ProfilesPane';
import type { HandsetNote } from './data';
import {
    mdtPersonsSearch, mdtPhoneAccounts, mdtPhoneCalls, mdtPhoneContacts, mdtPhoneMedia,
    mdtPhoneNote, mdtPhoneNotes, mdtPhoneSummary, mdtPhoneThread, mdtPhoneThreads,
} from './mdtApi';
import { MDT_ACCENT, mdtPanePad, mdtRef, mdtRowHover, mdtRowMeta, mdtRowTitle, mdtSectionHeader, mdtSegmentedDense } from './mdtTheme';
import { useMdtSession } from './useMdtSession';
import { MdtCard } from './ui/MdtCard';

type HandsetTab = 'overview' | 'contacts' | 'calls' | 'messages' | 'media' | 'notes' | 'accounts';

const handsetTabs = (): readonly { value: HandsetTab; label: string }[] => [
    { value: 'overview', label: t('mdt.hsOverview', 'Device') },
    { value: 'contacts', label: t('mdt.hsContacts', 'Contacts') },
    { value: 'calls',    label: t('mdt.hsCalls', 'Calls') },
    { value: 'messages', label: t('mdt.hsMessages', 'Messages') },
    { value: 'media',    label: t('mdt.hsMedia', 'Media') },
    { value: 'notes',    label: t('mdt.hsNotes', 'Notes') },
    { value: 'accounts', label: t('mdt.hsAccounts', 'Accounts') },
];

const HANDSET_RAIL_MIN = 560;

function stamp(ts: string | number | null | undefined): string {
    if (ts === null || ts === undefined || ts === '') return '';
    const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
    if (Number.isNaN(d.getTime())) return typeof ts === 'string' ? ts : '';
    return `${formatMediumDate(d)}, ${format12h(d.getHours(), d.getMinutes())}`;
}

function Row({ children }: { children: React.ReactNode }) {
    return <div className={`flex items-center gap-3 px-4 py-2.5 ${mdtRowHover}`}>{children}</div>;
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4 px-4 py-2">
            <span className={mdtRowMeta}>{label}</span>
            <span className="min-w-0 truncate text-[14px] font-medium text-black dark:text-white">{value || '-'}</span>
        </div>
    );
}

function Overview({ citizenid }: { citizenid: string }) {
    const { data, settled } = useAsyncData(() => mdtPhoneSummary(citizenid), [citizenid]);

    if (!settled) return null;
    if (!data?.device) {
        return (
            <EmptyState
                center
                icon={PhoneOff}
                title={t('mdt.hsNoDevice', 'No handset on record')}
                subtitle={t('mdt.hsNoDeviceSub', 'This citizen has never registered a phone number, so there is nothing to read.')}
            />
        );
    }

    const d = data.device;
    const counts = data.counts;

    return (
        <div className="flex flex-col gap-4 pb-6">
            <MdtCard className="overflow-hidden">
                <div className={`px-4 pb-1 pt-3 ${mdtSectionHeader}`}>{t('mdt.hsHandset', 'Handset')}</div>
                <Field label={t('mdt.hsNumber', 'Number')} value={d.number} />
                <Field label={t('mdt.hsContactCard', 'Contact card')} value={d.name} />
                <Field label={t('mdt.hsCardEmail', 'Card email')} value={d.email} />
                <Field label={t('mdt.hsCardAddress', 'Card address')} value={d.address} />
                <Field label={t('mdt.hsApps', 'Apps installed')} value={String(d.apps)} />
                <Field label={t('mdt.hsLastSeen', 'Last active')} value={stamp(d.lastSeen)} />
            </MdtCard>

            {d.sim && (
                <MdtCard className="overflow-hidden">
                    <div className={`px-4 pb-1 pt-3 ${mdtSectionHeader}`}>{t('mdt.hsSim', 'SIM registration')}</div>
                    <Field label={t('mdt.hsSimOwner', 'Registered to')} value={d.sim.owner ?? ''} />
                    <Field label={t('mdt.hsSimAdopted', 'Currently held by')} value={d.sim.adopted ?? d.sim.owner ?? ''} />
                    <Field label={t('mdt.hsSimSince', 'Registered')} value={stamp(d.sim.since)} />
                </MdtCard>
            )}

            {counts && (
                <MdtCard className="overflow-hidden">
                    <div className={`px-4 pb-1 pt-3 ${mdtSectionHeader}`}>{t('mdt.hsHolds', 'On the device')}</div>
                    <Field label={t('mdt.hsContacts', 'Contacts')} value={String(counts.contacts)} />
                    <Field label={t('mdt.hsCalls', 'Calls')} value={String(counts.calls)} />
                    <Field label={t('mdt.hsPhotos', 'Photos')} value={String(counts.photos)} />
                    <Field label={t('mdt.hsNotes', 'Notes')} value={String(counts.notes)} />
                    <Field label={t('mdt.hsMemos', 'Voice memos')} value={String(counts.memos)} />
                </MdtCard>
            )}

            {!!data.blocked?.length && (
                <MdtCard className="overflow-hidden">
                    <div className={`px-4 pb-1 pt-3 ${mdtSectionHeader}`}>{t('mdt.hsBlocked', 'Blocked numbers')}</div>
                    {data.blocked.map(b => (
                        <Row key={b.number}>
                            <Ban className="h-[15px] w-[15px] shrink-0 text-ios-red" strokeWidth={2.2} />
                            <span className="min-w-0 flex-1 truncate text-[14px] tabular-nums text-black dark:text-white">{b.number}</span>
                            <span className={mdtRowMeta}>{stamp(b.created_at)}</span>
                        </Row>
                    ))}
                </MdtCard>
            )}
        </div>
    );
}

function Contacts({ citizenid }: { citizenid: string }) {
    const [page, setPage] = useState(1);
    const { data, settled } = useAsyncData(() => mdtPhoneContacts(citizenid, page), [citizenid, page]);
    const rows = data?.rows ?? [];

    if (!settled) return null;
    if (rows.length === 0) return <EmptyState center icon={User} title={t('mdt.hsNoContacts', 'No contacts')} />;

    return (
        <MdtCard className="overflow-hidden">
            {rows.map(c => (
                <Row key={`${c.name}:${c.phone}`}>
                    <span className="min-w-0 flex-1">
                        <span className={`block truncate ${mdtRowTitle}`}>{c.name}</span>
                        <span className={`block truncate tabular-nums ${mdtRowMeta}`}>{c.phone}</span>
                    </span>
                    {c.favorite && <Pill tone="orange">{t('mdt.hsFavourite', 'Favourite')}</Pill>}
                </Row>
            ))}
            <Pager page={data?.page ?? page} pageSize={data?.pageSize ?? 30} total={data?.total ?? 0} onPage={setPage} />
        </MdtCard>
    );
}

function Calls({ citizenid }: { citizenid: string }) {
    const [page, setPage] = useState(1);
    const { data, settled } = useAsyncData(() => mdtPhoneCalls(citizenid, page), [citizenid, page]);
    const rows = data?.rows ?? [];

    if (!settled) return null;
    if (rows.length === 0) return <EmptyState center icon={PhoneOff} title={t('mdt.hsNoCalls', 'No calls')} />;

    return (
        <MdtCard className="overflow-hidden">
            {rows.map((c, i) => {
                const out = c.direction === 'outgoing';
                const Icon = out ? ArrowUpRight : ArrowDownLeft;
                return (
                    <Row key={`${c.called_at}:${i}`}>
                        <Icon
                            className={`h-[15px] w-[15px] shrink-0 ${out ? 'text-ios-blue' : 'text-ios-green'}`}
                            strokeWidth={2.4}
                        />
                        <span className="min-w-0 flex-1">
                            <span className={`block truncate ${mdtRowTitle}`}>{c.ownerName || c.name || c.number}</span>
                            <span className={`block truncate tabular-nums ${mdtRowMeta}`}>{c.number}</span>
                        </span>
                        <span className={`shrink-0 tabular-nums ${mdtRowMeta}`}>{formatDuration(c.duration || 0)}</span>
                        <span className={`shrink-0 tabular-nums ${mdtRowMeta}`}>{stamp(c.called_at)}</span>
                    </Row>
                );
            })}
            <Pager page={data?.page ?? page} pageSize={data?.pageSize ?? 30} total={data?.total ?? 0} onPage={setPage} />
        </MdtCard>
    );
}

function Messages({ citizenid }: { citizenid: string }) {
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState<string | null>(null);
    const { data, settled } = useAsyncData(() => mdtPhoneThreads(citizenid, page), [citizenid, page]);
    const { data: thread } = useAsyncData(
        () => (open === null ? Promise.resolve(null) : mdtPhoneThread(citizenid, open, 1)),
        [citizenid, open],
    );
    const rows = data?.rows ?? [];

    if (open !== null) {
        const messages = [...(thread?.rows ?? [])].reverse();
        return (
            <div className="flex flex-col gap-3">
                <button
                    type="button"
                    onClick={() => setOpen(null)}
                    className={`self-start text-[13px] font-semibold text-ios-blue`}
                >
                    {t('mdt.hsBackToThreads', 'All threads')}
                </button>
                <MdtCard className="overflow-hidden">
                    {messages.length === 0 && <div className="px-4 py-6 text-center text-[14px] text-ios-gray">{t('mdt.hsNoMessages', 'No messages')}</div>}
                    {messages.map(m => (
                        <div key={m.id} className="flex flex-col gap-0.5 px-4 py-2">
                            <div className="flex items-baseline gap-2">
                                <span className={`truncate text-[13px] font-semibold ${m.outgoing ? 'text-ios-blue' : 'text-black dark:text-white'}`}>
                                    {m.outgoing ? t('mdt.hsHandsetOwner', 'Handset') : (m.senderName || m.sender)}
                                </span>
                                <span className={`ml-auto shrink-0 tabular-nums ${mdtRowMeta}`}>{stamp(m.timestamp)}</span>
                            </div>
                            <span className="whitespace-pre-wrap break-words text-[14px] leading-snug text-black/85 dark:text-white/85">
                                {m.content || (m.attachments ? t('mdt.hsAttachment', 'Attachment') : '')}
                            </span>
                        </div>
                    ))}
                </MdtCard>
            </div>
        );
    }

    if (!settled) return null;
    if (rows.length === 0) return <EmptyState center icon={Smartphone} title={t('mdt.hsNoThreads', 'No message threads')} />;

    return (
        <MdtCard className="overflow-hidden">
            {rows.map(th => {
                const who = th.isGroup
                    ? (th.name || t('mdt.hsGroupThread', 'Group thread'))
                    : (th.members[0]?.name || th.members[0]?.number || t('mdt.hsUnknown', 'Unknown'));
                return (
                    <button key={th.id} type="button" onClick={() => setOpen(th.id)} className="block w-full text-left">
                        <Row>
                            <span className="min-w-0 flex-1">
                                <span className={`block truncate ${mdtRowTitle}`}>{who}</span>
                                <span className={`block truncate ${mdtRowMeta}`}>{th.last_message || ''}</span>
                            </span>
                            {th.isGroup && <Pill tone="blue">{t('mdt.hsGroup', 'Group')}</Pill>}
                            <span className={`shrink-0 tabular-nums ${mdtRowMeta}`}>{stamp(th.last_message_timestamp)}</span>
                        </Row>
                    </button>
                );
            })}
            <Pager page={data?.page ?? page} pageSize={data?.pageSize ?? 30} total={data?.total ?? 0} onPage={setPage} />
        </MdtCard>
    );
}

function Media({ citizenid }: { citizenid: string }) {
    const [page, setPage] = useState(1);
    const [viewing, setViewing] = useState<string | null>(null);
    const { data, settled } = useAsyncData(() => mdtPhoneMedia(citizenid, page), [citizenid, page]);
    const photos = data?.rows ?? [];
    const memos = data?.memos ?? [];

    if (!settled) return null;
    if (photos.length === 0 && memos.length === 0) {
        return <EmptyState center icon={ImageIcon} title={t('mdt.hsNoMedia', 'No media')} />;
    }

    return (
        <div className="flex flex-col gap-4 pb-6">
            {photos.length > 0 && (
                <MdtCard className="overflow-hidden p-3">
                    <div className="grid grid-cols-4 gap-2">
                        {photos.map(p => {
                            const video = isVideoUrl(p.url);
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setViewing(p.url)}
                                    aria-label={video ? t('mdt.hsPlayClip', 'Play clip') : t('mdt.hsViewPhoto', 'View photo')}
                                    className="relative aspect-square overflow-hidden rounded-[8px] bg-black/10 transition-opacity active:opacity-70 dark:bg-white/10"
                                >
                                    {video ? (
                                        <video src={p.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                                    ) : (
                                        <img src={p.url} alt="" className="h-full w-full object-cover" draggable={false} />
                                    )}
                                    {video && (
                                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
                                            <Play className="h-6 w-6 fill-white text-white drop-shadow" />
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <Pager page={data?.page ?? page} pageSize={data?.pageSize ?? 30} total={data?.total ?? 0} onPage={setPage} />
                </MdtCard>
            )}
            {memos.length > 0 && (
                <MdtCard className="overflow-hidden">
                    <div className={`px-4 pb-1 pt-3 ${mdtSectionHeader}`}>{t('mdt.hsMemos', 'Voice memos')}</div>
                    {memos.map(m => (
                        <div key={m.id} className="flex flex-col gap-2 px-4 py-2.5">
                            <div className="flex items-center gap-3">
                                <Mic className="h-[15px] w-[15px] shrink-0 text-ios-gray" strokeWidth={2.2} />
                                <span className={`min-w-0 flex-1 truncate ${mdtRowTitle}`}>{m.name || t('mdt.hsMemo', 'Voice memo')}</span>
                                <span className={`shrink-0 tabular-nums ${mdtRowMeta}`}>{formatDuration(m.duration || 0)}</span>
                                <span className={`shrink-0 tabular-nums ${mdtRowMeta}`}>{stamp(m.created_at)}</span>
                            </div>
                            {m.url && <audio src={m.url} controls preload="none" className="h-8 w-full" />}
                        </div>
                    ))}
                </MdtCard>
            )}

            {viewing && <ImageLightbox src={viewing} onClose={() => setViewing(null)} />}
        </div>
    );
}

function noteLines(body: string | null): { title: string; preview: string; rest: string } {
    const raw = (body ?? '').split('\n');
    const at = raw.findIndex(l => l.trim().length > 0);
    if (at < 0) return { title: t('mdt.hsUntitledNote', 'Untitled note'), preview: '', rest: '' };
    const after = raw.slice(at + 1);
    return {
        title:   raw[at].trim(),
        preview: after.map(l => l.trim()).filter(Boolean).join(' '),
        rest:    after.join('\n').replace(/^\s*\n/, '').trimEnd(),
    };
}

function NoteRow({ note, citizenid, open, onToggle, onView }: {
    note:      HandsetNote;
    citizenid: string;
    open:      boolean;
    onToggle:  () => void;
    onView:    (url: string) => void;
}) {
    const { title, preview, rest } = noteLines(note.body);
    const attachments = note.hasSketch || note.hasImage;

    // Sketches are megabyte data URLs, so they are fetched for the one note actually opened.
    const { data: sketches } = useAsyncData(
        () => (open && note.sketchCount > 0 ? mdtPhoneNote(citizenid, note.id) : Promise.resolve([])),
        [open, citizenid, note.id, note.sketchCount],
    );
    const media = [...(note.images ?? []), ...(sketches ?? [])];

    return (
        <div>
            <button type="button" onClick={onToggle} aria-expanded={open} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${mdtRowHover}`}>
                <ChevronRight
                    className={`h-[15px] w-[15px] shrink-0 text-ios-gray transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
                    strokeWidth={2.4}
                />
                <span className="min-w-0 flex-1">
                    <span className={`block truncate ${mdtRowTitle}`}>{title}</span>
                    {!open && preview && <span className={`block truncate ${mdtRowMeta}`}>{preview}</span>}
                </span>
                {!open && attachments && (
                    <Paperclip className="h-[13px] w-[13px] shrink-0 text-ios-gray" strokeWidth={2.2} />
                )}
                <span className={`shrink-0 tabular-nums ${mdtRowMeta}`}>{stamp(note.updated_at)}</span>
            </button>

            {open && (
                <div className="flex flex-col gap-2 px-4 pb-3.5 pl-[42px] pt-0.5">
                    {rest && (
                        <span className="whitespace-pre-wrap break-words text-[14px] leading-snug text-black/85 dark:text-white/85">
                            {rest}
                        </span>
                    )}
                    {media.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-0.5">
                            {media.map((url, i) => (
                                <button
                                    key={`${url}:${i}`}
                                    type="button"
                                    onClick={() => onView(url)}
                                    aria-label={t('mdt.hsViewAttachment', 'View attachment')}
                                    className="h-[76px] w-[76px] overflow-hidden rounded-[8px] bg-black/10 transition-opacity active:opacity-70 dark:bg-white/10"
                                >
                                    <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
                                </button>
                            ))}
                        </div>
                    )}
                    {attachments && media.length === 0 && (
                        <span className="flex gap-1.5">
                            {note.hasSketch && <Pill tone="blue">{t('mdt.hsSketch', 'Sketch')}</Pill>}
                            {note.hasImage && <Pill tone="orange">{t('mdt.hsImage', 'Image')}</Pill>}
                        </span>
                    )}
                    {note.created_at !== note.updated_at && (
                        <span className={mdtRowMeta}>
                            {t('mdt.hsNoteWritten', 'Written {when}', { when: stamp(note.created_at) })}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

function Notes({ citizenid }: { citizenid: string }) {
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState<string | null>(null);
    const [viewing, setViewing] = useState<string | null>(null);
    const { data, settled } = useAsyncData(() => mdtPhoneNotes(citizenid, page), [citizenid, page]);
    const rows = data?.rows ?? [];

    if (!settled) return null;
    if (rows.length === 0) return <EmptyState center icon={FileText} title={t('mdt.hsNoNotes', 'No notes')} />;

    return (
        <>
            <MdtCard className="overflow-hidden">
                {rows.map(n => (
                    <NoteRow
                        key={n.id}
                        note={n}
                        citizenid={citizenid}
                        open={open === String(n.id)}
                        onToggle={() => setOpen(cur => (cur === String(n.id) ? null : String(n.id)))}
                        onView={setViewing}
                    />
                ))}
                <Pager page={data?.page ?? page} pageSize={data?.pageSize ?? 30} total={data?.total ?? 0} onPage={setPage} />
            </MdtCard>
            {viewing && <ImageLightbox src={viewing} onClose={() => setViewing(null)} />}
        </>
    );
}

function Accounts({ citizenid }: { citizenid: string }) {
    const { data, settled } = useAsyncData(() => mdtPhoneAccounts(citizenid), [citizenid]);
    const mail = data?.mail ?? [];
    const apps = data?.apps ?? [];

    if (!settled) return null;
    if (mail.length === 0 && apps.length === 0) {
        return <EmptyState center icon={AtSign} title={t('mdt.hsNoAccounts', 'No accounts')} />;
    }

    return (
        <div className="flex flex-col gap-4 pb-6">
            {mail.length > 0 && (
                <MdtCard className="overflow-hidden">
                    <div className={`px-4 pb-1 pt-3 ${mdtSectionHeader}`}>{t('mdt.hsMail', 'Mailboxes')}</div>
                    {mail.map(m => (
                        <Row key={m.email}>
                            <AtSign className="h-[15px] w-[15px] shrink-0 text-ios-gray" strokeWidth={2.2} />
                            <span className="min-w-0 flex-1">
                                <span className={`block truncate ${mdtRowTitle}`}>{m.email}</span>
                                <span className={`block truncate ${mdtRowMeta}`}>{m.display_name || ''}</span>
                            </span>
                            <span className={`shrink-0 tabular-nums ${mdtRowMeta}`}>{stamp(m.created_at)}</span>
                        </Row>
                    ))}
                </MdtCard>
            )}
            {apps.length > 0 && (
                <MdtCard className="overflow-hidden">
                    <div className={`px-4 pb-1 pt-3 ${mdtSectionHeader}`}>{t('mdt.hsSignedIn', 'Signed in')}</div>
                    {apps.map(a => (
                        <Row key={`${a.app}:${a.username}`}>
                            <span className={`w-[92px] shrink-0 ${mdtRef}`}>{a.app}</span>
                            <span className="min-w-0 flex-1">
                                <span className={`block truncate ${mdtRowTitle}`}>{a.username}</span>
                                <span className={`block truncate ${mdtRowMeta}`}>{a.display_name || ''}</span>
                            </span>
                            <span className={`shrink-0 tabular-nums ${mdtRowMeta}`}>{stamp(a.created_at)}</span>
                        </Row>
                    ))}
                </MdtCard>
            )}
        </div>
    );
}

function TabRail({ tab, onTab, accent }: {
    tab:    HandsetTab;
    onTab:  (value: HandsetTab) => void;
    accent: string;
}) {
    const railRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const rail = railRef.current;
        if (!rail) return;
        const chip = rail.querySelector<HTMLElement>('[data-active="true"]');
        if (!chip) return;
        const lead = chip.offsetLeft - 24;
        const trail = chip.offsetLeft + chip.offsetWidth + 24;
        if (lead < rail.scrollLeft) rail.scrollLeft = Math.max(0, lead);
        else if (trail > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = trail - rail.clientWidth;
    }, [tab]);

    return (
        <div ref={railRef} className="relative -mx-6 mb-4 shrink-0 overflow-x-auto">
            <div className="flex w-max gap-1.5 px-6">
                {handsetTabs().map(opt => {
                    const active = opt.value === tab;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            data-active={active ? 'true' : undefined}
                            aria-current={active || undefined}
                            onClick={() => onTab(opt.value)}
                            className={`shrink-0 rounded-full px-4 py-[9px] text-[14px] font-semibold tracking-tight transition-colors duration-150 ${
                                active
                                    ? 'text-white'
                                    : 'bg-black/[0.06] text-black active:bg-black/[0.11] dark:bg-white/[0.12] dark:text-white dark:active:bg-white/[0.18]'
                            }`}
                            style={active ? { background: accent } : undefined}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function Handset({ citizenid, accent }: { citizenid: string; accent: string }) {
    const [tab, setTab] = useSessionState<HandsetTab>('mdt:phone:tab', 'overview');

    const hostRef = useRef<HTMLDivElement>(null);
    const [narrow, setNarrow] = useState(false);

    useLayoutEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const measure = () => setNarrow(host.clientWidth < HANDSET_RAIL_MIN);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(host);
        return () => ro.disconnect();
    }, []);

    return (
        <div ref={hostRef} className={`flex min-h-0 flex-1 flex-col ${mdtPanePad}`}>
            {narrow ? (
                <TabRail tab={tab} onTab={setTab} accent={accent} />
            ) : (
                <SegmentedControl
                    className={`mb-4 shrink-0 ${mdtSegmentedDense}`}
                    value={tab}
                    onChange={setTab}
                    options={handsetTabs()}
                />
            )}
            <Scroller className="min-h-0 flex-1">
                {tab === 'overview' && <Overview citizenid={citizenid} />}
                {tab === 'contacts' && <Contacts citizenid={citizenid} />}
                {tab === 'calls'    && <Calls citizenid={citizenid} />}
                {tab === 'messages' && <Messages citizenid={citizenid} />}
                {tab === 'media'    && <Media citizenid={citizenid} />}
                {tab === 'notes'    && <Notes citizenid={citizenid} />}
                {tab === 'accounts' && <Accounts citizenid={citizenid} />}
            </Scroller>
        </div>
    );
}

export function PhonePane() {
    const { selected, select, department } = useMdtSession();

    const [query, setQuery] = useSessionState('mdt:phone:query', '');
    const [page, setPage] = useSessionState('mdt:phone:page', 1);

    const { data, loading } = useAsyncData(() => mdtPersonsSearch(query.trim(), page), [query, page]);
    const rows = data?.rows ?? [];

    const accent = department?.accent ?? MDT_ACCENT;
    const openPerson = selected ? rows.find(row => row.citizenid === selected) : undefined;

    const master = (
        <ListColumn
            className="flex-1"
            minWidth={0}
            title={t('mdt.hsHandsets', 'Handsets')}
            count={data?.total ?? 0}
            query={query}
            onQuery={setQuery}
            placeholder={t('mdt.searchCitizens', 'Name, citizen ID or phone')}
            isEmpty={rows.length === 0}
            empty={
                <EmptyState
                    center
                    icon={Smartphone}
                    title={loading ? t('mdt.loading', 'Loading') : t('mdt.noMatches', 'No matches')}
                />
            }
            footer={<Pager page={data?.page ?? page} pageSize={data?.pageSize ?? 25} total={data?.total ?? 0} onPage={setPage} />}
        >
            <div className="mdt-stagger flex flex-col gap-0.5">
                {rows.map(row => (
                    <CitizenRow
                        key={row.citizenid}
                        person={row}
                        selected={row.citizenid === selected}
                        onPress={() => select(row.citizenid)}
                    />
                ))}
            </div>
        </ListColumn>
    );

    return (
        <MasterDetail
            master={master}
            detail={selected ? <Handset key={selected} citizenid={selected} accent={accent} /> : undefined}
            onCloseDetail={() => select(null)}
            backLabel={department?.short ?? t('mdt.hsHandsets', 'Handsets')}
            detailTitle={openPerson?.name}
            placeholder={
                <EmptyState
                    center
                    icon={Smartphone}
                    title={t('mdt.hsPick', 'No handset selected')}
                    subtitle={t('mdt.hsPickSub', 'Pick a citizen to read the contacts, calls, messages, media and accounts held on their phone.')}
                />
            }
        />
    );
}
