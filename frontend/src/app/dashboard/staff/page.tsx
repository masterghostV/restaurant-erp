'use client';

import { useEffect, useState } from 'react';
import { useStore } from '../../../store/useStore';
import { useRouter } from 'next/navigation';
import { UserPlus, ShieldAlert, ShieldCheck, Copy, Check } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'MANAGER', label: 'Manager (can add tables)' },
  { value: 'WAITER', label: 'Waiter' },
  { value: 'CASHIER', label: 'Cashier' },
  { value: 'KITCHEN', label: 'Kitchen Staff' },
  { value: 'INVENTORY_STAFF', label: 'Inventory Staff' },
  { value: 'MENU_MANAGER', label: 'Menu Manager' },
];

interface StaffMember {
  id: string;
  phone: string;
  salary: number;
  status: string;
  user: { id: string; email: string; loginId: string | null; name: string; role: { name: string } };
}

export default function StaffManagementPanel() {
  const router = useRouter();
  const { user, token } = useStore();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [roleName, setRoleName] = useState('WAITER');
  const [phone, setPhone] = useState('');
  const [salary, setSalary] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newlyCreated, setNewlyCreated] = useState<{ loginId: string; name: string } | null>(null);

  useEffect(() => {
    if (user && user.role !== 'OWNER' && user.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const loadStaff = async () => {
    if (!token || !user?.restaurantId) {
      setLoading(false);
      return;
    }
    setError('');
    try {
      const res = await fetch(`${apiUrl}/staff/restaurant/${user.restaurantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not load staff');
      const data = await res.json();
      setStaffList(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.restaurantId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setNewlyCreated(null);
    setCreating(true);

    try {
      const res = await fetch(`${apiUrl}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name,
          password,
          roleName,
          phone,
          salary: salary ? Number(salary) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not create staff');

      setNewlyCreated({ loginId: data.user.loginId || data.user.email, name: data.user.name });
      setName('');
      setPassword('');
      setPhone('');
      setSalary('');
      loadStaff();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(''), 2000);
  };

  if (!user || (user.role !== 'OWNER' && user.role !== 'SUPER_ADMIN')) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Staff Management</h1>
        <p className="text-sm text-slate-400 mt-1">
          Create staff accounts. Each gets a system-generated login ID — no real email needed.
        </p>
      </div>

      {/* Create staff form */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-indigo-400" /> Add New Staff
        </h2>

        {createError && (
          <div className="flex items-center gap-2.5 p-3 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-xs font-medium mb-4">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{createError}</span>
          </div>
        )}

        {newlyCreated && (
          <div className="p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 mb-4">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium mb-2">
              <ShieldCheck className="h-4 w-4" /> {newlyCreated.name}&apos;s login ID is ready
            </div>
            <div className="flex items-center gap-2 bg-slate-950 rounded-lg px-3 py-2">
              <code className="text-sm text-white flex-1">{newlyCreated.loginId}</code>
              <button
                onClick={() => copyToClipboard(newlyCreated.loginId)}
                className="text-slate-400 hover:text-white transition"
              >
                {copiedId === newlyCreated.loginId ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Share this login ID (and the password you set) with your staff member — this is what they log in with.
            </p>
          </div>
        )}

        <form onSubmit={handleCreate} className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Role</label>
            <select
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Phone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Salary (optional)</label>
            <input
              type="number"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={creating}
              className="w-full py-2 rounded-lg font-medium text-sm text-white bg-indigo-600 hover:bg-indigo-500 transition-colors disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Staff & Generate Login ID'}
            </button>
          </div>
        </form>
      </div>

      {/* Staff list */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="p-4 border-b border-slate-800 text-sm font-semibold text-white">Current Staff</div>
        {error && <div className="p-4 text-xs text-red-400">{error}</div>}
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
        ) : staffList.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No staff added yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-800">
                  <th className="p-3">Name</th>
                  <th className="p-3">Login ID</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((s) => (
                  <tr key={s.id} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="p-3 text-white font-medium">{s.user.name}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <code className="text-xs text-slate-300">{s.user.loginId || s.user.email}</code>
                        <button
                          onClick={() => copyToClipboard(s.user.loginId || s.user.email)}
                          className="text-slate-500 hover:text-white transition"
                        >
                          {copiedId === (s.user.loginId || s.user.email) ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="p-3 text-slate-300">{s.user.role?.name}</td>
                    <td className="p-3 text-slate-300">{s.phone}</td>
                    <td className="p-3">
                      <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
