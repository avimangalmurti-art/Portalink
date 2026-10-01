# Free location directory

Profile onboarding, profile editing and Explore use a local copy of [GeoNames](https://www.geonames.org/) data, attributed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). No API key, provider account, per-search charge, location permission or third-party runtime query is needed. Ordinary Sites hosting/bandwidth still applies. The existing globe rendering and curated default pins are retained; search opens any supported directory destination.

## Coverage and delivery

The October 1, 2026 download contains 235,902 cities/towns, 3,865 first-level administrative regions and 252 country/territory entries. `cities500` includes settlements over 500 population or administrative seats, not every village, street or address. Search supports canonical and ASCII names, accent-insensitive prefixes and comma-separated region/country qualifiers. It does not include every alternate-language name. Country/region results and exact one/two-character city names are available immediately; longer city search starts at three characters.

The generated manifest is 206,894 bytes; the largest shard is 936,560 bytes uncompressed. The 257 referenced JSON assets total 42,652,500 bytes. They are static assets, not JavaScript imports or a bulk startup download. A first search fetches the manifest and at most one prefix shard; selecting a new city fetches its ID shard. Each file has a content hash. Requests use same-origin `/assets/locations/`, omit credentials, and reuse promises/cache. Up to 32 parsed shards are retained for a browsing session. Failure can be retried. The existing worker's immutable hashed-asset handling applies.

## Identity and existing data

New destinations use `/portalink/gn-<GeoNames ID>`. Existing name-based city routes still resolve through the original catalogue and retain their matching behavior. Countries and regions are destinations too; no fabricated city facts are shown for them.

The existing `profiles.location` column remains human-readable text limited to 48 characters. No schema or existing row is changed. Explicit selection saves `City, Region, CC`, or `Region, CC`, or the country name. When the full city label exceeds 48 characters, a unique-in-country `City, CC` can be used; otherwise selection is disabled, and custom text remains available. We never silently truncate or rewrite existing values.

New directory feeds match explicit country/region qualifiers, preserving public-profile/public-project/hidden-category rules. They do not infer a country from a name-only custom value. Same-name cities even within one region can be distinct GeoNames IDs; since the existing profile column does not store that ID, ambiguous labels are deliberately excluded from that specific city feed. Such profiles can still match their region/country. Structured profile location identity would require a separate schema change. The existing discovery read limit of 500 public profiles is unchanged.

## Refresh

From the repository root:

```powershell
python scripts/update-location-directory.py --refresh
```

Python standard library only. The script downloads the official cities500, country, admin1 and readme files into git-ignored `logs/geonames-source`, records source hashes, writes deterministic content-hashed assets, and updates `src/data/locationDirectoryVersion.ts`. Without `--refresh`, it reuses existing raw files. It neither reads nor writes Supabase. Review resulting data/source diffs and run the location tests, typecheck, lint and build before a separately authorized publish. No automatic refresh is scheduled.

Keep previously published asset generations while cached clients may still reference them; the generator does not delete files. The duplicate intermediate generation created during this initial implementation was removed before any release. Attribution is displayed in search results and retained beside the distributed data.
