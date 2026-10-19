'use client';

import { useEffect, useState } from 'react';
import { useStore } from '../../../store/useStore';
import { useRouter } from 'next/navigation';
import {
  Building2,
  DollarSign,
  Users,
  ShieldAlert,
  ShieldCheck,
  PlusCircle,
  PauseCircle,
  PlayCircle,
  X,
} from 'lucide-react';

interface RestaurantOverview {
  id: string;
  name: string;
  status: string;
  isDemo: boolean;
  staffCount: number;
  tableCount: number;
  totalOrders: number;
  completedOrders: number;
  totalRevenue: number;
  createdAt: string;
}

interface PlatformTotals {
  totalRevenue: number;
  totalOrders: number;
  totalRestaurants: number;
  activeRestaurants: number;
  suspendedRestaurants: number;
}

interface RevenueDetail {
  restaurant: { id: string; name: string; status: string };
  allTimeRevenue: number;
  allTimeCompletedOrders: number;
  last30DaysRevenue: number;
  dailyRevenue: { date: string; revenue: number }[];
  paymentsByMethod: { method: string; totalAmount: number; count: number }[];
}

export default function SiteOwnerPanel() {
  const router = useRouter();
  const { user, token } = useStore();
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totals, setTotals] = useState<PlatformTotals | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantOverview[]>([]);

  const [showOnboardForm, setShowOnboardForm] = useState(false);
  const [onboardLoading, setOnboardLoading] = useState(false);
  const [onboardError, setOnboardError] = useState('');

  const [revenueDetail, setRevenueDetail] = useState<RevenueDetail | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);

  // Onboard form fields
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const loadOverview = async () => {
    if (!token) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/restaurants/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not load platform overview');
      const data = await res.json();
      setTotals(data.platformTotals);
      setRestaurants(data.restaurants);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardError('');
    setOnboardLoading(true);
    try {
      const res = await fetch(`${apiUrl}/restaurants/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, address, phone, ownerName, ownerEmail, ownerPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not onboard restaurant');

      setShowOnboardForm(false);
      setName('');
      setAddress('');
      setPhone('');
      setOwnerName('');
      setOwnerEmail('');
      setOwnerPassword('');
      loadOverview();
    } catch (err: any) {
      setOnboardError(err.message);
    } finally {
      setOnboardLoading(false);
    }
  };

  const toggleStatus = async (r: RestaurantOverview) => {
    const nextStatus = r.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const confirmMsg =
      nextStatus === 'SUSPENDED'
        ? `Suspend "${r.name}"? Their staff will be logged out immediately.`
        : `Reactivate "${r.name}"?`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`${apiUrl}/restaurants/${r.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error('Could not update status');
      loadOverview();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const viewRevenue = async (restaurantId: string) => {
    setRevenueLoading(true);
    setRevenueDetail(null);
    try {
      const res = await fetch(`${apiUrl}/restaurants/${restaurantId}/revenue`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not load revenue detail');
      const data = await res.json();
      setRevenueDetail(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRevenueLoading(false);
    }
  };

  if (!user || user.role !== 'SUPER_ADMIN') return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Site Owner Panel</h1>
          <p className="text-sm text-slate-400 mt-1">Platform-wide oversight across every restaurant.</p>
        </div>
        <button
          onClick={() => setShowOnboardForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition"
        >
          <PlusCircle className="h-4 w-4" /> Onboard New Restaurant
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-xs font-medium">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Platform totals */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Building2} label="Total Restaurants" value={totals.totalRestaurants} />
          <StatCard icon={ShieldCheck} label="Active" value={totals.activeRestaurants} accent="emerald" />
          <StatCard icon={PauseCircle} label="Suspended" value={totals.suspendedRestaurants} accent="rose" />
          <StatCard icon={DollarSign} label="Platform Revenue" value={`₹${totals.totalRevenue.toLocaleString()}`} accent="indigo" />
        </div>
      )}

      {/* Restaurant list */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="p-4 border-b border-slate-800 text-sm font-semibold text-white">All Restaurants</div>
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
        ) : restaurants.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No restaurants onboarded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-800">
                  <th className="p-3">Name</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Staff</th>
                  <th className="p-3">Orders</th>
                  <th className="p-3">Revenue</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {restaurants.map((r) => (
                  <tr key={r.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="p-3 text-white font-medium">
                      {r.name}
                      {r.isDemo && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          DEMO
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          r.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300">{r.staffCount}</td>
                    <td className="p-3 text-slate-300">
                      {r.completedOrders} / {r.totalOrders}
                    </td>
                    <td className="p-3 text-slate-300">₹{r.totalRevenue.toLocaleString()}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => viewRevenue(r.id)}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 transition"
                        >
                          Revenue
                        </button>
                        <button
                          onClick={() => toggleStatus(r)}
                          className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition ${
                            r.status === 'ACTIVE'
                              ? 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10'
                              : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                          }`}
                        >
                          {r.status === 'ACTIVE' ? (
                            <>
                              <PauseCircle className="h-3 w-3" /> Suspend
                            </>
                          ) : (
                            <>
                              <PlayCircle className="h-3 w-3" /> Activate
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Onboard modal */}
      {showOnboardForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 relative">
            <button
              onClick={() => setShowOnboardForm(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-bold text-white mb-4">Onboard New Restaurant</h2>

            {onboardError && (
              <div className="flex items-center gap-2.5 p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-xs font-medium mb-4">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{onboardError}</span>
              </div>
            )}

            <form onSubmit={handleOnboard} className="space-y-3">
              <Field label="Restaurant Name" value={name} onChange={setName} required />
              <Field label="Address" value={address} onChange={setAddress} required />
              <Field label="Phone" value={phone} onChange={setPhone} required />
              <div className="border-t border-slate-800 pt-3 mt-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Owner Account</p>
                <div className="space-y-3">
                  <Field label="Owner Name" value={ownerName} onChange={setOwnerName} required />
                  <Field label="Owner Email" type="email" value={ownerEmail} onChange={setOwnerEmail} required />
                  <Field
                    label="Temporary Password"
                    type="password"
                    value={ownerPassword}
                    onChange={setOwnerPassword}
                    required
                    minLength={6}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={onboardLoading}
                className="w-full py-2.5 rounded-lg font-medium text-sm text-white bg-indigo-600 hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                {onboardLoading ? 'Creating...' : 'Create Restaurant & Owner'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Revenue detail modal */}
      {(revenueLoading || revenueDetail) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 relative max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setRevenueDetail(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            {revenueLoading ? (
              <div className="text-center text-slate-400 py-12">Loading revenue...</div>
            ) : revenueDetail ? (
              <>
                <h2 className="text-lg font-bold text-white mb-4">{revenueDetail.restaurant.name} — Revenue</h2>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <StatCard icon={DollarSign} label="All-Time Revenue" value={`₹${revenueDetail.allTimeRevenue.toLocaleString()}`} accent="indigo" />
                  <StatCard icon={Users} label="Completed Orders" value={revenueDetail.allTimeCompletedOrders} />
                  <StatCard icon={DollarSign} label="Last 30 Days" value={`₹${revenueDetail.last30DaysRevenue.toLocaleString()}`} accent="emerald" />
                </div>

                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Payment Methods</p>
                <div className="space-y-2 mb-6">
                  {revenueDetail.paymentsByMethod.length === 0 ? (
                    <p className="text-sm text-slate-500">No completed payments yet.</p>
                  ) : (
                    revenueDetail.paymentsByMethod.map((p) => (
                      <div key={p.method} className="flex justify-between text-sm text-slate-300 border-b border-slate-800 pb-2">
                        <span>{p.method}</span>
                        <span>
                          ₹{p.totalAmount.toLocaleString()} ({p.count} payments)
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Daily Revenue (30 days)</p>
                {revenueDetail.dailyRevenue.length === 0 ? (
                  <p className="text-sm text-slate-500">No orders in the last 30 days.</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {revenueDetail.dailyRevenue.map((d) => (
                      <div key={d.date} className="flex justify-between text-xs text-slate-400">
                        <span>{d.date}</span>
                        <span>₹{d.revenue.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent = 'slate',
}: {
  icon: any;
  label: string;
  value: string | number;
  accent?: string;
}) {
  const colorMap: Record<string, string> = {
    slate: 'text-slate-400',
    emerald: 'text-emerald-400',
    rose: 'text-rose-400',
    indigo: 'text-indigo-400',
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${colorMap[accent]}`} />
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-colors"
      />
    </div>
  );
}
