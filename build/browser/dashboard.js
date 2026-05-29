/**
 * dashboard.js — Social MCP full-page dashboard
 * Runs as a Chrome extension page (chrome-extension://…/dashboard.html)
 * Communicates with content scripts via background.js ui:dispatch messages.
 */

// ── Action / field metadata ───────────────────────────────────────────────

const ACTIONS = [
  { value: 'post',     label: 'Post',       fields: ['content'] },
  { value: 'comment',  label: 'Comment',    fields: ['post_url', 'content'] },
  { value: 'react',    label: 'React',      fields: ['post_url', 'reaction'] },
  { value: 'scroll',   label: 'Scroll',     fields: ['count'] },
  { value: 'search',   label: 'Search',     fields: ['query', 'type'] },
  { value: 'follow',   label: 'Follow',     fields: ['user'] },
  { value: 'unfollow', label: 'Unfollow',   fields: ['user'] },
  { value: 'message',  label: 'Message',    fields: ['user', 'content'] },
  { value: 'profile',  label: 'Profile',    fields: ['user'] },
];

const FIELD_META = {
  content:  { label: 'Content',      tag: 'textarea', placeholder: 'Write content...' },
  post_url: { label: 'Post URL',     tag: 'input',    placeholder: 'https://...' },
  user:     { label: 'User / URL',   tag: 'input',    placeholder: 'username or https://...' },
  query:    { label: 'Search query', tag: 'input',    placeholder: 'keywords...' },
  type:     { label: 'Type',         tag: 'select',   options: ['posts', 'users', 'groups', 'pages'] },
  reaction: { label: 'Reaction',     tag: 'select',   options: ['like', 'love', 'haha', 'wow', 'sad', 'angry'] },
  count:    { label: 'Count',        tag: 'input',    type: 'number', placeholder: '10', min: 1, max: 50, default: '10' },
};

const PLATFORMS = {
  x:         { label: 'X',         note: 'Fast public stream and DMs.' },
  instagram: { label: 'Instagram', note: 'Profile-heavy visual timeline.' },
  threads:   { label: 'Threads',   note: 'Conversation-first timeline.' },
};

// ── State ─────────────────────────────────────────────────────────────────

let fbpages      = [];
let imageDataUrl = null;

// ── Helpers ───────────────────────────────────────────────────────────────

const el = id => document.getElementById(id);

function fblog(msg) {
  const area = el('fb-log');
  const stamp = new Date().toLocaleTimeString();
  area.textContent += `[${stamp}] ${msg}\n`;
  area.scrollTop = area.scrollHeight;
}

// ── Dispatch ──────────────────────────────────────────────────────────────

async function dispatch(platform, action, params) {
  const resp = await chrome.runtime.sendMessage({ type: 'ui:dispatch', platform, action, params });
  if (resp?.error) throw new Error(resp.error);
  return resp?.result;
}

// ── Platform switching ────────────────────────────────────────────────────

function switchplatform(p) {
  document.querySelectorAll('.platformbtn').forEach(b => b.classList.toggle('active', b.dataset.p === p));
  document.querySelectorAll('.panel').forEach(pnl => pnl.classList.toggle('active', pnl.id === `panel-${p}`));
}

// ── Generic panel builder (X / Instagram / Threads) ───────────────────────

function buildgenericpanel(platform) {
  const cfg = PLATFORMS[platform];
  const pnl = el(`panel-${platform}`);

  pnl.innerHTML = `
    <div class="panelhead">
      <h1>${cfg.label}</h1>
      <p>${cfg.note}</p>
    </div>
    <div class="card genericpanel">
      <div class="cardhead"><h2>Action</h2></div>
      <label class="field">Select action<select id="${platform}-action"></select></label>
      <div id="${platform}-fields"></div>
      <div class="rowactions">
        <button class="primarybtn" id="${platform}-run">Run</button>
      </div>
    </div>
    <div class="card">
      <div class="cardhead"><h2>Result</h2></div>
      <pre class="log" id="${platform}-log">Ready.</pre>
    </div>
  `;

  const sel = el(`${platform}-action`);
  ACTIONS.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.value;
    opt.textContent = a.label;
    sel.appendChild(opt);
  });

  const sync = () => renderfields(platform, sel.value);
  sel.addEventListener('change', sync);
  sync();

  el(`${platform}-run`).addEventListener('click', async () => {
    const action = sel.value;
    const params = collectfields(platform, action);
    const logarea = el(`${platform}-log`);
    logarea.textContent = 'Running…';
    try {
      const result = await dispatch(platform, action, params);
      logarea.textContent = JSON.stringify(result ?? { ok: true }, null, 2);
    } catch (err) {
      logarea.textContent = 'Error: ' + err.message;
    }
  });
}

function renderfields(prefix, action) {
  const container = el(`${prefix}-fields`);
  const fields = ACTIONS.find(a => a.value === action)?.fields ?? [];
  container.innerHTML = fields.map(f => buildfield(prefix, f)).join('');
}

function buildfield(prefix, name) {
  const m  = FIELD_META[name];
  const id = `${prefix}-f-${name}`;
  if (m.tag === 'textarea') {
    return `<label class="field">${m.label}<textarea id="${id}" placeholder="${m.placeholder}"></textarea></label>`;
  }
  if (m.tag === 'select') {
    const opts = m.options.map(o => `<option value="${o}">${o}</option>`).join('');
    return `<label class="field">${m.label}<select id="${id}">${opts}</select></label>`;
  }
  return `<label class="field">${m.label}<input id="${id}" type="${m.type ?? 'text'}"
    placeholder="${m.placeholder ?? ''}"
    ${m.min !== undefined ? `min="${m.min}"` : ''}
    ${m.max !== undefined ? `max="${m.max}"` : ''}
    ${m.default !== undefined ? `value="${m.default}"` : ''}></label>`;
}

function collectfields(prefix, action) {
  const fields = ACTIONS.find(a => a.value === action)?.fields ?? [];
  const params = {};
  for (const f of fields) {
    const inp = el(`${prefix}-f-${f}`);
    if (!inp) continue;
    const v = inp.value.trim();
    if (v === '' && f !== 'count') continue;
    params[f] = f === 'count' ? Number(v || 10) : v;
  }
  return params;
}

// ── Facebook: pages list ──────────────────────────────────────────────────

function renderpages(pages) {
  const list = el('fb-pages');
  if (!pages.length) {
    list.innerHTML = '<span class="hint">No pages found. Make sure you manage pages on Facebook.</span>';
    return;
  }
  list.innerHTML = pages.map(p => `
    <label class="pageitem">
      <input type="checkbox" name="fb-page" value="${p.url}" checked />
      <span class="pagename" title="${p.url}">${p.name}</span>
    </label>
  `).join('');

  // Sync the "Post to" target list
  const targets = el('fb-targets');
  targets.innerHTML = `
    <label class="targetitem">
      <input type="checkbox" name="fb-target" value="__feed__" />
      Personal feed
    </label>
    ${pages.map(p => `
    <label class="targetitem">
      <input type="checkbox" name="fb-target" value="${p.url}" checked />
      ${p.name}
    </label>`).join('')}
  `;
}

async function scanpages() {
  const btn = el('fb-scan');
  btn.disabled = true;
  btn.textContent = 'Scanning…';
  fblog('Scanning Facebook pages…');
  try {
    const result = await dispatch('facebook', 'getpages', {
      _url: 'https://www.facebook.com/pages/?category=your_pages',
    });
    fbpages = result?.pages ?? [];
    renderpages(fbpages);
    await chrome.storage.local.set({ fb_pages: fbpages });
    fblog(`Found ${fbpages.length} page(s).`);
  } catch (e) {
    fblog('Error: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan pages';
  }
}

// ── Facebook: image picker ────────────────────────────────────────────────

function setupimagepicker() {
  const input   = el('fb-imagefile');
  const preview = el('fb-imagepreview');
  const hint    = el('fb-imagehint');
  const clear   = el('fb-imageclear');
  const drop    = el('fb-imagedrop');

  function loadfile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      imageDataUrl     = e.target.result;
      preview.src      = imageDataUrl;
      preview.hidden   = false;
      hint.hidden      = true;
      clear.hidden     = false;
    };
    reader.readAsDataURL(file);
  }

  input.addEventListener('change', () => loadfile(input.files[0]));

  clear.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    imageDataUrl   = null;
    input.value    = '';
    preview.hidden = true;
    hint.hidden    = false;
    clear.hidden   = true;
    preview.src    = '';
  });

  drop.addEventListener('dragover', ev => { ev.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', ev => {
    ev.preventDefault();
    drop.classList.remove('drag');
    loadfile(ev.dataTransfer.files[0]);
  });
}

// ── Facebook: post ────────────────────────────────────────────────────────

async function fbpost() {
  const content = el('fb-content').value.trim();
  const targets = [...document.querySelectorAll('input[name="fb-target"]:checked')].map(c => c.value);

  if (!content && !imageDataUrl) { fblog('Nothing to post — add content or an image.'); return; }
  if (!targets.length)           { fblog('No target selected.'); return; }

  const btn = el('fb-post');
  btn.disabled = true;

  for (const target of targets) {
    const name = target === '__feed__' ? 'personal feed' : (fbpages.find(p => p.url === target)?.name ?? target);
    fblog(`Posting to ${name}…`);
    try {
      const params = {};
      if (content)      params.content = content;
      if (imageDataUrl) params.image   = imageDataUrl;

      if (target === '__feed__') {
        await dispatch('facebook', 'post', params);
      } else {
        await dispatch('facebook', 'postpage', { page_url: target, ...params });
      }
      fblog(`✓ Posted to ${name}`);
    } catch (e) {
      fblog(`✗ ${name}: ${e.message}`);
    }
  }

  btn.disabled = false;
}

// ── Facebook: advanced actions section ───────────────────────────────────

function buildfbadv() {
  const wrap = el('fb-adv-wrap');
  const prefix = 'fb-adv';
  const advactions = ACTIONS.filter(a => a.value !== 'post');

  wrap.innerHTML = `
    <label class="field">Action<select id="${prefix}-action"></select></label>
    <div id="${prefix}-fields"></div>
    <div class="rowactions">
      <button class="secondarybtn" id="${prefix}-run">Run</button>
    </div>
  `;

  const sel = el(`${prefix}-action`);
  advactions.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.value;
    opt.textContent = a.label;
    sel.appendChild(opt);
  });

  const sync = () => renderfields(prefix, sel.value);
  sel.addEventListener('change', sync);
  sync();

  el(`${prefix}-run`).addEventListener('click', async () => {
    const action = sel.value;
    const params = collectfields(prefix, action);
    fblog(`Running ${action}…`);
    try {
      const result = await dispatch('facebook', action, params);
      fblog('Result: ' + JSON.stringify(result ?? { ok: true }));
    } catch (e) {
      fblog('Error: ' + e.message);
    }
  });
}

// ── Secret overlay ────────────────────────────────────────────────────────

function setupsecret() {
  el('secrettoggle').addEventListener('click', () => el('secretoverlay').classList.toggle('hidden'));
  el('secretcancel').addEventListener('click', () => el('secretoverlay').classList.add('hidden'));
  el('secretsave').addEventListener('click', async () => {
    await chrome.storage.local.set({ secret: el('secretinput').value.trim() });
    el('secretoverlay').classList.add('hidden');
    fblog('Secret saved.');
  });
}

async function loadsecret() {
  const { secret = '' } = await chrome.storage.local.get(['secret']);
  el('secretinput').value = secret;
}

// ── Init ──────────────────────────────────────────────────────────────────

async function init() {
  // Platform tabs
  document.querySelectorAll('.platformbtn').forEach(btn => {
    btn.addEventListener('click', () => switchplatform(btn.dataset.p));
  });

  // Facebook wiring
  el('fb-scan').addEventListener('click', scanpages);
  el('fb-post').addEventListener('click', fbpost);
  setupimagepicker();
  buildfbadv();

  // Load persisted pages
  const { fb_pages = [] } = await chrome.storage.local.get(['fb_pages']);
  fbpages = fb_pages;
  if (fbpages.length) renderpages(fbpages);

  // Generic panels
  buildgenericpanel('x');
  buildgenericpanel('instagram');
  buildgenericpanel('threads');

  // Secret
  setupsecret();
  await loadsecret();
}

init().catch(e => console.error('[dashboard]', e));
