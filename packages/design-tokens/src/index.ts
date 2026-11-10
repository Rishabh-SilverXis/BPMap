/**
 * Design tokens (Design System §3). TypeScript is the source of truth for the canvas and the
 * exporters; `tokens.css` mirrors the semantic layer for Tailwind and is kept in sync by
 * `tokens.test.ts` (DEC-012).
 *
 * Reserved meanings (Design System §3.1): amber = conditional logic only, violet = AI only.
 */
export const primitive = {
  navy: { 50: '#EEF2FA', 100: '#DCE4F2', 300: '#8FB0E8', 500: '#3B5F99', 600: '#2F5D9E', 800: '#14284B', 900: '#0B1B36' },
  teal: { 50: '#E9F7F4', 100: '#CCFBF1', 300: '#5EEAD4', 600: '#0F9D8A', 700: '#0B6E63' },
  amber: { 100: '#FEF3C7', 500: '#F59E0B', 600: '#D97706', 700: '#B45309', 800: '#92400E' },
  violet: { 50: '#F5F3FF', 300: '#C4B5FD', 700: '#6D28D9' },
  slate: { 50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0', 300: '#CBD5E1', 400: '#94A3B8', 500: '#64748B', 600: '#475569', 700: '#334155', 800: '#1E293B', 900: '#0F172A' },
  green: { 400: '#4ADE80', 600: '#16A34A', 700: '#15803D' },
  red: { 100: '#FEE2E2', 400: '#F87171', 600: '#DC2626', 800: '#991B1B' },
  sky: { 100: '#E0F2FE', 300: '#7DD3FC', 800: '#075985' },
  todoBorder: '#3E9C90',
} as const;

const p = primitive;

export const semantic = {
  light: {
    bg: p.slate[50], surface: '#FFFFFF', 'surface-sunken': p.slate[100], border: p.slate[200], 'border-strong': p.slate[500],
    text: p.slate[900], 'text-secondary': p.slate[600], 'text-muted': p.slate[500],
    primary: p.navy[800], 'on-primary': '#FFFFFF', action: p.teal[700], 'on-action': '#FFFFFF', accent: p.teal[600], focus: p.navy[600],
    conditional: p.amber[600], 'conditional-subtle': p.amber[100], 'on-conditional-subtle': p.amber[800],
    ai: p.violet[700], 'ai-subtle': p.violet[50], success: p.green[700], danger: p.red[600], warning: p.amber[700], info: p.sky[800],
    'diff-modified': p.navy[600],
  },
  dark: {
    bg: '#0B1220', surface: '#111A2E', 'surface-sunken': '#0E1728', border: p.slate[700], 'border-strong': '#7B8BA3',
    text: p.slate[200], 'text-secondary': p.slate[400], 'text-muted': '#7B8BA3',
    primary: p.navy[500], 'on-primary': '#FFFFFF', action: p.teal[300], 'on-action': '#0B1220', accent: p.teal[300], focus: p.navy[300],
    conditional: p.amber[500], 'conditional-subtle': '#3A2A0B', 'on-conditional-subtle': '#FCD34D',
    ai: p.violet[300], 'ai-subtle': '#221A3D', success: p.green[400], danger: p.red[400], warning: '#FBBF24', info: p.sky[300],
    'diff-modified': '#93C5FD',
  },
} as const;

export type Theme = keyof typeof semantic;
export type SemanticToken = keyof typeof semantic.light;

/** Diagram notation tokens (Design System §3.3), resolved per theme. */
export function nodeTokens(theme: Theme) {
  const s = semantic[theme];
  const sys = theme === 'light' ? { bg: p.slate[100], border: p.slate[500], text: p.slate[600] } : { bg: '#16223A', border: '#7B8BA3', text: p.slate[400] };
  return {
    initiation: { bg: s.primary, border: s.primary, text: s['on-primary'], meta: theme === 'light' ? p.slate[300] : p.slate[200] },
    approval: { bg: s.primary, border: theme === 'light' ? s.primary : s['border-strong'], text: s['on-primary'], meta: theme === 'light' ? p.slate[300] : p.slate[200] },
    action: { bg: s.surface, border: s['border-strong'], text: s.text, meta: s['text-secondary'] },
    todo: { bg: theme === 'light' ? p.teal[50] : '#10302C', border: p.todoBorder, text: s.text, meta: s['text-secondary'] },
    system: { ...sys, meta: sys.text },
    conditionalBorder: s.conditional,
    conditionBadge: { bg: s['conditional-subtle'], text: s['on-conditional-subtle'] },
    lane: { bg: s.surface, bgAlt: s['surface-sunken'], line: s.border },
    laneHeader: { bg: theme === 'light' ? p.navy[50] : '#16223A', text: theme === 'light' ? s.primary : s.text, systemBg: theme === 'light' ? p.slate[100] : '#0E1728' },
    edge: theme === 'light' ? p.slate[500] : '#7B8BA3',
    edgeSkip: s.conditional,
    parallelBar: theme === 'light' ? s.primary : p.navy[300],
    completion: p.green[600],
    stageHeader: s['text-muted'],
    focus: s.focus,
  };
}
export type NodeTokens = ReturnType<typeof nodeTokens>;

/** Canvas typography (Design System §4.3), in px at 100% zoom. */
export const canvasType = {
  family: 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif',
  laneHeader: { size: 12, weight: 600, line: 16 },
  stageHeader: { size: 11, weight: 600, line: 14 },
  kind: { size: 10, weight: 700, line: 12 },
  title: { size: 13, weight: 600, line: 17 },
  meta: { size: 11, weight: 400, line: 14 },
  badge: { size: 10, weight: 700, line: 12 },
} as const;
