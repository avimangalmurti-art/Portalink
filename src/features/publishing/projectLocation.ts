import type { ProjectRelevance } from '../../types/discovery';
import { parseExplicitLocationIntent } from '../../domain/discovery/ranking';

/** A creator's optional place is independent of the words in their description. */
export function withProjectLocation(relevance: ProjectRelevance, location?: string): ProjectRelevance {
  if (location === undefined) return relevance;
  const label = location.trim();
  if (label.length > 80) throw new Error('Keep the location within 80 characters.');
  return {
    ...relevance,
    contentGeography: label ? { ...parseExplicitLocationIntent(label), label } : null,
    geographicScope: label ? 'city' : 'location_independent',
    geographyConfidence: label ? 1 : 0,
  };
}
