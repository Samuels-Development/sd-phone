import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { device } from '@device';
import { fetchNui, hostResource } from '@/core/nui';
import { apiData } from '@/core/api';
import { apiSavePhotoFromUrl } from '@/core/photosApi';
import { t, getLocale, getLocaleTag } from '@/i18n';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useTheme, useThemeStore } from '@/stores/themeStore';
import { useCustomAppsStore } from '@/stores/customAppsStore';
import { getGameRender } from '@/render';
import { portalToPhoneScreen } from '@/ui/portal';
import { Sheet } from '@/ui/Sheet';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { EmojiPanel } from '@/shared/chat/EmojiPanel';
import { GifPickerSheet } from '@/shared/chat/GifPickerSheet';
import { ContactPickerSheet } from '@/shared/ContactPickerSheet';
import { formatPhone } from '@/apps/phone/data';
import { AppIconSVG } from './AppIconSVG';
import { useDeckActive } from './deckActive';
import { resolveCustomUi } from './widgets/customUrl';
import type { Contact } from '@/apps/phone/data';

// The SDK ships with whichever resource serves this page - a companion device may not reach
// sd-phone's own files.
const COMPONENTS_URL = `https://cfx-nui-${hostResource}/web/build/components.js`;

const warned = new Set<string>();
function warnOnce(name: string): void {
    if (warned.has(name)) return;
    warned.add(name);
    console.warn(`[sd-phone] custom-app bridge: "${name}" is not implemented; resolving null`);
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

function buildSettings(): Record<string, unknown> {
    const s = useThemeStore.getState();
    return {
        display:      { theme: s.theme, brightness: s.brightness },
        theme:        s.theme,
        locale:       getLocale(),
        language:     getLocale(),
        localeTag:    getLocaleTag(),
        airplaneMode: s.airplaneMode,
        streamerMode: false,
        doNotDisturb: false,
        time:         { hour24: s.hour24 },
        volume:       { ringtone: s.ringtoneVol, call: s.callVol },
    };
}

interface PopupBtn { title?: string; text?: string; label?: string; color?: string; callbackId?: number }
interface PopupInput { type?: string; placeholder?: string; value?: string }
interface PopupData {
    title?:       string;
    description?: string;
    message?:     string;
    input?:       PopupInput;
    inputs?:      PopupInput[];
    buttons?:     PopupBtn[];
}
interface CtxMenuData {
    title?:       string;
    description?: string;
    buttons?:     PopupBtn[];
}
interface GalleryReq { multiple?: boolean; type?: string; max?: number }
interface ColorReq { value?: string }

const SWATCHES = [
    '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#30B0C7', '#007AFF',
    '#5856D6', '#AF52DE', '#FF2D55', '#A2845E', '#8E8E93', '#1C1C1E', '#FFFFFF',
];

export function CustomAppFrame({ appId }: { appId: string; onClose: () => void }) {
    const def = useCustomAppsStore(s => s.apps.find(a => a.id === appId));
    const { theme, airplaneMode, hour24, brightness } = useTheme('theme', 'airplaneMode', 'hour24', 'brightness');
    const active = useDeckActive();

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const loadedRef = useRef(false);
    const [ready, setReady] = useState(false);
    const defRef = useRef(def);
    defRef.current = def;

    const [popup, setPopup]         = useState<PopupData | null>(null);
    const [ctxMenu, setCtxMenu]     = useState<CtxMenuData | null>(null);
    const [gallery, setGallery]     = useState<GalleryReq | null>(null);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [gifOpen, setGifOpen]     = useState(false);
    const [contactOpen, setContact] = useState(false);
    const [colorReq, setColorReq]   = useState<ColorReq | null>(null);
    const [fullImage, setFullImage] = useState<string | null>(null);

    const popupResolve   = useRef<((v: number | undefined) => void) | null>(null);
    const ctxResolve     = useRef<((v: number | undefined) => void) | null>(null);
    const galleryResolve = useRef<((v: unknown) => void) | null>(null);
    const emojiResolve   = useRef<((v: string | null) => void) | null>(null);
    const gifResolve     = useRef<((v: string | null) => void) | null>(null);
    const contactResolve = useRef<((v: unknown) => void) | null>(null);
    const colorResolve   = useRef<((v: string | null) => void) | null>(null);

    const settleEmoji = useCallback((value: string | null) => {
        const r = emojiResolve.current; emojiResolve.current = null;
        setEmojiOpen(false);
        if (r) r(value);
    }, []);
    const settleGif = useCallback((value: string | null) => {
        const r = gifResolve.current; gifResolve.current = null;
        setGifOpen(false);
        if (r) r(value);
    }, []);
    const settlePopup = useCallback((id: number | undefined) => {
        const r = popupResolve.current; popupResolve.current = null;
        setPopup(null);
        if (r) r(id);
    }, []);
    const settleCtx = useCallback((id: number | undefined) => {
        const r = ctxResolve.current; ctxResolve.current = null;
        setCtxMenu(null);
        if (r) r(id);
    }, []);
    const settleGallery = useCallback((value: unknown) => {
        const r = galleryResolve.current; galleryResolve.current = null;
        setGallery(null);
        if (r) r(value);
    }, []);
    const settleContact = useCallback((value: unknown) => {
        const r = contactResolve.current; contactResolve.current = null;
        setContact(false);
        if (r) r(value);
    }, []);
    const settleColor = useCallback((value: string | null) => {
        const r = colorResolve.current; colorResolve.current = null;
        setColorReq(null);
        if (r) r(value);
    }, []);

    const streamPopupInput = useCallback((value: string) => {
        try { iframeRef.current?.contentWindow?.postMessage({ type: 'popUpInputChanged', value }, '*'); } catch { /* cross-origin */ }
    }, []);

    const notify = useCallback((data: Record<string, unknown>) => {
        const d = defRef.current;
        if (!d) return;
        const thumb = (data.thumbnail ?? data.avatar ?? data.image) as string | undefined;
        window.postMessage({
            action: 'sd-phone:notification',
            data: {
                app:   `custom:${d.id}`,
                appId: d.id,
                image: thumb,
                title: (data.title as string) ?? d.name,
                body:  (data.content ?? data.body ?? data.description) as string | undefined,
            },
        }, '*');
    }, []);

    const createCall = useCallback((data: Record<string, unknown>) => {
        if (!device.calls) { warnOnce('CreateCall'); return; }
        window.postMessage({ action: 'sd-phone:launchApp', data: { id: 'phone', link: data } }, '*');
        warnOnce('CreateCall(auto-dial)');
    }, []);

    const uploadMedia = useCallback(async (type: string, blob: Blob): Promise<string | null> => {
        try {
            const dataUrl = await blobToDataUrl(blob);
            if (type === 'audio' || type === 'voice') {
                return (await apiData<{ url: string }>('sd-phone:messages:uploadVoice', { audio: dataUrl }))?.url ?? null;
            }
            return (await apiData<{ url: string }>('sd-phone:media:upload', { type, data: dataUrl }))?.url ?? null;
        } catch {
            warnOnce('uploadMedia');
            return null;
        }
    }, []);

    const showComponent = useCallback((data: { component?: string } & Record<string, unknown>): Promise<unknown> => {
        switch (data?.component) {
            case 'gallery':
                return new Promise(res => { galleryResolve.current = res; setGallery({ multiple: !!data.multiple, type: data.type as string, max: data.max as number }); });
            case 'emoji':
                return new Promise(res => { emojiResolve.current = res; setEmojiOpen(true); });
            case 'gif':
                return new Promise(res => { gifResolve.current = res; setGifOpen(true); });
            case 'contactselector':
                return new Promise(res => { contactResolve.current = res; setContact(true); });
            case 'colorpicker':
                return new Promise(res => { colorResolve.current = res; setColorReq({ value: data.value as string }); });
            case 'camera':
                warnOnce('ShowComponent:camera');
                return Promise.resolve(null);
            default:
                warnOnce(`ShowComponent:${data?.component ?? 'unknown'}`);
                return Promise.resolve(null);
        }
    }, []);

    const fetchPhone = useCallback((event: string, data?: any): Promise<unknown> => {
        switch (event) {
            case 'SetPopUp':
                return new Promise(res => { popupResolve.current = res; setPopup(data ?? null); });
            case 'SetContextMenu':
                return new Promise(res => { ctxResolve.current = res; setCtxMenu(data ?? null); });
            case 'ShowComponent':
                return showComponent(data ?? {});
            case 'GetSettings':
                return Promise.resolve(buildSettings());
            case 'GetLocale':
                return Promise.resolve(t(data?.path ?? '', data?.path ?? '', data?.format));
            case 'SendNotification':
                notify(data ?? {});
                return Promise.resolve(null);
            case 'CreateCall':
                createCall(data ?? {});
                return Promise.resolve(null);
            case 'toggleInput':
                void fetchNui('sd-phone:typing', { typing: !!data });
                return Promise.resolve(null);
            case 'OpenMedia': {
                const src = typeof data === 'string' ? data : (data?.src ?? data?.url);
                if (src) setFullImage(String(src));
                return Promise.resolve(null);
            }
            case 'SetContactModal':
                warnOnce('SetContactModal');
                return Promise.resolve(null);
            default:
                warnOnce(event);
                return Promise.resolve(null);
        }
    }, [showComponent, notify, createCall]);

    const bridge = useMemo(() => {
        const withCallbackIds = (data: PopupData | undefined) => {
            if (data?.buttons) data.buttons.forEach((b, i) => { if ((b as { cb?: unknown }).cb) b.callbackId = i; });
            return data;
        };
        const runButtonCb = (data: PopupData | undefined, id: number | undefined) => {
            const b = id != null ? data?.buttons?.[id] as (PopupBtn & { cb?: () => void }) | undefined : undefined;
            if (b?.cb) b.cb();
        };
        return {
            fetchPhone,
            setPopUp:        (data: PopupData) => fetchPhone('SetPopUp', withCallbackIds(data)).then(id => runButtonCb(data, id as number)),
            setContextMenu:  (data: CtxMenuData) => fetchPhone('SetContextMenu', withCallbackIds(data)).then(id => runButtonCb(data, id as number)),
            setContactModal: (number: string) => fetchPhone('SetContactModal', number),
            setColorPicker:     (cb: (v: string | null) => void, data?: ColorReq) => showComponent({ component: 'colorpicker', ...data }).then(v => cb(v as string | null)),
            setGallery:         (data: GalleryReq & { cb?: (v: unknown) => void }) => showComponent({ component: 'gallery', ...data }).then(v => data?.cb?.(v)),
            setContactSelector: (cb: (v: unknown) => void, data?: Record<string, unknown>) => showComponent({ component: 'contactselector', ...data }).then(cb),
            setEmojiPickerVisible: (visible: boolean, cb?: (v: string | null) => void) => {
                if (visible) showComponent({ component: 'emoji' }).then(v => cb?.(v as string | null));
                else settleEmoji(null);
            },
            setGifPickerVisible: (visible: boolean, cb?: (v: string | null) => void) => {
                if (visible) showComponent({ component: 'gif' }).then(v => cb?.(v as string | null));
                else settleGif(null);
            },
            setMusicSelector:     () => { warnOnce('setMusicSelector'); return Promise.resolve(null); },
            setShareComponent:    () => { warnOnce('setShareComponent'); return Promise.resolve(null); },
            setFullscreenImage:   (data: unknown) => {
                const src = typeof data === 'string' ? data : (data as { src?: string; url?: string } | null)?.src ?? (data as { url?: string } | null)?.url;
                setFullImage(src ? String(src) : null);
            },
            GameMap: function GameMap() {
                warnOnce('GameMap');
                return { ready: Promise.resolve(false), map: null, L: null, setMap: () => undefined, setStyle: () => undefined, getZoom: () => 0 };
            },
            setHomeIndicatorVisible: (visible: boolean) => useThemeStore.getState().setHideHomeIndicator(!visible),
            createGameRender: async (canvas: HTMLCanvasElement) => {
                const render = await getGameRender();
                if (!render || !canvas) return null;
                render.renderToTarget(canvas);
                return {
                    takePhoto:      () => { try { return canvas.toDataURL('image/jpeg', 0.92); } catch { return null; } },
                    startRecording: () => { warnOnce('gameRender.startRecording'); },
                    pause:          () => render.stop(),
                    resize:         () => undefined,
                    setQuality:     () => undefined,
                    setZoom:        (z: number) => render.setZoom(z),
                    setOrientation: (o: 'portrait' | 'landscape') => render.setOrientation(o),
                    setSelfie:      (on: boolean) => render.setSelfie(on),
                    destroy:        () => render.stop(),
                };
            },
            uploadMedia,
            saveToGallery: async (url: string) => { try { return await apiSavePhotoFromUrl(url); } catch { return false; } },
            getMicrophoneStream:        () => { warnOnce('getMicrophoneStream'); return Promise.resolve(null); },
            releaseMicrophoneStream:    () => { warnOnce('releaseMicrophoneStream'); },
            listenToNearbyVoices:       () => { warnOnce('listenToNearbyVoices'); },
            stopListeningToNearbyVoices: () => { warnOnce('stopListeningToNearbyVoices'); },
        };
    }, [fetchPhone, showComponent, uploadMedia, settleEmoji, settleGif]);

    const setApp = useCallback((target: string | { name?: string; data?: unknown }) => {
        const name = typeof target === 'string' ? target : target?.name;
        if (!name) return;
        window.postMessage({ action: 'sd-phone:launchApp', data: { id: name } }, '*');
    }, []);

    const onLoad = useCallback(() => {
        const iframe = iframeRef.current;
        const d = defRef.current;
        if (!iframe || !d) return;
        loadedRef.current = true;
        try {
            const win = iframe.contentWindow as (Window & Record<string, unknown>) | null;
            const doc = iframe.contentDocument;
            if (!win || !doc) return;
            if (doc.documentElement) {
                doc.documentElement.style.width = '100%';
                doc.documentElement.style.height = '100%';
                doc.documentElement.style.margin = '0';
                doc.documentElement.style.padding = '0';
                if (d.fixBlur) doc.documentElement.style.fontSize = 'calc((1vh + 1vw) * 1.214)';
            }
            if (doc.body) {
                doc.body.style.visibility = 'visible';
                doc.body.style.margin = '0';
                doc.body.style.padding = '0';
                doc.body.style.width = '100%';
                doc.body.style.height = '100%';
                doc.body.setAttribute('data-theme', theme);
                doc.body.setAttribute('data-device', 'phone');
            }
            win.resourceName      = d.resource;
            win.appName           = d.name;
            win.appIdentifier     = d.id;
            win.settings          = buildSettings();
            win.formatPhoneNumber = (n: string) => formatPhone(n);
            win.setApp            = setApp;
            win.components        = bridge;
            const script = doc.createElement('script');
            script.src = COMPONENTS_URL;
            (doc.body ?? doc.documentElement).appendChild(script);
        } catch (err) {
            console.warn('[sd-phone] custom-app iframe injection failed (expected outside FiveM)', err);
        }
        setReady(true);
    }, [theme, bridge, setApp]);

    useEffect(() => {
        if (!loadedRef.current) return;
        const iframe = iframeRef.current;
        if (!iframe) return;
        try {
            iframe.contentDocument?.body?.setAttribute('data-theme', theme);
        } catch { /* cross-origin */ }
        try {
            iframe.contentWindow?.postMessage({ type: 'settingsUpdated', settings: buildSettings() }, '*');
        } catch { /* cross-origin */ }
    }, [theme, airplaneMode, hour24, brightness]);

    useNuiEvent('customApps:message', useCallback((data) => {
        if (!data || (data.id !== appId && data.id !== 'any')) return;
        try { iframeRef.current?.contentWindow?.postMessage(data.message, '*'); } catch { /* cross-origin */ }
    }, [appId]));

    const activeRef = useRef(false);
    useEffect(() => {
        if (active && !activeRef.current) {
            activeRef.current = true;
            void fetchNui('customApps/lifecycle', { id: appId, action: 'open' });
        } else if (!active && activeRef.current) {
            activeRef.current = false;
            void fetchNui('customApps/lifecycle', { id: appId, action: 'close' });
        }
    }, [active, appId]);
    useEffect(() => () => {
        if (activeRef.current) {
            activeRef.current = false;
            void fetchNui('customApps/lifecycle', { id: appId, action: 'close' });
        }
    }, [appId]);

    if (!def) return null;

    const src = resolveCustomUi(def.ui);

    return (
        <div className="absolute inset-0 overflow-hidden bg-base">
            {src ? (
                <>
                    <iframe
                        ref={iframeRef}
                        src={src}
                        title={def.name}
                        onLoad={onLoad}
                        allow="autoplay; microphone; camera; clipboard-read; clipboard-write"
                        className="absolute inset-0 h-full w-full border-0 transition-opacity duration-200"
                        style={{ colorScheme: theme === 'dark' ? 'dark' : 'light', opacity: ready ? 1 : 0 }}
                    />
                    <div
                        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-elevated transition-opacity duration-200 dark:bg-base"
                        style={{ opacity: ready ? 0 : 1 }}
                    >
                        <div className="overflow-hidden" style={{ width: 72, height: 72, borderRadius: '22.5%' }}>
                            <div style={{ width: 60, height: 60, transform: 'scale(1.2)', transformOrigin: '0 0' }}>
                                <AppIconSVG icon={`custom:${def.id}`} />
                            </div>
                        </div>
                        <div className="text-[15px] font-medium text-black/60 dark:text-white/60">{def.name}</div>
                    </div>
                </>
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-base">
                    <div className="overflow-hidden" style={{ width: 96, height: 96, borderRadius: '22.5%' }}>
                        <div style={{ width: 60, height: 60, transform: 'scale(1.6)', transformOrigin: '0 0' }}>
                            <AppIconSVG icon={`custom:${def.id}`} />
                        </div>
                    </div>
                    <div className="text-[19px] font-semibold text-black dark:text-white">{def.name}</div>
                    <div className="px-8 text-center text-[14px] text-ios-gray">{t('customApps.noInterface', 'This app has no interface.')}</div>
                </div>
            )}

            {popup && (
                <PopupCard
                    data={popup}
                    onButton={settlePopup}
                    onDismiss={() => settlePopup(undefined)}
                    onInput={streamPopupInput}
                />
            )}

            {ctxMenu && (
                <Sheet fit="content" onClose={() => settleCtx(undefined)} title={ctxMenu.title} className="bg-base">
                    {({ close }) => (
                        <div className="px-4 pb-2">
                            {ctxMenu.description && (
                                <p className="px-1 pb-2 text-center text-[14px] text-ios-gray">{ctxMenu.description}</p>
                            )}
                            <div className="overflow-hidden rounded-[12px] bg-surface">
                                {(ctxMenu.buttons ?? []).map((b, i, arr) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => { const r = ctxResolve.current; ctxResolve.current = null; if (r) r(b.callbackId ?? i); close(); }}
                                        className={`flex w-full items-center px-4 py-3.5 text-left text-[18px] font-medium active:bg-black/[0.06] dark:active:bg-white/[0.06] ${i < arr.length - 1 ? 'border-b border-black/10 dark:border-white/10' : ''}`}
                                        style={{ color: b.color ?? undefined }}
                                    >
                                        {b.title ?? b.text ?? b.label ?? ''}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </Sheet>
            )}

            {gallery && (
                <MediaPickerSheet
                    multiple={!!gallery.multiple}
                    max={gallery.max}
                    filter={gallery.type === 'image' || gallery.type === 'photo' ? (p => !p.video) : undefined}
                    onSelect={p => settleGallery(p.url)}
                    onSelectMany={ps => settleGallery(ps.map(p => p.url))}
                    onClose={() => settleGallery(null)}
                />
            )}

            {emojiOpen && (
                <Sheet fit="content" onClose={() => settleEmoji(null)} title={t('common.emoji', 'Emoji')} forceDark={theme === 'dark'} className="bg-surface">
                    {({ close }) => (
                        <div className="px-1 pb-1">
                            <EmojiPanel isDark={theme === 'dark'} onSelect={e => { const r = emojiResolve.current; emojiResolve.current = null; if (r) r(e); close(); }} />
                        </div>
                    )}
                </Sheet>
            )}

            {gifOpen && (
                <GifPickerSheet
                    forceDark={theme === 'dark'}
                    onSelect={url => { const r = gifResolve.current; gifResolve.current = null; setGifOpen(false); if (r) r(url); }}
                    onClose={() => settleGif(null)}
                />
            )}

            {contactOpen && (
                <ContactPickerSheet
                    onPick={(c: Contact) => settleContact({ name: c.name, number: c.phone, avatar: c.avatar })}
                    onClose={() => settleContact(null)}
                />
            )}

            {fullImage && (
                <div
                    className="absolute inset-0 z-[75] flex items-center justify-center bg-black/90"
                    style={{ animation: 'ios-sheet-backdrop-in 0.18s ease-out' }}
                    onPointerDown={() => setFullImage(null)}
                >
                    <img src={fullImage} alt="" className="max-h-full max-w-full object-contain" />
                </div>
            )}

            {colorReq && (
                <Sheet fit="content" onClose={() => settleColor(null)} title={t('customApps.pickColor', 'Pick a Color')} className="bg-base">
                    {({ close }) => (
                        <div className="px-5 pb-3">
                            <div className="grid grid-cols-7 gap-3 pb-4">
                                {SWATCHES.map(c => (
                                    <button
                                        key={c}
                                        type="button"
                                        aria-label={c}
                                        onClick={() => { const r = colorResolve.current; colorResolve.current = null; if (r) r(c); close(); }}
                                        className="h-9 w-9 rounded-full ring-1 ring-black/15 active:scale-90 dark:ring-white/20"
                                        style={{ background: c }}
                                    />
                                ))}
                            </div>
                            <label className="flex items-center justify-between rounded-[12px] bg-surface px-4 py-3">
                                <span className="text-[16px] text-black dark:text-white">{t('customApps.customColor', 'Custom')}</span>
                                <input
                                    type="color"
                                    defaultValue={colorReq.value ?? '#007AFF'}
                                    onChange={e => { const r = colorResolve.current; colorResolve.current = null; if (r) r(e.target.value); close(); }}
                                    className="h-8 w-12 cursor-pointer bg-transparent"
                                />
                            </label>
                        </div>
                    )}
                </Sheet>
            )}
        </div>
    );
}

function PopupCard({ data, onButton, onDismiss, onInput }: {
    data:      PopupData;
    onButton:  (id: number | undefined) => void;
    onDismiss: () => void;
    onInput:   (value: string) => void;
}) {
    const buttons = data.buttons ?? [];
    const horizontal = buttons.length <= 2;

    return portalToPhoneScreen(
        <div
            className="absolute inset-0 z-[70] flex items-center justify-center backdrop-blur-md"
            style={{ background: 'rgba(0,0,0,0.28)', animation: 'ios-sheet-backdrop-in 0.18s ease-out' }}
            onPointerDown={e => { if (e.target === e.currentTarget) onDismiss(); }}
        >
            <div
                className="flex w-[300px] flex-col overflow-hidden rounded-[18px] bg-elevated/80 text-center text-black backdrop-blur-2xl dark:bg-elevated/90 dark:text-white"
                style={{ animation: 'ios-alert-in 0.22s cubic-bezier(0.32,0.72,0,1)' }}
            >
                <div className="px-5 pb-4 pt-5">
                    {data.title && <div className="text-[19px] font-semibold leading-snug">{data.title}</div>}
                    {(data.description ?? data.message) && (
                        <div className="mt-1.5 text-[14px] leading-snug text-black/80 dark:text-white/85">{data.description ?? data.message}</div>
                    )}
                    {data.input && (
                        <input
                            type={data.input.type === 'password' ? 'password' : data.input.type === 'number' ? 'number' : 'text'}
                            defaultValue={data.input.value}
                            placeholder={data.input.placeholder}
                            onChange={e => onInput(e.target.value)}
                            className="mt-3 w-full rounded-[8px] border border-black/15 bg-white px-3 py-2 text-[15px] text-black outline-none dark:border-white/15 dark:bg-white/10 dark:text-white"
                        />
                    )}
                    {data.inputs?.map((inp, i) => (
                        <input
                            key={i}
                            type={inp.type === 'password' ? 'password' : 'text'}
                            defaultValue={inp.value}
                            placeholder={inp.placeholder}
                            className="mt-2 w-full rounded-[8px] border border-black/15 bg-white px-3 py-2 text-[15px] text-black outline-none dark:border-white/15 dark:bg-white/10 dark:text-white"
                        />
                    ))}
                </div>

                <div className={`border-t border-black/[0.13] dark:border-white/[0.13] ${horizontal ? 'flex' : 'flex flex-col'}`}>
                    {buttons.length === 0 ? (
                        <button type="button" onClick={() => onButton(undefined)} className="flex-1 px-4 py-[13px] text-[18px] font-semibold text-ios-blue active:bg-black/10 dark:active:bg-white/10">
                            {t('common.ok', 'OK')}
                        </button>
                    ) : buttons.map((b, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => onButton(b.callbackId ?? i)}
                            className={`flex-1 px-4 py-[13px] text-[18px] active:bg-black/10 dark:active:bg-white/10 ${horizontal && i > 0 ? 'border-l border-black/[0.13] dark:border-white/[0.13]' : ''} ${!horizontal && i > 0 ? 'border-t border-black/[0.13] dark:border-white/[0.13]' : ''}`}
                            style={{ color: b.color ?? undefined }}
                        >
                            {b.title ?? b.text ?? b.label ?? ''}
                        </button>
                    ))}
                </div>
            </div>
        </div>,
    );
}
