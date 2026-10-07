Portalink location directory

Derived from GeoNames (https://www.geonames.org/), licensed CC BY 4.0:
https://creativecommons.org/licenses/by/4.0/

Sources: cities500.zip, countryInfo.txt, admin1CodesASCII.txt from
https://download.geonames.org/export/dump/

Portalink transforms these into normalized, content-hashed search/ID shards.
The current manifest records the original source SHA-256 checksums.
Coverage: cities/towns over 500 population or administrative seats, first-level
administrative regions, and countries/territories. This is not every settlement
or a street/address map. Names and administrative coverage may be incomplete.

Rebuild: python scripts/update-location-directory.py --refresh
See docs/location-directory.md for maintenance and compatibility notes.
