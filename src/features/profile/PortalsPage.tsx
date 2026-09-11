import React from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { ProfileQuery } from '../../contexts/ProfileDataContext';
import type { ProfileOnboardingStatus } from '../../types/profile';
import { usePresentation } from '../../presentation/usePresentation';
import { FeatureInDesignPage } from '../../components/FeatureInDesignPage';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon';
import { getCategoryIcon } from '../../components/profile/categoryIcons';

/** Mobile drill-down using the account's confirmed profile and canonical portals. */
export function PortalsPage({ profileQuery, onboardingStatus, onContinue, onSelectCategory, onBack }: {
  profileQuery: ProfileQuery;
  onboardingStatus: ProfileOnboardingStatus;
  onContinue: () => void;
  onSelectCategory: (categoryId: string) => void;
  onBack: () => void;
}) {
  const presentation = usePresentation();
  const auth = useAuth();
  if (presentation === 'web') return <FeatureInDesignPage feature="Portals" onBack={onBack} />;

  const { profile, status, retry } = profileQuery;
  let content: React.ReactNode;
  if (auth.isInitializing || auth.phase === 'authenticating' || auth.phase === 'signing-out') {
    content = <LoadingState label="Loading portals" />;
  } else if (!auth.isAuthenticated) {
    content = <EmptyState title="Your portals" action={{ label: 'Sign in', onClick: onContinue }} />;
  } else if (onboardingStatus === 'required') {
    content = <EmptyState title="Create your profile" action={{ label: 'Continue', onClick: onContinue }} />;
  } else if (!auth.viewerProfileId) {
    content = <EmptyState title="Verify your email to continue" />;
  } else if (status === 'idle' || status === 'loading') {
    content = <LoadingState label="Loading portals" />;
  } else if (status === 'error') {
    content = <ErrorState title="Couldn’t load your portals" onRetry={retry} />;
  } else if (!profile || profile.id !== auth.viewerProfileId || status === 'not-found') {
    content = <ErrorState title="Your profile isn’t available" onRetry={retry} />;
  } else if (profile.categories.length === 0) {
    content = <EmptyState title="No portals yet" />;
  } else {
    content = <ul className="mobile-portals-list" aria-label="Your portals">
      {profile.categories.map(category => <li key={category.id}>
        <button type="button" className="mobile-portal-row" onClick={() => onSelectCategory(category.id)}>
          <InterfaceIcon icon={getCategoryIcon(category.iconName)} size="lg" weight="medium" />
          <span className="mobile-portal-label">{category.label}</span>
          <InterfaceIcon icon={ChevronRightIcon} size="sm" className="text-[var(--text-tertiary)]" />
        </button>
      </li>)}
    </ul>;
  }

  return <section className="mobile-portals-page" aria-labelledby="mobile-portals-title">
    <header data-mobile-safe-header="" className="global-control-header shrink-0 px-4">
      <h1 id="mobile-portals-title" className="text-[20px] font-semibold">Portals</h1>
    </header>
    <div className="mobile-portals-scroll scrollbar-overlay" data-mobile-scroll-end="">{content}</div>
  </section>;
}
