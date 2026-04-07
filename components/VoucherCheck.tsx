import React, { useState } from 'react';
import { fetchVoucherByCode, fetchVouchersByPhone } from '../services/voucherService';
import { Voucher, VoucherStatus } from '../types';
import { Search, Loader, CheckCircle, XCircle, Clock, AlertTriangle, Tag, QrCode, Mail, Check } from 'lucide-react';

export const VoucherCheck: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Voucher[] | null | 'not_found'>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [resendingAll, setResendingAll] = useState(false);
  const [resendAllSuccess, setResendAllSuccess] = useState(false);

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setLoading(true);
    setResults(null);
    try {
      const isPhoneNumber = /^[\d\s\+\-\(\)]+$/.test(searchTerm) && searchTerm.replace(/[\D]/g, '').length >= 9;
      
      if (isPhoneNumber) {
        const found = await fetchVouchersByPhone(searchTerm);
        const filtered = found.filter(v => v.status === VoucherStatus.ACTIVE || v.status === VoucherStatus.REDEEMED);
        setResults(filtered.length > 0 ? filtered : 'not_found');
      } else {
        const found = await fetchVoucherByCode(searchTerm);
        if (found && (found.status === VoucherStatus.ACTIVE || found.status === VoucherStatus.REDEEMED)) {
          setResults([found]);
        } else {
          setResults('not_found');
        }
      }
    } catch {
      setResults('not_found');
    }
    setLoading(false);
  };

  const handleResend = async (voucherId: string) => {
    setResendingId(voucherId);
    setResendSuccess(null);
    try {
      const response = await fetch('/api/resend-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voucherId, agentId: 'CUSTOMER' }),
      });
      if (response.ok) {
        setResendSuccess(voucherId);
        setTimeout(() => setResendSuccess(null), 3000);
      } else {
        alert('Failed to resend voucher email. Please try again.');
      }
    } catch (e) {
      alert('Network error while resending voucher email.');
    }
    setResendingId(null);
  };

  const handleResendAll = async () => {
    if (!results || results === 'not_found' || results.length === 0) return;
    setResendingAll(true);
    setResendAllSuccess(false);
    try {
      const voucherIds = results.map(v => v.id);
      const response = await fetch('/api/resend-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voucherIds, agentId: 'CUSTOMER' }),
      });
      if (response.ok) {
        setResendAllSuccess(true);
        setTimeout(() => setResendAllSuccess(false), 4000);
      } else {
        alert('Failed to resend vouchers. Please try again.');
      }
    } catch (e) {
      alert('Network error while resending emails.');
    }
    setResendingAll(false);
  };

  const statusConfig: Record<VoucherStatus, { color: string; icon: React.ReactNode; label: string }> = {
    [VoucherStatus.ACTIVE]: { color: 'bg-emerald-50 border-emerald-300 text-emerald-800', icon: <CheckCircle className="text-emerald-500" size={32}/>, label: 'Active — Ready to Redeem' },
    [VoucherStatus.REDEEMED]: { color: 'bg-blue-50 border-blue-300 text-blue-800', icon: <CheckCircle className="text-blue-500" size={32}/>, label: 'Already Redeemed' },
    [VoucherStatus.EXPIRED]: { color: 'bg-red-50 border-red-300 text-red-800', icon: <XCircle className="text-red-500" size={32}/>, label: 'Expired' },
    [VoucherStatus.PENDING_PAYMENT]: { color: 'bg-amber-50 border-amber-300 text-amber-800', icon: <Clock className="text-amber-500" size={32}/>, label: 'Pending Payment' },
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-900 via-teal-800 to-gray-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-teal-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Tag size={32} className="text-white" />
          </div>
          <h1 className="text-white font-extrabold text-3xl">Voucher Status Check</h1>
          <p className="text-teal-300 mt-2 text-sm">Enter your voucher code to see its current status</p>
        </div>

        {/* Search Box */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 mb-6">
          <label className="block text-teal-300 text-xs font-bold uppercase mb-2">Voucher Code or Phone Number</label>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="e.g. GGP-XXXX-XXXX or 0123456789"
            className="w-full px-4 py-3 bg-white rounded-xl border-2 border-transparent focus:border-teal-400 outline-none text-gray-900 font-mono font-bold text-lg mb-4 text-center tracking-widest"
          />
          <button
            onClick={handleSearch}
            disabled={!searchTerm.trim() || loading}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold py-3 rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            {loading ? <Loader size={20} className="animate-spin" /> : <Search size={20} />}
            {loading ? 'Searching...' : 'Check Voucher'}
          </button>
        </div>

        {/* Result */}
        {results && results !== 'not_found' && (
          <div className="space-y-4">
            <div className="text-center text-teal-100 text-sm mb-2 font-medium flex flex-col items-center gap-3">
              <span>Found {results.length} voucher{results.length > 1 ? 's' : ''}</span>
              {results.length > 1 && results.some(v => v.email) && (
                <button
                  onClick={handleResendAll}
                  disabled={resendingAll || resendAllSuccess}
                  className="flex items-center gap-2 px-6 py-2 border-2 border-teal-400 text-teal-300 hover:bg-teal-400 hover:text-white text-sm font-extrabold rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg active:scale-95"
                >
                  {resendingAll ? <Loader size={16} className="animate-spin" /> : resendAllSuccess ? <Check size={16} /> : <Mail size={16} />}
                  {resendingAll ? 'GATHERING VOUCHERS...' : resendAllSuccess ? 'ALL VOUCHERS SENT!' : 'EMAIL ALL VOUCHERS IN ONE MESSAGE'}
                </button>
              )}
            </div>
            {results.map((result) => (
              <div key={result.id} className={`rounded-2xl border-2 p-6 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-300 ${statusConfig[result.status]?.color || 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-3 mb-4">
                  {statusConfig[result.status]?.icon}
                  <div>
                    <p className="font-extrabold text-lg">{statusConfig[result.status]?.label}</p>
                    <p className="font-mono text-sm opacity-70">{result.voucherCode}</p>
                  </div>
                </div>

                <div className="space-y-2 text-sm border-t border-current/20 pt-4">
                  <div className="flex justify-between">
                    <span className="opacity-70">Voucher</span>
                    <span className="font-bold">{result.voucherDetails.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-70">Value</span>
                    <span className="font-bold">RM{result.voucherDetails.value}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-70">Valid Until</span>
                    <span className="font-bold">{result.dates.expiryDate.split('T')[0]}</span>
                  </div>
                  {result.status === VoucherStatus.REDEEMED && result.dates.redemptionDate && (
                    <div className="flex justify-between">
                      <span className="opacity-70">Redeemed On</span>
                      <span className="font-bold">{result.dates.redemptionDate.split('T')[0]}</span>
                    </div>
                  )}
                  {result.voucherDetails.terms && (
                    <div className="mt-3 pt-3 border-t border-current/20">
                      <p className="opacity-70 text-xs mb-1">Terms & Conditions</p>
                      <p className="text-xs leading-relaxed opacity-80">{result.voucherDetails.terms}</p>
                    </div>
                  )}
                  {result.email && (
                    <div className="mt-4 pt-4 border-t border-current/20 flex justify-end">
                      <button
                        onClick={() => handleResend(result.id)}
                        disabled={resendingId === result.id || resendSuccess === result.id}
                        className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm min-w-[120px] justify-center"
                      >
                        {resendingId === result.id ? (
                          <Loader size={14} className="animate-spin" />
                        ) : resendSuccess === result.id ? (
                          <Check size={14} />
                        ) : (
                          <Mail size={14} />
                        )}
                        {resendingId === result.id ? 'Sending...' : resendSuccess === result.id ? 'Email Sent!' : 'Resend Email'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {results === 'not_found' && (
          <div className="bg-red-50/10 border border-red-400/30 rounded-2xl p-6 text-center animate-in fade-in duration-300">
            <AlertTriangle className="text-red-400 mx-auto mb-2" size={28} />
            <p className="text-white font-bold">No vouchers found</p>
            <p className="text-red-300 text-sm mt-1">Please check the code or phone number and try again.</p>
          </div>
        )}

        <p className="text-center text-teal-500 text-xs mt-6">
          <a href="/store" className="hover:text-teal-300 underline transition-colors">← Back to Voucher Store</a>
        </p>
      </div>
    </div>
  );
};
