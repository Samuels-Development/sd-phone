import { isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';

import { NavBar } from '@/ui/NavBar';
import { SlideOver } from '@/ui/SlideOver';
import { t } from '@/i18n';
import { ruleY, surfaceBackdrop } from './surfaces';

const DETAIL_MIN = 420;

export interface MasterDetailProps {
    master:         ReactNode;
    detail?:        ReactNode;
    placeholder?:   ReactNode;
    hasDetail?:     boolean;
    masterWidth?:   number;
    onCloseDetail?: () => void;
    onBack?:        () => void;
    backLabel?:     string;
    detailTitle?:   string;
    detailRight?:   ReactNode;
    className?:     string;
}

export function MasterDetail(props: MasterDetailProps) {
    const {
        master, detail, placeholder, hasDetail, masterWidth = 372, onCloseDetail, onBack,
        backLabel, detailTitle, detailRight, className = '',
    } = props;

    const hostRef = useRef<HTMLDivElement>(null);
    const [narrow, setNarrow] = useState(false);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const measure = () => setNarrow(host.clientWidth < masterWidth + DETAIL_MIN);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(host);
        return () => ro.disconnect();
    }, [masterWidth]);

    const open = hasDetail ?? ('onBack' in props ? !!onBack : detail != null);
    const close = onCloseDetail ?? onBack;

    const detailKey = isValidElement(detail) && detail.key != null
        ? `d:${detail.key}`
        : detail != null ? 'detail' : 'placeholder';

    if (narrow) {
        return (
            <div ref={hostRef} className={`relative flex min-h-0 min-w-0 flex-1 ${className}`}>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">{master}</div>
                {open && detail && (
                    <SlideOver onClose={() => close?.()} direction="x" className={surfaceBackdrop}>
                        {dismiss => (
                            <div className="flex h-full min-h-0 flex-col">
                                <NavBar
                                    backLabel={backLabel ?? t('common.back', 'Back')}
                                    onBack={() => dismiss()}
                                    title={detailTitle}
                                    right={detailRight}
                                />
                                <div className="flex min-h-0 flex-1 flex-col">{detail}</div>
                            </div>
                        )}
                    </SlideOver>
                )}
            </div>
        );
    }

    return (
        <div ref={hostRef} className={`flex min-h-0 min-w-0 flex-1 ${className}`}>
            <div className="flex min-h-0 shrink-0 flex-col" style={{ width: masterWidth }}>
                {master}
            </div>
            <div className={ruleY} />
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                <div key={detailKey} className="flex min-h-0 flex-1 flex-col animate-mdt-detail">
                    {detail ?? placeholder}
                </div>
            </div>
        </div>
    );
}
