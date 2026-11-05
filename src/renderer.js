const $ = id => document.getElementById(id);
const storeKey = 'brisa-state-v1';
const initial = {
  groups: [{
    id: 'g1', name: 'Essenciais', sites: [
      { name: 'YouTube', url: 'https://youtube.com' },
      { name: 'GitHub', url: 'https://github.com' },
      { name: 'Spotify', url: 'https://open.spotify.com' }
    ]
  }],
  theme: 'obsidian', wallpaper: 'default', adblock: true
};
const themes = {
  obsidian: 'Obsidiana', snow: 'Neve', midnight: 'Meia-noite', violet: 'Violeta', sand: 'Areia'
};
const wallpaperNames = { default: 'Padrão', aurora: 'Aurora', dune: 'Duna', night: 'Noite' };
const wallpaperImages = {
  default: 'var(--wallpaper)',
  aurora: 'radial-gradient(ellipse at 70% 20%, #55799b, #17212d 70%)',
  dune: 'radial-gradient(ellipse at 25% 25%, #bd9871, #362c25 72%)',
  night: 'radial-gradient(ellipse at 60% 35%, #5c4c72, #17141d 72%)'
};

let state;
try {
  const saved = JSON.parse(localStorage.getItem(storeKey) || '{}');
  state = { ...initial, ...saved, groups: Array.isArray(saved.groups) ? saved.groups : initial.groups };
} catch { state = structuredClone(initial); }
if (!themes[state.theme]) state.theme = 'obsidian';
if (!wallpaperImages[state.wallpaper]) state.wallpaper = 'default';
let tabs = [];
let activeId = null;
let toastTimer;

function notify(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2400);
}

function save() {
  try { localStorage.setItem(storeKey, JSON.stringify(state)); }
  catch { notify('A imagem ficou grande demais. Escolha uma imagem menor.'); }
}

function normalizeAddress(value) {
  const text = value.trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(text)) return `https://${text}`;
  return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}

function applyTheme() {
  document.body.dataset.theme = state.theme;
  $('themeLabel').textContent = `Tema ${themes[state.theme]}`;
}

function applyWallpaper() {
  const home = $('home');
  if (state.customWallpaper) {
    home.style.backgroundImage = `url("${state.customWallpaper}")`;
  } else {
    home.style.backgroundImage = wallpaperImages[state.wallpaper] || wallpaperImages.default;
  }
}

function resizePages() {
  const stage = $('stage');
  const width = Math.max(1, Math.round(stage.clientWidth));
  const height = Math.max(1, Math.round(stage.clientHeight));
  for (const tab of tabs) {
    if (!tab.page) continue;
    tab.page.setAttribute('width', String(width));
    tab.page.setAttribute('height', String(height));
    tab.page.style.width = `${width}px`;
    tab.page.style.height = `${height}px`;
  }
}

function renderTabs() {
  const host = $('tabs');
  host.replaceChildren();
  tabs.forEach(tab => {
    const item = document.createElement('div');
    item.className = `tab ${tab.id === activeId ? 'active' : ''}`;
    const icon = document.createElement('span');
    icon.className = 'favicon';
    icon.textContent = tab.home ? 'b' : (tab.title[0] || '•').toUpperCase();
    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title;
    const close = document.createElement('button');
    close.className = 'tab-x';
    close.title = 'Fechar aba';
    close.setAttribute('aria-label', `Fechar ${tab.title}`);
    close.textContent = '×';
    close.addEventListener('click', event => { event.stopPropagation(); closeTab(tab.id); });
    item.addEventListener('click', () => activate(tab.id));
    item.append(icon, title, close);
    host.append(item);
  });
}

function activate(id) {
  activeId = id;
  const tab = tabs.find(item => item.id === id);
  if (!tab) return;
  tabs.forEach(item => { if (item.page) item.page.style.display = item.id === id ? 'flex' : 'none'; });
  $('home').style.display = tab.home ? 'block' : 'none';
  $('address').value = tab.url || '';
  $('address').placeholder = tab.home ? 'Pesquise ou digite um endereço' : 'Endereço';
  if (tab.page) requestAnimationFrame(resizePages);
  renderTabs();
}

function newTab(url = '') {
  const tab = { id: crypto.randomUUID(), title: url ? new URL(url).hostname : 'Nova aba', url, page: null, home: !url };
  tabs.push(tab);
  activate(tab.id);
  if (url) navigate(tab, url);
  return tab;
}

function closeTab(id) {
  const index = tabs.findIndex(tab => tab.id === id);
  if (index < 0) return;
  const [tab] = tabs.splice(index, 1);
  tab.page?.remove();
  if (!tabs.length) newTab();
  else if (activeId === id) activate(tabs[Math.max(0, index - 1)].id);
  else renderTabs();
}

function navigate(tab, value) {
  if (!tab) return;
  const url = normalizeAddress(value);
  if (!url) return;
  tab.url = url;
  tab.home = false;
  $('home').style.display = 'none';
  $('address').value = url;

  if (!tab.page) {
    const page = document.createElement('webview');
    page.className = 'page';
    page.setAttribute('partition', 'persist:brisa');
    page.setAttribute('webpreferences', 'contextIsolation=yes,sandbox=yes');
    page.style.display = 'none';
    page.addEventListener('page-title-updated', event => {
      tab.title = event.title || safeHostname(tab.url);
      renderTabs();
    });
    page.addEventListener('did-navigate', event => {
      tab.url = event.url;
      if (tab.id === activeId) $('address').value = event.url;
    });
    page.addEventListener('did-fail-load', event => {
      if (event.errorCode !== -3) notify('Não foi possível carregar esta página.');
    });
    tab.page = page;
    $('webviews').append(page);
  }

  activeId = tab.id;
  tab.page.style.display = 'flex';
  renderTabs();
  requestAnimationFrame(() => {
    resizePages();
    tab.page.src = url;
  });
}

function safeHostname(value) {
  try { return new URL(value).hostname; } catch { return 'Nova aba'; }
}

function addSiteToGroup(group) {
  const name = prompt('Nome do atalho:');
  if (!name) return;
  const address = prompt('Endereço do site:');
  if (!address) return;
  group.sites.push({ name: name.trim(), url: normalizeAddress(address) });
  save();
  renderGroups();
}

function renderGroups() {
  const host = $('groups');
  host.replaceChildren();
  state.groups.forEach(group => {
    const section = document.createElement('section');
    section.className = 'group';
    const heading = document.createElement('div');
    heading.className = 'group-title';
    const dot = document.createElement('i');
    dot.className = 'dot';
    const name = document.createElement('span');
    name.textContent = group.name;
    const add = document.createElement('button');
    add.className = 'group-add';
    add.title = 'Adicionar site a este grupo';
    add.textContent = '＋';
    add.addEventListener('click', () => addSiteToGroup(group));
    heading.append(dot, name, add);
    const sites = document.createElement('div');
    sites.className = 'group-sites';

    group.sites.forEach((site, index) => {
      const card = document.createElement('button');
      card.className = 'site';
      card.type = 'button';
      card.title = `Abrir ${site.name}`;
      const icon = document.createElement('span');
      icon.className = 'site-icon';
      icon.textContent = (site.name[0] || '•').toUpperCase();
      const label = document.createElement('span');
      label.textContent = site.name;
      const remove = document.createElement('span');
      remove.className = 'remove';
      remove.textContent = '×';
      remove.title = 'Remover atalho';
      card.append(icon, label, remove);
      card.addEventListener('click', event => {
        if (event.target === remove) {
          group.sites.splice(index, 1);
          save();
          renderGroups();
        } else newTab(normalizeAddress(site.url));
      });
      sites.append(card);
    });

    section.append(heading, sites);
    host.append(section);
  });
}

function openPanel(title, html) {
  $('panelTitle').textContent = title;
  $('panelContent').innerHTML = html;
  $('sidePanel').classList.remove('hidden');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function openExtensions() {
  const extensions = await window.brisa.extensions();
  const rows = extensions.length
    ? extensions.map(item => `<div class="ext-row"><div>${escapeHtml(item.name)}<small>Versão ${escapeHtml(item.version)}</small></div><button data-remove="${escapeHtml(item.id)}">Remover</button></div>`).join('')
    : '<p>Nenhuma extensão instalada. Selecione a pasta descompactada de uma extensão compatível.</p>';
  openPanel('Extensões', `<div class="panel-section"><h3>Suas extensões</h3>${rows}<button class="panel-action" id="installExt">＋ Instalar extensão local</button><p>Algumas APIs do Chrome não são suportadas por esta versão.</p></div>`);
  $('installExt').onclick = async () => {
    const result = await window.brisa.installExtension();
    if (result.ok) { notify(`${result.name} instalada`); openExtensions(); }
    else if (!result.canceled) notify(`Falha: ${result.error}`);
  };
  $('panelContent').querySelectorAll('[data-remove]').forEach(button => {
    button.onclick = async () => { await window.brisa.removeExtension(button.dataset.remove); openExtensions(); };
  });
}

function renderThemes() {
  return Object.entries(themes).map(([id, label]) => `
    <button class="theme-option ${state.theme === id ? 'selected' : ''}" data-theme-choice="${id}">
      <span class="theme-swatch swatch-${id}"></span><span>${label}</span>
    </button>`).join('');
}

function renderWallpapers() {
  return Object.entries(wallpaperNames).map(([id, label]) => `
    <button class="wall-option wall-${id} ${!state.customWallpaper && state.wallpaper === id ? 'selected' : ''}"
      data-wall-choice="${id}" title="${label}" aria-label="Fundo ${label}"></button>`).join('');
}

function openCustomize() {
  openPanel('Personalizar', `
    <div class="panel-section"><h3>Tema</h3><div class="theme-grid">${renderThemes()}</div></div>
    <div class="panel-section"><h3>Papel de parede</h3><div class="wallpaper-grid">${renderWallpapers()}</div>
      <label class="panel-action" style="display:block;margin-top:9px">▧ Escolher imagem<input id="wallFile" type="file" accept="image/*" hidden></label>
      ${state.customWallpaper ? '<button class="panel-action" id="removeWallpaper">Remover imagem</button>' : ''}
    </div>
    <div class="panel-section"><h3>Privacidade</h3><div class="toggle-row">Bloquear anúncios<button id="adToggle" class="toggle ${state.adblock ? 'on' : ''}" aria-label="Alternar bloqueio"></button></div>
      <p>Bloqueio básico local de anúncios e rastreadores conhecidos.</p>
    </div>
    <div class="panel-section"><button class="panel-action" id="manageExt">◇ Gerenciar extensões</button></div>`);

  $('panelContent').querySelectorAll('[data-theme-choice]').forEach(button => {
    button.onclick = () => {
      state.theme = button.dataset.themeChoice;
      applyTheme();
      save();
      openCustomize();
    };
  });
  $('panelContent').querySelectorAll('[data-wall-choice]').forEach(button => {
    button.onclick = () => {
      state.wallpaper = button.dataset.wallChoice;
      state.customWallpaper = '';
      applyWallpaper();
      save();
      openCustomize();
    };
  });
  $('wallFile').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1920 / bitmap.width, 1200 / bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      state.customWallpaper = canvas.toDataURL('image/jpeg', 0.78);
      bitmap.close();
      applyWallpaper();
      save();
      openCustomize();
    } catch { notify('Não consegui abrir essa imagem.'); }
  };
  $('removeWallpaper')?.addEventListener('click', () => {
    state.customWallpaper = '';
    state.wallpaper = 'default';
    applyWallpaper();
    save();
    openCustomize();
  });
  $('adToggle').onclick = async event => {
    state.adblock = !state.adblock;
    event.currentTarget.classList.toggle('on', state.adblock);
    await window.brisa.setAdblock(state.adblock);
    save();
    notify(state.adblock ? 'Bloqueio ativado' : 'Bloqueio pausado');
  };
  $('manageExt').onclick = openExtensions;
}

$('newTab').onclick = () => newTab();
$('back').onclick = () => tabs.find(tab => tab.id === activeId)?.page?.goBack();
$('forward').onclick = () => tabs.find(tab => tab.id === activeId)?.page?.goForward();
$('reload').onclick = () => tabs.find(tab => tab.id === activeId)?.page?.reload();
$('go').onclick = () => navigate(tabs.find(tab => tab.id === activeId), $('address').value);
$('address').addEventListener('keydown', event => { if (event.key === 'Enter') $('go').click(); });
$('searchForm').onsubmit = event => {
  event.preventDefault();
  navigate(tabs.find(tab => tab.id === activeId), $('homeSearch').value);
};
$('adblock').onclick = async () => {
  state.adblock = !state.adblock;
  $('adblock').classList.toggle('active', state.adblock);
  await window.brisa.setAdblock(state.adblock);
  save();
  notify(state.adblock ? 'Bloqueio ativado' : 'Bloqueio pausado');
};
$('extensions').onclick = openExtensions;
$('customize').onclick = openCustomize;
$('wallpaper').onclick = openCustomize;
$('panelClose').onclick = () => $('sidePanel').classList.add('hidden');
$('addSite').onclick = () => {
  const group = state.groups[0] || { id: crypto.randomUUID(), name: 'Favoritos', sites: [] };
  if (!state.groups.length) state.groups.push(group);
  addSiteToGroup(group);
};
$('minimize').onclick = () => window.brisa.minimize();
$('close').onclick = () => window.brisa.closeWindow();
$('maximize').onclick = () => window.brisa.toggleMaximize();
window.addEventListener('resize', resizePages);
new ResizeObserver(resizePages).observe($('stage'));
document.addEventListener('keydown', event => {
  if (event.ctrlKey && event.key.toLowerCase() === 'l') { event.preventDefault(); $('address').focus(); $('address').select(); }
  if (event.ctrlKey && event.key.toLowerCase() === 't') { event.preventDefault(); newTab(); }
  if (event.ctrlKey && event.key.toLowerCase() === 'w') { event.preventDefault(); closeTab(activeId); }
  if (event.altKey && event.key === 'ArrowLeft') tabs.find(tab => tab.id === activeId)?.page?.goBack();
  if (event.altKey && event.key === 'ArrowRight') tabs.find(tab => tab.id === activeId)?.page?.goForward();
});
window.brisa.onBlockedCount(count => $('blockedCount').textContent = count);
window.brisa.onNewTab(url => { if (url) newTab(url); });
window.brisa.adblockCount().then(count => $('blockedCount').textContent = count);
if (!state.adblock) { $('adblock').classList.remove('active'); window.brisa.setAdblock(false); }
applyTheme();
applyWallpaper();
renderGroups();
newTab();
