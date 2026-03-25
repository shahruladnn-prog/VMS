// api/create-purchase.js
// Vercel Serverless Function — creates a Chip-in purchase securely server-side
// Set these in Vercel Dashboard > Project > Environment Variables:
//   CHIPIN_API_KEY  = jlOwwtRAHoMl4Bg7ASwa8cL_eUwe_g-Fb9Uc4W5elggVkUXOiSRux8ZdPAgytdkqOdytlvH_Vkuafb9uXsU-mg==  (test key)
//   CHIPIN_BRAND_ID = 38675dc8-983d-4b93-84bd-6c9bef48150d

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CHIPIN_API_KEY = process.env.CHIPIN_API_KEY;
  const CHIPIN_BRAND_ID = process.env.CHIPIN_BRAND_ID;

  if (!CHIPIN_API_KEY || !CHIPIN_BRAND_ID) {
    return res.status(500).json({ error: 'Chip-in API credentials not configured in environment variables.' });
  }

  const { customerEmail, customerName, vouchers, type, successUrl, failureUrl } = req.body;

  if (!customerEmail || !vouchers || vouchers.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: customerEmail, vouchers' });
  }

  // Build products array for Chip-in — each voucher is a separate product line
  const products = vouchers.map((v) => ({
    name: `${v.name} — Code: ${v.code}`,
    price: Math.round(v.value * 100), // Chip-in uses cents (e.g. RM50.00 = 5000)
    quantity: 1,
  }));

  // Build the friendly email message with all voucher codes
  const codeList = vouchers.map((v) => v.code).join(', ');
  const emailMessage =
    vouchers.length === 1
      ? `Your voucher code is ${vouchers[0].code}. Please present this at redemption.`
      : `Your voucher codes are: ${codeList}. Please present these at redemption.`;

  const body = {
    brand_id: CHIPIN_BRAND_ID,
    send_receipt: true,
    client: {
      email: customerEmail,
      full_name: customerName || '',
    },
    purchase: {
      products,
      currency: 'MYR',
      email_message: emailMessage,
    },
  };

  // Only add redirects for online purchases (not POS mark_as_paid flow)
  if (type === 'online') {
    if (successUrl) body.success_redirect = successUrl;
    if (failureUrl) body.failure_redirect = failureUrl;
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
      return res.status(response.status).json({ error: data.message || 'Chip-in API error', details: data });
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
