// First-time tips: a spotlight on one real button at a time, with a bubble
// that says what it does. Each tour runs once (remembered in localStorage);
// "Show the tutorial again" in ⋯ forgets them all.
//
// A step whose button isn't on screen (hidden, not in this layout) is skipped,
// so a tour never points at nothing.

export interface Step {
  /** CSS selector of what to point at; null = a card in the middle. */
  target: string | null;
  title: string;
  text: string;
}

const KEY = 'tourSeen';
let seen: Record<string, 1> = {};
try {
  seen = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
} catch {
  seen = {};
}
/** Screenshots and tests switch tours off: localStorage.tour = 'off'. */
const off = () => {
  try {
    return localStorage.getItem('tour') === 'off';
  } catch {
    return false;
  }
};
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* storage blocked: tours just show again next time */
  }
};

export const hasSeen = (id: string) => !!seen[id];
export function markSeen(id: string) {
  seen[id] = 1;
  save();
}
export function forgetTours() {
  seen = {};
  save();
}

let active: { close: () => void } | null = null;
export const tourActive = () => !!active;

export interface Labels {
  next: string;
  done: string;
  skip: string;
  stepOf: (i: number, n: number) => string;
}

function visible(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none' && el.closest('[hidden]') === null;
}

/**
 * Run a tour once. Returns false if it was already seen, tours are off, or
 * another tour is showing (it'll get its turn another time).
 */
export function runTour(id: string, steps: Step[], labels: Labels, opts: { force?: boolean; onEnd?: () => void } = {}): boolean {
  if (off() || active || (!opts.force && seen[id])) return false;
  const live = steps.filter((s) => s.target === null || visible(document.querySelector(s.target)));
  if (!live.length) return false;
  markSeen(id); // even if they close it halfway: it doesn't come back by itself

  const layer = document.createElement('div');
  layer.className = 'tour';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-modal', 'true');
  const hole = document.createElement('div');
  hole.className = 'tour-hole';
  const bubble = document.createElement('div');
  bubble.className = 'tour-bubble';
  layer.append(hole, bubble);
  document.body.append(layer);

  let i = 0;
  let target: HTMLElement | null = null;

  const place = () => {
    const step = live[i];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!target) {
      hole.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0`;
      layer.classList.add('center');
      bubble.style.left = `${Math.max(16, (vw - bubble.offsetWidth) / 2)}px`;
      bubble.style.top = `${Math.max(16, (vh - bubble.offsetHeight) / 2)}px`;
      bubble.dataset.side = '';
      return;
    }
    layer.classList.remove('center');
    const r = target.getBoundingClientRect();
    const pad = 6;
    const big = r.width > vw * 0.8 && r.height > vh * 0.45; // a whole panel: no padding past the screen
    const hx = Math.max(4, r.left - pad);
    const hy = Math.max(4, r.top - pad);
    const hw = Math.min(vw - 8, r.width + pad * 2);
    const hh = Math.min(vh - 8, r.height + pad * 2);
    hole.style.cssText = `left:${hx}px;top:${hy}px;width:${hw}px;height:${hh}px;border-radius:${big ? 22 : Math.min(18, hh / 2)}px`;
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    const below = hy + hh + 14 + bh < vh - 8;
    const above = hy - 14 - bh > 8;
    let top: number;
    if (below || !above) {
      top = below ? hy + hh + 14 : Math.max(8, vh - bh - 12);
      bubble.dataset.side = below ? 'below' : '';
    } else {
      top = hy - 14 - bh;
      bubble.dataset.side = 'above';
    }
    const cx = hx + hw / 2;
    const left = Math.min(vw - bw - 12, Math.max(12, cx - bw / 2));
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    bubble.style.setProperty('--arrow', `${Math.min(bw - 22, Math.max(22, cx - left))}px`);
    void step;
  };

  const show = () => {
    const step = live[i];
    target = step.target ? document.querySelector<HTMLElement>(step.target) : null;
    if (target && !visible(target)) target = null;
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    bubble.replaceChildren();
    const h = document.createElement('b');
    h.textContent = step.title;
    const p = document.createElement('p');
    p.textContent = step.text;
    const bar = document.createElement('div');
    bar.className = 'tour-bar';
    const count = document.createElement('span');
    count.className = 'tour-count';
    count.textContent = live.length > 1 ? labels.stepOf(i + 1, live.length) : '';
    const skip = document.createElement('button');
    skip.className = 'tour-skip';
    skip.textContent = labels.skip;
    skip.hidden = i === live.length - 1;
    skip.addEventListener('click', close);
    const next = document.createElement('button');
    next.className = 'tour-next';
    next.textContent = i === live.length - 1 ? labels.done : labels.next;
    next.addEventListener('click', () => {
      if (i === live.length - 1) close();
      else {
        i++;
        show();
      }
    });
    bar.append(count, skip, next);
    bubble.append(h, p, bar);
    requestAnimationFrame(place);
    next.focus({ preventScroll: true });
  };

  const onResize = () => place();
  // Follow the button if it moves (a sheet still sliding in, a layout settling).
  let lastRect = '';
  let follow = 0;
  const track = () => {
    if (target) {
      const r = target.getBoundingClientRect();
      const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
      if (key !== lastRect) {
        lastRect = key;
        place();
      }
    }
    follow = requestAnimationFrame(track);
  };
  follow = requestAnimationFrame(track);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  function close() {
    cancelAnimationFrame(follow);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    layer.classList.add('out');
    setTimeout(() => layer.remove(), 200);
    active = null;
    opts.onEnd?.();
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKey);
  // A tap outside the bubble moves on, like Next (nothing underneath is pressed).
  bubble.addEventListener('click', (e) => e.stopPropagation()); // (its buttons rebuild it: never counts as outside)
  layer.addEventListener('click', () => (bubble.querySelector('.tour-next') as HTMLButtonElement)?.click());
  active = { close };
  show();
  return true;
}

/**
 * Run `start` the first time `el` becomes visible (a sheet opening, a view
 * being shown), a moment after, when its animation has settled.
 */
export function onFirstShow(el: HTMLElement, id: string, start: () => void, isShown: () => boolean) {
  const check = () => {
    if (hasSeen(id) || off() || !isShown()) return;
    setTimeout(() => {
      if (isShown() && !hasSeen(id)) start();
    }, 650);
  };
  new MutationObserver(check).observe(el, { attributes: true, attributeFilter: ['class', 'hidden', 'aria-hidden'] });
}
