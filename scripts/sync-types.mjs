#!/usr/bin/env node
/*
 * sync:types — regenerate src/types/content.ts from the API's schema (spec §8.4).
 *
 * The Zod schemas in portfolio-v6-api are canonical. This script fetches
 * `GET /api/schema` (JSON Schema derived from those Zod definitions), compiles
 * it to TypeScript, and overwrites src/types/content.ts with a do-not-edit
 * header. CI re-runs this and fails if the working tree changes, so the three
 * repos' content types can never silently drift (spec §8.4).
 *
 * The schema origin honors VITE_API_BASE_URL (empty = same-origin via the dev
 * proxy — spec §10), and can be overridden with SCHEMA_URL for one-off runs.
 *
 * Run with the API reachable:  npm run sync:types
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { compile } from 'json-schema-to-typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, '../src/types/content.ts');

const base = (process.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const schemaUrl = process.env.SCHEMA_URL ?? `${base}/api/schema`;

const HEADER = `/*
 * GENERATED — do not edit by hand.
 *
 * Regenerate with \`npm run sync:types\`, which fetches the API's GET /api/schema
 * (JSON Schema derived from the canonical Zod definitions in portfolio-v6-api)
 * and overwrites this file (spec §8.4). Edit the API schemas, not this file.
 */
`;

async function main() {
  if (!schemaUrl.startsWith('http')) {
    throw new Error(
      `No schema URL. Set VITE_API_BASE_URL (or SCHEMA_URL) to the API origin. ` +
        `Resolved: "${schemaUrl}"`,
    );
  }

  console.log(`Fetching schema from ${schemaUrl} …`);
  const response = await fetch(schemaUrl, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`GET ${schemaUrl} failed with ${response.status}`);
  }

  const schema = await response.json();
  const body = await compile(schema, 'Content', {
    bannerComment: '',
    style: { singleQuote: true },
  });

  await writeFile(OUTPUT, `${HEADER}\n${body}`, 'utf8');
  console.log(`Wrote ${OUTPUT}`);
}

main().catch((error) => {
  console.error(`sync:types failed: ${error.message}`);
  process.exitCode = 1;
});
