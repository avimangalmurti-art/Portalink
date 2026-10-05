import React, { useRef, useState } from 'react';
import { ProjectFormDialog } from '../../components/publishing/ProjectFormDialog';
import { ProfileField } from '../../components/profile/ProfileField';
import { Button } from '../../components/ui/Button';
import { MAX_CATEGORY_LABEL, validateCategoryLabel } from '../profile/useCategoryManagement';
import { useTouchTap } from '../../hooks/useTouchTap';
import { handleRadioGroupKeyDown } from '../../utils/radioGroupKeyboard';
import type { PortfolioCategory } from '../../types/domain';

/** Choose the canonical destination before a project draft or upload starts. */
export function ProjectPortalChoice({ categories, preferredId, onChoose, onCreate, onClose }: {
  categories: PortfolioCategory[];
  preferredId?: string | null;
  onChoose: (id: string) => void;
  onCreate: (name: string) => Promise<PortfolioCategory | null>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'existing' | 'new'>(categories.length ? 'existing' : 'new');
  const [selected, setSelected] = useState(categories.find(category => category.id === preferredId)?.id ?? categories[0]?.id ?? '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const existingTap = useTouchTap(() => { setMode('existing'); setError(''); }, !busy && categories.length > 0);
  const newTap = useTouchTap(() => { setMode('new'); setError(''); }, !busy);
  const selectedId = categories.some(category => category.id === selected) ? selected : categories[0]?.id ?? '';
  async function submit() {
    if (pending.current) return;
    if (mode === 'existing') {
      if (categories.some(category => category.id === selectedId)) onChoose(selectedId);
      return;
    }
    const invalid = validateCategoryLabel(name, categories, null);
    if (invalid) { setError(invalid); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      const portal = await onCreate(name.trim());
      if (portal) onChoose(portal.id);
      else setError('Could not create your portal. Please try again.');
    } catch { setError('Could not create your portal. Please try again.'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <ProjectFormDialog mobileFlow topLayer title="Choose a portal" titleId="project-portal-title" description="Where would you like to add your new project?" onClose={onClose} closeDisabled={busy}>
    <form className="project-form-content mobile-publish-flow" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className="mobile-publish-body project-form-fields">
        <fieldset disabled={busy} className="space-y-3"><legend className="sr-only">Portal destination</legend>
          <div role="radiogroup" aria-label="Portal destination" onKeyDown={handleRadioGroupKeyDown} className="space-y-3">
            {(['existing','new'] as const).map(value => <button key={value} {...(value === 'existing' ? existingTap : newTap)} type="button" role="radio" aria-checked={mode === value} tabIndex={mode === value ? 0 : -1} disabled={busy || (value === 'existing' && !categories.length)} className="portal-choice-option" onClick={() => { setMode(value); setError(''); }}>
              <span className="portal-choice-indicator" aria-hidden="true" />{value === 'existing' ? 'Add to an existing portal' : 'Create a new portal'}
            </button>)}
          </div>
        </fieldset>
        {mode === 'existing' ? <label className="flex flex-col gap-2">Portal<select className="min-h-[44px] rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--surface-raised)] p-3" value={selectedId} disabled={busy} onChange={event => setSelected(event.target.value)}>{categories.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
          : <ProfileField id="new-project-portal-name" label="Portal name" required value={name} maxLength={MAX_CATEGORY_LABEL} disabled={busy} placeholder="Name your portal" onChange={value => { setName(value); setError(''); }} />}
        {error && <p role="alert">{error}</p>}
      </div>
      <footer className="mobile-publish-actions"><Button type="button" onClick={() => { void submit(); }} variant="primary" size="lg" fullWidth isLoading={busy} disabled={busy || (mode === 'existing' ? !selectedId : !name.trim())}>{mode === 'new' ? 'Create portal and continue' : 'Continue'}</Button></footer>
    </form>
  </ProjectFormDialog>;
}
