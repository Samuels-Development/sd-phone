
export interface Post {
    id:     string;
    title:  string;
    body:   string;
    price?:  number;
    image?:  string;
    images?: string[];
    number: string;
    email?: string;
    date?:  string;
    mine?:  boolean;
}

export interface PostDraft {
    title:  string;
    body:   string;
    price?:  number;
    image?:  string;
    images?: string[];
    number: string;
    email?: string;
}

export const POSTS: Post[] = [
    {
        id: 'p1',
        title: 'Tiling and bathroom fitting',
        body: 'Twelve years on the tools. Wet rooms, splashbacks, regrouting, tile repairs. I quote in person and the quote is the price you pay.',
        number: '2135550107',
        date: 'Today, 08:52',
        mine: true,
    },
    {
        id: 'p2',
        title: 'Paleto Bay Bakery, new hours',
        body: 'We open at six and shut when the shelves are empty, usually around two. Closed Mondays. Custom cakes need three days notice.',
        number: '3105550348',
        email: 'paletobakery@lsmail.com',
        date: 'June 13th, 2026',
    },
    {
        id: 'p3',
        title: 'Piano lessons, beginners welcome',
        body: 'Half hour and hour slots at my place in Rockford Hills, weekday evenings. Children and adults. The first lesson is free so you can decide if it suits you.',
        image: "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='240' height='160'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#2dd4bf'/><stop offset='1' stop-color='#312e81'/></linearGradient></defs><rect width='240' height='160' fill='url(#g)'/></svg>"),
        number: '2135550478',
        date: 'June 11th, 2026',
    },
    {
        id: 'p4',
        title: 'Locksmith, out of hours',
        body: 'Locked out, lost keys, snapped cylinders. I cover the city and Sandy Shores overnight. Have ID that matches the address ready before I open anything.',
        number: '3105550205',
        date: 'June 8th, 2026',
    },
    {
        id: 'p5',
        title: 'Dog walking, Mirror Park',
        body: 'Two walks a day, small groups only, and a photo once they are back inside. Full for August, taking names for September.',
        number: '2135550739',
        date: 'June 4th, 2026',
    },
];
