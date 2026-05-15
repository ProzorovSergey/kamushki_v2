/**
 * exporter.js
 * ----------------------------------------------------------------
 * Экспорт готового браслета:
 *   - PNG с canvas;
 *   - JSON-сборка.
 */

/** Сгенерировать имя файла с датой. */
function timestamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        + `_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * Скачать содержимое (Blob или строку) как файл.
 */
function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Освобождаем ресурс чуть позже, чтобы Safari успел
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Скачать canvas как PNG.
 * @param {HTMLCanvasElement} canvas
 * @param {String} [prefix]
 */
export function exportPNG(canvas, prefix = 'bracelet') {
    canvas.toBlob(blob => {
        if (!blob) return;
        download(`${prefix}_${timestamp()}.png`, blob);
    }, 'image/png');
}

/**
 * Скачать объект как JSON.
 * @param {Object} data
 * @param {String} [prefix]
 */
export function exportJSON(data, prefix = 'bracelet') {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    download(`${prefix}_${timestamp()}.json`, blob);
}

/**
 * Адрес почты мастера. Меняй здесь, если переименуешь почту бренда.
 */
export const MASTER_EMAIL = 'jewerlyofsoul25@gmail.com';

/**
 * Сформировать ссылку mailto: с готовым письмом-заявкой.
 *
 * @param {Object} data     результат serializeBracelet
 * @param {String} [note]   необязательный комментарий заказчика
 * @returns {String}        строка вида "mailto:...?subject=...&body=..."
 */
export function buildMailto(data, note = '') {
    const subject = `Заказ браслета — ${data.stones_count} ${pluralStones(data.stones_count)}, ${data.length_cm} см`;

    const lines = [];
    lines.push('Здравствуйте!');
    lines.push('Хочу заказать браслет по этой композиции:');
    lines.push('');
    lines.push(`Длина: ${data.length_cm} см (${data.length_mm} мм)`);
    lines.push(`Камней в браслете: ${data.stones_count}`);
    lines.push('');
    lines.push('Состав по порядку:');
    data.stones.forEach(s => {
        lines.push(`  ${s.position}. ${s.name} · ${s.size_mm} мм`);
    });
    lines.push('');
    if (note) {
        lines.push('Комментарий:');
        lines.push(note);
        lines.push('');
    }
    lines.push('PS: к этому письму прикладываю PNG-превью браслета.');
    lines.push('');
    lines.push('Спасибо!');

    const body = lines.join('\n');

    return `mailto:${MASTER_EMAIL}`
        + `?subject=${encodeURIComponent(subject)}`
        + `&body=${encodeURIComponent(body)}`;
}

function pluralStones(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'камень';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'камня';
    return 'камней';
}
