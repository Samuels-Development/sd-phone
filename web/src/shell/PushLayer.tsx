import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { NavContext } from '@/hooks/useIosPush';

interface PushLayerProps {
    pageStyle?:      CSSProperties;
    className?:      string;
    innerClassName?: string;
    bg?:             string;
    sub?:            ReactNode;
    children:        ReactNode;
}

export function PushLayer({
    pageStyle,
    className = '',
    innerClassName = '',
    bg = 'bg-base',
    sub,
    children,
}: PushLayerProps) {
    const [returning, setReturning] = useState(false);
    const navValue = useMemo(() => ({ onWillBack: () => setReturning(true) }), []);
    const hasSub = sub !== null && sub !== undefined && sub !== false;

    useEffect(() => {
        if (!hasSub) setReturning(false);
    }, [hasSub]);

    const behind = hasSub && !returning;
    const layerStyle: CSSProperties = {
        transform:  behind ? 'translateX(-28%)' : 'translateX(0)',
        transition: `transform ${behind ? '0.34s' : '0.28s'} cubic-bezier(0.32,0.72,0,1)`,
    };
    const dimStyle: CSSProperties = {
        opacity:    behind ? 0.14 : 0,
        transition: `opacity ${behind ? '0.34s' : '0.28s'} cubic-bezier(0.32,0.72,0,1)`,
    };

    return (
        <div className={`absolute inset-0 overflow-hidden ${bg} ${className}`} style={pageStyle}>
            <div className={`absolute inset-0 flex flex-col ${bg} ${innerClassName}`} style={layerStyle}>
                {children}
                <div className="pointer-events-none absolute inset-0 bg-black" style={dimStyle} />
            </div>
            <NavContext.Provider value={navValue}>
                {sub}
            </NavContext.Provider>
        </div>
    );
}
