import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app.html',import.meta.url),'utf8');
const cases=[
  ['camellia','Camellia spp.','camellia japonica'],
  ['melaleuca','Melaleuca spp.','melaleuca incana'],
  ['mulberry','Morus spp.','morus alba'],
  ['mulberry','Morus spp.','morus nigra']
];
function recordLine(slug){
  return app.split('\n').find(line=>line.includes("{slug:'"+slug+"'"))||'';
}
test('species-looking aliases cannot silently narrow broad canonical identities',()=>{
  for(const row of cases){
    const slug=row[0], scientific=row[1], alias=row[2];
    const line=recordLine(slug);
    assert.ok(line,slug);
    assert.ok(line.includes("scientific:'"+scientific+"'"),slug);
    assert.ok(line.toLowerCase().includes("'"+alias.toLowerCase()+"'"),slug+': '+alias);
  }
});
