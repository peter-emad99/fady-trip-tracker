import { useEffect, useRef } from 'react';

// Lets the browser / phone Back button dismiss an overlay instead of leaving the page.
//
// While mounted, the overlay owns one extra history entry. Back pops it and calls `onBack`, which
// returns true if the overlay closed (it unmounts) or false if it stays open (e.g. it asked to
// discard changes), in which case the entry is pushed again. Closing the overlay any other way
// pops the entry, so the next Back doesn't land on a stale one.
export function useBackToClose(onBack) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const token = crypto.randomUUID();
    // Keep the router's own history state (key, idx) so it doesn't treat this as a navigation
    const pushEntry = () => window.history.pushState({ ...window.history.state, overlay: token }, '');
    let owned = true;

    pushEntry();
    const onPopState = () => {
      if (onBackRef.current()) owned = false;
      else pushEntry();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      // Still on our entry (not navigated elsewhere): drop it
      if (owned && window.history.state?.overlay === token) window.history.back();
    };
  }, []);
}
