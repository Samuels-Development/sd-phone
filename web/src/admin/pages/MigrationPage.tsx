import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckSquare, Database, Maximize2, Minimize2, Play, RefreshCw, Square } from 'lucide-react';
import clsx from 'clsx';

import { adminMigrateScan, adminMigrateStart, adminMigrateStop } from '../adminApi';
import type { MigrationScan } from '../types';
import { Badge, Btn, Card, CenterNote, Checkbox, ConfirmModal, Spinner } from '../ui';
import { DomainList } from './migration/DomainList';
import { MigrationLog } from './migration/MigrationLog';
import { TransferMonitor } from './migration/TransferMonitor';
import { useMigrationRun } from './migration/useMigrationRun';
import { comma, duration } from './migration/format';

const REQUIRED = 'numbers';

const PHASE_LABEL: Record<string, string> = {
    idle:      'Standing by',
    running:   'Importing',
    done:      'Complete',
    failed:    'Finished with errors',
    cancelled: 'Stopped',
};

const STAGE_LABEL: Record<string, string> = {
    reading:  'Reading',
    building: 'Working through',
    writing:  'Writing',
};

const PHASE_TONE: Record<string, 'neutral' | 'green' | 'red' | 'blue' | 'amber'> = {
    idle:      'neutral',
    running:   'blue',
    done:      'green',
    failed:    'red',
    cancelled: 'amber',
};

export function MigrationPage({ toast }: { toast: (text: string, error?: boolean) => void }) {
    const [scan, setScan] = useState<MigrationScan | null>(null);
    const [scanning, setScanning] = useState(true);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [dryRun, setDryRun] = useState(false);
    const [starting, setStarting] = useState(false);
    const [consoleMode, setConsoleMode] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const run = useMigrationRun();
    const { state, lines, samples, marks, running, elapsed, eta, rate, peak, pct } = run;

    const toastRef = useRef(toast);
    toastRef.current = toast;

    const refresh = useCallback(async (quiet?: boolean, sourceKey?: string) => {
        if (!quiet) setScanning(true);
        const res = await adminMigrateScan(sourceKey);
        setScanning(false);
        if (!res.success || !res.data) {
            toastRef.current(res.message ?? 'Could not read the source database', true);
            return;
        }
        setScan(res.data);
        setSelected(prev => {
            const domains = res.data!.domains;
            const runnable = new Set(
                domains.filter(d => !d.locked && d.status === 'pending').map(d => d.key),
            );

            if (prev.size === 0 || sourceKey) {
                const next = new Set<string>();
                for (const d of domains) if (runnable.has(d.key) && d.rows > 0) next.add(d.key);
                if (runnable.has(REQUIRED)) next.add(REQUIRED);
                return next;
            }

            const next = new Set<string>();
            for (const key of prev) if (runnable.has(key)) next.add(key);
            return next;
        });
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const pickSource = useCallback((key: string) => {
        setSelected(new Set());
        void refresh(false, key);
    }, [refresh]);

    const prevPhase = useRef(state.phase);
    useEffect(() => {
        if (prevPhase.current === 'running' && state.phase !== 'running') void refresh(true);
        prevPhase.current = state.phase;
    }, [state.phase, refresh]);

    const toggle = useCallback((key: string) => {
        const target = scan?.domains.find(d => d.key === key);
        if (target?.locked) return;
        if (key === REQUIRED) return;
        setSelected(prev => {
            const next = new Set(prev);
            const domain = scan?.domains.find(d => d.key === key);
            if (next.has(key)) {
                next.delete(key);
                for (const d of scan?.domains ?? []) if (d.requires === key) next.delete(d.key);
            } else {
                next.add(key);
                if (domain?.requires) next.add(domain.requires);
            }
            const numbers = scan?.domains.find(d => d.key === REQUIRED);
            if (numbers && !numbers.locked && numbers.status === 'pending') next.add(REQUIRED);
            return next;
        });
    }, [scan]);

    const picked = useMemo(
        () => (scan?.domains ?? []).filter(d => selected.has(d.key) && !d.locked && d.status === 'pending'),
        [scan, selected],
    );

    const selectable = useMemo(
        () => (scan?.domains ?? []).filter(d => !d.locked && d.status === 'pending' && d.rows > 0),
        [scan],
    );
    const allPicked = selectable.length > 0 && selectable.every(d => selected.has(d.key));

    const toggleAll = useCallback(() => {
        setSelected(() => {
            const next = new Set<string>();
            if (!scan?.domains.some(d => d.key === REQUIRED && d.locked)) next.add(REQUIRED);
            if (!allPicked) for (const d of selectable) next.add(d.key);
            return next;
        });
    }, [allPicked, selectable, scan]);

    const start = useCallback(async () => {
        setConfirming(false);
        setStarting(true);
        const res = await adminMigrateStart(picked.map(d => d.key), dryRun, scan?.source);
        setStarting(false);
        if (!res.success) toastRef.current(res.message ?? 'The import would not start', true);
    }, [picked, dryRun, scan]);

    const stop = useCallback(async () => {
        const res = await adminMigrateStop();
        if (!res.success) toastRef.current(res.message ?? 'Nothing to stop', true);
    }, []);

    if (scanning && !scan) {
        return <CenterNote><Spinner /> Reading the source database...</CenterNote>;
    }

    const sourceOptions = scan?.sources ?? [];
    const activeSource = sourceOptions.find(s => s.key === scan?.source);
    const anySourcePresent = sourceOptions.some(s => s.present);
    const sourceTitle = activeSource?.title ?? 'Phone';

    const sourcePicker = sourceOptions.length > 1 ? (
        <Card title="Import from">
            <div className="px-4 py-3.5">
                <div className="flex flex-wrap gap-2">
                    {sourceOptions.map(s => (
                        <Btn
                            key={s.key}
                            variant={s.key === scan?.source ? 'primary' : 'subtle'}
                            disabled={!s.present || running}
                            onClick={() => pickSource(s.key)}
                            title={s.present ? s.blurb : `No ${s.title} tables in this database`}
                        >
                            <Database size={13} />
                            {s.title}
                        </Btn>
                    ))}
                </div>
                {activeSource && (
                    <p className="mt-3 text-[12.5px] leading-relaxed text-zinc-400">
                        {activeSource.blurb}
                    </p>
                )}
                {!anySourcePresent && (
                    <p className="mt-2 text-[12.5px] leading-relaxed text-ios-orange">
                        Neither source is present in this database. Load the old phone&apos;s tables alongside sd-phone&apos;s, then scan again.
                    </p>
                )}
            </div>
        </Card>
    ) : null;

    if (scan && !scan.lbFound) {
        return (
            <div className="space-y-3">
                {sourcePicker}
                <CenterNote>
                    {anySourcePresent
                        ? `This database holds no ${activeSource?.title ?? 'matching'} tables. Pick another source above.`
                        : `This database holds no ${sourceOptions.map(s => s.title).join(' or ')} tables, so there is nothing to bring across.`}
                </CenterNote>
            </div>
        );
    }

    const started = state.phase !== 'idle';
    const id = scan?.identity;
    const unmatched = id ? id.unresolved + id.ambiguous : 0;
    const unmatchedPct = id && id.total > 0 ? (unmatched / id.total) * 100 : 0;

    const controls = (
        <div className="flex items-center gap-2">
            <label
                className={clsx(
                    'flex items-center gap-1.5 text-[12px]',
                    running ? 'text-zinc-600' : 'cursor-pointer text-zinc-400',
                )}
            >
                <Checkbox checked={dryRun} disabled={running} onChange={setDryRun} />
                Count only
            </label>
            <Btn
                variant="subtle"
                onClick={() => setConsoleMode(c => !c)}
                title={consoleMode ? 'Back to the full page' : 'Fill the panel with the monitor and log'}
            >
                {consoleMode ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                {consoleMode ? 'Exit console' : 'Console'}
            </Btn>
            <Btn onClick={() => void refresh()} disabled={running || scanning} busy={scanning}>
                <RefreshCw size={13} /> Rescan
            </Btn>
            {running ? (
                <Btn variant="danger" onClick={() => void stop()}>
                    <Square size={13} /> Stop
                </Btn>
            ) : (
                <Btn variant="primary" onClick={() => setConfirming(true)} busy={starting} disabled={picked.length === 0}>
                    <Play size={13} /> Bring across {picked.length} domain{picked.length === 1 ? '' : 's'}
                </Btn>
            )}
        </div>
    );

    const pickedRows = picked.reduce((n, d) => n + d.rows, 0);

    const confirmDialog = confirming && (
        <ConfirmModal
            title={dryRun ? 'Count what would come across?' : 'Start the import?'}
            confirmLabel={dryRun ? 'Count it' : 'Start importing'}
            onClose={() => setConfirming(false)}
            onConfirm={start}
            body={
                <div className="space-y-2.5">
                    <div>
                        {comma(pickedRows)} row{pickedRows === 1 ? '' : 's'} across{' '}
                        {picked.length} domain{picked.length === 1 ? '' : 's'}, roughly{' '}
                        {duration(pickedRows / 8000)}.
                    </div>
                    <div className="rounded-lg bg-ios-orange/10 px-3.5 py-2.5 text-amber-300">
                        The server does this work in one go, so expect it to run heavy the whole
                        time: players may see lag, and the phone will be slow to answer. Best done
                        with nobody on.
                    </div>
                    <div className="text-zinc-400">
                        {dryRun
                            ? 'Counting only. Nothing is written and no domain is marked done.'
                            : 'You can stop it at any point. Domains that finished stay finished.'}
                    </div>
                </div>
            }
        />
    );

    const heading = (
        <span className="flex items-center gap-2">
            <Database size={15} className="text-zinc-500" />
            {sourceTitle} import
            <Badge tone={PHASE_TONE[state.phase] ?? 'neutral'}>{PHASE_LABEL[state.phase] ?? state.phase}</Badge>
            {state.dryRun && <Badge tone="amber">Counting only</Badge>}
        </span>
    );

    const overall = started && (
        <div className="border-t border-white/[0.06] px-4 py-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[12px]">
                <span className="font-semibold text-zinc-300">
                    {state.currentDomain
                        ? `${STAGE_LABEL[state.currentStage ?? 'building']} ${state.currentDomain}`
                        : PHASE_LABEL[state.phase] ?? state.phase}
                    {state.currentStage === 'writing' && (state.writeTotal ?? 0) > 0 && (
                        <span className="ml-2 font-mono font-normal text-zinc-500 tabular-nums">
                            {comma(state.writeDone ?? 0)} of {comma(state.writeTotal ?? 0)} rows written
                        </span>
                    )}
                </span>
                <span className="font-mono text-zinc-500 tabular-nums">
                    {comma(state.doneRows ?? 0)} of {comma(state.totalRows ?? 0)}
                    {eta !== null && ` · ${duration(eta)} left`}
                </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                    className={clsx(
                        'h-full rounded-full transition-[width] duration-500 ease-out',
                        state.phase === 'failed' ? 'bg-ios-red'
                            : state.phase === 'cancelled' ? 'bg-ios-orange'
                            : state.phase === 'done' ? 'bg-ios-green'
                            : 'bg-ios-blue',
                    )}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );

    const monitor = (
        <TransferMonitor
            samples={samples}
            marks={marks}
            state={state}
            plan={picked}
            rate={rate}
            peak={peak}
            elapsed={elapsed}
            eta={eta}
            height={consoleMode ? 190 : 116}
            started={started}
            sourceTitle={sourceTitle}
        />
    );

    if (consoleMode) {
        return (
            <div className="flex h-full min-h-0 flex-col gap-3">
                <Card title={heading} actions={controls} className="shrink-0">
                    {monitor}
                    {overall}
                </Card>
                <MigrationLog lines={lines} className="min-h-0 flex-1 py-2" />
                {confirmDialog}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {sourcePicker}
            <Card title={heading} actions={controls}>
                {id && (
                    <div className="grid grid-cols-4 gap-3 px-4 pt-4 text-[12.5px]">
                        <Stat label="Phones on the old system" value={comma(id.total)} />
                        <Stat label="Matched to a character" value={comma(id.resolved)} tone="green" />
                        <Stat label="No character found" value={comma(id.unresolved)} tone={id.unresolved > 0 ? 'amber' : undefined} />
                        <Stat label="Matched more than one" value={comma(id.ambiguous)} tone={id.ambiguous > 0 ? 'amber' : undefined} />
                    </div>
                )}

                {id && unmatched > 0 && (
                    <div className="px-4 pt-3">
                        <div
                            className={clsx(
                                'flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-[12.5px] leading-relaxed',
                                unmatchedPct >= 25 ? 'bg-ios-red/10 text-red-300' : 'bg-ios-orange/10 text-amber-300',
                            )}
                        >
                            <AlertTriangle size={14} className="mt-[2px] shrink-0" />
                            <span>
                                {comma(unmatched)} of {comma(id.total)} phones ({unmatchedPct.toFixed(1)}%) belong to no
                                character on this server, so their data stays behind.
                                {unmatchedPct >= 25 && ' Check identifierMode in configs/migrate.lua before you commit to this.'}
                            </span>
                        </div>
                    </div>
                )}

                {monitor}
                {overall}
            </Card>

            <Card
                title="Domains"
                actions={
                    <div className="flex items-center gap-3">
                        <span className="font-mono text-[11.5px] text-zinc-500 tabular-nums">
                            {picked.length} of {selectable.length} available selected
                        </span>
                        <Btn
                            variant="subtle"
                            onClick={toggleAll}
                            disabled={running || selectable.length === 0}
                            title={allPicked
                                ? 'Leave only the required domain ticked'
                                : 'Tick every domain that has something to bring'}
                        >
                            {allPicked ? <Square size={13} /> : <CheckSquare size={13} />}
                            {allPicked ? 'Clear' : 'Select all'}
                        </Btn>
                    </div>
                }
            >
                <DomainList
                    domains={scan?.domains ?? []}
                    state={state}
                    selected={selected}
                    required={REQUIRED}
                    locked={running}
                    onToggle={toggle}
                />
                <div className="border-t border-white/[0.06] px-4 py-2.5 text-[11.5px] text-zinc-500">
                    Re-running a domain only fills gaps. Nobody's existing data is overwritten.
                </div>
            </Card>

            <Card title="Log">
                <div className="p-4">
                    <MigrationLog lines={lines} className="h-[240px] py-2" />
                </div>
            </Card>

            {confirmDialog}
        </div>
    );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'amber' }) {
    return (
        <div className="rounded-lg bg-white/[0.03] px-3.5 py-2.5 ring-1 ring-white/[0.05]">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
            <div
                className={clsx(
                    'mt-0.5 font-mono text-[17px] font-bold leading-tight tabular-nums',
                    tone === 'green' ? 'text-ios-green' : tone === 'amber' ? 'text-ios-orange' : 'text-zinc-200',
                )}
            >
                {value}
            </div>
        </div>
    );
}
