import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
test('mobile portfolio sharing is an inline screen with Back; WEB keeps its modal and focus trap', () => {
  for (const presentation of ['mobile', 'web']) {
    let closed = 0, trapped;
    const { ProfileShareDialog } = sourceModule('src/features/sharing/ProfileShareDialog.tsx', {
      react: { ...React, useEffect() {}, useId: () => 'share', useRef: current => ({ current }), useState: value => [typeof value === 'function' ? value() : value, () => {}] },
      '../../presentation/mobile/MobileBackNavigation': { ScreenBack: 'screen-back' },
      '../../contexts/ProfileDataContext': { useProfileData: () => ({ invalidateProfiles() {} }) },
      '../../contexts/ServicesContext': { useServices: () => ({ profiles: {} }) },
      '../../presentation/usePresentation': { usePresentation: () => presentation },
      '../../hooks/useModalFocus': { useModalFocus: enabled => { trapped = enabled; } },
      '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: null }) },
      '../../components/ui/ModalPortal': { ModalPortal: 'modal-portal' },
      '../../components/ui/Button': { Button: 'button' },
      '../../utils/copyPublicLink': {}, './PortfolioPreview': { PortfolioPreview: 'preview' },
      './shareModel': { handleSuggestions: () => ['creator'], portfolioPath: () => '/share/creator', audienceNote: () => '' },
      '../publishing/firstProject': {}, './sharing.css': {}, 'lean-qr': {},
      'lucide-react': { ArrowLeftIcon: 'back-icon', XIcon: 'close-icon', CopyIcon: 'copy-icon', SendIcon: 'send-icon', DownloadIcon: 'download-icon' },
    }, { React, window: { location: { origin: 'https://example.invalid', host: 'example.invalid' } }, navigator: {} });
    const tree = ProfileShareDialog({ profile: { id: 'creator', name: 'Creator' }, owner: true, onClose: () => closed++ });
    const all = nodes(tree);
    assert.equal(trapped, presentation === 'web');
    assert.equal(tree.type === 'modal-portal', presentation === 'web');
    const surface = all.find(node => node.props.role === (presentation === 'mobile' ? 'region' : 'dialog'));
    assert.equal(surface.props['aria-modal'], presentation === 'web' ? true : undefined);
    const back = all.find(node => node.props['aria-label'] === 'Back');
    assert.equal(Boolean(back), presentation === 'mobile');
    assert.equal(all.some(node => node.props['aria-label'] === 'Close share'), presentation === 'web');
    if (back) { back.props.onClick(); assert.equal(closed, 1); }
  }
});
