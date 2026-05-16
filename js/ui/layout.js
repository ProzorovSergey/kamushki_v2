/**
 * layout.js
 * ----------------------------------------------------------------
 * Общая шапка и подвал. Подписывается на authService и
 * перерисовывает блок пользователя при логине/выходе.
 */

import * as auth from '../services/authService.js';
import { ensureSeed } from '../services/seedService.js';
import './tilt.js';        // авто-подключение микровзаимодействий для всех [data-tilt]
import './registerSW.js';  // регистрация Service Worker для offline-режима

const NAV = [
    { id: 'home',         href: 'index.html',         label: 'Главная' },
    { id: 'constructor',  href: 'constructor.html',   label: 'Конструктор' },
    { id: 'stones',       href: 'stones.html',        label: 'Камни' },
    { id: 'inspiration',  href: 'inspiration.html',   label: 'Сообщество' },
    { id: 'contact',      href: 'contact.html',       label: 'Связаться' },
];

// Иконки для bottom-nav (только главные 4 раздела для thumb-зоны)
const BOTTOM_NAV = [
    { id: 'home',         href: 'index.html',
      icon: '<path d="M3 12 12 3l9 9"/><path d="M5 10v10h14V10"/>',
      label: 'Главная' },
    { id: 'constructor',  href: 'constructor.html',
      icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="3.5" r="1.5"/><circle cx="12" cy="20.5" r="1.5"/><circle cx="3.5" cy="12" r="1.5"/><circle cx="20.5" cy="12" r="1.5"/>',
      label: 'Сборка' },
    { id: 'stones',       href: 'stones.html',
      icon: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18M3 12h18"/>',
      label: 'Камни' },
    { id: 'inspiration',  href: 'inspiration.html',
      icon: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
      label: 'Лента' },
];

const PROTECTED_PAGES = new Set(['profile', 'create-idea']);

/** Заполнить шапку и подвал. */
export async function mountLayout() {
    // Засев seed-данных — один раз для всего сайта
    await ensureSeed();

    const active = document.body.dataset.page || 'home';

    renderHeader(active);
    renderBottomNav(active);
    renderFooter(active);

    // Защита страниц
    if (PROTECTED_PAGES.has(active)) {
        const me = await auth.getCurrentUser();
        if (!me) {
            // редирект на логин с return
            const ret = encodeURIComponent(location.pathname.split('/').pop());
            location.replace(`login.html?return=${ret}`);
            return;
        }
    }

    auth.onAuthChange(() => renderHeader(active));
}

function renderHeader(active) {
    const header = document.getElementById('siteHeader');
    if (!header) return;
    header.classList.add('site-header');
    header.innerHTML = `
        <div class="site-header__inner">
            <a href="index.html" class="site-header__brand" aria-label="Jewerly of Soul — главная">Jewerly of Soul</a>

            <button class="site-nav__toggle" id="navToggle" aria-label="Меню" aria-expanded="false">
                <svg class="icon" viewBox="0 0 24 24" width="22" height="22">
                    <path d="M4 7h16M4 12h16M4 17h16"/>
                </svg>
            </button>

            <nav class="site-nav" id="siteNav" aria-label="Основная навигация">
                ${NAV.filter(n => n.id !== 'home').map(n => `
                    <a href="${n.href}" class="site-nav__link${n.id === active ? ' is-active' : ''}">${n.label}</a>
                `).join('')}
                <span class="site-nav__user" id="siteNavUser">…</span>
            </nav>
        </div>
    `;

    const toggle = header.querySelector('#navToggle');
    const nav    = header.querySelector('#siteNav');
    function setNavOpen(open) {
        nav.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        document.body.style.overflow = open ? 'hidden' : '';
    }
    toggle.addEventListener('click', () => setNavOpen(!nav.classList.contains('is-open')));
    // Закрывать drawer по клику на ссылку
    nav.querySelectorAll('.site-nav__link').forEach(a =>
        a.addEventListener('click', () => setNavOpen(false))
    );
    // Закрывать drawer по Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && nav.classList.contains('is-open')) setNavOpen(false);
    });

    renderUserSlot(active);
}

async function renderUserSlot(active) {
    const slot = document.getElementById('siteNavUser');
    if (!slot) return;
    let me = null;
    try { me = await auth.getCurrentUser(); } catch (_) { me = null; }

    if (!me) {
        slot.innerHTML = `
            <a href="login.html" class="site-nav__link${active === 'login' ? ' is-active' : ''}">Войти</a>
        `;
        return;
    }

    slot.innerHTML = `
        <div class="user-menu">
            <button class="user-menu__btn" type="button" aria-haspopup="true" aria-expanded="false">
                <span class="avatar">${escapeHtml(me.avatar || '✦')}</span>
                <span class="user-menu__name">${escapeHtml(me.displayName)}</span>
            </button>
            <div class="user-menu__dropdown" hidden>
                <a class="user-menu__item" href="profile.html">
                    <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg>
                    Профиль
                </a>
                <a class="user-menu__item" href="create-idea.html">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
                    Новая идея
                </a>
                <button class="user-menu__item user-menu__item--danger" id="logoutBtn" type="button">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
                    Выйти
                </button>
            </div>
        </div>
    `;

    const btn = slot.querySelector('.user-menu__btn');
    const dd  = slot.querySelector('.user-menu__dropdown');
    btn.addEventListener('click', e => {
        e.stopPropagation();
        const open = dd.hidden;
        dd.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', () => { dd.hidden = true; btn.setAttribute('aria-expanded', 'false'); });

    slot.querySelector('#logoutBtn').addEventListener('click', async () => {
        await auth.logout();
        location.href = 'index.html';
    });
}

function renderBottomNav(active) {
    // Создаём, если ещё нет
    let nav = document.getElementById('bottomNav');
    if (!nav) {
        nav = document.createElement('nav');
        nav.id = 'bottomNav';
        nav.className = 'bottom-nav';
        nav.setAttribute('aria-label', 'Нижняя навигация');
        document.body.appendChild(nav);
    }
    nav.innerHTML = BOTTOM_NAV.map(n => `
        <a href="${n.href}" class="bottom-nav__link${n.id === active ? ' is-active' : ''}" aria-label="${n.label}">
            <svg class="bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">${n.icon}</svg>
            <span>${n.label}</span>
        </a>
    `).join('');
}

function renderFooter(active) {
    const footer = document.getElementById('siteFooter');
    if (!footer) return;
    footer.classList.add('site-footer');
    footer.innerHTML = `
        <div class="site-footer__inner">
            <div>
                <div class="site-footer__brand">Jewerly of Soul</div>
                <div class="site-footer__tagline">
                    Личная мастерская браслетов из натуральных камней.<br>
                    Композиции по запросу.
                </div>
            </div>
            <nav class="site-footer__nav" aria-label="Подвал">
                ${NAV.filter(n => n.id !== 'home').map(n => `
                    <a href="${n.href}" class="site-nav__link${n.id === active ? ' is-active' : ''}">${n.label}</a>
                `).join('')}
            </nav>
        </div>
        <div class="site-footer__bottom">
            <span>© ${new Date().getFullYear()} · сделано неспешно</span>
            <span>Ижевск, Россия</span>
        </div>
    `;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
        { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
    ));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountLayout);
} else {
    mountLayout();
}
