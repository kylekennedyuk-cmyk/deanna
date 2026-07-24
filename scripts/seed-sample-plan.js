const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({ where: { username: 'admin' } });
  const plan = await prisma.holidayPlan.create({
    data: {
      customerId: admin.id,
      status: 'in_progress',
      travelDates: 'Spring 2027',
      partySize: 4,
      budget: 4500,
      preferences: JSON.stringify({
        dates: 'Spring half-term 2027',
        nights: 5,
        airport: 'Manchester',
        adults: 2,
        children: 2,
        childAges: '6, 9',
        occasion: 'Family holiday',
        pace: 'balanced',
        interests: 'Rides, Characters, Shows',
        budget: 4500,
        hotelType: 'Disney hotel',
        board: 'Breakfast',
      }),
      hotel:
        'Hotel: Disney Hotel New York\nRoom type: Family room\nBoard: Breakfast\nNights: 5\nWhy this hotel: Close to the parks with a calm pool for downtime.',
      flights:
        'Airline: easyJet\nUK airport: Manchester\nOutbound: Morning departure\nReturn: Evening flight\nNotes: Direct flights preferred.',
      itinerary:
        'Day 1 — Arrive and settle\nDay 2 — Disneyland Park highlights\nDay 3 — Adventure World + characters\nDay 4 — Flexible magic + shopping\nDay 5 — Depart',
      pricing: "Total: £4500\nDeposit: £800\nWhat's included: Flights, hotel, tickets, transfers",
    },
  });
  console.log('plan', plan.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
