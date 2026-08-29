/**
 * Real source imagery supplied by the creator.
 *
 * These are the actual uploaded assets — object studies, logo studies, a
 * typography specimen, structural beam references, diagrams, and photography.
 * Nothing here is generated or stock. Surfaces read from this one library so
 * the same underlying image always represents the same underlying work,
 * wherever the product surfaces it.
 *
 * Alt text describes only what is visibly in each image; no metadata is
 * invented here.
 */

export type SourceImage = {
  id: string;
  src: string;
  alt: string;
  orientation: 'portrait' | 'landscape' | 'square';
  kind?: 'video';
};

export const sourceImages: Record<string, SourceImage> = {
  textileWaste: {
    id: 'textile-waste',
    src: "/Screenshot_2025-01-04_113213.png",
    alt: 'A person standing on a vast hillside of discarded clothing under a clear sky',
    orientation: 'landscape'
  },
  aerialSite: {
    id: 'aerial-site',
    src: "/Screenshot_2025-01-07_164316.png",
    alt: 'Overhead satellite view of a house and its surrounding tree canopy, numbered 8817',
    orientation: 'landscape'
  },
  mechanicalPencil: {
    id: 'mechanical-pencil',
    src: "/Screenshot_2025-01-19_163817.png",
    alt: 'Object study page: Rotring 600 mechanical pencil, black, 0.5mm, with written analysis',
    orientation: 'portrait'
  },
  sweater: {
    id: 'sweater',
    src: "/Screenshot_2025-01-19_164929.png",
    alt: 'Object study page: black Australian merino Trenery sweater on a hanger, with written analysis',
    orientation: 'portrait'
  },
  porscheLogo: {
    id: 'porsche-logo',
    src: "/Screenshot_2025-01-19_164953.png",
    alt: 'Logo study page: hand-drawn Porsche crest with notes on its Stuttgart heraldry',
    orientation: 'portrait'
  },
  youtubeLogo: {
    id: 'youtube-logo',
    src: "/Screenshot_2025-01-19_165015.png",
    alt: 'Logo study page: YouTube logo with notes on the play button, red field, and rounded corners',
    orientation: 'portrait'
  },
  bowl: {
    id: 'bowl',
    src: "/Screenshot_2025-01-19_165035.png",
    alt: 'Object study page: ceramic bowl with a thin brass rim, with notes on its limitations',
    orientation: 'portrait'
  },
  typeSpecimen: {
    id: 'type-specimen',
    src: "/Screenshot_2025-01-19_165112.png",
    alt: 'Typography specimen set in Helvetica italics over a pale cloud pattern',
    orientation: 'portrait'
  },
  keinemusikLogo: {
    id: 'keinemusik-logo',
    src: "/Screenshot_2025-01-19_165145.png",
    alt: 'Logo study page: the Keinemusik wordmark drawn as rough, torn lettering',
    orientation: 'portrait'
  },
  beamCentreLoad: {
    id: 'beam-centre-load',
    src: "/Screenshot_2025-01-30_180858.png",
    alt: 'Beam reference: load increasing uniformly to centre, with shear and moment diagrams',
    orientation: 'landscape'
  },
  beamTwoLoads: {
    id: 'beam-two-loads',
    src: "/Screenshot_2025-01-30_181409.png",
    alt: 'Beam reference: two equal concentrated loads, with shear and moment diagrams',
    orientation: 'landscape'
  },
  beamCantilever: {
    id: 'beam-cantilever',
    src: "/Screenshot_2025-01-31_105954.png",
    alt: 'Beam reference: cantilever under uniformly distributed load, with shear and moment diagrams',
    orientation: 'landscape'
  },
  beamCentreLoadAlt: {
    id: 'beam-centre-load-alt',
    src: "/Screenshot_2025-01-31_111224.png",
    alt: 'Beam reference sheet: load increasing uniformly to centre, with formulae and diagrams',
    orientation: 'landscape'
  },
  disciplinesVenn: {
    id: 'disciplines-venn',
    src: "/Screenshot_2025-02-11_010045.png",
    alt: 'Venn diagram of Science, Art, and Design overlapping into Mathematics, Engineering, Psychology, and San Francisco',
    orientation: 'square'
  },
  alcatrazFacade: {
    id: 'alcatraz-facade',
    src: "/Screenshot_2025-03-21_220411.png",
    alt: 'Corner of a pale concrete institutional building with barred windows against a blue sky',
    orientation: 'portrait'
  },
  sfsuEngr: {
    id: 'sfsu-engr',
    src: "/Screenshot_2025-04-17_115155.png",
    alt: 'SFSU ENGR wordmark, white on black beside black on white',
    orientation: 'landscape'
  },
  glitchWestVillage: {
    id: 'glitch-west-village',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.07_AM_(1).jpg",
    alt: 'Glitch typography poster: THE WEST VILLAGE GIRLS',
    orientation: 'portrait'
  },
  glitchIWant: {
    id: 'glitch-i-want',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.07_AM.jpg",
    alt: 'Glitch typography poster: I WANT',
    orientation: 'portrait'
  },
  glitchParanoid: {
    id: 'glitch-paranoid',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.08_AM_(1).jpg",
    alt: 'Glitch typography poster: PARANOID AND PATHETIC',
    orientation: 'portrait'
  },
  glitchDoNotTouch: {
    id: 'glitch-do-not-touch',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.08_AM_(2).jpg",
    alt: 'Glitch typography poster: PLEASE DO NOT TOUCH THE WORK OF ART',
    orientation: 'portrait'
  },
  glitchNotASentence: {
    id: 'glitch-not-a-sentence',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.08_AM_(3).jpg",
    alt: 'Glitch typography poster: THIS SENTENCE IS NOT A SENTENCE',
    orientation: 'portrait'
  },
  glitchOnlyATest: {
    id: 'glitch-only-a-test',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.08_AM_(4).jpg",
    alt: 'Glitch typography poster: THIS IS ONLY A TEST',
    orientation: 'portrait'
  },
  glitchMacintosh: {
    id: 'glitch-macintosh',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.08_AM_(5).jpg",
    alt: 'Glitch typography poster: Macintosh computer with a question mark and "Please do not touch the work of art"',
    orientation: 'portrait'
  },
  streetlamp: {
    id: 'streetlamp',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.08_AM_(6).jpg",
    alt: 'Photograph of a wooden utility pole with a glowing streetlamp against a twilight sky',
    orientation: 'portrait'
  },
  glitchNotTelevised: {
    id: 'glitch-not-televised',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.08_AM_(7).jpg",
    alt: 'Glitch typography poster: THIS MESSAGE WILL NOT BE TELEVISED over a crowd of identical figures',
    orientation: 'portrait'
  },
  glitchExclamation: {
    id: 'glitch-exclamation',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.08_AM.jpg",
    alt: 'Glitch typography poster: Large blurred pink exclamation mark with "DO NOT ATTEMPT TO LEAVE THE DANCEFLOOR"',
    orientation: 'portrait'
  },
  glitchGlobe1: {
    id: 'glitch-globe-1',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.09_AM_(1).jpg",
    alt: 'Glitch typography poster: Globe icon with blurred green and blue continents',
    orientation: 'square'
  },
  glitchGlobe2: {
    id: 'glitch-globe-2',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.09_AM_(2).jpg",
    alt: 'Glitch typography poster: Globe icon with blurred green and blue continents, slightly shifted',
    orientation: 'square'
  },
  glitchGlobe3: {
    id: 'glitch-globe-3',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.09_AM_(3).jpg",
    alt: 'Glitch typography poster: Globe icon with blurred green and blue continents, further shifted',
    orientation: 'square'
  },
  glitchGlobe4: {
    id: 'glitch-globe-4',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.09_AM_(4).jpg",
    alt: 'Glitch typography poster: Globe icon with blurred green and blue continents, heavily shifted',
    orientation: 'square'
  },
  glitchGlobe5: {
    id: 'glitch-globe-5',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.09_AM_(5).jpg",
    alt: 'Glitch typography poster: Globe icon with crisp green and blue continents and black outlines',
    orientation: 'square'
  },
  spinningGlobeVideo: {
    id: 'spinning-globe-video',
    src: "/portalinknetworks_3d_z_spin_no_outline.mp4",
    alt: 'Video of a 3D globe spinning on its axis',
    orientation: 'square',
    kind: 'video'
  },
  glitchTooRaw: {
    id: 'glitch-too-raw',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.10_AM_(2).jpg",
    alt: 'Typography poster: TOO RAW UNCUT HARDCORE',
    orientation: 'portrait'
  },
  glitchDramaticIrony: {
    id: 'glitch-dramatic-irony',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.10_AM_(3).jpg",
    alt: 'Typography poster: DRAMATIC IRONY with RGB shift',
    orientation: 'portrait'
  },
  buildingSilhouette: {
    id: 'building-silhouette',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.10_AM_(4).jpg",
    alt: 'Silhouette of a modern building',
    orientation: 'portrait'
  },
  colorfulPattern: {
    id: 'colorful-pattern',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.10_AM_(5).jpg",
    alt: 'Colorful pattern of overlapping circles',
    orientation: 'portrait'
  },
  threeHeadedSilhouette: {
    id: 'three-headed-silhouette',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.10_AM_(6).jpg",
    alt: 'Silhouette of a person with three heads',
    orientation: 'portrait'
  },
  blurred21Plus: {
    id: 'blurred-21-plus',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.10_AM_(7).jpg",
    alt: 'Blurred 21+ text',
    orientation: 'portrait'
  },
  blueCityscape: {
    id: 'blue-cityscape',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.10_AM_(8).jpg",
    alt: 'Blue cityscape at night',
    orientation: 'portrait'
  },
  djLineupPoster: {
    id: 'dj-lineup-poster',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.10_AM.jpg",
    alt: 'DJ lineup poster with arrows',
    orientation: 'portrait'
  },
  glitchGirlsLoveToDance: {
    id: 'glitch-girls-love-to-dance',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.11_AM_(1).jpg",
    alt: 'Typography poster: girls love to dance',
    orientation: 'portrait'
  },
  clubFlyerAviWasHere: {
    id: 'club-flyer-avi-was-here',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.11_AM_(2).jpg",
    alt: 'Club flyer: Q NIGHTCLUB 18 April 2026 SATURDAY 21+ AVI WAS HERE',
    orientation: 'portrait'
  },
  glitchTypography11: {
    id: 'glitch-typography-11',
    src: "/WhatsApp_Image_2026-08-17_at_12.31.11_AM.jpg",
    alt: 'Typography poster',
    orientation: 'portrait'
  }
};

export const sourceImageList: SourceImage[] = Object.values(sourceImages);

/**
 * Images grouped by the kind of work they genuinely belong to, so a category
 * is filled with material that actually matches it rather than at random.
 */
export const sourceImagesByDiscipline: Record<string, SourceImage[]> = {
  'logo-design': [sourceImages.porscheLogo, sourceImages.youtubeLogo, sourceImages.keinemusikLogo, sourceImages.sfsuEngr],
  typography: [sourceImages.typeSpecimen, sourceImages.keinemusikLogo, sourceImages.youtubeLogo, sourceImages.glitchWestVillage, sourceImages.glitchIWant, sourceImages.glitchParanoid, sourceImages.glitchDoNotTouch, sourceImages.glitchNotASentence, sourceImages.glitchOnlyATest, sourceImages.glitchNotTelevised, sourceImages.glitchTooRaw, sourceImages.glitchDramaticIrony, sourceImages.glitchGirlsLoveToDance, sourceImages.glitchTypography11],
  'graphic-design': [sourceImages.typeSpecimen, sourceImages.keinemusikLogo, sourceImages.disciplinesVenn, sourceImages.porscheLogo, sourceImages.glitchExclamation, sourceImages.glitchGlobe1, sourceImages.glitchGlobe5, sourceImages.colorfulPattern, sourceImages.djLineupPoster, sourceImages.clubFlyerAviWasHere, sourceImages.blurred21Plus],
  'product-design': [sourceImages.mechanicalPencil, sourceImages.sweater, sourceImages.bowl, sourceImages.glitchMacintosh],
  'structural-engineering': [sourceImages.beamCentreLoad, sourceImages.beamTwoLoads, sourceImages.beamCantilever, sourceImages.beamCentreLoadAlt],
  engineering: [sourceImages.beamCantilever, sourceImages.beamCentreLoad, sourceImages.sfsuEngr],
  architecture: [sourceImages.alcatrazFacade, sourceImages.aerialSite, sourceImages.beamTwoLoads, sourceImages.buildingSilhouette],
  photography: [sourceImages.textileWaste, sourceImages.alcatrazFacade, sourceImages.aerialSite, sourceImages.streetlamp, sourceImages.blueCityscape, sourceImages.threeHeadedSilhouette],
  'user-interface-design': [sourceImages.disciplinesVenn, sourceImages.youtubeLogo, sourceImages.typeSpecimen, sourceImages.spinningGlobeVideo],
  research: [sourceImages.disciplinesVenn, sourceImages.textileWaste, sourceImages.beamCentreLoadAlt],
  soundcloud: [sourceImages.keinemusikLogo, sourceImages.typeSpecimen]
};

/** Stable hash, so the same id always resolves to the same image. */
function hash(seed: string): number {
  let value = 0;
  for (let index = 0; index < seed.length; index += 1) {
    value = (value * 31 + seed.charCodeAt(index)) % 100003;
  }
  return value;
}

/**
 * Resolve an image for a piece of work: discipline-matched where a matching
 * set exists, otherwise a stable pick from the whole library.
 */
export function resolveSourceImage(seed: string, discipline?: string, offset = 0): SourceImage {
  const pool = discipline ? sourceImagesByDiscipline[discipline] : undefined;
  if (pool && pool.length > 0) {
    return pool[(hash(seed) + offset) % pool.length];
  }
  return sourceImageList[(hash(seed) + offset) % sourceImageList.length];
}
