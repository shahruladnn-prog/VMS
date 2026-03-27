import React, { useEffect, useState, useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useAppData } from '../context/AppDataContext';
import { fetchVouchers } from '../services/voucherService';
import { Voucher, VoucherStatus } from '../types';
import { AlertTriangle } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

export const Dashboard: React.FC = () => {
  const { categories, loading: appLoading } = useAppData();
  
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [vouchersLoading, setVouchersLoading] = useState(true);

  // Dashboard Overview Filters (Defaults to TODAY to prevent Firebase Quota Explosion)
  const todayStr = new Date().toISOString().split('T')[0];
  const [overviewDateRange, setOverviewDateRange] = useState({ start: todayStr, end: todayStr });
  const [overviewCategory, setOverviewCategory] = useState<string>('');

  useEffect(() => {
      setVouchersLoading(true);
      fetchVouchers(false, overviewDateRange.start, overviewDateRange.end).then(data => {
          setVouchers(data);
          setVouchersLoading(false);
      });
  }, [overviewDateRange.start, overviewDateRange.end]);

  // --- Expiry Alert ---
  const expiringVouchers = useMemo(() => {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return vouchers.filter(v =>
      v.status === VoucherStatus.ACTIVE &&
      new Date(v.dates.expiryDate) <= thirtyDaysFromNow &&
      new Date(v.dates.expiryDate) >= new Date()
    );
  }, [vouchers]);

  // --- Dashboard Overview Logic ---
  const dashboardData = useMemo(() => {
    return vouchers.filter(v => {
       if (overviewDateRange.start && new Date(v.dates.soldAt) < new Date(overviewDateRange.start)) return false;
       if (overviewDateRange.end) {
         const endDate = new Date(overviewDateRange.end);
         endDate.setHours(23, 59, 59);
         if (new Date(v.dates.soldAt) > endDate) return false;
       }
       if (overviewCategory && v.voucherDetails.category !== overviewCategory) return false;
       return true;
    });
  }, [vouchers, overviewDateRange, overviewCategory]);

  const dashboardStats = useMemo(() => {
    const activeVouchers = dashboardData.filter(v => v.status !== VoucherStatus.PENDING_PAYMENT);
    const totalRevenue = activeVouchers.reduce((sum, v) => sum + v.voucherDetails.value, 0);
    const totalSold = activeVouchers.length;
    const redeemedCount = activeVouchers.filter(v => v.status === VoucherStatus.REDEEMED).length;
    const redemptionRate = totalSold > 0 ? (redeemedCount / totalSold) * 100 : 0;
    const pendingCount = dashboardData.filter(v => v.status === VoucherStatus.PENDING_PAYMENT).length;
    return { totalRevenue, totalSold, redeemedCount, redemptionRate, pendingCount };
  }, [dashboardData]);

  // Chart Data: Status Distribution
  const statusData = useMemo(() => {
    const counts = { [VoucherStatus.ACTIVE]: 0, [VoucherStatus.REDEEMED]: 0, [VoucherStatus.EXPIRED]: 0, [VoucherStatus.PENDING_PAYMENT]: 0 };
    dashboardData.forEach(v => { if (counts[v.status] !== undefined) counts[v.status]++; });
    return Object.keys(counts).map((key) => ({ name: key, value: counts[key as VoucherStatus] }));
  }, [dashboardData]);

  // Chart Data: Sales Velocity (Last 7 Days)
  const salesVelocityData = useMemo(() => {
    const last7Days = [...Array(7)].map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toISOString().split('T')[0];
    });
    return last7Days.map(date => {
        const count = dashboardData.filter(v => v.dates.soldAt.startsWith(date) && v.status !== VoucherStatus.PENDING_PAYMENT).length;
        const revenue = dashboardData.filter(v => v.dates.soldAt.startsWith(date) && v.status !== VoucherStatus.PENDING_PAYMENT).reduce((sum, v) => sum + v.voucherDetails.value, 0);
        return { date: date.slice(5), sales: count, revenue };
    });
  }, [dashboardData]);

  const handleDateClick = (e: React.MouseEvent<HTMLInputElement>) => {
    try {
        if ((e.currentTarget as any).showPicker) (e.currentTarget as any).showPicker();
    } catch { }
  };

  const inputClass = "w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 shadow-sm";
  const dateInputClass = `${inputClass} cursor-pointer`;
  const labelClass = "block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide";

  if (appLoading || vouchersLoading) return <div className="p-8 text-center text-gray-600 font-medium">Loading Data...</div>;

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-extrabold text-primary-900 tracking-tight">Admin Dashboard</h1>
      </div>

      {/* Expiry Alert Banner */}
      {expiringVouchers.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6 flex items-center gap-3 shadow-sm">
          <AlertTriangle className="text-amber-500 shrink-0" size={22} />
          <div>
            <p className="font-bold text-amber-800">
              {expiringVouchers.length} active voucher{expiringVouchers.length > 1 ? 's' : ''} expiring within 30 days
            </p>
            <p className="text-xs text-amber-600 mt-0.5">Review in Reports → All Transactions, filter by Status: Active</p>
          </div>
        </div>
      )}

      <>
          {/* Dashboard Filters */}
          <div className="bg-white p-5 rounded-xl shadow-md border border-gray-200 mb-6 flex flex-wrap gap-5 items-end">
              <div className="flex-1 min-w-[150px]">
                  <label className={labelClass}>Start Date</label>
                  <input type="date" className={dateInputClass} style={{ colorScheme: 'light' }} value={overviewDateRange.start}
                      onChange={e => setOverviewDateRange({...overviewDateRange, start: e.target.value})} onClick={handleDateClick} />
              </div>
              <div className="flex-1 min-w-[150px]">
                  <label className={labelClass}>End Date</label>
                  <input type="date" className={dateInputClass} style={{ colorScheme: 'light' }} value={overviewDateRange.end}
                      onChange={e => setOverviewDateRange({...overviewDateRange, end: e.target.value})} onClick={handleDateClick} />
              </div>
              <div className="flex-1 min-w-[200px]">
                  <label className={labelClass}>Filter by Category</label>
                  <select className={inputClass} value={overviewCategory} onChange={e => setOverviewCategory(e.target.value)}>
                      <option value="">All Categories</option>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
              </div>
              {(overviewDateRange.start || overviewDateRange.end || overviewCategory) && (
                  <button onClick={() => { setOverviewDateRange({start:'', end:''}); setOverviewCategory(''); }} className="text-sm text-red-600 hover:text-red-800 pb-3 font-bold px-2 underline">
                      Clear Filters
                  </button>
              )}
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 mb-8">
              <StatCard title="Revenue (Selection)" value={`RM${dashboardStats.totalRevenue.toLocaleString()}`} color="bg-emerald-600" />
              <StatCard title="Sold (Selection)" value={dashboardStats.totalSold} color="bg-teal-600" />
              <StatCard title="Redeemed" value={dashboardStats.redeemedCount} color="bg-cyan-600" />
              <StatCard title="Redemption Rate" value={`${dashboardStats.redemptionRate.toFixed(1)}%`} color="bg-blue-600" />
              <StatCard title="Pending Payment" value={dashboardStats.pendingCount} color="bg-amber-500" />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* Pie Chart */}
              <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 h-80">
                  <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Voucher Status Distribution</h3>
                  <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} fill="#8884d8" paddingAngle={5} dataKey="value">
                          {statusData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                      </Pie>
                      <Tooltip contentStyle={{backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #ddd', fontWeight: 'bold'}} />
                      <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                  </ResponsiveContainer>
              </div>

              {/* Bar Chart - Sales Velocity */}
               <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 h-80">
                  <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Sales Velocity (Last 7 Days)</h3>
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={salesVelocityData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" tick={{fontSize: 12}} />
                          <YAxis yAxisId="left" orientation="left" stroke="#0d9488" />
                          <YAxis yAxisId="right" orientation="right" stroke="#059669" />
                          <Tooltip contentStyle={{backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #ddd'}} />
                          <Legend />
                          <Bar yAxisId="left" dataKey="sales" name="Vouchers Sold" fill="#0d9488" radius={[4, 4, 0, 0]} />
                          <Bar yAxisId="right" dataKey="revenue" name="Revenue (RM)" fill="#059669" radius={[4, 4, 0, 0]} />
                      </BarChart>
                  </ResponsiveContainer>
              </div>
          </div>
      </>
    </div>
  );
};

// Sub-components
const StatCard: React.FC<{title: string, value: string | number | undefined, color: string}> = ({title, value, color}) => (
  <div className={`${color} p-6 rounded-xl text-white shadow-lg hover:shadow-xl transition-shadow`}>
    <p className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">{title}</p>
    <p className="text-3xl font-extrabold">{value ?? '-'}</p>
  </div>
);