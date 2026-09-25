import fs from 'node:fs';
import { buildActiveCanonicalImageCoverage } from '../modules/catalog-media/active-canonical-image-coverage-v1.js';
const out=buildActiveCanonicalImageCoverage(process.cwd());
fs.mkdirSync('data/catalog-media',{recursive:true});
fs.writeFileSync('data/catalog-media/active-canonical-image-coverage-v1.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({total:out.activeCanonicalCount,ready:out.imageReadyCount,blocked:out.imageBlockedCount,unresolved:out.unresolvedCount}));
