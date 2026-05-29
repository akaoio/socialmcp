const PLATFORMS = {
  facebook:  { label: 'Facebook', accent: '#1d78f2', note: 'Feed + group style workflows.' },
  x:         { label: 'X', accent: '#8f7eff', note: 'Fast public stream and DMs.' },
  instagram: { label: 'Instagram', accent: '#ff4fa1', note: 'Profile-heavy and visual timeline.' },
  threads:   { label: 'Threads', accent: '#52d695', note: 'Conversation-first timeline.' },
};

const ACTIONS = [
  { value: 'post', label: 'Post' },
  { value: 'comment', label: 'Comment' },
  { value: 'react', label: 'React' },
  { value: 'scroll', label: 'Scroll feed' },
  { value: 'search', label: 'Search' },
  { value: 'follow', label: 'Follow' },
  { value: 'unfollow', label: 'Unfollow' },
  { value: 'message', label: 'Message' },
  { value: 'profile', label: 'Profile' },
];

const ACTION_FIELDS = {
  post: ['content'],
  comment: ['post_url', 'content'],
  react: ['post_url', 'reaction'],
  scroll: ['count'],
  search: ['query', 'type'],
  follow: ['user'],
  unfollow: ['user'],
  message: ['user', 'content'],
  profile: ['user'],
};

const tabs = document.getElementById('tabs');
const forms = document.getElementById('forms');
const result = document.getElementById('result');
const secretInput = document.getElementById('secret');
const saveSecret = document.getElementById('savesecret');

let current = 'facebook';

function setresult(data) {
  result.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function actionoptions() {
  return ACTIONS.map(a => `<option value="${a.value}">${a.label}</option>`).join('');
}

function field(label, name, input, formClass = '') {
  return `<label class="${formClass}" data-field="${name}">${label}${input}</label>`;
}

function platformForm(name, cfg) {
  return `
    <form class="form" data-platform="${name}">
      <p class="note">${cfg.note}</p>
      ${field('Action', 'action', `<select name="action">${actionoptions()}</select>`)}
      ${field('User URL / username', 'user', `<input name="user" placeholder="https://... or username" />`)}
      ${field('Post URL', 'post_url', `<input name="post_url" placeholder="https://..." />`)}
      ${field('Content', 'content', `<textarea name="content" placeholder="Write message, post, or comment..."></textarea>`)}
      ${field('Search query', 'query', `<input name="query" placeholder="keywords..." />`)}
      ${field('Search type', 'type', `<select name="type">
        <option value="posts">posts</option>
        <option value="users">users</option>
        <option value="groups">groups</option>
        <option value="pages">pages</option>
      </select>`)}
      ${field('Reaction', 'reaction', `<select name="reaction">
        <option value="like">like</option>
        <option value="love">love</option>
        <option value="haha">haha</option>
        <option value="wow">wow</option>
        <option value="sad">sad</option>
        <option value="angry">angry</option>
      </select>`)}
      ${field('Scroll count', 'count', `<input name="count" type="number" min="1" max="50" value="10" />`)}
      <button class="run" type="submit">Run</button>
    </form>
  `;
}

function render() {
  tabs.innerHTML = Object.entries(PLATFORMS).map(([key, cfg]) => (
    `<button class="tab ${key === current ? 'active' : ''}" data-platform="${key}" type="button">${cfg.label}</button>`
  )).join('');

  forms.innerHTML = Object.entries(PLATFORMS).map(([key, cfg]) => platformForm(key, cfg)).join('');
  document.querySelector(`.form[data-platform="${current}"]`)?.classList.add('active');
  document.documentElement.style.setProperty('--accent', PLATFORMS[current].accent);
}

function syncfields(form) {
  const action = form.elements.action.value;
  const visible = new Set(ACTION_FIELDS[action] ?? []);
  form.querySelectorAll('[data-field]').forEach(el => {
    el.style.display = visible.has(el.dataset.field) || el.dataset.field === 'action' ? 'grid' : 'none';
  });
}

function readparams(form) {
  const action = form.elements.action.value;
  const fields = ACTION_FIELDS[action] ?? [];
  const params = {};

  for (const name of fields) {
    const value = form.elements[name].value.trim();
    if (!value && name !== 'count') continue;
    params[name] = name === 'count' ? Number(value || 10) : value;
  }

  return { action, params };
}

async function dispatch(platform, action, params) {
  const response = await chrome.runtime.sendMessage({
    type: 'ui:dispatch',
    platform,
    action,
    params,
  });
  if (response?.error) throw new Error(response.error);
  return response?.result;
}

async function initsecret() {
  const { secret = '' } = await chrome.storage.local.get(['secret']);
  secretInput.value = secret;
}

tabs.addEventListener('click', e => {
  const btn = e.target.closest('[data-platform]');
  if (!btn) return;

  current = btn.dataset.platform;
  render();
  bindforms();
});

function bindforms() {
  document.querySelectorAll('.form').forEach(form => {
    syncfields(form);
    form.elements.action.addEventListener('change', () => syncfields(form));

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const { action, params } = readparams(form);
      setresult('Running...');

      try {
        const r = await dispatch(form.dataset.platform, action, params);
        setresult(r ?? { ok: true });
      } catch (err) {
        setresult({ error: err.message });
      }
    });
  });
}

saveSecret.addEventListener('click', async () => {
  await chrome.storage.local.set({ secret: secretInput.value.trim() });
  setresult('Secret saved.');
});

render();
bindforms();
initsecret().catch(() => setresult('Unable to read secret from storage.'));
