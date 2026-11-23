import { useMemo } from 'react';

import { device } from '@device';
import { useBluetoothConfigured } from '@/stores/bluetoothStore';
import { useSimStore } from '@/stores/simStore';
import { useWifiConfigured } from '@/stores/wifiStore';
import type { SettingsVisibility } from './data';

export function useSettingsVisibility(): SettingsVisibility {
    const sim       = useSimStore(s => s.enabled);
    const wifi      = useWifiConfigured();
    const bluetooth = useBluetoothConfigured();
    return useMemo(() => ({
        sim,
        calls:  device.calls,
        island: Boolean(device.screen.island),
        wifi,
        bluetooth,
        phoneCase: device.id === 'phone',
    }), [sim, wifi, bluetooth]);
}
