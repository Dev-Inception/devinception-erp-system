const { contextBridge, ipcRenderer } = require('electron');

// Safe, minimal bridge exposed to the React app as window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  listPrinters: () => ipcRenderer.invoke('printer:list'),
  print: (payload) => ipcRenderer.invoke('printer:print', payload),
  getVersion: () => ipcRenderer.invoke('app:version'),
});
