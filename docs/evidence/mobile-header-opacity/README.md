# Mobile header material verification

The shared presentation host measures vertical overlap for stationary mobile headers. At rest headers use the opaque canvas and no blur. Existing glass returns only when a related vertical content scroller passes underneath; horizontal tabs and unrelated nested scrolling do not activate it. Parent masks cannot dim stationary header controls. Document scrolling and internal lists are supported; route/viewport cleanup removes listeners and temporary attributes. No geometry, copy, controls, dock, backend or persistence changes.

Browser evidence uses real components with synthetic services at420×912: Home and Profile top/underlap/return, Studio Published and Saved, Messages, Search, Settings and Insights top states. Public mobile Profile retains its light appearance and follows the same rule.390/430 widths fit; WEB1280 has no mobile material attributes. Screenshots are in this directory. Physical iPhone, populated live conversations and real production data were not exercised.

Typecheck, lint0errors114existingwarnings, client/worker build and main/visitor Supabase bundle configuration guards pass.13 focused tests pass;46 additional existing presentation/viewport/scroll tests pass. One CSS scope audit fails on the existing icon-picker @import; the same failure was independently reproduced against unchanged liveSites389 source. The added hook fixture dependency was updated; no new test failures remain. This unrelated baseline audit limitation is not hidden or bypassed.

Release based on exact Sites3890fe2dca; excludes pending LibraryPR64 and all other features. No SQL/runtime/D1/billing change or GitHubmainmerge.
