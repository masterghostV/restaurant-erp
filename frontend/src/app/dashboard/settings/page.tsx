'use client';

import { useEffect, useState } from 'react';
import { useStore } from '../../../store/useStore';
import { Settings, Save, Sparkles, Sliders, ShieldCheck } from 'lucide-react';

interface SettingItem {
  key: string;
  value: string;
  type: string;
}

export default function SettingsPanel() {
  const { user, token, activeRestaurantId, fetchRestaurantList } = useStore();
  const [settings, setSettings] = useState<SettingItem[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'GENERAL' | 'TAX' | 'POS'>('GENERAL');

  // Input states mapped to keys
  const [taxRate, setTaxRate] = useState('5.0');
  const [currency, setCurrency] = useState('USD');
  const [themeSetting, setThemeSetting] = useState('dark');
  const [enableKotPrint, setEnableKotPrint] = useState('true');
  const [storeTiming, setStoreTiming] = useState('11:00 AM - 11:00 PM');
  const [backupFreq, setBackupFreq] = useState('daily');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
  const restaurantId = user?.restaurantId || (user?.role === 'SUPER_ADMIN' ? activeRestaurantId : '') || '';

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') fetchRestaurantList();
  }, [user, fetchRestaurantList]);

  useEffect(() => {
    if (!token) return;

    if (!restaurantId) {
      setLoading(false);
      return;
    }

    const fetchSettings = async () => {
      try {
        const res = await fetch(`${apiUrl}/settings/restaurant/${restaurantId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data: SettingItem[] = await res.json();
          setSettings(data);

          // Map items to states
          const map = (k: string, setFn: any) => {
            const match = data.find((s) => s.key === k);
            if (match) setFn(match.value);
          };

          map('tax_percentage', setTaxRate);
          map('currency', setCurrency);
          map('theme', setThemeSetting);
          map('enable_kot_print', setEnableKotPrint);
          map('store_timing', setStoreTiming);
          map('backup_frequency', setBackupFreq);
        }
      } catch (err) {
        setError('Error pulling settings');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [restaurantId, token, apiUrl]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const payload = {
      settings: [
        { key: 'tax_percentage', value: taxRate, type: 'NUMBER' },
        { key: 'currency', value: currency, type: 'STRING' },
        { key: 'theme', value: themeSetting, type: 'STRING' },
        { key: 'enable_kot_print', value: enableKotPrint, type: 'BOOLEAN' },
        { key: 'store_timing', value: storeTiming, type: 'STRING' },
        { key: 'backup_frequency', value: backupFreq, type: 'STRING' },
      ],
    };

    try {
      const res = await fetch(`${apiUrl}/settings/restaurant/${restaurantId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Settings write failed');

      setSuccess('Configurations saved successfully!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError(err.message || 'Error updating config');
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-400">Loading Configuration Console...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">System Settings</h1>
        <p className="text-slate-400 text-sm mt-0.5">Manage operational thresholds, tax calculations, hardware interfaces, and backups</p>
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

      <form onSubmit={handleSave} className="grid lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Category tabs */}
        <div className="lg:col-span-4 p-4 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur flex flex-col gap-2.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveSubTab('GENERAL')}
            className={`w-full p-3 rounded-lg text-left transition ${
              activeSubTab === 'GENERAL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            Business & Store Timing
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('TAX')}
            className={`w-full p-3 rounded-lg text-left transition ${
              activeSubTab === 'TAX' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            Taxes & GST Parameters
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('POS')}
            className={`w-full p-3 rounded-lg text-left transition ${
              activeSubTab === 'POS' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
            }`}
          >
            POS Printer & Backups
          </button>
        </div>

        {/* Right Side: Form inputs */}
        <div className="lg:col-span-8 p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-850 pb-3">
            <Sliders className="h-5 w-5 text-indigo-400" />
            <h3 className="font-bold text-white uppercase text-xs tracking-wider">
              {activeSubTab === 'GENERAL' ? 'Business parameters' : activeSubTab === 'TAX' ? 'GST configurations' : 'POS peripheral setup'}
            </h3>
          </div>

          {activeSubTab === 'GENERAL' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Operational Timings</label>
                <input
                  type="text"
                  value={storeTiming}
                  onChange={(e) => setStoreTiming(e.target.value)}
                  placeholder="e.g. 11:00 AM - 11:00 PM"
                  className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Currency Code</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full text-xs bg-slate-950 border border-slate-855 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="USD">United States Dollar ($)</option>
                  <option value="INR">Indian Rupee (₹)</option>
                  <option value="EUR">Euro (€)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Interface Theme</label>
                <select
                  value={themeSetting}
                  onChange={(e) => setThemeSetting(e.target.value)}
                  className="w-full text-xs bg-slate-950 border border-slate-855 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="dark">Dark Theme (Recommended)</option>
                  <option value="light">Light Theme</option>
                </select>
              </div>
            </div>
          )}

          {activeSubTab === 'TAX' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">VAT / GST Percentage (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  placeholder="5.0"
                  className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-850 text-[10px] text-slate-500 flex gap-2">
                <ShieldCheck className="h-4.5 w-4.5 text-slate-400 shrink-0" />
                <span>GST parameters set here apply automatically to all checkout invoices processed at POS terminals. Modifications will write directly to audit trails.</span>
              </div>
            </div>
          )}

          {activeSubTab === 'POS' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">KOT Auto-Print Receipt</label>
                <select
                  value={enableKotPrint}
                  onChange={(e) => setEnableKotPrint(e.target.value)}
                  className="w-full text-xs bg-slate-950 border border-slate-855 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="true">Enable Simulator Printing</option>
                  <option value="false">Disable Simulation</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Database Backup Schedule</label>
                <select
                  value={backupFreq}
                  onChange={(e) => setBackupFreq(e.target.value)}
                  className="w-full text-xs bg-slate-950 border border-slate-855 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="daily">Daily Cron Backups</option>
                  <option value="weekly">Weekly Backups</option>
                  <option value="monthly">Monthly Archives</option>
                </select>
              </div>
            </div>
          )}

          {/* Action footer */}
          <div className="border-t border-slate-850 pt-4 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-505 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow shadow-indigo-600/10"
            >
              <Save className="h-4 w-4" /> Save Settings
            </button>
          </div>
        </div>

      </form>
    </div>
  );
}
