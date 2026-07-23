import { useEffect, useRef } from 'react';

import { useKeyboardCapture } from '@/hooks/useKeyboardCapture';
import { useDeckActive } from '@/shell/deckActive';

/**
 * Physical keyboard support for on-screen digit pads: number keys, optional extras
 * (`.` / `*` / `#`), and Backspace/Delete. Also claims the keyboard from game binds
 * while enabled (same path as Wordle), since keep-input would otherwise let 1–9 fire
 * weapon-slot / inventory mappings.
 *
 * Deck-gated like useKeyboardCapture: the keep-alive deck keeps keypad screens MOUNTED
 * while backgrounded/holstered, so listening on mount alone kept playing keypad tones
 * after the app was switched away or the phone closed. Outside the deck (lockscreen,
 * payphone) the deck flag defaults to true and mount-lifetime listening stands.
 */
export function useKeypadInput({
    onPress,
    onDelete,
    canDelete = true,
    enabled = true,
    extraKeys = [],
    capture = true,
}: {
    onPress:     (key: string) => void;
    onDelete?:   () => void;
    canDelete?:  boolean;
    enabled?:    boolean;
    extraKeys?:  string[];
    capture?:    boolean;
}): void {
    const deckActive = useDeckActive();
    const listening = enabled && deckActive;
    // Numeric tier: the player keeps moving while a digit pad is up (a PIN entry must not
    // freeze WASD); the client disables the GTA digit weapon binds per frame instead.
    useKeyboardCapture(capture && listening, true);

    const onPressRef   = useRef(onPress);
    const onDeleteRef  = useRef(onDelete);
    const canDeleteRef = useRef(canDelete);
    const extrasRef    = useRef(extraKeys);
    onPressRef.current   = onPress;
    onDeleteRef.current  = onDelete;
    canDeleteRef.current = canDelete;
    extrasRef.current    = extraKeys;

    useEffect(() => {
        if (!listening) return;

        function onKey(e: KeyboardEvent) {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const tgt = e.target as HTMLElement | null;
            if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) {
                return;
            }

            if (e.key === 'Backspace' || e.key === 'Delete') {
                if (!onDeleteRef.current || !canDeleteRef.current) return;
                e.preventDefault();
                onDeleteRef.current();
                return;
            }

            if (/^[0-9]$/.test(e.key)) {
                e.preventDefault();
                onPressRef.current(e.key);
                return;
            }

            if (extrasRef.current.includes(e.key)) {
                e.preventDefault();
                onPressRef.current(e.key);
            }
        }

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [listening]);
}
