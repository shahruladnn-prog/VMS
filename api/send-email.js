import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { to, subject, html, smtpHost, smtpPort, smtpUser, smtpPass, senderName, senderEmail } = req.body;

  if (!to || !subject || !html || !smtpHost || !smtpPort || !smtpUser || !smtpPass) {
    return res.status(400).json({ error: 'Missing required SMTP or Email parameters in request body' });
  }

  try {
    const isSSL = Number(smtpPort) === 465;
    
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort),
      secure: isSSL, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        rejectUnauthorized: false // Required to bypass cPanel self-signed certs
      }
    });

    const info = await transporter.sendMail({
      from: `"${senderName || 'GGP VMS'}" <${senderEmail || smtpUser}>`,
      to: to,
      subject: subject,
      html: html,
    });

    console.log(`send-email (SMTP): sent to ${to} (Message ID: ${info.messageId})`);
    return res.status(200).json({ success: true, messageId: info.messageId });
    
  } catch (error) {
    console.error('SMTP Connection/Send Error:', error);
    return res.status(500).json({ error: error.message || 'SMTP Connection Failed' });
  }
}
