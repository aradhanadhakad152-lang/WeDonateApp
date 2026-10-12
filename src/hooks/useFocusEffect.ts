/**
 * useFocusEffect.ts
 * ============================================================
 * Minimal re-implementation of React Navigation's useFocusEffect
 * for this project, which uses a custom stack-based navigator
 * instead of React Navigation.
 *
 * For the BackHandler use-case (mandatory update modal), this is
 * equivalent to a standard useEffect — the effect runs while the
 * modal is mounted and cleans up on unmount.
 */

import { useEffect } from 'react';

/**
 * Runs the provided effect callback.
 * The callback may return a cleanup function, just like useEffect.
 *
 * Compatible signature with React Navigation's useFocusEffect so
 * it can be swapped out if React Navigation is adopted later.
 */
export const useFocusEffect = (callback: () => (() => void) | undefined): void => {
  useEffect(() => {
    const cleanup = callback();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};
