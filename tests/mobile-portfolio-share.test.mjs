import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { sourceModule } from './helpers/source-module.mjs';

const nodes = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(nodes)] : [];
const textContent = node => React.isValidElement(node) ? React.Children.toArray(node.props.children).map(textContent).join('') : String(node ?? '');
const model = sourceModule('src/features/sharing/shareModel.ts');

function sharingFixture(presentation, screen = 'share') {
  let state = 0;
  const calls = [], location = { origin: 'https://old-preview.test', host: 'old-preview.test', href: 'https://old-preview.test/' };
  const { ProfileShareDialog } = sourceModule('src/features/sharing/ProfileShareDialog.tsx', {
    '../citations/publicOrigin': { PUBLIC_ORIGIN: 'https://portalinknetworks.com' },
    react: { ...React, useEffect() {}, useId: () => 'share', useRef: current => ({ current }), useState(value) {
      const index = state++;
      return [index === 0 ? {handle:'mira',available:true,confirmed:true} : index === 1 ? screen : typeof value === 'function' ? value() : value, () => {}];
    } },
    '../../presentation/mobile/MobileBackNavigation': { ScreenBack: 'screen-back' },
    '../../contexts/ProfileDataContext': { useProfileData: () => ({ invalidateProfiles() {} }) },
    '../../contexts/ServicesContext': { useServices: () => ({ profiles: {} }) },
    '../../presentation/usePresentation': { usePresentation: () => presentation },
    '../../hooks/useModalFocus': { useModalFocus() {} }, '../../hooks/useDialogViewport': { useDialogViewport: () => ({ current: null }) },
    '../../components/ui/ModalPortal': { ModalPortal: 'modal-portal' }, '../../components/ui/Button': { Button: 'button' },
    '../../utils/copyPublicLink': { copyPublicLink: async url => calls.push(['copy', url]) },
    '../../components/profile/CreatorAvatar': { CreatorAvatar: 'avatar' }, './PortfolioPreview': { PortfolioPreview: 'preview' },
    './shareModel': model, '../publishing/firstProject': {},
    './usePortfolioAddressValidation': { usePortfolioAddressValidation: () => ({status:'current',message:'Current'}) },
    './PortfolioNoteComposer': {PortfolioNoteComposer: 'note-composer'}, './PortfolioQrScreen': {PortfolioQrScreen: 'qr-screen'},
    './portfolioQr': {createPortfolioQrImage: url => {calls.push(['qr',url]);return {toBlob: done => done(new Blob(['qr'],{type:'image/png'}))};}},
    './PortfolioSharePreview': {PortfolioSharePreview: 'identity-preview', PortfolioPreviewBoundary: 'preview-boundary'}, './sharing.css': {}, 'lean-qr': {},
    'lucide-react': new Proxy({}, {get:(_target,key)=>key}),
  }, {React,window:{location},navigator:{},DOMException,setTimeout:callback=>{callback();return 1;},document:{createElement:()=>({click(){calls.push(['download']);}})}});
  const tree = ProfileShareDialog({profile:{id:'creator',name:'Mira',location:'City',projects:[],categories:[]},owner:false,onClose(){}});
  return {all:nodes(tree),calls,location};
}

test('portfolio sharing shows, copies, downloads QR and composes email with the official host on both presentations', async () => {
  for (const presentation of ['mobile','web']) {
    const share = sharingFixture(presentation);
    const text = share.all.flatMap(node => React.Children.toArray(node.props.children).filter(child => typeof child === 'string')).join(' ');
    assert.ok(text.includes('portalinknetworks.com/mira'));
    assert.ok(!text.includes('old-preview.test'));
    const copy = share.all.find(node => node.type === 'button' && textContent(node) === 'Copy link');
    copy.props.onClick(); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(share.calls, [['copy','https://portalinknetworks.com/mira']]);
    const handle = sharingFixture(presentation, 'handle');
    const prefix = handle.all.find(node => node.type === 'div' && ['share-handle-editor','handle-field'].includes(node.props.className));
    assert.equal(nodes(prefix).find(node => node.type === 'span').props.children[0], 'portalinknetworks.com');
    const qr = sharingFixture(presentation, presentation === 'mobile' ? 'qr' : 'share');
    if (presentation === 'mobile') {
      const screen = qr.all.find(node => node.type === 'qr-screen');
      assert.equal(screen.props.url,'https://portalinknetworks.com/mira');screen.props.onSave();
    } else qr.all.find(node => node.type === 'button' && textContent(node) === 'Save QR').props.onClick();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(qr.calls,[['qr','https://portalinknetworks.com/mira'],['download']]);
    const mail = sharingFixture(presentation, 'send');
    if (presentation === 'mobile') assert.equal(mail.all.find(node => node.type === 'note-composer').props.url,'https://portalinknetworks.com/mira');
    else {
      mail.all.find(node => node.type === 'button' && node.props.children === 'Open in Mail').props.onClick();
      await new Promise(resolve => setImmediate(resolve));
      assert.match(new URL(mail.location.href).searchParams.get('body'),/https:\/\/portalinknetworks\.com\/mira\?via=[a-z0-9]{8}/);
    }
  }
});

test('mobile portfolio sharing is an inline screen with Back; WEB keeps its modal and focus trap', () => {
  for (const presentation of ['mobile', 'web']) {
    let closed = 0, trapped; const updates = [];
    const { ProfileShareDialog } = sourceModule('src/features/sharing/ProfileShareDialog.tsx', {
      '../citations/publicOrigin': { PUBLIC_ORIGIN: 'https://portalinknetworks.com' },
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
