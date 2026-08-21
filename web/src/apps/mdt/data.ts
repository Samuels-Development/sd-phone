import type { RelayGrant } from '@/shared/mediaSocket';

export interface EvidenceItem {
    url:   string;
    label: string;
}

export type MdtSection =
    | 'home'
    | 'dispatch'
    | 'profiles'
    | 'vehicles'
    | 'weapons'
    | 'cameras'
    | 'cctv'
    | 'reports'
    | 'cases'
    | 'warrants'
    | 'offences'
    | 'employees'
    | 'chat'
    | 'jail'
    | 'phone'
    | 'logs'
    | 'patients'
    | 'protocols'
    | 'affairs'
    | 'court'
    | 'expunge'
    | 'sops';

export type DepartmentType = 'leo' | 'ems' | 'doj';

export const LEO_SECTIONS: readonly MdtSection[] = [
    'home', 'dispatch', 'profiles', 'vehicles', 'weapons', 'reports', 'cases',
    'warrants', 'offences', 'cctv', 'cameras', 'sops', 'employees', 'affairs', 'chat', 'jail',
    'phone', 'logs',
] as const;

export const EMS_SECTIONS: readonly MdtSection[] = [
    'home', 'dispatch', 'patients', 'reports', 'cases',
    'protocols', 'sops', 'employees', 'chat', 'logs',
] as const;

export const DOJ_SECTIONS: readonly MdtSection[] = [
    'home', 'court', 'expunge', 'profiles', 'warrants', 'reports',
    'cases', 'offences', 'employees', 'chat', 'logs',
] as const;

export function sectionsFor(type: DepartmentType | undefined): readonly MdtSection[] {
    if (type === 'ems') return EMS_SECTIONS;
    if (type === 'doj') return DOJ_SECTIONS;
    return LEO_SECTIONS;
}

export type MdtPermission =
    | 'home.view'
    | 'phone.view'
    | 'persons.view'
    | 'persons.edit'
    | 'profiles.view'
    | 'vehicles.view'
    | 'vehicles.edit'
    | 'weapons.view'
    | 'weapons.edit'
    | 'cameras.view'
    | 'cctv.view'
    | 'reports.view'
    | 'reports.create'
    | 'reports.edit.own'
    | 'reports.edit.any'
    | 'reports.delete'
    | 'cases.view'
    | 'cases.create'
    | 'cases.edit'
    | 'cases.delete'
    | 'warrants.view'
    | 'warrants.issue'
    | 'warrants.close'
    | 'offences.view'
    | 'roster.view'
    | 'employees.view'
    | 'roster.callsign'
    | 'roster.radio'
    | 'roster.grade'
    | 'roster.dismiss'
    | 'dispatch.view'
    | 'dispatch.attach'
    | 'dispatch.status'
    | 'chat.view'
    | 'chat.send'
    | 'bulletins.view'
    | 'bulletins.manage'
    | 'jail.view'
    | 'jail.book'
    | 'logs.view'
    | 'me.update'
    | 'patients.view'
    | 'patients.edit'
    | 'protocols.view'
    | 'protocols.manage'
    | 'affairs.view'
    | 'affairs.file'
    | 'affairs.investigate'
    | 'affairs.close'
    | 'court.view'
    | 'court.file'
    | 'court.manage'
    | 'court.rule'
    | 'expunge.view'
    | 'expunge.file'
    | 'expunge.rule'
    | 'warrants.void'
    | 'sops.view';

export const SECTION_PERMISSION: Record<MdtSection, MdtPermission> = {
    home:      'home.view',
    dispatch:  'dispatch.view',
    profiles:  'persons.view',
    vehicles:  'vehicles.view',
    weapons:   'weapons.view',
    cameras:   'cameras.view',
    cctv:      'cctv.view',
    reports:   'reports.view',
    cases:     'cases.view',
    warrants:  'warrants.view',
    offences:  'offences.view',
    employees: 'roster.view',
    chat:      'chat.view',
    jail:      'jail.view',
    phone:     'phone.view',
    logs:      'logs.view',
    patients:  'patients.view',
    protocols: 'protocols.view',
    affairs:   'affairs.view',
    court:     'court.view',
    expunge:   'expunge.view',
    sops:      'sops.view',
};

export type ChargeClass = 'felony' | 'misdemeanor' | 'infraction';
export type ReportType = 'Incident' | 'Traffic' | 'Arrest' | 'Investigation' | 'Warrant';
export type InvolvedRole = 'suspect' | 'victim' | 'witness';

export type EmsReportType = 'Patient Care' | 'Trauma' | 'Cardiac' | 'Overdose' | 'Transport' | 'Death';
export type EmsInvolvedRole = 'patient' | 'witness' | 'responder' | 'other';

export type AnyReportType = ReportType | EmsReportType;
export type AnyInvolvedRole = InvolvedRole | EmsInvolvedRole;
export type ProtocolCategory = 'assessment' | 'airway' | 'cardiac' | 'trauma' | 'medical' | 'admin';
export type ProtocolPriority = 'immediate' | 'urgent' | 'routine';

export const EMS_REPORT_TYPES: readonly EmsReportType[] =
    ['Patient Care', 'Trauma', 'Cardiac', 'Overdose', 'Transport', 'Death'] as const;
export const EMS_INVOLVED_ROLES: readonly EmsInvolvedRole[] =
    ['patient', 'witness', 'responder', 'other'] as const;
export const BLOOD_TYPES: readonly string[] =
    ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

export interface Protocol {
    code:        string;
    label:       string;
    category:    ProtocolCategory;
    priority:    ProtocolPriority;
    description: string;
    body:        string;
}

export interface MedicalFile {
    bloodType:   string;
    allergies:   string;
    conditions:  string;
    medications: string;
    notes:       string;
    dnr:         boolean;
    updatedBy:   string;
    updatedAt:   number;
}

export interface PatientRow {
    citizenid:  string;
    name:       string;
    dob:        string;
    sex:        string;
    phone:      string;
    bloodType:  string;
    hasAllergy: boolean;
    dnr:        boolean;
}

export interface PatientPaperwork {
    ref:       string;
    title:     string;
    type:      string;
    role:      string;
    createdAt: number;
}

export interface PatientDetail {
    citizenid: string;
    name:      string;
    dob:       string;
    sex:       string;
    phone:     string;
    file:      MedicalFile;
    reports:   PatientPaperwork[];
}
export type CaseStatus = 'open' | 'in_progress' | 'closed';
export type CasePriority = 'low' | 'medium' | 'high';
export type CaseRole = 'primary' | 'assisting' | 'supervisor';
export type VehicleStatus = 'valid' | 'suspended' | 'expired' | 'impounded';
export type UnitCode = '10-8' | '10-6' | '10-7' | '10-90';
export type CallPriority = 1 | 2 | 3 | 4;
export type PersonFlag = 'wanted' | 'armed' | 'gang' | 'mental_health' | 'flight_risk' | 'informant';

export const CHARGE_CLASSES: readonly ChargeClass[] = ['felony', 'misdemeanor', 'infraction'] as const;
export const VEHICLE_STATUSES: readonly VehicleStatus[] = ['valid', 'suspended', 'expired', 'impounded'] as const;
export const UNIT_CODES: readonly UnitCode[] = ['10-8', '10-6', '10-7', '10-90'] as const;
export const PERSON_FLAGS: readonly PersonFlag[] = [
    'wanted', 'armed', 'gang', 'mental_health', 'flight_risk', 'informant',
] as const;

export interface Page<T> {
    rows:     T[];
    total:    number;
    page:     number;
    pageSize: number;
}

export interface Officer {
    citizenid:  string;
    name:       string;
    callsign?:  string;
    badge?:     string;
    radio?:     string;
    rank:       string;
    gradeLevel: number;
    avatar?:    string;
    duty:       boolean;
}

export interface Department {
    job:    string;
    label:  string;
    short:  string;
    type:   'leo' | 'ems' | 'doj';
    seal:   string;
    accent: string;
    bench?: boolean;
}

export interface Offence {
    code:        string;
    label:       string;
    class:       ChargeClass;
    months:      number;
    fine:        number;
    description: string;
}

export interface MdtBootstrap {
    me:         Officer;
    department: Department;
    grants:     MdtPermission[];
    offences:   Offence[];
    protocols:  Protocol[];
}

export interface PersonRow {
    citizenid: string;
    name:      string;
    dob:       string;
    sex:       string;
    phone:     string;
    wanted:    boolean;
    bolo:      boolean;
    mugshot?:  string;
}

export interface Prior {
    reportRef:   string;
    reportTitle: string;
    code:        string;
    label:       string;
    class:       ChargeClass;
    count:       number;
    date:        number;
}

export interface PersonDetail extends PersonRow {
    firstname:   string;
    lastname:    string;
    nationality: string;
    job:         string;
    jobGrade:    number;
    licences:    string[];
    fingerprint: string;
    bloodtype:   string;
    notes:       string;
    flags:       PersonFlag[];
    vehicles:    VehicleRow[];
    warrants:    Warrant[];
    priors:      Prior[];
    arrests:     number;
}

export interface VehicleRow {
    plate:      string;
    model:      string;
    owner:      string;
    ownerName:  string;
    status:     VehicleStatus;
    stolen:     boolean;
    bolo:       boolean;
}

export interface VehicleDetail extends VehicleRow {
    garage:     string;
    stored:     boolean;
    notes:      string;
    points:     number;
    image?:     string;
    updatedBy?: string;
    updatedAt?: number;
}

export type WeaponStatus = 'registered' | 'stolen' | 'seized' | 'destroyed';
export type WeaponClass = 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'sniper' | 'melee' | 'other';

export const WEAPON_STATUSES: readonly WeaponStatus[] =
    ['registered', 'stolen', 'seized', 'destroyed'] as const;
export const WEAPON_CLASSES: readonly WeaponClass[] =
    ['pistol', 'smg', 'rifle', 'shotgun', 'sniper', 'melee', 'other'] as const;

export interface WeaponRow {
    serial:       string;
    name:         string;
    class:        WeaponClass;
    owner:        string | null;
    ownerName:    string | null;
    status:       WeaponStatus;
    bolo:         boolean;
    registeredAt: number;
}

export interface WeaponDetail extends WeaponRow {
    notes:        string;
    ballistics:   boolean;
    registeredBy: string | null;
    updatedBy:    string | null;
    updatedAt:    number | null;
}

export type CameraKind = 'bodycam' | 'dashcam';
export type CameraQuality = 'preview' | 'full';
export type CameraStatus = 'live' | 'starting' | 'busy' | 'unsupported' | 'ready';

export interface CameraTile {
    id:        string;
    kind:      CameraKind;
    citizenid: string;
    officer:   string;
    callsign:  string | null;
    rank:      string | null;
    unit:      string | null;
    plate:     string | null;
    model:     string | null;
    status:    CameraStatus;
    viewers:   number;
    self:      boolean;
}

export interface CameraGrid {
    cameras:     CameraTile[];
    previews:    boolean;
    idleSeconds: number;
}

export interface CameraStream {
    cameraId: string;
    gen:      number;
    mime:     string | null;
    status:   CameraStatus;
    viewers:  number;
    relay:    RelayGrant | null;
}

export interface Charge {
    code:      string;
    label:     string;
    class:     ChargeClass;
    citizenid: string;
    name:      string;
    count:     number;
    months:    number;
    fine:      number;
}

export interface ChargeInput {
    code:       string;
    citizenid?: string;
    count:      number;
}

export interface Involved {
    citizenid: string;
    name:      string;
    role:      AnyInvolvedRole;
    notes?:    string;
}

export interface ReportSummary {
    ref:         string;
    title:       string;
    type:        AnyReportType;
    author:      string;
    authorCid:   string;
    callsign?:   string;
    chargeCount: number;
    createdAt:   number;
    updatedAt:   number;
}

export interface ReportDetail extends ReportSummary {
    body:        string;
    evidence:    EvidenceItem[];
    involved:    Involved[];
    charges:     Charge[];
    totalMonths: number;
    totalFine:   number;
    caseRef?:    string;
    canEdit:     boolean;
    canDelete:   boolean;
}

export interface ReportDraft {
    ref:      string | null;
    title:    string;
    type:     AnyReportType;
    body:     string;
    evidence: EvidenceItem[];
    involved: { citizenid: string; role: AnyInvolvedRole; notes?: string }[];
    charges:  ChargeInput[];
}

export interface CaseSummary {
    ref:       string;
    title:     string;
    status:    CaseStatus;
    priority:  CasePriority;
    officers:  number;
    reports:   number;
    createdBy: string;
    createdAt: number;
    updatedAt: number;
}

export interface CaseOfficer {
    citizenid: string;
    name:      string;
    callsign?: string;
    role:      CaseRole;
}

export interface CaseNote {
    id:        number;
    author:    string;
    callsign?: string;
    body:      string;
    createdAt: number;
}

export interface CaseDetail {
    ref:       string;
    title:     string;
    status:    CaseStatus;
    priority:  CasePriority;
    summary:   string;
    evidence:  EvidenceItem[];
    createdBy: string;
    createdAt: number;
    updatedAt: number;
    officers:  CaseOfficer[];
    notes:     CaseNote[];
    reports:   { ref: string; title: string; type: AnyReportType }[];
    canEdit:   boolean;
    canDelete: boolean;
}

export interface WarrantCharge {
    code:   string;
    label:  string;
    class:  ChargeClass;
    count:  number;
    months: number;
    fine:   number;
}

export interface Warrant {
    ref:          string;
    citizenid:    string;
    subject:      string;
    reportRef?:   string;
    charges:      WarrantCharge[];
    felonies:     number;
    misdemeanors: number;
    infractions:  number;
    bond:         number;
    officer:      string;
    callsign?:    string;
    issuedAt:     number;
    expiresAt:    number;
    active:       boolean;
}

export interface ArrestRow {
    ref:        string;
    reportRef?: string;
    citizenid:  string;
    subject:    string;
    officer:    string;
    callsign?:  string;
    charges:    WarrantCharge[];
    months:     number;
    fine:       number;
    jailed:     boolean;
    fined:      boolean;
    createdAt:  number;
}

export interface JailQuote {
    months:        number;
    fine:          number;
    charges:       Charge[];
    jailedAlready: boolean;
    finedAlready:  boolean;
    jailAvailable: boolean;
    maxReduction:  number;
    maxFineReduction: number;
    maxFine:       number;
}

export interface OfficerRow {
    citizenid:  string;
    name:       string;
    callsign?:  string;
    badge?:     string;
    radio?:     string;
    rank:       string;
    gradeLevel: number;
    avatar?:    string;
    online:     boolean;
    duty:       boolean;
    hours:      number;
    reports:    number;
    arrests:    number;
}

export interface GradeOption {
    level:  number;
    label:  string;
    isboss: boolean;
}

export interface RosterPage extends Page<OfficerRow> {
    grades?: GradeOption[];
}

export interface Unit {
    citizenid:  string;
    name:       string;
    callsign:   string;
    rank:       string;
    code:       UnitCode;
    department: string;
    domain:     DepartmentType;
    callId?:    string;
    coords?:    MapPoint;
}

export interface Call {
    id:         string;
    code:       string;
    type:       string;
    priority:   CallPriority;
    location:   string;
    direction?: string;
    suspect?:   string;
    weapon?:    string;
    units:      string[];
    unitCount:  number;
    createdAt:  number;
    expiresAt:  number;
    hasCoords:  boolean;
    coords?:    MapPoint;
}

export interface DispatchState {
    units: Unit[];
    calls: Call[];
}

export interface ChatMsg {
    id:        string;
    citizenid: string;
    name:      string;
    callsign?: string;
    avatar?:   string;
    body:      string;
    createdAt: number;
}

export interface Bulletin {
    id:              number;
    title:           string;
    body:            string;
    author:          string;
    authorCid:       string;
    authorCallsign?: string;
    createdAt:       number;
    updatedAt:       number;
}

export interface AuditRow {
    id:             number;
    actor:          string;
    actorCid:       string;
    actorCallsign?: string;
    action:         string;
    entityType?:    string;
    entityId?:      string;
    details?:       Record<string, unknown>;
    createdAt:      number;
}

export interface MdtHome {
    recentReports: ReportSummary[];
    bulletins:     Bulletin[];
    units:         Unit[];
}

export interface MapPoint {
    x: number;
    y: number;
}

export interface Coords {
    x: number;
    y: number;
    z: number;
}

export function emptyPage<T>(pageSize = 25): Page<T> {
    return { rows: [], total: 0, page: 1, pageSize };
}

export interface HandsetDevice {
    number:   string;
    name:     string;
    email:    string;
    address:  string;
    locale:   string;
    apps:     number;
    lastSeen: string | null;
    sim?:     { identity: string | null; owner: string | null; adopted: string | null; since: string | null };
}

export interface HandsetSummary {
    device:  HandsetDevice | null;
    counts?: { contacts: number; calls: number; photos: number; notes: number; memos: number };
    blocked?: { number: string; created_at: string }[];
}

export interface HandsetContact {
    name:       string;
    phone:      string;
    email:      string | null;
    favorite:   boolean;
    created_at: string;
}

export interface HandsetCall {
    number:     string;
    name:       string | null;
    direction:  string;
    duration:   number;
    called_at:  string;
    ownerCid?:  string | null;
    ownerName?: string | null;
}

export interface HandsetThread {
    id:                     string;
    name:                   string | null;
    isGroup:                boolean;
    messages:               number;
    last_message:           string | null;
    last_message_timestamp: string | null;
    members:                { number: string; name?: string | null; cid?: string | null }[];
}

export interface HandsetMessage {
    id:          string;
    sender:      string;
    senderName?: string | null;
    content:     string | null;
    attachments: string | null;
    timestamp:   string;
    outgoing:    boolean;
}

export interface HandsetMemo {
    id:         string;
    name:       string | null;
    url:        string;
    duration:   number;
    created_at: string;
}

export interface HandsetPhoto {
    id:         string;
    url:        string;
    created_at: string;
}

export interface HandsetNote {
    id:          string;
    body:        string | null;
    images:      string[];
    sketchCount: number;
    hasSketch:   boolean;
    hasImage:    boolean;
    created_at:  string;
    updated_at:  string;
}

export interface HandsetAccounts {
    mail: { email: string; display_name: string | null; created_at: string }[];
    apps: { app: string; username: string; display_name: string | null; created_at: string }[];
}

export type IaCategory = 'force' | 'misconduct' | 'corruption' | 'negligence' | 'discourtesy' | 'pursuit' | 'other';
export type IaStatus = 'open' | 'investigating' | 'review' | 'closed';
export type IaSeverity = 'low' | 'medium' | 'high';
export type IaDisposition = 'sustained' | 'unfounded' | 'exonerated' | 'not_sustained';
export type IaDiscipline = 'none' | 'counselling' | 'reprimand' | 'suspension' | 'demotion' | 'termination';

export const IA_CATEGORIES: readonly IaCategory[] =
    ['force', 'misconduct', 'corruption', 'negligence', 'discourtesy', 'pursuit', 'other'] as const;
export const IA_STATUSES: readonly IaStatus[] = ['open', 'investigating', 'review', 'closed'] as const;
export const IA_SEVERITIES: readonly IaSeverity[] = ['low', 'medium', 'high'] as const;
export const IA_DISPOSITIONS: readonly IaDisposition[] =
    ['sustained', 'unfounded', 'exonerated', 'not_sustained'] as const;
export const IA_DISCIPLINE: readonly IaDiscipline[] =
    ['none', 'counselling', 'reprimand', 'suspension', 'demotion', 'termination'] as const;

export interface IaNote {
    author:    string;
    body:      string;
    createdAt: number;
}

export interface IaSummary {
    ref:       string;
    title:     string;
    subject:   string;
    subjectId: string;
    rank:      string;
    category:  IaCategory;
    status:    IaStatus;
    severity:  IaSeverity;
    filedBy:   string;
    assigned:  string | null;
    createdAt: number;
    updatedAt: number;
}

export interface IaDetail extends IaSummary {
    summary:     string;
    evidence:    EvidenceItem[];
    disposition: IaDisposition | null;
    discipline:  IaDiscipline | null;
    finding:     string;
    assignedId:  string | null;
    closedAt:    number | null;
    notes:       IaNote[];
}

export type CourtStatus = 'filed' | 'arraigned' | 'scheduled' | 'trial' | 'closed' | 'dismissed';
export type CourtPlea = 'guilty' | 'not_guilty' | 'no_contest';
export type CourtVerdict = 'guilty' | 'not_guilty' | 'dismissed' | 'mistrial' | 'plea';
export type CourtNoteKind = 'note' | 'motion' | 'filing' | 'ruling';

export const COURT_STATUSES: readonly CourtStatus[] =
    ['filed', 'arraigned', 'scheduled', 'trial', 'closed', 'dismissed'] as const;
export const COURT_PLEAS: readonly CourtPlea[] = ['guilty', 'not_guilty', 'no_contest'] as const;
export const COURT_VERDICTS: readonly CourtVerdict[] =
    ['guilty', 'not_guilty', 'dismissed', 'mistrial', 'plea'] as const;
export const COURT_NOTE_KINDS: readonly CourtNoteKind[] = ['note', 'motion', 'filing', 'ruling'] as const;

export interface CourtNote {
    author:    string;
    kind:      CourtNoteKind;
    body:      string;
    createdAt: number;
}

export interface CourtSummary {
    ref:        string;
    title:      string;
    defendant:  string;
    citizenid:  string;
    status:     CourtStatus;
    plea:       CourtPlea | null;
    verdict:    CourtVerdict | null;
    hearingAt:  number | null;
    judge:      string | null;
    prosecutor: string | null;
    defence:    string | null;
    charges:    number;
    createdAt:  number;
    updatedAt:  number;
}

export interface CourtDetail extends Omit<CourtSummary, 'charges'> {
    charges:        WarrantCharge[];
    evidence:       EvidenceItem[];
    summary:        string;
    ruling:         string;
    reportRef:      string | null;
    sentenceMonths: number;
    sentenceFine:   number;
    filedBy:        string;
    judgeId:        string | null;
    prosecutorId:   string | null;
    defenceId:      string | null;
    notes:          CourtNote[];
}

export type PetitionStatus = 'pending' | 'granted' | 'denied';

export const PETITION_STATUSES: readonly PetitionStatus[] = ['pending', 'granted', 'denied'] as const;

export interface Petition {
    ref:       string;
    citizenid: string;
    subject:   string;
    scope:     string[];
    reason:    string;
    status:    PetitionStatus;
    ruling:    string;
    filedBy:   string;
    ruledBy:   string | null;
    cleared:   number;
    createdAt: number;
    updatedAt: number;
}

export interface Sop {
    code:     string;
    title:    string;
    category: string;
    summary:  string;
    revised:  string;
    body:     string;
}
