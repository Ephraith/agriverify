// ui.js — navigation, notifications, activity log, shared utils

// Use a shared global `window.isAuthenticated` so other scripts can control auth state
window.isAuthenticated = window.isAuthenticated || false;

function signin() {
    const email = document.getElementById('signin-email') ? document.getElementById('signin-email').value : '';
    const password = document.getElementById('signin-password') ? document.getElementById('signin-password').value : '';
    if (!email || !password) return showNotification('Please fill in all fields', 'error');
    window.isAuthenticated = true;
    const nav = document.getElementById('main-nav'); if (nav) nav.style.display = 'flex';
    showPage('dashboard');
    showNotification('Welcome to Agri-Verify!', 'success');
}

function signup() {
    const name = document.getElementById('signup-name') ? document.getElementById('signup-name').value : '';
    const email = document.getElementById('signup-email') ? document.getElementById('signup-email').value : '';
    const phone = document.getElementById('signup-phone') ? document.getElementById('signup-phone').value : '';
    const password = document.getElementById('signup-password') ? document.getElementById('signup-password').value : '';
    if (!name || !email || !phone || !password) return showNotification('Please fill in all fields', 'error');
    showNotification('Account created! Please sign in.', 'success');
    showPage('signin');
}

function logout() {
    window.isAuthenticated = false;
    const nav = document.getElementById('main-nav'); if (nav) nav.style.display = 'none';
    // show verify/login page
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const v = document.getElementById('verify'); if (v) v.classList.add('active');
    showNotification('Logged out successfully', 'info');
}

function showPage(pageId) {
    // allow the public verify/signin/signup pages even when not authenticated
    if (!window.isAuthenticated && pageId !== 'signin' && pageId !== 'signup' && pageId !== 'verify') {
        // show the verify page (farmer login) as default public entry
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const v = document.getElementById('verify'); if (v) v.classList.add('active');
        return;
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    const navLink = document.querySelector(`.nav-link[data-page="${pageId}"]`);
    if (navLink) navLink.classList.add('active');

    if (pageId === 'devices') updateDevicesList();
    else if (pageId === 'payments') updatePaymentHistory();
    else if (pageId === 'dashboard') updateStats();
}

function showNotification(message, type = 'info') {
    const icons = { 
        success: 'check-circle', 
        error: 'times-circle', 
        warning: 'exclamation-triangle', 
        info: 'info-circle' 
    };

    // Clear existing to avoid stacking in a messy way
    const existing = document.querySelectorAll('.notification');
    existing.forEach(e => {
        e.classList.remove('show');
        setTimeout(() => e.remove(), 300);
    });

    const n = document.createElement('div');
    n.className = `notification ${type}`;
    n.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i> <div>${message}</div>`;
    document.body.appendChild(n);
    
    setTimeout(() => n.classList.add('show'), 10);
    
    setTimeout(() => {
        if (n && n.parentNode) {
            n.classList.remove('show');
            setTimeout(() => n.remove(), 300);
        }
    }, 3500);
}

function addLog(message, type = '') {
    const log = document.getElementById('activity-log');
    if (!log) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `<small><i class="fas fa-clock"></i> ${new Date().toLocaleTimeString()}</small> ${message}`;
    log.insertBefore(entry, log.firstChild);
    if (log.children.length > 50) log.removeChild(log.lastChild);
}

function animateValue(elementId, newValue) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const current = parseInt(el.textContent) || 0;
    const inc = (newValue - current) / 20;
    let val = current;
    const timer = setInterval(() => {
        val += inc;
        if ((inc > 0 && val >= newValue) || (inc < 0 && val <= newValue) || inc === 0) {
            val = newValue;
            clearInterval(timer);
        }
        el.textContent = Math.round(val);
    }, 50);
}
