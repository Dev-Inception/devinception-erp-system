const { app, BrowserWindow, ipcMain, webContents } = require('electron');
const path = require('path');

// Auto-update (no-op in dev / when no update server configured)
let autoUpdater;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch {
  autoUpdater = null;
}

const isDev = !!process.env.ELECTRON_START_URL;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0b1220',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
  }

  mainWindow.on('closed', () => (mainWindow = null));
}

app.whenReady().then(() => {
  createWindow();
  if (autoUpdater && !isDev) autoUpdater.checkForUpdatesAndNotify().catch(() => {});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── Printing IPC ────────────────────────────────────────────────────────────
// Renderer sends HTML; we render it in an offscreen window and print silently
// to the chosen device (thermal 58/80mm or A4).
ipcMain.handle('printer:list', async () => {
  const printers = await mainWindow.webContents.getPrintersAsync();
  return printers.map((p) => ({ name: p.name, isDefault: p.isDefault }));
});

ipcMain.handle('printer:print', async (_evt, { html, type, deviceName }) => {
  const printWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  // Page size selection per template type
  const thermal = type === 'RECEIPT_THERMAL' || type === 'OT_THERMAL';
  const pageSize = thermal
    ? { width: 80000, height: 297000 } // 80mm width (microns); height auto-trimmed by driver
    : 'A4';

  return new Promise((resolve) => {
    printWin.webContents.print(
      {
        silent: true,
        deviceName,
        printBackground: true,
        margins: { marginType: 'none' },
        pageSize,
      },
      (success, reason) => {
        printWin.close();
        resolve({ ok: success, reason });
      },
    );
  });
});

ipcMain.handle('app:version', () => app.getVersion());
