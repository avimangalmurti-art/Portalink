import { cities } from '../../data/cities';
import { getCountryCode } from '../../data/countryCodes';
import type { Id, Project, ProjectView } from '../../types/domain';
import type {
  CoarseGeography,
  ContentSphere,
  ContentSphereInput,
  DiscoverSections,
  DiscoveryZone,
  ExplorationMode,
  GeographicScope,
  HomeFeedMode,
  HomeDiscovery,
  ProjectRelevance,
  RankedProjectView,
  RecommendationReason,
} from '../../types/discovery';
import { decideProjectPlacement } from '../contentPlacement';

export const CONTENT_DISTANCE_THRESHOLDS = {
  core: 0.48,
  adjacent: 0.76,
} as const;

const CURIOSITY_HALF_LIFE_DAYS = 21;

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'been', 'before', 'being', 'between', 'both',
  'could', 'design', 'from', 'have', 'into', 'made', 'more', 'project', 'that',
  'their', 'there', 'these', 'this', 'through', 'using', 'very', 'what', 'when',
  'where', 'which', 'with', 'work', 'your', 'the', 'and', 'for', 'are', 'but',
]);

const TOPIC_ALIASES: Record<string, string> = {
  photo: 'photography', photos: 'photography', photographic: 'photography',
  type: 'typography', typographic: 'typography', fonts: 'typography', font: 'typography',
  graphics: 'graphic-design', graphic: 'graphic-design', branding: 'graphic-design',
  architecture: 'architecture', architectural: 'architecture',
  structural: 'structural-engineering', engineering: 'structural-engineering',
  product: 'product-design', industrial: 'product-design', furniture: 'furniture',
  illustration: 'illustration', illustrated: 'illustration', drawing: 'illustration',
  film: 'film', cinematic: 'film', video: 'film',
  audio: 'sound', music: 'sound', sonic: 'sound',
  fashion: 'fashion', garment: 'fashion', textile: 'fashion',
  poster: 'graphic-design', posters: 'graphic-design', identity: 'graphic-design', logo: 'graphic-design',
  helvetica: 'typography', lettering: 'typography',
  dynamics: 'structural-engineering', damping: 'structural-engineering', seismic: 'structural-engineering',
  microscope: 'research', microscopic: 'research', scientific: 'research',
  painted: 'painting', paint: 'painting',
};

const TOPIC_VOCABULARY = new Set([
  'animation', 'architecture', 'ceramics', 'code', 'data', 'documentary', 'editorial',
  'education', 'environment', 'fashion', 'film', 'furniture', 'illustration',
  'installation', 'interaction', 'painting', 'performance', 'photography',
  'publishing', 'research', 'sculpture', 'sound', 'technology', 'typography',
  'web', 'writing',
]);

const TOPIC_PHRASES: Array<[string, string]> = [
  ['graphic design', 'graphic-design'],
  ['product design', 'product-design'],
  ['structural engineering', 'structural-engineering'],
  ['visual identity', 'graphic-design'],
  ['user experience', 'interaction'],
];

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalize(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function displayTopic(topicKey: string): string {
  return topicKey.replace(/-/g, ' ');
}

export function extractTopicKeys(...values: string[]): string[] {
  const counts = new Map<string, number>();
  const normalized = normalize(values.join(' '));
  TOPIC_PHRASES.forEach(([phrase, key]) => {
    if (` ${normalized} `.includes(` ${phrase} `)) counts.set(key, (counts.get(key) ?? 0) + 3);
  });
  normalized.split(/\s+/).forEach((word) => {
    if (word.length < 3 || STOP_WORDS.has(word) || /^\d+$/.test(word)) return;
    const key = TOPIC_ALIASES[word] ?? (TOPIC_VOCABULARY.has(word) ? word : null);
    if (!key) return;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([key]) => key);
}

function cityMention(text: string): CoarseGeography | null {
  const normalized = ` ${normalize(text)} `;
  const match = cities
    .slice()
    .sort((left, right) => right.name.length - left.name.length)
    .find((city) => normalized.includes(` ${normalize(city.name)} `));
  if (!match) return null;
  const code = getCountryCode(match.name);
  return { label: match.name, city: match.name, countryCode: code || undefined };
}

export function parseExplicitLocationIntent(query: string): CoarseGeography | null {
  return cityMention(query);
}

function inferScope(text: string, geography: CoarseGeography | null): GeographicScope {
  const normalized = normalize(text);
  if (/\b(worldwide|global|international)\b/.test(normalized)) return 'global';
  if (/\b(national|nationwide|countrywide)\b/.test(normalized)) return 'national';
  if (/\b(regional|region|county|metro)\b/.test(normalized)) return 'regional';
  if (!geography) return 'location_independent';
  if (/\b(neighborhood|neighbourhood|local|venue|opening|exhibition|workshop)\b/.test(normalized)) return 'local';
  return 'city';
}

export function deriveProjectRelevance(input: {
  title: string;
  summary: string;
  categoryLabel?: string;
  stored?: Partial<ProjectRelevance> | null;
}): ProjectRelevance {
  const combined = `${input.title} ${input.summary}`;
  const inferredGeography = cityMention(combined);
  const storedTopics = input.stored?.topicKeys?.filter(Boolean) ?? [];
  const storedGeography = input.stored?.contentGeography ?? null;
  return {
    topicKeys: [...new Set([...storedTopics, ...extractTopicKeys(input.categoryLabel ?? '', input.title, input.summary)])].slice(0, 10),
    contentGeography: input.stored?.geographicScope === 'location_independent' && input.stored.contentGeography === null ? null : storedGeography ?? inferredGeography,
    geographicScope: input.stored?.geographicScope ?? inferScope(combined, inferredGeography),
    geographyConfidence: clamp(input.stored?.geographyConfidence ?? (inferredGeography ? 0.86 : 0)),
  };
}

function projectRelevance(project: Project): ProjectRelevance {
  return project.relevance ?? deriveProjectRelevance({ title: project.title, summary: project.summary });
}

function coarseGeography(value: string): CoarseGeography | null {
  if (!value.trim()) return null;
  const matched = cityMention(value);
  return matched ?? { label: value.trim() };
}

function addWeight(target: Map<string, number>, topics: string[], weight: number): void {
  topics.forEach((topic) => target.set(topic, (target.get(topic) ?? 0) + weight));
}

function decay(weight: number, timestamp: string | null, now: Date): number {
  if (!timestamp) return 0;
  const ageDays = Math.max(0, (now.getTime() - new Date(timestamp).getTime()) / 86_400_000);
  return weight * Math.pow(0.5, ageDays / CURIOSITY_HALF_LIFE_DAYS);
}

export function buildUserContentSphere(input: ContentSphereInput): ContentSphere {
  const now = input.now ?? new Date();
  const interest = new Map<string, number>();
  const curiosity = new Map<string, number>();
  const sources = new Set<string>();
  const projectById = new Map(input.availableProjects.map((view) => [view.project.id, view]));
  const followed = new Set(input.followedCreatorIds);

  input.availableProjects.forEach((view) => {
    const topics = projectRelevance(view.project).topicKeys;
    if (input.viewerProfile && view.creator.id === input.viewerProfile.id) {
      addWeight(interest, topics, 0.7);
      sources.add('your published work');
    }
    if (followed.has(view.creator.id)) {
      addWeight(interest, topics, 0.55);
      sources.add('creators you follow');
    }
  });

  input.engagement.forEach((entry) => {
    const project = projectById.get(entry.projectId)?.project;
    if (!project) return;
    const amount = entry.kind === 'save' ? 1 : entry.kind === 'repost' ? 0.65 : 0.25;
    addWeight(interest, projectRelevance(project).topicKeys, amount);
    sources.add(entry.kind === 'save' ? 'work you saved' : 'explicit project actions');
  });

  input.explicitSignals.forEach((signal) => {
    if (signal.interestWeight > 0) {
      interest.set(signal.topicKey, (interest.get(signal.topicKey) ?? 0) + signal.interestWeight);
      sources.add('topics you asked to see more of');
    }
    const currentCuriosity = decay(signal.curiosityWeight, signal.lastCuriosityAt, now);
    if (currentCuriosity > 0.01) {
      curiosity.set(signal.topicKey, (curiosity.get(signal.topicKey) ?? 0) + currentCuriosity);
      sources.add('recent Discover exploration');
    }
  });

  const normalizeWeights = (weights: Map<string, number>): Record<string, number> => {
    const maximum = Math.max(1, ...weights.values());
    return Object.fromEntries([...weights.entries()].map(([key, value]) => [key, clamp(value / maximum)]));
  };

  return {
    viewerProfileId: input.viewerProfile?.id ?? null,
    topicWeights: normalizeWeights(interest),
    curiosityWeights: normalizeWeights(curiosity),
    followedCreatorIds: [...followed],
    homeGeography: coarseGeography(input.viewerProfile?.location ?? ''),
    // Current/travel geography is deliberately separate and never overwrites home identity.
    currentGeography: input.currentGeography ?? null,
    sources: [...sources],
  };
}

function topicAffinity(topics: string[], weights: Record<string, number>): { score: number; topic?: string } {
  let bestTopic: string | undefined;
  let best = 0;
  topics.forEach((topic) => {
    const weight = weights[topic] ?? 0;
    if (weight > best) {
      best = weight;
      bestTopic = topic;
    }
  });
  return { score: clamp(best), topic: bestTopic };
}

export function calculateGeographicRelevance(relevance: ProjectRelevance, sphere: ContentSphere): number {
  if (relevance.geographicScope === 'location_independent') return 0.5;
  if (relevance.geographicScope === 'global') return 0.42;
  const content = relevance.contentGeography;
  const viewer = sphere.currentGeography ?? sphere.homeGeography;
  if (!content || !viewer) return 0.35;
  const contentLabel = normalize(content.city ?? content.label);
  const viewerLabel = normalize(viewer.city ?? viewer.label);
  if (contentLabel && (contentLabel === viewerLabel || contentLabel.includes(viewerLabel) || viewerLabel.includes(contentLabel))) return 1;
  if (content.countryCode && viewer.countryCode && content.countryCode === viewer.countryCode) {
    return relevance.geographicScope === 'national' ? 0.82 : relevance.geographicScope === 'regional' ? 0.62 : 0.38;
  }
  return relevance.geographicScope === 'national' ? 0.25 : 0.12;
}

export function calculateContentDistance(view: ProjectView, sphere: ContentSphere): number {
  const relevance = projectRelevance(view.project);
  const interest = topicAffinity(relevance.topicKeys, sphere.topicWeights).score;
  const relationship = view.creator.id === sphere.viewerProfileId || sphere.followedCreatorIds.includes(view.creator.id) ? 1 : 0;
  const geography = calculateGeographicRelevance(relevance, sphere);
  const hasSphere = Object.keys(sphere.topicWeights).length > 0 || sphere.followedCreatorIds.length > 0;
  if (!hasSphere) return 0.64;
  return clamp(1 - (interest * 0.52 + relationship * 0.30 + geography * 0.18));
}

export function classifyDiscoveryZone(distance: number): DiscoveryZone {
  if (distance <= CONTENT_DISTANCE_THRESHOLDS.core) return 'core';
  if (distance <= CONTENT_DISTANCE_THRESHOLDS.adjacent) return 'adjacent';
  return 'outside';
}

function quality(project: Project): number {
  const readyAttachment = project.attachments?.some((attachment) => attachment.status === 'ready') ?? false;
  return clamp((project.cover ? 0.45 : 0) + (project.summary.length >= 50 ? 0.3 : 0.16) + (readyAttachment ? 0.25 : 0.1));
}

function recency(project: Project, now: Date): number {
  if (!project.publishedAt) return 0.45;
  const ageDays = Math.max(0, (now.getTime() - new Date(project.publishedAt).getTime()) / 86_400_000);
  return Math.exp(-ageDays / 45);
}

function reasonFor(view: ProjectView, sphere: ContentSphere, zone: DiscoveryZone): RecommendationReason {
  if (sphere.followedCreatorIds.includes(view.creator.id)) {
    return { code: 'followed_creator', label: `Because you follow ${view.creator.name}` };
  }
  const relevance = projectRelevance(view.project);
  const interest = topicAffinity(relevance.topicKeys, sphere.topicWeights);
  if (interest.topic && interest.score > 0.2) {
    return { code: 'saved_topic', topicKey: interest.topic, label: `Related to ${displayTopic(interest.topic)} in your sphere` };
  }
  const curiosity = topicAffinity(relevance.topicKeys, sphere.curiosityWeights);
  if (curiosity.topic && curiosity.score > 0.2) {
    return { code: 'curiosity_topic', topicKey: curiosity.topic, label: `From your recent ${displayTopic(curiosity.topic)} exploration` };
  }
  if (relevance.contentGeography && calculateGeographicRelevance(relevance, sphere) >= 0.8) {
    return { code: 'nearby_relevance', label: `Relevant to ${relevance.contentGeography.label}` };
  }
  if (zone === 'outside') {
    const topic = relevance.topicKeys[0];
    return { code: 'outside_sphere', topicKey: topic, label: topic ? `${displayTopic(topic)} beyond your usual sphere` : 'Outside your usual content sphere' };
  }
  return { code: 'recent_work', label: 'Recently published on Portalink' };
}

function homeScore(input: {
  mode: HomeFeedMode;
  interest: number;
  relationship: number;
  geography: number;
  recency: number;
  quality: number;
}): number {
  const { mode, interest, relationship, geography, recency: recent, quality: complete } = input;
  if (mode === 'following') return clamp(interest * 0.20 + relationship * 0.58 + geography * 0.05 + recent * 0.12 + complete * 0.05);
  if (mode === 'nearby') return clamp(interest * 0.18 + relationship * 0.12 + geography * 0.55 + recent * 0.10 + complete * 0.05);
  if (mode === 'latest') return clamp(interest * 0.08 + relationship * 0.07 + geography * 0.03 + recent * 0.75 + complete * 0.07);
  return clamp(interest * 0.40 + relationship * 0.25 + geography * 0.12 + recent * 0.13 + complete * 0.10);
}

function rankOne(view: ProjectView, sphere: ContentSphere, now: Date, discoveryMode: boolean, homeMode: HomeFeedMode = 'balanced'): RankedProjectView {
  const relevance = projectRelevance(view.project);
  const distance = calculateContentDistance(view, sphere);
  const zone = classifyDiscoveryZone(distance);
  const geographicRelevance = calculateGeographicRelevance(relevance, sphere);
  const interest = topicAffinity(relevance.topicKeys, sphere.topicWeights).score;
  const curiosity = topicAffinity(relevance.topicKeys, sphere.curiosityWeights).score;
  const relationship = view.creator.id === sphere.viewerProfileId || sphere.followedCreatorIds.includes(view.creator.id) ? 1 : 0;
  const score = discoveryMode
    ? clamp((1 - distance) * 0.35 + curiosity * 0.35 + recency(view.project, now) * 0.15 + quality(view.project) * 0.15)
    : homeScore({
        mode: homeMode,
        interest,
        relationship,
        geography: geographicRelevance,
        recency: recency(view.project, now),
        quality: quality(view.project),
      });
  return { ...view, discovery: { zone, distance, score, geographicRelevance, reason: reasonFor(view, sphere, zone) } };
}

function stableRank(left: RankedProjectView, right: RankedProjectView): number {
  return right.discovery.score - left.discovery.score
    || (right.project.publishedAt ?? '').localeCompare(left.project.publishedAt ?? '')
    || left.project.id.localeCompare(right.project.id);
}

/** Keep the strongest eligible work from each creator in ranking order. */
function oneProjectPerCreator(views: RankedProjectView[]): RankedProjectView[] {
  const seen = new Set<Id>();
  return views.filter((view) => {
    if (seen.has(view.creator.id)) return false;
    seen.add(view.creator.id);
    return true;
  });
}

export function rankHomeProjects(available: ProjectView[], sphere: ContentSphere, now = new Date(), homeMode: HomeFeedMode = 'balanced'): HomeDiscovery {
  // Home currently includes every public creator's published work, newest first.
  // Preserve pagination and multiple projects per creator; relationships do not gate it.
  const eligible = available
    .filter((view) => decideProjectPlacement({
      view,
      surface: 'home',
      viewerProfileId: sphere.viewerProfileId,
      followedCreatorIds: sphere.followedCreatorIds,
    }).eligible)
    .map((view) => rankOne(view, sphere, now, false, homeMode))
    .sort((left, right) =>
      (right.project.publishedAt ?? '').localeCompare(left.project.publishedAt ?? '')
      || left.project.id.localeCompare(right.project.id));
  return { featured: eligible[0] ?? null, projects: eligible, sphere, homeMode };
}

export function rankDiscoverProjects(available: ProjectView[], sphere: ContentSphere, mode: ExplorationMode, now = new Date()): DiscoverSections {
  const ranked = oneProjectPerCreator(available
    .filter((view) => decideProjectPlacement({ view, surface: 'discover' }).eligible)
    .map((view) => rankOne(view, sphere, now, true))
    .sort(stableRank));
  const byZone = (zone: DiscoveryZone) => ranked.filter((view) => view.discovery.zone === zone).sort(stableRank);
  const limits = mode === 'close'
    ? { core: 8, adjacent: 5, outside: 3 }
    : mode === 'different'
      ? { core: 4, adjacent: 6, outside: 10 }
      : { core: 6, adjacent: 9, outside: 5 };
  return {
    sphere,
    yourWorld: byZone('core').slice(0, limits.core),
    adjacent: byZone('adjacent').slice(0, limits.adjacent),
    outside: byZone('outside').slice(0, limits.outside),
  };
}

export function projectRelevanceForPersistence(project: Pick<Project, 'title' | 'summary'>, categoryLabel = ''): ProjectRelevance {
  return deriveProjectRelevance({ title: project.title, summary: project.summary, categoryLabel });
}
