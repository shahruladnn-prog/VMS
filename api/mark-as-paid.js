// api/mark-as-paid.js
// Vercel Serverless Function — marks a Chip-in purchase as paid
// Called by CashierMode after cashier confirms payment at the counter
// This triggers Chip-in to immediately send the receipt email with voucher code(s)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CHIPIN_API_KEY = process.env.CHIPIN_API_KEY;

  if (!CHIPIN_API_KEY) {
    return res.status(500).json({ error: 'Chip-in API key not configured.' });
  }

  const { purchaseId } = req.body;

  if (!purchaseId) {
    return res.status(400).json({ error: 'Missing purchaseId' });
  }

  const paidOn = Math.floor(Date.now() / 1000); // Unix timestamp

  try {
    const response = await fetch(`https://gate.chip-in.asia/api/v1/purchases/${purchaseId}/mark_as_paid/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CHIPIN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paid_on: paidOn }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Chip-in mark_as_paid error:', data);
      return res.status(response.status).json({ error: data.message || 'Chip-in API error', details: data });
    }

    // data.marked_as_paid will be true for POS sales
    return res.status(200).json({
      success: true,
      markedAsPaid: data.marked_as_paid,
      purchaseId: data.id,
    });
  } catch (err) {
    console.error('mark-as-paid error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
