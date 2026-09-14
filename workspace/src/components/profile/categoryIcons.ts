import React from 'react';
import { ApertureIcon, AppWindowIcon, AtomIcon, AudioLinesIcon, BotIcon, BoxIcon, BrainCircuitIcon, Building2Icon, BookOpenIcon, BrushIcon, CameraIcon, CircuitBoardIcon, CircleDashedIcon, ClapperboardIcon, Code2Icon, CoffeeIcon, CompassIcon, CuboidIcon, DatabaseIcon, DumbbellIcon, FilmIcon, FlaskConicalIcon, Flower2Icon, Gamepad2Icon, GlobeIcon, GraduationCapIcon, GuitarIcon, HammerIcon, HeadphonesIcon, ImageIcon, LandmarkIcon, LayersIcon, LeafIcon, LightbulbIcon, MapIcon, Mic2Icon, MicroscopeIcon, MonitorIcon, MountainIcon, MusicIcon, NotebookPenIcon, PaletteIcon, PenToolIcon, PianoIcon, PlaneIcon, PresentationIcon, RocketIcon, RulerIcon, ScissorsIcon, ShapesIcon, ShoppingBagIcon, SparklesIcon, TerminalIcon, TreesIcon, TrophyIcon, TypeIcon, VideoIcon, WrenchIcon } from 'lucide-react';
import { FaLinkedinIn } from 'react-icons/fa6';
import { SiBehance, SiDiscord, SiDribbble, SiFacebook, SiGithub, SiInstagram, SiMedium, SiPinterest, SiReddit, SiSnapchat, SiSoundcloud, SiSpotify, SiThreads, SiTiktok, SiTwitch, SiVimeo, SiX, SiYoutube } from 'react-icons/si';

export type CategoryIconComponent = React.ComponentType<{
  className?: string;
}>;

const iconsByName: Record<string, CategoryIconComponent> = {
  audio: AudioLinesIcon,
  window: AppWindowIcon,
  type: TypeIcon,
  pen: PenToolIcon,
  shapes: ShapesIcon,
  ruler: RulerIcon,
  camera: CameraIcon,
  building: Building2Icon,
  globe: GlobeIcon,
  book: BookOpenIcon,
  brush: BrushIcon,
  circle: CircleDashedIcon,
  compass: CompassIcon,
  film: FilmIcon,
  layers: LayersIcon,
  map: MapIcon,
  monitor: MonitorIcon,
  music: MusicIcon,
  scissors: ScissorsIcon,
  sparkles: SparklesIcon,
  palette: PaletteIcon,
  image: ImageIcon,
  video: VideoIcon,
  clapperboard: ClapperboardIcon,
  aperture: ApertureIcon,
  headphones: HeadphonesIcon,
  microphone: Mic2Icon,
  guitar: GuitarIcon,
  piano: PianoIcon,
  box: BoxIcon,
  cube: CuboidIcon,
  hammer: HammerIcon,
  wrench: WrenchIcon,
  code: Code2Icon,
  terminal: TerminalIcon,
  circuit: CircuitBoardIcon,
  database: DatabaseIcon,
  bot: BotIcon,
  idea: LightbulbIcon,
  intelligence: BrainCircuitIcon,
  flask: FlaskConicalIcon,
  microscope: MicroscopeIcon,
  atom: AtomIcon,
  leaf: LeafIcon,
  flower: Flower2Icon,
  trees: TreesIcon,
  mountain: MountainIcon,
  plane: PlaneIcon,
  rocket: RocketIcon,
  shopping: ShoppingBagIcon,
  coffee: CoffeeIcon,
  landmark: LandmarkIcon,
  graduation: GraduationCapIcon,
  notebook: NotebookPenIcon,
  presentation: PresentationIcon,
  gamepad: Gamepad2Icon,
  trophy: TrophyIcon,
  fitness: DumbbellIcon
};

/** Brand glyphs are available to profile links without entering the Portal
 * category library. They stay monochrome so the surrounding interface owns
 * hover, focus, selected, and dark-mode colour consistently. */
const profileBrandIcons: Record<string, CategoryIconComponent> = {
  instagram: SiInstagram,
  youtube: SiYoutube,
  tiktok: SiTiktok,
  x: SiX,
  facebook: SiFacebook,
  linkedin: FaLinkedinIn,
  soundcloud: SiSoundcloud,
  spotify: SiSpotify,
  twitch: SiTwitch,
  pinterest: SiPinterest,
  snapchat: SiSnapchat,
  github: SiGithub,
  behance: SiBehance,
  dribbble: SiDribbble,
  vimeo: SiVimeo,
  medium: SiMedium,
  threads: SiThreads,
  discord: SiDiscord,
  reddit: SiReddit
};

const brandLabels: Record<string, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  x: 'X',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  soundcloud: 'SoundCloud',
  spotify: 'Spotify',
  twitch: 'Twitch',
  pinterest: 'Pinterest',
  snapchat: 'Snapchat',
  github: 'GitHub',
  behance: 'Behance',
  dribbble: 'Dribbble',
  vimeo: 'Vimeo',
  medium: 'Medium',
  threads: 'Threads',
  discord: 'Discord',
  reddit: 'Reddit'
};

export const categoryIconNames = Object.keys(iconsByName);

export type ProfileLinkIconOption = {
  name: string;
  label: string;
  isBrand: boolean;
};

export const profileLinkIconOptions: ProfileLinkIconOption[] = [
  ...Object.keys(profileBrandIcons).map((name) => ({ name, label: brandLabels[name], isBrand: true })),
  ...categoryIconNames.map((name) => ({
    name,
    label: name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    isBrand: false
  }))
];

export const profileLinkIconNames = profileLinkIconOptions.map((option) => option.name);

export function getCategoryIcon(iconName: string): CategoryIconComponent {
  return profileBrandIcons[iconName] ?? iconsByName[iconName] ?? ShapesIcon;
}
