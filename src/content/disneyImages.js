/**
 * Curated Disneyland Paris imagery.
 * Remote URLs are verified Coupvray/Chessy Unsplash photos.
 * Local /images/disney/* files are Wikimedia Commons photos of DLP hotels & Lake Disney.
 */
const dlp = (id, w = 1600) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=85`;

const local = (file) => `/images/disney/${file}`;

const images = {
  /** Sleeping Beauty Castle — daytime */
  castleDay: dlp('photo-1742079741493-fd9845d816f9'),
  /** Sleeping Beauty Castle — daytime with trees */
  castleDayWide: dlp('photo-1615470834591-79343b8cc869'),
  /** Sleeping Beauty Castle — night glow */
  castleNight: dlp('photo-1742079727590-4f7682f67d89'),
  /** Fireworks over the castle */
  fireworks: dlp('photo-1733424775835-1c7f7bebb1bb'),
  /** Illuminations / Main Street fireworks */
  illuminations: dlp('photo-1685134404136-e797d7a5df4a'),
  /** Castle with guests — park day energy */
  parkCrowd: dlp('photo-1690097232120-a59669ee0989'),
  /** Hero crop */
  hero: dlp('photo-1733424775835-1c7f7bebb1bb', 2000),

  /** Disney Newport Bay Club exterior */
  disneyHotel: local('disney-hotel-newport.jpg'),
  /** Disney Hotel New York exterior */
  disneyHotelNewYork: local('disney-hotel-new-york.jpg'),
  /** Landscaped Disney hotel grounds */
  disneyHotelGrounds: local('disney-hotels-park.jpg'),
  /** Lake Disney (resort hotels area) */
  lakeDisney: local('disney-lake.jpg'),
  /** Sequoia Lodge gardens */
  sequoiaLodge: local('disney-sequoia.jpg'),
  /** Eurostar — UK travel to Paris / Disney */
  eurostar: local('easyjet-gatwick.jpg'),
  ukFlight: local('easyjet-gatwick.jpg'),
};

// Aliases used by CMS page sections
Object.assign(images, {
  paris: images.castleNight,
  hotel: images.disneyHotel,
  dining: images.parkCrowd,
  family: images.parkCrowd,
  train: images.eurostar,
  planning: images.parkCrowd,
  adventure: images.parkCrowd,
  castleFireworks: images.fireworks,
  parkDay: images.castleDay,
});

module.exports = { images, dlp, local };
