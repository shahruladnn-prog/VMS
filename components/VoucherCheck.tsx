import React, { useState } from 'react';
import { fetchVouchers } from '../services/voucherService';
import { Voucher, VoucherStatus } from '../types';
import { Search, Loader, CheckCircle, XCircle, Clock, AlertTriangle, Tag, QrCode } from 'lucide-react';

export const VoucherCheck: React.FC = () => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Voucher | null | 'not_found'>(null);

  const handleSearch = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const vouchers = await fetchVouchers();
      const found = vouchers.find(v => v.voucherCode.toUpperCase() === code.trim().toUpperCase());
      setResult(found || 'not_found');
    } catch {
      setResult('not_found');
    }
    setLoading(false);
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
          <label className="block text-teal-300 text-xs font-bold uppercase mb-2">Voucher Code</label>
          <input
            type="text"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="e.g. GGP-XXXX-XXXX"
            className="w-full px-4 py-3 bg-white rounded-xl border-2 border-transparent focus:border-teal-400 outline-none text-gray-900 font-mono font-bold text-lg mb-4 text-center tracking-widest"
          />
          <button
            onClick={handleSearch}
            disabled={!code.trim() || loading}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold py-3 rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            {loading ? <Loader size={20} className="animate-spin" /> : <Search size={20} />}
            {loading ? 'Searching...' : 'Check Voucher'}
          </button>
        </div>

        {/* Result */}
        {result && result !== 'not_found' && (
          <div className={`rounded-2xl border-2 p-6 shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-300 ${statusConfig[result.status]?.color || 'bg-white border-gray-200'}`}>
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
            </div>
          </div>
        )}

        {result === 'not_found' && (
          <div className="bg-red-50/10 border border-red-400/30 rounded-2xl p-6 text-center animate-in fade-in duration-300">
            <AlertTriangle className="text-red-400 mx-auto mb-2" size={28} />
            <p className="text-white font-bold">Voucher not found</p>
            <p className="text-red-300 text-sm mt-1">Please check the code and try again.</p>
          </div>
        )}

        <p className="text-center text-teal-500 text-xs mt-6">
          <a href="/store" className="hover:text-teal-300 underline transition-colors">← Back to Voucher Store</a>
        </p>
      </div>
    </div>
  );
};
