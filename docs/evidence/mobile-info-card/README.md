# Mobile project information card

Cover-page details now reuse FollowContentInfoPopup, the existing content-reader card. The creator/dots header, title, description scrolling, sizing and backdrop come from one component. The existing ProjectPopupEngagement content and owner editor/options/delete callbacks are retained through optional slots; reader defaults are unchanged. No desktop entry point changed.

Browser verification uses real components with synthetic services at420×912 and supplementary390/430 widths: compact description, long-description scrolling within viewport, owner menu, Edit description, Comments and Escape dismissal. No real user data was written. Screenshot cover-information.png. Physical iPhone testing remains unverified.

23 focused tests, typecheck and production client/worker build pass; main/visitor Supabase graph guards pass. Lint0errors114existingwarnings. Source based on liveSites388; unpublished Library PR64 and other features excluded. No SQL, runtime configuration, D1, billing or GitHubmainmerge.
