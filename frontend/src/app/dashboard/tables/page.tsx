'use client';

import { useEffect, useState } from 'react';
import { useStore } from '../../../store/useStore';
import { LayoutGrid, Plus, Trash2, Users, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface Table {
  id: string;
  number: string;
  capacity: number;
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  OCCUPIED: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  BILLING: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  RESERVED: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  CLEANING: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
};

// Nest returns validation errors as an array of messages and other errors as
// a single string — show either one as readable text.
function readError(data: any, fallback: string) {
  if (!data?.message) return fallback;
  return Array.isArray(data.message) ? data.message.join(', ') : data.message;
}

export default function TablesPage() {
  const { user, token, socket, activeRestaurantId, fetchRestaurantList } = useStore();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const restaurantId = user?.restaurantId || (user?.role === 'SUPER_ADMIN' ? activeRestaurantId : '') || '';

  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [number, setNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') fetchRestaurantList();
  }, [user, fetchRestaurantList]);

  const loadTables = async () => {
    if (!restaurantId || !token) {
      setLoading(false);
      return;
    }
    setError('');
    try {
      const res = await fetch(`${apiUrl}/restaurants/${restaurantId}/tables`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Could not load tables'));
      setTables(data);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, token]);

  // Keep this list in step with changes made on other devices (a waiter
  // seating guests, another manager adding a table, and so on).
  useEffect(() => {
    if (!socket) return;
    const onTableUpdate = (t: Table & { deleted?: boolean }) => {
      if (t.deleted) {
        setTables((prev) => prev.filter((x) => x.id !== t.id));
        return;
      }
      setTables((prev) => {
        const idx = prev.findIndex((x) => x.id === t.id);
        if (idx === -1) return [...prev, t];
        const next = [...prev];
        next[idx] = t;
        return next;
      });
    };
    socket.on('tableUpdate', onTableUpdate);
    return () => {
      socket.off('tableUpdate', onTableUpdate);
    };
  }, [socket]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setAdding(true);
    try {
      const res = await fetch(`${apiUrl}/restaurants/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        // restaurantId is only used when the Site Owner adds a table; for
        // owners and managers the server uses their own restaurant.
        body: JSON.stringify({ number: number.trim(), capacity: Number(capacity), restaurantId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(readError(data, 'Could not add table'));

      setSuccess(`"${data.number}" added. It now shows on the Waiter's order screen.`);
      setNumber('');
      // The live update may already have added it; make sure it is listed once.
      setTables((prev) => (prev.some((t) => t.id === data.id) ? prev : [...prev, data]));
    } catch (err: any) {
      setError(err.message || 'Failed to connect to backend server');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (t: Table) => {
    if (!confirm(`Delete "${t.number}"? This can't be undone.`)) return;
    setError('');
    setSuccess('');
    setDeletingId(t.id);
    try {
      const res = await fetch(`${apiUrl}/restaurants/tables/${t.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(readError(data, 'Could not delete table'));
      setTables((prev) => prev.filter((x) => x.id !== t.id));
      setSuccess(`"${t.number}" deleted.`);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to backend server');
    } finally {
      setDeletingId('');
    }
  };

  if (!restaurantId) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-2 text-center px-4">
        <p className="text-sm font-semibold text-white">No restaurant selected</p>
        <p className="text-xs text-slate-400 max-w-sm">
          {user?.role === 'SUPER_ADMIN'
            ? 'Choose a restaurant from the selector at the top of the page to manage its tables.'
            : "Your account isn't linked to a restaurant yet, so there are no tables to manage."}
        </p>
        {user?.role === 'OWNER' && (
          <a href="/onboard-restaurant" className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 mt-1">
            Set up your restaurant
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <LayoutGrid className="h-6 w-6 text-indigo-400" /> Tables
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Add the tables in your restaurant. Waiters pick a table when taking an order, and that order is sent
          straight to the Kitchen screen.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-xs font-medium">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form
        onSubmit={handleAdd}
        className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 grid gap-3 sm:grid-cols-[1fr_140px_auto] items-end"
      >
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Table name or number</label>
          <input
            type="text"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            required
            maxLength={30}
            placeholder="e.g. Table 5 or Patio 2"
            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1">Seats</label>
          <input
            type="number"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            required
            min={1}
            max={50}
            className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={adding}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> {adding ? 'Adding...' : 'Add Table'}
        </button>
      </form>

      <div>
        <h2 className="text-sm font-semibold text-white mb-3">
          Your tables <span className="text-slate-500 font-normal">({tables.length})</span>
        </h2>
        {loading ? (
          <div className="text-center text-slate-400 text-sm py-10">Loading tables...</div>
        ) : tables.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 p-10 text-center text-sm text-slate-400">
            No tables yet. Add your first table above — waiters can&apos;t take orders until at least one exists.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {tables.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-base font-bold text-white break-words">{t.number}</div>
                  <button
                    onClick={() => handleDelete(t)}
                    disabled={deletingId === t.id || t.status === 'OCCUPIED' || t.status === 'BILLING'}
                    title={t.status === 'OCCUPIED' || t.status === 'BILLING' ? 'Guests are still at this table' : 'Delete table'}
                    className="text-slate-500 hover:text-rose-400 transition disabled:opacity-30 disabled:hover:text-slate-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Users className="h-3.5 w-3.5" /> {t.capacity} seats
                </div>
                <span
                  className={`self-start text-[11px] px-2 py-0.5 rounded-full border font-medium ${
                    STATUS_STYLES[t.status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                  }`}
                >
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
