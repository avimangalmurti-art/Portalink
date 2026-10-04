import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
test('mobile portfolio sharing is an inline screen with Back; WEB keeps its modal and focus trap', () => {
  for (const presentation of ['mobile', 'web']) {
    let closed = 0, trapped; const updates = [];
    const { ProfileShareDialog } = sourceModule('src/features/sharing/ProfileShareDialog.tsx', {
      react: { ...React, useEffect() {}, useId: () => 'share', useRef: current => ({ current }), useState: value => [typeof value === 'function' ? value() : value, next => updates.push(next)] },
      '../../presentation/mobile/MobileBackNavigation': { ScreenBack: 'screen-back' },
      '../../contexts/ProfileDataContext': { useProfileData: () => ({ invalidateProfiles() {} }) },
      '../../contexts/ServicesContext': { useServices: () => ({ profiles: {} }) },
      '../../presentation/usePresentation': { usePresentation: () => presentation },
      '../../hooks/useModalFocus': { useModalFocus: enabled => { trapped = enabled; } },
      '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: null }) },
      '../../components/ui/ModalPortal': { ModalPortal: 'modal-portal' },
      '../../components/ui/Button': { Button: 'button' },
      '../../utils/copyPublicLink': {}, '../../components/profile/CreatorAvatar': { CreatorAvatar: 'avatar' }, './PortfolioPreview': { PortfolioPreview: 'preview' },
      './shareModel': { normalizePublicHandle: value => (value ?? '').trim().toLowerCase(), validHandle: () => true, handleSuggestions: () => ['creator'], portfolioPath: () => '/share/creator', audienceNote: () => '' },
      '../publishing/firstProject': {}, './usePortfolioAddressValidation': { usePortfolioAddressValidation: () => ({status:'current', message:'Current'}) }, './PortfolioNoteComposer': {PortfolioNoteComposer: 'note-composer'}, './PortfolioQrScreen': {PortfolioQrScreen: 'qr-screen'}, './portfolioQr': {}, './PortfolioSharePreview': {PortfolioSharePreview: 'identity-preview', PortfolioPreviewBoundary: 'preview-boundary'}, './sharing.css': {}, 'lean-qr': {},
      'lucide-react': { ArrowLeftIcon: 'back-icon', XIcon: 'close-icon', CopyIcon: 'copy-icon', SendIcon: 'send-icon', DownloadIcon: 'download-icon', PencilIcon: 'pencil', QrCodeIcon: 'qr', GlobeIcon: 'globe', CheckIcon: 'check', LinkIcon: 'link' },
    }, { React, window: { location: { origin: 'https://example.invalid', host: 'example.invalid' } }, navigator: { share() { throw new Error('Native share must not open on mobile'); } } });
    const tree = ProfileShareDialog({ profile: { id: 'creator', name: 'Creator', location: 'Existing city', avatar: 'existing-photo', projects: [{id:'a'},{id:'b'}], categories: [{id:'portal'}], showJourney: true }, counts: {followers:'9', following:null}, owner: true, onClose: () => closed++ });
    const all = nodes(tree);
    assert.equal(trapped, presentation === 'web');
    assert.equal(tree.type === 'modal-portal', presentation === 'web');
    const surface = all.find(node => node.props.role === (presentation === 'mobile' ? 'region' : 'dialog'));
    assert.equal(surface.props['aria-modal'], presentation === 'web' ? true : undefined);
    const back = all.find(node => node.props['aria-label'] === 'Back');
    assert.equal(Boolean(back), presentation === 'mobile');
    assert.equal(all.some(node => node.props['aria-label'] === 'Close share'), presentation === 'web');
    if (presentation === 'mobile') {
      const text = all.flatMap(node => React.Children.toArray(node.props.children).filter(child => typeof child === 'string'));
      for (const action of ['Copy link', 'Send to someone', 'Write a personal note', 'View QR code']) assert.ok(text.includes(action) || (action === 'Copy link' && all.some(node=>node.props['aria-live']==='polite')));
      assert.equal(all.find(node=>node.type==='identity-preview').props.profile.location,'Existing city');
      assert.ok(!text.includes('Loading your public preview�'));
      assert.ok(!all.some(node=>node.type==='preview'));
      assert.equal(all.find(node=>node.type==='identity-preview').props.profile.avatar, 'existing-photo');
      assert.ok(!all.some(node=>node.type==='canvas'));
      const send = all.find(node => node.type === 'button' && React.Children.toArray(node.props.children).includes('Send to someone'));
      send.props.onClick(); assert.ok(updates.includes('send')); assert.ok(updates.includes(false));
    }
    if (back) { back.props.onClick(); assert.equal(closed, 1); }
  }
});
