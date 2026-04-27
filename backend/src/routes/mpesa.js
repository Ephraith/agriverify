const express = require('express');
const axios = require('axios');
const { db } = require('../models/database');

const SANDBOX_BASE = 'https://sandbox.safaricom.co.ke';
const LIVE_BASE = 'https://api.safaricom.co.ke';

function getBase() {
  return process.env.MPESA_ENV === 'production' ? LIVE_BASE : SANDBOX_BASE;
}

async function getAccessToken() {
  const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET } = process.env;
  const credentials = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');

  const { data } = await axios.get(`${getBase()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` }
  });
  return data.access_token;
}

function generatePassword() {
  const { MPESA_SHORTCODE, MPESA_PASSKEY } = process.env;
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64');
  return { password, timestamp };
}

module.exports = (io) => {
  const router = express.Router();

  // Initiate STK Push
  router.post('/stkpush', async (req, res) => {
    const { phone, amount, device_id, account_ref = 'AgriVerify', description = 'Irrigation Payment' } = req.body;

    if (!phone || !amount) return res.status(400).json({ error: 'phone and amount are required' });

    // Normalize phone: strip leading 0 or + and ensure 254 prefix
    const normalizedPhone = phone.replace(/^\+/, '').replace(/^0/, '254');

    try {
      const token = await getAccessToken();
      const { password, timestamp } = generatePassword();

      const { data } = await axios.post(
        `${getBase()}/mpesa/stkpush/v1/processrequest`,
        {
          BusinessShortCode: process.env.MPESA_SHORTCODE,
          Password: password,
          Timestamp: timestamp,
          TransactionType: 'CustomerPayBillOnline',
          Amount: Math.ceil(amount),
          PartyA: normalizedPhone,
          PartyB: process.env.MPESA_SHORTCODE,
          PhoneNumber: normalizedPhone,
          CallBackURL: process.env.MPESA_CALLBACK_URL,
          AccountReference: account_ref,
          TransactionDesc: description
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Store pending transaction
      const ts = Date.now();
      db.run(
        `INSERT INTO transactions (trans_id, device_id, amount, status, ts) VALUES (?, ?, ?, ?, ?)`,
        [data.CheckoutRequestID, device_id || null, amount, 'PENDING', ts],
        function (err) {
          if (err) console.error('DB insert error:', err.message);
        }
      );

      io.emit('payment', { trans_id: data.CheckoutRequestID, device_id, amount, status: 'PENDING', ts });
      res.json({ ok: true, CheckoutRequestID: data.CheckoutRequestID, ResponseDescription: data.ResponseDescription });
    } catch (err) {
      const msg = err.response?.data || err.message;
      console.error('STK Push error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // Safaricom callback
  router.post('/callback', (req, res) => {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) return res.sendStatus(400);

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callback;
    const status = ResultCode === 0 ? 'paid' : 'failed';

    let mpesaCode = null;
    if (CallbackMetadata) {
      const item = CallbackMetadata.Item.find(i => i.Name === 'MpesaReceiptNumber');
      if (item) mpesaCode = item.Value;
    }

    db.run(
      `UPDATE transactions SET status = ? WHERE trans_id = ?`,
      [status.toUpperCase(), CheckoutRequestID],
      function (err) {
        if (err) console.error('DB update error:', err.message);
      }
    );

    // Also update payments table if linked
    db.run(
      `UPDATE payments SET status = ?, transaction_id = ? WHERE transaction_id = ?`,
      [status, mpesaCode || CheckoutRequestID, CheckoutRequestID]
    );

    io.emit('payment', { trans_id: CheckoutRequestID, mpesa_code: mpesaCode, status, result_desc: ResultDesc });
    console.log(`Payment ${CheckoutRequestID}: ${status} — ${ResultDesc}`);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  // Query STK Push status
  router.get('/status/:checkoutRequestId', async (req, res) => {
    const { checkoutRequestId } = req.params;
    const { password, timestamp } = generatePassword();

    try {
      const token = await getAccessToken();
      const { data } = await axios.post(
        `${getBase()}/mpesa/stkpushquery/v1/query`,
        {
          BusinessShortCode: process.env.MPESA_SHORTCODE,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: checkoutRequestId
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.response?.data || err.message });
    }
  });

  return router;
};
