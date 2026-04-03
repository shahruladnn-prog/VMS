import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { subscribeToPendingVouchers, fetchPendingVouchers, updateVoucher, deleteVoucher, getCurrentUser, fetchSettings, fetchTemplates, createBatchVouchers, generateVoucherCode } from '../services/voucherService';
import { Voucher, VoucherStatus, SystemSettings, VoucherTemplate } from '../types';
import {
  Printer, CreditCard, Smartphone, DollarSign, RefreshCcw, X, Image as ImageIcon,
  CheckSquare, Square, User, ShoppingBag, ArrowRight, Mail, Trash2, AlertTriangle, Send,
  Wifi, WifiOff
} from 'lucide-react';

export const CashierMode: React.FC = () => {
  const [pending, setPending] = useState<Voucher[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processing, setProcessing] = useState(false);
  const currentUser = getCurrentUser();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [templates, setTemplates] = useState<VoucherTemplate[]>([]);

  // Add Item State
  const [addingForClient, setAddingForClient] = useState<string | null>(null);
  const [isSubmittingItem, setIsSubmittingItem] = useState(false);

  // Payment Flow State
  const [confirmingMethod, setConfirmingMethod] = useState<'Cash' | 'QR' | 'Terminal' | null>(null);
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [sendEmailReceipt, setSendEmailReceipt] = useState(true);

  // Receipt State
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<Voucher[]>([]);

  // Email/Chip-in State
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState('');
  const [chipinStatus, setChipinStatus] = useState('');

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Delete confirm modal
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);

  // Force Sync — bypasses the WebSocket listener with a direct database read.
  // Designed for congested event networks where the listener silently stalls.
  const handleForceSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const fresh = await fetchPendingVouchers();
      setPending(fresh);
      setLastSyncedAt(new Date());
    } catch (e) {
      console.error('Force sync failed:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  useEffect(() => {
    fetchSettings().then(setSettings);
    fetchTemplates(true).then(setTemplates);
    
    // Subscribe to pending vouchers efficiently (costs exactly 1 read per new order)
    const unsubscribe = subscribeToPendingVouchers((newPendingVouchers) => {
      setPending(
        newPendingVouchers.sort((a, b) => new Date(b.dates.soldAt).getTime() - new Date(a.dates.soldAt).getTime())
      );
      setLastSyncedAt(new Date());
    });

    // Network resilience: detect online/offline and auto-heal when connection returns
    const handleOnline = () => {
      setIsOnline(true);
      // Silently trigger a force sync when network recovers so the queue heals itself
      fetchPendingVouchers().then(fresh => {
        setPending(fresh);
        setLastSyncedAt(new Date());
      }).catch(() => {});
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Group pending vouchers by Client Name
  const groupedQueue = useMemo<{ [key: string]: Voucher[] }>(() => {
    const groups: { [key: string]: Voucher[] } = {};
    pending.forEach(v => {
      if (!groups[v.clientName]) groups[v.clientName] = [];
      groups[v.clientName].push(v);
    });
    return groups;
  }, [pending]);

  const selectedVouchers = useMemo(() => pending.filter(v => selectedIds.has(v.id)), [pending, selectedIds]);

  const totalAmount = useMemo(() => selectedVouchers.reduce((sum, v) => sum + v.voucherDetails.value, 0), [selectedVouchers]);

  const balance = useMemo(() => {
    const received = parseFloat(amountReceived) || 0;
    return received - totalAmount;
  }, [amountReceived, totalAmount]);

  const canConfirmPayment = useMemo(() => {
    if (confirmingMethod === 'Cash') return balance >= 0;
    return true;
  }, [confirmingMethod, balance]);

  // Selection Handlers
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleClientGroup = (clientName: string) => {
    const clientVoucherIds = groupedQueue[clientName].map(v => v.id);
    const newSet = new Set(selectedIds);
    const allSelected = clientVoucherIds.every(id => newSet.has(id));
    if (allSelected) clientVoucherIds.forEach(id => newSet.delete(id));
    else clientVoucherIds.forEach(id => newSet.add(id));
    setSelectedIds(newSet);
  };

  const initiatePayment = (method: 'Cash' | 'QR' | 'Terminal') => {
    if (selectedVouchers.length === 0) return;
    setConfirmingMethod(method);
    setAmountReceived('');
    setChipinStatus('');
  };

  // --- Delete / Clear Queue ---
  const handleDeleteVoucher = async (id: string) => {
    await deleteVoucher(id);
    setDeleteTargetId(null);
    setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const handleClearAllQueue = async () => {
    await Promise.all(pending.map(v => deleteVoucher(v.id)));
    setClearConfirm(false);
    setSelectedIds(new Set());
  };

  const handleQuickAddFromCashier = async (template: VoucherTemplate) => {
    if (!addingForClient) return;
    setIsSubmittingItem(true);
    try {
      const existing = groupedQueue[addingForClient]?.[0];
      const defaultExpiry = template.defaultExpiryDate 
        ? new Date(template.defaultExpiryDate).toISOString() 
        : new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString();

      const newVoucher: Voucher = {
          id: crypto.randomUUID(),
          voucherCode: generateVoucherCode(),
          clientName: addingForClient,
          phoneNumber: existing?.phoneNumber || 'N/A',
          email: existing?.email || '',
          voucherDetails: {
              name: template.name,
              category: template.category,
              value: template.value,
              terms: template.terms || 'Standard terms apply.',
              image: template.image
          },
          eventSource: 'Sales Desk',
          status: VoucherStatus.PENDING_PAYMENT,
          workflow: { salesPersonName: existing?.workflow?.salesPersonName || currentUser?.fullName || 'Unknown' },
          dates: { soldAt: new Date().toISOString(), expiryDate: defaultExpiry },
          financials: {}, redemption: {}
      };
      
      await createBatchVouchers([newVoucher]);
      setAddingForClient(null);
    } catch (e) {
      alert("Failed to add item. Please try again.");
    } finally {
      setIsSubmittingItem(false);
    }
  };

  // --- Email Helpers ---
  const generateEmailBody = (vouchers: Voucher[]): string => {
    const appUrl = settings?.chipin?.appUrl || 'https://vms.gptt.my';
    const biz = settings?.receipt?.businessName || 'Gopeng Glamping Park';
    const primary = settings?.voucherPage?.primaryColor || '#0d9488';
    const vp = settings?.voucherPage;

    const voucherItems = vouchers.map(v => {
      const expiryFormatted = v.dates?.expiryDate
        ? new Date(v.dates.expiryDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })
        : 'N/A';
      const voucherUrl = `${appUrl}/voucher/${v.voucherCode}`;
      return `
        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:10px; padding:16px; margin:8px 0;">
          <p style="margin:0 0 4px; font-weight:700; font-size:15px; color:#111827;">${v.voucherDetails.name}</p>
          <p style="margin:0 0 4px; font-size:13px; color:#374151;">Value: <strong>RM${v.voucherDetails.value.toFixed(2)}</strong></p>
          <p style="margin:0 0 4px; font-size:13px; color:#374151;">Code: <strong style="font-family:monospace; letter-spacing:2px;">${v.voucherCode}</strong></p>
          <p style="margin:0 0 8px; font-size:13px; color:#dc2626; font-weight:700;">⚠️ Valid Until: ${expiryFormatted}</p>
          <a href="${voucherUrl}" style="background:${primary}; color:white; text-decoration:none; padding:8px 16px; border-radius:6px; font-size:13px; font-weight:700; display:inline-block;">View E-Voucher →</a>
        </div>
      `;
    }).join('');

    return `
      <div style="font-family:Arial,sans-serif; max-width:600px; margin:auto; background:#f9f9f9; border-radius:12px; overflow:hidden;">
        <div style="background:${primary}; padding:28px 24px; text-align:center;">
          ${vp?.logoUrl ? `<img src="${vp.logoUrl}" alt="${biz}" style="max-height:50px; margin-bottom:10px;" />` : ''}
          <h1 style="color:white; margin:0; font-size:20px;">🎫 Your E-Voucher is Ready!</h1>
          <p style="color:rgba(255,255,255,0.8); margin:6px 0 0;">${biz}</p>
        </div>
        <div style="padding:28px 24px; background:white;">
          <p style="color:#374151;">Dear <strong>${vouchers[0]?.clientName}</strong>,</p>
          <p style="color:#374151;">Thank you for your purchase! Your e-voucher(s) are ready below.</p>
          ${voucherItems}
          <p style="color:#374151; margin-top:16px;">You can also view all your vouchers at: <a href="${appUrl}/check" style="color:${primary};">${appUrl}/check</a></p>
        </div>
        <div style="background:#f3f4f6; padding:16px 24px; text-align:center;">
          <p style="color:#6b7280; font-size:12px; margin:0;">${vp?.footerText || 'Non-refundable. Subject to availability.'}</p>
        </div>
      </div>
    `;
  };

  const simulateSendEmail = (email: string) => {
    setSendingEmail(true);
    setEmailStatus('Sending (Simulated)...');
    setTimeout(() => {
      setSendingEmail(false);
      setEmailStatus(`Email sent to ${email}`);
      setTimeout(() => setEmailStatus(''), 5000);
    }, 2000);
  };

  // --- Main Payment Processing ---
  // POS payments: Chip-in NOT used (no hangs). Payment is cashier-confirmed directly.
  // Email is sent via PHP script as branded e-voucher with link to /voucher/:code.
  const processPayment = async () => {
    if (!confirmingMethod) return;
    setProcessing(true);

    let processedBatch: Voucher[] = [];

    try {
      const receiptNo = `RCPT-${Math.floor(100000 + Math.random() * 900000)}`;
      const invoiceNo = `INV-${Math.floor(100000 + Math.random() * 900000)}`;

      // Safely handle optional fields so Firebase never receives 'undefined'
      const cashFields = confirmingMethod === 'Cash' ? {
        cashReceived: parseFloat(amountReceived),
        changeAmount: balance,
      } : {};

      // Step 1: Update Firestore — activate vouchers immediately (no Chip-in dependency)
      for (const voucher of selectedVouchers) {
        const updated: Voucher = {
          ...voucher,
          status: VoucherStatus.ACTIVE,
          saleChannel: 'POS',
          financials: {
            ...voucher.financials, // keep any existing financials
            paymentMethod: confirmingMethod,
            receiptNo,
            invoiceNo,
            ...cashFields, // safely injects cash fields only if Cash
          },
          dates: {
            ...voucher.dates,
            paidAt: new Date().toISOString(),
          },
          workflow: {
            ...voucher.workflow,
            cashierName: currentUser?.fullName || 'Unknown Cashier',
          },
        };
        await updateVoucher(updated);
        processedBatch.push(updated);
      }

      setReceiptData(processedBatch);
      setConfirmingMethod(null);
      setShowReceipt(true);
      setSelectedIds(new Set());
      
    } catch (err: any) {
      console.error("Payment Processing Error:", err);
      alert(`Payment Processing Failed: ${err.message || 'Unknown database error'}. Check your network connection.`);
    } finally {
      setProcessing(false);
    }

    // Step 2: Send branded email receipt (non-blocking)
    const email = processedBatch[0]?.email;
    if (sendEmailReceipt && email && settings?.email.enabled) {
      const body = generateEmailBody(processedBatch);
      const subject = `🎫 Your ${settings?.receipt?.businessName || 'Gopeng Glamping Park'} E-Voucher`;
      
      if (settings.email.provider === 'SMTP' && settings.email.smtpHost) {
        // Use the native Vercel NodeMailer proxy
        fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            to: email, 
            subject, 
            html: body,
            smtpHost: settings.email.smtpHost,
            smtpPort: settings.email.smtpPort,
            smtpUser: settings.email.smtpUser,
            smtpPass: settings.email.smtpPass,
            senderEmail: settings.email.senderEmail || settings.email.smtpUser,
            senderName: settings.email.senderName || settings.receipt.businessName || 'GGP VMS'
          }),
        }).then(res => res.json()).then(data => {
          if (data.success) setEmailStatus('Email sent ✅');
          else throw new Error(data.error);
        }).catch((err) => {
          console.error("SMTP Error:", err);
          setEmailStatus('Email failed ⚠️');
        });
      } else if (settings.email.provider === 'Simulation') {
        simulateSendEmail(email);
      }
    }
  };


  const closeReceipt = () => { setShowReceipt(false); setReceiptData([]); };

  return (
    <div className="flex h-[calc(100vh-4rem)] md:h-screen bg-gray-100 overflow-hidden">
      {/* Left: The Queue (Grouped) */}
      <div className="w-full md:w-1/3 lg:w-1/4 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">Queue ({pending.length})</h2>
            <p className="text-xs text-gray-500">Select items to combine payment</p>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Network status pill */}
            <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border ${
              isSyncing
                ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                : isOnline
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200'
            }`}>
              {isSyncing ? (
                <RefreshCcw size={10} className="animate-spin" />
              ) : isOnline ? (
                <Wifi size={10} />
              ) : (
                <WifiOff size={10} />
              )}
              {isSyncing ? 'Syncing...' : isOnline ? 'Live' : 'Offline'}
            </span>

            {/* Force Sync button */}
            <button
              onClick={handleForceSync}
              disabled={isSyncing}
              title={lastSyncedAt ? `Last synced: ${lastSyncedAt.toLocaleTimeString()}` : 'Force sync queue'}
              className="p-2 hover:bg-primary-50 text-primary-600 hover:text-primary-800 disabled:opacity-40 rounded-full transition-colors"
            >
              <RefreshCcw size={15} className={isSyncing ? 'animate-spin' : ''} />
            </button>

            {pending.length > 0 && (
              <button
                onClick={() => setClearConfirm(true)}
                title="Clear all queue"
                className="p-2 hover:bg-red-100 text-red-500 hover:text-red-700 rounded-full transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-2 space-y-4">
          {Object.keys(groupedQueue).length === 0 && (
            <div className="text-center py-10 text-gray-400">No pending orders</div>
          )}

          {Object.entries(groupedQueue).map(([client, vouchers]: [string, Voucher[]]) => (
            <div key={client} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div
                onClick={() => toggleClientGroup(client)}
                className="bg-gray-50 p-3 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors border-b border-gray-100"
              >
                <div className="flex items-center gap-2 font-bold text-gray-700">
                  <User size={16} /> {client}{' '}
                  <span className="text-xs bg-gray-200 px-2 rounded-full">{vouchers.length}</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setAddingForClient(client); }}
                    className="ml-2 text-primary-600 bg-primary-50 border border-primary-200 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-extrabold hover:bg-primary-100 hover:border-primary-300 transition-all active:scale-95"
                  >
                    + Add Item
                  </button>
                </div>
                {vouchers.every(v => selectedIds.has(v.id))
                  ? <CheckSquare size={18} className="text-primary-600" />
                  : <Square size={18} className="text-gray-400" />}
              </div>

              <div className="divide-y divide-gray-100">
                {vouchers.map(v => {
                  const isSelected = selectedIds.has(v.id);
                  return (
                    <div key={v.id} className={`p-3 flex items-start gap-3 transition-colors ${isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                      <div className="mt-1 cursor-pointer" onClick={() => toggleSelection(v.id)}>
                        {isSelected
                          ? <CheckSquare size={18} className="text-primary-600" />
                          : <Square size={18} className="text-gray-300" />}
                      </div>
                      <div className="flex-1 cursor-pointer" onClick={() => toggleSelection(v.id)}>
                        <div className="flex justify-between font-medium text-gray-800 text-sm">
                          <span>{v.voucherDetails.name}</span>
                          <span>RM{v.voucherDetails.value}</span>
                        </div>
                        <div className="flex justify-between mt-1 text-xs text-gray-500">
                          <span>{v.voucherDetails.category}</span>
                          <span className="font-mono">{v.voucherCode}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setDeleteTargetId(v.id)}
                        className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                        title="Remove from queue"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Workspace */}
      <div className="flex-1 flex flex-col bg-gray-100 relative">
        {selectedVouchers.length > 0 ? (
          <div className="m-4 md:m-8 bg-white rounded-xl shadow-sm border p-6 max-w-4xl mx-auto w-full flex flex-col h-full max-h-[90vh]">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Finalize Order</h1>
                <p className="text-gray-500">{selectedVouchers.length} items selected for payment</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500 uppercase font-bold">Total Amount</p>
                <div className="text-4xl font-extrabold text-primary-700">RM{totalAmount.toFixed(2)}</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto mb-6 pr-2">
              <div className="space-y-3">
                {selectedVouchers.map(v => (
                  <div key={v.id} className="flex gap-4 p-3 bg-gray-50 rounded-lg border border-gray-100 items-center">
                    {v.voucherDetails.image ? (
                      <img src={v.voucherDetails.image} alt="Item" className="w-12 h-12 object-cover rounded border bg-white" />
                    ) : (
                      <div className="w-12 h-12 bg-white rounded flex items-center justify-center text-gray-300 border">
                        <ImageIcon size={20} />
                      </div>
                    )}
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-800 text-sm">{v.voucherDetails.name}</h4>
                      <p className="text-xs text-gray-500">{v.clientName} - {v.voucherDetails.category}</p>
                    </div>
                    <div className="font-mono text-sm text-gray-600 mr-4">{v.voucherCode}</div>
                    <div className="font-bold text-gray-900">RM{v.voucherDetails.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chip-in toggle (only if email present and Chip-in enabled) */}
            {settings?.chipin?.enabled && selectedVouchers[0]?.email && (
              <div className="mb-4 bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-center gap-3">
                <Send size={18} className="text-teal-600 shrink-0" />
                <div className="flex-1">
                  <p className="font-bold text-teal-800 text-sm">Send Email Receipt</p>
                  <p className="text-xs text-teal-600">Sends branded e-voucher to: {selectedVouchers[0].email}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendEmailReceipt}
                    onChange={e => setSendEmailReceipt(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600" />
                </label>
              </div>
            )}


            <div>
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <CreditCard size={18} /> Select Payment Method
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <button onClick={() => initiatePayment('Cash')} disabled={processing} className="h-24 border-2 border-gray-200 rounded-xl hover:border-primary-500 hover:bg-primary-50 flex flex-col items-center justify-center gap-2 transition-all group">
                  <DollarSign size={28} className="text-green-600 group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-gray-700 text-sm">CASH</span>
                </button>
                <button onClick={() => initiatePayment('QR')} disabled={processing} className="h-24 border-2 border-gray-200 rounded-xl hover:border-primary-500 hover:bg-primary-50 flex flex-col items-center justify-center gap-2 transition-all group">
                  <Smartphone size={28} className="text-blue-600 group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-gray-700 text-sm">DuitNow QR</span>
                </button>
                <button onClick={() => initiatePayment('Terminal')} disabled={processing} className="h-24 border-2 border-gray-200 rounded-xl hover:border-primary-500 hover:bg-primary-50 flex flex-col items-center justify-center gap-2 transition-all group">
                  <CreditCard size={28} className="text-purple-600 group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-gray-700 text-sm">Card Terminal</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 flex-col gap-4">
            <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center">
              <ShoppingBag size={40} className="opacity-40" />
            </div>
            <p className="font-medium">Select items from the queue to process payment.</p>
          </div>
        )}
      </div>

      {/* Delete Single Voucher Confirm */}
      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-red-500" size={28} />
              <h3 className="text-xl font-bold text-gray-900">Remove from Queue?</h3>
            </div>
            <p className="text-gray-500 mb-6">This will permanently delete this voucher order. This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTargetId(null)} className="flex-1 py-3 text-gray-700 font-bold bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">Cancel</button>
              <button onClick={() => handleDeleteVoucher(deleteTargetId)} className="flex-1 py-3 text-white font-bold bg-red-600 hover:bg-red-700 rounded-xl transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Confirm */}
      {clearConfirm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="text-red-500" size={28} />
              <h3 className="text-xl font-bold text-gray-900">Clear Entire Queue?</h3>
            </div>
            <p className="text-gray-500 mb-6">This will delete all <strong>{pending.length} pending orders</strong> from the queue. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setClearConfirm(false)} className="flex-1 py-3 text-gray-700 font-bold bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">Cancel</button>
              <button onClick={handleClearAllQueue} className="flex-1 py-3 text-white font-bold bg-red-600 hover:bg-red-700 rounded-xl transition-colors">Clear All</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Item Modal */}
      {addingForClient && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 relative flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                <div>
                   <h3 className="text-2xl font-extrabold text-gray-900">Add Item to Order</h3>
                   <p className="text-gray-500 font-medium">Adding for client: <span className="text-primary-600 font-bold">{addingForClient}</span></p>
                </div>
                <button onClick={() => setAddingForClient(null)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-gray-500 hover:text-gray-900"><X size={20}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto mb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-1">
                {templates.map(t => (
                    <div key={t.id} onClick={() => handleQuickAddFromCashier(t)} 
                        className={`bg-gray-50 border-2 border-transparent hover:border-primary-500 rounded-xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-all active:scale-95 group flex flex-col h-full min-h-[140px] ${isSubmittingItem ? 'opacity-50 pointer-events-none' : ''}`}>
                         {t.image ? (
                             <img src={t.image} alt={t.name} className="w-full h-24 object-cover border-b border-gray-100" />
                         ) : (
                             <div className="w-full h-24 bg-gradient-to-br from-primary-700 to-primary-500 flex items-center justify-center text-white/40 border-b border-white/10">
                                 <ShoppingBag size={28}/>
                             </div>
                         )}
                         <div className="p-3 flex-1 flex flex-col">
                             <h4 className="font-extrabold text-gray-900 text-xs leading-tight mb-1 group-hover:text-primary-700 transition-colors line-clamp-2">{t.name}</h4>
                             <div className="mt-auto text-primary-600 font-extrabold text-sm flex justify-between items-end">
                                 <span>RM{t.value}</span>
                             </div>
                         </div>
                    </div>
                ))}
            </div>
            
            {isSubmittingItem && <div className="p-4 text-center text-primary-700 font-bold text-lg bg-primary-50 rounded-xl animate-pulse flex items-center justify-center gap-2"><RefreshCcw className="animate-spin" size={20}/> Adding Item to Queue...</div>}
            {!isSubmittingItem && <div className="text-center text-gray-400 text-sm font-bold tracking-wider uppercase mt-2">Click an item to instantly add to queue</div>}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmingMethod && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-extrabold text-gray-900 mb-1">Confirm Payment</h3>
              <p className="text-gray-500 font-medium">Method: <span className="text-primary-600 font-bold uppercase">{confirmingMethod}</span></p>
            </div>

            <div className="bg-gray-50 rounded-xl p-5 mb-4 border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <span className="text-gray-500 font-bold uppercase text-xs tracking-wider">Total Due</span>
                <span className="text-2xl font-extrabold text-gray-900">RM{totalAmount.toFixed(2)}</span>
              </div>

              {confirmingMethod === 'Cash' && (
                <>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-500 font-bold uppercase text-xs tracking-wider">Cash Received</span>
                    <input
                      type="number"
                      autoFocus
                      className="w-32 text-right p-2 border-2 border-gray-300 rounded-lg font-bold text-xl focus:border-primary-500 outline-none"
                      placeholder="0.00"
                      value={amountReceived}
                      onChange={e => setAmountReceived(e.target.value)}
                    />
                  </div>
                  <div className="border-t border-dashed border-gray-300 my-3"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 font-bold uppercase text-xs tracking-wider">Change Due</span>
                    <span className={`text-2xl font-extrabold ${balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      RM{balance.toFixed(2)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Chip-in status indicator */}
            {chipinStatus && (
              <div className={`mb-4 p-3 rounded-lg text-sm font-bold text-center ${chipinStatus.startsWith('✅') ? 'bg-green-50 text-green-700' : chipinStatus.startsWith('⚠️') ? 'bg-yellow-50 text-yellow-700' : 'bg-blue-50 text-blue-700'}`}>
                {chipinStatus}
              </div>
            )}

            <button
              onClick={processPayment}
              disabled={!canConfirmPayment || processing}
              className="w-full bg-primary-600 text-white font-extrabold py-4 rounded-xl text-xl shadow-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {processing ? 'Processing...' : 'CONFIRM PAYMENT'}
              {!processing && <ArrowRight size={24} />}
            </button>

            <button
              onClick={() => { setConfirmingMethod(null); setChipinStatus(''); }}
              className="w-full mt-3 py-3 text-gray-500 font-bold hover:text-gray-800 hover:bg-gray-50 rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && receiptData.length > 0 && settings && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-sm w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-primary-600 text-white flex justify-between items-center no-print">
              <h3 className="font-bold">Transaction Complete</h3>
              <button onClick={closeReceipt}><X size={20} /></button>
            </div>

            {sendingEmail && (
              <div className="bg-blue-50 p-2 text-center text-xs font-bold text-blue-800 flex items-center justify-center gap-2 no-print">
                <Mail size={12} className="animate-pulse" /> Sending digital receipt...
              </div>
            )}
            {emailStatus && !sendingEmail && (
              <div className="bg-green-50 p-2 text-center text-xs font-bold text-green-800 flex items-center justify-center gap-2 no-print">
                <CheckSquare size={12} /> {emailStatus}
              </div>
            )}
            {chipinStatus && chipinStatus.startsWith('✅') && (
              <div className="bg-teal-50 p-2 text-center text-xs font-bold text-teal-800 flex items-center justify-center gap-2 no-print">
                <Send size={12} /> {chipinStatus}
              </div>
            )}

            <div 
              className={`p-6 overflow-y-auto bg-white font-mono text-sm print-only mx-auto ${settings.receipt.printerWidth === '58mm' ? 'text-[10px]' : ''}`} 
              id="receipt-area"
              style={{ maxWidth: settings.receipt.printerWidth === '58mm' ? '58mm' : '80mm', width: '100%' }}
            >
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold text-black uppercase">{settings.receipt.businessName}</h2>
                {settings.receipt.businessRegNo && <p className="text-[10px] text-gray-600">({settings.receipt.businessRegNo})</p>}
                <p>{settings.receipt.addressLine1}</p>
                <p>{settings.receipt.addressLine2}</p>
                <p>Tel: {settings.receipt.phone}</p>
                {settings.receipt.email && <p>Email: {settings.receipt.email}</p>}
              </div>

              <div className="border-b border-dashed border-gray-400 my-2"></div>
              <p className="text-center text-xs italic mb-2">"{settings.receipt.headerMessage}"</p>

              <div className="flex justify-between text-xs">
                <span>RCPT: {receiptData[0].financials.receiptNo}</span>
                <span>{new Date().toLocaleDateString()}</span>
              </div>
              <div className="text-xs mb-2">Client: {receiptData[0].clientName}</div>

              <div className="border-b border-dashed border-gray-400 my-2"></div>

              <div className="space-y-1">
                {receiptData.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="truncate w-32">{item.voucherDetails.name}</span>
                    <span>RM{item.voucherDetails.value.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-b border-dashed border-gray-400 my-2"></div>

              <div className="flex justify-between font-bold text-lg">
                <span>TOTAL</span>
                <span>RM{receiptData.reduce((acc, curr) => acc + curr.voucherDetails.value, 0).toFixed(2)}</span>
              </div>

              {receiptData[0].financials.paymentMethod === 'Cash' && receiptData[0].financials.cashReceived !== undefined && (
                <div className="mt-2 text-xs">
                  <div className="flex justify-between"><span>CASH REC</span><span>RM{receiptData[0].financials.cashReceived.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>CHANGE</span><span>RM{receiptData[0].financials.changeAmount?.toFixed(2)}</span></div>
                </div>
              )}

              <div className="text-right text-xs mt-2 font-bold uppercase">Cashier: {receiptData[0].workflow.cashierName}</div>
              <div className="text-right text-xs font-bold uppercase">Paid via: {receiptData[0].financials.paymentMethod}</div>

              <div className="border-b border-dashed border-gray-400 my-4"></div>

              <div className="text-center font-bold mb-2 uppercase text-xs">-- Voucher Entitlements --</div>

              {receiptData.map((v, i) => (
                <div key={v.id} className="mb-6 flex flex-col items-center">
                  <p className="text-xs font-bold mb-1">{i + 1}. {v.voucherDetails.name}</p>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent((settings?.chipin?.appUrl || 'https://vms.gptt.my') + '/voucher/' + v.voucherCode)}`}
                    alt="Voucher QR"
                    className="w-24 h-24 mb-1"
                  />
                  <p className="font-bold text-sm">{v.voucherCode}</p>
                  <p className="text-[10px] text-gray-500">Exp: {v.dates.expiryDate.split('T')[0]}</p>
                </div>
              ))}

              <div className="mt-4 text-center text-xs">
                <p>{settings.receipt.footerMessage}</p>
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 flex gap-2 no-print">
              <button onClick={() => window.print()} className="flex-1 bg-gray-800 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2">
                <Printer size={18} /> Print
              </button>
              <button onClick={closeReceipt} className="flex-1 bg-primary-600 text-white py-3 rounded-lg font-bold">
                Next Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};