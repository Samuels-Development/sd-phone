import { useEffect, useMemo, useRef, useState } from 'react';

import type { WidgetSize } from '@/apps/appstore/appsApi';
import type { CustomAppDef, CustomWidgetDef } from '@/core/types';
import { t } from '@/i18n';
import { useCustomApps } from '@/stores/customAppsStore';
import { useTheme } from '@/stores/themeStore';
import { resolveCustomUi, withQuery } from './customUrl';
import { WidgetTile, palette } from './WidgetTile';

const PREFIX = 'custom:';

const SANDBOX = 'allow-scripts allow-same-origin';

export function customWidgetKind(appId: string, widgetId: string): string {
    return `${PREFIX}${appId}:${widgetId}`;
}

export function parseCustomWidgetKind(kind: string): { appId: string; widgetId: string } | null {
    if (!kind.startsWith(PREFIX)) return null;
    const rest = kind.slice(PREFIX.length);
    const cut = rest.lastIndexOf(':');
    if (cut <= 0 || cut === rest.length - 1) return null;
    return { appId: rest.slice(0, cut), widgetId: rest.slice(cut + 1) };
}

function findWidget(apps: CustomAppDef[], kind: string): { app: CustomAppDef; widget: CustomWidgetDef } | null {
    const parsed = parseCustomWidgetKind(kind);
    if (!parsed) return null;
    const app = apps.find(a => a.id === parsed.appId);
    const widget = app?.widgets?.find(w => w.id === parsed.widgetId);
    return app && widget ? { app, widget } : null;
}

function prettyId(kind: string): string {
    const id = parseCustomWidgetKind(kind)?.widgetId ?? '';
    const words = id.replace(/[_-]+/g, ' ').trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

export function CustomWidgetFrame({ kind, size, width, height }: {
    kind:   string;
    size:   WidgetSize;
    width:  number;
    height: number;
}) {
    const apps = useCustomApps();
    const { theme } = useTheme('theme');
    const found = useMemo(() => findWidget(apps, kind), [apps, kind]);

    const frameRef = useRef<HTMLIFrameElement>(null);
    const [ready, setReady] = useState(false);

    const src = useMemo(() => {
        if (!found) return '';
        return withQuery(resolveCustomUi(found.widget.ui), {
            app:    found.app.id,
            widget: found.widget.id,
            size,
            width,
            height,
        });
    }, [found, size, width, height]);

    useEffect(() => { setReady(false); }, [src]);

    useEffect(() => {
        if (!ready || !found) return;
        frameRef.current?.contentWindow?.postMessage({
            type:   'sd-phone:widget',
            app:    found.app.id,
            widget: found.widget.id,
            size, width, height, theme,
        }, '*');
    }, [ready, found, size, width, height, theme]);

    const radius = size === 'sm' ? 22 : 26;
    const p = palette('dark');

    if (!found || !src) {
        const label = prettyId(kind);
        return (
            <WidgetTile width={width} height={height} radius={radius} tint={p.bg} hairline={false}>
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center">
                    <span className="text-[13px] font-semibold leading-tight" style={{ color: p.body }}>
                        {label || t('widgets.thirdParty', 'Widget')}
                    </span>
                    <span className="text-[11px] leading-tight" style={{ color: p.faint }}>
                        {t('widgets.unavailable', 'Not available')}
                    </span>
                </div>
            </WidgetTile>
        );
    }

    return (
        <WidgetTile width={width} height={height} radius={radius} tint={p.bg} hairline={false}>
            <iframe
                ref={frameRef}
                src={src}
                title={found.widget.name}
                sandbox={SANDBOX}
                referrerPolicy="no-referrer"
                onLoad={() => setReady(true)}
                className="pointer-events-none absolute inset-0 border-0 transition-opacity duration-200"
                style={{
                    width,
                    height,
                    colorScheme: theme === 'dark' ? 'dark' : 'light',
                    opacity: ready ? 1 : 0,
                }}
            />
        </WidgetTile>
    );
}
