'use client';

import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { Clock, LogIn, LogOut as ClockOutIcon } from 'lucide-react';

interface AttendanceRecord {
  id: string;
  clockIn: string;
  clockOut: string | null;
}

export default function ClockInOutWidget() {
  const { token } = useStore();
  const [status, setStatus] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${apiUrl}/attendance/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // Non-critical widget — fail quietly.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchStatus();
  }, [token]);

  const handleClockIn = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/attendance/clock-in`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'Failed to clock in');
      }
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleClockOut = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/attendance/clock-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'Failed to clock out');
      }
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  const isClockedIn = status && !status.clockOut;
  const isDoneForTheDay = status && status.clockOut;

  return (
    <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/40 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <Clock className="h-3 w-3" /> Attendance
      </div>

      {error && <p className="text-[10px] text-rose-400">{error}</p>}

      {isDoneForTheDay ? (
        <p className="text-[11px] text-slate-400">
          Clocked out at{' '}
          <span className="text-white font-medium">
            {new Date(status!.clockOut!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          . See you tomorrow!
        </p>
      ) : isClockedIn ? (
        <>
          <p className="text-[11px] text-emerald-400">
            Clocked in at {new Date(status!.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <button
            onClick={handleClockOut}
            disabled={busy}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition disabled:opacity-50"
          >
            <ClockOutIcon className="h-3 w-3" /> Clock Out
          </button>
        </>
      ) : (
        <button
          onClick={handleClockIn}
          disabled={busy}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition disabled:opacity-50"
        >
          <LogIn className="h-3 w-3" /> Clock In
        </button>
      )}
    </div>
  );
}
