import { SavedChangeNotice } from '../../components/ui/SavedChangeNotice';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, XIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { ProfileQuery } from '../../contexts/ProfileDataContext';
import type { ProfileOnboardingStatus } from '../../types/profile';
import { usePresentation } from '../../presentation/usePresentation';
import { FeatureInDesignPage } from '../../components/FeatureInDesignPage';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { getCategoryIcon } from '../../components/profile/categoryIcons';
import { CategoryOptionsMenu } from '../../components/profile/CategoryOptionsMenu';
import { NewCategoryDialog } from '../../components/profile/NewCategoryDialog';
import { MAX_CATEGORY_LABEL, type CategoryManagement } from './useCategoryManagement';
import { MobileReorderList } from '../../presentation/mobile/MobileReorderList';

/** Mobile drill-down using the confirmed profile and canonical portals. */
export function PortalsPage({ profileQuery, profileContext = false, onboardingStatus, management, accentColor, theme, onChangeCategoryIcon, onContinue, onSelectCategory, onBack }: {
  profileQuery: ProfileQuery;
  /** App has resolved access to the profile being viewed; /portals remains account-only. */
  profileContext?: boolean;
  onboardingStatus: ProfileOnboardingStatus;
  management: CategoryManagement;
  accentColor: string;
  theme: 'light' | 'dark';
  onChangeCategoryIcon: (categoryId: string) => void;
  onContinue: () => void;
  onSelectCategory: (categoryId: string) => void;
  onBack: () => void;
}) {
  const presentation = usePresentation();
  const auth = useAuth();
  const [isAdding, setIsAdding] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const { profile, status, retry } = profileQuery;
  const ownsProfile = auth.isAuthenticated && !auth.isInitializing && auth.phase !== 'authenticating' && auth.phase !== 'signing-out'
    && profile?.id === auth.viewerProfileId && (status === 'ready' || status === 'loading');
  const categories = useMemo(() => {
    const confirmed = profileQuery.profile?.categories ?? [];
    if (!ownsProfile) return confirmed;
    const order = management.arrangement?.categoryOrder ?? [];
    const hidden = management.arrangement?.hiddenCategoryIds ?? [];
    const ranked = order.flatMap(id => confirmed.find(category => category.id === id) ?? []);
    const all = [...ranked, ...confirmed.filter(category => !order.includes(category.id))];
    return [...all.filter(category => !hidden.includes(category.id)), ...all.filter(category => hidden.includes(category.id))];
  }, [profileQuery.profile, management.arrangement, ownsProfile]);
  if (presentation === 'web') return <FeatureInDesignPage feature="Portals" onBack={onBack} />;

  const actionsDisabled = Boolean(management.pending) || management.isLoadingArrangement || Boolean(management.arrangementError) || !management.arrangement;
  async function createPortal(label: string, iconName: string) {
    if (!ownsProfile || actionsDisabled) return;
    const created = await management.createCategory(label, iconName);
    if (created && active.current) { setIsAdding(false); onSelectCategory(created.id); }
  }
  async function saveRename() {
    if (!ownsProfile || !renaming || actionsDisabled) return;
    if (await management.renameCategory(renaming.id, renaming.label)) setRenaming(null);
  }
  let content: React.ReactNode;
  if (auth.isInitializing || auth.phase === 'authenticating' || auth.phase === 'signing-out') {
    content = <LoadingState label="Loading portals" />;
  } else if (!profileContext && !auth.isAuthenticated) {
    content = <EmptyState title="Your portals" action={{ label: 'Sign in', onClick: onContinue }} />;
  } else if (!profileContext && onboardingStatus === 'required') {
    content = <EmptyState title="Create your profile" action={{ label: 'Continue', onClick: onContinue }} />;
  } else if (!profileContext && !auth.viewerProfileId) {
    content = <EmptyState title="Verify your email to continue" />;
  } else if (status === 'idle' || (status === 'loading' && !profile)) {
    content = <LoadingState label="Loading portals" />;
  } else if (status === 'error') {
    content = <ErrorState title={profileContext ? 'Couldn’t load portals' : 'Couldn’t load your portals'} onRetry={retry} />;
  } else if (!profile || (!profileContext && profile.id !== auth.viewerProfileId) || status === 'not-found') {
    content = <ErrorState title={profileContext ? 'This profile isn’t available' : 'Your profile isn’t available'} onRetry={retry} />;
  } else if (profile.categories.length === 0) {
    content = <EmptyState title="No portals yet" />;
  } else {
    content = <MobileReorderList items={categories} label={ownsProfile ? 'Your portals' : `${profile.name} portals`} className="mobile-portals-list" itemClassName="mobile-portal-item"
      disabled={!ownsProfile || actionsDisabled || Boolean(renaming) || isAdding}
      groupForItem={category => ownsProfile && management.arrangement?.hiddenCategoryIds.includes(category.id) ? 'hidden' : 'visible'}
      onReorder={reordered => { if (ownsProfile && !actionsDisabled) void management.reorderCategories(reordered.map(category => category.id)); }}
      renderItem={(category, activator, actions) => <>
        {ownsProfile && renaming?.id === category.id ? <form className="mobile-portal-rename" onSubmit={event => { event.preventDefault(); void saveRename(); }} onKeyDown={event => { if (event.key === 'Escape' && !management.pending) setRenaming(null); }}>
          <input autoFocus aria-label={`Rename ${category.label}`} maxLength={MAX_CATEGORY_LABEL} disabled={Boolean(management.pending)} value={renaming.label} onChange={event => setRenaming({ id: category.id, label: event.target.value })} className="text-control min-w-0 flex-1 px-2 py-2" />
          <button type="submit" disabled={actionsDisabled || !renaming.label.trim()} aria-label="Save portal name" className="mobile-portal-action"><InterfaceIcon icon={CheckIcon} /></button>
          <button type="button" disabled={Boolean(management.pending)} aria-label="Cancel rename" onClick={() => setRenaming(null)} className="mobile-portal-action"><InterfaceIcon icon={XIcon} /></button>
        </form> : <>
        <button {...activator} type="button" className="mobile-portal-row" data-hidden={(ownsProfile && management.arrangement?.hiddenCategoryIds.includes(category.id)) || undefined} onClick={() => onSelectCategory(category.id)}>
          <InterfaceIcon icon={getCategoryIcon((ownsProfile ? management.categoryIcons[category.id] : undefined) ?? category.iconName)} size="lg" weight="medium" />
          <span className="mobile-portal-label">{category.label}</span>
          <InterfaceIcon icon={ChevronRightIcon} size="sm" className="text-[var(--text-tertiary)]" />
        </button>
        {ownsProfile && <CategoryOptionsMenu mobile onMoveUp={actions.moveUp} onMoveDown={actions.moveDown} category={category} accentColor={accentColor} theme={theme} disabled={actionsDisabled}
          isHidden={management.arrangement?.hiddenCategoryIds.includes(category.id)} isBusy={management.pending?.categoryId === category.id}
          readDeletionCapability={() => management.readDeletionCapability(category.id)} onHideToggle={() => void management.toggleCategoryHidden(category.id)}
          onRenameStart={() => { management.dismissFailure(); setRenaming({ id: category.id, label: category.label }); }}
          onChangeIcon={() => onChangeCategoryIcon(category.id)} onDelete={() => management.deleteCategory(category.id)} />}
        </>}
      </>} />;
  }

  return <section data-saved-change-scope="" className="mobile-portals-page" aria-labelledby="mobile-portals-title">
    <header data-mobile-safe-header="" className="global-control-header shrink-0 gap-2 px-4">
      <button type="button" aria-label="Go back" title="Go back" className="mobile-portal-action" onClick={onBack}><InterfaceIcon icon={ChevronLeftIcon} size="lg" weight="medium" mirroredInRtl /></button>
      <h1 id="mobile-portals-title" className="min-w-0 flex-1 truncate text-[20px] font-semibold">Portals</h1>
      {ownsProfile && <button type="button" aria-label="Add portal" aria-haspopup="dialog" disabled={actionsDisabled} className="mobile-portal-action" onClick={() => { management.dismissFailure(); setIsAdding(true); }}><InterfaceIcon icon={PlusIcon} size="lg" weight="medium" /></button>}
    </header>
    <div className="mobile-portals-scroll scrollbar-overlay" data-mobile-scroll-end="">
      {ownsProfile && management.arrangementError && <ErrorState title="Couldn’t load portal settings" description={management.arrangementError} onRetry={management.reloadArrangement} />}
      {ownsProfile && management.failure && !isAdding && <ErrorState title={management.failure.message} onRetry={renaming && management.failure.kind === 'rename' ? () => void saveRename() : management.failure.retry} />}
      {ownsProfile && <SavedChangeNotice history={management.history} />}
      {content}
    </div>
    {ownsProfile && isAdding && <NewCategoryDialog itemName="portal" isSaving={management.pending?.kind === 'create'} error={management.failure?.kind === 'create' ? management.failure.message : null}
      onCancel={() => { setIsAdding(false); management.dismissFailure(); }} onCreate={(label, iconName) => void createPortal(label, iconName)} />}
  </section>;
}
