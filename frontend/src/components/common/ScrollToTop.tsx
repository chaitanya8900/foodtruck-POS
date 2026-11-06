import React, { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop ensures that whenever the route / pathname changes,
 * the window and all root / scrollable containers are immediately
 * and reliably scrolled to the top (0, 0).
 *
 * This fixes the issue on mobile QR ordering where scrolling to the bottom
 * of one page (e.g. Menu) caused subsequent pages (Cart, Order Type, Payment, Confirmation)
 * to open already scrolled down to the bottom.
 */
export const ScrollToTop: React.FC = () => {
  const { pathname, search } = useLocation();

  // Disable browser automatic scroll restoration so it doesn't fight our scroll reset
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  const resetScroll = () => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    } catch {
      window.scrollTo(0, 0);
    }
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
    }
    const rootEl = document.getElementById('root');
    if (rootEl) {
      rootEl.scrollTop = 0;
    }
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  };

  // Immediate reset before paint
  useLayoutEffect(() => {
    resetScroll();
  }, [pathname, search]);

  // Follow-up reset to catch inertial momentum scrolling and mobile browser layout shifts
  useEffect(() => {
    resetScroll();
    const rafId = requestAnimationFrame(() => {
      resetScroll();
    });
    const timerId = setTimeout(() => {
      resetScroll();
    }, 40);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
    };
  }, [pathname, search]);

  return null;
};

export default ScrollToTop;
