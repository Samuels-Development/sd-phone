const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

export function isEmailish(s: string): boolean {
    return EMAIL_RE.test(s);
}

// Recipients are separated by commas/semicolons/whitespace (mirrors Compose's split).
function fragmentStart(to: string): number {
    for (let i = to.length - 1; i >= 0; i--) {
        if (/[,;\s]/.test(to[i])) return i + 1;
    }
    return 0;
}

export function suggestEmails(to: string, saved: string[], limit = 3): string[] {
    const frag = to.slice(fragmentStart(to)).toLowerCase();
    if (frag.length < 2) return [];
    return saved
        .filter(e => e.toLowerCase().startsWith(frag) && e.toLowerCase() !== frag)
        .slice(0, limit);
}

export function applySuggestion(to: string, email: string): string {
    return to.slice(0, fragmentStart(to)) + email;
}
