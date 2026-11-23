'use strict';

/* =====================================================================
 * FastAPI Clean Lab — moteur du tutoriel (vanilla JS, aucune dépendance)
 * ---------------------------------------------------------------------
 *  - registerChapter() : appelé par chaque fichier de chapters/
 *  - helpers de contenu : py``, sh``, toml``... callout(), compare()
 *  - rendu : accueil, chapitres, QCM, sommaire, progression (localStorage)
 * ===================================================================== */

window.CHAPTERS = [];

/** Hash FNV-1a → graine d'un PRNG mulberry32 : mélange déterministe (stable entre visites). */
function seededRandom(seedText) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) { h ^= seedText.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleQuestion(question, seed) {
  const random = seededRandom(seed);
  const order = question.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...question, options: order.map((i) => question.options[i]), answer: order.indexOf(question.answer) };
}

function registerChapter(chapter) {
  chapter.quiz = chapter.quiz.map((q, i) => shuffleQuestion(q, `${chapter.id}#${i}`));
  window.CHAPTERS.push(chapter);
}

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dedent(source) {
  const lines = source.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join('\n');
}

/* ------------------------------------------------------------------ */
/* Coloration syntaxique minimaliste                                   */
/* ------------------------------------------------------------------ */
const PY_KEYWORDS = new Set(('False None True and as assert async await break class continue def del elif else ' +
  'except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case').split(' '));
const PY_BUILTINS = new Set(('print len str int float bool list dict set tuple object type isinstance issubclass super ' +
  'range enumerate zip sum any all min max sorted open repr hash id property classmethod staticmethod getattr setattr ' +
  'hasattr iter next map filter bytes frozenset Exception ValueError TypeError KeyError RuntimeError NotImplementedError').split(' '));

/** Clé de lexique d'un jeton Python (voir assets/glossary.js), ou null. */
function glossaryKeyFor(kind, token, code, index) {
  if (typeof glossaryLookup !== 'function') return null;
  if (kind === 'str') {
    const prefix = token.match(/^[A-Za-z]*/)[0].toLowerCase();
    if (prefix.includes('f')) return 'f-string';
    if (prefix.includes('b')) return 'bytes';
    const lineStart = code.lastIndexOf('\n', index - 1) + 1;
    if (/^("""|\'\'\')/.test(token) && !code.slice(lineStart, index).trim()) return 'docstring';
    return null;
  }
  if (kind === 'deco') {
    const full = `@${token.slice(1)}`;
    if (glossaryLookup(full)) return full;
    const first = `@${token.slice(1).split('.')[0]}`;
    return glossaryLookup(first) ? first : null;
  }
  if (kind === 'sym') return glossaryLookup(token) ? token : null;
  const afterDot = code[index - 1] === '.';
  const key = afterDot ? `.${token}` : token;
  const entry = glossaryLookup(key);
  return entry && !entry.concept ? key : null;
}

function highlightPython(code) {
  const re = /(#[^\n]*)|((?:[rRbBfFuU]{1,2})?(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'))|(@[A-Za-z_][\w.]*)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_]\w*)|(->|\.\.\.|\*\*?|\|)/g;
  let out = '';
  let last = 0;
  let previousIdent = '';
  let m;
  while ((m = re.exec(code))) {
    out += escapeHtml(code.slice(last, m.index));
    const token = m[0];
    let cls = null;
    let kind = 'ident';
    if (m[1]) cls = 'com';
    else if (m[2]) { cls = 'str'; kind = 'str'; }
    else if (m[3]) { cls = 'deco'; kind = 'deco'; }
    else if (m[4]) cls = 'num';
    else if (m[6]) { cls = 'op'; kind = 'sym'; }
    else {
      if (PY_KEYWORDS.has(token)) cls = 'kw';
      else if (previousIdent === 'def') cls = 'fn';
      else if (previousIdent === 'class') cls = 'cls';
      else if (token === 'self' || token === 'cls') cls = 'self';
      else if (PY_BUILTINS.has(token)) cls = 'bi';
      else if (/^[A-Z]/.test(token)) cls = (token.length > 1 && /^[A-Z0-9_]+$/.test(token)) ? 'const' : 'cls';
    }
    const gkey = (m[1] || m[4]) ? null : glossaryKeyFor(kind, token, code, m.index);
    previousIdent = m[5] ? token : '';
    const classes = [cls && `t-${cls}`, gkey && 'g'].filter(Boolean).join(' ');
    const attr = gkey ? ` data-g="${escapeHtml(gkey)}"` : '';
    out += classes ? `<span class="${classes}"${attr}>${escapeHtml(token)}</span>` : escapeHtml(token);
    last = re.lastIndex;
  }
  return out + escapeHtml(code.slice(last));
}

const STR_RULE = /"(?:\\.|[^"\\\n])*"|'[^'\n]*'/;
const GENERIC_RULES = {
  bash: [['com', /(?:^|(?<=\s))#[^\n]*/], ['str', STR_RULE], ['fn', /^[ \t]*[\w.\/-]+/], ['kw', /(?<=\s)--?[A-Za-z][\w-]*/], ['num', /\$[A-Za-z_]\w*/]],
  toml: [['com', /#[^\n]*/], ['cls', /^[ \t]*\[\[?[^\]\n]+\]\]?/], ['str', /"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'[^'\n]*'/], ['fn', /^[ \t]*[\w."-]+(?=\s*=)/], ['num', /\b(?:true|false|\d+)\b/]],
  yaml: [['com', /#[^\n]*/], ['str', STR_RULE], ['fn', /^[ \t-]*[\w.-]+(?=:)/], ['num', /\b(?:true|false|\d+)\b/]],
  docker: [['com', /^[ \t]*#[^\n]*/], ['kw', /^(?:FROM|COPY|RUN|WORKDIR|ENV|EXPOSE|CMD|USER|ARG|ENTRYPOINT|HEALTHCHECK)\b|\bAS\b/], ['str', STR_RULE], ['kw', /(?<=\s)--[\w-]+/]],
  json: [['fn', /"(?:\\.|[^"\\])*"(?=\s*:)/], ['str', /"(?:\\.|[^"\\])*"/], ['num', /-?\b\d+(?:\.\d+)?\b/], ['kw', /\b(?:true|false|null)\b/]],
  http: [['kw', /^(?:GET|POST|PUT|PATCH|DELETE|HTTP\/[\d.]+)\b/], ['num', /(?<=^HTTP\/[\d.]+ )\d{3}[^\n]*/], ['fn', /^[\w-]+(?=:)/], ['str', /"(?:\\.|[^"\\])*"/]],
  ini: [['com', /^[ \t]*[#;][^\n]*/], ['cls', /^\[[^\]\n]+\]/], ['fn', /^[\w.-]+(?=\s*=)/]],
};

function highlightGeneric(lang, code) {
  const rules = GENERIC_RULES[lang];
  if (!rules) return escapeHtml(code);
  const re = new RegExp(rules.map(([, r]) => `(${r.source})`).join('|'), 'gm');
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    out += escapeHtml(code.slice(last, m.index));
    const index = m.slice(1).findIndex((g) => g !== undefined);
    out += `<span class="t-${rules[index][0]}">${escapeHtml(m[0])}</span>`;
    last = re.lastIndex;
  }
  return out + escapeHtml(code.slice(last));
}

function highlight(lang, code) {
  return lang === 'python' ? highlightPython(code) : highlightGeneric(lang, code);
}

/* ------------------------------------------------------------------ */
/* Helpers de contenu utilisés par les chapitres                       */
/* ------------------------------------------------------------------ */
const CODE_STORE = {};
let codeSequence = 0;
const LANG_LABELS = {
  python: 'Python', bash: 'Terminal', toml: 'TOML', yaml: 'YAML', docker: 'Dockerfile',
  json: 'JSON', http: 'HTTP', text: 'Texte', ini: 'INI',
};

function codeBlock(lang, raw, filename) {
  const code = dedent(raw);
  const id = `code-${codeSequence++}`;
  CODE_STORE[id] = code;
  const file = filename ? `<span class="filename">${escapeHtml(filename)}</span>` : '';
  const hint = lang === 'python' ? '<span class="code-hint" title="Survole les mots soulignés pour leur définition">💬 survole les mots soulignés</span>' : '';
  return `<figure class="code"><figcaption><span class="lang lang-${lang}">${LANG_LABELS[lang] || lang}</span>${file}` +
    `${hint}<button class="copy-btn" type="button" data-code="${id}">Copier</button></figcaption>` +
    `<pre><code>${highlight(lang, code)}</code></pre></figure>`;
}

function codeTag(lang) {
  const tag = (strings, ...values) => codeBlock(lang, String.raw(strings, ...values));
  tag.file = (filename) => (strings, ...values) => codeBlock(lang, String.raw(strings, ...values), filename);
  return tag;
}

const py = codeTag('python');
const sh = codeTag('bash');
const toml = codeTag('toml');
const yaml = codeTag('yaml');
const docker = codeTag('docker');
const json = codeTag('json');
const http = codeTag('http');
const txt = codeTag('text');
const ini = codeTag('ini');

const CALLOUTS = {
  info: { icon: 'ℹ️', label: 'À savoir' },
  tip: { icon: '💡', label: 'Astuce' },
  warn: { icon: '⚠️', label: 'Attention' },
  java: { icon: '☕', label: 'Côté Java / C#' },
  clean: { icon: '🧹', label: 'Clean code' },
  fil: { icon: '🧵', label: 'Fil rouge' },
};

function callout(type, title, body) {
  const meta = CALLOUTS[type] || CALLOUTS.info;
  return `<div class="callout callout-${type}"><div class="callout-title"><span>${meta.icon}</span>` +
    `<strong>${title || meta.label}</strong></div><div class="callout-body">${body}</div></div>`;
}

/** Tableau de correspondance : compare(['Python', 'Java', 'C#'], [[...], ...]) */
function compare(headers, rows) {
  const head = headers.map((h) => `<th>${h}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table class="compare"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/**
 * Décryptage ligne à ligne d'un bloc de code, à placer juste après lui.
 *   explain([
 *     ['def lend(self) -> None:', 'Déclare la méthode <code>lend</code>…'],
 *     ...
 *   ])
 * Le fragment de code est coloré (et porte les infobulles du lexique).
 * Second paramètre facultatif : le langage du fragment ('python' par défaut).
 */
function explain(items, lang = 'python') {
  const rows = items.map(([code, text]) => `
    <div class="decode-row"><dt><code>${highlight(lang, dedent(code))}</code></dt><dd>${text}</dd></div>`).join('');
  return `<details class="decode" open><summary>🔎 Décryptage ligne à ligne</summary><dl>${rows}</dl></details>`;
}

/** Encadré de définition (vocabulaire), ex. define('Coroutine', '…'). */
function define(term, body) {
  return `<div class="define"><div class="define-term">📘 ${term}</div><div class="define-body">${body}</div></div>`;
}

/** Arborescence de fichiers simple. */
function tree(text) {
  return `<pre class="tree">${escapeHtml(dedent(text))
    .replace(/(#[^\n]*)/g, '<span class="t-com">$1</span>')}</pre>`;
}

/* ------------------------------------------------------------------ */
/* Persistance de la progression                                       */
/* ------------------------------------------------------------------ */
const STORE_KEY = 'fastapi-clean-lab:v1';
const PASS_RATIO = 0.7;

const STATE_SCHEMA = 2;

/** v1 → v2 : l'étape « Python de zéro » a été insérée en position 1, les suivantes sont décalées. */
function migrateState(saved) {
  if (!saved || saved.schema >= STATE_SCHEMA) return saved;
  const shift = (bucket) => Object.fromEntries(Object.entries(bucket || {}).map(([id, value]) => {
    const n = Number(id.replace(/^ch/, ''));
    return [n >= 1 ? `ch${String(n + 1).padStart(2, '0')}` : id, value];
  }));
  return { ...saved, quiz: shift(saved.quiz), visited: shift(saved.visited), schema: STATE_SCHEMA };
}

function loadState() {
  const fresh = { quiz: {}, visited: {}, theme: 'dark', schema: STATE_SCHEMA };
  try {
    return { ...fresh, ...migrateState(JSON.parse(localStorage.getItem(STORE_KEY))) };
  } catch {
    return fresh;
  }
}

const state = loadState();
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* stockage indisponible */ }
}

function quizResult(chapterId) { return state.quiz[chapterId]; }
function isPassed(chapter) {
  const result = quizResult(chapter.id);
  return Boolean(result && result.best / chapter.quiz.length >= PASS_RATIO);
}

/* ------------------------------------------------------------------ */
/* Rendu                                                               */
/* ------------------------------------------------------------------ */
const $content = () => document.getElementById('content');

function chapterLabel(index) { return index === 0 ? 'Étape 0' : `Étape ${index}`; }

function statusBadge(chapter) {
  const result = quizResult(chapter.id);
  if (isPassed(chapter)) return `<span class="badge badge-ok" title="QCM validé">✓ ${result.best}/${chapter.quiz.length}</span>`;
  if (result) return `<span class="badge badge-ko" title="Meilleur score">${result.best}/${chapter.quiz.length}</span>`;
  if (state.visited[chapter.id]) return '<span class="badge badge-seen" title="Déjà consultée">•</span>';
  return '';
}

function renderSidebar(activeId) {
  const items = window.CHAPTERS.map((ch, i) => `
    <li><a href="#/${ch.id}" class="${ch.id === activeId ? 'active' : ''}">
      <span class="num">${String(i).padStart(2, '0')}</span>
      <span class="title">${ch.title}</span>${statusBadge(ch)}
    </a></li>`).join('');
  document.getElementById('sidebar').innerHTML = `
    <a href="#/" class="home-link ${activeId ? '' : 'active'}">🏠 Accueil &amp; fil rouge</a>
    <a href="#/lexique" class="home-link ${activeId === 'lexique' ? 'active' : ''}">📖 Lexique Python</a>
    <ol class="chapter-list">${items}</ol>
    <div class="sidebar-foot">Progression sauvegardée localement dans ce navigateur.</div>`;
}

function renderProgress() {
  const total = window.CHAPTERS.length;
  const passed = window.CHAPTERS.filter(isPassed).length;
  document.getElementById('progress-fill').style.width = `${total ? (passed / total) * 100 : 0}%`;
  document.getElementById('progress-label').textContent = `${passed} / ${total}`;
}

function renderHome() {
  const cards = window.CHAPTERS.map((ch, i) => `
    <a class="card ${isPassed(ch) ? 'card-done' : ''}" href="#/${ch.id}">
      <div class="card-top"><span class="eyebrow">${chapterLabel(i)} · ${ch.duration}</span>${statusBadge(ch)}</div>
      <h3>${ch.title}</h3>
      <p>${ch.subtitle}</p>
    </a>`).join('');

  const totalQuestions = window.CHAPTERS.reduce((n, ch) => n + ch.quiz.length, 0);
  const bestTotal = window.CHAPTERS.reduce((n, ch) => n + (quizResult(ch.id)?.best || 0), 0);

  $content().innerHTML = `
  <article class="home">
    <section class="hero">
      <span class="eyebrow">Parcours pour développeurs back-end Java &amp; C#</span>
      <h1>Construire une API REST <span class="accent">FastAPI</span> propre, testée et prête pour la prod</h1>
      <p class="lead">${window.CHAPTERS.length} étapes progressives, du premier endpoint à la conteneurisation, en appliquant
      <strong>Clean Code</strong> et <strong>Clean Architecture</strong>. Chaque étape fait avancer le fil rouge
      <strong>Biblio API</strong> — la gestion d'une bibliothèque — et se termine par un exercice et un QCM.</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/${window.CHAPTERS[0]?.id || ''}">Commencer l'étape 0 →</a>
        <span class="score-pill">Score cumulé : <strong>${bestTotal}</strong> / ${totalQuestions}</span>
      </div>
    </section>

    <section class="home-grid">
      <div class="panel">
        <h2>🧵 Le fil rouge : Biblio API</h2>
        <p>Une médiathèque municipale veut exposer son catalogue et gérer ses emprunts via une API REST.</p>
        <ul class="rules">
          <li>📚 Catalogue de <strong>livres</strong> identifiés par un ISBN-13 valide (somme de contrôle).</li>
          <li>👤 Des <strong>adhérents</strong> avec un e-mail unique.</li>
          <li>🔁 Des <strong>emprunts</strong> de 21 jours, dans la limite des exemplaires disponibles.</li>
          <li>🚫 3 emprunts actifs maximum par adhérent.</li>
          <li>⏰ Détection des emprunts en retard.</li>
          <li>🔐 Seuls les bibliothécaires authentifiés (JWT) modifient les données.</li>
        </ul>
      </div>
      <div class="panel">
        <h2>🗺️ Les endpoints visés</h2>
        ${compare(['Méthode', 'Route', 'Accès'], [
          ['<span class="m m-post">POST</span>', '<code>/api/v1/auth/token</code>', 'public'],
          ['<span class="m m-get">GET</span>', '<code>/api/v1/books?q=&amp;limit=&amp;offset=</code>', 'public'],
          ['<span class="m m-get">GET</span>', '<code>/api/v1/books/{book_id}</code>', 'public'],
          ['<span class="m m-post">POST</span>', '<code>/api/v1/books</code>', 'bibliothécaire'],
          ['<span class="m m-patch">PATCH</span>', '<code>/api/v1/books/{book_id}</code>', 'bibliothécaire'],
          ['<span class="m m-post">POST</span>', '<code>/api/v1/members</code>', 'bibliothécaire'],
          ['<span class="m m-post">POST</span>', '<code>/api/v1/loans</code>', 'bibliothécaire'],
          ['<span class="m m-post">POST</span>', '<code>/api/v1/loans/{loan_id}/return</code>', 'bibliothécaire'],
          ['<span class="m m-get">GET</span>', '<code>/api/v1/loans/overdue</code>', 'bibliothécaire'],
        ])}
      </div>
    </section>

    <section class="panel how">
      <h2>🧭 Mode d'emploi</h2>
      <ol>
        <li>Lis l'étape, recopie le code dans ton projet <code>biblio/</code> (bouton <em>Copier</em> sur chaque bloc).</li>
        <li>Fais l'<strong>exercice fil rouge</strong> avant de déplier la solution.</li>
        <li>Valide le <strong>QCM</strong> : une étape est considérée acquise à partir de 70 % de bonnes réponses.</li>
        <li>Les encadrés <span class="inline-tag tag-java">☕ Côté Java / C#</span> font le pont avec Spring Boot et ASP.NET Core.</li>
        <li>Tu débutes en Python ? Dans le code, <span class="g-demo">les mots soulignés en pointillé</span> affichent leur définition au survol,
        les encadrés <strong>🔎 Décryptage</strong> expliquent les extraits ligne à ligne, et le <a href="#/lexique">📖 Lexique</a> regroupe toutes les notions.</li>
      </ol>
      <button class="btn btn-ghost" id="reset-progress" type="button">Réinitialiser ma progression</button>
    </section>

    <h2 class="section-title">Les étapes</h2>
    <section class="cards">${cards}</section>
  </article>`;

  document.getElementById('reset-progress').addEventListener('click', () => {
    if (!confirm('Effacer tous les scores et la progression ?')) return;
    state.quiz = {};
    state.visited = {};
    saveState();
    route();
  });
  document.getElementById('toc').innerHTML = '';
}

function renderExercise(exercise) {
  if (!exercise) return '';
  const hints = (exercise.hints || []).map((h, i) => `
    <details class="hint"><summary>Indice ${i + 1}</summary><div>${h}</div></details>`).join('');
  return `
  <section class="exercise">
    <h2>🛠️ Exercice fil rouge — ${exercise.title}</h2>
    <div class="exercise-body">${exercise.statement}</div>
    ${hints}
    <details class="solution"><summary>Afficher la solution</summary><div>${exercise.solution}</div></details>
  </section>`;
}

function renderQuiz(chapter) {
  const questions = chapter.quiz.map((q, qi) => `
    <fieldset class="question" data-q="${qi}">
      <legend><span class="qnum">Q${qi + 1}</span> ${q.q}</legend>
      ${q.options.map((opt, oi) => `
        <label class="option">
          <input type="radio" name="q${qi}" value="${oi}">
          <span>${opt}</span>
        </label>`).join('')}
      <div class="explain" hidden></div>
    </fieldset>`).join('');

  return `
  <section class="quiz" id="quiz">
    <h2>✅ QCM — valide tes acquis</h2>
    <p class="muted">${chapter.quiz.length} questions · étape validée à partir de ${Math.ceil(chapter.quiz.length * PASS_RATIO)} bonnes réponses.</p>
    <form id="quiz-form">${questions}
      <div class="quiz-actions">
        <button class="btn btn-primary" type="submit">Valider mes réponses</button>
        <button class="btn btn-ghost" type="button" id="quiz-reset">Recommencer</button>
        <div class="quiz-score" id="quiz-score" aria-live="polite"></div>
      </div>
    </form>
  </section>`;
}

function correctQuiz(chapter, form, { persist }) {
  let score = 0;
  const answers = [];
  chapter.quiz.forEach((q, qi) => {
    const fieldset = form.querySelector(`[data-q="${qi}"]`);
    const checked = fieldset.querySelector('input:checked');
    const chosen = checked ? Number(checked.value) : null;
    answers.push(chosen);
    const ok = chosen === q.answer;
    if (ok) score++;
    fieldset.classList.remove('is-ok', 'is-ko');
    fieldset.classList.add(ok ? 'is-ok' : 'is-ko');
    fieldset.querySelectorAll('.option').forEach((label, oi) => {
      label.classList.toggle('opt-correct', oi === q.answer);
      label.classList.toggle('opt-wrong', oi === chosen && !ok);
    });
    const explain = fieldset.querySelector('.explain');
    explain.hidden = false;
    explain.innerHTML = `<strong>${ok ? '✔ Bonne réponse.' : (chosen === null ? '— Sans réponse.' : '✘ Raté.')}</strong> ${q.explain}`;
  });

  const total = chapter.quiz.length;
  const passed = score / total >= PASS_RATIO;
  document.getElementById('quiz-score').innerHTML =
    `<span class="${passed ? 'score-ok' : 'score-ko'}">${score} / ${total}</span> ${passed ? '🎉 Étape validée !' : 'Relis les explications et retente ta chance.'}`;

  if (persist) {
    const previous = state.quiz[chapter.id];
    state.quiz[chapter.id] = { best: Math.max(previous?.best || 0, score), last: score, answers };
    saveState();
    renderSidebar(chapter.id);
    renderProgress();
  }
}

function bindQuiz(chapter) {
  const form = document.getElementById('quiz-form');
  const saved = quizResult(chapter.id);
  if (saved?.answers) {
    saved.answers.forEach((a, qi) => {
      if (a === null || a === undefined) return;
      const input = form.querySelector(`input[name="q${qi}"][value="${a}"]`);
      if (input) input.checked = true;
    });
    correctQuiz(chapter, form, { persist: false });
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    correctQuiz(chapter, form, { persist: true });
  });
  document.getElementById('quiz-reset').addEventListener('click', () => {
    form.reset();
    form.querySelectorAll('.question').forEach((f) => f.classList.remove('is-ok', 'is-ko'));
    form.querySelectorAll('.option').forEach((l) => l.classList.remove('opt-correct', 'opt-wrong'));
    form.querySelectorAll('.explain').forEach((e) => { e.hidden = true; });
    document.getElementById('quiz-score').innerHTML = '';
  });
}

function slugify(text) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function buildToc() {
  const headings = [...$content().querySelectorAll('h2')];
  headings.forEach((h, i) => { h.id = h.id || `s-${i}-${slugify(h.textContent)}`; });
  const toc = document.getElementById('toc');
  toc.innerHTML = `<div class="toc-title">Sur cette page</div><ul>${headings
    .map((h) => `<li><a data-target="${h.id}">${escapeHtml(h.textContent)}</a></li>`).join('')}</ul>`;
  toc.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
    document.getElementById(a.dataset.target).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  if (!('IntersectionObserver' in window)) return;
  const links = new Map([...toc.querySelectorAll('a')].map((a) => [a.dataset.target, a]));
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      links.forEach((a) => a.classList.remove('active'));
      links.get(entry.target.id)?.classList.add('active');
    });
  }, { rootMargin: '-80px 0px -70% 0px' });
  headings.forEach((h) => observer.observe(h));
}

function renderChapter(chapter, index) {
  state.visited[chapter.id] = true;
  saveState();
  const prev = window.CHAPTERS[index - 1];
  const next = window.CHAPTERS[index + 1];
  const objectives = chapter.objectives.map((o) => `<li>${o}</li>`).join('');

  $content().innerHTML = `
  <article class="chapter">
    <header class="chapter-head">
      <span class="eyebrow">${chapterLabel(index)} / ${window.CHAPTERS.length - 1} · ⏱ ${chapter.duration}</span>
      <h1>${chapter.title}</h1>
      <p class="lead">${chapter.subtitle}</p>
      <div class="objectives"><strong>🎯 Objectifs</strong><ul>${objectives}</ul></div>
    </header>
    <div class="prose">${chapter.content}</div>
    ${renderExercise(chapter.exercise)}
    ${renderQuiz(chapter)}
    <nav class="pager">
      ${prev ? `<a class="btn btn-ghost" href="#/${prev.id}">← ${prev.title}</a>` : '<a class="btn btn-ghost" href="#/">← Accueil</a>'}
      ${next ? `<a class="btn btn-primary" href="#/${next.id}">${next.title} →</a>` : '<a class="btn btn-primary" href="#/">🏁 Retour à l\'accueil</a>'}
    </nav>
  </article>`;

  bindQuiz(chapter);
  buildToc();
}

/* ------------------------------------------------------------------ */
/* Lexique : page #/lexique et infobulles sur le code                  */
/* ------------------------------------------------------------------ */
function glossaryAnchor(key) { return `gl-${[...key].map((c) => c.charCodeAt(0).toString(36)).join('')}`; }

function glossaryEntryHtml(key, entry) {
  const java = entry.java ? `<div class="gl-java"><span>☕ Java / C#</span> ${entry.java}</div>` : '';
  return `<div class="gl-entry" id="${glossaryAnchor(key)}" data-search="${escapeHtml(`${key} ${entry.def}`.toLowerCase().replace(/<[^>]+>/g, ''))}">
    <dt><code>${escapeHtml(key)}</code></dt><dd>${entry.def}${java}</dd></div>`;
}

function renderGlossary(focusKey) {
  const sections = GLOSSARY_CATEGORIES.map((cat) => {
    const entries = Object.entries(GLOSSARY).filter(([, e]) => e.cat === cat)
      .sort(([a], [b]) => a.replace(/^[@.]/, '').localeCompare(b.replace(/^[@.]/, ''), 'fr', { sensitivity: 'base' }));
    if (!entries.length) return '';
    return `<section class="gl-section"><h2>${cat}</h2><dl class="glossary">${entries.map(([k, e]) => glossaryEntryHtml(k, e)).join('')}</dl></section>`;
  }).join('');

  $content().innerHTML = `
  <article class="chapter lexique">
    <header class="chapter-head">
      <span class="eyebrow">Référence · ${Object.keys(GLOSSARY).length} entrées</span>
      <h1>📖 Lexique Python</h1>
      <p class="lead">Tous les mots-clés, fonctions et notions rencontrés dans le tutoriel, avec leur équivalent Java / C#.
      Dans les blocs de code, <span class="g-demo">les mots soulignés en pointillé</span> ont une définition : survole-les (ou touche-les sur mobile).</p>
      <input type="search" id="gl-search" class="gl-search" placeholder="Rechercher : def, self, await, Depends…" autocomplete="off">
    </header>
    <div class="prose">${sections}<p class="muted" id="gl-empty" hidden>Aucune entrée ne correspond.</p></div>
  </article>`;

  const input = document.getElementById('gl-search');
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    let visible = 0;
    $content().querySelectorAll('.gl-entry').forEach((el) => {
      const show = !q || el.dataset.search.includes(q);
      el.hidden = !show;
      if (show) visible++;
    });
    $content().querySelectorAll('.gl-section').forEach((sec) => {
      sec.hidden = ![...sec.querySelectorAll('.gl-entry')].some((el) => !el.hidden);
    });
    document.getElementById('gl-empty').hidden = visible > 0;
  });
  buildToc();
  if (focusKey && glossaryLookup(focusKey)) {
    const target = document.getElementById(glossaryAnchor(focusKey));
    target.classList.add('gl-focus');
    setTimeout(() => target.scrollIntoView({ block: 'center' }), 0);
  }
}

const glossaryPopover = { el: null, anchor: null, hideTimer: null };

function showGlossary(anchor) {
  const key = anchor.dataset.g;
  const entry = glossaryLookup(key);
  if (!entry) return;
  clearTimeout(glossaryPopover.hideTimer);
  if (!glossaryPopover.el) {
    glossaryPopover.el = document.createElement('div');
    glossaryPopover.el.className = 'gl-pop';
    glossaryPopover.el.setAttribute('role', 'tooltip');
    glossaryPopover.el.addEventListener('mouseenter', () => clearTimeout(glossaryPopover.hideTimer));
    glossaryPopover.el.addEventListener('mouseleave', () => scheduleHideGlossary());
    document.body.appendChild(glossaryPopover.el);
  }
  const pop = glossaryPopover.el;
  const java = entry.java ? `<div class="gl-java"><span>☕ Java / C#</span> ${entry.java}</div>` : '';
  pop.innerHTML = `<div class="gl-pop-head"><code>${escapeHtml(key)}</code><span class="gl-cat">${entry.cat}</span></div>
    <div class="gl-pop-body">${entry.def}</div>${java}
    <a class="gl-more" href="#/lexique/${encodeURIComponent(key)}">Voir dans le lexique →</a>`;
  pop.hidden = false;
  glossaryPopover.anchor = anchor;

  const rect = anchor.getBoundingClientRect();
  const width = Math.min(380, window.innerWidth - 16);
  pop.style.width = `${width}px`;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  pop.style.left = `${left}px`;
  const below = rect.bottom + 8;
  const height = pop.offsetHeight;
  pop.style.top = `${below + height > window.innerHeight && rect.top - height - 8 > 0 ? rect.top - height - 8 : below}px`;
}

function hideGlossary() {
  if (glossaryPopover.el) glossaryPopover.el.hidden = true;
  glossaryPopover.anchor = null;
}

function scheduleHideGlossary() {
  clearTimeout(glossaryPopover.hideTimer);
  glossaryPopover.hideTimer = setTimeout(hideGlossary, 250);
}

document.addEventListener('mouseover', (event) => {
  const anchor = event.target.closest?.('.g');
  if (anchor) showGlossary(anchor);
});
document.addEventListener('mouseout', (event) => {
  if (event.target.closest?.('.g')) scheduleHideGlossary();
});
document.addEventListener('click', (event) => {
  const anchor = event.target.closest('.g');
  if (anchor) { showGlossary(anchor); return; }
  if (!event.target.closest('.gl-pop')) hideGlossary();
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideGlossary(); });
window.addEventListener('scroll', hideGlossary, { passive: true });

/* ------------------------------------------------------------------ */
/* Routage par hash                                                    */
/* ------------------------------------------------------------------ */
function route() {
  hideGlossary();
  const id = location.hash.replace(/^#\/?/, '');
  const [page, param] = id.split('/');
  if (page === 'lexique') {
    renderGlossary(param ? decodeURIComponent(param) : null);
    renderSidebar('lexique');
    renderProgress();
    document.body.classList.remove('sidebar-open');
    if (!param) window.scrollTo(0, 0);
    return;
  }
  const index = window.CHAPTERS.findIndex((c) => c.id === id);
  if (index >= 0) renderChapter(window.CHAPTERS[index], index);
  else renderHome();
  renderSidebar(index >= 0 ? id : null);
  renderProgress();
  document.body.classList.remove('sidebar-open');
  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------ */
/* Interactions globales                                               */
/* ------------------------------------------------------------------ */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('.copy-btn');
  if (!button) return;
  const ok = await copyToClipboard(CODE_STORE[button.dataset.code]);
  button.textContent = ok ? 'Copié ✓' : 'Échec';
  setTimeout(() => { button.textContent = 'Copier'; }, 1500);
});

document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  document.getElementById('theme-toggle').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    saveState();
    applyTheme();
  });
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.body.classList.toggle('sidebar-open');
  });
  window.addEventListener('hashchange', route);
  route();
});
