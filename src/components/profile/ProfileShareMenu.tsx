import { ShareIcon } from 'lucide-react';
import { InterfaceIcon } from '../ui/InterfaceIcon';
export function ProfileShareMenu({ onOpen, compact = false }: { onOpen: () => void; compact?: boolean }) {
  return <button type="button" data-semantic-action="share" aria-label="Share catalogue" aria-haspopup="dialog" onClick={onOpen} className="profile-action-button side-panel-primary-control side-panel-control-row px-3 text-[11px] font-semibold border border-[var(--hairline-strong)] text-[var(--text-primary)]"><InterfaceIcon icon={ShareIcon} size="sm"/><span className={compact ? 'sr-only' : undefined}>Share catalogue</span></button>;
}
