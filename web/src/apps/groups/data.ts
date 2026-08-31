
import { fetchNui, isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { apiCall, apiData, failText, type Envelope } from '@/core/api';
import { newId as libNewId } from '@/lib/format';


interface GroupMember {
    id:     string;
    name:   string;
    online: boolean;
}

export interface Group {
    id:          string;
    name:        string;
    leaderId:    string;
    leaderName:  string;
    members:     GroupMember[];
    color:       string;
    avatar?:     string | null;
    onlineCount: number;
}

export interface Invite {
    id:          string;
    groupId:     string;
    groupName:   string;
    invitedBy:   string;
    memberCount: number;
    color:       string;
    avatar?:     string | null;
}

export interface GroupsState {
    groups:        Group[];
    invites:       Invite[];
    activeGroupId: string | null;
}



const PALETTE = [
    '#5856d6', '#ff9500', '#34c759', '#ff2d55',
    '#007aff', '#af52de', '#ff6b00', '#30b0c7',
    '#ff3b30', '#00c7be',
];

export function colorFor(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
    return PALETTE[Math.abs(h) % PALETTE.length];
}

export { initials as initialsFor } from '@/lib/format';


const MOCK: GroupsState = {
    activeGroupId: 'g1',
    groups: [
        {
            id:         'g1',
            name:       'Vespucci Goons',
            leaderId:   'local',
            leaderName: 'You',
            color:      '#5856d6',
            onlineCount: 3,
            members: [
                { id: 'local', name: 'You',    online: true  },
                { id: 'p2',    name: 'T-Bone', online: true  },
                { id: 'p3',    name: 'Carla',  online: true  },
                { id: 'p4',    name: 'Ghost',  online: false },
            ],
        },
        {
            id:         'g2',
            name:       'LS Racers',
            leaderId:   'p2',
            leaderName: 'T-Bone',
            color:      '#ff9500',
            onlineCount: 2,
            members: [
                { id: 'local', name: 'You',        online: true  },
                { id: 'p2',    name: 'T-Bone',     online: true  },
                { id: 'p7',    name: 'Drift King', online: false },
            ],
        },
    ],
    invites: [
        {
            id:          'i1',
            groupId:     'g3',
            groupName:   'Bad Company',
            invitedBy:   'Mikey D',
            memberCount: 8,
            color:       '#ff2d55',
        },
    ],
};

function devNewId(): string {
    return libNewId();
}


export async function listGroups(): Promise<GroupsState> {
    if (!isFiveM) return structuredClone(MOCK);
    return (await apiData<GroupsState>('sd-phone:groups:list')) ?? { groups: [], invites: [], activeGroupId: null };
}

export async function createGroup(name: string): Promise<Group | string> {
    if (!isFiveM) {
        const g: Group = {
            id:          devNewId(),
            name,
            leaderId:    'local',
            leaderName:  'You',
            color:       colorFor(name),
            onlineCount: 1,
            members:     [{ id: 'local', name: 'You', online: true }],
        };
        MOCK.groups = [g, ...MOCK.groups];
        return g;
    }
    const res = await apiCall<Group>('sd-phone:groups:create', { name });
    if (res.success && res.data) return res.data;
    return failText(res, 'Failed to create group');
}

export async function inviteMember(groupId: string, targetSource: number): Promise<true | string> {
    if (!isFiveM) return true;
    const res = await apiCall<unknown>('sd-phone:groups:invite', { groupId, targetSource });
    if (res.success) return true;
    return failText(res, t('groups.failedSendInvite', 'Failed to send invite'));
}

export async function acceptInvite(inviteId: string): Promise<Group | string> {
    if (!isFiveM) {
        const inv = MOCK.invites.find(i => i.id === inviteId);
        if (!inv) return 'Invite not found';
        MOCK.invites = MOCK.invites.filter(i => i.id !== inviteId);
        const g: Group = {
            id:          inv.groupId,
            name:        inv.groupName,
            leaderId:    'remote',
            leaderName:  inv.invitedBy,
            color:       inv.color,
            onlineCount: 1,
            members:     [{ id: 'local', name: 'You', online: true }],
        };
        MOCK.groups = [...MOCK.groups, g];
        return g;
    }
    const res = await apiCall<{ group: Group }>('sd-phone:groups:accept', { inviteId });
    if (res.success && res.data) return res.data.group;
    return failText(res, 'Failed to accept invite');
}

export async function declineInvite(inviteId: string): Promise<void> {
    if (!isFiveM) { MOCK.invites = MOCK.invites.filter(i => i.id !== inviteId); return; }
    await fetchNui<Envelope<unknown>>('sd-phone:groups:decline', { inviteId });
}

export async function leaveGroup(groupId: string): Promise<true | string> {
    if (!isFiveM) {
        MOCK.groups = MOCK.groups.filter(g => g.id !== groupId);
        return true;
    }
    const res = await apiCall<unknown>('sd-phone:groups:leave', { groupId });
    if (res.success) return true;
    return failText(res, 'Failed to leave group');
}

export async function disbandGroup(groupId: string): Promise<true | string> {
    if (!isFiveM) {
        MOCK.groups = MOCK.groups.filter(g => g.id !== groupId);
        return true;
    }
    const res = await apiCall<unknown>('sd-phone:groups:disband', { groupId });
    if (res.success) return true;
    return failText(res, 'Failed to disband group');
}

export async function kickMember(groupId: string, citizenid: string): Promise<true | string> {
    if (!isFiveM) return true;
    const res = await apiCall<unknown>('sd-phone:groups:kick', { groupId, citizenid });
    if (res.success) return true;
    return failText(res, 'Failed to remove member');
}

export async function setGroupAvatar(groupId: string, avatar: string): Promise<true | string> {
    if (!isFiveM) {
        const g = MOCK.groups.find(x => x.id === groupId);
        if (g) g.avatar = avatar;
        return true;
    }
    const res = await apiCall<unknown>('sd-phone:groups:setAvatar', { groupId, avatar });
    if (res.success) return true;
    return failText(res, 'Failed to update group photo');
}

export async function setActiveGroup(groupId: string | null): Promise<true | string> {
    if (!isFiveM) {
        MOCK.activeGroupId = groupId;
        return true;
    }
    const res = await apiCall<{ activeGroupId: string | null }>(
        'sd-phone:groups:setActive',
        { groupId },
    );
    if (res.success) return true;
    return failText(res, 'Failed to update active group');
}
