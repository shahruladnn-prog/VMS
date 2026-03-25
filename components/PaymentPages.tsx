import React from 'react';
import { CheckCircle, Home } from 'lucide-react';

export const PaymentSuccess: React.FC = () => (
  <div className="min-h-screen bg-gradient-to-b from-teal-900 to-gray-900 flex items-center justify-center p-4">
    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl">
      <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30">
        <CheckCircle size={48} className="text-white" strokeWidth={2.5} />
      </div>
      <h1 className="text-3xl font-extrabold text-white mb-3">Payment Successful!</h1>
      <p className="text-teal-200 text-lg mb-2">Your voucher code(s) are on their way!</p>
      <p className="text-teal-300 text-sm mb-8">
        Check your email inbox — Chip-in has sent your receipt with the voucher code(s). Please allow a few minutes for delivery.
      </p>
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-8 text-teal-200 text-sm">
        <p className="font-bold mb-1">📌 Next Steps</p>
        <p>Present your voucher code at the counter when you visit. The code is also in your receipt email.</p>
      </div>
      <a href="/store"
        className="inline-flex items-center gap-2 bg-white text-teal-800 font-extrabold px-8 py-4 rounded-xl hover:bg-teal-50 transition-all active:scale-95 shadow-md">
        <Home size={20} /> Back to Store
      </a>
    </div>
  </div>
);

export const PaymentFailure: React.FC = () => (
  <div className="min-h-screen bg-gradient-to-b from-gray-900 to-red-950 flex items-center justify-center p-4">
    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-10 max-w-md w-full text-center shadow-2xl">
      <div className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-red-500/30">
        <span className="text-5xl">❌</span>
      </div>
      <h1 className="text-3xl font-extrabold text-white mb-3">Payment Failed</h1>
      <p className="text-red-200 text-lg mb-2">Your payment was not completed.</p>
      <p className="text-red-300 text-sm mb-8">
        Don't worry — no charges were made. You can try again or use a different payment method.
      </p>
      <div className="flex flex-col gap-3">
        <a href="/store"
          className="inline-flex items-center justify-center gap-2 bg-emerald-500 text-white font-extrabold px-8 py-4 rounded-xl hover:bg-emerald-400 transition-all active:scale-95 shadow-md">
          Try Again
        </a>
        <a href="/store"
          className="inline-flex items-center justify-center gap-2 bg-white/10 text-white font-bold px-8 py-3 rounded-xl hover:bg-white/20 transition-all border border-white/20">
          <Home size={18} /> Back to Store
        </a>
      </div>
    </div>
  </div>
);
