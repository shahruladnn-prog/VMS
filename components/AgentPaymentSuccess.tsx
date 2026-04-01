import React from 'react';
import { CheckCircle, Mail, ArrowRight } from 'lucide-react';

export const AgentPaymentSuccess: React.FC = () => (
  <div className="min-h-screen bg-gradient-to-br from-teal-950 via-teal-900 to-gray-900 flex items-center justify-center p-4">
    <div className="relative w-full max-w-md text-center">
      {/* Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-emerald-500/15 rounded-full blur-3xl" />
      </div>

      <div className="relative bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-10 shadow-2xl">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-500/20 border-2 border-emerald-400/40 rounded-full mb-6">
          <CheckCircle size={40} className="text-emerald-400" />
        </div>

        <h1 className="text-white font-extrabold text-2xl mb-2">Payment Successful!</h1>
        <p className="text-teal-300 text-sm mb-6">
          Your vouchers are being activated. Each client will receive their voucher by email shortly.
        </p>

        <div className="bg-white/10 border border-white/20 rounded-2xl p-5 mb-8 text-left space-y-3">
          <div className="flex items-start gap-3 text-sm text-teal-200">
            <Mail size={16} className="shrink-0 mt-0.5 text-teal-400" />
            <span>Client emails are sent automatically with your name — no action needed.</span>
          </div>
          <div className="flex items-start gap-3 text-sm text-teal-200">
            <CheckCircle size={16} className="shrink-0 mt-0.5 text-emerald-400" />
            <span>A confirmation copy was also sent to your registered email.</span>
          </div>
        </div>

        <a
          href="/agent/store"
          id="agent-buy-more-btn"
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold py-4 rounded-xl text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/30"
        >
          Buy More Vouchers <ArrowRight size={18} />
        </a>
      </div>
    </div>
  </div>
);
