import { sourceModule } from './source-module.mjs';

const publicOrigin = sourceModule('src/features/citations/publicOrigin.ts');
export const officialAuthOrigin = publicOrigin.PUBLIC_ORIGIN;
export const authReturnOriginFixture = sourceModule('src/utils/authReturnOrigin.ts', {
  '../features/citations/publicOrigin': publicOrigin,
});
