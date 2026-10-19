// Точка входа: роутер, ctx, wake lock, регистрация SW.
import { h } from './dom.js';
import * as charts from './charts.js';

const TABS = ['workout', 'progress', 'plan', 'inbody', 'settings'];
const DEFAULT_TAB = 'workout';

async function tryImport(path) {
  try { return await import(path); } catch (e) { console.warn('[app] модуль недоступен:', path, e && e.message); return null; }
}

const [store, programMod, techMod, progression] = await Promise.all([
  tryImport('./store.js'),
  tryImport('./data/program.js'),
  tryImport('./data/techniques.js'),
  tryImport('./progression.js'),
]);

function settings() {
  try { return (store && store.getSettings && store.getSettings()) || {}; } catch (_) { return {}; }
}

// ---------- Screen Wake Lock ----------
const wakeLock = (() => {
  let sentinel = null, wanted = false;
  async function request() {
    if (!wanted || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return false;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => { sentinel = null; });
      return true;
    } catch (e) { return false; }
  }
  document.addEventListener('visibilitychange', () => { if (wanted && !sentinel) request(); });
  return {
    supported: 'wakeLock' in navigator,
    async enable() {
      const s = settings();
      if (s.wakeLock === false) return false;
      wanted = true; return request();
    },
    async disable() {
      wanted = false;
      if (sentinel) { try { await sentinel.release(); } catch (_) {} sentinel = null; }
    },
    get active() { return !!sentinel; },
  };
})();

// ---------- ctx ----------
const ctx = {
  store, program: programMod ? (programMod.PROGRAM || programMod.default || programMod) : null,
  techniques: techMod ? (techMod.TECHNIQUES || techMod.default || techMod) : null,
  progression, charts, h, wakeLock,
  navigate: tab => { location.hash = '#/' + tab; },
};
window.__ctx = ctx;

// ---------- Роутер ----------
const root = document.getElementById('app');
let navToken = 0;
let current = null;

function currentTab() {
  const m = location.hash.match(/^#\/([a-z]+)/);
  return m && TABS.includes(m[1]) ? m[1] : DEFAULT_TAB;
}

function placeholder(tab, msg) {
  return h('div', { class: 'placeholder' }, h('h2', null, 'Экран в разработке'), h('p', null, msg || ('Вкладка «' + tab + '» скоро появится.')));
}

async function route() {
  const tab = currentTab();
  const token = ++navToken;
  document.querySelectorAll('#nav .tab').forEach(a => {
    const on = a.dataset.tab === tab;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (current && typeof current.unmount === 'function') { try { current.unmount(); } catch (_) {} }
  current = null;
  root.textContent = '';
  let mod = null, err = null;
  try { mod = await import('./ui/' + tab + '.js'); } catch (e) { err = e; }
  if (token !== navToken) return;
  if (!mod || typeof mod.mount !== 'function') {
    if (err) console.warn('[app] экран недоступен:', tab, err.message);
    root.append(placeholder(tab));
    return;
  }
  try {
    const res = mod.mount(root, ctx);
    if (res && typeof res.then === 'function') await res;
    current = mod;
    window.scrollTo(0, 0);
  } catch (e) {
    console.error('[app] ошибка экрана', tab, e);
    root.textContent = '';
    root.append(placeholder(tab, 'Не удалось открыть экран: ' + (e && e.message)));
  }
}

window.addEventListener('hashchange', route);
if (!location.hash) history.replaceState(null, '', '#/' + DEFAULT_TAB);
route();

// ---------- Service worker ----------
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  const reg = () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('[sw]', e && e.message));
  if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg);
}
