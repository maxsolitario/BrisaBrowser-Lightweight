const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('brisa', {
  installExtension: () => ipcRenderer.invoke('browser:install-extension'),
  extensions: () => ipcRenderer.invoke('browser:extensions'),
  removeExtension: id => ipcRenderer.invoke('browser:remove-extension', id),
  setAdblock: enabled => ipcRenderer.invoke('browser:adblock-toggle', enabled),
  adblockCount: () => ipcRenderer.invoke('browser:adblock-count'),
  openExternal: url => ipcRenderer.invoke('browser:open-external', url),
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  onBlockedCount: callback => ipcRenderer.on('adblock:count', (_event, count) => callback(count)),
  onNewTab: callback => ipcRenderer.on('browser:new-tab', (_event, url) => callback(url))
});
