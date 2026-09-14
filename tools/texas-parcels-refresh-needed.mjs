import {readFile,appendFile} from 'node:fs/promises';
const latest=JSON.parse(await readFile('.data/texas-parcels/latest-check.json','utf8'));
const response=await fetch('https://landdraft-public-parcels.tight-sky-0ae1.workers.dev/texas/current.json');
const current=response.ok?await response.json():null;
const needed=current?.sourceEtag!==latest.etag||current?.collectionId!==latest.collection.collection_id;
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`needed=${needed}\n`);
console.log(needed?'New public archive requires indexing':'Publisher archive unchanged; existing index retained');
