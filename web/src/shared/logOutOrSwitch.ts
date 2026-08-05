import { accountsLogout, accountsSwitch } from '@/core/accountsApi';

export interface SwitchTarget {
    username: string;
    name?:    string;
}

export function switchTargetLabel(next: SwitchTarget | null | undefined): string | null {
    if (!next) return null;
    return next.name || next.username;
}

export async function logOutOrSwitch(app: string, next: SwitchTarget | null | undefined): Promise<string | null> {
    if (next) {
        const res = await accountsSwitch(app, next.username);
        if (res.ok) return next.username;
    }
    await accountsLogout(app);
    return null;
}
