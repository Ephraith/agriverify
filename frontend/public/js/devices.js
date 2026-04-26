// devices.js — device registration, listing, sensor data display

let devices = [];

function updateSensorData(data) {
    animateValue('flow-rate', data.flow_rate || 0);
    animateValue('soil-moisture', data.soil_moisture || 0);
    const valveEl = document.getElementById('valve-state');
    if (valveEl) valveEl.textContent = data.valve_state || 'UNKNOWN';
    const flowProg = document.getElementById('flow-progress');
    if (flowProg) flowProg.style.width = `${Math.min((data.flow_rate || 0) * 10, 100)}%`;
    const moistProg = document.getElementById('moisture-progress');
    if (moistProg) moistProg.style.width = `${data.soil_moisture || 0}%`;

    const idx = devices.findIndex(d => d.id === data.device_id);
    if (idx !== -1) {
        devices[idx].status = 'online';
        devices[idx].lastSeen = new Date();
        updateDevicesList();
    }
}

function showAddDevice() {
    const el = document.getElementById('add-device');
    el.style.display = 'block';
    setTimeout(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; }, 50);
}

function hideAddDevice() {
    const el = document.getElementById('add-device');
    el.style.opacity = '0';
    el.style.transform = 'translateY(-20px)';
    setTimeout(() => { el.style.display = 'none'; }, 300);
}

function addDevice() {
    const id = document.getElementById('device-id').value.trim();
    const location = document.getElementById('device-location').value.trim();
    if (!id || !location) return showNotification('Please fill in all device details', 'error');
    devices.push({ id, location, status: 'offline', lastSeen: new Date(), type: 'ESP32' });
    updateDevicesList();
    hideAddDevice();
    document.getElementById('device-id').value = '';
    document.getElementById('device-location').value = '';
    showNotification(`Device ${id} added`, 'success');
    addLog(`<i class="fas fa-plus-circle"></i> Device ${id} registered at ${location}`);
}

function removeDevice(deviceId) {
    if (!confirm(`Remove device ${deviceId}?`)) return;
    devices = devices.filter(d => d.id !== deviceId);
    updateDevicesList();
    showNotification(`Device ${deviceId} removed`, 'info');
    addLog(`<i class="fas fa-trash"></i> Device ${deviceId} removed`);
}

function updateDevicesList() {
    const list = document.getElementById('devices-list');
    if (!list) return;
    if (devices.length === 0) {
        list.innerHTML = `
            <div class="device-card" style="border:2px dashed rgba(0,0,0,0.2);text-align:center;padding:3rem;">
                <i class="fas fa-plus-circle fa-3x" style="color:var(--primary);margin-bottom:1rem;"></i>
                <h3>No devices registered</h3>
                <p>Add your first IoT device to get started</p>
            </div>`;
        return;
    }
    list.innerHTML = devices.map(d => `
        <div class="device-card">
            <div class="device-header">
                <h3><i class="fas fa-microchip"></i> ${d.id}</h3>
                <span class="status ${d.status}">
                    <i class="fas fa-${d.status === 'online' ? 'wifi' : 'times'}"></i> ${d.status}
                </span>
            </div>
            <p><i class="fas fa-map-marker-alt"></i> ${d.location}</p>
            <p><i class="fas fa-microchip"></i> ${d.type || 'ESP32'}</p>
            <small><i class="fas fa-clock"></i> Last seen: ${d.lastSeen.toLocaleString()}</small>
            <div style="margin-top:1rem;">
                <button class="btn btn-danger" onclick="removeDevice('${d.id}')" style="padding:0.5rem 1rem;font-size:0.8rem;">
                    <i class="fas fa-trash"></i> Remove
                </button>
            </div>
        </div>`).join('');
}

function updateStats() {
    animateValue('active-devices', devices.filter(d => d.status === 'online').length);
    animateValue('total-transactions', payments.length);
    animateValue('active-alerts', alertCount);
}
