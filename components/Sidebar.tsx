import React from 'react';
import { UserRole, User } from '../types';
import { logout } from '../services/voucherService';
import { LayoutDashboard, ShoppingCart, Armchair, ScanLine, LogOut, FileSpreadsheet, Package, Users, FileBarChart, Settings } from 'lucide-react';

interface SidebarProps {
  user: User;
  currentView: string;
  setView: (view: string) => void;
  isMobileMenuOpen: boolean;
  toggleMobileMenu: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ user, currentView, setView, isMobileMenuOpen, toggleMobileMenu, onLogout }) => {
  
  const handleLogout = () => {
    logout();
    onLogout();
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: [UserRole.ADMIN] },
    { id: 'reports', label: 'Reports', icon: FileBarChart, roles: [UserRole.ADMIN] },
    { id: 'products', label: 'Product Catalog', icon: Package, roles: [UserRole.ADMIN] },
    { id: 'users', label: 'User Management', icon: Users, roles: [UserRole.ADMIN] },
    { id: 'sales', label: 'Sales Mode', icon: ShoppingCart, roles: [UserRole.ADMIN, UserRole.SALES] },
    { id: 'cashier', label: 'Cashier Queue', icon: Armchair, roles: [UserRole.ADMIN, UserRole.CASHIER] },
    { id: 'redemption', label: 'Redemption', icon: ScanLine, roles: [UserRole.ADMIN, UserRole.OPERATIONS] },
    { id: 'import', label: 'Import/Export', icon: FileSpreadsheet, roles: [UserRole.ADMIN] },
    { id: 'settings', label: 'Settings', icon: Settings, roles: [UserRole.ADMIN] },
  ];

  // Check if user has ANY of the required roles for the menu item
  const filteredMenu = menuItems.filter(item => 
    item.roles.some(role => user.roles.includes(role))
  );

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={toggleMobileMenu}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-30 w-64 bg-primary-900 text-white transform transition-transform duration-300 ease-in-out flex flex-col
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6 border-b border-primary-800">
          <h1 className="text-2xl font-bold tracking-tight">GGP VMS</h1>
          <p className="text-xs text-primary-200 mt-1">Enterprise Edition v1.1</p>
        </div>

        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
          {filteredMenu.map(item => (
            <button
              key={item.id}
              onClick={() => { setView(item.id); toggleMobileMenu(); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === item.id ? 'bg-primary-700 text-white shadow-md' : 'text-primary-100 hover:bg-primary-800'}`}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 bg-primary-950 border-t border-primary-900">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary-700 flex items-center justify-center font-bold text-white border border-primary-500">
                    {user.fullName.charAt(0)}
                </div>
                <div className="overflow-hidden">
                    <p className="text-sm font-bold truncate">{user.fullName}</p>
                    <p className="text-[10px] text-primary-300 uppercase tracking-wider truncate">
                        {user.roles.join(', ')}
                    </p>
                </div>
            </div>
            <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 text-sm font-bold bg-primary-900 hover:bg-red-900/50 text-primary-100 hover:text-red-200 py-2 rounded border border-primary-800 hover:border-red-900 transition-colors"
            >
                <LogOut size={16} /> Logout
            </button>
        </div>
      </aside>
    </>
  );
};