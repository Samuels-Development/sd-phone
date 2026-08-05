import { ACCOUNT_APPS, accountsSignOutAll } from '@/core/accountsApi';
import { signOutAll as clearAuthRecords } from '@/stores/authStore';
import { clearSessionState } from '@/hooks/useSessionState';

export async function signOutAllForApp(app: string): Promise<number> {
    const { signedOut } = await accountsSignOutAll(app);
    clearAuthRecords([app]);
    clearSessionState(`${app}:`);
    return signedOut;
}

export async function signOutEverywhere(): Promise<number> {
    const { signedOut } = await accountsSignOutAll();
    clearAuthRecords(ACCOUNT_APPS);
    for (const app of ACCOUNT_APPS) clearSessionState(`${app}:`);
    return signedOut;
}
