/** Screen code can load alongside authentication/data without starting private reads. */
function screenLoader<T>(read: () => Promise<T>) {
  let pending: Promise<T> | undefined;
  return () => pending ??= read().catch(error => { pending = undefined; throw error; });
}

export const loadMessagesPage = screenLoader(() => import('../components/MessagesPage').then(module => ({ default: module.MessagesPage })));
export const loadStudioPage = screenLoader(() => import('../features/studio/StudioPage').then(module => ({ default: module.StudioPage })));
export const loadSearchPage = screenLoader(() => import('../components/SearchBrowsePage').then(module => ({ default: module.SearchBrowsePage })));
export const loadPortalSearchPage = screenLoader(() => import('../features/portals/PublicPortalSearchPage').then(module => ({ default: module.PublicPortalSearchPage })));
export const loadSettingsPage = screenLoader(() => import('../components/ControlCenterPage').then(module => ({ default: module.ControlCenterPage })));
export const loadProfilePage = screenLoader(() => import('../components/UserProfilePage').then(module => ({ default: module.UserProfilePage })));
export const loadCategoryPage = screenLoader(() => import('../components/profile/ProfileCategoryPage').then(module => ({ default: module.ProfileCategoryPage })));
export const loadProfileEditorPage = screenLoader(() => import('../features/profile/ProfileEditorDialog').then(module => ({ default: module.ProfileEditorPage })));
export const loadVisitorProjectPage = screenLoader(() => import('../visitor/VisitorProjectPage').then(module => ({ default: module.VisitorProjectPage })));

export function warmScreenForPath(path: string) {
  if (path.startsWith('/messages')) return Promise.allSettled([loadMessagesPage()]);
  if (path === '/studio' || path === '/saved') return Promise.allSettled([loadStudioPage()]);
  if (path === '/portal-search') return Promise.allSettled([loadPortalSearchPage()]);
  if (path === '/settings' || path === '/control-center' || path === '/appearance') return Promise.allSettled([loadSettingsPage()]);
  if (/^\/(search|discover|portalink)(?:\/|$)/.test(path)) return Promise.allSettled([loadSearchPage()]);
  if (path === '/profile/edit') return Promise.allSettled([loadProfileEditorPage()]);
  if (/^\/p\/[^/]+\/socal\/?(?:[?#]|$)/.test(path)) return Promise.allSettled([loadPortalSearchPage()]);
  if (/^\/(p|share)\//.test(path)) return Promise.allSettled([loadProfilePage(), ...(/\/c\//.test(path) ? [loadCategoryPage()] : [])]);
  return Promise.resolve([]);
}

/** Independent downloads start together; a failed screen cannot block the others. */
export function warmCommonScreens() {
  return Promise.allSettled([loadProfilePage(), loadMessagesPage(), loadStudioPage(), loadSettingsPage()]);
}
