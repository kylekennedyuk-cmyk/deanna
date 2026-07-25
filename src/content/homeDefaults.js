/**
 * Default homepage sections — used as seed/fallback and for syncing into the CMS.
 * Edit live content in Admin → Pages → Home after syncing once.
 */
const img = {
  hero: 'https://images.unsplash.com/photo-1733424775835-1c7f7bebb1bb?auto=format&fit=crop&w=2000&q=85',
  castleDay: 'https://images.unsplash.com/photo-1742079741493-fd9845d816f9?auto=format&fit=crop&w=1200&q=85',
  illuminations: 'https://images.unsplash.com/photo-1685134404136-e797d7a5df4a?auto=format&fit=crop&w=1200&q=85',
  parkCrowd: 'https://images.unsplash.com/photo-1690097232120-a59669ee0989?auto=format&fit=crop&w=1200&q=85',
  disneyHotel: '/images/disney/disney-hotel-newport.jpg',
  disneyHotelAlt: '/images/disney/disney-hotel-new-york.jpg',
  hotelGrounds: '/images/disney/disney-hotels-park.jpg',
  eurostar: '/images/disney/easyjet-gatwick.jpg',
};

const homeDefaults = [
  {
    type: 'hero',
    eyebrow: 'Disneyland Paris specialist',
    headline: 'Disneyland Paris holidays, planned around your family',
    heading: 'Disneyland Paris holidays, planned around your family',
    subheadline:
      'Deanna plans park days, Disney hotels, dining and travel from the UK — so your trip feels magical, not overwhelming.',
    text: 'Deanna plans park days, Disney hotels, dining and travel from the UK — so your trip feels magical, not overwhelming.',
    image: img.hero,
    imageAlt: 'Fireworks over Sleeping Beauty Castle at Disneyland Paris',
    overlayOpacity: 70,
    panelOpacity: 20,
    primaryLabel: 'Start planning your trip',
    primaryHref: '/planner',
    secondaryLabel: 'Explore the guide',
    secondaryHref: '/disneyland-paris',
    points: [
      'Park days shaped around ages & stamina',
      'Disney Hotels & Partner Hotels compared properly',
      'Tickets, dining reservations & travel in one plan',
    ],
  },
  {
    type: 'why',
    title: 'Why plan with Deanna',
    text: 'Specialist Disneyland Paris advice — not a generic booking engine. Clear recommendations built around your dates, party and budget.',
    eyebrow: 'Why plan with Deanna',
    items: [
      {
        title: 'Specialist knowledge',
        text: 'Deep Disneyland Paris expertise, not a generic booking engine.',
      },
      {
        title: 'Personal service',
        text: 'Every itinerary is tailored to your family, budget, and pace.',
      },
      {
        title: 'Ongoing support',
        text: 'Message Deanna from your private portal as plans take shape.',
      },
    ],
  },
  {
    type: 'process',
    title: 'How planning works',
    eyebrow: 'How it works',
    primaryLabel: 'Begin your Disneyland Paris plan',
    primaryHref: '/planner',
    steps: [
      {
        title: 'Share your dream trip',
        text: 'Complete the guided planner — dates, travellers, style, and must-haves.',
      },
      {
        title: 'Deanna builds your plan',
        text: 'Hotels, tickets, pacing, and pricing curated for you.',
      },
      {
        title: 'Review & refine together',
        text: 'Chat in your portal until everything feels just right.',
      },
    ],
  },
  {
    type: 'featureCards',
    eyebrow: 'Where to stay',
    heading: 'Disney Hotels, Partner Hotels & trusted nearby stays',
    text: 'Deanna compares park access, theming, room setup and total package value — so you choose the right base for your family, not just the cheapest room rate.',
    primaryLabel: 'Open the hotel guide',
    primaryHref: '/disneyland-paris/hotels',
    cards: [
      {
        title: 'Disney Hotels',
        text: 'Themed rooms, Extra Magic Time and the shortest walk (or hop) to the parks — ideal when waking up inside the magic matters most.',
        image: img.disneyHotel,
      },
      {
        title: 'Disney Partner Hotels',
        text: 'On-property partner stays with free shuttles, strong facilities and excellent value for families who still want park convenience.',
        image: img.disneyHotelAlt,
      },
      {
        title: 'Nearby trusted bases',
        text: 'Off-site hotels Deanna recommends for comfort, transport links and more budget left for dining, Premier Access and extras.',
        image: img.hotelGrounds,
      },
    ],
  },
  {
    type: 'split',
    eyebrow: 'Park days & pacing',
    heading: 'Castle mornings, parade evenings, sensible breaks',
    text: 'First-timers often underestimate queues, walking and nap windows. Deanna shapes park order, ticket length and rest time around your party — so the fireworks feel magical, not exhausting.',
    image: img.illuminations,
    imageAlt: 'Evening spectacular at Disneyland Paris',
    primaryLabel: 'Browse the park guide',
    primaryHref: '/disneyland-paris',
    secondaryLabel: 'Planning advice',
    secondaryHref: '/planning-advice',
    panelTitle: 'Tell Deanna what matters most',
    panelText:
      'Must-do rides, character moments, dining, ages and budget — she builds the plan around them.',
  },
  {
    type: 'highlights',
    eyebrow: 'Disneyland Paris highlights',
    heading: 'What your holiday can look like',
    text: 'Two parks, Disney hotels and a short hop from the UK — planned as one coherent trip, not a pile of separate bookings.',
    cards: [
      {
        title: 'Disneyland Park',
        text: 'Sleeping Beauty Castle, classic attractions, daytime entertainment and the evening spectacular.',
        image: img.castleDay,
      },
      {
        title: 'Walt Disney Studios Park',
        text: 'Pixar, Marvel and evolving worlds in the second park — paced so you are not racing between lands.',
        image: img.parkCrowd,
      },
      {
        title: 'Disney Hotels & Extra Magic Time',
        text: 'Stay on-site for themed rooms and quieter early park entry when it is available on your dates.',
        image: img.disneyHotel,
      },
      {
        title: 'Easy from the UK',
        text: 'Eurostar, flights and packages that fit half-terms and long weekends — with arrival day planned realistically.',
        image: img.eurostar,
      },
    ],
  },
  {
    type: 'testimonials',
    eyebrow: 'What families say',
    heading: 'Trusted to get the Disney details right',
    items: [
      {
        title: 'The Harper family',
        text: '“Deanna took the stress out of everything. The Disney hotel was perfect for our two under-fives and the dining reservations were spot on.”',
        label: 'February half-term',
      },
      {
        title: 'Sarah & James',
        text: '“Genuinely knowledgeable — she suggested a park order and Extra Magic Time plan we would never have thought of.”',
        label: 'Anniversary trip',
      },
      {
        title: 'The Okafor family',
        text: '“Tickets, hotel and fireworks evening all lined up. It felt like having a friend who lives and breathes Disneyland Paris.”',
        label: 'Summer holiday',
      },
    ],
  },
  {
    type: 'cta',
    heading: 'Ready for your Disneyland Paris plan?',
    text: 'Share your dates, party and must-dos. Deanna will shape hotels, tickets, dining and park pacing around your family.',
    primaryLabel: 'Start planning your trip',
    primaryHref: '/planner',
  },
];

const LEGACY_HOME_TYPES = new Set(['hero', 'why', 'process']);

/** True when DB still has the old 3-section home stub (hero / why / process only). */
function needsHomeDefaultsMerge(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return true;
  const types = sections.map((section) => section.type);
  const hasNewHomeBlock = types.some((type) => !LEGACY_HOME_TYPES.has(type) && type !== 'intro');
  if (hasNewHomeBlock) return false;
  return types.every((type) => LEGACY_HOME_TYPES.has(type) || type === 'intro');
}

/** Merge legacy/partial home sections with defaults; leave fully CMS-managed pages untouched. */
function resolveHomeSections(storedSections) {
  if (!needsHomeDefaultsMerge(storedSections)) {
    return Array.isArray(storedSections) ? storedSections : [];
  }
  const byType = new Map((storedSections || []).map((section) => [section.type, section]));
  return homeDefaults.map((defaults) => {
    const existing = byType.get(defaults.type);
    return existing ? existing : { ...defaults };
  });
}

module.exports = { homeDefaults, img, needsHomeDefaultsMerge, resolveHomeSections };
