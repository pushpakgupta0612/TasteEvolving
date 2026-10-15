import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worksPath = path.join(root, 'src/lib/data/works.json');
const factsPath = path.join(root, 'src/lib/data/factual-connections.json');
const works = JSON.parse(fs.readFileSync(worksPath, 'utf8'));
const facts = JSON.parse(fs.readFileSync(factsPath, 'utf8'));
const fail = (message) => { console.error(`✗ ${message}`); process.exitCode = 1; };
if (!Array.isArray(works) || !works.length) fail('works.json must be a non-empty array.');
if (!Array.isArray(facts)) fail('factual-connections.json must be an array.');
const ids = new Set();
for (const [index, work] of works.entries()) {
  if (!work || typeof work !== 'object') { fail(`Work at index ${index} is not an object.`); continue; }
  for (const key of ['id', 'title', 'type', 'creator', 'mood', 'desc']) if (!work[key]) fail(`Work at index ${index} is missing ${key}.`);
  if (!Array.isArray(work.tags)) fail(`${work.id ?? index}: tags must be an array.`);
  if (ids.has(work.id)) fail(`Duplicate work ID: ${work.id}`);
  ids.add(work.id);
}
const factIds = new Set();
for (const [index, fact] of facts.entries()) {
  if (!fact || typeof fact !== 'object') { fail(`Fact at index ${index} is not an object.`); continue; }
  for (const key of ['id', 'from', 'to', 'kind', 'person', 'explanation']) if (!fact[key]) fail(`Fact at index ${index} is missing ${key}.`);
  if (factIds.has(fact.id)) fail(`Duplicate factual connection ID: ${fact.id}`);
  factIds.add(fact.id);
  if (!ids.has(fact.from)) fail(`${fact.id}: unknown source work ID ${fact.from}.`);
  if (!ids.has(fact.to)) fail(`${fact.id}: unknown target work ID ${fact.to}.`);
  if (fact.from === fact.to) fail(`${fact.id}: source and target must differ.`);
}
if (!process.exitCode) {
  const formats = Object.fromEntries([...new Set(works.map(w => w.type))].sort().map(type => [type, works.filter(w => w.type === type).length]));
  console.log(`✓ Catalogue valid: ${works.length} works, ${ids.size} unique IDs.`);
  console.log(`✓ Factual connections valid: ${facts.length} sourced relationships.`);
  console.log('Formats:', formats);
}
