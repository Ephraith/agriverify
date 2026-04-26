// payments.js — M-Pesa STK Push and payment history

let payments = [];

async function processPayment() {
    const phone = document.getElementById('payment-phone').value.trim();
    const amount = document.getElementById('payment-amount').value.trim();
    const device = document.getElementById('payment-device').value.trim();

    if (!phone || !amount || !device) return showNotification('Please fill in all payment details', 'error');

    try {
        showNotification('Sending STK Push to phone...', 'info');
        const res = await fetch('/mpesa/stkpush', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, amount: parseInt(amount), device_id: device, account_ref: `Device-${device}` })
        });
        const result = await res.json();
        if (!res.ok || result.error) throw new Error(result.error || 'STK Push failed');
        addLog(`<i class="fas fa-paper-plane"></i> STK Push sent: ${result.CheckoutRequestID}`);
        showNotification('Check your phone and enter M-Pesa PIN', 'success');
    } catch (err) {
        addLog(`<i class="fas fa-exclamation-circle"></i> Payment failed: ${err.message}`, 'alert');
        showNotification(`Payment failed: ${err.message}`, 'error');
    }
}

function updatePaymentHistory() {
    const history = document.getElementById('payment-history');
    if (!history) return;
    if (payments.length === 0) {
        history.innerHTML = `
            <div class="log-entry payment">
                <i class="fas fa-info-circle" style="color:var(--info);"></i>
                <strong>No payments yet</strong> — process a payment to see history
            </div>`;
        return;
    }
    history.innerHTML = payments.slice(-10).reverse().map(p => `
        <div class="log-entry payment">
            <i class="fas fa-${p.status === 'SUCCESS' ? 'check-circle' : p.status === 'PENDING' ? 'clock' : 'times-circle'}"
               style="color:var(--${p.status === 'SUCCESS' ? 'success' : p.status === 'PENDING' ? 'info' : 'danger'});"></i>
            <strong>${p.trans_id}</strong> — ${p.amount} KES — <em>${p.status}</em>
            ${p.mpesa_code ? `<br><small>M-Pesa Code: ${p.mpesa_code}</small>` : ''}
            <br><small><i class="fas fa-clock"></i> ${new Date(p.ts).toLocaleString()}</small>
        </div>`).join('');
}
