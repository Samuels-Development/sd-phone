import { useEffect, useState } from 'react';

import { apiData } from '@/core/api';
import { isFiveM } from '@/core/nui';

export interface VersionInfo {
    current?:         string;
    latest?:          string;
    updateAvailable?: boolean;
}

// Dev preview: in-game the server compares the fxmanifest version against the latest
// GitHub release; the mock shows the update-available state so it stays visible in dev.
const DEV_INFO: VersionInfo = { current: '0.9.2', latest: '0.9.3', updateAvailable: true };

/** Installed + latest phone version. Null while the in-game lookup is in flight; an empty
 *  object when it failed (no current version to show). */
export function useVersionInfo(): VersionInfo | null {
    const [info, setInfo] = useState<VersionInfo | null>(isFiveM ? null : DEV_INFO);
    useEffect(() => {
        if (!isFiveM) return;
        let alive = true;
        apiData<VersionInfo>('sd-phone:settings:versionInfo')
            .then(d => { if (alive) setInfo(d ?? {}); })
            .catch(() => { if (alive) setInfo({}); });
        return () => { alive = false; };
    }, []);
    return info;
}
