type AudioTags = { title?: string; artist?: string };
type ReadRange = (offset: number, length: number) => Promise<DataView>;
type Chunk = { type: string; start: number; end: number };

const MAX_READS = 128;
const MAX_METADATA_BYTES = 256 * 1024;
const MAX_TAG_BYTES = 4 * 1024;

function fourCharacters(view: DataView, offset: number): string {
  return String.fromCharCode(...new Uint8Array(view.buffer, view.byteOffset + offset, 4));
}

function decodeTag(view: DataView, encoding: string, fallback?: string): string | undefined {
  let text: string;
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(view);
  } catch {
    if (!fallback) return undefined;
    text = new TextDecoder(fallback).decode(view);
  }
  const value = text.replace(/\0/g, '').trim();
  return value ? Array.from(value).slice(0, 120).join('') : undefined;
}

async function* mp4Boxes(read: ReadRange, start: number, end: number): AsyncGenerator<Chunk> {
  while (end - start >= 8) {
    const header = await read(start, 8);
    const shortSize = header.getUint32(0);
    const headerSize = shortSize === 1 ? 16 : 8;
    if (end - start < headerSize) return;
    const size = shortSize === 1 ? Number((await read(start + 8, 8)).getBigUint64(0)) : shortSize || end - start;
    if (!Number.isSafeInteger(size) || size < headerSize || size > end - start) return;
    yield { type: fourCharacters(header, 4), start: start + headerSize, end: start + size };
    start += size;
  }
}

async function findMp4Box(read: ReadRange, parent: Chunk, type: string, prefixSize = 0): Promise<Chunk | undefined> {
  for await (const box of mp4Boxes(read, parent.start + prefixSize, parent.end)) {
    if (box.type === type) return box;
  }
}

async function readMp4Tag(read: ReadRange, item: Chunk): Promise<string | undefined> {
  const data = await findMp4Box(read, item, 'data');
  if (!data) return undefined;
  const length = data.end - data.start;
  if (length < 9 || length > MAX_TAG_BYTES + 8) return undefined;
  const view = await read(data.start, length);
  // The iTunes data box starts with its type indicator and a four-byte locale.
  const type = view.getUint32(0);
  const value = new DataView(view.buffer, view.byteOffset + 8, length - 8);
  if (type === 1) return decodeTag(value, 'utf-8');
  if (type === 2) return decodeTag(value, value.byteLength >= 2 && value.getUint16(0) === 0xfffe ? 'utf-16le' : 'utf-16be');
}

async function readMp4Tags(read: ReadRange, size: number): Promise<AudioTags> {
  const movie = await findMp4Box(read, { type: '', start: 0, end: size }, 'moov');
  if (!movie) return {};
  const userData = await findMp4Box(read, movie, 'udta');
  const metadata = (userData && await findMp4Box(read, userData, 'meta')) ?? await findMp4Box(read, movie, 'meta');
  if (!metadata) return {};
  const items = await findMp4Box(read, metadata, 'ilst', 4) ?? await findMp4Box(read, metadata, 'ilst');
  if (!items) return {};

  const tags: AudioTags = {};
  let albumArtist: string | undefined;
  for await (const box of mp4Boxes(read, items.start, items.end)) {
    const key = box.type === '©nam' ? 'title' : box.type === '©ART' ? 'artist' : undefined;
    if (key && !tags[key]) {
      const value = await readMp4Tag(read, box);
      if (value) tags[key] = value;
    }
    if (box.type === 'aART' && !albumArtist) albumArtist = await readMp4Tag(read, box);
    if (tags.title && tags.artist) break;
  }
  if (!tags.artist && albumArtist) tags.artist = albumArtist;
  return tags;
}

async function* riffChunks(read: ReadRange, start: number, end: number): AsyncGenerator<Chunk> {
  while (end - start >= 8) {
    const header = await read(start, 8);
    const size = header.getUint32(4, true);
    const chunkEnd = start + 8 + size;
    if (chunkEnd + size % 2 > end) return;
    yield { type: fourCharacters(header, 0), start: start + 8, end: chunkEnd };
    start = chunkEnd + size % 2;
  }
}

async function readRiffTags(read: ReadRange, end: number): Promise<AudioTags> {
  const tags: AudioTags = {};
  for await (const list of riffChunks(read, 12, end)) {
    if (list.type !== 'LIST' || list.end - list.start < 4) continue;
    if (fourCharacters(await read(list.start, 4), 0) !== 'INFO') continue;
    for await (const chunk of riffChunks(read, list.start + 4, list.end)) {
      const key = chunk.type === 'INAM' ? 'title' : chunk.type === 'IART' ? 'artist' : undefined;
      const length = chunk.end - chunk.start;
      if (!key || tags[key] || length === 0 || length > MAX_TAG_BYTES) continue;
      const value = decodeTag(await read(chunk.start, length), 'utf-8', 'windows-1252');
      if (value) tags[key] = value;
    }
    if (tags.title && tags.artist) break;
  }
  return tags;
}

/** Read small tag ranges without decoding or loading the audio payload. */
export async function readProfileAudioTags(file: File): Promise<AudioTags> {
  if (file.size < 12) return {};
  let reads = 0;
  let bytes = 0;
  const read: ReadRange = async (offset, length) => {
    bytes += length;
    if (++reads > MAX_READS || bytes > MAX_METADATA_BYTES || length > file.size - offset) {
      throw new RangeError('Audio metadata exceeds the read limit.');
    }
    return new DataView(await file.slice(offset, offset + length).arrayBuffer());
  };
  try {
    const header = await read(0, 12);
    if (fourCharacters(header, 0) === 'RIFF' && fourCharacters(header, 8) === 'WAVE') {
      const end = header.getUint32(4, true) + 8;
      return end <= file.size ? await readRiffTags(read, end) : {};
    }
    const boxType = fourCharacters(header, 4);
    return ['ftyp', 'moov', 'mdat', 'free', 'wide', 'skip'].includes(boxType) ? await readMp4Tags(read, file.size) : {};
  } catch {
    return {};
  }
}
