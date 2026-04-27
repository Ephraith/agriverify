const express = require('express');
const { db } = require('../models/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'dev_admin_secret';

module.exports = (io) => {
  const router = express.Router();

  // Middleware to protect admin routes
  function verifyAdminToken(req, res, next) {
    const auth = req.headers.authorization || '';
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
    const token = parts[1];
    try {
      const payload = jwt.verify(token, ADMIN_JWT_SECRET);
      req.admin = payload;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // Get all systems with farmer and payment status
  router.get('/systems', verifyAdminToken, (req, res) => {
    const query = `
      SELECT 
        d.id,
        d.device_id,
        d.farmer_id,
        d.location,
        d.status,
        d.maintenance_status,
        d.maintenance_notes,
        f.name as farmer_name,
        f.phone,
        f.verified,
        (
          SELECT status FROM payments p2 WHERE p2.device_id = d.id ORDER BY p2.created_at DESC LIMIT 1
        ) as payment_status,
        (
          SELECT amount FROM payments p2 WHERE p2.device_id = d.id ORDER BY p2.created_at DESC LIMIT 1
        ) as payment_amount,
        (
          SELECT MAX(timestamp) FROM telemetry t2 WHERE t2.device_id = d.id
        ) as last_telemetry
      FROM devices d
      LEFT JOIN farmers f ON d.farmer_id = f.id
      ORDER BY d.id;
    `;

    db.all(query, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const normalized = rows.map(r => ({
        ...r,
        verified: r.verified ? 1 : 0,
        last_telemetry: r.last_telemetry || null
      }));
      res.json(normalized);
    });
  });

  // Program Statistics for Government/Donor Oversight
  router.get('/stats', verifyAdminToken, (req, res) => {
    const stats = {};
    
    const queries = [
      { key: 'totalFarmers', sql: 'SELECT COUNT(*) as count FROM farmers WHERE active = 1' },
      { key: 'verifiedFarmers', sql: 'SELECT COUNT(*) as count FROM farmers WHERE verified = 1 AND active = 1' },
      { key: 'totalSystems', sql: 'SELECT COUNT(*) as count FROM devices' },
      { key: 'activeSystems', sql: 'SELECT COUNT(*) as count FROM devices WHERE status = "active"' },
      { key: 'totalPayments', sql: 'SELECT SUM(amount) as total FROM payments WHERE status = "paid"' },
      { key: 'pendingPaymentsCount', sql: 'SELECT COUNT(*) as count FROM payments WHERE status = "pending"' },
      { key: 'maintenanceRequests', sql: 'SELECT COUNT(*) as count FROM devices WHERE maintenance_status != "good"' },
      { key: 'avgMoisture', sql: 'SELECT AVG(soil_moisture) as avg FROM sensor_logs WHERE ts > (strftime("%s", "now") * 1000 - 3600000)' },
      { key: 'activeIrrigation', sql: 'SELECT COUNT(DISTINCT device_id) as count FROM sensor_logs WHERE valve_state = "open" AND ts > (strftime("%s", "now") * 1000 - 600000)' }
    ];

    let completed = 0;
    queries.forEach(q => {
      db.get(q.sql, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (q.key === 'totalPayments') {
          stats[q.key] = row.total || 0;
        } else if (q.key === 'avgMoisture') {
          stats[q.key] = row.avg ? Math.round(row.avg * 10) / 10 : 0;
        } else {
          stats[q.key] = row.count !== undefined ? row.count : (row.total || 0);
        }
        
        completed++;
        if (completed === queries.length) {
          res.json(stats);
        }
      });
    });
  });

  // Create a new system/device
  router.post('/systems', verifyAdminToken, (req, res) => {
    const { device_id, location, status, farmer_id } = req.body;
    if (!device_id) return res.status(400).json({ error: 'device_id is required' });

    db.run(
      'INSERT INTO devices (device_id, location, status, farmer_id) VALUES (?, ?, ?, ?)',
      [device_id, location || '', status || 'active', farmer_id === 'null' ? null : farmer_id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
      }
    );
  });

  // Update a system/device (including assignment)
  router.patch('/systems/:id', verifyAdminToken, (req, res) => {
    const { id } = req.params;
    const { device_id, location, status, farmer_id } = req.body;
    
    const updates = [];
    const params = [];
    if (device_id !== undefined) { updates.push('device_id = ?'); params.push(device_id); }
    if (location !== undefined) { updates.push('location = ?'); params.push(location); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    if (farmer_id !== undefined) { updates.push('farmer_id = ?'); params.push(farmer_id === 'null' ? null : farmer_id); }
    
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    
    params.push(id);
    const sql = `UPDATE devices SET ${updates.join(', ')} WHERE id = ?`;
    
    db.run(sql, params, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    });
  });

  // Delete a system/device
  router.delete('/systems/:id', verifyAdminToken, (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM devices WHERE id = ?', [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, deleted: this.changes });
    });
  });

  // Verify farmer using Gava Connect
  router.post('/verify-farmer', verifyAdminToken, async (req, res) => {
    const { farmerId, nationalId } = req.body || {};
    if (!nationalId) return res.status(400).json({ error: 'nationalId is required' });

    try {
      const PORT = process.env.PORT || 3000;
      console.log(`Attempting verification for farmerId=${farmerId || 'N/A'} with ID ${nationalId}`);

      const response = await axios.post(`http://localhost:${PORT}/mock/gava/verify`, { national_id: nationalId });
      const result = response.data;
      console.log('Mock verification result:', result);

      if (!result.verified) {
        console.warn('Verification failed by mock service:', result.message);
        return res.json({ success: false, message: result.message || 'Farmer not found in database' });
      }

      // Find farmer id if not provided
      const finalizeUpdate = (idToUpdate) => {
        db.run('UPDATE farmers SET verified = 1 WHERE id = ?', [idToUpdate], function(err) {
          if (err) {
            console.error('Database update error:', err.message);
            return res.status(500).json({ error: err.message });
          }
          io.emit('farmer_verified', { farmerId: idToUpdate, verified: true, name: result.name });
          res.json({ success: true, farmer: { name: result.name, phone: result.phone, user_id: result.user_id } });
        });
      };

      if (farmerId) {
        // update directly by id
        return finalizeUpdate(farmerId);
      }

      // lookup by national_id
      db.get('SELECT id FROM farmers WHERE national_id = ?', [nationalId], (err, row) => {
        if (err) {
          console.error('DB lookup error:', err.message);
          return res.status(500).json({ error: err.message });
        }
        if (!row) return res.status(404).json({ success: false, message: 'Farmer not found' });
        finalizeUpdate(row.id);
      });
    } catch (error) {
      const errMsg = error.response?.data?.message || error.response?.data?.error || error.message;
      console.error('Verification service error:', errMsg);
      res.status(500).json({ error: 'Verification service error: ' + errMsg });
    }
  });

  // Initiate payment via real M-Pesa STK Push
  router.post('/initiate-payment', verifyAdminToken, async (req, res) => {
    const { deviceId, phone, amount } = req.body;

    try {
      const PORT = process.env.PORT || 3000;
      const response = await axios.post(`http://localhost:${PORT}/mpesa/stkpush`, {
        phone, amount, device_id: deviceId, account_ref: `Device-${deviceId}`
      });

      const result = response.data;
      if (!result.ok) return res.status(500).json({ error: result.error });

      db.run(
        'INSERT OR REPLACE INTO payments (device_id, amount, status, transaction_id) VALUES (?, ?, ?, ?)',
        [deviceId, amount, 'pending', result.CheckoutRequestID],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          io.emit('payment_initiated', { deviceId, transactionId: result.CheckoutRequestID });
          res.json(result);
        }
      );
    } catch (error) {
      const errMsg = error.response?.data?.error || error.message;
      res.status(500).json({ error: errMsg });
    }
  });

  // Update system maintenance status
  router.post('/maintenance', verifyAdminToken, (req, res) => {
    const { deviceId, status, notes } = req.body;
    
    db.run(
      'UPDATE devices SET maintenance_status = ?, maintenance_notes = ?, maintenance_date = datetime("now") WHERE id = ?',
      [status, notes, deviceId],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        io.emit('maintenance_updated', { deviceId, status, notes });
        res.json({ success: true });
      }
    );
  });

  // List maintenance requests for admin (all farmers)
  router.get('/requests', verifyAdminToken, (req, res) => {
    const query = `
      SELECT a.id, a.device_id, a.alert_type as issue_type, a.severity, a.resolved, a.ts,
             d.location, d.farmer_id, f.name as farmer_name, f.phone
      FROM audit_alerts a
      JOIN devices d ON a.device_id = d.device_id
      LEFT JOIN farmers f ON d.farmer_id = f.id
      WHERE a.severity = 'MAINTENANCE_REQUEST'
      ORDER BY a.ts DESC
    `;

    db.all(query, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // Resolve a maintenance request
  router.post('/requests/:id/resolve', verifyAdminToken, (req, res) => {
    const { id } = req.params;
    const { resolution_notes } = req.body;

    db.get('SELECT device_id FROM audit_alerts WHERE id = ?', [id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Request not found' });

      db.run('UPDATE audit_alerts SET resolved = 1 WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        // mark device maintenance status as good and add notes
        db.run('UPDATE devices SET maintenance_status = ?, maintenance_notes = ? WHERE device_id = ?', ['good', resolution_notes || 'Resolved by admin', row.device_id], function(err) {
          if (err) return res.status(500).json({ error: err.message });
          io.emit('maintenance_resolved', { requestId: id, deviceId: row.device_id });
          res.json({ success: true });
        });
      });
    });
  });

  // Get pending payments
  router.get('/payments/pending', verifyAdminToken, (req, res) => {
    const q = `SELECT p.id, p.device_id, p.amount, p.status, p.transaction_id, p.due_date, p.created_at, d.device_id as device_code, f.name as farmer_name, f.phone
               FROM payments p
               LEFT JOIN devices d ON p.device_id = d.id
               LEFT JOIN farmers f ON d.farmer_id = f.id
               WHERE p.status != 'paid' ORDER BY p.created_at DESC`;
    db.all(q, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // Add a new farmer (Admin initiated - password removed for harmonious flow)
  router.post('/farmers', verifyAdminToken, (req, res) => {
    const { national_id, name, phone } = req.body || {};
    if (!national_id || !name) return res.status(400).json({ error: 'national_id and name required' });
    
    db.run('INSERT OR IGNORE INTO farmers (national_id, name, phone, verified, active) VALUES (?, ?, ?, 0, 1)', 
      [national_id, name, phone || ''], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const id = this.lastID;
      db.get('SELECT id, national_id, name, phone, verified, active FROM farmers WHERE id = ?', [id], (err, row) => { 
        if (err) return res.status(500).json({ error: err.message }); 
        res.json({ success: true, farmer: row }); 
      });
    });
  });

  // List farmers for admin
  router.get('/farmers/list', verifyAdminToken, (req, res) => {
    const query = `
      SELECT 
        f.id, 
        f.national_id, 
        f.name, 
        f.phone, 
        f.verified, 
        f.active,
        EXISTS(SELECT 1 FROM devices d WHERE d.farmer_id = f.id) as assigned
      FROM farmers f 
      ORDER BY f.id DESC
    `;
    db.all(query, [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // Update farmer (activate/deactivate or update fields)
  router.patch('/farmers/:id', verifyAdminToken, (req, res) => {
    const { id } = req.params;
    const { name, phone, verified, active } = req.body || {};
    // Build dynamic update
    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (verified !== undefined) { updates.push('verified = ?'); params.push(verified ? 1 : 0); }
    if (active !== undefined) { updates.push('active = ?'); params.push(active ? 1 : 0); }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(id);
    const sql = `UPDATE farmers SET ${updates.join(', ')} WHERE id = ?`;
    db.run(sql, params, function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true, changes: this.changes }); });
  });

  // Delete farmer
  router.delete('/farmers/:id', verifyAdminToken, (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM farmers WHERE id = ?', [id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, deleted: this.changes });
    });
  });

  

  // Retry a pending or failed payment
  router.post('/retry-payment', verifyAdminToken, async (req, res) => {
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ error: 'paymentId is required' });

    // Fetch payment details including device and farmer info
    const q = `
      SELECT p.id, p.amount, p.device_id, d.device_id as device_code, f.phone
      FROM payments p
      JOIN devices d ON p.device_id = d.id
      JOIN farmers f ON d.farmer_id = f.id
      WHERE p.id = ?
    `;

    db.get(q, [paymentId], async (err, payment) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!payment) return res.status(404).json({ error: 'Payment record not found' });
      if (!payment.phone) return res.status(400).json({ error: 'Farmer phone number missing' });

      try {
        const PORT = process.env.PORT || 3000;
        const response = await axios.post(`http://localhost:${PORT}/mpesa/stkpush`, {
          phone: payment.phone, 
          amount: payment.amount, 
          device_id: payment.device_code, 
          account_ref: `Retry-${payment.device_code}`
        });

        const result = response.data;
        if (!result.ok) return res.status(500).json({ error: result.error });

        // Update the payment record with the new CheckoutRequestID and reset status to pending
        db.run(
          'UPDATE payments SET transaction_id = ?, status = "pending", created_at = datetime("now") WHERE id = ?',
          [result.CheckoutRequestID, paymentId],
          function (err) {
            if (err) return res.status(500).json({ error: err.message });
            io.emit('payment_initiated', { deviceId: payment.device_id, transactionId: result.CheckoutRequestID });
            res.json({ success: true, CheckoutRequestID: result.CheckoutRequestID });
          }
        );
      } catch (error) {
        const errMsg = error.response?.data?.error || error.message;
        res.status(500).json({ error: errMsg });
      }
    });
  });

  // Admin login. Returns JWT on success.
  router.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    const user = username || 'admin';
    if (!password) return res.status(400).json({ error: 'Password required' });

    db.get('SELECT id, username, password_hash FROM admins WHERE username = ?', [user], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(403).json({ error: 'Invalid admin credentials' });
      const ok = bcrypt.compareSync(password, row.password_hash);
      if (!ok) return res.status(403).json({ error: 'Invalid admin credentials' });
      const token = jwt.sign({ sub: row.id, username: row.username }, ADMIN_JWT_SECRET, { expiresIn: '8h' });
      res.json({ ok: true, token });
    });
  });

  // Debug: list registered admin router routes
  router.get('/_routes', (req, res) => {
    try {
      const routes = router.stack
        .filter(r => r.route)
        .map(r => ({ path: r.route.path, methods: r.route.methods }));
      res.json(routes);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};
