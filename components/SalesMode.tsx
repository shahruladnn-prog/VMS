import React, { useState, useEffect } from 'react';
import { createBatchVouchers, generateVoucherCode, fetchTemplates, getCurrentUser } from '../services/voucherService';
import { Voucher, VoucherStatus, VoucherTemplate } from '../types';
import { PlusCircle, CheckCircle, AlertCircle, ShoppingCart, Trash2, Plus, Minus, Package, User } from 'lucide-react';

interface CartItem {
  tempId: string;
  templateId: string;
  templateName: string;
  category: string;
  value: number; // Value per item
  quantity: number;
  image?: string;
  terms: string;
  defaultExpiryDate?: string;
}

export const SalesMode: React.FC = () => {
  const [templates, setTemplates] = useState<VoucherTemplate[]>([]);
  const currentUser = getCurrentUser();
  
  // Client Info State
  const [clientInfo, setClientInfo] = useState({
    name: '',
    phone: '',
    email: ''
  });

  // Product Selection State
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [currentPriceOverride, setCurrentPriceOverride] = useState<number>(0);
  const [currentQuantity, setCurrentQuantity] = useState<number>(1);
  
  // Cart State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [feedback, setFeedback] = useState<{type: 'success'|'error', msg: string} | null>(null);

  // Initial Load
  useEffect(() => {
    fetchTemplates().then(all => {
      const active = all.filter(t => t.isActive);
      setTemplates(active);
      if (active.length > 0) {
        setSelectedTemplateId(active[0].id);
        setCurrentPriceOverride(active[0].value);
      }
    });
  }, []);

  // Update price when template changes
  useEffect(() => {
    const t = templates.find(t => t.id === selectedTemplateId);
    if (t) {
      setCurrentPriceOverride(t.value);
    }
  }, [selectedTemplateId, templates]);

  // Quick add to cart (Loyverse style)
  const quickAddToCart = (template: VoucherTemplate) => {
    setCart(prev => {
      const existingIdx = prev.findIndex(item => item.templateId === template.id && item.value === template.value);
      if (existingIdx >= 0) {
        const newCart = [...prev];
        newCart[existingIdx].quantity += 1;
        return newCart;
      } else {
        return [...prev, {
          tempId: crypto.randomUUID(),
          templateId: template.id,
          templateName: template.name,
          category: template.category,
          value: template.value,
          quantity: 1,
          image: template.image,
          terms: template.terms,
          defaultExpiryDate: template.defaultExpiryDate
        }];
      }
    });
  };

  const updateCartQuantity = (tempId: string, diff: number) => {
    setCart(prev => prev.map(item => {
      if (item.tempId === tempId) {
        return { ...item, quantity: Math.max(1, item.quantity + diff) };
      }
      return item;
    }));
  };

  const removeFromCart = (tempId: string) => {
    setCart(cart.filter(item => item.tempId !== tempId));
  };

  const handleBatchSubmit = async () => {
    if (cart.length === 0) {
        setFeedback({ type: 'error', msg: 'Cart is empty.' });
        return;
    }
    if (!clientInfo.name || !clientInfo.phone) {
        setFeedback({ type: 'error', msg: 'Client Name and Phone are required.' });
        return;
    }

    try {
        const vouchersToCreate: Voucher[] = [];
        const saleDate = new Date().toISOString();

        cart.forEach(item => {
            // Use item default expiry or fallback to 2 years
            const defaultExpiry = item.defaultExpiryDate 
            ? new Date(item.defaultExpiryDate).toISOString() 
            : new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString();

            // Create X vouchers based on quantity
            for (let i = 0; i < item.quantity; i++) {
                vouchersToCreate.push({
                    id: crypto.randomUUID(),
                    voucherCode: generateVoucherCode(),
                    clientName: clientInfo.name,
                    phoneNumber: clientInfo.phone,
                    email: clientInfo.email,
                    voucherDetails: {
                        name: item.templateName,
                        category: item.category,
                        value: item.value,
                        terms: item.terms || 'Standard terms apply.',
                        image: item.image
                    },
                    eventSource: 'Sales Desk',
                    status: VoucherStatus.PENDING_PAYMENT,
                    workflow: { salesPersonName: currentUser?.fullName || 'Unknown' },
                    dates: {
                        soldAt: saleDate,
                        expiryDate: defaultExpiry
                    },
                    financials: {},
                    redemption: {}
                });
            }
        });

        await createBatchVouchers(vouchersToCreate);
        
        setFeedback({ type: 'success', msg: `Successfully created ${vouchersToCreate.length} orders!` });
        setCart([]);
        setClientInfo({ name: '', phone: '', email: '' });
        
        setTimeout(() => setFeedback(null), 5000);

    } catch (e) {
        setFeedback({ type: 'error', msg: 'Failed to process order.' });
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.value * item.quantity), 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Input styles
  const inputClass = "w-full border-2 border-gray-300 rounded-lg p-3 text-lg font-medium text-gray-900 bg-white focus:ring-4 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all placeholder-gray-400";
  const labelClass = "block text-sm font-extrabold text-gray-800 mb-2 uppercase tracking-wide";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto min-h-screen bg-gray-50">
      <header className="mb-8 flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-extrabold text-primary-900 tracking-tight">Sales Terminal</h1>
            <p className="text-gray-500 font-medium">Create multi-item orders.</p>
        </div>
        <div className="bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-sm font-bold text-gray-700">Agent: {currentUser?.fullName}</span>
        </div>
      </header>

      {feedback && (
        <div className={`p-4 mb-6 rounded-xl flex items-center gap-3 shadow-sm border ${feedback.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {feedback.type === 'success' ? <CheckCircle className="shrink-0"/> : <AlertCircle className="shrink-0"/>}
            <span className="font-bold text-lg">{feedback.msg}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        
        {/* LEFT COLUMN: Client & Product Selection */}
        <div className="flex-1 w-full space-y-8">
            
            {/* 1. Client Details */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="text-xl font-extrabold text-gray-800 mb-6 flex items-center gap-2"><User className="text-primary-500"/> CUSTOMER DETAILS</h3>
                <div className="space-y-5">
                    <div>
                        <label className={labelClass}>Client Name</label>
                        <input 
                            type="text"
                            placeholder="Full Name"
                            className={inputClass}
                            value={clientInfo.name}
                            onChange={(e) => setClientInfo({...clientInfo, name: e.target.value})}
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className={labelClass}>Phone Number</label>
                            <input 
                                type="tel"
                                placeholder="01X-XXXXXXX"
                                className={inputClass}
                                value={clientInfo.phone}
                                onChange={(e) => setClientInfo({...clientInfo, phone: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Email Address</label>
                            <input 
                                type="email"
                                placeholder="client@email.com"
                                className={inputClass}
                                value={clientInfo.email}
                                onChange={(e) => setClientInfo({...clientInfo, email: e.target.value})}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Add Item to Cart (Loyverse Grid) */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-extrabold text-gray-800 flex items-center gap-2"><Package className="text-primary-500"/> AVAILABLE VOUCHERS</h3>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-3 py-1 rounded-full">Tap to Add</span>
                </div>
                
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {templates.map(t => (
                        <div key={t.id} onClick={() => quickAddToCart(t)} 
                            className="bg-gray-50 border-2 border-transparent hover:border-primary-500 rounded-xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-all active:scale-95 group flex flex-col h-full">
                           {t.image ? (
                               <img src={t.image} alt={t.name} className="w-full h-24 object-cover border-b border-gray-100" />
                           ) : (
                               <div className="w-full h-24 bg-gradient-to-br from-primary-700 to-primary-500 flex flex-col items-center justify-center text-white/40 border-b border-white/10">
                                   <Package size={28}/>
                               </div>
                           )}
                           <div className="p-3 flex-1 flex flex-col">
                               <h4 className="font-extrabold text-gray-900 text-xs leading-tight line-clamp-2 mb-1 group-hover:text-primary-700 transition-colors">{t.name}</h4>
                               <div className="mt-auto text-primary-600 font-extrabold text-sm flex justify-between items-end">
                                   <span>RM{t.value}</span>
                                   <PlusCircle size={16} className="text-primary-300 group-hover:text-primary-500 transition-colors"/>
                               </div>
                           </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* RIGHT COLUMN: Cart Summary */}
        <div className="w-full lg:w-[450px] bg-white rounded-2xl shadow-xl border border-gray-200 flex flex-col overflow-hidden sticky top-4 h-[calc(100vh-2rem)]">
            <div className="bg-gray-900 text-white p-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <ShoppingCart /> CURRENT ORDER
                </h2>
                <p className="text-gray-400 text-sm mt-1">{totalItems} items in cart</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                        <ShoppingCart size={64} />
                        <p className="mt-4 font-medium">Cart is empty</p>
                    </div>
                ) : (
                    cart.map(item => (
                        <div key={item.tempId} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 relative group animate-in slide-in-from-right-4 duration-300">
                            <div className="flex justify-between items-start mb-1">
                                <h4 className="font-bold text-gray-900 text-lg leading-tight w-3/4">{item.templateName}</h4>
                                <span className="bg-primary-50 text-primary-700 text-xs font-bold px-2 py-1 rounded uppercase">{item.category}</span>
                            </div>
                            <div className="text-sm text-gray-500 mb-3">Unit Price: ${item.value}</div>
                            
                            <div className="flex justify-between items-center border-t border-gray-100 pt-3">
                                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                                    <button onClick={() => updateCartQuantity(item.tempId, -1)} className="w-7 h-7 flex items-center justify-center bg-white hover:bg-gray-200 rounded-md font-extrabold text-gray-700 shadow-sm transition-colors"><Minus size={14}/></button>
                                    <span className="font-mono font-bold text-gray-900 w-8 text-center text-sm">{item.quantity}</span>
                                    <button onClick={() => updateCartQuantity(item.tempId, 1)} className="w-7 h-7 flex items-center justify-center bg-white hover:bg-gray-200 rounded-md font-extrabold text-gray-700 shadow-sm transition-colors"><Plus size={14}/></button>
                                </div>
                                <div className="text-xl font-extrabold text-primary-700">
                                    RM{(item.value * item.quantity).toFixed(2)}
                                </div>
                            </div>

                            <button 
                                onClick={() => removeFromCart(item.tempId)}
                                className="absolute -top-2 -right-2 bg-red-100 hover:bg-red-200 text-red-600 p-2 rounded-full shadow-sm transition-colors opacity-100 lg:opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))
                )}
            </div>

            <div className="p-6 bg-white border-t border-gray-200 z-10">
                <div className="flex justify-between items-center mb-6">
                    <span className="text-gray-500 font-bold uppercase text-sm">Total Amount</span>
                    <span className="text-4xl font-extrabold text-gray-900 tracking-tight">${cartTotal.toFixed(2)}</span>
                </div>
                <button 
                    onClick={handleBatchSubmit}
                    disabled={cart.length === 0}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-5 rounded-xl text-xl shadow-lg hover:shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                    <CheckCircle size={28} />
                    SUBMIT TO CASHIER
                </button>
            </div>
        </div>

      </div>
    </div>
  );
};