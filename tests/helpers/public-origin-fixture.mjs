import { sourceModule } from './source-module.mjs';

export const officialOrigin = 'https://portalinknetworks.com';
export const publicOriginFixture = { PUBLIC_ORIGIN: officialOrigin };
export const publicRedirectFixture = sourceModule('src/server/publicOriginRedirect.ts', {
  '../features/citations/publicOrigin': publicOriginFixture,
  '../features/sharing/shareModel': sourceModule('src/features/sharing/shareModel.ts'),
}, { Response });
