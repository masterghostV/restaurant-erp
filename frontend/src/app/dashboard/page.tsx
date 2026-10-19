'use intelligence';
'use client';

import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useRouter } from 'next/navigation';
import {
  TrendingUp,
  DollarSign,
  Users,
  AlertTriangle,
  ClipboardList,
  Building,
  Activity,
  PlusCircle,
  FileCheck,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function DashboardHome() {
  const router = useRouter();
  const { user, token } = useStore();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 1. Role-based operations redirects
  useEffect(() => {
    if (!user) return;
    const opsRedirects: Record<string, string> = {
      CASHIER: '/dashboard/cashier',
      WAITER: '/dashboard/waiter',
      KITCHEN: '/dashboard/kitchen',
      INVENTORY_STAFF: '/dashboard/inventory',
      MENU_MANAGER: '/dashboard/menu',
      MANAGER: '/dashboard/tables',
    };
    if (opsRedirects[user.role]) {
      router.push(opsRedirects[user.role]);
    }
  }, [user, router]);

  // 2. Fetch statistics
  useEffect(() => {
    if (!user || !token) return;
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'OWNER') {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const endpoint =
        user.role === 'SUPER_ADMIN'
          ? `${apiUrl}/dashboard/super-admin`
          : `${apiUrl}/dashboard/owner/${user.restaurantId}`;

      try {
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load dashboard metrics');
        const data = await res.json();
        setStats(data);
      } catch (err: any) {
        setError(err.message || 'Error communicating with server');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [user, token]);

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-400">Loading system metrics...</p>
      </div>
    );
  }

  if (user?.role !== 'SUPER_ADMIN' && user?.role !== 'OWNER') {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-slate-400">Redirecting to operations terminal...</p>
      </div>
    );
  }

  // --- RENDER SUPER ADMIN DASHBOARD ---
  if (user.role === 'SUPER_ADMIN') {
    return (
      <div className="space-y-8 animate-in fade-in duration-300">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Super Admin Console</h1>
          <p className="text-slate-400 text-sm mt-0.5">SaaS multi-tenant control and platform audit logs</p>
        </div>

        {/* 4 Cards Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur flex justify-between items-center">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Restaurants</span>
              <h3 className="text-2xl font-extrabold text-white">{stats?.restaurantsCount || 0}</h3>
            </div>
            <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Building className="h-5 w-5" />
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur flex justify-between items-center">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Users</span>
              <h3 className="text-2xl font-extrabold text-white">{stats?.usersCount || 0}</h3>
            </div>
            <div className="h-10 w-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <Users className="h-5 w-5" />
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur flex justify-between items-center">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Total Orders</span>
              <h3 className="text-2xl font-extrabold text-white">{stats?.ordersCount || 0}</h3>
            </div>
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ClipboardList className="h-5 w-5" />
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur flex justify-between items-center">
            <div className="space-y-1">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Open Complaints</span>
              <h3 className="text-2xl font-extrabold text-white">{stats?.activeComplaintsCount || 0}</h3>
            </div>
            <div className="h-10 w-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Outlets List */}
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/30">
            <h3 className="text-base font-bold text-white mb-4">Platform Tenants (Restaurants)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-3">Name</th>
                    <th className="pb-3">Address</th>
                    <th className="pb-3 text-center">Staff Count</th>
                    <th className="pb-3 text-center">Tables</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {stats?.restaurantsList?.map((res: any) => (
                    <tr key={res.id} className="text-slate-300">
                      <td className="py-3 font-semibold text-white">{res.name}</td>
                      <td className="py-3">{res.address}</td>
                      <td className="py-3 text-center">{res._count?.staff}</td>
                      <td className="py-3 text-center">{res._count?.tables}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit Logs */}
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/30">
            <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-400" /> Platform Security logs
            </h3>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {stats?.recentLogs?.map((log: any) => (
                <div key={log.id} className="p-3 rounded-lg bg-slate-950/60 border border-slate-850 flex justify-between items-center text-xs">
                  <div className="space-y-0.5">
                    <span className="font-bold text-indigo-300 tracking-wide">{log.action}</span>
                    <p className="text-slate-400 text-[11px]">{log.details}</p>
                  </div>
                  <div className="text-right text-[10px] text-slate-500">
                    <div>{log.ipAddress}</div>
                    <div>{new Date(log.createdAt).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER RESTAURANT OWNER DASHBOARD ---
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Business Intelligence Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">Performance statistics, inventory thresholds, and staff attendance</p>
        </div>
        <div className="text-xs border border-slate-800 bg-slate-900/40 rounded-lg px-4 py-2 self-start flex items-center gap-2 text-slate-400">
          <Activity className="h-3.5 w-3.5 text-emerald-400" /> System: Online
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur flex justify-between items-center">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Today's Sales</span>
            <h3 className="text-2xl font-extrabold text-white">${stats?.todaySales?.toFixed(2) || '0.00'}</h3>
          </div>
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur flex justify-between items-center">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Today's Profit</span>
            <h3 className="text-2xl font-extrabold text-white">${stats?.todayProfit?.toFixed(2) || '0.00'}</h3>
          </div>
          <div className="h-10 w-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur flex justify-between items-center">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Monthly Profit</span>
            <h3 className="text-2xl font-extrabold text-white">${stats?.monthlyProfit?.toFixed(2) || '0.00'}</h3>
          </div>
          <div className="h-10 w-10 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur flex justify-between items-center">
          <div className="space-y-1">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Inventory Alerts</span>
            <h3 className="text-2xl font-extrabold text-rose-400">{stats?.lowStockCount || 0} Low Stock</h3>
          </div>
          <div className="h-10 w-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Main Charts & Indicators Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        
        {/* Recharts Area Chart */}
        <div className="lg:col-span-2 p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur space-y-4">
          <div>
            <h3 className="text-base font-bold text-white">Sales & Profit (Past 7 Days)</h3>
            <p className="text-slate-400 text-xs mt-0.5">Calculated from final paid orders</p>
          </div>
          <div className="h-[280px] w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.weeklySales || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="day" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} />
                <Area type="monotone" dataKey="sales" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" name="Sales ($)" />
                <Area type="monotone" dataKey="profit" stroke="#34d399" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" name="Profit ($)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Side Panel stats */}
        <div className="space-y-6">
          {/* Staff Info */}
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-400" /> Staff & Attendance
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-semibold">Total Staff Registered</span>
                <span className="text-white font-bold">{stats?.totalStaff || 0}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-semibold">Attendance Today</span>
                <span className="text-emerald-400 font-bold">{stats?.attendanceSummary || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Operational summary */}
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-violet-400" /> Operational Tickets
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-semibold">Unresolved Complaints</span>
                <span className="text-rose-400 font-bold">{stats?.activeComplaintsCount || 0} Open</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
