/**
 * A media query as a value.
 *
 * Used where a component has to behave differently at different widths rather
 * than merely look different - modality, for instance, which CSS cannot
 * express. Anything that is only appearance stays in the stylesheet.
 */

import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => (typeof window === 'undefined' ? false : window.matchMedia(query).matches),
  );
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (): void => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** True where the sidebar is gone and the tab bar has taken over. */
export function useNarrow(): boolean {
  return useMediaQuery('(max-width: 1080px)');
}
