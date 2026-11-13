import { create } from 'zustand';

import { deleteAlarm as apiDelete, getAlarms, saveAlarm as apiSave } from '@/apps/clock/clockApi';
import type { AlarmDef } from '@/apps/clock/data';


interface AlarmState {
    alarms:    AlarmDef[];
    loaded:    boolean;
    testNonce: number;
}

const useAlarmStore = create<AlarmState>(() => ({ alarms: [], loaded: false, testNonce: 0 }));

let started  = false;
let fetching = false;

const byTime = (list: AlarmDef[]) =>
    [...list].sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));

function commit(next: AlarmDef[]) {
    useAlarmStore.setState({ alarms: byTime(next) });
}

export function hydrateAlarms(force = false): void {
    if (fetching || (started && !force)) return;
    started  = true;
    fetching = true;
    void getAlarms()
        .then(list => { useAlarmStore.setState({ alarms: byTime(list), loaded: true }); })
        .finally(() => { fetching = false; });
}

export function saveAlarm(a: AlarmDef): void {
    const cur = useAlarmStore.getState().alarms;
    commit(cur.some(x => x.id === a.id) ? cur.map(x => (x.id === a.id ? a : x)) : [...cur, a]);
    void apiSave(a);
}

export function removeAlarm(id: string): void {
    commit(useAlarmStore.getState().alarms.filter(x => x.id !== id));
    void apiDelete(id);
}

export function toggleAlarm(id: string): void {
    const cur = useAlarmStore.getState().alarms.find(a => a.id === id);
    if (cur) saveAlarm({ ...cur, enabled: !cur.enabled });
}

export function disableAlarm(id: string): void {
    const cur = useAlarmStore.getState().alarms.find(a => a.id === id);
    if (cur && cur.enabled) saveAlarm({ ...cur, enabled: false });
}

export function alarmsSnapshot(): AlarmDef[] { return useAlarmStore.getState().alarms; }

export function useAlarms(): { alarms: AlarmDef[]; loaded: boolean } {
    const alarms = useAlarmStore(s => s.alarms);
    const loaded = useAlarmStore(s => s.loaded);
    return { alarms, loaded };
}

export function requestTestAlarm(): void {
    useAlarmStore.setState(s => ({ testNonce: s.testNonce + 1 }));
}

export function onTestAlarm(handler: () => void): () => void {
    return useAlarmStore.subscribe((s, prev) => { if (s.testNonce !== prev.testNonce) handler(); });
}
