
import bg3  from '@/assets/photos/background3.webp';
import bg6  from '@/assets/photos/background6.webp';
import bg9  from '@/assets/photos/background9.webp';
import bg11 from '@/assets/photos/background11.webp';

export interface Listing {
    id:     string;
    title:  string;
    body:   string;
    price?:  number;
    image?:  string;
    images?: string[];
    number: string;
    email?: string;
    date:   string;
    mine:   boolean;
}

export interface ListingDraft {
    title:  string;
    body:   string;
    price?:  number;
    image?:  string;
    images?: string[];
    number: string;
    email?: string;
}

// Titles stay under about 18 characters: the listing row truncates past that, and the qualifier
// after the comma is the part that tells a buyer whether to bother opening it.
export const LISTINGS: Listing[] = [
    {
        id: 'l1',
        title: 'Tornado, restored',
        body: 'Two years of evenings went into this Declasse. New loom, rebuilt carb, and the paint is a respray in the colour it left the factory in. Every receipt is in a folder and you can read the lot before you decide anything.',
        price: 42_000,
        image: bg11,
        number: '2135550107',
        date: 'Today, 09:26',
        mine: true,
    },
    {
        id: 'l2',
        title: 'Futo, cheap to run',
        body: 'Daily drove this Karin for three years and it never once left me stranded. The rear arch on the driver side has started bubbling, which is why it is priced where it is. Viewings at the Sandy Shores yard.',
        price: 9_500,
        image: bg6,
        number: '3105550281',
        date: 'June 14th, 2026',
        mine: false,
    },
    {
        id: 'l3',
        title: 'Warrener, project',
        body: 'The Vulcar turns over and will not fire. I have run out of both patience and driveway. Interior is complete and all the glass is good. Bring a trailer, it is not driving out of here.',
        price: 3_200,
        number: '2135550623',
        date: 'June 12th, 2026',
        mine: false,
    },
    {
        id: 'l4',
        title: 'Gauntlet, will swap',
        body: 'Bravado, supercharged, coilovers, cage in the back. My situation has changed, so I would look at a part exchange against anything with four doors and a boot. Email is better than ringing, I am underground most of the day.',
        price: 28_750,
        image: bg9,
        number: '2135550416',
        email: 'r.okafor@lsmail.com',
        date: 'June 11th, 2026',
        mine: false,
    },
    {
        id: 'l5',
        title: 'Carbon RS, tidy',
        body: 'Nagasaki, chain and sprockets done last month and there is fresh rubber on the rear. A spare fairing in black comes with it, plus the original exhaust in a box. No test rides without a licence, sorry.',
        price: 14_400,
        image: bg3,
        number: '3105550194',
        date: 'June 9th, 2026',
        mine: false,
    },
    {
        id: 'l6',
        title: 'Seminole, tow bar',
        body: 'This Canis has been the family car, so expect crumbs in the back. Tow bar and roof bars stay with it. It is due a service in about six hundred miles and I would rather price that in than pretend otherwise.',
        price: 11_200,
        number: '2135550107',
        date: 'June 7th, 2026',
        mine: true,
    },
    {
        id: 'l7',
        title: 'Wanted: Sentinel',
        body: 'After an Ubermacht Sentinel, any year, running or not. Ring me rather than message, I miss messages. If it is off the road, tell me what is wrong with it and I will still come and look.',
        number: '3105550557',
        date: 'June 5th, 2026',
        mine: false,
    },
    {
        id: 'l8',
        title: 'Alloys and tyres',
        body: 'Eighteens off a Sultan, so they will go on anything with that stud pattern. Most of the tread is left and one wheel has a kerb mark on the lip. Collection only, they are heavier than they look.',
        price: 900,
        number: '2135550362',
        date: 'June 2nd, 2026',
        mine: false,
    },
];
