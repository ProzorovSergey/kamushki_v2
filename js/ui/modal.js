/**
 * modal.js
 * ----------------------------------------------------------------
 * Простая модалка. Поддерживает HTML-контент и кнопки.
 *
 *   const m = openModal({
 *       title: 'Сохранить идею',
 *       body: '<form>...</form>',
 *       buttons: [
 *           { label: 'Отмена', kind: 'ghost', onClick: ({ close }) => close() },
 *           { label: 'Сохранить', kind: 'primary', onClick: async ({ root, close }) => { ... } },
 *       ],
 *       onClose() {...},
 *   });
 */

export function openModal({ title = '', body = '', buttons = [], onClose, dismissible = true } = {}) {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const box = document.createElement('div');
    box.className = 'modal';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    if (title) box.setAttribute('aria-label', title);

    let bodyHTML = '';
    if (title) bodyHTML += `<div class="modal__head">
        <h2 class="modal__title">${escapeHtml(title)}</h2>
        ${dismissible ? '<button class="modal__close" aria-label="закрыть">×</button>' : ''}
    </div>`;
    bodyHTML += `<div class="modal__body">${body}</div>`;
    if (buttons.length) {
        bodyHTML += '<div class="modal__actions">';
        buttons.forEach((b, i) => {
            const kind = b.kind || 'ghost';
            bodyHTML += `<button class="btn btn--${kind}" data-btn="${i}">${escapeHtml(b.label)}</button>`;
        });
        bodyHTML += '</div>';
    }
    box.innerHTML = bodyHTML;
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);

    requestAnimationFrame(() => backdrop.classList.add('is-in'));

    function close(result) {
        backdrop.classList.remove('is-in');
        backdrop.classList.add('is-out');
        setTimeout(() => {
            backdrop.remove();
            if (typeof onClose === 'function') onClose(result);
        }, 200);
        document.removeEventListener('keydown', onKey);
    }

    function onKey(e) {
        if (dismissible && e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);

    if (dismissible) {
        backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
        const cb = box.querySelector('.modal__close');
        if (cb) cb.addEventListener('click', () => close());
    }

    buttons.forEach((b, i) => {
        const node = box.querySelector(`button[data-btn="${i}"]`);
        if (!node) return;
        node.addEventListener('click', () => {
            if (typeof b.onClick === 'function') {
                Promise.resolve(b.onClick({ root: box, close })).catch(err => {
                    console.error(err);
                });
            } else {
                close();
            }
        });
    });

    return { root: box, close };
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
        { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
    ));
}
