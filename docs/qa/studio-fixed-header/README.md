# Fixed app headers — review screenshots

Rendered locally with the real app components and synthetic services/account. No production account, content, session, SQL, or worker was changed. The SFSU summary fixture uses the publicly readable bullet-list summary. These are browser previews, not physical-iPhone evidence.

Mobile Studio, Messages, and signed-in app Profile use the fixed header. Public visitor profiles/readers, desktop layouts, and Overview content are preserved. The References Add reference feature remains a separate pending task.

## Studio tabs

| Tab | 375 px | 430 px |
| --- | --- | --- |
| Overview | [Screenshot](overview-375.png) | [Screenshot](overview-430.png) |
| Drafts | [Screenshot](drafts-375.png) | [Screenshot](drafts-430.png) |
| Published | [Screenshot](published-375.png) | [Screenshot](published-430.png) |
| Bookmarks | [Screenshot](bookmarks-375.png) | [Screenshot](bookmarks-430.png) |
| References | [Screenshot](references-375.png) | [Screenshot](references-430.png) |
| Cited | [Screenshot](cited-375.png) | [Screenshot](cited-430.png) |
| All | [Screenshot](all-375.png) | [Screenshot](all-430.png) |

## Interaction and preservation

- [Published at iPhone Air 420 × 912](published-420.png)
- [Last Published row at 375](published-end-375.png) and [430](published-end-430.png): header top stays 0; last row bottom 819.6, dock top 848.
- [Pushed Studio entry with Back](studio-pushed-back-430.png): Profile → Actions → Bookmarks, then Back returns to Profile. Dock entry has no Back.
- [Messages 375](messages-chats-375.png) · [Messages 430](messages-chats-430.png)
- [App Profile 375](profile-375.png) · [Journey 430](profile-journey-430.png) · [Portfolio 430](profile-portfolio-430.png)
- [Public visitor profile preserved](visitor-preserved-375.png): its light/green public appearance, inline Portfolio/Journey, no app header or dock.
- [Desktop Messages](messages-web-preserved.png) · [Desktop Profile](profile-web-preserved.png): no new fixed header or horizontal overflow.

## Empty states

All six empty states have no Select control.
- [Drafts](empty-drafts-375.png)
- [Published](empty-published-375.png)
- [Bookmarks](empty-bookmarks-375.png)
- [References](empty-references-375.png)
- [Cited](empty-cited-375.png)
- [All](empty-all-375.png)

## Verification

At 375, 420 and 430 px there is no document horizontal overflow. At 375/430, the selected tab centre is within 0.3 px of the rail centre; first/last tabs can centre through rail end padding. The SFSU summary is plain text without bullets or markup, clamped to two 19.6 px lines. Made-on dates display Oct 6, 2026. No per-row Options button or zero-reference chip remains.

Selection/Done, keyboard row menu, header Actions, empty Select hiding, and Back entry/return were exercised in the actual local app. Gesture unit coverage checks the 500 ms hold, cancellation and destructive-action safeguards. No physical touch-device verification is claimed.
