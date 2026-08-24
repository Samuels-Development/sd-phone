import { useEffect, useState } from 'react';
import { Bird, Clapperboard, Images, MessageSquare, Phone, Search, Smartphone, TriangleAlert, UserPlus, Users, VolumeX } from 'lucide-react';

import { adminStats } from '../adminApi';
import type { AdminStats } from '../types';
import { Card, Input, Spinner } from '../ui';
import { TrendTile } from '../Sparkline';

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | undefined }) {
    return (
        <div className="rounded-xl bg-white/[0.035] px-4 py-3.5 ring-1 ring-white/[0.06]">
            <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-zinc-400">{icon}</div>
                <div>
                    <div className="text-[19px] font-bold leading-tight text-zinc-100 tabular-nums">
                        {value === undefined ? '—' : value.toLocaleString()}
                    </div>
                    <div className="text-[11.5px] font-medium text-zinc-500">{label}</div>
                </div>
            </div>
        </div>
    );
}

export function Dashboard({ onSearch }: { onSearch: (q: string) => void }) {
    const [q, setQ] = useState('');
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        void adminStats().then(res => {
            setStats(res.success ? res.data ?? null : null);
            setLoading(false);
        });
    }, []);

    const trends = stats?.trends;
    const days   = stats?.days;

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
                <>
                    <div className="grid grid-cols-4 gap-3">
                        <StatTile icon={<Users size={16} />}         label="Players online"    value={stats?.online} />
                        <StatTile icon={<Smartphone size={16} />}    label="Phones registered" value={stats?.phones} />
                        <StatTile icon={<TriangleAlert size={16} />} label="Flags waiting"     value={stats?.openFlags} />
                        <StatTile icon={<VolumeX size={16} />}       label="Active mutes"      value={stats?.activeMutes} />
                    </div>

                    <div>
                        <div className="mb-2 px-0.5 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
                            Last 14 days
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <TrendTile
                                icon={<MessageSquare size={15} />}
                                label="Text messages"
                                value={stats?.messages}
                                points={trends?.messages}
                                days={days}
                            />
                            <TrendTile
                                icon={<Phone size={15} />}
                                label="Calls placed"
                                value={trends?.calls?.reduce((a, b) => a + b, 0)}
                                points={trends?.calls}
                                days={days}
                            />
                            <TrendTile
                                icon={<Bird size={15} />}
                                label="Squawk posts"
                                value={stats?.birdyPosts}
                                points={trends?.birdyPosts}
                                days={days}
                            />
                            <TrendTile
                                icon={<Clapperboard size={15} />}
                                label="Clout posts"
                                value={trends?.cloutPosts?.reduce((a, b) => a + b, 0)}
                                points={trends?.cloutPosts}
                                days={days}
                            />
                            <TrendTile
                                icon={<Images size={15} />}
                                label="Photos taken"
                                value={trends?.photos?.reduce((a, b) => a + b, 0)}
                                points={trends?.photos}
                                days={days}
                            />
                            <TrendTile
                                icon={<UserPlus size={15} />}
                                label="App accounts"
                                value={stats?.appAccounts}
                                points={trends?.accounts}
                                days={days}
                            />
                        </div>
                    </div>
                </>
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
