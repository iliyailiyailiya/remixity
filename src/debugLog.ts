// A hidden on-screen log for lock-screen / media problems that only happen on
// a real iPhone. Off unless opened once with ?npdebug=1 (remembered; ?npdebug=0
// turns it off). Entries are kept in localStorage, so what happened while the
// screen was locked is still there afterwards.

const KEY = 'npdebugLog';
const MAX = 250;

let on = false;
try {
  const q = new URLSearchParams(location.search).get('npdebugOn');
  if (q !== null) localStorage.setItem('npdebugOn', q === '0' ? '0' : '1');
  on = localStorage.getItem('npdebugOn') === '1';
} catch {
  on = false;
}

export const debugOn = on;

let box: HTMLElement | null = null;
let list: HTMLElement | null = null;

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function render() {
  if (!list) return;
  list.textContent = load().slice(-80).join('\n');
  list.scrollTop = list.scrollHeight;
}

/** Add a line (no-op unless the log is on). */
export function npLog(msg: string) {
  if (!on) return;
  const d = new Date();
  const ts = `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  const line = `${ts} ${document.hidden ? '[bg] ' : ''}${msg}`;
  try {
    const all = load();
    all.push(line);
    localStorage.setItem(KEY, JSON.stringify(all.slice(-MAX)));
  } catch {
    /* storage full or blocked */
  }
  render();
}

/** Show the panel (call once at start-up). */
export function initDebugPanel() {
  if (!on) return;
  box = document.createElement('div');
  box.style.cssText =
    'position:fixed;left:6px;right:6px;top:max(6px,env(safe-area-inset-top));height:26vh;z-index:9999;background:rgba(0,0,0,.86);color:#9f9;' +
    'font:10px/1.35 ui-monospace,Menlo,monospace;border-radius:10px;display:flex;flex-direction:column;padding:6px;';
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:6px;margin-bottom:4px';
  const mk = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:11px system-ui;padding:3px 8px;border-radius:6px;border:0;background:#333;color:#fff';
    b.addEventListener('click', fn);
    bar.append(b);
  };
  mk('Copy', () => void navigator.clipboard?.writeText(load().join('\n')));
  mk('Clear', () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* blocked */
    }
    render();
  });
  mk('Hide', () => box && (box.style.display = 'none'));
  list = document.createElement('pre');
  list.style.cssText = 'margin:0;flex:1;overflow:auto;white-space:pre-wrap;user-select:text;-webkit-user-select:text';
  box.append(bar, list);
  document.body.append(box);
  const nav = navigator as Navigator & { standalone?: boolean };
  npLog(
    `start · ${nav.standalone || matchMedia('(display-mode: standalone)').matches ? 'home-screen app' : 'browser'} · ` +
      `mediaSession ${'mediaSession' in navigator ? 'yes' : 'no'} · ${navigator.userAgent.match(/OS [\d_]+/)?.[0] ?? ''}`,
  );
  document.addEventListener('visibilitychange', () => npLog(`visibility ${document.visibilityState}`));
  addEventListener('pagehide', () => npLog('pagehide'));
  addEventListener('pageshow', () => npLog('pageshow'));
  render();
}
