// Applies the saved theme before the page paints, so it never flashes the other one. (An external file because the
// app's Content Security Policy doesn't allow inline scripts.) See src/lib/theme.ts.
try {
  var t = localStorage.getItem('aj.theme');
  if (t === 'day' || t === 'night') document.documentElement.dataset.theme = t;
} catch (e) {}
