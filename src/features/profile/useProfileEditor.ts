import { profileHeadline, validContactEmail } from '../employer/employer';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useServices } from '../../contexts/ServicesContext';
import { useProfileData } from '../../contexts/ProfileDataContext';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { validateLocation, validateProfileLinkLabel, validateProfileLinkUrl, validateProfileName } from './validation';
import { useAvatarSelection } from './useProfileOnboarding';
import { DEFAULT_PROFILE_LINK_ICON, MAX_PROFILE_LINKS, isProfileLinkAction, resolveProfileLinks, normalizeProfileLink } from './profileLinks';
import type { Id, Profile, ProfileLink, UpdateProfileInput } from '../../types/domain';

/**
 * Owner profile editing.
 *
 * Scope is set by the profile header, not by the data model: a creator writes
 * a name, a picture, and where else to find them. Everything else on the record
 * is either derived, system-generated, or not surfaced — the handle in
 * particular is not editable here.
 *
 * Still built on the shared foundations: the same validation module, the same
 * `useAsyncAction` lifecycle, and the same `ProfileService`.
 */
export type ProfileEditorFields = {
  name: string;
  location: string;
  isPrivate: boolean;
  showJourney: boolean;
  portfolioHeadline: string; school: string; availability: string; contactEmail: string; contactEmailPublic: boolean; allowPdfDownload: boolean;
  links: EditableProfileLink[];
};
export type EditableProfileLink = ProfileLink & { id: string };
export type ProfileLinkFieldError = { label?: string | null; href?: string | null };
export type ProfileEditorPhase = 'loading' | 'editing' | 'saving' | 'saved' | 'failed';
function fieldsFromProfile(profile: Profile): ProfileEditorFields {
  return {
    name: profile.name,
    location: profile.location ?? '',
    isPrivate: profile.isPrivate === true,
    showJourney: profile.showJourney === true,
    portfolioHeadline: profileHeadline(profile), school: profile.school ?? '', availability: profile.availability ?? '',
    contactEmail: profile.contactEmailPublic ? profile.contactEmail ?? '' : '', contactEmailPublic: profile.contactEmailPublic === true, allowPdfDownload: profile.allowPdfDownload !== false,
    links: resolveProfileLinks(profile.links, profile.socialLinks).map((link, index) => ({
      ...link,
      id: `profile-link-${index}`
    }))
  };
}

function persistentLinks(links: readonly EditableProfileLink[]): ProfileLink[] {
  return links.map(({ id: _id, ...link }) => normalizeProfileLink(link));
}
export function useProfileEditor(profileId: Id | null, isOpen: boolean) {
  const {
    profiles
  } = useServices();
  const {
    invalidateProfiles
  } = useProfileData();
  const [loadedProfile, setLoadedProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fields, setFields] = useState<ProfileEditorFields | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string | null;
    location?: string | null; portfolioHeadline?: string | null; school?: string | null; availability?: string | null; contactEmail?: string | null;
  }>({});
  const [linkErrors, setLinkErrors] = useState<Record<string, ProfileLinkFieldError>>({});
  /*
   * The profile picture is edited HERE, alongside the name it belongs with. Validation and previewing come from `useAvatarSelection`, so there is
   * one set of rules about what a picture may be rather than a second copy —
   * and the file rides along on the same save as every other field.
   */
  const avatar = useAvatarSelection();

  // The editor always opens on the current record, never a cached snapshot.
  useEffect(() => {
    if (!isOpen || !profileId) {
      return undefined;
    }
    let isCurrent = true;
    setLoadedProfile(null);
    setLoadError(null);
    profiles.getProfile(profileId).then((profile) => {
      if (!isCurrent) {
        return;
      }
      setLoadedProfile(profile);
      setFields(fieldsFromProfile(profile));
    }).catch((caught) => {
      if (isCurrent) {
        setLoadError(caught instanceof Error ? caught.message : 'Could not load your profile.');
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [isOpen, profileId, profiles]);

  // Closing resets everything, so the next open is never dirty by accident.
  useEffect(() => {
    if (!isOpen) {
      setFields(null);
      setLoadedProfile(null);
      setFieldErrors({});
      setLinkErrors({});
      avatar.clear();
    }
    // `avatar.clear` is stable; re-running on it would clear a chosen picture
    // the moment it is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  const setField = useCallback((key: 'name' | 'location' | 'portfolioHeadline' | 'school' | 'availability' | 'contactEmail', value: string) => {
    setFields((current) => current ? {
      ...current,
      [key]: value
    } : current);
    setFieldErrors((current) => ({
      ...current,
      [key]: null
    }));
  }, []);
  const setVisibility = useCallback((isPrivate: boolean) => {
    setFields((current) => current ? { ...current, isPrivate } : current);
  }, []);
  const setEmployerFlag = useCallback((key: 'contactEmailPublic' | 'allowPdfDownload', value: boolean) => { setFields(current => current ? {...current,[key]:value,...(key === 'contactEmailPublic' && !value ? {contactEmail:''} : {})} : current); }, []);
  const setShowJourney = useCallback((showJourney: boolean) => {
    setFields(current => current ? { ...current, showJourney } : current);
  }, []);
  const setProfileLink = useCallback((linkId: string, patch: Partial<Pick<EditableProfileLink, 'label' | 'href' | 'iconName' | 'hidden'>>) => {
    setFields((current) => current ? {
      ...current,
      links: current.links.map((link) => link.id === linkId ? { ...link, ...patch } : link)
    } : current);
    setLinkErrors((current) => ({
      ...current,
      [linkId]: {
        ...current[linkId],
        ...(patch.label !== undefined ? { label: null } : {}),
        ...(patch.href !== undefined ? { href: null } : {})
      }
    }));
  }, []);
  const addProfileLink = useCallback((): string | null => {
    if (!fields || fields.links.filter(link => !isProfileLinkAction(link.action)).length >= MAX_PROFILE_LINKS) return null;
    const id = `profile-link-new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    setFields({
      ...fields,
      links: [...fields.links, { id, label: '', href: '', iconName: DEFAULT_PROFILE_LINK_ICON }]
    });
    return id;
  }, [fields]);
  const removeProfileLink = useCallback((linkId: string) => {
    setFields((current) => current ? {
      ...current,
      links: current.links.flatMap((link) => link.id !== linkId ? [link] : isProfileLinkAction(link.action) ? [{ ...link, hidden: true }] : [])
    } : current);
    setLinkErrors((current) => {
      const next = { ...current };
      delete next[linkId];
      return next;
    });
  }, []);
  const moveProfileLink = useCallback((linkId: string, direction: -1 | 1) => {
    setFields((current) => {
      if (!current) return current;
      const index = current.links.findIndex((link) => link.id === linkId);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= current.links.length) return current;
      const links = [...current.links];
      [links[index], links[destination]] = [links[destination], links[index]];
      return { ...current, links };
    });
  }, []);
  const reorderProfileLinks = useCallback((linkIds: string[]) => {
    setFields((current) => {
      if (!current) return current;
      const byId = new Map(current.links.map((link) => [link.id, link]));
      const reordered = linkIds.map((id) => byId.get(id)).filter((link): link is EditableProfileLink => Boolean(link));
      const included = new Set(linkIds);
      const links = [...reordered, ...current.links.filter((link) => !included.has(link.id))];
      return { ...current, links };
    });
  }, []);
  const isDirty = useMemo(() => {
    if (!loadedProfile || !fields) {
      return false;
    }
    // A newly chosen picture is a change like any other.
    if (avatar.avatar) {
      return true;
    }
    const original = fieldsFromProfile(loadedProfile);
    if (fields.name.trim() !== original.name.trim()) {
      return true;
    }
    if (fields.location.trim() !== original.location.trim()) {
      return true;
    }
    if (fields.isPrivate !== original.isPrivate) {
      return true;
    }
    if (fields.showJourney !== original.showJourney) return true;
    if (['portfolioHeadline','school','availability','contactEmail','contactEmailPublic','allowPdfDownload'].some(key => fields[key as keyof ProfileEditorFields] !== original[key as keyof ProfileEditorFields])) return true;
    return JSON.stringify(persistentLinks(fields.links)) !== JSON.stringify(persistentLinks(original.links));
  }, [loadedProfile, fields, avatar.avatar]);
  const save = useAsyncAction(async (input: UpdateProfileInput) => {
    if (!profileId) {
      throw new Error('No profile to save.');
    }
    await profiles.updateProfile(profileId, input);
    // One invalidation, so every surface re-reads the canonical record.
    invalidateProfiles();
  });
  const resetSave = save.reset;
  useEffect(() => {
    if (!isOpen) {
      // Closing invalidates a pending completion as well as clearing the fields.
      // A response from the previous opening must never change the next one.
      resetSave();
    }
  }, [isOpen, resetSave]);
  const validate = useCallback(() => {
    if (!fields) {
      return false;
    }
    const nextErrors = {
      name: validateProfileName(fields.name),
      location: validateLocation(fields.location),
      portfolioHeadline: fields.portfolioHeadline.length > 80 ? 'Keep the headline to 80 characters.' : null,
      school: fields.school.length > 120 ? 'Keep school to 120 characters.' : null,
      availability: fields.availability.length > 120 ? 'Keep availability to 120 characters.' : null,
      contactEmail: fields.contactEmailPublic && !validContactEmail(fields.contactEmail.trim()) ? 'Enter the email you want to show publicly.' : null
    };
    const nextLinkErrors = Object.fromEntries(fields.links.map((link) => [link.id, {
      label: isProfileLinkAction(link.action) ? null : validateProfileLinkLabel(link.label),
      href: isProfileLinkAction(link.action) ? null : validateProfileLinkUrl(link.href)
    }]));
    setFieldErrors(nextErrors);
    setLinkErrors(nextLinkErrors);
    return !Object.values(nextErrors).some(Boolean) && !Object.values(nextLinkErrors).some((errors) => Boolean(errors.label || errors.href));
  }, [fields]);
  const submit = useCallback(async () => {
    if (!fields || !loadedProfile || !validate()) {
      return;
    }
    const original = fieldsFromProfile(loadedProfile);
    await save.run({
      ...(fields.portfolioHeadline !== original.portfolioHeadline ? {portfolioHeadline: fields.portfolioHeadline.trim()} : {}),
      ...(fields.school !== original.school ? {school: fields.school.trim()} : {}),
      ...(fields.availability !== original.availability ? {availability: fields.availability.trim()} : {}),
      ...(fields.allowPdfDownload !== original.allowPdfDownload ? {allowPdfDownload: fields.allowPdfDownload} : {}),
      ...(fields.contactEmailPublic !== original.contactEmailPublic || fields.contactEmail !== original.contactEmail ? {contactEmailPublic: fields.contactEmailPublic, contactEmail: fields.contactEmailPublic ? fields.contactEmail.trim() : ''} : {}),
      // Only edited fields are written: another tab or profile surface may
      // have saved newer values while this editor was open.
      ...(fields.name.trim() !== loadedProfile?.name.trim() ? { name: fields.name.trim() } : {}),
      ...(fields.location.trim() !== (loadedProfile?.location ?? '').trim() ? { location: fields.location.trim() } : {}),
      ...(fields.isPrivate !== (loadedProfile?.isPrivate === true) ? { isPrivate: fields.isPrivate } : {}),
      ...(fields.showJourney !== (loadedProfile?.showJourney === true) ? { showJourney: fields.showJourney } : {}),
      ...(JSON.stringify(persistentLinks(fields.links)) !== JSON.stringify(persistentLinks(fieldsFromProfile(loadedProfile).links)) ? {
        links: persistentLinks(fields.links),
        // Migrate legacy destinations only when the link list is edited.
        socialLinks: {},
      } : {}),
      // Sent only when one was actually chosen, so saving a name never quietly
      // rewrites the picture.
      ...(avatar.avatar ? {
        avatar: avatar.avatar
      } : {})
    });
  }, [fields, validate, save, avatar.avatar, loadedProfile]);
  const phase: ProfileEditorPhase = !loadedProfile ? 'loading' : save.isLoading ? 'saving' : save.status === 'success' ? 'saved' : save.status === 'error' ? 'failed' : 'editing';
  return {
    phase,
    loadError,
    profile: loadedProfile,
    fields,
    fieldErrors,
    linkErrors,
    setField,
    setVisibility,
    setShowJourney, setEmployerFlag,
    setProfileLink,
    addProfileLink,
    removeProfileLink,
    moveProfileLink,
    reorderProfileLinks,
    /** The profile picture: chosen, validated, and previewed locally. */
    avatar,
    isDirty,
    save,
    submit,
    canSave: Boolean(fields) && isDirty && !save.isLoading
  };
}
