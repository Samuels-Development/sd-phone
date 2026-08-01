import { apiCall, apiData } from '@/core/api';
import { isFiveM } from '@/core/nui';
import {
    emptyPage,
    type ArrestRow,
    type AuditRow,
    type Bulletin,
    type Call,
    type CaseDetail,
    type CaseRole,
    type CaseStatus,
    type CasePriority,
    type CaseSummary,
    type Charge,
    type ChargeInput,
    type ChatMsg,
    type Coords,
    type DispatchState,
    type JailQuote,
    type MdtBootstrap,
    type MdtHome,
    type Offence,
    type OfficerRow,
    type Page,
    type PersonDetail,
    type PersonFlag,
    type PersonRow,
    type ReportDetail,
    type ReportDraft,
    type ReportSummary,
    type ReportType,
    type RosterPage,
    type UnitCode,
    type Unit,
    type VehicleDetail,
    type VehicleRow,
    type VehicleStatus,
    type Department,
    type DepartmentType,
    type MedicalFile,
    type PatientDetail,
    type PatientPaperwork,
    type PatientRow,
    type Protocol,
    type Warrant,
    type WarrantCharge,
} from './data';

const HOUR = 3600;
const DAY = 86400;
const now = Math.floor(Date.now() / 1000);

const DEV_OFFENCES: Offence[] = [
    { code: 'PC 104', label: 'Assault With a Deadly Weapon', class: 'felony', months: 32, fine: 4000, description: 'Causing or attempting to cause injury while using or displaying a weapon.' },
    { code: 'PC 110', label: 'Involuntary Manslaughter', class: 'felony', months: 60, fine: 8000, description: 'Causing the death of another person through recklessness rather than intent.' },
    { code: 'PC 204', label: 'Vehicle Theft', class: 'felony', months: 15, fine: 1200, description: 'Taking a vehicle belonging to another person without their permission.' },
    { code: 'PC 211', label: 'Armed Robbery', class: 'felony', months: 32, fine: 3500, description: 'Taking property by force while carrying or displaying a weapon.' },
    { code: 'PC 803', label: 'Possession of a Class C Firearm', class: 'felony', months: 30, fine: 4000, description: 'Holding an automatic or military grade firearm without a licence.' },
    { code: 'PC 202', label: 'Grand Theft', class: 'misdemeanor', months: 10, fine: 800, description: 'Taking property of substantial value.' },
    { code: 'PC 501', label: 'Resisting Arrest', class: 'misdemeanor', months: 6, fine: 400, description: 'Physically refusing to submit to a lawful arrest.' },
    { code: 'PC 918', label: 'Reckless Driving', class: 'misdemeanor', months: 10, fine: 800, description: 'Driving with deliberate disregard for the safety of others.' },
    { code: 'PC 924', label: 'Evading in a Vehicle', class: 'misdemeanor', months: 10, fine: 800, description: 'Failing to stop for a marked police vehicle.' },
    { code: 'PC 601', label: 'Disorderly Conduct', class: 'infraction', months: 0, fine: 250, description: 'Behaving in a way that creates a hazardous or offensive condition in public.' },
    { code: 'PC 902', label: 'Second Degree Speeding', class: 'infraction', months: 0, fine: 400, description: 'Exceeding the posted limit by up to thirty five miles per hour.' },
    { code: 'PC 915', label: 'Unauthorised Parking', class: 'infraction', months: 0, fine: 300, description: 'Leaving a vehicle where parking is not permitted.' },
];

const DEV_BOOTSTRAP: MdtBootstrap = {
    me: {
        citizenid: 'WHT44012',
        name: 'Dana Whitlock',
        callsign: 'LS-114',
        badge: '0184',
        radio: '3',
        rank: 'Sergeant',
        gradeLevel: 3,
        duty: true,
    },
    department: {
        job: 'police',
        label: 'Los Santos Police Department',
        short: 'LSPD',
        type: 'leo',
        seal: 'lspd',
        accent: '#1D4ED8',
    },
    grants: [
        'home.view', 'persons.view', 'persons.edit', 'profiles.view',
        'vehicles.view', 'vehicles.edit',
        'reports.view', 'reports.create', 'reports.edit.own', 'reports.edit.any', 'reports.delete',
        'cases.view', 'cases.create', 'cases.edit', 'cases.delete',
        'warrants.view', 'warrants.issue', 'warrants.close',
        'offences.view', 'offences.manage', 'offences.delete',
        'roster.view', 'employees.view', 'roster.callsign', 'roster.radio', 'roster.grade', 'roster.dismiss',
        'dispatch.view', 'dispatch.attach', 'dispatch.status',
        'chat.view', 'chat.send',
        'bulletins.view', 'bulletins.manage',
        'jail.view', 'jail.book',
        'logs.view', 'me.update',
        'patients.view', 'patients.edit', 'protocols.view', 'protocols.manage',
    ],
    offences: DEV_OFFENCES,
    protocols: [],
};

const DEV_EMS_DEPARTMENT: Department = {
    job: 'ambulance',
    label: 'San Andreas Medical Services',
    short: 'SAMS',
    type: 'ems',
    seal: 'ems',
    accent: '#E11D48',
};

let DEV_PROTOCOLS: Protocol[] = [
    { code: 'TP 101', label: 'Primary Survey', category: 'assessment', priority: 'immediate',
      description: 'Airway, breathing, circulation, disability, exposure, in that order.',
      body: 'Establish scene safety before approach. Check responsiveness, then airway patency with cervical spine control where trauma is suspected. Record a baseline set of observations before any intervention that is not immediately life saving.' },
    { code: 'TP 102', label: 'Catastrophic Haemorrhage', category: 'trauma', priority: 'immediate',
      description: 'Control life threatening bleeding before anything else.',
      body: 'Direct pressure first. Escalate to a pressure dressing, then to a tourniquet placed high and tight on the affected limb. Record the time the tourniquet went on and hand that time over verbally.' },
    { code: 'TP 104', label: 'Cardiac Arrest', category: 'cardiac', priority: 'immediate',
      description: 'Compressions, early defibrillation, minimal interruption.',
      body: 'Begin compressions at 100 to 120 per minute to a depth of 5 to 6cm. Apply the defibrillator as soon as it is to hand. Rotate the compressor every two minutes.' },
    { code: 'TP 106', label: 'Anaphylaxis', category: 'medical', priority: 'immediate',
      description: 'Adrenaline first, and early.',
      body: 'Remove the trigger where it can be removed. Give adrenaline into the outer thigh without waiting for the airway to close. Repeat after five minutes if there is no improvement.' },
    { code: 'TP 111', label: 'Seizure', category: 'medical', priority: 'urgent',
      description: 'Protect from harm, time it, do not restrain.',
      body: 'Clear the space around the patient and cushion the head. Time the seizure from first movement. Never place anything in the mouth.' },
    { code: 'TP 118', label: 'Handover', category: 'admin', priority: 'routine',
      description: 'The structured handover the receiving team expects.',
      body: 'Age and presenting complaint, mechanism or history, the observations recorded and the trend across them, treatment given and the response to it, and anything outstanding.' },
];

const DEV_MEDICAL: Record<string, MedicalFile> = {
    MRN91223: {
        bloodType: 'O-', allergies: 'Penicillin, latex', conditions: 'Asthma',
        medications: 'Salbutamol inhaler', dnr: false,
        notes: 'Two admissions this month for respiratory distress. Carries her own inhaler; confirm she has used it before assisting.',
        updatedBy: 'M-102 Priya Raman', updatedAt: Math.floor(Date.now() / 1000) - 86_400,
    },
    KRR40118: {
        bloodType: 'A+', allergies: '', conditions: 'Type 1 diabetes',
        medications: 'Insulin', dnr: false,
        notes: 'Hypoglycaemic episode on scene at Strawberry. Responded to oral glucose.',
        updatedBy: 'M-114 Dana Whitlock', updatedAt: Math.floor(Date.now() / 1000) - 3_600 * 9,
    },
};

const DEV_PATIENT_PAPERWORK: Record<string, PatientPaperwork[]> = {
    MRN91223: [
        { ref: 'R-0051', title: 'Respiratory distress, Vespucci Beach', type: 'Patient Care', role: 'patient', createdAt: Math.floor(Date.now() / 1000) - 7_200 },
        { ref: 'R-0044', title: 'Asthma attack, Del Perro Pier', type: 'Patient Care', role: 'patient', createdAt: Math.floor(Date.now() / 1000) - 86_400 * 6 },
    ],
    KRR40118: [
        { ref: 'R-0049', title: 'Hypoglycaemia, Strawberry Avenue', type: 'Patient Care', role: 'patient', createdAt: Math.floor(Date.now() / 1000) - 3_600 * 9 },
    ],
};

const EMPTY_FILE: MedicalFile = {
    bloodType: '', allergies: '', conditions: '', medications: '',
    notes: '', dnr: false, updatedBy: '', updatedAt: 0,
};

function devFile(citizenid: string): MedicalFile {
    return DEV_MEDICAL[citizenid] ?? { ...EMPTY_FILE };
}

function devPatientRow(citizenid: string, name: string, dob: string, sex: string, phone: string): PatientRow {
    const file = devFile(citizenid);
    return { citizenid, name, dob, sex, phone, bloodType: file.bloodType, hasAllergy: file.allergies !== '', dnr: file.dnr };
}

let DEV_PERSONS: PersonDetail[] = [
    {
        citizenid: 'MRN91223', name: 'Elena Moreno', firstname: 'Elena', lastname: 'Moreno',
        dob: '1994-03-11', sex: 'F', phone: '5550142', nationality: 'American',
        job: 'mechanic', jobGrade: 2, licences: ['driver'], fingerprint: 'MR91-2238-KX',
        bloodtype: 'O+', wanted: false, bolo: false, notes: 'Cooperative at the Sandy Shores callout. No prior contact.',
        flags: [], vehicles: [], warrants: [], priors: [], arrests: 0,
    },
    {
        citizenid: 'KRV20884', name: 'Marcus Kerrigan', firstname: 'Marcus', lastname: 'Kerrigan',
        dob: '1988-11-02', sex: 'M', phone: '5550977', nationality: 'American',
        job: 'unemployed', jobGrade: 0, licences: [], fingerprint: 'KR20-8841-PN',
        bloodtype: 'A-', wanted: true, bolo: false,
        notes: 'Known to run from traffic stops. Approach with a second unit.',
        flags: ['wanted', 'flight_risk'], vehicles: [], warrants: [], priors: [], arrests: 2,
    },
    {
        citizenid: 'ODN55310', name: 'Priya Odenkirk', firstname: 'Priya', lastname: 'Odenkirk',
        dob: '1991-07-26', sex: 'F', phone: '5550388', nationality: 'American',
        job: 'lawyer', jobGrade: 3, licences: ['driver', 'weapon'], fingerprint: 'OD55-3107-QT',
        bloodtype: 'B+', wanted: false, bolo: false, notes: '', flags: [],
        vehicles: [], warrants: [], priors: [], arrests: 0,
    },
    {
        citizenid: 'BSH70145', name: 'Cody Bashir', firstname: 'Cody', lastname: 'Bashir',
        dob: '1999-01-19', sex: 'M', phone: '5550613', nationality: 'American',
        job: 'unemployed', jobGrade: 0, licences: ['driver'], fingerprint: 'BS70-1459-WL',
        bloodtype: 'AB+', wanted: false, bolo: true,
        notes: 'Vehicle seen leaving the Vespucci boardwalk incident. Not yet interviewed.',
        flags: ['gang'], vehicles: [], warrants: [], priors: [], arrests: 1,
    },
    {
        citizenid: 'TLM33927', name: 'Ruth Tillman', firstname: 'Ruth', lastname: 'Tillman',
        dob: '1976-09-04', sex: 'F', phone: '5550250', nationality: 'American',
        job: 'trucker', jobGrade: 1, licences: ['driver'], fingerprint: 'TL33-9271-DV',
        bloodtype: 'O-', wanted: false, bolo: false, notes: '', flags: [],
        vehicles: [], warrants: [], priors: [], arrests: 0,
    },
    {
        citizenid: 'GRC18760', name: 'Andre Garcia', firstname: 'Andre', lastname: 'Garcia',
        dob: '1985-05-30', sex: 'M', phone: '5550801', nationality: 'American',
        job: 'taxi', jobGrade: 1, licences: ['driver'], fingerprint: 'GR18-7602-HM',
        bloodtype: 'A+', wanted: false, bolo: false, notes: 'Witness on the Mirror Park pursuit.',
        flags: [], vehicles: [], warrants: [], priors: [], arrests: 0,
    },
];

let DEV_VEHICLES: VehicleDetail[] = [
    { plate: '48NRA221', model: 'Sultan RS', owner: 'KRV20884', ownerName: 'Marcus Kerrigan', status: 'suspended', stolen: false, bolo: true, garage: 'Legion Square', stored: false, notes: 'Seen fleeing the Route 68 stop. Rear plate partially obscured.', points: 9 },
    { plate: '19KLM604', model: 'Blista', owner: 'MRN91223', ownerName: 'Elena Moreno', status: 'valid', stolen: false, bolo: false, garage: 'Pillbox Hill', stored: true, notes: '', points: 0 },
    { plate: '73XQP180', model: 'Gauntlet', owner: 'BSH70145', ownerName: 'Cody Bashir', status: 'valid', stolen: true, bolo: true, garage: 'Mirror Park', stored: false, notes: 'Reported stolen from the Del Perro lot on the 14th.', points: 3 },
    { plate: '55TDW903', model: 'Phoenix', owner: 'GRC18760', ownerName: 'Andre Garcia', status: 'expired', stolen: false, bolo: false, garage: 'Vespucci', stored: true, notes: 'Registration lapsed. Owner advised at the roadside.', points: 2 },
    { plate: '62HVN447', model: 'Packer', owner: 'TLM33927', ownerName: 'Ruth Tillman', status: 'valid', stolen: false, bolo: false, garage: 'Elysian Island', stored: true, notes: '', points: 0 },
    { plate: '30QSF715', model: 'Comet', owner: 'ODN55310', ownerName: 'Priya Odenkirk', status: 'impounded', stolen: false, bolo: false, garage: 'Impound', stored: false, notes: 'Held pending the collision investigation on Power Street.', points: 0 },
];

function charge(code: string, citizenid: string, name: string, count: number): Charge {
    const o = DEV_OFFENCES.find(x => x.code === code) ?? DEV_OFFENCES[0];
    return { code: o.code, label: o.label, class: o.class, citizenid, name, count, months: o.months, fine: o.fine };
}

function line(code: string, count: number): WarrantCharge {
    const o = DEV_OFFENCES.find(x => x.code === code) ?? DEV_OFFENCES[0];
    return { code: o.code, label: o.label, class: o.class, count, months: o.months, fine: o.fine };
}

let DEV_REPORTS: ReportDetail[] = [
    {
        ref: 'R-0042', title: 'Armed robbery at the Strawberry Rob’s Liquor', type: 'Incident',
        author: 'Dana Whitlock', authorCid: 'WHT44012', callsign: 'LS-114',
        chargeCount: 2, createdAt: now - 3 * HOUR, updatedAt: now - 2 * HOUR,
        body: 'Units responded to a hold-up alarm at Rob’s Liquor on Strawberry Avenue at 21:14. The clerk described a single male suspect who left southbound in a dark sedan. Register drawer was emptied. Scene was held for prints and the store camera was seized.',
        involved: [
            { citizenid: 'KRV20884', name: 'Marcus Kerrigan', role: 'suspect', notes: 'Identified from the store camera.' },
            { citizenid: 'MRN91223', name: 'Elena Moreno', role: 'witness', notes: 'Was refuelling opposite the store.' },
        ],
        charges: [charge('PC 211', 'KRV20884', 'Marcus Kerrigan', 1), charge('PC 501', 'KRV20884', 'Marcus Kerrigan', 1)],
        totalMonths: 38, totalFine: 3900, caseRef: 'C-0007', canEdit: true, canDelete: true,
    },
    {
        ref: 'R-0041', title: 'Pursuit terminated at Mirror Park Boulevard', type: 'Traffic',
        author: 'Miles Okafor', authorCid: 'OKF77120', callsign: 'LS-208',
        chargeCount: 2, createdAt: now - 9 * HOUR, updatedAt: now - 9 * HOUR,
        body: 'Vehicle failed to stop for a marked unit on Mirror Park Boulevard and was pursued for roughly two miles before the driver abandoned it on foot. Vehicle recovered and towed. Driver not located.',
        involved: [{ citizenid: 'BSH70145', name: 'Cody Bashir', role: 'suspect' }],
        charges: [charge('PC 924', 'BSH70145', 'Cody Bashir', 1), charge('PC 918', 'BSH70145', 'Cody Bashir', 1)],
        totalMonths: 20, totalFine: 1600, canEdit: false, canDelete: true,
    },
    {
        ref: 'R-0040', title: 'Recovered stolen vehicle, Del Perro lot', type: 'Investigation',
        author: 'Dana Whitlock', authorCid: 'WHT44012', callsign: 'LS-114',
        chargeCount: 1, createdAt: now - DAY, updatedAt: now - 20 * HOUR,
        body: 'Plate 73XQP180 flagged stolen was recovered from the Del Perro parking structure, level two. Vehicle was locked and undamaged. Forensics attended for prints on the driver door.',
        involved: [{ citizenid: 'BSH70145', name: 'Cody Bashir', role: 'suspect' }],
        charges: [charge('PC 204', 'BSH70145', 'Cody Bashir', 1)],
        totalMonths: 15, totalFine: 1200, caseRef: 'C-0007', canEdit: true, canDelete: true,
    },
    {
        ref: 'R-0039', title: 'Traffic collision, Power Street and Alta', type: 'Traffic',
        author: 'Rosa Bianchi', authorCid: 'BNC30554', callsign: 'LS-301',
        chargeCount: 0, createdAt: now - 2 * DAY, updatedAt: now - 2 * DAY,
        body: 'Two vehicle collision at the Power Street junction. No injuries reported. Both drivers exchanged details at the scene and one vehicle was recovered to the impound lot pending an insurance check.',
        involved: [
            { citizenid: 'ODN55310', name: 'Priya Odenkirk', role: 'victim' },
            { citizenid: 'GRC18760', name: 'Andre Garcia', role: 'witness' },
        ],
        charges: [], totalMonths: 0, totalFine: 0, canEdit: false, canDelete: true,
    },
    {
        ref: 'R-0038', title: 'Arrest report, Kerrigan', type: 'Arrest',
        author: 'Dana Whitlock', authorCid: 'WHT44012', callsign: 'LS-114',
        chargeCount: 1, createdAt: now - 4 * DAY, updatedAt: now - 4 * DAY,
        body: 'Subject was detained without incident outside the Vinewood motel and transported to Mission Row for booking. Property was logged and the subject declined a phone call at intake.',
        involved: [{ citizenid: 'KRV20884', name: 'Marcus Kerrigan', role: 'suspect' }],
        charges: [charge('PC 202', 'KRV20884', 'Marcus Kerrigan', 2)],
        totalMonths: 20, totalFine: 1600, canEdit: true, canDelete: true,
    },
];

let DEV_CASES: CaseDetail[] = [
    {
        ref: 'C-0007', title: 'Strawberry commercial robbery series', status: 'in_progress', priority: 'high',
        createdBy: 'Dana Whitlock', createdAt: now - 5 * DAY, updatedAt: now - 2 * HOUR,
        summary: 'Three armed hold-ups of off-licences in the Strawberry and Davis corridor over eleven days. Same description of the suspect vehicle each time.',
        officers: [
            { citizenid: 'WHT44012', name: 'Dana Whitlock', callsign: 'LS-114', role: 'primary' },
            { citizenid: 'OKF77120', name: 'Miles Okafor', callsign: 'LS-208', role: 'assisting' },
            { citizenid: 'HRT10098', name: 'Grace Hartley', callsign: 'LS-100', role: 'supervisor' },
        ],
        notes: [
            { id: 3, author: 'Miles Okafor', callsign: 'LS-208', body: 'Store camera from the third job is the clearest so far. Sending stills to the roster board.', createdAt: now - 3 * HOUR },
            { id: 2, author: 'Dana Whitlock', callsign: 'LS-114', body: 'Recovered plate matches the sedan on two of the three scenes.', createdAt: now - 20 * HOUR },
            { id: 1, author: 'Dana Whitlock', callsign: 'LS-114', body: 'Case opened. Linking the Strawberry and Davis reports.', createdAt: now - 5 * DAY },
        ],
        reports: [
            { ref: 'R-0042', title: 'Armed robbery at the Strawberry Rob’s Liquor', type: 'Incident' },
            { ref: 'R-0040', title: 'Recovered stolen vehicle, Del Perro lot', type: 'Investigation' },
        ],
        canEdit: true, canDelete: true,
    },
    {
        ref: 'C-0006', title: 'Boardwalk assault, Vespucci', status: 'open', priority: 'medium',
        createdBy: 'Rosa Bianchi', createdAt: now - 8 * DAY, updatedAt: now - 3 * DAY,
        summary: 'Late night assault outside the Vespucci arcade. Victim declined to give a statement at the scene and has not returned calls.',
        officers: [{ citizenid: 'BNC30554', name: 'Rosa Bianchi', callsign: 'LS-301', role: 'primary' }],
        notes: [{ id: 1, author: 'Rosa Bianchi', callsign: 'LS-301', body: 'Third attempt to reach the victim. Leaving open for now.', createdAt: now - 3 * DAY }],
        reports: [], canEdit: true, canDelete: true,
    },
    {
        ref: 'C-0005', title: 'Chop shop, Cypress Flats', status: 'closed', priority: 'low',
        createdBy: 'Grace Hartley', createdAt: now - 26 * DAY, updatedAt: now - 12 * DAY,
        summary: 'Warehouse cleared and the parts inventory seized. No further lines of enquiry.',
        officers: [
            { citizenid: 'HRT10098', name: 'Grace Hartley', callsign: 'LS-100', role: 'primary' },
            { citizenid: 'OKF77120', name: 'Miles Okafor', callsign: 'LS-208', role: 'assisting' },
        ],
        notes: [], reports: [], canEdit: true, canDelete: true,
    },
];

let DEV_WARRANTS: Warrant[] = [
    {
        ref: 'W-0011', citizenid: 'KRV20884', subject: 'Marcus Kerrigan', reportRef: 'R-0042',
        charges: [line('PC 211', 1), line('PC 501', 1)],
        felonies: 1, misdemeanors: 1, infractions: 0, bond: 25000,
        officer: 'Dana Whitlock', callsign: 'LS-114',
        issuedAt: now - 2 * HOUR, expiresAt: now + 6 * DAY, active: true,
    },
    {
        ref: 'W-0010', citizenid: 'BSH70145', subject: 'Cody Bashir', reportRef: 'R-0041',
        charges: [line('PC 924', 1), line('PC 918', 1)],
        felonies: 0, misdemeanors: 2, infractions: 0, bond: 5000,
        officer: 'Miles Okafor', callsign: 'LS-208',
        issuedAt: now - 9 * HOUR, expiresAt: now + 5 * DAY, active: true,
    },
    {
        ref: 'W-0009', citizenid: 'GRC18760', subject: 'Andre Garcia',
        charges: [line('PC 902', 1)],
        felonies: 0, misdemeanors: 0, infractions: 1, bond: 0,
        officer: 'Rosa Bianchi', callsign: 'LS-301',
        issuedAt: now - 20 * DAY, expiresAt: now - 13 * DAY, active: false,
    },
];

let DEV_ARRESTS: ArrestRow[] = [
    {
        ref: 'A-0018', reportRef: 'R-0038', citizenid: 'KRV20884', subject: 'Marcus Kerrigan',
        officer: 'Dana Whitlock', callsign: 'LS-114',
        charges: [line('PC 202', 2)],
        months: 20, fine: 1600, jailed: true, fined: true, createdAt: now - 4 * DAY,
    },
    {
        ref: 'A-0017', reportRef: 'R-0039', citizenid: 'BSH70145', subject: 'Cody Bashir',
        officer: 'Rosa Bianchi', callsign: 'LS-301',
        charges: [line('PC 601', 1)],
        months: 0, fine: 250, jailed: false, fined: true, createdAt: now - 6 * DAY,
    },
    {
        ref: 'A-0016', citizenid: 'GRC18760', subject: 'Andre Garcia',
        officer: 'Miles Okafor', callsign: 'LS-208',
        charges: [line('PC 915', 1)],
        months: 0, fine: 300, jailed: false, fined: true, createdAt: now - 11 * DAY,
    },
];

let DEV_ROSTER: OfficerRow[] = [
    { citizenid: 'HRT10098', name: 'Grace Hartley', callsign: 'LS-100', badge: '0100', radio: '1', rank: 'Chief', gradeLevel: 4, online: true, duty: true, hours: 412, reports: 96, arrests: 41 },
    { citizenid: 'WHT44012', name: 'Dana Whitlock', callsign: 'LS-114', badge: '0184', radio: '3', rank: 'Sergeant', gradeLevel: 3, online: true, duty: true, hours: 268, reports: 61, arrests: 33 },
    { citizenid: 'OKF77120', name: 'Miles Okafor', callsign: 'LS-208', badge: '0208', radio: '3', rank: 'Corporal', gradeLevel: 2, online: true, duty: true, hours: 190, reports: 44, arrests: 27 },
    { citizenid: 'BNC30554', name: 'Rosa Bianchi', callsign: 'LS-301', badge: '0301', radio: '4', rank: 'Officer', gradeLevel: 1, online: true, duty: false, hours: 121, reports: 30, arrests: 12 },
    { citizenid: 'ALV62288', name: 'Theo Alvarez', callsign: 'LS-312', badge: '0312', radio: '4', rank: 'Officer', gradeLevel: 1, online: false, duty: false, hours: 88, reports: 19, arrests: 8 },
    { citizenid: 'DNP84471', name: 'Simone Dunphy', callsign: 'LS-405', badge: '0405', radio: '5', rank: 'Cadet', gradeLevel: 0, online: false, duty: false, hours: 26, reports: 4, arrests: 1 },
    { citizenid: 'FRR29013', name: 'Bo Farrier', callsign: 'LS-410', badge: '0410', radio: '5', rank: 'Cadet', gradeLevel: 0, online: false, duty: false, hours: 12, reports: 2, arrests: 0 },
];

const DEV_GRADES = [
    { level: 0, label: 'Cadet', isboss: false },
    { level: 1, label: 'Officer', isboss: false },
    { level: 2, label: 'Corporal', isboss: false },
    { level: 3, label: 'Sergeant', isboss: false },
    { level: 4, label: 'Chief', isboss: true },
];

let DEV_UNITS: Unit[] = [
    { citizenid: 'HRT10098', name: 'Grace Hartley', callsign: 'LS-100', rank: 'Chief', code: '10-8', department: 'police', domain: 'leo', coords: { x: 425.1, y: -979.4 } },
    { citizenid: 'WHT44012', name: 'Dana Whitlock', callsign: 'LS-114', rank: 'Sergeant', code: '10-8', department: 'police', domain: 'leo', coords: { x: -1037.7, y: -2737.6 } },
    { citizenid: 'OKF77120', name: 'Miles Okafor', callsign: 'LS-208', rank: 'Corporal', code: '10-6', department: 'police', callId: 'call-1', domain: 'leo', coords: { x: 118.9, y: -1300.2 } },
    { citizenid: 'BNC30554', name: 'Rosa Bianchi', callsign: 'LS-301', rank: 'Officer', code: '10-7', department: 'police', domain: 'leo', coords: { x: -710.4, y: -158.9 } },
];

let DEV_CALLS: Call[] = [
    {
        id: 'call-1', code: '10-90', type: 'Silent alarm', priority: 1,
        location: 'Rob’s Liquor, Strawberry Avenue', direction: 'Southbound',
        suspect: 'Male, dark hooded jacket', weapon: 'Handgun',
        units: ['LS-208'], unitCount: 1, createdAt: now - 240, expiresAt: now + 660, hasCoords: true,
        coords: { x: 130.2, y: -1287.5 },
    },
    {
        id: 'call-2', code: '10-50', type: 'Traffic collision', priority: 3,
        location: 'Power Street at Alta Street', direction: 'Eastbound',
        units: [], unitCount: 0, createdAt: now - 900, expiresAt: now + 300, hasCoords: true,
        coords: { x: -247.8, y: -885.1 },
    },
];

let DEV_CHAT: ChatMsg[] = [
    { id: 'm1', citizenid: 'HRT10098', name: 'Grace Hartley', callsign: 'LS-100', body: 'Briefing at the top of the hour. Bring the Strawberry stills.', createdAt: now - 5400 },
    { id: 'm2', citizenid: 'OKF77120', name: 'Miles Okafor', callsign: 'LS-208', body: 'Copy. I have the plate read from the third scene, it matches.', createdAt: now - 5100 },
    { id: 'm3', citizenid: 'WHT44012', name: 'Dana Whitlock', callsign: 'LS-114', body: 'Warrant is filed on Kerrigan. Flagging him on the board now.', createdAt: now - 4200 },
    { id: 'm4', citizenid: 'BNC30554', name: 'Rosa Bianchi', callsign: 'LS-301', body: 'Off duty in ten, handing the impound paperwork to days.', createdAt: now - 1800 },
    { id: 'm5', citizenid: 'OKF77120', name: 'Miles Okafor', callsign: 'LS-208', body: 'Attached to the alarm call at Strawberry, show me 10-6.', createdAt: now - 240 },
];

let DEV_BULLETINS: Bulletin[] = [
    { id: 3, title: 'Strawberry robbery series', body: 'Three armed hold-ups in eleven days along the Strawberry and Davis corridor. Suspect vehicle is a dark sedan, plate partially obscured. Do not approach single crewed.', author: 'Grace Hartley', authorCid: 'HRT10098', authorCallsign: 'LS-100', createdAt: now - 6 * HOUR, updatedAt: now - 6 * HOUR },
    { id: 2, title: 'Radio channel change', body: 'Patrol moves to channel 3 from Monday. Supervisors stay on 1. Update your terminal profile so the roster stays accurate.', author: 'Grace Hartley', authorCid: 'HRT10098', authorCallsign: 'LS-100', createdAt: now - 2 * DAY, updatedAt: now - 2 * DAY },
    { id: 1, title: 'Impound lot closure', body: 'The Davis impound lot is closed for resurfacing until the end of the month. Route all recoveries to the Mission Row yard.', author: 'Dana Whitlock', authorCid: 'WHT44012', authorCallsign: 'LS-114', createdAt: now - 5 * DAY, updatedAt: now - 5 * DAY },
];

const DEV_LOGS: AuditRow[] = [
    { id: 8, actor: 'Dana Whitlock', actorCid: 'WHT44012', actorCallsign: 'LS-114', action: 'warrants.issue', entityType: 'warrant', entityId: 'W-0011', details: { subject: 'Marcus Kerrigan', report: 'R-0042', expiryDays: 7 }, createdAt: now - 2 * HOUR },
    { id: 7, actor: 'Dana Whitlock', actorCid: 'WHT44012', actorCallsign: 'LS-114', action: 'reports.create', entityType: 'report', entityId: 'R-0042', details: { title: 'Armed robbery at the Strawberry Rob’s Liquor', charges: 2 }, createdAt: now - 3 * HOUR },
    { id: 6, actor: 'Miles Okafor', actorCid: 'OKF77120', actorCallsign: 'LS-208', action: 'vehicles.edit', entityType: 'vehicle', entityId: '73XQP180', details: { stolen: true, bolo: true }, createdAt: now - 5 * HOUR },
    { id: 5, actor: 'Grace Hartley', actorCid: 'HRT10098', actorCallsign: 'LS-100', action: 'bulletins.manage', entityType: 'bulletin', entityId: '3', details: { title: 'Strawberry robbery series' }, createdAt: now - 6 * HOUR },
    { id: 4, actor: 'Miles Okafor', actorCid: 'OKF77120', actorCallsign: 'LS-208', action: 'reports.create', entityType: 'report', entityId: 'R-0041', details: { title: 'Pursuit terminated at Mirror Park Boulevard', charges: 2 }, createdAt: now - 9 * HOUR },
    { id: 3, actor: 'Dana Whitlock', actorCid: 'WHT44012', actorCallsign: 'LS-114', action: 'persons.edit', entityType: 'person', entityId: 'KRV20884', details: { flags: ['wanted', 'flight_risk'] }, createdAt: now - 20 * HOUR },
    { id: 2, actor: 'Grace Hartley', actorCid: 'HRT10098', actorCallsign: 'LS-100', action: 'roster.grade', entityType: 'officer', entityId: 'OKF77120', details: { grade: 2, rank: 'Corporal' }, createdAt: now - 3 * DAY },
    { id: 1, actor: 'Dana Whitlock', actorCid: 'WHT44012', actorCallsign: 'LS-114', action: 'jail.book', entityType: 'arrest', entityId: 'A-0018', details: { subject: 'Marcus Kerrigan', months: 20, fine: 1600 }, createdAt: now - 4 * DAY },
];

const DEV_PAGE_SIZE = 25;

function paginate<T>(rows: T[], page: number): Page<T> {
    const p = Math.max(1, Math.floor(page || 1));
    const start = (p - 1) * DEV_PAGE_SIZE;
    return { rows: rows.slice(start, start + DEV_PAGE_SIZE), total: rows.length, page: p, pageSize: DEV_PAGE_SIZE };
}

function summarise(r: ReportDetail): ReportSummary {
    return {
        ref: r.ref, title: r.title, type: r.type, author: r.author, authorCid: r.authorCid,
        callsign: r.callsign, chargeCount: r.charges.length,
        createdAt: r.createdAt, updatedAt: r.updatedAt,
    };
}

function caseSummary(c: CaseDetail): CaseSummary {
    return {
        ref: c.ref, title: c.title, status: c.status, priority: c.priority,
        officers: c.officers.length, reports: c.reports.length,
        createdBy: c.createdBy, createdAt: c.createdAt, updatedAt: c.updatedAt,
    };
}

function personRow(p: PersonDetail): PersonRow {
    return {
        citizenid: p.citizenid, name: p.name, dob: p.dob, sex: p.sex, phone: p.phone,
        wanted: p.wanted, bolo: p.bolo, mugshot: p.mugshot,
    };
}

function vehicleRow(v: VehicleDetail): VehicleRow {
    return {
        plate: v.plate, model: v.model, owner: v.owner, ownerName: v.ownerName,
        status: v.status, stolen: v.stolen, bolo: v.bolo,
    };
}

function hydratePerson(p: PersonDetail): PersonDetail {
    const warrants = DEV_WARRANTS.filter(w => w.citizenid === p.citizenid);
    const priors: PersonDetail['priors'] = [];
    for (const r of DEV_REPORTS) {
        for (const c of r.charges) {
            if (c.citizenid !== p.citizenid) continue;
            priors.push({ reportRef: r.ref, reportTitle: r.title, code: c.code, label: c.label, class: c.class, count: c.count, date: r.createdAt });
        }
    }
    return {
        ...p,
        wanted: warrants.some(w => w.active),
        vehicles: DEV_VEHICLES.filter(v => v.owner === p.citizenid).map(vehicleRow),
        warrants,
        priors,
        arrests: DEV_ARRESTS.filter(a => a.citizenid === p.citizenid).length,
    };
}

function matches(term: string, ...fields: string[]): boolean {
    const q = term.trim().toLowerCase();
    if (q.length < 2) return false;
    return fields.some(f => (f || '').toLowerCase().includes(q));
}

let devSeq = 100;

function nextRef(prefix: string): string {
    devSeq += 1;
    return `${prefix}-${String(devSeq).padStart(4, '0')}`;
}

export async function mdtBootstrap(devDomain?: DepartmentType): Promise<MdtBootstrap | null> {
    if (!isFiveM) {
        const medical = devDomain === 'ems';
        return {
            ...DEV_BOOTSTRAP,
            department: medical ? DEV_EMS_DEPARTMENT : DEV_BOOTSTRAP.department,
            grants: [...DEV_BOOTSTRAP.grants],
            offences: medical ? [] : [...DEV_OFFENCES],
            protocols: medical ? [...DEV_PROTOCOLS] : [],
        };
    }
    return apiData<MdtBootstrap>('sd-phone:mdt:bootstrap');
}

export async function mdtHome(): Promise<MdtHome> {
    if (!isFiveM) {
        return {
            recentReports: DEV_REPORTS.map(summarise).slice(0, 12),
            bulletins: [...DEV_BULLETINS],
            units: [...DEV_UNITS],
        };
    }
    return (await apiData<MdtHome>('sd-phone:mdt:home')) ?? { recentReports: [], bulletins: [], units: [] };
}

export async function mdtDispatchState(): Promise<DispatchState> {
    if (!isFiveM) return { units: [...DEV_UNITS], calls: [...DEV_CALLS] };
    return (await apiData<DispatchState>('sd-phone:mdt:dispatch:state')) ?? { units: [], calls: [] };
}

export async function mdtSetStatus(code: UnitCode): Promise<Unit | null> {
    if (!isFiveM) {
        DEV_UNITS = DEV_UNITS.map(u => (u.citizenid === DEV_BOOTSTRAP.me.citizenid ? { ...u, code } : u));
        return DEV_UNITS.find(u => u.citizenid === DEV_BOOTSTRAP.me.citizenid) ?? null;
    }
    return (await apiData<{ unit: Unit }>('sd-phone:mdt:dispatch:setStatus', { code }))?.unit ?? null;
}

export async function mdtAttach(callId: string): Promise<Call | null> {
    if (!isFiveM) return devAttach(callId, true);
    return (await apiData<{ call: Call }>('sd-phone:mdt:dispatch:attach', { callId }))?.call ?? null;
}

export async function mdtDetach(callId: string): Promise<Call | null> {
    if (!isFiveM) return devAttach(callId, false);
    return (await apiData<{ call: Call }>('sd-phone:mdt:dispatch:detach', { callId }))?.call ?? null;
}

function devAttach(callId: string, attach: boolean): Call | null {
    const mine = DEV_BOOTSTRAP.me.callsign ?? 'LS-114';
    const at = DEV_CALLS.findIndex(c => c.id === callId);
    if (at < 0) return null;

    const call = DEV_CALLS[at];
    const units = attach
        ? Array.from(new Set([...call.units, mine]))
        : call.units.filter(u => u !== mine);
    const next: Call = { ...call, units, unitCount: units.length };
    DEV_CALLS = DEV_CALLS.map((c, i) => (i === at ? next : c));

    DEV_UNITS = DEV_UNITS.map(u => (
        u.citizenid === DEV_BOOTSTRAP.me.citizenid
            ? { ...u, code: attach ? '10-6' : '10-8', callId: attach ? callId : undefined }
            : u
    ));
    return next;
}

export async function mdtLocate(target: { callId?: string; citizenid?: string }): Promise<Coords | null> {
    if (!isFiveM) return { x: 245.6, y: -1379.4, z: 33.7 };
    return (await apiData<{ coords: Coords }>('sd-phone:mdt:dispatch:locate', target))?.coords ?? null;
}

export async function mdtSetWaypoint(coords: Coords): Promise<boolean> {
    if (!isFiveM) return true;
    return (await apiCall<unknown>('sd-phone:mdt:setWaypoint', coords)).success;
}

export async function mdtPersonsSearch(query: string, page = 1): Promise<Page<PersonRow>> {
    if (!isFiveM) {
        const hits = DEV_PERSONS.filter(p => matches(query, p.name, p.citizenid, p.phone));
        return paginate(hits.map(p => personRow(hydratePerson(p))), page);
    }
    return (await apiData<Page<PersonRow>>('sd-phone:mdt:persons:search', { query, page })) ?? emptyPage<PersonRow>();
}

export async function mdtPerson(citizenid: string): Promise<PersonDetail | null> {
    if (!isFiveM) {
        const p = DEV_PERSONS.find(x => x.citizenid === citizenid);
        return p ? hydratePerson(p) : null;
    }
    return (await apiData<{ person: PersonDetail }>('sd-phone:mdt:persons:get', { citizenid }))?.person ?? null;
}

export async function mdtSetPersonNotes(citizenid: string, notes: string): Promise<PersonDetail | null> {
    if (!isFiveM) return devPatchPerson(citizenid, p => ({ ...p, notes }));
    return (await apiData<{ person: PersonDetail }>('sd-phone:mdt:persons:notes', { citizenid, notes }))?.person ?? null;
}

export async function mdtSetPersonFlags(citizenid: string, flags: PersonFlag[]): Promise<PersonDetail | null> {
    if (!isFiveM) return devPatchPerson(citizenid, p => ({ ...p, flags }));
    return (await apiData<{ person: PersonDetail }>('sd-phone:mdt:persons:flags', { citizenid, flags }))?.person ?? null;
}

export async function mdtSetPersonMugshot(citizenid: string, url: string | null): Promise<PersonDetail | null> {
    if (!isFiveM) return devPatchPerson(citizenid, p => ({ ...p, mugshot: url ?? undefined }));
    return (await apiData<{ person: PersonDetail }>('sd-phone:mdt:persons:mugshot', { citizenid, url }))?.person ?? null;
}

function devPatchPerson(citizenid: string, patch: (p: PersonDetail) => PersonDetail): PersonDetail | null {
    const at = DEV_PERSONS.findIndex(p => p.citizenid === citizenid);
    if (at < 0) return null;
    const next = patch(DEV_PERSONS[at]);
    DEV_PERSONS = DEV_PERSONS.map((p, i) => (i === at ? next : p));
    return hydratePerson(next);
}

export async function mdtVehiclesSearch(query: string, page = 1): Promise<Page<VehicleRow>> {
    if (!isFiveM) {
        const hits = DEV_VEHICLES.filter(v => matches(query, v.plate, v.model, v.ownerName));
        return paginate(hits.map(vehicleRow), page);
    }
    return (await apiData<Page<VehicleRow>>('sd-phone:mdt:vehicles:search', { query, page })) ?? emptyPage<VehicleRow>();
}

export async function mdtVehicle(plate: string): Promise<VehicleDetail | null> {
    if (!isFiveM) return DEV_VEHICLES.find(v => v.plate === plate) ?? null;
    return (await apiData<{ vehicle: VehicleDetail }>('sd-phone:mdt:vehicles:get', { plate }))?.vehicle ?? null;
}

export interface VehiclePatch {
    notes?:  string;
    status?: VehicleStatus;
    points?: number;
    stolen?: boolean;
    bolo?:   boolean;
}

export async function mdtUpdateVehicle(plate: string, patch: VehiclePatch): Promise<VehicleDetail | null> {
    if (!isFiveM) {
        const at = DEV_VEHICLES.findIndex(v => v.plate === plate);
        if (at < 0) return null;
        const next: VehicleDetail = {
            ...DEV_VEHICLES[at], ...patch,
            updatedAt: Math.floor(Date.now() / 1000),
            updatedBy: DEV_BOOTSTRAP.me.name,
        };
        DEV_VEHICLES = DEV_VEHICLES.map((v, i) => (i === at ? next : v));
        return next;
    }
    return (await apiData<{ vehicle: VehicleDetail }>('sd-phone:mdt:vehicles:update', { plate, ...patch }))?.vehicle ?? null;
}

export async function mdtReports(opts: { query?: string; type?: ReportType | 'All'; page?: number } = {}): Promise<Page<ReportSummary>> {
    if (!isFiveM) {
        const hits = DEV_REPORTS.filter(r => {
            if (opts.type && opts.type !== 'All' && r.type !== opts.type) return false;
            if (!opts.query || opts.query.trim().length < 2) return true;
            return matches(opts.query, r.title, r.ref);
        });
        return paginate(hits.map(summarise), opts.page ?? 1);
    }
    const payload = { query: opts.query, type: opts.type === 'All' ? undefined : opts.type, page: opts.page ?? 1 };
    return (await apiData<Page<ReportSummary>>('sd-phone:mdt:reports:list', payload)) ?? emptyPage<ReportSummary>();
}

export async function mdtReport(ref: string): Promise<ReportDetail | null> {
    if (!isFiveM) return DEV_REPORTS.find(r => r.ref === ref) ?? null;
    return (await apiData<{ report: ReportDetail }>('sd-phone:mdt:reports:get', { ref }))?.report ?? null;
}

export async function mdtSaveReport(draft: ReportDraft): Promise<ReportDetail | null> {
    if (!isFiveM) return devSaveReport(draft);
    return (await apiData<{ report: ReportDetail }>('sd-phone:mdt:reports:save', draft))?.report ?? null;
}

function devSaveReport(draft: ReportDraft): ReportDetail {
    const stamp = Math.floor(Date.now() / 1000);
    const names = new Map(DEV_PERSONS.map(p => [p.citizenid, p.name]));
    const charges = draft.charges.map(c => charge(c.code, c.citizenid ?? '', names.get(c.citizenid ?? '') ?? '', c.count));
    const totals = charges.reduce((acc, c) => ({ months: acc.months + c.months * c.count, fine: acc.fine + c.fine * c.count }), { months: 0, fine: 0 });

    const existing = draft.ref ? DEV_REPORTS.find(r => r.ref === draft.ref) : undefined;
    const next: ReportDetail = {
        ref: existing?.ref ?? nextRef('R'),
        title: draft.title,
        type: draft.type,
        body: draft.body,
        author: existing?.author ?? DEV_BOOTSTRAP.me.name,
        authorCid: existing?.authorCid ?? DEV_BOOTSTRAP.me.citizenid,
        callsign: existing?.callsign ?? DEV_BOOTSTRAP.me.callsign,
        chargeCount: charges.length,
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
        involved: draft.involved.map(i => ({ ...i, name: names.get(i.citizenid) ?? i.citizenid })),
        charges,
        totalMonths: totals.months,
        totalFine: totals.fine,
        caseRef: existing?.caseRef,
        canEdit: true,
        canDelete: true,
    };

    DEV_REPORTS = existing
        ? DEV_REPORTS.map(r => (r.ref === next.ref ? next : r))
        : [next, ...DEV_REPORTS];
    return next;
}

export async function mdtDeleteReport(ref: string): Promise<boolean> {
    if (!isFiveM) {
        DEV_REPORTS = DEV_REPORTS.filter(r => r.ref !== ref);
        return true;
    }
    return (await apiCall<unknown>('sd-phone:mdt:reports:delete', { ref })).success;
}

export async function mdtCases(opts: { query?: string; status?: CaseStatus; priority?: CasePriority; page?: number } = {}): Promise<Page<CaseSummary>> {
    if (!isFiveM) {
        const hits = DEV_CASES.filter(c => {
            if (opts.status && c.status !== opts.status) return false;
            if (opts.priority && c.priority !== opts.priority) return false;
            if (!opts.query || opts.query.trim().length < 2) return true;
            return matches(opts.query, c.title, c.ref);
        });
        return paginate(hits.map(caseSummary), opts.page ?? 1);
    }
    return (await apiData<Page<CaseSummary>>('sd-phone:mdt:cases:list', { ...opts, page: opts.page ?? 1 })) ?? emptyPage<CaseSummary>();
}

export async function mdtCase(ref: string): Promise<CaseDetail | null> {
    if (!isFiveM) return DEV_CASES.find(c => c.ref === ref) ?? null;
    return (await apiData<{ case: CaseDetail }>('sd-phone:mdt:cases:get', { ref }))?.case ?? null;
}

export interface CaseDraft {
    ref:      string | null;
    title:    string;
    summary:  string;
    status:   CaseStatus;
    priority: CasePriority;
}

export async function mdtSaveCase(draft: CaseDraft): Promise<CaseDetail | null> {
    if (!isFiveM) {
        const stamp = Math.floor(Date.now() / 1000);
        const existing = draft.ref ? DEV_CASES.find(c => c.ref === draft.ref) : undefined;
        const next: CaseDetail = {
            ref: existing?.ref ?? nextRef('C'),
            title: draft.title,
            summary: draft.summary,
            status: draft.status,
            priority: draft.priority,
            createdBy: existing?.createdBy ?? DEV_BOOTSTRAP.me.name,
            createdAt: existing?.createdAt ?? stamp,
            updatedAt: stamp,
            officers: existing?.officers ?? [{ citizenid: DEV_BOOTSTRAP.me.citizenid, name: DEV_BOOTSTRAP.me.name, callsign: DEV_BOOTSTRAP.me.callsign, role: 'primary' }],
            notes: existing?.notes ?? [],
            reports: existing?.reports ?? [],
            canEdit: true,
            canDelete: true,
        };
        DEV_CASES = existing ? DEV_CASES.map(c => (c.ref === next.ref ? next : c)) : [next, ...DEV_CASES];
        return next;
    }
    return (await apiData<{ case: CaseDetail }>('sd-phone:mdt:cases:save', draft))?.case ?? null;
}

export async function mdtDeleteCase(ref: string): Promise<boolean> {
    if (!isFiveM) {
        DEV_CASES = DEV_CASES.filter(c => c.ref !== ref);
        return true;
    }
    return (await apiCall<unknown>('sd-phone:mdt:cases:delete', { ref })).success;
}

export async function mdtCaseNote(ref: string, body: string): Promise<CaseDetail | null> {
    if (!isFiveM) {
        return devPatchCase(ref, c => ({
            ...c,
            updatedAt: Math.floor(Date.now() / 1000),
            notes: [{
                id: c.notes.length + 1,
                author: DEV_BOOTSTRAP.me.name,
                callsign: DEV_BOOTSTRAP.me.callsign,
                body,
                createdAt: Math.floor(Date.now() / 1000),
            }, ...c.notes],
        }));
    }
    return (await apiData<{ case: CaseDetail }>('sd-phone:mdt:cases:note', { ref, body }))?.case ?? null;
}

export async function mdtCaseAssign(ref: string, citizenid: string, role: CaseRole, assigned: boolean): Promise<CaseDetail | null> {
    if (!isFiveM) {
        const officer = DEV_ROSTER.find(o => o.citizenid === citizenid);
        return devPatchCase(ref, c => {
            const kept = c.officers.filter(o => o.citizenid !== citizenid);
            const officers = assigned && officer
                ? [...kept, { citizenid, name: officer.name, callsign: officer.callsign, role }]
                : kept;
            return { ...c, officers };
        });
    }
    return (await apiData<{ case: CaseDetail }>('sd-phone:mdt:cases:assign', { ref, citizenid, role, assigned }))?.case ?? null;
}

export async function mdtCaseLinkReport(ref: string, reportRef: string, linked: boolean): Promise<CaseDetail | null> {
    if (!isFiveM) {
        const report = DEV_REPORTS.find(r => r.ref === reportRef);
        return devPatchCase(ref, c => {
            const kept = c.reports.filter(r => r.ref !== reportRef);
            const reports = linked && report
                ? [...kept, { ref: report.ref, title: report.title, type: report.type }]
                : kept;
            return { ...c, reports };
        });
    }
    return (await apiData<{ case: CaseDetail }>('sd-phone:mdt:cases:linkReport', { ref, reportRef, linked }))?.case ?? null;
}

function devPatchCase(ref: string, patch: (c: CaseDetail) => CaseDetail): CaseDetail | null {
    const at = DEV_CASES.findIndex(c => c.ref === ref);
    if (at < 0) return null;
    const next = patch(DEV_CASES[at]);
    DEV_CASES = DEV_CASES.map((c, i) => (i === at ? next : c));
    return next;
}

export async function mdtWarrants(opts: { status?: 'active' | 'expired'; query?: string; page?: number } = {}): Promise<Page<Warrant>> {
    if (!isFiveM) {
        const hits = DEV_WARRANTS.filter(w => {
            if (opts.status === 'active' && !w.active) return false;
            if (opts.status === 'expired' && w.active) return false;
            if (!opts.query || opts.query.trim().length < 2) return true;
            return matches(opts.query, w.subject, w.ref, w.citizenid);
        });
        return paginate(hits, opts.page ?? 1);
    }
    return (await apiData<Page<Warrant>>('sd-phone:mdt:warrants:list', { ...opts, page: opts.page ?? 1 })) ?? emptyPage<Warrant>();
}

export async function mdtWarrant(ref: string): Promise<Warrant | null> {
    if (!isFiveM) return DEV_WARRANTS.find(w => w.ref === ref) ?? null;
    return (await apiData<{ warrant: Warrant }>('sd-phone:mdt:warrants:get', { ref }))?.warrant ?? null;
}

export interface WarrantRequest {
    citizenid:   string;
    reportRef?:  string | null;
    charges:     ChargeInput[];
    expiryDays?: number;
    bond?:       number;
}

export async function mdtIssueWarrant(req: WarrantRequest): Promise<Warrant | null> {
    if (!isFiveM) {
        const person = DEV_PERSONS.find(p => p.citizenid === req.citizenid);
        const lines = req.charges.map(c => line(c.code, c.count));
        const stamp = Math.floor(Date.now() / 1000);
        const warrant: Warrant = {
            ref: nextRef('W'),
            citizenid: req.citizenid,
            subject: person?.name ?? req.citizenid,
            reportRef: req.reportRef ?? undefined,
            charges: lines,
            felonies: lines.filter(l => l.class === 'felony').reduce((n, l) => n + l.count, 0),
            misdemeanors: lines.filter(l => l.class === 'misdemeanor').reduce((n, l) => n + l.count, 0),
            infractions: lines.filter(l => l.class === 'infraction').reduce((n, l) => n + l.count, 0),
            bond: req.bond ?? 0,
            officer: DEV_BOOTSTRAP.me.name,
            callsign: DEV_BOOTSTRAP.me.callsign,
            issuedAt: stamp,
            expiresAt: stamp + (req.expiryDays ?? 7) * DAY,
            active: true,
        };
        DEV_WARRANTS = [warrant, ...DEV_WARRANTS];
        return warrant;
    }
    return (await apiData<{ warrant: Warrant }>('sd-phone:mdt:warrants:issue', req))?.warrant ?? null;
}

export async function mdtCloseWarrant(ref: string): Promise<Warrant | null> {
    if (!isFiveM) {
        const at = DEV_WARRANTS.findIndex(w => w.ref === ref);
        if (at < 0) return null;
        const next: Warrant = { ...DEV_WARRANTS[at], active: false, expiresAt: Math.floor(Date.now() / 1000) };
        DEV_WARRANTS = DEV_WARRANTS.map((w, i) => (i === at ? next : w));
        return next;
    }
    return (await apiData<{ warrant: Warrant }>('sd-phone:mdt:warrants:close', { ref }))?.warrant ?? null;
}

export async function mdtPatientsSearch(query: string, page = 1): Promise<Page<PatientRow>> {
    if (!isFiveM) {
        const hits = DEV_PERSONS.filter(p => matches(query, p.name, p.citizenid, p.phone));
        return paginate(hits.map(p => devPatientRow(p.citizenid, p.name, p.dob, p.sex, p.phone)), page);
    }
    return (await apiData<Page<PatientRow>>('sd-phone:mdt:patients:search', { query, page })) ?? emptyPage<PatientRow>();
}

export async function mdtPatient(citizenid: string): Promise<PatientDetail | null> {
    if (!isFiveM) {
        const p = DEV_PERSONS.find(x => x.citizenid === citizenid);
        if (!p) return null;
        return {
            citizenid: p.citizenid,
            name:      p.name,
            dob:       p.dob,
            sex:       p.sex,
            phone:     p.phone,
            file:      devFile(p.citizenid),
            reports:   DEV_PATIENT_PAPERWORK[p.citizenid] ?? [],
        };
    }
    return (await apiData<{ patient: PatientDetail }>('sd-phone:mdt:patients:get', { citizenid }))?.patient ?? null;
}

export async function mdtSaveMedical(
    citizenid: string,
    patch: Partial<MedicalFile>,
): Promise<MedicalFile | null> {
    if (!isFiveM) {
        DEV_MEDICAL[citizenid] = { ...devFile(citizenid), ...patch, updatedBy: 'M-114 Dana Whitlock', updatedAt: Math.floor(Date.now() / 1000) };
        return DEV_MEDICAL[citizenid];
    }
    return (await apiData<{ file: MedicalFile }>('sd-phone:mdt:patients:update', { citizenid, ...patch }))?.file ?? null;
}

export async function mdtProtocols(): Promise<Protocol[]> {
    if (!isFiveM) return [...DEV_PROTOCOLS];
    return (await apiData<{ rows: Protocol[] }>('sd-phone:mdt:protocols:list'))?.rows ?? [];
}

export async function mdtSaveProtocol(protocol: Protocol): Promise<Protocol | null> {
    if (!isFiveM) {
        const at = DEV_PROTOCOLS.findIndex(p => p.code === protocol.code);
        if (at >= 0) DEV_PROTOCOLS[at] = protocol;
        else DEV_PROTOCOLS.push(protocol);
        return protocol;
    }
    return (await apiData<{ protocol: Protocol }>('sd-phone:mdt:protocols:save', protocol))?.protocol ?? null;
}

export async function mdtDeleteProtocol(code: string): Promise<boolean> {
    if (!isFiveM) {
        DEV_PROTOCOLS = DEV_PROTOCOLS.filter(p => p.code !== code);
        return true;
    }
    return (await apiCall('sd-phone:mdt:protocols:delete', { code })).success;
}

export async function mdtOffences(): Promise<Offence[]> {
    if (!isFiveM) return [...DEV_OFFENCES];
    return (await apiData<{ rows: Offence[] }>('sd-phone:mdt:offences:list'))?.rows ?? [];
}

export async function mdtSaveOffence(offence: Offence): Promise<Offence | null> {
    if (!isFiveM) {
        const at = DEV_OFFENCES.findIndex(o => o.code === offence.code);
        if (at >= 0) DEV_OFFENCES[at] = offence;
        else DEV_OFFENCES.push(offence);
        return offence;
    }
    return (await apiData<{ offence: Offence }>('sd-phone:mdt:offences:save', offence))?.offence ?? null;
}

export async function mdtDeleteOffence(code: string): Promise<boolean> {
    if (!isFiveM) {
        const at = DEV_OFFENCES.findIndex(o => o.code === code);
        if (at >= 0) DEV_OFFENCES.splice(at, 1);
        return true;
    }
    return (await apiCall<unknown>('sd-phone:mdt:offences:delete', { code })).success;
}

export async function mdtArrests(opts: { query?: string; page?: number } = {}): Promise<Page<ArrestRow>> {
    if (!isFiveM) {
        const hits = DEV_ARRESTS.filter(a => !opts.query || opts.query.trim().length < 2 || matches(opts.query, a.subject, a.ref, a.officer));
        return paginate(hits, opts.page ?? 1);
    }
    return (await apiData<Page<ArrestRow>>('sd-phone:mdt:jail:list', { ...opts, page: opts.page ?? 1 })) ?? emptyPage<ArrestRow>();
}

export async function mdtJailQuote(reportRef: string, citizenid: string): Promise<JailQuote | null> {
    if (!isFiveM) {
        const report = DEV_REPORTS.find(r => r.ref === reportRef);
        const charges = report ? report.charges.filter(c => c.citizenid === citizenid) : [];
        const totals = charges.reduce((acc, c) => ({ months: acc.months + c.months * c.count, fine: acc.fine + c.fine * c.count }), { months: 0, fine: 0 });
        const booked = DEV_ARRESTS.find(a => a.reportRef === reportRef && a.citizenid === citizenid);
        return {
            months: totals.months,
            fine: totals.fine,
            charges,
            jailedAlready: booked?.jailed ?? false,
            finedAlready: booked?.fined ?? false,
            jailAvailable: true,
            maxReduction: 12,
            maxFine: 25000,
        };
    }
    return apiData<JailQuote>('sd-phone:mdt:jail:quote', { reportRef, citizenid });
}

export interface BookingRequest {
    reportRef:        string;
    citizenid:        string;
    jail:             boolean;
    fine:             boolean;
    reductionMonths?: number;
}

export async function mdtBook(req: BookingRequest): Promise<ArrestRow | null> {
    if (!isFiveM) {
        const report = DEV_REPORTS.find(r => r.ref === req.reportRef);
        const person = DEV_PERSONS.find(p => p.citizenid === req.citizenid);
        const charges = report ? report.charges.filter(c => c.citizenid === req.citizenid) : [];
        const totals = charges.reduce((acc, c) => ({ months: acc.months + c.months * c.count, fine: acc.fine + c.fine * c.count }), { months: 0, fine: 0 });
        const arrest: ArrestRow = {
            ref: nextRef('A'),
            reportRef: req.reportRef,
            citizenid: req.citizenid,
            subject: person?.name ?? req.citizenid,
            officer: DEV_BOOTSTRAP.me.name,
            callsign: DEV_BOOTSTRAP.me.callsign,
            charges: charges.map(c => line(c.code, c.count)),
            months: req.jail ? Math.max(0, totals.months - (req.reductionMonths ?? 0)) : 0,
            fine: req.fine ? totals.fine : 0,
            jailed: req.jail,
            fined: req.fine,
            createdAt: Math.floor(Date.now() / 1000),
        };
        DEV_ARRESTS = [arrest, ...DEV_ARRESTS];
        return arrest;
    }
    return (await apiData<{ arrest: ArrestRow }>('sd-phone:mdt:jail:book', req))?.arrest ?? null;
}

export async function mdtRoster(opts: { query?: string; page?: number } = {}): Promise<RosterPage> {
    if (!isFiveM) {
        const hits = DEV_ROSTER.filter(o => !opts.query || opts.query.trim().length < 2 || matches(opts.query, o.name, o.callsign ?? ''));
        return { ...paginate(hits, opts.page ?? 1), grades: DEV_GRADES };
    }
    return (await apiData<RosterPage>('sd-phone:mdt:roster:list', { ...opts, page: opts.page ?? 1 })) ?? emptyPage<OfficerRow>();
}

export async function mdtSetCallsign(citizenid: string, callsign: string): Promise<OfficerRow | null> {
    if (!isFiveM) return devPatchOfficer(citizenid, o => ({ ...o, callsign }));
    return (await apiData<{ officer: OfficerRow }>('sd-phone:mdt:roster:setCallsign', { citizenid, callsign }))?.officer ?? null;
}

export async function mdtSetRadio(citizenid: string, channel: string): Promise<OfficerRow | null> {
    if (!isFiveM) return devPatchOfficer(citizenid, o => ({ ...o, radio: channel }));
    return (await apiData<{ officer: OfficerRow }>('sd-phone:mdt:roster:setRadio', { citizenid, channel }))?.officer ?? null;
}

export async function mdtSetGrade(citizenid: string, grade: number): Promise<OfficerRow | null> {
    if (!isFiveM) {
        const rank = DEV_GRADES.find(g => g.level === grade)?.label ?? 'Officer';
        return devPatchOfficer(citizenid, o => ({ ...o, gradeLevel: grade, rank }));
    }
    return (await apiData<{ officer: OfficerRow }>('sd-phone:mdt:roster:setGrade', { citizenid, grade }))?.officer ?? null;
}

export async function mdtDismiss(citizenid: string): Promise<boolean> {
    if (!isFiveM) {
        DEV_ROSTER = DEV_ROSTER.filter(o => o.citizenid !== citizenid);
        return true;
    }
    return (await apiCall<unknown>('sd-phone:mdt:roster:dismiss', { citizenid })).success;
}

function devPatchOfficer(citizenid: string, patch: (o: OfficerRow) => OfficerRow): OfficerRow | null {
    const at = DEV_ROSTER.findIndex(o => o.citizenid === citizenid);
    if (at < 0) return null;
    const next = patch(DEV_ROSTER[at]);
    DEV_ROSTER = DEV_ROSTER.map((o, i) => (i === at ? next : o));
    return next;
}

export async function mdtPageUnit(citizenid: string): Promise<{ source: number | null; name: string } | null> {
    if (!isFiveM) {
        const officer = DEV_ROSTER.find(o => o.citizenid === citizenid);
        if (!officer) return null;
        return { source: officer.online ? 1 : null, name: officer.name };
    }
    return apiData<{ source: number | null; name: string }>('sd-phone:mdt:roster:page', { citizenid });
}

export async function mdtChatHistory(): Promise<ChatMsg[]> {
    if (!isFiveM) return [...DEV_CHAT];
    return (await apiData<{ messages: ChatMsg[] }>('sd-phone:mdt:chat:history'))?.messages ?? [];
}

export async function mdtSendChat(body: string): Promise<ChatMsg | null> {
    if (!isFiveM) {
        const msg: ChatMsg = {
            id: 'dev-' + (devSeq += 1),
            citizenid: DEV_BOOTSTRAP.me.citizenid,
            name: DEV_BOOTSTRAP.me.name,
            callsign: DEV_BOOTSTRAP.me.callsign,
            body,
            createdAt: Math.floor(Date.now() / 1000),
        };
        DEV_CHAT = [...DEV_CHAT, msg].slice(-50);
        return msg;
    }
    return (await apiData<{ message: ChatMsg }>('sd-phone:mdt:chat:send', { body }))?.message ?? null;
}

export async function mdtSaveBulletin(draft: { id: number | null; title: string; body: string }): Promise<Bulletin | null> {
    if (!isFiveM) {
        const stamp = Math.floor(Date.now() / 1000);
        const existing = draft.id ? DEV_BULLETINS.find(b => b.id === draft.id) : undefined;
        const next: Bulletin = {
            id: existing?.id ?? (devSeq += 1),
            title: draft.title,
            body: draft.body,
            author: existing?.author ?? DEV_BOOTSTRAP.me.name,
            authorCid: existing?.authorCid ?? DEV_BOOTSTRAP.me.citizenid,
            authorCallsign: existing?.authorCallsign ?? DEV_BOOTSTRAP.me.callsign,
            createdAt: existing?.createdAt ?? stamp,
            updatedAt: stamp,
        };
        DEV_BULLETINS = existing ? DEV_BULLETINS.map(b => (b.id === next.id ? next : b)) : [next, ...DEV_BULLETINS];
        return next;
    }
    return (await apiData<{ bulletin: Bulletin }>('sd-phone:mdt:bulletins:save', draft))?.bulletin ?? null;
}

export async function mdtDeleteBulletin(id: number): Promise<boolean> {
    if (!isFiveM) {
        DEV_BULLETINS = DEV_BULLETINS.filter(b => b.id !== id);
        return true;
    }
    return (await apiCall<unknown>('sd-phone:mdt:bulletins:delete', { id })).success;
}

export async function mdtLogs(opts: { entityType?: string; actor?: string; action?: string; page?: number } = {}): Promise<Page<AuditRow>> {
    if (!isFiveM) {
        const hits = DEV_LOGS.filter(l => {
            if (opts.entityType && l.entityType !== opts.entityType) return false;
            if (opts.actor && l.actorCid !== opts.actor) return false;
            if (opts.action && l.action !== opts.action) return false;
            return true;
        });
        return paginate(hits, opts.page ?? 1);
    }
    return (await apiData<Page<AuditRow>>('sd-phone:mdt:logs:list', { ...opts, page: opts.page ?? 1 })) ?? emptyPage<AuditRow>();
}
