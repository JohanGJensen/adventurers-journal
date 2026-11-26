// Renders every .svg in a folder to a square .png of the given size with Electron's Chromium.
// Usage: electron scripts/render-svgs.cjs <svg dir> <png dir> <px>   (run by scripts/gen-fallbacks.ts)
const { app, BrowserWindow } = require('electron');
const { readdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join, basename } = require('node:path');

const [svgDir, pngDir, pxArg] = process.argv.slice(-3);
const px = Number(pxArg);

app.disableHardwareAcceleration();
app.dock?.hide();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: px, height: px, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  for (const f of readdirSync(svgDir).filter((n) => n.endsWith('.svg'))) {
    const svg = readFileSync(join(svgDir, f)).toString('base64');
    const html = `<!doctype html><html><body style="margin:0;overflow:hidden;background:#000"><img src="data:image/svg+xml;base64,${svg}" width="${px}" height="${px}" style="display:block"></body></html>`;
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
    await win.webContents.executeJavaScript('document.images[0].decode().then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))');
    const img = (await win.webContents.capturePage({ x: 0, y: 0, width: px, height: px })).resize({ width: px, height: px, quality: 'best' });
    writeFileSync(join(pngDir, `${basename(f, '.svg')}.png`), img.toPNG());
  }
  app.quit();
});
