import { Box, Text, useApp, useInput } from 'ink';
import { useEffect, useState, type ReactNode } from 'react';
import { auditServer, failsAudit, type AuditResult } from '../audit.js';
import { t } from '../i18n/index.js';
import { clientsIn, type InstalledEntry } from '../manage.js';
import { commandText } from '../review.js';
import type { SortOrder } from '../search.js';
import { SCOPES, type ClientId, type Scope, type Server, type Theme } from '../types.js';
import { ACCENT, Banner, Header, Hints, Panel, useTerminalSize, type Hint, type StepId } from './Layout.js';
import { ListSelect } from './ListSelect.js';
import { isMouseInput } from './mouse.js';
import { TERMINAL_PALETTE as PALETTE } from './palette.js';
import { INSTALLED_THEME, scopesLabel, TreeSelect, type TreeMemory } from './TreeSelect.js';
import { padEnd } from './width.js';

export interface InstallChoice {
  agents: ClientId[];
  scope: Scope;
}

export interface WizardResult {
  /** Servers to install. */
  ids: string[];
  /** Installed servers to uninstall, from every scope they are in. */
  remove: { id: string; scopes: Scope[] }[];
  /** Installed servers to rewrite at the catalog version. */
  update: string[];
  options: InstallChoice;
  /** The user asked for the full catalog: download it, then show the tree again. */
  refresh?: boolean;
}

export interface InstalledState {
  installed: Map<string, InstalledEntry>;
  /** Installed server ids whose pin is older than the catalog's. */
  updates: Set<string>;
}

export interface AppProps {
  themes: Theme[];
  servers: Server[];
  /** Every catalog server, to show installed ones that the filters hide. */
  allServers?: Server[];
  /** Options given on the command line: their prompts are skipped. */
  preset: Partial<InstallChoice>;
  /** Pre-filled values for the prompts (remembered choices, detected clients). */
  defaults: InstallChoice;
  detectedAgents?: ClientId[];
  /** Servers already chosen (the `install` command): the tree is skipped. */
  initialIds?: string[];
  sort?: SortOrder;
  search?: string;
  official?: boolean;
  installable?: boolean;
  /** Reads the client files of these scopes, to pre-tick what is installed. */
  loadInstalled?: (scopes: Scope[]) => Promise<InstalledState>;
  /** Summary of the previous run, shown above the tree. */
  notice?: string;
  treeMemory?: TreeMemory;
  /** Run the security audit on the review screen (on unless turned off). */
  audit?: boolean;
  loadPreview?: (server: Server) => Promise<string>;
  onDone: (result: WizardResult | null) => void;
}

type Step = 'loading' | 'tree' | 'scope' | 'agents' | 'confirm';
const ORDER: Step[] = ['loading', 'tree', 'scope', 'agents', 'confirm'];
const STEP_OF: Record<Step, StepId> = { loading: 'select', tree: 'select', scope: 'scope', agents: 'agents', confirm: 'confirm' };
/** The big logo needs about this many rows on top of the step content. */
const BANNER_MIN_ROWS = 26;

interface Answers {
  hasTree: boolean;
  installs: number;
}

/** First step after `from` (or the very first one) that still needs an answer. */
function nextStep(from: Step | undefined, preset: AppProps['preset'], a: Answers): Step {
  for (const s of ORDER.slice(from ? ORDER.indexOf(from) + 1 : 0)) {
    if ((s === 'loading' || s === 'tree') && a.hasTree) return s;
    // Scope and clients only matter for servers to install, not for removals or updates.
    if (s === 'scope' && !preset.scope && a.installs > 0) return s;
    if (s === 'agents' && !preset.agents && a.installs > 0) return s;
  }
  return 'confirm';
}

export function App(props: AppProps) {
  const { themes, servers, preset, defaults, detectedAgents = [], initialIds, loadInstalled, sort, search, official, installable, notice, treeMemory, audit = true, loadPreview, onDone } = props;
  const m = t();
  const { exit } = useApp();
  const { rows } = useTerminalSize();
  const hasTree = !initialIds;
  const [ids, setIds] = useState<string[]>(initialIds ?? []);
  const [removals, setRemovals] = useState<WizardResult['remove']>([]);
  const [updates, setUpdates] = useState<string[]>([]);
  const [agents, setAgents] = useState<ClientId[] | undefined>(preset.agents);
  const [scope, setScope] = useState<Scope | undefined>(preset.scope);
  const [state, setState] = useState<InstalledState>({ installed: new Map(), updates: new Set() });
  const [error, setError] = useState<string>();
  const [step, setStep] = useState<Step>(() => nextStep(undefined, preset, { hasTree, installs: ids.length }));
  /** Steps shown so far, for going back; leaving the first one quits. */
  const [history, setHistory] = useState<Step[]>([]);
  /** Installed servers are read in the scope given as a flag, else in both. */
  const readScopes: Scope[] = preset.scope ? [preset.scope] : [...SCOPES];

  const finish = (result: WizardResult | null) => {
    onDone(result);
    exit();
  };
  const next = (from: Step, installs = ids.length) => {
    if (from !== 'loading') setHistory((h) => [...h, from]);
    setStep(nextStep(from, preset, { hasTree, installs }));
  };
  const back = () => {
    const previous = history.at(-1);
    if (!previous) return finish(null);
    setHistory((h) => h.slice(0, -1));
    setStep(previous);
  };

  useEffect(() => {
    if (step !== 'loading') return;
    if (!loadInstalled) {
      setStep('tree');
      return;
    }
    let live = true;
    loadInstalled(readScopes)
      .then((data) => live && (setState(data), next('loading')))
      .catch((err: unknown) => {
        if (!live) return;
        setError(m.detectFailed(err instanceof Error ? err.message : String(err)));
        next('loading');
      });
    return () => {
      live = false;
    };
  }, [step]);

  const screen = (content: ReactNode) => (
    <Box flexDirection="column" paddingX={1} paddingTop={1}>
      {step !== 'tree' && history.length === 0 && rows >= BANNER_MIN_ROWS && <Banner />}
      <Header step={STEP_OF[step]} />
      {content}
    </Box>
  );

  if (step === 'loading') return screen(<Text color={PALETTE.gold}>{m.loading(scopesLabel(readScopes))}</Text>);

  if (step === 'tree') {
    const installedIds = [...state.installed.keys()];
    const removed = new Set(removals.map((r) => r.id));
    const byId = new Map(servers.map((s) => [s.id, s]));
    // Installed servers get their own group first, whatever the filters.
    const treeServers = state.installed.size
      ? servers.map((s) => (state.installed.has(s.id) ? { ...s, themes: [INSTALLED_THEME.id, ...s.themes] } : s))
      : servers;
    // Installed servers hidden by the filters still show, so that they can be unticked.
    const all = new Map((props.allServers ?? []).map((s) => [s.id, s]));
    for (const id of installedIds) {
      const server = all.get(id) ?? state.installed.get(id)!.local;
      if (!byId.has(id) && server) treeServers.push({ ...server, themes: [INSTALLED_THEME.id] });
    }
    return screen(
      <Box flexDirection="column">
        {error && <Text color={PALETTE.danger}>{error}</Text>}
        {notice && <Text>{notice}</Text>}
        <TreeSelect
          themes={state.installed.size ? [INSTALLED_THEME, ...themes] : themes}
          servers={treeServers}
          installed={state.installed}
          scopes={loadInstalled ? readScopes : undefined}
          initialSort={sort}
          initialSearch={search}
          initialOfficial={official}
          initialInstallable={installable}
          memory={treeMemory}
          updates={state.updates}
          loadPreview={loadPreview}
          initialSelected={[...ids, ...installedIds.filter((id) => !removed.has(id))]}
          onSubmit={(sel, update = []) => {
            const chosen = new Set(sel);
            const toInstall = sel.filter((id) => !state.installed.has(id));
            const toRemove = installedIds.filter((id) => !chosen.has(id));
            if (!toInstall.length && !toRemove.length && !update.length) return finish(null);
            setIds(toInstall);
            setUpdates(update);
            // An unticked server is uninstalled from every scope it was found in.
            setRemovals(toRemove.map((id) => ({ id, scopes: [...state.installed.get(id)!.scopes] })));
            next('tree', toInstall.length);
          }}
          onCancel={() => finish(null)}
          onRefresh={() => finish({ ids: [], remove: [], update: [], options: defaults, refresh: true })}
        />
      </Box>,
    );
  }

  if (step === 'scope') {
    return screen(
      <ListSelect<Scope>
        key="scope"
        title={m.scope.title}
        initial={[scope ?? defaults.scope]}
        items={[
          { value: 'project', label: m.scope.project, hint: m.scope.projectHint(process.cwd()) },
          { value: 'user', label: m.scope.global, hint: m.scope.globalHint },
        ]}
        onSubmit={([value]) => {
          setScope(value);
          next('scope');
        }}
        onCancel={back}
      />,
    );
  }

  const chosenScope = scope ?? defaults.scope;
  const available = clientsIn(chosenScope);

  if (step === 'agents') {
    const detected = new Set(detectedAgents);
    const initial = (agents ?? defaults.agents).filter((id) => available.includes(id));
    return screen(
      <ListSelect<string>
        key="agents"
        title={m.agents.title}
        multiple
        initial={initial}
        items={[
          { value: '*', label: m.agents.all, hint: `${available.length}` },
          ...available.map((id) => ({ value: id, label: id, badge: detected.has(id) ? m.agents.detected : undefined })),
        ]}
        onSubmit={(values) => {
          const chosen = values.includes('*') ? available : (values as ClientId[]);
          setAgents(chosen);
          next('agents');
        }}
        onCancel={back}
      />,
    );
  }

  const options: InstallChoice = { agents: (agents ?? defaults.agents).filter((id) => available.includes(id)), scope: chosenScope };
  const byId = new Map([...(props.allServers ?? []), ...servers].map((s) => [s.id, s]));
  return screen(
    <Confirm
      ids={ids}
      remove={removals}
      update={updates}
      options={options}
      audit={audit}
      servers={byId}
      onConfirm={(kept, keptUpdates) =>
        finish(kept.length || keptUpdates.length || removals.length ? { ids: kept, remove: removals, update: keptUpdates, options } : null)
      }
      onBack={back}
    />,
  );
}

interface ConfirmProps {
  ids: string[];
  remove: WizardResult['remove'];
  update: string[];
  options: InstallChoice;
  audit: boolean;
  servers: Map<string, Server>;
  /** What to install and update, without the servers left out after the audit. */
  onConfirm: (ids: string[], update: string[]) => void;
  onBack: () => void;
}

function Confirm({ ids, remove, update, options, audit, servers, onConfirm, onBack }: ConfirmProps) {
  const m = t();
  const audited = [...ids, ...update];
  const results: AuditResult[] = audit ? audited.flatMap((id) => (servers.has(id) ? [auditServer(servers.get(id)!)] : [])) : [];
  // Servers that fail the audit are left out, unless the user ticks them here.
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const failing = results.filter(failsAudit);
  // A fiche with no package and no remote has nothing to write: it is always left out.
  const noCommand = audited.filter((id) => servers.has(id) && auditServer(servers.get(id)!).status === 'unaudited');
  const left = new Set([...failing.map((r) => r.id).filter((id) => !keep.has(id)), ...noCommand]);
  const keptIds = ids.filter((id) => !left.has(id));
  const keptUpdates = update.filter((id) => !left.has(id));
  const confirm = () => onConfirm(keptIds, keptUpdates);
  const toggleKeep = (id: string) => {
    const next = new Set(keep);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setKeep(next);
  };
  useInput((input, key) => {
    if (isMouseInput(input)) return;
    if (key.escape || input === 'n') onBack();
    else if (key.upArrow) setCursor(Math.max(0, cursor - 1));
    else if (key.downArrow) setCursor(Math.min(failing.length - 1, cursor + 1));
    else if (input === ' ' && failing[cursor]) toggleKeep(failing[cursor]!.id);
    else if (key.return || input === 'y') confirm();
  });
  const warned = results.filter((r) => !failsAudit(r) && r.risks.some((x) => x.level === 'medium'));
  const passed = results.filter((r) => r.status === 'pass' && !r.risks.some((x) => x.level !== 'info')).length;
  const riskLine = (r: AuditResult, level: 'high' | 'medium') =>
    r.risks
      .filter((x) => x.level === level)
      .slice(0, 2)
      .map((x) => (
        <Text key={x.code} color={level === 'high' ? PALETTE.danger : PALETTE.gold} wrap="truncate-end">
          {`      ${m.tree.riskLevels[x.level]} · ${x.detail}`}
        </Text>
      ));
  const row = (label: string, value: string) => (
    <Text>
      <Text dimColor>{padEnd(label, 10)}</Text>
      {value}
    </Text>
  );
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{m.confirm.title}</Text>
      {remove.length > 0 && (
        <Panel color={PALETTE.danger} title={`− ${m.confirm.remove(remove.length)}`}>
          <Text wrap="wrap">{remove.map((r) => `${r.id} (${scopesLabel(r.scopes)})`).join('  ·  ')}</Text>
        </Panel>
      )}
      {!audit && audited.length > 0 && <Text dimColor>{`🛡 ${m.confirm.auditOff}`}</Text>}
      {failing.length > 0 && (
        <Panel color={PALETTE.danger} title={`🛡 ${m.confirm.auditFailed(failing.length)}`}>
          {failing.map((r, i) => (
            <Box key={r.id} flexDirection="column">
              <Text wrap="truncate-end">
                <Text color={ACCENT}>{i === cursor ? '❯ ' : '  '}</Text>
                <Text color={keep.has(r.id) ? PALETTE.danger : PALETTE.muted}>{keep.has(r.id) ? '◉ ' : '○ '}</Text>
                <Text bold={i === cursor}>{r.id}</Text>
                <Text dimColor>{`  ${keep.has(r.id) ? m.confirm.auditKept : m.confirm.auditLeftOut}`}</Text>
              </Text>
              {riskLine(r, 'high')}
            </Box>
          ))}
          <Text dimColor>{m.confirm.auditHint}</Text>
        </Panel>
      )}
      {warned.length > 0 && (
        <Box flexDirection="column">
          {warned.map((r) => (
            <Box key={r.id} flexDirection="column">
              <Text color={PALETTE.gold} wrap="truncate-end">{`⚠ ${r.id}`}</Text>
              {riskLine(r, 'medium')}
            </Box>
          ))}
        </Box>
      )}
      {noCommand.length > 0 && (
        <Box flexDirection="column">
          {noCommand.map((id) => (
            <Text key={id} dimColor wrap="truncate-end">{`∅ ${id}  ${m.confirm.auditUnread}`}</Text>
          ))}
        </Box>
      )}
      {audit && passed > 0 && <Text color={PALETTE.success}>{`🛡 ✓ ${m.confirm.auditPassed(passed)}`}</Text>}
      {keptIds.length > 0 && (
        <Panel color={PALETTE.success} title={`+ ${m.confirm.install(keptIds.length)}`}>
          {keptIds.map((id) => (
            <Text key={id} wrap="truncate-end">
              {id}
              <Text dimColor>{servers.has(id) ? `  $ ${commandText(servers.get(id)!)}` : ''}</Text>
            </Text>
          ))}
        </Panel>
      )}
      {keptUpdates.length > 0 && (
        <Panel color={PALETTE.gold} title={`↑ ${m.confirm.update(keptUpdates.length)}`}>
          <Text wrap="wrap">{keptUpdates.join('  ·  ')}</Text>
        </Panel>
      )}
      {keptIds.length > 0 && (
        <Box flexDirection="column">
          {row(m.confirm.scope, options.scope === 'user' ? m.scope.global : m.scope.project)}
          {row(m.confirm.agents, options.agents.join(', '))}
        </Box>
      )}
      <Hints
        items={[
          ...(failing.length ? [['↑↓', m.keys.move] as Hint, [m.keyNames.space, m.keys.keep] as Hint] : []),
          [m.keyNames.enter, m.keys.apply, confirm],
          [m.keyNames.esc, m.keys.back, onBack],
        ]}
      />
    </Box>
  );
}
