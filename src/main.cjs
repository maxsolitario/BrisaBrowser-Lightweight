const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const PARTITION = 'persist:brisa';
const blockedHosts = new Set([
  'doubleclick.net','googlesyndication.com','googleadservices.com','adservice.google.com',
  'adnxs.com','taboola.com','outbrain.com','ads-twitter.com','adnxs.net','scorecardresearch.com',
  'zedo.com','adform.net','rubiconproject.com','pubmatic.com','openx.net','criteo.com'
]);
let win;
let blockedCount = 0;
let adblockEnabled = true;
const extensionPaths = new Map();

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

function installBlocker(ses) {
  ses.webRequest.onBeforeRequest((details, callback) => {
    if (!adblockEnabled) return callback({ cancel: false });
    let hostname = '';
    try { hostname = new URL(details.url).hostname.toLowerCase(); } catch {}
    const blocked = [...blockedHosts].some(host => hostname === host || hostname.endsWith(`.${host}`));
    if (blocked) {
      blockedCount++;
      if (win && !win.isDestroyed()) win.webContents.send('adblock:count', blockedCount);
    }
    callback({ cancel: blocked });
  });
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
  installBlocker(ses);
  restoreExtensions(ses).finally(createWindow);
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
ipcMain.handle('browser:remove-extension', async (_event, id) => {
  session.fromPartition(PARTITION).extensions.removeExtension(id);
  extensionPaths.delete(id);
  saveExtensionRegistry();
  return true;
});
ipcMain.handle('browser:adblock-toggle', (_event, enabled) => { adblockEnabled = !!enabled; return adblockEnabled; });
ipcMain.handle('browser:adblock-count', () => blockedCount);
ipcMain.handle('browser:open-external', (_event, url) => shell.openExternal(url));
ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:toggle-maximize', () => win?.isMaximized() ? win.unmaximize() : win?.maximize());
ipcMain.on('window:close', () => win?.close());

