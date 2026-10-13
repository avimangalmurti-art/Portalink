# Mobile Library layout audit

All seven main sections (Overview, Drafts, Published, Bookmarks, References, Cited, All) use MobileLibraryLayout. Legacy Activity keeps working and uses the same layout. No other screen layout or dock is changed. Desktop Studio remains its previous placeholder.

At420x912 with zero simulated safe inset every section has header0–80, tab rail80–160, Back/Select/menu centerY32, content top188. Both populated and empty matrices are recorded in the JSON files. With simulated iOS top59/bottom34, every section has header59–139, rail139–219, controlY91, content247. Vertical scrolling retains these coordinates; horizontal rail scrollTop remains0 and the active tab is visible. Last row bottom773.675 clears dock top814 at the end of the safe-area All list. Long project titles and absent summaries also retained the zero-inset coordinates.390430fit without document overflow. Screenshots show all seven main sections and desktop preservation.

Browser evidence uses actual App components with synthetic services and transport; no production data writes. Native iOS status chrome is not emulated; safe area values are simulated. Physical-device verification remains outstanding. No live publication in this task.

119 focused Node checks, typecheck, production client/worker build and both configured Supabase graph guards pass. Lint:0errors114existingwarnings. Existing competing mobile Library geometry rules removed; reusable geometry lives only in mobile-library-layout.css. Colours, shapes, routes, actions, exports and underlying permissions retained.
