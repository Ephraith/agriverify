// verification.js — farmer verification and alert sending

let alertCount = 0;

async function verifyFarmer() {
    const nationalId = document.getElementById('national-id').value.trim();
    if (!nationalId) return showNotification('Please enter a National ID', 'error');

    try {
        showNotification('Verifying farmer...', 'info');
        const res = await fetch('/mock/gava/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ national_id: nationalId })
        });
        const result = await res.json();
        const resultDiv = document.getElementById('verification-result');
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
            <div class="log-entry ${result.verified ? '' : 'alert'}">
                <i class="fas fa-${result.verified ? 'check-circle' : 'times-circle'}"
                   style="color:var(--${result.verified ? 'success' : 'danger'});"></i>
                <strong>Verification ${result.verified ? 'Successful' : 'Failed'}</strong>
                ${result.verified ? `<br><i class="fas fa-user"></i> User ID: ${result.user_id}` : ''}
            </div>`;
        showNotification(`Verification ${result.verified ? 'successful' : 'failed'}`, result.verified ? 'success' : 'error');
    } catch (err) {
        showNotification(`Verification error: ${err.message}`, 'error');
    }
}

async function sendAlert() {
    const device = document.getElementById('alert-device').value.trim();
    const type = document.getElementById('alert-type').value;
    const severity = document.getElementById('alert-severity').value;
    if (!device) return showNotification('Please enter a device ID', 'error');

    try {
        showNotification('Sending alert...', 'info');
        const res = await fetch('/api/alerts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device_id: device, alert_type: type, severity })
        });
        await res.json();
        addLog(`<i class="fas fa-bell"></i> Alert sent: ${type} (${severity})`);
        showNotification(`Alert sent to ${device}`, 'success');
    } catch (err) {
        showNotification(`Alert failed: ${err.message}`, 'error');
    }
}
