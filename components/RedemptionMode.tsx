import React, { useState, useEffect } from 'react';
import { fetchVoucherByCode, updateVoucher, fetchBranches, addBranch, removeBranch, updateBranch, getCurrentUser } from '../services/voucherService';
import { Voucher, VoucherStatus } from '../types';
import { Search, ScanLine, CheckCircle, XCircle, MapPin, FileText, Image as ImageIcon, Calendar, Settings, Plus, Trash, Edit2, Save, X } from 'lucide-react';

export const RedemptionMode: React.FC = () => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Voucher | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentUser = getCurrentUser();
  
  // Redemption Form State
  const [branch, setBranch] = useState('');
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [picName, setPicName] = useState(currentUser?.fullName || '');
  const [bookingDate, setBookingDate] = useState('');
  
  const [redeeming, setRedeeming] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Branch Management Modal
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [newBranch, setNewBranch] = useState('');
  const [editingBranch, setEditingBranch] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    const b = await fetchBranches();
    setAvailableBranches(b);
    if (b.length > 0 && !branch) setBranch(b[0]);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setResult(null);
    setSuccessMsg('');
    setBookingDate(''); // Reset booking date on new search

    const found = await fetchVoucherByCode(query);

    if (found) {
      setResult(found);
      // Pre-fill booking date if exists, or today's date
      setBookingDate(found.dates.bookingDate || new Date().toISOString().split('T')[0]);
    } else {
      setError('VOUCHER NOT FOUND');
    }
  };

  const handleRedeem = async () => {
    if (!result || !picName) return;
    setRedeeming(true);
    
    try {
      const updated: Voucher = {
        ...result,
        status: VoucherStatus.REDEEMED,
        dates: {
          ...result.dates,
          redemptionDate: new Date().toISOString(),
          bookingDate: bookingDate || undefined
        },
        redemption: { branchName: branch },
        workflow: {
          ...result.workflow,
          redemptionPicName: picName
        }
      };
      
      await updateVoucher(updated);
      setResult(updated);
      setSuccessMsg('REDEMPTION SUCCESSFUL');
    } catch (err) {
      setError('Redemption failed. Try again.');
    } finally {
      setRedeeming(false);
    }
  };

  // Branch Management Handlers
  const handleAddBranch = async () => {
      if(newBranch) {
          await addBranch(newBranch);
          setNewBranch('');
          loadBranches();
      }
  };
  
  const handleRemoveBranch = async (b: string) => {
      // Removed native confirm as it can be blocked. Direct delete for now.
      await removeBranch(b);
      loadBranches();
  };

  const startEdit = (b: string) => {
      setEditingBranch(b);
      setEditValue(b);
  };

  const saveEdit = async () => {
      if (editingBranch && editValue && editValue.trim() !== '') {
          await updateBranch(editingBranch, editValue);
          setEditingBranch(null);
          loadBranches();
      }
  };

  const cancelEdit = () => {
      setEditingBranch(null);
      setEditValue('');
  };

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

  // Common Input Styles for high visibility
  const labelClass = "block text-sm font-extrabold text-gray-800 mb-2 uppercase tracking-wide";
  const inputClass = "w-full p-4 border-2 border-gray-300 rounded-lg bg-white text-gray-900 text-lg font-medium focus:ring-4 focus:ring-primary-400 focus:border-primary-500 transition-all outline-none placeholder-gray-400";

  return (
    <div className="min-h-screen bg-gray-900 p-4 md:p-8 flex items-start justify-center overflow-y-auto">
      <div className="w-full max-w-3xl mt-10">
        <h1 className="text-white text-3xl font-extrabold text-center mb-2 tracking-tight">VOUCHER REDEMPTION KIOSK</h1>
        <p className="text-gray-400 text-center mb-8">Enter Voucher Code or Scan QR to verify validity.</p>
        
        {/* Search Box */}
        <form onSubmit={handleSearch} className="flex gap-3 mb-8">
          <div className="relative flex-1">
            <input 
              type="text" 
              className="w-full pl-6 pr-4 py-5 rounded-2xl text-3xl font-mono font-bold uppercase tracking-widest text-gray-900 bg-white border-4 border-transparent focus:border-primary-400 focus:ring-0 shadow-lg placeholder-gray-300"
              placeholder="GGP-XXXX-XXXX"
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
            />
          </div>
          <button type="button" onClick={() => handleSearch()} className="bg-primary-500 text-white px-8 rounded-2xl hover:bg-primary-400 shadow-lg transition-transform active:scale-95 flex items-center justify-center">
            <ScanLine size={40} strokeWidth={2.5} />
          </button>
        </form>

        {/* Error State */}
        {error && (
          <div className="bg-rose-100 border-l-8 border-rose-600 text-rose-800 p-6 rounded-lg text-center font-extrabold text-xl mb-8 animate-bounce shadow-md">
            {error}
          </div>
        )}

        {/* Result Card */}
        {result && (
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden mb-20 animate-in fade-in zoom-in duration-300">
            {getStatusBanner(result.status)}
            
            <div className="p-6 md:p-8">
                {/* Voucher Header Info */}
                <div className="flex flex-col md:flex-row gap-8 mb-8">
                    {/* Left: Image */}
                    <div className="w-full md:w-5/12">
                        {result.voucherDetails.image ? (
                            <img src={result.voucherDetails.image} alt="Voucher" className="w-full h-56 object-cover rounded-xl border-2 border-gray-100 shadow-sm" />
                        ) : (
                            <div className="w-full h-56 bg-gray-100 rounded-xl flex items-center justify-center text-gray-300 border-2 border-dashed border-gray-200">
                                <ImageIcon size={64} />
                            </div>
                        )}
                    </div>

                    {/* Right: Details */}
                    <div className="flex-1 space-y-5">
                        <div className="border-b border-gray-100 pb-4">
                            <h2 className="text-3xl font-extrabold text-gray-900 leading-tight mb-2">{result.voucherDetails.name}</h2>
                            <span className="bg-primary-50 text-primary-700 px-3 py-1 rounded-md text-sm font-bold border border-primary-100 uppercase">{result.voucherDetails.category}</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-6 text-base">
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <p className="text-gray-500 text-xs font-bold uppercase mb-1">Client Name</p>
                                <p className="font-bold text-gray-900 text-lg truncate">{result.clientName}</p>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <p className="text-gray-500 text-xs font-bold uppercase mb-1">Expiry Date</p>
                                <p className={`font-bold text-lg ${new Date(result.dates.expiryDate) < new Date() ? 'text-red-600' : 'text-gray-900'}`}>{result.dates.expiryDate.split('T')[0]}</p>
                            </div>
                        </div>

                        {/* Terms Expandable */}
                        <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100">
                             <div className="flex items-center gap-2 mb-2 text-yellow-800 font-bold text-sm uppercase">
                                 <FileText size={16}/> Terms & Conditions
                             </div>
                             <p className="text-sm text-gray-800 leading-relaxed font-medium">
                                 {result.voucherDetails.terms || "Standard terms apply."}
                             </p>
                        </div>
                    </div>
                </div>

              {/* ACTION AREA: Only visible if Active and Not Redeemed yet */}
              {result.status === VoucherStatus.ACTIVE && !successMsg && (
                <div className="pt-8 mt-4 border-t-2 border-gray-100 bg-gray-50 -mx-6 md:-mx-8 px-6 md:px-8 pb-8">
                  <h3 className="font-extrabold text-gray-800 mb-6 flex items-center gap-2 text-xl"><MapPin className="text-primary-600" size={24}/> REDEMPTION DETAILS</h3>
                  
                  <div className="space-y-6">
                    {/* Branch Selection with Edit Button */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                             <label className={labelClass}>Select Branch</label>
                             <button onClick={() => setIsBranchModalOpen(true)} className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 bg-blue-50 px-2 py-1 rounded">
                                <Settings size={12}/> Edit Branches
                             </button>
                        </div>
                        <select 
                            className={`${inputClass} appearance-none`} 
                            value={branch} 
                            onChange={(e) => setBranch(e.target.value)}
                        >
                            {availableBranches.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className={labelClass}>PIC Name (Staff)</label>
                            <input 
                                type="text"
                                className={inputClass}
                                value={picName}
                                disabled
                            />
                        </div>
                        <div>
                             <label className={labelClass}>Booking Date</label>
                             <div className="relative">
                                <input 
                                    type="date"
                                    className={inputClass}
                                    value={bookingDate}
                                    onChange={(e) => setBookingDate(e.target.value)}
                                />
                                <Calendar className="absolute right-4 top-4 text-gray-400 pointer-events-none" />
                             </div>
                        </div>
                    </div>

                    <button 
                      onClick={handleRedeem}
                      disabled={!picName || redeeming}
                      className="w-full bg-primary-600 text-white font-extrabold py-5 rounded-xl text-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg active:scale-[0.98] mt-4"
                    >
                      {redeeming ? 'PROCESSING...' : 'CONFIRM REDEMPTION'}
                    </button>
                  </div>
                </div>
              )}

              {/* History / Success State */}
              {(result.status === VoucherStatus.REDEEMED || successMsg) && (
                <div className="mt-4 text-center py-8 border-t-2 border-dashed border-gray-200 bg-green-50/50 rounded-b-xl">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 text-green-600 rounded-full mb-4 shadow-sm border-4 border-white">
                        <CheckCircle size={40} strokeWidth={3} />
                    </div>
                    <h3 className="text-xl font-extrabold text-green-800 mb-1">SUCCESSFULLY REDEEMED</h3>
                    <div className="text-gray-600 font-medium space-y-1 mt-4">
                        <p>Location: <span className="font-bold text-gray-900">{result.redemption.branchName}</span></p>
                        <p>Staff PIC: <span className="font-bold text-gray-900">{result.workflow.redemptionPicName}</span></p>
                        <p>Booking Date: <span className="font-bold text-gray-900">{result.dates.bookingDate || 'N/A'}</span></p>
                        <p className="text-sm mt-2 opacity-75">Timestamp: {new Date(result.dates.redemptionDate || '').toLocaleString()}</p>
                    </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Branch Management Modal */}
      {isBranchModalOpen && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl p-6 animate-in zoom-in duration-200">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-extrabold text-gray-900">Manage Branches</h3>
                    <button onClick={() => setIsBranchModalOpen(false)} className="text-gray-400 hover:text-gray-600"><XCircle /></button>
                  </div>
                  
                  <div className="flex gap-2 mb-6">
                      <input 
                        className="flex-1 border-2 border-gray-300 p-3 rounded-lg font-medium focus:border-primary-500 outline-none" 
                        placeholder="New Branch Name" 
                        value={newBranch} 
                        onChange={e => setNewBranch(e.target.value)}
                      />
                      <button onClick={handleAddBranch} className="bg-green-600 text-white px-4 rounded-lg hover:bg-green-700 shadow-md transition-colors"><Plus size={24}/></button>
                  </div>

                  <ul className="space-y-3 max-h-60 overflow-y-auto pr-2">
                      {availableBranches.map(b => (
                          <li key={b} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200 font-medium text-gray-700">
                              {editingBranch === b ? (
                                  // Edit Mode
                                  <div className="flex flex-1 gap-2">
                                      <input 
                                        className="flex-1 border border-primary-300 rounded p-1 text-sm" 
                                        value={editValue} 
                                        onChange={e => setEditValue(e.target.value)}
                                        autoFocus
                                      />
                                      <button type="button" onClick={saveEdit} className="text-green-600 hover:bg-green-50 p-1 rounded"><Save size={18}/></button>
                                      <button type="button" onClick={cancelEdit} className="text-gray-500 hover:bg-gray-100 p-1 rounded"><X size={18}/></button>
                                  </div>
                              ) : (
                                  // View Mode
                                  <>
                                    <span>{b}</span>
                                    <div className="flex gap-1">
                                        <button type="button" onClick={() => startEdit(b)} className="text-blue-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded"><Edit2 size={18}/></button>
                                        <button type="button" onClick={() => handleRemoveBranch(b)} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"><Trash size={18}/></button>
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