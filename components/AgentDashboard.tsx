import React, { useState, useEffect, useMemo } from 'react';
import { fetchVouchersByAgent, fetchSettings } from '../services/voucherService';
import { getCurrentAgent, agentLogout } from '../services/agentService';
import { Voucher, VoucherStatus } from '../types';
import {
  Ticket, LogOut, ShoppingCart, LayoutDashboard, Loader, RefreshCw, Search,
  CheckCircle, Clock, XCircle, AlertTriangle, Mail, Phone, User,
  Tag, Calendar, MessageSquare, Send, RotateCcw, ChevronDown, ChevronUp,
  Filter, Download
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<VoucherStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  [VoucherStatus.ACTIVE]: { label: 'Active', color: '#065f46', bg: '#d1fae5', icon: <CheckCircle size={13} /> },
  [VoucherStatus.REDEEMED]: { label: 'Redeemed', color: '#5b21b6', bg: '#ede9fe', icon: <CheckCircle size={13} /> },
  [VoucherStatus.EXPIRED]: { label: 'Expired', color: '#991b1b', bg: '#fee2e2', icon: <XCircle size={13} /> },
  [VoucherStatus.PENDING_PAYMENT]: { label: 'Pending', color: '#92400e', bg: '#fef3c7', icon: <Clock size={13} /> },
};

const statusBadge = (status: VoucherStatus) => {
  const s = STATUS_MAP[status] || STATUS_MAP[VoucherStatus.ACTIVE];
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700 }}>
      {s.icon} {s.label}
    </span>
  );
};

const formatDate = (iso?: string) => {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatDateTime = (iso?: string) => {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Group vouchers by order (chipinPurchaseId) — then sort groups by newest first
function groupByOrder(vouchers: Voucher[]): { purchaseId: string; date: string; vouchers: Voucher[] }[] {
  const groups: Record<string, Voucher[]> = {};
  for (const v of vouchers) {
    const key = v.chipinPurchaseId || v.id; // fallback: each voucher is its own group
    if (!groups[key]) groups[key] = [];
    groups[key].push(v);
  }
  return Object.entries(groups).map(([purchaseId, vs]) => ({
    purchaseId,
    date: vs[0].dates?.soldAt || '',
    vouchers: vs.sort((a, b) => (a.clientName || '').localeCompare(b.clientName || '')),
  })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export const AgentDashboard: React.FC = () => {
  const agent = getCurrentAgent();
  useEffect(() => { if (!agent) window.location.href = '/agent'; }, []);
  if (!agent) return null;

  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<VoucherStatus | 'all'>('all');
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [resending, setResending] = useState<Record<string, boolean>>({});
  const { toasts, show } = useToast();

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const data = await fetchVouchersByAgent(agent.id);
      setVouchers(data);
      // Auto-expand the most recent order
      const groups = groupByOrder(data);
      if (groups.length > 0 && !Object.keys(expandedOrders).length) {
        setExpandedOrders({ [groups[0].purchaseId]: true });
      }
    } catch (e: any) {
      show('Failed to load orders: ' + e.message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const allGroups = useMemo(() => groupByOrder(vouchers), [vouchers]);

  // Filter across groups
  const filteredGroups = useMemo(() => {
    const term = search.toLowerCase().trim();
    return allGroups.map(group => ({
      ...group,
      vouchers: group.vouchers.filter(v => {
        const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
        const matchesSearch = !term || [
          v.clientName, v.email, v.voucherCode, v.voucherDetails?.name, v.clientMessage
        ].some(s => s?.toLowerCase().includes(term));
        return matchesStatus && matchesSearch;
      })
    })).filter(g => g.vouchers.length > 0);
  }, [allGroups, search, statusFilter]);

  const toggleOrder = (purchaseId: string) =>
    setExpandedOrders(p => ({ ...p, [purchaseId]: !p[purchaseId] }));

  const handleResend = async (voucher: Voucher) => {
    const key = voucher.id;
    if (resending[key]) return;
    if (voucher.status === VoucherStatus.PENDING_PAYMENT) {
      show('Voucher is pending payment — cannot resend yet.', 'error');
      return;
    }
    setResending(p => ({ ...p, [key]: true }));
    try {
      const res = await fetch('/api/resend-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voucherId: voucher.id, agentId: agent.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to resend');
      show(`✅ Voucher ${voucher.voucherCode} resent to ${voucher.email}`);
    } catch (e: any) {
      show(e.message || 'Failed to resend', 'error');
    } finally {
      setResending(p => ({ ...p, [key]: false }));
    }
  };

  // Summary stats
  const stats = useMemo(() => ({
    total: vouchers.length,
    active: vouchers.filter(v => v.status === VoucherStatus.ACTIVE).length,
    redeemed: vouchers.filter(v => v.status === VoucherStatus.REDEEMED).length,
    pending: vouchers.filter(v => v.status === VoucherStatus.PENDING_PAYMENT).length,
    revenue: vouchers
      .filter(v => [VoucherStatus.ACTIVE, VoucherStatus.REDEEMED].includes(v.status))
      .reduce((s, v) => s + (v.voucherDetails?.value || 0), 0),
    clients: new Set(vouchers.map(v => v.email).filter(Boolean)).size,
  }), [vouchers]);

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-950 via-teal-900 to-gray-900">

      {/* ── TOAST NOTIFICATIONS ── */}
      <div className="fixed top-4 right-4 z-50 space-y-2" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-xl text-sm font-bold shadow-xl animate-in slide-in-from-right duration-300 max-w-sm ${
            t.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── TOP BAR ── */}
      <div className="bg-teal-900/90 backdrop-blur-sm border-b border-teal-700/60 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div>
            <h1 className="text-white font-extrabold text-lg tracking-tight flex items-center gap-2">
              <Ticket size={20} className="text-teal-300" /> GGP Agent Portal
            </h1>
            <p className="text-teal-400 text-xs">
              {agent.fullName} · <span className="font-mono">{agent.agentCode}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/agent/store"
              className="flex items-center gap-1.5 text-teal-300 hover:text-white text-xs font-bold transition-colors px-3 py-2 rounded-lg hover:bg-white/10">
              <ShoppingCart size={14} /> Buy Vouchers
            </a>
            <a href="/agent/profile"
              className="flex items-center gap-1.5 text-teal-300 hover:text-white text-xs font-bold transition-colors px-3 py-2 rounded-lg hover:bg-white/10">
              <span>👤</span> Profile
            </a>
            <button
              onClick={() => { agentLogout(); window.location.href = '/agent'; }}
              className="flex items-center gap-1.5 text-teal-400 hover:text-white text-xs font-bold transition-colors px-3 py-2 rounded-lg hover:bg-white/10"
            >
              <LogOut size={14} /> Sign Out
            </button>
          </div>
        </div>
        {/* Sub nav */}
        <div className="max-w-6xl mx-auto px-4 pb-3 flex items-center gap-4 text-xs font-bold">
          <a href="/agent/store" className="text-teal-400 hover:text-white transition-colors flex items-center gap-1.5">
            <ShoppingCart size={13} /> Store
          </a>
          <span className="text-teal-600">·</span>
          <span className="text-white flex items-center gap-1.5 border-b-2 border-emerald-400 pb-1">
            <LayoutDashboard size={13} /> My Orders
          </span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* ── PAGE HEADER ── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-white font-extrabold text-2xl">My Orders</h2>
            <p className="text-teal-400 text-sm mt-1">All vouchers purchased for your clients</p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
          >
            <RotateCcw size={15} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          {[
            { label: 'Total Vouchers', value: stats.total, color: 'text-white' },
            { label: 'Active', value: stats.active, color: 'text-emerald-400' },
            { label: 'Redeemed', value: stats.redeemed, color: 'text-purple-400' },
            { label: 'Pending', value: stats.pending, color: 'text-amber-400' },
            { label: 'Unique Clients', value: stats.clients, color: 'text-teal-300' },
            { label: 'Total Gifted', value: `RM${stats.revenue.toFixed(0)}`, color: 'text-emerald-400' },
          ].map(s => (
            <div key={s.label} className="bg-white/10 backdrop-blur border border-white/20 rounded-xl p-4 text-center">
              <div className={`font-extrabold text-2xl ${s.color}`}>{s.value}</div>
              <div className="text-teal-400 text-xs mt-1 font-medium">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── FILTERS ── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 text-gray-400" size={16} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by client name, email, voucher code..."
              className="w-full pl-9 pr-4 py-2.5 bg-white/10 border border-white/20 text-white placeholder-teal-400 rounded-xl text-sm outline-none focus:border-teal-400 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-gray-400 hover:text-white">
                <XCircle size={15} />
              </button>
            )}
          </div>

          {/* Status filter */}
          <div className="flex gap-2 flex-wrap">
            {(['all', VoucherStatus.ACTIVE, VoucherStatus.REDEEMED, VoucherStatus.PENDING_PAYMENT, VoucherStatus.EXPIRED] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                  statusFilter === s
                    ? 'bg-emerald-500 border-emerald-400 text-white'
                    : 'bg-white/10 border-white/20 text-teal-300 hover:bg-white/20'
                }`}>
                {s === 'all' ? 'All' : STATUS_MAP[s]?.label ?? s}
              </button>
            ))}
          </div>
        </div>

        {/* ── ORDER LIST ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader size={36} className="text-teal-400 animate-spin" />
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="text-center py-20 text-teal-400">
            {allGroups.length === 0 ? (
              <>
                <ShoppingCart size={48} className="mx-auto mb-4 opacity-30" />
                <p className="font-bold text-lg text-white">No orders yet</p>
                <p className="text-sm mt-1 mb-6">Start gifting vouchers to your clients!</p>
                <a href="/agent/store"
                  className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold px-6 py-3 rounded-xl transition-all">
                  <ShoppingCart size={18} /> Browse Vouchers
                </a>
              </>
            ) : (
              <>
                <Search size={40} className="mx-auto mb-4 opacity-30" />
                <p className="font-bold">No orders match your search</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map(group => {
              const isOpen = expandedOrders[group.purchaseId] ?? false;
              const orderTotal = group.vouchers.reduce((s, v) => s + (v.voucherDetails?.value || 0), 0);
              const orderStatuses = [...new Set(group.vouchers.map(v => v.status))];
              const isPending = orderStatuses.every(s => s === VoucherStatus.PENDING_PAYMENT);

              return (
                <div key={group.purchaseId} className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl overflow-hidden">
                  {/* Order header (always visible) */}
                  <button
                    onClick={() => toggleOrder(group.purchaseId)}
                    className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-teal-700/60 border border-teal-600/40 flex items-center justify-center">
                        <Ticket size={18} className="text-teal-300" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-white font-extrabold text-sm">
                            {group.vouchers.length} Voucher{group.vouchers.length > 1 ? 's' : ''}
                          </span>
                          <span className="text-emerald-400 font-extrabold">RM{orderTotal.toFixed(2)}</span>
                          {isPending && (
                            <span className="bg-amber-400/20 border border-amber-400/30 text-amber-300 text-xs font-bold px-2 py-0.5 rounded-full">
                              ⏳ Pending Payment
                            </span>
                          )}
                        </div>
                        <div className="text-teal-400 text-xs mt-0.5">
                          {formatDateTime(group.date)}
                          {group.purchaseId !== group.vouchers[0]?.id && (
                            <span className="font-mono ml-2 text-teal-600">#{group.purchaseId.slice(-8)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="hidden sm:flex gap-1.5 flex-wrap justify-end">
                        {group.vouchers.slice(0, 3).map(v => (
                          <span key={v.id} className="text-xs text-teal-300 bg-white/10 px-2 py-0.5 rounded-md truncate max-w-[100px]">
                            {v.clientName}
                          </span>
                        ))}
                        {group.vouchers.length > 3 && (
                          <span className="text-xs text-teal-500">+{group.vouchers.length - 3} more</span>
                        )}
                      </div>
                      {isOpen ? <ChevronUp size={18} className="text-teal-400 shrink-0" /> : <ChevronDown size={18} className="text-teal-400 shrink-0" />}
                    </div>
                  </button>

                  {/* Expanded: voucher rows */}
                  {isOpen && (
                    <div className="border-t border-white/10">
                      {group.vouchers.map((v, idx) => (
                        <div key={v.id} className={`p-5 ${idx < group.vouchers.length - 1 ? 'border-b border-white/10' : ''}`}>
                          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                            {/* Left: client + voucher info */}
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-3 flex-wrap">
                                {statusBadge(v.status)}
                                <span className="font-mono text-xs text-teal-300 bg-white/10 px-2 py-1 rounded-lg tracking-widest">
                                  {v.voucherCode}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <Tag size={13} className="text-emerald-400 shrink-0" />
                                <span className="text-white font-bold text-sm">{v.voucherDetails?.name}</span>
                                <span className="text-emerald-400 font-extrabold text-sm">RM{v.voucherDetails?.value?.toFixed(2)}</span>
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-teal-200 text-xs">
                                  <User size={12} className="text-teal-400" />
                                  <span className="font-bold">{v.clientName}</span>
                                </div>
                                <div className="flex items-center gap-2 text-teal-200 text-xs">
                                  <Mail size={12} className="text-teal-400" />
                                  <span>{v.email}</span>
                                </div>
                                {v.phoneNumber && (
                                  <div className="flex items-center gap-2 text-teal-200 text-xs">
                                    <Phone size={12} className="text-teal-400" />
                                    <span>{v.phoneNumber}</span>
                                  </div>
                                )}
                                {v.clientMessage && (
                                  <div className="flex items-start gap-2 mt-2 bg-white/5 border border-white/10 rounded-lg p-2">
                                    <MessageSquare size={11} className="text-teal-400 shrink-0 mt-0.5" />
                                    <span className="text-teal-200 text-xs italic">"{v.clientMessage}"</span>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-4 text-xs text-teal-500 flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Calendar size={11} /> Sold: {formatDate(v.dates?.soldAt)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <AlertTriangle size={11} /> Expires: {formatDate(v.dates?.expiryDate)}
                                </span>
                                {v.status === VoucherStatus.REDEEMED && v.dates?.redemptionDate && (
                                  <span className="flex items-center gap-1 text-purple-400">
                                    <CheckCircle size={11} /> Redeemed: {formatDate(v.dates.redemptionDate)}
                                    {v.redemption?.branchName && ` @ ${v.redemption.branchName}`}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex flex-row sm:flex-col gap-2 shrink-0">
                              <a
                                href={`/voucher/${v.voucherCode}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all"
                              >
                                <Ticket size={13} /> View
                              </a>
                              {v.status !== VoucherStatus.PENDING_PAYMENT && (
                                <button
                                  onClick={() => handleResend(v)}
                                  disabled={!!resending[v.id]}
                                  title={`Resend voucher email to ${v.email}`}
                                  className="flex items-center gap-1.5 bg-teal-700/50 hover:bg-teal-600/70 disabled:opacity-50 border border-teal-500/40 text-teal-200 hover:text-white px-3 py-2 rounded-lg text-xs font-bold transition-all"
                                >
                                  {resending[v.id]
                                    ? <><Loader size={12} className="animate-spin" /> Sending...</>
                                    : <><Send size={13} /> Resend</>
                                  }
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
