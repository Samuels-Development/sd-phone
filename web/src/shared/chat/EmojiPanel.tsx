import { useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

import { emojiKeywords, emojiName } from './emojiKeywords';
import { t } from '@/i18n';

const DATA: Record<string, string[]> = {
    recent:   ['😀','❤️','👍','🔥','😂','✨','💯','🙏','😊','🥰','😭','🤣','👀','💀','🎉','😤','🫡','💪','🤝','🫶'],
    smileys:  ['😀','😃','😄','😁','😆','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','😕','😟','🙁','☹️','😮','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👁','👅','👄','🫦','🙃','🫠','🥲','🥹','🫢','🫣','🫥','😮‍💨','😵‍💫','😶‍🌫️','🫨','🫰','🫵','🫱','🫲','🫳','🫴','🤝'],
    nature:   ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🕷','🐢','🐍','🦎','🐙','🦑','🦐','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐘','🦛','🦏','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🐈','🌵','🌲','🌳','🌴','🌱','🌿','☘️','🍀','🍃','🍂','🍁','🍄','🌾','💐','🌷','🌹','🥀','🌺','🌸','🌼','🌻','🌞','🌝','🌛','🌜','🌚','🌕','🌙','⭐','🌟','☁️','⛅','🌈','🔥','💧','🌊','❄️','⚡','🌪','🌫','🦮','🐈‍⬛','🪶','🦩','🦚','🦜','🦢','🦫','🦦','🦥','🦧','🦣','🦤','🪱','🪰','🪲','🪳','🦟','🦠','🐉','🦕','🦖','🪸','🪷','🪴','🐾'],
    food:     ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🌽','🥕','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🌮','🌯','🥗','🥘','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍘','🥮','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🧃','🥤','🧋','☕','🍵','🫖','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🍾','🫛','🫚','🧆','🫔','🥫','🍢','🍡','🧊','🫙','🥠','🥡','🫓','🧂','🥨','🫕','🍶','🧉'],
    travel:   ['🚗','🚕','🚙','🚌','🚎','🏎','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛵','🏍','🚲','🛴','🛹','⚓','⛵','🚤','🛥','🛳','🚢','✈️','🛩','🚁','🚀','🛸','🌍','🌎','🌏','🗺','🧭','🏔','⛰','🌋','🗻','🏕','🏖','🏗','🏘','🏠','🏡','🏢','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','⛺','🎠','🎡','🎢','💈','🎪','🛺','🚊','🚉','🚆','🚄','🚅','🚈','🚝','🚋','🚂','🛞','🛟','⛽','🚏','🚦','🚥','🗿','🏟','🏛','⛲','🌁','🌃','🌆','🌇','🌉','🏞'],
    objects:  ['⌚','📱','💻','🖥','🖨','🖱','💾','💿','📀','📷','📸','📹','🎥','📞','☎️','📺','📻','🔋','🔌','💡','🔦','🕯','💰','💵','💳','🪙','💎','⚖️','🔧','🔨','🛠','🔩','🔪','🔬','🔭','💊','💉','🩹','🎒','👜','👛','🎩','👒','👟','👠','👡','👢','🥾','💄','💍','🔑','🗝','🔐','🔒','🔓','🔏','🚪','🪑','🛋','🪞','🛁','🚿','🧹','🧺','🧻','🚽','🪠','🧼','🫧','🪤','🧲','🪜','🧰','⚗️','🔭','📡','💣','🧨','🎆','🎇','🧸','🪆','🎈','🎀','🎁','🎊','🎉','🎎','🎏','🎐','🧧','🎑','🎃','🎄','🎋','🎍','🎆','🪫','🧾','🪪','🛗','🪮','🪥','🧴','🧷','🧯','🪦','⚰️','⚱️','🪧','📿','🧿','🪬','🔮','🪄','🪛','🪚','🪓','🛡','🗡','🔫','🪣','🧽','🌡','🧪','🧫','🧬'],
    activity: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛷','⛸','🥌','🎿','⛷','🏂','🪂','🏋','🤼','🤸','⛹','🤺','🤾','🏌','🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚵','🚴','🏆','🥇','🥈','🥉','🏅','🎖','🎗','🎫','🎟','🎪','🤹','🎭','🩰','🎨','🖼','🎰','🎲','🧩','🧸','🃏','🀄','🎴','🎮','🕹','🎯','🛼','🪅','🪩','🪈','🪕','🎸','🎹','🥁','🎺','🎷','🪗','🎻','🪘','♟'],
    symbols:  ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','✡️','🔯','🪯','☯️','🛐','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','⛎','🔀','🔁','🔂','▶️','⏩','⏭','⏯','◀️','⏪','⏮','🔼','⏫','🔽','⏬','⏸','⏹','⏺','🎦','🔅','🔆','📶','📳','📴','📵','🔇','🔈','🔉','🔊','📢','📣','🔔','🔕','🎵','🎶','⚠️','🚸','🔞','♻️','✅','❎','🆗','🆙','🆕','🆓','🆒','🔱','🔰','💠','♾','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🩷','🩵','🩶','➕','➖','➗','✖️','🟰','♥️','♠️','♣️','♦️','⛔','🚫','💢','💥','💫','💦','💨','🕳','💬','💭','🗯','♨️','✳️','✴️','❇️','©️','®️','™️','🔟','🆔','🆘','🆚'],
    flags:    ['🏁','🚩','🎌','🏴','🏳','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇺🇸','🇬🇧','🇨🇦','🇦🇺','🇩🇪','🇫🇷','🇮🇹','🇪🇸','🇵🇹','🇧🇷','🇲🇽','🇳🇱','🇧🇪','🇨🇭','🇦🇹','🇵🇱','🇷🇺','🇺🇦','🇯🇵','🇨🇳','🇰🇷','🇮🇳','🇸🇦','🇹🇷','🇮🇱','🇿🇦','🇳🇬','🇦🇷','🇨🇱','🇨🇴','🇵🇪','🇻🇪','🇸🇪','🇩🇰','🇳🇴','🇫🇮','🇮🇸','🇮🇪','🇬🇷','🇨🇿','🇸🇰','🇭🇺','🇷🇴','🇧🇬','🇭🇷','🇷🇸','🇸🇮','🇱🇹','🇱🇻','🇪🇪','🇲🇹','🇨🇾','🇱🇺','🇸🇬','🇲🇾','🇮🇩','🇹🇭','🇻🇳','🇵🇭','🇵🇰','🇧🇩','🇱🇰','🇳🇵','🇪🇺','🇳🇿','🇪🇬','🇲🇦','🇰🇪','🇬🇭','🇪🇹','🇩🇿','🇹🇳','🇶🇦','🇦🇪','🇰🇼','🇮🇶','🇮🇷','🏴󠁧󠁢󠁥󠁮󠁧󠁿','🏴󠁧󠁢󠁳󠁣󠁴󠁿','🏴󠁧󠁢󠁷󠁬󠁳󠁿'],
};

const ALL_EMOJIS = Array.from(new Set(Object.values(DATA).flat()));

interface Props {
    isDark:   boolean;
    onSelect: (emoji: string) => void;
}

export function EmojiPanel({ isDark, onSelect }: Props) {
    const SECTIONS = [
        { id: 'recent',   icon: '🕘', title: t('messages.emojiFrequentlyUsed', 'Frequently Used')  },
        { id: 'smileys',  icon: '😀', title: t('messages.emojiSmileysPeople', 'Smileys & People') },
        { id: 'nature',   icon: '🐻', title: t('messages.emojiAnimalsNature', 'Animals & Nature') },
        { id: 'food',     icon: '🍔', title: t('messages.emojiFoodDrink', 'Food & Drink')     },
        { id: 'travel',   icon: '🚗', title: t('messages.emojiTravelPlaces', 'Travel & Places')  },
        { id: 'activity', icon: '⚽', title: t('messages.emojiActivity', 'Activity')          },
        { id: 'objects',  icon: '💡', title: t('messages.emojiObjects', 'Objects')           },
        { id: 'symbols',  icon: '❤️', title: t('messages.emojiSymbols', 'Symbols')           },
        { id: 'flags',    icon: '🏁', title: t('messages.emojiFlags', 'Flags')             },
    ];

    const [query,     setQuery]     = useState('');
    const [activeCat, setActiveCat] = useState<string>('recent');
    const [hover,     setHover]     = useState<string | null>(null);

    const scrollRef   = useRef<HTMLDivElement>(null);
    const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const searching = query.trim().length > 0;

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return ALL_EMOJIS.filter(e => emojiKeywords(e).includes(q));
    }, [query]);

    function jumpTo(catId: string) {
        setQuery('');
        setActiveCat(catId);
        requestAnimationFrame(() => {
            const el = sectionRefs.current[catId];
            const sc = scrollRef.current;
            if (el && sc) sc.scrollTo({ top: el.offsetTop });
        });
    }

    function onScroll() {
        if (searching) return;
        const sc = scrollRef.current;
        if (!sc) return;
        const y = sc.scrollTop + 14;
        let cur = SECTIONS[0].id;
        for (const s of SECTIONS) {
            const el = sectionRefs.current[s.id];
            if (el && el.offsetTop <= y) cur = s.id;
        }
        if (cur !== activeCat) setActiveCat(cur);
    }

    const fieldBg = isDark ? 'rgb(var(--elevated))' : '#FFFFFF';

    const moodEmoji = hover ?? '😊';
    const moodLabel = hover ? (emojiName(hover) || t('messages.emoji', 'Emoji')) : t('messages.whatsYourMood', "What's Your Mood?");

    return (
        <div
            className="flex flex-col bg-surface border-t border-black/[0.08] dark:border-white/[0.08]"
            style={{ height: 380 }}
        >
            <div
                className="mx-3 mb-3 mt-2.5 flex items-center gap-2 rounded-[11px] px-3 py-[8px]"
                style={{ background: fieldBg }}
            >
                <Search className="h-[16px] w-[16px] shrink-0 text-black/40 dark:text-white/40" strokeWidth={2.5} />
                <input
                    type="text"
                    placeholder={t('common.search', 'Search')}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-[16px] text-black placeholder-black/40 outline-none dark:text-white dark:placeholder-white/40"
                />
                {query && (
                    <button
                        type="button"
                        onClick={() => setQuery('')}
                        aria-label={t('common.clearSearch', 'Clear search')}
                        className="shrink-0 text-[22px] font-medium leading-none text-black/40 active:opacity-60 dark:text-white/45"
                    >
                        ×
                    </button>
                )}
            </div>

            <div className="flex items-center px-2 pb-2.5">
                {SECTIONS.map(cat => {
                    const active = !searching && activeCat === cat.id;
                    return (
                        <button
                            key={cat.id}
                            type="button"
                            onClick={() => jumpTo(cat.id)}
                            className={`flex flex-1 items-center justify-center rounded-[9px] py-[7px] text-[24px] leading-none transition-colors ${
                                active ? 'bg-black/[0.08] dark:bg-white/[0.12]' : ''
                            }`}
                        >
                            <span className={active ? 'opacity-100' : 'opacity-40'}>{cat.icon}</span>
                        </button>
                    );
                })}
            </div>

            <div className="mx-3 h-[0.5px] bg-hairline/[0.08]" />

            <div ref={scrollRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto no-scrollbar px-3 pt-2.5">
                {searching ? (
                    results.length > 0 ? (
                        <EmojiGrid emojis={results} onSelect={onSelect} onHover={setHover} />
                    ) : (
                        <p className="pt-10 text-center text-[14px] text-black/35 dark:text-white/35">{t('messages.noEmojiFound', 'No emoji found')}</p>
                    )
                ) : (
                    SECTIONS.map(s => (
                        <div key={s.id} ref={el => { sectionRefs.current[s.id] = el; }} className="pt-2.5">
                            <div className="px-1 pb-1 text-[13px] font-semibold text-black/55 dark:text-white/55">
                                {s.title}
                            </div>
                            <EmojiGrid emojis={DATA[s.id]} onSelect={onSelect} onHover={setHover} />
                        </div>
                    ))
                )}
            </div>

            <div
                className="mx-3 mb-2 mt-1.5 flex items-center gap-3 rounded-[14px] px-3 py-2.5"
                style={{ background: fieldBg }}
            >
                <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[#FFCB4D] text-[22px] leading-none">
                    {moodEmoji}
                </div>
                <span className="truncate text-[15px] font-medium text-black dark:text-white">{moodLabel}</span>
            </div>
        </div>
    );
}

function EmojiGrid({ emojis, onSelect, onHover }: {
    emojis:   string[];
    onSelect: (e: string) => void;
    onHover?: (e: string | null) => void;
}) {
    return (
        <div className="grid grid-cols-7 gap-y-0.5">
            {emojis.map((e, i) => (
                <button
                    key={`${e}-${i}`}
                    type="button"
                    onClick={() => onSelect(e)}
                    onMouseEnter={() => onHover?.(e)}
                    onMouseLeave={() => onHover?.(null)}
                    className="flex h-[42px] items-center justify-center rounded-[8px] text-[29px] leading-none active:bg-black/10 dark:active:bg-white/10"
                >
                    {e}
                </button>
            ))}
        </div>
    );
}
