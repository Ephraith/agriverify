// socket.js — WebSocket connection and real-time event handling

const socket = io();
// expose socket globally so other scripts can use it when files are split
window.socket = socket;

socket.on('connect', () => {
    const el = document.getElementById('connection-status');
    if (el) el.innerHTML = '<span class="status online"><i class="fas fa-wifi"></i> Connected</span>';
    addLog('<i class="fas fa-plug"></i> Connected to server', 'success');
    showNotification('Connected to IoT network', 'success');
});

socket.on('disconnect', () => {
    const el = document.getElementById('connection-status');
    if (el) el.innerHTML = '<span class="status offline"><i class="fas fa-wifi"></i> Disconnected</span>';
    addLog('<i class="fas fa-unlink"></i> Disconnected from server', 'error');
    showNotification('Connection lost', 'error');
});

socket.on('telemetry', (data) => {
    updateSensorData(data);
    addLog(`<i class="fas fa-thermometer-half"></i> ${data.device_id}: Flow ${data.flow_rate}L/min, Moisture ${data.soil_moisture}%`);
});

socket.on('payment', (data) => {
    payments.push(data);
    updatePaymentHistory();
    updateStats();
    const isSuccess = data.status === 'SUCCESS';
    const isPending = data.status === 'PENDING';
    addLog(`<i class="fas fa-money-bill-wave"></i> Payment ${data.status}: ${data.trans_id} (${data.amount} KES)`, 'payment');
    if (isPending) showNotification(`STK Push sent — waiting for PIN entry`, 'info');
    else showNotification(`Payment ${data.status}: ${data.amount} KES`, isSuccess ? 'success' : 'error');
});

socket.on('alert', (data) => {
    alertCount++;
    updateStats();
    addLog(`<i class="fas fa-exclamation-triangle"></i> ${data.alert_type}: ${data.severity} (${data.device_id})`, 'alert');
    showNotification(`${data.alert_type} alert from ${data.device_id}`, 'warning');
});
