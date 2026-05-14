/**
 * home.js
 * ----------------------------------------------------------------
 * Заполнение главной страницы:
 *  - hero-canvas + about-canvas через autoMountMinis
 *  - три карточки "Что уже собрано" (рисуем мини-браслеты)
 *  - четыре камня "тихие голоса"
 */

import { loadStones, findStone } from '../core/database.js';
import { autoMountMinis, renderMini } from '../ui/miniBracelet.js';
import { generateStoneTexture, preloadAlbedos } from '../core/stoneGenerator.js';

const FEATURED = [
    {
        title: 'Лунный Вуаль',
        sub: 'для тонкой настройки',
        stones: ['moonstone','labradorite','rock-crystal','moonstone','labradorite','white-jade',
                 'moonstone','labradorite','rock-crystal','moonstone','labradorite','white-jade'],
        tags: [
            { el: 'вода',  label: 'вода' },
            { el: 'воздух', label: 'воздух' },
        ],
    },
    {
        title: 'Зелёный Обет',
        sub: 'для роста и удачи',
        stones: ['green-jade','aventurine','malachite','green-jade','aventurine','malachite',
                 'green-jade','aventurine','malachite','green-jade','aventurine','malachite'],
        tags: [
            { el: 'земля', label: 'земля' },
            { el: 'воздух', label: 'нефрит · авантюрин · малахит' },
        ],
    },
    {
        title: 'Царская Печать',
        sub: 'для веса слова',
        stones: ['almandine-garnet','lapis','pyrite','almandine-garnet','lapis','pyrite',
                 'almandine-garnet','lapis','pyrite','almandine-garnet','lapis','pyrite'],
        tags: [
            { el: 'огонь', label: 'огонь' },
            { el: 'земля', label: 'гранат · лазурит · пирит' },
        ],
    },
];

const QUARTET_IDS = ['amethyst', 'labradorite', 'lapis', 'rose-quartz'];

async function init() {
    let data;
    try {
        data = await loadStones();
    } catch (err) {
        console.error('Не удалось загрузить базу камней:', err);
        return;
    }
    const catalogue = data.stones;

    // Сначала пробуем подгрузить PNG-альбедо для всех камней.
    // Если ассетов нет — promise зарезолвится моментально, рендерим процедурно.
    await preloadAlbedos(catalogue);

    // Hero и about canvas — через автомаунт по data-атрибутам
    autoMountMinis(catalogue);

    // Карточки "Что уже собрано"
    const grid = document.getElementById('featuredGrid');
    if (grid) {
        grid.innerHTML = FEATURED.map((item, idx) => `
            <article class="featured-card">
                <div class="featured-card__visual">
                    <canvas
                        data-mini-bracelet
                        data-stones="${item.stones.join(',')}"
                        data-size="8"
                        data-length="180"
                        width="360" height="360"></canvas>
                </div>
                <div class="featured-card__body">
                    <h3 class="featured-card__title">${item.title}</h3>
                    <div class="featured-card__sub">${item.sub}</div>
                    <div class="featured-card__tags">
                        ${item.tags.map(t => `<span class="element-tag" data-el="${t.el}">${t.label}</span>`).join('')}
                    </div>
                </div>
            </article>
        `).join('');
        autoMountMinis(catalogue);
    }

    // Четыре тихих голоса
    const quartet = document.getElementById('stoneQuartet');
    if (quartet) {
        quartet.innerHTML = QUARTET_IDS.map(id => {
            const s = findStone(catalogue, id);
            if (!s) return '';
            return `
                <article class="stone-quartet__item">
                    <div class="stone-quartet__visual">
                        <canvas data-stone-id="${s.id}" width="320" height="320"></canvas>
                    </div>
                    <h3 class="stone-quartet__name">${s.name}</h3>
                    <p class="stone-quartet__desc">${(s.energy || []).join(' · ')}</p>
                </article>
            `;
        }).join('');

        // Рисуем по одному большому камню в каждом canvas
        quartet.querySelectorAll('canvas[data-stone-id]').forEach(c => {
            const id = c.dataset.stoneId;
            const stone = findStone(catalogue, id);
            if (!stone) return;
            const dpr = window.devicePixelRatio || 1;
            const w = c.clientWidth || 200;
            c.width = w * dpr; c.height = w * dpr;
            const ctx = c.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, w, w);
            const tex = generateStoneTexture(stone, w * 0.7, 0);
            ctx.drawImage(tex, w * 0.15, w * 0.15, w * 0.7, w * 0.7);
        });
    }
}

init();
