import { profiles } from './profiles';
import { typefaces } from './typefaces';

/**
 * Typography belongs to the PROJECT, not to the account that owns it.
 *
 * A creator sets typography as part of an individual project's identity, so two
 * projects by the same person can — and usually do — read in different faces.
 * The model is therefore:
 *
 *   profile → projects → project design settings → face
 *
 * The assignment below is the MIGRATION SEED for that design setting, read only
 * by the prototype `ProjectService` — never by a component. It is computed ONCE at
 * module load from a fixed seed, so seeded work keeps exactly the face it has
 * always had: varied, but identical across every surface, navigation, and reload.
 *
 * A project whose record carries its own `design` wins over this seed, and an
 * owner's edits live in the service for the session. Nothing here is persisted.
 */

/** Faces with enough presence to read as a deliberate project choice. */
const displayTypefaceIds = typefaces.map((typeface) => typeface.id).filter((id) => id !== 'system');

/** Deterministic PRNG, so the spread is arbitrary but reproducible. */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}
function buildAssignments(): Record<string, string> {
  const next = seededRandom(20260816);
  const assignments: Record<string, string> = {};
  // Tracked per owner so a creator's projects never all land on one face.
  const lastByProfile: Record<string, string> = {};
  profiles.forEach((profile) => {
    profile.projects.forEach((project) => {
      let typefaceId = displayTypefaceIds[Math.floor(next() * displayTypefaceIds.length)];
      if (typefaceId === lastByProfile[profile.id]) {
        const index = displayTypefaceIds.indexOf(typefaceId);
        typefaceId = displayTypefaceIds[(index + 1) % displayTypefaceIds.length];
      }
      lastByProfile[profile.id] = typefaceId;
      assignments[project.id] = typefaceId;
    });
  });
  return assignments;
}
const seededProjectTypefaceIds: Record<string, string> = buildAssignments();

/**
 * The face a project was published in. Projects created during this session
 * have no seeded entry, so they start in the interface face.
 *
 * Called by the prototype `ProjectService` when resolving a project's design
 * setting. Presentation must go through that service, not through here.
 */
export function getSeededProjectTypefaceId(projectId: string | null): string {
  if (!projectId) {
    return 'default';
  }
  return seededProjectTypefaceIds[projectId] ?? 'default';
}