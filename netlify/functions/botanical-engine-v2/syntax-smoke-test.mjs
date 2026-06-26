import { buildInitialQueries } from './aliases.mjs';
import { looksScientificName } from './guards.mjs';
import { ENGINE_VERSION } from './engine.mjs';

const cases = [
  ['ארז', 'Cedrus'],
  ['mango tree', 'Mangifera indica'],
  ['Quercus calliprinos', 'Quercus calliprinos']
];

for (const [input, expected] of cases) {
  const queries = buildInitialQueries(input).queries;
  if (!queries.includes(expected)) {
    throw new Error(`Alias smoke test failed for ${input}: ${queries.join(', ')}`);
  }
}

if (!looksScientificName('Quercus calliprinos')) {
  throw new Error('Scientific-name smoke test failed');
}

console.log(`Cruvit Botanical Engine ${ENGINE_VERSION} syntax smoke test passed.`);
