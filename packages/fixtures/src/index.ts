/**
 * Fixture registry (Architecture §21, fixture policy). Node-only helpers for tests.
 * All current fixtures are SYNTHETIC (see scripts/make-fixtures.mjs); replace or extend with
 * anonymised real exports as design partners provide them.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FIXTURES = {
  changeJob: 'change-job-synthetic.xlsx',
  changeJobRenamed: 'change-job-renamed-headers.xlsx',
  unknownLayout: 'unknown-layout.xlsx',
} as const;

export type FixtureName = keyof typeof FIXTURES;

export const fixturePath = (name: FixtureName): string => fileURLToPath(new URL(`../data/${FIXTURES[name]}`, import.meta.url));

export const readFixture = (name: FixtureName): Uint8Array => new Uint8Array(readFileSync(fixturePath(name)));
