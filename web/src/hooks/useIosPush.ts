import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

export const NavContext = createContext<{ onWillBack: () => void }>({
    onWillBack: () => {},
});

export function useIosPush(onBack: () => void, animateIn = true) {
    const { onWillBack } = useContext(NavContext);
    const [leaving, setLeaving] = useState(false);
    const [enter, setEnter] = useState(animateIn);

    // Play the push-in animation exactly ONCE, then drop it from the style. A CSS
    // animation restarts whenever its element is re-inserted into the DOM, and the app
    // switcher re-parents live app views into its preview cards - so a page left drilled
    // in would visibly replay its slide-in (main page -> swipe -> detail) every time the
    // switcher opened. ios-push ends at translateX(0), the natural resting position, so
    // clearing the animation once it has finished is seamless (no jump).
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

    // True while the page is sliding; backdrop-filter children don't composite under a
    // transform-animated ancestor in CEF, so frosted bars should render solid until this clears.
    const animating = enter || leaving;

    return { goBack, pageStyle, animating };
}
