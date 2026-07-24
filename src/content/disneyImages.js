/**
 * Curated Disneyland Paris imagery only (Coupvray / Chessy).
 * Do not add generic hotel, Sydney, tropical resort, or laptop stock.
 */
const dlp = (id, w = 1600) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=85`;

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
  /** Fireworks timelapse over the castle */
  fireworksWide: dlp('photo-1566477479348-5a74dc08f8dc'),
  /** Castle with guests — park day energy */
  parkCrowd: dlp('photo-1690097232120-a59669ee0989'),
  /** Hero crop */
  hero: dlp('photo-1733424775835-1c7f7bebb1bb', 2000),
};

// Aliases used by CMS page sections
Object.assign(images, {
  paris: images.castleNight,
  hotel: images.castleDay,
  dining: images.parkCrowd,
  family: images.parkCrowd,
  train: images.castleDayWide,
  planning: images.illuminations,
  adventure: images.parkCrowd,
  castleFireworks: images.fireworks,
  parkDay: images.castleDay,
});

module.exports = { images, dlp };
