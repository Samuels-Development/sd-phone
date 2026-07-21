import { UserRound } from 'lucide-react';

import { initials, isNumericName } from '@/lib/format';

export interface AvatarSubject {
    id?:      string;
    name:     string;
    initials: string;
    color:    string;
    avatar?:  string;
}

// Unknown numbers (no saved contact) get an iOS-style person glyph instead of number-derived
// initials. Matches the empty-avatar placeholder used by Add Contact and No Caller ID.
function PlaceholderAvatar({ size }: { size: number }) {
    return (
        <span
            className="shrink-0 flex items-center justify-center rounded-full bg-[#b6b6bb] dark:bg-control"
            style={{ width: size, height: size }}
        >
            <UserRound className="text-white/90" strokeWidth={1.6} fill="currentColor" size={Math.round(size * 0.54)} />
        </span>
    );
}

export function ContactAvatar({ contact, size = 50 }: { contact: AvatarSubject; size?: number }) {
    const fontSize = size * 0.36;

    if (contact.avatar) {
        return (
            <img
                src={contact.avatar}
                alt={contact.name}
                draggable={false}
                className="shrink-0 rounded-full object-cover"
                style={{ width: size, height: size }}
            />
        );
    }

    if (isNumericName(contact.name)) {
        return <PlaceholderAvatar size={size} />;
    }

    return (
        <div
            className="shrink-0 flex items-center justify-center rounded-full"
            style={{
                width:      size,
                height:     size,
                background: contact.color,
                fontSize,
                fontWeight: 600,
                color:      '#fff',
                letterSpacing: '-0.02em',
            }}
        >
            {contact.initials}
        </div>
    );
}

export function GroupAvatar({ contacts, size = 50, avatar }: { contacts: AvatarSubject[]; size?: number; avatar?: string }) {
    if (avatar) {
        return (
            <img
                src={avatar}
                alt=""
                draggable={false}
                className="shrink-0 rounded-full object-cover"
                style={{ width: size, height: size }}
            />
        );
    }

    const shown = contacts.slice(0, 4);
    const inner = size * 0.48;
    return (
        <div
            className="shrink-0 grid grid-cols-2 gap-[2px] rounded-full overflow-hidden"
            style={{ width: size, height: size, background: '#2C2C2E' }}
        >
            {shown.map((c, i) => (
                <div
                    key={c.id ?? i}
                    className="flex items-center justify-center"
                    style={{
                        background: c.color,
                        fontSize:   inner * 0.38,
                        fontWeight: 600,
                        color:      '#fff',
                    }}
                >
                    {c.initials[0]}
                </div>
            ))}
        </div>
    );
}

export function InitialsAvatar({ name, color = '#3b82f6', size = 44 }: { name: string; color?: string; size?: number }) {
    if (isNumericName(name)) {
        return <PlaceholderAvatar size={size} />;
    }
    return (
        <span
            className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
            style={{ width: size, height: size, background: color, fontSize: size * 0.36 }}
        >
            {initials(name)}
        </span>
    );
}
