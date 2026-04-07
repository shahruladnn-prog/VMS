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

  const { voucherId, voucherIds: incomingIds, agentId } = req.body;
  const idsToFetch = incomingIds || (voucherId ? [voucherId] : []);
  
  if (idsToFetch.length === 0) {
    return res.status(400).json({ error: 'Missing voucherId or voucherIds' });
  }

  try {
    const app = getAdminApp();
    const db = getFirestore(app);

    // Fetch all requested vouchers
    const refs = idsToFetch.map(id => db.collection('vouchers').doc(id));
    const snaps = await db.getAll(...refs);
    
    const vouchers = snaps.filter(s => s.exists).map(s => s.data());
    if (vouchers.length === 0) return res.status(404).json({ error: 'Vouchers not found' });

    // Security: ensure the calling agent owns these vouchers (if agent) and that they have emails
    const validVouchers = vouchers.filter(v => {
      if (!v.email) return false;
      if (agentId && agentId !== 'CUSTOMER' && v.agentId !== agentId) return false;
      return true;
    });

    if (validVouchers.length === 0) {
      return res.status(403).json({ error: 'No valid/authorized vouchers with emails found' });
    }

    const vFirst = validVouchers[0];
    const targetEmail = vFirst.email; // All grouped vouchers go to this email


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

    const isAgentOrder = vFirst.isAgentOrder === true;
    const agentName = vFirst.agentName || '';
    const agentCode = vFirst.agentCode || '';
    const agentEmail = vFirst.agentEmail || '';

    // If multiple vouchers, we list them all out
    let emailHtmlContext = '';
    
    if (validVouchers.length === 1) {
        // SINGLE VOUCHER HTML (Original layout)
        const v = validVouchers[0];
        const voucherUrl = `${appUrl}/voucher/${v.voucherCode}`;
        const expiryFormatted = v.dates?.expiryDate
          ? new Date(v.dates.expiryDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })
          : 'N/A';
          
        const msgHtml = v.clientMessage
          ? `<div style="background:#f0fdf4;border-left:3px solid #0d9488;padding:10px 14px;margin:10px 0;border-radius:6px;font-style:italic;color:#374151;font-size:13px;">
               💬 "${v.clientMessage}"<br/>
               <span style="font-size:11px;color:#6b7280;font-style:normal;">— ${agentName}</span>
             </div>`
          : '';

        emailHtmlContext = `
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
        `;
    } else {
        // MULTIPLE VOUCHERS HTML (Grouped layout)
        const itemsHtml = validVouchers.map(v => {
            const voucherUrl = `${appUrl}/voucher/${v.voucherCode}`;
            const expiryFormatted = v.dates?.expiryDate
              ? new Date(v.dates.expiryDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' })
              : 'N/A';
            return `
              <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:12px 0;">
                <p style="margin:0 0 4px;font-weight:700;color:#0d9488;font-size:16px;">${v.voucherDetails?.name}</p>
                <p style="margin:0 0 4px;font-size:14px;color:#374151;">Value: <strong>RM${v.voucherDetails?.value?.toFixed(2)}</strong></p>
                <p style="margin:0 0 4px;font-size:14px;color:#374151;">Code: <strong style="font-family:monospace;letter-spacing:2px;">${v.voucherCode}</strong></p>
                <p style="margin:0 0 10px;font-size:13px;color:#dc2626;">⚠️ Valid Until: ${expiryFormatted}</p>
                <a href="${voucherUrl}" style="background:${vp.primaryColor || '#0d9488'};color:white;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:bold;display:inline-block;">View Voucher</a>
              </div>
            `;
        }).join('');
        
        emailHtmlContext = `
          <div style="margin:16px 0;">
             <p style="color:#374151;font-weight:bold;margin-bottom:12px;">You hold ${validVouchers.length} valid vouchers:</p>
             ${itemsHtml}
          </div>
        `;
    }

    const agentAttr = isAgentOrder && agentName
      ? `<p style="color:#6b7280;font-size:13px;margin:16px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;">
           🎁 This voucher was gifted to you by <strong style="color:#374151;">${agentName}</strong>
           <span style="color:#9ca3af;font-size:11px;"> (${agentCode})</span> via ${biz}
         </p>`
      : '';

    const openingHtml = isAgentOrder && agentName
      ? `<p style="color:#374151;font-size:16px;">Dear <strong>${vFirst.clientName}</strong>,</p>
         <p style="color:#374151;">You've received a special gift from <strong>${agentName}</strong>! Here ${validVouchers.length > 1 ? 'are your e-vouchers' : 'is your e-voucher'}:</p>`
      : `<p style="color:#374151;font-size:16px;">Dear <strong>${vFirst.clientName}</strong>,</p>
         <p style="color:#374151;">Here ${validVouchers.length > 1 ? 'are your e-vouchers' : 'is your e-voucher'}:</p>`;

    const body = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#f9f9f9;padding:0;border-radius:12px;overflow:hidden;">
        <div style="background:${vp.primaryColor || '#0d9488'};padding:32px 24px;text-align:center;">
          ${vp.logoUrl ? `<img src="${vp.logoUrl}" alt="${biz}" style="max-height:60px;margin-bottom:12px;" />` : ''}
          <h1 style="color:white;margin:0;font-size:22px;">🎫 Your E-Voucher${validVouchers.length > 1 ? 's' : ''} ${isAgentOrder ? '— A Gift For You!' : 'Are Ready!'}</h1>
          <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;">${biz}</p>
        </div>

        <div style="padding:32px 24px;background:white;">
          ${openingHtml}
          ${emailHtmlContext}
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
      ? `🎁 Your E-Voucher${validVouchers.length > 1 ? 's' : ''} — A Gift from ${agentName}`
      : `🎫 Your E-Voucher${validVouchers.length > 1 ? 's' : ''} from ${biz}`;

    const transporter = nodemailer.createTransport({
      host: es.smtpHost,
      port: Number(es.smtpPort),
      secure: Number(es.smtpPort) === 465,
      auth: { user: es.smtpUser, pass: es.smtpPass },
      tls: { rejectUnauthorized: false }
    });

    await transporter.sendMail({
      from: `"${es.senderName || biz}" <${es.senderEmail || es.smtpUser}>`,
      to: targetEmail,
      subject: emailSubject,
      html: body
    });

    console.log(`resend-voucher: Resent ${validVouchers.length} vouchers to ${targetEmail} by agent ${agentId}`);

    // Also notify agent (only if triggered by agent)
    if (agentId && agentId !== 'CUSTOMER' && agentEmail && agentEmail !== targetEmail) {
      try {
        await transporter.sendMail({
          from: `"${es.senderName || biz}" <${es.senderEmail || es.smtpUser}>`,
          to: agentEmail,
          subject: `📤 Voucher${validVouchers.length > 1 ? 's' : ''} Resent to ${vFirst.clientName}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:32px;border-radius:12px;border:1px solid #e5e7eb;">
            <h3 style="color:#0d9488;margin:0 0 12px;">📤 Voucher${validVouchers.length > 1 ? 's' : ''} Resent</h3>
            <p style="color:#374151;">${validVouchers.length} voucher(s) have been resent to <strong>${vFirst.clientName}</strong> at <strong>${targetEmail}</strong>.</p>
            <p style="color:#9ca3af;font-size:12px;margin-top:16px;">${agentName} · ${agentCode} — GGP Agent Portal</p>
          </div>`
        });
      } catch (e) {
        console.warn('resend-voucher: agent notification failed:', e.message);
      }
    }

    return res.status(200).json({ success: true, sentTo: targetEmail, count: validVouchers.length });

  } catch (err) {
    console.error('resend-voucher error:', err);
    return res.status(500).json({ error: err.message || 'Failed to resend voucher' });
  }
}
