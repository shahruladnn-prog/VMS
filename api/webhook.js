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
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

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

// ─── IDEMPOTENCY ─────────────────────────────────────────────────────────────
// Uses Firestore transactions to guarantee exactly-once processing.
// If the lock document already exists, the webhook silently returns 200.
// Chip-in retries on non-2xx, so returning 200 stops the retry cycle.
async function acquireProcessingLock(purchaseId) {
  const lockRef = db.collection('webhook_locks').doc(purchaseId);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(lockRef);
      if (snap.exists) {
        // Already processed — throw to abort transaction and signal duplicate
        throw new Error('ALREADY_PROCESSED');
      }
      tx.set(lockRef, {
        purchaseId,
        processedAt: FieldValue.serverTimestamp(),
        // Auto-cleanup: Cloud Firestore TTL can delete these after 7 days
        ttl: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    });
    return true;  // Lock acquired — proceed
  } catch (e) {
    if (e.message === 'ALREADY_PROCESSED') return false;
    throw e;      // Real error — re-throw
  }
}

// ─── EMAIL ────────────────────────────────────────────────────────────────────
async function sendVoucherEmail(settings, vouchers) {
  const es = settings?.email;
  if (!es?.enabled || es?.provider !== 'SMTP' || !es?.smtpHost) return;

  const appUrl = settings?.chipin?.appUrl || 'https://vms.gptt.my';
  const biz = settings?.receipt?.businessName || 'Gopeng Glamping Park';
  const vp = settings?.voucherPage || {};

  // Group vouchers by client email to send one email per client
  const emailGroups = {};
  for (const v of vouchers) {
    if (!v.email) continue;
    if (!emailGroups[v.email]) emailGroups[v.email] = [];
    emailGroups[v.email].push(v);
  }

  let transporter;
  try {
    transporter = nodemailer.createTransport({
      host: es.smtpHost,
      port: Number(es.smtpPort),
      secure: Number(es.smtpPort) === 465,
      auth: { user: es.smtpUser, pass: es.smtpPass },
      tls: { rejectUnauthorized: false }
    });
  } catch(e) {
    console.warn('Webhook: Nodemailer init failed:', e.message);
    return;
  }

  for (const [email, userVouchers] of Object.entries(emailGroups)) {
    try {
      const clientName = userVouchers[0].clientName || 'Valued Customer';
      const isAgentOrder = userVouchers[0].isAgentOrder === true;
      const agentName = userVouchers[0].agentName || '';
      const agentCode = userVouchers[0].agentCode || '';
      const agentEmail = userVouchers[0].agentEmail || '';

      const orderTitle = userVouchers.length > 1 ? `Your ${userVouchers.length} E-Vouchers` : `Your E-Voucher`;

      const voucherItemsHtml = userVouchers.map(voucher => {
        const expiryFormatted = voucher.dates?.expiryDate
          ? new Date(voucher.dates.expiryDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })
          : 'N/A';
        const voucherUrl = `${appUrl}/voucher/${voucher.voucherCode}`;
        const msgHtml = voucher.clientMessage
          ? `<div style="background:#f0fdf4;border-left:3px solid #0d9488;padding:10px 14px;margin:10px 0;border-radius:6px;font-style:italic;color:#374151;font-size:13px;">
               💬 "${voucher.clientMessage}"<br/>
               <span style="font-size:11px;color:#6b7280;font-style:normal;">— ${agentName}</span>
             </div>`
          : '';
        return `
          <div style="background: #f0fdf4; border: 2px solid #0d9488; border-radius: 12px; padding: 20px; margin: 16px 0;">
            <h2 style="color: #0d9488; margin: 0 0 8px; font-size: 18px;">${voucher.voucherDetails?.name}</h2>
            <p style="color: #374151; margin: 4px 0;">Value: <strong>RM${voucher.voucherDetails?.value?.toFixed(2)}</strong></p>
            <p style="color: #374151; margin: 4px 0;">Code: <strong style="font-family: monospace; font-size: 16px; letter-spacing: 2px;">${voucher.voucherCode}</strong></p>
            <p style="color: #dc2626; margin: 8px 0 0; font-weight: bold; font-size: 14px;">⚠️ Valid Until: ${expiryFormatted}</p>
            ${msgHtml}
            <div style="margin-top: 16px;">
              <a href="${voucherUrl}" style="background: ${vp.primaryColor || '#0d9488'}; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: bold; display: inline-block;">
                View Voucher
              </a>
            </div>
            <p style="color: #6b7280; font-size: 12px; margin: 8px 0 0;">Or link: <a href="${voucherUrl}" style="color: #0d9488;">${voucherUrl}</a></p>
          </div>
        `;
      }).join('');

      const agentAttributionHtml = isAgentOrder && agentName
        ? `<p style="color: #6b7280; font-size: 13px; margin: 16px 0 0; padding-top: 16px; border-top: 1px solid #e5e7eb;">
             🎁 This voucher was gifted to you by <strong style="color: #374151;">${agentName}</strong>
             <span style="color: #9ca3af; font-size: 11px;"> (${agentCode})</span> via ${biz}
           </p>`
        : '';

      const openingHtml = isAgentOrder && agentName
        ? `<p style="color: #374151; font-size: 16px;">Dear <strong>${clientName}</strong>,</p>
           <p style="color: #374151;">You've received a special gift from <strong>${agentName}</strong>! Here are your e-voucher(s):</p>`
        : `<p style="color: #374151; font-size: 16px;">Dear <strong>${clientName}</strong>,</p>
           <p style="color: #374151;">Thank you for your purchase! Here are your e-vouchers:</p>`;

      const body = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background: #f9f9f9; padding: 0; border-radius: 12px; overflow: hidden;">
          <div style="background: ${vp.primaryColor || '#0d9488'}; padding: 32px 24px; text-align: center;">
            ${vp.logoUrl ? `<img src="${vp.logoUrl}" alt="${biz}" style="max-height: 60px; margin-bottom: 12px;" />` : ''}
            <h1 style="color: white; margin: 0; font-size: 22px;">🎫 ${orderTitle} ${isAgentOrder ? '— A Gift For You!' : 'Are Ready!'}</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0;">${biz}</p>
          </div>

          <div style="padding: 32px 24px; background: white;">
            ${openingHtml}
            ${voucherItemsHtml}
            ${agentAttributionHtml}
          </div>

          <div style="background: #f3f4f6; padding: 20px 24px; text-align: center;">
            <p style="color: #6b7280; font-size: 12px; margin: 0;">${vp.footerText || 'Non-refundable. Subject to availability.'}</p>
            <p style="color: #9ca3af; font-size: 11px; margin: 8px 0 0;">
              ${vp.contactEmail ? `📧 ${vp.contactEmail}` : ''} ${vp.contactPhone ? `| 📞 ${vp.contactPhone}` : ''}
            </p>
          </div>
        </div>
      `;

      const emailSubject = isAgentOrder && agentName
        ? `🎁 ${orderTitle} — A Gift from ${agentName}`
        : `🎫 ${orderTitle} from ${biz}`;

      await transporter.sendMail({
        from: `"${es.senderName || biz}" <${es.senderEmail || es.smtpUser}>`,
        to: email,
        subject: emailSubject,
        html: body
      });
      console.log(`Webhook: Sent email with ${userVouchers.length} voucher(s) to client ${email}`);

      // Agent confirmation BCC
      if (isAgentOrder && agentEmail && agentEmail !== email) {
        try {
          const confirmSubject = `✅ Voucher${userVouchers.length > 1 ? 's' : ''} sent to ${clientName} — Confirmation`;
          const confirmBody = `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; background: white; padding: 32px; border-radius: 12px; border: 1px solid #e5e7eb;">
              <h2 style="color: #0d9488; margin: 0 0 16px;">✅ Delivery Confirmed</h2>
              <p style="color: #374151; margin: 0 0 16px;">
                Your voucher${userVouchers.length > 1 ? 's have' : ' has'} been sent to <strong>${clientName}</strong> at <strong>${email}</strong>.
              </p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                <thead><tr style="background:#f9fafb;"><th style="text-align:left;padding:8px 12px;font-size:12px;color:#6b7280;border:1px solid #e5e7eb;">Voucher</th><th style="text-align:left;padding:8px 12px;font-size:12px;color:#6b7280;border:1px solid #e5e7eb;">Code</th><th style="text-align:right;padding:8px 12px;font-size:12px;color:#6b7280;border:1px solid #e5e7eb;">Value</th></tr></thead>
                <tbody>
                  ${userVouchers.map(v => `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:13px;">${v.voucherDetails?.name}</td><td style="padding:8px 12px;border:1px solid #e5e7eb;font-family:monospace;font-size:13px;">${v.voucherCode}</td><td style="padding:8px 12px;border:1px solid #e5e7eb;text-align:right;font-weight:bold;">RM${v.voucherDetails?.value?.toFixed(2)}</td></tr>`).join('')}
                </tbody>
              </table>
              <p style="color:#9ca3af;font-size:11px;margin:0;">${agentName} · ${agentCode} — GGP Agent Portal</p>
            </div>
          `;
          await transporter.sendMail({
            from: `"${es.senderName || biz}" <${es.senderEmail || es.smtpUser}>`,
            to: agentEmail,
            subject: confirmSubject,
            html: confirmBody
          });
          console.log(`Webhook: Sent agent confirmation to ${agentEmail} for client ${email}`);
        } catch (e) {
          console.warn(`Webhook: Failed agent BCC to ${agentEmail}:`, e.message);
        }
      }

    } catch (e) {
      console.warn(`Webhook: failed to send email to ${email}:`, e.message);
    }
  }
}


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = req.body;

  const isPaid = event?.type === 'purchase.paid' || event?.status === 'paid';
  if (!isPaid) {
    return res.status(200).json({ message: 'Event ignored', type: event?.type });
  }

  const purchaseId = event?.purchase?.id || event?.id;

  if (!purchaseId) {
    console.warn('Webhook: no purchase ID in payload', JSON.stringify(event));
    return res.status(400).json({ error: 'No purchase ID in webhook payload' });
  }

  // ── IDEMPOTENCY CHECK ──────────────────────────────────────────────────────
  // Acquire a Firestore lock for this purchaseId.
  // If another webhook invocation already holds the lock, return 200 immediately.
  // This prevents double-emails when Chip-in retries on slow responses.
  let lockAcquired = false;
  try {
    lockAcquired = await acquireProcessingLock(purchaseId);
  } catch (lockErr) {
    console.error('Webhook: lock error:', lockErr.message);
    // On lock error, fall through and process anyway (fail-open)
    lockAcquired = true;
  }

  if (!lockAcquired) {
    console.log(`Webhook: duplicate call for purchaseId=${purchaseId} — skipped (already processed)`);
    return res.status(200).json({ message: 'Already processed', purchaseId });
  }
  // ──────────────────────────────────────────────────────────────────────────

  try {
    // Load settings
    let settings = null;
    try {
      const settingsDoc = await db.collection('settings').doc('global').get();
      if (settingsDoc.exists) settings = settingsDoc.data();
    } catch (e) {
      console.warn('Webhook: could not load settings:', e.message);
    }

    // Find all vouchers linked to this purchase
    const snapshot = await db.collection('vouchers')
      .where('chipinPurchaseId', '==', purchaseId)
      .get();

    if (snapshot.empty) {
      console.warn(`Webhook: no vouchers found for chipinPurchaseId=${purchaseId}`);
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

    // Send emails (blocking — Vercel needs this to complete before lambda freezes)
    if (settings) {
      await sendVoucherEmail(settings, activatedVouchers).catch(e =>
        console.warn('Webhook: email send error:', e.message)
      );
    }

    return res.status(200).json({ success: true, activatedCount: activatedVouchers.length });

  } catch (err) {
    console.error('Webhook error:', err);
    // Release the lock on unexpected errors so a genuine retry can succeed
    try {
      await db.collection('webhook_locks').doc(purchaseId).delete();
    } catch (_) { /* ignore */ }
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
