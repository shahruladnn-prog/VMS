import React, { useState } from 'react';
import Papa from 'papaparse';
import { bulkImportVouchers, fetchVouchers } from '../services/voucherService';
import { Voucher, VoucherStatus } from '../types';
import { Download, Upload, FileText, CheckCircle, AlertCircle, Info } from 'lucide-react';

export const ImportExport: React.FC = () => {
  const [importStats, setImportStats] = useState<{added: number, skipped: number} | null>(null);
  const [error, setError] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setImportStats(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const parsedVouchers: Voucher[] = results.data.map((row: any) => {
            // Helper to safely parse dates with multiple formats support
            const parseDate = (dateStr: string) => {
                if (!dateStr) return undefined;
                // Try strictly new Date()
                let d = new Date(dateStr);
                
                // Handle potential DD/MM/YYYY format if new Date() results in Invalid Date
                if (isNaN(d.getTime()) && dateStr.includes('/')) {
                   const parts = dateStr.split('/');
                   if(parts.length === 3) {
                       // Assume DD/MM/YYYY
                       d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                   }
                }

                return isNaN(d.getTime()) ? undefined : d.toISOString();
            };

            return {
                id: crypto.randomUUID(),
                voucherCode: row.voucher_code || `IMP-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
                clientName: row.client_name || 'Unknown Client',
                phoneNumber: row.phone || '',
                email: row.email || '',
                voucherDetails: {
                  value: Number(row.value) || 0,
                  name: row.voucher_name || 'Imported Voucher',
                  category: row.category || 'General',
                  terms: row.terms || '',
                  image: '' // CSV cannot easily handle base64 images
                },
                eventSource: row.event || 'CSV Import',
                status: (Object.values(VoucherStatus).includes(row.status) ? row.status : VoucherStatus.ACTIVE) as VoucherStatus,
                workflow: { 
                    salesPersonName: row.sales_person || 'System Import',
                    cashierName: row.cashier_name,
                    redemptionPicName: row.redemption_pic
                },
                dates: {
                  soldAt: parseDate(row.sold_date) || new Date().toISOString(),
                  expiryDate: parseDate(row.expiry_date) || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString(),
                  redemptionDate: parseDate(row.redemption_date),
                  bookingDate: row.booking_date // Keep as YYYY-MM-DD string
                },
                financials: {
                    paymentMethod: row.payment_method,
                    receiptNo: row.receipt_no,
                    invoiceNo: row.invoice_no,
                    cashReceived: row.cash_received ? Number(row.cash_received) : undefined,
                    changeAmount: row.change_amount ? Number(row.change_amount) : undefined
                },
                redemption: {
                    branchName: row.branch_name
                },
                isComplimentary: row.is_complimentary === 'Yes' || row.is_complimentary === 'true' || undefined
            };
          });

          const stats = await bulkImportVouchers(parsedVouchers);
          setImportStats(stats);
        } catch (err) {
          console.error(err);
          setError('Failed to process CSV. Please ensure the file matches the template format.');
        }
      }
    });
  };

  const handleExport = async () => {
    const vouchers = await fetchVouchers();
    
    // Map internal structure to flat CSV structure matching the Import Template
    const csvData = vouchers.map(v => ({
      voucher_code: v.voucherCode,
      client_name: v.clientName,
      phone: v.phoneNumber,
      email: v.email,
      voucher_name: v.voucherDetails.name,
      category: v.voucherDetails.category,
      value: v.voucherDetails.value,
      terms: v.voucherDetails.terms,
      event: v.eventSource,
      status: v.status,
      sales_person: v.workflow.salesPersonName,
      cashier_name: v.workflow.cashierName || '',
      redemption_pic: v.workflow.redemptionPicName || '',
      sold_date: v.dates.soldAt,
      expiry_date: v.dates.expiryDate,
      redemption_date: v.dates.redemptionDate || '',
      booking_date: v.dates.bookingDate || '',
      branch_name: v.redemption.branchName || '',
      payment_method: v.financials.paymentMethod || '',
      receipt_no: v.financials.receiptNo || '',
      invoice_no: v.financials.invoiceNo || '',
      cash_received: v.financials.cashReceived || '',
      change_amount: v.financials.changeAmount || '',
      is_complimentary: v.isComplimentary ? 'Yes' : 'No'
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ggp_full_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadTemplate = () => {
    // A comprehensive example row covering all fields
    const data = [
      { 
        voucher_code: 'GGP-TEST-1234', 
        client_name: 'John Doe', 
        phone: '0123456789', 
        email: 'john@test.com', 
        voucher_name: 'Deluxe Glamping Stay', 
        category: 'Accommodation', 
        value: '168', 
        terms: 'Valid weekdays only.',
        event: 'MATTA Fair 2025',
        status: 'Active',
        sales_person: 'Agent A',
        sold_date: '2025-01-01',
        expiry_date: '2026-12-31',
        redemption_date: '',
        booking_date: '',
        branch_name: '',
        redemption_pic: '',
        cashier_name: 'Cashier 1',
        payment_method: 'Cash',
        receipt_no: 'RCPT-001',
        invoice_no: 'INV-001',
        cash_received: '200',
        change_amount: '32',
        is_complimentary: ''
      }
    ];
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'voucher_import_template.csv';
    a.click();
  };

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-extrabold text-primary-900 mb-2">Data Management</h1>
        <p className="text-gray-500 mb-8 font-medium">Migrate data or backup your entire system.</p>

        <div className="grid md:grid-cols-2 gap-8">
            {/* Import Section */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                <div className="flex items-center gap-3 mb-6 text-primary-800">
                    <div className="p-3 bg-primary-100 rounded-lg">
                        <Upload size={24} />
                    </div>
                    <h2 className="text-xl font-bold">Bulk Import</h2>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-6 flex gap-3">
                    <Info className="text-blue-600 shrink-0 mt-0.5" size={20}/>
                    <div className="text-sm text-blue-800">
                        <p className="font-bold mb-1">Instructions:</p>
                        <p>1. Download the template below.</p>
                        <p>2. Fill in your legacy data. <b>voucher_code</b> must be unique.</p>
                        <p>3. Dates should be in <b>YYYY-MM-DD</b> format.</p>
                    </div>
                </div>
                
                <button 
                    onClick={downloadTemplate} 
                    className="mb-6 w-full text-sm font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 py-3 rounded-xl border border-primary-200 flex items-center justify-center gap-2 transition-colors"
                >
                    <FileText size={18} /> Download Comprehensive Template
                </button>

                <div className="relative">
                    <input 
                        type="file" 
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-gray-800 file:text-white hover:file:bg-gray-900 cursor-pointer border-2 border-dashed border-gray-300 rounded-xl p-2"
                    />
                </div>

                {importStats && (
                    <div className="mt-6 p-4 bg-green-50 text-green-800 rounded-xl border border-green-200 flex items-start gap-3">
                        <CheckCircle className="shrink-0 mt-0.5"/>
                        <div>
                            <p className="font-bold text-lg">Import Complete!</p>
                            <ul className="text-sm mt-1 space-y-1 font-medium">
                                <li>✅ Added: {importStats.added} new records</li>
                                <li>⏭️ Skipped: {importStats.skipped} duplicates</li>
                            </ul>
                        </div>
                    </div>
                )}
                {error && (
                    <div className="mt-6 p-4 bg-red-50 text-red-800 rounded-xl border border-red-200 flex items-center gap-3 font-bold">
                        <AlertCircle /> {error}
                    </div>
                )}
            </div>

            {/* Export Section */}
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                <div className="flex items-center gap-3 mb-6 text-primary-800">
                    <div className="p-3 bg-gray-100 rounded-lg text-gray-800">
                        <Download size={24} />
                    </div>
                    <h2 className="text-xl font-bold">Full Data Export</h2>
                </div>
                <p className="text-gray-500 mb-8 text-sm leading-relaxed">
                    Download a complete snapshot of the system. The CSV file includes all financial details, redemption logs, and workflow history.
                    <br/><br/>
                    <span className="font-bold text-gray-700">Note:</span> The export format matches the Import Template, making it easy to migrate data between systems.
                </p>
                
                <button 
                    onClick={handleExport}
                    className="w-full bg-gray-900 hover:bg-black text-white font-extrabold py-4 px-6 rounded-xl flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transition-all active:scale-[0.98]"
                >
                    <Download size={20} /> EXPORT ALL DATA
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};