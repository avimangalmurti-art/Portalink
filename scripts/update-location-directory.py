"""Build attributed, lazy GeoNames assets; no database, API key or paid service.

python scripts/update-location-directory.py [--refresh]
Raw upstream downloads stay in ignored logs/geonames-source. Generated assets
are content-addressed; old assets are not deleted (existing URLs keep working).
"""
import argparse
import collections
import hashlib
import io
import json
from pathlib import Path
import unicodedata
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'logs' / 'geonames-source'
OUTPUT = ROOT / 'public' / 'assets' / 'locations'
BASE = 'https://download.geonames.org/export/dump/'
SHARDS = 128


def normalize(value):
    return ' '.join(''.join(c for c in unicodedata.normalize('NFKD', value).lower()
                           if not unicodedata.category(c).startswith('M')).split())


def shard_for(value):
    result = 0
    # JS iterates Unicode code points too (not UTF-16 code units).
    for char in normalize(value)[:3]:
        result = (result * 31 + ord(char)) % SHARDS
    return result


def download(name, refresh):
    path = SOURCE / name
    if refresh or not path.exists():
        print('Downloading', name, flush=True)
        request = urllib.request.Request(BASE + name, headers={'User-Agent': 'Portalink-Location-Directory/1.0'})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read()
        path.write_bytes(data)
    return path.read_bytes()


def emit(name, value):
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    filename = f'{name}-{hashlib.sha256(raw).hexdigest()[:16]}.json'
    (OUTPUT / filename).write_bytes(raw)
    return filename, len(raw)


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--refresh', action='store_true')
    refresh = args.parse_args().refresh
    SOURCE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    names = ['cities500.zip', 'countryInfo.txt', 'admin1CodesASCII.txt', 'readme.txt']
    inputs = {name: download(name, refresh) for name in names}
    countries = []
    for line in inputs['countryInfo.txt'].decode('utf-8-sig').splitlines():
        if not line or line.startswith('#'):
            continue
        row = line.split('\t')
        countries.append([row[0], row[4], int(row[16]), row[1]])
    regions = []
    for line in inputs['admin1CodesASCII.txt'].decode('utf-8-sig').splitlines():
        if line:
            code, name, ascii_name, identifier = line.split('\t')
            regions.append([code, name, ascii_name, int(identifier)])
    cities = []
    with zipfile.ZipFile(io.BytesIO(inputs['cities500.zip'])) as archive:
        for line in archive.read('cities500.txt').decode('utf-8').splitlines():
            row = line.split('\t')
            cities.append([int(row[0]), row[1], row[2], row[8], row[10],
                           float(row[4]), float(row[5]), int(row[14]), row[17]])
    # Distinguish same-name cities in one country when matching legacy text.
    # Matching accepts both display and ASCII names. Count each record once per
    # normalized alias, so Rossbach and Roßbach cannot both claim uniqueness.
    counts = collections.Counter((name, row[3]) for row in cities
                                 for name in {normalize(row[1]), normalize(row[2])})
    region_counts = collections.Counter((name, row[3], row[4]) for row in cities
                                        for name in {normalize(row[1]), normalize(row[2])})
    for row in cities:
        names = {normalize(row[1]), normalize(row[2])}
        row.append(1 if all(counts[name, row[3]] == 1 for name in names) else 0)
        row.append(1 if all(region_counts[name, row[3], row[4]] == 1 for name in names) else 0)
    search, identifiers = [[] for _ in range(SHARDS)], [[] for _ in range(SHARDS)]
    for row in sorted(cities, key=lambda row: row[0]):
        identifiers[row[0] % SHARDS].append(row)
        for index in {shard_for(row[1]), shard_for(row[2])}:
            search[index].append(row)
    search_files, id_files, sizes = [], [], []
    for index in range(SHARDS):
        filename, size = emit(f'search-{index}', search[index])
        search_files.append(filename)
        sizes.append(size)
        filename, size = emit(f'ids-{index}', identifiers[index])
        id_files.append(filename)
        sizes.append(size)
    manifest = {
        'schema': 1, 'source': 'GeoNames', 'license': 'CC BY 4.0',
        'sourceUrl': 'https://www.geonames.org/',
        'coverage': 'cities500: population over 500 or administrative seats; admin1 regions and countries',
        'sources': {name: hashlib.sha256(data).hexdigest() for name, data in inputs.items()},
        'cityCount': len(cities), 'countries': sorted(countries), 'regions': sorted(regions),
        'shortNames': [row for row in cities if min(len(normalize(row[1])), len(normalize(row[2]))) < 3],
        'search': search_files, 'ids': id_files,
    }
    filename, size = emit('manifest', manifest)
    (ROOT / 'src' / 'data' / 'locationDirectoryVersion.ts').write_text(
        '// Generated by scripts/update-location-directory.py; data is fetched only on demand.\n'
        f"export const LOCATION_DIRECTORY_MANIFEST = '/assets/locations/{filename}';\n",
        encoding='utf-8')
    print(json.dumps({'cities': len(cities), 'countries': len(countries), 'regions': len(regions),
                      'bytes': sum(sizes) + size, 'manifestBytes': size, 'maxShardBytes': max(sizes),
                      'manifest': filename}, indent=2))


if __name__ == '__main__':
    main()
