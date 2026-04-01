import React, { useState, useEffect } from 'react';
import { agentLogin, getCurrentAgent } from '../services/agentService';
import { Mail, Lock, Loader, AlertCircle, Ticket } from 'lucide-react';

export const AgentLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If already logged in, go straight to store
  useEffect(() => {
    if (getCurrentAgent()) {
      window.location.href = '/agent/store';
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await agentLogin(email, password);
      window.location.href = '/agent/store';
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-950 via-teal-900 to-gray-900 flex items-center justify-center p-4">
      {/* Background subtle pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo / Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-600/30 border border-teal-500/40 rounded-2xl mb-4 backdrop-blur-sm">
            <Ticket size={32} className="text-teal-300" />
          </div>
          <h1 className="text-white font-extrabold text-2xl tracking-tight">GGP Agent Portal</h1>
          <p className="text-teal-400 text-sm mt-1">Purchase vouchers on behalf of your clients</p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
          <h2 className="text-white font-bold text-lg mb-6">Agent Sign In</h2>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block text-teal-300 text-xs font-bold uppercase tracking-wide mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  id="agent-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoComplete="email"
                  className="w-full pl-11 pr-4 py-3.5 bg-white rounded-xl text-gray-900 font-medium outline-none border-2 border-transparent focus:border-teal-400 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-teal-300 text-xs font-bold uppercase tracking-wide mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  id="agent-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-11 pr-4 py-3.5 bg-white rounded-xl text-gray-900 font-medium outline-none border-2 border-transparent focus:border-teal-400 transition-all"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-red-500/20 border border-red-400/40 rounded-xl p-3 text-red-200 text-sm font-medium">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              id="agent-login-btn"
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed text-white font-extrabold py-4 rounded-xl text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/30 mt-2"
            >
              {loading ? (
                <><Loader size={18} className="animate-spin" /> Signing in...</>
              ) : (
                'Sign In to Agent Portal'
              )}
            </button>
          </form>
        </div>

        {/* Footer note */}
        <p className="text-center text-teal-500 text-xs mt-6">
          Don't have an agent account? Contact GGP to get access.
        </p>
        <p className="text-center mt-3">
          <a href="/store" className="text-teal-400/60 text-xs hover:text-teal-400 transition-colors">
            ← Back to Public Store
          </a>
        </p>
      </div>
    </div>
  );
};
