import React, { useState, useMemo, useEffect } from 'react';
import Papa from 'papaparse';
import { deleteVoucher, updateVoucher, bulkDeleteVouchers, bulkExpireVouchers, fetchVouchers, fetchVoucherGroup, fetchSettings } from '../services/voucherService';
import { useAppData } from '../context/AppDataContext';
import { Voucher, VoucherStatus, SystemSettings } from '../types';
import {
  Edit2, Trash2, Download, User, FileText, Activity, Calendar,
  Image as ImageIcon, ChevronLeft, ChevronRight, BarChart2, ShoppingBag,
  Users, CreditCard, TrendingUp, X, CheckSquare, Square, FileSpreadsheet,
  Printer, Mail, Send, RefreshCcw, Gift
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const CHART_COLORS = ['#0d9488', '#0891b2', '#7c3aed', '#db2777', '#d97706', '#16a34a', '#dc2626', '#2563eb'];

const VoucherStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors: any = {
    'Pending Payment': 'bg-yellow-100 text-yellow-800 border-yellow-300',
    'Active': 'bg-emerald-100 text-emerald-800 border-emerald-300',
    'Redeemed': 'bg-blue-100 text-blue-800 border-blue-300',
    'Expired': 'bg-rose-100 text-rose-800 border-rose-300',
  };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${colors[status] || 'bg-gray-100'}`}>{status}</span>;
};

const InputGroup: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">{label}</label>
    <input
      type="text"
      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

type ReportTab = 'transactions' | 'by-item' | 'by-employee' | 'by-payment' | 'by-agent';

const PAGE_SIZE = 20;

export const Reports: React.FC = () => {
  const { categories, loading: appLoading } = useAppData();
  
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [vouchersLoading, setVouchersLoading] = useState(true);

  const todayStr = new Date().toISOString().split('T')[0];
  
  // Filter State (Defaults to TODAY to prevent Firebase Quota Explosion)
  const [dateRange, setDateRange] = useState({ start: todayStr, end: todayStr });
  const [filterType, setFilterType] = useState<'all' | 'event' | 'salesperson' | 'payment' | 'category'>('all');

  const loadVouchers = async (force = false) => {
      setVouchersLoading(true);
      const data = await fetchVouchers(force, dateRange.start, dateRange.end);
      setVouchers(data);
      setVouchersLoading(false);
  };

  useEffect(() => {
      // Re-fetch only when date boundaries change natively
      loadVouchers();
  }, [dateRange.start, dateRange.end]);

  const [activeTab, setActiveTab] = useState<ReportTab>('transactions');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Other filters
  const [filterValue, setFilterValue] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Edit State
  const [editVoucher, setEditVoucher] = useState<Voucher | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Receipt / Reprint / Resend state
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [receiptGroup, setReceiptGroup] = useState<Voucher[]>([]);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | string>('idle');

  useEffect(() => { fetchSettings().then(setSettings); }, []);

  // Reset page when filters change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => { setCurrentPage(1); }, [dateRange, filterType, filterValue, filterStatus, searchQuery]);

  const uniqueEvents = useMemo(() => Array.from(new Set(vouchers.map(v => v.eventSource))), [vouchers]);
  const uniqueSalesPeople = useMemo(() => Array.from(new Set(vouchers.map(v => v.workflow.salesPersonName))), [vouchers]);
  const uniquePaymentMethods = useMemo(() => Array.from(new Set(vouchers.map(v => v.financials.paymentMethod).filter(Boolean))), [vouchers]);
  const uniqueCategories = useMemo(() => Array.from(new Set(vouchers.map(v => v.voucherDetails.category))), [vouchers]);

  // Base filtered data (used by all tabs)
  const filteredData = useMemo(() => {
    return vouchers.filter(v => {
      const soldDate = v.dates.soldAt.split('T')[0];
      if (dateRange.start && soldDate < dateRange.start) return false;
      if (dateRange.end && soldDate > dateRange.end) return false;
      if (filterStatus !== 'All' && v.status !== filterStatus) return false;
      if (filterType === 'event' && filterValue && !v.eventSource.includes(filterValue)) return false;
      if (filterType === 'salesperson' && filterValue && !v.workflow.salesPersonName.includes(filterValue)) return false;
      if (filterType === 'payment' && filterValue && v.financials.paymentMethod !== filterValue) return false;
      if (filterType === 'category' && filterValue && v.voucherDetails.category !== filterValue) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          v.voucherCode.toLowerCase().includes(q) ||
          v.clientName.toLowerCase().includes(q) ||
          v.email.toLowerCase().includes(q) ||
          v.voucherDetails.name.toLowerCase().includes(q)
        );
      }
      return true;
    }).sort((a, b) => new Date(b.dates.soldAt).getTime() - new Date(a.dates.soldAt).getTime());
  }, [vouchers, dateRange, filterType, filterValue, filterStatus, searchQuery]);

  // Only count paid/active vouchers for analytics (exclude pending AND complimentary)
  const paidData = useMemo(() =>
    filteredData.filter(v => v.status !== VoucherStatus.PENDING_PAYMENT && !v.isComplimentary),
    [filteredData]
  );

  // --- Analytics: Sales per Item ---
  const salesByItem = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    paidData.forEach(v => {
      const name = v.voucherDetails.name;
      if (!map[name]) map[name] = { count: 0, revenue: 0 };
      map[name].count++;
      map[name].revenue += v.voucherDetails.value;
    });
    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [paidData]);

  // --- Analytics: Sales per Employee ---
  const salesByEmployee = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    paidData.forEach(v => {
      let name = v.workflow?.salesPersonName;
      if (!name) {
          if (v.saleChannel === 'Online') name = 'System (Online Store)';
          else if (v.saleChannel === 'Agent' || v.isAgentOrder) name = 'System (Agent Portal)';
          else name = 'Unknown Staff';
      }
      if (!map[name]) map[name] = { count: 0, revenue: 0 };
      map[name].count++;
      map[name].revenue += v.voucherDetails.value;
    });
    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [paidData]);

  // --- Analytics: Sales per Payment Type ---
  const salesByPayment = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    paidData.forEach(v => {
      const method = v.financials.paymentMethod || 'Not recorded';
      if (!map[method]) map[method] = { count: 0, revenue: 0 };
      map[method].count++;
      map[method].revenue += v.voucherDetails.value;
    });
    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [paidData]);

  // --- Analytics: Sales per Agent ---
  const salesByAgent = useMemo(() => {
    const map: Record<string, { count: number; revenue: number; clients: Set<string>; agentCode: string }> = {};
    paidData.filter(v => v.isAgentOrder && v.agentName).forEach(v => {
      const key = v.agentName!;
      if (!map[key]) map[key] = { count: 0, revenue: 0, clients: new Set(), agentCode: v.agentCode || '' };
      map[key].count++;
      map[key].revenue += v.voucherDetails.value;
      if (v.email) map[key].clients.add(v.email);
    });
    return Object.entries(map)
      .map(([name, data]) => ({
        name,
        agentCode: data.agentCode,
        count: data.count,
        revenue: data.revenue,
        uniqueClients: data.clients.size,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [paidData]);

  // Pagination for transactions tab
  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const pagedData = useMemo(
    () => filteredData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredData, currentPage]
  );

  // --- Actions ---
  const handleSoftDelete = async (id: string) => {
    await deleteVoucher(id);
    await loadVouchers(true);
    setIsEditModalOpen(false);
  };

  const handleSaveEdit = async () => {
    if (editVoucher) {
      await updateVoucher(editVoucher);
      setEditVoucher(null);
      setIsEditModalOpen(false);
      await loadVouchers(true);
    }
  };

  const openEdit = (v: Voucher) => { setEditVoucher({ ...v }); setIsEditModalOpen(true); };

  // --- Receipt helpers ---
  const handleOpenReceipt = async (v: Voucher) => {
    setLoadingReceipt(true);
    setResendStatus('idle');
    try {
      const group = await fetchVoucherGroup(v);
      setReceiptGroup(group);
      setShowReceiptModal(true);
    } catch (e) {
      alert('Could not load receipt. Please try again.');
    } finally {
      setLoadingReceipt(false);
    }
  };

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
          <p style="color:#374151;">Here are your e-voucher(s). This is a resent copy for your records.</p>
          ${voucherItems}
          <p style="color:#374151; margin-top:16px;">You can also view all your vouchers at: <a href="${appUrl}/check" style="color:${primary};">${appUrl}/check</a></p>
        </div>
        <div style="background:#f3f4f6; padding:16px 24px; text-align:center;">
          <p style="color:#6b7280; font-size:12px; margin:0;">${vp?.footerText || 'Non-refundable. Subject to availability.'}</p>
        </div>
      </div>
    `;
  };

  const handleResendEmail = async () => {
    if (!settings || !receiptGroup.length) return;
    const email = receiptGroup[0]?.email;
    if (!email) { alert('No email address on file for this client.'); return; }
    setResendStatus('sending');
    const body = generateEmailBody(receiptGroup);
    const subject = `🎫 Your ${settings?.receipt?.businessName || 'GGP'} E-Voucher (Resent)`;
    try {
      if (settings.email.provider === 'SMTP' && settings.email.smtpHost) {
        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email, subject, html: body,
            smtpHost: settings.email.smtpHost,
            smtpPort: settings.email.smtpPort,
            smtpUser: settings.email.smtpUser,
            smtpPass: settings.email.smtpPass,
            senderEmail: settings.email.senderEmail || settings.email.smtpUser,
            senderName: settings.email.senderName || settings.receipt.businessName || 'GGP VMS'
          }),
        });
        const data = await res.json();
        if (data.success) setResendStatus('sent');
        else throw new Error(data.error);
      } else {
        // Simulation mode — just succeed after 1.5s
        await new Promise(r => setTimeout(r, 1500));
        setResendStatus('sent');
      }
    } catch (e: any) {
      console.error('Resend email failed:', e);
      setResendStatus(e.message || 'Unknown network error');
    }
  };

  // --- Bulk ops ---
  const toggleSelectAll = () => {
    if (selectedIds.size === pagedData.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(pagedData.map(v => v.id)));
  };

  const toggleSelect = (id: string) => {
    const s = new Set(selectedIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedIds(s);
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.size || !confirm(`Delete ${selectedIds.size} vouchers? This cannot be undone.`)) return;
    setBulkActionLoading(true);
    await bulkDeleteVouchers(Array.from(selectedIds));
    setSelectedIds(new Set());
    await loadVouchers(true);
    setBulkActionLoading(false);
  };

  const handleBulkExpire = async () => {
    if (!selectedIds.size || !confirm(`Mark ${selectedIds.size} vouchers as Expired?`)) return;
    setBulkActionLoading(true);
    await bulkExpireVouchers(Array.from(selectedIds));
    setSelectedIds(new Set());
    await loadVouchers(true);
    setBulkActionLoading(false);
  };

  const exportReportCSV = () => {
    const csvData = filteredData.map(v => ({
      'Voucher No': v.voucherCode,
      'Client Name': v.clientName,
      'Phone': v.phoneNumber,
      'Email': v.email,
      'Value (RM)': v.voucherDetails.value,
      'Item Name': v.voucherDetails.name,
      'Category': v.voucherDetails.category,
      'Event': v.eventSource,
      'Status': v.status,
      'Complimentary': v.isComplimentary ? 'Yes' : 'No',
      'Sale Channel': v.saleChannel || 'POS',
      'Sold Date': v.dates.soldAt.split('T')[0],
      'Expiry Date': v.dates.expiryDate.split('T')[0],
      'Payment Method': v.financials.paymentMethod || '',
      'Receipt No': v.financials.receiptNo || '',
      'Sales Person': v.workflow.salesPersonName,
      'Redemption Date': v.dates.redemptionDate?.slice(0, 10) || '',
      'Redemption Branch': v.redemption.branchName || '',
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ggp_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const exportReportExcel = async () => {
    const { utils, writeFile } = await import('xlsx');
    const rows = filteredData.map(v => ({
      'Voucher No': v.voucherCode,
      'Client Name': v.clientName,
      'Phone': v.phoneNumber,
      'Email': v.email,
      'Value (RM)': v.voucherDetails.value,
      'Item Name': v.voucherDetails.name,
      'Category': v.voucherDetails.category,
      'Status': v.status,
      'Complimentary': v.isComplimentary ? 'Yes' : 'No',
      'Sale Channel': v.saleChannel || 'POS',
      'Sold Date': v.dates.soldAt.split('T')[0],
      'Expiry Date': v.dates.expiryDate.split('T')[0],
      'Payment Method': v.financials.paymentMethod || '',
      'Receipt No': v.financials.receiptNo || '',
      'Sales Person': v.workflow.salesPersonName,
      'Redemption Date': v.dates.redemptionDate?.slice(0, 10) || '',
      'Redemption Branch': v.redemption.branchName || '',
    }));
    const ws = utils.json_to_sheet(rows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Voucher Report');
    writeFile(wb, `ggp_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setShowExportMenu(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editVoucher) {
      if (file.size > 500000) { alert('Image too large (Max 500kb)'); return; }
      const reader = new FileReader();
      reader.onloadend = () => setEditVoucher({ ...editVoucher, voucherDetails: { ...editVoucher.voucherDetails, image: reader.result as string } });
      reader.readAsDataURL(file);
    }
  };

  const handleDateClick = (e: React.MouseEvent<HTMLInputElement>) => {
    try { if ((e.currentTarget as any).showPicker) (e.currentTarget as any).showPicker(); } catch { }
  };

  const inputClass = "w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm";
  const dateInputClass = `${inputClass} cursor-pointer`;
  const labelClass = "block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide";

  const totalRevenue = paidData.reduce((s, v) => s + v.voucherDetails.value, 0);

  if (appLoading || vouchersLoading) return <div className="p-8 text-center text-gray-600 font-medium">Loading Reports...</div>;

  const tabs: { id: ReportTab; label: string; icon: React.ReactNode }[] = [
    { id: 'transactions', label: 'All Transactions', icon: <FileText size={16} /> },
    { id: 'by-item', label: 'By Item', icon: <ShoppingBag size={16} /> },
    { id: 'by-employee', label: 'By Employee', icon: <Users size={16} /> },
    { id: 'by-payment', label: 'By Payment', icon: <CreditCard size={16} /> },
    { id: 'by-agent', label: 'By Agent', icon: <Activity size={16} /> },
  ];

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-primary-900 tracking-tight">Reporting Center</h1>
          <p className="text-gray-500 font-medium">Detailed logs, analytics, and transaction history.</p>
        </div>
        <div className="relative">
          <button onClick={() => setShowExportMenu(!showExportMenu)} className="bg-gray-800 text-white px-5 py-3 rounded-lg flex items-center gap-2 hover:bg-gray-900 shadow-md font-bold whitespace-nowrap">
            <Download size={18} /> Export ▾
          </button>
          {showExportMenu && (
            <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded-xl shadow-xl z-20">
              <button onClick={exportReportCSV} className="w-full text-left px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 rounded-t-xl">
                <FileSpreadsheet size={16} className="text-green-600" /> Export CSV
              </button>
              <button onClick={exportReportExcel} className="w-full text-left px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 rounded-b-xl border-t">
                <FileSpreadsheet size={16} className="text-blue-600" /> Export Excel (.xlsx)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 border border-gray-700">
          <span className="font-bold text-sm">{selectedIds.size} selected</span>
          <button onClick={handleBulkExpire} disabled={bulkActionLoading} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
            Mark Expired
          </button>
          <button onClick={handleBulkDelete} disabled={bulkActionLoading} className="bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
            Delete
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:text-white transition-colors"><X size={18}/></button>
        </div>
      )}

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Revenue', value: `RM${totalRevenue.toLocaleString()}`, color: 'bg-emerald-600' },
          { label: 'Vouchers Sold', value: paidData.length, color: 'bg-teal-600' },
          { label: 'Pending Payment', value: filteredData.filter(v => v.status === VoucherStatus.PENDING_PAYMENT).length, color: 'bg-yellow-500' },
          { label: 'Redeemed', value: filteredData.filter(v => v.status === VoucherStatus.REDEEMED).length, color: 'bg-blue-600' },
        ].map(card => (
          <div key={card.label} className={`${card.color} p-5 rounded-xl text-white shadow-md`}>
            <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">{card.label}</p>
            <p className="text-2xl font-extrabold">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters Panel */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <div>
            <label className={labelClass}>Start Date</label>
            <input type="date" className={dateInputClass} style={{ colorScheme: 'light' }} value={dateRange.start}
              onChange={e => setDateRange({ ...dateRange, start: e.target.value })} onClick={handleDateClick} />
          </div>
          <div>
            <label className={labelClass}>End Date</label>
            <input type="date" className={dateInputClass} style={{ colorScheme: 'light' }} value={dateRange.end}
              onChange={e => setDateRange({ ...dateRange, end: e.target.value })} onClick={handleDateClick} />
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select className={inputClass} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="All">All Statuses</option>
              {Object.values(VoucherStatus).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Group By</label>
            <select className={inputClass} value={filterType} onChange={e => { setFilterType(e.target.value as any); setFilterValue(''); }}>
              <option value="all">All Data</option>
              <option value="event">Per Event</option>
              <option value="salesperson">Per Sales Person</option>
              <option value="payment">Per Payment Method</option>
              <option value="category">Per Category</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Filter Value</label>
            {filterType === 'all' ? (
              <input type="text" disabled className="w-full border border-gray-200 rounded-lg p-2.5 bg-gray-100 text-gray-400 text-sm cursor-not-allowed" placeholder="N/A" />
            ) : filterType === 'event' ? (
              <select className={inputClass} value={filterValue} onChange={e => setFilterValue(e.target.value)}>
                <option value="">All Events</option>
                {uniqueEvents.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            ) : filterType === 'salesperson' ? (
              <select className={inputClass} value={filterValue} onChange={e => setFilterValue(e.target.value)}>
                <option value="">All Staff</option>
                {uniqueSalesPeople.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : filterType === 'payment' ? (
              <select className={inputClass} value={filterValue} onChange={e => setFilterValue(e.target.value)}>
                <option value="">All Methods</option>
                {uniquePaymentMethods.map(p => <option key={p as string} value={p as string}>{p as string}</option>)}
              </select>
            ) : (
              <select className={inputClass} value={filterValue} onChange={e => setFilterValue(e.target.value)}>
                <option value="">All Categories</option>
                {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className={labelClass}>Search</label>
            <input type="text" className={inputClass} placeholder="Code / Name / Email..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </div>

        {(dateRange.start || dateRange.end || filterValue || filterStatus !== 'All' || searchQuery) && (
          <button
            onClick={() => { setDateRange({ start: '', end: '' }); setFilterValue(''); setFilterStatus('All'); setSearchQuery(''); setFilterType('all'); }}
            className="mt-3 text-sm text-red-600 hover:text-red-800 font-bold underline"
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm whitespace-nowrap transition-all ${activeTab === tab.id
              ? 'bg-primary-600 text-white shadow-md'
              : 'text-gray-500 hover:bg-gray-100'
              }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ===== TAB: ALL TRANSACTIONS ===== */}
      {activeTab === 'transactions' && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-100 text-gray-700 font-extrabold uppercase text-xs tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-3 w-10">
                      <button onClick={toggleSelectAll} className="text-gray-500 hover:text-primary-600">
                        {selectedIds.size === pagedData.length && pagedData.length > 0 ? <CheckSquare size={16}/> : <Square size={16}/>}
                      </button>
                    </th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Voucher No</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Sold At</th>
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Channel</th>
                    <th className="px-4 py-3">Sales By</th>
                    <th className="px-4 py-3">Redemption</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pagedData.map(v => (
                    <tr key={v.id} className={`hover:bg-blue-50 transition-colors ${selectedIds.has(v.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-3 py-3">
                        <button onClick={() => toggleSelect(v.id)} className="text-gray-400 hover:text-primary-600">
                          {selectedIds.has(v.id) ? <CheckSquare size={16} className="text-primary-600"/> : <Square size={16}/>}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => openEdit(v)} className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 text-xs font-bold">
                            <Edit2 size={13} /> Edit
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => handleOpenReceipt(v)}
                            disabled={loadingReceipt}
                            className="text-teal-600 hover:text-teal-800 hover:underline flex items-center gap-1 text-xs font-bold disabled:opacity-40"
                          >
                            {loadingReceipt ? <RefreshCcw size={12} className="animate-spin" /> : <Printer size={12} />}
                            Receipt
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-gray-700 text-xs">{v.voucherCode}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{v.clientName}</td>
                      <td className="px-4 py-3 text-gray-800 font-bold">RM{v.voucherDetails.value}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          <VoucherStatusBadge status={v.status} />
                          {v.isComplimentary && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold border bg-teal-50 text-teal-700 border-teal-200 flex items-center gap-1">
                              <Gift size={10} /> Comp
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{v.dates.soldAt.slice(0, 10)}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-[140px] truncate">{v.voucherDetails.name}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{v.financials.paymentMethod || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${
                          v.saleChannel === 'Online' ? 'bg-blue-100 text-blue-700 border-blue-200'
                          : v.saleChannel === 'Agent' ? 'bg-teal-100 text-teal-700 border-teal-200'
                          : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}>
                          {v.saleChannel || 'POS'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{v.workflow.salesPersonName}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {v.status === VoucherStatus.REDEEMED ? `${v.dates.redemptionDate?.slice(0, 10)} @ ${v.redemption.branchName}` : '-'}
                      </td>
                    </tr>
                  ))}
                  {filteredData.length === 0 && (
                    <tr><td colSpan={11} className="text-center py-12 text-gray-400 font-medium">No records found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm">
              <p className="text-sm text-gray-500 font-medium">
                Showing <span className="font-bold text-gray-800">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredData.length)}</span> of <span className="font-bold text-gray-800">{filteredData.length}</span> records
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>

                {/* Page number pills */}
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 7) {
                    page = i + 1;
                  } else if (currentPage <= 4) {
                    page = i + 1;
                  } else if (currentPage >= totalPages - 3) {
                    page = totalPages - 6 + i;
                  } else {
                    page = currentPage - 3 + i;
                  }
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${currentPage === page ? 'bg-primary-600 text-white shadow-md' : 'border border-gray-200 hover:bg-gray-100 text-gray-700'}`}
                    >
                      {page}
                    </button>
                  );
                })}

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== TAB: BY ITEM ===== */}
      {activeTab === 'by-item' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-lg"><BarChart2 size={20} className="text-primary-600" /> Revenue by Voucher Type</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesByItem} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={v => `RM${v.toLocaleString()}`} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: any) => [`RM${Number(value).toLocaleString()}`, 'Revenue']} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {salesByItem.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-700 font-extrabold uppercase text-xs tracking-wider border-b">
                <tr>
                  <th className="px-5 py-3 text-left">#</th>
                  <th className="px-5 py-3 text-left">Voucher Name</th>
                  <th className="px-5 py-3 text-right">Units Sold</th>
                  <th className="px-5 py-3 text-right">Revenue</th>
                  <th className="px-5 py-3 text-right">% of Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {salesByItem.map((item, i) => (
                  <tr key={item.name} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-500 font-bold">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{item.name}</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-700">{item.count}</td>
                    <td className="px-5 py-3 text-right font-bold text-emerald-700">RM{item.revenue.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-gray-500">
                      {totalRevenue > 0 ? ((item.revenue / totalRevenue) * 100).toFixed(1) : '0'}%
                    </td>
                  </tr>
                ))}
                {salesByItem.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-gray-400">No data</td></tr>}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={2} className="px-5 py-3 font-extrabold text-gray-800">TOTAL</td>
                  <td className="px-5 py-3 text-right font-extrabold text-gray-800">{salesByItem.reduce((s, i) => s + i.count, 0)}</td>
                  <td className="px-5 py-3 text-right font-extrabold text-emerald-700">RM{totalRevenue.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right font-extrabold text-gray-500">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ===== TAB: BY EMPLOYEE ===== */}
      {activeTab === 'by-employee' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-lg"><TrendingUp size={20} className="text-primary-600" /> Sales Revenue by Employee</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesByEmployee}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={v => `RM${v.toLocaleString()}`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: any) => [`RM${Number(value).toLocaleString()}`, 'Revenue']} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {salesByEmployee.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-700 font-extrabold uppercase text-xs tracking-wider border-b">
                <tr>
                  <th className="px-5 py-3 text-left">#</th>
                  <th className="px-5 py-3 text-left">Employee</th>
                  <th className="px-5 py-3 text-right">Vouchers Sold</th>
                  <th className="px-5 py-3 text-right">Revenue</th>
                  <th className="px-5 py-3 text-right">Avg per Sale</th>
                  <th className="px-5 py-3 text-right">% of Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {salesByEmployee.map((emp, i) => (
                  <tr key={emp.name} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-500 font-bold">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-gray-900 flex items-center gap-2"><User size={16} className="text-gray-400" />{emp.name}</td>
                    <td className="px-5 py-3 text-right font-bold text-gray-700">{emp.count}</td>
                    <td className="px-5 py-3 text-right font-bold text-emerald-700">RM{emp.revenue.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-gray-500">RM{(emp.revenue / emp.count).toFixed(0)}</td>
                    <td className="px-5 py-3 text-right text-gray-500">{totalRevenue > 0 ? ((emp.revenue / totalRevenue) * 100).toFixed(1) : '0'}%</td>
                  </tr>
                ))}
                {salesByEmployee.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-gray-400">No data</td></tr>}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={2} className="px-5 py-3 font-extrabold text-gray-800">TOTAL</td>
                  <td className="px-5 py-3 text-right font-extrabold text-gray-800">{salesByEmployee.reduce((s, e) => s + e.count, 0)}</td>
                  <td className="px-5 py-3 text-right font-extrabold text-emerald-700">RM{totalRevenue.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right" />
                  <td className="px-5 py-3 text-right font-extrabold text-gray-500">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ===== TAB: BY PAYMENT ===== */}
      {activeTab === 'by-payment' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-lg"><CreditCard size={20} className="text-primary-600" /> Sales by Payment Method</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={salesByPayment}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                <YAxis tickFormatter={v => `RM${v.toLocaleString()}`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: any) => [`RM${Number(value).toLocaleString()}`, 'Revenue']} />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {salesByPayment.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-700 font-extrabold uppercase text-xs tracking-wider border-b">
                <tr>
                  <th className="px-5 py-3 text-left">Payment Method</th>
                  <th className="px-5 py-3 text-right">Transactions</th>
                  <th className="px-5 py-3 text-right">Revenue</th>
                  <th className="px-5 py-3 text-right">% of Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {salesByPayment.map(method => (
                  <tr key={method.name} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-2 font-bold text-gray-800">
                        <CreditCard size={16} className="text-gray-400" />
                        {method.name}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-gray-700">{method.count}</td>
                    <td className="px-5 py-3 text-right font-bold text-emerald-700">RM{method.revenue.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-gray-500">{totalRevenue > 0 ? ((method.revenue / totalRevenue) * 100).toFixed(1) : '0'}%</td>
                  </tr>
                ))}
                {salesByPayment.length === 0 && <tr><td colSpan={4} className="text-center py-10 text-gray-400">No data</td></tr>}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="px-5 py-3 font-extrabold text-gray-800">TOTAL</td>
                  <td className="px-5 py-3 text-right font-extrabold text-gray-800">{salesByPayment.reduce((s, m) => s + m.count, 0)}</td>
                  <td className="px-5 py-3 text-right font-extrabold text-emerald-700">RM{totalRevenue.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right font-extrabold text-gray-500">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ===== TAB: BY AGENT ===== */}
      {activeTab === 'by-agent' && (
        <div className="space-y-6">
          {salesByAgent.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <Activity size={40} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 font-medium">No agent orders found in this date range.</p>
              <p className="text-gray-400 text-sm mt-1">Agent sales appear here once agents complete purchases through the Agent Portal.</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-lg"><Activity size={20} className="text-primary-600" /> Revenue by Agent</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salesByAgent} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tickFormatter={v => `RM${v.toLocaleString()}`} tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: any) => [`RM${Number(value).toLocaleString()}`, 'Revenue']} />
                    <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                      {salesByAgent.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 text-gray-700 font-extrabold uppercase text-xs tracking-wider border-b">
                    <tr>
                      <th className="px-5 py-3 text-left">#</th>
                      <th className="px-5 py-3 text-left">Agent</th>
                      <th className="px-5 py-3 text-left">Code</th>
                      <th className="px-5 py-3 text-right">Vouchers</th>
                      <th className="px-5 py-3 text-right">Unique Clients</th>
                      <th className="px-5 py-3 text-right">Revenue</th>
                      <th className="px-5 py-3 text-right">Avg / Voucher</th>
                      <th className="px-5 py-3 text-right">% of Agent Rev</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {salesByAgent.map((agent, i) => {
                      const agentTotal = salesByAgent.reduce((s, a) => s + a.revenue, 0);
                      return (
                        <tr key={agent.name} className="hover:bg-gray-50">
                          <td className="px-5 py-3 text-gray-500 font-bold">{i + 1}</td>
                          <td className="px-5 py-3 font-bold text-gray-900">{agent.name}</td>
                          <td className="px-5 py-3 font-mono text-xs text-teal-700 bg-teal-50 rounded-lg">{agent.agentCode}</td>
                          <td className="px-5 py-3 text-right font-bold text-gray-700">{agent.count}</td>
                          <td className="px-5 py-3 text-right text-gray-600">{agent.uniqueClients}</td>
                          <td className="px-5 py-3 text-right font-bold text-emerald-700">RM{agent.revenue.toLocaleString()}</td>
                          <td className="px-5 py-3 text-right text-gray-500">RM{(agent.revenue / agent.count).toFixed(0)}</td>
                          <td className="px-5 py-3 text-right text-gray-500">{agentTotal > 0 ? ((agent.revenue / agentTotal) * 100).toFixed(1) : '0'}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td colSpan={3} className="px-5 py-3 font-extrabold text-gray-800">TOTAL (Agent Channel)</td>
                      <td className="px-5 py-3 text-right font-extrabold text-gray-800">{salesByAgent.reduce((s, a) => s + a.count, 0)}</td>
                      <td className="px-5 py-3 text-right font-extrabold text-gray-800">{salesByAgent.reduce((s, a) => s + a.uniqueClients, 0)}</td>
                      <td className="px-5 py-3 text-right font-extrabold text-emerald-700">RM{salesByAgent.reduce((s, a) => s + a.revenue, 0).toLocaleString()}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && editVoucher && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-gray-50 sticky top-0 z-10">
              <h3 className="text-2xl font-bold text-gray-800">Edit Voucher: <span className="font-mono text-primary-700">{editVoucher.voucherCode}</span></h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-800 p-1 hover:bg-gray-200 rounded-full transition-colors"><X size={22} /></button>
            </div>

            <div className="p-8 space-y-8">
              <section>
                <h4 className="flex items-center gap-2 font-bold text-primary-800 mb-5 border-b pb-2 text-lg"><User size={20} /> Client & Voucher Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <InputGroup label="Client Name" value={editVoucher.clientName} onChange={v => setEditVoucher({ ...editVoucher, clientName: v })} />
                  <InputGroup label="Phone" value={editVoucher.phoneNumber} onChange={v => setEditVoucher({ ...editVoucher, phoneNumber: v })} />
                  <InputGroup label="Email" value={editVoucher.email} onChange={v => setEditVoucher({ ...editVoucher, email: v })} />
                  <InputGroup label="Voucher Name" value={editVoucher.voucherDetails.name} onChange={v => setEditVoucher({ ...editVoucher, voucherDetails: { ...editVoucher.voucherDetails, name: v } })} />
                  <div>
                    <label className={labelClass}>Value (RM)</label>
                    <input type="number" className={inputClass} value={editVoucher.voucherDetails.value}
                      onChange={e => setEditVoucher({ ...editVoucher, voucherDetails: { ...editVoucher.voucherDetails, value: Number(e.target.value) } })} />
                  </div>
                  <div>
                    <label className={labelClass}>Category</label>
                    <select className={inputClass} value={editVoucher.voucherDetails.category}
                      onChange={e => setEditVoucher({ ...editVoucher, voucherDetails: { ...editVoucher.voucherDetails, category: e.target.value } })}>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-5">
                  <label className={labelClass}>Terms & Conditions</label>
                  <textarea className={`${inputClass} min-h-[80px]`} rows={3} value={editVoucher.voucherDetails.terms || ''}
                    onChange={e => setEditVoucher({ ...editVoucher, voucherDetails: { ...editVoucher.voucherDetails, terms: e.target.value } })} />
                </div>
              </section>

              <section>
                <h4 className="flex items-center gap-2 font-bold text-primary-800 mb-5 border-b pb-2 text-lg"><ImageIcon size={20} /> Voucher Image</h4>
                <div className="flex gap-6 items-start">
                  {editVoucher.voucherDetails.image ? (
                    <img src={editVoucher.voucherDetails.image} alt="Voucher" className="h-32 w-32 object-cover rounded-lg border border-gray-200 shadow-sm" />
                  ) : (
                    <div className="h-32 w-32 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-xs text-center p-2 border border-dashed border-gray-300">No Image</div>
                  )}
                  <div className="flex-1">
                    <label className={labelClass}>Update Image (Max 500KB)</label>
                    <input type="file" accept="image/*" onChange={handleImageUpload}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer border border-gray-200 rounded-lg" />
                  </div>
                </div>
              </section>

              <section>
                <h4 className="flex items-center gap-2 font-bold text-primary-800 mb-5 border-b pb-2 text-lg"><Calendar size={20} /> Dates & Status</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className={labelClass}>Status</label>
                    <select className={inputClass} value={editVoucher.status} onChange={e => setEditVoucher({ ...editVoucher, status: e.target.value as VoucherStatus })}>
                      {Object.values(VoucherStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Sold Date</label>
                    <input type="datetime-local" className={dateInputClass} style={{ colorScheme: 'light' }} onClick={handleDateClick}
                      value={editVoucher.dates.soldAt.slice(0, 16)}
                      onChange={e => setEditVoucher({ ...editVoucher, dates: { ...editVoucher.dates, soldAt: new Date(e.target.value).toISOString() } })} />
                  </div>
                  <div>
                    <label className={labelClass}>Expiry Date</label>
                    <input type="date" className={dateInputClass} style={{ colorScheme: 'light' }} onClick={handleDateClick}
                      value={editVoucher.dates.expiryDate.split('T')[0]}
                      onChange={e => setEditVoucher({ ...editVoucher, dates: { ...editVoucher.dates, expiryDate: new Date(e.target.value).toISOString() } })} />
                  </div>
                  <div>
                    <label className={labelClass}>Booking Date</label>
                    <input type="date" className={dateInputClass} style={{ colorScheme: 'light' }} onClick={handleDateClick}
                      value={editVoucher.dates.bookingDate || ''}
                      onChange={e => setEditVoucher({ ...editVoucher, dates: { ...editVoucher.dates, bookingDate: e.target.value } })} />
                  </div>
                  <div>
                    <label className={labelClass}>Redemption Date</label>
                    <input type="datetime-local" className={dateInputClass} style={{ colorScheme: 'light' }} onClick={handleDateClick}
                      value={editVoucher.dates.redemptionDate ? editVoucher.dates.redemptionDate.slice(0, 16) : ''}
                      onChange={e => setEditVoucher({ ...editVoucher, dates: { ...editVoucher.dates, redemptionDate: e.target.value ? new Date(e.target.value).toISOString() : undefined } })} />
                  </div>
                </div>
              </section>

              <section>
                <h4 className="flex items-center gap-2 font-bold text-primary-800 mb-5 border-b pb-2 text-lg"><FileText size={20} /> Financials & Workflow</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  <InputGroup label="Sales Person" value={editVoucher.workflow.salesPersonName} onChange={v => setEditVoucher({ ...editVoucher, workflow: { ...editVoucher.workflow, salesPersonName: v } })} />
                  <InputGroup label="Cashier Name" value={editVoucher.workflow.cashierName || ''} onChange={v => setEditVoucher({ ...editVoucher, workflow: { ...editVoucher.workflow, cashierName: v } })} />
                  <InputGroup label="Redemption PIC" value={editVoucher.workflow.redemptionPicName || ''} onChange={v => setEditVoucher({ ...editVoucher, workflow: { ...editVoucher.workflow, redemptionPicName: v } })} />
                  <InputGroup label="Redemption Branch" value={editVoucher.redemption.branchName || ''} onChange={v => setEditVoucher({ ...editVoucher, redemption: { ...editVoucher.redemption, branchName: v } })} />
                  <InputGroup label="Receipt No" value={editVoucher.financials.receiptNo || ''} onChange={v => setEditVoucher({ ...editVoucher, financials: { ...editVoucher.financials, receiptNo: v } })} />
                  <InputGroup label="Invoice No" value={editVoucher.financials.invoiceNo || ''} onChange={v => setEditVoucher({ ...editVoucher, financials: { ...editVoucher.financials, invoiceNo: v } })} />
                  <div>
                    <label className={labelClass}>Payment Method</label>
                    <select className={inputClass} value={editVoucher.financials.paymentMethod || ''}
                      onChange={e => setEditVoucher({ ...editVoucher, financials: { ...editVoucher.financials, paymentMethod: e.target.value as any } })}>
                      <option value="">None</option>
                      <option value="Cash">Cash</option>
                      <option value="QR">QR</option>
                      <option value="Terminal">Terminal</option>
                      <option value="Online">Online</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Sale Channel</label>
                    <select className={inputClass} value={editVoucher.saleChannel || 'POS'}
                      onChange={e => setEditVoucher({ ...editVoucher, saleChannel: e.target.value as any })}>
                      <option value="POS">POS</option>
                      <option value="Online">Online</option>
                    </select>
                  </div>
                </div>
              </section>
            </div>

            <div className="p-6 border-t bg-gray-50 flex justify-between items-center rounded-b-xl sticky bottom-0">
              <button onClick={() => handleSoftDelete(editVoucher.id)}
                className="px-5 py-2.5 text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2 border border-transparent hover:border-red-200 transition-colors font-medium">
                <Trash2 size={18} /> Delete Voucher
              </button>
              <div className="flex gap-3">
                <button onClick={() => setIsEditModalOpen(false)} className="px-6 py-2.5 text-gray-700 hover:bg-gray-200 rounded-lg font-bold transition-colors">Cancel</button>
                <button onClick={handleSaveEdit} className="px-8 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-md font-bold transition-all active:scale-95">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Receipt / Reprint / Resend Modal */}
      {showReceiptModal && receiptGroup.length > 0 && settings && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col max-h-[92vh]">

            {/* Header */}
            <div className="p-4 bg-primary-600 text-white flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base">Receipt Recovery</h3>
                <p className="text-xs text-primary-200">Client: {receiptGroup[0].clientName} · {receiptGroup.length} voucher{receiptGroup.length > 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => { setShowReceiptModal(false); setResendStatus('idle'); }}>
                <X size={20} />
              </button>
            </div>

            {/* Resend status banner */}
            {resendStatus === 'sending' && (
              <div className="bg-blue-50 px-4 py-2 text-center text-xs font-bold text-blue-800 flex items-center justify-center gap-2">
                <Mail size={12} className="animate-pulse" /> Sending email to {receiptGroup[0].email}...
              </div>
            )}
            {resendStatus === 'sent' && (
              <div className="bg-emerald-50 px-4 py-2 text-center text-xs font-bold text-emerald-800 flex items-center justify-center gap-2">
                <Send size={12} /> ✅ Email sent successfully to {receiptGroup[0].email}
              </div>
            )}
            {resendStatus !== 'idle' && resendStatus !== 'sending' && resendStatus !== 'sent' && (
              <div className="bg-red-50 px-4 py-2 text-center text-xs font-bold text-red-700 flex items-center justify-center gap-2">
                ❌ {resendStatus}
              </div>
            )}

            {/* Thermal receipt area */}
            <div
              className={`p-6 overflow-y-auto bg-white font-mono text-sm print-only mx-auto ${
                settings.receipt.printerWidth === '58mm' ? 'text-[10px]' : ''
              }`}
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
                {receiptGroup[0].financials?.receiptNo && <span>RCPT: {receiptGroup[0].financials.receiptNo}</span>}
                <span>{new Date(receiptGroup[0].dates.soldAt).toLocaleDateString()}</span>
              </div>
              <div className="text-xs mb-2">Client: {receiptGroup[0].clientName}</div>
              {receiptGroup[0].email && <div className="text-xs mb-2 text-gray-500">Email: {receiptGroup[0].email}</div>}

              <div className="border-b border-dashed border-gray-400 my-2"></div>

              <div className="space-y-1">
                {receiptGroup.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="truncate w-32">{item.voucherDetails.name}</span>
                    <span>RM{item.voucherDetails.value.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-b border-dashed border-gray-400 my-2"></div>
              <div className="flex justify-between font-bold text-lg">
                <span>TOTAL</span>
                <span>RM{receiptGroup.reduce((acc, v) => acc + v.voucherDetails.value, 0).toFixed(2)}</span>
              </div>

              {receiptGroup[0].financials?.paymentMethod === 'Cash' && receiptGroup[0].financials?.cashReceived !== undefined && (
                <div className="mt-2 text-xs">
                  <div className="flex justify-between"><span>CASH REC</span><span>RM{receiptGroup[0].financials.cashReceived.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>CHANGE</span><span>RM{receiptGroup[0].financials.changeAmount?.toFixed(2)}</span></div>
                </div>
              )}

              <div className="text-right text-xs mt-2 font-bold uppercase">Paid via: {receiptGroup[0].financials?.paymentMethod || 'N/A'}</div>
              {receiptGroup[0].workflow?.cashierName && (
                <div className="text-right text-xs font-bold uppercase">Cashier: {receiptGroup[0].workflow.cashierName}</div>
              )}

              <div className="border-b border-dashed border-gray-400 my-4"></div>
              <div className="text-center font-bold mb-2 uppercase text-xs">-- Voucher Entitlements --</div>

              {receiptGroup.map((v, i) => (
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
              <p className="text-center text-[9px] text-gray-400 mt-3 italic">** REPRINT **</p>
            </div>

            {/* Action buttons */}
            <div className="p-4 border-t bg-gray-50 flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 bg-gray-800 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-gray-900 transition-colors"
              >
                <Printer size={16} /> Reprint
              </button>
              <button
                onClick={handleResendEmail}
                disabled={resendStatus === 'sending' || resendStatus === 'sent'}
                className="flex-1 bg-teal-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                {resendStatus === 'sending' ? (
                  <><RefreshCcw size={14} className="animate-spin" /> Sending...</>
                ) : resendStatus === 'sent' ? (
                  <>✅ Sent!</>
                ) : (
                  <><Mail size={16} /> Resend Email</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};