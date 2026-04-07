// api/resend-voucher.js
// Serverless endpoint: resend a voucher email to the client.
// Called by AgentDashboard when an agent clicks "Resend".
// Reads settings from Firestore, builds the same email the webhook sends,
// then dispatches via SMTP. No sensitive ops beyond what the webhook already does.

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';

// Initialise Firebase Admin (same pattern as webhook.js)
function getAdminApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { voucherId, agentId } = req.body;
  if (!voucherId) {
    return res.status(400).json({ error: 'Missing voucherId' });
  }

  try {
    const app = getAdminApp();
    const db = getFirestore(app);

    // Fetch the voucher
    const voucherRef = db.collection('vouchers').doc(voucherId);
    const voucherSnap = await voucherRef.get();
    if (!voucherSnap.exists) return res.status(404).json({ error: 'Voucher not found' });

    const v = voucherSnap.data();

    // Security: ensure the calling agent owns this voucher
    // Customers can resend their own vouchers.
    if (agentId && agentId !== 'CUSTOMER' && v.agentId !== agentId) {
      return res.status(403).json({ error: 'Not authorised to resend this voucher' });
    }

    // Cannot resend if no client email
    if (!v.email) return res.status(400).json({ error: 'No client email on this voucher' });

    // Fetch settings for SMTP config and branding
    const settingsSnap = await db.collection('settings').doc('global').get();
    const settings = settingsSnap.exists ? settingsSnap.data() : {};
    const es = settings?.email;

    if (!es?.enabled || es?.provider !== 'SMTP' || !es?.smtpHost) {
      return res.status(503).json({ error: 'SMTP email is not configured. Please check Settings → Email.' });
    }

    const appUrl = settings?.chipin?.appUrl || 'https://vms.gptt.my';
    const biz = settings?.receipt?.businessName || 'Gopeng Glamping Park';
    const vp = settings?.voucherPage || {};

    const voucherUrl = `${appUrl}/voucher/${v.voucherCode}`;
    const expiryFormatted = v.dates?.expiryDate
      ? new Date(v.dates.expiryDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'N/A';

    const isAgentOrder = v.isAgentOrder === true;
    const agentName = v.agentName || '';
    const agentCode = v.agentCode || '';
    const agentEmail = v.agentEmail || '';

    const msgHtml = v.clientMessage
      ? `<div style="background:#f0fdf4;border-left:3px solid #0d9488;padding:10px 14px;margin:10px 0;border-radius:6px;font-style:italic;color:#374151;font-size:13px;">
           💬 "${v.clientMessage}"<br/>
           <span style="font-size:11px;color:#6b7280;font-style:normal;">— ${agentName}</span>
         </div>`
      : '';

    const agentAttr = isAgentOrder && agentName
      ? `<p style="color:#6b7280;font-size:13px;margin:16px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;">
           🎁 This voucher was gifted to you by <strong style="color:#374151;">${agentName}</strong>
           <span style="color:#9ca3af;font-size:11px;"> (${agentCode})</span> via ${biz}
         </p>`
      : '';

    const openingHtml = isAgentOrder && agentName
      ? `<p style="color:#374151;font-size:16px;">Dear <strong>${v.clientName}</strong>,</p>
         <p style="color:#374151;">You've received a special gift from <strong>${agentName}</strong>! Here is your e-voucher:</p>`
      : `<p style="color:#374151;font-size:16px;">Dear <strong>${v.clientName}</strong>,</p>
         <p style="color:#374151;">Here is your e-voucher:</p>`;

    const body = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#f9f9f9;padding:0;border-radius:12px;overflow:hidden;">
        <div style="background:${vp.primaryColor || '#0d9488'};padding:32px 24px;text-align:center;">
          ${vp.logoUrl ? `<img src="${vp.logoUrl}" alt="${biz}" style="max-height:60px;margin-bottom:12px;" />` : ''}
          <h1 style="color:white;margin:0;font-size:22px;">🎫 Your E-Voucher ${isAgentOrder ? '— A Gift For You!' : 'Is Ready!'}</h1>
          <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;">${biz}</p>
        </div>

        <div style="padding:32px 24px;background:white;">
          ${openingHtml}
          <div style="background:#f0fdf4;border:2px solid #0d9488;border-radius:12px;padding:20px;margin:16px 0;">
            <h2 style="color:#0d9488;margin:0 0 8px;font-size:18px;">${v.voucherDetails?.name}</h2>
            <p style="color:#374151;margin:4px 0;">Value: <strong>RM${v.voucherDetails?.value?.toFixed(2)}</strong></p>
            <p style="color:#374151;margin:4px 0;">Code: <strong style="font-family:monospace;font-size:16px;letter-spacing:2px;">${v.voucherCode}</strong></p>
            <p style="color:#dc2626;margin:8px 0 0;font-weight:bold;font-size:14px;">⚠️ Valid Until: ${expiryFormatted}</p>
            ${msgHtml}
            <div style="margin-top:16px;">
              <a href="${voucherUrl}" style="background:${vp.primaryColor || '#0d9488'};color:white;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:bold;display:inline-block;">View Voucher</a>
            </div>
            <p style="color:#6b7280;font-size:12px;margin:8px 0 0;">Or: <a href="${voucherUrl}" style="color:#0d9488;">${voucherUrl}</a></p>
          </div>
          ${agentAttr}
        </div>

        <div style="background:#f3f4f6;padding:20px 24px;text-align:center;">
          <p style="color:#6b7280;font-size:12px;margin:0;">${vp.footerText || 'Non-refundable. Subject to availability.'}</p>
          <p style="color:#9ca3af;font-size:11px;margin:8px 0 0;">
            ${vp.contactEmail ? `📧 ${vp.contactEmail}` : ''} ${vp.contactPhone ? `| 📞 ${vp.contactPhone}` : ''}
          </p>
        </div>
      </div>
    `;

    const emailSubject = isAgentOrder && agentName
      ? `🎁 Your E-Voucher — A Gift from ${agentName}`
      : `🎫 Your E-Voucher from ${biz}`;

    const transporter = nodemailer.createTransport({
      host: es.smtpHost,
      port: Number(es.smtpPort),
      secure: Number(es.smtpPort) === 465,
      auth: { user: es.smtpUser, pass: es.smtpPass },
      tls: { rejectUnauthorized: false }
    });

    await transporter.sendMail({
      from: `"${es.senderName || biz}" <${es.senderEmail || es.smtpUser}>`,
      to: v.email,
      subject: emailSubject,
      html: body
    });

    console.log(`resend-voucher: Resent ${v.voucherCode} to ${v.email} by agent ${agentId}`);

    // Also notify agent (only if triggered by agent)
    if (agentId && agentId !== 'CUSTOMER' && agentEmail && agentEmail !== v.email) {
      try {
        await transporter.sendMail({
          from: `"${es.senderName || biz}" <${es.senderEmail || es.smtpUser}>`,
          to: agentEmail,
          subject: `📤 Voucher Resent to ${v.clientName}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:32px;border-radius:12px;border:1px solid #e5e7eb;">
            <h3 style="color:#0d9488;margin:0 0 12px;">📤 Voucher Resent</h3>
            <p style="color:#374151;">Voucher <strong style="font-family:monospace;">${v.voucherCode}</strong> has been resent to <strong>${v.clientName}</strong> at <strong>${v.email}</strong>.</p>
            <p style="color:#9ca3af;font-size:12px;margin-top:16px;">${agentName} · ${agentCode} — GGP Agent Portal</p>
          </div>`
        });
      } catch (e) {
        console.warn('resend-voucher: agent notification failed:', e.message);
      }
    }

    return res.status(200).json({ success: true, sentTo: v.email });

  } catch (err) {
    console.error('resend-voucher error:', err);
    return res.status(500).json({ error: err.message || 'Failed to resend voucher' });
  }
}
