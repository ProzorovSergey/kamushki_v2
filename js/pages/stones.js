/**
 * stones.js
 * ----------------------------------------------------------------
 * Каталог камней. 4 фильтра: цвет, стихия, энергия, редкость.
 * Редкие камни визуально подсвечиваются особой рамкой.
 */

import { loadStones } from '../core/database.js';
import { generateStoneTexture, preloadAlbedos, onAlbedoReady } from '../core/stoneGenerator.js';

const state = {
    catalogue: [],
    element: 'all',
    color:   'all',
    energy:  'all',
    rarity:  'all',
    search:  '',
};

const els = {
    grid:    document.getElementById('stoneGrid'),
    count:   document.getElementById('stoneCount'),
    search:  document.getElementById('stoneSearch'),
    fEl:     document.getElementById('elementFilters'),
    fCol:    document.getElementById('colorFilters'),
    fEn:     document.getElementById('energyFilters'),
    fRar:    document.getElementById('rarityFilters'),
    empty:   document.getElementById('emptyNote'),
};

async function init() {
    try {
        const data = await loadStones();
        state.catalogue = data.stones;
        els.count.textContent = state.catalogue.length;
    } catch (err) {
        console.error('stones load failed:', err);
        return;
    }

    // Фоновая (не блокирующая) загрузка PNG — рендерим procedural сразу,
    // PNG подменяются по мере прихода
    preloadAlbedos(state.catalogue);

    bindFilter(els.fEl,  'element');
    bindFilter(els.fCol, 'color');
    bindFilter(els.fEn,  'energy');
    bindFilter(els.fRar, 'rarity');

    els.search.addEventListener('input', () => {
        state.search = els.search.value.trim().toLowerCase();
        render();
    });

    render();
}

function bindFilter(container, key) {
    if (!container) return;
    container.addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        container.querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        state[key] = chip.dataset[key] || 'all';
        render();
    });
}

function matches(s) {
    if (state.element !== 'all' && s.element !== state.element) return false;
    if (state.color   !== 'all' && s.color_category !== state.color) return false;
    if (state.energy  !== 'all' && !(s.energy || []).includes(state.energy)) return false;
    if (state.rarity  !== 'all' && (s.rarity || 'common') !== state.rarity) return false;
    if (state.search) {
        const hay = (s.name + ' ' + s.element + ' ' + s.color_category + ' '
                   + (s.energy || []).join(' ')).toLowerCase();
        if (!hay.includes(state.search)) return false;
    }
    return true;
}

function render() {
    const list = state.catalogue.filter(matches);

    if (!list.length) {
        els.grid.innerHTML = '';
        els.empty.classList.remove('is-hidden');
        return;
    }
    els.empty.classList.add('is-hidden');

    els.grid.innerHTML = list.map(s => `
        <article class="stone-card${s.rarity === 'rare' ? ' is-rare' : ''}" data-tilt data-tilt-max="3">
            ${s.rarity === 'rare' ? '<span class="rare-badge">rare</span>' : ''}
            <div class="stone-card__visual">
                <canvas data-stone="${s.id}" width="240" height="240"></canvas>
            </div>
            <h3 class="stone-card__name">${s.name}</h3>
            <div class="stone-card__meta">
                <span class="element-tag" data-el="${s.element}">${s.element}</span>
            </div>
            <div class="stone-card__overlay" aria-hidden="true">
                <div class="stone-card__overlay-row">
                    <span class="stone-card__color">${s.color_category}</span>
                    <span>·</span>
                    <span>${(s.sizes || []).join(' · ')} мм</span>
                </div>
                <div class="stone-card__overlay-energy">
                    ${(s.energy || []).map(e => `<span>${e}</span>`).join('')}
                </div>
            </div>
        </article>
    `).join('');

    // Рисуем камни. drawOnce — функция перерисовки конкретного canvas.
    els.grid.querySelectorAll('canvas[data-stone]').forEach(c => {
        const id = c.dataset.stone;
        const stone = list.find(x => x.id === id);
        if (!stone) return;
        const drawOnce = () => {
            const dpr = window.devicePixelRatio || 1;
            const w = c.clientWidth || 120;
            c.width = w * dpr; c.height = w * dpr;
            const ctx = c.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, w);
            const tex = generateStoneTexture(stone, w * 0.92, 0);
            ctx.drawImage(tex, w * 0.04, w * 0.04, w * 0.92, w * 0.92);
        };
        drawOnce();
        // Когда PNG прилетит — перерисовать с фото-альбедо
        onAlbedoReady(id, drawOnce);
    });
}

init();
