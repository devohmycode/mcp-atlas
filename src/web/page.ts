/**
 * The web page: one self-contained document (no external request), served by `server.ts`, which
 * fills it through `/api/`. Written with String.raw so the script keeps its backslashes; the
 * browser script must not contain backticks or dollar-brace sequences.
 *
 * Layout from skills-atlas: themes on the left, servers in the middle, the changes on the right.
 */
import { PALETTE } from '../ui/palette.js';

const PAGE_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MCP Atlas</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='13' fill='%230E0D0B'/%3E%3Cpath d='M16 6l3 10-3 10-3-10z' fill='%238BD5F5'/%3E%3C/svg%3E">
<style>
:root {
  --paper: ${PALETTE.foreground}; --sheet: #F7F3EA; --sheet-2: #EEE8DC; --ink: ${PALETTE.background}; --ink-2: #5E584F; --ink-3: #6F675B;
  --rule: #D7CFC0; --rule-2: #B7AC99; --accent: #366586; --add: #356541; --remove: #A23D38; --official: #6E4DB0; --gold: #876117;
  --brand-gradient: linear-gradient(120deg, ${PALETTE.accent}, ${PALETTE.lavender} 52%, ${PALETTE.pink});
  --region-l: 0.53; --region-c: 0.10;
  --display: "Bahnschrift", "DIN Alternate", "DIN 2014", "Barlow", "Roboto Condensed", system-ui, sans-serif;
  --text: system-ui, "Segoe UI Variable Text", "Segoe UI", -apple-system, Roboto, sans-serif;
  --mono: ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: ${PALETTE.background}; --sheet: #171511; --sheet-2: #211E19; --ink: ${PALETTE.foreground}; --ink-2: #B8B0A3; --ink-3: ${PALETTE.muted};
    --rule: #302B24; --rule-2: #5D5549; --accent: ${PALETTE.accent}; --add: ${PALETTE.success}; --remove: ${PALETTE.danger};
    --official: ${PALETTE.lavender}; --gold: ${PALETTE.gold}; --region-l: 0.76;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { background: var(--paper); color: var(--ink); font: 14px/1.5 var(--text); display: flex; flex-direction: column; }
button, input, select { font: inherit; color: inherit; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
[hidden] { display: none !important; }
header { display: grid; grid-template-columns: 250px minmax(0, 1fr) auto; align-items: center; gap: 20px; padding: 14px 24px; border-bottom: 1px solid var(--rule); }
.brand { display: flex; align-items: center; gap: 12px; }
.brand-mark { display: grid; place-content: center; width: 42px; height: 42px; border-radius: 12px; background: ${PALETTE.background}; color: ${PALETTE.accent}; }
.brand h1 { margin: 0; font: 600 21px/1 var(--display); }
.search input { width: 100%; height: 42px; padding: 0 16px; border: 1px solid var(--rule-2); border-radius: 21px; background: var(--sheet); outline: none; font-size: 15px; }
.search input:focus { border-color: var(--accent); }
.tools { display: flex; align-items: center; gap: 10px; }
.segmented { display: inline-flex; padding: 3px; gap: 2px; border: 1px solid var(--rule-2); border-radius: 10px; background: var(--sheet); }
.segmented button { height: 30px; padding: 0 10px; border: 0; border-radius: 7px; background: none; color: var(--ink-2); font-size: 13px; }
.segmented button[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
.toggle { height: 38px; padding: 0 12px; border: 1px solid var(--rule-2); border-radius: 10px; background: var(--sheet); color: var(--ink-2); font-size: 13px; }
.toggle[aria-pressed="true"] { color: var(--official); border-color: var(--official); }
.banner { margin: 0; padding: 10px 24px; border-bottom: 1px solid var(--rule); color: var(--gold); }
main { flex: 1; display: grid; grid-template-columns: 250px minmax(0, 1fr) 380px; min-height: 0; }
nav, .list, aside { overflow: auto; min-height: 0; }
nav { padding: 18px 12px 24px 16px; }
nav h2, aside h2 { margin: 0 0 10px 10px; font: 600 13px/1.2 var(--display); color: var(--ink-2); }
nav button {
  --swatch: oklch(var(--region-l) var(--region-c) var(--hue, 200));
  display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; align-items: center; gap: 10px; width: 100%;
  border: 0; background: none; padding: 6px 10px; border-radius: 8px; text-align: left; color: var(--ink-2);
}
nav button::before { content: ""; width: 12px; height: 12px; border-radius: 3px; background: var(--swatch); }
nav button.all::before { border-radius: 50%; background: conic-gradient(oklch(var(--region-l) var(--region-c) 30), oklch(var(--region-l) var(--region-c) 150), oklch(var(--region-l) var(--region-c) 270), oklch(var(--region-l) var(--region-c) 30)); }
nav button.mine::before { border-radius: 50%; background: var(--accent); }
nav button:hover { background: var(--sheet); color: var(--ink); }
nav button[aria-current="true"] { background: color-mix(in oklab, var(--swatch) 16%, var(--sheet)); color: var(--ink); font-weight: 600; }
nav .n { font-family: var(--display); font-size: 12.5px; color: var(--ink-3); }
nav .sep { height: 1px; background: var(--rule); margin: 8px 10px; }
.list { padding: 18px 24px 48px; }
.list-head { display: flex; align-items: baseline; gap: 12px; margin: 0 2px 12px; }
.list-head strong { font: 600 26px/1 var(--display); }
.list-head span { color: var(--ink-2); }
.rows { background: var(--sheet); border: 1px solid var(--rule); border-radius: 14px; overflow: hidden; }
.row {
  --region: oklch(var(--region-l) var(--region-c) var(--hue, 200));
  position: relative; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 2px 14px;
  padding: 13px 18px 13px 22px; border-top: 1px solid var(--rule); cursor: pointer;
}
.row:first-child { border-top: 0; }
.row::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--region); }
.row:hover { background: var(--sheet-2); }
.row.add { background: color-mix(in oklab, var(--add) 8%, var(--sheet)); }
.row.drop { background: color-mix(in oklab, var(--remove) 8%, var(--sheet)); }
.row input { margin: 3px 0 0; width: 16px; height: 16px; accent-color: var(--accent); }
.title { display: flex; align-items: baseline; gap: 4px 10px; flex-wrap: wrap; min-width: 0; }
.name { font-weight: 600; font-size: 15px; overflow-wrap: anywhere; }
.id { color: var(--ink-3); font: 12px var(--mono); overflow-wrap: anywhere; }
.tag { font-size: 12px; white-space: nowrap; }
.tag.official { color: var(--official); }
.tag.installed { color: var(--accent); }
.tag.risk, .tag.drop { color: var(--remove); font-weight: 600; }
.tag.add { color: var(--add); font-weight: 600; }
button.tag { border: 1px solid var(--gold); border-radius: 10px; background: none; color: var(--gold); padding: 0 7px; }
button.tag[aria-pressed="true"] { background: var(--gold); color: var(--sheet); }
.desc { grid-column: 2 / 3; margin: 3px 0 0; color: var(--ink-2); font-size: 13px; max-width: 78ch; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.side { grid-row: 1 / 3; grid-column: 3; }
.link { border: 0; background: none; color: var(--accent); padding: 0; font-size: 12.5px; }
.link:hover { text-decoration: underline; }
.more { display: block; margin: 18px auto 0; height: 38px; padding: 0 18px; border-radius: 19px; border: 1px solid var(--rule-2); background: var(--sheet); }
.empty { padding: 56px 24px; text-align: center; color: var(--ink-2); }
aside { background: var(--sheet); border-left: 1px solid var(--rule); display: flex; flex-direction: column; overflow: hidden; }
.panel-body { flex: 1; overflow: auto; padding: 20px 20px 8px; }
.panel-foot { padding: 14px 20px 18px; border-top: 1px solid var(--rule); }
aside h2 { margin: 22px 0 10px; }
.intro { margin: 0; color: var(--ink-2); }
.tally { display: flex; gap: 18px; margin-bottom: 12px; }
.tally div { display: flex; flex-direction: column; }
.tally b { font: 600 30px/1 var(--display); }
.tally span { font-size: 12px; color: var(--ink-2); }
.tally .plus b { color: var(--add); } .tally .minus b { color: var(--remove); } .tally .up b { color: var(--gold); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chips button { height: 28px; padding: 0 11px; border: 1px solid var(--rule-2); border-radius: 14px; background: var(--sheet); font-size: 12.5px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chips button.plus { border-color: var(--add); } .chips button.minus { border-color: var(--remove); color: var(--remove); } .chips button.up { border-color: var(--gold); }
.chips button::after { content: " ×"; color: var(--ink-3); }
.choice { display: grid; grid-template-columns: 18px 1fr; gap: 10px; padding: 10px 12px; margin-bottom: 6px; border: 1px solid var(--rule); border-radius: 10px; cursor: pointer; }
.choice:has(input:checked) { border-color: var(--accent); }
.choice input { margin: 3px 0 0; accent-color: var(--accent); }
.choice small { display: block; color: var(--ink-2); font-size: 12px; overflow-wrap: anywhere; }
.clients { border: 1px solid var(--rule); border-radius: 10px; }
.clients label { display: flex; align-items: center; gap: 10px; padding: 7px 12px; border-top: 1px solid var(--rule); cursor: pointer; }
.clients label:first-child { border-top: 0; }
.clients input { accent-color: var(--accent); margin: 0; }
.clients .found { margin-left: auto; font-size: 11.5px; color: var(--add); }
pre { margin: 0 0 8px; padding: 10px 12px; background: var(--paper); border: 1px solid var(--rule); border-radius: 10px; font: 11.5px/1.55 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 220px; overflow: auto; color: var(--ink-2); }
.warn { margin: 0 0 10px; color: var(--remove); font-size: 13px; }
.blocked { display: flex; gap: 8px; align-items: center; margin: 0 0 6px; font-size: 13px; }
.blocked input { accent-color: var(--remove); }
ul.risks { margin: 0 0 10px; padding-left: 18px; font-size: 13px; }
.lvl-high { color: var(--remove); font-weight: 600; } .lvl-medium { color: var(--gold); } .lvl-info { color: var(--ink-3); }
.primary { width: 100%; height: 46px; border: 0; border-radius: 12px; background: var(--brand-gradient); color: ${PALETTE.background}; font: 600 16px/1 var(--display); }
.primary:disabled { opacity: .4; cursor: not-allowed; }
dialog { border: 1px solid var(--rule); border-radius: 18px; padding: 0; width: min(720px, calc(100vw - 32px)); background: var(--sheet); color: var(--ink); }
dialog::backdrop { background: rgba(5, 12, 20, .5); }
.dlg { padding: 22px 24px 20px; }
.dlg h3 { margin: 0 0 6px; font: 600 22px/1.2 var(--display); }
.dlg footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
.dlg footer .primary { width: auto; height: 40px; padding: 0 22px; font-size: 15px; }
.readme { max-height: 50vh; }
.result { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 2px 10px; padding: 8px 0; border-top: 1px solid var(--rule); }
.result .ok { color: var(--add); } .result .ko { color: var(--remove); }
.result .err { grid-column: 2; color: var(--remove); font-size: 12.5px; overflow-wrap: anywhere; }
@media (max-width: 880px) {
  header { grid-template-columns: 1fr auto; padding: 12px 16px; }
  .search { grid-column: 1 / -1; grid-row: 2; }
  main { grid-template-columns: minmax(0, 1fr); overflow: auto; }
  nav { display: flex; gap: 4px; overflow-x: auto; padding: 10px 16px; border-bottom: 1px solid var(--rule); }
  nav h2, nav .sep { display: none; }
  nav button { flex: none; width: max-content; white-space: nowrap; }
  .list { overflow: visible; padding: 14px 16px 24px; }
  aside { border-left: 0; border-top: 1px solid var(--rule); overflow: visible; }
  .panel-foot { position: sticky; bottom: 0; background: var(--sheet); }
}
</style>
</head>
<body>
<header>
  <div class="brand">
    <span class="brand-mark"><svg width="30" height="30" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="15" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M17 4.5l3.2 12.5L17 29.5l-3.2-12.5z" fill="currentColor"/></svg></span>
    <h1>MCP Atlas</h1>
  </div>
  <label class="search"><input id="q" type="search" autocomplete="off" spellcheck="false"></label>
  <div class="tools">
    <div class="segmented" id="sort" role="group"></div>
    <button id="official" class="toggle" aria-pressed="false"></button>
  </div>
</header>
<p id="banner" class="banner" role="status" hidden></p>
<main>
  <nav id="themes"></nav>
  <section class="list">
    <div class="list-head"><strong id="count"></strong><span id="where"></span></div>
    <div class="rows" id="rows" role="list"></div>
    <button class="more" id="more" hidden></button>
  </section>
  <aside><div class="panel-body" id="panel-body"></div><div class="panel-foot" id="panel-foot"></div></aside>
</main>
<dialog id="details" aria-labelledby="details-title"><div class="dlg"><h3 id="details-title"></h3><div id="details-body" aria-live="polite"></div><footer><button class="primary" id="details-close"></button></footer></div></dialog>
<dialog id="progress" aria-labelledby="progress-title"><div class="dlg"><h3 id="progress-title"></h3><div id="progress-body" aria-live="polite"></div><footer><button class="primary" id="retry" hidden></button><button class="primary" id="progress-close"></button></footer></div></dialog>
<script>
(function () {
  'use strict';
  var token = location.hash.slice(1);
  var M = {}, S = null;
  var installed = new Map(), outdated = new Map(), hues = {};
  var adds = new Map(), removes = new Set(), updates = new Set(), accept = new Set();
  var opts = { scope: 'project', clients: new Set() };
  var view = { q: '', sort: 'official', official: false, theme: '', items: [], total: 0, counts: {}, all: 0 };
  var shown = new Map(), planTimer = 0, planSeq = 0, querySeq = 0, lastPlan = null, failed = null;
  var PAGE = 100;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function tr(key, vars) {
    var s = M[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function apiJson(path, body) {
    var init = { headers: { 'x-atlas-token': token } };
    if (body) { init.method = 'POST'; init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) throw new Error(j.error || res.statusText);
        return j;
      });
    });
  }
  function where(scopes) { return scopes.map(function (x) { return x === 'user' ? M.global : M.project; }).join(' + '); }
  function label(s) { return s.title || s.name; }

  // ---- selection: a tick means "present after apply" -----------------------------------------
  function isChecked(id) { return installed.has(id) ? !removes.has(id) : adds.has(id); }
  function toggle(s) {
    if (installed.has(s.id)) { if (removes.has(s.id)) removes.delete(s.id); else { removes.add(s.id); updates.delete(s.id); } }
    else if (adds.has(s.id)) { adds.delete(s.id); accept.delete(s.id); }
    else adds.set(s.id, s);
    changed();
  }
  function toggleUpdate(id) {
    if (updates.has(id)) updates.delete(id); else { updates.add(id); removes.delete(id); }
    changed();
  }
  function changed() { renderRows(); renderPanel(); schedulePlan(); }

  // ---- server list ---------------------------------------------------------------------------
  function hueStyle(themeId) { return hues[themeId] != null ? ' style="--hue:' + hues[themeId] + '"' : ''; }
  function rowHtml(s) {
    var inst = installed.get(s.id), on = isChecked(s.id), up = outdated.get(s.id), tags = '';
    if (s.official) tags += '<span class="tag official">◆ ' + esc(M.official) + '</span>';
    if (inst && removes.has(s.id)) tags += '<span class="tag drop">' + esc(M.willRemove) + '</span>';
    else if (inst) tags += '<span class="tag installed">● ' + esc(tr('installedIn', { where: where(inst.scopes) })) + '</span>';
    else if (on) tags += '<span class="tag add">+ ' + esc(M.willInstall) + '</span>';
    if (up && inst && !removes.has(s.id)) tags += '<button class="tag" data-update="' + esc(s.id) + '" aria-pressed="' + updates.has(s.id) + '">' +
      esc(tr('updateAvailable', { from: up[0].installed || '?', to: up[0].catalog || '?' })) + '</button>';
    if (s.highRisk) tags += '<span class="tag risk">⚠ ' + esc(M.highRisk) + '</span>';
    var cls = 'row' + (inst && removes.has(s.id) ? ' drop' : !inst && on ? ' add' : '');
    return '<div class="' + cls + '" role="listitem" data-id="' + esc(s.id) + '"' + hueStyle(s.themes[0]) + '>' +
      '<input type="checkbox" aria-label="' + esc(label(s)) + '"' + (on ? ' checked' : '') + '>' +
      '<div class="title"><span class="name">' + esc(label(s)) + '</span><span class="id">' + esc(s.id) + '</span>' + tags + '</div>' +
      '<div class="side"><button class="link" data-details="' + esc(s.id) + '">' + esc(M.details) + '</button></div>' +
      '<p class="desc">' + esc(s.description || '') + '</p></div>';
  }
  function renderRows() {
    shown = new Map(view.items.map(function (s) { return [s.id, s]; }));
    $('rows').innerHTML = view.items.length ? view.items.map(rowHtml).join('') : '<p class="empty">' + esc(M.noMatch) + '</p>';
    $('count').textContent = tr('count', { n: view.total.toLocaleString(S.lang) });
    var th = S.themes.filter(function (x) { return x.id === view.theme; })[0];
    $('where').textContent = view.theme === 'installed' ? M.installedTheme : th ? th.label : M.all;
    $('more').hidden = view.items.length >= view.total;
    $('more').textContent = M.more;
  }
  $('rows').addEventListener('click', function (e) {
    var row = e.target.closest('.row'); if (!row) return;
    var s = shown.get(row.dataset.id); if (!s) return;
    var up = e.target.closest('[data-update]');
    if (up) return toggleUpdate(up.dataset.update);
    if (e.target.closest('[data-details]')) return showDetails(s);
    if (e.target.tagName === 'INPUT') e.preventDefault();
    toggle(s);
  });
  function load(append) {
    var seq = ++querySeq;
    var p = new URLSearchParams({ q: view.q, sort: view.sort, theme: view.theme, official: view.official ? '1' : '', offset: append ? String(view.items.length) : '0', limit: String(PAGE) });
    return apiJson('/api/servers?' + p).then(function (r) {
      if (seq !== querySeq) return;
      view.items = append ? view.items.concat(r.items) : r.items;
      view.total = r.total; view.counts = r.counts; view.all = r.all;
      renderRows(); renderThemes();
    }).catch(fail);
  }
  $('more').addEventListener('click', function () { load(true); });
  var queryTimer = 0;
  $('q').addEventListener('input', function () {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(function () { view.q = $('q').value; load(false); }, 150);
  });
  $('official').addEventListener('click', function () {
    view.official = !view.official; $('official').setAttribute('aria-pressed', String(view.official)); load(false);
  });
  $('sort').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    view.sort = b.dataset.sort; renderSort(); load(false);
  });
  function renderSort() {
    $('sort').innerHTML = [['official', M.sortOfficial], ['name', M.sortName]].map(function (o) {
      return '<button data-sort="' + o[0] + '" aria-pressed="' + (view.sort === o[0]) + '">' + esc(o[1]) + '</button>';
    }).join('');
  }

  // ---- themes --------------------------------------------------------------------------------
  function renderThemes() {
    var cur = function (id) { return view.theme === id ? ' aria-current="true"' : ''; };
    var n = function (id) { return '<span class="n">' + (view.counts[id] || 0).toLocaleString(S.lang) + '</span>'; };
    var html = '<h2>' + esc(M.themes) + '</h2>' +
      '<button class="all" data-theme=""' + cur('') + '><span>' + esc(M.all) + '</span><span class="n">' + view.all.toLocaleString(S.lang) + '</span></button>' +
      '<button class="mine" data-theme="installed"' + cur('installed') + '><span>' + esc(M.installedTheme) + '</span>' + n('installed') + '</button><div class="sep"></div>';
    S.themes.forEach(function (th) {
      if (!view.counts[th.id] && view.theme !== th.id) return;
      html += '<button data-theme="' + esc(th.id) + '"' + cur(th.id) + hueStyle(th.id) + ' title="' + esc(th.description || '') + '"><span>' + esc(th.label) + '</span>' + n(th.id) + '</button>';
    });
    $('themes').innerHTML = html;
  }
  $('themes').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    view.theme = b.dataset.theme; load(false);
  });

  // ---- details: README and risks -------------------------------------------------------------
  function risksHtml(audit) {
    if (!audit.risks.length) return '<p>' + esc(audit.reason || M.noRisk) + '</p>';
    return '<ul class="risks">' + audit.risks.map(function (r) {
      return '<li><span class="lvl-' + esc(r.level) + '">' + esc(M.riskLevels[r.level] || r.level) + '</span> — ' + esc(r.detail) + '</li>';
    }).join('') + '</ul>';
  }
  var detailsSeq = 0;
  function showDetails(s) {
    var seq = ++detailsSeq, dlg = $('details');
    $('details-title').textContent = label(s);
    $('details-body').innerHTML = '<p>' + esc(M.loading) + '</p>';
    $('details-close').textContent = M.close;
    dlg.showModal();
    apiJson('/api/details?id=' + encodeURIComponent(s.id)).then(function (r) {
      if (seq !== detailsSeq) return;
      $('details-body').innerHTML = '<h2>' + esc(M.command) + '</h2><pre>' + esc(r.command) + '</pre>' +
        '<h2>' + esc(M.risks) + '</h2>' + risksHtml(r.audit) +
        '<h2>' + esc(M.readme) + '</h2>' + (r.readme ? '<pre class="readme">' + esc(r.readme) + '</pre>' : '<p class="warn">' + esc(r.error) + '</p>');
    }).catch(function (err) { if (seq === detailsSeq) $('details-body').innerHTML = '<p class="warn">' + esc(err.message) + '</p>'; });
  }
  $('details-close').addEventListener('click', function () { $('details').close(); });

  // ---- changes panel -------------------------------------------------------------------------
  function scopeClients() { return S.clients.filter(function (c) { return c.scopes.indexOf(opts.scope) >= 0; }); }
  function selectedClients() { return scopeClients().filter(function (c) { return opts.clients.has(c.id); }).map(function (c) { return c.id; }); }
  function body() {
    return { install: Array.from(adds.keys()), remove: Array.from(removes), update: Array.from(updates),
      clients: selectedClients(), scope: opts.scope, acceptRisk: Array.from(accept) };
  }
  function empty() { return !adds.size && !removes.size && !updates.size; }
  function choice(value, title, hint) {
    return '<label class="choice"><input type="radio" name="scope" value="' + value + '"' + (opts.scope === value ? ' checked' : '') + '><span><b>' + esc(title) + '</b><small>' + esc(hint) + '</small></span></label>';
  }
  function renderPanel() {
    var html = '<h2>' + esc(M.changes) + '</h2>';
    if (empty()) html += '<p class="intro">' + esc(M.intro) + '</p>';
    else {
      html += '<div class="tally"><div class="plus"><b>' + adds.size + '</b><span>' + esc(M.tallyInstall) + '</span></div>' +
        '<div class="minus"><b>' + removes.size + '</b><span>' + esc(M.tallyRemove) + '</span></div>' +
        '<div class="up"><b>' + updates.size + '</b><span>' + esc(M.tallyUpdate) + '</span></div></div><div class="chips">';
      adds.forEach(function (s) { html += '<button class="plus" data-chip="add" data-id="' + esc(s.id) + '">+ ' + esc(label(s)) + '</button>'; });
      removes.forEach(function (id) { html += '<button class="minus" data-chip="remove" data-id="' + esc(id) + '">− ' + esc(id) + '</button>'; });
      updates.forEach(function (id) { html += '<button class="up" data-chip="update" data-id="' + esc(id) + '">↻ ' + esc(id) + '</button>'; });
      html += '</div>';
    }
    if (adds.size) {
      html += '<h2>' + esc(M.scope) + '</h2>' + choice('project', M.project, tr('projectHint', { cwd: S.cwd })) + choice('user', M.global, M.globalHint);
      html += '<h2>' + esc(M.clients) + '</h2><div class="clients">' + scopeClients().map(function (c) {
        return '<label><input type="checkbox" name="client" value="' + esc(c.id) + '"' + (opts.clients.has(c.id) ? ' checked' : '') + '><span>' + esc(c.id) + '</span>' +
          (c.detected ? '<span class="found">' + esc(M.detected) + '</span>' : '') + '</label>';
      }).join('') + '</div>';
    }
    if (!empty()) html += '<h2>' + esc(M.review) + '</h2><div id="review"></div>';
    $('panel-body').innerHTML = html;
    renderReview();
    $('panel-foot').innerHTML = '<button class="primary" id="apply">' + esc(M.apply) + '</button>';
    $('apply').disabled = S.demo || empty() || !lastPlan || lastPlan.error || lastPlan.blocked.length > 0;
    $('apply').addEventListener('click', function () { run(body()); });
  }
  $('panel-body').addEventListener('click', function (e) {
    var chip = e.target.closest('[data-chip]'); if (!chip) return;
    var id = chip.dataset.id;
    if (chip.dataset.chip === 'add') { adds.delete(id); accept.delete(id); }
    else if (chip.dataset.chip === 'remove') removes.delete(id);
    else updates.delete(id);
    changed();
  });
  $('panel-body').addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'scope') { opts.scope = t.value; renderPanel(); schedulePlan(); }
    else if (t.name === 'client') { if (t.checked) opts.clients.add(t.value); else opts.clients.delete(t.value); schedulePlan(); }
    else if (t.name === 'accept') { if (t.checked) accept.add(t.value); else accept.delete(t.value); schedulePlan(); }
  });
  function renderReview() {
    var box = $('review'); if (!box) return;
    var p = lastPlan;
    if (!p) { box.innerHTML = ''; return; }
    if (p.error) { box.innerHTML = '<p class="warn">' + esc(p.error) + '</p>'; return; }
    var html = p.audit.enabled ? '' : '<p class="warn">' + esc(M.auditOff) + '</p>';
    var audits = {}; p.audit.results.forEach(function (r) { audits[r.id] = r; });
    p.blocked.concat(Array.from(accept)).forEach(function (id) {
      var r = audits[id]; if (!r) return;
      html += '<label class="blocked"><input type="checkbox" name="accept" value="' + esc(id) + '"' + (accept.has(id) ? ' checked' : '') + '>' +
        '<span><b>' + esc(M.auditBlocked) + '</b> — ' + esc(id) + ' — ' + esc(M.installAnyway) + '</span></label>' + risksHtml(r);
    });
    var lines = [];
    p.remove.forEach(function (r) { lines.push('− ' + r.id + ' ' + tr('removeFrom', { where: where(r.scopes) })); });
    p.update.forEach(function (r) { lines.push('↻ ' + r.id + ' ' + (r.installed || '?') + ' → ' + (r.catalog || '?') + '  ' + r.path); });
    p.install.forEach(function (r) { lines.push('+ ' + r.id + ' [' + r.clients.join(', ') + ' · ' + where([r.scope]) + ']\n  ' + r.command); });
    if (lines.length) html += '<pre>' + esc(lines.join('\n')) + '</pre>';
    box.innerHTML = html;
  }
  function schedulePlan() {
    clearTimeout(planTimer);
    if (empty()) { lastPlan = null; return; }
    var seq = ++planSeq;
    planTimer = setTimeout(function () {
      apiJson('/api/plan', body()).then(function (r) { lastPlan = r; }, function (err) { lastPlan = { error: err.message }; }).then(function () {
        if (seq !== planSeq) return;
        renderReview();
        var b = $('apply');
        if (b) b.disabled = S.demo || empty() || !!lastPlan.error || lastPlan.blocked.length > 0;
      });
    }, 200);
  }

  // ---- apply, with a retry of what failed ----------------------------------------------------
  function run(payload) {
    var dlg = $('progress');
    $('progress-title').textContent = M.applying;
    $('progress-body').innerHTML = '';
    $('retry').hidden = true; $('retry').textContent = M.retry;
    $('progress-close').textContent = M.close; $('progress-close').disabled = true;
    if (!dlg.open) dlg.showModal();
    apiJson('/api/apply', payload).then(function (r) {
      $('progress-title').textContent = r.ok ? M.applied : M.failed;
      $('progress-body').innerHTML = r.results.map(function (x) {
        var sign = x.op === 'install' ? '+' : x.op === 'remove' ? '−' : '↻';
        return '<div class="result"><span class="' + (x.ok ? 'ok' : 'ko') + '">' + (x.ok ? '✓' : '✗') + '</span><span>' + sign + ' ' + esc(x.id) + '</span>' +
          (x.error ? '<span class="err">' + esc(x.error) + '</span>' : '') + '</div>';
      }).join('');
      r.results.forEach(function (x) {
        if (!x.ok) return;
        if (x.op === 'install') { adds.delete(x.id); accept.delete(x.id); }
        else if (x.op === 'remove') removes.delete(x.id);
        else updates.delete(x.id);
      });
      var bad = r.results.filter(function (x) { return !x.ok; });
      failed = bad.length ? { install: [], remove: [], update: [], clients: payload.clients, scope: payload.scope, acceptRisk: payload.acceptRisk } : null;
      bad.forEach(function (x) { failed[x.op].push(x.id); });
      $('retry').hidden = !failed;
    }).catch(function (err) {
      $('progress-title').textContent = M.failed;
      $('progress-body').innerHTML = '<p class="warn">' + esc(err.message) + '</p>';
    }).then(function () { $('progress-close').disabled = false; return refresh(); });
  }
  $('retry').addEventListener('click', function () { if (failed) run(failed); });
  $('progress-close').addEventListener('click', function () { $('progress').close(); });

  // ---- start ---------------------------------------------------------------------------------
  function refresh() {
    return apiJson('/api/state').then(function (st) {
      S = st;
      installed = new Map(st.installed.map(function (x) { return [x.id, x]; }));
      outdated = new Map();
      st.outdated.forEach(function (x) { outdated.set(x.id, (outdated.get(x.id) || []).concat([x])); });
      changed();
      return load(false);
    });
  }
  function fail(err) { $('banner').textContent = err.message; $('banner').hidden = false; }
  apiJson('/api/state').then(function (st) {
    M = st.messages;
    document.documentElement.lang = st.lang;
    $('q').placeholder = M.search; $('q').setAttribute('aria-label', M.search);
    $('official').textContent = '◆ ' + M.officialOnly;
    $('themes').setAttribute('aria-label', M.themes);
    st.themes.forEach(function (th, i) { hues[th.id] = Math.round(i * 360 / Math.max(1, st.themes.length)); });
    opts.scope = st.defaults.scope;
    st.defaults.clients.forEach(function (id) { opts.clients.add(id); });
    if (st.demo) { $('banner').textContent = M.demo; $('banner').hidden = false; }
    renderSort();
    return refresh();
  }).catch(fail);
})();
</script>
</body>
</html>
`;

/** The page shell. Everything else comes from `/api/state` and `/api/servers`. */
export function renderPage(): string {
  return PAGE_HTML;
}
