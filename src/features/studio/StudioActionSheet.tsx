import React from 'react';
import { flushSync } from 'react-dom';
import { focusMobileContextButton } from '../../presentation/mobile/contextFocus';
import { MoreHorizontalIcon } from 'lucide-react';
import { MobileActionSheet } from '../../components/messages/MobileActionSheet';
import type { StudioRowAction } from './StudioRow';
export function StudioActionSheet({ title, actions, onClose }: { title: string; actions: StudioRowAction[]; onClose: () => void }) {
  const available = actions.filter(action => !action.disabled).slice(0, 8).map(action => ({ ...action, icon: action.icon ?? MoreHorizontalIcon, run: action.onAction }));
  const normal = available.filter(action => !action.destructive), destructive = available.filter(action => action.destructive);
  const close = () => { flushSync(onClose); focusMobileContextButton(); };
  return <MobileActionSheet model={{ title, primary: normal.slice(0, 3), groups: [normal.slice(3), destructive].filter(group => group.length) }} onClose={close} onAction={action => { close(); action.run(); }} />;
}
