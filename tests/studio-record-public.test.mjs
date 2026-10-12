import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const snapshot=JSON.parse(readFileSync(new URL('./fixtures/studio-record-public-snapshot.json',import.meta.url)));
test('shared profile bundle, citation endpoint and public domain schema remain unchanged',()=>{for(const [file,hash]of Object.entries(snapshot)){assert.equal(createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url),'utf8').replace(/\r\n/g,'\n')).digest('hex'),hash,file);}});
