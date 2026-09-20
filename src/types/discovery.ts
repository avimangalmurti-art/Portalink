import type { Id, Profile, ProjectView } from './domain';

export type DiscoveryZone = 'core' | 'adjacent' | 'outside';
export type ExplorationMode = 'close' | 'broaden' | 'different';
export type HomeFeedMode = 'balanced' | 'following' | 'nearby' | 'latest';
export type DiscoverySignalKind = 'interest' | 'curiosity';

export type GeographicScope =
  | 'local'
  | 'city'
  | 'regional'
  | 'national'
  | 'global'
  | 'location_independent';

/** Coarse, public relevance only. Exact coordinates are never stored here. */
export type CoarseGeography = {
  label: string;
  city?: string;
  countryCode?: string;
};

export type ProjectRelevance = {
  topicKeys: string[];
  contentGeography: CoarseGeography | null;
  geographicScope: GeographicScope;
  /** Confidence in the content-derived place, not in a person's location. */
  geographyConfidence: number;
};

export type DiscoverySignal = {
  topicKey: string;
  interestWeight: number;
  curiosityWeight: number;
  lastInterestAt: string | null;
  lastCuriosityAt: string | null;
};

export type ContentSphere = {
  viewerProfileId: Id | null;
  topicWeights: Record<string, number>;
  curiosityWeights: Record<string, number>;
  followedCreatorIds: Id[];
  homeGeography: CoarseGeography | null;
  currentGeography: CoarseGeography | null;
  /** Truthful descriptions of inputs that actually contributed. */
  sources: string[];
};

export type RecommendationReasonCode =
  | 'followed_creator'
  | 'saved_topic'
  | 'created_topic'
  | 'explicit_interest'
  | 'nearby_relevance'
  | 'curiosity_topic'
  | 'outside_sphere'
  | 'recent_work';

export type RecommendationReason = {
  code: RecommendationReasonCode;
  label: string;
  topicKey?: string;
};

export type RankedProjectView = ProjectView & {
  discovery: {
    zone: DiscoveryZone;
    distance: number;
    score: number;
    geographicRelevance: number;
    reason: RecommendationReason;
  };
};

export type HomeDiscovery = {
  featured: RankedProjectView | null;
  projects: RankedProjectView[];
  sphere: ContentSphere;
  homeMode: HomeFeedMode;
};

export type DiscoverSections = {
  sphere: ContentSphere;
  yourWorld: RankedProjectView[];
  adjacent: RankedProjectView[];
  outside: RankedProjectView[];
};

export type ContentSphereInput = {
  viewerProfile: Pick<Profile, 'id' | 'location'> | null;
  availableProjects: ProjectView[];
  followedCreatorIds: Id[];
  engagement: Array<{ projectId: Id; kind: 'like' | 'save' | 'repost'; createdAt: string }>;
  explicitSignals: DiscoverySignal[];
  currentGeography?: CoarseGeography | null;
  now?: Date;
};
