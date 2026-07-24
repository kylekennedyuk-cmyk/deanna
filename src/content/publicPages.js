const { images } = require('./disneyImages');

const pages = {
  about: {
    title: 'About Deanna',
    seoTitle: 'Meet Deanna | Disneyland Paris Travel Specialist',
    seoDesc:
      'Meet Deanna, a Disneyland Paris travel specialist helping families, couples and groups plan memorable trips from the UK.',
    sections: [
      {
        type: 'hero',
        eyebrow: 'Your Disneyland Paris specialist',
        heading: 'Personal advice from someone who understands the whole trip',
        text:
          'From choosing the right hotel to balancing park days, dining and travel from the UK, Deanna brings every part of your holiday together around the people travelling.',
        image: images.parkCrowd,
        imageAlt: 'Guests outside Sleeping Beauty Castle at Disneyland Paris',
        primaryLabel: 'Start your holiday plan',
        primaryHref: '/planner',
      },
      {
        type: 'split',
        eyebrow: 'Why work with a specialist',
        heading: 'Less searching. Better Disney decisions.',
        text:
          'Disneyland Paris offers many combinations of hotels, ticket lengths, meal plans and travel options. Deanna helps you compare what genuinely suits your party instead of simply choosing the first package that appears.',
        points: [
          'Recommendations shaped around ages, interests and budget',
          'Practical guidance on hotels, dining reservations and park time',
          'One place to review plans, messages and updates',
        ],
        image: images.castleNight,
        imageAlt: 'Sleeping Beauty Castle lit at night at Disneyland Paris',
      },
      {
        type: 'cards',
        eyebrow: 'Who Deanna helps',
        heading: 'Every trip has a different rhythm',
        cards: [
          {
            title: 'Families',
            text: 'Age-aware itineraries, sensible breaks, character priorities and hotel recommendations that make family logistics easier.',
          },
          {
            title: 'Couples',
            text: 'Dining, premium hotel choices, seasonal events and relaxed plans with space for spontaneous moments.',
          },
          {
            title: 'Groups',
            text: 'Room planning, mixed interests, accessible options and a shared itinerary everyone can understand.',
          },
        ],
      },
      {
        type: 'cta',
        heading: 'Tell Deanna what would make your trip special',
        text:
          'Complete the guided planner and receive recommendations built around your dates, party and priorities.',
        primaryLabel: 'Start planning',
        primaryHref: '/planner',
        secondaryLabel: 'Explore the guide',
        secondaryHref: '/disneyland-paris',
      },
    ],
  },

  'disneyland-paris': {
    title: 'Disneyland Paris Guide',
    seoTitle: 'Disneyland Paris Guide | Hotels, Parks, Dining & Travel',
    seoDesc:
      'Plan Disneyland Paris with specialist guidance on parks, hotels, dining, tickets, travel from the UK and first-time visits.',
    sections: [
      {
        type: 'hero',
        eyebrow: 'The specialist guide',
        heading: 'Build a Disneyland Paris trip that works for your family',
        text:
          'Understand the parks, compare hotels, plan dining and make confident choices before you travel. Start with the essentials, then ask Deanna to tailor everything to your party.',
        image: images.castleNight,
        imageAlt: 'Sleeping Beauty Castle at night at Disneyland Paris',
        primaryLabel: 'Start planning',
        primaryHref: '/planner',
        secondaryLabel: 'Compare hotels',
        secondaryHref: '/disneyland-paris/hotels',
      },
      {
        type: 'cards',
        eyebrow: 'Plan the essentials',
        heading: 'Your trip, broken into simple decisions',
        cards: [
          {
            title: 'The parks',
            text: 'Disneyland Park is home to the castle, classic attractions and parades. Disney Adventure World adds Marvel, Pixar and expanding new experiences.',
            href: '/disneyland-paris/things-to-do',
            label: 'Explore experiences',
          },
          {
            title: 'Where to stay',
            text: 'On-site Disney Hotels offer convenience and Extra Magic Time. Partner hotels can deliver more space or stronger value.',
            href: '/disneyland-paris/hotels',
            label: 'Compare hotels',
          },
          {
            title: 'Where to eat',
            text: 'Choose between quick service, table service, buffets and character dining, with reservations planned around your park day.',
            href: '/disneyland-paris/dining',
            label: 'Read dining advice',
          },
        ],
      },
      {
        type: 'split',
        eyebrow: 'First-time visitor advice',
        heading: 'Decide what matters most — then build the days around it',
        text:
          'You do not need to do everything. Pick the moments your family will remember — a castle morning, a character meal, fireworks, a favourite ride — and let Deanna shape park days, rest time and reservations around those.',
        points: [
          'Book must-do dining as soon as your reservation window opens',
          'Use Extra Magic Time for the rides that matter most to you',
          'Keep each half-day to one or two headline experiences',
          'Check seasonal shows and fireworks before locking the itinerary',
        ],
        image: images.parkCrowd,
        imageAlt: 'Guests enjoying Disneyland Park near Sleeping Beauty Castle',
      },
      {
        type: 'faq',
        eyebrow: 'Quick answers',
        heading: 'Disneyland Paris FAQs',
        items: [
          {
            question: 'How many days do I need?',
            answer:
              'Three park days is a strong starting point for most first visits. Four days gives families more flexibility, especially during busy seasons.',
          },
          {
            question: 'When should I book?',
            answer:
              'Book once your dates are reasonably firm, particularly for school holidays, Christmas and popular Disney Hotels. Dining and travel can then be layered in at the right time.',
          },
          {
            question: 'Do I need a meal plan?',
            answer:
              'Not always. Meal plans can suit guests who prefer predictable costs and table-service meals, while flexible diners may prefer paying as they go.',
          },
        ],
      },
    ],
  },

  hotels: {
    title: 'Disneyland Paris Hotels',
    seoTitle: 'Disneyland Paris Hotels | Specialist Comparison Guide',
    seoDesc:
      'Compare Disneyland Paris Disney Hotels and partner hotels by location, atmosphere, family fit and typical price level.',
    sections: [
      {
        type: 'hero',
        eyebrow: 'Where to stay',
        heading: 'Choose a hotel that improves the whole holiday',
        text:
          'The right hotel is about more than the room. Walking distance, transport, theming, breakfast, pool time and your daily pace all affect which option represents the best value.',
        image: images.disneyHotel,
        imageAlt: 'Disney Newport Bay Club at Disneyland Paris',
        primaryLabel: 'Get a tailored recommendation',
        primaryHref: '/planner',
      },
      {
        type: 'hotelGrid',
        eyebrow: 'Disney Hotels',
        heading: 'Stay closer to the magic',
        hotels: [
          {
            name: 'Disneyland Hotel',
            level: 'Premium',
            bestFor: 'Celebrations, first visits and guests wanting the closest location',
            description:
              'The flagship hotel sits at the entrance to Disneyland Park, combining royal styling, premium service and exceptional convenience.',
          },
          {
            name: 'Disney Hotel New York – The Art of Marvel',
            level: 'Premium',
            bestFor: 'Marvel fans, couples and families wanting contemporary facilities',
            description:
              'A polished, gallery-inspired hotel with Marvel artwork, strong dining options, a pool and a short walk through Disney Village.',
          },
          {
            name: 'Disney Newport Bay Club',
            level: 'Upper mid-range',
            bestFor: 'Families who value leisure facilities and a resort atmosphere',
            description:
              'A large lakeside hotel with nautical styling, indoor and outdoor pools, and a pleasant walk or shuttle to the parks.',
          },
          {
            name: 'Disney Sequoia Lodge',
            level: 'Mid-range',
            bestFor: 'Winter stays, relaxed evenings and woodland atmosphere',
            description:
              'Warm lodge styling, a popular pool and easy access around Lake Disney make this a comfortable family choice.',
          },
          {
            name: 'Disney Hotel Cheyenne',
            level: 'Value',
            bestFor: 'Toy Story fans and families prioritising theme and price',
            description:
              'Colourful Wild West streets, family-friendly rooms and regular shuttle transport deliver strong Disney atmosphere at a lower price point.',
          },
          {
            name: 'Disney Hotel Santa Fe',
            level: 'Value',
            bestFor: 'Guests spending most of the day in the parks',
            description:
              'A straightforward Cars-themed base with practical rooms, buffet dining and shuttle transport.',
          },
        ],
      },
      {
        type: 'cards',
        eyebrow: 'Partner hotels',
        heading: 'More space and alternative budgets',
        cards: [
          {
            title: 'Aparthotels',
            text: 'Useful for larger families and guests who value kitchen facilities, separate sleeping areas or longer stays.',
          },
          {
            title: 'Val d’Europe',
            text: 'A practical base close to shops, restaurants and the RER, often with more dining flexibility than an on-site stay.',
          },
          {
            title: 'Shuttle hotels',
            text: 'Selected partner hotels provide park transport and family rooms, balancing convenience with competitive pricing.',
          },
        ],
      },
      {
        type: 'tips',
        eyebrow: 'Before you choose',
        heading: 'What Deanna compares for you',
        items: [
          'Total package value, not room price alone',
          'Walking distance, shuttle frequency and buggy practicality',
          'Room occupancy and bed configuration',
          'Breakfast, meal-plan and restaurant options',
          'Pool closures, refurbishment and seasonal considerations',
          'How much time your party expects to spend at the hotel',
        ],
      },
    ],
  },

  dining: {
    title: 'Disneyland Paris Dining',
    seoTitle: 'Disneyland Paris Dining Guide | Restaurants & Meal Plans',
    seoDesc:
      'Specialist advice on Disneyland Paris restaurants, character dining, meal plans, reservations and family dining.',
    sections: [
      {
        type: 'hero',
        eyebrow: 'Dining guide',
        heading: 'Plan memorable meals without losing your park day',
        text:
          'Dining can be a highlight, a useful break or a special character experience. The best choices depend on appetite, budget, location and how much structure you want.',
        image: images.parkCrowd,
        imageAlt: 'Guests at Disneyland Paris — plan dining around your park day',
        primaryLabel: 'Add dining to your plan',
        primaryHref: '/planner',
      },
      {
        type: 'cards',
        eyebrow: 'Dining styles',
        heading: 'Choose the right meal for the moment',
        cards: [
          {
            title: 'Quick service',
            text: 'Best for flexible park days and controlled budgets. Plan around peak lunch times to reduce queues.',
          },
          {
            title: 'Table service',
            text: 'A longer, more relaxed meal with themed surroundings—ideal for one planned highlight during the day.',
          },
          {
            title: 'Character dining',
            text: 'A premium experience that combines a meal with character interactions and can reduce pressure to queue for meets elsewhere.',
          },
        ],
      },
      {
        type: 'split',
        eyebrow: 'Reservations',
        heading: 'Book the meals that matter most',
        text:
          'Popular restaurants and character dining can fill quickly. Prioritise one or two must-do meals, then keep the rest of the itinerary flexible. Deanna can help align reservations with show times, park plans and younger travellers.',
        points: [
          'Check the current reservation window before travel',
          'Avoid booking every evening if your party values flexibility',
          'Allow travel time between parks, hotels and Disney Village',
          'Declare dietary requirements and allergies clearly',
        ],
        image: images.illuminations || images.fireworks,
        imageAlt: 'Evening at Disneyland Paris — time dining around the spectacular',
      },
      {
        type: 'faq',
        eyebrow: 'Meal-plan questions',
        heading: 'Is a meal plan right for you?',
        items: [
          {
            question: 'What does a meal plan provide?',
            answer:
              'Meal plans generally provide meal entitlements at participating restaurants. Exact inclusions vary, so compare the current terms against where you genuinely want to eat.',
          },
          {
            question: 'Is character dining included?',
            answer:
              'Some plans may contribute toward character dining, but supplements or specific entitlement levels can apply. Always check the current package terms.',
          },
          {
            question: 'Can dietary requirements be accommodated?',
            answer:
              'Many venues can support common dietary needs, but options vary. Share requirements early and confirm them again with the restaurant team.',
          },
        ],
      },
    ],
  },

  'planning-advice': {
    title: 'Planning Advice',
    seoTitle: 'Disneyland Paris Planning Advice | UK Specialist Guide',
    seoDesc:
      'Detailed Disneyland Paris planning advice covering dates, trip length, hotels, dining, park strategy, budgets and travel from the UK.',
    sections: [
      {
        type: 'hero',
        eyebrow: 'Plan with confidence',
        heading: 'The decisions that make the biggest difference',
        text:
          'Good planning is not about scheduling every minute. It is about booking the right elements early, understanding your options and protecting the experiences your party will value most.',
        image: images.fireworks,
        imageAlt: 'Evening fireworks above Disneyland Paris castle',
        primaryLabel: 'Build my holiday plan',
        primaryHref: '/planner',
      },
      {
        type: 'timeline',
        eyebrow: 'Booking timeline',
        heading: 'What to decide—and when',
        items: [
          {
            title: 'Choose your travel window',
            text: 'Balance school holidays, seasonal entertainment, weather, crowd levels and package prices.',
          },
          {
            title: 'Secure hotel and tickets',
            text: 'Popular hotels and room types can narrow during peak periods. Compare the full package, not only the headline room rate.',
          },
          {
            title: 'Plan UK travel',
            text: 'Compare flights, Eurostar connections, driving and airport transfers using total journey time and baggage needs.',
          },
          {
            title: 'Reserve priority dining',
            text: 'Book character meals and popular table-service restaurants when the current booking window opens.',
          },
          {
            title: 'Shape each park day',
            text: 'Choose priorities, review height requirements and entertainment schedules, then leave room for changes.',
          },
        ],
      },
      {
        type: 'cards',
        eyebrow: 'Best time to visit',
        heading: 'Every season has trade-offs',
        cards: [
          {
            title: 'Spring',
            text: 'Milder weather and attractive gardens, with prices and crowds rising around Easter and school breaks.',
          },
          {
            title: 'Summer',
            text: 'Longer days and full entertainment schedules, balanced against heat, peak crowds and higher package prices.',
          },
          {
            title: 'Autumn & winter',
            text: 'Strong seasonal atmosphere for Halloween and Christmas, with shorter daylight and colder, wetter conditions.',
          },
        ],
      },
      {
        type: 'split',
        eyebrow: 'How long to stay',
        heading: 'Three park days is a useful starting point',
        text:
          'A two-night visit can work for experienced guests with focused priorities. First-time families usually benefit from three or four park days, particularly if they want character dining, shows, breaks or pool time.',
        points: [
          'Add time for arrival and departure rather than counting them as full park days',
          'Build in a slower morning after a late parade or fireworks',
          'Give younger children space for meals and rest',
          'Use an extra day to absorb weather or attraction closures',
        ],
        image: images.parkDay,
        imageAlt: 'Guests enjoying Disneyland Park on a bright day',
      },
      {
        type: 'tips',
        eyebrow: 'Budget planning',
        heading: 'Price the complete trip',
        items: [
          'Hotel and park tickets',
          'Flights, rail or driving costs',
          'Airport parking and transfers',
          'Meals, snacks and character dining',
          'Premier Access and optional experiences',
          'Travel insurance, spending money and contingency',
        ],
      },
      {
        type: 'faq',
        eyebrow: 'Specialist advice',
        heading: 'Common planning questions',
        items: [
          {
            question: 'Should I stay on-site?',
            answer:
              'On-site hotels suit guests who value proximity, Disney theming and Extra Magic Time. Off-site options can suit larger parties, longer stays and tighter budgets.',
          },
          {
            question: 'Should I buy Premier Access?',
            answer:
              'Treat it as a targeted tool rather than an automatic extra. It may be worthwhile for a small number of high-priority attractions on busy days.',
          },
          {
            question: 'Flights, Eurostar or driving?',
            answer:
              'The best option depends on departure point, luggage, transfers, confidence driving abroad and total door-to-door time. Compare the complete journey rather than the ticket price alone.',
          },
        ],
      },
    ],
  },

  contact: {
    title: 'Contact Deanna',
    seoTitle: 'Contact Destinations With Deanna',
    seoDesc:
      'Contact Deanna for specialist Disneyland Paris holiday planning and advice.',
    sections: [
      {
        type: 'hero',
        eyebrow: 'Speak to a specialist',
        heading: 'Tell Deanna where you are in your planning',
        text:
          'Whether you have fixed dates, a shortlist of hotels or only the idea of a trip, share what you know so far. Deanna will help identify the next useful step.',
        image: images.fireworks,
        imageAlt: 'Night-time fireworks above the Disneyland Paris castle',
      },
    ],
  },
};

module.exports = { pages, images };
