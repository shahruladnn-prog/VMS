import React, { useState } from 'react';
import { login } from '../services/voucherService';
import { User } from '../types';
import { Lock, User as UserIcon, ArrowRight, AlertCircle } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User) => void;
}

// Custom SVG Logo based on the provided image (Hexagon G)
const BrandLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Outer Hex Shape Logic */}
    <path d="M50 5 L90 28 V72 L50 95 L10 72 V28 Z" fill="#e0f2f1" stroke="#0f766e" strokeWidth="2" opacity="0.1"/>
    
    {/* Top Dark Teal Segment */}
    <path d="M50 20 L80 35 V45 H65 L50 35 L35 45 L20 35 L50 20 Z" fill="#134e4a" />
    
    {/* Right Teal Segment */}
    <path d="M80 35 V75 L50 90 V70 L65 62 V50 H80 V35 Z" fill="#0d9488" />
    
    {/* Bottom/Left Green Segment (The G spiral) */}
    <path d="M50 90 L20 75 V35 L35 45 V65 L50 75 V55 L45 52 V48 L55 42 L65 48 V65 L50 75 Z" fill="#22c55e" />
    
    {/* Center 'G' definition - abstract geometric */}
    <path d="M35 45 L50 35 L65 45 V60 L50 70 L35 60 V45" stroke="white" strokeWidth="0" fillOpacity="0" />
  </svg>
);

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    // Simulate network delay for UX
    setTimeout(async () => {
        try {
            const user = await login(username, password);
            onLogin(user);
        } catch (err) {
            setError('Access Denied: Invalid Credentials');
            setLoading(false);
        }
    }, 600);
  };

  // High Visibility Input Classes
  const inputContainerClass = "relative group";
  const iconClass = "absolute left-4 top-4 text-gray-400 group-focus-within:text-primary-600 transition-colors";
  const inputClass = "w-full pl-12 pr-4 py-4 border-2 border-gray-300 rounded-xl text-lg font-bold text-gray-900 bg-gray-50 focus:bg-white focus:border-primary-600 focus:ring-4 focus:ring-primary-100 outline-none transition-all placeholder-gray-400";
  const labelClass = "block text-sm font-extrabold text-gray-700 mb-2 uppercase tracking-wide ml-1";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-primary-950 to-slate-900 flex items-center justify-center p-4 md:p-8">
      
      <div className="flex w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden min-h-[600px] animate-in fade-in zoom-in duration-300">
        
        {/* Left Side: Brand & Visuals (Hidden on small mobile) */}
        <div className="hidden md:flex w-1/2 bg-primary-900 relative flex-col items-center justify-center p-12 text-center overflow-hidden">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10" style={{backgroundImage: 'radial-gradient(#ccfbf1 1px, transparent 1px)', backgroundSize: '24px 24px'}}></div>
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>

            <div className="relative z-10">
                <div className="w-48 h-48 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center mb-8 mx-auto shadow-inner border border-white/10">
                    <BrandLogo className="w-32 h-32 drop-shadow-2xl" />
                </div>
                <h2 className="text-4xl font-extrabold text-white tracking-tight mb-4">GGP VMS</h2>
                <p className="text-primary-200 text-lg font-medium max-w-xs mx-auto">
                    Enterprise Voucher Management & Redemption System
                </p>
            </div>

            <div className="absolute bottom-8 text-primary-400 text-xs font-mono">
                System v2.0 • Secure Access
            </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center bg-white relative">
            <div className="max-w-md mx-auto w-full">
                
                {/* Mobile Logo (Visible only on small screens) */}
                <div className="md:hidden text-center mb-8">
                    <BrandLogo className="w-20 h-20 mx-auto mb-4" />
                    <h1 className="text-2xl font-extrabold text-primary-900">GGP VMS</h1>
                </div>

                <div className="mb-10">
                    <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Welcome Back</h1>
                    <p className="text-gray-500 font-medium">Please enter your credentials to access the terminal.</p>
                </div>

                {error && (
                    <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-center gap-3 animate-in slide-in-from-top-2">
                        <AlertCircle className="text-red-600 shrink-0" />
                        <span className="text-red-800 font-bold text-sm">{error}</span>
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className={labelClass}>Username</label>
                        <div className={inputContainerClass}>
                            <UserIcon className={iconClass} size={24} />
                            <input 
                                type="text" 
                                className={inputClass}
                                placeholder="Enter Username"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Password / PIN</label>
                        <div className={inputContainerClass}>
                            <Lock className={iconClass} size={24} />
                            <input 
                                type="password" 
                                className={inputClass}
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full bg-primary-600 hover:bg-primary-700 text-white font-extrabold py-5 rounded-xl text-xl shadow-lg hover:shadow-primary-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-wait mt-4"
                    >
                        {loading ? 'AUTHENTICATING...' : 'LOGIN TO SYSTEM'}
                        {!loading && <ArrowRight size={24} />}
                    </button>
                </form>

                <div className="mt-10 text-center border-t border-gray-100 pt-6">
                    <p className="text-sm text-gray-400 font-medium">
                        Having trouble? Contact System Administrator.
                    </p>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};