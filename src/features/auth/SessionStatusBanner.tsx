import React from 'react';
import { AlertCircleIcon, UserPlusIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';

/**
 * The two session conditions that are not a form, and so have nowhere else to
 * be said:
 *
 * 1. The session could not be read at all. This is neither signed in nor signed
 *    out — it is unknown — so it is stated as such and offers a re-read rather
 *    than silently presenting the product as signed out.
 * 2. The account exists but owns no creator profile yet. An authenticated
 *    account is not a creator, and the difference must be visible rather than
 *    looking identical to a visitor.
 *
 * Nothing here talks to a service: both conditions are derived state from the
 * one session source of truth.
 */
export function SessionStatusBanner({
  onCreateProfile


}: {onCreateProfile: () => void;}) {
  const auth = useAuth();
  if (auth.isSessionUnavailable) {
    return <div role="alert" className="flex items-start gap-2 border-b border-[var(--hairline-strong)] bg-[var(--surface-sunken)] px-[var(--content-gutter)] py-2.5 text-[13px] leading-relaxed text-[var(--text-primary)]">
        <AlertCircleIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          {auth.error?.message ?? 'Your session could not be checked.'} Until it can be read, you are browsing as a visitor.
        </span>
        <Button size="sm" onClick={auth.retryInitialize}>Check again</Button>
      </div>;
  }
  if (auth.needsProfileSetup) {
    return <div role="status" className="flex items-start gap-2 border-b border-[var(--hairline-strong)] bg-[var(--surface-sunken)] px-[var(--content-gutter)] py-2.5 text-[13px] leading-relaxed text-[var(--text-primary)]">
        <UserPlusIcon className="mt-[2px] h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          You are signed in as <span className="font-semibold">{auth.user?.email}</span>, but you do not have a creator profile yet.
        </span>
        <Button size="sm" variant="primary" onClick={onCreateProfile}>Create profile</Button>
      </div>;
  }
  return null;
}