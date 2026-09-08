import { Outlet, useLocation } from 'react-router';
import AppShell from '@/components/AppShell';
import TabBar from '@/components/TabBar';

/**
 * App layout for all tabbed pages (design.md §7): phone-column AppShell with
 * the decorative StatusBar, a transparent scrollable content slot, and the
 * floating MT5-style TabBar pill overlaid at the bottom of the column.
 *
 * Pages render their own <NavBar/> as the FIRST child of their content — it
 * sticks to the top of the scroll container (`sticky top-0`). Pages must not
 * add their own bottom padding for the tab bar: the scroll container already
 * reserves ~92px + safe-area so lists never hide under the floating pill.
 *
 * Routes WITHOUT chrome (login, admin, embeds) are top-level routes outside
 * this layout route (see App.tsx).
 */
export default function Layout() {
  const { pathname } = useLocation();
  // Sub-pages (deal detail/edit, history period picker) are pushed screens
  // per design.md — the TabBar is hidden on them, like in the iOS app.
  const hideTabBar =
    /^\/trade\/[^/]+/.test(pathname) || pathname === '/history/period';
  return (
    <AppShell>
      <div
        id="app-scroll"
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-transparent"
        style={
          hideTabBar
            ? undefined
            : { paddingBottom: 'calc(92px + env(safe-area-inset-bottom, 0px))' }
        }
      >
        <Outlet />
      </div>
      {!hideTabBar && <TabBar />}
    </AppShell>
  );
}
