import React, { useState } from 'react';
import { getCurrentAgent, agentLogout, updateAgent } from '../services/agentService';
import {
  Ticket, LogOut, ShoppingCart, LayoutDashboard, User, Mail, Phone,
  Building2, Hash, Shield, Save, Eye, EyeOff, CheckCircle, AlertCircle, KeyRound
} from 'lucide-react';

// ─── Toast ────────────────────────────────────────────────────────────────────
interface Toast { id: number; msg: string; type: 'success' | 'error' }
const useToast = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = (msg: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  };
  return { toasts, show };
};

// ─── Field display helper ─────────────────────────────────────────────────────
const InfoRow: React.FC<{
  icon: React.ReactNode; label: string; value?: string; mono?: boolean; accent?: boolean;
}> = ({ icon, label, value, mono, accent }) => (
  <div className="flex items-start gap-3 py-3 border-b border-white/10 last:border-none">
    <div className="text-teal-400 mt-0.5 shrink-0">{icon}</div>
    <div className="flex-1">
      <p className="text-teal-400 text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className={`mt-0.5 font-bold ${mono ? 'font-mono tracking-widest' : ''} ${accent ? 'text-emerald-400 text-lg' : 'text-white'}`}>
        {value || <span className="text-teal-600 font-normal italic">Not set</span>}
      </p>
    </div>
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────
export const AgentProfile: React.FC = () => {
  const agent = getCurrentAgent();
  /* redirect if not logged in */
  if (!agent) { window.location.href = '/agent'; return null; }

  const [saving, setSaving] = useState(false);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const { toasts, show } = useToast();

  const handleChangePassword = async () => {
    if (!currentPwd) return show('Please enter your current password.', 'error');
    if (!newPwd || newPwd.length < 6) return show('New password must be at least 6 characters.', 'error');
    if (newPwd !== confirmPwd) return show('New passwords do not match.', 'error');

    setSaving(true);
    try {
      await updateAgent(agent, currentPwd, newPwd);
      show('✅ Password updated successfully!');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (e: any) {
      show(e.message || 'Failed to update password.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full bg-white/10 border border-white/20 text-white placeholder-teal-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-teal-400 transition-colors";

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-950 via-teal-900 to-gray-900">

      {/* ── TOASTS ── */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-xl text-sm font-bold shadow-xl flex items-center gap-2 max-w-sm animate-in slide-in-from-right duration-300 ${
            t.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {t.type === 'success' ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── TOP BAR ── */}
      <div className="bg-teal-900/90 backdrop-blur-sm border-b border-teal-700/60 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div>
            <h1 className="text-white font-extrabold text-lg tracking-tight flex items-center gap-2">
              <Ticket size={20} className="text-teal-300" /> GGP Agent Portal
            </h1>
            <p className="text-teal-400 text-xs">
              {agent.fullName} · <span className="font-mono">{agent.agentCode}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/agent/store" className="flex items-center gap-1.5 text-teal-300 hover:text-white text-xs font-bold transition-colors px-3 py-2 rounded-lg hover:bg-white/10">
              <ShoppingCart size={14}/> Store
            </a>
            <a href="/agent/dashboard" className="flex items-center gap-1.5 text-teal-300 hover:text-white text-xs font-bold transition-colors px-3 py-2 rounded-lg hover:bg-white/10">
              <LayoutDashboard size={14}/> My Orders
            </a>
            <button onClick={() => { agentLogout(); window.location.href = '/agent'; }}
              className="flex items-center gap-1.5 text-teal-400 hover:text-white text-xs font-bold transition-colors px-3 py-2 rounded-lg hover:bg-white/10">
              <LogOut size={14}/> Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* ─── LEFT: Agent Info Card ─── */}
        <div>
          <h2 className="text-white font-extrabold text-xl mb-6 flex items-center gap-2">
            <User size={20} className="text-teal-400" /> My Profile
          </h2>

          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl overflow-hidden">
            {/* Avatar header */}
            <div className="bg-gradient-to-br from-teal-700 to-teal-900 p-8 text-center border-b border-white/10">
              <div className="w-20 h-20 rounded-full bg-emerald-400/20 border-2 border-emerald-400/60 flex items-center justify-center text-emerald-400 font-extrabold text-3xl mx-auto mb-3">
                {agent.fullName.charAt(0).toUpperCase()}
              </div>
              <p className="text-white font-extrabold text-xl">{agent.fullName}</p>
              {agent.companyName && (
                <p className="text-teal-300 text-sm mt-0.5">{agent.companyName}</p>
              )}
              <div className="mt-3 inline-flex items-center gap-2 bg-emerald-900/50 border border-emerald-500/40 text-emerald-300 px-4 py-1.5 rounded-full text-sm font-bold">
                <Shield size={13}/> Agent
              </div>
            </div>

            {/* Info rows */}
            <div className="p-6">
              <InfoRow icon={<Hash size={15}/>} label="Agent Code" value={agent.agentCode} mono accent />
              <InfoRow icon={<Mail size={15}/>} label="Email Address" value={agent.email} />
              {agent.phone && <InfoRow icon={<Phone size={15}/>} label="Phone" value={agent.phone} />}
              {agent.companyName && <InfoRow icon={<Building2 size={15}/>} label="Company" value={agent.companyName} />}
              <InfoRow
                icon={<CheckCircle size={15}/>}
                label="Account Status"
                value={agent.status === 'active' ? '✅ Active' : '🚫 Suspended'}
              />
            </div>
          </div>

          {/* Quick link */}
          <div className="mt-4 bg-teal-900/50 border border-teal-700/40 rounded-xl p-4">
            <p className="text-teal-300 text-xs font-medium">Your Agent Login URL</p>
            <p className="text-white text-sm font-mono mt-1 break-all">
              {window.location.origin}/agent
            </p>
          </div>
        </div>

        {/* ─── RIGHT: Change Password ─── */}
        <div>
          <h2 className="text-white font-extrabold text-xl mb-6 flex items-center gap-2">
            <KeyRound size={20} className="text-teal-400" /> Change Password
          </h2>

          <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-6 space-y-5">
            <p className="text-teal-400 text-sm">For security, enter your current password before setting a new one.</p>

            {/* Current Password */}
            <div>
              <label className="block text-xs font-bold text-teal-300 uppercase tracking-wide mb-2">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrentPwd ? 'text' : 'password'}
                  value={currentPwd}
                  onChange={e => setCurrentPwd(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPwd(p => !p)}
                  className="absolute right-3 top-3 text-teal-400 hover:text-white transition-colors"
                >
                  {showCurrentPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-xs font-bold text-teal-300 uppercase tracking-wide mb-2">New Password</label>
              <div className="relative">
                <input
                  type={showNewPwd ? 'text' : 'password'}
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  className={inputClass}
                  placeholder="Min. 6 characters"
                />
                <button type="button" onClick={() => setShowNewPwd(p => !p)}
                  className="absolute right-3 top-3 text-teal-400 hover:text-white transition-colors">
                  {showNewPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
              {/* Strength meter */}
              {newPwd && (
                <div className="mt-2 flex gap-1">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                      i < (newPwd.length >= 12 ? 4 : newPwd.length >= 8 ? 3 : newPwd.length >= 6 ? 2 : 1)
                        ? 'bg-emerald-500' : 'bg-white/20'
                    }`} />
                  ))}
                  <span className="text-xs text-teal-400 ml-2">
                    {newPwd.length >= 12 ? 'Strong' : newPwd.length >= 8 ? 'Good' : newPwd.length >= 6 ? 'Weak' : 'Too short'}
                  </span>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-bold text-teal-300 uppercase tracking-wide mb-2">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirmPwd ? 'text' : 'password'}
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  className={`${inputClass} ${confirmPwd && (confirmPwd !== newPwd ? 'border-red-500' : 'border-emerald-500')}`}
                  placeholder="Repeat new password"
                />
                <button type="button" onClick={() => setShowConfirmPwd(p => !p)}
                  className="absolute right-3 top-3 text-teal-400 hover:text-white transition-colors">
                  {showConfirmPwd ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
                {confirmPwd && confirmPwd === newPwd && (
                  <CheckCircle size={16} className="absolute right-9 top-3.5 text-emerald-400" />
                )}
              </div>
            </div>

            <button
              onClick={handleChangePassword}
              disabled={saving || !currentPwd || !newPwd || !confirmPwd}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              {saving
                ? <><span className="animate-spin text-lg">⏳</span> Updating...</>
                : <><Save size={18}/> Update Password</>
              }
            </button>
          </div>

          {/* Security note */}
          <div className="mt-4 bg-amber-900/30 border border-amber-600/30 rounded-xl p-4">
            <p className="text-amber-300 text-xs font-bold flex items-center gap-2">
              <Shield size={13}/> Security Reminder
            </p>
            <p className="text-amber-400/80 text-xs mt-1">
              Never share your password. Use a combination of letters, numbers, and symbols for best security.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
