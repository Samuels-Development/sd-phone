import type { SettingsGroup as SettingsGroupDef } from './data';
import { SettingsRow } from './SettingsRow';

export function SettingsGroup({ group, onRowPress }: { group: SettingsGroupDef; onRowPress?: (id: string) => void }) {
    return (
        <div className="flex flex-col">
            {group.title && (
                <div className="px-7 pb-1.5 pt-1 text-[13px] font-normal uppercase tracking-wider text-ios-gray">
                    {group.title}
                </div>
            )}
            <div className="mx-4 overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                {group.rows.map((r, i) => (
                    <SettingsRow
                        key={r.id}
                        row={r}
                        divider={i < group.rows.length - 1}
                        onPress={onRowPress ? () => onRowPress(r.id) : undefined}
                    />
                ))}
            </div>
            {group.footer && (
                <div className="px-7 pb-1 pt-2 text-[14px] font-normal text-ios-gray">
                    {group.footer}
                </div>
            )}
        </div>
    );
}
