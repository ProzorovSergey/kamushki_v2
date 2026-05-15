/**
 * webglStoneRenderer.js
 * ----------------------------------------------------------------
 * WebGL PBR-рендер камней (premium-jewelry stylization).
 *
 * Каждый камень рисуется как "impostor sphere" — на full-screen quad
 * фрагментный шейдер считает нормаль сферы, на ней рассчитывает
 * двухсторонний лайтинг (key + fill), GGX-спекуляр, Fresnel rim,
 * подповерхностное свечение для прозрачных и направленную ирисацию
 * для лабрадорита/лунного камня/перламутра. Альбедо модулируется
 * по типу текстуры (15 алгоритмов через FBM-шум и хэши).
 *
 * API совместим с прежним canvas2d-генератором — функция
 *   generateStoneTexture(stone, pixelSize, variant) → HTMLCanvasElement
 * возвращает обычный 2D canvas, готовый к drawImage().
 *
 * При отсутствии WebGL — мягкий фолбэк через тот же шейдер,
 * пересчитанный в imageData (медленный, но работающий).
 */

// =================================================================
// КОНСТАНТЫ
// =================================================================

const TEXTURE_TYPE = {
    crystalline: 0, inclusions: 1, smooth: 2, glossy: 3, banded: 4,
    sparkle:     5, swirl:      6, milky:  7, iridescent: 8, metallic: 9,
    concentric: 10, veined:    11, needle: 12, striated:  13, moss:    14,
};

const FINISH = { polished: 0, matte: 1, transparent: 2 };

// =================================================================
// ШЕЙДЕРЫ
// =================================================================

const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision highp float;
varying vec2 v_uv;

uniform vec3 u_base, u_highlight, u_shadow, u_accent, u_deep;
uniform vec3 u_flash0, u_flash1, u_flash2;
uniform int  u_textureType;
uniform int  u_finish;          // 0 polished, 1 matte, 2 transparent
uniform float u_variant;
uniform float u_seed;
uniform int       u_hasTexture; // 1 если есть PNG albedo, иначе 0
uniform sampler2D u_albedoTex;

// --- Хэш-шумы (детерминированные) ---
float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, int oct) {
    float s = 0.0; float a = 0.5; float f = 1.0;
    for (int i = 0; i < 6; i++) {
        if (i >= oct) break;
        s += a * vnoise(p * f);
        f *= 2.03; a *= 0.5;
    }
    return s;
}

vec2 swirlUV(vec2 p, float k) {
    return p + vec2(fbm(p + 7.1, 4), fbm(p + 3.7, 4)) * k;
}

float veined(vec2 p) {
    float n = fbm(p, 5);
    return smoothstep(0.45, 0.5, n) * 0.6 + smoothstep(0.5, 0.55, n) * 0.4;
}

float rings(vec2 p, float freq) {
    float r = length(p);
    return 0.5 + 0.5 * sin(r * freq + fbm(p, 3) * 2.5);
}

float bands(vec2 p) {
    return 0.5 + 0.5 * sin(p.y * 8.0 + fbm(p, 4) * 3.0);
}

float facets(vec2 p) {
    vec2 g = floor(p * 3.0);
    vec2 f = fract(p * 3.0);
    float minD = 8.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 of = vec2(float(i), float(j));
            vec2 r = of + vec2(hash21(g + of + 1.0), hash21(g + of + 5.0)) - f;
            float d = dot(r, r);
            minD = min(minD, d);
        }
    }
    return clamp(minD, 0.0, 1.0);
}

void main() {
    // [-1, 1] координата
    vec2 uv = v_uv * 2.0 - 1.0;
    float r2 = dot(uv, uv);
    if (r2 > 1.0) { gl_FragColor = vec4(0.0); return; }

    // Сглаживание края
    float edge = 1.0 - smoothstep(0.97, 1.0, sqrt(r2));

    // Нормаль "impostor sphere"
    vec3 N = vec3(uv, sqrt(max(0.0, 1.0 - r2)));

    // Поворот текстуры в зависимости от variant, чтобы соседние камни
    // не выглядели идентично; плюс детерминированный seed на id камня
    float ang = u_variant * 1.7 + u_seed * 0.013;
    float ca = cos(ang), sa = sin(ang);
    vec2 tuv = mat2(ca, -sa, sa, ca) * uv * 1.7 + u_seed * 0.31;

    // ============ АЛЬБЕДО ============
    vec3 albedo = u_base;
    float roughness = 0.32;
    float metalness = 0.0;
    float pngMask = 1.0;   // если есть PNG, alpha-канал диктует силуэт бусины

    if (u_hasTexture == 1) {
        // Берём цвет из реальной PNG-фотографии бусины.
        vec4 tx = texture2D(u_albedoTex, v_uv);
        pngMask = tx.a;
        // Если за пределами реальной бусины (alpha == 0) — прекращаем рендер
        // здесь же. Это убирает «нимб» из нашего лайтинга вокруг бусины.
        if (pngMask < 0.02) { gl_FragColor = vec4(0.0); return; }
        albedo = tx.rgb;
        roughness = (u_finish == 1) ? 0.55 : (u_finish == 2) ? 0.10 : 0.22;
    } else if (u_textureType == 0) { // crystalline (амeтист, гранат)
        float f = facets(tuv);
        albedo = mix(u_deep, u_accent, smoothstep(0.0, 0.6, f));
        albedo = mix(albedo, u_base, 0.55);
        roughness = 0.18;
    } else if (u_textureType == 1) { // inclusions (лазурит, содалит)
        float n = fbm(tuv * 4.0, 5);
        float sp = smoothstep(0.76, 0.80, hash21(tuv * 40.0 + u_seed));
        albedo = mix(u_base, u_deep, n * 0.55);
        albedo = mix(albedo, vec3(1.0, 0.85, 0.4), sp);
        roughness = 0.32;
    } else if (u_textureType == 2) { // smooth (нефрит, шунгит)
        float n = fbm(tuv * 1.4, 4);
        albedo = mix(u_shadow, u_highlight, n * 0.5 + 0.3);
        albedo = mix(albedo, u_base, 0.6);
        roughness = 0.45;
    } else if (u_textureType == 3) { // glossy (обсидиан, аквамарин)
        float n = fbm(tuv * 1.0, 3);
        albedo = mix(u_base, u_accent, n * 0.28);
        roughness = 0.10;
    } else if (u_textureType == 4) { // banded (тигровый/соколиный глаз, оникс)
        float b = bands(tuv * 1.5);
        albedo = mix(u_deep, u_highlight, b);
        albedo = mix(albedo, u_base, 0.45);
        roughness = 0.20;
    } else if (u_textureType == 5) { // sparkle (авантюрин, солнечный)
        float n = fbm(tuv * 2.0, 4);
        float sp = smoothstep(0.87, 0.91, hash21(tuv * 60.0 + u_seed));
        albedo = mix(u_base, u_shadow, n * 0.40);
        albedo += vec3(0.95, 0.82, 0.45) * sp * 0.8;
        roughness = 0.28;
    } else if (u_textureType == 6) { // swirl (яшма, чароит, унакит)
        vec2 sw = swirlUV(tuv * 1.3, 0.45);
        float n = fbm(sw, 5);
        albedo = mix(u_deep, u_accent, n);
        albedo = mix(albedo, u_base, 0.45);
        roughness = 0.28;
    } else if (u_textureType == 7) { // milky (розовый кварц, кунцит)
        float n = fbm(tuv * 1.0, 4);
        albedo = mix(u_base, u_highlight, n * 0.55 + 0.22);
        roughness = 0.42;
    } else if (u_textureType == 8) { // iridescent (лабрадорит, лунный, перламутр)
        float n = fbm(tuv * 2.0, 4);
        albedo = mix(u_deep, u_base, n * 0.7 + 0.3);
        float angle = atan(uv.y, uv.x) + u_variant * 1.3;
        float bnd = sin(angle * 3.0 + fbm(tuv * 2.0, 3) * 4.0);
        float fmix = smoothstep(0.25, 1.0, bnd) * (1.0 - smoothstep(0.85, 1.0, sqrt(r2)));
        vec3 fcol = mix(u_flash0, u_flash1, sin(angle * 2.0) * 0.5 + 0.5);
        fcol = mix(fcol, u_flash2, fbm(tuv * 3.0, 2));
        albedo = mix(albedo, fcol, fmix * 0.85);
        roughness = 0.16;
    } else if (u_textureType == 9) { // metallic (гематит, пирит)
        float n = fbm(tuv * 2.5, 4);
        albedo = mix(u_base, u_highlight, n * 0.5);
        roughness = 0.25;
        metalness = 1.0;
    } else if (u_textureType == 10) { // concentric (малахит, азурмалахит)
        float r = rings(tuv, 16.0);
        albedo = mix(u_deep, u_accent, r);
        albedo = mix(albedo, u_base, 0.5);
        roughness = 0.24;
    } else if (u_textureType == 11) { // veined (амазонит, родонит, лепидолит)
        float v = veined(tuv * 1.8);
        albedo = mix(u_base, u_accent, v);
        float dark = smoothstep(0.55, 0.6, fbm(tuv * 4.0, 4));
        albedo = mix(albedo, u_deep, dark * 0.4);
        roughness = 0.30;
    } else if (u_textureType == 12) { // needle (астрофиллит)
        float angle = atan(uv.y, uv.x);
        float radial = sin(angle * 9.0 + fbm(tuv, 3) * 2.5) * 0.5 + 0.5;
        radial = pow(radial, 5.0);
        albedo = mix(u_base, u_accent, radial);
        roughness = 0.28;
    } else if (u_textureType == 13) { // striated (турмалин, кианит)
        float s = sin(tuv.x * 30.0 + fbm(tuv, 2) * 1.5) * 0.5 + 0.5;
        s = pow(s, 2.0);
        albedo = mix(u_deep, u_base, s);
        albedo = mix(albedo, u_accent, fbm(tuv * 3.0, 3) * 0.25);
        roughness = 0.32;
    } else if (u_textureType == 14) { // moss (моховой агат)
        float n = fbm(tuv * 3.0, 5);
        float patches = smoothstep(0.4, 0.7, n);
        albedo = mix(u_highlight, u_deep, patches * 0.85);
        albedo = mix(albedo, u_base, 0.55);
        roughness = 0.42;
    }

    // Микродеталь — снижает "пластиковость" процедурных камней.
    // Для PNG-фотографий микрорельеф уже есть в самой картинке.
    if (u_hasTexture == 0) {
        float micro = (fbm(tuv * 30.0, 3) - 0.5) * 0.06;
        albedo *= 1.0 + micro;
    }

    // ============ ОСВЕЩЕНИЕ ============
    vec3 L  = normalize(vec3(-0.42, -0.72, 0.62));   // key — верх-лево
    vec3 L2 = normalize(vec3( 0.50,  0.55, 0.48));   // fill — низ-право
    vec3 V  = vec3(0.0, 0.0, 1.0);
    vec3 H  = normalize(L + V);

    float NdotL  = max(0.0, dot(N, L));
    float NdotL2 = max(0.0, dot(N, L2));
    float NdotV  = max(0.0, dot(N, V));
    float NdotH  = max(0.0, dot(N, H));
    float VdotH  = max(0.0, dot(V, H));

    // Diffuse:
    //   - procedural: полное освещение по Ламберту (PNG нет, нужно строить лайтинг с нуля).
    //   - PNG: лёгкое модулирование (картинка уже освещена). Сохраняем форму, но добавляем сверху объём.
    vec3 diffuse;
    if (u_hasTexture == 1) {
        // 75% — родной PNG, 25% — наш PBR-лайтинг сверху
        float lit = NdotL * 0.55 + NdotL2 * 0.20 + 0.25;
        diffuse = albedo * mix(1.0, lit, 0.35);
    } else {
        diffuse = albedo * (NdotL * 0.88 + NdotL2 * 0.22 + 0.10);
    }

    // GGX specular (Cook-Torrance, lite)
    float a   = roughness * roughness;
    float a2  = a * a;
    float NdotH2 = NdotH * NdotH;
    float denom  = NdotH2 * (a2 - 1.0) + 1.0;
    float D   = a2 / (3.14159265 * denom * denom + 1e-6);
    float k   = (roughness + 1.0); k = k * k * 0.125;
    float Gv  = NdotV / (NdotV * (1.0 - k) + k);
    float Gl  = NdotL / (NdotL * (1.0 - k) + k);
    float G   = Gv * Gl;
    float F0  = mix(0.06, 0.85, metalness);
    float F   = F0 + (1.0 - F0) * pow(1.0 - VdotH, 5.0);
    float spec = D * G * F / max(1e-3, 4.0 * NdotV * NdotL);
    spec *= NdotL;

    vec3 specCol = mix(u_highlight, albedo, metalness);

    if (u_finish == 1) spec *= 0.15;            // matte
    if (u_finish == 2) spec *= 1.4;             // transparent — ярче блик

    // Rim light отключён по просьбе — давал слишком явный «ореол»
    // вокруг бусины. Если нужно вернуть лёгкий ободок, делайте
    // rim * 0.05 максимум.
    vec3 rimCol = vec3(0.0);

    // Subsurface scattering — только для transparent
    vec3 ss = vec3(0.0);
    if (u_finish == 2) {
        float thick = pow(N.z, 0.55);
        ss = u_accent * (1.0 - thick) * 0.45;
    }

    // AO у силуэта
    float ao = smoothstep(0.0, 0.55, N.z);

    // Sigle clearcoat hat for polished+glossy
    float clearcoat = 0.0;
    if (u_finish != 1) {
        clearcoat = pow(NdotH, 80.0) * 0.45;
    }

    vec3 color = diffuse * ao + specCol * spec + rimCol + ss + vec3(clearcoat);

    // Лёгкий гамма-tonemap (Reinhard)
    color = color / (1.0 + color * 0.6);

    // Финальный alpha: либо наша sphere-маска, либо альфа PNG-фотографии,
    // что меньше. Так смягчённый край бусины из PNG корректно «угасает».
    gl_FragColor = vec4(color, edge * pngMask);
}
`;

// =================================================================
// СОСТОЯНИЕ И ИНИЦИАЛИЗАЦИЯ
// =================================================================

let gl = null;
let prog = null;
let buf = null;
let canvas = null;
let inited = false;
let supported = true;
let dummyTex = null;   // 1×1 заглушка для sampler u_albedoTex, когда у камня нет PNG

function init() {
    if (inited) return supported;
    inited = true;
    try {
        canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        gl = canvas.getContext('webgl', {
            premultipliedAlpha: false,
            alpha: true,
            antialias: true,
            preserveDrawingBuffer: true,
        }) || canvas.getContext('experimental-webgl');
        if (!gl) { supported = false; return false; }
        prog = compileProgram(gl, VERT_SRC, FRAG_SRC);
        if (!prog) { supported = false; return false; }
        buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER,
            new Float32Array([-1,-1,  1,-1,  -1,1,  1,1]),
            gl.STATIC_DRAW);

        // Заглушка 1×1: нужна, чтобы sampler u_albedoTex всегда был привязан
        // к корректной WebGL-текстуре. Без этого некоторые драйверы дают
        // GL_INVALID_OPERATION и шейдер ничего не рисует.
        dummyTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, dummyTex);
        gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
            new Uint8Array([0, 0, 0, 0])
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } catch (err) {
        console.warn('[stoneRenderer] WebGL init failed:', err);
        supported = false;
    }
    return supported;
}

function compileShader(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('[stoneRenderer] shader error:', gl.getShaderInfoLog(sh));
        console.error(src);
        gl.deleteShader(sh);
        return null;
    }
    return sh;
}

function compileProgram(gl, vs, fs) {
    const v = compileShader(gl, gl.VERTEX_SHADER, vs);
    const f = compileShader(gl, gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    const p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error('[stoneRenderer] link error:', gl.getProgramInfoLog(p));
        return null;
    }
    return p;
}

function hexToVec3(hex) {
    if (!hex) return [0.5, 0.5, 0.5];
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return [
        parseInt(hex.slice(0, 2), 16) / 255,
        parseInt(hex.slice(2, 4), 16) / 255,
        parseInt(hex.slice(4, 6), 16) / 255,
    ];
}

function hashSeed(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    }
    // Возвращаем число в диапазоне [0, 1000) для использования в шейдере
    return (h >>> 0) % 1000;
}

function setVec3(gl, prog, name, v) {
    gl.uniform3f(gl.getUniformLocation(prog, name), v[0], v[1], v[2]);
}
function setInt(gl, prog, name, x) {
    gl.uniform1i(gl.getUniformLocation(prog, name), x);
}
function setFloat(gl, prog, name, x) {
    gl.uniform1f(gl.getUniformLocation(prog, name), x);
}

// =================================================================
// ALBEDO-ТЕКСТУРЫ (фотореалистичные PNG)
// =================================================================
//
// Для каждого камня по id ожидается файл:
//   assets/stones/<id>.png  (квадрат, бусина в центре, прозрачный фон).
// Если файл есть — он будет использован как albedo и подмешан в шейдер
// вместе с лайтингом, спекуляром, fresnel и SSS. Если файла нет —
// рендер падает на полностью процедурное альбедо.

const albedoCache = new Map();    // id → { texture: WebGLTexture | null, status: 'loading' | 'ready' | 'missing' }
const albedoPending = new Map();  // id → Promise

const ASSETS_DIR = './assets/stones/';

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image not found: ' + url));
        img.src = url;
    });
}

function uploadTexture(img) {
    if (!gl) return null;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}

async function tryLoadAlbedo(stoneId) {
    if (albedoCache.has(stoneId)) return albedoCache.get(stoneId);
    if (albedoPending.has(stoneId)) return albedoPending.get(stoneId);

    const p = (async () => {
        const url = `${ASSETS_DIR}${stoneId}.png`;
        try {
            const img = await loadImage(url);
            if (!init()) {
                const entry = { texture: null, status: 'missing' };
                albedoCache.set(stoneId, entry);
                return entry;
            }
            const tex = uploadTexture(img);
            const entry = { texture: tex, status: 'ready' };
            albedoCache.set(stoneId, entry);
            // Сбрасываем кэш отрендеренных версий этого камня —
            // чтобы при следующем drawImage пересчитать с новой текстурой
            for (const k of [...cache.keys()]) {
                if (k.startsWith(stoneId + '_')) cache.delete(k);
            }
            fireAlbedoReady(stoneId);
            return entry;
        } catch (err) {
            const entry = { texture: null, status: 'missing' };
            albedoCache.set(stoneId, entry);
            return entry;
        }
    })();

    albedoPending.set(stoneId, p);
    return p;
}

/**
 * Запустить предзагрузку PNG-альбедо. По умолчанию — НЕ ЖДЁТ,
 * чтобы не блокировать рендер: возвращает резолвящийся Promise
 * сразу, а загрузка идёт в фоне. Когда PNG приходит — кэш
 * рендеров инвалидируется для этого stone, и подписчики
 * (через onAlbedoReady) перерисовывают.
 *
 * @param {Array} catalogue           массив объектов stone
 * @param {Object} [opts]
 * @param {boolean} [opts.eager=false] true — ждать всех (старое поведение)
 * @returns {Promise<void>}
 */
export async function preloadAlbedos(catalogue, opts = {}) {
    if (opts.eager) {
        await Promise.all(catalogue.map(s => tryLoadAlbedo(s.id).catch(() => null)));
        return;
    }
    // Фоновая ленивая загрузка — не блокирует
    catalogue.forEach(s => { tryLoadAlbedo(s.id).catch(() => null); });
}

/**
 * Подписаться на готовность PNG-альбедо конкретного камня.
 * Колбэк вызывается один раз когда текстура загружена в WebGL.
 *
 * @param {string} stoneId
 * @param {Function} cb       () => void
 */
const albedoListeners = new Map();   // stoneId → Set<cb>
export function onAlbedoReady(stoneId, cb) {
    const entry = albedoCache.get(stoneId);
    if (entry && entry.status === 'ready') { cb(); return () => {}; }
    if (!albedoListeners.has(stoneId)) albedoListeners.set(stoneId, new Set());
    albedoListeners.get(stoneId).add(cb);
    return () => albedoListeners.get(stoneId)?.delete(cb);
}

function fireAlbedoReady(stoneId) {
    const set = albedoListeners.get(stoneId);
    if (!set) return;
    for (const cb of set) {
        try { cb(); } catch (e) { console.error(e); }
    }
    set.clear();
}

// =================================================================
// КЭШИРОВАНИЕ ОТРЕНДЕРЕННЫХ ТЕКСТУР
// =================================================================

const cache = new Map();
const CACHE_LIMIT = 600;

function cacheKey(stone, pixelSize, variant) {
    return `${stone.id}_${Math.round(pixelSize)}_${variant}`;
}

function trimCache() {
    if (cache.size <= CACHE_LIMIT) return;
    // удаляем 1/4 самых старых
    const drop = Math.ceil(cache.size * 0.25);
    let i = 0;
    for (const k of cache.keys()) {
        cache.delete(k);
        if (++i >= drop) break;
    }
}

// =================================================================
// ПУБЛИЧНЫЙ API
// =================================================================

/**
 * Сгенерировать текстуру камня и вернуть её в виде 2D-canvas-а.
 * Сигнатура совместима с прежним stoneGenerator.js.
 *
 * @param {Object} stone     запись из stones.json
 * @param {Number} pixelSize размер canvas в пикселях
 * @param {Number} variant   вариация (для разных позиций в браслете)
 * @returns {HTMLCanvasElement}
 */
export function generateStoneTexture(stone, pixelSize, variant = 0) {
    const key = cacheKey(stone, pixelSize, variant);
    if (cache.has(key)) return cache.get(key);

    const size = Math.max(8, Math.round(pixelSize));

    if (!init()) {
        return renderFallback(stone, size, variant);
    }

    try {
        return renderWebGL(stone, size, variant, key);
    } catch (err) {
        console.warn('[stoneRenderer] WebGL render failed for', stone.id, err);
        return renderFallback(stone, size, variant);
    }
}

function renderWebGL(stone, size, variant, key) {
    canvas.width = size;
    canvas.height = size;
    gl.viewport(0, 0, size, size);

    gl.useProgram(prog);

    const pal = stone.palette || {};
    setVec3(gl, prog, 'u_base',      hexToVec3(pal.base      || stone.color || '#888'));
    setVec3(gl, prog, 'u_highlight', hexToVec3(pal.highlight || '#FFFFFF'));
    setVec3(gl, prog, 'u_shadow',    hexToVec3(pal.shadow    || '#000000'));
    setVec3(gl, prog, 'u_accent',    hexToVec3(pal.accent    || pal.base   || '#888'));
    setVec3(gl, prog, 'u_deep',      hexToVec3(pal.deep      || '#000000'));

    const flashes = stone.flashes || [];
    setVec3(gl, prog, 'u_flash0', hexToVec3(flashes[0] || pal.highlight || '#FFFFFF'));
    setVec3(gl, prog, 'u_flash1', hexToVec3(flashes[1] || pal.accent    || '#FFFFFF'));
    setVec3(gl, prog, 'u_flash2', hexToVec3(flashes[2] || pal.deep      || '#000000'));

    setInt(gl, prog, 'u_textureType', TEXTURE_TYPE[stone.texture] ?? 2);
    setInt(gl, prog, 'u_finish',
        stone.finish === 'matte' ? FINISH.matte :
        stone.finish === 'transparent' ? FINISH.transparent : FINISH.polished);
    setFloat(gl, prog, 'u_variant', variant * 0.7);
    setFloat(gl, prog, 'u_seed', hashSeed(stone.id));

    // PNG-альбедо: всегда привязываем сэмплер к unit 0 (либо реальная
    // текстура камня, либо заглушка), иначе на некоторых драйверах
    // шейдер откажется рисовать.
    const albedoEntry = albedoCache.get(stone.id);
    const hasTexture = !!(albedoEntry && albedoEntry.status === 'ready' && albedoEntry.texture);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, hasTexture ? albedoEntry.texture : dummyTex);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_albedoTex'), 0);
    setInt(gl, prog, 'u_hasTexture', hasTexture ? 1 : 0);

    // Если ещё не пробовали — стартанём фоновую загрузку
    if (!albedoEntry && !albedoPending.has(stone.id)) {
        tryLoadAlbedo(stone.id);
    }

    const locPos = gl.getAttribLocation(prog, 'a_pos');
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Копируем во "внешний" 2D-canvas, чтобы вернуть стабильный кадр
    const out = document.createElement('canvas');
    out.width = size;
    out.height = size;
    const ctx = out.getContext('2d');
    ctx.drawImage(canvas, 0, 0);

    cache.set(key, out);
    trimCache();
    return out;
}

/**
 * Принудительная очистка кэша (например, после смены палитры).
 */
export function clearTextureCache() {
    cache.clear();
}

// =================================================================
// FALLBACK (если WebGL недоступен)
// =================================================================

function renderFallback(stone, size, variant) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    const base = (stone.color || stone.palette?.base) || '#888';
    // Простой радиальный градиент-кружок
    const cx = size / 2, cy = size / 2;
    const g = ctx.createRadialGradient(cx * 0.7, cy * 0.7, 1, cx, cy, size / 2);
    g.addColorStop(0, lighten(base, 0.5));
    g.addColorStop(0.5, base);
    g.addColorStop(1, darken(base, 0.6));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    return c;
}

function lighten(hex, t) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.slice(0,2), 16);
    const g = parseInt(hex.slice(2,4), 16);
    const b = parseInt(hex.slice(4,6), 16);
    const f = v => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0');
    return '#' + f(r) + f(g) + f(b);
}
function darken(hex, t) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.slice(0,2), 16);
    const g = parseInt(hex.slice(2,4), 16);
    const b = parseInt(hex.slice(4,6), 16);
    const f = v => Math.round(v * (1 - t)).toString(16).padStart(2, '0');
    return '#' + f(r) + f(g) + f(b);
}
