// api/create-purchase.js
// Vercel Serverless Function — creates a Chip-in purchase securely server-side
//
// Required Vercel env vars:
//   CHIPIN_API_KEY  = your Chip-in secret API key
//   CHIPIN_BRAND_ID = your Chip-in brand UUID
//   APP_URL         = https://vms.gptt.my (used for success_callback)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CHIPIN_API_KEY = process.env.CHIPIN_API_KEY;
  const CHIPIN_BRAND_ID = process.env.CHIPIN_BRAND_ID;
  const APP_URL = process.env.APP_URL || 'https://vms.gptt.my';

  if (!CHIPIN_API_KEY || !CHIPIN_BRAND_ID) {
    return res.status(500).json({ error: 'Chip-in API credentials not configured.' });
  }

  const { customerEmail, customerName, customerPhone, vouchers, type, successUrl, failureUrl } = req.body;

  if (!customerEmail || !vouchers || vouchers.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: customerEmail, vouchers' });
  }

  // Each voucher is a separate product line in Chip-in
  // price is in cents (e.g. RM50.00 = 5000)
  const products = vouchers.map((v) => ({
    name: v.name,
    price: Math.round(v.value * 100),
    quantity: 1,
  }));

  // Build highly compressed plain-text message to bypass Chip-in's strict character limits
  const voucherLines = vouchers.map((v) => `• ${v.name} (Code: ${v.code})\n  Link: ${APP_URL}/voucher/${v.code}`).join('\n\n');

  const emailMessage = `Thank you for choosing GGP!

ORDER SUMMARY:
${voucherLines}

HOW TO REDEEM:
WhatsApp us to secure your slot early:
- GOPENG GLAMPING: +60132408857 
- GLAMPING WETLAND: +60133478857 
- REKREASI AIR: +60132628857 
- WETLAND ADVENTURE: +60187018557 

GGP E-Voucher Store
https://vms.gptt.my/check`;

  // Reference field: comma-separated voucher codes — used for cross-referencing
  const reference = vouchers.map(v => v.code).join(',');

  const body = {
    brand_id: CHIPIN_BRAND_ID,
    send_receipt: true,         // Send Chip-in's receipt with our custom message
    reference,                  // Voucher codes for traceability
    client: {
      email: customerEmail,
      full_name: customerName || '',
      phone: customerPhone || '',
    },
    purchase: {
      products,
      currency: 'MYR',
      email_message: emailMessage,
      timezone: 'Asia/Kuala_Lumpur',
    },
    // success_callback: Chip-in calls this URL immediately on payment success
    // This is more reliable than global webhook for per-purchase activation
    success_callback: `${APP_URL}/api/webhook`,
  };

  // Add redirects for online purchases
  if (type === 'online') {
    if (successUrl) body.success_redirect = successUrl;
    if (failureUrl) body.failure_redirect = failureUrl;
    body.cancel_redirect = failureUrl || `${APP_URL}/store`;
  }

  try {
    const response = await fetch('https://gate.chip-in.asia/api/v1/purchases/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CHIPIN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Chip-in API error:', JSON.stringify(data));
      return res.status(response.status).json({
        error: data.message || 'Chip-in API error',
        details: data,
      });
    }

    return res.status(200).json({
      purchaseId: data.id,
      checkoutUrl: data.checkout_url || null,
      status: data.status,
    });

  } catch (err) {
    console.error('create-purchase error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
