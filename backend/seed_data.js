const { db } = require('./src/models/database');

// Insert sample farmers
db.run(`INSERT OR IGNORE INTO farmers (id, national_id, name, phone, verified) VALUES 
  (1, '12345678', 'John Kamau', '254712345678', 0),
  (2, '87654321', 'Mary Wanjiku', '254787654321', 1)`);

// Insert sample devices
db.run(`INSERT OR IGNORE INTO devices (id, device_id, farmer_id, location, status) VALUES 
  (1, 'ESP32_001', 1, 'Kiambu Farm A', 'active'),
  (2, 'ESP32_002', 2, 'Nakuru Farm B', 'active')`);

// Insert sample payments
db.run(`INSERT OR IGNORE INTO payments (device_id, amount, status, due_date) VALUES 
  (1, 500, 'pending', '2024-04-15'),
  (2, 500, 'paid', '2024-04-10')`);

// Insert sample telemetry
db.run(`INSERT OR IGNORE INTO telemetry (device_id, flow_rate, soil_moisture, valve_state) VALUES 
  (1, 2.5, 45.2, 'open'),
  (2, 1.8, 52.1, 'closed')`);

console.log('Sample data inserted successfully');
db.close();
