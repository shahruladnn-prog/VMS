import React, { useState, useEffect } from 'react';
import { fetchSettings, saveSettings, fetchUsers, addUser, updateUser, deleteUser, fetchPromoCodes, savePromoCode, deletePromoCode, fetchAuditLog } from '../services/voucherService';
import { SystemSettings, User, UserRole, PromoCode, AuditLogEntry } from '../types';
import { Save, Printer, Mail, Layout, Terminal, Code, Download, Zap, Globe, Info, Users, Tag, Shield, Plus, Trash, Edit, X, Clock } from 'lucide-react';

const ALL_ROLES = [UserRole.ADMIN, UserRole.SALES, UserRole.CASHIER, UserRole.OPERATIONS];
const ROLE_COLORS: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'bg-purple-100 text-purple-800 border-purple-300',
  [UserRole.SALES]: 'bg-blue-100 text-blue-800 border-blue-300',
  [UserRole.CASHIER]: 'bg-teal-100 text-teal-800 border-teal-300',
  [UserRole.OPERATIONS]: 'bg-orange-100 text-orange-800 border-orange-300',
};

export const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [activeTab, setActiveTab] = useState<'receipt' | 'email' | 'chipin' | 'evoucher' | 'users' | 'promoCodes' | 'auditLog'>('receipt');
  const [msg, setMsg] = useState('');

  // Users tab
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<Partial<User> | null>(null);
  const [userLoading, setUserLoading] = useState(false);

  // Promo Codes tab
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [editingPromo, setEditingPromo] = useState<Partial<PromoCode> | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);

  // Audit Log tab
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    fetchSettings().then(s => {
      if (!s.chipin) s.chipin = { enabled: false, appUrl: 'https://vms.gptt.my' };
      if (!s.chipin.appUrl) s.chipin.appUrl = 'https://vms.gptt.my';
      if (!s.voucherPage) s.voucherPage = {
        logoUrl: '', backgroundImage: '', primaryColor: '#0d9488',
        website: '', footerText: '', contactEmail: '', contactPhone: ''
      };
      setSettings(s);
    });
  }, []);

  useEffect(() => {
    if (activeTab === 'users') loadUsers();
    else if (activeTab === 'promoCodes') loadPromoCodes();
    else if (activeTab === 'auditLog') loadAuditLog();
  }, [activeTab]);

  const loadUsers = async () => { setUserLoading(true); setUsers(await fetchUsers()); setUserLoading(false); };
  const loadPromoCodes = async () => { setPromoLoading(true); setPromoCodes(await fetchPromoCodes()); setPromoLoading(false); };
  const loadAuditLog = async () => { setAuditLoading(true); setAuditLog(await fetchAuditLog()); setAuditLoading(false); };

  const handleSave = async () => {
    if (settings) {
      await saveSettings(settings);
      setMsg('Settings saved!');
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const downloadPHPScript = () => {
    const phpCode = `<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(["error" => "Method Not Allowed"]); exit; }
$input = json_decode(file_get_contents("php://input"), true);
if (!isset($input['to']) || !isset($input['subject']) || !isset($input['body'])) {
    http_response_code(400); echo json_encode(["error" => "Missing parameters"]); exit;
}
$fromName = isset($input['fromName']) ? $input['fromName'] : "GGP VMS";
$fromEmail = isset($input['fromEmail']) ? $input['fromEmail'] : "no-reply@" . $_SERVER['SERVER_NAME'];

$headers  = "MIME-Version: 1.0\\r\\n";
$headers .= "Content-type:text/html;charset=UTF-8\\r\\n";
$headers .= "From: " . $fromName . " <" . $fromEmail . ">\\r\\n";
$headers .= "Reply-To: " . $fromEmail . "\\r\\n";

// The 5th parameter (-f) sets the Envelope-From to bypass "on behalf of" spoofing flags.
if (mail($input['to'], $input['subject'], $input['body'], $headers, "-f" . $fromEmail)) {
    echo json_encode(["success" => true]);
} else { http_response_code(500); echo json_encode(["error" => "Mail server failed"]); }
?>`;
    const blob = new Blob([phpCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mail.php'; a.click();
  };

  // --- User Handlers ---
  const handleSaveUser = async () => {
    if (!editingUser?.username || !editingUser.fullName || !editingUser.roles?.length) return;
    const user: User = {
      username: editingUser.username,
      password: editingUser.password || '1234',
      fullName: editingUser.fullName,
      roles: editingUser.roles as UserRole[]
    };
    if (editingUser.username && users.find(u => u.username === editingUser.username) && (editingUser as any)._isEditing) {
      await updateUser(user);
    } else {
      await addUser(user);
    }
    setEditingUser(null);
    loadUsers();
  };

  const handleDeleteUser = async (username: string) => {
    if (confirm(`Delete user "${username}"? This cannot be undone.`)) {
      await deleteUser(username);
      loadUsers();
    }
  };

  const toggleUserRole = (role: UserRole) => {
    if (!editingUser) return;
    const current = editingUser.roles || [];
    const updated = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
    setEditingUser({ ...editingUser, roles: updated });
  };

  // --- Promo Code Handlers ---
  const handleSavePromo = async () => {
    if (!editingPromo?.code || !editingPromo.label || !editingPromo.discountValue) return;
    const promo: PromoCode = {
      id: editingPromo.id || crypto.randomUUID(),
      code: editingPromo.code.toUpperCase(),
      label: editingPromo.label,
      discountType: editingPromo.discountType || 'percentage',
      discountValue: Number(editingPromo.discountValue),
      isActive: editingPromo.isActive ?? true,
      minCartValue: editingPromo.minCartValue ? Number(editingPromo.minCartValue) : undefined,
    };
    await savePromoCode(promo);
    setEditingPromo(null);
    loadPromoCodes();
  };

  const handleDeletePromo = async (id: string) => {
    if (confirm('Delete this promo code?')) {
      await deletePromoCode(id);
      loadPromoCodes();
    }
  };

  if (!settings) return <div className="p-8">Loading Settings...</div>;

  const inputClass = "w-full border-2 border-gray-300 rounded-lg p-3 text-sm bg-white text-gray-900 font-bold focus:ring-4 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all";
  const labelClass = "block text-xs font-extrabold text-gray-700 mb-2 uppercase tracking-wide";

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhook`
    : 'https://your-app.vercel.app/api/webhook';

  const tabs = [
    { id: 'receipt', label: 'Receipt', icon: <Printer size={18}/> },
    { id: 'email', label: 'Email', icon: <Mail size={18}/> },
    { id: 'chipin', label: 'Chip-in', icon: <Zap size={18}/> },
    { id: 'evoucher', label: 'E-Voucher', icon: <Globe size={18}/> },
    { id: 'users', label: 'Users', icon: <Users size={18}/> },
    { id: 'promoCodes', label: 'Promo Codes', icon: <Tag size={18}/> },
    { id: 'auditLog', label: 'Audit Log', icon: <Shield size={18}/> },
  ];

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-primary-900 flex items-center gap-3">
              <Terminal className="text-primary-600" /> System Configuration
            </h1>
            <p className="text-gray-500 mt-2 font-medium">Manage receipt, email, users, and payment settings.</p>
          </div>
          {msg && <div className="bg-green-100 text-green-800 px-4 py-2 rounded-lg font-bold animate-pulse">{msg}</div>}
        </div>

        <div className="flex gap-6 flex-col md:flex-row">
          {/* Sidebar Tabs */}
          <div className="w-full md:w-56 flex flex-col gap-1 shrink-0">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                className={`text-left p-3.5 rounded-xl font-bold flex items-center gap-3 transition-all text-sm ${activeTab === tab.id ? 'bg-white shadow-md text-primary-700 border-l-4 border-primary-600' : 'text-gray-500 hover:bg-gray-200'}`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 p-8 min-h-[500px]">

            {/* ---- RECEIPT TAB ---- */}
            {activeTab === 'receipt' && (
              <div className="animate-in fade-in duration-300">
                <h2 className="text-xl font-extrabold text-gray-900 mb-6 flex items-center gap-2"><Layout /> Thermal Receipt Template</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    {[
                      { label: 'Business Name (Header)', key: 'businessName' },
                      { label: 'Business Registration Number', key: 'businessRegNo', placeholder: 'e.g. REG-2025-001' },
                      { label: 'Address Line 1', key: 'addressLine1' },
                      { label: 'Address Line 2', key: 'addressLine2' },
                      { label: 'Contact Phone', key: 'phone' },
                      { label: 'Email Address', key: 'email' },
                      { label: 'Receipt Header Message', key: 'headerMessage' },
                      { label: 'Receipt Footer Message', key: 'footerMessage' },
                    ].map(f => (
                      <div key={f.key}>
                        <label className={labelClass}>{f.label}</label>
                        <input className={inputClass} value={(settings.receipt as any)[f.key]}
                          placeholder={(f as any).placeholder}
                          onChange={e => setSettings({ ...settings, receipt: { ...settings.receipt, [f.key]: e.target.value } })} />
                      </div>
                    ))}
                  </div>
                  <div className="bg-gray-100 p-6 rounded-xl border border-gray-200 flex flex-col items-center justify-center">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-4 tracking-widest">Live Preview (80mm)</p>
                    <div className="bg-white p-4 w-64 shadow-lg text-xs font-mono text-center border-b-4 border-dashed border-gray-300">
                      <div className="font-bold text-lg">{settings.receipt.businessName}</div>
                      <div className="text-[10px] text-gray-500 mb-1">({settings.receipt.businessRegNo})</div>
                      <div className="text-gray-600">{settings.receipt.addressLine1}</div>
                      <div className="text-gray-600">{settings.receipt.addressLine2}</div>
                      <div className="text-gray-600">Tel: {settings.receipt.phone}</div>
                      <div className="text-gray-600 mb-2">Email: {settings.receipt.email}</div>
                      <div className="border-b border-black mb-2"></div>
                      <div className="mb-2 italic">"{settings.receipt.headerMessage}"</div>
                      <div className="flex justify-between font-bold my-2"><span>ITEM</span><span>PRICE</span></div>
                      <div className="flex justify-between"><span>Sample Item</span><span>RM100.00</span></div>
                      <div className="border-b border-black my-2"></div>
                      <div className="flex justify-between font-bold text-sm"><span>TOTAL</span><span>RM100.00</span></div>
                      <div className="mt-4 mb-2">** QR CODE **</div>
                      <div className="text-gray-500">{settings.receipt.footerMessage}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---- EMAIL TAB ---- */}
            {activeTab === 'email' && (
              <div className="animate-in fade-in duration-300">
                <h2 className="text-xl font-extrabold text-gray-900 mb-6 flex items-center gap-2"><Mail /> Email Automation</h2>
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 mb-6 text-sm text-blue-800">
                  <p className="font-bold mb-1">Email Integration Options</p>
                  <p>Use Simulation mode for testing, CustomPHP for your own server, or EmailJS for a paid service.</p>
                </div>
                <div className="space-y-6 max-w-lg">
                  <div className="flex items-center gap-3 mb-4">
                    <input type="checkbox" id="emailEnabled" className="w-5 h-5 accent-primary-600 cursor-pointer"
                      checked={settings.email.enabled}
                      onChange={e => setSettings({ ...settings, email: { ...settings.email, enabled: e.target.checked } })} />
                    <label htmlFor="emailEnabled" className="text-sm font-extrabold text-gray-800 uppercase cursor-pointer">Enable Auto-Send Receipts</label>
                  </div>
                  <div className={`${!settings.email.enabled ? 'opacity-50 pointer-events-none' : ''} space-y-6 transition-opacity`}>
                    <div>
                      <label className={labelClass}>Email Provider</label>
                      <select className={inputClass} value={settings.email.provider}
                        onChange={e => setSettings({ ...settings, email: { ...settings.email, provider: e.target.value as any } })}>
                        <option value="Simulation">Simulation Mode (Demo)</option>
                        <option value="SMTP">Native SMTP (Free/cPanel)</option>
                        <option value="EmailJS">EmailJS (Paid Service)</option>
                      </select>
                    </div>
                    {settings.email.provider === 'SMTP' && (
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                        <div className="flex items-start gap-3">
                          <Code className="text-primary-600 shrink-0 mt-1" />
                          <div>
                            <h4 className="font-bold text-gray-800">Native Serverless SMTP</h4>
                            <p className="text-xs text-gray-500 mb-2">Connect directly to your cPanel or private email server. Ensures 100% genuine inbox delivery bypassing tricky shared hosting rules.</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className={labelClass}>SMTP Host</label>
                            <input className={inputClass} value={settings.email.smtpHost || ''}
                              onChange={e => setSettings({ ...settings, email: { ...settings.email, smtpHost: e.target.value } })}
                              placeholder="mail.gptt.my" />
                          </div>
                          <div>
                            <label className={labelClass}>SMTP Port (465=SSL)</label>
                            <input className={inputClass} type="number" value={settings.email.smtpPort || ''}
                              onChange={e => setSettings({ ...settings, email: { ...settings.email, smtpPort: Number(e.target.value) } })}
                              placeholder="465" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className={labelClass}>SMTP Username / Email</label>
                            <input className={inputClass} value={settings.email.smtpUser || ''}
                              onChange={e => setSettings({ ...settings, email: { ...settings.email, smtpUser: e.target.value } })}
                              placeholder="hello@gptt.my" />
                          </div>
                          <div>
                            <label className={labelClass}>SMTP Password</label>
                            <input className={inputClass} type="password" value={settings.email.smtpPass || ''}
                              onChange={e => setSettings({ ...settings, email: { ...settings.email, smtpPass: e.target.value } })}
                              placeholder="••••••••" />
                          </div>
                        </div>
                        <div>
                          <label className={labelClass}>Sender Display Name</label>
                          <input className={inputClass} value={settings.email.senderName || ''}
                            onChange={e => setSettings({ ...settings, email: { ...settings.email, senderName: e.target.value } })}
                            placeholder="GGP VMS" />
                        </div>
                      </div>
                    )}
                    {settings.email.provider === 'EmailJS' && (
                      <>
                        {['serviceId', 'templateId'].map(f => (
                          <div key={f}>
                            <label className={labelClass}>{f === 'serviceId' ? 'Service ID' : 'Template ID'}</label>
                            <input className={inputClass} value={(settings.email as any)[f]}
                              onChange={e => setSettings({ ...settings, email: { ...settings.email, [f]: e.target.value } })}
                              placeholder={f === 'serviceId' ? 'service_xxxx' : 'template_xxxx'} />
                          </div>
                        ))}
                        <div>
                          <label className={labelClass}>Public Key</label>
                          <input className={inputClass} type="password" value={settings.email.publicKey}
                            onChange={e => setSettings({ ...settings, email: { ...settings.email, publicKey: e.target.value } })}
                            placeholder="********" />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ---- CHIP-IN TAB ---- */}
            {activeTab === 'chipin' && (
              <div className="animate-in fade-in duration-300">
                <h2 className="text-xl font-extrabold text-gray-900 mb-2 flex items-center gap-2"><Zap className="text-teal-600" /> Chip-in Payment Integration</h2>
                <p className="text-gray-500 text-sm mb-6">When enabled, cashiers can send digital receipt emails via Chip-in after any POS payment. Also powers the online voucher store.</p>
                <div className="flex items-center gap-3 mb-8 p-4 bg-teal-50 border border-teal-200 rounded-xl">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={settings.chipin?.enabled ?? false}
                      onChange={e => setSettings({ ...settings, chipin: { ...settings.chipin, enabled: e.target.checked } })}
                      className="sr-only peer" />
                    <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600" />
                  </label>
                  <label className="text-sm font-extrabold text-teal-800 uppercase">
                    {settings.chipin?.enabled ? '✅ Chip-in Integration Enabled' : 'Enable Chip-in Integration'}
                  </label>
                </div>
                <div className={`space-y-6 ${!settings.chipin?.enabled ? 'opacity-50 pointer-events-none' : ''} transition-opacity`}>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <Info size={20} className="text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-amber-800">API Key — Stored in Vercel, Not Here</h4>
                        <p className="text-sm text-amber-700 mt-1">For security, your Chip-in API key must be set as a Vercel Environment Variable.</p>
                        <div className="mt-3 bg-amber-100 rounded-lg p-3 text-xs font-mono text-amber-900 space-y-1">
                          <p className="font-bold">Vercel Dashboard → Project → Settings → Environment Variables</p>
                          <p>CHIPIN_API_KEY = jlOwwt... (test key)</p>
                          <p>CHIPIN_BRAND_ID = 38675dc8-983d-4b93-84bd-6c9bef48150d</p>
                          <p>CHIPIN_WEBHOOK_SECRET = any-secret-string</p>
                          <p>ADMIN_EMAIL = admin@yourcompany.com (optional, for purchase alerts)</p>
                        </div>
                      </div>
                    </div>
                  </div>
                   {/* App URL field */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <Globe size={20} className="text-gray-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-bold text-gray-800 mb-1">App URL (Domain)</h4>
                        <p className="text-xs text-gray-500 mb-3">Your public domain — used in e-voucher links, QR codes, and email buttons.</p>
                        <input className={inputClass} value={settings.chipin?.appUrl || ''}
                          onChange={e => setSettings({ ...settings, chipin: { ...settings.chipin, appUrl: e.target.value } })}
                          placeholder="https://vms.gptt.my" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <Globe size={20} className="text-gray-500 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-bold text-gray-800 mb-1">Webhook URL</h4>
                        <p className="text-xs text-gray-500 mb-3">Register in <a href="https://portal.chip-in.asia" target="_blank" rel="noreferrer" className="underline text-blue-600">Chip-in portal</a> → Webhooks → <strong>purchase.paid</strong></p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-white border border-gray-300 rounded-lg p-3 font-mono text-sm text-gray-800 break-all">{webhookUrl}</div>
                          <button onClick={() => navigator.clipboard.writeText(webhookUrl)} className="bg-gray-800 text-white text-xs font-bold px-3 py-3 rounded-lg hover:bg-black transition-colors">Copy</button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <Globe size={20} className="text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-blue-800 mb-1">Online Voucher Store</h4>
                        <p className="text-sm text-blue-700">Customers can purchase vouchers at:</p>
                        <div className="mt-2 bg-blue-100 rounded-lg p-2 font-mono text-sm text-blue-900">
                          {typeof window !== 'undefined' ? `${window.location.origin}/store` : 'https://your-app.vercel.app/store'}
                        </div>
                        <p className="text-sm text-blue-700 mt-2">Customers can check voucher status at:</p>
                        <div className="mt-1 bg-blue-100 rounded-lg p-2 font-mono text-sm text-blue-900">
                          {typeof window !== 'undefined' ? `${window.location.origin}/check` : 'https://your-app.vercel.app/check'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---- E-VOUCHER TEMPLATE TAB ---- */}
            {activeTab === 'evoucher' && (
              <div className="animate-in fade-in duration-300">
                <h2 className="text-xl font-extrabold text-gray-900 mb-2 flex items-center gap-2"><Globe className="text-teal-600" /> E-Voucher Template</h2>
                <p className="text-gray-500 text-sm mb-6">Customize how your e-voucher looks at <code>/voucher/:code</code>. Changes apply instantly to all voucher pages.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-5">
                    {[
                      { label: 'Logo URL', key: 'logoUrl', placeholder: 'https://your-site.com/logo.png' },
                      { label: 'Left Panel Background Image', key: 'backgroundImage', placeholder: 'https://your-site.com/bg.jpg (optional)' },
                      { label: 'Business Website', key: 'website', placeholder: 'https://gopengglampingpark.com' },
                      { label: 'Contact Email', key: 'contactEmail', placeholder: 'booking@gopengglampingpark.com' },
                      { label: 'Contact Phone', key: 'contactPhone', placeholder: '+60 132408857' },
                    ].map(f => (
                      <div key={f.key}>
                        <label className={labelClass}>{f.label}</label>
                        <input className={inputClass}
                          value={(settings.voucherPage as any)?.[f.key] || ''}
                          placeholder={f.placeholder}
                          onChange={e => setSettings({ ...settings, voucherPage: { ...settings.voucherPage, [f.key]: e.target.value } })} />
                      </div>
                    ))}
                    <div>
                      <label className={labelClass}>Primary Color</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={settings.voucherPage?.primaryColor || '#0d9488'}
                          onChange={e => setSettings({ ...settings, voucherPage: { ...settings.voucherPage, primaryColor: e.target.value } })}
                          className="w-12 h-10 rounded-lg border border-gray-300 cursor-pointer" />
                        <input className={inputClass} value={settings.voucherPage?.primaryColor || '#0d9488'}
                          onChange={e => setSettings({ ...settings, voucherPage: { ...settings.voucherPage, primaryColor: e.target.value } })}
                          placeholder="#0d9488" />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Footer / T&amp;C Text</label>
                      <textarea className={inputClass} rows={3}
                        value={settings.voucherPage?.footerText || ''}
                        placeholder="This voucher is non-refundable and non-transferable."
                        onChange={e => setSettings({ ...settings, voucherPage: { ...settings.voucherPage, footerText: e.target.value } })} />
                    </div>
                  </div>
                  {/* Live Preview */}
                  <div className="bg-gray-100 p-4 rounded-xl border border-gray-200">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-widest">Live Preview</p>
                    <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 11 }}>
                      <div style={{ width: 90, background: settings.voucherPage?.backgroundImage ? `url(${settings.voucherPage.backgroundImage}) center/cover` : settings.voucherPage?.primaryColor || '#0d9488', padding: '16px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {settings.voucherPage?.logoUrl && <img src={settings.voucherPage.logoUrl} alt="logo" style={{ maxWidth: 60, maxHeight: 30, objectFit: 'contain' }} />}
                        <div style={{ background: 'white', padding: 4, borderRadius: 4, marginTop: 'auto' }}>
                          <div style={{ width: 40, height: 40, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#9ca3af' }}>QR</div>
                        </div>
                        {settings.voucherPage?.contactPhone && <p style={{ color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontSize: 8 }}>{settings.voucherPage.contactPhone}</p>}
                      </div>
                      <div style={{ flex: 1, background: 'white', padding: '12px 10px' }}>
                        <div style={{ fontSize: 7, color: settings.voucherPage?.primaryColor || '#0d9488', fontWeight: 700, marginBottom: 2 }}>ACCOMMODATION</div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#111827', marginBottom: 6, lineHeight: 1.2 }}>Weekland PROMO MATTRA</div>
                        <div style={{ background: '#f0fdf4', border: `1.5px solid ${settings.voucherPage?.primaryColor || '#0d9488'}`, borderRadius: 6, padding: '4px 8px', marginBottom: 6 }}>
                          <div style={{ fontSize: 8, color: '#6b7280' }}>VALUE</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>RM200.00</div>
                        </div>
                        <div style={{ background: '#fef9c3', border: '1.5px solid #ca8a04', borderRadius: 6, padding: '4px 8px', marginBottom: 6 }}>
                          <div style={{ fontSize: 8, color: '#6b7280' }}>VALID UNTIL</div>
                          <div style={{ fontSize: 11, fontWeight: 800, color: '#ca8a04' }}>31 Dec 2025</div>
                          <div style={{ fontSize: 8, color: '#ca8a04' }}>185 days remaining</div>
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 800, letterSpacing: 2, background: '#f3f4f6', padding: '4px 6px', borderRadius: 4 }}>GGP-A2TM-LJQT</div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-3 text-center">Actual page at <code>/voucher/:code</code></p>
                  </div>
                </div>
              </div>
            )}


            {activeTab === 'users' && (
              <div className="animate-in fade-in duration-300">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-extrabold text-gray-900 flex items-center gap-2"><Users /> User Management</h2>
                  <button onClick={() => setEditingUser({ roles: [UserRole.SALES] })}
                    className="bg-primary-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-primary-700 shadow-sm text-sm">
                    <Plus size={16}/> Add User
                  </button>
                </div>

                {userLoading ? <div className="text-center py-12 text-gray-400">Loading users...</div> : (
                  <div className="space-y-2">
                    {users.map(u => (
                      <div key={u.username} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-extrabold text-sm border border-primary-200">
                            {u.fullName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900">{u.fullName}</p>
                            <p className="text-xs text-gray-500">@{u.username}</p>
                          </div>
                          <div className="flex gap-1 flex-wrap ml-2">
                            {u.roles.map(r => (
                              <span key={r} className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${ROLE_COLORS[r]}`}>{r}</span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingUser({ ...u, _isEditing: true } as any)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit size={16}/></button>
                          <button onClick={() => handleDeleteUser(u.username)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash size={16}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ---- PROMO CODES TAB ---- */}
            {activeTab === 'promoCodes' && (
              <div className="animate-in fade-in duration-300">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-extrabold text-gray-900 flex items-center gap-2"><Tag /> Promo Code Management</h2>
                  <button onClick={() => setEditingPromo({ discountType: 'percentage', isActive: true })}
                    className="bg-primary-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-primary-700 shadow-sm text-sm">
                    <Plus size={16}/> New Promo Code
                  </button>
                </div>

                {promoLoading ? <div className="text-center py-12 text-gray-400">Loading promo codes...</div> : (
                  <div className="space-y-2">
                    {promoCodes.length === 0 && <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">No promo codes yet. Create one above.</div>}
                    {promoCodes.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <div className="flex items-center gap-4">
                          <div className={`px-3 py-1.5 rounded-lg font-mono font-extrabold text-sm ${p.isActive ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-gray-200 text-gray-500 border border-gray-300 line-through'}`}>
                            {p.code}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{p.label}</p>
                            <p className="text-xs text-gray-500">
                              {p.discountType === 'percentage' ? `${p.discountValue}% off` : `RM${p.discountValue} off`}
                              {p.minCartValue ? ` · Min cart RM${p.minCartValue}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 items-center">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {p.isActive ? 'Active' : 'Inactive'}
                          </span>
                          <button onClick={() => setEditingPromo(p)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit size={16}/></button>
                          <button onClick={() => handleDeletePromo(p.id)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash size={16}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ---- AUDIT LOG TAB ---- */}
            {activeTab === 'auditLog' && (
              <div className="animate-in fade-in duration-300">
                <h2 className="text-xl font-extrabold text-gray-900 mb-6 flex items-center gap-2"><Shield /> Admin Audit Log</h2>
                {auditLoading ? <div className="text-center py-12 text-gray-400">Loading audit log...</div> : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {auditLog.length === 0 && <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">No audit events recorded yet.</div>}
                    {auditLog.map((entry, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                          <Clock size={14} className="text-gray-500"/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-gray-900">{entry.adminFullName}</span>
                            <span className="bg-primary-100 text-primary-700 text-xs font-bold px-2 py-0.5 rounded-full">{entry.action}</span>
                          </div>
                          <p className="text-gray-600 text-xs mt-0.5 truncate">{entry.details}</p>
                          <p className="text-gray-400 text-[10px] mt-0.5">{new Date(entry.timestamp).toLocaleString('en-MY')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Save Button — only for receipt/email/chipin tabs */}
        {['receipt', 'email', 'chipin'].includes(activeTab) && (
          <div className="mt-8 flex justify-end">
            <button onClick={handleSave}
              className="bg-primary-600 hover:bg-primary-700 text-white font-extrabold py-4 px-8 rounded-xl text-lg shadow-lg hover:shadow-primary-500/30 transition-all active:scale-[0.98] flex items-center gap-3">
              <Save size={24} /> SAVE CONFIGURATION
            </button>
          </div>
        )}
      </div>

      {/* ===== USER EDIT MODAL ===== */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="text-xl font-extrabold text-gray-900">{(editingUser as any)._isEditing ? 'Edit User' : 'New User'}</h3>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-800 p-1"><X size={22}/></button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className={labelClass}>Username</label>
                <input className={inputClass} value={editingUser.username || ''} disabled={(editingUser as any)._isEditing}
                  onChange={e => setEditingUser({...editingUser, username: e.target.value})} placeholder="e.g. johndoe" />
              </div>
              <div>
                <label className={labelClass}>Full Name</label>
                <input className={inputClass} value={editingUser.fullName || ''}
                  onChange={e => setEditingUser({...editingUser, fullName: e.target.value})} placeholder="John Doe" />
              </div>
              <div>
                <label className={labelClass}>{(editingUser as any)._isEditing ? 'New Password (leave blank to keep current)' : 'Password'}</label>
                <input className={inputClass} type="password" value={editingUser.password || ''}
                  onChange={e => setEditingUser({...editingUser, password: e.target.value})} placeholder="••••••" />
              </div>
              <div>
                <label className={labelClass}>Roles</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {ALL_ROLES.map(role => (
                    <button key={role} type="button" onClick={() => toggleUserRole(role)}
                      className={`px-3 py-1.5 rounded-full text-xs font-extrabold border transition-all ${editingUser.roles?.includes(role) ? ROLE_COLORS[role] : 'bg-gray-100 text-gray-500 border-gray-300'}`}>
                      {role}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t">
              <button onClick={() => setEditingUser(null)} className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl font-bold">Cancel</button>
              <button onClick={handleSaveUser} className="px-6 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-bold shadow-md">Save User</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PROMO CODE EDIT MODAL ===== */}
      {editingPromo && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
            <div className="p-6 border-b flex justify-between items-center">
              <h3 className="text-xl font-extrabold text-gray-900">{editingPromo.id ? 'Edit Promo Code' : 'New Promo Code'}</h3>
              <button onClick={() => setEditingPromo(null)} className="text-gray-400 hover:text-gray-800 p-1"><X size={22}/></button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className={labelClass}>Code (e.g. SAVE10)</label>
                <input className={`${inputClass} uppercase font-mono tracking-widest`} value={editingPromo.code || ''}
                  onChange={e => setEditingPromo({...editingPromo, code: e.target.value.toUpperCase()})} placeholder="PROMO2025" />
              </div>
              <div>
                <label className={labelClass}>Label / Description</label>
                <input className={inputClass} value={editingPromo.label || ''}
                  onChange={e => setEditingPromo({...editingPromo, label: e.target.value})} placeholder="10% off all vouchers" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Discount Type</label>
                  <select className={inputClass} value={editingPromo.discountType || 'percentage'}
                    onChange={e => setEditingPromo({...editingPromo, discountType: e.target.value as any})}>
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (RM)</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{editingPromo.discountType === 'fixed' ? 'Amount (RM)' : 'Percentage (%)'}</label>
                  <input type="number" className={inputClass} value={editingPromo.discountValue || ''}
                    onChange={e => setEditingPromo({...editingPromo, discountValue: Number(e.target.value)})} placeholder="10" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Minimum Cart Value (RM) — Optional</label>
                <input type="number" className={inputClass} value={editingPromo.minCartValue || ''}
                  onChange={e => setEditingPromo({...editingPromo, minCartValue: Number(e.target.value)})} placeholder="0" />
              </div>
              <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200 cursor-pointer"
                onClick={() => setEditingPromo({...editingPromo, isActive: !editingPromo.isActive})}>
                <div className={`w-11 h-6 flex items-center rounded-full p-1 transition-all ${editingPromo.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <div className={`bg-white w-4 h-4 rounded-full shadow transform transition-all ${editingPromo.isActive ? 'translate-x-5' : ''}`}></div>
                </div>
                <span className="text-sm font-bold text-gray-800">{editingPromo.isActive ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t">
              <button onClick={() => setEditingPromo(null)} className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl font-bold">Cancel</button>
              <button onClick={handleSavePromo} className="px-6 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-bold shadow-md">Save Promo Code</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};