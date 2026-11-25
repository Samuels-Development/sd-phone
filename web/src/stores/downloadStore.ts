import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';


interface DownloadState {
    downloads: Record<string, number>;
    byProfile:   Record<string, Record<string, number>>;
    profile:     string;
    setProfile:  (profile?: string) => void;
    start:       (id: string, queued: boolean, profile?: string) => void;
    setProgress: (id: string, p: number, profile?: string) => void;
    remove:      (id: string, profile?: string) => void;
}

export const useDownloadStore = create<DownloadState>((set) => ({
    downloads: {},
    byProfile: {},
    profile: '',
    setProfile: profile => set(s => ({ profile: profile ?? '', downloads: s.byProfile[profile ?? ''] ?? {} })),
    start: (id, queued, profile) => set(s => {
        const key = profile ?? '';
        const downloads = { ...s.byProfile[key], [id]: queued ? -1 : 0 };
        return { byProfile: { ...s.byProfile, [key]: downloads }, ...(s.profile === key ? { downloads } : {}) };
    }),
    setProgress: (id, p, profile) => set(s => {
        const key = profile ?? '';
        if (s.byProfile[key]?.[id] === undefined) return s;
        const downloads = { ...s.byProfile[key], [id]: p };
        return { byProfile: { ...s.byProfile, [key]: downloads }, ...(s.profile === key ? { downloads } : {}) };
    }),
    remove: (id, profile) => set(s => {
        const key = profile ?? '';
        const downloads = { ...s.byProfile[key] };
        delete downloads[id];
        return { byProfile: { ...s.byProfile, [key]: downloads }, ...(s.profile === key ? { downloads } : {}) };
    }),
}));

export function useDownloadProgress(id: string): number | undefined {
    return useDownloadStore(s => s.downloads[id]);
}

export function useDownloadingIds(): string[] {
    return useDownloadStore(useShallow(s => Object.keys(s.downloads)));
}
