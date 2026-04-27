// Use a different local name to avoid redeclaring `socket` (declared in socket.js)
const socketClient = window.socket || (typeof io === 'function' ? io() : null);
let farmer = null;

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  if (el) {
    el.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
    el.style.display = 'block';
  }
  showNotification(msg, 'error');
}

async function farmerLogin() {
  const isAdmin = document.getElementById('admin-checkbox').checked;
  const nationalId = document.getElementById('login-national-id').value.trim();
  const password = document.getElementById('login-password') ? document.getElementById('login-password').value : '';
  const adminPassword = document.getElementById('admin-password').value || '';
  const errDiv = document.getElementById('login-error');
  const farmerBtn = document.getElementById('login-button');
  const adminBtn = document.getElementById('admin-login-button');
  
  if (errDiv) errDiv.style.display = 'none';

  // Client-side validation
  if (isAdmin) {
    if (!adminPassword) { showLoginError('Please enter the admin password.'); return; }
  } else {
    if (!nationalId) { showLoginError('Please enter your National ID.'); return; }
    if (!password) { showLoginError('Please enter your password.'); return; }
  }

  // Disable button and show loading state
  if (farmerBtn) { farmerBtn.disabled = true; farmerBtn.innerHTML = '<i class="fas fa-spinner loading"></i> Signing in...'; }
  if (adminBtn) { adminBtn.disabled = true; adminBtn.innerHTML = '<i class="fas fa-spinner loading"></i> Authenticating...'; }

  try {
    if (isAdmin) {
      const res = await fetch('/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: adminPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showLoginError(data.error || data.message || 'Admin login failed'); return; }
      sessionStorage.setItem('admin_token', data.token);
      window.location.href = '/admin';
      return;
    }

    const res = await fetch('/farmer/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ national_id: nationalId, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showLoginError(data.error || data.message || 'Login failed'); return; }

    farmer = data;
    sessionStorage.setItem('farmer', JSON.stringify(farmer));
    // reload so all scripts initialize with authenticated session
    window.location.reload();
  } catch (err) {
    showLoginError('Connection error. Please try again.');
  } finally {
    if (farmerBtn) { farmerBtn.disabled = false; farmerBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Access My Dashboard'; }
    if (adminBtn) { adminBtn.disabled = false; adminBtn.innerHTML = '<i class="fas fa-user-lock"></i> Admin Login'; }
  }
}

function initFarmerSession() {
  // mark the UI as authenticated so ui.js showPage will allow navigation
  try { window.isAuthenticated = true; } catch (e) {}
  const nav = document.getElementById('main-nav');
  if (nav) nav.style.display = 'flex';
  const nameEl = document.getElementById('nav-farmer-name'); if (nameEl) nameEl.textContent = farmer.name || '';
  const nameDisplay = document.getElementById('farmer-name-display'); if (nameDisplay) nameDisplay.textContent = farmer.name || '';
  const idDisplay = document.getElementById('farmer-id-display'); if (idDisplay) idDisplay.textContent = farmer.national_id || '';
  const phoneDisplay = document.getElementById('farmer-phone-display'); if (phoneDisplay) phoneDisplay.textContent = farmer.phone || '';
  showPage('dashboard');
  loadDashboard();
  loadPayments();
  loadMaintenanceRequests();
}

function logout() {
  farmer = null;
  try { window.isAuthenticated = false; } catch (e) {}
  sessionStorage.removeItem('farmer');
  const nav = document.getElementById('main-nav'); if (nav) nav.style.display = 'none';
  const el = document.getElementById('login-national-id'); if (el) el.value = '';
  const err = document.getElementById('login-error'); if (err) err.style.display = 'none';
  // avoid calling ui.js showPage when unauthenticated — directly show the verify page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const v = document.getElementById('verify'); if (v) v.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
  // restore session
  try {
    const saved = sessionStorage.getItem('farmer');
    if (saved) { farmer = JSON.parse(saved); initFarmerSession(); }
  } catch (e) {}
});

// Navigation helper (uses ui.js showPage if present)
// We use the global showPage defined in ui.js

// Minimal dashboard/payment/maintenance loaders (graceful if endpoints missing)
async function loadDashboard() {
  if (!farmer) return;
  try {
    const res = await fetch(`/farmer/dashboard/${farmer.id}`);
    if (!res.ok) throw new Error('No dashboard');
    const data = await res.json();
    // update global devices array (defined in devices.js) so updateStats() works
    if (typeof devices !== 'undefined') {
      // assign to the actual `devices` variable and mirror to window for compatibility
      devices = data || [];
      try { window.devices = devices; } catch (e) {}
    }
    renderDevices(data || []);
    populateDeviceSelect(data || []);
    // trigger stats update now that we have data
    if (typeof updateStats === 'function') updateStats();
  } catch (err) {
    const container = document.getElementById('devices-container');
    if (container) container.innerHTML = `<div class="card"><p style="color:var(--danger);">Failed to load system data.</p></div>`;
  }
}

function renderDevices(devices) {
  const container = document.getElementById('devices-container');
  if (!container) return;
  if (!devices || !devices.length) {
    container.innerHTML = `<div class="card" style="text-align:center;padding:3rem;"><i class="fas fa-microchip fa-3x" style="color:#ccc;margin-bottom:1rem;"></i><h3>No devices assigned</h3><p style="color:#888;">Contact your administrator to register your device.</p></div>`;
    return;
  }
  container.innerHTML = devices.map(d => {
    return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;"><h2><i class="fas fa-microchip"></i> ${d.device_id}</h2><div style="display:flex;gap:0.5rem;align-items:center;"><span class="status ${d.status === 'active' ? 'online' : 'offline'}"><i class="fas fa-${d.status === 'active' ? 'wifi' : 'times'}"></i> ${d.status || ''}</span></div></div><p style="color:#666;margin-bottom:1.5rem;"><i class="fas fa-map-marker-alt"></i> ${d.location || 'Location not set'}</p></div>`;
  }).join('');
}

function populateDeviceSelect(devices) {
  const sel = document.getElementById('maintenance-device'); if (!sel) return;
  sel.innerHTML = devices && devices.length ? devices.map(d => `<option value="${d.device_id}">${d.device_id} — ${d.location || 'No location'}</option>`).join('') : '<option value="">No devices available</option>';
}

async function initiatePayment(deviceId, amount, paymentType) {
  if (!farmer) { showNotification('Login required', 'error'); return; }
  showNotification(`Sending STK Push to ${farmer.phone}...`, 'info');
  try {
    const res = await fetch('/farmer/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ farmerId: farmer.id, deviceId, amount, payment_type: paymentType }) });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Payment failed');
    showNotification('Check your phone and enter your M-Pesa PIN to complete payment.', 'success');
    addLog(`<i class="fas fa-paper-plane"></i> STK Push sent — KES ${amount}`, 'payment');
    setTimeout(() => { loadDashboard(); loadPayments(); }, 3000);
  } catch (err) { showNotification(`Payment failed: ${err.message}`, 'error'); }
}

async function submitCustomPayment(deviceId) {
  const amount = parseInt(document.getElementById(`custom-amount-${deviceId}`).value);
  const type = document.getElementById(`custom-type-${deviceId}`).value;
  if (!amount || amount < 1) return showNotification('Please enter a valid amount.', 'error');
  await initiatePayment(deviceId, amount, type);
}

async function loadPayments() {
  if (!farmer) return;
  try {
    const res = await fetch(`/farmer/payments/${farmer.id}`);
    if (!res.ok) throw new Error('No payments');
    const data = await res.json();
    // update global payments array (defined in payments.js)
    if (typeof payments !== 'undefined') {
      // assign to the actual `payments` variable and mirror to window for compatibility
      payments = data || [];
      try { window.payments = payments; } catch (e) {}
    }
    renderPayments(data || []);
    if (typeof updateStats === 'function') updateStats();
  } catch (err) {
    const el = document.getElementById('payments-container'); if (el) el.innerHTML = `<p style="color:var(--danger);">Failed to load payments.</p>`;
  }
}

function renderPayments(payments) {
  const container = document.getElementById('payments-container'); if (!container) return;
  if (!payments.length) { 
    container.innerHTML = `<div style="text-align:center;padding:2rem;color:#888;"><i class="fas fa-receipt fa-3x" style="margin-bottom:1rem;"></i><p>No payment records found.</p></div>`; 
    return; 
  }
  
  container.innerHTML = payments.map(p => `
    <div class="log-entry payment" style="margin-bottom:1rem; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-weight:600; font-size:1rem; margin-bottom:0.25rem;">
          <i class="fas fa-microchip"></i> ${p.device_id}
        </div>
        <div style="font-size:1.1rem; color:var(--primary); font-weight:700;">
          KES ${p.amount}
        </div>
        <div class="text-muted" style="font-size:0.8rem; margin-top:0.25rem;">
          <i class="fas fa-calendar-alt"></i> ${new Date(p.created_at).toLocaleDateString()} — 
          <span class="status ${p.status === 'paid' ? 'online' : 'offline'}" style="font-size:0.7rem;">${p.status}</span>
        </div>
      </div>
      <div>
        ${p.status !== 'paid' ? `
          <button class="btn btn-warning" onclick="retryFarmerPayment(${p.id})" style="padding:0.6rem 1rem; font-size:0.85rem;">
            <i class="fas fa-hand-holding-usd"></i> Pay Now
          </button>
        ` : `
          <i class="fas fa-check-circle fa-2x" style="color:var(--success);"></i>
        `}
      </div>
    </div>
  `).join('');
}

async function retryFarmerPayment(paymentId) {
  if (!farmer) return showNotification('Login required', 'error');
  try {
    showNotification('Re-initiating payment prompt...', 'info');
    const res = await fetch('/farmer/retry-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmerId: farmer.id, paymentId })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Retry failed');
    showNotification('Check your phone for the M-Pesa prompt!', 'success');
    addLog(`<i class="fas fa-sync"></i> Payment prompt re-sent for record #${paymentId}`, 'payment');
  } catch (err) {
    showNotification(`Failed to retry payment: ${err.message}`, 'error');
  }
}

async function submitMaintenanceRequest() {
  if (!farmer) return showNotification('Login required', 'error');
  const deviceId = document.getElementById('maintenance-device').value;
  const issueType = document.getElementById('maintenance-issue').value;
  const description = document.getElementById('maintenance-description').value.trim();
  if (!deviceId) return showNotification('No device available to submit request for.', 'error');
  try {
    const res = await fetch('/farmer/maintenance-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ farmerId: farmer.id, deviceId, issue_type: issueType, description }) });
    const result = await res.json(); if (!res.ok) throw new Error(result.error || 'Request failed');
    showNotification('Maintenance request submitted! Our team will respond shortly.', 'success');
    document.getElementById('maintenance-description').value = '';
    addLog(`<i class="fas fa-tools"></i> Maintenance request submitted for ${deviceId}: ${issueType}`);
    loadMaintenanceRequests(); loadDashboard();
  } catch (err) { showNotification(`Failed to submit: ${err.message}`, 'error'); }
}

async function loadMaintenanceRequests() {
  if (!farmer) return;
  try {
    const res = await fetch(`/farmer/maintenance-requests/${farmer.id}`);
    if (!res.ok) throw new Error('No requests');
    const data = await res.json();
    renderMaintenanceRequests(data || []);
  } catch (err) {
    const el = document.getElementById('maintenance-requests-container'); if (el) el.innerHTML = `<p style="color:var(--danger);">Failed to load requests.</p>`;
  }
}

function renderMaintenanceRequests(requests) {
  const container = document.getElementById('maintenance-requests-container'); if (!container) return;
  if (!requests.length) { container.innerHTML = `<div style="text-align:center;padding:2rem;color:#888;"><i class="fas fa-clipboard-check fa-2x" style="margin-bottom:1rem;"></i><p>No maintenance requests yet.</p></div>`; return; }
  
  container.innerHTML = requests.map(r => {
    let statusLabel = 'Pending';
    let statusClass = 'offline';
    let actionButtons = '';

    if (r.resolved === 2) {
      statusLabel = 'Resolved';
      statusClass = 'online';
    } else if (r.resolved === 1) {
      statusLabel = 'Repaired (Pending Confirmation)';
      statusClass = 'warning';
      actionButtons = `
        <div style="margin-top:0.75rem; display:flex; gap:0.5rem;">
          <button class="btn btn-primary" onclick="confirmResolution(${r.id})" style="padding:0.4rem 0.8rem; font-size:0.8rem;">
            <i class="fas fa-check"></i> Accept Fix
          </button>
          <button class="btn btn-danger" onclick="rejectResolution(${r.id})" style="padding:0.4rem 0.8rem; font-size:0.8rem;">
            <i class="fas fa-times"></i> Not Fixed
          </button>
        </div>
      `;
    }

    return `
      <div class="log-entry ${r.resolved === 2 ? '' : 'alert'}" style="margin-bottom:0.75rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong><i class="fas fa-tools"></i> ${r.issue_type.replace(/_/g,' ')}</strong>
          <span class="status ${statusClass}" style="font-size:0.7rem;">${statusLabel}</span>
        </div>
        <small style="color:#888;"><i class="fas fa-microchip"></i> ${r.device_id} — ${r.location || ''}</small><br>
        <small style="color:#888;"><i class="fas fa-clock"></i> ${new Date(r.ts).toLocaleString()}</small>
        ${actionButtons}
      </div>
    `;
  }).join('');
}

async function confirmResolution(requestId) {
  if (!confirm('Confirm that this issue has been resolved to your satisfaction?')) return;
  try {
    const res = await fetch(`/farmer/maintenance-requests/${requestId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmerId: farmer.id })
    });
    if (!res.ok) throw new Error('Failed to confirm');
    showNotification('Thank you! Resolution confirmed.', 'success');
    loadMaintenanceRequests();
    loadDashboard();
  } catch (err) { showNotification(err.message, 'error'); }
}

async function rejectResolution(requestId) {
  const notes = prompt('Please describe why the issue is not fixed:');
  if (notes === null) return;
  try {
    const res = await fetch(`/farmer/maintenance-requests/${requestId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ farmerId: farmer.id, notes })
    });
    if (!res.ok) throw new Error('Failed to reject');
    showNotification('Reported back to administrator.', 'warning');
    loadMaintenanceRequests();
    loadDashboard();
  } catch (err) { showNotification(err.message, 'error'); }
}

// socket listeners — only attach if socketClient exists
if (socketClient) {
  socketClient.on('connect', () => addLog('<i class="fas fa-plug"></i> Connected to server', 'success'));
  socketClient.on('telemetry', (data) => { if (!farmer) return; addLog(`<i class="fas fa-thermometer-half"></i> ${data.device_id}: Flow ${data.flow_rate}L/min, Moisture ${data.soil_moisture}%`); loadDashboard(); });
  socketClient.on('payment', (data) => { if (!farmer) return; addLog(`<i class="fas fa-money-bill-wave"></i> Payment ${data.status}: ${data.trans_id}`, 'payment'); loadPayments(); });
  socketClient.on('alert', (data) => { if (!farmer) return; addLog(`<i class="fas fa-exclamation-triangle"></i> ${data.alert_type}: ${data.severity} (${data.device_id})`, 'alert'); showNotification(`${data.alert_type} alert from ${data.device_id}`, 'warning'); });
}

// allow pressing Enter to submit
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && document.getElementById('verify') && document.getElementById('verify').classList.contains('active')) farmerLogin(); });

function switchLoginTab(type) {
  const isFarmer = type === 'farmer';
  document.getElementById('tab-farmer').classList.toggle('active', isFarmer);
  document.getElementById('tab-admin').classList.toggle('active', !isFarmer);
  document.getElementById('farmer-login-form').style.display = isFarmer ? 'block' : 'none';
  document.getElementById('admin-login-form').style.display = isFarmer ? 'none' : 'block';
  document.getElementById('admin-checkbox').checked = !isFarmer;
  const errDiv = document.getElementById('login-error');
  if (errDiv) errDiv.style.display = 'none';
}
