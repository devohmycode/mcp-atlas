import { THEME_IDS, type ThemeId } from './taxonomy.js';

const NAME_WEIGHT = 3;
const DESCRIPTION_WEIGHT = 1;
const LABEL_WEIGHT = 2;
/** Description matches stop counting past this, so a long text cannot drown the name. */
const DESCRIPTION_CAP = 4;
/** A second theme is kept when it scores at least this much, and this share of the first. */
const SECONDARY_MIN = 3;
const SECONDARY_RATIO = 0.6;

const RULES: readonly { id: ThemeId; keywords: readonly string[] }[] = [
  { id: 'files', keywords: ['filesystem', 'files', 'file', 'folders', 'folder', 'directories', 'directory'] },
  { id: 'git', keywords: ['github', 'gitlab', 'repositories', 'repository', 'commits', 'commit', 'git'] },
  { id: 'databases', keywords: ['databases', 'database', 'postgresql', 'postgres', 'mysql', 'sqlite', 'sql'] },
  { id: 'browsers', keywords: ['puppeteer', 'playwright', 'browsers', 'browser', 'chromium', 'chrome'] },
  { id: 'search', keywords: ['searches', 'searching', 'search'] },
  { id: 'memory', keywords: ['memories', 'memory', 'remember'] },
  { id: 'design', keywords: ['figma', 'sketch', 'design'] },
  { id: 'productivity', keywords: ['calendar', 'email', 'notion', 'slack', 'todo'] },
];

const COMPILED = RULES.map((rule) => ({
  id: rule.id,
  re: new RegExp(`(?<![a-z0-9])(?:${rule.keywords.join('|')})(?![a-z0-9])`, 'gi'),
}));

const LABEL_TO_THEME = new Map<string, ThemeId>();
for (const rule of RULES) {
  LABEL_TO_THEME.set(rule.id, rule.id);
  for (const keyword of rule.keywords) LABEL_TO_THEME.set(keyword, rule.id);
}

const THEME_INDEX = new Map<ThemeId, number>(THEME_IDS.map((id, index) => [id, index]));

export interface Classifiable {
  name?: string;
  description?: string;
  labels?: readonly string[];
}

/** One or two theme ids, primary first. `other` when nothing matches. */
export function classify(input: Classifiable): ThemeId[] {
  const scores = score(input);
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1] || index(a[0]) - index(b[0]));
  const first = ranked[0];
  if (!first) return ['other'];
  const themes: ThemeId[] = [first[0]];
  const second = ranked[1];
  if (second && second[1] >= SECONDARY_MIN && second[1] >= first[1] * SECONDARY_RATIO) themes.push(second[0]);
  return themes;
}

function score(input: Classifiable): Map<ThemeId, number> {
  const name = normalize(input.name ?? '');
  const description = normalize(input.description ?? '');
  const scores = new Map<ThemeId, number>();
  for (const { id, re } of COMPILED) {
    const value = count(re, name) * NAME_WEIGHT + Math.min(count(re, description), DESCRIPTION_CAP) * DESCRIPTION_WEIGHT;
    if (value > 0) scores.set(id, value);
  }
  for (const label of input.labels ?? []) {
    const theme = LABEL_TO_THEME.get(label.toLowerCase());
    if (!theme) continue;
    scores.set(theme, (scores.get(theme) ?? 0) + LABEL_WEIGHT);
  }
  return scores;
}

/** The `io.github.` namespace is not a sign that the server is about Git. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/io\.github\./g, ' ').replace(/[_\-./]+/g, ' ');
}

function count(re: RegExp, text: string): number {
  if (!text) return 0;
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text)) n += 1;
  return n;
}

function index(id: ThemeId): number {
  return THEME_INDEX.get(id) ?? THEME_IDS.length;
}
