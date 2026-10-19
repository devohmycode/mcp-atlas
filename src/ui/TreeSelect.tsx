import { Box, Text, useInput } from 'ink';
import { useMemo, useRef, useState } from 'react';
import { auditServer, type AuditStatus } from '../audit.js';
import { openBrowser } from '../browser.js';
import { formatNumber, t, themeLabel } from '../i18n/index.js';
import type { InstalledEntry } from '../manage.js';
import { commandText } from '../review.js';
import type { RiskLevel } from '../risk.js';
import { hasCommand, searchServers, SORT_ORDERS, type SortOrder } from '../search.js';
import type { Scope, Server, Theme } from '../types.js';
import { ACCENT, BOX, Hints, Panel, useTerminalSize, type Hint } from './Layout.js';
import { isMouseInput, useListMouse } from './mouse.js';
import { TERMINAL_PALETTE as PALETTE } from './palette.js';
import { fit, padStart, width, wrapLines } from './width.js';

type Row = { kind: 'theme'; theme: Theme; servers: Server[]; expanded: boolean } | { kind: 'server'; server: Server; themeId: string };

/** What the tree leaves behind when it submits, so that the next one opens where this one was. */
export interface TreeMemory {
  expanded?: Set<string>;
  /** Key of the focused row. */
  focus?: string;
}

/** Theme of the servers found in the client files, shown first. */
export const INSTALLED_THEME: Theme = { id: 'installed', label: 'Already installed' };

function rowKey(r: Row): string {
  return r.kind === 'theme' ? `t:${r.theme.id}` : `s:${r.themeId}:${r.server.id}`;
}

export interface TreeSelectProps {
  themes: Theme[];
  servers: Server[];
  initialSelected?: string[];
  /** Installed servers: ticked at start, unticking one means uninstalling it (from every scope). */
  installed?: Map<string, InstalledEntry>;
  /** Scopes read for installed servers, shown in the status line. */
  scopes?: Scope[];
  initialSort?: SortOrder;
  initialSearch?: string;
  initialOfficial?: boolean;
  /** Start with only the servers that have something to install, toggled with `i`. */
  initialInstallable?: boolean;
  /** Installed server ids with a newer catalog version, marked for update with `u`. */
  updates?: Set<string>;
  onSubmit: (ids: string[], update?: string[]) => void;
  onCancel: () => void;
  memory?: TreeMemory;
  /** The README shown by `p`. */
  loadPreview?: (server: Server) => Promise<string>;
}

/** Lines used around the list: header, status, search, details panel, hints (may wrap). */
const CHROME_LINES = 17;
const WHEEL_STEP = 3;
/** Clicks up to this screen column on a theme row hit its checkbox (padding, pointer, arrow, box). */
const THEME_BOX_COLUMN = 7;
const OFFICIAL_MARK = '◆';
const RISK_MARK = '⚠';
const NO_COMMAND_MARK = '∅';
const UPDATE_MARK = '↑';
const EMPTY_INSTALLED = new Map<string, InstalledEntry>();
const NO_UPDATES = new Set<string>();

/** Groups in theme order; a server shows under each of its themes, `other` when it has none. */
function groupByTheme(themes: Theme[], servers: Server[]): { theme: Theme; servers: Server[] }[] {
  const byTheme = new Map<string, Server[]>();
  for (const server of servers) {
    for (const id of server.themes.length ? server.themes : ['other']) {
      const list = byTheme.get(id);
      if (list) list.push(server);
      else byTheme.set(id, [server]);
    }
  }
  return themes.filter((theme) => byTheme.has(theme.id)).map((theme) => ({ theme, servers: byTheme.get(theme.id)! }));
}

/** Theme headers, each followed by its servers when open (always open during a search). */
function buildRows(groups: { theme: Theme; servers: Server[] }[], expanded: Set<string>, filter: string): Row[] {
  const out: Row[] = [];
  for (const g of groups) {
    const open = filter !== '' || expanded.has(g.theme.id);
    out.push({ kind: 'theme', theme: g.theme, servers: g.servers, expanded: open });
    if (open) for (const server of g.servers) out.push({ kind: 'server', server, themeId: g.theme.id });
  }
  return out;
}

const nameOf = (server: Server) => server.title || server.name;

/** Audited only when a row is drawn or ticked, once per server: the catalog holds too many to audit up front. */
const auditCache = new WeakMap<Server, AuditStatus>();
function auditOf(server: Server): AuditStatus {
  let status = auditCache.get(server);
  if (status === undefined) auditCache.set(server, (status = auditServer(server).status));
  return status;
}
/** `unaudited` means the fiche has no package and no remote: there is nothing to install. */
const installable = (server: Server) => auditOf(server) !== 'unaudited';

/** "project", "global" or "project + global". */
export function scopesLabel(scopes: Scope[]): string {
  return scopes.map((sc) => t().tree.where[sc]).join(' + ');
}

export function TreeSelect({
  themes,
  servers,
  initialSelected = [],
  installed = EMPTY_INSTALLED,
  scopes,
  initialSort,
  initialSearch = '',
  initialOfficial = false,
  initialInstallable = false,
  onSubmit,
  onCancel,
  memory,
  updates = NO_UPDATES,
  loadPreview,
}: TreeSelectProps) {
  const m = t();
  const { columns, rows: termRows } = useTerminalSize();
  const [expanded, setExpandedState] = useState<Set<string>>(() => new Set(memory?.expanded));
  const [selected, setSelectedState] = useState<Set<string>>(new Set(initialSelected));
  const [toUpdate, setToUpdateState] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ server: Server; text?: string; error?: string; top: number } | null>(null);
  const previews = useRef(new Map<string, string>());
  const [cursor, setCursorState] = useState(0);
  const [filter, setFilterState] = useState(initialSearch);
  const [editingFilter, setEditingFilterState] = useState(false);
  const [sort, setSort] = useState<SortOrder>(initialSort ?? 'official');
  const [officialOnly, setOfficialOnly] = useState(initialOfficial);
  const [installableOnly, setInstallableOnly] = useState(initialInstallable);
  // Keys can arrive faster than renders (held arrows, pasted input): handlers read and write through a ref.
  const live = useRef({ expanded, selected, toUpdate, cursor, filter, editingFilter, sort, officialOnly, installableOnly });
  const setExpanded = (next: Set<string>) => {
    live.current.expanded = next;
    setExpandedState(next);
  };
  const setSelected = (next: Set<string>) => {
    live.current.selected = next;
    setSelectedState(next);
  };
  const setToUpdate = (next: Set<string>) => {
    live.current.toUpdate = next;
    setToUpdateState(next);
  };
  const setCursor = (next: number) => {
    live.current.cursor = next;
    setCursorState(next);
  };
  const setFilter = (next: string) => {
    live.current.filter = next;
    setFilterState(next);
  };
  const setEditingFilter = (next: boolean) => {
    live.current.editingFilter = next;
    setEditingFilterState(next);
  };


  // Render and input handlers share the view: a sort or filter key changes what the next key sees.
  const viewCache = useRef<{ key: string; groups: ReturnType<typeof groupByTheme>; visible: Server[] } | undefined>(undefined);
  const getView = (sort: SortOrder, officialOnly: boolean, filter: string, installableOnly = live.current.installableOnly) => {
    const key = `${sort}\u0000${officialOnly}\u0000${installableOnly}\u0000${filter}`;
    if (viewCache.current?.key === key) return viewCache.current;
    // Installed servers stay, so that they can still be unticked.
    const visible = searchServers(servers, { query: filter, official: officialOnly, sort }).filter((s) => !installableOnly || installed.has(s.id) || hasCommand(s));
    const view = { key, visible, groups: groupByTheme(themes, visible) };
    viewCache.current = view;
    return view;
  };
  const { visible, groups } = getView(sort, officialOnly, filter, installableOnly);

  const rowCache = useRef<{ groups: ReturnType<typeof groupByTheme>; expanded: Set<string>; filter: string; rows: Row[] } | undefined>(undefined);
  const getRows = (open: Set<string>, groups: ReturnType<typeof groupByTheme>, filter: string) => {
    const cached = rowCache.current;
    if (cached?.groups === groups && cached.expanded === open && cached.filter === filter) return cached.rows;
    const rows = buildRows(groups, open, filter);
    rowCache.current = { groups, expanded: open, filter, rows };
    return rows;
  };
  const rows = getRows(expanded, groups, filter);
  // Back from a run: focus the row that was focused, wherever the list now puts it.
  const restored = useRef(false);
  if (!restored.current) {
    restored.current = true;
    const index = memory?.focus ? rows.findIndex((r) => rowKey(r) === memory.focus) : -1;
    if (index > 0) {
      live.current.cursor = index;
      setCursorState(index);
    }
  }

  const { toInstall, toRemove, checkedByTheme } = useMemo(() => {
    let toInstall = 0;
    let toRemove = 0;
    for (const id of selected) if (!installed.has(id)) toInstall++;
    for (const id of installed.keys()) if (!selected.has(id)) toRemove++;
    const checkedByTheme = new Map(groups.map((g) => [g.theme.id, g.servers.reduce((n, s) => n + Number(selected.has(s.id)), 0)]));
    return { toInstall, toRemove, checkedByTheme };
  }, [selected, installed, groups]);

  const height = Math.max(5, termRows - CHROME_LINES);
  const current = Math.min(cursor, Math.max(0, rows.length - 1));
  const top = Math.max(0, Math.min(current - Math.floor(height / 2), rows.length - height));
  const row = rows[current];

  // Columns of server rows: cursor+indent+marks (8), name, id, status, risk.
  const riskW = 2;
  const statusW = Math.max(width(scopesLabel(['project', 'user'])), width(m.tree.toRemove), width(m.tree.updateAvailable)) + 3;
  const nameW = Math.max(18, Math.min(40, Math.floor(columns * 0.3)));
  const idW = Math.max(0, columns - 2 - 8 - nameW - 2 - statusW - 2 - riskW - 1);

  const liveRows = () => getRows(live.current.expanded, getView(live.current.sort, live.current.officialOnly, live.current.filter).groups, live.current.filter);
  const liveCurrent = (list: Row[]) => Math.min(live.current.cursor, Math.max(0, list.length - 1));
  const focusedRow = () => {
    const list = liveRows();
    return list[liveCurrent(list)];
  };
  const move = (delta: number) => {
    const list = liveRows();
    setCursor(Math.max(0, Math.min(list.length - 1, liveCurrent(list) + delta)));
  };
  const setOpen = (themeId: string, open: boolean) => {
    if (live.current.expanded.has(themeId) === open) return;
    const next = new Set(live.current.expanded);
    if (open) next.add(themeId);
    else next.delete(themeId);
    setExpanded(next);
  };
  /** Marks the outdated ones among `ids` for update, or unmarks them all when they all are. */
  const toggleUpdate = (ids: string[]) => {
    const outdated = ids.filter((id) => updates.has(id));
    if (!outdated.length) return;
    const next = new Set(live.current.toUpdate);
    const allOn = outdated.every((id) => next.has(id));
    for (const id of outdated) {
      if (allOn) next.delete(id);
      else next.add(id);
    }
    setToUpdate(next);
  };
  const pickable = (list: Server[]) => list.filter((server) => installed.has(server.id) || installable(server)).map((server) => server.id);
  const toggle = (ids: string[]) => {
    if (!ids.length) return;
    const next = new Set(live.current.selected);
    const allOn = ids.every((id) => next.has(id));
    for (const id of ids) {
      if (allOn) next.delete(id);
      else next.add(id);
    }
    setSelected(next);
  };

  // An update only counts for a server that stays installed.
  const updating = (sel: Set<string>) => [...live.current.toUpdate].filter((id) => sel.has(id));
  const changes = (sel: Set<string>) =>
    [...sel].some((id) => !installed.has(id)) || [...installed.keys()].some((id) => !sel.has(id)) || updating(sel).length > 0;
  const toUpdateCount = [...toUpdate].filter((id) => selected.has(id)).length;
  const canSubmit = toInstall > 0 || toRemove > 0 || toUpdateCount > 0;
  const submit = () => {
    if (memory) {
      const focused = focusedRow();
      memory.expanded = live.current.expanded;
      memory.focus = focused && rowKey(focused);
    }
    const update = updating(live.current.selected);
    if (update.length) onSubmit([...live.current.selected], update);
    else onSubmit([...live.current.selected]);
  };
  const startSearch = () => setEditingFilter(true);
  const endSearch = () => setEditingFilter(false);
  const clearSearch = () => {
    setFilter('');
    setEditingFilter(false);
    setCursor(0);
  };
  const cycleSort = () => {
    const next = SORT_ORDERS[(SORT_ORDERS.indexOf(live.current.sort) + 1) % SORT_ORDERS.length]!;
    live.current.sort = next;
    setSort(next);
    setCursor(0);
  };
  const toggleInstallable = () => {
    const next = !live.current.installableOnly;
    live.current.installableOnly = next;
    setInstallableOnly(next);
    setCursor(0);
  };
  const toggleOfficial = () => {
    const next = !live.current.officialOnly;
    live.current.officialOnly = next;
    setOfficialOnly(next);
    setCursor(0);
  };
  const toggleAll = () =>
    setExpanded(live.current.expanded.size ? new Set() : new Set(getView(live.current.sort, live.current.officialOnly, live.current.filter).groups.map((g) => g.theme.id)));
  const repoOf = (r: Row | undefined) => (r?.kind === 'server' && /^https?:\/\//.test(r.server.repository?.url ?? '') ? r.server.repository!.url : undefined);
  const openRepository = () => {
    const url = repoOf(focusedRow());
    if (url) openBrowser(url);
  };
  const openPreview = () => {
    const focused = focusedRow();
    if (focused?.kind !== 'server' || !loadPreview) return;
    const server = focused.server;
    const cached = previews.current.get(server.id);
    setPreview({ server, text: cached, top: 0 });
    if (cached !== undefined) return;
    loadPreview(server).then(
      (text) => {
        previews.current.set(server.id, text);
        setPreview((p) => (p?.server === server ? { ...p, text } : p));
      },
      (err: unknown) => {
        const error = m.tree.previewFailed(err instanceof Error ? err.message : String(err));
        setPreview((p) => (p?.server === server ? { ...p, error } : p));
      },
    );
  };
  const risks = useMemo(() => (preview ? auditServer(preview.server).risks : []), [preview?.server]);
  const riskLines = 1 + Math.min(3, risks.length);
  const previewHeight = Math.max(5, termRows - 9 - riskLines);
  const previewLines = preview?.text !== undefined ? wrapLines(preview.text, Math.max(20, columns - 6)) : [];
  const scrollPreview = (delta: number) =>
    setPreview((p) => (p ? { ...p, top: Math.max(0, Math.min(p.top + delta, previewLines.length - previewHeight)) } : p));

  // Wheel moves the cursor; a click ticks a server, or opens a theme (ticks it on its checkbox).
  const { ref: listRef, hover } = useListMouse(Math.min(height, rows.length - top), (e) => {
    if (preview) {
      if (e.kind === 'wheelUp') scrollPreview(-WHEEL_STEP);
      else if (e.kind === 'wheelDown') scrollPreview(WHEEL_STEP);
      return;
    }
    if (e.kind === 'wheelUp') move(-WHEEL_STEP);
    else if (e.kind === 'wheelDown') move(WHEEL_STEP);
    if (e.kind !== 'click' || e.line < 0 || e.line >= height) return;
    const index = top + e.line;
    const r = rows[index];
    if (!r) return;
    setEditingFilter(false);
    setCursor(index);
    if (r.kind === 'server') toggle(pickable([r.server]));
    else if (e.x <= THEME_BOX_COLUMN) toggle(pickable(r.servers));
    else setOpen(r.theme.id, !r.expanded);
  });

  useInput((input, key) => {
    if (isMouseInput(input)) return;
    if (preview) {
      if (key.upArrow || input === 'k') scrollPreview(-1);
      else if (key.downArrow || input === 'j') scrollPreview(1);
      else if (key.pageUp) scrollPreview(-previewHeight);
      else if (key.pageDown || input === ' ') scrollPreview(previewHeight);
      else if (key.escape || key.return || input === 'p' || input === 'q') setPreview(null);
      return;
    }
    if (live.current.editingFilter) {
      if (key.return) endSearch();
      else if (key.escape) clearSearch();
      else if (key.backspace || key.delete) setFilter(live.current.filter.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setFilter(live.current.filter + input);
      setCursor(0);
      return;
    }
    const row = focusedRow();
    if (key.upArrow || input === 'k') move(-1);
    else if (key.downArrow || input === 'j') move(1);
    else if (key.pageUp) move(-height);
    else if (key.pageDown) move(height);
    else if (key.rightArrow && row?.kind === 'theme') setOpen(row.theme.id, true);
    else if (key.leftArrow && row) {
      const themeId = row.kind === 'theme' ? row.theme.id : row.themeId;
      setOpen(themeId, false);
      setCursor(liveRows().findIndex((r) => r.kind === 'theme' && r.theme.id === themeId));
    } else if (input === ' ' && row) toggle(pickable(row.kind === 'server' ? [row.server] : row.servers));
    else if (input === '/') startSearch();
    else if (input === 's') cycleSort();
    else if (input === 'o') toggleOfficial();
    else if (input === 'i') toggleInstallable();
    else if (input === 'a') toggleAll();
    else if (input === 'g') openRepository();
    else if (input === 'p') openPreview();
    else if (input === 'u' && row) toggleUpdate(row.kind === 'server' ? [row.server.id] : row.servers.map((s) => s.id));
    else if (input === 'U') toggleUpdate([...updates]);
    else if (key.escape && live.current.filter) setFilter('');
    else if (key.return && changes(live.current.selected)) submit();
    else if (key.return && row?.kind === 'theme') setOpen(row.theme.id, !row.expanded);
    else if (input === 'q' || key.escape) onCancel();
  });

  const hints: Hint[] = editingFilter
    ? [
        [m.keyNames.enter, m.keys.done, endSearch],
        [m.keyNames.esc, m.keys.clear, clearSearch],
      ]
    : [
        [m.keyNames.space, m.keys.toggle],
        ['/', m.keys.search, startSearch],
        ...(filter ? [[m.keyNames.esc, m.keys.clear, clearSearch] as Hint] : []),
        ['a', m.keys.expandAll, toggleAll],
        ['s', m.keys.sort, cycleSort],
        ['o', m.keys.official, toggleOfficial],
        ['i', m.keys.installable, toggleInstallable],
        ...(row?.kind === 'server' && loadPreview ? [['p', m.keys.preview, openPreview] as Hint] : []),
        ...(repoOf(row) ? [['g', 'GitHub', openRepository] as Hint] : []),
        ...(updates.size ? [['u', m.keys.update] as Hint, ['U', m.keys.updateAll, () => toggleUpdate([...updates])] as Hint] : []),
        [m.keyNames.enter, m.keys.continue, canSubmit ? submit : undefined],
        ['q', m.keys.quit, onCancel],
      ];

  if (preview) {
    const s = preview.server;
    const shown = previewLines.slice(preview.top, preview.top + previewHeight);
    const levelColor: Record<RiskLevel, string> = { high: PALETTE.danger, medium: PALETTE.gold, info: PALETTE.muted };
    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text bold>{nameOf(s)}</Text>
            <Text dimColor>{`  ${s.id}`}</Text>
          </Text>
          {previewLines.length > previewHeight && (
            <Text dimColor>{m.tree.position(formatNumber(preview.top + 1), formatNumber(previewLines.length))}</Text>
          )}
        </Box>
        <Box flexDirection="column">
          {risks.length ? (
            <Text color={levelColor[risks[0]!.level]} bold>{`⚠ ${m.tree.risksFound(risks.length)}`}</Text>
          ) : (
            <Text color={PALETTE.success}>{`✓ ${m.tree.noRisk}`}</Text>
          )}
          {risks.slice(0, 3).map((r) => (
            <Text key={r.code} wrap="truncate-end" color={levelColor[r.level]}>
              {`  ${m.tree.riskLevels[r.level]} · ${r.detail}`}
            </Text>
          ))}
        </Box>
        <Panel>
          <Box ref={listRef} flexDirection="column" height={previewHeight}>
            {preview.error ? (
              <Text color={PALETTE.danger}>{preview.error}</Text>
            ) : preview.text === undefined ? (
              <Text color={PALETTE.gold}>{m.tree.previewLoading}</Text>
            ) : (
              shown.map((line, i) => <Text key={preview.top + i}>{line || ' '}</Text>)
            )}
          </Box>
        </Panel>
        <Hints
          items={[
            ['↑↓', m.keys.move],
            [m.keyNames.esc, m.keys.back, () => setPreview(null)],
          ]}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text>
          <Text bold>{m.tree.servers(formatNumber(visible.length))}</Text>
          <Text dimColor>{'   '}</Text>
          <Text color={PALETTE.success}>
            {BOX.on} {m.tree.selected(selected.size)}
          </Text>
          {(toInstall > 0 || toRemove > 0) && (
            <Text>
              {'   '}
              <Text color={PALETTE.success}>+{toInstall}</Text> <Text color={PALETTE.danger}>−{toRemove}</Text>
            </Text>
          )}
          {toUpdateCount > 0 && <Text color={PALETTE.gold}>{` ${UPDATE_MARK}${toUpdateCount}`}</Text>}
          {updates.size > 0 && <Text color={PALETTE.gold}>{`   ${UPDATE_MARK} ${m.tree.updates(updates.size)}`}</Text>}
          {scopes && <Text dimColor>{`   ${m.tree.scope(scopesLabel(scopes))}`}</Text>}
          <Text dimColor>{`   ${m.tree.sortedBy(m.tree.sort[sort])}`}</Text>
          {officialOnly && <Text color={PALETTE.lavender}>{`   ${OFFICIAL_MARK} ${m.tree.officialOnly}`}</Text>}
          {installableOnly && <Text color={PALETTE.accent}>{`   ${m.tree.installableOnly}`}</Text>}
        </Text>
        <Text dimColor>{rows.length ? m.tree.position(formatNumber(current + 1), formatNumber(rows.length)) : ''}</Text>
      </Box>

      <Text>
        <Text color={editingFilter ? ACCENT : PALETTE.muted}>/ {m.tree.searchLabel}: </Text>
        {filter ? <Text color={PALETTE.gold}>{filter}</Text> : editingFilter ? <Text dimColor>{m.tree.searchPlaceholder}</Text> : null}
        {editingFilter && <Text color={ACCENT}>▌</Text>}
      </Text>

      <Box ref={listRef} flexDirection="column" height={height} marginTop={1}>
        {rows.slice(top, top + height).map((r, i) => {
          const focused = top + i === current;
          const hovered = i === hover && !focused;
          const pointer = <Text color={ACCENT}>{focused ? '❯ ' : hovered ? '› ' : '  '}</Text>;
          if (r.kind === 'theme') {
            const n = checkedByTheme.get(r.theme.id) ?? 0;
            const box = n === 0 ? BOX.off : n === r.servers.length ? BOX.on : BOX.some;
            return (
              <Box key={rowKey(r)} justifyContent="space-between">
                <Text wrap="truncate-end">
                  {pointer}
                  <Text dimColor>{r.expanded ? '▾ ' : '▸ '}</Text>
                  <Text color={n ? PALETTE.success : undefined}>{box} </Text>
                  <Text bold underline={hovered} color={focused || hovered ? ACCENT : undefined}>
                    {themeLabel(r.theme)}
                  </Text>
                </Text>
                <Text>
                  {n > 0 && <Text color={PALETTE.success}>{`${formatNumber(n)} ✓   `}</Text>}
                  <Text dimColor>{padStart(formatNumber(r.servers.length), 7)}</Text>
                </Text>
              </Box>
            );
          }
          const s = r.server;
          const isOn = selected.has(s.id);
          const entry = installed.get(s.id);
          const outdated = isOn && updates.has(s.id);
          const status = !entry
            ? ''
            : !isOn
              ? `✗ ${m.tree.toRemove}`
              : outdated
                ? `${UPDATE_MARK} ${toUpdate.has(s.id) ? m.tree.toUpdate : m.tree.updateAvailable}`
                : `● ${scopesLabel(entry.scopes)}`;
          return (
            <Text key={rowKey(r)} wrap="truncate-end">
              {pointer}
              {'  '}
              <Text color={PALETTE.lavender}>{s.official ? OFFICIAL_MARK : ' '} </Text>
              <Text color={entry && !isOn ? PALETTE.danger : isOn ? PALETTE.success : PALETTE.muted}>{isOn ? BOX.on : BOX.off} </Text>
              <Text bold={focused} underline={hovered} color={focused || hovered ? ACCENT : undefined}>
                {fit(nameOf(s), nameW)}
              </Text>
              <Text dimColor>{`  ${fit(s.id, idW)}`}</Text>
              <Text color={entry && !isOn ? PALETTE.danger : outdated ? PALETTE.gold : PALETTE.accent}>{`  ${fit(status, statusW)}`}</Text>
              {auditOf(s) === 'unaudited' ? (
                <Text dimColor>{padStart(NO_COMMAND_MARK, riskW)}</Text>
              ) : (
                <Text color={PALETTE.danger}>{padStart(auditOf(s) === 'fail' ? RISK_MARK : '', riskW)}</Text>
              )}
            </Text>
          );
        })}
      </Box>

      <Panel>
        {row?.kind === 'server' ? (
          <>
            <Text wrap="truncate-end">
              <Text bold>{nameOf(row.server)}</Text>
              <Text dimColor>{`  ${row.server.id}`}</Text>
              {row.server.official && <Text color={PALETTE.lavender}>{`  ${OFFICIAL_MARK} ${m.tree.official}`}</Text>}
              {installed.has(row.server.id) && (
                <Text color={PALETTE.accent}>{`  ● ${m.tree.installedIn(scopesLabel(installed.get(row.server.id)!.scopes))}`}</Text>
              )}
              {installed.has(row.server.id) && <Text dimColor>{`  → ${installed.get(row.server.id)!.clients.join(', ')}`}</Text>}
            </Text>
            <Box height={2} overflow="hidden">
              <Text wrap="wrap">{row.server.description ?? m.tree.noDescription}</Text>
            </Box>
            <Text dimColor wrap="truncate-end">{`$ ${commandText(row.server)}`}</Text>
          </>
        ) : row ? (
          <>
            <Text>
              <Text bold>{themeLabel(row.theme)}</Text>
              <Text dimColor>{`  ${m.tree.servers(formatNumber(row.servers.length))}`}</Text>
            </Text>
            <Box height={3}>
              <Text dimColor>{row.theme.description ?? m.tree.groupHint}</Text>
            </Box>
          </>
        ) : (
          <Box height={4}>
            <Text dimColor>{m.tree.noMatch}</Text>
          </Box>
        )}
      </Panel>

      <Hints items={hints} />
    </Box>
  );
}
