import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { CategoryMutationError } from '../../types/profile';
import type { CategoryDeletionCapability, Id, PortfolioArrangement, PortfolioCategory } from '../../types/domain';

/**
 * The owner's portfolio-management boundary.
 *
 * UI → this hook → `ProfileService` → implementation. Every operation the
 * sidebar offers goes through here, so each one has the same lifecycle: it
 * validates, reports that it is working, and either succeeds or surfaces a
 * failure that can be retried. Nothing here knows about a database.
 *
 * The arrangement operations — order, hidden set, icons — are optimistic,
 * because they are cheap, reversible, and constant during a drag. A failure
 * rolls the arrangement back rather than leaving the sidebar showing a state the
 * store rejected.
 */

export const MAX_CATEGORY_LABEL = 40;

/** Local mirror of the service's rules, so typing is answered without a round trip. */
export function validateCategoryLabel(label: string, existing: PortfolioCategory[], excludingCategoryId: Id | null): string | null {
  const trimmed = label.trim();
  if (!trimmed) {
    return 'Give this category a name.';
  }
  if (trimmed.length > MAX_CATEGORY_LABEL) {
    return `Keep the name under ${MAX_CATEGORY_LABEL} characters.`;
  }
  const clash = existing.some((category) => category.id !== excludingCategoryId && category.label.trim().toLowerCase() === trimmed.toLowerCase());
  return clash ? 'You already have a category with that name.' : null;
}
function messageFor(error: unknown, fallback: string): string {
  if (error instanceof CategoryMutationError) {
    return error.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
export type PendingOperation = {
  kind: 'create' | 'rename' | 'icon' | 'arrangement' | 'delete';
  categoryId: Id | null;
};
export type CategoryFailure = {
  kind: PendingOperation['kind'];
  categoryId: Id | null;
  message: string;
  /** Re-runs exactly the attempt that failed. */
  retry: () => void;
};
export type CategoryManagement = {
  /**
   * Icons chosen but not yet confirmed by the store, so the sidebar shows the
   * choice immediately. Held only until the write lands — the canonical record
   * stays the source of the saved icon — and dropped again if it is rejected.
   */
  categoryIcons: Record<Id, string>;
  arrangement: PortfolioArrangement | null;
  isLoadingArrangement: boolean;
  /** The arrangement could not be read; management is offered read-only. */
  arrangementError: string | null;
  reloadArrangement: () => void;
  pending: PendingOperation | null;
  failure: CategoryFailure | null;
  dismissFailure: () => void;
  createCategory: (label: string, iconName?: string) => Promise<PortfolioCategory | null>;
  renameCategory: (categoryId: Id, label: string) => Promise<boolean>;
  setCategoryIcon: (categoryId: Id, iconName: string) => Promise<boolean>;
  reorderCategories: (categoryOrder: Id[]) => Promise<boolean>;
  toggleCategoryHidden: (categoryId: Id) => Promise<boolean>;
  /** Asked before the confirmation is offered, never assumed. */
  readDeletionCapability: (categoryId: Id) => Promise<CategoryDeletionCapability>;
  deleteCategory: (categoryId: Id) => Promise<boolean>;
};
/**
 * `profileId` is nullable because there is not always a portfolio in context —
 * a guest browsing the feed owns nothing. Every operation refuses rather than
 * inventing an owner.
 */
export function useCategoryManagement(profileId: Id | null, isOwner: boolean): CategoryManagement {
  const {
    profiles: profileService
  } = useServices();
  const {
    peekProfile,
    invalidateProfiles
  } = useProfileData();
  const [arrangement, setArrangement] = useState<PortfolioArrangement | null>(null);
  const [isLoadingArrangement, setIsLoadingArrangement] = useState(false);
  const [arrangementError, setArrangementError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingOperation | null>(null);
  const [failure, setFailure] = useState<CategoryFailure | null>(null);
  const [optimisticIcons, setOptimisticIcons] = useState<Record<Id, string>>({});
  // One operation at a time. A double-click on Delete, or a drag landing while a
  // rename is still saving, must not race the store.
  const inFlightRef = useRef(false);
  const isMountedRef = useRef(true);
  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);
  const loadArrangement = useCallback(() => {
    if (!isOwner || !profileId) {
      setArrangement(null);
      return;
    }
    setIsLoadingArrangement(true);
    setArrangementError(null);
    profileService.getPortfolioArrangement(profileId).then((next) => {
      if (isMountedRef.current) {
        setArrangement(next);
      }
    }).catch((error) => {
      if (isMountedRef.current) {
        setArrangementError(messageFor(error, 'Your portfolio arrangement could not be loaded.'));
      }
    }).finally(() => {
      if (isMountedRef.current) {
        setIsLoadingArrangement(false);
      }
    });
  }, [isOwner, profileId, profileService]);
  useEffect(loadArrangement, [loadArrangement]);

  /** Runs one guarded operation, with its own retry closure on failure. */
  const run = useCallback(async function run<T>(operation: PendingOperation, attempt: () => Promise<T>, fallbackMessage: string, rollback?: () => void): Promise<T | null> {
    if (inFlightRef.current) {
      return null;
    }
    inFlightRef.current = true;
    setPending(operation);
    setFailure(null);
    try {
      const result = await attempt();
      // Every surface reads the canonical record, so one invalidation updates
      // the sidebar, the profile, and the category page together.
      invalidateProfiles();
      return result;
    } catch (error) {
      rollback?.();
      if (isMountedRef.current) {
        setFailure({
          kind: operation.kind,
          categoryId: operation.categoryId,
          message: messageFor(error, fallbackMessage),
          retry: () => {
            void run(operation, attempt, fallbackMessage, rollback);
          }
        });
      }
      return null;
    } finally {
      inFlightRef.current = false;
      if (isMountedRef.current) {
        setPending(null);
      }
    }
  }, [invalidateProfiles]);
  const createCategory = useCallback(async (label: string, iconName?: string) => {
    if (!profileId) {
      return null;
    }
    // A peek, not a read: if the record has not been confirmed yet, the local
    // duplicate check is simply skipped — the service re-validates the label on
    // write, so nothing is decided from an assumed record.
    const existing = peekProfile(profileId)?.categories ?? [];
    const invalid = validateCategoryLabel(label, existing, null);
    if (invalid) {
      setFailure({
        kind: 'create',
        categoryId: null,
        message: invalid,
        retry: () => setFailure(null)
      });
      return null;
    }
    const created = await run({
      kind: 'create',
      categoryId: null
      // `iconName` is already part of `CreateCategoryInput`, so the chosen mark
      // travels with the write instead of needing a second request afterwards.
    }, () => profileService.createCategory(profileId, {
      label,
      ...(iconName ? {
        iconName
      } : {})
    }), 'That category could not be created.');
    if (created) {
      loadArrangement();
    }
    return created;
  }, [loadArrangement, profileId, profileService, peekProfile, run]);
  const renameCategory = useCallback(async (categoryId: Id, label: string) => {
    if (!profileId) {
      return false;
    }
    const existing = peekProfile(profileId)?.categories ?? [];
    const current = existing.find((category) => category.id === categoryId);
    if (current && current.label === label.trim()) {
      return true;
    }
    const invalid = validateCategoryLabel(label, existing, categoryId);
    if (invalid) {
      setFailure({
        kind: 'rename',
        categoryId,
        message: invalid,
        retry: () => setFailure(null)
      });
      return false;
    }
    const renamed = await run({
      kind: 'rename',
      categoryId
    }, () => profileService.renameCategory(profileId, categoryId, label), 'That category could not be renamed.');
    return renamed !== null;
  }, [profileId, profileService, peekProfile, run]);
  const setCategoryIcon = useCallback(async (categoryId: Id, iconName: string) => {
    if (!profileId) {
      return false;
    }
    // Optimistic, like the other arrangement operations: the choice appears at
    // once, and a rejected write rolls it back rather than leaving the sidebar
    // showing an icon the store refused.
    setOptimisticIcons((current) => ({
      ...current,
      [categoryId]: iconName
    }));
    const dropOverride = () => {
      if (!isMountedRef.current) {
        return;
      }
      setOptimisticIcons((current) => {
        if (!(categoryId in current)) {
          return current;
        }
        const {
          [categoryId]: _dropped,
          ...rest
        } = current;
        return rest;
      });
    };
    const updated = await run({
      kind: 'icon',
      categoryId
    }, () => profileService.setCategoryIcon(profileId, categoryId, iconName), 'That icon could not be saved.', dropOverride);
    if (updated !== null) {
      // The record now carries it, so the override has nothing left to say.
      dropOverride();
    }
    return updated !== null;
  }, [profileId, profileService, run]);

  /** Order and hidden set share one write, so they can never disagree. */
  const saveArrangement = useCallback(async (next: PortfolioArrangement, kind: PendingOperation['kind'], categoryId: Id | null, fallbackMessage: string) => {
    if (!profileId) {
      return false;
    }
    const previous = arrangement;
    setArrangement(next);
    const result = await run({
      kind,
      categoryId
    }, () => profileService.savePortfolioArrangement(profileId, next).then(() => true), fallbackMessage, () => {
      if (isMountedRef.current) {
        setArrangement(previous);
      }
    });
    return result === true;
  }, [arrangement, profileId, profileService, run]);
  const reorderCategories = useCallback(async (categoryOrder: Id[]) => {
    if (!arrangement) {
      return false;
    }
    return saveArrangement({
      ...arrangement,
      categoryOrder
    }, 'arrangement', null, 'That new order could not be saved.');
  }, [arrangement, saveArrangement]);
  const toggleCategoryHidden = useCallback(async (categoryId: Id) => {
    if (!arrangement) {
      return false;
    }
    const isHidden = arrangement.hiddenCategoryIds.includes(categoryId);
    return saveArrangement({
      ...arrangement,
      hiddenCategoryIds: isHidden ? arrangement.hiddenCategoryIds.filter((id) => id !== categoryId) : [...arrangement.hiddenCategoryIds, categoryId]
    }, 'arrangement', categoryId, isHidden ? 'That category could not be shown.' : 'That category could not be hidden.');
  }, [arrangement, saveArrangement]);
  const readDeletionCapability = useCallback((categoryId: Id): Promise<CategoryDeletionCapability> => profileId ? profileService.getCategoryDeletionCapability(profileId, categoryId) : Promise.resolve({
    isAvailable: false,
    removes: [],
    blockingProjectCount: 0,
    reason: 'There is no portfolio open, so nothing can be removed.'
  }), [profileId, profileService]);
  const deleteCategory = useCallback(async (categoryId: Id) => {
    if (!profileId) {
      return false;
    }
    const deleted = await run({
      kind: 'delete',
      categoryId
    }, async () => {
      // Re-asked at the moment of deletion: the answer may have changed since
      // the confirmation was opened, and work must never be lost to a stale one.
      const capability = await profileService.getCategoryDeletionCapability(profileId, categoryId);
      if (!capability.isAvailable) {
        throw new CategoryMutationError(capability.blockingProjectCount > 0 ? 'category_not_empty' : 'deletion_unavailable', capability.reason ?? 'That category could not be deleted.', capability.blockingProjectCount);
      }
      await profileService.deleteCategory(profileId, categoryId);
      return true;
    }, 'That category could not be deleted. Nothing was removed.');
    if (deleted) {
      loadArrangement();
    }
    return deleted === true;
  }, [loadArrangement, profileId, profileService, run]);
  return {
    categoryIcons: optimisticIcons,
    arrangement,
    isLoadingArrangement,
    arrangementError,
    reloadArrangement: loadArrangement,
    pending,
    failure,
    dismissFailure: () => setFailure(null),
    createCategory,
    renameCategory,
    setCategoryIcon,
    reorderCategories,
    toggleCategoryHidden,
    readDeletionCapability,
    deleteCategory
  };
}