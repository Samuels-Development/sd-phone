import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react';
import { Check, CircleAlert, Mouse, PackageOpen, Rotate3d, Smartphone, Wallet, X } from 'lucide-react';

import { t } from '@/i18n';
import { failText } from '@/core/api';
import { isFiveM } from '@/core/nui';
import { REF_VIEWPORT_H, useViewportScale } from '@/device/viewport';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { frameHex as frameColour } from '@/shell/frameColors';
import { HIDDEN_TEXT } from '@/shell/streamerMode';
import { useStreamerHidden } from '@/stores/themeStore';
import { ScreenRootContext } from '@/ui/portal';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Spinner } from '@/ui/Spinner';
import { Toggle } from '@/ui/Toggle';
import { preloadLayers } from './CasePreview';
import {
    buyCase, cleanDesign, collectCases, designKey, designPrice, devStore, equipCase, frameView, leaveStore, showScreen,
    previewDesign, readStore, rotateView, stickersOf, zoomView, type CaseView, type Design, type StoreState, type TrimKind,
} from './casesApi';
import { Configurator, stepView, type Step } from './Configurator';
import { DevStage, type DevTurn } from './DevStage';
import { PhonePanel } from './PhonePanel';
import { PhonePicker } from './PhonePicker';
import { PriceTag } from './PriceTag';
import { ACCENT, BUY_BG, money } from './ui';
import { YourCases } from './YourCases';

type Tab = 'design' | 'mine' | 'phone';
type Action = 'buy' | 'wear' | 'wearing';

const PANEL_W = 440;
const MARGIN = 24;
const PREVIEW_DELAY = 120;
const BOUGHT_MS = 8000;

const LEATHER_GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%25' height='100%25' filter='url(%23g)'/></svg>")`;

/** The panel is matte graphite; the shared option tiles and colour grids read these. */
const PANEL_VARS = {
    '--label':       '255 255 255',
    '--hairline':    '255 255 255',
    '--ios-gray':    '142 147 157',
    '--base':        '10 11 13',
    '--surface':     '27 29 33',
    '--elevated':    '38 41 46',
    '--control':     '48 52 58',
    '--well':        '92 97 108',
    '--safe-top':    '0px',
    '--safe-bottom': '0px',
} as CSSProperties;

const LEATHER: CSSProperties = {
    background: 'linear-gradient(180deg, #191b1f 0%, #131417 55%, #0f1012 100%)',
    boxShadow: '0 30px 80px rgba(0,0,0,0.65), 0 8px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 0 0 1px rgba(255,255,255,0.06)',
};

const PANEL_IN = 'casestore-panel-in 0.42s cubic-bezier(0.22,0.9,0.3,1)';

/** Where a visit starts: the case being worn, else the newest design kept, else a plain shell. */
function startDesign(s: StoreState): Design {
    const styles = s.catalog.styles;
    const known = (d: Design | false | undefined): d is Design => !!d && styles.some(x => x.id === d.style);
    if (known(s.equipped)) return { ...s.equipped };
    const last = s.owned[s.owned.length - 1];
    if (known(last)) return { ...last };
    return { style: styles[0]?.id ?? 'slim', color: Math.min(22, Math.max(0, s.catalog.palette.length - 1)) };
}

function Keycap({ children }: { children: ReactNode }) {
    return (
        <span className="inline-flex h-[22px] min-w-[30px] items-center justify-center rounded-[6px] px-1.5 text-[11.5px] font-semibold text-white/85" style={{ background: '#2a2d33', boxShadow: '0 1px 0 #000, inset 0 0 0 1px rgba(255,255,255,0.10)' }}>
            {children}
        </span>
    );
}

const STRIP_SHADOW = '0 10px 30px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 0 0 1px rgba(255,255,255,0.06)';

/** Turns the screen of the phone on show on or off (it starts off). It sits on the stage, so it
 *  keeps its pointer to itself rather than starting a turn of the phone. */
function ScreenToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onPointerDown={e => e.stopPropagation()}
            onClick={() => onChange(!on)}
            className={`pointer-events-auto flex h-[41px] items-center gap-2 rounded-[12px] px-3.5 text-[13px] font-semibold transition-[color,transform] duration-150 active:scale-95 ${on ? 'text-[#F5A524]' : 'text-white/80 hover:text-white'}`}
            style={{ ...LEATHER, boxShadow: on ? `${STRIP_SHADOW}, inset 0 0 0 1.5px rgba(245,165,36,0.55)` : STRIP_SHADOW }}
        >
            <Smartphone className={`h-[16px] w-[16px] ${on ? '' : 'text-white/55'}`} strokeWidth={2.2} fill={on ? 'rgba(245,165,36,0.25)' : 'none'} />
            {on ? t('cases.screenOn', 'Screen on') : t('cases.screenOff', 'Screen off')}
        </button>
    );
}

function HintStrip() {
    return (
        <div
            className="flex items-center gap-4 rounded-[12px] px-4 py-2.5 text-[13px] font-medium text-white/80"
            style={{ ...LEATHER, boxShadow: STRIP_SHADOW }}
        >
            <span className="flex items-center gap-2"><Rotate3d className="h-[16px] w-[16px] text-white/55" strokeWidth={2.2} />{t('cases.hintRotate', 'Drag to turn the phone')}</span>
            <span aria-hidden className="h-[16px] w-px bg-white/15" />
            <span className="flex items-center gap-2"><Mouse className="h-[16px] w-[16px] text-white/55" strokeWidth={2.2} />{t('cases.hintZoom', 'Scroll to zoom')}</span>
            <span aria-hidden className="h-[16px] w-px bg-white/15" />
            <span className="flex items-center gap-2"><Keycap>Esc</Keycap>{t('cases.hintLeave', 'to leave')}</span>
        </div>
    );
}

/** A case store counter: the game shows the player's own phone in 3D on the left, and this draws
 *  the designer beside it. Everything left of the panel is the stage, so dragging there turns the
 *  phone and the wheel zooms. */
export function CaseStoreUI() {
    const [state, setState] = useState<StoreState | null>(null);
    const [draft, setDraft] = useState<Design>({ style: 'slim', color: 0 });
    const [step, setStep] = useState<Step>('style');
    const [tab, setTab] = useState<Tab>('design');
    const [trim, setTrim] = useState<TrimKind | null>(null);
    const [selected, setSelected] = useState<number | null>(null);
    const [wear, setWear] = useState(true);
    const [picking, setPicking] = useState(false);
    const [adjusting, setAdjusting] = useState(false);
    const [screen, setScreen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [bought, setBought] = useState<{ key: string; worn: boolean; item: boolean; price: number; swapped: boolean } | null>(null);
    const [collecting, setCollecting] = useState(false);
    const [collectNote, setCollectNote] = useState<{ text: string; bad: boolean } | null>(null);
    const [dragging, setDragging] = useState(false);
    const [devTurn, setDevTurn] = useState<DevTurn>({ yaw: -18, pitch: 4, zoom: 1 });
    const [layer, setLayer] = useState<HTMLDivElement | null>(null);
    const scale = useViewportScale();
    const hideBalance = useStreamerHidden('balance');

    const sentPreview = useRef('');
    const sentView = useRef<CaseView | null>(null);
    const drag = useRef<{ id: number; x: number; y: number } | null>(null);
    const pending = useRef({ dx: 0, dy: 0 });
    const frame = useRef(0);

    const open = useCallback((raw: Partial<StoreState> | undefined) => {
        const s = readStore(raw);
        const start = startDesign(s);
        setState(s);
        setDraft(start);
        setStep('style');
        setTab('design');
        setTrim(null);
        setSelected(null);
        setWear(true);
        setPicking(false);
        setAdjusting(false);
        setScreen(false);
        setBusy(false);
        setError(null);
        setBought(null);
        setCollectNote(null);
        preloadLayers();
        const first = s.catalog.styles.length ? cleanDesign(s.catalog, start) : false;
        sentPreview.current = JSON.stringify(first);
        sentView.current = null;
        previewDesign(first);
    }, []);

    const hide = useCallback(() => {
        setState(null);
        setPicking(false);
        setDragging(false);
        drag.current = null;
        sentPreview.current = '';
        sentView.current = null;
    }, []);

    useNuiEvent('sd-phone:casestore:open', open);
    useNuiEvent('sd-phone:casestore:close', hide);

    useEffect(() => {
        if (isFiveM) return;
        if (new URLSearchParams(window.location.search).get('casestore')) open(devStore());
    }, [open]);

    const visible = state !== null;
    const leave = useCallback(() => {
        leaveStore();
        hide();
    }, [hide]);

    useEffect(() => {
        if (!visible) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopImmediatePropagation();
            e.preventDefault();
            if (picking) setPicking(false);
            else if (adjusting) setAdjusting(false);
            else leave();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [visible, picking, adjusting, leave]);

    const catalog = state?.catalog;
    const design = catalog && catalog.styles.length ? cleanDesign(catalog, draft) : null;
    const key = designKey(design);
    const shown: Design | false = !state ? false
        : tab === 'mine' ? (selected !== null && state.owned[selected]) || state.equipped
        : design ?? false;
    const shownKey = state ? JSON.stringify(shown) : '';

    useEffect(() => {
        if (!shownKey || shownKey === sentPreview.current) return;
        const id = window.setTimeout(() => {
            sentPreview.current = shownKey;
            previewDesign(JSON.parse(shownKey) as Design | false);
        }, PREVIEW_DELAY);
        return () => window.clearTimeout(id);
    }, [shownKey]);

    const view: CaseView | null = !state || !catalog ? null
        : tab === 'phone' ? (trim ? 'trim' : 'body')
        : tab === 'mine' || !design ? 'body' : stepView(catalog, draft, step);
    useEffect(() => {
        if (!view || view === sentView.current) return;
        sentView.current = view;
        frameView(view);
    }, [view]);

    useEffect(() => { setError(null); }, [key]);

    useEffect(() => {
        if (!bought) return;
        const id = window.setTimeout(() => setBought(null), BOUGHT_MS);
        return () => window.clearTimeout(id);
    }, [bought]);

    useEffect(() => {
        if (!collectNote) return;
        const id = window.setTimeout(() => setCollectNote(null), 6000);
        return () => window.clearTimeout(id);
    }, [collectNote]);

    useEffect(() => () => cancelAnimationFrame(frame.current), []);

    const flush = useCallback(() => {
        frame.current = 0;
        const { dx, dy } = pending.current;
        pending.current = { dx: 0, dy: 0 };
        if (!dx && !dy) return;
        rotateView(dx, dy);
        if (!isFiveM) setDevTurn(v => ({ ...v, yaw: v.yaw + dx * 0.4, pitch: Math.max(-35, Math.min(35, v.pitch - dy * 0.25)) }));
    }, []);

    if (!state || !catalog) return null;

    const patch = (p: Partial<StoreState>) => setState(s => (s ? { ...s, ...p } : s));
    const hex = frameColour(state.frame);
    const look = state.look;
    const onShow = state.phones.find(p => p.color === state.frame && p.fold === (state.body === 'shut') && p.look === look);
    const balanceText = hideBalance ? HIDDEN_TEXT : money(state.balance);
    const price = design ? designPrice(catalog, design) : 0;
    const ownedIndex = state.items ? -1 : state.owned.findIndex(d => designKey(d) === key);
    const action: Action = !state.items && key && designKey(state.equipped) === key ? 'wearing' : ownedIndex >= 0 ? 'wear' : 'buy';
    const wearNow = wear && !state.blocked;

    let blocker: string | null = null;
    if (action === 'wear' && state.blocked) blocker = t('cases.buyBlocked', 'This phone cannot wear a case');
    else if (action === 'buy' && !state.items && state.owned.length >= state.maxOwned) blocker = t('cases.buyFullShort', 'Your collection is full');
    else if (action === 'buy' && state.balance < price) {
        blocker = hideBalance
            ? t('cases.buyShortHidden', 'Not enough money in the bank')
            : t('cases.buyShort', '{amount} more needed in the bank', { amount: money(price - state.balance) });
    }

    async function buy() {
        if (busy || !design || !state) return;
        setBusy(true);
        setError(null);
        const hadCase = !!state.equipped;
        const res = await buyCase(design, wearNow);
        setBusy(false);
        const data = res.data;
        if (!res.success || !data) {
            setError(failText(res, t('cases.buyFailed', 'This case could not be bought')));
            return;
        }
        patch({ balance: data.balance, equipped: data.equipped, owned: data.owned });
        setBought({ key, worn: wearNow, item: data.item, price, swapped: wearNow && hadCase });
    }

    async function wearOwned() {
        if (busy || ownedIndex < 0) return;
        setBusy(true);
        setError(null);
        const res = await equipCase(ownedIndex + 1);
        setBusy(false);
        if (!res.success || !res.data) {
            setError(failText(res, t('cases.wearFailed', 'That did not work. Try again.')));
            return;
        }
        patch({ equipped: res.data.equipped });
    }

    async function collect() {
        if (collecting) return;
        setCollecting(true);
        const res = await collectCases();
        setCollecting(false);
        if (!res.success || !res.data) {
            setCollectNote({ text: failText(res, t('cases.collectFailed', 'Your cases could not be handed over')), bad: true });
            return;
        }
        patch({ owned: res.data.owned });
        setCollectNote({ text: t('cases.collected', '{n} cases are in your pockets now', { n: res.data.given }), bad: false });
    }

    function showTab(next: Tab) {
        setTab(next);
        setAdjusting(false);
        if (next === 'mine' && state) {
            const worn = designKey(state.equipped);
            const i = worn ? state.owned.findIndex(d => designKey(d) === worn) : -1;
            setSelected(i >= 0 ? i : null);
        }
    }

    function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        setDragging(true);
    }

    function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        pending.current.dx += e.clientX - d.x;
        pending.current.dy += e.clientY - d.y;
        d.x = e.clientX;
        d.y = e.clientY;
        if (!frame.current) frame.current = requestAnimationFrame(flush);
    }

    function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
        if (!drag.current || drag.current.id !== e.pointerId) return;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        drag.current = null;
        setDragging(false);
    }

    function onWheel(e: ReactWheelEvent<HTMLDivElement>) {
        const delta = Math.sign(e.deltaY);
        if (!delta) return;
        zoomView(delta);
        if (!isFiveM) setDevTurn(v => ({ ...v, zoom: Math.max(0.6, Math.min(1.6, v.zoom - delta * 0.08)) }));
    }

    const showMine = !state.items && tab === 'mine';
    const tabs: { value: Tab; label: string }[] = [{ value: 'design', label: t('cases.tabCase', 'Case') }];
    if (!state.items) tabs.push({ value: 'mine', label: t('cases.tabYourCases', 'Your Cases') });
    if (state.phone.enabled) tabs.push({ value: 'phone', label: t('cases.tabPhone', 'Phone') });

    const editing = adjusting && tab === 'design' && step === 'sticker' && stickersOf(design).length > 0;
    const aimSticker = () => {
        if (sentView.current === 'sticker') return;
        sentView.current = 'sticker';
        frameView('sticker');
    };

    let footer: ReactNode = null;
    if (design && tab === 'design' && !editing) {
        const boughtHere = bought && bought.key === key ? bought : null;
        let line: string;
        let lineRed = false;
        if (error) { line = error; lineRed = true; }
        else if (blocker) { line = blocker; lineRed = true; }
        else if (action === 'wear') line = t('cases.ownedNote', 'Already yours, no charge');
        else if (action === 'wearing') line = t('cases.wearingNote', 'On your phone now');
        else if (hideBalance) line = t('cases.paidFromBankShort', 'Paid from your bank account');
        else line = t('cases.leavesInBank', 'Leaves {amount} in the bank', { amount: money(state.balance - price) });

        let wearNote: string;
        if (state.blocked) wearNote = t('cases.wearBlockedNote', 'This phone comes in its own case, so it cannot wear this one');
        else if (wearNow) wearNote = t('cases.wearNowNote', 'It goes straight on your phone');
        else if (state.items) wearNote = t('cases.wearLaterItemNote', 'It goes in your pockets to put on later');
        else wearNote = t('cases.wearLaterListNote', 'It waits under Your Cases');

        let boughtTitle = '';
        let boughtBody = '';
        if (boughtHere) {
            const paid = t('cases.paidAmount', 'Paid {amount}.', { amount: money(boughtHere.price) });
            if (boughtHere.worn) {
                boughtTitle = t('cases.boughtWorn', 'On your phone');
                boughtBody = boughtHere.swapped
                    ? `${paid} ${state.items ? t('cases.swappedItem', 'The case you had on is back in your pockets.') : t('cases.swappedList', 'The case you had on waits under Your Cases.')}`
                    : paid;
            } else if (boughtHere.item) {
                boughtTitle = t('cases.boughtItem', 'In your pockets: use it to put it on');
                boughtBody = paid;
            } else {
                boughtTitle = t('cases.boughtKept', 'Kept in your cases');
                boughtBody = `${paid} ${t('cases.boughtKeptHint', 'Put it on under Your Cases.')}`;
            }
        }

        footer = (
            <div className="shrink-0 pt-3">
                <PriceTag catalog={catalog} design={design} struck={action !== 'buy'} />

                {boughtHere ? (
                    <div className="mt-3 rounded-[12px] bg-surface p-3.5 shadow-[inset_0_0_0_1px_rgba(245,165,36,0.45)]" style={{ animation: 'casestore-pop 0.32s cubic-bezier(0.22,0.9,0.3,1)' }}>
                        <div className="flex items-start gap-3">
                            <span className="mt-[1px] flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[#2b1703]" style={{ background: BUY_BG }}>
                                <Check className="h-[17px] w-[17px]" strokeWidth={3.2} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="text-[15.5px] font-semibold leading-snug">{boughtTitle}</div>
                                <div className="mt-0.5 text-[13.5px] leading-snug text-ios-gray">{boughtBody}</div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setBought(null)}
                            className="mt-3 h-[38px] w-full rounded-[11px] bg-white/[0.08] text-[14.5px] font-semibold transition-transform duration-150 hover:bg-white/[0.12] active:scale-[0.98]"
                        >
                            {t('cases.keepDesigning', 'Keep Designing')}
                        </button>
                    </div>
                ) : (
                    <>
                        {action === 'buy' && (
                            <div className="mt-3 flex items-center gap-3 px-1">
                                <div className="min-w-0 flex-1">
                                    <div className="text-[14.5px] font-medium leading-tight">{t('cases.putOnNow', 'Put it on now')}</div>
                                    <div className={`mt-0.5 text-[12.5px] leading-snug ${state.blocked ? 'text-[#F5A524]' : 'text-ios-gray'}`}>{wearNote}</div>
                                </div>
                                <Toggle on={wearNow} disabled={state.blocked} activeColor={ACCENT} onChange={setWear} ariaLabel={t('cases.putOnNow', 'Put it on now')} />
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => void (action === 'buy' ? buy() : action === 'wear' ? wearOwned() : undefined)}
                            disabled={busy || action === 'wearing' || !!blocker}
                            className={`mt-3 flex h-[50px] w-full items-center justify-center gap-2 rounded-[12px] text-[16.5px] font-semibold tracking-[-0.01em] transition-[opacity,transform,filter] duration-150 hover:brightness-105 active:scale-[0.98] disabled:active:scale-100 ${
                                action === 'wearing'
                                    ? 'bg-surface text-ios-gray'
                                    : 'text-[#1a1206] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] disabled:opacity-40 disabled:shadow-none'
                            }`}
                            style={action === 'wearing' ? undefined : { background: BUY_BG }}
                        >
                            {busy ? (
                                <Spinner size={22} className="!border-[#2b1703]/25 !border-t-[#2b1703]" />
                            ) : action === 'buy' ? (
                                t('cases.buyFor', 'Buy · {amount}', { amount: money(price) })
                            ) : action === 'wear' ? (
                                t('cases.putOn', 'Put On')
                            ) : (
                                <><Check className="h-[19px] w-[19px]" strokeWidth={3} />{t('cases.wearingNow', 'Wearing')}</>
                            )}
                        </button>
                        <p className={`mt-2 truncate px-1 text-center text-[13px] leading-[18px] ${lineRed ? 'font-medium text-ios-red' : 'text-ios-gray'}`}>{line}</p>
                    </>
                )}
            </div>
        );
    }

    let body: ReactNode;
    if (tab === 'phone') {
        body = (
            <PhonePanel
                phone={state.phone}
                palette={catalog.palette}
                look={look}
                name={onShow?.label ?? ''}
                trim={trim}
                onTrim={setTrim}
                onPhone={phone => patch({ phone })}
            />
        );
    } else if (!design) {
        body = (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <CircleAlert className="h-[34px] w-[34px] text-ios-gray" strokeWidth={2} />
                <div className="mt-3 text-[18px] font-semibold">{t('cases.nothingForSale', 'Nothing for Sale')}</div>
                <p className="mt-1 text-[14.5px] text-ios-gray">{t('cases.nothingForSaleBody', 'There are no cases to design right now.')}</p>
            </div>
        );
    } else if (showMine) {
        body = (
            <YourCases
                state={state}
                frameHex={hex}
                look={look}
                selected={selected}
                onSelect={setSelected}
                onPatch={p => { patch(p); if (p.owned) setSelected(null); }}
                onEdit={d => { setDraft({ ...d }); setStep('style'); setTab('design'); }}
            />
        );
    } else {
        body = (
            <Configurator
                catalog={catalog}
                draft={draft}
                frameHex={hex}
                body={state.body}
                look={look}
                step={step}
                picking={picking}
                adjusting={editing}
                onStep={s => { setStep(s); setAdjusting(false); }}
                onChange={d => { setDraft(d); setBought(null); }}
                onPicking={setPicking}
                onAdjusting={setAdjusting}
                onAim={aimSticker}
            />
        );
    }

    const rail = PANEL_W + MARGIN * 2;

    return (
        <div
            className={`fixed inset-0 z-[400] select-none font-sf ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
        >
            {!isFiveM && <DevStage hex={catalog.palette[(shown || draft).color] ?? hex} turn={devTurn} right={rail * scale} screen={screen} />}

            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(130% 120% at 38% 50%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.32) 100%)' }} />

            <div className="pointer-events-none absolute bottom-0 left-0" style={{ zoom: scale }}>
                <div className="m-6 flex items-center gap-3" style={{ animation: 'casestore-hint-in 0.5s 0.15s cubic-bezier(0.22,0.9,0.3,1) both' }}>
                    <HintStrip />
                    <ScreenToggle on={screen} onChange={on => { setScreen(on); showScreen(on); }} />
                </div>
            </div>

            <div className="absolute right-0 top-0" style={{ zoom: scale, width: rail, height: REF_VIEWPORT_H }}>
                <div
                    data-ui-zoom
                    className="dark absolute isolate flex cursor-auto flex-col overflow-hidden rounded-[18px] text-[#f2f3f5]"
                    style={{ ...PANEL_VARS, ...LEATHER, inset: MARGIN, animation: PANEL_IN }}
                    onPointerDown={e => e.stopPropagation()}
                    onWheel={e => e.stopPropagation()}
                >
                    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 mix-blend-overlay" style={{ backgroundImage: LEATHER_GRAIN, opacity: 0.14 }} />

                    <ScreenRootContext.Provider value={layer}>
                        <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-[22px]">
                            <div className="flex shrink-0 items-start gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-ios-gray">{t('cases.storeEyebrow', 'Case Store')}</div>
                                    <h1 className="mt-1.5 truncate text-[23px] font-semibold leading-[28px] tracking-[-0.015em] text-white">
                                        {state.store || t('cases.storeFallback', 'Phone Cases')}
                                    </h1>
                                    <div className="mt-1.5 flex items-center gap-1.5 text-[13.5px] text-ios-gray">
                                        <Wallet className="h-[15px] w-[15px] shrink-0" strokeWidth={2.2} />
                                        <span className="truncate">{t('cases.bankLabel', 'Bank')}</span>
                                        <span className="font-semibold tabular-nums text-white">{balanceText}</span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={leave}
                                    aria-label={t('cases.leaveStore', 'Leave the store')}
                                    title={t('cases.leaveStore', 'Leave the store')}
                                    className="mt-0.5 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-surface text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_0_rgba(0,0,0,0.4)] transition-transform duration-150 hover:text-white active:scale-90"
                                >
                                    <X className="h-[19px] w-[19px]" strokeWidth={2.6} />
                                </button>
                            </div>

                            {state.phones.length > 1 && (
                                <PhonePicker
                                    phones={state.phones}
                                    frame={state.frame}
                                    body={state.body}
                                    look={look}
                                    onShown={p => patch({ frame: p.frame, blocked: p.blocked, body: p.body, look: p.look, phone: p.phone })}
                                />
                            )}

                            {state.items && state.owned.length > 0 && (
                                <div className="relative mt-4 flex shrink-0 items-center gap-3 overflow-hidden rounded-[12px] bg-surface py-3 pe-3 ps-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
                                    <span aria-hidden className="absolute inset-y-0 start-0 w-[3px] bg-[#F5A524]" />
                                    <PackageOpen className="h-[21px] w-[21px] shrink-0 text-[#F5A524]" strokeWidth={2.1} />
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[14px] font-semibold leading-tight">
                                            {t('cases.collectTitle', '{n} cases from before are waiting', { n: state.owned.length })}
                                        </div>
                                        <div className="mt-0.5 text-[12.5px] leading-snug text-ios-gray">
                                            {t('cases.collectBody', 'Cases are items now. Take the ones you bought earlier with you.')}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void collect()}
                                        disabled={collecting}
                                        className="flex h-[34px] min-w-[84px] shrink-0 items-center justify-center rounded-[9px] bg-white/[0.09] px-3.5 text-[13.5px] font-semibold text-white transition-transform hover:bg-white/[0.14] duration-150 active:scale-95 disabled:opacity-60"
                                    >
                                        {collecting ? <Spinner size={16} /> : t('cases.collect', 'Collect')}
                                    </button>
                                </div>
                            )}
                            {collectNote && (
                                <p className={`mt-2 shrink-0 px-1 text-[13.5px] font-medium ${collectNote.bad ? 'text-ios-red' : 'text-[#F5A524]'}`}>{collectNote.text}</p>
                            )}

                            {tabs.length > 1 && (
                                <div className="mt-3 shrink-0">
                                    <SegmentedControl value={tab} onChange={showTab} options={tabs} slide />
                                </div>
                            )}

                            <div className="mt-4 flex min-h-0 flex-1 flex-col">{body}</div>
                            {footer}
                        </div>
                    </ScreenRootContext.Provider>

                    <div ref={setLayer} style={{ display: 'contents' }} />
                </div>
            </div>
        </div>
    );
}
