'use client';

import { useEffect, useState } from 'react';
import { useStore } from '../../../store/useStore';
import { ConciergeBell, Search, DollarSign, Percent, Printer, FileText, CheckCircle } from 'lucide-react';

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  menuItem: { name: string };
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  method: string;
}

interface Order {
  id: string;
  status: string;
  notes: string | null;
  subtotal: number;
  taxAmount: number;
  totalPrice: number;
  createdAt: string;
  tableId: string | null;
  table: { number: string } | null;
  orderItems: OrderItem[];
  payments: Payment[];
}

// A single table's whole sitting, combined across every KOT the waiter
// sent for it (first round, second round, etc.) into one bill.
interface TableBill {
  tableId: string;
  tableNumber: string;
  orders: Order[];
  subtotal: number;
  taxAmount: number;
  totalPrice: number;
  amountPaid: number;
  amountDue: number;
  earliestCreatedAt: string;
}

export default function CashierPanel() {
  const { user, token, socket, activeRestaurantId, fetchRestaurantList } = useStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<{ id: string; number: string; status: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBill, setSelectedBill] = useState<TableBill | null>(null);

  // Checkout inputs
  const [discountPercent, setDiscountPercent] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');
  const [transactionId, setTransactionId] = useState('');

  // UI states
  const [showReceipt, setShowReceipt] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
  const restaurantId = user?.restaurantId || (user?.role === 'SUPER_ADMIN' ? activeRestaurantId : '') || '';

  // Super Admin needs the restaurant list loaded so they can pick one
  // (the actual picker UI lives in the dashboard header).
  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') fetchRestaurantList();
  }, [user, fetchRestaurantList]);

  // 1. Fetch orders + tables
  useEffect(() => {
    if (!token) return;

    // Super Admin accounts aren't tied to a single restaurant, so there's
    // nothing to fetch here — stop the spinner instead of hanging forever.
    if (!restaurantId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [ordersRes, tablesRes] = await Promise.all([
          fetch(`${apiUrl}/orders/restaurant/${restaurantId}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${apiUrl}/restaurants/${restaurantId}/tables`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (!ordersRes.ok) throw new Error('Failed to load active orders');
        setOrders(await ordersRes.json());
        if (tablesRes.ok) setTables(await tablesRes.json());
      } catch (err) {
        setError('Error fetching cashier data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [restaurantId, token, apiUrl]);

  // 2. Socket bindings
  useEffect(() => {
    if (!socket) return;

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

    // Fires when a waiter clicks "Finish Table" (status -> BILLING) or once
    // a table frees back up after payment — keeps the billable list live.
    socket.on('tableUpdate', (updatedTable: { id: string; number: string; status: string }) => {
      setTables((prev) => {
        const idx = prev.findIndex((t) => t.id === updatedTable.id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = updatedTable;
          return next;
        }
        return [...prev, updatedTable];
      });
    });

    return () => {
      socket.off('orderUpdate');
      socket.off('tableUpdate');
    };
  }, [socket]);

  // Group every open (non-paid) order by table, so a table that ordered
  // in multiple rounds still shows up as ONE combined bill here — this
  // only ever includes tables the waiter has explicitly "Finished".
  const billableTables = tables.filter((t) => t.status === 'BILLING');

  const tableBills: TableBill[] = billableTables
    .map((t) => {
      const tableOrders = orders.filter(
        (o) => o.tableId === t.id && o.status !== 'COMPLETED' && o.status !== 'CANCELLED',
      );
      if (tableOrders.length === 0) return null;
      const totalPrice = tableOrders.reduce((s, o) => s + o.totalPrice, 0);
      const amountPaid = tableOrders
        .flatMap((o) => o.payments || [])
        .filter((p) => p.status === 'COMPLETED')
        .reduce((s, p) => s + p.amount, 0);
      return {
        tableId: t.id,
        tableNumber: t.number,
        orders: tableOrders,
        subtotal: tableOrders.reduce((s, o) => s + o.subtotal, 0),
        taxAmount: tableOrders.reduce((s, o) => s + o.taxAmount, 0),
        totalPrice,
        amountPaid,
        amountDue: Math.max(0, totalPrice - amountPaid),
        earliestCreatedAt: tableOrders.reduce(
          (earliest, o) => (o.createdAt < earliest ? o.createdAt : earliest),
          tableOrders[0].createdAt,
        ),
      };
    })
    .filter((b): b is TableBill => b !== null);

  const completedBillingHistory = orders.filter((o) => o.status === 'COMPLETED');

  // Keep the selected bill in sync as orders update via socket (e.g. a
  // late item finishing cooking status doesn't change the total, but stay
  // consistent regardless).
  useEffect(() => {
    if (!selectedBill) return;
    const stillBillable = tableBills.find((b) => b.tableId === selectedBill.tableId);
    setSelectedBill(stillBillable || null);
  }, [orders, tables]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculations
  const subtotal = selectedBill?.subtotal || 0;
  const tax = selectedBill?.taxAmount || 0;
  const initialTotal = selectedBill?.totalPrice || 0;
  const alreadyPaid = selectedBill?.amountPaid || 0;
  // Once any payment has been collected toward this bill, the discount is
  // locked in — it was already decided (or deliberately left at 0%) on
  // that first installment, and re-discounting partway through a split
  // payment would make the math inconsistent with what's already recorded.
  const discountLocked = alreadyPaid > 0;
  const discountAmount = initialTotal * (discountPercent / 100);
  const finalPrice = Math.max(0, initialTotal - discountAmount);
  const balanceDue = Math.max(0, finalPrice - alreadyPaid);

  // What the cashier is choosing to collect right now — defaults to the
  // full remaining balance, but can be lowered to split the bill across
  // multiple payment methods/installments.
  const [collectAmount, setCollectAmount] = useState<number | ''>('');
  useEffect(() => {
    setCollectAmount(balanceDue > 0 ? Number(balanceDue.toFixed(2)) : '');
  }, [selectedBill?.tableId, balanceDue]); // eslint-disable-line react-hooks/exhaustive-deps

  const processPayment = async () => {
    if (!selectedBill) return;
    if (processingPayment) return;

    const amountToCollect = typeof collectAmount === 'number' ? collectAmount : 0;
    if (amountToCollect <= 0) {
      setError('Enter an amount greater than zero to collect.');
      return;
    }
    if (amountToCollect > balanceDue + 0.01) {
      setError(`Amount exceeds the remaining balance due ($${balanceDue.toFixed(2)}).`);
      return;
    }

    setError('');
    setProcessingPayment(true);

    const payload = {
      amount: amountToCollect,
      method: paymentMethod,
      discountAmount,
      transactionId: paymentMethod !== 'CASH' ? transactionId : undefined,
    };

    try {
      const res = await fetch(`${apiUrl}/orders/table/${selectedBill.tableId}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || 'Payment processing failed');
      }

      const result = await res.json();

      if (result.isFinalPayment) {
        setSuccess(`Table ${selectedBill.tableNumber} paid in full and cleared!`);
        setTimeout(() => setSuccess(''), 4000);
        setDiscountPercent(0);
        setTransactionId('');
        setTables((prev) => prev.map((t) => (t.id === selectedBill.tableId ? { ...t, status: 'AVAILABLE' } : t)));
        setSelectedBill(null);
      } else {
        setSuccess(
          `Collected $${amountToCollect.toFixed(2)} via ${paymentMethod}. Remaining balance: $${result.remainingBalance.toFixed(2)}.`,
        );
        setTimeout(() => setSuccess(''), 5000);
        setTransactionId('');
        // Keep the bill selected — the socket 'orderUpdate' broadcast will
        // refresh `orders` (with the new Payment record included), which
        // recomputes `amountPaid`/`balanceDue` automatically above.
      }
    } catch (err: any) {
      setError(err.message || 'Payment error');
    } finally {
      setProcessingPayment(false);
    }
  };

  const filteredBills = tableBills.filter((b) =>
    b.tableNumber.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-400">Loading POS Station...</p>
      </div>
    );
  }

  if (!restaurantId) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-2 text-center px-4">
        <ConciergeBell className="h-8 w-8 text-slate-600" />
        <p className="text-sm font-semibold text-white">No restaurant assigned</p>
        <p className="text-xs text-slate-400 max-w-sm">
          Your account isn&apos;t linked to a specific restaurant outlet, so there&apos;s no
          POS billing data to show here. This screen is for restaurant staff (Cashier,
          Owner) — try the Super Admin Console instead.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">POS Checkout Terminal</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Bills appear here once a waiter marks a table as Finished — every round of
          ordering for that table is combined into one bill automatically.
        </p>
      </div>

      {success && (
        <div className="p-3.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="h-4 w-4" /> {success}
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400 text-xs font-semibold">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Unpaid Bills & History */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by table number (e.g. T-01)..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Tables ready for billing */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Ready for Billing</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              {filteredBills.map((bill) => (
                <div
                  key={bill.tableId}
                  onClick={() => setSelectedBill(bill)}
                  className={`p-4 rounded-xl border cursor-pointer flex justify-between items-center transition ${
                    selectedBill?.tableId === bill.tableId
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                  }`}
                >
                  <div className="space-y-1">
                    <span className="text-sm font-bold text-white">Table {bill.tableNumber}</span>
                    <p className="text-[11px] text-slate-400">
                      {bill.orders.length} round{bill.orders.length > 1 ? 's' : ''} •{' '}
                      {bill.orders.reduce((n, o) => n + o.orderItems.length, 0)} items • ${bill.totalPrice.toFixed(2)}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-amber-500/15 text-amber-400">
                    Finished
                  </span>
                </div>
              ))}
              {filteredBills.length === 0 && (
                <p className="text-xs text-slate-500 col-span-2 py-6 text-center">
                  No tables sent for billing yet. A waiter needs to click &quot;Finish Table&quot; first.
                </p>
              )}
            </div>
          </div>

          {/* Billing History */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Today's Billing History</h3>
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {completedBillingHistory.map((o) => (
                <div
                  key={o.id}
                  className="p-3.5 rounded-lg border border-slate-850 bg-slate-900/20 flex justify-between items-center text-xs text-slate-400"
                >
                  <div className="space-y-0.5">
                    <span className="font-bold text-white">Table {o.table?.number || 'N/A'}</span>
                    <div className="text-[10px] text-slate-500">
                      {new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div className="text-right space-y-0.5">
                    <span className="font-bold text-white">${o.totalPrice.toFixed(2)}</span>
                    <div className="text-[9px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-1 rounded uppercase tracking-wide inline-block">
                      Paid
                    </div>
                  </div>
                </div>
              ))}
              {completedBillingHistory.length === 0 && (
                <p className="text-xs text-slate-500 py-6 text-center">No transactions completed yet today.</p>
              )}
            </div>
          </div>

        </div>

        {/* Right Side: Invoice Calculator */}
        <div className="lg:col-span-5">
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-850 pb-3">
              <ConciergeBell className="h-5 w-5 text-indigo-400" />
              <h3 className="font-bold text-white">
                Invoice {selectedBill ? `(Table ${selectedBill.tableNumber})` : ''}
              </h3>
            </div>

            {!selectedBill ? (
              <p className="text-xs text-slate-500 text-center py-16">Select a finished table to compute checkout.</p>
            ) : (
              <div className="space-y-6">

                {/* Items List, grouped by ordering round */}
                <div className="space-y-3 border-b border-slate-850 pb-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                    Ordered Items ({selectedBill.orders.length} round{selectedBill.orders.length > 1 ? 's' : ''})
                  </span>
                  <div className="space-y-3 max-h-44 overflow-y-auto pr-1">
                    {selectedBill.orders.map((order, i) => (
                      <div key={order.id} className="space-y-1">
                        <span className="text-[9px] font-bold text-slate-500 uppercase">
                          Round {i + 1} • {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {order.orderItems.map((item) => (
                          <div key={item.id} className="flex justify-between text-xs text-slate-350">
                            <span>{item.quantity}x {item.menuItem.name}</span>
                            <span className="text-white font-medium">${(item.price * item.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Discounts */}
                <div className="space-y-2 border-b border-slate-850 pb-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-450 font-bold uppercase text-[10px]">Discount Percentage</span>
                    <span className="text-white font-extrabold">{discountPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    step="5"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(Number(e.target.value))}
                    disabled={discountLocked}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>0%</span>
                    <span>15%</span>
                    <span>30% max</span>
                  </div>
                  {discountLocked && (
                    <p className="text-[10px] text-amber-400">
                      Discount is locked in — a payment has already been collected toward this bill.
                    </p>
                  )}
                </div>

                {/* Payment Methods */}
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Payment Settings</span>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {(['CASH', 'UPI', 'CARD'] as const).map((method) => (
                      <button
                        key={method}
                        onClick={() => setPaymentMethod(method)}
                        className={`py-2 rounded-lg font-semibold border transition ${
                          paymentMethod === method
                            ? 'border-indigo-500 bg-indigo-500/10 text-white'
                            : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>

                  {paymentMethod !== 'CASH' && (
                    <input
                      type="text"
                      placeholder="Transaction Reference ID"
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  )}
                </div>

                {/* Subtotals breakdown */}
                <div className="space-y-2 p-4 rounded-xl bg-slate-950/40 border border-slate-850 text-xs">
                  <div className="flex justify-between text-slate-450">
                    <span>Subtotal</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-450">
                    <span>VAT / CGST (5%)</span>
                    <span>${tax.toFixed(2)}</span>
                  </div>
                  {discountPercent > 0 && (
                    <div className="flex justify-between text-rose-400">
                      <span>Discount ({discountPercent}%)</span>
                      <span>-${discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-white border-t border-slate-850 pt-2">
                    <span>Total Bill</span>
                    <span>${finalPrice.toFixed(2)}</span>
                  </div>
                  {alreadyPaid > 0 && (
                    <>
                      <div className="flex justify-between text-emerald-400">
                        <span>Already Paid</span>
                        <span>-${alreadyPaid.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-amber-400 border-t border-slate-850 pt-2">
                        <span>Balance Due</span>
                        <span>${balanceDue.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Split billing: choose how much to collect right now */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                    Collect Now (leave less than full to split the bill)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      max={balanceDue}
                      step="0.01"
                      value={collectAmount}
                      onChange={(e) => setCollectAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg pl-7 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  {typeof collectAmount === 'number' && collectAmount > 0 && collectAmount < balanceDue - 0.01 && (
                    <p className="text-[10px] text-indigo-400">
                      This will leave ${(balanceDue - collectAmount).toFixed(2)} still due — you can collect the
                      rest with a different payment method right after.
                    </p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-3.5">
                  <button
                    onClick={() => setShowReceipt(true)}
                    className="py-2.5 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Printer className="h-4 w-4" /> Print Preview
                  </button>

                  <button
                    onClick={processPayment}
                    disabled={processingPayment}
                    className="py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow shadow-indigo-600/10"
                  >
                    <DollarSign className="h-4 w-4" />
                    {processingPayment
                      ? 'Processing...'
                      : typeof collectAmount === 'number' && collectAmount > 0 && collectAmount < balanceDue - 0.01
                      ? 'Collect Partial Payment'
                      : 'Collect & Close'}
                  </button>
                </div>

              </div>
            )}
          </div>
        </div>

      </div>

      {/* MODAL: Printable Receipt */}
      {showReceipt && selectedBill && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200 print:bg-white print:p-0">
          <div id="printable-receipt" className="w-full max-w-sm rounded-xl border border-slate-850 bg-slate-900 shadow-2xl p-6 relative flex flex-col gap-4 print:rounded-none print:border-0 print:shadow-none print:bg-white">
            
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-slate-800">
              <h3 className="font-extrabold text-base text-white">GOURMET GARDEN</h3>
              <p className="text-[10px] text-slate-500">456 Food Boulevard, Silicon Valley</p>
              <p className="text-[10px] text-slate-500">Ph: +14155552671</p>
            </div>

            <div className="text-[10px] text-slate-400 space-y-0.5 border-b border-dashed border-slate-800 pb-3">
              <div className="flex justify-between">
                <span>Bill No: BILL-{selectedBill.tableId.substring(0, 8).toUpperCase()}</span>
                <span>Date: {new Date(selectedBill.earliestCreatedAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Table: Table {selectedBill.tableNumber}</span>
                <span>Time: {new Date(selectedBill.earliestCreatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="flex justify-between">
                <span>Cashier: {user?.name}</span>
                <span>Method: {paymentMethod}</span>
              </div>
            </div>

            <div className="text-[11px] space-y-2 border-b border-dashed border-slate-800 pb-3">
              <div className="grid grid-cols-12 font-bold text-white">
                <span className="col-span-6">Item</span>
                <span className="col-span-2 text-center">Qty</span>
                <span className="col-span-4 text-right">Amt</span>
              </div>
              {selectedBill.orders.flatMap((order) => order.orderItems).map((item) => (
                <div key={item.id} className="grid grid-cols-12 text-slate-400">
                  <span className="col-span-6">{item.menuItem.name}</span>
                  <span className="col-span-2 text-center">{item.quantity}</span>
                  <span className="col-span-4 text-right">${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="text-xs text-slate-400 space-y-1.5 border-b border-dashed border-slate-800 pb-3">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>CGST/SGST (5%)</span>
                <span>${tax.toFixed(2)}</span>
              </div>
              {discountPercent > 0 && (
                <div className="flex justify-between text-rose-400">
                  <span>Discount ({discountPercent}%)</span>
                  <span>-${discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-white text-sm">
                <span>Total Payable</span>
                <span>${finalPrice.toFixed(2)}</span>
              </div>
            </div>

            <div className="text-center text-[10px] text-slate-500 italic py-2">
              Thank you for dining with us! Come again.
            </div>

            <div className="grid grid-cols-2 gap-3 print:hidden">
              <button
                onClick={() => setShowReceipt(false)}
                className="w-full py-2 bg-slate-950 hover:bg-slate-850 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" /> Print
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
