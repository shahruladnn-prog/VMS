import React from 'react';
import { CheckCircle, Mail, ArrowLeft, ExternalLink } from 'lucide-react';

export const PaymentSuccess: React.FC = () => {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0d9488 0%, #065f46 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'white',
        borderRadius: 20,
        padding: '48px 40px',
        maxWidth: 480,
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 24px 48px rgba(0,0,0,0.15)',
      }}>
        {/* Success icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ background: '#d1fae5', borderRadius: '50%', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={44} color="#10b981" />
          </div>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>
          Payment Successful! 🎉
        </h1>
        <p style={{ color: '#6b7280', fontSize: 16, margin: '0 0 32px', lineHeight: 1.5 }}>
          Your e-voucher has been issued and is ready to use.
        </p>

        {/* Email notice */}
        <div style={{ background: '#f0fdf4', border: '1.5px solid #6ee7b7', borderRadius: 12, padding: '16px 20px', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
            <Mail size={20} color="#0d9488" />
            <span style={{ color: '#065f46', fontWeight: 600, fontSize: 15 }}>
              Your voucher link has been sent to your email
            </span>
          </div>
          <p style={{ color: '#047857', fontSize: 13, margin: '8px 0 0' }}>
            Didn't receive it? Check your spam folder, or use the link below.
          </p>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <a
            href="/check"
            style={{ background: '#0d9488', color: 'white', padding: '14px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <ExternalLink size={16} /> View My Voucher
          </a>
          <a
            href="/store"
            style={{ background: 'white', color: '#374151', padding: '12px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1px solid #d1d5db' }}
          >
            <ArrowLeft size={16} /> Back to Store
          </a>
        </div>

        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 24 }}>
          Gopeng Glamping Park | <a href="mailto:booking@gopengglampingpark.com" style={{ color: '#0d9488' }}>booking@gopengglampingpark.com</a>
        </p>
      </div>
    </div>
  );
};
