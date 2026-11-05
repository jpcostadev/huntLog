const { app, BrowserWindow, dialog, protocol } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

protocol.registerSchemesAsPrivileged([
  { scheme: 'huntlog', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const isDevelopment = !app.isPackaged;
const devUrl = process.env.HUNTLOG_DEV_URL || 'http://localhost:8091';
const webRoot = path.join(app.getAppPath(), 'web-dist');

function registerAppProtocol() {
  protocol.handle('huntlog', async (request) => {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const requested = path.resolve(webRoot, `.${pathname}`);
    const root = `${path.resolve(webRoot)}${path.sep}`;
    if (requested !== path.resolve(webRoot) && !requested.startsWith(root)) {
      return new Response('Forbidden', { status: 403 });
    }
    const target = fs.existsSync(requested) && fs.statSync(requested).isFile()
      ? requested
      : path.join(webRoot, 'index.html');
    if (!fs.existsSync(target)) return new Response('Desktop build files are missing.', { status: 404 });
    try {
      const body = await fs.promises.readFile(target);
      return new Response(body, { headers: { 'Content-Type': contentTypes[path.extname(target)] ?? 'application/octet-stream' } });
    } catch (error) {
      return new Response(error instanceof Error ? error.message : 'Could not read desktop app file.', { status: 500 });
    }
  });
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#080D14',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  await window.loadURL(isDevelopment ? devUrl : 'huntlog://bundle/');
}

app.whenReady().then(async () => {
  if (!isDevelopment) registerAppProtocol();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => {
  dialog.showErrorBox('HuntLog Tibia', error.message);
});
