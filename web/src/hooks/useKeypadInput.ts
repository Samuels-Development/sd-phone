import { useEffect, useRef } from 'react';

import { useKeyboardCapture } from '@/hooks/useKeyboardCapture';
import { useDeckActive } from '@/shell/deckActive';

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
