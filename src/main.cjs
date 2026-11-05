const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');

const PARTITION = 'persist:brisa';
let win;
let blockedCount = 0;
let adblockEnabled = true;
let adblocker;
let adblockActive = false;
const extensionPaths = new Map();

function updateBlockedCount() {
  if (win && !win.isDestroyed()) win.webContents.send('adblock:count', blockedCount);
}

function extensionRegistryPath() { return path.join(app.getPath('userData'), 'extensions.json'); }
function saveExtensionRegistry() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(extensionRegistryPath(), JSON.stringify([...extensionPaths.values()], null, 2));
}
async function restoreExtensions(ses) {
  try {
    const paths = JSON.parse(fs.readFileSync(extensionRegistryPath(), 'utf8'));
    for (const extensionPath of paths) {
      try {
        const extension = await ses.extensions.loadExtension(extensionPath, { allowFileAccess: true });
        extensionPaths.set(extension.id, extensionPath);
      } catch (error) { console.warn(`Não foi possível restaurar uma extensão: ${error.message}`); }
    }
  } catch (error) { if (error.code !== 'ENOENT') console.warn(error); }
}

async function installBlocker(ses) {
  const cache = path.join(app.getPath('userData'), 'adblock-engine.bin');
  try {
    adblocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(globalThis.fetch, {
      path: cache, read: fs.promises.readFile, write: fs.promises.writeFile
    });
    const onBeforeRequest = adblocker.onBeforeRequest.bind(adblocker);
    adblocker.onBeforeRequest = (details, callback) => onBeforeRequest(details, response => {
      if (response.cancel) { blockedCount++; updateBlockedCount(); }
      callback(response);
    });
    if (adblockEnabled) { adblocker.enableBlockingInSession(ses); adblockActive = true; }
    console.info('Bloqueador de anúncios e rastreadores carregado.');
  } catch (error) {
    console.error('Não foi possível carregar as listas de bloqueio:', error);
    // Fallback reduzido para o navegador ainda bloquear domínios de anúncio comuns offline.
    const fallback = new Set(['doubleclick.net','googlesyndication.com','googleadservices.com','adnxs.com','taboola.com','outbrain.com','criteo.com']);
    ses.webRequest.onBeforeRequest((details, callback) => {
      let hostname = '';
      try { hostname = new URL(details.url).hostname.toLowerCase(); } catch {}
      const blocked = adblockEnabled && [...fallback].some(host => hostname === host || hostname.endsWith(`.${host}`));
      if (blocked) { blockedCount++; updateBlockedCount(); }
      callback({ cancel: blocked });
    });
  }
}

function findBookmarkProfiles() {
  const root = process.env.LOCALAPPDATA;
  if (!root) return [];
  const browsers = [
    ['chrome', 'Google Chrome', path.join(root, 'Google', 'Chrome', 'User Data')],
    ['edge', 'Microsoft Edge', path.join(root, 'Microsoft', 'Edge', 'User Data')],
    ['brave', 'Brave', path.join(root, 'BraveSoftware', 'Brave-Browser', 'User Data')]
  ];
  return browsers.flatMap(([id, name, userData]) => {
    if (!fs.existsSync(userData)) return [];
    let profiles = [];
    try { profiles = fs.readdirSync(userData, { withFileTypes: true }).filter(entry => entry.isDirectory() && (entry.name === 'Default' || /^Profile \d+$/.test(entry.name))); } catch {}
    return profiles.map(profile => ({ id: `${id}:${profile.name}`, name: `${name} — ${profile.name === 'Default' ? 'Padrão' : profile.name}`, file: path.join(userData, profile.name, 'Bookmarks') })).filter(source => fs.existsSync(source.file));
  });
}

function readBookmarkGroups(bookmarkFile, browserName) {
  const data = JSON.parse(fs.readFileSync(bookmarkFile, 'utf8'));
  const roots = data.roots || {};
  const groups = [];
  const collect = (node, groupName) => {
    const sites = [];
    const walk = item => {
      if (item.type === 'url' && /^https?:\/\//i.test(item.url || '')) sites.push({ name: item.name || new URL(item.url).hostname, url: item.url });
      else if (item.type === 'folder') item.children?.forEach(walk);
    };
    node.children?.forEach(walk);
    if (sites.length) groups.push({ id: `import-${Date.now()}-${groups.length}`, name: `${browserName} · ${groupName}`, sites: sites.slice(0, 80) });
  };
  for (const key of ['bookmark_bar', 'other', 'synced']) if (roots[key]) collect(roots[key], roots[key].name || key);
  return groups;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 620,
    backgroundColor: '#101311', title: 'Brisa Browser', frame: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true }
  });
  win.webContents.on('did-attach-webview', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
        win?.webContents.send('browser:new-tab', url);
      }
      return { action: 'deny' };
    });
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  const ses = session.fromPartition(PARTITION);
  installBlocker(ses).finally(() => restoreExtensions(ses).finally(createWindow));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('browser:install-extension', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Selecione a pasta da extensão', properties: ['openDirectory']
  });
  if (canceled || !filePaths[0]) return { ok: false, canceled: true };
  try {
    const ses = session.fromPartition(PARTITION);
    const extension = await ses.extensions.loadExtension(filePaths[0], { allowFileAccess: true });
    extensionPaths.set(extension.id, filePaths[0]);
    saveExtensionRegistry();
    return { ok: true, name: extension.name, version: extension.version };
  } catch (error) { return { ok: false, error: error.message }; }
});

ipcMain.handle('browser:extensions', async () => {
  return session.fromPartition(PARTITION).extensions.getAllExtensions().map(({ id, name, version }) => ({ id, name, version }));
});
ipcMain.handle('browser:find-import-sources', () => findBookmarkProfiles().map(({ id, name }) => ({ id, name })));
ipcMain.handle('browser:import-bookmarks', (_event, id) => {
  const source = findBookmarkProfiles().find(item => item.id === id);
  if (!source) return { ok: false, error: 'Não encontrei esse perfil. Feche e abra as configurações e tente novamente.' };
  try {
    const browserName = source.name.split(' — ')[0];
    const groups = readBookmarkGroups(source.file, browserName);
    return groups.length ? { ok: true, groups } : { ok: false, error: 'Esse perfil não tem favoritos compatíveis para importar.' };
  } catch (error) { return { ok: false, error: `Não foi possível ler os favoritos: ${error.message}` }; }
});
ipcMain.handle('browser:remove-extension', async (_event, id) => {
  session.fromPartition(PARTITION).extensions.removeExtension(id);
  extensionPaths.delete(id);
  saveExtensionRegistry();
  return true;
});
ipcMain.handle('browser:adblock-toggle', (_event, enabled) => {
  adblockEnabled = !!enabled;
  if (adblocker) {
    const ses = session.fromPartition(PARTITION);
    if (adblockEnabled && !adblockActive) { adblocker.enableBlockingInSession(ses); adblockActive = true; }
    else if (!adblockEnabled && adblockActive) { adblocker.disableBlockingInSession(ses); adblockActive = false; }
  }
  return adblockEnabled;
});
ipcMain.handle('browser:adblock-count', () => blockedCount);
ipcMain.handle('browser:open-external', (_event, url) => shell.openExternal(url));
ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:toggle-maximize', () => win?.isMaximized() ? win.unmaximize() : win?.maximize());
ipcMain.on('window:close', () => win?.close());

