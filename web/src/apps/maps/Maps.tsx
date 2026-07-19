import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Car, Check, CircleAlert, ClipboardPaste, Copy, Crosshair, DollarSign, Flag, Fuel, Heart,
    Home, Image as ImageIcon, MapPin, Navigation, Plus, Share, ShoppingCart, Skull, Star, Trash2, Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { AlertDialog } from '@/ui/AlertDialog';
import { SearchBar } from '@/ui/SearchBar';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { ShareAction, ShareSheet } from '@/shared/ShareSheet';
import { copyToClipboard } from '@/lib/clipboard';
import { fetchNui, isFiveM } from '@/core/nui';
import { apiCall } from '@/core/api';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { mapsConfig } from './config';
import { MapView, usePinStyle } from './MapView';
import { LiveDot } from './LiveDot';
import type { MapViewHandle } from './MapView';
import {
    COLOR_SWATCHES, getDefaultMarkers, ICON_KEYS, loadMarkers, newId, saveMarkers,
} from './data';
import type { IconKey, MapMarker } from './data';
import { ContactsPanel, FriendDot, PeoplePanel, useFriendsRoster } from './PeoplePanel';
import type { Friend } from '@/apps/findfriends/data';
import { decodeWaypoint, encodeWaypoint } from '@/lib/waypointCode';
import { takeMapsTarget } from '@/shell/deeplink';
import { fetchDirectory } from '@/apps/services/servicesApi';
import type { Company } from '@/apps/services/data';
import { t } from '@/i18n';

const ICONS: Record<string, LucideIcon> = {
    MapPin, Home, Star, Flag, Skull, DollarSign,
    Car, Crosshair, Heart, Wrench, ShoppingCart, Fuel,
};
function iconFor(key: string): LucideIcon { return ICONS[key] ?? MapPin; }

function revealRow(container: HTMLDivElement | null, row: HTMLDivElement | null | undefined) {
    if (!container || !row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight;
}

interface Pending {
    ax: number; ay: number;
    x: number;  y: number;
    label: string; icon: IconKey; color: string;
}

export function Maps({ onClose }: { onClose: () => void }) {
    const [markers, setMarkers] = useState<MapMarker[]>(() => (isFiveM ? getDefaultMarkers() : loadMarkers()));
    const [selected, setSelected] = useSessionState<string | null>('maps:selectedPin', null);
    const [selectedCompany, setSelectedCompany] = useSessionState<string | null>('maps:selectedCompany', null);
    const mapRef = useRef<MapViewHandle>(null);

    const [companies, setCompanies] = useState<Company[]>([]);
    useEffect(() => {
        let alive = true;
        void fetchDirectory().then(d => { if (alive) setCompanies((d.companies ?? []).filter(c => c.coords)); });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        const target = takeMapsTarget();
        let alive = true;

        const companyTarget = target?.companyId ? target : null;
        const pinTarget = companyTarget ? null : target;
        if (companyTarget) {
            setSheetTab('companies');
            setSelectedCompany(companyTarget.companyId!);
            window.setTimeout(() => mapRef.current?.centerOnWorld(companyTarget.x, companyTarget.y), 240);
        }

        const focus = (id: string, x: number, y: number) => {
            setSelected(id);
            window.setTimeout(() => mapRef.current?.centerOnWorld(x, y), 220);
        };
        const withTarget = (list: MapMarker[]): MapMarker[] => {
            const target = pinTarget;
            if (!target) return list;
            const label = target.label || t('maps.sharedLocation', 'Shared location');
            const found = list.find(p => p.label === label && Math.abs(p.x - target.x) < 1 && Math.abs(p.y - target.y) < 1);
            if (found) { focus(found.id, target.x, target.y); return list; }
            const m: MapMarker = {
                id: newId(), label, x: target.x, y: target.y,
                icon:  (ICON_KEYS as readonly string[]).includes(target.icon ?? '') ? (target.icon as IconKey) : 'MapPin',
                color: target.color ?? COLOR_SWATCHES[0],
            };
            const next = [m, ...list];
            if (isFiveM) void fetchNui('sd-phone:maps:save', { markers: next }); else saveMarkers(next);
            focus(m.id, target.x, target.y);
            return next;
        };

        if (isFiveM) {
            fetchNui<{ data?: MapMarker[] }>('sd-phone:maps:list')
                .then(r => { if (alive) setMarkers(withTarget(Array.isArray(r?.data) ? r.data : [])); })
                .catch(() => {});
        } else if (pinTarget) {
            setMarkers(prev => withTarget(prev));
        }
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [me, setMe] = useState<{ x: number; y: number; h: number } | null>(
        isFiveM ? null : { x: -1037, y: -2738, h: 0 },
    );
    useNuiEvent('sd-phone:maps:location', useCallback((d) => {
        if (d) setMe({ x: d.x, y: d.y, h: d.h });
    }, []));
    useEffect(() => {
        if (!isFiveM) return;
        void fetchNui('sd-phone:maps:watch', { on: true });
        return () => { void fetchNui('sd-phone:maps:watch', { on: false }); };
    }, []);

    useNuiEvent('sd-phone:maps:pinAdded', useCallback((m) => {
        if (!m || typeof m.id !== 'string') return;
        setMarkers(prev => prev.some(p => p.id === m.id) ? prev : [m as MapMarker, ...prev]);
    }, []));

    const [calib, setCalib] = useState<{ x: number; y: number; fx: number; fy: number }[] | null>(null);
    useNuiEvent('sd-phone:maps:calibrate', useCallback((d) => {
        setCalib(prev => (d?.on ? (prev ?? []) : prev));
    }, []));

    const commit = useCallback((next: MapMarker[]) => {
        setMarkers(next);
        if (isFiveM) void fetchNui('sd-phone:maps:save', { markers: next });
        else saveMarkers(next);
    }, []);

    const [placing, setPlacing] = useState(false);
    const [pending, setPending] = useState<Pending | null>(null);
    const [query, setQuery] = useSessionState('maps:query', '');
    const [companyQuery, setCompanyQuery] = useSessionState('maps:companyQuery', '');
    const [pinsOpen, setPinsOpen] = useSessionState('maps:pinsOpen', true);

    const [peopleOn, setPeopleOn] = useState(true);
    useEffect(() => { void mapsConfig().then(c => setPeopleOn(c.people)); }, []);
    const [sheetTab, setSheetTab] = useSessionState<'pins' | 'people' | 'companies'>('maps:sheetTab', 'pins');
    const [friendSel, setFriendSel] = useSessionState<string | null>('maps:friendSel', null);
    const [pickerOpen, setPickerOpen] = useSessionState('maps:friendPicker', false);
    const { friends, visible: visibleFriends, toggleShare, removeFriend, addFriend, respond, addError } = useFriendsRoster(peopleOn);
    useEffect(() => {
        if (!peopleOn) { setSheetTab(prev => prev === 'people' ? 'pins' : prev); setPickerOpen(false); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [peopleOn]);
    const addedNumbers = new Set(friends.map(f => (f.phone || '').replace(/\D/g, '')));

    const [showAvatars, setShowAvatars] = useState(() => {
        try { return window.localStorage.getItem('sd-phone:friends:avatars') !== '0'; } catch { return true; }
    });
    function toggleAvatars() {
        setShowAvatars(v => {
            const next = !v;
            try { window.localStorage.setItem('sd-phone:friends:avatars', next ? '1' : '0'); } catch { /* ignore */ }
            return next;
        });
    }

    const [toast, setToast] = useState<{ msg: string; leaving: boolean } | null>(null);
    const toastTimers = useRef<number[]>([]);
    const showToast = useCallback((msg: string) => {
        toastTimers.current.forEach(t => window.clearTimeout(t));
        setToast({ msg, leaving: false });
        toastTimers.current = [
            window.setTimeout(() => setToast(t => (t ? { ...t, leaving: true } : t)), 2400),
            window.setTimeout(() => setToast(null), 2400 + 320),
        ];
    }, []);
    useEffect(() => { if (addError) showToast(addError); }, [addError, showToast]);
    useEffect(() => () => { toastTimers.current.forEach(t => window.clearTimeout(t)); }, []);
    function focusFriend(f: Friend) {
        if (f.x == null || f.y == null) return;
        setFriendSel(f.id);
        mapRef.current?.centerOnWorld(f.x, f.y);
    }
    const [sharing, setSharing] = useState<MapMarker | null>(null);
    const [importing, setImporting] = useState(false);
    const [confirmPin, setConfirmPin] = useState<MapMarker | null>(null);

    const mapLayer: 'pins' | 'people' | 'companies' = (pending || importing) ? 'pins' : pickerOpen ? 'people' : sheetTab;

    const sheetTabs: Array<'pins' | 'companies' | 'people'> =
        peopleOn ? ['pins', 'companies', 'people'] : ['pins', 'companies'];

    const shown = query.trim()
        ? markers.filter(m => m.label.toLowerCase().includes(query.trim().toLowerCase()))
        : markers;

    const companyMatches = companyQuery.trim()
        ? companies.filter(c => c.name.toLowerCase().includes(companyQuery.trim().toLowerCase()))
        : companies;

    const pinsListRef     = useRef<HTMLDivElement>(null);
    const pinRowRefs      = useRef(new Map<string, HTMLDivElement>());
    const compListRef     = useRef<HTMLDivElement>(null);
    const compRowRefs     = useRef(new Map<string, HTMLDivElement>());
    useEffect(() => { if (selected) revealRow(pinsListRef.current, pinRowRefs.current.get(selected)); }, [selected]);
    useEffect(() => { if (selectedCompany) revealRow(compListRef.current, compRowRefs.current.get(selectedCompany)); }, [selectedCompany, companies.length]);

    function onPlace(x: number, y: number, anchor: { ax: number; ay: number; fx: number; fy: number }) {
        if (calib !== null) {
            if (me) {
                const entry = { x: me.x, y: me.y, fx: anchor.fx, fy: anchor.fy };
                console.log('[mapcal] captured', JSON.stringify(entry));
                setCalib(prev => [...(prev ?? []), entry]);
            }
            return;
        }
        setPlacing(false);
        setPending({ ax: anchor.ax, ay: anchor.ay, x, y, label: '', icon: 'MapPin', color: COLOR_SWATCHES[0] });
        setPinsOpen(true);
    }

    function confirmPending() {
        if (!pending || !pending.label.trim()) return;
        const m: MapMarker = {
            id: newId(), label: pending.label.trim(),
            x: pending.x, y: pending.y, color: pending.color, icon: pending.icon,
        };
        commit([m, ...markers]);
        setPending(null);
    }

    function removeMarker(id: string) {
        commit(markers.filter(m => m.id !== id));
        if (selected === id) setSelected(null);
    }
    function focusMarker(m: MapMarker) {
        setSelected(m.id);
        mapRef.current?.centerOnWorld(m.x, m.y);
    }
    function focusCompany(c: Company) {
        setSelectedCompany(c.id);
    }
    function setWaypoint(m: MapMarker) {
        void fetchNui('sd-phone:maps:waypoint', { x: m.x, y: m.y });
    }

    function importCode(raw: string): boolean {
        const decoded = decodeWaypoint(raw);
        if (!decoded) return false;
        const m: MapMarker = { id: newId(), ...decoded };
        commit([m, ...markers]);
        setSelected(m.id);
        setImporting(false);
        mapRef.current?.centerOnWorld(m.x, m.y);
        return true;
    }

    return (
        <div className="absolute inset-0 flex flex-col bg-[#d4d4d4] font-sf dark:bg-base">
            <div className="flex shrink-0 items-center px-5 pb-2" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
                <h1 className="text-[28px] font-extrabold tracking-tight text-black dark:text-white">{t('maps.title', 'Maps')}</h1>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
                <MapView
                    ref={mapRef}
                    placing={placing || calib !== null}
                    onPlace={onPlace}
                    onTapEmpty={() => { setSelected(null); setFriendSel(null); setSelectedCompany(null); }}
                    chromeBottom={pinsOpen ? '360px' : '74px'}
                    insetBottom={pinsOpen ? 352 : 66}
                >
                    <MapLayer active={mapLayer === 'companies'}>
                        {companies.map(c => c.coords && (
                            <CompanyPin
                                key={c.id}
                                x={c.coords.x}
                                y={c.coords.y}
                                color={c.color}
                                emoji={c.emoji}
                                label={c.name}
                                interactive={mapLayer === 'companies'}
                                selected={selectedCompany === c.id}
                                onFocus={() => focusCompany(c)}
                            />
                        ))}
                    </MapLayer>
                    <MapLayer active={mapLayer === 'pins'}>
                        {markers.map(m => (
                            <MarkerPin
                                key={m.id}
                                m={m}
                                selected={selected === m.id}
                                interactive={mapLayer === 'pins' && !placing && calib === null && !pending}
                                onSelect={() => setSelected(m.id)}
                            />
                        ))}
                        {pending && (
                            <MarkerPin
                                m={{ id: '__pending', label: pending.label || t('maps.newPin', 'New Pin'), x: pending.x, y: pending.y, color: pending.color, icon: pending.icon }}
                                selected={false}
                                interactive={false}
                                onSelect={() => {}}
                                drop
                            />
                        )}
                    </MapLayer>
                    <MapLayer active={mapLayer === 'people'}>
                        {visibleFriends.map(f => (
                            <FriendDot
                                key={f.id}
                                f={f}
                                selected={friendSel === f.id}
                                interactive={mapLayer === 'people' && !placing && calib === null}
                                showAvatar={showAvatars}
                                onSelect={() => setFriendSel(f.id)}
                            />
                        ))}
                    </MapLayer>
                    {me && <LiveDot x={me.x} y={me.y} heading={me.h} />}
                </MapView>

                {placing && calib === null && (
                    <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-ios-blue px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-lg">
                        {t('maps.tapToDropPin', 'Tap the map to drop a pin')}
                    </div>
                )}

                {calib !== null && (
                    <div className="absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/85 px-3 py-1.5 text-[12px] font-semibold text-white shadow-lg">
                        <span>{me ? 'CALIBRATE · tap your real spot' : 'CALIBRATE · waiting for GPS…'} · {calib.length} pts</span>
                        <button
                            onClick={() => { const s = JSON.stringify(calib); navigator.clipboard?.writeText(s).catch(() => {}); console.log('[mapcal]', s); }}
                            className="rounded-full bg-ios-blue px-2 py-0.5"
                        >Copy</button>
                        <button
                            onClick={() => { setCalib(null); void fetchNui('sd-phone:maps:calibrateDone', {}); }}
                            className="rounded-full bg-white/20 px-2 py-0.5"
                        >Done</button>
                    </div>
                )}

            </div>

            <div className={`absolute inset-x-0 bottom-0 rounded-t-[16px] border-t border-black/[0.06] bg-[#d4d4d4] dark:border-white/10 dark:bg-base ${
                pinsOpen ? 'z-30' : 'pointer-events-none z-[60]'
            }`}>
                {toast && (
                    <div className="pointer-events-none absolute bottom-8 inset-x-0 z-10 flex justify-center">
                        <div
                            className={`flex max-w-[85%] items-center gap-2 rounded-full bg-black/85 px-4 py-2.5 shadow-lg backdrop-blur ${
                                toast.leaving ? 'animate-slide-out-down' : 'animate-slide-up-fade'
                            }`}
                        >
                            <CircleAlert className="h-[18px] w-[18px] shrink-0 text-ios-red" strokeWidth={2.4} />
                            <span className="truncate text-[15px] font-semibold text-white">{toast.msg}</span>
                        </div>
                    </div>
                )}

                <button
                    onClick={() => { setPlacing(p => !p); setPending(null); }}
                    className="absolute -top-[60px] right-3 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg active:scale-90"
                    style={{
                        background: placing ? '#ff3b30' : '#0a84ff',
                        opacity: mapLayer === 'pins' ? 1 : 0,
                        pointerEvents: mapLayer === 'pins' ? 'auto' : 'none',
                        transition: 'background 250ms ease, transform 150ms ease, opacity 300ms ease',
                    }}
                    aria-hidden={mapLayer !== 'pins'}
                    tabIndex={mapLayer === 'pins' ? 0 : -1}
                    aria-label={placing ? t('maps.cancelPlacing', 'Cancel placing') : t('maps.addMarker', 'Add marker')}
                >
                    <Plus
                        className="h-6 w-6"
                        style={{
                            transform: placing ? 'rotate(45deg)' : 'rotate(0deg)',
                            transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
                        }}
                    />
                </button>
                <button
                    type="button"
                    onClick={() => setPinsOpen(!pinsOpen)}
                    aria-label={pinsOpen ? t('maps.hidePins', 'Hide pins') : t('maps.showPins', 'Show pins')}
                    className={`flex justify-center ${pinsOpen
                        ? 'w-full pb-1 pt-2'
                        : 'pointer-events-auto mx-auto w-36 pb-12 pt-3'}`}
                >
                    <div className="h-[5px] w-9 rounded-full bg-black/20 dark:bg-white/25" />
                </button>

                <div
                    className="overflow-hidden transition-[max-height] duration-300"
                    style={{ maxHeight: pinsOpen ? 360 : 0, transitionTimingFunction: 'cubic-bezier(0.22,0.61,0.36,1)' }}
                >
                <div key={pending ? 'newpin' : importing ? 'import' : pickerOpen ? 'contacts' : sheetTab} className="animate-swipe-in-left">
                {pending ? (
                    <NewPinPanel
                        pending={pending}
                        onChange={setPending}
                        onConfirm={confirmPending}
                        onCancel={() => setPending(null)}
                    />
                ) : importing ? (
                    <ImportPanel onImport={importCode} onCancel={() => setImporting(false)} onError={showToast} />
                ) : pickerOpen ? (
                    <ContactsPanel
                        existing={addedNumbers}
                        onPick={c => { addFriend(c.phone); setPickerOpen(false); }}
                        onCancel={() => setPickerOpen(false)}
                    />
                ) : (
                <>
                <div className="flex h-[42px] shrink-0 items-center justify-between px-4">
                    <SegmentedControl
                        value={sheetTab}
                        onChange={tab => { setSheetTab(tab); if (tab !== 'pins') setPlacing(false); }}
                        options={sheetTabs.map(tab => ({
                            value: tab,
                            label: tab === 'pins' ? t('maps.tabPins', 'Pins') : tab === 'companies' ? t('maps.tabCompanies', 'Companies') : t('maps.tabPeople', 'People'),
                        }))}
                        fit
                    />
                    {sheetTab === 'pins' ? (
                        <div className="flex items-center gap-3">
                            <button onClick={() => setImporting(true)} className="flex items-center gap-1 text-[16px] font-semibold text-ios-blue active:opacity-60">
                                <ClipboardPaste className="h-[17px] w-[17px]" /> {t('maps.import', 'Import')}
                            </button>
                            <span className="text-[15px] text-ios-gray">{markers.length}</span>
                        </div>
                    ) : sheetTab === 'companies' ? (
                        <span className="text-[15px] text-ios-gray">{companies.length}</span>
                    ) : (
                        <div className="flex items-center gap-3">
                            {/* Hidden when no friend has a photo - the toggle would visibly do nothing. */}
                            {friends.some(f => f.avatar) && (
                                <button
                                    onClick={toggleAvatars}
                                    aria-label={showAvatars ? t('maps.showInitials', 'Show initials instead of photos') : t('maps.showContactPhotos', 'Show contact photos')}
                                    title={showAvatars ? t('maps.showingPhotos', 'Showing photos') : t('maps.showingInitials', 'Showing initials')}
                                    className={(showAvatars ? 'text-ios-blue' : 'text-ios-gray') + ' active:opacity-60'}
                                >
                                    <ImageIcon className="h-[20px] w-[20px]" strokeWidth={2.2} />
                                </button>
                            )}
                            <span className="text-[15px] text-ios-gray">
                                {t('maps.sharingCount', '{count} sharing', { count: visibleFriends.length })}
                            </span>
                        </div>
                    )}
                </div>

                {sheetTab === 'people' ? (
                    <PeoplePanel
                        friends={friends}
                        selectedId={friendSel}
                        showAvatars={showAvatars}
                        onFocus={focusFriend}
                        onToggleShare={toggleShare}
                        onRemove={removeFriend}
                        onRespond={respond}
                        onAdd={addFriend}
                        onOpenPicker={() => setPickerOpen(true)}
                    />
                ) : sheetTab === 'companies' ? (
                    <>
                    <SearchBar value={companyQuery} onChange={setCompanyQuery} placeholder={t('maps.searchCompanies', 'Search Companies')} className="mx-4 mt-1 mb-2" />
                    <div ref={compListRef} className="no-scrollbar relative overflow-y-auto px-4 pb-4" style={{ height: 240 }}>
                        {companyMatches.length === 0 ? (
                            <p className="py-6 text-center text-[15px] text-ios-gray">
                                {companyQuery ? t('maps.noCompaniesMatch', 'No companies match your search.') : t('maps.noCompanies', 'No companies.')}
                            </p>
                        ) : (
                            <div className="overflow-hidden rounded-[12px] bg-[#e5e5e5] dark:bg-surface">
                                {companyMatches.map((c, i) => (
                                    <div
                                        key={c.id}
                                        ref={el => { if (el) compRowRefs.current.set(c.id, el); else compRowRefs.current.delete(c.id); }}
                                        className={'relative flex h-[78px] items-center gap-3.5 pl-3.5 pr-2 ' +
                                            (selectedCompany === c.id ? 'bg-ios-blue/10' : 'active:bg-black/5 dark:active:bg-white/5')}
                                    >
                                        <button
                                            onClick={() => focusCompany(c)}
                                            className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
                                        >
                                            <span className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full text-[28px] leading-none shadow-sm" style={{ background: c.color }}>{c.emoji}</span>
                                            <span className="flex min-w-0 flex-col leading-tight">
                                                <span className="truncate text-[21px] font-semibold text-black dark:text-white">{c.name}</span>
                                                <span className="mt-[2px] truncate text-[16px] font-medium text-ios-gray">{c.location}</span>
                                            </span>
                                        </button>
                                        <button
                                            onClick={() => { if (c.coords) setWaypoint({ id: c.id, label: c.name, x: c.coords.x, y: c.coords.y, color: c.color, icon: 'MapPin' }); }}
                                            aria-label={t('maps.setWaypoint', 'Set waypoint')} title={t('maps.setWaypoint', 'Set waypoint')}
                                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-blue/[0.12] text-ios-blue active:bg-ios-blue/25 dark:bg-ios-blue/[0.18] dark:active:bg-ios-blue/30"
                                        >
                                            <Navigation className="h-[18px] w-[18px]" strokeWidth={2.2} />
                                        </button>
                                        {i < companyMatches.length - 1 && (
                                            <div className="absolute bottom-0 left-0 right-0 h-px bg-black/[0.07] dark:bg-white/[0.08]" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    </>
                ) : (
                <>
                <SearchBar value={query} onChange={setQuery} placeholder={t('maps.searchPins', 'Search Pins')} className="mx-4 mt-1 mb-2" />

                <div ref={pinsListRef} className="no-scrollbar relative overflow-y-auto px-4 pb-4" style={{ height: 240 }}>
                    {shown.length === 0 ? (
                        <p className="py-6 text-center text-[15px] text-ios-gray">
                            {query ? t('maps.noPinsMatch', 'No pins match your search.') : t('maps.noPinsYet', 'No pins yet — tap ＋ then tap the map to drop one.')}
                        </p>
                    ) : (
                        <div className="overflow-hidden rounded-[12px] bg-[#e5e5e5] dark:bg-surface">
                            {shown.map((m, i) => {
                                const Icon = iconFor(m.icon);
                                return (
                                    <div
                                        key={m.id}
                                        ref={el => { if (el) pinRowRefs.current.set(m.id, el); else pinRowRefs.current.delete(m.id); }}
                                        className={'relative flex h-[78px] items-center gap-3.5 pl-3.5 pr-2 ' +
                                            (selected === m.id ? 'bg-ios-blue/10' : 'active:bg-black/5 dark:active:bg-white/5')}
                                    >
                                        <button onClick={() => focusMarker(m)} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
                                            <span className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full shadow-sm" style={{ background: m.color }}>
                                                <Icon className="h-[26px] w-[26px] text-white" strokeWidth={2.2} />
                                            </span>
                                            <span className="flex min-w-0 flex-col leading-tight">
                                                <span className="truncate text-[21px] font-semibold text-black dark:text-white">{m.label}</span>
                                                <span className="mt-[2px] text-[16px] font-medium tabular-nums text-ios-gray">
                                                    {m.x.toFixed(0)}, {m.y.toFixed(0)}
                                                </span>
                                            </span>
                                        </button>
                                        <button onClick={() => setSharing(m)} aria-label={t('maps.shareWaypoint', 'Share waypoint')} title={t('maps.shareWaypoint', 'Share waypoint')}
                                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-blue/[0.12] text-ios-blue active:bg-ios-blue/25 dark:bg-ios-blue/[0.18] dark:active:bg-ios-blue/30">
                                            <Share className="h-[18px] w-[18px]" strokeWidth={2.2} />
                                        </button>
                                        <button onClick={() => setWaypoint(m)} aria-label={t('maps.setWaypoint', 'Set waypoint')} title={t('maps.setWaypoint', 'Set waypoint')}
                                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-blue/[0.12] text-ios-blue active:bg-ios-blue/25 dark:bg-ios-blue/[0.18] dark:active:bg-ios-blue/30">
                                            <Navigation className="h-[18px] w-[18px]" strokeWidth={2.2} />
                                        </button>
                                        <button onClick={() => setConfirmPin(m)} aria-label={t('maps.delete', 'Delete')}
                                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-red/[0.12] text-ios-red active:bg-ios-red/25 dark:bg-ios-red/[0.18] dark:active:bg-ios-red/30">
                                            <Trash2 className="h-[18px] w-[18px]" strokeWidth={2.2} />
                                        </button>
                                        {i < shown.length - 1 && (
                                            <div className="absolute bottom-0 left-0 right-0 h-px bg-black/[0.07] dark:bg-white/[0.08]" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                </>
                )}
                </>
                )}
                </div>
                </div>
            </div>

            {sharing && <PinShareSheet marker={sharing} onClose={() => setSharing(null)} />}

            {confirmPin && (
                <AlertDialog
                    title={t('maps.deletePinTitle', 'Delete Pin?')}
                    message={t('maps.deletePinMessage', '"{label}" will be removed from your map.', { label: confirmPin.label })}
                    confirmLabel={t('maps.delete', 'Delete')}
                    destructive
                    onCancel={() => setConfirmPin(null)}
                    onConfirm={() => { removeMarker(confirmPin.id); setConfirmPin(null); }}
                />
            )}

            <button
                type="button"
                onClick={onClose}
                aria-label={t('maps.closeMaps', 'Close Maps')}
                className="absolute inset-x-0 bottom-0 z-50 h-7 cursor-default"
            />
        </div>
    );
}

function ImportPanel({ onImport, onCancel, onError }: {
    onImport: (raw: string) => boolean;
    onCancel: () => void;
    onError:  (msg: string) => void;
}) {
    const [value, setValue] = useState('');

    function submit() {
        if (!onImport(value)) onError(t('maps.invalidWaypointCode', "That doesn't look like a valid waypoint code."));
    }

    return (
        <>
            <div className="flex h-[42px] shrink-0 items-center justify-between px-4">
                <h2 className="text-[20px] font-bold tracking-tight text-black dark:text-white">{t('maps.importWaypoint', 'Import Waypoint')}</h2>
                <button onClick={onCancel} className="text-[16px] font-semibold text-ios-blue active:opacity-60">
                    {t('maps.cancel', 'Cancel')}
                </button>
            </div>

            <div className="mx-4 mb-2 flex h-[52px] items-center gap-2 rounded-[10px] bg-[#e5e5e5] px-3.5 dark:bg-white/10">
                <input
                    autoFocus
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
                    placeholder="SDW1:…"
                    className="min-w-0 flex-1 bg-transparent font-mono text-[16px] text-black outline-none placeholder-black/55 dark:text-white dark:placeholder-white/55"
                />
            </div>

            <div className="no-scrollbar overflow-y-auto px-4 pb-4" style={{ height: 232 }}>
                <p className="px-1 pt-1 text-[14px] font-medium text-ios-gray">
                    {t('maps.importHintStart', 'Paste a waypoint code (starts with ')}<span className="font-mono">SDW1:</span>{t('maps.importHintEnd', ') someone shared with you. Press Ctrl+V in the field to paste.')}
                </p>
                <button
                    onClick={submit}
                    disabled={!value.trim()}
                    className="mt-3 w-full rounded-[12px] bg-ios-blue py-3 text-[17px] font-semibold text-white active:opacity-80 disabled:opacity-40"
                >
                    {t('maps.addToMap', 'Add to Map')}
                </button>
            </div>
        </>
    );
}

function MapLayer({ active, children }: { active: boolean; children: React.ReactNode }) {
    return (
        <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-300"
            style={{ opacity: active ? 1 : 0 }}
        >
            {children}
        </div>
    );
}

function MarkerPin({ m, selected, interactive, onSelect, drop = false }: {
    m: MapMarker;
    selected: boolean;
    interactive: boolean;
    onSelect: () => void;
    drop?: boolean;
}) {
    const style = usePinStyle(m.x, m.y);
    const Icon = iconFor(m.icon);
    return (
        <div
            className="flex flex-col items-center"
            style={{ ...style, transform: 'translate(-50%, -100%)', pointerEvents: 'none', zIndex: selected ? 30 : 10 }}
        >
            <button
                type="button"
                aria-label={m.label}
                onPointerDown={e => e.stopPropagation()}
                onPointerUp={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onSelect(); }}
                className="group flex cursor-pointer flex-col items-center"
                style={{ pointerEvents: interactive ? 'auto' : 'none' }}
            >
                <div
                    className={'flex flex-col items-center transition-transform duration-150 group-hover:scale-110' + (drop ? ' animate-pin-drop' : '')}
                    style={{
                        transform: selected ? 'scale(1.15)' : undefined,
                        transformOrigin: '50% 100%',
                        filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))',
                    }}
                >
                    <div
                        className="flex items-center justify-center rounded-full"
                        style={{ width: 30, height: 30, background: m.color, border: '2px solid #fff', position: 'relative', zIndex: 1 }}
                    >
                        <Icon style={{ width: 16, height: 16, display: 'block' }} strokeWidth={2.6} className="text-white" />
                    </div>
                    <div style={{
                        width: 0, height: 0, marginTop: -4,
                        borderLeft: '5.5px solid transparent',
                        borderRight: '5.5px solid transparent',
                        borderTop: '13px solid #fff',
                    }} />
                </div>
            </button>
        </div>
    );
}

function CompanyPin({ x, y, color, emoji, label, interactive, selected, onFocus }: {
    x: number; y: number; color: string; emoji: string; label: string;
    interactive: boolean; selected: boolean; onFocus: () => void;
}) {
    const style = usePinStyle(x, y);
    return (
        <div
            className="flex flex-col items-center"
            style={{ ...style, transform: 'translate(-50%, -100%)', pointerEvents: 'none', zIndex: selected ? 30 : 8 }}
        >
            <button
                type="button"
                aria-label={label}
                onPointerDown={e => e.stopPropagation()}
                onPointerUp={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onFocus(); }}
                className="group flex cursor-pointer flex-col items-center"
                style={{ pointerEvents: interactive ? 'auto' : 'none' }}
            >
                <div
                    className="flex flex-col items-center transition-transform duration-150 group-hover:scale-110"
                    style={{ transform: selected ? 'scale(1.15)' : undefined, transformOrigin: '50% 100%', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))' }}
                >
                    <div
                        className="flex items-center justify-center overflow-hidden rounded-full"
                        style={{ width: 30, height: 30, background: color, border: '2px solid #fff', position: 'relative', zIndex: 1 }}
                    >
                        <span style={{ fontSize: 17, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>{emoji}</span>
                    </div>
                    <div style={{
                        width: 0, height: 0, marginTop: -4,
                        borderLeft: '5.5px solid transparent',
                        borderRight: '5.5px solid transparent',
                        borderTop: '13px solid #fff',
                    }} />
                </div>
            </button>
        </div>
    );
}

function NewPinPanel({ pending, onChange, onConfirm, onCancel }: {
    pending: Pending;
    onChange: (p: Pending) => void;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const Icon = iconFor(pending.icon);
    return (
        <>
            <div className="flex h-[42px] shrink-0 items-center px-4">
                <div className="flex flex-1 justify-start">
                    <button onClick={onCancel} className="text-[16px] text-ios-blue active:opacity-60">{t('maps.cancel', 'Cancel')}</button>
                </div>
                <h2 className="shrink-0 text-[18px] font-bold tracking-tight text-black dark:text-white">{t('maps.newPin', 'New Pin')}</h2>
                <div className="flex flex-1 justify-end">
                    <button
                        onClick={onConfirm}
                        disabled={!pending.label.trim()}
                        className="text-[16px] font-semibold text-ios-blue active:opacity-60 disabled:opacity-40"
                    >
                        {t('maps.addPin', 'Add Pin')}
                    </button>
                </div>
            </div>

            <div className="mx-4 mb-2 flex h-[50px] items-center gap-2.5 rounded-[10px] bg-[#e5e5e5] px-3.5 dark:bg-white/10">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: pending.color }}>
                    <Icon className="h-[17px] w-[17px] text-white" strokeWidth={2.4} />
                </span>
                <input
                    autoFocus
                    maxLength={40}
                    value={pending.label}
                    onChange={e => onChange({ ...pending, label: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') onConfirm(); if (e.key === 'Escape') onCancel(); }}
                    placeholder={t('maps.pinName', 'Pin name')}
                    className="min-w-0 flex-1 bg-transparent text-[18px] font-medium text-black outline-none placeholder-black/55 dark:text-white dark:placeholder-white/55"
                />
            </div>

            <div className="no-scrollbar overflow-y-auto px-4 pb-4" style={{ height: 234 }}>
                <div className="rounded-[12px] bg-[#e5e5e5] p-3 dark:bg-surface">
                    <div className="grid grid-cols-6 justify-items-center gap-2">
                        {ICON_KEYS.map(key => {
                            const K = iconFor(key);
                            const on = pending.icon === key;
                            return (
                                <button
                                    key={key}
                                    onClick={() => onChange({ ...pending, icon: key })}
                                    aria-label={key}
                                    className="flex h-11 w-11 items-center justify-center rounded-full transition-colors"
                                    style={{ background: on ? pending.color : 'rgba(127,127,127,0.15)' }}
                                >
                                    <K className={'h-[21px] w-[21px] ' + (on ? 'text-white' : 'text-black/60 dark:text-white/65')} strokeWidth={2.3} />
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-3 grid grid-cols-6 justify-items-center gap-2">
                        {COLOR_SWATCHES.map(hex => (
                            <button
                                key={hex}
                                onClick={() => onChange({ ...pending, color: hex })}
                                aria-label={t('maps.colourSwatch', 'Colour {hex}', { hex })}
                                className="h-[34px] w-[34px] rounded-full transition-shadow"
                                style={{
                                    background: hex,
                                    boxShadow: pending.color.toLowerCase() === hex ? '0 0 0 2px #fff, 0 0 0 4px ' + hex : undefined,
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}

function PinShareSheet({ marker, onClose }: { marker: MapMarker; onClose: () => void }) {
    const [copied, setCopied] = useState(false);
    const code = encodeWaypoint(marker);
    return (
        <ShareSheet
            onClose={onClose}
            onShare={async t => {
                if (!isFiveM) return true;
                const r = await apiCall<void>('sd-phone:maps:sharePin', { target: t.id, marker });
                return r.success;
            }}
        >
            <ShareAction
                icon={copied ? <Check className="h-5 w-5 text-ios-green" /> : <Copy className="h-5 w-5" />}
                label={copied ? t('maps.copied', 'Copied!') : t('maps.copyWaypointCode', 'Copy Waypoint Code')}
                onClick={() => {
                    copyToClipboard(code);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                }}
            />
        </ShareSheet>
    );
}