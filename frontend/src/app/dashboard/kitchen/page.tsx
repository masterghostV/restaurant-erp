'use client';

import { useEffect, useState } from 'react';
import { useStore } from '../../../store/useStore';
import { ChefHat, Timer, Check, ArrowRight, User } from 'lucide-react';

interface OrderItem {
  id: string;
  quantity: number;
  notes: string | null;
  menuItem: { name: string };
}

interface Order {
  id: string;
  status: string; // NEW, PREPARING, READY, SERVED, COMPLETED, CANCELLED
  notes: string | null;
  totalPrice: number;
  createdAt: string;
  table: { number: string } | null;
  orderItems: OrderItem[];
}

// A short two-tone chime built with the Web Audio API — no external sound
// file needed, and it works offline. Fails silently in browsers that
// block audio before any user interaction has happened on the page.
function playNewOrderChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    [880, 1175].forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = freq;
      const start = now + i * 0.15;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.3);
    });

    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Audio isn't available/allowed — not worth surfacing an error for.
  }
}

export default function KitchenPanel() {
  const { user, token, socket, activeRestaurantId, fetchRestaurantList } = useStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
  const restaurantId = user?.restaurantId || (user?.role === 'SUPER_ADMIN' ? activeRestaurantId : '') || '';

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') fetchRestaurantList();
  }, [user, fetchRestaurantList]);

  // 1. Fetch active orders
  useEffect(() => {
    if (!token) return;

    if (!restaurantId) {
      setLoading(false);
      return;
    }

    const fetchOrders = async () => {
      try {
        const res = await fetch(`${apiUrl}/orders/restaurant/${restaurantId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load kitchen queue');
        const data = await res.json();
        setOrders(data);
      } catch (err) {
        setError('Error connecting to active order queue');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [restaurantId, token, apiUrl]);

  // 2. Real-time updates via Socket.IO
  useEffect(() => {
    if (!socket) return;

    // Handle order creation / updates broadcasted by waiters/cashiers
    socket.on('orderUpdate', (updatedOrder: Order) => {
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === updatedOrder.id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = updatedOrder;
          return next;
        }
        return [updatedOrder, ...prev];
      });
    });

    socket.on('kitchenUpdate', (updatedOrder: Order) => {
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === updatedOrder.id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = updatedOrder;
          return next;
        }
        // A brand-new KOT just came in (not an update to one we already
        // had) — this is the moment kitchen staff actually needs to
        // notice, since they might be heads-down cooking and not looking
        // at the screen.
        playNewOrderChime();
        return [updatedOrder, ...prev];
      });
    });

    return () => {
      socket.off('orderUpdate');
      socket.off('kitchenUpdate');
    };
  }, [socket]);

  const updateStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await fetch(`${apiUrl}/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Failed to update status');
    } catch (err) {
      console.error(err);
    }
  };

  const filterOrders = (status: string) => {
    return orders.filter((o) => o.status === status);
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-400">Loading Kitchen Queue...</p>
      </div>
    );
  }

  if (!restaurantId) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-2 text-center px-4">
        <p className="text-sm font-semibold text-white">No restaurant assigned</p>
        <p className="text-xs text-slate-400 max-w-sm">
          Your account isn&apos;t linked to a specific restaurant outlet, so there&apos;s no
          kitchen queue to show here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Kitchen Operations (KOT)</h1>
          <p className="text-slate-400 text-sm mt-0.5">Real-time incoming food tickets and cooking pipeline</p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg border border-rose-500/20 bg-red-500/10 text-red-400 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Kanban Board Grid */}
      <div className="grid md:grid-cols-4 gap-6 items-start">
        
        {/* Column 1: New orders */}
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex justify-between items-center">
            <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-300">New Queue</span>
            <span className="text-xs font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">
              {filterOrders('NEW').length}
            </span>
          </div>

          <div className="space-y-3.5 max-h-[70vh] overflow-y-auto pr-1">
            {filterOrders('NEW').map((o) => (
              <KitchenCard key={o.id} order={o} onAdvance={() => updateStatus(o.id, 'PREPARING')} actionText="Cook" />
            ))}
          </div>
        </div>

        {/* Column 2: Preparing orders */}
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex justify-between items-center">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300">Cooking</span>
            <span className="text-xs font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">
              {filterOrders('PREPARING').length}
            </span>
          </div>

          <div className="space-y-3.5 max-h-[70vh] overflow-y-auto pr-1">
            {filterOrders('PREPARING').map((o) => (
              <KitchenCard key={o.id} order={o} onAdvance={() => updateStatus(o.id, 'READY')} actionText="Food Ready" />
            ))}
          </div>
        </div>

        {/* Column 3: Ready orders */}
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex justify-between items-center">
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">Ready</span>
            <span className="text-xs font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">
              {filterOrders('READY').length}
            </span>
          </div>

          <div className="space-y-3.5 max-h-[70vh] overflow-y-auto pr-1">
            {filterOrders('READY').map((o) => (
              <div key={o.id} className="p-4 rounded-xl border border-emerald-800/40 bg-emerald-950/10 space-y-3.5">
                <div className="flex justify-between items-center border-b border-emerald-900/30 pb-2.5">
                  <div className="flex items-center gap-1.5">
                    <ChefHat className="h-4 w-4 text-emerald-400" />
                    <span className="font-extrabold text-white">Table {o.table?.number || 'N/A'}</span>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-400">
                    Awaiting pickup
                  </span>
                </div>
                <div className="space-y-1.5 text-xs">
                  {o.orderItems.map((item) => (
                    <div key={item.id} className="flex justify-between text-slate-300">
                      <span>{item.quantity}x {item.menuItem.name}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 italic">
                  Waiting for the waiter to collect and serve this order.
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Column 4: Served orders */}
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 flex justify-between items-center">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">Served</span>
            <span className="text-xs font-bold bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
              {filterOrders('SERVED').length}
            </span>
          </div>

          <div className="space-y-3.5 max-h-[70vh] overflow-y-auto pr-1">
            {filterOrders('SERVED').map((o) => (
              <div key={o.id} className="p-4 rounded-xl border border-slate-850 bg-slate-900/20 text-slate-400 space-y-3">
                <div className="flex justify-between items-center border-b border-slate-850 pb-2">
                  <span className="font-bold text-slate-300">Table {o.table?.number || 'N/A'}</span>
                  <span className="text-[10px] text-slate-500">Served</span>
                </div>
                <div className="space-y-1 text-xs">
                  {o.orderItems.map((item) => (
                    <div key={item.id}>
                      {item.quantity}x {item.menuItem.name}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// Subcomponent: Kitchen Ticket Card
function KitchenCard({ order, onAdvance, actionText }: { order: Order; onAdvance: () => void; actionText: string }) {
  const timeString = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 shadow-lg space-y-3.5 hover:border-slate-700 transition">
      
      {/* Card Header */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-1.5">
          <ChefHat className="h-4 w-4 text-indigo-400" />
          <span className="font-extrabold text-white">Table {order.table?.number || 'N/A'}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-semibold">
          <Timer className="h-3.5 w-3.5 text-slate-500" /> {timeString}
        </div>
      </div>

      {/* Cart Items List */}
      <div className="space-y-1.5 text-xs">
        {order.orderItems.map((item) => (
          <div key={item.id} className="flex justify-between text-slate-200">
            <span>
              <strong className="text-white">{item.quantity}x</strong> {item.menuItem.name}
            </span>
            {item.notes && (
              <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1 rounded">
                {item.notes}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Ticket Notes */}
      {order.notes && (
        <div className="p-2 rounded bg-slate-950/40 text-[10px] text-slate-400 leading-relaxed italic border border-slate-850">
          Note: {order.notes}
        </div>
      )}

      {/* Advance button */}
      <button
        onClick={onAdvance}
        className="w-full py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow shadow-indigo-600/10"
      >
        <span>{actionText}</span> <ArrowRight className="h-3.5 w-3.5" />
      </button>

    </div>
  );
}
