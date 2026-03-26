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

  // Build professional plain-text message showing product names + codes
  const voucherLines = vouchers.map((v) => `• ${v.name}
  - Price: RM ${parseFloat(v.value).toFixed(2)}
  - Voucher Code: ${v.code}
  - Link: ${APP_URL}/voucher/${v.code}`).join('\n\n');

  const emailMessage = `${vouchers[0].name} E-Voucher!

Dear ${customerName || 'Customer'},

Thank you for choosing us. We are thrilled to have you! 
Please remember to download your e-vouchers and keep a digital or printed copy safe for your records.

===========================================================
ORDER SUMMARY
===========================================================

${voucherLines}

*(Note: If you cannot click the links above, please copy the full URL and paste it into your web browser.)*

===========================================================
HOW TO REDEEM YOUR VOUCHER
===========================================================
To secure your slot, please contact our team via WhatsApp at the respective site locations listed below. Our sales team will be happy to assist you with your booking:

- GOPENG GLAMPING PARK: +6013-240 8857 
- GLAMPING WETLAND PUTRAJAYA: +6013-347 8857 
- PUSAT REKREASI AIR PUTRAJAYA: +6013-262 8857 
- PUTRAJAYA WETLAND ADVENTURE PARK: +6018-701 8557 

===========================================================
IMPORTANT REMINDER
===========================================================
PLEASE REDEEM AND BOOK YOUR SLOT AS EARLY AS POSSIBLE. 
We highly recommend not waiting until your voucher is near its expiry date to avoid any booking disappointments.

We can't wait to welcome you to our place and provide you with an unforgettable experience!

Best regards,

GGP Group Official E-Voucher Store
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
      console.error('Chip-in API error:', data);
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
