import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Lock, WifiOff } from 'lucide-react';

import { t } from '@/i18n';
import { apiCall, apiData } from '@/core/api';
import { isFiveM } from '@/core/nui';
import type { WifiNetwork, WifiState } from '@/core/types';
import { useWifiConnected, useWifiNetworks, useWifiStore } from '@/stores/wifiStore';
import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { ListGroup, ListRow, ToggleRow } from '@/ui/ListGroup';
import { PromptDialog } from '@/ui/PromptDialog';
import { SubPage } from '../SettingsSubPage';

// The three arcs of the status bar's Wi-Fi glyph, innermost first, so a network's bars can fill
// them the way the cellular icon fills its bars.
const ARC_PATHS = [
    'M346.65 304.3a136 136 0 00-180.71 0 21 21 0 1027.91 31.38 94 94 0 01124.89 0 21 21 0 0027.91-31.4z',
    'M256.28 183.7a221.47 221.47 0 00-151.8 59.92 21 21 0 1028.68 30.67 180.28 180.28 0 01246.24 0 21 21 0 1028.68-30.67 221.47 221.47 0 00-151.8-59.92z',
    'M462 175.86a309 309 0 00-411.44 0 21 21 0 1028 31.29 267 267 0 01355.43 0 21 21 0 0028-31.31z',
];

/** Opacity of an arc the signal does not reach. Dimmed rather than hidden, as iOS draws it. */
const DIM = 0.28;

/** Networks the dev server has no Lua to scan for; in-game the store carries the real ones. */
const DEV_STATE: WifiState = {
    enabled: true,
    connected: null,
    providesData: true,
    networks: [
        { id: 'legion',    ssid: 'Legion Square Free',   secured: false, strength: 0.86, bars: 3 },
        { id: 'mazebank',  ssid: 'MazeBank-Corporate',   secured: true,  strength: 0.52, bars: 2 },
        { id: 'unicorn',   ssid: 'Unicorn-VIP',          secured: true,  strength: 0.19, bars: 1 },
    ],
};

/** The status bar's Wi-Fi glyph at list size, its arcs filled to `bars` and the rest dimmed. */
function WifiGlyph({ bars, size = 20 }: { bars: number; size?: number }) {
    const level = Number.isFinite(bars) ? Math.max(0, Math.min(ARC_PATHS.length, Math.round(bars))) : 0;
    return (
        <svg width={size} height={size} viewBox="0 0 512 512" fill="currentColor" aria-hidden className="text-black dark:text-white">
            {ARC_PATHS.map((d, i) => <path key={d} d={d} opacity={i < level ? 1 : DIM} />)}
            <circle cx="256.28" cy="393.41" r="32" />
        </svg>
    );
}

/** Trailing side of a network row: a padlock while it is secured, then its strength. */
function NetworkMeta({ net, busy = false }: { net: WifiNetwork; busy?: boolean }) {
    return (
        <span className="flex items-center gap-2">
            {busy ? (
                <Loader2 className="h-[16px] w-[16px] animate-spin text-ios-gray" strokeWidth={2.4} />
            ) : net.secured ? (
                <Lock className="h-[15px] w-[15px] text-black/80 dark:text-white/80" strokeWidth={2.4} />
            ) : null}
            <WifiGlyph bars={net.bars} />
        </span>
    );
}

/** Settings -> Wi-Fi: the network this phone is on, and everything else within reach of it. */
export function WifiPage({ onBack }: { onBack: () => void }) {
    const storeEnabled   = useWifiStore(s => s.enabled);
    const storeData      = useWifiStore(s => s.providesData);
    const storeConnected = useWifiConnected();
    const storeNetworks  = useWifiNetworks();

    const [dev,     setDev]     = useState<WifiState>(DEV_STATE);
    const [loaded,  setLoaded]  = useState(!isFiveM);
    const [busyId,  setBusyId]  = useState<string | null>(null);
    const [asking,  setAsking]  = useState<WifiNetwork | null>(null);
    const [forget,  setForget]  = useState<WifiNetwork | null>(null);
    const [notice,  setNotice]  = useState<string | null>(null);

    const enabled   = isFiveM ? storeEnabled   : dev.enabled;
    const connected = isFiveM ? storeConnected : dev.connected;
    const inRange   = isFiveM ? storeNetworks  : dev.networks;
    const carrying  = isFiveM ? storeData      : dev.providesData;

    // The scan carries the live reading for the joined network, so prefer it over the snapshot the
    // connection was made from: bars move as the player walks, and the padlock only appears here.
    const joined = connected ? inRange.find(n => n.id === connected.id) ?? connected : null;
    const others = inRange.filter(n => n.id !== connected?.id);

    // The store is push-fed while the phone is on screen; this seeds it for the first paint.
    const refresh = useCallback(async () => {
        if (!isFiveM) return;
        const data = await apiData<WifiState>('sd-phone:wifi:list');
        if (data) useWifiStore.getState().apply(data);
        setLoaded(true);
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    /** The Wi-Fi switch. Turning it off drops whatever is joined, which the client handles. */
    const setRadio = useCallback(async (on: boolean) => {
        if (!isFiveM) { setDev(s => ({ ...s, enabled: on, connected: on ? s.connected : null })); return; }
        await apiCall<void>('sd-phone:wifi:setEnabled', { on });
        await refresh();
    }, [refresh]);

    /** Returns the failure message, or null once the phone is on the network. */
    const join = useCallback(async (net: WifiNetwork, password?: string): Promise<string | null> => {
        if (!isFiveM) { setDev(s => ({ ...s, connected: net })); return null; }
        setBusyId(net.id);
        const res = await apiCall<void>('sd-phone:wifi:connect', { id: net.id, password: password ?? '' });
        setBusyId(null);
        if (!res.success) return res.message ?? t('settings.wifiJoinFailed', 'Could not join that network.');
        await refresh();
        return null;
    }, [refresh]);

    function press(net: WifiNetwork) {
        if (busyId) return;
        if (net.secured) { setAsking(net); return; }
        void join(net).then(err => { if (err) setNotice(err); });
    }

    async function disconnect() {
        if (busyId || !joined) return;
        if (!isFiveM) { setDev(s => ({ ...s, connected: null })); return; }
        setBusyId(joined.id);
        await apiCall<void>('sd-phone:wifi:disconnect');
        setBusyId(null);
        await refresh();
    }

    async function forgetNetwork(net: WifiNetwork) {
        if (busyId) return;
        if (!isFiveM) { setDev(s => ({ ...s, connected: null })); return; }
        setBusyId(net.id);
        await apiCall<void>('sd-phone:wifi:forget', { id: net.id });
        setBusyId(null);
        await refresh();
    }

    return (
        <>
            <SubPage
                title={t('settings.wifi', 'Wi-Fi')}
                backLabel={t('settings.settings', 'Settings')}
                onBack={onBack}
            >
                <ListGroup footer={enabled
                    ? t('settings.wifiFooter', 'Wi-Fi carries data where the towers will not. Your phone stays on a network for as long as you are inside its range.')
                    : undefined}>
                    <ToggleRow
                        label={t('settings.wifi', 'Wi-Fi')}
                        on={enabled}
                        onToggle={() => void setRadio(!enabled)}
                    />
                </ListGroup>

                {enabled && joined && (
                    <ListGroup
                        header={t('settings.wifiMyNetwork', 'My Network')}
                        footer={t('settings.wifiMyNetworkFooter', 'Forgetting a network stops this phone rejoining it on its own, and asks for the password the next time.')}
                    >
                        <ListRow
                            label={joined.ssid}
                            sub={carrying ? undefined : t('settings.wifiNoData', 'No Internet Connection')}
                            left={<Check className="h-[17px] w-[17px] text-ios-blue" strokeWidth={2.8} />}
                            right={<NetworkMeta net={joined} busy={busyId === joined.id} />}
                            chevron={false}
                            divider
                        />
                        <ListRow
                            label={t('settings.wifiDisconnect', 'Disconnect')}
                            chevron={false}
                            onPress={() => { void disconnect(); }}
                            divider
                        />
                        <ListRow
                            label={t('settings.wifiForget', 'Forget This Network')}
                            chevron={false}
                            destructive
                            onPress={() => setForget(joined)}
                        />
                    </ListGroup>
                )}

                {enabled && others.length > 0 && (
                    <ListGroup
                        header={joined
                            ? t('settings.wifiOtherNetworks', 'Other Networks')
                            : t('settings.wifiNetworks', 'Networks')}
                        footer={t('settings.wifiNetworksFooter', 'Networks come and go as you move. A padlock means the network asks for a password.')}
                    >
                        {others.map((net, i) => (
                            <ListRow
                                key={net.id}
                                label={net.ssid}
                                right={<NetworkMeta net={net} busy={busyId === net.id} />}
                                chevron={false}
                                onPress={() => press(net)}
                                divider={i < others.length - 1}
                            />
                        ))}
                    </ListGroup>
                )}

                {enabled && !loaded && (
                    <div className="flex items-center justify-center gap-2 pt-4 text-[15px] text-ios-gray">
                        <Loader2 className="h-[16px] w-[16px] animate-spin" strokeWidth={2.4} />
                        {t('settings.wifiSearching', 'Searching for networks')}
                    </div>
                )}

                {enabled && loaded && !joined && others.length === 0 && (
                    <EmptyState
                        icon={<WifiGlyph bars={0} size={34} />}
                        title={t('settings.wifiNoneTitle', 'No networks found')}
                        subtitle={t('settings.wifiNoneSub', 'Wi-Fi only reaches a short distance. Move closer to a building or business that runs a network of its own.')}
                    />
                )}

                {!enabled && (
                    <EmptyState
                        icon={WifiOff}
                        title={t('settings.wifiOffTitle', 'Wi-Fi is off')}
                        subtitle={t('settings.wifiOffSub', 'Nothing nearby can be joined while Wi-Fi is off. This phone stays on the cellular network.')}
                    />
                )}
            </SubPage>

            {asking && (
                <PromptDialog
                    title={asking.ssid}
                    message={t('settings.wifiPasswordMsg', 'This network is secured. Enter its password to join.')}
                    placeholder={t('settings.wifiPassword', 'Password')}
                    maxLength={64}
                    secure
                    confirmLabel={t('settings.wifiJoin', 'Join')}
                    onCancel={() => setAsking(null)}
                    onConfirm={async value => {
                        const err = await join(asking, value);
                        if (err) setNotice(err);
                    }}
                />
            )}

            {forget && (
                <AlertDialog
                    title={t('settings.wifiForgetTitle', 'Forget {ssid}?', { ssid: forget.ssid })}
                    message={t('settings.wifiForgetMessage', 'This phone leaves the network and stops rejoining it by itself. You will need the password again.')}
                    confirmLabel={t('settings.wifiForgetConfirm', 'Forget')}
                    destructive
                    onCancel={() => setForget(null)}
                    onConfirm={() => { const net = forget; setForget(null); void forgetNetwork(net); }}
                />
            )}

            {notice && (
                <AlertDialog
                    title={t('settings.wifi', 'Wi-Fi')}
                    message={notice}
                    confirmLabel={t('common.ok', 'OK')}
                    hideCancel
                    onCancel={() => setNotice(null)}
                    onConfirm={() => setNotice(null)}
                />
            )}
        </>
    );
}
