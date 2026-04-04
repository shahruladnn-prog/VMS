import { initializeApp } from 'firebase/app';
import { 
  getFirestore, initializeFirestore, persistentLocalCache, collection, getDocs, doc, setDoc, deleteDoc, 
  query, where, updateDoc, addDoc, onSnapshot, orderBy, limit,
  getCountFromServer, getAggregateFromServer, sum, writeBatch
} from 'firebase/firestore';
import { Voucher, VoucherStatus, VoucherTemplate, User, UserRole, SystemSettings, PromoCode, AuditLogEntry } from '../types';

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDTcln5MUBNGJKJkC3GLMePgGx98_OisvA",
  authDomain: "ggp-vms.firebaseapp.com",
  projectId: "ggp-vms",
  storageBucket: "ggp-vms.firebasestorage.app",
  messagingSenderId: "725624706356",
  appId: "1:725624706356:web:dead6487efcbcc36af4161"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
});

// Collection References
const VOUCHERS_COL = 'vouchers';
const TEMPLATES_COL = 'templates';
const USERS_COL = 'users';
const SETTINGS_COL = 'settings';
const META_COL = 'metadata';
const PROMO_CODES_COL = 'promoCodes';
const AUDIT_LOG_COL = 'auditLog';

const SESSION_KEY = 'ggp_current_user';
const SESSION_TIMESTAMP_KEY = 'ggp_login_timestamp';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// --- PASSWORD HASHING (Web Crypto API — no extra packages) ---
export const hashPassword = async (plain: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const isPlainText = (password: string) => password.length <= 12;

// Helper to generate random alphanumeric code
export const generateVoucherCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'GGP-';
  for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  result += '-';
  for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
};

// --- SEED DATA ---
const SEED_USERS: User[] = [
    { username: 'admin', password: '123', roles: [UserRole.ADMIN], fullName: 'System Admin' },
    { username: 'Akma', password: '1234', roles: [UserRole.SALES], fullName: 'Akma' },
    { username: 'Ain', password: '1234', roles: [UserRole.SALES], fullName: 'Ain' },
    { username: 'Aleeza', password: '1234', roles: [UserRole.SALES], fullName: 'Aleeza' },
    { username: 'Farhana', password: '1234', roles: [UserRole.SALES], fullName: 'Farhana' },
    { username: 'Badi', password: '1234', roles: [UserRole.SALES], fullName: 'Badi' },
    { username: 'Mardhiah', password: '1234', roles: [UserRole.SALES], fullName: 'Mardhiah' },
    { username: 'Shafina', password: '1234', roles: [UserRole.SALES], fullName: 'Shafina' },
    { username: 'Syahirah', password: '1234', roles: [UserRole.SALES], fullName: 'Syahirah' },
    { username: 'Shahrul', password: '1234', roles: [UserRole.ADMIN, UserRole.SALES, UserRole.CASHIER, UserRole.OPERATIONS], fullName: 'Shahrul' }, 
    { username: 'cashier', password: '1234', roles: [UserRole.CASHIER], fullName: 'Cashier Terminal 1' },
    { username: 'ops', password: '1234', roles: [UserRole.OPERATIONS], fullName: 'Redemption Officer' },
];

const DEFAULT_SETTINGS: SystemSettings = {
    receipt: {
        businessName: 'GGP ADVENTURE PARK',
        businessRegNo: 'REG-2025-GGP',
        email: 'info@ggpadventure.com',
        addressLine1: 'Lot 1234, Jalan Glamping',
        addressLine2: '31600 Gopeng, Perak',
        phone: '+60 12-345 6789',
        headerMessage: 'Thank you for visiting!',
        footerMessage: 'Please present QR code at counter.',
        showLogo: true,
        printerWidth: '80mm'
    },
    email: {
        enabled: true,
        provider: 'SMTP',
        serviceId: '',
        templateId: '',
        publicKey: '',
        smtpHost: 'mail.gptt.my',
        smtpPort: 465,
        smtpUser: 'hello@gptt.my',
        smtpPass: '',
        senderName: 'GGP VMS',
        senderEmail: 'hello@gptt.my'
    },
    chipin: {
        enabled: false,
        appUrl: 'https://vms.gptt.my'
    },
    voucherPage: {
        logoUrl: '',
        backgroundImage: '',
        primaryColor: '#0d9488',
        website: 'https://gopengglampingpark.com',
        footerText: 'This voucher is non-refundable, non-transferable, and cannot be exchanged for cash. Booking must be made in advance.',
        contactEmail: 'booking@gopengglampingpark.com',
        contactPhone: '+60 132408857'
    }
};

const DEFAULT_CATEGORIES = ['Promo', 'Accommodation', 'Dining', 'Wellness', 'General'];
const DEFAULT_BRANCHES = [
  'Gopeng Glamping Park',
  'Glamping Wetland Putrajaya',
  'Putrajaya Lake Recreation Center',
  'Putrajaya Wetland Adventure Park',
  'Botani Lake Recreation Center',
  'Floria Lake Recreation Center'
];

// --- AUTH FUNCTIONS ---

export const login = async (username: string, password: string): Promise<User> => {
    const usersSnapshot = await getDocs(collection(db, USERS_COL));
    const remoteUsers: User[] = [];
    usersSnapshot.forEach((doc) => remoteUsers.push(doc.data() as User));

    let users = remoteUsers;
    if (remoteUsers.length === 0) {
        users = SEED_USERS;
    }

    const hashedInput = await hashPassword(password);

    // Find user by username
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) throw new Error('Invalid credentials');

    const storedPwd = user.password || '';
    let matched = false;

    if (isPlainText(storedPwd)) {
        // Legacy plain-text — try plain match
        if (storedPwd === password) {
            matched = true;
            // Auto-migrate to hashed
            await updateDoc(doc(db, USERS_COL, user.username), { password: hashedInput });
            user.password = hashedInput;
        }
    } else {
        // Already hashed
        matched = storedPwd === hashedInput;
    }

    if (!matched) throw new Error('Invalid credentials');

    const now = Date.now().toString();
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    localStorage.setItem(SESSION_TIMESTAMP_KEY, now);
    return user;
};

export const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_TIMESTAMP_KEY);
};

export const getCurrentUser = (): User | null => {
    const session = localStorage.getItem(SESSION_KEY);
    if (!session) return null;

    // Check session TTL
    const loginTime = localStorage.getItem(SESSION_TIMESTAMP_KEY);
    if (loginTime && Date.now() - parseInt(loginTime) > SESSION_TTL_MS) {
        logout();
        return null;
    }

    const user = JSON.parse(session);
    if (!user.roles && (user as any).role) user.roles = [(user as any).role];
    return user;
};

// --- AUDIT LOG ---

export const logAuditEvent = async (
    action: string,
    details: string,
    recordId?: string
): Promise<void> => {
    try {
        const currentUser = getCurrentUser();
        if (!currentUser) return;
        const entry: AuditLogEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            adminUsername: currentUser.username,
            adminFullName: currentUser.fullName,
            action,
            details,
            recordId
        };
        await addDoc(collection(db, AUDIT_LOG_COL), entry);
    } catch {
        // Non-blocking — audit log failures must never break user workflows
    }
};

export const fetchAuditLog = async (): Promise<AuditLogEntry[]> => {
    const snapshot = await getDocs(collection(db, AUDIT_LOG_COL));
    const entries: AuditLogEntry[] = [];
    snapshot.forEach(d => entries.push(d.data() as AuditLogEntry));
    return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

// --- USER MANAGEMENT ---

export const fetchUsers = async (): Promise<User[]> => {
    const snapshot = await getDocs(collection(db, USERS_COL));
    const users: User[] = [];
    snapshot.forEach((doc) => users.push(doc.data() as User));
    
    if (users.length === 0) {
        return SEED_USERS;
    }
    return users;
};

export const addUser = async (user: User): Promise<void> => {
    const userToSave = { ...user };
    if (userToSave.password && isPlainText(userToSave.password)) {
        userToSave.password = await hashPassword(userToSave.password);
    }
    await setDoc(doc(db, USERS_COL, user.username), userToSave);
    await logAuditEvent('CREATE_USER', `Created user: ${user.fullName} (${user.roles.join(', ')})`, user.username);
};

export const deleteUser = async (username: string): Promise<void> => {
    await logAuditEvent('DELETE_USER', `Deleted user: ${username}`, username);
    await deleteDoc(doc(db, USERS_COL, username));
};

export const updateUser = async (user: User): Promise<void> => {
    const userToSave = { ...user };
    if (userToSave.password && isPlainText(userToSave.password)) {
        userToSave.password = await hashPassword(userToSave.password);
    }
    await updateDoc(doc(db, USERS_COL, user.username), { ...userToSave });
    await logAuditEvent('UPDATE_USER', `Updated user: ${user.fullName} (${user.roles.join(', ')})`, user.username);
};

// --- SALES TEAM (Derived from Users) ---
export const fetchSalesPeople = async (): Promise<string[]> => {
    const users = await fetchUsers();
    return users.filter(u => u.roles.includes(UserRole.SALES)).map(u => u.fullName);
};

export const addSalesPerson = async (name: string): Promise<void> => {
    let username = name.toLowerCase().replace(/\s+/g, '');
    const newUser: User = {
        username,
        password: '123',
        roles: [UserRole.SALES],
        fullName: name
    };
    await addUser(newUser);
};

export const removeSalesPerson = async (name: string): Promise<void> => {
    const users = await fetchUsers();
    const user = users.find(u => u.fullName === name);
    if (user) await deleteUser(user.username);
};

// --- VOUCHERS ---

let voucherCache: Record<string, { data: Voucher[], timestamp: number }> = {};

export const fetchVouchers = async (force = false, startDate?: string, endDate?: string): Promise<Voucher[]> => {
    const cacheKey = `${startDate || 'all'}_${endDate || 'all'}`;

    if (!force && voucherCache[cacheKey] && Date.now() - voucherCache[cacheKey].timestamp < 5 * 60 * 1000) {
        return voucherCache[cacheKey].data;
    }

    let q: any = collection(db, VOUCHERS_COL);
    if (startDate && endDate) {
        q = query(collection(db, VOUCHERS_COL), 
            where('dates.soldAt', '>=', startDate),
            where('dates.soldAt', '<=', endDate + 'T23:59:59')
        );
    } else if (startDate) {
        q = query(collection(db, VOUCHERS_COL), where('dates.soldAt', '>=', startDate));
    } else if (endDate) {
        q = query(collection(db, VOUCHERS_COL), where('dates.soldAt', '<=', endDate + 'T23:59:59'));
    }

    const snapshot = await getDocs(q);
    const vouchers: Voucher[] = [];
    snapshot.forEach((doc) => vouchers.push(doc.data() as Voucher));
    
    voucherCache[cacheKey] = { data: vouchers, timestamp: Date.now() };
    return vouchers;
};

// Safe Report Engine List Fetcher - Defaults to 300 to protect data usage while remaining useful
export const getPagedVouchers = async (limitNum: number = 300): Promise<Voucher[]> => {
    const q = query(collection(db, VOUCHERS_COL), orderBy('dates.soldAt', 'desc'), limit(limitNum));
    const snapshot = await getDocs(q);
    const vouchers: Voucher[] = [];
    snapshot.forEach((doc) => vouchers.push(doc.data() as Voucher));
    return vouchers;
};

// Firebase native Server-Side Aggregation for the Admin Dashboard
// Bypasses the need to payload thousands of documents to RAM.
export const getDashboardMetrics = async () => {
    const baseCol = collection(db, VOUCHERS_COL);
    
    // Total Sold Items
    const totalCountSnap = await getCountFromServer(baseCol);
    const totalSold = totalCountSnap.data().count;

    // Total Redeemed
    const redeemedQuery = query(baseCol, where('status', '==', VoucherStatus.REDEEMED));
    const redeemedCountSnap = await getCountFromServer(redeemedQuery);
    const redeemedCount = redeemedCountSnap.data().count;

    // Total Revenue (Only Paid/Active/Redeemed items, not pending/expired)
    // Firestore `in` max is 10 items. We only have 4 enum statuses.
    const paidQuery = query(baseCol, where('status', 'in', [VoucherStatus.ACTIVE, VoucherStatus.REDEEMED]));
    const revenueSnap = await getAggregateFromServer(paidQuery, { total: sum('voucherDetails.value') });
    const totalRevenue = revenueSnap.data().total || 0;

    // Pending Count
    const pendingQuery = query(baseCol, where('status', '==', VoucherStatus.PENDING_PAYMENT));
    const pendingCountSnap = await getCountFromServer(pendingQuery);
    const pendingCount = pendingCountSnap.data().count;

    // Recent Transactions (Limit 15 for Quick Overview & Charts)
    const recentQuery = query(baseCol, orderBy('dates.soldAt', 'desc'), limit(30));
    const recentSnap = await getDocs(recentQuery);
    const recentVouchers: Voucher[] = [];
    recentSnap.forEach(d => recentVouchers.push(d.data() as Voucher));

    return { totalSold, redeemedCount, totalRevenue, pendingCount, recentVouchers };
};

// Extremely optimized listener for POS Dashboard to prevent destroying the daily Free Quota (50,000 reads)
// The previous standard fetchVouchers hook with a 10s interval consumed 279,000+ reads rapidly.
export const subscribeToPendingVouchers = (callback: (vouchers: Voucher[]) => void) => {
    const q = query(
        collection(db, VOUCHERS_COL),
        where('status', '==', VoucherStatus.PENDING_PAYMENT)
    );
    return onSnapshot(q, (snapshot) => {
        const vouchers: Voucher[] = [];
        snapshot.forEach((doc) => {
            const v = doc.data() as Voucher;
            if (!v.saleChannel || v.saleChannel === 'POS') vouchers.push(v);
        });
        callback(vouchers);
    });
};

// Direct one-shot fetch for Force Sync — bypasses the WebSocket listener entirely.
// Safe to call on congested networks where the onSnapshot stream has stalled.
export const fetchPendingVouchers = async (): Promise<Voucher[]> => {
    const q = query(
        collection(db, VOUCHERS_COL),
        where('status', '==', VoucherStatus.PENDING_PAYMENT)
    );
    const snapshot = await getDocs(q);
    const vouchers: Voucher[] = [];
    snapshot.forEach((doc) => {
        const v = doc.data() as Voucher;
        if (!v.saleChannel || v.saleChannel === 'POS') vouchers.push(v);
    });
    return vouchers.sort((a, b) => new Date(b.dates.soldAt).getTime() - new Date(a.dates.soldAt).getTime());
};

// Fetches all vouchers belonging to the same transaction as the given voucher.
// Groups by receiptNo (POS), chipinPurchaseId (Online/Agent), or falls back to the single voucher.
export const fetchVoucherGroup = async (voucher: Voucher): Promise<Voucher[]> => {
    // Try to group by POS receipt number first
    if (voucher.financials?.receiptNo) {
        const q = query(
            collection(db, VOUCHERS_COL),
            where('financials.receiptNo', '==', voucher.financials.receiptNo)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const group: Voucher[] = [];
            snapshot.forEach(d => group.push(d.data() as Voucher));
            return group;
        }
    }
    // Try to group by online/agent purchase ID
    if (voucher.chipinPurchaseId) {
        const q = query(
            collection(db, VOUCHERS_COL),
            where('chipinPurchaseId', '==', voucher.chipinPurchaseId)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const group: Voucher[] = [];
            snapshot.forEach(d => group.push(d.data() as Voucher));
            return group;
        }
    }
    // Fallback: just the single voucher
    return [voucher];
};

export const createVoucher = async (voucher: Voucher): Promise<void> => {
    await setDoc(doc(db, VOUCHERS_COL, voucher.id), voucher);
};

export const createBatchVouchers = async (vouchers: Voucher[]): Promise<void> => {
    // Firestore batch limit is 500
    for (let i = 0; i < vouchers.length; i += 500) {
        const chunk = vouchers.slice(i, i + 500);
        const batch = writeBatch(db);
        chunk.forEach(v => {
            batch.set(doc(db, VOUCHERS_COL, v.id), v);
        });
        await batch.commit();
    }
};

// Fetch all vouchers purchased through the Agent Portal by a specific agent
// Used by AgentDashboard — queries by agentId field, sorted newest first
export const fetchVouchersByAgent = async (agentId: string): Promise<Voucher[]> => {
    const q = query(
        collection(db, VOUCHERS_COL),
        where('agentId', '==', agentId),
        orderBy('dates.soldAt', 'desc')
    );
    const snapshot = await getDocs(q);
    const vouchers: Voucher[] = [];
    snapshot.forEach(d => vouchers.push(d.data() as Voucher));
    return vouchers;
};


export const updateVoucher = async (updatedVoucher: Voucher): Promise<void> => {
    await updateDoc(doc(db, VOUCHERS_COL, updatedVoucher.id), { ...updatedVoucher });
};

export const deleteVoucher = async (id: string): Promise<void> => {
    await logAuditEvent('DELETE_VOUCHER', `Deleted voucher ID: ${id}`, id);
    await deleteDoc(doc(db, VOUCHERS_COL, id));
};

export const bulkDeleteVouchers = async (ids: string[]): Promise<void> => {
    await logAuditEvent('BULK_DELETE_VOUCHERS', `Bulk deleted ${ids.length} voucher(s): ${ids.join(', ')}`);
    await Promise.all(ids.map(id => deleteDoc(doc(db, VOUCHERS_COL, id))));
};

export const bulkExpireVouchers = async (ids: string[]): Promise<void> => {
    await logAuditEvent('BULK_EXPIRE_VOUCHERS', `Bulk expired ${ids.length} voucher(s): ${ids.join(', ')}`);
    await Promise.all(ids.map(id => updateDoc(doc(db, VOUCHERS_COL, id), { status: VoucherStatus.EXPIRED })));
};

export const bulkImportVouchers = async (newVouchers: Voucher[]): Promise<{ added: number, skipped: number }> => {
    await Promise.all(newVouchers.map(v => setDoc(doc(db, VOUCHERS_COL, v.id), v)));
    return { added: newVouchers.length, skipped: 0 };
};

// --- TEMPLATES ---

export const fetchTemplates = async (activeOnly = false): Promise<VoucherTemplate[]> => {
    let snapshot;
    if (activeOnly) {
        const q = query(collection(db, TEMPLATES_COL), where('isActive', '==', true));
        snapshot = await getDocs(q);
    } else {
        snapshot = await getDocs(collection(db, TEMPLATES_COL));
    }
    const templates: VoucherTemplate[] = [];
    snapshot.forEach(doc => templates.push(doc.data() as VoucherTemplate));
    return templates;
};

export const saveTemplate = async (template: VoucherTemplate): Promise<void> => {
    await setDoc(doc(db, TEMPLATES_COL, template.id), template);
};

export const deleteTemplate = async (id: string): Promise<void> => {
    await deleteDoc(doc(db, TEMPLATES_COL, id));
};

// --- METADATA (Categories & Branches) ---

const getMetaList = async (listName: string, defaults: string[]): Promise<string[]> => {
    const snapshot = await getDocs(collection(db, META_COL));
    const metaDoc = snapshot.docs.find(d => d.id === listName);
    if (metaDoc && metaDoc.exists()) {
        return metaDoc.data().list as string[];
    }
    await setDoc(doc(db, META_COL, listName), { list: defaults });
    return defaults;
};

const updateMetaList = async (listName: string, list: string[]): Promise<void> => {
    await setDoc(doc(db, META_COL, listName), { list });
};

export const fetchCategories = async (): Promise<string[]> => {
    return getMetaList('categories', DEFAULT_CATEGORIES);
};

export const addCategory = async (category: string): Promise<void> => {
    const current = await fetchCategories();
    if (!current.includes(category)) {
        await updateMetaList('categories', [...current, category]);
    }
};

export const removeCategory = async (category: string): Promise<void> => {
    const current = await fetchCategories();
    await updateMetaList('categories', current.filter(c => c !== category));
};

export const fetchBranches = async (): Promise<string[]> => {
    return getMetaList('branches', DEFAULT_BRANCHES);
};

export const addBranch = async (branch: string): Promise<void> => {
    const current = await fetchBranches();
    if (!current.includes(branch)) {
        await updateMetaList('branches', [...current, branch]);
    }
};

export const updateBranch = async (oldName: string, newName: string): Promise<void> => {
    const current = await fetchBranches();
    const index = current.findIndex(b => b === oldName);
    if (index !== -1) {
        current[index] = newName;
        await updateMetaList('branches', current);
    }
};

export const removeBranch = async (branch: string): Promise<void> => {
    const current = await fetchBranches();
    await updateMetaList('branches', current.filter(b => b !== branch));
};

// --- PROMO CODES ---

export const fetchPromoCodes = async (): Promise<PromoCode[]> => {
    const snapshot = await getDocs(collection(db, PROMO_CODES_COL));
    const codes: PromoCode[] = [];
    snapshot.forEach(d => codes.push(d.data() as PromoCode));
    return codes;
};

export const savePromoCode = async (code: PromoCode): Promise<void> => {
    await setDoc(doc(db, PROMO_CODES_COL, code.id), code);
};

export const deletePromoCode = async (id: string): Promise<void> => {
    await logAuditEvent('DELETE_PROMO_CODE', `Deleted promo code ID: ${id}`, id);
    await deleteDoc(doc(db, PROMO_CODES_COL, id));
};

export const validatePromoCode = async (code: string, cartTotal: number): Promise<PromoCode | null> => {
    const codes = await fetchPromoCodes();
    const promo = codes.find(c => c.code.toUpperCase() === code.toUpperCase() && c.isActive);
    if (!promo) return null;
    if (promo.minCartValue && cartTotal < promo.minCartValue) return null;
    return promo;
};

// --- SETTINGS ---

export const fetchSettings = async (): Promise<SystemSettings> => {
    const snapshot = await getDocs(collection(db, SETTINGS_COL));
    const settingsDoc = snapshot.docs.find(d => d.id === 'global');
    if (settingsDoc) return settingsDoc.data() as SystemSettings;
    
    // In memory fallback only, avoid database overwrite on cache miss
    return DEFAULT_SETTINGS;
};

export const saveSettings = async (settings: SystemSettings): Promise<void> => {
    await setDoc(doc(db, SETTINGS_COL, 'global'), settings);
};

// --- PUBLIC VOUCHER LOOKUP (no auth required) ---
// Used by /voucher/:code public e-voucher page and /check page.
// Firebase rules must allow public read on vouchers collection.
export const fetchVoucherByCode = async (code: string): Promise<Voucher | null> => {
    const q = query(collection(db, VOUCHERS_COL), where('voucherCode', '==', code.toUpperCase().trim()));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as Voucher;
};

// Fetch all vouchers for a given phone number (client-side Active filter to avoid composite index).
// Normalises +601X -> 01X and vice versa so format mismatches don't cause missed results.
export const fetchVouchersByPhone = async (rawPhone: string): Promise<Voucher[]> => {
    const normalised = rawPhone.trim().replace(/^\+60/, '0').replace(/\s|-/g, '');
    const q = query(collection(db, VOUCHERS_COL), where('phoneNumber', '==', normalised));
    const snapshot = await getDocs(q);
    const vouchers: Voucher[] = [];
    snapshot.forEach(d => vouchers.push(d.data() as Voucher));
    return vouchers.sort((a, b) => new Date(b.dates.soldAt).getTime() - new Date(a.dates.soldAt).getTime());
};

// Atomically redeem multiple vouchers in a single Firestore batch.
// Re-validates each voucher status before writing — skips already-redeemed or expired ones.
// Returns an object: { redeemed: string[], skipped: string[] } with voucher codes.
export const bulkRedeemVouchers = async (
    vouchers: Voucher[],
    branch: string,
    picName: string,
    bookingDate: string
): Promise<{ redeemed: string[]; skipped: string[] }> => {
    const redeemed: string[] = [];
    const skipped: string[] = [];

    // Re-validate each voucher from DB to guard against race conditions
    const validated: Voucher[] = [];
    for (const v of vouchers) {
        const fresh = await fetchVoucherByCode(v.voucherCode);
        if (fresh && fresh.status === VoucherStatus.ACTIVE) {
            validated.push(fresh);
        } else {
            skipped.push(v.voucherCode);
        }
    }

    if (validated.length === 0) return { redeemed, skipped };

    const batch = writeBatch(db);
    const now = new Date().toISOString();
    validated.forEach(v => {
        const updated: Voucher = {
            ...v,
            status: VoucherStatus.REDEEMED,
            dates: { ...v.dates, redemptionDate: now, bookingDate: bookingDate || undefined },
            redemption: { branchName: branch },
            workflow: { ...v.workflow, redemptionPicName: picName }
        };
        batch.update(doc(db, VOUCHERS_COL, v.id), { ...updated });
        redeemed.push(v.voucherCode);
    });
    await batch.commit();

    await logAuditEvent(
        'BULK_REDEEM',
        `Bulk redeemed ${redeemed.length} voucher(s) at ${branch}: ${redeemed.join(', ')}${skipped.length ? ` | Skipped (not active): ${skipped.join(', ')}` : ''}`
    );

    return { redeemed, skipped };
};