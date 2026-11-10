/** Subprocess linking on real-layout fixtures (IMP-04). Lives here because it needs the importer. */
import { describe, expect, it } from 'vitest';
import { readFixture } from '@bpmap/fixtures';
import { linkSubprocesses, resolveSubprocess, type ProcessDefinition } from '@bpmap/model';
import { importWorkbook } from './index.ts';

const load = (f: Parameters<typeof readFixture>[0]): ProcessDefinition => {
  const r = importWorkbook(readFixture(f), { importedAt: 'x' });
  if (r.status !== 'ok') throw new Error(f);
  return r.definition;
};
const hire = load('hireWithSubprocesses');
const pch = load('proposeCompensationHire');
const cj = load('workdayLayout');

describe('subprocess linking (IMP-04)', () => {
  it('subprocess steps no longer warn about a missing security group', () => {
    expect(hire.warnings.filter((w) => w.code === 'W-GROUP-EMPTY')).toEqual([]);
  });

  it('links a loaded subprocess by "Process (Variant)" and lists the missing one', () => {
    const links = linkSubprocesses([hire, pch, cj]);
    expect(links.map((l) => [l.stepOrder, l.name, l.toId])).toEqual([
      ['c', 'Propose Compensation Hire (Default Definition)', pch.id],
      ['d', 'Request Onboarding (Default Definition)', undefined],
    ]);
  });

  it('nothing is linked when only the parent is loaded', () => {
    expect(linkSubprocesses([hire]).every((l) => !l.toId)).toBe(true);
  });

  it('falls back to the process name, then the task name, and never links to itself', () => {
    const other = { ...pch, id: 'x', variant: 'Netherlands' };
    expect(resolveSubprocess('Propose Compensation Hire', '', [other], 'self')).toBe('x'); // no variant given
    expect(resolveSubprocess('Something renamed', 'Propose Compensation Hire', [other], 'self')).toBe('x'); // by task
    expect(resolveSubprocess('Propose Compensation Hire (Default Definition)', '', [pch, other], 'self')).toBe(pch.id); // exact wins
    expect(resolveSubprocess('Propose Compensation Hire', '', [pch, other], 'self')).toBeUndefined(); // ambiguous: two variants
    expect(resolveSubprocess('Hire (Default Definition)', '', [hire], hire.id)).toBeUndefined();
  });
});
