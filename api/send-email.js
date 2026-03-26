// api/send-email.js
// Vercel Serverless Function — sends voucher emails via Resend (free)
// No PHP hosting required. This acts as the email sender endpoint.
//
// Required Vercel env var:
//   RESEND_API_KEY  — get free at resend.com
//   RESEND_FROM     — e.g. "GGP Adventure Park <booking@gopengglampingpark.com>"
//                     (domain must be verified in Resend, OR use onboarding@resend.dev for testing)
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

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('send-email: RESEND_API_KEY environment variable is not set');
    return res.status(500).json({ error: 'Email service not configured (missing RESEND_API_KEY)' });
  }

  const FROM_ADDRESS = process.env.RESEND_FROM || 'GGP Adventure Park <onboarding@resend.dev>';

  const { to, subject, body } = req.body || {};

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [to],
        subject,
        html: body,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Resend API error:', JSON.stringify(data));
      return res.status(response.status).json({
        error: data.message || 'Email send failed',
        details: data,
      });
    }

    console.log(`send-email: sent to ${to} (id: ${data.id})`);
    return res.status(200).json({ success: true, id: data.id });

  } catch (err) {
    console.error('send-email error:', err.message);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
