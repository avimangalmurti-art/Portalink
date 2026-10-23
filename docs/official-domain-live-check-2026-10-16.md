# Official domain: bounded MOBILE / WEB live check

Checked16October2026 at https://portalinknetworks.com/ using the existing official-domain browser tab76. Guest/public session; no sign-in was performed. The signed-in old-host sessions were left untouched.

| Area | Evidence |
| --- | --- |
| WEB1280x900 | Home and sidebar load; guest Home shows its empty-feed state without an error. Account search finds Portalite, opens its16-project/8-portal public portfolio, and stays on the official domain. Visible portfolio thumbnails loaded; no horizontal document overflow. |
| Project reading | Wet Paint public project opens through its canonical profile/category/project route. PDF canvases initialize and its101-page structure loads; not every page was individually inspected. MOBILE reader/progress/page controls initialize; no Save/Share/comment actions executed. Gesture tip observed without persisting its Got it preference. |
| Citation | WEB first-page Cite opens correct Wet Paint/Portalite metadata with MLA,APA,plain text,BibTeX choices and guest sign-in prompt. No clipboard copy or reference creation. Escape dismisses it. |
| MOBILE420x912 | Profile/images, guest project details popup and8-portal chooser load. Details popup380px wide and within viewport. Portal list/card toggle works; Back dismisses chooser and restores navigation. No horizontal overflow on sampled surfaces. |
| Compact MOBILE390x844 | Profile remains within width; portal list fits its raised frame. Actual tap on backdrop outside the panel dismisses it. A prior semantic click on the full-screen backdrop control hit the panel's center; explicit Back and a real outside tap both work, so this was not classified as a product regression. |
| Globe | MOBILE andWEB globe/search load; mobile search is at top (field42..86px) and San Francisco returns matching cities. Dark globe layout and orange dots present; no location selection/personal location change. No horizontal overflow. |
| Direct routing | A fresh direct request to the canonical /p/<profileId> address renders the public portfolio successfully rather than a server404. Internal navigation uses portalinknetworks.com. |
| Console | Zero captured errors or warnings across the exercised flows. |

No regressions found in these exercised guest flows. This is not a claim that every feature works: signed-in ownership, email authentication/reset redirects, uploads/download recovery, publishing, messaging, protected Saved/Studio state and physical-iPhone/PWA behavior were not tested. Guest Home's empty state was observed, not certified as a complete feed. No destructive or state-saving controls, account settings, themes, reordering, follow/bookmark/repost or sign-in actions were used. Normal page reads can emit passive activity; that was not suppressed or erased.

Controlled live publishing/recovery tests, fault injection and scheduling remain on hold. Google sign-in/provider/Auth settings and SQL are untouched. No deployment, backend mutation test, code change, environment change or new resources. Existing user tabs preserved; official tab76 returnedHome, viewport override reset, retained as deliverable.

Review screenshots (ignored): logs/official-domain-qa/desktop-profile.png, mobile-profile.png, mobile-portals.png, mobile-globe.png. These are browser viewport evidence, not real-phone proof.
