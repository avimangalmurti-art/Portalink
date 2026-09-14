import type { ProjectAttachment, ProjectCoverFrame } from '../types/domain';
import { resolveSourceImage } from './sourceImages';
export type CategoryFormat = 'grid' | 'gallery' | 'story' | 'feed' | 'video' | 'audio' | 'data';

export type ProfileCategory = {
  id: string;
  label: string;
  iconName: string;
  format: CategoryFormat;
  blurb: string;
};

export type ProjectChapter = {
  title: string;
  body: string;
  image?: string;
  imageAlt?: string;
  images?: {src: string;alt: string;caption: string;}[];
};

export type ProjectEntry = {
  relevance?: import('../types/discovery').ProjectRelevance;
  id: string;
  categoryId: string;
  title: string;
  summary: string;
  cover: string;
  coverAlt: string;
  coverKind?: 'video' | 'document';
  /** The cover asset's real proportions, read from the source image. */
  coverOrientation?: 'portrait' | 'landscape' | 'square';
  coverAspectRatio?: number;
  coverFrame?: ProjectCoverFrame;
  /** One-based page used when a document is the project cover. */
  coverPageNumber?: number;
  pageCount?: number;
  chapters?: ProjectChapter[];
  credits?: {label: string;value: string;}[];
  /**
   * The files this project is made of. Each carries its own media kind, so the
   * category never decides how they render. Absent on seeded work, which has no
   * uploaded files at all.
   */
  attachments?: ProjectAttachment[];
  /**
   * True for work published in this session only, whose media was never
   * uploaded. `cover` is then a local blob preview, not a stored address.
   */
  sessionOnly?: boolean;
};

export type ProfileStat = {
  label: string;
  value: string;
};

export type Profile = {
  id: string;
  name: string;
  handle: string;
  headline: string;
  location: string;
  initials: string;
  avatar: string;
  navHeading: string;
  stats: ProfileStat[];
  /**
   * Platform id → destination, for the fixed set of marks the header exposes.
   * An empty or missing destination simply means that mark is not shown.
   */
  socialLinks: Record<string, string>;
  links: {label: string;href: string;}[];
  categories: ProfileCategory[];
  projects: ProjectEntry[];
  /** Withheld from public discovery unless a confirmed relationship grants access. */
  isPrivate?: boolean;
};

const POSTER_CALM = "/2ab1d7db-2435-4a11-9be3-6fea4c5b80bc.jpg";
const POSTER_WET_PAINT = "/138f7f9a-5be7-4198-a12e-a4e2709a1154.jpg";
const POSTER_FONT = "/bf63d01e-ff8f-466c-9d89-91b3089a1587.jpg";
const POSTER_DISSOCIATION = "/2614e477-ab18-44fe-b77b-ea88d6d3c969.jpg";
const POSTER_HELVETICA = "/f5cea513-041d-4d45-b0ff-14fcf94fa74a.jpg";
const SKETCHES = "/a6e545e4-89c2-405c-b2bb-4a2ca3484c89.jpg";
const TYPE_EXPLORATION = "/2dd000d8-09e7-41de-8f9a-7d4c168845f2.jpg";
const COLOR_ITERATIONS = "/d3739aba-0479-43fb-83ee-1f4272fa54ab.jpg";
const INSTALL_SHOT = "/027f0683-66d1-4914-b296-553d9a25e71b.jpg";
/**
 * Deliberately empty. A single stock headshot was previously shared by every
 * seeded creator, so six different people appeared to have the same face — a
 * picture none of them chose. Seeded profiles carry no avatar, and every surface
 * falls back to that creator's own initials until they pick one.
 */
export const PROFILE_AVATAR = '';

const graphicDesignProjects: ProjectEntry[] = [
{
  id: 'cool-calm-and-collected',
  categoryId: 'graphic-design',
  title: 'Cool, Calm and Collected',
  summary: 'A four-part poster series about restraint — how little a page needs before it stops communicating.',
  cover: POSTER_CALM,
  coverAlt: 'Cool, Calm and Collected poster with black grotesk type and a pale blue block',
  chapters: [
  {
    title: 'Concept',
    body: 'The series began as a question about temperature in typography. Each poster removes one more element than the last, until the grid itself is doing most of the talking. The palette stays cold on purpose: a single ice-blue field anchors the composition while the type holds the tension.'
  },
  {
    title: 'Early sketches',
    body: 'Forty thumbnails, drawn at postcard scale over two afternoons. Working small kept the decisions structural rather than decorative.',
    image: SKETCHES,
    imageAlt: 'Pencil thumbnail layouts for the poster series spread across a desk'
  },
  {
    title: 'Typography exploration',
    body: 'Three grotesks were tested at display size. The winner had the flattest terminals and the tightest default spacing, which let the headline sit as one continuous mass instead of a line of separate words.',
    image: TYPE_EXPLORATION,
    imageAlt: 'Typography specimen sheet with annotated weights and sizes'
  },
  {
    title: 'Colour and layout iterations',
    body: 'Six palettes were printed at A3 and pinned for a week. Anything warm made the series feel promotional, so the final direction kept one cool accent and let the paper carry the rest.',
    image: COLOR_ITERATIONS,
    imageAlt: 'Six colour variations of the same poster layout arranged in a grid'
  },
  {
    title: 'Final poster series',
    body: 'Printed A2 on uncoated stock, in a run of fifty. Shown as a horizontal sequence so the reduction reads left to right.',
    images: [
    { src: POSTER_CALM, alt: 'Poster one of the series', caption: 'No. 01 — Cool' },
    { src: POSTER_DISSOCIATION, alt: 'Poster two of the series', caption: 'No. 02 — Calm' },
    { src: POSTER_HELVETICA, alt: 'Poster three of the series', caption: 'No. 03 — Collected' }]

  },
  {
    title: 'Installation',
    body: 'The series was pinned edge to edge for the spring open studio, at eye level and without frames.',
    image: INSTALL_SHOT,
    imageAlt: 'Poster series installed in a row on a white gallery wall'
  }],

  credits: [
  { label: 'Role', value: 'Design, typesetting, print production' },
  { label: 'Format', value: 'A2 · Uncoated 200gsm · Edition of 50' },
  { label: 'Year', value: '2024' }]

},
{
  id: 'imfeelingfont',
  categoryId: 'graphic-design',
  title: 'imfeelingfont',
  summary: 'A specimen site and printed sheet for a grotesk drawn over one winter.',
  cover: POSTER_FONT,
  coverAlt: 'Type specimen poster showing an alphabet grid in a grotesk typeface',
  chapters: [
  {
    title: 'Concept',
    body: 'A specimen should be readable as a document and legible as a drawing. This one runs the full character set at four sizes with no decorative framing.'
  },
  {
    title: 'Typography exploration',
    body: 'Weight testing at text and display size, with spacing annotated in pencil before the digital pass.',
    image: TYPE_EXPLORATION,
    imageAlt: 'Annotated typography exploration sheet'
  }],

  credits: [
  { label: 'Role', value: 'Type design, specimen' },
  { label: 'Year', value: '2023' }]

},
{
  id: 'glitch-typography-series',
  categoryId: 'graphic-design',
  title: 'Glitch Typography Series',
  summary: 'A series of typographic posters exploring digital degradation, error states, and the breakdown of legibility.',
  cover: resolveSourceImage('glitch-west-village', 'typography', 0).src,
  coverAlt: 'Glitch typography poster: THE WEST VILLAGE GIRLS',
  chapters: [
  {
    title: 'Concept',
    body: 'The series investigates what happens when the digital tools we use to set type begin to fail. By deliberately introducing horizontal displacement and raster errors, the letterforms are pushed to the edge of legibility while retaining their structural weight.'
  },
  {
    title: 'The Posters',
    body: 'Set in a heavy, tightly tracked grotesk, the statements range from direct commands to self-referential paradoxes.',
    images: [
    { src: resolveSourceImage('glitch-west-village', 'typography', 0).src, alt: 'Glitch typography poster: THE WEST VILLAGE GIRLS', caption: 'The West Village Girls' },
    { src: resolveSourceImage('glitch-i-want', 'typography', 0).src, alt: 'Glitch typography poster: I WANT', caption: 'I Want' },
    { src: resolveSourceImage('glitch-paranoid', 'typography', 0).src, alt: 'Glitch typography poster: PARANOID AND PATHETIC', caption: 'Paranoid and Pathetic' },
    { src: resolveSourceImage('glitch-do-not-touch', 'typography', 0).src, alt: 'Glitch typography poster: PLEASE DO NOT TOUCH THE WORK OF ART', caption: 'Please Do Not Touch' },
    { src: resolveSourceImage('glitch-not-a-sentence', 'typography', 0).src, alt: 'Glitch typography poster: THIS SENTENCE IS NOT A SENTENCE', caption: 'Not a Sentence' },
    { src: resolveSourceImage('glitch-only-a-test', 'typography', 0).src, alt: 'Glitch typography poster: THIS IS ONLY A TEST', caption: 'Only a Test' },
    { src: resolveSourceImage('glitch-not-televised', 'typography', 0).src, alt: 'Glitch typography poster: THIS MESSAGE WILL NOT BE TELEVISED', caption: 'Not Televised' },
    { src: resolveSourceImage('glitch-exclamation', 'graphic-design', 0).src, alt: 'Glitch typography poster: Large blurred pink exclamation mark', caption: 'Do Not Attempt to Leave' },
    { src: resolveSourceImage('glitch-too-raw', 'typography', 0).src, alt: 'Typography poster: TOO RAW UNCUT HARDCORE', caption: 'Too Raw' },
    { src: resolveSourceImage('glitch-dramatic-irony', 'typography', 0).src, alt: 'Typography poster: DRAMATIC IRONY with RGB shift', caption: 'Dramatic Irony' },
    { src: resolveSourceImage('glitch-girls-love-to-dance', 'typography', 0).src, alt: 'Typography poster: girls love to dance', caption: 'Girls Love to Dance' },
    { src: resolveSourceImage('glitch-typography-11', 'typography', 0).src, alt: 'Typography poster', caption: 'Typography Study' }]

  },
  {
    title: 'Iconography',
    body: 'The glitch treatment was extended to familiar icons and hardware, treating the Macintosh and the globe as typographic elements subject to the same degradation.',
    images: [
    { src: resolveSourceImage('glitch-macintosh', 'product-design', 0).src, alt: 'Glitch typography poster: Macintosh computer', caption: 'Macintosh' },
    { src: resolveSourceImage('glitch-globe-1', 'graphic-design', 0).src, alt: 'Glitch typography poster: Globe icon', caption: 'Globe Study 01' },
    { src: resolveSourceImage('glitch-globe-5', 'graphic-design', 0).src, alt: 'Glitch typography poster: Globe icon, crisp', caption: 'Globe Study 05' }]

  }],

  credits: [
  { label: 'Role', value: 'Design, typography' },
  { label: 'Year', value: '2026' }]

},
{
  id: 'tribute-to-helvetica',
  categoryId: 'graphic-design',
  title: 'Tribute to Helvetica',
  summary: 'One letterform, one page, no other content.',
  cover: POSTER_HELVETICA,
  coverAlt: 'Poster with a single oversized black letterform on white',
  chapters: [
  {
    title: 'Concept',
    body: 'Cropping a single glyph past the edge of the sheet turns a familiar letter back into an unfamiliar shape.'
  },
  {
    title: 'Installation',
    body: 'Shown alongside the rest of the print work at the open studio.',
    image: INSTALL_SHOT,
    imageAlt: 'Poster installed on a gallery wall'
  }],

  credits: [
  { label: 'Role', value: 'Design, print' },
  { label: 'Year', value: '2022' }]

}];


type DocumentSeed = {
  title: string;
  summary: string;
  pageCount: number;
  /*
   * Legacy descriptor and year. The product no longer carries either on a project
   * — they are accepted here only so the existing seed literals keep parsing, are
   * never read, and never reach a project record. New seeds should omit them.
   */
  kind?: string;
  year?: string;
};

function buildDocuments(categoryId: string, seeds: DocumentSeed[]): ProjectEntry[] {
  return seeds.map((seed, index) => {
    const id = `${categoryId}-${seed.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    /*
     * PLACEHOLDER imagery, not the creator's own file. It is picked from a shared
     * pool by hashing the seed id, so it is stable per project but has no
     * relationship to the work the title describes — these are separate, unrelated
     * files. Surfaces that must not present a stand-in as a creator's own upload
     * therefore do not render `cover` (see the profile portfolio grid); the
     * discovery feed uses it knowingly, as demo imagery.
     */
    const image = resolveSourceImage(id, categoryId, index);
    return {
      id,
      categoryId,
      title: seed.title,
      summary: seed.summary,
      cover: image.src,
      coverAlt: image.alt,
      coverKind: image.kind,
      coverOrientation: image.orientation,
      pageCount: seed.pageCount
    };
  });
}

const aviDocuments: ProjectEntry[] = [
...buildDocuments('soundcloud', [
{ title: 'Loop Studies Vol. 1', kind: 'Liner notes', year: '2024', summary: 'Track sheet and session notes', pageCount: 4 },
{ title: 'Night Shift Mix', kind: 'Track list', year: '2023', summary: 'Set list and mix breakdown', pageCount: 3 },
{ title: 'Field Recordings', kind: 'Log', year: '2023', summary: 'Location and equipment log', pageCount: 6 }]
),
...buildDocuments('user-interface-design', [
{ title: 'Global Navigation Prototype', kind: 'Interactive', year: '2026', summary: '3D globe interaction model', pageCount: 1 },
{ title: 'Checkout Redesign', kind: 'Case study', year: '2025', summary: 'Flow audit through shipped release', pageCount: 12 },
{ title: 'Design System Handbook', kind: 'Documentation', year: '2024', summary: 'Tokens, components, and usage', pageCount: 24 },
{ title: 'Onboarding Teardown', kind: 'Research', year: '2024', summary: 'Six products compared step by step', pageCount: 9 }]
),
...buildDocuments('typography', [
{ title: 'Grotesk Specimen', kind: 'Specimen', year: '2024', summary: 'Weights, sizes, and spacing tests', pageCount: 16 },
{ title: 'Lettering Sketchbook', kind: 'Sketchbook', year: '2023', summary: 'Hand-drawn alphabet studies', pageCount: 20 },
{ title: 'Type in the Wild', kind: 'Photo essay', year: '2023', summary: 'Street lettering collected over a year', pageCount: 14 }]
),
...buildDocuments('product-design', [
{ title: 'Desk Lamp 02', kind: 'Case study', year: '2025', summary: 'Brief, prototypes, production', pageCount: 18 },
{ title: 'Modular Shelf', kind: 'Specification', year: '2024', summary: 'Parts, tolerances, and assembly', pageCount: 11 }]
),
...graphicDesignProjects,
...buildDocuments('graphic-design', [
{ title: 'Colorful Pattern', kind: 'Pattern', year: '2026', summary: 'Colorful pattern of overlapping circles', pageCount: 1 },
{ title: 'DJ Lineup Poster', kind: 'Poster', year: '2026', summary: 'DJ lineup poster with arrows', pageCount: 1 },
{ title: 'Club Flyer', kind: 'Flyer', year: '2026', summary: 'Club flyer: Q NIGHTCLUB 18 April 2026 SATURDAY 21+ AVI WAS HERE', pageCount: 1 },
{ title: 'Blurred 21+', kind: 'Typography', year: '2026', summary: 'Blurred 21+ text', pageCount: 1 }]
),
...buildDocuments('structural-engineering', [
{ title: 'Footbridge Load Study', kind: 'Technical report', year: '2025', summary: 'Analysis and load cases', pageCount: 22 },
{ title: 'Timber Frame Analysis', kind: 'Calculation set', year: '2024', summary: 'Member sizing and connections', pageCount: 15 },
{ title: 'Seismic Retrofit Notes', kind: 'Report', year: '2023', summary: 'Existing structure assessment', pageCount: 19 }]
),
...buildDocuments('photography', [
{ title: 'Streetlamp Study', kind: 'Photo essay', year: '2026', summary: 'Twilight illumination on wooden utility poles', pageCount: 1 },
{ title: 'Blue Cityscape', kind: 'Photo essay', year: '2026', summary: 'Cityscape at night', pageCount: 1 },
{ title: 'Three-Headed Silhouette', kind: 'Photo essay', year: '2026', summary: 'Silhouette of a person with three heads', pageCount: 1 },
{ title: 'Coastline, Winter', kind: 'Photo book', year: '2024', summary: 'Twelve-week series along the shore', pageCount: 28 },
{ title: 'Cell Photography', kind: 'Photo essay', year: '2024', summary: 'Plant cells shot on iPhone', pageCount: 15 },
{ title: 'Night Buses', kind: 'Zine', year: '2023', summary: 'Late routes across the city', pageCount: 10 }]
),
...buildDocuments('architecture', [
{ title: 'Building Silhouette', kind: 'Project book', year: '2026', summary: 'Silhouette of a modern building', pageCount: 1 },
{ title: 'Courtyard House', kind: 'Project book', year: '2025', summary: 'Site, plans, and construction', pageCount: 26 },
{ title: 'Market Hall Proposal', kind: 'Competition entry', year: '2024', summary: 'Concept through massing studies', pageCount: 17 }]
),
...buildDocuments('logo-design', [
{ title: 'Northline Identity', kind: 'Brand guide', year: '2025', summary: 'Mark, lockups, and usage', pageCount: 21 },
{ title: 'Monogram Studies', kind: 'Sketch set', year: '2024', summary: 'Forty marks explored in pencil', pageCount: 8 },
{ title: 'Still Form Identity', kind: 'Brand guide', year: '2023', summary: 'Identity system for a ceramics studio', pageCount: 13 }]
)];


export const aviProfile: Profile = {
  id: 'avi',
  name: 'Avi Mangalmurti',
  handle: '@avi',
  headline: 'Designer, builder, and occasional printer of posters',
  location: 'San Francisco, USA',
  initials: 'AM',
  avatar: PROFILE_AVATAR,
  navHeading: 'PORTFOLIO',
  stats: [
  { label: 'Projects', value: '48' },
  { label: 'Followers', value: '0' },
  { label: 'Following', value: '0' }],

  socialLinks: {
    instagram: 'instagram.com/avi',
    x: 'x.com/avi',
    pinterest: 'pinterest.com/avi',
    website: 'avimangalmurti.com',
    tiktok: 'tiktok.com/@avi',
    linkedin: 'linkedin.com/in/avi',
    snapchat: 'snapchat.com/add/avi',
    soundcloud: 'soundcloud.com/avi',
    twitch: 'twitch.tv/avi',
    youtube: 'youtube.com/@avi',
    spotify: 'open.spotify.com/user/avi',
    behance: 'behance.net/avi',
    dribbble: 'dribbble.com/avi',
    github: 'github.com/avi',
    vimeo: 'vimeo.com/avi',
    medium: 'medium.com/@avi'
  },
  links: [
  { label: 'avimangalmurti.com', href: '#' },
  { label: 'Contact', href: '#' }],

  categories: [
  { id: 'soundcloud', label: 'Soundcloud', iconName: 'audio', format: 'audio', blurb: 'Mixes, loops, and half-finished tracks kept in public.' },
  { id: 'user-interface-design', label: 'User Interface Design', iconName: 'window', format: 'story', blurb: 'Interface case studies, from first structure to shipped product.' },
  { id: 'typography', label: 'Typography', iconName: 'type', format: 'gallery', blurb: 'Specimens, lettering studies, and type in the wild.' },
  { id: 'product-design', label: 'Product Design', iconName: 'pen', format: 'story', blurb: 'Objects and systems, documented end to end.' },
  { id: 'graphic-design', label: 'Graphic Design', iconName: 'shapes', format: 'grid', blurb: 'Posters, identities, typography, and visual experiments.' },
  { id: 'structural-engineering', label: 'Structural Engineering', iconName: 'ruler', format: 'data', blurb: 'Load studies, diagrams, and built structural work.' },
  { id: 'photography', label: 'Photography', iconName: 'camera', format: 'gallery', blurb: 'Long-running photographic series, shown large.' },
  { id: 'architecture', label: 'Architecture', iconName: 'building', format: 'story', blurb: 'Editorial presentations of spatial and built projects.' },
  { id: 'logo-design', label: 'Logo Design', iconName: 'globe', format: 'grid', blurb: 'Marks, monograms, and identity systems.' }],

  projects: aviDocuments
};

const studioLumaProfile: Profile = {
  id: 'studio-luma',
  name: 'Studio Luma',
  handle: '@studioluma',
  headline: 'A small design studio making objects that stay put',
  location: 'Rotterdam, NL',
  initials: 'SL',
  avatar: PROFILE_AVATAR,
  navHeading: 'PORTFOLIO',
  stats: [
  { label: 'Projects', value: '21' },
  { label: 'Followers', value: '0' },
  { label: 'Following', value: '0' }],

  socialLinks: {
    instagram: 'instagram.com/studioluma',
    pinterest: 'pinterest.com/studioluma',
    website: 'studioluma.nl',
    linkedin: 'linkedin.com/company/studioluma',
    youtube: 'youtube.com/@studioluma'
  },
  links: [
  { label: 'studioluma.nl', href: '#' },
  { label: 'Contact', href: '#' }],

  categories: [
  { id: 'furniture', label: 'Furniture', iconName: 'pen', format: 'story', blurb: 'Seating and tables documented from brief to finish.' },
  { id: 'material-studies', label: 'Material Studies', iconName: 'shapes', format: 'grid', blurb: 'Wood, steel, and finish tests kept in the open.' },
  { id: 'exhibitions', label: 'Exhibitions', iconName: 'building', format: 'gallery', blurb: 'Show layouts, plinths, and installation notes.' },
  { id: 'catalogues', label: 'Catalogues', iconName: 'type', format: 'grid', blurb: 'Printed editions published with each release.' },
  { id: 'workshop-film', label: 'Workshop Film', iconName: 'camera', format: 'video', blurb: 'Process films shot in the workshop.' }],

  projects: [
  ...buildDocuments('furniture', [
  { title: 'Ash Side Table', kind: 'Case study', year: '2024', summary: 'Brief, prototypes, and production run', pageCount: 18 },
  { title: 'Reading Chair 01', kind: 'Case study', year: '2026', summary: 'A chair built for staying put', pageCount: 24 },
  { title: 'Stacking Stool', kind: 'Specification', year: '2023', summary: 'Parts, tolerances, and assembly', pageCount: 9 }]
  ),
  ...buildDocuments('material-studies', [
  { title: 'Oil and Wax Tests', kind: 'Test set', year: '2025', summary: 'Twelve finishes on the same board', pageCount: 12 },
  { title: 'Bent Steel Notes', kind: 'Workbook', year: '2024', summary: 'Radius limits and spring-back', pageCount: 7 }]
  ),
  ...buildDocuments('exhibitions', [
  { title: 'Salone Layout', kind: 'Plan set', year: '2025', summary: 'Stand plan and plinth drawings', pageCount: 14 },
  { title: 'Open Studio', kind: 'Photo book', year: '2024', summary: 'Two days of visitors and objects', pageCount: 20 }]
  ),
  ...buildDocuments('catalogues', [
  { title: 'Cool, Calm and Collected', kind: 'Catalogue', year: '2026', summary: 'The release catalogue in full', pageCount: 6 },
  { title: 'Edition 04', kind: 'Catalogue', year: '2024', summary: 'Small-run edition, printed offset', pageCount: 16 }]
  ),
  ...buildDocuments('workshop-film', [
  { title: 'Six Days in the Workshop', kind: 'Film notes', year: '2026', summary: 'Shot list and production notes', pageCount: 5 }]
  )]

};

const formPracticeProfile: Profile = {
  id: 'form-practice',
  name: 'Form Practice',
  handle: '@formpractice',
  headline: 'Industrial design for things that get used daily',
  location: 'Copenhagen, DK',
  initials: 'FP',
  avatar: PROFILE_AVATAR,
  navHeading: 'PORTFOLIO',
  stats: [
  { label: 'Projects', value: '33' },
  { label: 'Followers', value: '0' },
  { label: 'Following', value: '0' }],

  socialLinks: {
    instagram: 'instagram.com/formpractice',
    website: 'formpractice.dk',
    linkedin: 'linkedin.com/company/formpractice',
    x: 'x.com/formpractice'
  },
  links: [
  { label: 'formpractice.dk', href: '#' },
  { label: 'Contact', href: '#' }],

  categories: [
  { id: 'objects', label: 'Objects', iconName: 'shapes', format: 'grid', blurb: 'Editions released in small numbers.' },
  { id: 'prototypes', label: 'Prototypes', iconName: 'pen', format: 'story', blurb: 'Failed and working versions, side by side.' },
  { id: 'manufacturing', label: 'Manufacturing', iconName: 'ruler', format: 'data', blurb: 'Tolerances, tooling, and factory notes.' },
  { id: 'film', label: 'Film', iconName: 'camera', format: 'video', blurb: 'Short films made with the workshops we use.' },
  { id: 'identity', label: 'Identity', iconName: 'globe', format: 'grid', blurb: 'Marks and packaging for each edition.' }],

  projects: [
  ...buildDocuments('objects', [
  { title: 'Folded Mirror, Edition 06', kind: 'Edition book', year: '2025', summary: 'Folded aluminium and polished glass', pageCount: 11 },
  { title: 'Workshop Stool', kind: 'Edition book', year: '2024', summary: 'One-piece steel seat', pageCount: 8 }]
  ),
  ...buildDocuments('prototypes', [
  { title: 'Mirror Hinge Trials', kind: 'Workbook', year: '2025', summary: 'Nine hinges, one survivor', pageCount: 15 },
  { title: 'Seat Pressing Tests', kind: 'Workbook', year: '2023', summary: 'Press tonnage and deformation', pageCount: 13 }]
  ),
  ...buildDocuments('manufacturing', [
  { title: 'Tooling Pack 04', kind: 'Technical report', year: '2025', summary: 'Dies, jigs, and setup times', pageCount: 26 },
  { title: 'Anodising Spec', kind: 'Specification', year: '2024', summary: 'Bath chemistry and finish grades', pageCount: 10 }]
  ),
  ...buildDocuments('film', [
  { title: 'Six Days in the Workshop', kind: 'Film notes', year: '2026', summary: 'A workshop filmed over a week', pageCount: 5 }]
  ),
  ...buildDocuments('identity', [
  { title: 'Edition Marks', kind: 'Brand guide', year: '2024', summary: 'Numbering and stamping system', pageCount: 12 }]
  )]

};

const tideAndFormProfile: Profile = {
  id: 'tide-and-form',
  name: 'Tide & Form',
  handle: '@tideandform',
  headline: 'Architecture and engineering on the coast',
  location: 'Cork, IE',
  initials: 'TF',
  avatar: PROFILE_AVATAR,
  navHeading: 'PORTFOLIO',
  stats: [
  { label: 'Projects', value: '57' },
  { label: 'Followers', value: '0' },
  { label: 'Following', value: '0' }],

  socialLinks: {
    instagram: 'instagram.com/tideandform',
    website: 'tideandform.ie',
    linkedin: 'linkedin.com/company/tideandform',
    pinterest: 'pinterest.com/tideandform',
    youtube: 'youtube.com/@tideandform',
    x: 'x.com/tideandform'
  },
  links: [
  { label: 'tideandform.ie', href: '#' },
  { label: 'Contact', href: '#' }],

  categories: [
  { id: 'architecture', label: 'Architecture', iconName: 'building', format: 'story', blurb: 'Built and unbuilt projects, presented editorially.' },
  { id: 'photography', label: 'Photography', iconName: 'camera', format: 'gallery', blurb: 'Long surveys of the coast and its buildings.' },
  { id: 'structural-engineering', label: 'Structural Engineering', iconName: 'ruler', format: 'data', blurb: 'Load studies, spans, and calculation sets.' },
  { id: 'drawings', label: 'Drawings', iconName: 'pen', format: 'grid', blurb: 'Plans, sections, and details at full size.' },
  { id: 'research', label: 'Research', iconName: 'type', format: 'story', blurb: 'Coastal climate and material longevity.' },
  { id: 'planning', label: 'Planning', iconName: 'window', format: 'data', blurb: 'Submissions, appeals, and consultations.' }],

  projects: [
  ...buildDocuments('architecture', [
  { title: 'Harbour House', kind: 'Project book', year: '2025', summary: 'Site, plans, and construction', pageCount: 68 },
  { title: 'Boatyard Studios', kind: 'Project book', year: '2024', summary: 'Six studios on a working quay', pageCount: 34 }]
  ),
  ...buildDocuments('photography', [
  { title: 'Coastal Survey, Winter', kind: 'Photo book', year: '2025', summary: 'Twelve weeks along the shore', pageCount: 30 },
  { title: 'Low Tide', kind: 'Zine', year: '2023', summary: 'A single beach, forty mornings', pageCount: 12 }]
  ),
  ...buildDocuments('structural-engineering', [
  { title: 'Long Span Timber Study', kind: 'Technical report', year: '2023', summary: 'Analysis and load cases', pageCount: 42 },
  { title: 'Sea Wall Assessment', kind: 'Report', year: '2024', summary: 'Condition survey and remediation', pageCount: 27 }]
  ),
  ...buildDocuments('drawings', [
  { title: 'Harbour House Details', kind: 'Drawing set', year: '2025', summary: 'Junctions at 1:5', pageCount: 22 },
  { title: 'Quay Sections', kind: 'Drawing set', year: '2024', summary: 'Sections through the working edge', pageCount: 16 }]
  ),
  ...buildDocuments('research', [
  { title: 'Salt and Steel', kind: 'Paper', year: '2024', summary: 'Corrosion rates in coastal air', pageCount: 19 }]
  ),
  ...buildDocuments('planning', [
  { title: 'Harbour House Submission', kind: 'Submission', year: '2024', summary: 'Full planning pack', pageCount: 44 }]
  )]

};

const wideMarginProfile: Profile = {
  id: 'wide-margin',
  name: 'Wide Margin',
  handle: '@widemargin',
  headline: 'A three-person graphic studio that also presses records',
  location: 'Glasgow, UK',
  initials: 'WM',
  avatar: PROFILE_AVATAR,
  navHeading: 'PORTFOLIO',
  stats: [
  { label: 'Projects', value: '39' },
  { label: 'Followers', value: '0' },
  { label: 'Following', value: '0' }],

  socialLinks: {
    instagram: 'instagram.com/widemargin',
    soundcloud: 'soundcloud.com/widemargin',
    website: 'widemargin.studio',
    x: 'x.com/widemargin',
    youtube: 'youtube.com/@widemargin',
    tiktok: 'tiktok.com/@widemargin'
  },
  links: [
  { label: 'widemargin.studio', href: '#' },
  { label: 'Contact', href: '#' }],

  categories: [
  { id: 'graphic-design', label: 'Graphic Design', iconName: 'shapes', format: 'grid', blurb: 'Posters, covers, and printed matter.' },
  { id: 'soundcloud', label: 'Soundcloud', iconName: 'audio', format: 'audio', blurb: 'Mixes and pressings from the back room.' },
  { id: 'typography', label: 'Typography', iconName: 'type', format: 'gallery', blurb: 'Specimens and lettering for client work.' },
  { id: 'publishing', label: 'Publishing', iconName: 'window', format: 'story', blurb: 'Annuals, zines, and small print runs.' }],

  projects: [
  ...buildDocuments('graphic-design', [
  { title: 'Risograph Annual', kind: 'Annual', year: '2024', summary: 'Sixteen prints, two colours', pageCount: 16 },
  { title: 'Poster Set 09', kind: 'Print edition', year: '2025', summary: 'Signed and numbered set', pageCount: 8 }]
  ),
  ...buildDocuments('soundcloud', [
  { title: 'Night Pressing, Side A', kind: 'Liner notes', year: '2026', summary: 'Session notes and track sheet', pageCount: 4 },
  { title: 'Back Room Mixes', kind: 'Track list', year: '2025', summary: 'A year of Friday sets', pageCount: 6 }]
  ),
  ...buildDocuments('typography', [
  { title: 'Margin Grotesk', kind: 'Specimen', year: '2025', summary: 'A house face in three weights', pageCount: 18 }]
  ),
  ...buildDocuments('publishing', [
  { title: 'Small Press Handbook', kind: 'Handbook', year: '2024', summary: 'How we run a press of three', pageCount: 23 }]
  )]

};

const orbitHouseProfile: Profile = {
  id: 'orbit-house',
  name: 'Orbit House',
  handle: '@orbithouse',
  headline: 'Interaction design, light, and things that respond',
  location: 'Lisbon, PT',
  initials: 'OH',
  avatar: PROFILE_AVATAR,
  navHeading: 'PORTFOLIO',
  stats: [
  { label: 'Projects', value: '27' },
  { label: 'Followers', value: '0' },
  { label: 'Following', value: '0' }],

  socialLinks: {
    instagram: 'instagram.com/orbithouse',
    website: 'orbithouse.pt',
    x: 'x.com/orbithouse'
  },
  links: [
  { label: 'orbithouse.pt', href: '#' },
  { label: 'Contact', href: '#' }],

  categories: [
  { id: 'product-design', label: 'Product Design', iconName: 'pen', format: 'story', blurb: 'Objects documented from brief to shelf.' },
  { id: 'user-interface-design', label: 'User Interface Design', iconName: 'window', format: 'story', blurb: 'Interfaces for hardware we also make.' },
  { id: 'lighting', label: 'Lighting', iconName: 'shapes', format: 'gallery', blurb: 'Portable and fixed light studies.' },
  { id: 'interactive', label: 'Interactive', iconName: 'globe', format: 'grid', blurb: 'Installations and responsive prototypes.' }],

  projects: [
  ...buildDocuments('product-design', [
  { title: 'Halo Lamp', kind: 'Case study', year: '2026', summary: 'Brief through production', pageCount: 20 },
  { title: 'Desk Companion', kind: 'Case study', year: '2024', summary: 'A small object for long days', pageCount: 14 }]
  ),
  ...buildDocuments('user-interface-design', [
  { title: 'Halo Companion App', kind: 'Case study', year: '2026', summary: 'Pairing, scenes, and schedules', pageCount: 17 }]
  ),
  ...buildDocuments('lighting', [
  { title: 'Warm Light Tests', kind: 'Test set', year: '2025', summary: 'Colour temperature across the evening', pageCount: 11 },
  { title: 'Diffuser Studies', kind: 'Workbook', year: '2024', summary: 'Paper, glass, and anodised shells', pageCount: 9 }]
  ),
  ...buildDocuments('interactive', [
  { title: 'Room Response', kind: 'Installation notes', year: '2025', summary: 'A wall that answers movement', pageCount: 13 }]
  )]

};

export const profiles: Profile[] = [aviProfile, studioLumaProfile, formPracticeProfile, tideAndFormProfile, wideMarginProfile, orbitHouseProfile];

/**
 * Whether a profile id names a real record. Returns undefined rather than a
 * stand-in, so a caller that must not substitute somebody else's profile can
 * tell "does not exist" from "exists".
 */
export function findProfileById(profileId: string): Profile | undefined {
  return profiles.find((profile) => profile.id === profileId);
}
export function getProfileById(profileId: string): Profile {
  return profiles.find((profile) => profile.id === profileId) ?? aviProfile;
}

/**
 * PROTOTYPE ONLY. Profiles created during onboarding are appended here so the
 * rest of the session can read them exactly like seeded ones. Nothing is
 * written to storage: a reload loses them, which is truthful — no database
 * exists yet. Production replaces this with a real `profiles` row.
 */
export function registerPrototypeProfile(profile: Profile): void {
  const existing = profiles.findIndex((candidate) => candidate.id === profile.id);
  if (existing >= 0) {
    profiles[existing] = profile;
    return;
  }
  profiles.push(profile);
}

/**
 * PROTOTYPE ONLY. Adds a session-published project to the canonical in-memory
 * profile, so it appears in its category through the normal read path instead
 * of a second list only the publishing flow can see. Reload discards it — no
 * database or storage exists yet.
 */
export function registerPrototypeProject(profileId: string, project: ProjectEntry): void {
  const index = profiles.findIndex((candidate) => candidate.id === profileId);
  if (index < 0) {
    throw new Error(`No profile with id "${profileId}".`);
  }
  profiles[index] = {
    ...profiles[index],
    projects: [project, ...profiles[index].projects]
  };
}

/**
 * PROTOTYPE ONLY. Replaces one project on the canonical in-memory profile, in
 * place, so an edit is reflected everywhere the record is read from — the
 * category index, the viewer, the feed, and search — rather than in a copy only
 * the editor can see. Its position is preserved: editing is not reordering.
 */
export function updatePrototypeProject(profileId: string, project: ProjectEntry): void {
  const index = profiles.findIndex((candidate) => candidate.id === profileId);
  if (index < 0) {
    throw new Error(`No profile with id "${profileId}".`);
  }
  const projectIndex = profiles[index].projects.findIndex((candidate) => candidate.id === project.id);
  if (projectIndex < 0) {
    throw new Error(`No project with id "${project.id}".`);
  }
  const projects = [...profiles[index].projects];
  projects[projectIndex] = project;
  profiles[index] = {
    ...profiles[index],
    projects
  };
}

/** PROTOTYPE ONLY. Applies the profile wall's chosen project-card order. */
export function reorderPrototypeProjects(profileId: string, projectOrder: string[]): void {
  const index = profiles.findIndex((candidate) => candidate.id === profileId);
  if (index < 0) {
    throw new Error(`No profile with id "${profileId}".`);
  }
  const existing = profiles[index].projects;
  const ranked = projectOrder
    .map((id) => existing.find((project) => project.id === id))
    .filter((project): project is ProjectEntry => Boolean(project));
  const remainder = existing.filter((project) => !projectOrder.includes(project.id));
  profiles[index] = {
    ...profiles[index],
    projects: [...ranked, ...remainder]
  };
}

/** PROTOTYPE ONLY. Removes one project from the canonical in-memory profile. */
export function removePrototypeProject(profileId: string, projectId: string): void {
  const index = profiles.findIndex((candidate) => candidate.id === profileId);
  if (index < 0) {
    throw new Error(`No profile with id "${profileId}".`);
  }
  profiles[index] = {
    ...profiles[index],
    projects: profiles[index].projects.filter((project) => project.id !== projectId)
  };
}

/**
 * PROTOTYPE ONLY. Adds a category to the canonical in-memory profile.
 *
 * A category is a real destination the moment it is created, so it has to live
 * on the profile record rather than in sidebar state — routing resolves the
 * active category from this list, and a category that only existed in the
 * sidebar would have no page to open. Reload discards it.
 */
export function registerPrototypeCategory(profileId: string, category: ProfileCategory): void {
  const index = profiles.findIndex((candidate) => candidate.id === profileId);
  if (index < 0) {
    throw new Error(`No profile with id "${profileId}".`);
  }
  profiles[index] = {
    ...profiles[index],
    categories: [category, ...profiles[index].categories]
  };
}

/** PROTOTYPE ONLY. Renames a category on the canonical record. */
export function renamePrototypeCategory(profileId: string, categoryId: string, label: string): void {
  const index = profiles.findIndex((candidate) => candidate.id === profileId);
  if (index < 0) {
    return;
  }
  profiles[index] = {
    ...profiles[index],
    categories: profiles[index].categories.map((category) => category.id === categoryId ? {
      ...category,
      label
    } : category)
  };
}

/**
 * PROTOTYPE ONLY. Removes an EMPTY category.
 *
 * This deliberately refuses a category that still holds work. It previously
 * filtered those projects out alongside it, which silently destroyed published
 * work as a side effect of tidying the sidebar. Removing the container is not
 * consent to delete its contents, so the caller has to empty it first — and the
 * only alternative, leaving the projects behind, would orphan them under a
 * category id that no longer resolves.
 */
export function removePrototypeCategory(profileId: string, categoryId: string): void {
  const index = profiles.findIndex((candidate) => candidate.id === profileId);
  if (index < 0) {
    throw new Error(`No profile with id "${profileId}".`);
  }
  const held = profiles[index].projects.filter((project) => project.categoryId === categoryId);
  if (held.length > 0) {
    throw new Error(`Category "${categoryId}" still holds ${held.length} project(s).`);
  }
  profiles[index] = {
    ...profiles[index],
    categories: profiles[index].categories.filter((category) => category.id !== categoryId)
  };
}

/** PROTOTYPE ONLY. How much work is filed under a category right now. */
export function countPrototypeCategoryProjects(profileId: string, categoryId: string): number {
  const profile = profiles.find((candidate) => candidate.id === profileId);
  return profile ? profile.projects.filter((project) => project.categoryId === categoryId).length : 0;
}

/** PROTOTYPE ONLY. Sets a category's icon on the canonical record. */
export function setPrototypeCategoryIcon(profileId: string, categoryId: string, iconName: string): void {
  const index = profiles.findIndex((candidate) => candidate.id === profileId);
  if (index < 0) {
    throw new Error(`No profile with id "${profileId}".`);
  }
  profiles[index] = {
    ...profiles[index],
    categories: profiles[index].categories.map((category) => category.id === categoryId ? {
      ...category,
      iconName
    } : category)
  };
}

/** PROTOTYPE ONLY. Applies an owner's chosen category order to the record. */
export function reorderPrototypeCategories(profileId: string, categoryOrder: string[]): void {
  const index = profiles.findIndex((candidate) => candidate.id === profileId);
  if (index < 0) {
    throw new Error(`No profile with id "${profileId}".`);
  }
  const existing = profiles[index].categories;
  const ranked = categoryOrder.map((id) => existing.find((category) => category.id === id)).filter((category): category is ProfileCategory => Boolean(category));
  // Anything the caller did not mention keeps its relative position at the end,
  // so a stale order can never drop a category off the record.
  const remainder = existing.filter((category) => !categoryOrder.includes(category.id));
  profiles[index] = {
    ...profiles[index],
    categories: [...ranked, ...remainder]
  };
}

/**
 * PROTOTYPE ONLY. Applies an edit to the canonical in-memory profile, so every
 * surface reading `getProfileById` sees the same updated record instead of a
 * stale copy. Replaces the entry rather than mutating it, so React comparisons
 * see a new object. Reload resets it — no storage exists yet.
 */
export function applyPrototypeProfileUpdate(profileId: string, patch: Partial<Profile>): Profile {
  const index = profiles.findIndex((candidate) => candidate.id === profileId);
  if (index < 0) {
    throw new Error(`No profile with id "${profileId}".`);
  }
  const next: Profile = {
    ...profiles[index],
    ...patch
  };
  profiles[index] = next;
  return next;
}
