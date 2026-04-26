const express = require('express');
const { db } = require('../models/database');

module.exports = (io) => {
  const router = express.Router();

  router.post('/', (req, res) => {
    const { device_id, flow_rate, soil_moisture, valve_state, ts } = req.body;
    const timestamp = ts || Date.now();

    const stmt = db.prepare(`INSERT INTO sensor_logs (device_id, flow_rate, soil_moisture, valve_state, ts) VALUES (?, ?, ?, ?, ?)`);
    stmt.run(device_id, flow_rate, soil_moisture, valve_state, timestamp, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      const payload = { id: this.lastID, device_id, flow_rate, soil_moisture, valve_state, ts: timestamp };
      io.emit('telemetry', payload);
      res.json({ ok: true, id: this.lastID });
    });
    stmt.finalize();
  });

  return router;
};
