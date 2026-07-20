import { useEffect, useState } from 'react';
import { Bird, MessageSquare, Search, Smartphone, Users, VolumeX } from 'lucide-react';

import { adminStats } from '../adminApi';
import type { AdminStats } from '../types';
import { Card, Input, Spinner } from '../ui';

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | undefined }) {
    return (
        <Card className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-zinc-400">{icon}</div>
            <div>
                <div className="text-[19px] font-bold leading-tight text-zinc-100">
                    {value === undefined ? '—' : value.toLocaleString()}
                </div>
                <div className="text-[11.5px] font-medium text-zinc-500">{label}</div>
            </div>
        </Card>
    );
}

export function Dashboard({ onSearch }: { onSearch: (q: string) => void }) {
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');

    useEffect(() => {
        void adminStats().then(res => {
            setStats(res.success ? res.data ?? null : null);
            setLoading(false);
        });
    }, []);

    return (
        <div className="space-y-5">
            <Card className="p-4">
                <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-zinc-300">
                    <Search size={14} className="text-zinc-500" />
                    Find a player
                </div>
                <Input
                    value={q}
                    onChange={setQ}
                    onEnter={() => { if (q.trim().length >= 2) onSearch(q.trim()); }}
                    placeholder="Name, citizen ID, phone number, Birdy handle or account username…"
                />
                <div className="mt-1.5 text-[11.5px] text-zinc-600">Press Enter to search. Results load 20 at a time.</div>
            </Card>

            {loading ? (
                <div className="flex justify-center py-8"><Spinner /></div>
            ) : (
                <div className="grid grid-cols-3 gap-3">
                    <StatTile icon={<Users size={16} />}         label="Players online"      value={stats?.online} />
                    <StatTile icon={<Smartphone size={16} />}    label="Phones registered"   value={stats?.phones} />
                    <StatTile icon={<Users size={16} />}         label="App accounts"        value={stats?.appAccounts} />
                    <StatTile icon={<Bird size={16} />}          label="Birdy posts"         value={stats?.birdyPosts} />
                    <StatTile icon={<MessageSquare size={16} />} label="Text messages"       value={stats?.messages} />
                    <StatTile icon={<VolumeX size={16} />}       label="Active mutes"        value={stats?.activeMutes} />
                </div>
            )}

            <Card className="p-4 text-[12.5px] leading-relaxed text-zinc-500">
                <span className="font-semibold text-zinc-400">Quick guide.</span> Search a player to inspect their phone: number, passcode,
                installed apps, app accounts (password resets, force logout), Birdy activity, texts and calls. Use the Birdy tab to trace
                any post back to the player behind it, and Mutes to restrict what a player can do on the phone. Every action you take here
                is written to the audit log.
            </Card>
        </div>
    );
}
