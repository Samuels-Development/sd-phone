import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { device } from '@device';
import { fetchNui, hostResource } from '@/core/nui';
import type { HostMessage, PageMessage, PhoneEndpoint } from '@/sdk/protocol';
import { loadInter, pageVarsCss, phoneVars } from './appPageTheme';
import { apiData } from '@/core/api';
import { accountsMyEmail, accountsSaveCustomPassword } from '@/core/accountsApi';
import { apiSavePhotoFromUrl } from '@/core/photosApi';
import { t, getLocale, getLocaleTag } from '@/i18n';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useTheme, useThemeStore } from '@/stores/themeStore';
import { useCustomAppsStore } from '@/stores/customAppsStore';
import { getGameRender } from '@/render';
import { Sheet } from '@/ui/Sheet';
import { ActionSheet } from '@/ui/ActionSheet';
import { AlertDialog } from '@/ui/AlertDialog';
import { PromptDialog } from '@/ui/PromptDialog';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { uploadVoiceMessage } from '@/shared/chat/messagesApi';
import { GifPickerSheet } from '@/shared/chat/GifPickerSheet';
import { ContactPickerSheet } from '@/shared/ContactPickerSheet';
import { formatPhone } from '@/apps/phone/data';
import { accentVars } from '@/apps/settings/appearance/accentRamp';
import { isCustomPaletteId, rampFor, rampVars } from '@/apps/settings/appearance/paletteRamp';
import type { CameraUse } from '@/apps/camera/Camera';
import { LazyCamera } from '@/apps/camera/LazyCamera';
import { AppIconSVG } from './AppIconSVG';
import { useDeckActive } from './deckActive';
import { resolveCustomUi } from './widgets/customUrl';
import type { Contact } from '@/apps/phone/data';

const EmojiPanel = lazy(() => import('@/shared/chat/EmojiPanel').then(m => ({ default: m.EmojiPanel })));

// The SDK ships with whichever resource serves this page - a companion device may not reach
// sd-phone's own files.
const COMPONENTS_URL = `https://cfx-nui-${hostResource}/web/build/sdphone-sdk.js`;

let frameDebugEnabled: boolean | null = null;

function frameDebug(message: string): void {
    if (frameDebugEnabled === false) return;
    void fetchNui<{ enabled?: boolean }>('customApps/debug', { message })
        .then(res => { frameDebugEnabled = res?.enabled === true; })
        .catch(() => { frameDebugEnabled = false; });
}

const STORAGE_MAX_BYTES = 64 * 1024;
const STORAGE_MAX_KEYS = 64;

const warned = new Set<string>();
function warnOnce(name: string): void {
    if (warned.has(name)) return;
    warned.add(name);
    console.warn(`[sd-phone] custom-app bridge: "${name}" is not implemented; resolving null`);
}

function warnQuota(id: string): void {
    const key = `quota:${id}`;
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(
        `[sd-phone] custom app "${id}" hit its storage budget `
        + `(${STORAGE_MAX_BYTES} bytes / ${STORAGE_MAX_KEYS} keys); the write was refused`,
    );
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

function applyPhoneTheme(body: HTMLElement) {
    const s = useThemeStore.getState();
    const mode = s.theme === 'dark' ? 'dark' : 'light';
    body.setAttribute('data-theme', mode);
    body.setAttribute('data-dark-theme', s.darkTheme);
    body.setAttribute('data-light-theme', s.lightTheme);
    const vars: Record<string, string> = accentVars(mode, s.accent);
    const activeId = mode === 'dark' ? s.darkTheme : s.lightTheme;
    if (isCustomPaletteId(activeId)) {
        const palette = s.customPalettes.find(p => p.id === activeId);
        if (palette) Object.assign(vars, rampVars(rampFor(palette.mode, palette)));
    }
    for (const name of Array.from(body.style)) if (name.startsWith('--')) body.style.removeProperty(name);
    for (const [name, value] of Object.entries(vars)) body.style.setProperty(name, value);
}

// The --phone-* colours, read off the iframe element: it sits inside the phone's themed wrapper,
// so the theme tokens computed on it are the ones the phone's own apps are drawn with. They go in a
// <style> at the very start of the page, so the page's own rules still win over them.
function applyPageVars(iframe: HTMLIFrameElement, doc: Document) {
    const computed = getComputedStyle(iframe);
    const css = pageVarsCss(phoneVars(token => computed.getPropertyValue(token)));
    let style = doc.querySelector<HTMLStyleElement>('style[data-sd-phone-vars]');
    if (!style) {
        style = doc.createElement('style');
        style.setAttribute('data-sd-phone-vars', '');
        const parent = doc.head ?? doc.documentElement;
        parent.insertBefore(style, parent.firstChild);
    }
    style.textContent = css;
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
        streamerMode: s.streamerMode,
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
interface SaveLoginReq { username: string; password: string; email?: string; phone?: string }

const SWATCHES = [
    '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#30B0C7', '#007AFF',
    '#5856D6', '#AF52DE', '#FF2D55', '#A2845E', '#8E8E93', '#1C1C1E', '#FFFFFF',
];

export function CustomAppFrame({ appId, onClose }: { appId: string; onClose: () => void }) {
    const def = useCustomAppsStore(s => s.apps.find(a => a.id === appId));
    const { theme, darkTheme, lightTheme, accent, customPalettes, airplaneMode, hour24, brightness } = useTheme('theme', 'darkTheme', 'lightTheme', 'accent', 'customPalettes', 'airplaneMode', 'hour24', 'brightness');
    const active = useDeckActive();

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const loadedRef = useRef(false);
    const [ready, setReady] = useState(false);
    const defRef = useRef(def);
    defRef.current = def;

    const sdkReadyRef = useRef(false);
    const outboxRef   = useRef<unknown[]>([]);
    const typingRef   = useRef(false);

    const postToApp = useCallback((message: unknown) => {
        if (!sdkReadyRef.current) {
            if (outboxRef.current.length < 64) outboxRef.current.push(message);
            return;
        }
        try { iframeRef.current?.contentWindow?.postMessage(message, '*'); } catch { /* cross-origin */ }
    }, []);

    const markSdkReady = useCallback(() => {
        if (sdkReadyRef.current) return;
        sdkReadyRef.current = true;
        const win = iframeRef.current?.contentWindow;
        try { win?.postMessage('componentsLoaded', '*'); } catch { /* cross-origin */ }
        const queued = outboxRef.current;
        outboxRef.current = [];
        for (const message of queued) {
            try { win?.postMessage(message, '*'); } catch { /* cross-origin */ }
        }
    }, []);

    const [popup, setPopup]         = useState<PopupData | null>(null);
    const [ctxMenu, setCtxMenu]     = useState<CtxMenuData | null>(null);
    const [gallery, setGallery]     = useState<GalleryReq | null>(null);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [gifOpen, setGifOpen]     = useState(false);
    const [contactOpen, setContact] = useState(false);
    const [colorReq, setColorReq]   = useState<ColorReq | null>(null);
    const [saveLogin, setSaveLogin] = useState<SaveLoginReq | null>(null);
    const [fullImage, setFullImage] = useState<string | null>(null);
    const [cameraOpen, setCameraOpen] = useState(false);
    // The camera, called up over this app by the app's resource (exports['sd-phone']:useCamera).
    const [cameraUse, setCameraUse] = useState<CameraUse | null>(null);

    const popupResolve   = useRef<((v: number | undefined) => void) | null>(null);
    const ctxResolve     = useRef<((v: number | undefined) => void) | null>(null);
    const galleryResolve = useRef<((v: unknown) => void) | null>(null);
    const emojiResolve   = useRef<((v: string | null) => void) | null>(null);
    const gifResolve     = useRef<((v: string | null) => void) | null>(null);
    const contactResolve = useRef<((v: unknown) => void) | null>(null);
    const colorResolve   = useRef<((v: string | null) => void) | null>(null);
    const saveLoginResolve = useRef<((v: boolean) => void) | null>(null);
    const cameraResolve  = useRef<((v: string | null) => void) | null>(null);

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
    const settleSaveLogin = useCallback((accepted: boolean) => {
        const r = saveLoginResolve.current; saveLoginResolve.current = null;
        const req = saveLogin;
        setSaveLogin(null);
        if (!r) return;
        if (!accepted || !req) { r(false); return; }
        void accountsSaveCustomPassword(appId, { ...req }).then(r, () => r(false));
    }, [appId, saveLogin]);
    const settleColor = useCallback((value: string | null) => {
        const r = colorResolve.current; colorResolve.current = null;
        setColorReq(null);
        if (r) r(value);
    }, []);

    const settleCamera = useCallback((value: string | null) => {
        const r = cameraResolve.current; cameraResolve.current = null;
        setCameraOpen(false);
        if (r) r(value);
    }, []);

    const streamPopupInput = useCallback((value: string) => {
        postToApp({ type: 'popUpInputChanged', value } satisfies HostMessage);
    }, [postToApp]);

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
                return await uploadVoiceMessage(dataUrl, blob);
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
                return new Promise(res => { cameraResolve.current = res; setCameraOpen(true); });
            default:
                warnOnce(`ShowComponent:${data?.component ?? 'unknown'}`);
                return Promise.resolve(null);
        }
    }, []);

    const storageKey = useCallback((key: unknown): string | null => {
        const id = defRef.current?.id;
        if (!id || typeof key !== 'string' || key === '') return null;
        return `sd-phone:customapp:${id}:${key}`;
    }, []);

    const storageUsage = useCallback((): { bytes: number; keys: number } => {
        const id = defRef.current?.id;
        if (!id) return { bytes: 0, keys: 0 };
        const prefix = `sd-phone:customapp:${id}:`;
        let bytes = 0;
        let keys = 0;
        for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (!k || !k.startsWith(prefix)) continue;
            keys += 1;
            bytes += k.length + (window.localStorage.getItem(k)?.length ?? 0);
        }
        return { bytes, keys };
    }, []);

    const fetchPhone = useCallback((event: PhoneEndpoint, data?: any): Promise<unknown> => {
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
                typingRef.current = !!data;
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
            case 'GetPhoneNumber':
                return apiData<{ number?: string }>('sd-phone:accounts:myNumber')
                    .then(r => r?.number ?? null)
                    .catch(() => null);
            case 'GetEmails':
                return accountsMyEmail().catch(() => []);
            case 'SavePassword': {
                const username = typeof data?.username === 'string' ? data.username.trim() : '';
                const password = typeof data?.password === 'string' ? data.password : '';
                if (!username || !password || saveLoginResolve.current) return Promise.resolve(false);
                return new Promise<boolean>(res => {
                    saveLoginResolve.current = res;
                    setSaveLogin({
                        username,
                        password,
                        email: typeof data?.email === 'string' ? data.email : undefined,
                        phone: typeof data?.phone === 'string' ? data.phone : undefined,
                    });
                });
            }
            case 'GetStorage': {
                const k = storageKey(data?.key);
                if (!k) return Promise.resolve(null);
                try {
                    return Promise.resolve(window.localStorage.getItem(k));
                } catch {
                    return Promise.resolve(null);
                }
            }
            case 'SetStorage': {
                const k = storageKey(data?.key);
                if (!k) return Promise.resolve(false);
                try {
                    if (data?.value == null) {
                        window.localStorage.removeItem(k);
                        return Promise.resolve(true);
                    }

                    const value = String(data.value);
                    const previous = window.localStorage.getItem(k);
                    const used = storageUsage();
                    const nextBytes = used.bytes
                        - (previous === null ? 0 : k.length + previous.length)
                        + k.length + value.length;
                    const nextKeys = used.keys + (previous === null ? 1 : 0);

                    if (nextBytes > STORAGE_MAX_BYTES || nextKeys > STORAGE_MAX_KEYS) {
                        warnQuota(defRef.current?.id ?? appId);
                        return Promise.resolve(false);
                    }

                    window.localStorage.setItem(k, value);
                    return Promise.resolve(true);
                } catch {
                    warnOnce('SetStorage');
                    return Promise.resolve(false);
                }
            }
            default:
                warnOnce(event);
                return Promise.resolve(null);
        }
    }, [showComponent, notify, createCall, storageKey, storageUsage, appId]);

    useEffect(() => {
        if (!loadedRef.current) return;
        postToApp({ type: active ? 'appOpen' : 'appClose', data: { id: defRef.current?.id } } satisfies HostMessage);
    }, [active, ready, postToApp]);

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

    useEffect(() => () => {
        if (!typingRef.current) return;
        typingRef.current = false;
        void fetchNui('sd-phone:typing', { typing: false });
    }, []);

    const closeFromFrame = useCallback(() => {
        if (typingRef.current) {
            typingRef.current = false;
            void fetchNui('sd-phone:typing', { typing: false });
        }
        onClose();
    }, [onClose]);

    const setApp = useCallback((target: string | { name?: string; data?: unknown } | null | undefined) => {
        if (target === null || target === undefined) {
            closeFromFrame();
            return;
        }
        const name = typeof target === 'string' ? target : (typeof target === 'object' ? target.name : undefined);
        if (typeof name !== 'string' || name === '') return;
        if (name === 'home') {
            closeFromFrame();
            return;
        }
        window.postMessage({ action: 'sd-phone:launchApp', data: { id: name } }, '*');
    }, [closeFromFrame]);

    const onLoad = useCallback(() => {
        const iframe = iframeRef.current;
        const d = defRef.current;
        if (!iframe || !d) return;
        loadedRef.current = true;
        sdkReadyRef.current = false;
        outboxRef.current = [];
        frameDebugEnabled = null;
        try {
            const win = iframe.contentWindow as (Window & Record<string, unknown>) | null;
            const doc = iframe.contentDocument;
            frameDebug(`${d.id}: load fired, window=${!!win}, document=${!!doc}, src=${iframe.getAttribute('src') ?? ''}`);
            if (!win || !doc) {
                frameDebug(`${d.id}: no same-origin document, the page is blank or served from another origin`);
                return;
            }
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
                applyPhoneTheme(doc.body);
                doc.body.setAttribute('data-device', 'phone');
            }
            if (doc.documentElement) applyPageVars(iframe, doc);
            void loadInter(doc);
            win.resourceName      = d.resource;
            win.appName           = d.name;
            win.appIdentifier     = d.id;
            win.settings          = buildSettings();
            win.formatPhoneNumber = (n: string) => formatPhone(n);
            win.setApp            = setApp;
            win.components        = bridge;

            doc.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key !== 'Escape') return;
                e.preventDefault();
                window.postMessage({ action: 'sd-phone:escape' }, '*');
            });

            const rootMarkup = doc.getElementById('root')?.innerHTML.length ?? -1;
            frameDebug(`${d.id}: globals set, #root markup ${rootMarkup} chars, injecting ${COMPONENTS_URL}`);
            const script = doc.createElement('script');
            script.src = COMPONENTS_URL;
            script.onload = () => {
                frameDebug(`${d.id}: sdphone-sdk.js ran, componentsLoaded=${!!win.componentsLoaded}, fetchNui=${typeof win.fetchNui}`);
                markSdkReady();
            };
            script.onerror = () => {
                frameDebug(`${d.id}: sdphone-sdk.js FAILED to load from ${COMPONENTS_URL}`);
                markSdkReady();
            };
            (doc.body ?? doc.documentElement).appendChild(script);
            window.setTimeout(markSdkReady, 4000);
            window.setTimeout(() => {
                try {
                    const body = iframe.contentDocument?.body;
                    const root = iframe.contentDocument?.getElementById('root');
                    frameDebug(`${d.id}: after 3s body ${body?.innerHTML.length ?? -1} chars, #root ${root?.innerHTML.length ?? -1} chars, visible=${body ? getComputedStyle(body).visibility : 'n/a'}`);
                } catch { /* cross-origin */ }
            }, 3000);
        } catch (err) {
            frameDebug(`${d.id}: injection threw ${err instanceof Error ? err.message : String(err)}`);
            console.warn('[sd-phone] custom-app iframe injection failed (expected outside FiveM)', err);
        }
        setReady(true);
    }, [bridge, setApp, markSdkReady]);

    useEffect(() => {
        if (!loadedRef.current) return;
        const iframe = iframeRef.current;
        if (!iframe) return;
        try {
            const body = iframe.contentDocument?.body;
            if (body) applyPhoneTheme(body);
            const doc = iframe.contentDocument;
            if (doc?.documentElement) applyPageVars(iframe, doc);
        } catch { /* cross-origin */ }
        postToApp({ type: 'settingsUpdated', settings: buildSettings() } satisfies HostMessage);
    }, [theme, darkTheme, lightTheme, accent, customPalettes, airplaneMode, hour24, brightness, postToApp]);

    useEffect(() => {
        function onFrameMessage(event: MessageEvent) {
            if (event.source !== iframeRef.current?.contentWindow) return;
            const msg = event.data as PageMessage | null;
            if (!msg || typeof msg.type !== 'string') return;
            if (msg.type === 'sdphoneDebug' && typeof msg.message === 'string') { frameDebug(msg.message); return; }
            if (msg.type === 'sdphoneSdkReady') markSdkReady();
            if (msg.type === 'sdphoneCloseApp') closeFromFrame();
        }
        window.addEventListener('message', onFrameMessage);
        return () => window.removeEventListener('message', onFrameMessage);
    }, [markSdkReady, closeFromFrame]);

    useNuiEvent('customApps:message', useCallback((data) => {
        if (!data || (data.id !== appId && data.id !== 'any')) return;
        postToApp(data.message);
    }, [appId, postToApp]));

    // Lua says when this app's resource has called the camera, and when the call is over. A frame
    // that was not there to hear (the phone was away, and is opened on the app by the call) asks
    // as it comes to the front.
    const readCameraUse = (raw: unknown): CameraUse | null => {
        const u = raw as Partial<CameraUse> | null | false | undefined;
        if (!u || typeof u.id !== 'number') return null;
        return {
            id:      u.id,
            hint:    typeof u.hint === 'string' ? u.hint : undefined,
            overlay: typeof u.overlay === 'string' ? u.overlay : undefined,
        };
    };

    useNuiEvent('customApps:camera', (data) => {
        if (!data || data.id !== appId) return;
        setCameraUse(readCameraUse(data.use));
    });

    useEffect(() => {
        if (!active) return;
        let stale = false;
        void fetchNui<{ use?: unknown }>('customApps/camera', { id: appId }).then((res) => {
            if (!stale && res?.use) setCameraUse(readCameraUse(res.use));
        });
        return () => { stale = true; };
    }, [active, appId]);

    const dismissCameraUse = useCallback(() => {
        setCameraUse((current) => {
            if (current) void fetchNui('sd-phone:camera:useDismissed', { id: current.id });
            return null;
        });
    }, []);

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
                            <div style={{ width: 60, height: 60, transform: 'scale(1.2)', transformOrigin: 'top var(--dir-start, left)' }}>
                                <AppIconSVG icon={`custom:${def.id}`} />
                            </div>
                        </div>
                        <div className="text-[15px] font-medium text-black/60 dark:text-white/60">{def.name}</div>
                    </div>
                </>
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-base">
                    <div className="overflow-hidden" style={{ width: 96, height: 96, borderRadius: '22.5%' }}>
                        <div style={{ width: 60, height: 60, transform: 'scale(1.6)', transformOrigin: 'top var(--dir-start, left)' }}>
                            <AppIconSVG icon={`custom:${def.id}`} />
                        </div>
                    </div>
                    <div className="text-[19px] font-semibold text-black dark:text-white">{def.name}</div>
                    <div className="px-8 text-center text-[14px] text-ios-gray">{t('customApps.noInterface', 'This app has no interface.')}</div>
                </div>
            )}

            {popup && <PopupHost data={popup} onSettle={settlePopup} onInput={streamPopupInput} />}

            {ctxMenu && (
                <ActionSheet
                    title={ctxMenu.title}
                    message={ctxMenu.description}
                    actions={(ctxMenu.buttons ?? []).map((b, i) => ({
                        label:       buttonLabel(b),
                        destructive: isDestructive(b.color),
                        onClick:     () => settleCtx(b.callbackId ?? i),
                    }))}
                    cancelLabel={t('common.cancel', 'Cancel')}
                    onClose={() => window.setTimeout(() => settleCtx(undefined), 0)}
                />
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
                            <Suspense fallback={<div className="bg-surface" style={{ height: 380 }} />}>
                                <EmojiPanel isDark={theme === 'dark'} onSelect={e => { const r = emojiResolve.current; emojiResolve.current = null; if (r) r(e); close(); }} />
                            </Suspense>
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

            {cameraOpen && (
                <div className="absolute inset-0 z-[80] bg-black">
                    <LazyCamera
                        photoOnly
                        onCapture={url => settleCamera(url)}
                        onClose={() => settleCamera(null)}
                    />
                </div>
            )}

            {/* The same camera, called by the app's resource: its shutter is the resource's. */}
            {cameraUse && !cameraOpen && (
                <div className="absolute inset-0 z-[80] bg-black">
                    <LazyCamera
                        key={cameraUse.id}
                        photoOnly
                        use={cameraUse}
                        onClose={dismissCameraUse}
                    />
                </div>
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

            {saveLogin && (
                <AlertDialog
                    title={t('common.saveToPasswords', 'Save to Passwords?')}
                    message={t('common.savePasswordsBody', 'Keep your {appName} username and password in the Passwords app so you can always find them.', { appName: def?.name ?? appId })}
                    confirmLabel={t('common.save', 'Save')}
                    cancelLabel={t('common.notNow', 'Not Now')}
                    onCancel={() => settleSaveLogin(false)}
                    onConfirm={() => settleSaveLogin(true)}
                />
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

function buttonLabel(b: PopupBtn): string {
    return b.title ?? b.text ?? b.label ?? '';
}

function isDestructive(color?: string): boolean {
    if (!color) return false;
    const c = color.trim().toLowerCase();
    if (c === 'red' || c === 'crimson' || c === 'danger') return true;
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(c)?.[1];
    if (!hex) return false;
    const full = hex.length === 3 ? hex.split('').map(ch => ch + ch).join('') : hex;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
    return r >= 180 && g <= 110 && b <= 110;
}

function PopupHost({ data, onSettle, onInput }: {
    data:     PopupData;
    onSettle: (id: number | undefined) => void;
    onInput:  (value: string) => void;
}) {
    const buttons = data.buttons ?? [];
    const message = data.description ?? data.message;
    const field = data.input ?? data.inputs?.[0];
    const idOf = (i: number) => buttons[i]?.callbackId ?? i;

    if (field) {
        const last = buttons.length - 1;
        const cancel = buttons.length > 1 ? buttons[0] : undefined;
        return (
            <PromptDialog
                title={data.title ?? ''}
                message={message}
                placeholder={field.placeholder}
                initialValue={field.value}
                secure={field.type === 'password'}
                inputMode={field.type === 'number' ? 'numeric' : undefined}
                allowEmpty
                sanitize={value => { onInput(value); return value; }}
                confirmLabel={last >= 0 ? buttonLabel(buttons[last]) || undefined : undefined}
                cancelLabel={cancel ? buttonLabel(cancel) || undefined : undefined}
                onCancel={() => onSettle(cancel ? idOf(0) : undefined)}
                onConfirm={value => { onInput(value); onSettle(last >= 0 ? idOf(last) : undefined); }}
            />
        );
    }

    if (buttons.length > 2) {
        return (
            <ActionSheet
                title={data.title}
                message={message}
                actions={buttons.map((b, i) => ({
                    label:       buttonLabel(b),
                    destructive: isDestructive(b.color),
                    onClick:     () => onSettle(idOf(i)),
                }))}
                cancelLabel={t('common.cancel', 'Cancel')}
                onClose={() => window.setTimeout(() => onSettle(undefined), 0)}
            />
        );
    }

    const confirm = buttons.length === 2 ? 1 : 0;
    return (
        <AlertDialog
            title={data.title ?? ''}
            message={message}
            hideCancel={buttons.length < 2}
            confirmLabel={buttons.length > 0 ? buttonLabel(buttons[confirm]) || undefined : undefined}
            cancelLabel={buttons.length === 2 ? buttonLabel(buttons[0]) || undefined : undefined}
            destructive={isDestructive(buttons[confirm]?.color)}
            onCancel={() => onSettle(buttons.length === 2 ? idOf(0) : undefined)}
            onConfirm={() => onSettle(buttons.length > 0 ? idOf(confirm) : undefined)}
        />
    );
}
