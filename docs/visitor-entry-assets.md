# Visitor entry asset measurements

Source-only ALL-platform change, September 30, 2026. These are emitted local production-build assets, not live Sites 273 network measurements. Baseline is the existing build at the start of this task, source checkpoint `2c51e0b`, after the stored-cover task. The baseline used the main entry for shared URLs. Its earlier live waterfall is a separate measurement.

Run `npm.cmd run build`, then `node.exe scripts/measure-entry-assets.mjs`. The script follows HTML module scripts/modulepreloads and every static import recursively; dynamic feature chunks, HTML, images, fonts, data and worker entry are separate. Gzip is computed per file locally and does not establish a hosted transfer size.

| Entry | Initial JS bytes | Local gzip JS | Initial CSS bytes | Local gzip CSS | JS chunks |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before: main and /share/* | 988,799 | 304,054 | 317,685 | 50,535 | 31 |
| After: main | 991,959 | 313,265 | 317,790 | 50,558 | 31 |
| After: /share/* | 761,995 | 242,215 | 321,570 | 51,551 | 14 |

The visitor removes 226,804 raw initial JS bytes (22.9%) versus the local baseline. Main changes by +3,160 raw bytes. **The ≤350,000-byte raw JS target is missed by 411,995 bytes.** See [shared-profile-first-paint.md](shared-profile-first-paint.md) for retained SDK, motion, router, icon and fallback dependencies. Shared CSS intentionally retains the existing presentation system.

## Before: main/shared initial graph

| Asset | Raw bytes | Local gzip bytes |
| --- | ---: | ---: |
| `assets/InterfaceIcon-CK78rVhG.js` | 1,220 | 606 |
| `assets/ModalPortal-CGwKOVNw.js` | 364,098 | 98,638 |
| `assets/ProfileDataContext-DwX1hvvw.js` | 3,189 | 1,217 |
| `assets/ProjectCover-CncS3tfB.js` | 4,045 | 1,817 |
| `assets/ResponsiveImage-BTPcrzCa.js` | 1,062 | 656 |
| `assets/arrow-left-TThTfN0v.js` | 165 | 161 |
| `assets/camera-BeitLdTV.js` | 248 | 210 |
| `assets/categoryIcons-DUj1LPIY.js` | 58,151 | 22,672 |
| `assets/check-l0N8tbP1.js` | 124 | 140 |
| `assets/chunk-62JRHF6Z-B8Vrtyg7.js` | 36,604 | 13,117 |
| `assets/createLucideIcon-CnMxcLUj.js` | 8,238 | 3,275 |
| `assets/file-cBuCXAtc.js` | 218 | 178 |
| `assets/image-D_uxJnL9.js` | 269 | 222 |
| `assets/index-BYaOdHVJ.js` | 240,778 | 70,779 |
| `assets/loader-circle-DiWVsbNS.js` | 144 | 154 |
| `assets/preload-helper-Czpn1I53.js` | 1,196 | 675 |
| `assets/projectContinuity-0LLBIB4N.js` | 809 | 404 |
| `assets/projectPresentation-A7NjVDGz.js` | 5,119 | 2,083 |
| `assets/proxy-1hujRSjB.js` | 109,773 | 35,895 |
| `assets/radioGroupKeyboard-vQTOzQrj.js` | 700 | 447 |
| `assets/react-dom-DUpco3P6.js` | 132,690 | 42,505 |
| `assets/repeat-2-CZ8akHv1.js` | 465 | 304 |
| `assets/rolldown-runtime-B0Z9INg1.js` | 901 | 510 |
| `assets/routes-Cn5xGUbM.js` | 4,507 | 1,574 |
| `assets/search-DtqolsUM.js` | 174 | 167 |
| `assets/use-reduced-motion-k_yhcCiL.js` | 450 | 305 |
| `assets/useAppRoute-DlXTENgZ.js` | 9,603 | 3,305 |
| `assets/useModalFocus-CPOEo599.js` | 1,706 | 858 |
| `assets/usePresentation-DQqy5bht.js` | 207 | 172 |
| `assets/video-hLcEA4Ae.js` | 1,006 | 516 |
| `assets/x-vL2KRcSM.js` | 940 | 492 |
| `assets/index-BJabR4mH.css` | 317,685 | 50,535 |

## After: main initial graph

| Asset | Raw bytes | Local gzip bytes |
| --- | ---: | ---: |
| `assets/AnimatePresence-CM7Qc-GS.js` | 3,067 | 1,458 |
| `assets/AuthContext-BkcKBu4K.js` | 6,091 | 2,319 |
| `assets/Button-urfi2k0V.js` | 1,036 | 635 |
| `assets/CollaborationPage-Bxvy6aZZ.js` | 1,767 | 825 |
| `assets/InteractionSafePresence-B3qmSZGe.js` | 356 | 271 |
| `assets/PortalinkSplashLoader-Dl9-6YF3.js` | 9,896 | 3,815 |
| `assets/StateViews-D1JXkXmE.js` | 2,052 | 766 |
| `assets/arrow-left-TThTfN0v.js` | 165 | 161 |
| `assets/backNavigationTransition-BmOa_ZDH.js` | 12,876 | 5,008 |
| `assets/circle-alert-BH37zGj2.js` | 321 | 230 |
| `assets/communityServices-DsN74Pvo.js` | 11,585 | 3,419 |
| `assets/contentServices-RPafD4Lu.js` | 30,662 | 9,430 |
| `assets/createLucideIcon-CnMxcLUj.js` | 8,238 | 3,275 |
| `assets/creatorSaveService-CcpS72Tr.js` | 1,458 | 662 |
| `assets/eye-MapDN3E3.js` | 633 | 341 |
| `assets/localPreferences-MV8Ani13.js` | 464,172 | 141,984 |
| `assets/main-Bog0rgEc.js` | 164,807 | 47,087 |
| `assets/mediaProcessingReads-CQFgLFd1.js` | 2,138 | 939 |
| `assets/mediaService-DWF4l2G5.js` | 6,531 | 2,841 |
| `assets/preload-helper-Czpn1I53.js` | 1,196 | 675 |
| `assets/projectReaders-BCDXpaXA.js` | 2,482 | 1,015 |
| `assets/proxy-1hujRSjB.js` | 109,773 | 35,895 |
| `assets/publishing-C9Z7rEKR.js` | 527 | 210 |
| `assets/react-dom-DUpco3P6.js` | 132,690 | 42,505 |
| `assets/rolldown-runtime-B0Z9INg1.js` | 901 | 510 |
| `assets/rotate-cw-B8ebmPsz.js` | 201 | 184 |
| `assets/typefaces-B45jFx_6.js` | 2,109 | 758 |
| `assets/use-reduced-motion-k_yhcCiL.js` | 450 | 305 |
| `assets/useAsyncAction-l9hG3V7G.js` | 1,524 | 823 |
| `assets/useProjectGridDensity-DCKqSuhc.js` | 12,101 | 4,767 |
| `assets/x-CCapwiJo.js` | 154 | 152 |
| `assets/localPreferences-C8irPKnR.css` | 317,790 | 50,558 |

## After: visitor initial graph

| Asset | Raw bytes | Local gzip bytes |
| --- | ---: | ---: |
| `assets/AuthContext-BkcKBu4K.js` | 6,091 | 2,319 |
| `assets/ProfileAvatar-B9hOXNz-.js` | 2,671 | 1,292 |
| `assets/createLucideIcon-CnMxcLUj.js` | 8,238 | 3,275 |
| `assets/info-DfoOASHx.js` | 204 | 177 |
| `assets/localPreferences-MV8Ani13.js` | 464,172 | 141,984 |
| `assets/preload-helper-Czpn1I53.js` | 1,196 | 675 |
| `assets/profile-header-Cr5TiO1K.js` | 1,880 | 862 |
| `assets/profileLinks-D9UZwXD9.js` | 2,609 | 1,191 |
| `assets/proxy-1hujRSjB.js` | 109,773 | 35,895 |
| `assets/react-dom-DUpco3P6.js` | 132,690 | 42,505 |
| `assets/rolldown-runtime-B0Z9INg1.js` | 901 | 510 |
| `assets/use-reduced-motion-k_yhcCiL.js` | 450 | 305 |
| `assets/useProjectGridDensity-DCKqSuhc.js` | 12,101 | 4,767 |
| `assets/visitor-CR8Jy9Xx.js` | 19,019 | 6,458 |
| `assets/localPreferences-C8irPKnR.css` | 317,790 | 50,558 |
| `assets/profile-header-DXYvM9NB.css` | 3,780 | 993 |

## Browser verification and practical limits

- Isolated HTTP fixture on 127.0.0.1:5187 used the compiled client, actual visitor/main components, canonical Supabase SDK/read/auth services and worker routing. Only configuration/transport were pointed to local synthetic HTTP records; no real accounts or connected Storage/database operations. Ignored fixture source and request log: `logs/visitor-qa/`.
- At 390px, 110.66px tiles emitted `sizes=111px`; at 430px, 124px tiles emitted `sizes=124px`; at 1280px, 298px tiles emitted `sizes=298px`. This browser at its tested pixel ratio selected 200-long-edge WebP variants on mobile and 400-long-edge variants on desktop. Actual srcset width descriptors preserve portrait dimensions (155/309/618 pixels), rather than incorrectly claiming square assets. Density 2–13 with mixed portrait/landscape/square frames is covered by geometry/image tests; every density was not manually exercised in the browser.
- First-screen covers/avatar were complete, eager/high priority; lower rows had native lazy loading without high priority. The browser can still prefetch nearby lazy images. Avatar had a measured 74px display width; it has only one stored URL, so there is no real avatar variant set or smaller-download claim.
- A representative fresh mobile run started its bundle request at 259.6ms while the document was still loading; module execution/DOMContentLoaded completed at 530.7ms. The HTTP log shows one bundle RPC per anonymous document navigation; auth identity changes correctly revalidate. These are unthrottled local synthetic timings, not phone/network performance estimates.
- Shared profile reloads showed content without auth/welcome media. The sign-in bar dismissed. The raw three-page PDF opened and rendered; PDF.js and its worker appeared in the request log only after document selection. Mobile fit-to-width reading and desktop reader panels worked. Existing AuthDialog accepted synthetic credentials and returned to the identical document URL; no real authentication claim.
- The normal entry retained owner/profile counters, desktop density control and mobile navigation. Home, Messages and mobile Studio opened through their existing flows; Studio retained Bookmarks landing. No message, publication or account mutation was sent. A stale fixture chunk during an intermediate rebuild was resolved by reloading; it was not a source failure.
- No hosted worker, physical iPhone/Safari, real sign-in/signup/recovery, video playback or actual network throttling claim. Node tests protect lazy video dispatch, route/privacy behavior and auth/onboarding continuation.
- Existing cover schema/bucket/bundle SQL and backfill remain unapplied. Missing RPC still falls back to existing reads. Until stored cover bitmaps exist, legacy share projects without a bitmap display a file placeholder; they do not start live PDF/video grid renderers. The source cannot make ungenerated live covers instant.

## Changed files

- `docs/agent-handoff.md`
- `docs/performance-audit-status.md`
- `src/components/UserProfilePage.tsx`
- `src/components/media/AttachmentRenderer.tsx`
- `src/components/media/ProjectCover.tsx`
- `src/components/profile/CreatorAvatar.tsx`
- `src/components/profile/ProfileAvatar.tsx`
- `src/components/profile/ProfileCategoryPage.tsx`
- `src/components/profile/ProjectIndexList.tsx`
- `src/components/profile/ProjectPreviewCard.tsx`
- `src/components/ui/ResponsiveImage.tsx`
- `src/contexts/ServicesContext.tsx`
- `src/index.tsx`
- `src/services/local.ts`
- `src/services/supabase/contentServices.ts`
- `src/services/supabase/coverThumbnails.ts`
- `src/services/supabase/mediaService.ts`
- `src/services/supabase/sharedProfileBundle.ts`
- `src/sites-worker.ts`
- `src/types/domain.ts`
- `tests/content-read-performance.test.mjs`
- `tests/cover-thumbnail-services.test.mjs`
- `tests/frontend-loading.test.mjs`
- `tests/mobile-project-index-rows.test.mjs`
- `tests/multipart-upload-performance.test.mjs`
- `tests/profile-avatar.test.mjs`
- `tests/profile-persistence.test.mjs`
- `tests/shared-cover-fallback.test.mjs`
- `tests/shared-preview.test.mjs`
- `tests/startup-loading.test.mjs`
- `tests/video-viewer.test.mjs`
- `vite.config.ts`
- `docs/shared-profile-first-paint.md`
- `docs/visitor-entry-assets.md`
- `scripts/measure-entry-assets.mjs`
- `scripts/shared-profile-preload.d.mts`
- `scripts/shared-profile-preload.mjs`
- `share.html`
- `src/components/profile/ProjectPreviewExtension.tsx`
- `src/services/deferredService.ts`
- `src/services/localPreferences.ts`
- `src/services/supabase/contentReaders.ts`
- `src/services/supabase/coverThumbnailReads.ts`
- `src/services/supabase/mediaProcessingReads.ts`
- `src/services/supabase/projectReaders.ts`
- `src/services/visitorServices.ts`
- `src/visitor/VisitorApp.tsx`
- `src/visitor/VisitorProfileGrid.tsx`
- `src/visitor/VisitorProjectPage.tsx`
- `src/visitor/index.tsx`
- `tests/attachment-renderer-loading.test.mjs`
- `tests/media-processing-reads.test.mjs`
- `tests/project-preview-extension.test.mjs`
- `tests/responsive-image-priority.test.mjs`
- `tests/shared-profile-preload.test.mjs`
- `tests/visitor-entry-build.test.mjs`
- `tests/visitor-navigation.test.mjs`
- `tests/visitor-services.test.mjs`
