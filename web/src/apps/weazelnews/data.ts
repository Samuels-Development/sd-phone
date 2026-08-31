
import { t } from '@/i18n';
import bg3  from '@/assets/photos/background3.webp';
import bg4  from '@/assets/photos/background4.webp';
import bg5  from '@/assets/photos/background5.webp';
import bg6  from '@/assets/photos/background6.webp';
import bg7  from '@/assets/photos/background7.webp';
import bg8  from '@/assets/photos/background8.webp';
import bg9  from '@/assets/photos/background9.webp';
import bg10 from '@/assets/photos/background10.webp';
import bg11 from '@/assets/photos/background11.webp';
import bg12 from '@/assets/photos/background12.webp';
import lockscreen from '@/assets/wallpapers/lockscreen.webp';
import homescreen from '@/assets/wallpapers/homescreen.webp';

export const WEAZEL_RED = '#C8102E';

export type Category =
    | 'Local'
    | 'Crime'
    | 'Politics'
    | 'Business'
    | 'Sports'
    | 'Entertainment'
    | 'Tech'
    | 'Weather';

export const CATEGORIES: readonly ('All' | Category)[] = [
    'All', 'Local', 'Crime', 'Politics', 'Business', 'Sports', 'Entertainment', 'Tech', 'Weather',
] as const;

export function categoryLabel(c: 'All' | Category): string {
    switch (c) {
        case 'All':           return t('weazelnews.categoryAll', 'All');
        case 'Local':         return t('weazelnews.categoryLocal', 'Local');
        case 'Crime':         return t('weazelnews.categoryCrime', 'Crime');
        case 'Politics':      return t('weazelnews.categoryPolitics', 'Politics');
        case 'Business':      return t('weazelnews.categoryBusiness', 'Business');
        case 'Sports':        return t('weazelnews.categorySports', 'Sports');
        case 'Entertainment': return t('weazelnews.categoryEntertainment', 'Entertainment');
        case 'Tech':          return t('weazelnews.categoryTech', 'Tech');
        case 'Weather':       return t('weazelnews.categoryWeather', 'Weather');
    }
}

export interface Article {
    id:       string;
    category: Category;
    headline: string;
    dek:      string;
    body:     string[];
    author:   string;
    time:     string;
    views:    number;
    image?:   string;
    featured?: boolean;
}

export interface ArticleDraft {
    id?:      string;
    category: Category;
    headline: string;
    dek:      string;
    body:     string[];
    image?:   string;
    featured: boolean;
}

export interface NewsFeed {
    articles:  Article[];
    ticker:    string[];
    canManage: boolean;
}

export function formatViews(n: number): string {
    if (n >= 1_000_000) return t('weazelnews.viewsMillions', '{n}M', { n: trim(n / 1_000_000) });
    if (n >= 1_000)     return t('weazelnews.viewsThousands', '{n}K', { n: trim(n / 1_000) });
    return String(n);
}

function trim(v: number): string {
    return v.toFixed(1).replace(/\.0$/, '');
}

export const TICKER: readonly string[] = [
    'Mayor calls emergency presser over Mirror Park sinkhole',
    'Maze Bank stock surges 6% after merger rumor',
    'Vinewood Bowl sells out in under nine minutes',
    'LSPD seizes record haul in Sandy Shores raid',
    'Heatwave advisory issued for greater Los Santos',
];

export const ARTICLES: Article[] = [
    {
        id: 'a1',
        category: 'Local',
        featured: true,
        headline: 'Mirror Park Sinkhole Swallows Lane as City Scrambles to Respond',
        dek: 'A 30-foot crater opened overnight on Mirror Park Boulevard, snarling the morning commute and reviving old questions about the city’s aging stormwater grid.',
        author: 'Jordan Vega',
        time: '38m',
        views: 41200,
        image: bg6,
        body: [
            'Commuters along Mirror Park Boulevard woke to chaos Tuesday after a sinkhole roughly thirty feet across collapsed a full lane of eastbound traffic, sending one parked sedan halfway into the earth and stranding residents on both sides of the divide.',
            'No injuries were reported, though a Department of Public Works supervisor on scene described the cavity as "deeper than anything we’ve pulled a vehicle out of this year." Crews cordoned off three blocks before dawn as geologists assessed whether the void extends beneath neighboring foundations.',
            'City engineers blamed a ruptured century-old stormwater main, the third such failure east of the LS River since winter. Council members from the district have demanded an audit of the underground network, calling the pattern "no longer a coincidence."',
            'For now, eastbound drivers are being routed up toward Mirror Park Drive, adding an estimated twenty minutes to the commute. The city says repairs could take "the better part of two weeks," pending the stability survey.',
            'Weazel News will remain on scene through the evening broadcast as officials weigh whether to widen the closure.',
        ],
    },
    {
        id: 'a2',
        category: 'Crime',
        headline: 'Dawn Raid in Sandy Shores Nets Largest Seizure of the Year',
        dek: 'LSPD and county deputies say a coordinated sweep recovered weapons, cash, and a stockpile of stolen vehicle parts from a desert compound.',
        author: 'Marisol Cienega',
        time: '2h',
        views: 28700,
        image: bg8,
        body: [
            'A pre-dawn raid on a fenced compound off Route 68 yielded what the LSPD is calling its single largest seizure of the year, with officers hauling away crates of stolen vehicle components, an undisclosed sum of cash, and a cache of unregistered firearms.',
            'Six individuals were taken into custody without incident, according to a department spokesperson, who credited "weeks of patient surveillance" and a tip line that has stayed unusually busy since spring.',
            'Residents of the nearby trailer community described a heavy law-enforcement presence that began around 4 a.m. and lasted into the morning. "Helicopters, the whole thing," said one neighbor who declined to give a name.',
            'Investigators say the compound may be linked to a chop-shop ring operating across Blaine County. Charges are expected to be filed by the end of the week.',
        ],
    },
    {
        id: 'a3',
        category: 'Politics',
        headline: 'City Hall Deadlocks Over Downtown Transit Bond',
        dek: 'A marathon council session ended without a vote as factions clashed over a proposed light-rail line through the financial district.',
        author: 'Dennis Hargrove',
        time: '4h',
        views: 15400,
        image: bg3,
        body: [
            'A seven-hour council session stretched past midnight Monday without a vote on the $1.2 billion transit bond that supporters say could finally connect Downtown Vinewood to the southern districts by rail.',
            'Backers framed the line as a generational investment in a city choked by traffic; opponents questioned the financing and warned of years of disruptive construction along Power Street.',
            'A late amendment to phase the project in three stages briefly seemed to break the impasse, but the proposal collapsed when two swing members withdrew support over a parking-revenue clause.',
            'The council is expected to reconvene next week. The mayor’s office, which has staked considerable political capital on the bond, released a terse statement urging members to "stop governing by exhaustion."',
        ],
    },
    {
        id: 'a4',
        category: 'Business',
        headline: 'Maze Bank Shares Jump on Merger Speculation',
        dek: 'Rumors of a tie-up with a rival lender sent the financial sector higher, though both companies declined to comment.',
        author: 'Priya Anand',
        time: '5h',
        views: 9800,
        image: bg4,
        body: [
            'Shares of Maze Bank closed up nearly six percent Tuesday amid swirling speculation that the lender is in advanced talks to absorb a smaller regional rival, a deal that would reshape the city’s banking landscape.',
            'Neither institution confirmed the reports, but analysts noted unusually heavy options activity in the days leading up to the surge. "Someone knows something," one trader on the LS exchange floor remarked.',
            'A combined entity would control an estimated third of consumer deposits across Los Santos County, a concentration that could draw scrutiny from regulators already wary of the sector.',
            'Maze Bank executives are scheduled to address shareholders Thursday, a meeting that suddenly carries far higher stakes.',
        ],
    },
    {
        id: 'a5',
        category: 'Sports',
        headline: 'Underdogs Stun Favorites in Overtime Thriller at the Arena',
        dek: 'A buzzer-beating drive capped a furious comeback that sent the home crowd into pandemonium.',
        author: 'Cole Whitmore',
        time: '6h',
        views: 33500,
        image: bg9,
        body: [
            'Down fourteen with under five minutes to play, the home side mounted a comeback for the ages Tuesday night, snatching a one-point overtime win on a driving layup as the buzzer sounded at a delirious downtown arena.',
            'The crowd, which had begun filing toward the exits midway through the fourth, stormed back to its feet as the momentum swung. "I’ve never heard this building that loud," the head coach said afterward, voice still hoarse.',
            'The victory pulls the team back to .500 and keeps a fading playoff push alive heading into a brutal three-game road stretch.',
            'Their veteran guard, who poured in twelve of his points in the final quarter, deflected the praise: "That was the crowd. We just kept shooting."',
        ],
    },
    {
        id: 'a6',
        category: 'Entertainment',
        headline: 'Vinewood Bowl Show Sells Out in Record Nine Minutes',
        dek: 'Tickets for the surprise summer residency vanished almost instantly, crashing the box-office site and spawning a frantic resale market.',
        author: 'Tasha Lemoine',
        time: '8h',
        views: 52100,
        image: bg5,
        body: [
            'Tickets for a surprise summer residency at the Vinewood Bowl sold out in nine minutes flat Tuesday morning, a venue record that briefly took down the box-office website and left thousands of fans empty-handed.',
            'Resale listings appeared within the hour at eye-watering markups, prompting renewed calls from city officials to crack down on automated buying. "Real fans never had a chance," one disappointed concertgoer posted.',
            'Promoters hinted that additional dates "are being discussed" but declined to confirm anything, a non-answer that did little to cool the frenzy.',
            'The Bowl, freshly renovated last year, is expected to anchor a packed Vinewood events calendar that organizers say could be the busiest in a decade.',
        ],
    },
    {
        id: 'a7',
        category: 'Tech',
        headline: 'Local Startup’s Self-Driving Delivery Pods Hit Del Perro Streets',
        dek: 'The knee-high robots have charmed pedestrians and infuriated cyclists in equal measure during their first week of trials.',
        author: 'Ravi Okonkwo',
        time: '11h',
        views: 18900,
        image: bg11,
        body: [
            'A fleet of knee-high autonomous delivery pods began trundling along Del Perro sidewalks this week, the opening salvo in a local startup’s bid to automate the city’s last mile of takeout and parcels.',
            'Reactions have been split. Pedestrians have largely embraced the boxy robots, some stopping to film them; cyclists and dog-walkers have been less charmed, citing near-misses on the crowded boardwalk.',
            'The company says its pods log every interaction and "learn the rhythm of each block," and insists a remote operator can take control of any unit within seconds.',
            'City regulators have granted only a 90-day trial permit, and have promised to pull it "the moment safety becomes a question rather than a checkbox."',
        ],
    },
    {
        id: 'a8',
        category: 'Weather',
        headline: 'Heatwave Advisory Issued as Temperatures Set to Spike',
        dek: 'Forecasters warn of triple-digit highs through the weekend and urge residents to limit outdoor activity during peak hours.',
        author: 'Gwen Castillo',
        time: '12h',
        views: 12300,
        image: bg7,
        body: [
            'The National Weather Service issued an excessive-heat advisory for greater Los Santos on Tuesday, forecasting triple-digit highs from the coast to the foothills through the weekend.',
            'Officials urged residents to hydrate, check on elderly neighbors, and avoid strenuous activity between noon and 6 p.m. Cooling centers will open across the city beginning Wednesday morning.',
            'The grid operator asked residents to set thermostats no lower than 78 degrees during the late-afternoon peak to head off the rolling outages that plagued the region last summer.',
            'Relief may arrive early next week, with a marine layer expected to push inland and shave several degrees off coastal highs.',
        ],
    },
    {
        id: 'a9',
        category: 'Local',
        headline: 'Beloved Del Perro Pier Diner to Close After Forty Years',
        dek: 'Rising rents claim another neighborhood institution as regulars line up for one last plate.',
        author: 'Jordan Vega',
        time: '14h',
        views: 7600,
        image: bg12,
        body: [
            'After four decades of serving pancakes to fishermen, tourists, and the occasional celebrity, the diner at the foot of Del Perro Pier will shutter at the end of the month, its owners citing a rent increase they called "simply impossible."',
            'Word of the closure drew a line out the door by mid-morning, regulars trading stories over coffee that, for once, nobody seemed in a hurry to finish.',
            'A neighborhood group has launched a campaign to find the diner a new home, though the owners admit the odds are long.',
            '"Forty years," the head cook said, scraping the flat-top one more time. "You don’t replace that with a smoothie shop."',
        ],
    },
    {
        id: 'a10',
        category: 'Crime',
        headline: 'Brazen Jewelry Heist at Rockford Hills Boutique Caught on Camera',
        dek: 'Three suspects fled with an estimated quarter-million in goods in under ninety seconds, police say.',
        author: 'Marisol Cienega',
        time: '16h',
        views: 24400,
        image: bg10,
        body: [
            'Surveillance footage released Tuesday shows three masked suspects clearing a Rockford Hills jewelry boutique of an estimated quarter-million dollars in merchandise in under ninety seconds before speeding off in a waiting sedan.',
            'The smash-and-grab, the second in the upscale district this month, has rattled merchants who say they are now reconsidering everything from display cases to opening hours.',
            'Detectives are reviewing footage from neighboring storefronts and traffic cameras, and have asked the public for tips on a dark sedan with no visible plates.',
            'No arrests have been made. The boutique declined to comment beyond confirming that no staff were harmed.',
        ],
    },
    {
        id: 'a11',
        category: 'Business',
        headline: 'Sandy Shores Solar Farm Breaks Ground After Years of Delay',
        dek: 'Backers tout hundreds of jobs and cheaper power; skeptics question the desert site’s long-stalled financing.',
        author: 'Priya Anand',
        time: '1d',
        views: 6100,
        image: bg3,
        body: [
            'Crews broke ground Tuesday on a long-delayed solar farm outside Sandy Shores, a project supporters say will eventually power tens of thousands of homes and bring hundreds of construction jobs to Blaine County.',
            'The development had stalled for years amid financing disputes and a tangle of permitting challenges, leading more than a few locals to write it off entirely.',
            'County officials at the ceremony struck an optimistic tone, calling the facility "proof the desert can power the city it’s been overshadowed by for decades."',
            'The first phase is expected to go online within eighteen months, weather and supply chains permitting.',
        ],
    },
    {
        id: 'a12',
        category: 'Politics',
        headline: 'Voters to Decide on Beachfront Development Cap This Fall',
        dek: 'A grassroots measure would limit high-rise construction along the Vespucci shoreline, pitting developers against residents.',
        author: 'Dennis Hargrove',
        time: '1d',
        views: 5400,
        image: bg6,
        body: [
            'A citizen-led measure that would cap high-rise development along the Vespucci shoreline has qualified for the fall ballot, setting up a costly clash between deep-pocketed developers and residents who fear losing their ocean views.',
            'Supporters gathered nearly double the required signatures, framing the cap as a defense of public access to the beach. Opponents counter that it would choke off housing the city desperately needs.',
            'Early polling suggests a tight race, with a large bloc of undecided voters likely to determine the outcome.',
            'Both camps are expected to pour money into advertising over the summer, promising one of the most contentious local campaigns in years.',
        ],
    },
    {
        id: 'a13',
        category: 'Tech',
        headline: 'City Rolls Out Smart Parking Meters Downtown — With a Catch',
        dek: 'The new meters take contactless payment and predict open spots, but privacy advocates are raising eyebrows.',
        author: 'Ravi Okonkwo',
        time: '1d',
        views: 8200,
        image: bg5,
        body: [
            'The city began installing a new generation of "smart" parking meters across Downtown this week, promising contactless payment, dynamic pricing, and an app that steers drivers toward open spaces in real time.',
            'Transportation officials say the system will reduce the circling that clogs the financial district at rush hour. The meters, they note, also report occupancy data back to a central dashboard.',
            'That last feature has drawn fire from privacy advocates, who want assurances the city is not building "a map of where everyone parks and when."',
            'The rollout will expand to the waterfront and Vinewood over the coming months if the pilot holds up.',
        ],
    },
    {
        id: 'a14',
        category: 'Sports',
        headline: 'Hometown Sprinter Shatters County Record at Vespucci Meet',
        dek: 'The 19-year-old’s blistering time has scouts buzzing and a community celebrating one of its own.',
        author: 'Cole Whitmore',
        time: '2d',
        views: 14700,
        image: bg9,
        body: [
            'A 19-year-old from the southern districts rewrote the county record books Saturday, blazing through the 100 meters at a beachfront meet in a time that left rivals — and the timing officials — doing a double take.',
            'The performance, captured on a dozen phones and replayed endlessly since, has drawn interest from scouts who had quietly tracked the sprinter through a standout amateur season.',
            'Coaches were quick to praise the runner’s humility as much as the raw speed. "Same kid who sweeps the track after practice," one said.',
            'Next up is a regional qualifier, and with it, the first real test of just how far this breakout season can go.',
        ],
    },
    {
        id: 'a15',
        category: 'Entertainment',
        headline: 'Indie Film Shot Entirely in Los Santos Lands Festival Buzz',
        dek: 'A micro-budget thriller filmed across the city’s overlooked corners is suddenly the talk of the circuit.',
        author: 'Tasha Lemoine',
        time: '2d',
        views: 11200,
        image: lockscreen,
        body: [
            'A micro-budget thriller shot entirely across Los Santos — from neon alleys to the windswept bluffs above the coast — has emerged as an unlikely darling of the festival circuit, drawing standing ovations and distributor interest.',
            'The first-time director, who funded much of the production by maxing out favors and credit cards, says the city itself was "the most reliable member of the cast."',
            'Local crew members have been quietly celebrating the recognition, hopeful it signals a wider appetite for stories rooted in the neighborhoods tourists never see.',
            'A wider release is reportedly being negotiated, which would make it the rare hometown production to play the very theaters it was filmed beside.',
        ],
    },
    {
        id: 'a16',
        category: 'Weather',
        headline: 'Rare Coastal Fog Snarls Morning Flights at LSIA',
        dek: 'A thick marine layer grounded dozens of departures, stranding travelers and rippling delays across the region.',
        author: 'Gwen Castillo',
        time: '3d',
        views: 9100,
        image: homescreen,
        body: [
            'A dense marine fog rolled in off the coast before dawn Tuesday, reducing visibility at Los Santos International to near zero and forcing controllers to ground dozens of morning departures.',
            'Stranded travelers packed the terminals as the delays cascaded outward, with knock-on cancellations reported as far as the desert regional strips.',
            'Forecasters said the fog was the product of an unusually warm ocean meeting cool overnight air, a pairing they expect to recur through the week.',
            'Airport officials urged passengers to confirm flight status before traveling and warned that a full schedule recovery could take "most of the day."',
        ],
    },
];
