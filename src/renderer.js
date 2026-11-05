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
  theme: 'obsidian', wallpaper: 'default', adblock: true, bookmarksBar: []
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
let migratedLegacyImports = false;
try {
  const saved = JSON.parse(localStorage.getItem(storeKey) || '{}');
  state = { ...initial, ...saved, groups: Array.isArray(saved.groups) ? saved.groups : initial.groups, bookmarksBar: Array.isArray(saved.bookmarksBar) ? saved.bookmarksBar : [] };
  if (!Array.isArray(saved.bookmarksBar) && Array.isArray(saved.groups)) {
    const imported = state.groups.filter(group => /^import-/.test(group.id || '') || /^(Google Chrome|Microsoft Edge|Brave)\s*[·-]/i.test(group.name || ''));
    state.bookmarksBar.push(...imported.map(group => ({ type: 'folder', name: group.name.replace(/^(Google Chrome|Microsoft Edge|Brave)\s*[·-]\s*/i, ''), children: group.sites.map(site => ({ type: 'url', ...site })) })));
    state.groups = state.groups.filter(group => !imported.includes(group));
    migratedLegacyImports = imported.length > 0;
  }
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

async function setAdblockEnabled(enabled, { showNotice = false } = {}) {
  state.adblock = !!enabled;
  state.adblock = await window.brisa.setAdblock(state.adblock);
  $('adblock').classList.toggle('active', state.adblock);
  $('adToggle')?.classList.toggle('on', state.adblock);
  save();
  if (showNotice) notify(state.adblock ? 'Bloqueio ativado' : 'Bloqueio pausado');
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

function faviconUrl(url) {
  return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=64`;
}

function createBookmarkLink(item, compact = false) {
  const link = document.createElement('button');
  link.className = 'bookmark-link';
  link.type = 'button';
  link.title = item.url;
  const icon = document.createElement('img');
  icon.alt = '';
  icon.loading = 'lazy';
  icon.src = faviconUrl(item.url);
  icon.onerror = () => { icon.hidden = true; };
  const label = document.createElement('span');
  label.textContent = item.name;
  link.append(icon, label);
  link.addEventListener('click', () => newTab(item.url));
  link.addEventListener('contextmenu', event => {
    event.preventDefault();
    showBookmarkMenu(event.clientX, event.clientY, [
      ['Abrir em nova aba', () => newTab(item.url)],
      ['Abrir em nova janela', () => window.brisa.openWindowTabs([item.url])],
      ['Renomear', () => renameBookmark(item)],
      ['Deletar', () => deleteBookmark(item)]
    ]);
  });
  return link;
}

function bookmarkUrls(item) {
  if (item.type === 'url') return [item.url];
  return (item.children || []).flatMap(bookmarkUrls);
}

function showBookmarkMenu(x, y, actions) {
  const menu = $('bookmarkContextMenu');
  menu.replaceChildren();
  actions.forEach(([label, action]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.role = 'menuitem'; button.textContent = label;
    button.onclick = () => { menu.classList.add('hidden'); action(); };
    menu.append(button);
  });
  menu.classList.remove('hidden');
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - bounds.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - bounds.height - 8))}px`;
}

function renameBookmark(item) {
  const name = prompt(item.type === 'folder' ? 'Nome da pasta:' : 'Nome do favorito:', item.name);
  if (!name?.trim()) return;
  item.name = name.trim(); save(); renderBookmarks();
}

function deleteBookmark(item) {
  if (!confirm(`Deletar ${item.type === 'folder' ? 'a pasta e seus favoritos' : 'este favorito'}?`)) return;
  removeBookmarkNode(state.bookmarksBar, item); save(); renderBookmarks();
}

function renderBookmarkNodes(nodes, host, nested = false) {
  for (const item of nodes) {
    if (item.type === 'url') { host.append(createBookmarkLink(item)); continue; }
    if (item.type !== 'folder') continue;
    const folder = document.createElement('details');
    folder.className = 'bookmark-folder';
    const summary = document.createElement('summary');
    summary.textContent = item.name;
    const menu = document.createElement('div');
    menu.className = 'bookmark-dropdown';
    renderBookmarkNodes(item.children || [], menu, true);
    const addSite = document.createElement('button');
    addSite.className = 'bookmark-manage';
    addSite.textContent = 'Adicionar favorito nesta pasta';
    addSite.onclick = () => {
      const name = prompt('Nome do favorito:'); const url = prompt('Endereço do site:');
      if (!name || !url) return;
      item.children ||= []; item.children.push({ type: 'url', name: name.trim(), url: normalizeAddress(url) }); save(); renderBookmarks();
    };
    const addFolder = document.createElement('button');
    addFolder.className = 'bookmark-manage'; addFolder.textContent = 'Criar subpasta';
    addFolder.onclick = () => { const name = prompt('Nome da pasta:'); if (!name?.trim()) return; item.children ||= []; item.children.push({ type: 'folder', name: name.trim(), children: [] }); save(); renderBookmarks(); };
    menu.append(addSite, addFolder);
    summary.addEventListener('contextmenu', event => {
      event.preventDefault();
      const urls = bookmarkUrls(item);
      const openInTabs = () => urls.forEach(url => newTab(url));
      const tabLabel = `${urls.length} ${urls.length === 1 ? 'aba' : 'abas'}`;
      showBookmarkMenu(event.clientX, event.clientY, [
        [`Abrir ${tabLabel}`, openInTabs],
        [`Abrir ${tabLabel} em nova janela`, () => window.brisa.openWindowTabs(urls)],
        ['Renomear pasta', () => renameBookmark(item)],
        ['Deletar pasta', () => deleteBookmark(item)]
      ]);
    });
    folder.append(summary, menu);
    host.append(folder);
  }
}

function removeBookmarkNode(nodes, target) {
  const index = nodes.indexOf(target);
  if (index >= 0) { nodes.splice(index, 1); return true; }
  return nodes.some(item => item.type === 'folder' && removeBookmarkNode(item.children || [], target));
}

function renderBookmarks() {
  const host = $('bookmarkItems');
  if (!host) return;
  host.replaceChildren();
  renderBookmarkNodes(state.bookmarksBar, host);
}

function renderGroups() {
  const host = $('groups');
  host.replaceChildren();
  state.groups.forEach(group => {
    const section = document.createElement('section');
    section.className = 'group';
    const sites = document.createElement('div');
    sites.className = 'group-sites';
    group.sites.forEach((site, index) => {
      const card = document.createElement('button');
      card.className = 'site'; card.type = 'button'; card.title = `Abrir ${site.name}`;
      const icon = document.createElement('span'); icon.className = 'site-icon';
      const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.src = faviconUrl(site.url);
      image.onerror = () => { image.remove(); icon.textContent = (site.name[0] || '?').toUpperCase(); };
      icon.append(image);
      const label = document.createElement('span'); label.textContent = site.name;
      const remove = document.createElement('span'); remove.className = 'remove'; remove.textContent = '×'; remove.title = 'Remover atalho';
      card.append(icon, label, remove);
      card.addEventListener('click', event => {
        if (event.target === remove) { group.sites.splice(index, 1); save(); renderGroups(); }
        else newTab(site.url);
      });
      sites.append(card);
    });
    section.append(sites); host.append(section);
  });
  const add = document.createElement('button');
  add.className = 'site-add'; add.type = 'button'; add.textContent = '+';
  add.title = 'Adicionar favorito à Home'; add.setAttribute('aria-label', 'Adicionar favorito à Home');
  add.onclick = () => {
    const group = state.groups[0] || { id: crypto.randomUUID(), name: 'Favoritos', sites: [] };
    if (!state.groups.length) state.groups.push(group);
    addSiteToGroup(group);
  };
  host.append(add);
}

function openPanel(title, html) {
  $('panelTitle').textContent = title;
  $('panelContent').innerHTML = html;
  $('sidePanel').classList.remove('hidden');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function legacyOpenExtensions() {
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

const settingsSections = { appearance: 'Aparencia', privacy: 'Privacidade', extensions: 'Extensoes', import: 'Importar dados' };
async function openSettings(section = 'appearance') {
  const extensions = section === 'extensions' ? await window.brisa.extensions() : [];
  const sources = section === 'import' ? await window.brisa.findImportSources() : [];
  const nav = Object.entries(settingsSections).map(([id, name]) => `<button class="settings-nav ${id === section ? 'selected' : ''}" data-settings="${id}">${name}</button>`).join('');
  let content = '';
  if (section === 'appearance') content = `<section class="settings-section"><h3>Aparência</h3><div class="theme-grid">${renderThemes()}</div></section><section class="settings-section"><h3>Papel de parede</h3><div class="wallpaper-grid">${renderWallpapers()}</div><label class="panel-action file-action">Escolher imagem do computador<input id="wallFile" type="file" accept="image/*" hidden></label>${state.customWallpaper ? '<button class="panel-action" id="removeWallpaper">Remover imagem atual</button>' : ''}</section>`;
  if (section === 'privacy') content = `<h3>Protecao na navegacao</h3><div class="settings-row"><div><strong>Bloquear anuncios e rastreadores</strong><small>Usa listas de filtros; se não puder carregá-las, aplica uma lista local reduzida.</small></div><button id="adToggle" class="toggle ${state.adblock ? 'on' : ''}" aria-label="Alternar bloqueio"></button></div><div class="settings-row"><div><strong>Pedidos bloqueados nesta sessao</strong></div><b id="settingsBlocked">${$('blockedCount').textContent}</b></div><p>Alguns anuncios incluídos diretamente no conteúdo do site ainda podem aparecer. O bloqueio não interfere nos domínios de vídeo.</p>`;
  if (section === 'extensions') {
    const rows = extensions.length ? extensions.map(item => `<article class="ext-row"><span class="ext-icon">◇</span><div class="ext-info"><strong>${escapeHtml(item.name)}</strong><small>Versao ${escapeHtml(item.version)}</small></div><button data-remove="${escapeHtml(item.id)}">Remover</button></article>`).join('') : '<div class="empty-state"><strong>Nenhuma extensao instalada</strong><p>Escolha a pasta descompactada de uma extensao compativel do Chromium.</p></div>';
    content = `<h3>Extensoes instaladas <span class="count-badge">${extensions.length}</span></h3><p>Gerencie os complementos deste navegador.</p>${rows}<button class="panel-action primary-action" id="installExt">+ Instalar extensao do computador</button><div class="info-note"><strong>Como instalar</strong><p>Descompacte a extensao e selecione a pasta que contem manifest.json. Alguns recursos do Chrome podem nao funcionar no Brisa.</p></div>`;
  }
  if (section === 'import') {
    const rows = sources.length ? sources.map(source => `<article class="import-row"><div><strong>${escapeHtml(source.name)}</strong><small>Favoritos</small></div><button data-import="${escapeHtml(source.id)}">Importar</button></article>`).join('') : '<div class="empty-state"><strong>Nenhum perfil encontrado</strong><p>Instale o Chrome, Edge ou Brave neste computador para importar favoritos.</p></div>';
    content = `<h3>Importar de outro navegador</h3><p>Favoritos e pastas serão adicionados à barra de favoritos.</p>${rows}<div class="info-note"><strong>Importação disponível</strong><p>Senhas, histórico e cookies não são importados.</p></div>`;
  }
  openPanel('Configuracoes', `<div class="settings-layout"><nav class="settings-nav-list">${nav}</nav><div class="settings-content">${content}</div></div>`);
  $('panelContent').querySelectorAll('[data-settings]').forEach(button => button.onclick = () => openSettings(button.dataset.settings));
  if (section === 'appearance') {
    $('panelContent').querySelectorAll('[data-theme-choice]').forEach(button => button.onclick = () => { state.theme = button.dataset.themeChoice; applyTheme(); save(); openSettings('appearance'); });
    $('panelContent').querySelectorAll('[data-wall-choice]').forEach(button => button.onclick = () => { state.wallpaper = button.dataset.wallChoice; state.customWallpaper = ''; applyWallpaper(); save(); openSettings('appearance'); });
    $('wallFile').onchange = async event => { const file = event.target.files[0]; if (!file) return; try { const bitmap = await createImageBitmap(file); const scale = Math.min(1, 1920 / bitmap.width, 1200 / bitmap.height); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); state.customWallpaper = canvas.toDataURL('image/jpeg', 0.78); bitmap.close(); applyWallpaper(); save(); openSettings('appearance'); } catch { notify('Não consegui abrir essa imagem.'); } };
    $('removeWallpaper')?.addEventListener('click', () => { state.customWallpaper = ''; state.wallpaper = 'default'; applyWallpaper(); save(); openSettings('appearance'); });
  }
  if (section === 'privacy') $('adToggle').onclick = () => setAdblockEnabled(!state.adblock, { showNotice: true });
  if (section === 'extensions') {
    $('installExt').onclick = async () => { const result = await window.brisa.installExtension(); if (result.ok) { notify(`${result.name} instalada`); openSettings('extensions'); } else if (!result.canceled) notify(`Falha: ${result.error}`); };
    $('panelContent').querySelectorAll('[data-remove]').forEach(button => button.onclick = async () => { await window.brisa.removeExtension(button.dataset.remove); openSettings('extensions'); });
  }
  if (section === 'import') $('panelContent').querySelectorAll('[data-import]').forEach(button => button.onclick = async () => {
    button.disabled = true; button.textContent = 'Importando...'; const result = await window.brisa.importBookmarks(button.dataset.import);
    if (!result.ok) { notify(result.error); openSettings('import'); return; }
    const known = new Set();
    const collect = items => items.forEach(item => { if (item.type === 'url') known.add(item.url); else collect(item.children || []); });
    collect(state.bookmarksBar);
    const clean = items => items.map(item => item.type === 'url' ? (known.has(item.url) ? null : item) : ({ ...item, children: clean(item.children || []) })).filter(Boolean);
    const folders = clean(result.folders);
    state.bookmarksBar.push(...folders); save(); renderBookmarks();
    notify('Favoritos importados para a barra'); openSettings('import');
  });
}
const openExtensions = () => openSettings('extensions');

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
    await setAdblockEnabled(!state.adblock, { showNotice: true });
  };
  $('manageExt').onclick = openExtensions;
}

$('newTab').onclick = () => newTab();
$('bookmarkAdd').onclick = event => { event.stopPropagation(); $('bookmarkMenu').classList.toggle('hidden'); };
$('bookmarkCurrent').onclick = () => {
  const tab = tabs.find(item => item.id === activeId);
  if (!tab?.url || !/^https?:/i.test(tab.url)) { notify('Abra um site antes de salvá-lo nos favoritos.'); return; }
  const name = prompt('Nome do favorito:', tab.title) || tab.title;
  state.bookmarksBar.push({ type: 'url', name: name.trim(), url: tab.url });
  save(); renderBookmarks(); $('bookmarkMenu').classList.add('hidden');
};
$('bookmarkFolder').onclick = () => {
  const name = prompt('Nome da pasta:'); if (!name?.trim()) return;
  state.bookmarksBar.push({ type: 'folder', name: name.trim(), children: [] });
  save(); renderBookmarks(); $('bookmarkMenu').classList.add('hidden');
};
document.addEventListener('click', event => { if (!event.target.closest('#bookmarkMenu') && !event.target.closest('#bookmarkAdd')) $('bookmarkMenu').classList.add('hidden'); });
document.addEventListener('click', event => { if (!event.target.closest('#bookmarkContextMenu')) $('bookmarkContextMenu').classList.add('hidden'); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') $('bookmarkContextMenu').classList.add('hidden'); });
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
  await setAdblockEnabled(!state.adblock, { showNotice: true });
};
$('extensions').onclick = openExtensions;
$('customize').onclick = () => openSettings('appearance');
$('wallpaper').onclick = () => openSettings('appearance');
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
window.brisa.onBlockedCount(count => { $('blockedCount').textContent = count; const settingsCount = $('settingsBlocked'); if (settingsCount) settingsCount.textContent = count; });
window.brisa.onNewTab(url => { if (url) newTab(url); });
window.brisa.onOpenTabs(urls => { if (Array.isArray(urls)) urls.forEach(url => newTab(url)); });
window.brisa.adblockCount().then(count => $('blockedCount').textContent = count);
if (!state.adblock) setAdblockEnabled(false);
applyTheme();
applyWallpaper();
renderGroups();
renderBookmarks();
if (migratedLegacyImports) save();
newTab();
