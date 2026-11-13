export function copyToClipboard(text: string): boolean {
    let ok = false;

    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top      = '0';
        ta.style.left     = '-9999px';
        ta.style.opacity  = '0';
        document.body.appendChild(ta);

        const prevFocus = document.activeElement as HTMLElement | null;
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, text.length);

        ok = document.execCommand('copy');

        document.body.removeChild(ta);
        prevFocus?.focus?.();
    } catch {
        ok = false;
    }

    try { void navigator.clipboard?.writeText(text).catch(() => {}); } catch {}

    return ok;
}
