/**
 * dashboard.js — Social MCP dashboard
 * Runs as a Chrome extension page (chrome-extension://…/dashboard.html)
 * Communicates with content scripts via background.js ui:dispatch messages.
 */

// ── State ─────────────────────────────────────────────────────────────────

let fbpages       = [];
let imageDataUrls = [];

// ── Helpers ───────────────────────────────────────────────────────────────

const el = id => document.getElementById(id);

function filetourl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

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

// ── Pages list ────────────────────────────────────────────────────────────

function renderpages(pages) {
  const list = el('fb-pages');
  if (!pages.length) {
    list.innerHTML = '<span class="hint">No pages found. Make sure facebook.com is open in a tab.</span>';
    return;
  }
  list.innerHTML = pages.map(p => `
    <label class="pageitem">
      <input type="checkbox" name="fb-page" value="${p.url}" checked />
      <span class="pagename" title="${p.url}">${p.name}</span>
    </label>
  `).join('');

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

// ── Image picker ──────────────────────────────────────────────────────────

function setupimagepicker() {
  const input    = el('fb-imagefile');
  const previews = el('fb-imagepreviews');
  const hint     = el('fb-imagehint');
  const clear    = el('fb-imageclear');
  const drop     = el('fb-imagedrop');

  async function loadfiles(files) {
    const valid = [...files].filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (!valid.length) return;
    imageDataUrls = await Promise.all(valid.map(filetourl));
    previews.innerHTML = imageDataUrls.map(url => `<img class="imagethumb" src="${url}" />`).join('');
    previews.hidden = false;
    hint.hidden     = true;
    clear.hidden    = false;
  }

  input.addEventListener('change', () => loadfiles(input.files));

  clear.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    imageDataUrls      = [];
    input.value        = '';
    previews.innerHTML = '';
    previews.hidden    = true;
    hint.hidden        = false;
    clear.hidden       = true;
  });

  drop.addEventListener('dragover', ev => { ev.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', ev => {
    ev.preventDefault();
    drop.classList.remove('drag');
    loadfiles(ev.dataTransfer.files);
  });
}

// ── Post ──────────────────────────────────────────────────────────────────

async function fbpost() {
  const content = el('fb-content').value.trim();
  const targets = [...document.querySelectorAll('input[name="fb-target"]:checked')].map(c => c.value);

  if (!content && !imageDataUrls.length) { fblog('Nothing to post — add content or images.'); return; }
  if (!targets.length) { fblog('No target selected.'); return; }

  const btn = el('fb-post');
  btn.disabled = true;

  for (const target of targets) {
    const name = target === '__feed__' ? 'personal feed' : (fbpages.find(p => p.url === target)?.name ?? target);
    fblog(`Posting to ${name}…`);
    try {
      const params = {};
      if (content)              params.content = content;
      if (imageDataUrls.length) params.media   = imageDataUrls;

      if (target === '__feed__') {
        await dispatch('facebook', 'post', params);
      } else {
        const page = fbpages.find(p => p.url === target);
        await dispatch('facebook', 'postpage', { page_url: target, page_id: page?.id, ...params });
      }
      fblog(`✓ Posted to ${name}`);
    } catch (e) {
      fblog(`✗ ${name}: ${e.message}`);
    }
  }

  btn.disabled = false;
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
  el('fb-scan').addEventListener('click', scanpages);
  el('fb-post').addEventListener('click', fbpost);
  setupimagepicker();

  const { fb_pages = [] } = await chrome.storage.local.get(['fb_pages']);
  fbpages = fb_pages;
  if (fbpages.length) renderpages(fbpages);

  setupsecret();
  await loadsecret();
}

init().catch(e => console.error('[dashboard]', e));


// ── State ─────────────────────────────────────────────────────────────────

let fbpages       = [];
let imageDataUrls = [];

// ── Helpers ───────────────────────────────────────────────────────────────

const el = id => document.getElementById(id);

function filetourl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

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
    const params = await collectfields(platform, sel.value);
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
  if (m.type === 'file') {
    return `<label class="field">${m.label}<input id="${id}" type="file" accept="${m.accept ?? '*'}"${m.multiple ? ' multiple' : ''}></label>`;
  }
  return `<label class="field">${m.label}<input id="${id}" type="${m.type ?? 'text'}"
    placeholder="${m.placeholder ?? ''}"
    ${m.min !== undefined ? `min="${m.min}"` : ''}
    ${m.max !== undefined ? `max="${m.max}"` : ''}
    ${m.default !== undefined ? `value="${m.default}"` : ''}></label>`;
}

async function collectfields(prefix, action) {
  const fields = ACTIONS.find(a => a.value === action)?.fields ?? [];
  const params = {};
  for (const f of fields) {
    const inp = el(`${prefix}-f-${f}`);
    if (!inp) continue;
    if (f === 'media') {
      if (inp.files?.length) params.media = await Promise.all([...inp.files].map(filetourl));
      continue;
    }
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
  const input    = el('fb-imagefile');
  const previews = el('fb-imagepreviews');
  const hint     = el('fb-imagehint');
  const clear    = el('fb-imageclear');
  const drop     = el('fb-imagedrop');

  async function loadfiles(files) {
    const valid = [...files].filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (!valid.length) return;
    imageDataUrls = await Promise.all(valid.map(filetourl));
    previews.innerHTML = imageDataUrls.map(url => `<img class="imagethumb" src="${url}" />`).join('');
    previews.hidden = false;
    hint.hidden     = true;
    clear.hidden    = false;
  }

  input.addEventListener('change', () => loadfiles(input.files));

  clear.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    imageDataUrls      = [];
    input.value        = '';
    previews.innerHTML = '';
    previews.hidden    = true;
    hint.hidden        = false;
    clear.hidden       = true;
  });

  drop.addEventListener('dragover', ev => { ev.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', ev => {
    ev.preventDefault();
    drop.classList.remove('drag');
    loadfiles(ev.dataTransfer.files);
  });
}

// ── Facebook: post ────────────────────────────────────────────────────────

async function fbpost() {
  const content = el('fb-content').value.trim();
  const targets = [...document.querySelectorAll('input[name="fb-target"]:checked')].map(c => c.value);

  if (!content && !imageDataUrls.length) { fblog('Nothing to post — add content or an image.'); return; }
  if (!targets.length)           { fblog('No target selected.'); return; }

  const btn = el('fb-post');
  btn.disabled = true;

  for (const target of targets) {
    const name = target === '__feed__' ? 'personal feed' : (fbpages.find(p => p.url === target)?.name ?? target);
    fblog(`Posting to ${name}…`);
    try {
      const params = {};
      if (content)             params.content = content;
      if (imageDataUrls.length) params.media  = imageDataUrls;

      if (target === '__feed__') {
        await dispatch('facebook', 'post', params);
      } else {
        // Two-step navigation in background.js:
        //   1. Visits admin URL (latest/home?asset_id=) → sets page identity in session
        //   2. Visits page handle URL → composer is available without Switch Now banner
        const page = fbpages.find(p => p.url === target);
        await dispatch('facebook', 'postpage', { page_url: target, page_id: page?.id, ...params });
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
    const params = await collectfields(prefix, action);
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
