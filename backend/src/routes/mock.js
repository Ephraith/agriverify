const express = require('express');
const { db } = require('../models/database');

module.exports = (io) => {
  const router = express.Router();

  // Mock Gava Connect verification — looks up farmer in DB
  router.post('/gava/verify', (req, res) => {
    const { national_id } = req.body;
    if (!national_id) return res.status(400).json({ verified: false, message: 'national_id is required' });

    db.get(`SELECT * FROM farmers WHERE national_id = ?`, [national_id], (err, farmer) => {
      if (err) return res.status(500).json({ verified: false, message: err.message });
      if (!farmer) return res.json({ verified: false, message: 'Farmer not found in database' });

      res.json({
        verified: true,
        user_id: `user-${farmer.national_id}`,
        name: farmer.name,
        phone: farmer.phone,
        already_verified: farmer.verified === 1
      });
    });
  });

  // Mock Daraja STK Push
  router.post('/daraja/stkpush', (req, res) => {
    const { phone, amount, device_id } = req.body;
    const transId = `tx-${Date.now()}`;
    const ts = Date.now();
    
    const stmt = db.prepare(`INSERT INTO transactions (trans_id, device_id, amount, status, ts) VALUES (?, ?, ?, ?, ?)`);
    stmt.run(transId, device_id || null, amount || 0, 'SUCCESS', ts, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      io.emit('payment', { trans_id: transId, device_id, amount, status: 'SUCCESS', ts });
      res.json({ status: 'SUCCESS', trans_id: transId });
    });
    stmt.finalize();
  });

  return router;
};
