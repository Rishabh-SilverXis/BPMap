// Sets the theme class before React mounts (Design System §15.1). Reads a per-viewer preference.
(function () {
  var pref = 'system';
  try { pref = localStorage.getItem('bpmap-theme') || 'system'; } catch (e) {}
  var root = document.documentElement;
  if (pref === 'light' || pref === 'dark') root.setAttribute('data-theme', pref);
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) root.classList.add('system-dark');
})();
