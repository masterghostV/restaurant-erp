'use client';

import { useEffect, useState } from 'react';
import { useStore } from '../../../store/useStore';
import { Utensils, Plus, Minus, ShoppingBag, Send, History, CheckCircle, BellRing, X, ClipboardCheck, Receipt, XCircle } from 'lucide-react';

interface Table {
  id: string;
  number: string;
  capacity: number;
  status: string;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  isAvailable: boolean;
  category: { name: string };
}

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  notes: string;
}

export default function WaiterPanel() {
  const { user, token, socket, activeRestaurantId, fetchRestaurantList } = useStore();
  const [tables, setTables] = useState<Table[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [notes, setNotes] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Pop-up toast shown when the kitchen marks an order Ready — separate
  // from the header notification bell, since a waiter actively serving
  // tables needs to notice this immediately.
  const [readyToast, setReadyToast] = useState<{ id: string; title: string; message: string } | null>(null);
  const [finishingTable, setFinishingTable] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const restaurantId = user?.restaurantId || (user?.role === 'SUPER_ADMIN' ? activeRestaurantId : '') || '';

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') fetchRestaurantList();
  }, [user, fetchRestaurantList]);

  // 1. Fetch initial tables, menus, orders
  useEffect(() => {
    if (!token) return;

    if (!restaurantId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [tablesRes, menuRes, ordersRes] = await Promise.all([
          fetch(`${apiUrl}/restaurants/${restaurantId}/tables`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${apiUrl}/menu/items/restaurant/${restaurantId}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${apiUrl}/orders/restaurant/${restaurantId}`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (tablesRes.ok) setTables(await tablesRes.json());
        if (menuRes.ok) setMenuItems(await menuRes.json());
        if (ordersRes.ok) setOrders(await ordersRes.json());
      } catch (err) {
        setError('Error loading waiter panel inputs');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [restaurantId, token, apiUrl]);

  // 2. Real-time socket bindings for table/order state changes
  useEffect(() => {
    if (!socket) return;

    socket.on('orderUpdate', (updatedOrder: any) => {
      // Update local orders list
      setOrders((prev) => {
        const idx = prev.findIndex((o) => o.id === updatedOrder.id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = updatedOrder;
          return next;
        }
        return [updatedOrder, ...prev];
      });

      // Update local tables list if table status changed
      if (updatedOrder.tableId) {
        setTables((prev) =>
          prev.map((t) =>
            t.id === updatedOrder.tableId
              ? { ...t, status: updatedOrder.status === 'COMPLETED' ? 'AVAILABLE' : t.status }
              : t,
          ),
        );
      }
    });

    // Keep table statuses in sync across devices (e.g. cashier freeing a
    // table back up after payment, or this same waiter finishing one).
    socket.on('tableUpdate', (updatedTable: Table & { deleted?: boolean }) => {
      // A table the owner/manager just removed: drop it from the list.
      if (updatedTable.deleted) {
        setTables((prev) => prev.filter((t) => t.id !== updatedTable.id));
        setSelectedTable((prev) => (prev?.id === updatedTable.id ? null : prev));
        return;
      }
      setTables((prev) => {
        const idx = prev.findIndex((t) => t.id === updatedTable.id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = updatedTable;
          return next;
        }
        return [...prev, updatedTable];
      });
      setSelectedTable((prev) => (prev?.id === updatedTable.id ? updatedTable : prev));
    });

    // Pop-up toast for "Order Ready" notifications — this is the actual
    // moment a waiter needs to notice, not just see in the bell dropdown.
    socket.on('notification', (notif: { id: string; type: string; title: string; message: string }) => {
      if (notif.type === 'ORDER_READY') {
        setReadyToast(notif);
        setTimeout(() => {
          setReadyToast((current) => (current?.id === notif.id ? null : current));
        }, 10000);
      }
    });

    return () => {
      socket.off('orderUpdate');
      socket.off('tableUpdate');
      socket.off('notification');
    };
  }, [socket]);

  const categories = ['All', ...Array.from(new Set(menuItems.map((item) => item.category?.name)))];
  const filteredMenuItems = menuItems.filter(
    (item) => (categoryFilter === 'All' || item.category?.name === categoryFilter) && item.isAvailable,
  );

  const addToCart = (menuItem: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.menuItem.id === menuItem.id);
      if (existing) {
        return prev.map((item) =>
          item.menuItem.id === menuItem.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...prev, { menuItem, quantity: 1, notes: '' }];
    });
  };

  const updateQuantity = (menuItemId: string, amount: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.menuItem.id === menuItemId ? { ...item, quantity: Math.max(0, item.quantity + amount) } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const markServed = async (orderId: string) => {
    try {
      const res = await fetch(`${apiUrl}/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'SERVED' }),
      });
      if (!res.ok) throw new Error('Failed to mark order as served');
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'SERVED' } : o)));
    } catch (err: any) {
      setError(err.message || 'Error marking order served');
    }
  };

  // Only orders that haven't been cooked yet can be cancelled — once the
  // kitchen marks something Ready/Served, the food already exists.
  const cancelOrder = async (orderId: string) => {
    if (!window.confirm('Cancel this order? Any ingredients already deducted will be restored to stock.')) {
      return;
    }
    try {
      const res = await fetch(`${apiUrl}/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: 'Cancelled by waiter' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'Failed to cancel order');
      }
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'CANCELLED' } : o)));
      setSuccessMsg('Order cancelled and stock restored.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setError(err.message || 'Error cancelling order');
    }
  };

  // Locks in every order placed for this table into one combined bill and
  // sends it to the Cashier — no more items can be added to this table
  // afterwards until it's paid and freed up again.
  const finishTable = async () => {
    if (!selectedTable) return;
    setFinishingTable(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/restaurants/tables/${selectedTable.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'BILLING' }),
      });
      if (!res.ok) throw new Error('Failed to finish table');

      setTables((prev) =>
        prev.map((t) => (t.id === selectedTable.id ? { ...t, status: 'BILLING' } : t)),
      );
      setSuccessMsg(`Table ${selectedTable.number} sent to Cashier for billing.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      setSelectedTable(null);
      setCart([]);
    } catch (err: any) {
      setError(err.message || 'Error finishing table');
    } finally {
      setFinishingTable(false);
    }
  };

  const submitOrder = async () => {
    if (!selectedTable) {
      setError('Please select a table to place order');
      return;
    }
    if (selectedTable.status === 'BILLING') {
      setError('This table has already been sent to the cashier for billing. Cannot add more items.');
      return;
    }
    if (cart.length === 0) {
      setError('Please add menu items to the cart');
      return;
    }

    setError('');
    const payload = {
      tableId: selectedTable.id,
      waiterId: user?.id,
      restaurantId,
      notes,
      items: cart.map((c) => ({
        menuItemId: c.menuItem.id,
        quantity: c.quantity,
        notes: c.notes,
      })),
    };

    try {
      const res = await fetch(`${apiUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to create order. Check inventory stock levels!');
      
      setCart([]);
      setSelectedTable(null);
      setNotes('');
      setSuccessMsg('KOT Order successfully sent to kitchen!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setError(err.message || 'Error creating order');
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-400">Loading Order Station...</p>
      </div>
    );
  }

  if (!restaurantId) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-2 text-center px-4">
        <p className="text-sm font-semibold text-white">No restaurant assigned</p>
        <p className="text-xs text-slate-400 max-w-sm">
          Your account isn&apos;t linked to a specific restaurant outlet, so there&apos;s
          nothing to take orders for here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Waiter Order Station</h1>
          <p className="text-slate-400 text-sm mt-0.5">Select tables and create Kitchen Order Tickets (KOT)</p>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="h-4 w-4" /> {successMsg}
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400 text-xs font-semibold">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Tables Grid + Menu selector */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Section: Tables */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Tables Room Map</h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3.5">
              {tables.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTable(t)}
                  className={`p-4 rounded-xl border flex flex-col justify-between h-24 text-left transition-all ${
                    selectedTable?.id === t.id
                      ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/20'
                      : t.status === 'BILLING'
                      ? 'border-amber-800/60 bg-amber-950/20 text-amber-400'
                      : t.status === 'OCCUPIED'
                      ? 'border-rose-900/60 bg-rose-950/20 text-rose-400'
                      : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span className="text-sm font-bold text-white">{t.number}</span>
                  <span className="text-[10px] text-slate-400">{t.capacity} Pax Capacity</span>
                  <span className={`inline-block px-1.5 py-0.5 self-start mt-1.5 rounded text-[9px] font-extrabold uppercase ${
                    t.status === 'BILLING'
                      ? 'bg-amber-500/15 text-amber-300'
                      : t.status === 'OCCUPIED'
                      ? 'bg-rose-500/15 text-rose-300'
                      : 'bg-emerald-500/15 text-emerald-300'
                  }`}>
                    {t.status === 'BILLING' ? 'BILLING' : t.status}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Section: Menu Catalog */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Menu Catalog</h3>
              
              {/* Category Filters */}
              <div className="flex gap-1.5 overflow-x-auto">
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategoryFilter(c)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                      categoryFilter === c
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Menu Items Grid */}
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredMenuItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/40 hover:border-slate-700 transition cursor-pointer flex flex-col justify-between h-44 group relative overflow-hidden"
                >
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">
                      {item.category?.name}
                    </span>
                    <h4 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                      {item.name}
                    </h4>
                  </div>
                  <div className="flex justify-between items-center mt-4">
                    <span className="text-sm font-extrabold text-white">${item.price.toFixed(2)}</span>
                    <button className="h-7 w-7 rounded-lg bg-indigo-500/10 hover:bg-indigo-500 text-indigo-400 hover:text-white border border-indigo-500/20 flex items-center justify-center transition-colors">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Cart Sidebar & Place order */}
        <div className="lg:col-span-4 space-y-6">
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-indigo-400" />
                <h3 className="font-bold text-white">
                  Cart {selectedTable ? `(${selectedTable.number})` : ''}
                </h3>
              </div>

              {selectedTable && selectedTable.status === 'OCCUPIED' && (
                <button
                  onClick={finishTable}
                  disabled={finishingTable}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 transition disabled:opacity-50"
                >
                  <Receipt className="h-3.5 w-3.5" />
                  {finishingTable ? 'Finishing...' : 'Finish Table'}
                </button>
              )}
            </div>

            {selectedTable && selectedTable.status === 'BILLING' && (
              <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                This table has been sent to the Cashier for billing. No more items can be added.
              </div>
            )}

            {/* Cart Items List */}
            <div className="space-y-3.5 max-h-72 overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-10">Cart is empty. Select menu items.</p>
              ) : (
                cart.map((item) => (
                  <div key={item.menuItem.id} className="flex justify-between items-center bg-slate-950/40 p-2.5 rounded-lg border border-slate-850">
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-white">{item.menuItem.name}</h4>
                      <span className="text-[10px] text-slate-400">${item.menuItem.price.toFixed(2)} each</span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={() => updateQuantity(item.menuItem.id, -1)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-xs font-bold text-white">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.menuItem.id, 1)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* KOT Instructions */}
            {cart.length > 0 && (
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Cooking notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Medium spice, no onions..."
                  className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  rows={2}
                />
              </div>
            )}

            {/* Cart actions */}
            <button
              onClick={submitOrder}
              disabled={cart.length === 0 || selectedTable?.status === 'BILLING'}
              className="w-full py-2.5 rounded-lg font-medium text-xs text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/10 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Send className="h-3.5 w-3.5" /> Send Order to Kitchen (KOT)
            </button>
          </div>

          {/* Waiter's Active Orders List */}
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <History className="h-4 w-4 text-violet-400" /> Active Waiter Orders
            </h3>

            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {orders
                .filter((o) => o.waiterId === user?.id && o.status !== 'COMPLETED' && o.status !== 'CANCELLED')
                .map((o) => {
                  let badgeClass = 'bg-indigo-500/15 text-indigo-400';
                  if (o.status === 'PREPARING') badgeClass = 'bg-amber-500/15 text-amber-400';
                  if (o.status === 'SERVED') badgeClass = 'bg-slate-700/60 text-slate-300';

                  const canCancel = o.status === 'NEW' || o.status === 'PREPARING';

                  return (
                    <div key={o.id} className="p-3 rounded-lg bg-slate-950/60 border border-slate-850 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-bold text-white">Table {o.table?.number || 'N/A'}</div>
                        <p className="text-slate-500 text-[10px]">{o.orderItems.length} items • ${o.totalPrice.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {canCancel && (
                          <button
                            onClick={() => cancelOrder(o.id)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-extrabold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/25 hover:bg-rose-500/20 transition"
                            title="Cancel this order"
                          >
                            <XCircle className="h-3 w-3" />
                          </button>
                        )}
                        {o.status === 'READY' ? (
                          <button
                            onClick={() => markServed(o.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-extrabold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 hover:bg-emerald-500/25 transition animate-pulse"
                          >
                            <ClipboardCheck className="h-3 w-3" /> Mark Served
                          </button>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${badgeClass}`}>
                            {o.status}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

        </div>

      </div>

      {/* Pop-up toast: Order Ready notification */}
      {readyToast && (
        <div className="fixed bottom-6 right-6 z-50 w-80 rounded-xl border border-emerald-500/30 bg-slate-900 shadow-2xl shadow-emerald-500/10 p-4 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <BellRing className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="flex-1 space-y-0.5">
              <h4 className="text-sm font-bold text-white">{readyToast.title}</h4>
              <p className="text-xs text-slate-400 leading-relaxed">{readyToast.message}</p>
            </div>
            <button
              onClick={() => setReadyToast(null)}
              className="text-slate-500 hover:text-white transition shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
