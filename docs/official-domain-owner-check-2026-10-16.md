# Official-domain email sign-in and owner-menu check

Completed16October2026 on https://portalinknetworks.com/ in existing browser tab76. User entered existing account credentials directly into the browser. On inspection the filled sign-in form was still open; submitting its Sign in button completed normal email/password authentication and navigated to the Portalite owner profile. Credentials were not read, copied, logged or stored by the agent. No Google/provider configuration or account profile setting changed.

## Verified UI behavior

- Desktop1280x900 profile options expand and expose Edit profile, Share portfolio and Reorder projects.
- Desktop Graphic Design portal menu exposes Hide, Rename, Change icon and Delete; Escape dismisses it. No command executed.
- Desktop SFSU project index menu exposes Edit project, Change typography, Pin, Hide, Export, Copy citation and Delete project; Escape dismisses it. No mutation/export/copy was performed.
- Mobile420x912 profile action sheet opens with New project, Edit profile, Share link, View as visitor, Reorder projects, Insights, Bookmarks, Copy link and Settings. Its collapsed position is intentional; Expand actions moves the full sheet to16..912px and Settings is within495..547px. Close works; no account preference was changed.
- Mobile SFSU details popup contains actual owner commands, not an empty menu: Project options, Edit title, Edit description and Delete project. Project options opens the sheet containing Edit, Change cover, Start here, Then/Now, Reads and Delete project.
- Mobile Edit opens the existing project editor with Save changes disabled. No fields/files changed; Back dismisses it.
- Mobile portal chooser provides owner options including Move up/down, Hide, Rename, Change icon and Delete. Escape and chooser Back restore the profile. None of those commands was invoked.
- Captured console:0errors/0warnings across this email sign-in and menu flow.

No project/draft/portal creation, uploads, deletion, visibility/order changes, messages, bookmarks, follows, account settings or provider changes were performed. New project and desktop Add project were not clicked because mounting uploads can create a server draft. No controlled live test/fault injection/cleanup scenario, Google sign-in or SQL was run. Ordinary navigation can emit the app's passive reading activity; no telemetry suppression attempted.

This verifies one existing email/password sign-in and sampled owner-menu opening/dismissal on the official origin. It does not verify signup, password reset, email confirmation/recovery redirects, session expiry, all menu mutations, publishing, exact no-handler edge cases or physical-iPhone/PWA behavior. Supabase and existing app/provider configuration retained.

Official-domain session left signed in, menus closed, viewport reset; existing old-origin tabs retained. Screenshots in ignored logs/official-owner-qa/: desktop-project-menu.png, mobile-project-menu.png, mobile-owner-actions.png. Only local documentation was written; no app code/deployment or held work changed.
