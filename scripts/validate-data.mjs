import { readFile } from 'node:fs/promises';

const raw = await readFile(new URL('../src/lib/data/works.json', import.meta.url), 'utf8');
const factsRaw = await readFile(new URL('../src/lib/data/factual-connections.json', import.meta.url), 'utf8');
const works = JSON.parse(raw);
const factualConnections = JSON.parse(factsRaw);
const required = ['id', 'title', 'creator', 'type', 'year', 'tags', 'mood', 'desc'];
const errors = [];
const ids = new Set();
for (const [index, work] of works.entries()) {
  for (const key of required) if (work[key] === undefined || work[key] === null || work[key] === '') errors.push(`Row ${index + 1}: missing ${key}`);
  if (ids.has(work.id)) errors.push(`Row ${index + 1}: duplicate id ${work.id}`);
  ids.add(work.id);
  if (!Array.isArray(work.tags) || work.tags.length === 0) errors.push(`Row ${index + 1}: tags must be a non-empty array`);
  if (!Number.isInteger(work.year) || work.year < 0 || work.year > 2100) errors.push(`Row ${index + 1}: invalid year`);
  for (const key of ['cast', 'genres', 'emotionalArc']) if (work[key] !== undefined && (!Array.isArray(work[key]) || work[key].some((value) => typeof value !== 'string' || !value.trim()))) errors.push(`Row ${index + 1}: ${key} must be an array of non-empty strings`);
  if (work.director !== undefined && typeof work.director !== 'string') errors.push(`Row ${index + 1}: director must be a string`);
  if (work.region !== undefined && typeof work.region !== 'string') errors.push(`Row ${index + 1}: region must be a string`);
  if (work.creditSourceUrl !== undefined && !String(work.creditSourceUrl).startsWith('https://')) errors.push(`Row ${index + 1}: creditSourceUrl must use HTTPS`);
}
for (const link of factualConnections) {
  if (!ids.has(link.from) || !ids.has(link.to)) errors.push(`Factual link ${link.id}: references an unknown work ID`);
  for (const key of ['id', 'kind', 'person', 'label', 'explanation', 'sourceLabel', 'sourceUrl']) if (!link[key]) errors.push(`Factual link ${link.id}: missing ${key}`);
  if (!String(link.sourceUrl).startsWith('https://')) errors.push(`Factual link ${link.id}: source URL must use HTTPS`);
}
if (errors.length) {
  console.error(`Catalogue validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const formats = Object.fromEntries([...new Set(works.map((work) => work.type))].sort().map((type) => [type, works.filter((work) => work.type === type).length]));
  console.log(`Catalogue valid: ${works.length} works, ${ids.size} unique IDs.`);
  console.log(`Factual connections valid: ${factualConnections.length} sourced relationships.`);
  console.log('Formats:', formats);
  const filmRegions = Object.fromEntries(['Hollywood', 'Bollywood'].map((region) => [region, works.filter((work) => work.type === 'Film' && work.region === region).length]));
  console.log('Movie regions (curated selections):', filmRegions);
}
