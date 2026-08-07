
import type { GameClock } from '@/stores/gameClockStore';
import type { BirdyMessage } from '@/apps/birdy/data';
import type { DocFile } from '@/apps/documents/data';
import type { Bulletin, Call, ChatMsg, Unit } from '@/apps/mdt/data';
import type { DMsg as PhotogramDM, User as PhotogramUser } from '@/apps/photogram/data';
import type {
    HudMarker, HudPosition, HudState, HudStyle, LineupState, RaceResult, StartBoard, Standing,
} from '@/apps/racing/data';
import type { VUser as VibezUser } from '@/apps/vibez/data';
import type { Reaction } from '@/shared/chat/data';

export interface OpenPayload {
    locale?: string;
    locked: boolean;
    battery: number;
    frameColor?: string;
    carrier: string;
    signal: number;
    showWifi: boolean;
    wifiConfigured?: boolean;
    bluetoothConfigured?: boolean;
    use24h: boolean;
    showDate: boolean;
    dock: string[];
    apps: AppDef[];
    installedApps?: string[];
    homeLayout?: string;
    mailDomain?: string;
    /** Phone-number display config (config.Phone.Number); formats are keyed by digit count. */
    number?: {
        formats?: Record<string, string>;
        length?: number;
    };
    wallpaper: {
        lock: string;
        home: string;
    };
    sim?: SimStatePush;
}

/** Unique-phones SIM snapshot: enabled=false means the feature is off (stock behaviour). */
export interface SimStatePush {
    enabled: boolean;
    hasSim?: boolean;
    number?: string;
    /** DeviceIdentity mode: the phone owns its data and opens without a SIM (no No-SIM wall,
     *  "No Service" in the status bar instead). Absent/false = legacy SIM-is-identity mode. */
    device?: boolean;
    /** Device mode only: the phone's device identity, used to namespace per-phone UI state
     *  (setup completion, auth cache) so swapping SIMs on one phone never resets it. */
    profile?: string;
}

/** One Wi-Fi network the phone can see. `strength` is 0..1 raw, `bars` the 0..3 the icon draws. */
export interface WifiNetwork {
    id: string;
    ssid: string;
    /** Already joined once by this character, so rejoining needs no password. */
    known?: boolean;
    /** Password protected. The client omits it on the connected network, where it normalizes to false. */
    secured: boolean;
    strength: number;
    bars: number;
}

/** Live Wi-Fi snapshot: enabled=false means the radio is off, so there is nothing to join. */
export interface WifiState {
    enabled: boolean;
    /** This server runs Wi-Fi at all. Distinguishes a switched-off radio from no networks. */
    configured?: boolean;
    connected: WifiNetwork | null;
    networks: WifiNetwork[];
    providesData?: boolean;
}

export interface AppDef {
    id: string;
    label: string;
    icon: string;
    route: string;
    accent: string;
    base?: boolean;
    /** Wi-Fi network id (configs/wifi.lua) the phone must be joined to before this app downloads. */
    wifi?: string;
}

export interface CustomWidgetDef {
    id:    string;
    name:  string;
    ui:    string;
    sizes: ('sm' | 'md' | 'lg')[];
}

export interface CustomAppDef {
    id:          string;
    name:        string;
    description?: string;
    developer?:  string;
    icon?:       string;
    images?:     string[];
    size?:       number;
    price?:      number;
    defaultApp?: boolean;
    game?:       boolean;
    ui?:         string;
    fixBlur?:    boolean;
    keepOpen?:   boolean;
    landscape?:  boolean;
    /** Wi-Fi network id (configs/wifi.lua) the phone must be joined to before this app downloads. */
    wifi?:       string;
    /** Device ids this app appears on. Absent means every device. */
    devices?:    string[];
    widgets?:    CustomWidgetDef[];
    resource:    string;
}

export interface WeatherPayload {
    current: string;
    next:    string;
    time?:   { hour: number; minute: number };
}

interface SessionPayload {
    startMs: number;
}

export interface HealthPayload {
    steps:     number;
    distanceM: number;
    heartRate: number;
    state:     'idle' | 'walking' | 'running' | 'sprinting' | 'vehicle' | 'dead';
}

interface GroupInvitePush {
    id:          string;
    groupId:     string;
    groupName:   string;
    invitedBy:   string;
    memberCount: number;
    color:       string;
}

interface GroupRosterPush {
    groupId: string;
}

interface GroupDisbandPush {
    groupId: string;
    name?:   string;
}

interface CallPush {
    channel: number;
    name?:   string;
    number:  string;
}

interface CallEndedPush {
    channel: number;
    reason:  string;
}

interface FriendsUpdatePush {
    friends: {
        id:         string;
        name:       string;
        phone:      string;
        color:      string;
        youShare:   boolean;
        theyShare:  boolean;
        x?:         number;
        y?:         number;
        updatedAt?: number;
    }[];
}

export interface MessagesIncomingPush {
    id:           string;
    groupName?:   string;
    participants: { id: string; name: string; initials: string; color: string; avatar?: string; phone?: string }[];
    messages:     { id: string; from: string; body: string; kind: string; ts: number; read: boolean; reactions?: { emoji: string; count: number; mine: boolean }[]; gifUrl?: string; amount?: number; duration?: number; wpCode?: string; wpSub?: string }[];
    pinned:       boolean;
    muted:        boolean;
}

export interface RydeLatLng { label: string; x: number; y: number }
export interface RydeRequestPush { id: string; riderName: string; pickup: RydeLatLng; dropoff: RydeLatLng; distance: number; createdAt: number }
interface RydeTripPush {
    id: string; status: string; role: 'rider' | 'driver';
    requestId?: string;
    riderName?: string; driverName?: string;
    vehicle?: string; plate?: string; color?: string; rating?: number; number?: string;
    fare?: number; payment?: string; distance?: number;
    pickup?: RydeLatLng; dropoff?: RydeLatLng;
    rideId?: string; paid?: boolean; earn?: number; by?: string;
    waypoint?: { x: number; y: number };
}

interface ClassifiedFeedItem {
    id: string;
    title: string;
    body: string;
    price?: number;
    image?: string;
    images?: string[];
    number: string;
    email?: string;
    date?: string;
    mine?: boolean;
}
interface ClassifiedFeedPush {
    type: 'added' | 'updated' | 'removed';
    item?: ClassifiedFeedItem;
    id?: string;
}

interface MusicSharedTrack {
    id?: string;
    title?: string;
    artist?: string;
    album?: string;
    url: string;
    addedAt?: number;
}
interface MusicSharePush {
    kind: 'track' | 'playlist';
    track?: MusicSharedTrack;
    name?: string;
    tracks?: MusicSharedTrack[];
}

export type NuiMessage =
    | { action: 'sd-phone:open';    data: OpenPayload }
    | { action: 'sd-phone:apps';    data: { installedApps?: string[]; homeLayout?: string | null } }
    | { action: 'sd-phone:simState'; data: SimStatePush }
    | { action: 'sd-phone:frameColor'; data: { color: string } }
    | { action: 'sd-phone:music:receive'; data: MusicSharePush }
    | { action: 'sd-phone:pages:feed';       data: ClassifiedFeedPush }
    | { action: 'sd-phone:weazelnews:feed';  data: { type: 'changed' } }
    | { action: 'sd-phone:marketplace:feed'; data: ClassifiedFeedPush }
    | { action: 'sd-phone:ryde:requestAdded';   data: RydeRequestPush }
    | { action: 'sd-phone:ryde:requestRemoved'; data: { id: string } }
    | { action: 'sd-phone:ryde:waitingCount';   data: { count: number } }
    | { action: 'sd-phone:ryde:offer';          data: RydeTripPush }
    | { action: 'sd-phone:ryde:offerRemoved';   data: { id: string; requestId?: string } }
    | { action: 'sd-phone:ryde:tripUpdate';     data: RydeTripPush }
    | { action: 'sd-phone:ryde:ratingReceived'; data: { id: string; stars: number; tip?: number } }
    | { action: 'sd-phone:ryde:peerLocation';   data: { tripId: string; role: 'rider' | 'driver'; x: number; y: number; h: number } }
    | { action: 'sd-phone:close' }
    | { action: 'sd-phone:profileReset' }
    | { action: 'sd-phone:client:characterLoaded' }
    | { action: 'sd-phone:launchApp'; data: { id: string; link?: Record<string, unknown> } }
    | { action: 'sd-phone:battery'; data: number }
    | { action: 'sd-phone:service'; data: { bars: number; level: number; data: boolean } }
    | { action: 'sd-phone:wifi'; data: WifiState }
    | { action: 'sd-phone:weather'; data: WeatherPayload }
    | { action: 'sd-phone:session'; data: SessionPayload }
    | { action: 'sd-phone:gameClock'; data: GameClock }
    | { action: 'sd-phone:health';  data: HealthPayload }
    | { action: 'sd-phone:bank:received'; data: { amount: number; from: string } }
    | { action: 'sd-phone:bank:txAdded' }
    | { action: 'sd-phone:stocks:prices'; data: { assets: { symbol: string; price: number; changePct: number }[] } }
    | { action: 'sd-phone:mail:received';         data: unknown }
    | { action: 'sd-phone:camera:key';            data: { key: string } }
    | { action: 'sd-phone:camera:lock';           data: { on: boolean } }
    | { action: 'sd-phone:camera:faceCam';        data: { on: boolean } }
    | { action: 'sd-phone:photos:added';          data: { id: string; url: string; createdAt: string } }
    | { action: 'sd-phone:groups:inviteReceived'; data: GroupInvitePush }
    | { action: 'sd-phone:groups:memberJoined';   data: GroupRosterPush }
    | { action: 'sd-phone:groups:memberLeft';     data: GroupRosterPush }
    | { action: 'sd-phone:groups:disbanded';      data: GroupDisbandPush }
    | { action: 'sd-phone:groups:kicked';         data: GroupDisbandPush }
    | { action: 'sd-phone:groups:updated';        data: GroupRosterPush }
    | { action: 'sd-phone:maps:pinAdded';         data: { id: string; label: string; x: number; y: number; icon: string; color: string } }
    | { action: 'sd-phone:birdy:dmReceived';      data: {
        conversationId: string;
        user:    { name: string; handle: string; verified: boolean };
        message: BirdyMessage;
      } }
    | { action: 'sd-phone:birdy:dmReaction';      data: {
        conversationId: string;
        id:        string;
        reactions: Reaction[];
      } }
    | { action: 'sd-phone:birdy:notification' }
    | { action: 'sd-phone:birdy:feedChanged' }
    | { action: 'sd-phone:darkchat:message'; data: {
        roomId:  string;
        message: {
          id: string; author: string; body: string; at: string;
          kind?: string; mediaUrl?: string; audioUrl?: string; duration?: number; waveform?: number[];
          wpCode?: string; wpSub?: string; replyTo?: { name: string; body: string };
          reactions?: { emoji: string; count: number; mine: boolean }[];
        };
      } }
    | { action: 'sd-phone:darkchat:active'; data: { roomId: string; active: number } }
    | { action: 'sd-phone:darkchat:reaction'; data: { roomId: string; messageId: string; reactions: { emoji: string; count: number; mine: boolean }[] } }
    | { action: 'sd-phone:darkchat:kicked'; data: { roomId: string } }
    | { action: 'sd-phone:darkchat:code'; data: { roomId: string; code: string } }
    | { action: 'sd-phone:darkchat:members'; data: { roomId: string; members: number } }
    | { action: 'sd-phone:call:incoming';  data: CallPush }
    | { action: 'sd-phone:call:outgoing';  data: CallPush }
    | { action: 'sd-phone:call:connected'; data: { channel: number } }
    | { action: 'sd-phone:call:ended';     data: CallEndedPush }
    | { action: 'sd-phone:call:dropped';   data: { lost: boolean } }
    | { action: 'sd-phone:payphone:open';     data: { number: string; anonymous: boolean; myNumber?: string | null; favorites: { name: string; phone: string }[]; connected?: boolean; callerName?: string; coin?: { enabled: boolean; cost: number }; credited?: boolean } }
    | { action: 'sd-phone:payphone:outgoing'; data: { channel: number; number: string } }
    | { action: 'sd-phone:payphone:ended';    data: { channel: number; reason: string } }
    | { action: 'sd-phone:payphone:incoming';      data: { channel: number } }
    | { action: 'sd-phone:payphone:incomingEnded'; data: { channel: number } }
    | { action: 'sd-phone:radio:status';   data: { on: boolean; freq: number; standby?: boolean } }
    | { action: 'sd-phone:radio:onair';    data: { active: boolean } }
    | { action: 'sd-phone:radio:count';    data: { count: number } }
    | { action: 'sd-phone:radio:forceoff'; data: { message?: string } }
    | { action: 'sd-phone:video:request' }
    | { action: 'sd-phone:video:accept' }
    | { action: 'sd-phone:video:stop' }
    | { action: 'sd-phone:video:signal';   data: { kind: 'offer' | 'answer' | 'ice'; sdp?: string; candidate?: unknown } }
    | { action: 'sd-phone:voice:added';        data: { id: string; name: string; url: string; duration: number; date: string } }
    | { action: 'sd-phone:notes:added';        data: { id: string; body: string; sketches: string[]; images: string[]; createdAt: string; updatedAt: string } }
    | { action: 'sd-phone:documents:added';    data: { doc: DocFile } }
    | { action: 'sd-phone:documents:receive';  data: { doc: DocFile; fromName?: string } }
    | { action: 'sd-phone:documents:signRequest'; data: { requestId: string; fromName: string; doc: DocFile } }
    | { action: 'sd-phone:voice:uploadFailed'; data: { message?: string } }
    | { action: 'sd-phone:contacts:shared';    data: { id: string; name: string; phone: string; color: string; initials: string; avatar?: string } }
    | { action: 'sd-phone:contacts:removed';   data: { phone: string } }
    | { action: 'sd-phone:messages:incoming';  data: MessagesIncomingPush }
    | { action: 'sd-phone:messages:reaction';  data: { conversation: string; id: string; reactions: { emoji: string; count: number; mine: boolean }[] } }
    | { action: 'sd-phone:messages:removed';   data: { conversation: string } }
    | { action: 'sd-phone:messages:meta';      data: { conversation: string; id: string; requestStatus?: 'pending' | 'paid' | 'declined' | 'accepted' } }
    | { action: 'sd-phone:cherry:message';     data: { matchId: string; message: unknown } }
    | { action: 'sd-phone:cherry:match';       data: unknown }
    | { action: 'sd-phone:cherry:reaction';    data: { matchId: string; id: string; reactions: { emoji: string; count: number; mine: boolean }[] } }
    | { action: 'sd-phone:cherry:unmatch';     data: { matchId: string } }
    | { action: 'sd-phone:cherry:partner';     data: { username: string; partner: unknown } }
    | { action: 'sd-phone:photogram:notification' }
    | { action: 'sd-phone:photogram:dmReceived'; data: { peer: string; user: PhotogramUser; message: PhotogramDM } }
    | { action: 'sd-phone:photogram:dmReaction'; data: { peer: string; id: string; reactions: Reaction[] } }
    | { action: 'sd-phone:photogram:postChanged'; data: { postId: string; likes?: number; comments?: number; comment?: unknown } }
    | { action: 'sd-phone:photogram:feedChanged' }
    | { action: 'sd-phone:photogram:postRemoved'; data: { postId: string } }
    | { action: 'sd-phone:photogram:followChanged'; data: { target: string; status: 'none' | 'pending' | 'accepted' | 'self' } }
    | { action: 'sd-phone:photogram:liveFrame';   data: { liveId: string; frame: string } }
    | { action: 'sd-phone:photogram:liveChunk';   data: { liveId: string; chunk: string; init?: boolean; mime?: string } }
    | { action: 'sd-phone:photogram:liveComment'; data: { liveId: string; comment: { id: string; user: PhotogramUser; text: string } } }
    | { action: 'sd-phone:photogram:liveHeart';   data: { liveId: string } }
    | { action: 'sd-phone:photogram:liveViewers'; data: { liveId: string; viewers: number } }
    | { action: 'sd-phone:photogram:liveEnded';   data: { liveId: string } }
    | { action: 'sd-phone:photogram:liveChanged' }
    | { action: 'sd-phone:vibez:notification' }
    | { action: 'sd-phone:vibez:feedChanged' }
    | { action: 'sd-phone:vibez:postChanged';   data: { postId: string; likes?: number; comments?: number } }
    | { action: 'sd-phone:vibez:postRemoved';   data: { postId: string } }
    | { action: 'sd-phone:vibez:followChanged'; data: { target: string; following: boolean } }
    | { action: 'sd-phone:vibez:liveFrame';     data: { liveId: string; frame: string } }
    | { action: 'sd-phone:vibez:liveChunk';     data: { liveId: string; chunk: string; init?: boolean; mime?: string } }
    | { action: 'sd-phone:vibez:liveComment';   data: { liveId: string; comment: { id: string; user: VibezUser; text: string } } }
    | { action: 'sd-phone:vibez:liveHeart';     data: { liveId: string } }
    | { action: 'sd-phone:vibez:liveViewers';   data: { liveId: string; viewers: number } }
    | { action: 'sd-phone:vibez:liveEnded';     data: { liveId: string } }
    | { action: 'sd-phone:vibez:liveChanged' }
    | { action: 'sd-phone:voice:signalIn';        data: { from?: number; sid: string; kind: 'offer' | 'answer' | 'ice'; data: unknown } }
    | { action: 'sd-phone:voice:talkingState';    data: { on: boolean } }
    | { action: 'sd-phone:streaks:newPost';     data: { id: number; author: string; imageUrl: string; caption?: string; dayStreak: number; postDate: string; createdAt: number; likeCount: number; citizenid: string } }
    | { action: 'sd-phone:streaks:postChanged'; data: { postId: number; likeCount: number } }
    | { action: 'sd-phone:streaks:refresh' }
    | { action: 'sd-phone:mdt:dispatch'; data: { units: Unit[]; calls: Call[] } }
    | { action: 'sd-phone:mdt:call';     data: { call: Call } }
    | { action: 'sd-phone:mdt:chat';     data: { message: ChatMsg } }
    | { action: 'sd-phone:mdt:bulletin'; data: { bulletins: Bulletin[] } }
    | { action: 'sd-phone:mdt:warrant';  data: { citizenid: string; wanted: boolean } }
    | { action: 'sd-phone:racing:racesChanged' }
    | { action: 'sd-phone:racing:standings';  data: { raceId: string; entries: Standing[] } }
    | { action: 'sd-phone:racing:raceResult'; data: RaceResult }
    | { action: 'sd-phone:racing:hud:show';   data: { style: HudStyle; position: HudPosition; scale: number } }
    | { action: 'sd-phone:racing:hud:hide' }
    | { action: 'sd-phone:racing:hud:state';  data: Partial<HudState> }
    | { action: 'sd-phone:racing:hud:countdown'; data: { from: number } }
    | { action: 'sd-phone:racing:hud:dnf';    data: { seconds: number } }
    | { action: 'sd-phone:racing:markers';    data: { markers: HudMarker[]; color: string; colorClosest: string } }
    | { action: 'sd-phone:racing:board:show'; data: StartBoard }
    | { action: 'sd-phone:racing:board:pos';  data: { on: boolean; x: number; y: number; joined: boolean } }
    | { action: 'sd-phone:racing:board:hide' }
    | { action: 'sd-phone:racing:board:lineup'; data: { state: LineupState | null } }
    | { action: 'sd-phone:wipe' }
    | { action: 'sd-phone:admin:open'; data: { adminName?: string; sim?: boolean } }
    | { action: 'chess:invited';  data: { fromSrc: string; fromName: string; lobbyId: string } }
    | { action: 'chess:lobby';    data: { id: string; host: string; public: boolean; wager: number; isHost: boolean; canStart: boolean; members: { name: string; you: boolean; host: boolean; color: 'w' | 'b' | 'random'; canAfford: boolean; ready: boolean; returned: boolean }[] } }
    | { action: 'chess:lobbyClosed'; data: Record<string, never> }
    | { action: 'chess:start';    data: { gameId: string; color: 'w' | 'b'; opponent: string; pot: number } }
    | { action: 'chess:move';     data: { gameId: string; move: { from: number; to: number; promo?: string; flag?: string } } }
    | { action: 'chess:ended';    data: { reason: string } }
    | { action: 'connectfour:invited';  data: { fromSrc: string; fromName: string; lobbyId: string } }
    | { action: 'connectfour:lobby';    data: { id: string; host: string; public: boolean; wager: number; isHost: boolean; canStart: boolean; members: { name: string; you: boolean; host: boolean; color: string; canAfford: boolean; ready: boolean; returned: boolean }[] } }
    | { action: 'connectfour:lobbyClosed'; data: Record<string, never> }
    | { action: 'connectfour:start';    data: { gameId: string; color: string; opponent: string; pot: number } }
    | { action: 'connectfour:move';     data: { gameId: string; move: { col: number } } }
    | { action: 'connectfour:ended';    data: { reason: string } }
    | { action: 'battleship:invited';  data: { fromSrc: string; fromName: string; lobbyId: string } }
    | { action: 'battleship:lobby';    data: { id: string; host: string; public: boolean; wager: number; isHost: boolean; canStart: boolean; members: { name: string; you: boolean; host: boolean; color: string; canAfford: boolean; ready: boolean; returned: boolean }[] } }
    | { action: 'battleship:lobbyClosed'; data: Record<string, never> }
    | { action: 'battleship:start';    data: { gameId: string; color: string; opponent: string; pot: number } }
    | { action: 'battleship:move';     data: { gameId: string; move: { shot: { r: number; c: number } | null; prevResult: { hit: boolean; sunk: string | null } | null } } }
    | { action: 'battleship:ended';    data: { reason: string } }
    | { action: 'wordle:invited';      data: { fromSrc: string; fromName: string; lobbyId: string } }
    | { action: 'wordle:lobby';        data: { id: string; host: string; public: boolean; wager: number; isHost: boolean; canStart: boolean; members: { name: string; you: boolean; host: boolean; color: string; canAfford: boolean; ready: boolean; returned: boolean }[] } }
    | { action: 'wordle:lobbyClosed';  data: Record<string, never> }
    | { action: 'wordle:start';        data: { gameId: string; color: string; opponent: string; pot: number } }
    | { action: 'wordle:move';         data: { gameId: string; move: { rows: string[][]; solved: boolean; failed: boolean; tries: number; finishMs: number } } }
    | { action: 'wordle:ended';        data: { reason: string } }
    | { action: 'sd-phone:notification';       data: { id?: string; app?: string; image?: string; title: string; body?: string; time?: string; appId?: string; quietInApp?: boolean; otherPhone?: boolean; phoneColor?: string; profileKey?: string; link?: Record<string, unknown> } }
    | { action: 'sd-phone:badges';             data: Record<string, number> }
    | { action: 'sd-phone:badges:patch';       data: Record<string, number> }
    | { action: 'sd-phone:airshare';           data: { id: string; kind: string; fromName: string } }
    | { action: 'sd-phone:maps:friends:update'; data: FriendsUpdatePush }
    | { action: 'sd-phone:maps:location';       data: { x: number; y: number; h: number } }
    | { action: 'sd-phone:maps:calibrate';      data: { on: boolean } }
    | { action: 'sd-phone:maps:tilecheck' }
    | { action: 'sd-phone:services:inbox' }
    | { action: 'sd-phone:services:jobsChanged' }
    | { action: 'sd-phone:services:rosterChanged' }
    | { action: 'sd-phone:services:invoices' }
    | { action: 'sd-phone:homes:refresh' }
    | { action: 'customApps:set';     data: CustomAppDef[] }
    | { action: 'customApps:message'; data: { id: string; message: unknown } };
