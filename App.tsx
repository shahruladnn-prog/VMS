import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/UserManagement';
import { Dashboard } from './components/Dashboard';
import { Reports } from './components/Reports';
import { ProductCatalog } from './components/ProductCatalog';
import { SalesMode } from './components/SalesMode';
import { CashierMode } from './components/CashierMode';
import { RedemptionMode } from './components/RedemptionMode';
import { ImportExport } from './components/ImportExport';
import { Settings } from './components/Settings';
import { Login } from './components/Login';
import { OnlineStore } from './components/OnlineStore';
import { VoucherCheck } from './components/VoucherCheck';
import { VoucherPage } from './components/VoucherPage';
import { PaymentSuccess, PaymentFailure } from './components/PaymentPages';
import { AgentLogin } from './components/AgentLogin';
import { AgentStore } from './components/AgentStore';
import { AgentPaymentSuccess } from './components/AgentPaymentSuccess';
import { AgentDashboard } from './components/AgentDashboard';
import { AgentProfile } from './components/AgentProfile';
import { getCurrentUser } from './services/voucherService';
import { AppDataProvider } from './context/AppDataContext';
import { User, UserRole } from './types';
import { Menu } from 'lucide-react';

// Simple path-based routing for public pages (no login required)
const getRoute = () => {
  const path = window.location.pathname;
  // Public store routes
  if (path === '/store' || path === '/store/') return 'store';
  if (path === '/store/success') return 'store-success';
  if (path === '/store/failure') return 'store-failure';
  if (path === '/check' || path === '/check/') return 'check';
  if (path.startsWith('/voucher/') && path.length > '/voucher/'.length) return 'voucher';
  // Agent portal routes
  if (path === '/agent' || path === '/agent/') return 'agent-login';
  if (path === '/agent/store' || path === '/agent/store/') return 'agent-store';
  if (path === '/agent/store/success') return 'agent-success';
  if (path === '/agent/dashboard' || path === '/agent/dashboard/') return 'agent-dashboard';
  if (path === '/agent/profile' || path === '/agent/profile/') return 'agent-profile';
  return null;
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setView] = useState('dashboard');
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  const publicRoute = getRoute();

  useEffect(() => {
    if (publicRoute) return;
    const currentUser = getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      determineInitialView(currentUser);
    }
  }, []);

  const determineInitialView = (u: User) => {
    if (u.roles.includes(UserRole.ADMIN)) setView('dashboard');
    else if (u.roles.includes(UserRole.SALES)) setView('sales');
    else if (u.roles.includes(UserRole.CASHIER)) setView('cashier');
    else if (u.roles.includes(UserRole.OPERATIONS)) setView('redemption');
    else setView('dashboard');
  };

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    determineInitialView(loggedInUser);
  };

  const handleLogout = () => {
    setUser(null);
    setView('dashboard');
  };

  // --- PUBLIC ROUTES (no login required) ---
  if (publicRoute === 'store') return <OnlineStore />;
  if (publicRoute === 'store-success') return <PaymentSuccess />;
  if (publicRoute === 'store-failure') return <PaymentFailure />;
  if (publicRoute === 'check') return <VoucherCheck />;
  if (publicRoute === 'voucher') return <VoucherPage />;
  // --- AGENT PORTAL ROUTES ---
  if (publicRoute === 'agent-login') return <AgentLogin />;
  if (publicRoute === 'agent-store') return <AgentStore />;
  if (publicRoute === 'agent-success') return <AgentPaymentSuccess />;
  if (publicRoute === 'agent-dashboard') return <AgentDashboard />;
  if (publicRoute === 'agent-profile') return <AgentProfile />;

  // --- AUTHENTICATED ROUTES ---
  if (!user) return <Login onLogin={handleLogin} />;

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      case 'reports': return <Reports />;
      case 'products': return <ProductCatalog />;
      case 'sales': return <SalesMode />;
      case 'cashier': return <CashierMode />;
      case 'redemption': return <RedemptionMode />;
      case 'import': return <ImportExport />;
      case 'settings': return <Settings />;
      default: return <Dashboard />;
    }
  };

  return (
    <AppDataProvider>
      <div className="flex h-screen bg-gray-100 font-sans text-gray-900 overflow-hidden">
        <Sidebar
          user={user}
          currentView={currentView}
          setView={setView}
          isMobileMenuOpen={isMobileMenuOpen}
          toggleMobileMenu={() => setMobileMenuOpen(!isMobileMenuOpen)}
          onLogout={handleLogout}
        />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Mobile Header */}
          <div className="md:hidden bg-primary-900 text-white p-4 flex items-center justify-between shadow-md shrink-0">
            <h1 className="font-bold">GGP VMS</h1>
            <button onClick={() => setMobileMenuOpen(true)}><Menu /></button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {renderView()}
          </div>
        </main>
      </div>
    </AppDataProvider>
  );
};

export default App;