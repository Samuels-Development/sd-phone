import { memo, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

import { getAppEntry, isPreviewApp, type AppId } from './appRegistry';
import { getCardStage, getFullscreenStage, getSplitStage, registerFullscreenStage, registerSplitStage, subscribeCardStages } from './appDeckBridge';
import { DeckActiveProvider } from './deckActive';
import { CustomAppFrame } from './CustomAppFrame';
import { getCustomApp } from '@/stores/customAppsStore';
import { useFoldOpen } from '@/stores/foldStore';
import { useLocaleStore } from '@/stores/localeStore';
import { QuietEntryContext } from '@/hooks/useIosPush';
import { SPLIT_EXIT_MS, useSplitClosing, useSplitId, useSplitSide, useSplitStore } from '@/stores/splitStore';
import type { AppDef } from '@/core/types';
import { ArrowLeftRight } from 'lucide-react';
import { t } from '@/i18n';


export interface DeckAppCtx {
    onClose:           () => void;
    allApps:           AppDef[];
    installedApps:     Set<string>;
    onInstall:         (id: string) => void;
    onOpenApp:         (id: string) => void;
    onLandscapeChange: (v: boolean) => void;
}

interface AppDeckProps {
    deckIds:        AppId[];
    activeId:       AppId | null;
    splitId:        AppId | null;
    switcherOpen:   boolean;
    switcherReady:  boolean;
    closing:        boolean;
    foregroundKeys: Record<string, number>;
    launchOrigin:   { x: number; y: number } | null;
    launchExpand:   boolean;
    ctx:            DeckAppCtx;
    onCloseDone:    () => void;
}

function buildAppNode(id: AppId, ctx: DeckAppCtx): ReactNode {
    if (getCustomApp(id)) return <CustomAppFrame appId={id} onClose={ctx.onClose} />;
    const entry = getAppEntry(id);
    if (entry?.render) {
        return entry.render({
            onClose:           ctx.onClose,
            allApps:           ctx.allApps,
            installedApps:     ctx.installedApps,
            onInstall:         ctx.onInstall,
            onOpenApp:         ctx.onOpenApp,
            onLandscapeChange: ctx.onLandscapeChange,
        });
    }
    if (entry) return <AppMount id={id} onClose={ctx.onClose} />;
    return null;
}

function AppMount({ id, onClose }: { id: AppId; onClose: () => void }) {
    const [Comp] = useState(() => {
        const e = getAppEntry(id);
        return e.Resolved ?? e.Component ?? null;
    });
    if (!Comp) return null;
    return <Comp onClose={onClose} />;
}

interface AppHostProps {
    id:          AppId;
    ctx:         DeckAppCtx;
    active:      boolean;
    openKey:     number;
    origin:      { x: number; y: number } | null;
    expandOpen:  boolean;
    closing:     boolean;
    onCloseDone: () => void;
}

const AppHost = memo(function AppHost({ id, ctx, active, openKey, origin, expandOpen, closing, onCloseDone }: AppHostProps) {
    const node = useMemo(() => buildAppNode(id, ctx), [id, ctx]);
    const locale    = useLocaleStore(s => s.locale);
    const changedAt = useLocaleStore(s => s.changedAt);
    const [phase, setPhase] = useState<'open' | 'close' | 'rest'>('open');
    const firstRef = useRef(true);

    useLayoutEffect(() => {
        if (firstRef.current) { firstRef.current = false; return; }
        setPhase('open');
    }, [openKey]);

    useLayoutEffect(() => { if (closing) setPhase('close'); }, [closing]);


    const ox = origin ? `${(origin.x * 100).toFixed(1)}%` : '50%';
    const oy = origin ? `${(origin.y * 100).toFixed(1)}%` : '80%';

    const animation = phase === 'open'
        ? (expandOpen
            ? 'ios-app-expand 0.32s cubic-bezier(0.22,1,0.36,1) forwards'
            : 'ios-app-open 0.38s cubic-bezier(0.22,1,0.36,1) forwards')
        : phase === 'close'
            ? 'ios-app-close 0.28s cubic-bezier(0.25,0.46,0.45,0.94) forwards'
            : undefined;

    return (
        <div
            data-app-screen="1"
            className={phase === 'rest' ? 'absolute inset-0' : 'absolute inset-0 app-anim-flatten'}
            style={{ transformOrigin: `${ox} ${oy}`, animation, willChange: 'transform' }}
            onAnimationEnd={e => {
                if (e.target !== e.currentTarget) return;
                if (phase === 'close') onCloseDone();
                setPhase('rest');
            }}
        >
            <DeckActiveProvider value={active}>
                <QuietEntryContext.Provider value={changedAt}>
                    <Suspense key={locale} fallback={<div className="absolute inset-0 bg-base" />}>{node}</Suspense>
                </QuietEntryContext.Provider>
            </DeckActiveProvider>
        </div>
    );
});

export function AppDeck({
    deckIds, activeId, splitId, switcherOpen, switcherReady, closing, foregroundKeys, launchOrigin, launchExpand, ctx, onCloseDone,
}: AppDeckProps) {
    const hostsRef = useRef<Map<AppId, HTMLDivElement>>(new Map());
    const poolRef  = useRef<HTMLDivElement>(null);

    const [stageVersion, setStageVersion] = useState(0);
    useEffect(() => subscribeCardStages(() => setStageVersion(v => v + 1)), []);

    function ensureHost(id: AppId): HTMLDivElement {
        let el = hostsRef.current.get(id);
        if (!el) {
            el = document.createElement('div');
            el.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;';
            el.setAttribute('data-deck-host', id);
            hostsRef.current.set(id, el);
        }
        return el;
    }

    useEffect(() => {
        for (const [id, host] of hostsRef.current) {
            if (!deckIds.includes(id)) {
                host.remove();
                hostsRef.current.delete(id);
            }
        }
    }, [deckIds]);

    useLayoutEffect(() => {
        for (const id of deckIds) {
            const host = hostsRef.current.get(id);
            if (!host) continue;
            const previewable = isPreviewApp(id);

            const fullscreen = getFullscreenStage();

            let slot: HTMLElement | null;
            let interactive = false;
            if (switcherOpen) {
                if (previewable) {
                    slot = getCardStage(id) ?? poolRef.current;
                } else if (id === activeId && !previewable) {
                    slot = fullscreen ?? poolRef.current;
                } else {
                    slot = poolRef.current;
                }
            } else if (id === activeId && fullscreen) {
                slot = fullscreen;
                interactive = true;
            } else if (splitId && id === splitId && getSplitStage()) {
                slot = getSplitStage();
                interactive = true;
            } else {
                slot = poolRef.current;
            }

            if (slot && host.parentElement !== slot) slot.appendChild(host);
            host.style.pointerEvents = interactive ? 'auto' : 'none';
            if (interactive) host.removeAttribute('inert');
            else host.setAttribute('inert', '');
        }
    }, [deckIds, activeId, splitId, switcherOpen, switcherReady, stageVersion]);

    return (
        <>
            <div
                ref={poolRef}
                aria-hidden
                style={{ position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none', overflow: 'hidden' }}
            />
            {deckIds.map(id => createPortal(
                <AppHost
                    id={id}
                    ctx={ctx}
                    active={!switcherOpen && (id === activeId || id === splitId)}
                    openKey={foregroundKeys[id] ?? 0}
                    origin={id === activeId ? launchOrigin : null}
                    expandOpen={id === activeId && launchExpand}
                    closing={id === activeId && closing}
                    onCloseDone={onCloseDone}
                />,
                ensureHost(id),
                id,
            ))}
        </>
    );
}

export function FullscreenStage({ mainAnim }: {
    mainAnim?:   string;
}) {
    const ref      = useRef<HTMLDivElement>(null);
    const splitRef = useRef<HTMLDivElement>(null);
    const unfolded = useFoldOpen();
    const splitApp = useSplitId();
    const side     = useSplitSide();
    const closing  = useSplitClosing();
    const split    = unfolded ? splitApp : null;

    const splitLeft = side === 'left';
    const mainBox  = splitLeft ? { left: '50%', right: 0 } : { left: 0, right: '50%' };
    const paneBox  = splitLeft ? { left: 0, right: '50%' } : { left: '50%', right: 0 };

    useLayoutEffect(() => {
        registerFullscreenStage(ref.current);
        return () => registerFullscreenStage(null);
    }, []);

    useLayoutEffect(() => {
        registerSplitStage(split ? splitRef.current : null);
        return () => registerSplitStage(null);
    }, [split]);

    const SEAM = `left ${SPLIT_EXIT_MS}ms cubic-bezier(0.32,0.72,0,1), right ${SPLIT_EXIT_MS}ms cubic-bezier(0.32,0.72,0,1)`;
    const held = split && !closing;

    return (
        <>
            <div
                ref={ref}
                className="absolute inset-y-0 z-10 overflow-hidden"
                style={{
                    left:  held ? mainBox.left  : 0,
                    right: held ? mainBox.right : 0,
                    transition: SEAM,
                    animation: mainAnim,
                    pointerEvents: 'none',
                }}
            />
            {split && (
                <>
                    <div
                        ref={splitRef}
                        className="absolute inset-y-0 z-10 overflow-hidden"
                        style={{
                            ...paneBox,
                            pointerEvents: 'none',
                            opacity: closing ? 0 : 1,
                            transform: closing ? `translateX(${splitLeft ? -14 : 14}px) scale(0.97)` : 'none',
                            transformOrigin: splitLeft ? 'right center' : 'left center',
                            transition: `${SEAM}, opacity ${SPLIT_EXIT_MS}ms ease, transform ${SPLIT_EXIT_MS}ms cubic-bezier(0.32,0.72,0,1)`,
                        }}
                    />
                    <div
                        className="absolute inset-y-0 z-20"
                        style={{
                            left: '50%', width: 1, marginLeft: -0.5,
                            background: 'rgba(0,0,0,0.35)',
                            opacity: closing ? 0 : 1,
                            transition: `opacity ${SPLIT_EXIT_MS}ms ease`,
                            pointerEvents: 'none',
                        }}
                    />

                    <button
                        type="button"
                        aria-label={t('shell.splitSwap', 'Swap the two sides')}
                        onClick={() => useSplitStore.getState().swap()}
                        className="absolute z-30 flex items-center justify-center rounded-full bg-[rgba(28,28,30,0.78)] text-white/80 transition-colors duration-200 hover:text-white active:bg-[rgba(28,28,30,0.96)] active:text-white/60"
                        style={{
                            left: '50%', top: '50%',
                            width: 30, height: 62, marginLeft: -15, marginTop: -31,
                            boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.16), 0 1px 6px rgba(0,0,0,0.45)',
                            opacity: closing ? 0 : 1,
                            transition: `opacity ${SPLIT_EXIT_MS}ms ease, color 200ms ease, background-color 200ms ease`,
                            pointerEvents: closing ? 'none' : 'auto',
                        }}
                    >
                        <span
                            className="flex items-center justify-center"
                            style={{
                                transform: `rotate(${splitLeft ? 180 : 0}deg)`,
                                transition: `transform ${SPLIT_EXIT_MS}ms cubic-bezier(0.32,0.72,0,1)`,
                            }}
                        >
                            <ArrowLeftRight className="h-[14px] w-[14px]" strokeWidth={2.4} />
                        </span>
                    </button>
                </>
            )}
        </>
    );
}
