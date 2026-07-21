import { initials, isNumericName } from '@/lib/format';

export interface AvatarSubject {
    id?:      string;
    name:     string;
    initials: string;
    color:    string;
    avatar?:  string;
}

// Full-bleed head-and-shoulders silhouette (the same shape Birdy uses for missing profile
// pictures); the viewBox keeps the proportions at every avatar size.
function PersonBust({ size }: { size: number }) {
    return (
        <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden fill="currentColor">
            <circle cx="20" cy="15.5" r="7.5" />
            <path d="M3,40 C3,28 9.5,23 20,23 C30.5,23 37,28 37,40 Z" />
        </svg>
    );
}

// Unknown numbers (no saved contact) get an iOS-style silhouette instead of number-derived
// initials; shared by the recents No Caller ID rows and the call detail header.
export function PlaceholderAvatar({ size }: { size: number }) {
    return (
        <span
            className="shrink-0 flex items-center justify-center overflow-hidden rounded-full bg-[#b6b6bb] text-white/90 dark:bg-control"
            style={{ width: size, height: size }}
        >
            <PersonBust size={size} />
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
