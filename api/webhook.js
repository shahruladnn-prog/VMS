// api/webhook.js
// Vercel Serverless Function — receives Chip-in webhook events (purchase.paid)
//
// Chip-in webhook payload format:
//   event.type         = "purchase.paid"   (NOT event_type)
//   event.purchase.id  = the Purchase UUID (NOT event.id — that's the event ID)
//
// Register webhook in Chip-in portal → Callback URL: https://vms.gptt.my/api/webhook
// Events: purchase.paid only (others are ignored safely)
//
// Required Vercel env vars:
//   FIREBASE_PROJECT_ID    — ggp-vms
//   FIREBASE_CLIENT_EMAIL  — from Firebase service account JSON
//   FIREBASE_PRIVATE_KEY   — from Firebase service account JSON

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin (singleton pattern prevents re-init on warm starts)
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

// Helper: send branded email via PHP script
async function sendVoucherEmail(settings, vouchers) {
  const phpUrl = settings?.email?.phpScriptUrl;
  if (!phpUrl || !settings?.email?.enabled) return;

  const appUrl = settings?.chipin?.appUrl || 'https://vms.gptt.my';
  const biz = settings?.receipt?.businessName || 'Gopeng Glamping Park';
  const vp = settings?.voucherPage || {};

  for (const voucher of vouchers) {
    if (!voucher.email) continue;

    const expiryFormatted = voucher.dates?.expiryDate
      ? new Date(voucher.dates.expiryDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'N/A';

    const voucherUrl = `${appUrl}/voucher/${voucher.voucherCode}`;

    const body = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background: #f9f9f9; padding: 0; border-radius: 12px; overflow: hidden;">
        <div style="background: ${vp.primaryColor || '#0d9488'}; padding: 32px 24px; text-align: center;">
          ${vp.logoUrl ? `<img src="${vp.logoUrl}" alt="${biz}" style="max-height: 60px; margin-bottom: 12px;" />` : ''}
          <h1 style="color: white; margin: 0; font-size: 22px;">🎫 Your E-Voucher is Ready!</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0;">${biz}</p>
        </div>

        <div style="padding: 32px 24px; background: white;">
          <p style="color: #374151; font-size: 16px;">Dear <strong>${voucher.clientName}</strong>,</p>
          <p style="color: #374151;">Thank you for your purchase! Your e-voucher is ready to use.</p>

          <div style="background: #f0fdf4; border: 2px solid #0d9488; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <h2 style="color: #0d9488; margin: 0 0 8px; font-size: 18px;">${voucher.voucherDetails?.name}</h2>
            <p style="color: #374151; margin: 4px 0;">Value: <strong>RM${voucher.voucherDetails?.value?.toFixed(2)}</strong></p>
            <p style="color: #374151; margin: 4px 0;">Code: <strong style="font-family: monospace; font-size: 16px; letter-spacing: 2px;">${voucher.voucherCode}</strong></p>
            <p style="color: #dc2626; margin: 8px 0 0; font-weight: bold; font-size: 15px;">⚠️ Valid Until: ${expiryFormatted}</p>
          </div>

          <div style="text-align: center; margin: 28px 0;">
            <a href="${voucherUrl}" style="background: ${vp.primaryColor || '#0d9488'}; color: white; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 16px; font-weight: bold; display: inline-block;">
              VIEW &amp; DOWNLOAD VOUCHER →
            </a>
          </div>

          <p style="color: #6b7280; font-size: 13px; text-align: center;">Or copy this link: <a href="${voucherUrl}" style="color: #0d9488;">${voucherUrl}</a></p>
        </div>

        <div style="background: #f3f4f6; padding: 20px 24px; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">${vp.footerText || 'Non-refundable. Subject to availability.'}</p>
          <p style="color: #9ca3af; font-size: 11px; margin: 8px 0 0;">
            ${vp.contactEmail ? `📧 ${vp.contactEmail}` : ''} ${vp.contactPhone ? `| 📞 ${vp.contactPhone}` : ''}
          </p>
        </div>
      </div>
    `;

    try {
      await fetch(phpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: voucher.email,
          subject: `🎫 Your ${voucher.voucherDetails?.name} Voucher — ${biz}`,
          body,
          fromEmail: settings?.email?.senderEmail || 'booking@gopengglampingpark.com',
          fromName: settings?.email?.senderName || biz || 'GGP VMS',
        }),
      });
    } catch (e) {
      console.warn(`Webhook: failed to send email to ${voucher.email}:`, e.message);
      // Non-blocking — voucher is already activated
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = req.body;

  // Chip-in sends event.type = "purchase.paid" (confirmed from API docs)
  // Also handle status === 'paid' as fallback for direct success_callback calls
  const isPaid = event?.type === 'purchase.paid' || event?.status === 'paid';
  if (!isPaid) {
    return res.status(200).json({ message: 'Event ignored', type: event?.type });
  }

  // Purchase ID is at event.purchase.id (NOT event.id — that's the event/callback ID)
  const purchaseId = event?.purchase?.id || event?.id;

  if (!purchaseId) {
    console.warn('Webhook: no purchase ID in payload', JSON.stringify(event));
    return res.status(400).json({ error: 'No purchase ID in webhook payload' });
  }

  try {
    // Load settings (for email sending after activation)
    let settings = null;
    try {
      const settingsDoc = await db.collection('settings').doc('global').get();
      if (settingsDoc.exists) settings = settingsDoc.data();
    } catch (e) {
      console.warn('Webhook: could not load settings:', e.message);
    }

    // Find all vouchers linked to this Chip-in purchase
    const snapshot = await db.collection('vouchers')
      .where('chipinPurchaseId', '==', purchaseId)
      .get();

    if (snapshot.empty) {
      console.warn(`Webhook: no vouchers found for chipinPurchaseId=${purchaseId}`);
      // Return 200 so Chip-in doesn't retry (might be a POS sale or test event)
      return res.status(200).json({ message: 'No vouchers matched', purchaseId });
    }

    // Batch activate all matched vouchers
    const batch = db.batch();
    const activatedVouchers = [];

    snapshot.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        status: 'Active',
        saleChannel: 'Online',
        'dates.paidAt': new Date().toISOString(),
        'financials.paymentMethod': 'Online',
      });
      activatedVouchers.push(docSnap.data());
    });

    await batch.commit();
    console.log(`Webhook: activated ${activatedVouchers.length} voucher(s) for purchaseId=${purchaseId}`);

    // Send branded email with voucher link (non-blocking)
    if (settings) {
      sendVoucherEmail(settings, activatedVouchers).catch(e =>
        console.warn('Webhook: email send error:', e.message)
      );
    }

    return res.status(200).json({ success: true, activatedCount: activatedVouchers.length });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
