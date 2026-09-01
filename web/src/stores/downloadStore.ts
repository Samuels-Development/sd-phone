import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';


interface DownloadState {
    downloads: Record<string, number>;
    start:       (id: string, queued: boolean) => void;
    setProgress: (id: string, p: number) => void;
    remove:      (id: string) => void;
}

export const useDownloadStore = create<DownloadState>((set) => ({
    downloads: {},
    start:       (id, queued) => set(s => ({ downloads: { ...s.downloads, [id]: queued ? -1 : 0 } })),
    setProgress: (id, p) => set(s => (s.downloads[id] === undefined ? s : { downloads: { ...s.downloads, [id]: p } })),
    remove:      (id) => set(s => { const n = { ...s.downloads }; delete n[id]; return { downloads: n }; }),
}));

export function useDownloadProgress(id: string): number | undefined {
    return useDownloadStore(s => s.downloads[id]);
}

export function useDownloadingIds(): string[] {
    return useDownloadStore(useShallow(s => Object.keys(s.downloads)));
}
