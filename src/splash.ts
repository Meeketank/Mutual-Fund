// Controls the splash screen defined in index.html.
const shownAt = performance.now();
const MIN_VISIBLE_MS = 900;
let hidden = false;

export function setSplashStatus(text: string) {
  const el = document.getElementById('splash-status');
  if (el) el.textContent = text;
}

export function hideSplash() {
  if (hidden) return;
  hidden = true;
  const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - shownAt));
  window.setTimeout(() => {
    const el = document.getElementById('splash');
    if (!el) return;
    el.classList.add('splash-hide');
    window.setTimeout(() => el.remove(), 500);
  }, wait);
}

// Never trap the user behind the splash if the network is slow.
window.setTimeout(hideSplash, 8000);
