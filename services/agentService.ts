// services/agentService.ts
// Handles all agent authentication, session management, and CRUD.
// Completely separate from voucherService — no shared state.

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { Agent } from '../types';

// Re-use same Firebase project (reads config from the existing app instance)
const firebaseConfig = {
  apiKey: "AIzaSyDTcln5MUBNGJKJkC3GLMePgGx98_OisvA",
  authDomain: "ggp-vms.firebaseapp.com",
  projectId: "ggp-vms",
  storageBucket: "ggp-vms.firebasestorage.app",
  messagingSenderId: "725624706356",
  appId: "1:725624706356:web:dead6487efcbcc36af4161"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

const AGENTS_COL = 'agents';
const AGENT_SESSION_KEY = 'ggp_current_agent';
const AGENT_SESSION_TS_KEY = 'ggp_agent_login_timestamp';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// --- PASSWORD HASHING (Web Crypto — no deps) ---
export const hashPassword = async (plain: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Generate a sequential-looking agent code: AGT-XXXX
export const generateAgentCode = (index: number): string => {
  return `AGT-${String(index).padStart(4, '0')}`;
};

// --- AUTH ---

export const agentLogin = async (email: string, password: string): Promise<Agent> => {
  const q = query(collection(db, AGENTS_COL), where('email', '==', email.toLowerCase().trim()));
  const snapshot = await getDocs(q);

  if (snapshot.empty) throw new Error('Invalid email or password.');

  const agentDoc = snapshot.docs[0];
  const agent = agentDoc.data() as Agent;

  if (agent.status === 'suspended') {
    throw new Error('Your agent account has been suspended. Please contact GGP.');
  }

  const hashedInput = await hashPassword(password);
  const storedPwd = agent.password || '';

  // Support plain-text legacy passwords (short), auto-migrate on first login
  const isPlain = storedPwd.length <= 20;
  let matched = false;

  if (isPlain) {
    if (storedPwd === password) {
      matched = true;
      // Auto-migrate to hashed
      await updateDoc(doc(db, AGENTS_COL, agent.id), { password: hashedInput });
    }
  } else {
    matched = storedPwd === hashedInput;
  }

  if (!matched) throw new Error('Invalid email or password.');

  // Persist session
  localStorage.setItem(AGENT_SESSION_KEY, JSON.stringify(agent));
  localStorage.setItem(AGENT_SESSION_TS_KEY, Date.now().toString());
  return agent;
};

export const agentLogout = (): void => {
  localStorage.removeItem(AGENT_SESSION_KEY);
  localStorage.removeItem(AGENT_SESSION_TS_KEY);
};

export const getCurrentAgent = (): Agent | null => {
  const session = localStorage.getItem(AGENT_SESSION_KEY);
  if (!session) return null;

  const ts = localStorage.getItem(AGENT_SESSION_TS_KEY);
  if (ts && Date.now() - parseInt(ts) > SESSION_TTL_MS) {
    agentLogout();
    return null;
  }

  return JSON.parse(session) as Agent;
};

// --- AGENT CRUD (Admin use) ---

export const fetchAgents = async (): Promise<Agent[]> => {
  const snapshot = await getDocs(collection(db, AGENTS_COL));
  const agents: Agent[] = [];
  snapshot.forEach(d => agents.push(d.data() as Agent));
  return agents.sort((a, b) => a.agentCode.localeCompare(b.agentCode));
};

export const createAgent = async (agentData: Omit<Agent, 'id' | 'agentCode' | 'createdAt'>): Promise<Agent> => {
  // Auto-generate next agent code
  const existing = await fetchAgents();
  const nextIndex = existing.length + 1;
  const agentCode = generateAgentCode(nextIndex);

  const id = crypto.randomUUID();
  const hashedPwd = agentData.password ? await hashPassword(agentData.password) : await hashPassword('agent123');

  const agent: Agent = {
    ...agentData,
    id,
    agentCode,
    password: hashedPwd,
    email: agentData.email.toLowerCase().trim(),
    status: agentData.status || 'active',
    createdAt: new Date().toISOString(),
    // Default optional string fields to '' — Firestore rejects undefined
    phone: agentData.phone || '',
    companyName: agentData.companyName || '',
    notes: agentData.notes || '',
  };

  // Strip any remaining undefined values
  const clean = Object.fromEntries(
    Object.entries(agent).filter(([, v]) => v !== undefined)
  ) as Agent;

  await setDoc(doc(db, AGENTS_COL, id), clean);
  return clean;
};

export const updateAgent = async (agent: Agent, currentPassword?: string, newPassword?: string): Promise<void> => {
  const updates: Partial<Agent> = {
    ...agent,
    // Ensure optional fields are never undefined
    phone: agent.phone || '',
    companyName: agent.companyName || '',
    notes: agent.notes || '',
  };

  if (newPassword) {
    // Self-service password change — verify current password first
    if (currentPassword !== undefined) {
      const q = query(collection(db, AGENTS_COL), where('id', '==', agent.id));
      const snapshot = await getDocs(q);
      if (snapshot.empty) throw new Error('Agent not found.');
      const stored = snapshot.docs[0].data() as Agent;

      const hashedCurrent = await hashPassword(currentPassword);
      const isPlain = (stored.password || '').length <= 20;
      const matched = isPlain
        ? stored.password === currentPassword
        : stored.password === hashedCurrent;
      if (!matched) throw new Error('Current password is incorrect.');
    }
    updates.password = await hashPassword(newPassword);
  } else if (updates.password && updates.password.length < 64) {
    // Admin update with plain-text password → hash it
    updates.password = await hashPassword(updates.password);
  }

  updates.email = updates.email?.toLowerCase().trim();
  // Strip undefined values — Firestore rejects them
  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined)
  );
  await updateDoc(doc(db, AGENTS_COL, agent.id), cleanUpdates);
};


export const deleteAgent = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, AGENTS_COL, id));
};

