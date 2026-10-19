'use client';

import { useEffect, useState } from 'react';
import { useStore } from '../../../store/useStore';
import { Package, Plus, ShoppingCart, Truck, AlertOctagon, History } from 'lucide-react';

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  threshold: number;
}

interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export default function InventoryPanel() {
  const { user, token, socket, activeRestaurantId, fetchRestaurantList } = useStore();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [activeTab, setActiveTab] = useState<'ITEMS' | 'SUPPLIERS'>('ITEMS');

  // Form states
  const [showItemModal, setShowItemModal] = useState(false);
  const [showTxModal, setShowTxModal] = useState(false);
  const [showSupModal, setShowSupModal] = useState(false);

  // Form inputs
  const [itemName, setItemName] = useState('');
  const [itemUnit, setItemUnit] = useState('kg');
  const [itemThreshold, setItemThreshold] = useState(5);
  const [itemInitialQty, setItemInitialQty] = useState(0);

  const [txItemId, setTxItemId] = useState('');
  const [txType, setTxType] = useState<'STOCK_IN' | 'STOCK_OUT' | 'WASTAGE'>('STOCK_IN');
  const [txQty, setTxQty] = useState(0);
  const [txNotes, setTxNotes] = useState('');

  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supAddress, setSupAddress] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
  const restaurantId = user?.restaurantId || (user?.role === 'SUPER_ADMIN' ? activeRestaurantId : '') || '';

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') fetchRestaurantList();
  }, [user, fetchRestaurantList]);

  const fetchData = async () => {
    if (!token) return;

    if (!restaurantId) {
      setLoading(false);
      return;
    }
    try {
      const [itemsRes, suppliersRes] = await Promise.all([
        fetch(`${apiUrl}/inventory/items/restaurant/${restaurantId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/inventory/suppliers/restaurant/${restaurantId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (itemsRes.ok) setItems(await itemsRes.json());
      if (suppliersRes.ok) setSuppliers(await suppliersRes.json());
    } catch (err) {
      setError('Error loading inventory data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [restaurantId, token, apiUrl]);

  // Keep stock levels live — this is what makes ingredients deducted by
  // an order (or adjusted by another staff member) show up immediately
  // instead of only after a manual page refresh.
  useEffect(() => {
    if (!socket) return;

    socket.on('inventoryUpdate', (updatedItem: InventoryItem & { deleted?: boolean }) => {
      setItems((prev) => {
        if (updatedItem.deleted) {
          return prev.filter((i) => i.id !== updatedItem.id);
        }
        const idx = prev.findIndex((i) => i.id === updatedItem.id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = updatedItem;
          return next;
        }
        // A brand-new item created elsewhere (e.g. another staff member's
        // tab) — only add it if it belongs to the restaurant we're
        // actually viewing, so Super Admin switching between restaurants
        // (or another tenant's activity) doesn't leak items in here.
        if ((updatedItem as any).restaurantId && (updatedItem as any).restaurantId !== restaurantId) {
          return prev;
        }
        return [...prev, updatedItem].sort((a, b) => a.name.localeCompare(b.name));
      });
    });

    return () => {
      socket.off('inventoryUpdate');
    };
  }, [socket]);

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const payload = {
      name: itemName,
      unit: itemUnit,
      threshold: Number(itemThreshold),
      quantity: Number(itemInitialQty),
      restaurantId,
    };

    try {
      const res = await fetch(`${apiUrl}/inventory/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to create inventory item');

      setSuccess('Inventory item created successfully!');
      setShowItemModal(false);
      setItemName('');
      setItemInitialQty(0);
      fetchData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const payload = {
      inventoryItemId: txItemId,
      type: txType,
      quantity: Number(txQty),
      notes: txNotes,
    };

    try {
      const res = await fetch(`${apiUrl}/inventory/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Transaction failed. Check stock availability!');

      setSuccess('Inventory transaction logged!');
      setShowTxModal(false);
      setTxQty(0);
      setTxNotes('');
      fetchData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const payload = {
      name: supName,
      contactPerson: supContact,
      phone: supPhone,
      email: supEmail,
      address: supAddress,
      restaurantId,
    };

    try {
      const res = await fetch(`${apiUrl}/inventory/suppliers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to create supplier');

      setSuccess('Supplier registered successfully!');
      setShowSupModal(false);
      setSupName('');
      setSupContact('');
      setSupPhone('');
      setSupEmail('');
      setSupAddress('');
      fetchData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-400">Loading Store Room...</p>
      </div>
    );
  }

  if (!restaurantId) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-2 text-center px-4">
        <p className="text-sm font-semibold text-white">No restaurant assigned</p>
        <p className="text-xs text-slate-400 max-w-sm">
          Your account isn&apos;t linked to a specific restaurant outlet, so there&apos;s no
          inventory to show here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Store Room Inventory</h1>
          <p className="text-slate-400 text-sm mt-0.5">Track raw materials stock, manage vendors, and adjust stock counts</p>
        </div>

        {/* Action triggers */}
        <div className="flex gap-2 text-xs self-start sm:self-center">
          <button
            onClick={() => setShowItemModal(true)}
            className="px-3.5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1.5 transition shadow shadow-indigo-600/10"
          >
            <Plus className="h-4 w-4" /> Add Item
          </button>
          <button
            onClick={() => setShowTxModal(true)}
            className="px-3.5 py-2.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-350 hover:text-white font-semibold flex items-center gap-1.5 transition"
          >
            <ShoppingCart className="h-4 w-4" /> Stock Entry
          </button>
          <button
            onClick={() => setShowSupModal(true)}
            className="px-3.5 py-2.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-350 hover:text-white font-semibold flex items-center gap-1.5 transition"
          >
            <Truck className="h-4 w-4" /> Add Vendor
          </button>
        </div>
      </div>

      {success && (
        <div className="p-3.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-semibold">
          {success}
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg border border-rose-500/20 bg-red-500/10 text-red-400 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Tabs list */}
      <div className="flex border-b border-slate-800 gap-6 text-xs">
        <button
          onClick={() => setActiveTab('ITEMS')}
          className={`pb-3 font-semibold transition ${
            activeTab === 'ITEMS' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-white'
          }`}
        >
          Raw Materials Stock
        </button>
        <button
          onClick={() => setActiveTab('SUPPLIERS')}
          className={`pb-3 font-semibold transition ${
            activeTab === 'SUPPLIERS' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-400 hover:text-white'
          }`}
        >
          Suppliers Directory
        </button>
      </div>

      {/* Grid panels */}
      {activeTab === 'ITEMS' ? (
        <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-450 font-semibold uppercase tracking-wider">
                  <th className="pb-3">Ingredient Name</th>
                  <th className="pb-3">Current Stock</th>
                  <th className="pb-3">Low-Stock Alert Level</th>
                  <th className="pb-3">Unit</th>
                  <th className="pb-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-4 font-bold text-white">{item.name}</td>
                    <td className="py-4 font-semibold">{item.quantity.toFixed(2)}</td>
                    <td className="py-4 text-slate-400">{item.threshold.toFixed(2)}</td>
                    <td className="py-4 text-slate-400">{item.unit}</td>
                    <td className="py-4 text-right">
                      {item.quantity <= item.threshold ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/25 uppercase">
                          <AlertOctagon className="h-3 w-3" /> Depleted
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 uppercase">
                          In Stock
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-450 font-semibold uppercase tracking-wider">
                  <th className="pb-3">Vendor / Company</th>
                  <th className="pb-3">Contact Representative</th>
                  <th className="pb-3">Phone Line</th>
                  <th className="pb-3">Email Address</th>
                  <th className="pb-3 text-right">Warehouse Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {suppliers.map((sup) => (
                  <tr key={sup.id}>
                    <td className="py-4 font-bold text-white">{sup.name}</td>
                    <td className="py-4 font-semibold text-slate-350">{sup.contactPerson || 'N/A'}</td>
                    <td className="py-4 text-slate-400">{sup.phone || 'N/A'}</td>
                    <td className="py-4 text-slate-400">{sup.email || 'N/A'}</td>
                    <td className="py-4 text-right text-slate-400 truncate max-w-[200px]">{sup.address || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODALS */}
      {/* 1. Add Raw Material Item */}
      {showItemModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form onSubmit={createItem} className="w-full max-w-md rounded-xl border border-slate-850 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-white">Create Raw Material</h3>
            
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Ingredient Name</label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                required
                placeholder="e.g. Cheese, Flour, Milk"
                className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Unit Measure</label>
                <select
                  value={itemUnit}
                  onChange={(e) => setItemUnit(e.target.value)}
                  className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="kg">kilograms (kg)</option>
                  <option value="liters">liters (L)</option>
                  <option value="pcs">pieces (pcs)</option>
                  <option value="pack">packs</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Initial Stock</label>
                <input
                  type="number"
                  step="0.01"
                  value={itemInitialQty}
                  onChange={(e) => setItemInitialQty(Number(e.target.value))}
                  className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Low Stock Alert Level</label>
              <input
                type="number"
                step="0.01"
                value={itemThreshold}
                onChange={(e) => setItemThreshold(Number(e.target.value))}
                className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowItemModal(false)}
                className="flex-1 py-2 bg-slate-950 hover:bg-slate-850 text-slate-350 hover:text-white rounded-lg text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-505 text-white rounded-lg text-xs font-semibold transition"
              >
                Create Item
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Log Stock Entry */}
      {showTxModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form onSubmit={createTransaction} className="w-full max-w-md rounded-xl border border-slate-850 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-white">Log Stock Transaction</h3>
            
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Select Item</label>
              <select
                value={txItemId}
                onChange={(e) => setTxItemId(e.target.value)}
                required
                className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">-- Choose ingredient --</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} (Current: {i.quantity.toFixed(1)} {i.unit})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Transaction Type</label>
                <select
                  value={txType}
                  onChange={(e) => setTxType(e.target.value as any)}
                  className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="STOCK_IN">STOCK IN (+)</option>
                  <option value="STOCK_OUT">STOCK OUT (-)</option>
                  <option value="WASTAGE">WASTAGE (-)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Quantity</label>
                <input
                  type="number"
                  step="0.01"
                  value={txQty}
                  onChange={(e) => setTxQty(Number(e.target.value))}
                  required
                  className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Notes</label>
              <input
                type="text"
                value={txNotes}
                onChange={(e) => setTxNotes(e.target.value)}
                placeholder="e.g. Weekly vendor order, spoiled cheese..."
                className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white placeholder-slate-650 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowTxModal(false)}
                className="flex-1 py-2 bg-slate-950 hover:bg-slate-850 text-slate-355 hover:text-white rounded-lg text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
              >
                Log Entry
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Add Supplier Vendor */}
      {showSupModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form onSubmit={createSupplier} className="w-full max-w-md rounded-xl border border-slate-850 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-white">Add Supplier Vendor</h3>
            
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Supplier Name</label>
              <input
                type="text"
                value={supName}
                onChange={(e) => setSupName(e.target.value)}
                required
                placeholder="e.g. Apex Food Supplies Inc."
                className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Contact Person</label>
                <input
                  type="text"
                  value={supContact}
                  onChange={(e) => setSupContact(e.target.value)}
                  placeholder="e.g. David Supplier"
                  className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Phone Line</label>
                <input
                  type="text"
                  value={supPhone}
                  onChange={(e) => setSupPhone(e.target.value)}
                  placeholder="+14155550190"
                  className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Email Address</label>
              <input
                type="email"
                value={supEmail}
                onChange={(e) => setSupEmail(e.target.value)}
                placeholder="sales@apexsuppliers.com"
                className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white placeholder-slate-650 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Warehouse Address</label>
              <input
                type="text"
                value={supAddress}
                onChange={(e) => setSupAddress(e.target.value)}
                placeholder="Industrial District Road 5"
                className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white placeholder-slate-650 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSupModal(false)}
                className="flex-1 py-2 bg-slate-950 hover:bg-slate-850 text-slate-355 hover:text-white rounded-lg text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
              >
                Register Vendor
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
