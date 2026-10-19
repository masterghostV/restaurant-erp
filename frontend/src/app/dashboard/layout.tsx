'use client';

import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ChangePasswordModal from '../../components/ChangePasswordModal';
import ClockInOutWidget from '../../components/ClockInOutWidget';
import {
  LayoutDashboard,
  ChefHat,
  ConciergeBell,
  Utensils,
  PackageCheck,
  BookOpenCheck,
  AlertOctagon,
  Settings,
  LogOut,
  Bell,
  Sun,
  Moon,
  Menu,
  X,
  UserCheck,
  KeyRound,
  LineChart,
  Building2,
  Users,
  LayoutGrid,
} from 'lucide-react';

interface SidebarItem {
  name: string;
  href: string;
  icon: any;
  allowedRoles: string[];
}

const sidebarItems: SidebarItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, allowedRoles: ['SUPER_ADMIN', 'OWNER'] },
  { name: 'Site Owner Panel', href: '/dashboard/site-owner', icon: Building2, allowedRoles: ['SUPER_ADMIN'] },
  { name: 'Staff Management', href: '/dashboard/staff', icon: Users, allowedRoles: ['SUPER_ADMIN', 'OWNER'] },
  { name: 'Tables', href: '/dashboard/tables', icon: LayoutGrid, allowedRoles: ['SUPER_ADMIN', 'OWNER', 'MANAGER'] },
  { name: 'Reports & Analytics', href: '/dashboard/reports', icon: LineChart, allowedRoles: ['SUPER_ADMIN', 'OWNER'] },
  { name: 'POS Billing', href: '/dashboard/cashier', icon: ConciergeBell, allowedRoles: ['SUPER_ADMIN', 'CASHIER'] },
  { name: 'Order Taker', href: '/dashboard/waiter', icon: Utensils, allowedRoles: ['SUPER_ADMIN', 'WAITER'] },
  { name: 'Kitchen KOT', href: '/dashboard/kitchen', icon: ChefHat, allowedRoles: ['SUPER_ADMIN', 'KITCHEN'] },
  { name: 'Inventory Store', href: '/dashboard/inventory', icon: PackageCheck, allowedRoles: ['SUPER_ADMIN', 'OWNER', 'INVENTORY_STAFF'] },
  { name: 'Menu & Recipes', href: '/dashboard/menu', icon: BookOpenCheck, allowedRoles: ['SUPER_ADMIN', 'OWNER', 'MENU_MANAGER'] },
  { name: 'Complaints', href: '/dashboard/complaints', icon: AlertOctagon, allowedRoles: ['SUPER_ADMIN', 'OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'INVENTORY_STAFF', 'MENU_MANAGER'] },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings, allowedRoles: ['SUPER_ADMIN', 'OWNER'] },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const {
    user,
    clearAuth,
    connectSocket,
    disconnectSocket,
    notifications,
    fetchNotifications,
    markAllNotificationsRead,
    theme,
    setTheme,
    activeRestaurantId,
    restaurantList,
    fetchRestaurantList,
    setActiveRestaurantId,
  } = useStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Whether logged-in `user` is truthy depends on localStorage, which only
  // exists in the browser — not during server rendering. Branching on
  // `user` immediately caused the server (no user) and the browser (has a
  // saved session) to render structurally different HTML on first paint,
  // which is exactly what triggers a React hydration mismatch. Waiting for
  // this `mounted` flag — which starts as `false` identically on both the
  // server and the browser's first render — means the very first paint is
  // always the same on both sides; only after that (a pure client-side
  // update, safe to differ) do we swap in the real auth-gated content.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Demo mode countdown — if this session was started via Quick Login, we
  // stored the expiry time in localStorage at login. Poll it once a second
  // and force logout the moment it passes, matching the backend's own
  // token expiry so the user isn't left with a dead session hanging around.
  const [demoSecondsLeft, setDemoSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    const expiresAtRaw = localStorage.getItem('erp_demo_expires_at');
    if (!expiresAtRaw) return;
    const expiresAt = new Date(expiresAtRaw).getTime();

    const tick = () => {
      const secondsLeft = Math.round((expiresAt - Date.now()) / 1000);
      if (secondsLeft <= 0) {
        localStorage.removeItem('erp_demo_expires_at');
        setDemoSecondsLeft(null);
        clearAuth();
        router.push('/login');
      } else {
        setDemoSecondsLeft(secondsLeft);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [clearAuth, router]);

  // Auth Guard check
  useEffect(() => {
    if (!user) {
      router.push('/');
    } else {
      connectSocket();
      fetchNotifications();
      if (user.role === 'SUPER_ADMIN') {
        fetchRestaurantList();
      }
    }
    return () => {
      disconnectSocket();
    };
  }, [user, router, connectSocket, disconnectSocket, fetchNotifications, fetchRestaurantList]);

  // Load and apply theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Mark everything as read once the person actually opens the panel and
  // looks at it, so the unread badge doesn't stay stuck.
  useEffect(() => {
    if (notifOpen && notifications.some((n) => !n.isRead)) {
      markAllNotificationsRead();
    }
  }, [notifOpen, notifications, markAllNotificationsRead]);

  if (!mounted) return null;
  if (!user) return null;

  const filteredSidebar = sidebarItems.filter((item) =>
    item.allowedRoles.includes(user.role),
  );

  const handleLogout = () => {
    clearAuth();
    router.push('/');
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const unreadNotifications = notifications.filter((n) => !n.isRead);

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 w-64 border-r border-slate-800 bg-slate-900/60 backdrop-blur-xl z-40 transition-transform duration-300 lg:translate-x-0 lg:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col p-6">
          {/* Scrollable sidebar section (header, profile, nav links) —
              scrolls independently from the main content panel. */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1">
            
            {/* Sidebar header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ChefHat className="h-7 w-7 text-indigo-400" />
                <span className="text-lg font-bold tracking-wider text-white">
                  Surya Dhosa
                </span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* User Profile display */}
            <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/40">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <UserCheck className="h-5 w-5 text-indigo-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white truncate max-w-[130px]">
                    {user.name}
                  </h4>
                  <span className="inline-block px-1.5 py-0.5 mt-0.5 rounded text-[10px] font-bold bg-violet-500/10 text-violet-300 border border-violet-500/20 uppercase tracking-wider">
                    {user.role.replace('_', ' ')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowChangePassword(true)}
                className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 hover:text-indigo-400 transition-colors mt-2.5"
              >
                <KeyRound className="h-3 w-3" /> Change Password
              </button>
            </div>

            {user.staffId && <ClockInOutWidget />}

            {/* Navigation links */}
            <nav className="space-y-1">
              {filteredSidebar.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>

          </div>

          {/* Bottom logout — pinned outside the scroll area, always visible */}
          <button
            onClick={handleLogout}
            className="shrink-0 flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors border border-transparent hover:border-rose-500/20 mt-6"
          >
            <LogOut className="h-4 w-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Panel Content container */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/40 backdrop-blur-md flex items-center justify-between px-6 z-20 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-slate-400 hover:text-white"
            >
              <Menu className="h-6 w-6" />
            </button>
            {user.role === 'SUPER_ADMIN' ? (
              restaurantList.length > 0 ? (
                <div className="hidden sm:flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-400">Acting as manager of:</span>
                  <select
                    value={activeRestaurantId || ''}
                    onChange={(e) => setActiveRestaurantId(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-sm font-medium text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    {restaurantList.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <h2 className="text-sm font-semibold text-slate-400 hidden sm:block">
                  No restaurants found yet
                </h2>
              )
            ) : (
              <h2 className="text-sm font-semibold text-slate-400 hidden sm:block">
                Welcome back, <span className="text-white font-medium">{user.name}</span>
              </h2>
            )}
          </div>

          <div className="flex items-center gap-3">
            
            {/* Theme switcher */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-950 text-slate-400 hover:text-white transition"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Notifications Bell */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="p-2 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-950 text-slate-400 hover:text-white transition relative"
              >
                <Bell className="h-4 w-4" />
                {unreadNotifications.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                )}
              </button>

              {/* Notifications Dropdown Panel */}
              {notifOpen && (
                <>
                  <div onClick={() => setNotifOpen(false)} className="fixed inset-0 z-40" />
                  <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-800 bg-slate-900 shadow-2xl p-4 space-y-3 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <h4 className="font-semibold text-sm text-white">Notifications</h4>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 rounded font-bold">
                          {unreadNotifications.length} New
                        </span>
                        <button
                          onClick={() => setNotifOpen(false)}
                          aria-label="Close notifications"
                          className="text-slate-400 hover:text-white transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {notifications.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-6">
                          No notifications yet.
                        </p>
                      ) : (
                        notifications.map((notif) => (
                          <div
                            key={notif.id}
                            className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs space-y-0.5"
                          >
                            <div className="flex justify-between items-start font-semibold text-white">
                              <span>{notif.title}</span>
                              <span className="text-[9px] text-slate-500 font-normal">
                                {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-slate-400 text-[11px] leading-relaxed">
                              {notif.message}
                            </p>
                            {user.role === 'SUPER_ADMIN' && (notif as any).user && (
                              <p className="text-[9px] text-indigo-400/80 font-medium pt-0.5">
                                → {(notif as any).user.name}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

          </div>
        </header>

        {/* Dynamic page children output — this panel scrolls completely
            independently from the sidebar's scroll area above. */}
        <main className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8">
          {demoSecondsLeft !== null && (
            <div className="mb-4 flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-medium">
              <span>
                Demo Mode — this restaurant is temporary and private to you. Session ends in{' '}
                {Math.floor(demoSecondsLeft / 60)}:{String(demoSecondsLeft % 60).padStart(2, '0')}.
              </span>
              <a href="/register" className="underline shrink-0 hover:text-amber-100">
                Sign up to keep a real restaurant
              </a>
            </div>
          )}
          {children}
        </main>
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}

    </div>
  );
}
