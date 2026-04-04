import React, { useState, useEffect } from 'react';
import { fetchVoucherByCode, fetchVouchersByPhone, bulkRedeemVouchers, updateVoucher, fetchBranches, addBranch, removeBranch, updateBranch, getCurrentUser } from '../services/voucherService';
import { Voucher, VoucherStatus } from '../types';
import { Search, ScanLine, CheckCircle, XCircle, MapPin, FileText, Image as ImageIcon, Calendar, Settings, Plus, Trash, Edit2, Save, X, Phone, CheckSquare, Square, Users, AlertTriangle } from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isPhoneQuery = (q: string) => /^[0-9+][0-9\s-]{5,}$/.test(q.trim());

const getStatusBanner = (status: VoucherStatus) => {
  switch (status) {
    case VoucherStatus.ACTIVE:
      return <div className="bg-emerald-600 text-white p-5 text-center font-extrabold text-2xl tracking-wider rounded-t-xl animate-pulse shadow-inner">✅ VALID FOR REDEMPTION</div>;
    case VoucherStatus.REDEEMED:
      return <div className="bg-blue-600 text-white p-5 text-center font-extrabold text-2xl tracking-wider rounded-t-xl shadow-inner">ℹ️ ALREADY REDEEMED</div>;
    case VoucherStatus.EXPIRED:
      return <div className="bg-rose-600 text-white p-5 text-center font-extrabold text-2xl tracking-wider rounded-t-xl shadow-inner">⛔ EXPIRED VOUCHER</div>;
    default:
      return <div className="bg-yellow-500 text-white p-5 text-center font-extrabold text-2xl tracking-wider rounded-t-xl shadow-inner">⚠️ PAYMENT PENDING</div>;
  }
};

// ─── Component ───────────────────────────────────────────────────────────────

export const RedemptionMode: React.FC = () => {
  const [query, setQuery] = useState('');
  // Single-voucher result (code search)
  const [singleResult, setSingleResult] = useState<Voucher | null>(null);
  // Multi-voucher results (phone search)
  const [phoneResults, setPhoneResults] = useState<Voucher[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [error, setError] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'code' | 'phone'>('code');
  const currentUser = getCurrentUser();

  // Shared redemption form
  const [branch, setBranch] = useState('');
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [picName, setPicName] = useState(currentUser?.fullName || '');
  const [bookingDate, setBookingDate] = useState('');

  // Single-voucher action state
  const [redeeming, setRedeeming] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Bulk action state
  const [bulkRedeeming, setBulkRedeeming] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ redeemed: string[]; skipped: string[] } | null>(null);

  // Branch management modal
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [newBranch, setNewBranch] = useState('');
  const [editingBranch, setEditingBranch] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => { loadBranches(); }, []);

  const loadBranches = async () => {
    const b = await fetchBranches();
    setAvailableBranches(b);
    if (b.length > 0 && !branch) setBranch(b[0]);
  };

  // ── Search ──────────────────────────────────────────────────────────────────

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setError(null);
    setSingleResult(null);
    setPhoneResults(null);
    setSelectedIds(new Set());
    setSuccessMsg('');
    setBulkResult(null);
    setBookingDate(new Date().toISOString().split('T')[0]);

    const isPhone = isPhoneQuery(query);
    setSearchMode(isPhone ? 'phone' : 'code');

    if (isPhone) {
      const results = await fetchVouchersByPhone(query);
      if (results.length === 0) {
        setError('No vouchers found for this phone number.');
      } else {
        setPhoneResults(results);
        // Pre-select all ACTIVE vouchers
        setSelectedIds(new Set(results.filter(v => v.status === VoucherStatus.ACTIVE).map(v => v.id)));
      }
    } else {
      const found = await fetchVoucherByCode(query);
      if (found) {
        setSingleResult(found);
        setBookingDate(found.dates.bookingDate || new Date().toISOString().split('T')[0]);
      } else {
        setError('VOUCHER NOT FOUND');
      }
    }
  };

  // ── Single redeem ────────────────────────────────────────────────────────────

  const handleRedeem = async () => {
    if (!singleResult || !picName) return;
    setRedeeming(true);
    try {
      const updated: Voucher = {
        ...singleResult,
        status: VoucherStatus.REDEEMED,
        dates: { ...singleResult.dates, redemptionDate: new Date().toISOString(), ...(bookingDate ? { bookingDate } : {}) },
        redemption: { branchName: branch },
        workflow: { ...singleResult.workflow, redemptionPicName: picName }
      };
      await updateVoucher(updated);
      setSingleResult(updated);
      setSuccessMsg('REDEMPTION SUCCESSFUL');
    } catch {
      setError('Redemption failed. Try again.');
    } finally {
      setRedeeming(false);
    }
  };

  // ── Bulk redeem ──────────────────────────────────────────────────────────────

  const handleBulkRedeem = async () => {
    if (!phoneResults || selectedIds.size === 0 || !picName) return;
    setBulkRedeeming(true);
    try {
      const toRedeem = phoneResults.filter(v => selectedIds.has(v.id) && v.status === VoucherStatus.ACTIVE);
      const result = await bulkRedeemVouchers(toRedeem, branch, picName, bookingDate);
      setBulkResult(result);
      // Refresh the list
      const refreshed = await fetchVouchersByPhone(query);
      setPhoneResults(refreshed);
      setSelectedIds(new Set());
    } catch (err: any) {
      setError(`Bulk redemption failed: ${err.message}`);
    } finally {
      setBulkRedeeming(false);
    }
  };

  const toggleSelect = (id: string) => {
    const s = new Set(selectedIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedIds(s);
  };

  const activeInResults = phoneResults?.filter(v => v.status === VoucherStatus.ACTIVE) ?? [];
  const allActiveSelected = activeInResults.length > 0 && activeInResults.every(v => selectedIds.has(v.id));

  const toggleAll = () => {
    if (allActiveSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(activeInResults.map(v => v.id)));
  };

  // ── Branch management ────────────────────────────────────────────────────────

  const handleAddBranch = async () => {
    if (newBranch) { await addBranch(newBranch); setNewBranch(''); loadBranches(); }
  };
  const handleRemoveBranch = async (b: string) => { await removeBranch(b); loadBranches(); };
  const startEdit = (b: string) => { setEditingBranch(b); setEditValue(b); };
  const saveEdit = async () => {
    if (editingBranch && editValue.trim()) { await updateBranch(editingBranch, editValue); setEditingBranch(null); loadBranches(); }
  };
  const cancelEdit = () => { setEditingBranch(null); setEditValue(''); };

  // ── Redemption details pane (shared) ────────────────────────────────────────

  const labelClass = "block text-sm font-extrabold text-gray-800 mb-2 uppercase tracking-wide";
  const inputClass = "w-full p-4 border-2 border-gray-300 rounded-lg bg-white text-gray-900 text-lg font-medium focus:ring-4 focus:ring-primary-400 focus:border-primary-500 transition-all outline-none placeholder-gray-400";

  const RedemptionDetailsPane = ({ onConfirm, disabled, loading, label }: { onConfirm: () => void; disabled: boolean; loading: boolean; label: string }) => (
    <div className="pt-8 mt-4 border-t-2 border-gray-100 bg-gray-50 -mx-6 md:-mx-8 px-6 md:px-8 pb-8">
      <h3 className="font-extrabold text-gray-800 mb-6 flex items-center gap-2 text-xl"><MapPin className="text-primary-600" size={24} /> REDEMPTION DETAILS</h3>
      <div className="space-y-6">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className={labelClass}>Select Branch</label>
            <button onClick={() => setIsBranchModalOpen(true)} className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 bg-blue-50 px-2 py-1 rounded">
              <Settings size={12} /> Edit Branches
            </button>
          </div>
          <select className={`${inputClass} appearance-none`} value={branch} onChange={e => setBranch(e.target.value)}>
            {availableBranches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className={labelClass}>PIC Name (Staff)</label>
            <input type="text" className={inputClass} value={picName} disabled />
          </div>
          <div>
            <label className={labelClass}>Booking Date</label>
            <div className="relative">
              <input type="date" className={inputClass} value={bookingDate} onChange={e => setBookingDate(e.target.value)} />
              <Calendar className="absolute right-4 top-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
        <button
          onClick={onConfirm}
          disabled={disabled || loading}
          className="w-full bg-primary-600 text-white font-extrabold py-5 rounded-xl text-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg active:scale-[0.98] mt-4"
        >
          {loading ? 'PROCESSING...' : label}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 p-4 md:p-8 flex items-start justify-center overflow-y-auto">
      <div className="w-full max-w-3xl mt-10">
        <h1 className="text-white text-3xl font-extrabold text-center mb-2 tracking-tight">VOUCHER REDEMPTION KIOSK</h1>
        <p className="text-gray-400 text-center mb-8">Enter Voucher Code, scan QR, or search by phone number.</p>

        {/* Search Box */}
        <form onSubmit={handleSearch} className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <input
              type="text"
              className="w-full pl-6 pr-4 py-5 rounded-2xl text-2xl font-mono font-bold uppercase tracking-widest text-gray-900 bg-white border-4 border-transparent focus:border-primary-400 focus:ring-0 shadow-lg placeholder-gray-300"
              placeholder="GGP-XXXX-XXXX or 01XXXXXXXXX"
              value={query}
              onChange={e => setQuery(e.target.value.toUpperCase())}
            />
          </div>
          <button type="button" onClick={() => handleSearch()} className="bg-primary-500 text-white px-8 rounded-2xl hover:bg-primary-400 shadow-lg transition-transform active:scale-95 flex items-center justify-center">
            <ScanLine size={40} strokeWidth={2.5} />
          </button>
        </form>

        {/* Search hint */}
        <p className="text-gray-500 text-center text-sm mb-6">
          💡 Type a <span className="font-bold text-gray-300">voucher code</span> (GGP-...) for single lookup, or a <span className="font-bold text-gray-300">phone number</span> (01X-...) to see all vouchers for a client.
        </p>

        {/* Error */}
        {error && (
          <div className="bg-rose-100 border-l-8 border-rose-600 text-rose-800 p-6 rounded-lg text-center font-extrabold text-xl mb-8 animate-bounce shadow-md">
            {error}
          </div>
        )}

        {/* ── SINGLE VOUCHER RESULT ── */}
        {singleResult && (
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden mb-20">
            {getStatusBanner(singleResult.status)}
            <div className="p-6 md:p-8">
              <div className="flex flex-col md:flex-row gap-8 mb-8">
                <div className="w-full md:w-5/12">
                  {singleResult.voucherDetails.image ? (
                    <img src={singleResult.voucherDetails.image} alt="Voucher" className="w-full h-56 object-cover rounded-xl border-2 border-gray-100 shadow-sm" />
                  ) : (
                    <div className="w-full h-56 bg-gray-100 rounded-xl flex items-center justify-center text-gray-300 border-2 border-dashed border-gray-200"><ImageIcon size={64} /></div>
                  )}
                </div>
                <div className="flex-1 space-y-5">
                  <div className="border-b border-gray-100 pb-4">
                    <h2 className="text-3xl font-extrabold text-gray-900 leading-tight mb-2">{singleResult.voucherDetails.name}</h2>
                    <span className="bg-primary-50 text-primary-700 px-3 py-1 rounded-md text-sm font-bold border border-primary-100 uppercase">{singleResult.voucherDetails.category}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-6 text-base">
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                      <p className="text-gray-500 text-xs font-bold uppercase mb-1">Client Name</p>
                      <p className="font-bold text-gray-900 text-lg truncate">{singleResult.clientName}</p>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                      <p className="text-gray-500 text-xs font-bold uppercase mb-1">Expiry Date</p>
                      <p className={`font-bold text-lg ${new Date(singleResult.dates.expiryDate) < new Date() ? 'text-red-600' : 'text-gray-900'}`}>{singleResult.dates.expiryDate.split('T')[0]}</p>
                    </div>
                  </div>
                  <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100">
                    <div className="flex items-center gap-2 mb-2 text-yellow-800 font-bold text-sm uppercase"><FileText size={16} /> Terms & Conditions</div>
                    <p className="text-sm text-gray-800 leading-relaxed font-medium">{singleResult.voucherDetails.terms || "Standard terms apply."}</p>
                  </div>
                </div>
              </div>

              {singleResult.status === VoucherStatus.ACTIVE && !successMsg && (
                <RedemptionDetailsPane
                  onConfirm={handleRedeem}
                  disabled={!picName}
                  loading={redeeming}
                  label="CONFIRM REDEMPTION"
                />
              )}

              {(singleResult.status === VoucherStatus.REDEEMED || successMsg) && (
                <div className="mt-4 text-center py-8 border-t-2 border-dashed border-gray-200 bg-green-50/50 rounded-b-xl">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 text-green-600 rounded-full mb-4 shadow-sm border-4 border-white"><CheckCircle size={40} strokeWidth={3} /></div>
                  <h3 className="text-xl font-extrabold text-green-800 mb-1">SUCCESSFULLY REDEEMED</h3>
                  <div className="text-gray-600 font-medium space-y-1 mt-4">
                    <p>Location: <span className="font-bold text-gray-900">{singleResult.redemption.branchName}</span></p>
                    <p>Staff PIC: <span className="font-bold text-gray-900">{singleResult.workflow.redemptionPicName}</span></p>
                    <p>Booking Date: <span className="font-bold text-gray-900">{singleResult.dates.bookingDate || 'N/A'}</span></p>
                    <p className="text-sm mt-2 opacity-75">Timestamp: {new Date(singleResult.dates.redemptionDate || '').toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PHONE SEARCH RESULTS ── */}
        {phoneResults && (
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden mb-20">
            {/* Header */}
            <div className="bg-primary-700 text-white p-5 flex items-center gap-3">
              <Phone size={28} />
              <div>
                <h2 className="text-xl font-extrabold">{phoneResults[0]?.clientName} — {phoneResults.length} voucher{phoneResults.length !== 1 ? 's' : ''} found</h2>
                <p className="text-primary-200 text-sm">{query} · Select which vouchers to redeem below</p>
              </div>
            </div>

            {/* Bulk result banner */}
            {bulkResult && (
              <div className={`px-6 py-4 border-b ${bulkResult.redeemed.length > 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                {bulkResult.redeemed.length > 0 && (
                  <p className="font-bold text-green-800">✅ {bulkResult.redeemed.length} voucher(s) redeemed successfully!</p>
                )}
                {bulkResult.skipped.length > 0 && (
                  <p className="font-bold text-amber-700 flex items-center gap-1 mt-1"><AlertTriangle size={14} /> {bulkResult.skipped.length} skipped (already redeemed/expired): {bulkResult.skipped.join(', ')}</p>
                )}
              </div>
            )}

            {/* Select all */}
            <div className="px-6 py-3 flex items-center gap-3 border-b border-gray-100 bg-gray-50">
              <button onClick={toggleAll} className="flex items-center gap-2 text-sm font-bold text-gray-700 hover:text-primary-700">
                {allActiveSelected ? <CheckSquare size={18} className="text-primary-600" /> : <Square size={18} />}
                Select all active ({activeInResults.length})
              </button>
              <span className="ml-auto text-sm text-gray-500 font-medium">{selectedIds.size} selected</span>
            </div>

            {/* Voucher grid */}
            <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
              {phoneResults.map(v => {
                const isActive = v.status === VoucherStatus.ACTIVE;
                const isSelected = selectedIds.has(v.id);
                return (
                  <div
                    key={v.id}
                    onClick={() => isActive && toggleSelect(v.id)}
                    className={`flex items-center gap-4 px-6 py-4 transition-colors ${isActive ? 'cursor-pointer hover:bg-blue-50' : 'opacity-60 cursor-default'} ${isSelected ? 'bg-blue-50' : ''}`}
                  >
                    <div className="shrink-0">
                      {isActive
                        ? (isSelected ? <CheckSquare size={22} className="text-primary-600" /> : <Square size={22} className="text-gray-400" />)
                        : <Square size={22} className="text-gray-200" />
                      }
                    </div>
                    {v.voucherDetails.image
                      ? <img src={v.voucherDetails.image} alt="" className="w-12 h-12 object-cover rounded-lg border shrink-0" />
                      : <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-300 shrink-0"><ImageIcon size={20} /></div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 truncate">{v.voucherDetails.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{v.voucherCode}</p>
                      <p className="text-xs text-gray-400">Exp: {v.dates.expiryDate.split('T')[0]}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-800">RM{v.voucherDetails.value}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                        v.status === VoucherStatus.ACTIVE ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : v.status === VoucherStatus.REDEEMED ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>{v.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Redemption form for bulk */}
            <div className="p-6 md:p-8">
              {selectedIds.size > 0 && activeInResults.length > 0 && !bulkResult && (
                <RedemptionDetailsPane
                  onConfirm={handleBulkRedeem}
                  disabled={selectedIds.size === 0 || !picName}
                  loading={bulkRedeeming}
                  label={`REDEEM ${selectedIds.size} SELECTED VOUCHER${selectedIds.size > 1 ? 'S' : ''}`}
                />
              )}
              {activeInResults.length === 0 && (
                <div className="text-center py-6 text-gray-400 font-medium">
                  <CheckCircle size={40} className="mx-auto mb-2 text-gray-300" />
                  All vouchers for this client have been redeemed or are inactive.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Branch Management Modal */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-extrabold text-gray-900">Manage Branches</h3>
              <button onClick={() => setIsBranchModalOpen(false)} className="text-gray-400 hover:text-gray-600"><XCircle /></button>
            </div>
            <div className="flex gap-2 mb-6">
              <input className="flex-1 border-2 border-gray-300 p-3 rounded-lg font-medium focus:border-primary-500 outline-none" placeholder="New Branch Name" value={newBranch} onChange={e => setNewBranch(e.target.value)} />
              <button onClick={handleAddBranch} className="bg-green-600 text-white px-4 rounded-lg hover:bg-green-700 shadow-md transition-colors"><Plus size={24} /></button>
            </div>
            <ul className="space-y-3 max-h-60 overflow-y-auto pr-2">
              {availableBranches.map(b => (
                <li key={b} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200 font-medium text-gray-700">
                  {editingBranch === b ? (
                    <div className="flex flex-1 gap-2">
                      <input className="flex-1 border border-primary-300 rounded p-1 text-sm" value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus />
                      <button type="button" onClick={saveEdit} className="text-green-600 hover:bg-green-50 p-1 rounded"><Save size={18} /></button>
                      <button type="button" onClick={cancelEdit} className="text-gray-500 hover:bg-gray-100 p-1 rounded"><X size={18} /></button>
                    </div>
                  ) : (
                    <>
                      <span>{b}</span>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => startEdit(b)} className="text-blue-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded"><Edit2 size={18} /></button>
                        <button type="button" onClick={() => handleRemoveBranch(b)} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"><Trash size={18} /></button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <button onClick={() => setIsBranchModalOpen(false)} className="w-full mt-8 bg-gray-100 text-gray-800 py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors">Done</button>
          </div>
        </div>
      )}
    </div>
  );
};