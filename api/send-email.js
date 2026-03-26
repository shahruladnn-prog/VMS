// api/send-email.js
// Vercel Serverless Function — sends voucher emails via Brevo (300 emails/day FREE)
// No PHP hosting required. This acts as the email sender endpoint.
//
// Required Vercel env vars:
//   BREVO_API_KEY     — get free at brevo.com (300 emails/day, no credit card)
//   BREVO_FROM_EMAIL  — e.g. booking@gopengglampingpark.com (must be verified in Brevo)
//   BREVO_FROM_NAME   — e.g. GGP Adventure Park
//
// In VMS Settings → Email:
//   Provider: Custom Server (PHP)
//   PHP Script URL: https://vms.gptt.my/api/send-email

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_API_KEY) {
    console.error('send-email: BREVO_API_KEY environment variable is not set');
    return res.status(500).json({ error: 'Email service not configured (missing BREVO_API_KEY)' });
  }

  const fromEmail = process.env.BREVO_FROM_EMAIL || 'booking@gopengglampingpark.com';
  const fromName  = process.env.BREVO_FROM_NAME  || 'GGP Adventure Park';

  const { to, subject, body } = req.body || {};

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender:      { name: fromName, email: fromEmail },
        to:          [{ email: to }],
        subject,
        htmlContent: body,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Brevo API error:', JSON.stringify(data));
      return res.status(response.status).json({
        error: data.message || 'Email send failed',
        details: data,
      });
    }

    console.log(`send-email: sent to ${to} (messageId: ${data.messageId})`);
    return res.status(200).json({ success: true, messageId: data.messageId });

  } catch (err) {
    console.error('send-email error:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
