'use client';

import { useEffect, useState } from 'react';
import { useStore } from '../../../store/useStore';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { BarChart3, Download, TrendingUp, Users, Receipt, Wallet } from 'lucide-react';

interface BestSeller {
  name: string;
  qty: number;
  revenue: number;
}

interface StaffPerformance {
  name: string;
  orders: number;
  revenue: number;
}

interface SalesTrendPoint {
  date: string;
  sales: number;
}

interface ReportData {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  bestSellers: BestSeller[];
  staffPerformance: StaffPerformance[];
  salesTrend: SalesTrendPoint[];
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const { user, token, activeRestaurantId, fetchRestaurantList } = useStore();
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 29);

  const [startDate, setStartDate] = useState(toDateInputValue(thirtyDaysAgo));
  const [endDate, setEndDate] = useState(toDateInputValue(today));

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
  const restaurantId = user?.restaurantId || (user?.role === 'SUPER_ADMIN' ? activeRestaurantId : '') || '';

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') fetchRestaurantList();
  }, [user, fetchRestaurantList]);

  useEffect(() => {
    if (!token || !restaurantId) {
      setLoading(false);
      return;
    }

    const fetchReport = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `${apiUrl}/dashboard/reports/${restaurantId}?start=${startDate}&end=${endDate}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error('Failed to load report data');
        setReport(await res.json());
      } catch (err) {
        setError('Error loading report data');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [restaurantId, token, apiUrl, startDate, endDate]);

  const exportCsv = () => {
    if (!report) return;

    const rows: string[] = [];
    rows.push(`Report period,${startDate} to ${endDate}`);
    rows.push('');
    rows.push(`Total Revenue,$${report.totalRevenue.toFixed(2)}`);
    rows.push(`Total Orders,${report.totalOrders}`);
    rows.push(`Average Order Value,$${report.avgOrderValue.toFixed(2)}`);
    rows.push('');
    rows.push('Best Selling Items');
    rows.push('Item,Quantity Sold,Revenue');
    report.bestSellers.forEach((item) => {
      rows.push(`${item.name},${item.qty},$${item.revenue.toFixed(2)}`);
    });
    rows.push('');
    rows.push('Staff Performance');
    rows.push('Staff,Orders Handled,Revenue Generated');
    report.staffPerformance.forEach((s) => {
      rows.push(`${s.name},${s.orders},$${s.revenue.toFixed(2)}`);
    });
    rows.push('');
    rows.push('Daily Sales Trend');
    rows.push('Date,Sales');
    report.salesTrend.forEach((d) => {
      rows.push(`${d.date},$${d.sales.toFixed(2)}`);
    });

    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-report-${startDate}-to-${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-400">Crunching the numbers...</p>
      </div>
    );
  }

  if (!restaurantId) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-2 text-center px-4">
        <BarChart3 className="h-8 w-8 text-slate-600" />
        <p className="text-sm font-semibold text-white">No restaurant assigned</p>
        <p className="text-xs text-slate-400 max-w-sm">
          Your account isn&apos;t linked to a specific restaurant outlet, so there&apos;s no
          report data to show here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Reports & Analytics</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Best-sellers, staff performance, and sales trends for a custom date range.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
          <span className="text-slate-500 text-xs">to</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            max={toDateInputValue(today)}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={exportCsv}
            disabled={!report}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold transition"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400 text-xs font-semibold">
          {error}
        </div>
      )}

      {report && (
        <>
          {/* Summary cards */}
          <div className="grid sm:grid-cols-3 gap-5">
            <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Revenue</span>
                <Wallet className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-extrabold text-white">${report.totalRevenue.toFixed(2)}</p>
            </div>
            <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Orders</span>
                <Receipt className="h-4 w-4 text-indigo-400" />
              </div>
              <p className="text-2xl font-extrabold text-white">{report.totalOrders}</p>
            </div>
            <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Avg Order Value</span>
                <TrendingUp className="h-4 w-4 text-violet-400" />
              </div>
              <p className="text-2xl font-extrabold text-white">${report.avgOrderValue.toFixed(2)}</p>
            </div>
          </div>

          {/* Sales trend chart */}
          <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40">
            <h3 className="text-sm font-bold text-white mb-4">Sales Trend</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={report.salesTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} />
                <Line type="monotone" dataKey="sales" stroke="#818cf8" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            {report.salesTrend.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-6">No completed sales in this date range.</p>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Best sellers */}
            <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40">
              <h3 className="text-sm font-bold text-white mb-4">Best-Selling Items</h3>
              <div className="space-y-2">
                {report.bestSellers.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-950/40">
                    <div className="flex items-center gap-2.5">
                      <span className="h-5 w-5 rounded flex items-center justify-center bg-indigo-500/10 text-indigo-300 font-bold text-[10px]">
                        {i + 1}
                      </span>
                      <span className="text-white font-medium">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-semibold">{item.qty} sold</div>
                      <div className="text-slate-500 text-[10px]">${item.revenue.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
                {report.bestSellers.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-6">No items sold in this date range.</p>
                )}
              </div>
            </div>

            {/* Staff performance */}
            <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-4 w-4 text-violet-400" />
                <h3 className="text-sm font-bold text-white">Staff Performance</h3>
              </div>
              <div className="space-y-2">
                {report.staffPerformance.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-950/40">
                    <span className="text-white font-medium">{s.name}</span>
                    <div className="text-right">
                      <div className="text-white font-semibold">{s.orders} orders</div>
                      <div className="text-slate-500 text-[10px]">${s.revenue.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
                {report.staffPerformance.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-6">No staff activity in this date range.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
