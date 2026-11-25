import { isHostMessage } from '@/core/messageSource';
import { fetchNui } from '@/core/nui';

/**
 * Keyboard and mouse capture for the prop screen (configs/phone.lua PropScreen), where the phone's
 * UI is drawn on the phone in the player's hand by a second, windowless copy of this page. That
 * copy cannot be typed into, so while a text field on it is being edited the game gives this frame
 * the keyboard and mouse, and this module passes every key, paste and pointer move on to the game
 * (client/propscreen.lua), which hands them to the copy on the prop. The frame shows nothing while
 * it does: the layer is see-through and hides the system cursor, as the game draws its own pointer.
 */

type Input =
    | { t: 'key'; key: string; ctrl: boolean; shift: boolean }
    | { t: 'paste'; text: string }
    | { t: 'move'; x: number; y: number }
    | { t: 'down' | 'up'; x: number; y: number; button: number }
    | { t: 'wheel'; delta: number };

const send = (input: Input): void => { void fetchNui('sd-phone:propscreen:input', input); };

let layer: HTMLTextAreaElement | null = null;
let pending: { x: number; y: number } | null = null;
let frame = 0;

function at(event: MouseEvent): { x: number; y: number } {
    return { x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight };
}

function flushMove(): void {
    frame = 0;
    if (!pending) return;
    send({ t: 'move', ...pending });
    pending = null;
}

function start(): void {
    if (layer) return;
    const el = document.createElement('textarea');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;margin:0;padding:0;border:0;outline:0;'
        + 'resize:none;opacity:0;cursor:none;z-index:2147483647;background:transparent;color:transparent;';
    el.addEventListener('keydown', event => {
        const paste = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v';
        if (paste) return;
        event.preventDefault();
        send({ t: 'key', key: event.key, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey });
    });
    el.addEventListener('paste', event => {
        event.preventDefault();
        const text = event.clipboardData?.getData('text') ?? '';
        if (text) send({ t: 'paste', text });
    });
    el.addEventListener('mousemove', event => {
        pending = at(event);
        if (!frame) frame = requestAnimationFrame(flushMove);
    });
    el.addEventListener('mousedown', event => {
        event.preventDefault();
        flushMove();
        send({ t: 'down', ...at(event), button: event.button });
    });
    el.addEventListener('mouseup', event => {
        send({ t: 'up', ...at(event), button: event.button });
        el.focus();
    });
    el.addEventListener('wheel', event => { send({ t: 'wheel', delta: event.deltaY }); }, { passive: true });
    el.addEventListener('contextmenu', event => event.preventDefault());
    el.addEventListener('blur', () => { if (layer === el) setTimeout(() => el.focus(), 0); });
    document.body.appendChild(el);
    layer = el;
    el.focus();
}

function stop(): void {
    const el = layer;
    layer = null;
    pending = null;
    if (el) el.remove();
}

/** Listens for the game turning capture on and off. Call once at boot. */
export function installPropScreenCapture(): void {
    window.addEventListener('message', (event: MessageEvent) => {
        if (!isHostMessage(event)) return;
        const msg = event.data as { action?: string; on?: boolean } | undefined;
        if (msg?.action !== 'sd-phone:propscreen:capture') return;
        if (msg.on) start(); else stop();
    });
}
