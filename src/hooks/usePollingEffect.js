import { useEffect } from 'react';

/**
 * Run `callback` immediately, then on an interval — but pause while the window
 * is hidden (minimized / another tab) and resume (with an immediate refresh) on
 * return. Saves CPU and battery for the app's several background pollers, which
 * previously kept ticking even when nobody was looking.
 *
 * Mirrors the useEffect contract: pass the same dependency array you would give
 * the effect (typically the memoized callback).
 *
 * @param {() => void} callback   the poll function (e.g. a useCallback'd refresh)
 * @param {number} intervalMs     polling cadence in milliseconds
 * @param {Array} deps            effect dependencies
 */
export function usePollingEffect(callback, intervalMs, deps = []) {
  useEffect(() => {
    let id = null;
    const tick = () => callback();
    const start = () => {
      if (id != null) return;
      tick();
      id = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (id == null) return;
      clearInterval(id);
      id = null;
    };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden) stop();
      else start();
    };

    if (typeof document === 'undefined' || !document.hidden) start();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      stop();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
