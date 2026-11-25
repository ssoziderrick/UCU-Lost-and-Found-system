import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * On every page change, move focus to the main region so keyboard and screen-reader users
 * start at the new page's content. On first load, focus is left alone so the skip link is
 * the first Tab stop. Calls onChange (e.g. close menus) on every navigation.
 */
export default function useRouteFocus(onChange) {
  const location = useLocation();
  const mainRef = useRef(null);
  const prevPath = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    onChangeRef.current?.();
    const first = prevPath.current === null;
    const changed = prevPath.current !== location.pathname;
    prevPath.current = location.pathname;
    if (first || !changed) return;
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return mainRef;
}
