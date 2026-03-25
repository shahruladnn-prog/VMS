// api/webhook.js
// Vercel Serverless Function — receives Chip-in webhook events
// Register this URL in Chip-in merchant portal: https://your-app.vercel.app/api/webhook
//
// Listens for: purchase.paid event
// Action: Updates voucher status from "Pending Payment" → "Active" in Firestore
//
// Required Vercel env vars:
//   CHIPIN_WEBHOOK_SECRET  — a secret string you set in Chip-in portal to validate requests
//   FIREBASE_PROJECT_ID    — ggp-vms
//   FIREBASE_CLIENT_EMAIL  — from your Firebase service account JSON
//   FIREBASE_PRIVATE_KEY   — from your Firebase service account JSON (with \n replaced)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (singleton)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional: validate webhook secret header
  const webhookSecret = process.env.CHIPIN_WEBHOOK_SECRET;
  if (webhookSecret) {
    const incomingSecret = req.headers['x-webhook-secret'] || req.headers['x-chipin-secret'];
    if (incomingSecret !== webhookSecret) {
      console.warn('Webhook secret mismatch — rejected');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const event = req.body;

  // Only process paid events
  if (event?.event_type !== 'purchase.paid' && event?.status !== 'paid') {
    return res.status(200).json({ message: 'Event ignored', event_type: event?.event_type });
  }

  const purchaseId = event?.id || event?.purchase?.id;

  if (!purchaseId) {
    return res.status(400).json({ error: 'No purchase ID in webhook payload' });
  }

  try {
    // Find all vouchers in Firestore that belong to this Chip-in purchase
    const vouchersRef = db.collection('vouchers');
    const snapshot = await vouchersRef.where('chipinPurchaseId', '==', purchaseId).get();

    if (snapshot.empty) {
      console.warn(`Webhook: No vouchers found for chipinPurchaseId=${purchaseId}`);
      // Return 200 so Chip-in doesn't retry — might be a POS sale already handled
      return res.status(200).json({ message: 'No vouchers matched', purchaseId });
    }

    // Batch update all matched vouchers to Active
    const batch = db.batch();
    snapshot.forEach((doc) => {
      batch.update(doc.ref, {
        status: 'Active',
        saleChannel: 'Online',
        'dates.paidAt': new Date().toISOString(),
      });
    });

    await batch.commit();

    console.log(`Webhook: Activated ${snapshot.size} voucher(s) for purchaseId=${purchaseId}`);
    return res.status(200).json({ success: true, activatedCount: snapshot.size });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
