const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '../../agri_verify.db');
const db = new sqlite3.Database(DB_PATH);

function init() {
  db.serialize(() => {
    // Admins table for authenticated admin users
    db.run(`CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT
    )`);

    // Seed a default admin if it doesn't exist (username: admin, password: admin123)
    const defaultAdmin = { username: 'admin', password: 'admin123' };
    db.get('SELECT id FROM admins WHERE username = ?', [defaultAdmin.username], (err, row) => {
      if (err) return;
      if (!row) {
        const hash = bcrypt.hashSync(defaultAdmin.password, 10);
        db.run('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [defaultAdmin.username, hash]);
      }
    });
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT UNIQUE,
      national_id TEXT,
      name TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS farmers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      national_id TEXT UNIQUE,
      name TEXT,
      phone TEXT,
      verified INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT UNIQUE,
      farmer_id INTEGER,
      location TEXT,
      status TEXT DEFAULT 'active',
      maintenance_status TEXT DEFAULT 'good',
      maintenance_notes TEXT,
      maintenance_date TEXT,
      FOREIGN KEY (farmer_id) REFERENCES farmers (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER,
      amount REAL,
      status TEXT DEFAULT 'pending',
      transaction_id TEXT,
      due_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER,
      flow_rate REAL,
      soil_moisture REAL,
      valve_state TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sensor_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      flow_rate REAL,
      soil_moisture REAL,
      valve_state TEXT,
      ts INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trans_id TEXT,
      device_id TEXT,
      amount REAL,
      status TEXT,
      ts INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS audit_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      alert_type TEXT,
      severity TEXT,
      resolved INTEGER DEFAULT 0,
      farmer_confirmed INTEGER DEFAULT 0,
      ts INTEGER
    )`);

    // Seed mock farmers
    const seedFarmers = [
      ['12345678', 'John Kamau',     '254712345678', 0],
      ['87654321', 'Mary Wanjiku',   '254787654321', 1],
      ['11223344', 'Peter Otieno',   '254723456789', 0],
      ['44332211', 'Grace Muthoni',  '254734567890', 1],
      ['55667788', 'David Kipchoge', '254745678901', 0],
      ['99887766', 'Alice Njeri',    '254756789012', 1],
    ];
    const farmerStmt = db.prepare(
      `INSERT OR IGNORE INTO farmers (national_id, name, phone, verified) VALUES (?, ?, ?, ?)`
    );
    seedFarmers.forEach(f => farmerStmt.run(f));
    farmerStmt.finalize();

    // Seed mock devices (linked to farmer rows by rowid order)
    db.run(`
      INSERT OR IGNORE INTO devices (device_id, farmer_id, location, status) VALUES
        ('ESP32_001', 1, 'Kiambu Farm A',  'active'),
        ('ESP32_002', 2, 'Nakuru Farm B',  'active'),
        ('ESP32_003', 3, 'Meru Farm C',    'active'),
        ('ESP32_004', 4, 'Kisumu Farm D',  'active')
    `);

    // Ensure `active` column exists on farmers table for soft-deactivate
    db.all(`PRAGMA table_info(farmers)`, (err, cols) => {
      if (err) return;
      const hasActive = cols && cols.some(c => c.name === 'active');
      if (!hasActive) {
        db.run(`ALTER TABLE farmers ADD COLUMN active INTEGER DEFAULT 1`);
      }
    });
    // Ensure `password_hash` column exists for farmers and seed default passwords if missing
    db.all(`PRAGMA table_info(farmers)`, (err, cols) => {
      if (err) return;
      const hasPwd = cols && cols.some(c => c.name === 'password_hash');
      if (!hasPwd) {
        db.run(`ALTER TABLE farmers ADD COLUMN password_hash TEXT`);
        // set a default password for existing farmers (please change in production)
        db.all(`SELECT id FROM farmers`, [], (err, rows) => {
          if (err) return;
          rows.forEach(r => {
            const hash = bcrypt.hashSync('farmer123', 10);
            db.run('UPDATE farmers SET password_hash = ? WHERE id = ?', [hash, r.id]);
          });
        });
      } else {
        // ensure any farmer without a password_hash gets a default
        db.all(`SELECT id FROM farmers WHERE password_hash IS NULL OR password_hash = ''`, [], (err, rows) => {
          if (err) return;
          rows.forEach(r => {
            const hash = bcrypt.hashSync('farmer123', 10);
            db.run('UPDATE farmers SET password_hash = ? WHERE id = ?', [hash, r.id]);
          });
        });
      }
    });
  });
}

module.exports = { db, init };
