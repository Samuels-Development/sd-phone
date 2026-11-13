
import type { HostMessage, PageMessage, PhoneEndpoint } from './protocol';

export type SdkWindow = typeof globalThis & Record<string, unknown>;

type ApiName =
    | 'SetPopUp' | 'SetContextMenu' | 'SetContactModal' | 'UseComponent' | 'SelectGallery' | 'SelectGIF'
    | 'SelectEmoji' | 'UseCamera' | 'ColorPicker' | 'ContactSelector' | 'GetSettings' | 'GetLocale'
    | 'SendNotification' | 'OnSettingsChange' | 'RemoveSettingsChangeListener' | 'ToggleInput' | 'CreateCall'
    | 'OpenMedia' | 'GetPhoneNumber' | 'GetEmails' | 'SavePassword' | 'GetStorage' | 'SetStorage'
    | 'ShowConfirm' | 'OnAppOpen' | 'OnAppClose';

type Accepts<K extends keyof typeof globalThis> = (...args: Parameters<Extract<(typeof globalThis)[K], (...a: never[]) => unknown>>) => unknown;

interface Bridge {
    fetchPhone?: (endpoint: string, payload?: unknown) => unknown;
}

interface Button {
    cb?: unknown;
    callbackId?: number;
}

interface ButtonData {
    buttons?: unknown;
    input?: { onChange?: unknown };
}

type Listener = (value: any) => void;

const VERSION = 6;

const INSTALLED = Symbol.for('sd-phone.sdk');

export function install(win: SdkWindow): void {
    const out = win as Record<string, unknown>;

    const marks = win as unknown as Record<symbol, { attach: () => void } | undefined>;
    const installed = marks[INSTALLED];
    if (installed) {
        installed.attach();
        return;
    }

    if (out.componentsLoaded) return;

    const settingsListeners = new Set<Listener>();
    const openListeners = new Set<Listener>();
    const closeListeners = new Set<Listener>();
    const nuiListeners = new Map<string, Set<Listener>>();
    const quietEndpoints = new Set<string>();

    let popUpInput: Listener | null = null;

    const waiting: Array<{ endpoint: PhoneEndpoint; payload: unknown; resolve: (value: unknown) => void }> = [];
    let attached = false;
    let markReady: () => void = () => {};
    const ready = new Promise<void>(resolve => { markReady = resolve; });

    function appLabel(): string {
        return (out.appName as string) || (out.appIdentifier as string) || 'custom app';
    }

    function notifyAll(listeners: Set<Listener>, value: unknown, label: string): void {
        listeners.forEach(function (listener) {
            try {
                listener(value);
            } catch (err) {
                console.error(`[${label}] listener threw:`, err);
            }
        });
    }

    function callPhone(endpoint: PhoneEndpoint, payload?: unknown): Promise<unknown> {
        if (attached) return send(endpoint, payload);
        return new Promise(resolve => { waiting.push({ endpoint, payload, resolve }); });
    }

    function send(endpoint: PhoneEndpoint, payload?: unknown): Promise<unknown> {
        const bridge = out.components as Bridge | undefined;

        if (!bridge || typeof bridge.fetchPhone !== 'function') {
            if (!quietEndpoints.has(endpoint)) {
                quietEndpoints.add(endpoint);
                console.warn(`[${appLabel()}] no phone bridge for "${endpoint}"; the call was dropped.`);
            }
            return Promise.resolve(undefined);
        }

        try {
            return Promise.resolve(bridge.fetchPhone(endpoint, payload));
        } catch (err) {
            console.error(`[${appLabel()}] phone call "${endpoint}" failed:`, err);
            return Promise.resolve(undefined);
        }
    }

    async function fetchNuiStrict(event: string, data?: unknown, scriptName?: string): Promise<unknown> {
        if (!attached) await ready;

        const target = scriptName || (out.resourceName as string);

        if (scriptName && scriptName !== out.resourceName) {
            console.warn(
                `[${appLabel()}] app "${out.appName}" belongs to resource "${out.resourceName}" `
                + `but addressed "${scriptName}". FiveM may block the request.`,
            );
        }

        const response = await win.fetch(`https://${target}/${event}`, {
            method: 'post',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify(data === undefined ? {} : data),
        });

        if (!response.ok) throw new Error(`${target}/${event}: ${response.status} ${response.statusText}`);

        return await response.json();
    }

    function reportDebug(message: string): void {
        try {
            win.parent.postMessage({ type: 'sdphoneDebug', message: String(message) } satisfies PageMessage, '*');
        } catch {
        }
    }

    async function fetchNui(event: string, data?: unknown, scriptName?: string): Promise<unknown> {
        try {
            return await fetchNuiStrict(event, data, scriptName);
        } catch (err) {
            const reason = err instanceof Error ? err.message : err;
            console.error(`[fetchNui] ${reason}`);
            reportDebug(`${(out.appIdentifier as string) || 'app'}: fetchNui "${event}" failed: ${reason}`);
            return undefined;
        }
    }

    function subscribeNuiEvent(eventName: string, cb: Listener): () => void {
        if (!eventName || typeof cb !== 'function') return function () {};

        let subscribers = nuiListeners.get(eventName);
        if (!subscribers) {
            subscribers = new Set();
            nuiListeners.set(eventName, subscribers);
        }
        subscribers.add(cb);

        const own = subscribers;
        return function unsubscribe() {
            own.delete(cb);
        };
    }

    function handleMessage(event: MessageEvent): void {
        if (event.source !== win.parent && event.source !== (win as unknown)) return;

        const message = event.data as ((HostMessage | { type?: undefined }) & { action?: unknown; data?: unknown }) | null;
        if (!message || typeof message !== 'object') return;

        if (message.type === 'settingsUpdated') {
            if (message.settings) out.settings = message.settings;
            notifyAll(settingsListeners, message.settings, 'onSettingsChange');
        } else if (message.type === 'popUpInputChanged' && popUpInput) {
            popUpInput(message.value);
        } else if (message.type === 'appOpen') {
            notifyAll(openListeners, message.data, 'onAppOpen');
        } else if (message.type === 'appClose') {
            notifyAll(closeListeners, message.data, 'onAppClose');
        }

        if (typeof message.action === 'string') {
            const subscribers = nuiListeners.get(message.action);
            if (subscribers) notifyAll(subscribers, message.data, message.action);
        }
    }

    function tagCallbacks(buttons: Button[]): void {
        buttons.forEach(function (button, index) {
            if (button && typeof button.cb === 'function') button.callbackId = index;
        });
    }

    function runCallback(buttons: Button[], index: unknown): void {
        if (index === undefined || index === null) return;

        const button = buttons[index as number];
        if (button && typeof button.cb === 'function') (button.cb as () => void)();
    }

    function openPopUp(data: ButtonData) {
        const buttons = data && data.buttons;
        if (!Array.isArray(buttons)) return undefined;

        tagCallbacks(buttons);

        let payload: unknown = data;

        if (data.input && typeof data.input.onChange === 'function') {
            popUpInput = data.input.onChange as Listener;
            payload = Object.assign({}, data, { input: Object.assign({}, data.input, { onChange: true }) });
        } else {
            popUpInput = null;
        }

        return callPhone('SetPopUp', payload).then(function (index) {
            popUpInput = null;
            runCallback(buttons, index);
            return index;
        }, function (err) {
            popUpInput = null;
            console.error(`[${appLabel()}] pop-up failed:`, err);
            return undefined;
        });
    }

    function openContextMenu(data: ButtonData) {
        const buttons = data && data.buttons;
        if (!Array.isArray(buttons)) return undefined;

        tagCallbacks(buttons);

        return callPhone('SetContextMenu', data).then(function (index) {
            runCallback(buttons, index);
            return index;
        }, function (err) {
            console.error(`[${appLabel()}] context menu failed:`, err);
            return undefined;
        });
    }

    function openContactModal(number: string) {
        return callPhone('SetContactModal', number);
    }

    function showComponent(cb: unknown, data: { component?: string } & Record<string, unknown>) {
        const done = typeof cb === 'function' ? cb as Listener : null;

        return callPhone('ShowComponent', data).then(
            function (result) {
                const value = result === undefined ? null : result;
                if (done) done(value);
                return value;
            },
            function (err) {
                console.error(`[useComponent] "${data && data.component}" failed:`, err);
                if (done) done(null);
                return null;
            },
        );
    }

    function pickFromGallery(data?: Record<string, unknown>) {
        const options = Object.assign({}, data);
        const cb = options.cb;
        delete options.cb;

        return showComponent(cb, Object.assign(options, { component: 'gallery' }));
    }

    function pickGif(cb?: unknown) {
        return showComponent(cb, { component: 'gif' });
    }

    function pickEmoji(cb?: unknown) {
        return showComponent(cb, { component: 'emoji' });
    }

    function openCamera(cb?: unknown, data?: Record<string, unknown>) {
        return showComponent(cb, Object.assign({}, data, { component: 'camera' }));
    }

    function pickContact(cb?: unknown, data?: Record<string, unknown>) {
        return showComponent(cb, Object.assign({}, data, { component: 'contactselector' }));
    }

    function pickColour(cb?: unknown, data?: Record<string, unknown>) {
        return showComponent(cb, Object.assign({}, data, { component: 'colorpicker', customApp: true }));
    }

    function readSettings() {
        return callPhone('GetSettings');
    }

    function readLocale(path: string, format?: unknown) {
        return callPhone('GetLocale', { path: path, format: format });
    }

    function pushNotification(data: { title?: string; content?: string } & Record<string, unknown>) {
        if (!data || (!data.title && !data.content)) {
            console.error('[sendNotification] invalid notification data: a title or content is required.', data);
            return undefined;
        }

        return callPhone('SendNotification', Object.assign({}, data, { app: out.appIdentifier }));
    }

    function watchSettings(cb: Listener): void {
        if (typeof cb !== 'function') return;
        settingsListeners.add(cb);
    }

    function unwatchSettings(cb: Listener): void {
        settingsListeners.delete(cb);
    }

    function captureKeyboard(state: boolean) {
        return callPhone('toggleInput', !!state);
    }

    function startCall(data: unknown) {
        return callPhone('CreateCall', data);
    }

    function viewMedia(data: unknown) {
        return callPhone('OpenMedia', typeof data === 'string' ? { src: data } : data);
    }

    function readPhoneNumber() {
        return callPhone('GetPhoneNumber').then(function (n) {
            return typeof n === 'string' && n !== '' ? n : null;
        });
    }

    function readEmails() {
        return callPhone('GetEmails').then(function (list) {
            return Array.isArray(list) ? list.filter(function (e) { return typeof e === 'string' && e !== ''; }) : [];
        });
    }

    function saveLogin(data: { username?: unknown; password?: unknown; email?: unknown; phone?: unknown }) {
        const login = data || {};
        if (typeof login.username !== 'string' || login.username.trim() === ''
            || typeof login.password !== 'string' || login.password === '') {
            console.error(`[${appLabel()}] SavePassword needs a username and a password.`);
            return Promise.resolve(false);
        }

        return callPhone('SavePassword', {
            username: login.username,
            password: login.password,
            email: typeof login.email === 'string' ? login.email : undefined,
            phone: typeof login.phone === 'string' ? login.phone : undefined,
        }).then(function (ok) { return ok === true; });
    }

    function readStorage(key: string, fallback?: unknown) {
        if (typeof key !== 'string' || key === '') return Promise.resolve(fallback === undefined ? null : fallback);

        return callPhone('GetStorage', { key: key }).then(function (raw) {
            if (raw === undefined || raw === null) return fallback === undefined ? null : fallback;
            try {
                return JSON.parse(raw as string);
            } catch {
                return fallback === undefined ? null : fallback;
            }
        });
    }

    function writeStorage(key: string, value: unknown) {
        if (typeof key !== 'string' || key === '') return Promise.resolve(false);

        if (value === undefined || value === null) {
            return callPhone('SetStorage', { key: key, value: null }).then(function (ok) { return ok === true; });
        }

        let encoded: string;
        try {
            encoded = JSON.stringify(value);
        } catch (err) {
            console.error(`[${appLabel()}] SetStorage("${key}") value is not serialisable:`, err);
            return Promise.resolve(false);
        }

        return callPhone('SetStorage', { key: key, value: encoded }).then(function (ok) { return ok === true; });
    }

    function confirmDialog(data: string | Record<string, unknown>) {
        const opts: Record<string, unknown> = typeof data === 'string' ? { title: data } : Object.assign({}, data || {});
        const cancelText = opts.cancelText || 'Cancel';
        const confirmText = opts.confirmText || 'Confirm';

        delete opts.cancelText;
        delete opts.confirmText;

        return openPopUp(Object.assign(opts, {
            buttons: [{ title: cancelText }, { title: confirmText, color: opts.color }],
        }))!.then(function (index) {
            return index === 1;
        });
    }

    function watchAppOpen(cb: Listener) {
        if (typeof cb !== 'function') return function () {};
        openListeners.add(cb);
        return function () { openListeners.delete(cb); };
    }

    function watchAppClose(cb: Listener) {
        if (typeof cb !== 'function') return function () {};
        closeListeners.add(cb);
        return function () { closeListeners.delete(cb); };
    }

    const API = {
        SetPopUp: openPopUp,
        SetContextMenu: openContextMenu,
        SetContactModal: openContactModal,
        UseComponent: showComponent,
        SelectGallery: pickFromGallery,
        SelectGIF: pickGif,
        SelectEmoji: pickEmoji,
        UseCamera: openCamera,
        ColorPicker: pickColour,
        ContactSelector: pickContact,
        GetSettings: readSettings,
        GetLocale: readLocale,
        SendNotification: pushNotification,
        OnSettingsChange: watchSettings,
        RemoveSettingsChangeListener: unwatchSettings,
        ToggleInput: captureKeyboard,
        CreateCall: startCall,
        OpenMedia: viewMedia,
        GetPhoneNumber: readPhoneNumber,
        GetEmails: readEmails,
        SavePassword: saveLogin,
        GetStorage: readStorage,
        SetStorage: writeStorage,
        ShowConfirm: confirmDialog,
        OnAppOpen: watchAppOpen,
        OnAppClose: watchAppClose,
    } satisfies { [K in ApiName]: Accepts<K> };

    (Object.keys(API) as ApiName[]).forEach(function (name) {
        out[name] = API[name];
        out[name.charAt(0).toLowerCase() + name.slice(1)] = API[name];
    });

    const EXTRAS = {
        fetchNui: fetchNui,
        fetchNuiStrict: fetchNuiStrict,
        onNuiEvent: subscribeNuiEvent,
        useNuiEvent: subscribeNuiEvent,
    } satisfies { [K in 'fetchNui' | 'fetchNuiStrict' | 'onNuiEvent' | 'useNuiEvent']: Accepts<K> };

    out.selectGif = API.SelectGIF;
    Object.assign(out, EXTRAS);

    out.componentsVersion = VERSION;

    out.componentsUnsupported = Object.freeze(['SetContactModal']);

    out.componentsSupports = function (name: string) {
        if (typeof name !== 'string' || typeof out[name] !== 'function') return false;
        return (out.componentsUnsupported as readonly string[]).indexOf(name) === -1;
    };

    win.addEventListener('message', handleMessage);

    const boundFields = new WeakSet<Element>();
    const TEXT_FIELDS = 'input, textarea, [contenteditable]:not([contenteditable="false"])';
    const NON_TYPING = new Set([
        'range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'color', 'image',
    ]);

    function onFieldFocus(): void {
        captureKeyboard(true);
    }

    function onFieldBlur(): void {
        captureKeyboard(false);
    }

    function bindField(field: Element): void {
        if (NON_TYPING.has((field as HTMLInputElement).type)) return;
        if (boundFields.has(field)) return;

        boundFields.add(field);
        field.addEventListener('focus', onFieldFocus);
        field.addEventListener('blur', onFieldBlur);
    }

    function bindFieldsWithin(node: Node): void {
        if (!node || node.nodeType !== 1) return;
        const element = node as Element;
        if (element.matches(TEXT_FIELDS)) bindField(element);
        element.querySelectorAll(TEXT_FIELDS).forEach(bindField);
    }

    const appRoot = win.document.body || win.document.documentElement;

    bindFieldsWithin(appRoot);

    if (typeof win.MutationObserver === 'function') {
        new win.MutationObserver(function (records) {
            records.forEach(function (record) {
                if (record.type === 'attributes') {
                    bindFieldsWithin(record.target);
                    return;
                }
                record.addedNodes.forEach(bindFieldsWithin);
            });
        }).observe(appRoot, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['contenteditable'],
        });
    }

    function hostPresent(): boolean {
        const bridge = out.components as Bridge | undefined;
        return !!bridge && typeof bridge.fetchPhone === 'function' && typeof out.resourceName === 'string';
    }

    function attach(): void {
        if (attached || !hostPresent()) return;
        attached = true;

        for (const call of waiting.splice(0)) call.resolve(send(call.endpoint, call.payload));

        out.componentsLoaded = true;

        reportDebug(
            `${(out.appIdentifier as string) || 'app'}: SDK v${out.componentsVersion} ready in `
            + `"${out.resourceName}", settings=${out.settings ? 'yes' : 'no'}, `
            + `bridge=${out.components ? 'yes' : 'no'}`,
        );

        win.postMessage('componentsLoaded', '*');

        try {
            win.parent.postMessage({ type: 'sdphoneSdkReady' } satisfies PageMessage, '*');
        } catch {
        }

        markReady();
    }

    marks[INSTALLED] = { attach };
    if (out.sdphone === undefined) out.sdphone = { ready, version: VERSION };

    attach();
}
