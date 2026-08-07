function showToast(msg) {
    // Limpiar toasts anteriores si los hay
    document.querySelectorAll('.toast-confirm').forEach(el => el.remove());

    const t = document.createElement('div');
    t.className = "toast-confirm";
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translate(-50%, -20px)';
        t.style.transition = 'all 0.3s ease-in';
        setTimeout(() => t.remove(), 300);
    }, 2500);
}

function showConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-confirm');
        const textEl = document.getElementById('confirm-text');
        const cancelBtn = document.getElementById('confirm-cancel');
        const okBtn = document.getElementById('confirm-ok');

        textEl.innerText = message;
        modal.classList.remove('hidden');

        const cleanup = (value) => {
            modal.classList.add('hidden');
            cancelBtn.removeEventListener('click', onCancel);
            okBtn.removeEventListener('click', onOk);
            resolve(value);
        };

        const onCancel = () => cleanup(false);
        const onOk = () => cleanup(true);

        cancelBtn.addEventListener('click', onCancel);
        okBtn.addEventListener('click', onOk);
    });
}

/** Escape text for safe use inside HTML. */
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** 8-char uppercase join code using crypto (new groups only). */
function generateGroupCode(length = 8) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < length; i++) {
        out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
}

Object.assign(window, {
    showToast,
    showConfirm,
    escapeHtml,
    generateGroupCode
});
