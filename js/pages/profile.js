/**
 * profile.js — личный кабинет.
 *  - Хедер с аватаром и именем
 *  - 3 вкладки: мои идеи, избранное, понравились
 *  - Каждая карточка кликабельна → idea.html?id=…
 */

import * as auth from '../services/authService.js';
import * as ideas from '../services/ideaService.js';
import { ideaApi } from '../api/index.js';
import { loadStones } from '../core/database.js';
import { renderMini } from '../ui/miniBracelet.js';
import { preloadAlbedos } from '../core/stoneGenerator.js';
import { skeletonGrid } from '../ui/skeleton.js';

let catalogue = [];
let currentTab = 'my';

const els = {
    avatar:  document.getElementById('profileAvatar'),
    name:    document.getElementById('profileName'),
    meta:    document.getElementById('profileMeta'),
    grid:    document.getElementById('ideaGrid'),
    empty:   document.getElementById('emptyNote'),
    tabs:    document.querySelectorAll('.profile-tab'),
    cntMy:   document.getElementById('cntMy'),
    cntFav:  document.getElementById('cntFav'),
    cntLiked:document.getElementById('cntLiked'),
};

async function init() {
    const me = await auth.getCurrentUser();
    if (!me) return; // layout уже перенаправил

    els.avatar.textContent = me.avatar || '✦';
    els.name.textContent   = me.displayName;
    els.meta.innerHTML     = `@${escapeHtml(me.username)} · с ${new Date(me.createdAt).toLocaleDateString('ru-RU')}`;

    // Скелетоны пока загружаем
    els.grid.innerHTML = skeletonGrid(6);

    catalogue = (await loadStones()).stones;
    await preloadAlbedos(catalogue);

    // Счётчики
    const my = await ideas.listMy();
    els.cntMy.textContent = my.length;
    els.cntFav.textContent  = (me.favorites || []).length;
    els.cntLiked.textContent= (me.likes || []).length;

    els.tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    switchTab('my');
}

async function switchTab(tab) {
    currentTab = tab;
    els.tabs.forEach(t => t.classList.toggle('is-active', t.dataset.tab === tab));
    els.grid.innerHTML = skeletonGrid(3);
    els.empty.classList.add('is-hidden');

    let list = [];
    const me = await auth.getCurrentUser();
    if (tab === 'my') {
        list = await ideas.listMy();
    } else if (tab === 'favorites') {
        const all = await ideaApi.list({});
        list = all.filter(i => (me.favorites || []).includes(i.id));
    } else if (tab === 'liked') {
        const all = await ideaApi.list({});
        list = all.filter(i => (me.likes || []).includes(i.id));
    }

    if (!list.length) {
        els.grid.innerHTML = '';
        els.empty.textContent = tab === 'my'
            ? 'Пока нет своих идей. Соберите первую в конструкторе.'
            : tab === 'favorites' ? 'Пока нет избранных.' : 'Пока нет лайков.';
        els.empty.classList.remove('is-hidden');
        return;
    }

    renderIdeas(list);
}

function renderIdeas(list) {
    els.grid.innerHTML = list.map(i => `
        <a class="idea-card" href="idea.html?id=${encodeURIComponent(i.id)}" data-tilt data-tilt-max="4">
            <div class="idea-card__visual">
                <canvas data-mini-stones="${i.stones.map(s => s.id).join(',')}"
                        data-size="${i.stones[0]?.size || 8}"
                        data-length="${i.length || 180}"
                        width="320" height="320"></canvas>
                <div class="idea-card__overlay" aria-hidden="true">
                    <div class="idea-card__overlay-info">
                        <span>${i.stones.length} камней</span>
                        <span>·</span>
                        <span>${(i.length || 180)/10} см</span>
                    </div>
                </div>
            </div>
            <div class="idea-card__body">
                <h3 class="idea-card__title">${escapeHtml(i.title || 'Без названия')}</h3>
                ${i.isPublic
                  ? `<span class="idea-card__badge">опубликовано · ♥ ${i.likesCount || 0}</span>`
                  : `<span class="idea-card__badge idea-card__badge--draft">черновик</span>`}
            </div>
        </a>
    `).join('');

    els.grid.querySelectorAll('canvas[data-mini-stones]').forEach(c => {
        const ids = c.dataset.miniStones.split(',').filter(Boolean);
        renderMini(c, catalogue, {
            stoneIds: ids,
            size: +c.dataset.size || 8,
            length: +c.dataset.length || 180,
        });
    });
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
        { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
    ));
}

init();
