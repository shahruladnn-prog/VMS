import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchVouchers, fetchTemplates, fetchCategories,
  fetchUsers, fetchBranches, fetchPromoCodes
} from '../services/voucherService';
import { Voucher, VoucherTemplate, User, PromoCode } from '../types';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface AppData {
  vouchers: Voucher[];
  templates: VoucherTemplate[];
  categories: string[];
  users: User[];
  branches: string[];
  promoCodes: PromoCode[];
  loading: boolean;
  refresh: (key?: DataKey) => Promise<void>;
}

type DataKey = 'vouchers' | 'templates' | 'categories' | 'users' | 'branches' | 'promoCodes';

const AppDataContext = createContext<AppData>({
  vouchers: [],
  templates: [],
  categories: [],
  users: [],
  branches: [],
  promoCodes: [],
  loading: true,
  refresh: async () => {},
});

export const useAppData = () => useContext(AppDataContext);

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [templates, setTemplates] = useState<VoucherTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);

  const lastFetched = useRef<Record<DataKey, number>>({
    vouchers: 0, templates: 0, categories: 0,
    users: 0, branches: 0, promoCodes: 0
  });

  const isStale = (key: DataKey) =>
    Date.now() - lastFetched.current[key] > CACHE_TTL_MS;

  const fetchKey = useCallback(async (key: DataKey, force = false) => {
    if (!force && !isStale(key)) return;
    lastFetched.current[key] = Date.now();

    switch (key) {
      case 'vouchers': setVouchers(await fetchVouchers()); break;
      case 'templates': setTemplates(await fetchTemplates()); break;
      case 'categories': setCategories(await fetchCategories()); break;
      case 'users': setUsers(await fetchUsers()); break;
      case 'branches': setBranches(await fetchBranches()); break;
      case 'promoCodes': setPromoCodes(await fetchPromoCodes()); break;
    }
  }, []);

  const refresh = useCallback(async (key?: DataKey) => {
    if (key) {
      await fetchKey(key, true);
    } else {
      await Promise.all(
        (['vouchers', 'templates', 'categories', 'users', 'branches', 'promoCodes'] as DataKey[])
          .map(k => fetchKey(k, true))
      );
    }
  }, [fetchKey]);

  // Initial load — fetch all in parallel
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all(
        (['vouchers', 'templates', 'categories', 'users', 'branches', 'promoCodes'] as DataKey[])
          .map(k => fetchKey(k, true))
      );
      setLoading(false);
    };
    init();
  }, [fetchKey]);

  return (
    <AppDataContext.Provider value={{
      vouchers, templates, categories, users, branches, promoCodes, loading, refresh
    }}>
      {children}
    </AppDataContext.Provider>
  );
};
