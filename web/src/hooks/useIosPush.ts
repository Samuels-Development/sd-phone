import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

export const NavContext = createContext<{ onWillBack: () => void }>({
    onWillBack: () => {},
});

export const NOOP_NAV = { onWillBack: () => {} };

export const QuietEntryContext = createContext(0);

const QUIET_ENTRY_MS = 600;

export function useIosPush(onBack: () => void, animateIn = true) {
    const { onWillBack } = useContext(NavContext);
    const quietSince = useContext(QuietEntryContext);
    const [leaving, setLeaving] = useState(false);
    const [enter, setEnter] = useState(() => animateIn && Date.now() - quietSince > QUIET_ENTRY_MS);

    useEffect(() => {
        if (!enter) return;
        const t = window.setTimeout(() => setEnter(false), 360);
        return () => window.clearTimeout(t);
    }, [enter]);

    const goBack = useCallback(() => {
        if (leaving) return;
        setLeaving(true);
        onWillBack();
        setTimeout(onBack, 280);
    }, [leaving, onBack, onWillBack]);

    const pageStyle: CSSProperties = {
        animation: leaving
            ? 'ios-pop  0.28s cubic-bezier(0.32,0.72,0,1) forwards'
            : enter ? 'ios-push 0.34s cubic-bezier(0.32,0.72,0,1) forwards' : undefined,
    };

    const animating = enter || leaving;

    return { goBack, pageStyle, animating };
}
