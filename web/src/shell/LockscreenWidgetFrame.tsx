import { useEffect, useMemo, useRef, useState } from 'react';

import { fetchNui } from '@/core/nui';
import type { ActiveLockscreenWidget } from '@/core/types';
import { useCustomApps } from '@/stores/customAppsStore';
import { resolveCustomUi, withQuery } from './widgets/customUrl';

export function LockscreenWidgetFrame({ item }: { item: ActiveLockscreenWidget }) {
    const apps = useCustomApps();
    const frame = useRef<HTMLIFrameElement>(null);
    const [ready, setReady] = useState(false);
    const definition = useMemo(() => {
        const app = apps.find(value => value.id === item.appId);
        const widget = app?.lockscreenWidgets?.find(value => value.id === item.widgetId);
        return app && widget ? { app, widget } : null;
    }, [apps, item.appId, item.widgetId]);
    const src = useMemo(() => definition ? withQuery(resolveCustomUi(definition.widget.ui), {
        app: item.appId, widget: item.widgetId, surface: 'lockscreen',
    }) : '', [definition, item.appId, item.widgetId]);

    useEffect(() => { setReady(false); }, [src]);
    useEffect(() => {
        if (!ready) return;
        frame.current?.contentWindow?.postMessage({
            type: 'sd-phone:lockscreen-widget', key: item.key, data: item.payload,
        }, '*');
    }, [ready, item]);
    useEffect(() => {
        function onMessage(event: MessageEvent) {
            if (event.source !== frame.current?.contentWindow) return;
            const data = event.data as { type?: string; action?: string; value?: number; data?: unknown } | null;
            if (data?.type !== 'sd-phone:lockscreenWidget:action') return;
            void fetchNui('sd-phone:lockscreenWidget:action', {
                key: item.key, action: data.action, value: data.value, data: data.data,
            });
        }
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [item.key]);

    if (!definition || !src) return null;
    return <div className="relative w-full overflow-hidden rounded-[22px]" style={{ height: definition.widget.height }}>
        <iframe ref={frame} src={src} title={definition.widget.name} sandbox="allow-scripts allow-same-origin"
            onLoad={() => setReady(true)} className="absolute inset-0 h-full w-full border-0"
            style={{ pointerEvents: definition.widget.interactive === false ? 'none' : 'auto', opacity: ready ? 1 : 0 }} />
    </div>;
}
