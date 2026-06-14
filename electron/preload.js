'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Ponte segura entre a interface (renderer) e o processo principal.
contextBridge.exposeInMainWorld('api', {
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  onChanged: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('profiles:changed', handler);
    return () => ipcRenderer.removeListener('profiles:changed', handler);
  },
  onEvent: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on('rino:event', handler);
    return () => ipcRenderer.removeListener('rino:event', handler);
  },
});
