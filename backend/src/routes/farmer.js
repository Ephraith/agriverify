const express = require('express');
const { db } = require('../models/database');
const axios = require('axios');

module.exports = (io) => {
  const router = express.Router();

  // Farmer login — require national ID and password
  router.post('/login', (req, res) => {
    const { national_id, password } = req.body || {};
    if (!national_id || !password) return res.status(400).json({ error: 'national_id and password are required' });

    db.get(`SELECT * FROM farmers WHERE national_id = ?`, [national_id], (err, farmer) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!farmer) return res.status(404).json({ error: 'Farmer not found. Please contact your administrator.' });
      if (farmer.active === 0) return res.status(403).json({ error: 'Your account is deactivated. Contact administrator.' });
      
      const bcrypt = require('bcryptjs');
      const ok = bcrypt.compareSync(password, farmer.password_hash || '');
      if (!ok) return res.status(403).json({ error: 'Invalid credentials' });

      res.json({
        id: farmer.id,
        name: farmer.name,
        phone: farmer.phone,
        national_id: farmer.national_id,
        verified: farmer.verified
      });
    });
  });

  // Get farmer dashboard — device + latest telemetry + payment status
  router.get('/dashboard/:farmerId', (req, res) => {
    const { farmerId } = req.params;

    db.all(`
      SELECT
        d.id, d.device_id, d.location, d.status, d.maintenance_status, d.maintenance_notes, d.maintenance_date,
        sl.flow_rate, sl.soil_moisture, sl.valve_state, sl.ts as last_reading,
        p.status as payment_status, p.amount as payment_amount, p.due_date, p.created_at as payment_date
      FROM devices d
      LEFT JOIN sensor_logs sl ON sl.device_id = d.device_id
        AND sl.ts = (SELECT MAX(ts) FROM sensor_logs WHERE device_id = d.device_id)
      LEFT JOIN payments p ON p.device_id = d.id
        AND p.id = (SELECT id FROM payments WHERE device_id = d.id ORDER BY created_at DESC LIMIT 1)
      WHERE d.farmer_id = ?
    `, [farmerId], (err, devices) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(devices);
    });
  });

  // Farmer-initiated STK Push payment
  router.post('/pay', async (req, res) => {
    const { farmerId, deviceId, amount, payment_type } = req.body;
    if (!farmerId || !deviceId || !amount || !payment_type) {
      return res.status(400).json({ error: 'farmerId, deviceId, amount and payment_type are required' });
    }

    // Verify device belongs to farmer and get phone
    db.get(`
      SELECT d.id as device_db_id, d.device_id, f.phone
      FROM devices d JOIN farmers f ON d.farmer_id = f.id
      WHERE d.device_id = ? AND d.farmer_id = ?
    `, [deviceId, farmerId], async (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(403).json({ error: 'Device not found or does not belong to you' });

      try {
        const PORT = process.env.PORT || 3000;
        const response = await axios.post(`http://localhost:${PORT}/mpesa/stkpush`, {
          phone: row.phone,
          amount,
          device_id: deviceId,
          account_ref: payment_type,
          description: payment_type.replace(/_/g, ' ')
        });
        const result = response.data;
        if (!result.ok) return res.status(500).json({ error: result.error });

        // Record in payments table
        db.run(
          `INSERT INTO payments (device_id, amount, status, transaction_id) VALUES (?, ?, 'pending', ?)`,
          [row.device_db_id, amount, result.CheckoutRequestID]
        );

        io.emit('payment', { trans_id: result.CheckoutRequestID, device_id: deviceId, amount, status: 'PENDING', ts: Date.now() });
        res.json({ ok: true, CheckoutRequestID: result.CheckoutRequestID });
      } catch (err) {
        res.status(500).json({ error: 'Payment service unavailable' });
      }
    });
  });

  // Farmer-initiated retry of a payment
  router.post('/retry-payment', async (req, res) => {
    const { farmerId, paymentId } = req.body;
    if (!farmerId || !paymentId) return res.status(400).json({ error: 'farmerId and paymentId are required' });

    // Verify payment belongs to this farmer
    const q = `
      SELECT p.id, p.amount, p.device_id as device_db_id, d.device_id, f.phone
      FROM payments p
      JOIN devices d ON p.device_id = d.id
      JOIN farmers f ON d.farmer_id = f.id
      WHERE p.id = ? AND d.farmer_id = ?
    `;

    db.get(q, [paymentId, farmerId], async (err, payment) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!payment) return res.status(403).json({ error: 'Payment not found or access denied' });

      try {
        const PORT = process.env.PORT || 3000;
        const response = await axios.post(`http://localhost:${PORT}/mpesa/stkpush`, {
          phone: payment.phone,
          amount: payment.amount,
          device_id: payment.device_id,
          account_ref: `Retry-${payment.device_id}`,
          description: 'Payment Retry'
        });

        const result = response.data;
        if (!result.ok) return res.status(500).json({ error: result.error });

        // Update record with new transaction ID
        db.run(
          `UPDATE payments SET transaction_id = ?, status = 'pending', created_at = datetime('now') WHERE id = ?`,
          [result.CheckoutRequestID, paymentId]
        );

        io.emit('payment', { trans_id: result.CheckoutRequestID, device_id: payment.device_id, amount: payment.amount, status: 'PENDING', ts: Date.now() });
        res.json({ ok: true, CheckoutRequestID: result.CheckoutRequestID });
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message;
        res.status(500).json({ error: errMsg });
      }
    });
  });

  // Get farmer payment history
  router.get('/payments/:farmerId', (req, res) => {
    const { farmerId } = req.params;

    db.all(`
      SELECT p.id, p.amount, p.status, p.transaction_id, p.due_date, p.created_at, d.device_id, d.location
      FROM payments p
      JOIN devices d ON p.device_id = d.id
      WHERE d.farmer_id = ?
      ORDER BY p.created_at DESC
    `, [farmerId], (err, payments) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(payments);
    });
  });

  // Submit maintenance/repair request
  router.post('/maintenance-request', (req, res) => {
    const { farmerId, deviceId, issue_type, description } = req.body;
    if (!farmerId || !deviceId || !issue_type) {
      return res.status(400).json({ error: 'farmerId, deviceId and issue_type are required' });
    }

    // Verify device belongs to this farmer
    db.get(`SELECT id FROM devices WHERE device_id = ? AND farmer_id = ?`, [deviceId, farmerId], (err, device) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!device) return res.status(403).json({ error: 'Device not found or does not belong to you' });

      db.run(
        `INSERT INTO audit_alerts (device_id, alert_type, severity, ts) VALUES (?, ?, ?, ?)`,
        [deviceId, issue_type, 'MAINTENANCE_REQUEST', Date.now()],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });

          // Update device maintenance status
          db.run(
            `UPDATE devices SET maintenance_status = 'needs_maintenance', maintenance_notes = ? WHERE device_id = ? AND farmer_id = ?`,
            [description || issue_type, deviceId, farmerId]
          );

          io.emit('maintenance_request', { farmerId, deviceId, issue_type, description });
          res.json({ ok: true, id: this.lastID, message: 'Maintenance request submitted successfully' });
        }
      );
    });
  });

  // Get maintenance request history for a farmer
  router.get('/maintenance-requests/:farmerId', (req, res) => {
    const { farmerId } = req.params;

    db.all(`
      SELECT a.id, a.device_id, a.alert_type as issue_type, a.severity, a.resolved, a.ts,
             d.location
      FROM audit_alerts a
      JOIN devices d ON a.device_id = d.device_id
      WHERE d.farmer_id = ? AND a.severity = 'MAINTENANCE_REQUEST'
      ORDER BY a.ts DESC
    `, [farmerId], (err, requests) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(requests);
    });
  });

  return router;
};
