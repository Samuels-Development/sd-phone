import { useMemo } from 'react';
import type { ReactNode } from 'react';

import type { WidgetAlign, WidgetSize, WidgetTheme } from '@/apps/appstore/appsApi';
import type { CustomAppDef, CustomWidgetDef } from '@/core/types';
import { t } from '@/i18n';
import { useCustomApps } from '@/stores/customAppsStore';
import { CustomWidgetFrame, customWidgetKind, parseCustomWidgetKind } from './CustomWidgetFrame';
import { ActivityWidget } from './ActivityWidget';
import { ClockWidget } from './ClockWidget';
import { ContactsWidget } from './ContactsWidget';
import { GarageWidget } from './GarageWidget';
import { NewsWidget } from './NewsWidget';
import { NowPlayingWidget } from './NowPlayingWidget';
import { StocksWidget } from './StocksWidget';
import { TimersWidget } from './TimersWidget';
import { WalletWidget } from './WalletWidget';
import { WeatherWidget } from './WeatherWidget';

interface WidgetRender {
    size:   WidgetSize;
    width:  number;
    height: number;
    align:  WidgetAlign;
    theme:  WidgetTheme;
    picks?: string[];
    onPicks?: (ids: string[]) => void;
}

export interface WidgetDef {
    kind:   string;
    label:  () => string;
    sizes:  WidgetSize[];
    appId:  string;
    aligns?: WidgetSize[];
    picker?: 'contacts';
    themes?: boolean;
    render: (o: WidgetRender) => ReactNode;
}

const WIDGETS: WidgetDef[] = [
    {
        kind: 'weather',
        label: () => t('widgets.weather', 'Weather'),
        sizes: ['sm', 'md', 'lg'],
        appId: 'weather',
        aligns: ['sm', 'md', 'lg'],
        render: o => <WeatherWidget size={o.size} width={o.width} height={o.height} align={o.align} />,
    },
    {
        kind: 'clock',
        label: () => t('widgets.clock', 'Clock'),
        sizes: ['sm', 'md', 'lg'],
        appId: 'clock',
        aligns: ['md', 'lg'],
        themes: true,
        render: o => <ClockWidget size={o.size} width={o.width} height={o.height} align={o.align} theme={o.theme} />,
    },
    {
        kind: 'clockdigital',
        label: () => t('widgets.clockDigital', 'Clock (Digital)'),
        sizes: ['sm', 'md', 'lg'],
        appId: 'clock',
        aligns: ['sm', 'md', 'lg'],
        themes: true,
        render: o => <ClockWidget size={o.size} width={o.width} height={o.height} align={o.align} theme={o.theme} digital />,
    },
    {
        kind: 'nowplaying',
        label: () => t('widgets.nowPlaying', 'Now Playing'),
        sizes: ['sm', 'md', 'lg'],
        appId: 'music',
        render: o => <NowPlayingWidget size={o.size} width={o.width} height={o.height} />,
    },
    {
        kind: 'wallet',
        label: () => t('widgets.wallet', 'Wallet'),
        sizes: ['sm', 'md', 'lg'],
        appId: 'bank',
        themes: true,
        render: o => <WalletWidget size={o.size} width={o.width} height={o.height} theme={o.theme} />,
    },
    {
        kind: 'activity',
        label: () => t('widgets.activity', 'Activity'),
        sizes: ['sm', 'md', 'lg'],
        appId: 'health',
        themes: true,
        render: o => <ActivityWidget size={o.size} width={o.width} height={o.height} theme={o.theme} />,
    },
    {
        kind: 'contacts',
        label: () => t('widgets.contacts', 'Contacts'),
        sizes: ['sm', 'md', 'lg'],
        appId: 'phone',
        themes: true,
        picker: 'contacts',
        render: o => <ContactsWidget size={o.size} width={o.width} height={o.height} theme={o.theme} picks={o.picks} onPicks={o.onPicks} />,
    },
    {
        kind: 'garage',
        label: () => t('widgets.garage', 'Garage'),
        sizes: ['sm', 'md', 'lg'],
        appId: 'garages',
        themes: true,
        render: o => <GarageWidget size={o.size} width={o.width} height={o.height} theme={o.theme} />,
    },
    {
        kind: 'stocks',
        label: () => t('widgets.stocks', 'Stocks'),
        sizes: ['sm', 'md', 'lg'],
        appId: 'stocks',
        themes: true,
        render: o => <StocksWidget size={o.size} width={o.width} height={o.height} theme={o.theme} />,
    },
    {
        kind: 'news',
        label: () => t('widgets.news', 'Weazel News'),
        sizes: ['sm', 'md', 'lg'],
        appId: 'weazelnews',
        themes: true,
        render: o => <NewsWidget size={o.size} width={o.width} height={o.height} theme={o.theme} />,
    },
    {
        kind: 'timers',
        label: () => t('widgets.timers', 'Timers & Alarms'),
        sizes: ['sm', 'md', 'lg'],
        appId: 'clock',
        themes: true,
        render: o => <TimersWidget size={o.size} width={o.width} height={o.height} theme={o.theme} />,
    },
];

function thirdPartyDef(app: CustomAppDef, widget: CustomWidgetDef): WidgetDef {
    const kind = customWidgetKind(app.id, widget.id);
    return {
        kind,
        label:  () => widget.name,
        sizes:  widget.sizes,
        appId:  app.id,
        render: o => <CustomWidgetFrame kind={kind} size={o.size} width={o.width} height={o.height} />,
    };
}

export function useWidgetCatalog(): WidgetDef[] {
    const apps = useCustomApps();
    return useMemo(() => {
        const extra: WidgetDef[] = [];
        for (const app of apps) {
            for (const widget of app.widgets ?? []) extra.push(thirdPartyDef(app, widget));
        }
        return extra.length ? [...WIDGETS, ...extra] : WIDGETS;
    }, [apps]);
}

const framed = new Map<string, WidgetDef>();

function framedDef(kind: string, appId: string): WidgetDef {
    const cached = framed.get(kind);
    if (cached) return cached;
    const def: WidgetDef = {
        kind,
        label:  () => t('widgets.thirdParty', 'Widget'),
        sizes:  ['sm', 'md', 'lg'],
        appId,
        render: o => <CustomWidgetFrame kind={kind} size={o.size} width={o.width} height={o.height} />,
    };
    framed.set(kind, def);
    return def;
}

export function widgetByKind(kind: string): WidgetDef | undefined {
    const builtIn = WIDGETS.find(w => w.kind === kind);
    if (builtIn) return builtIn;
    const parsed = parseCustomWidgetKind(kind);
    return parsed ? framedDef(kind, parsed.appId) : undefined;
}
