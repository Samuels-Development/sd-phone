import { apiData } from '@/core/api';
import { isFiveM } from '@/core/nui';
import { useAsyncData } from '@/hooks/useAsyncData';

export interface VersionInfo {
    current?:         string;
    latest?:          string;
    updateAvailable?: boolean;
}

const DEV_INFO: VersionInfo = { current: '0.9.2', latest: '0.9.3', updateAvailable: true };

export function useVersionInfo(): VersionInfo | null {
    const { data, settled } = useAsyncData(
        () => apiData<VersionInfo>('sd-phone:settings:versionInfo'),
        [],
        { enabled: isFiveM },
    );
    if (!isFiveM) return DEV_INFO;
    return data ?? (settled ? {} : null);
}
