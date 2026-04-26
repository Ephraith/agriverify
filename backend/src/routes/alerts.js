const express = require('express');
const { db } = require('../models/database');

module.exports = (io) => {
  const router = express.Router();

  router.post('/', (req, res) => {
    const { device_id, alert_type, severity } = req.body;
    const ts = Date.now();
    
    const stmt = db.prepare(`INSERT INTO audit_alerts (device_id, alert_type, severity, ts) VALUES (?, ?, ?, ?)`);
    stmt.run(device_id, alert_type, severity || 'CRITICAL', ts, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      const payload = { id: this.lastID, device_id, alert_type, severity, ts };
      io.emit('alert', payload);
      res.json({ ok: true, id: this.lastID });
    });
    stmt.finalize();
  });

  return router;
};
