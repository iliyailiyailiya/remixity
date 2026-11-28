// Names too long for their space scroll slowly back and forth (like a car
// stereo or Apple Music) instead of being cut off with "…".
//
// Other code keeps setting the element's textContent as usual; this wraps
// the text in an inner span and measures it whenever the text or the size
// changes.

export function marquee(el: HTMLElement) {
  const measure = () => {
    const inner = el.firstElementChild as HTMLElement | null;
    if (!inner) return;
    const dist = inner.scrollWidth - el.clientWidth;
    const on = dist > 2;
    el.classList.toggle('mq', on);
    if (on) {
      el.style.setProperty('--mq-d', `${-dist - 6}px`);
      el.style.setProperty('--mq-t', `${(6 + dist / 22).toFixed(1)}s`);
    }
  };
  const wrap = () => {
    const only = el.childNodes.length === 1 && el.firstElementChild?.classList.contains('mq-in');
    if (!only) {
      const text = el.textContent ?? '';
      const inner = document.createElement('span');
      inner.className = 'mq-in';
      inner.textContent = text;
      el.replaceChildren(inner);
    }
    measure();
  };
  new MutationObserver(wrap).observe(el, { childList: true, characterData: true, subtree: true });
  new ResizeObserver(measure).observe(el);
  wrap();
}
