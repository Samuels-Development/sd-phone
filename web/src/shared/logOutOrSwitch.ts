import { accountsLogout } from '@/core/accountsApi';

export interface SwitchTarget {
    username: string;
    name?:    string;
}

export function switchTargetLabel(next: SwitchTarget | null | undefined): string | null {
    if (!next) return null;
    return next.name || next.username;
}

export async function logOutOrSwitch(app: string): Promise<string | null> {
    const { switchedTo } = await accountsLogout(app);
    return switchedTo;
}
