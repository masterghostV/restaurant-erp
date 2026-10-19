'use client';

import { useState } from 'react';
import { Mail, ChefHat, ShieldAlert, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${apiUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) throw new Error('Something went wrong. Please try again.');

      const data = await res.json();
      setSubmitted(true);
      // Only present in development builds where no email provider is
      // configured — see the backend's forgotPassword() for details.
      if (data.devOnlyResetToken) setDevToken(data.devOnlyResetToken);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-slate-950">
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-violet-600/20 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-indigo-600/20 blur-3xl" />

      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl shadow-2xl p-8 md:p-10 z-10">
        <div className="flex items-center gap-2 mb-6">
          <ChefHat className="h-7 w-7 text-indigo-400" />
          <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Surya Dhosa
          </span>
        </div>

        <h2 className="text-2xl font-bold tracking-tight text-white">Forgot Password</h2>
        <p className="text-slate-400 text-sm mt-1 mb-6">
          Enter your account email and we&apos;ll send you a reset link.
        </p>

        {error && (
          <div className="flex items-center gap-2.5 p-3.5 mb-4 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 text-xs font-medium">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {submitted ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 p-3.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-medium">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>If an account with that email exists, a reset link has been generated.</span>
            </div>

            {devToken && (
              <div className="p-3.5 rounded-lg border border-amber-500/20 bg-amber-500/10 text-xs text-amber-300 space-y-2">
                <p className="font-semibold">Development mode — no email provider configured yet</p>
                <p className="text-amber-300/80">
                  Since there&apos;s no email service wired up, use this link directly to continue testing:
                </p>
                <a
                  href={`/reset-password?token=${devToken}`}
                  className="block break-all underline text-amber-200 hover:text-white"
                >
                  {`${typeof window !== 'undefined' ? window.location.origin : ''}/reset-password?token=${devToken}`}
                </a>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="name@restaurant.com"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-medium text-sm text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-slate-400 mt-6">
          Remembered your password?{' '}
          <a href="/login" className="text-indigo-400 hover:text-indigo-300 font-semibold transition">
            Sign in
          </a>
        </p>
      </div>

      <a
        href="/"
        className="absolute top-4 left-4 z-10 text-xs font-medium text-slate-400 hover:text-white transition"
      >
        ← Back to home
      </a>
    </div>
  );
}
