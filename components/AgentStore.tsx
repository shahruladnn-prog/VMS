import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchTemplates, generateVoucherCode, createBatchVouchers, validatePromoCode } from '../services/voucherService';
import { createChipinPurchase } from '../services/chipinService';
import { getCurrentAgent, agentLogout } from '../services/agentService';
import { VoucherTemplate, Voucher, VoucherStatus, PromoCode } from '../types';
import {
  ShoppingCart, Plus, Minus, Tag, ChevronRight, Loader, Mail, Phone,
  User, Info, X, CheckCircle, Ticket, AlertCircle, LogOut, MessageSquare,
  ChevronLeft, Eye, Download, Upload, FileText
} from 'lucide-react';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
interface CartItem {
  templateId: string;
  name: string;
  value: number;
  category: string;
  terms: string;
  image?: string;
  defaultExpiryDate?: string;
  quantity: number;
}

// One slot per physical voucher — agent fills in client details for each
interface ClientSlot {
  key: string;          // unique identifier: `${templateId}-${slotIndex}`
  templateId: string;
  voucherName: string;
  voucherValue: number;
  terms: string;
  image?: string;
  defaultExpiryDate?: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientMessage: string;
}

// ─────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────
/** Synchronise client slots when cart changes — preserve already-filled data */
function syncSlots(prev: ClientSlot[], cartItems: CartItem[]): ClientSlot[] {
  const desired: ClientSlot[] = [];
  cartItems.forEach(item => {
    for (let i = 0; i < item.quantity; i++) {
      const key = `${item.templateId}-${i}`;
      const existing = prev.find(s => s.key === key);
      desired.push(existing ?? {
        key,
        templateId: item.templateId,
        voucherName: item.name,
        voucherValue: item.value,
        terms: item.terms,
        image: item.image,
        defaultExpiryDate: item.defaultExpiryDate,
        clientName: '',
        clientEmail: '',
        clientPhone: '',
        clientMessage: '',
      });
    }
  });
  return desired;
}

// ─────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────
export const AgentStore: React.FC = () => {
  const agent = getCurrentAgent();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!agent) window.location.href = '/agent';
  }, []);

  if (!agent) return null;

  const [templates, setTemplates] = useState<VoucherTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [clientSlots, setClientSlots] = useState<ClientSlot[]>([]);
  const [step, setStep] = useState<'browse' | 'clients' | 'review'>('browse');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedVoucher, setSelectedVoucher] = useState<VoucherTemplate | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

  // Promo code
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null);
  const [promoStatus, setPromoStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [promoMessage, setPromoMessage] = useState('');
  const [csvError, setCsvError] = useState('');
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTemplates(true).then(all => { setTemplates(all); setLoading(false); });
  }, []);

  const cartItems: CartItem[] = useMemo(() =>
    templates
      .filter(t => (cart[t.id] || 0) > 0)
      .map(t => ({ templateId: t.id, name: t.name, value: t.value, category: t.category, terms: t.terms, image: t.image, defaultExpiryDate: t.defaultExpiryDate, quantity: cart[t.id] })),
    [templates, cart]
  );

  const cartTotal = cartItems.reduce((s, i) => s + i.value * i.quantity, 0);
  const totalItems = cartItems.reduce((s, i) => s + i.quantity, 0);

  const discountAmount = useMemo(() => {
    if (!appliedPromo) return 0;
    if (appliedPromo.discountType === 'percentage') return Math.round(cartTotal * appliedPromo.discountValue / 100 * 100) / 100;
    return Math.min(appliedPromo.discountValue, cartTotal);
  }, [appliedPromo, cartTotal]);

  const finalTotal = Math.max(0, cartTotal - discountAmount);

  const updateCart = (templateId: string, delta: number) => {
    setCart(prev => {
      const newQty = Math.max(0, (prev[templateId] || 0) + delta);
      return { ...prev, [templateId]: newQty };
    });
  };

  // Keep slots in sync whenever cart changes
  useEffect(() => {
    setClientSlots(prev => syncSlots(prev, cartItems));
  }, [JSON.stringify(cartItems.map(c => ({ id: c.templateId, qty: c.quantity })))]);

  const updateSlot = (key: string, field: keyof ClientSlot, value: string) => {
    setClientSlots(prev => prev.map(s => s.key === key ? { ...s, [field]: value } : s));
  };

  const handleApplyPromo = async () => {
    if (!promoInput.trim()) return;
    setPromoStatus('checking');
    const promo = await validatePromoCode(promoInput.trim(), cartTotal);
    if (promo) {
      setAppliedPromo(promo);
      setPromoStatus('valid');
      const disc = promo.discountType === 'percentage' ? `${promo.discountValue}%` : `RM${promo.discountValue}`;
      setPromoMessage(`✅ "${promo.label}" applied — ${disc} off!`);
    } else {
      setAppliedPromo(null);
      setPromoStatus('invalid');
      setPromoMessage('❌ Invalid or expired promo code.');
    }
  };

  // ── CSV Bulk Import ──────────────────────────────────────────────────────
  const downloadCsvTemplate = () => {
    const header = 'clientName,clientEmail,clientPhone,message';
    const examples = clientSlots.map(s =>
      `"${s.voucherName} Client",client@email.com,01X-XXXXXXX,"Happy Birthday!"`
    ).join('\n');
    const csv = `${header}\n${examples}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', 'client_import_template.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setCsvError('Please upload a .csv file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { setCsvError('CSV has no data rows.'); return; }

      // Parse header
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
      const nameIdx = headers.findIndex(h => h.includes('name'));
      const emailIdx = headers.findIndex(h => h.includes('email'));
      const phoneIdx = headers.findIndex(h => h.includes('phone'));
      const msgIdx = headers.findIndex(h => h.includes('message') || h.includes('msg'));

      if (nameIdx === -1 || emailIdx === -1) {
        setCsvError('CSV must have at least "clientName" and "clientEmail" columns.');
        return;
      }

      const parseCell = (cells: string[], idx: number) =>
        idx >= 0 ? (cells[idx] || '').replace(/^"|"$/g, '').trim() : '';

      // Map rows → slots (cap at number of slots)
      const dataRows = lines.slice(1);
      let filled = 0;
      setClientSlots(prev => {
        const updated = [...prev];
        dataRows.forEach((row, rowIdx) => {
          if (rowIdx >= updated.length) return;
          const cells = row.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
          updated[rowIdx] = {
            ...updated[rowIdx],
            clientName: parseCell(cells, nameIdx),
            clientEmail: parseCell(cells, emailIdx),
            clientPhone: parseCell(cells, phoneIdx),
            clientMessage: parseCell(cells, msgIdx),
          };
          filled++;
        });
        return updated;
      });

      const extra = dataRows.length > clientSlots.length ? dataRows.length - clientSlots.length : 0;
      if (extra > 0) {
        setCsvError(`Note: CSV had ${dataRows.length} rows but you only have ${clientSlots.length} voucher slot(s). Extra ${extra} rows were ignored.`);
      } else {
        setCsvError(`✅ Imported ${filled} client(s) from CSV successfully!`);
      }
    };
    reader.readAsText(file);
    // reset input so same file can be re-imported
    if (csvInputRef.current) csvInputRef.current.value = '';
  };
  // ── End CSV helpers ──────────────────────────────────────────────────────

  const handleGoToClients = () => {
    setError('');
    if (cartItems.length === 0) { setError('Please select at least one voucher.'); return; }
    setStep('clients');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  };

  const handleGoToReview = () => {
    setError('');
    // Validate all slots have at minimum a client name and email
    const missing = clientSlots.findIndex(s => !s.clientName.trim() || !s.clientEmail.trim() || !s.clientEmail.includes('@'));
    if (missing !== -1) {
      setError(`Please fill in a valid name and email for voucher ${missing + 1}.`);
      document.getElementById(`slot-${clientSlots[missing].key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setStep('review');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  };

  const handleCheckout = async () => {
    setError('');
    setSubmitting(true);
    setShowTermsModal(false);

    try {
      const discountRatio = cartTotal > 0 ? finalTotal / cartTotal : 1;

      // Build codes list for Chip-in (one per slot)
      const chipinVouchers: { code: string; name: string; value: number }[] = [];
      const vouchersMeta: {
        slot: ClientSlot; code: string; discountedValue: number; expiryDate: string;
      }[] = [];

      clientSlots.forEach(slot => {
        const code = generateVoucherCode();
        const discountedValue = Math.round(slot.voucherValue * discountRatio * 100) / 100;
        const expiryDate = slot.defaultExpiryDate
          ? new Date(slot.defaultExpiryDate).toISOString()
          : new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString();

        chipinVouchers.push({ code, name: slot.voucherName, value: discountedValue });
        vouchersMeta.push({ slot, code, discountedValue, expiryDate });
      });

      // Step 1: Create Chip-in purchase (same API endpoint as public store)
      const result = await createChipinPurchase({
        customerEmail: agent.email,           // billing contact = agent
        customerName: agent.fullName,
        customerPhone: agent.phone || '',
        vouchers: chipinVouchers,
        type: 'online',
        successUrl: `${window.location.origin}/agent/store/success`,
        failureUrl: `${window.location.origin}/agent/store`,
      });

      if (!result.checkoutUrl) throw new Error('No checkout URL returned from payment gateway.');

      // Step 2: Save vouchers to Firestore — client email goes IN the voucher
      const vouchersToCreate: Voucher[] = vouchersMeta.map(meta => ({
        id: crypto.randomUUID(),
        voucherCode: meta.code,
        clientName: meta.slot.clientName,        // ← CLIENT name, not agent
        phoneNumber: meta.slot.clientPhone,
        email: meta.slot.clientEmail,             // ← CLIENT email — webhook sends here
        voucherDetails: {
          name: meta.slot.voucherName,
          category: templates.find(t => t.id === meta.slot.templateId)?.category || '',
          value: meta.slot.voucherValue,          // Original value for display
          terms: meta.slot.terms,
          image: meta.slot.image,
        },
        eventSource: 'Agent Portal',
        status: VoucherStatus.PENDING_PAYMENT,
        saleChannel: 'Agent',
        workflow: { salesPersonName: agent.fullName },
        dates: { soldAt: new Date().toISOString(), expiryDate: meta.expiryDate },
        financials: { paymentMethod: 'Online' },
        redemption: {},
        chipinPurchaseId: result.purchaseId,
        // Agent metadata (denormalised for webhook efficiency)
        isAgentOrder: true,
        agentId: agent.id,
        agentCode: agent.agentCode,
        agentName: agent.fullName,
        agentEmail: agent.email,                  // for BCC confirmation
        clientMessage: meta.slot.clientMessage || undefined,
      }));

      await createBatchVouchers(vouchersToCreate);

      // Step 3: Redirect to Chip-in
      window.location.href = result.checkoutUrl;

    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
      setSubmitting(false);
    }
  };

  const getYouTubeEmbedUrl = (url?: string) => {
    if (!url) return null;
    try {
      const urlObj = new URL(url);
      let videoId = '';
      if (urlObj.hostname.includes('youtube.com')) videoId = urlObj.searchParams.get('v') || urlObj.pathname.split('/')[2];
      else if (urlObj.hostname.includes('youtu.be')) videoId = urlObj.pathname.slice(1);
      if (videoId) return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
    } catch { }
    return null;
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-b from-teal-900 to-teal-700 flex items-center justify-center">
      <Loader className="text-white animate-spin" size={40} />
    </div>
  );

  // ════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-950 via-teal-900 to-gray-900">

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
          <div className="flex items-center gap-3">
            {totalItems > 0 && step === 'browse' && (
              <div className="bg-white/10 text-white px-4 py-2 rounded-full flex items-center gap-2 text-sm font-bold border border-white/20">
                <ShoppingCart size={15} />
                {totalItems} item{totalItems > 1 ? 's' : ''} · RM{cartTotal.toFixed(2)}
              </div>
            )}
            <a href="/agent/dashboard"
              className="flex items-center gap-1.5 text-teal-300 hover:text-white text-xs font-bold transition-colors px-3 py-2 rounded-lg hover:bg-white/10">
              <span>📋</span> My Orders
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

        {/* Step indicator */}
        <div className="max-w-6xl mx-auto px-4 pb-3 flex items-center gap-2 text-xs font-bold">
          {['browse', 'clients', 'review'].map((s, i) => (
            <React.Fragment key={s}>
              <span className={`px-3 py-1 rounded-full transition-all ${step === s ? 'bg-emerald-500 text-white' : 'text-teal-400'}`}>
                {i + 1}. {s === 'browse' ? 'Select Vouchers' : s === 'clients' ? 'Client Details' : 'Review & Pay'}
              </span>
              {i < 2 && <span className="text-teal-700">›</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* ══════════════════════════════════════
            STEP 1: BROWSE & ADD TO CART
        ══════════════════════════════════════ */}
        {step === 'browse' && (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left: Voucher Grid */}
            <div className="flex-1">
              <h2 className="text-white font-bold text-lg mb-4 uppercase tracking-wide">Available Vouchers</h2>
              {templates.length === 0 ? (
                <div className="text-center py-20 text-teal-300">No vouchers currently available.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {templates.map(t => {
                    const qty = cart[t.id] || 0;
                    return (
                      <div key={t.id}
                        className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl overflow-hidden hover:bg-white/15 transition-all cursor-pointer"
                        onClick={() => setSelectedVoucher(t)}>
                        {t.image ? (
                          <img src={t.image} alt={t.name} className="w-full h-40 object-cover" />
                        ) : (
                          <div className="w-full h-40 bg-gradient-to-br from-teal-700 to-teal-500 flex items-center justify-center">
                            <Tag size={48} className="text-white/40" />
                          </div>
                        )}
                        <div className="p-5">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h3 className="text-white font-extrabold text-lg leading-tight">{t.name}</h3>
                              <span className="text-teal-300 text-xs font-bold uppercase">{t.category}</span>
                            </div>
                            <div className="text-2xl font-extrabold text-emerald-400">RM{t.value}</div>
                          </div>
                          <p className="text-teal-200 text-xs mb-3 flex items-center gap-1">
                            <Info size={11} /> Click for details & terms
                          </p>
                          <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                            <button onClick={() => updateCart(t.id, -1)} disabled={qty === 0}
                              className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-30 text-white font-bold flex items-center justify-center transition-all">
                              <Minus size={16} />
                            </button>
                            <span className="text-white font-extrabold text-lg w-8 text-center">{qty}</span>
                            <button onClick={() => updateCart(t.id, 1)}
                              className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white font-bold flex items-center justify-center transition-all">
                              <Plus size={16} />
                            </button>
                            {qty > 0 && <span className="text-emerald-400 text-sm font-bold ml-auto">RM{(t.value * qty).toFixed(2)}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Cart Summary + Promo + CTA */}
            <div className="w-full lg:w-80 shrink-0">
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 sticky top-28">
                <h2 className="text-white font-bold text-base mb-4 uppercase tracking-wide">Order Summary</h2>

                {cartItems.length === 0 ? (
                  <div className="text-teal-400 text-sm text-center py-8">
                    <ShoppingCart size={32} className="mx-auto mb-3 opacity-40" />
                    No vouchers selected yet
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 mb-4">
                      {cartItems.map(item => (
                        <div key={item.templateId} className="flex justify-between text-sm text-white">
                          <span>{item.name} × {item.quantity}</span>
                          <span className="font-bold">RM{(item.value * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                      {appliedPromo && discountAmount > 0 && (
                        <div className="flex justify-between text-sm text-emerald-300 font-bold">
                          <span>Promo ({appliedPromo.code})</span>
                          <span>-RM{discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="border-t border-white/20 pt-2 flex justify-between font-extrabold text-white">
                        <span>TOTAL</span>
                        <span className="text-emerald-400">RM{finalTotal.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Promo code */}
                    <div className="mb-5">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={promoInput}
                          onChange={e => { setPromoInput(e.target.value); setPromoStatus('idle'); }}
                          placeholder="Agent promo code"
                          className="flex-1 px-3 py-2 bg-white/20 text-white placeholder-teal-300 border border-white/30 rounded-lg text-sm font-medium outline-none focus:border-teal-300"
                        />
                        <button
                          onClick={handleApplyPromo}
                          disabled={promoStatus === 'checking' || !promoInput.trim()}
                          className="px-3 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Ticket size={14} /> Apply
                        </button>
                      </div>
                      {promoMessage && (
                        <p className={`text-xs mt-1.5 font-bold ${promoStatus === 'valid' ? 'text-emerald-300' : 'text-red-300'}`}>{promoMessage}</p>
                      )}
                    </div>
                  </>
                )}

                {error && (
                  <div className="flex items-start gap-2 bg-red-500/20 border border-red-400/40 rounded-xl p-3 mb-4 text-red-200 text-sm font-medium">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" /> {error}
                  </div>
                )}

                <button
                  onClick={handleGoToClients}
                  disabled={cartItems.length === 0}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold py-4 rounded-xl text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/30"
                >
                  Next: Client Details <ChevronRight size={20} />
                </button>

                <p className="text-center text-teal-400 text-xs mt-3">
                  🎁 Each voucher will be emailed to your specified client
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════
            STEP 2: CLIENT DETAILS PER VOUCHER
        ══════════════════════════════════════ */}
        {step === 'clients' && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => { setStep('browse'); setError(''); }}
                className="text-teal-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg">
                <ChevronLeft size={20} />
              </button>
              <div>
                <h2 className="text-white font-extrabold text-xl">Client Details</h2>
                <p className="text-teal-400 text-sm">Fill in details for each voucher — voucher goes to the client, not you</p>
              </div>
            </div>

            {/* ── CSV Bulk Import toolbar ── */}
            <div className="flex flex-wrap items-center gap-3 mb-6 bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex-1">
                <p className="text-white font-bold text-sm flex items-center gap-2"><FileText size={14} className="text-teal-400" /> Bulk Import from CSV</p>
                <p className="text-teal-400 text-xs mt-0.5">Upload a CSV with columns: <span className="font-mono text-teal-300">clientName, clientEmail, clientPhone, message</span></p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={downloadCsvTemplate}
                  className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-teal-200 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                >
                  <Download size={13} /> Template
                </button>
                <label className="flex items-center gap-1.5 bg-teal-700/60 hover:bg-teal-600/80 border border-teal-500/40 text-white px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer">
                  <Upload size={13} /> Import CSV
                  <input
                    ref={csvInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleCsvImport}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
            {csvError && (
              <div className={`flex items-start gap-2 rounded-xl p-3 mb-4 text-sm font-medium border ${
                csvError.startsWith('✅')
                  ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                  : 'bg-amber-500/20 border-amber-400/40 text-amber-200'
              }`}>
                <AlertCircle size={15} className="shrink-0 mt-0.5" /> {csvError}
              </div>
            )}

            <div className="space-y-4 mb-6">
              {clientSlots.map((slot, idx) => (
                <div id={`slot-${slot.key}`} key={slot.key}
                  className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6">
                  {/* Slot header */}
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <span className="text-emerald-400 text-xs font-extrabold uppercase tracking-wide">
                        Voucher {idx + 1} of {clientSlots.length}
                      </span>
                      <h3 className="text-white font-extrabold text-base mt-0.5">{slot.voucherName}</h3>
                    </div>
                    <div className="text-emerald-400 font-extrabold text-lg">RM{slot.voucherValue}</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Client Name */}
                    <div>
                      <label className="block text-teal-300 text-xs font-bold uppercase mb-2">
                        Client Name *
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 text-gray-400" size={16} />
                        <input
                          type="text"
                          value={slot.clientName}
                          onChange={e => updateSlot(slot.key, 'clientName', e.target.value)}
                          placeholder="Client full name"
                          className="w-full pl-9 pr-3 py-2.5 bg-white rounded-xl border-2 border-transparent focus:border-teal-400 outline-none text-gray-900 font-medium text-sm"
                        />
                      </div>
                    </div>

                    {/* Client Email */}
                    <div>
                      <label className="block text-teal-300 text-xs font-bold uppercase mb-2">
                        Client Email * <span className="normal-case text-teal-500 font-normal">(voucher sent here)</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 text-gray-400" size={16} />
                        <input
                          type="email"
                          value={slot.clientEmail}
                          onChange={e => updateSlot(slot.key, 'clientEmail', e.target.value)}
                          placeholder="client@email.com"
                          className="w-full pl-9 pr-3 py-2.5 bg-white rounded-xl border-2 border-transparent focus:border-teal-400 outline-none text-gray-900 font-medium text-sm"
                        />
                      </div>
                    </div>

                    {/* Client Phone */}
                    <div>
                      <label className="block text-teal-300 text-xs font-bold uppercase mb-2">
                        Client Phone <span className="normal-case text-teal-500 font-normal">(optional)</span>
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-3 text-gray-400" size={16} />
                        <input
                          type="tel"
                          value={slot.clientPhone}
                          onChange={e => updateSlot(slot.key, 'clientPhone', e.target.value)}
                          placeholder="01X-XXXXXXX"
                          className="w-full pl-9 pr-3 py-2.5 bg-white rounded-xl border-2 border-transparent focus:border-teal-400 outline-none text-gray-900 font-medium text-sm"
                        />
                      </div>
                    </div>

                    {/* Personal Message */}
                    <div>
                      <label className="block text-teal-300 text-xs font-bold uppercase mb-2">
                        <span className="flex items-center gap-1">
                          <MessageSquare size={11} /> Personal Message <span className="normal-case text-teal-500 font-normal">(optional)</span>
                        </span>
                      </label>
                      <textarea
                        value={slot.clientMessage}
                        onChange={e => updateSlot(slot.key, 'clientMessage', e.target.value)}
                        placeholder="e.g. Happy Birthday! Enjoy your adventure 🎉"
                        rows={2}
                        className="w-full px-3 py-2.5 bg-white rounded-xl border-2 border-transparent focus:border-teal-400 outline-none text-gray-900 font-medium text-sm resize-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-500/20 border border-red-400/40 rounded-xl p-4 mb-4 text-red-200 text-sm font-medium">
                <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
              </div>
            )}

            <button
              onClick={handleGoToReview}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold py-4 rounded-xl text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/30"
            >
              Review Order <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════
            STEP 3: REVIEW & CHECKOUT
        ══════════════════════════════════════ */}
        {step === 'review' && (
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => { setStep('clients'); setError(''); }}
                className="text-teal-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-lg">
                <ChevronLeft size={20} />
              </button>
              <div>
                <h2 className="text-white font-extrabold text-xl">Review & Pay</h2>
                <p className="text-teal-400 text-sm">Confirm everything looks correct before payment</p>
              </div>
            </div>

            {/* Agent info banner */}
            <div className="bg-teal-800/40 border border-teal-600/40 rounded-xl p-4 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-600/50 flex items-center justify-center font-extrabold text-white text-sm border border-teal-500/50">
                {agent.fullName.charAt(0)}
              </div>
              <div>
                <p className="text-white font-bold text-sm">{agent.fullName}</p>
                <p className="text-teal-400 text-xs">{agent.agentCode} · {agent.email}</p>
              </div>
            </div>

            {/* Voucher summary */}
            <div className="space-y-3 mb-6">
              {clientSlots.map((slot, idx) => (
                <div key={slot.key} className="bg-white/10 border border-white/20 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white font-extrabold text-sm">{slot.voucherName}</span>
                    <span className="text-emerald-400 font-extrabold">RM{slot.voucherValue}</span>
                  </div>
                  <div className="space-y-1 text-xs text-teal-300">
                    <div className="flex items-center gap-2">
                      <User size={11} />
                      <span className="font-bold text-white">{slot.clientName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail size={11} />
                      <span>{slot.clientEmail}</span>
                    </div>
                    {slot.clientPhone && (
                      <div className="flex items-center gap-2"><Phone size={11} /><span>{slot.clientPhone}</span></div>
                    )}
                    {slot.clientMessage && (
                      <div className="flex items-start gap-2 mt-2 bg-white/10 rounded-lg p-2">
                        <MessageSquare size={11} className="shrink-0 mt-0.5" />
                        <span className="italic text-teal-200">"{slot.clientMessage}"</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="bg-white/10 border border-white/20 rounded-xl p-4 mb-6">
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-teal-300 mb-2">
                  <span>Subtotal</span>
                  <span>RM{cartTotal.toFixed(2)}</span>
                </div>
              )}
              {appliedPromo && discountAmount > 0 && (
                <div className="flex justify-between text-sm text-emerald-300 font-bold mb-2">
                  <span>Promo ({appliedPromo.code})</span>
                  <span>-RM{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-white text-lg">
                <span>TOTAL</span>
                <span className="text-emerald-400">RM{finalTotal.toFixed(2)}</span>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-500/20 border border-red-400/40 rounded-xl p-4 mb-4 text-red-200 text-sm font-medium">
                <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
              </div>
            )}

            <button
              onClick={() => { setTermsAgreed(false); setShowTermsModal(true); }}
              disabled={submitting}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-extrabold py-4 rounded-xl text-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/30"
            >
              {submitting ? <><Loader size={20} className="animate-spin" /> Processing...</> : <>Proceed to Payment <ChevronRight size={22} /></>}
            </button>
            <p className="text-center text-teal-400 text-xs mt-3">🔒 Secure payment via Chip-in · Client emails sent automatically after payment</p>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════
          VOUCHER DETAIL MODAL
      ══════════════════════════════════════ */}
      {selectedVoucher && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedVoucher(null)}>
          <div className="bg-gray-900 border border-teal-800/60 shadow-2xl rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-in zoom-in duration-200 scrollbar-hide"
            onClick={e => e.stopPropagation()}>
            {selectedVoucher.image ? (
              <div className="relative">
                <img src={selectedVoucher.image} alt={selectedVoucher.name} className="w-full max-h-[50vh] object-cover cursor-pointer" onClick={() => setFullScreenImage(selectedVoucher.image!)} />
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <button onClick={() => setFullScreenImage(selectedVoucher.image!)}
                    className="bg-black/80 border border-white/20 text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 backdrop-blur-md">
                    <Eye size={14} /> View Full
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full h-48 bg-gradient-to-br from-teal-800 to-teal-600 rounded-t-2xl flex items-center justify-center">
                <Tag size={64} className="text-white/20" />
              </div>
            )}
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-white font-extrabold text-xl">{selectedVoucher.name}</h2>
                  <span className="text-teal-300 text-xs font-bold uppercase">{selectedVoucher.category}</span>
                </div>
                <span className="text-emerald-400 font-extrabold text-2xl">RM{selectedVoucher.value}</span>
              </div>
              {selectedVoucher.defaultExpiryDate && (
                <div className="inline-flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-300 font-bold px-3 py-1.5 rounded-lg text-xs mb-4">
                  📅 Valid until: {selectedVoucher.defaultExpiryDate}
                </div>
              )}
              {selectedVoucher.highlights && (
                <div className="bg-teal-900/40 border border-teal-500/30 rounded-xl p-4 mb-4">
                  <h4 className="text-teal-300 text-xs font-extrabold uppercase tracking-widest mb-2">✨ Package Highlights</h4>
                  <ul className="text-teal-50 space-y-1.5 text-sm">
                    {selectedVoucher.highlights.split('\n').filter(h => h.trim()).map((h, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-teal-400 font-bold mt-0.5">•</span>
                        <span>{h.replace(/^[-*]\s/, '')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {getYouTubeEmbedUrl(selectedVoucher.videoUrl) && (
                <div className="mb-4 rounded-xl overflow-hidden border border-teal-800/50 bg-black aspect-video relative">
                  <iframe className="absolute inset-0 w-full h-full" src={getYouTubeEmbedUrl(selectedVoucher.videoUrl)!} title="Video" frameBorder="0" allowFullScreen />
                </div>
              )}
              {selectedVoucher.terms && (
                <div className="bg-black/30 border border-white/10 rounded-xl p-4 mb-4">
                  <h4 className="text-gray-400 text-xs font-extrabold uppercase tracking-widest mb-2">Terms & Conditions</h4>
                  <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{selectedVoucher.terms}</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setSelectedVoucher(null)}
                  className="flex-1 py-3 border-2 border-white/10 text-white rounded-xl font-bold hover:bg-white/10 transition-colors">
                  Close
                </button>
                <button onClick={() => { updateCart(selectedVoucher.id, 1); setSelectedVoucher(null); }}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-extrabold flex items-center justify-center gap-2">
                  <Plus size={18} /> Add to Cart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          TERMS MODAL
      ══════════════════════════════════════ */}
      {showTermsModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in duration-200 overflow-hidden">
            <div className="bg-teal-900 p-5 flex items-center gap-3">
              <CheckCircle className="text-teal-300" size={24} />
              <div>
                <h3 className="text-white font-extrabold text-lg">Confirm Your Order</h3>
                <p className="text-teal-300 text-xs">Please review before proceeding to payment</p>
              </div>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 space-y-2">
                <p className="font-bold text-gray-900">Agent Purchase Terms:</p>
                <ul className="list-disc pl-4 space-y-1 text-gray-600">
                  <li>Vouchers will be emailed directly to each client's email address as specified.</li>
                  <li>A confirmation copy will be sent to your registered agent email.</li>
                  <li>All purchases are final. Vouchers are non-refundable once payment is confirmed.</li>
                  <li>Your name (<strong>{agent.fullName}</strong>) will appear on each client's voucher email.</li>
                </ul>
              </div>
              <label className="flex items-start gap-3 cursor-pointer p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <input type="checkbox" checked={termsAgreed} onChange={e => setTermsAgreed(e.target.checked)}
                  className="w-5 h-5 accent-emerald-600 mt-0.5 cursor-pointer shrink-0" />
                <span className="text-sm font-bold text-emerald-900">
                  I confirm the client details above are correct and I agree to the terms.
                </span>
              </label>
            </div>
            <div className="p-5 flex gap-3 border-t bg-gray-50">
              <button onClick={() => setShowTermsModal(false)}
                className="flex-1 py-3 border border-gray-300 text-gray-600 rounded-xl font-bold hover:bg-gray-100 transition-colors">
                Go Back
              </button>
              <button onClick={handleCheckout} disabled={!termsAgreed}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold rounded-xl flex items-center justify-center gap-2">
                <CheckCircle size={18} /> Confirm & Pay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════
          FULLSCREEN IMAGE
      ══════════════════════════════════════ */}
      {fullScreenImage && (
        <div className="fixed inset-0 bg-black/95 z-[70] flex items-center justify-center p-4 backdrop-blur-lg animate-in fade-in duration-200"
          onClick={() => setFullScreenImage(null)}>
          <button className="absolute top-6 right-6 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 z-50"
            onClick={e => { e.stopPropagation(); setFullScreenImage(null); }}>
            <X size={28} />
          </button>
          <img src={fullScreenImage} alt="Full View" className="max-w-full max-h-[90vh] object-contain rounded-lg animate-in zoom-in duration-300"
            onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};
