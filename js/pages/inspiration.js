/**
 * inspiration.js — лента «Сообщество».
 *  - Карточки идей со всех публикаций
 *  - Поиск, сортировка, фильтр по настроению
 *  - Кнопка-лайк прямо в карточке
 *  - Клик по карточке → idea.html?id=…
 */

import * as auth from '../services/authService.js';
import * as ideas from '../services/ideaService.js';
import * as users from '../services/userService.js';
import { loadStones } from '../core/database.js';
import { renderMini } from '../ui/miniBracelet.js';
import { preloadAlbedos } from '../core/stoneGenerator.js';
import { toast } from '../ui/toast.js';
import { skeletonGrid } from '../ui/skeleton.js';

const state = {
    catalogue: [],
    feed: [],
    authors: new Map(),
    me: null,
    sort: 'popular',
    mood: 'all',
    search: '',
};

const els = {
    grid:    document.getElementById('feedGrid'),
    empty:   document.getElementById('emptyNote'),
    search:  document.getElementById('feedSearch'),
    sortRow: document.querySelector('.feed-controls__sort'),
    moodRow: document.getElementById('moodFilters'),
};

async function init() {
    els.grid.innerHTML = skeletonGrid(6);

    state.catalogue = (await loadStones()).stones;
    await preloadAlbedos(state.catalogue);

    state.me = await auth.getCurrentUser();
    auth.onAuthChange(u => { state.me = u; render(); });

    // Все авторы в одну мапу
    const allUsers = await users.listAll();
    for (const u of allUsers) state.authors.set(u.id, u);

    bindFilters();
    await reload();
}

function bindFilters() {
    els.search.addEventListener('input', () => {
        state.search = els.search.value.trim();
        reload();
    });
    els.sortRow.addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        els.sortRow.querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        state.sort = chip.dataset.sort;
        reload();
    });
    els.moodRow.addEventListener('click', e => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        els.moodRow.querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        state.mood = chip.dataset.mood;
        reload();
    });
}

async function reload() {
    const filter = { sort: state.sort };
    if (state.mood !== 'all') filter.mood = state.mood;
    if (state.search) filter.search = state.search;
    state.feed = await ideas.listFeed(filter);
    render();
}

function render() {
    if (!state.feed.length) {
        els.grid.innerHTML = '';
        els.empty.classList.remove('is-hidden');
        return;
    }
    els.empty.classList.add('is-hidden');

    els.grid.innerHTML = state.feed.map(idea => {
        const author = state.authors.get(idea.authorId);
        const liked  = state.me && (state.me.likes || []).includes(idea.id);
        return `
            <article class="idea-card feed-card" data-id="${idea.id}">
                <a class="feed-card__visual-link" href="idea.html?id=${encodeURIComponent(idea.id)}">
                    <div class="idea-card__visual">
                        <canvas data-mini-stones="${idea.stones.map(s => s.id).join(',')}"
                                data-size="${idea.stones[0]?.size || 8}"
                                data-length="${idea.length || 180}"
                                width="320" height="320"></canvas>
                    </div>
                </a>
                <div class="idea-card__body">
                    <a href="idea.html?id=${encodeURIComponent(idea.id)}" style="text-decoration:none;color:inherit">
                        <h3 class="idea-card__title">${escapeHtml(idea.title)}</h3>
                    </a>
                    <p class="idea-card__sub">${idea.stones.length} камней · ${(idea.length||180)/10} см</p>
                    <div class="idea-card__author">
                        <span class="avatar">${escapeHtml(author?.avatar || '✦')}</span>
                        <span>${escapeHtml(author?.displayName || 'аноним')}</span>
                    </div>
                    <div class="feed-card__foot">
                        <button class="idea-card__like ${liked ? 'is-active' : ''}" data-like="${idea.id}" type="button" aria-label="лайк">
                            <svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                            <span>${idea.likesCount || 0}</span>
                        </button>
                        ${(idea.tags || []).slice(0, 2).map(t => `<span class="feed-card__tag">${escapeHtml(t)}</span>`).join('')}
                    </div>
                </div>
            </article>
        `;
    }).join('');

    // Мини-браслеты
    els.grid.querySelectorAll('canvas[data-mini-stones]').forEach(c => {
        const ids = c.dataset.miniStones.split(',').filter(Boolean);
        renderMini(c, state.catalogue, {
            stoneIds: ids,
            size: +c.dataset.size || 8,
            length: +c.dataset.length || 180,
        });
    });

    // Лайки
    els.grid.querySelectorAll('button[data-like]').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.preventDefault();
            e.stopPropagation();
            if (!state.me) {
                toast.info('Войдите, чтобы лайкнуть');
                return;
            }
            try {
                const r = await ideas.toggleLike(btn.dataset.like);
                btn.classList.toggle('is-active', r.liked);
                btn.querySelector('span').textContent = r.likesCount;
                const path = btn.querySelector('path');
                path.setAttribute('fill', r.liked ? 'currentColor' : 'none');
                // Обновим в state, чтобы при ре-рендере не сбрасывалось
                if (state.me) {
                    state.me.likes = state.me.likes || [];
                    if (r.liked && !state.me.likes.includes(btn.dataset.like)) state.me.likes.push(btn.dataset.like);
                    if (!r.liked) state.me.likes = state.me.likes.filter(x => x !== btn.dataset.like);
                }
            } catch (err) { toast.error(err.message); }
        });
    });
}

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
    ));
}

init();
