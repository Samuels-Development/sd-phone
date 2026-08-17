/**
 * Type definitions for the sd-phone custom-app SDK (sdphone-sdk.js).
 *
 * sd-phone injects sdphone-sdk.js into your app's iframe AFTER the page has loaded, so nothing here
 * exists at parse time. Wait for it before calling anything:
 *
 *     function whenReady() {
 *       return new Promise(resolve => {
 *         if (globalThis.componentsLoaded) return resolve();
 *         const poll = setInterval(() => {
 *           if (globalThis.componentsLoaded) { clearInterval(poll); resolve(); }
 *         }, 50);
 *         addEventListener('message', e => {
 *           if (e.data === 'componentsLoaded') { clearInterval(poll); resolve(); }
 *         });
 *       });
 *     }
 *     whenReady().then(startYourApp);
 *
 * Every function is also exposed lower-cased (`SetPopUp` and `setPopUp` are the same function).
 */

declare global {
    interface PhoneSettings {
        display: { theme: 'light' | 'dark'; brightness: number };
        theme: 'light' | 'dark';
        locale: string;
        language: string;
        localeTag: string;
        airplaneMode: boolean;
        streamerMode: boolean;
        doNotDisturb: boolean;
        time: { hour24: boolean };
        volume: { ringtone: number; call: number };
    }

    interface PopUpButton {
        title?: string;
        color?: string;
        /** Invoked when this button is chosen, in addition to the promise resolving with its index. */
        cb?: () => void;
    }

    interface PopUpInput {
        type?: string;
        placeholder?: string;
        value?: string;
        /** Fires on every keystroke while the pop-up is open. */
        onChange?: (value: string) => void;
    }

    interface PopUpData {
        title?: string;
        description?: string;
        input?: PopUpInput;
        buttons: PopUpButton[];
    }

    interface ContextMenuData {
        title?: string;
        description?: string;
        buttons: PopUpButton[];
    }

    /** Identity of the app, injected by the host before sdphone-sdk.js runs. */
    const appName: string;
    const appIdentifier: string;
    const resourceName: string;
    const settings: PhoneSettings;

    /** True once sdphone-sdk.js has finished installing. Poll this; see the header. */
    const componentsLoaded: boolean;
    /** Bumped whenever the SDK surface changes. */
    const componentsVersion: number;
    /** Names that EXIST as functions but are not implemented by the host and resolve null. */
    const componentsUnsupported: readonly string[];
    /**
     * Accurate feature test. Prefer this over `typeof X === 'function'`, which returns true for
     * the stubs listed in componentsUnsupported.
     */
    function componentsSupports(name: string): boolean;

    /** Resolves the index of the chosen button, or undefined if dismissed. */
    function SetPopUp(data: PopUpData): Promise<number | undefined>;
    function SetContextMenu(data: ContextMenuData): Promise<number | undefined>;
    /** Not implemented by the host; always resolves null. Check componentsSupports first. */
    function SetContactModal(number: string): Promise<null>;

    function UseComponent<T = unknown>(cb: ((result: T | null) => void) | null, data: { component: string } & Record<string, unknown>): Promise<T | null>;
    function SelectGallery(data?: { cb?: (url: string | null) => void; multiple?: boolean; type?: string; max?: number }): Promise<string | string[] | null>;
    function SelectGIF(cb?: (url: string | null) => void): Promise<string | null>;
    function SelectEmoji(cb?: (emoji: string | null) => void): Promise<string | null>;
    /** Opens the phone's camera. Resolves the uploaded photo URL, or null if cancelled. */
    function UseCamera(cb?: (url: string | null) => void, data?: Record<string, unknown>): Promise<string | null>;
    function ColorPicker(cb?: (hex: string | null) => void, data?: { value?: string }): Promise<string | null>;
    function ContactSelector(cb?: (contact: unknown) => void, data?: Record<string, unknown>): Promise<unknown>;

    function GetSettings(): Promise<PhoneSettings>;
    function GetLocale(path: string, format?: Record<string, unknown>): Promise<string>;
    /** The acting character's phone number, or null when it cannot be resolved. */
    function GetPhoneNumber(): Promise<string | null>;

    /** Device-local, namespaced per app. Budget: 64 KB and 64 keys. */
    function GetStorage<T = unknown>(key: string, fallback?: T): Promise<T | null>;
    /** Resolves false when the value is unserialisable or the budget is exceeded. */
    function SetStorage(key: string, value: unknown): Promise<boolean>;

    function SendNotification(data: { title?: string; content?: string; thumbnail?: string }): Promise<null>;
    function ShowConfirm(data: string | { title?: string; description?: string; confirmText?: string; cancelText?: string; color?: string }): Promise<boolean>;
    function CreateCall(data: Record<string, unknown>): Promise<null>;
    function OpenMedia(data: string | { src?: string; url?: string }): Promise<null>;
    /** Toggles game-input capture. Text fields are wired automatically; call this only for custom editors. */
    function ToggleInput(state: boolean): Promise<null>;

    function OnSettingsChange(cb: (settings: PhoneSettings) => void): void;
    function RemoveSettingsChangeListener(cb: (settings: PhoneSettings) => void): void;
    /** Fires when the app comes to the foreground. The iframe stays alive while backgrounded. */
    function OnAppOpen(cb: (data: { id: string }) => void): () => void;
    function OnAppClose(cb: (data: { id: string }) => void): () => void;

    /** Calls a NUI callback in YOUR resource. Resolves undefined on any failure. */
    function fetchNui<T = unknown>(event: string, data?: unknown, scriptName?: string): Promise<T | undefined>;
    /** As fetchNui, but rejects instead of swallowing, so failure is distinguishable from no data. */
    function fetchNuiStrict<T = unknown>(event: string, data?: unknown, scriptName?: string): Promise<T>;
    /** Subscribes to a message pushed from Lua via exports['sd-phone']:sendCustomAppMessage. */
    function onNuiEvent<T = unknown>(action: string, cb: (data: T) => void): () => void;
    function useNuiEvent<T = unknown>(action: string, cb: (data: T) => void): () => void;

    function formatPhoneNumber(number: string): string;
}

export {};
