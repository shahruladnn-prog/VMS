import React, { useState, useEffect, useRef } from 'react';
import { fetchVoucherByCode, fetchSettings } from '../services/voucherService';
import { Voucher, VoucherStatus, SystemSettings } from '../types';
import { QRCodeSVG } from 'qrcode.react';
import { Download, AlertTriangle, CheckCircle, Clock, XCircle, Loader, Calendar, Tag, User, Phone, Mail } from 'lucide-react';

const DEFAULT_PRIMARY = '#0d9488';

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(dateStr);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-MY', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}

const StatusBadge: React.FC<{ status: VoucherStatus }> = ({ status }) => {
  const map = {
    [VoucherStatus.ACTIVE]: { bg: '#d1fae5', color: '#065f46', icon: <CheckCircle size={14} />, label: 'Active' },
    [VoucherStatus.REDEEMED]: { bg: '#ede9fe', color: '#5b21b6', icon: <CheckCircle size={14} />, label: 'Redeemed' },
    [VoucherStatus.EXPIRED]: { bg: '#fee2e2', color: '#991b1b', icon: <XCircle size={14} />, label: 'Expired' },
    [VoucherStatus.PENDING_PAYMENT]: { bg: '#fef9c3', color: '#854d0e', icon: <Clock size={14} />, label: 'Pending Payment' },
  };
  const s = map[status] || map[VoucherStatus.ACTIVE];
  return (
    <span style={{ background: s.bg, color: s.color, padding: '4px 12px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
      {s.icon} {s.label}
    </span>
  );
};

export const VoucherPage: React.FC = () => {
  // Extract code from URL: /voucher/GGP-XXXX → "GGP-XXXX"
  const code = window.location.pathname.split('/').filter(Boolean).pop() || '';
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const voucherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!code) { setNotFound(true); setLoading(false); return; }
    Promise.all([
      fetchVoucherByCode(code),
      fetchSettings()
    ]).then(([v, s]) => {
      if (!v) setNotFound(true);
      else setVoucher(v);
      setSettings(s);
    }).catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [code]);


  const handlePrint = () => {
    window.print();
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <Loader size={40} color={DEFAULT_PRIMARY} className="animate-spin" />
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', flexDirection: 'column', gap: 16, padding: 24, textAlign: 'center' }}>
      <AlertTriangle size={48} color="#dc2626" />
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Voucher Not Found</h1>
      <p style={{ color: '#6b7280', margin: 0 }}>The voucher code "{code}" could not be found. Please check the code and try again.</p>
      <a href="/check" style={{ background: DEFAULT_PRIMARY, color: 'white', padding: '10px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>
        Check Another Voucher
      </a>
    </div>
  );

  if (!voucher) return null;

  const vp = settings?.voucherPage;
  const primary = vp?.primaryColor || DEFAULT_PRIMARY;
  const biz = settings?.receipt?.businessName || 'Gopeng Glamping Park';
  const appUrl = settings?.chipin?.appUrl || 'https://vms.gptt.my';

  const expiryDays = voucher.dates?.expiryDate ? daysUntil(voucher.dates.expiryDate) : null;
  const isExpiringSoon = expiryDays !== null && expiryDays <= 30 && expiryDays > 0;
  const isExpired = voucher.status === VoucherStatus.EXPIRED || (expiryDays !== null && expiryDays < 0);
  const voucherUrl = `${appUrl}/voucher/${voucher.voucherCode}`;

  return (
    <>
      {/* Print-only CSS */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #voucher-print, #voucher-print * { visibility: visible !important; }
          #voucher-print { position: fixed; top: 0; left: 0; width: 100%; }
          .no-print { display: none !important; }
        }
        @media screen {
          body { margin: 0; background: #f1f5f9; }
        }
      `}</style>

      {/* Top bar (screen only) */}
      <div className="no-print" style={{ background: primary, padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'white', fontWeight: 700, fontSize: 16 }}>🎫 {biz} — E-Voucher</span>
        <button
          onClick={handlePrint}
          style={{ background: 'white', color: primary, border: 'none', padding: '8px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Download size={16} /> Download / Print
        </button>
      </div>

      {/* Expiry alert banner */}
      {isExpiringSoon && !isExpired && (
        <div className="no-print" style={{ background: '#fff7ed', borderBottom: '2px solid #f97316', padding: '10px 24px', textAlign: 'center' }}>
          <span style={{ color: '#c2410c', fontWeight: 600 }}>
            ⚠️ This voucher expires in <strong>{expiryDays} day{expiryDays !== 1 ? 's' : ''}</strong> on {formatDate(voucher.dates?.expiryDate)}
          </span>
        </div>
      )}

      {/* Main voucher card - A4-like layout */}
      <div style={{ maxWidth: 860, margin: '32px auto', padding: '0 16px' }}>
        <div id="voucher-print" ref={voucherRef} style={{
          display: 'flex',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(0,0,0,0.12)',
          background: 'white',
          minHeight: 440,
        }}>
          {/* LEFT PANEL */}
          <div style={{
            width: 220,
            background: vp?.backgroundImage ? `url(${vp.backgroundImage}) center/cover` : primary,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '32px 16px',
            position: 'relative',
          }}>
            {/* Overlay for readability if background image */}
            {vp?.backgroundImage && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
            )}

            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', gap: 16 }}>
              {/* Logo */}
              {vp?.logoUrl ? (
                <img src={vp.logoUrl} alt={biz} style={{ maxWidth: 120, maxHeight: 60, objectFit: 'contain', filter: vp?.backgroundImage ? 'brightness(0) invert(1)' : 'none' }} />
              ) : (
                <div style={{ fontSize: 13, fontWeight: 700, color: 'white', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1 }}>{biz}</div>
              )}

              <div style={{ flex: 1 }} />

              {/* QR Code linking to this page */}
              <div style={{ background: 'white', padding: 8, borderRadius: 8 }}>
                <QRCodeSVG value={voucherUrl} size={110} />
              </div>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, textAlign: 'center', margin: 0 }}>Scan to view e-voucher</p>

              <div style={{ flex: 1 }} />

              {/* Contact info */}
              {vp?.contactEmail && (
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, textAlign: 'center', margin: 0 }}>
                  📧 {vp.contactEmail}
                </p>
              )}
              {vp?.contactPhone && (
                <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, textAlign: 'center', margin: '2px 0' }}>
                  📞 {vp.contactPhone}
                </p>
              )}
              {vp?.website && (
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, textAlign: 'center', margin: 0 }}>
                  🌐 {vp.website}
                </p>
              )}

              {/* Fine print */}
              {vp?.footerText && (
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9, textAlign: 'center', margin: '8px 0 0', lineHeight: 1.4 }}>
                  {vp.footerText}
                </p>
              )}
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div style={{ flex: 1, padding: '32px 32px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Status + header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <StatusBadge status={voucher.status} />
              <span style={{ fontSize: 11, color: '#9ca3af' }}>Issued: {formatDate(voucher.dates?.soldAt)}</span>
            </div>

            {/* Voucher name */}
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: '#111827', margin: '0 0 4px', lineHeight: 1.2 }}>
                {voucher.voucherDetails?.name}
              </h1>
              {voucher.voucherDetails?.category && (
                <span style={{ fontSize: 12, color: primary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {voucher.voucherDetails.category}
                </span>
              )}
            </div>

            {/* VALUE */}
            <div style={{ background: '#f0fdf4', border: `2px solid ${primary}`, borderRadius: 12, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <Tag size={20} color={primary} />
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>VOUCHER VALUE</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#111827' }}>
                  RM {voucher.voucherDetails?.value?.toFixed(2)}
                </div>
              </div>
            </div>

            {/* EXPIRY — highlighted prominently */}
            <div style={{
              background: isExpired ? '#fee2e2' : isExpiringSoon ? '#fff7ed' : '#fef9c3',
              border: `2px solid ${isExpired ? '#dc2626' : isExpiringSoon ? '#f97316' : '#ca8a04'}`,
              borderRadius: 12,
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <Calendar size={22} color={isExpired ? '#dc2626' : isExpiringSoon ? '#f97316' : '#ca8a04'} />
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>VALID UNTIL</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: isExpired ? '#dc2626' : isExpiringSoon ? '#ea580c' : '#111827' }}>
                  {formatDate(voucher.dates?.expiryDate)}
                </div>
                {expiryDays !== null && (
                  <div style={{ fontSize: 12, color: isExpired ? '#dc2626' : isExpiringSoon ? '#ea580c' : '#6b7280', fontWeight: 600, marginTop: 2 }}>
                    {isExpired
                      ? '⛔ This voucher has expired'
                      : expiryDays === 0
                      ? '⚠️ Expires today!'
                      : `${expiryDays} day${expiryDays !== 1 ? 's' : ''} remaining`
                    }
                  </div>
                )}
              </div>
            </div>

            {/* Voucher code */}
            <div>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500, marginBottom: 4 }}>VOUCHER CODE</div>
              <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 800, letterSpacing: 3, color: '#111827', background: '#f3f4f6', padding: '10px 16px', borderRadius: 8, display: 'inline-block' }}>
                {voucher.voucherCode}
              </div>
            </div>

            {/* Customer info */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#374151', fontSize: 13 }}>
                <User size={14} color={primary} />
                <span style={{ fontWeight: 600 }}>{voucher.clientName}</span>
              </div>
              {voucher.phoneNumber && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#374151', fontSize: 13 }}>
                  <Phone size={14} color={primary} />
                  <span>{voucher.phoneNumber}</span>
                </div>
              )}
              {voucher.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#374151', fontSize: 13 }}>
                  <Mail size={14} color={primary} />
                  <span>{voucher.email}</span>
                </div>
              )}
            </div>

            {/* Terms */}
            {voucher.voucherDetails?.terms && (
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 4 }}>TERMS & CONDITIONS</div>
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
                  {voucher.voucherDetails.terms}
                </p>
              </div>
            )}

            {/* Redeemed info */}
            {voucher.status === VoucherStatus.REDEEMED && voucher.dates?.redemptionDate && (
              <div style={{ background: '#f5f3ff', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#5b21b6' }}>
                ✅ Redeemed on {formatDate(voucher.dates.redemptionDate)}
                {voucher.redemption?.branchName && ` at ${voucher.redemption.branchName}`}
              </div>
            )}
          </div>
        </div>

        {/* Bottom actions (screen only) */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 20, paddingBottom: 32 }}>
          <button
            onClick={handlePrint}
            style={{ background: primary, color: 'white', border: 'none', padding: '12px 28px', borderRadius: 10, fontWeight: 700, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Download size={18} /> Download as PDF
          </button>
          <a href="/check" style={{ background: 'white', color: '#374151', border: '1px solid #d1d5db', padding: '12px 24px', borderRadius: 10, fontWeight: 600, textDecoration: 'none', fontSize: 15 }}>
            Check Another Code
          </a>
        </div>
      </div>
    </>
  );
};
