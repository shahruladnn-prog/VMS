import React, { useState, useEffect, useMemo } from 'react';
import { fetchTemplates, generateVoucherCode, createBatchVouchers, validatePromoCode } from '../services/voucherService';
import { createChipinPurchase } from '../services/chipinService';
import { VoucherTemplate, Voucher, VoucherStatus, PromoCode } from '../types';
import { ShoppingCart, Plus, Minus, Tag, ChevronRight, Loader, User, Mail, Phone, Info, X, CheckCircle, Ticket, AlertCircle, Download, Eye } from 'lucide-react';

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

export const OnlineStore: React.FC = () => {
  const [templates, setTemplates] = useState<VoucherTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Voucher detail modal
  const [selectedVoucher, setSelectedVoucher] = useState<VoucherTemplate | null>(null);

  // Terms & conditions popup
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);

  // Promo code
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(null);
  const [promoStatus, setPromoStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [promoMessage, setPromoMessage] = useState('');

  useEffect(() => {
    fetchTemplates(true).then(all => {
      setTemplates(all);
      setLoading(false);
    });
  }, []);

  const cartItems: CartItem[] = useMemo(() =>
    templates
      .filter(t => (cart[t.id] || 0) > 0)
      .map(t => ({ templateId: t.id, name: t.name, value: t.value, category: t.category, terms: t.terms, image: t.image, defaultExpiryDate: t.defaultExpiryDate, quantity: cart[t.id] })),
    [templates, cart]
  );

  const cartTotal = cartItems.reduce((s, i) => s + i.value * i.quantity, 0);
  const totalItems = cartItems.reduce((s, i) => s + i.quantity, 0);

  // Calculate discount
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

  const handleCheckout = async () => {
    setError('');
    if (!customerName.trim()) { setError('Please enter your full name.'); return; }
    if (!customerEmail.trim() || !customerEmail.includes('@')) { setError('Please enter a valid email address.'); return; }
    if (cartItems.length === 0) { setError('Please select at least one voucher.'); return; }

    setSubmitting(true);
    setShowTermsModal(false);

    try {
      // Calculate per-item discounted value (promo applied proportionally)
      const discountRatio = cartTotal > 0 ? finalTotal / cartTotal : 1;

      // Build the list of codes/items for Chip-in FIRST (before Firestore save)
      const allCodes: { code: string; name: string; value: number }[] = [];
      const vouchersMeta: Array<{
        code: string; name: string; category: string; terms: string;
        image?: string; expiryDate: string; originalValue: number; discountedValue: number;
      }> = [];

      cartItems.forEach(item => {
        const expiryDate = item.defaultExpiryDate
          ? new Date(item.defaultExpiryDate).toISOString()
          : new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString();
        const discountedValue = Math.round(item.value * discountRatio * 100) / 100;

        for (let i = 0; i < item.quantity; i++) {
          const code = generateVoucherCode();
          allCodes.push({ code, name: item.name, value: discountedValue });
          vouchersMeta.push({
            code, name: item.name, category: item.category, terms: item.terms,
            image: item.image, expiryDate, originalValue: item.value, discountedValue,
          });
        }
      });

      // STEP 1: Create Chip-in purchase FIRST — get the purchase ID
      // This is critical: we need chipinPurchaseId BEFORE saving vouchers so the
      // webhook can find them when payment completes.
      const result = await createChipinPurchase({
        customerEmail,
        customerName,
        customerPhone,
        vouchers: allCodes,
        type: 'online',
        successUrl: `${window.location.origin}/store/success`,
        failureUrl: `${window.location.origin}/store`,
      });

      if (!result.checkoutUrl) {
        throw new Error('No checkout URL returned from payment gateway.');
      }

      // STEP 2: Save vouchers WITH the chipinPurchaseId so webhook can activate them
      const vouchersToCreate: Voucher[] = vouchersMeta.map(meta => ({
        id: crypto.randomUUID(),
        voucherCode: meta.code,
        clientName: customerName,
        phoneNumber: customerPhone,
        email: customerEmail,
        voucherDetails: {
          name: meta.name,
          category: meta.category,
          value: meta.originalValue,     // Store original value for display
          terms: meta.terms,
          image: meta.image,
        },
        eventSource: 'Online Store',
        status: VoucherStatus.PENDING_PAYMENT,
        saleChannel: 'Online',
        workflow: { salesPersonName: 'Online Store' },
        dates: { soldAt: new Date().toISOString(), expiryDate: meta.expiryDate },
        financials: { paymentMethod: 'Online' },
        redemption: {},
        chipinPurchaseId: result.purchaseId,  // ← KEY: links voucher to Chip-in purchase
      }));

      await createBatchVouchers(vouchersToCreate);

      // STEP 3: Redirect to Chip-in checkout
      window.location.href = result.checkoutUrl;

    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
      setSubmitting(false);
    }
  };
  if (loading) return (

    <div className="min-h-screen bg-gradient-to-b from-teal-900 to-teal-700 flex items-center justify-center">
      <Loader className="text-white animate-spin" size={40} />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-900 via-teal-800 to-gray-900">
      {/* Header */}
      <div className="bg-teal-900/80 backdrop-blur-sm border-b border-teal-700 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-white font-extrabold text-xl tracking-tight">🎫 GGP Voucher Store</h1>
            <p className="text-teal-300 text-xs">Purchase your adventure vouchers online</p>
          </div>
          {totalItems > 0 && (
            <div className="bg-white/10 text-white px-4 py-2 rounded-full flex items-center gap-2 text-sm font-bold border border-white/20">
              <ShoppingCart size={16} />
              {totalItems} item{totalItems > 1 ? 's' : ''} · RM{cartTotal.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">

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
                  <div key={t.id} className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl overflow-hidden hover:bg-white/15 transition-all group cursor-pointer"
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
                        <Info size={11}/> Click for details & terms
                      </p>

                      {/* Quantity Selector — stop propagation so clicking +/- doesn't open modal */}
                      <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                        <button onClick={() => updateCart(t.id, -1)} disabled={qty === 0}
                          className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-lg flex items-center justify-center transition-all">
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

        {/* Right: Customer Form + Checkout */}
        <div className="w-full lg:w-96 shrink-0">
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 sticky top-24">
            <h2 className="text-white font-bold text-lg mb-5 uppercase tracking-wide">Your Details</h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-teal-300 text-xs font-bold uppercase mb-2">Full Name *</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border-2 border-transparent focus:border-teal-400 outline-none text-gray-900 font-medium" />
                </div>
              </div>
              <div>
                <label className="block text-teal-300 text-xs font-bold uppercase mb-2">Email Address * <span className="text-teal-400 normal-case">(receipt sent here)</span></label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border-2 border-transparent focus:border-teal-400 outline-none text-gray-900 font-medium" />
                </div>
              </div>
              <div>
                <label className="block text-teal-300 text-xs font-bold uppercase mb-2">Phone <span className="text-teal-500 normal-case font-normal">(optional)</span></label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                    placeholder="01X-XXXXXXX"
                    className="w-full pl-10 pr-4 py-3 bg-white rounded-xl border-2 border-transparent focus:border-teal-400 outline-none text-gray-900 font-medium" />
                </div>
              </div>
            </div>

            {/* Cart Summary */}
            {cartItems.length > 0 && (
              <div className="bg-white/10 rounded-xl p-4 mb-4 space-y-2">
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
            )}

            {/* Promo Code */}
            {cartItems.length > 0 && (
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoInput}
                    onChange={e => { setPromoInput(e.target.value); setPromoStatus('idle'); }}
                    placeholder="Promo code"
                    className="flex-1 px-3 py-2 bg-white/20 text-white placeholder-teal-300 border border-white/30 rounded-lg text-sm font-medium outline-none focus:border-teal-300"
                  />
                  <button
                    onClick={handleApplyPromo}
                    disabled={promoStatus === 'checking' || !promoInput.trim()}
                    className="px-3 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Ticket size={14}/> Apply
                  </button>
                </div>
                {promoMessage && (
                  <p className={`text-xs mt-1.5 font-bold ${promoStatus === 'valid' ? 'text-emerald-300' : 'text-red-300'}`}>{promoMessage}</p>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-500/20 border border-red-400/50 rounded-xl p-3 mb-4 text-red-200 text-sm font-medium flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
              </div>
            )}

            <button
              onClick={() => { setTermsAgreed(false); setShowTermsModal(true); }}
              disabled={submitting || cartItems.length === 0}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold py-4 rounded-xl text-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/30"
            >
              {submitting ? <><Loader size={20} className="animate-spin" /> Processing...</> : <>Proceed to Payment <ChevronRight size={22} /></>}
            </button>

            <p className="text-center text-teal-400 text-xs mt-3">🔒 Secure payment via Chip-in · Voucher code emailed to you</p>
          </div>
        </div>
      </div>

      {/* ===== VOUCHER DETAIL MODAL ===== */}
      {selectedVoucher && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedVoucher(null)}>
          <div className="bg-gray-900 border border-teal-800/60 shadow-[0_0_50px_rgba(13,148,136,0.15)] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-in zoom-in duration-200"
            onClick={e => e.stopPropagation()}>
            {selectedVoucher.image ? (
              <div className="relative group bg-black/50 rounded-t-2xl">
                <img src={selectedVoucher.image} alt={selectedVoucher.name} className="w-full max-h-96 object-contain" />
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <a href={selectedVoucher.image} target="_blank" rel="noopener noreferrer" 
                     className="bg-black/80 border border-white/20 hover:bg-black text-white px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 backdrop-blur-md transition-all shadow-xl opacity-90 hover:opacity-100 hover:scale-105 active:scale-95">
                    <Eye size={16}/> View Full
                  </a>
                  <a href={selectedVoucher.image} download={`${selectedVoucher.name.replace(/\s+/g, '_')}_Poster.jpg`} target="_blank" rel="noopener noreferrer" 
                     className="bg-emerald-600/90 border border-emerald-400/30 hover:bg-emerald-600 text-white px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 backdrop-blur-md transition-all shadow-xl opacity-90 hover:opacity-100 hover:scale-105 active:scale-95">
                    <Download size={16}/> Download
                  </a>
                </div>
              </div>
            ) : (
              <div className="w-full h-48 bg-gradient-to-br from-teal-800 to-teal-600 rounded-t-2xl flex items-center justify-center">
                <Tag size={64} className="text-white/20" />
              </div>
            )}
            <div className="p-6 md:p-8">
              <div className="flex justify-between items-start mb-1">
                <div>
                  <h2 className="text-white font-extrabold text-2xl">{selectedVoucher.name}</h2>
                  <span className="text-teal-300 text-sm font-bold uppercase">{selectedVoucher.category}</span>
                </div>
                <div className="text-3xl font-extrabold text-emerald-400">RM{selectedVoucher.value}</div>
              </div>

              {selectedVoucher.defaultExpiryDate && (
                <div className="inline-flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 text-rose-300 font-bold px-3 py-1.5 rounded-lg text-xs mt-3 mb-5">
                  📅 Valid until: {selectedVoucher.defaultExpiryDate}
                </div>
              )}

              {selectedVoucher.highlights && (
                <div className="bg-teal-900/40 border border-teal-500/30 rounded-xl p-5 mb-5 shadow-inner">
                  <h4 className="text-teal-300 text-xs font-extrabold uppercase tracking-widest mb-3 flex items-center gap-2">✨ Package Highlights</h4>
                  <ul className="text-teal-50 space-y-2 text-sm ml-1 font-medium">
                    {selectedVoucher.highlights.split('\n').filter(h => h.trim().length > 0).map((highlight, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                         <span className="text-teal-400 mt-0.5 font-bold">•</span> 
                         <span className="leading-snug">{highlight.replace(/^[-*]\s/, '')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedVoucher.terms && (
                <div className="bg-black/30 border border-white/10 rounded-xl p-5 mb-6">
                  <h4 className="text-gray-400 text-[11px] font-extrabold uppercase tracking-widest mb-3">Terms & Conditions</h4>
                  <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-medium">{selectedVoucher.terms}</div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setSelectedVoucher(null)}
                  className="flex-1 py-4 border-2 border-white/10 text-white rounded-xl font-bold hover:bg-white/10 transition-colors">
                  Close
                </button>
                <button onClick={() => { updateCart(selectedVoucher.id, 1); setSelectedVoucher(null); }}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-extrabold transition-colors flex items-center justify-center gap-2">
                  <Plus size={18}/> Add to Cart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== PAYMENT TERMS MODAL ===== */}
      {showTermsModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in duration-200 overflow-hidden">
            <div className="bg-teal-900 p-5 flex items-center gap-3">
              <CheckCircle className="text-teal-300" size={24}/>
              <div>
                <h3 className="text-white font-extrabold text-lg">Terms & Conditions</h3>
                <p className="text-teal-300 text-xs">Please read before proceeding to payment</p>
              </div>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 space-y-2 leading-relaxed">
                <p className="font-bold text-gray-900">General Store Terms:</p>
                <ul className="list-disc pl-4 space-y-1 text-gray-600">
                  <li>All purchases are final. Vouchers are non-refundable once payment is confirmed.</li>
                  <li>Vouchers are valid only for the experiences/services specified.</li>
                  <li>Your voucher code(s) will be emailed to you upon successful payment.</li>
                  <li>GGP reserves the right to modify or cancel any voucher in the event of unforeseen circumstances.</li>
                </ul>
              </div>

              {cartItems.filter(i => i.terms).map(item => (
                <div key={item.templateId} className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <p className="font-bold text-blue-900 text-sm mb-1">{item.name} — Specific Terms:</p>
                  <p className="text-blue-700 text-sm leading-relaxed">{item.terms}</p>
                </div>
              ))}

              <label className="flex items-start gap-3 cursor-pointer p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <input type="checkbox" checked={termsAgreed} onChange={e => setTermsAgreed(e.target.checked)}
                  className="w-5 h-5 accent-emerald-600 mt-0.5 cursor-pointer shrink-0" />
                <span className="text-sm font-bold text-emerald-900">
                  I have read and agree to all terms & conditions above
                </span>
              </label>
            </div>

            <div className="p-5 flex gap-3 border-t bg-gray-50">
              <button onClick={() => setShowTermsModal(false)}
                className="flex-1 py-3 border border-gray-300 text-gray-600 rounded-xl font-bold hover:bg-gray-100 transition-colors">
                Go Back
              </button>
              <button
                onClick={handleCheckout}
                disabled={!termsAgreed}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold rounded-xl transition-colors flex items-center justify-center gap-2">
                <CheckCircle size={18}/> I Agree & Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
