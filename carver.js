(() => {
    'use strict';
    const asset = new URL('pumpkin.png', document.currentScript.src).href;
    const storageKey = 'pumpkinWorkshop:v1';
    const dialog = document.getElementById('pumpkin-carver');
    const canvas = document.getElementById('pumpkin-canvas');
    const status = document.getElementById('pumpkin-status');
    const undo = document.getElementById('pumpkin-undo');
    const reset = document.getElementById('pumpkin-reset');
    const width = 900;
    const height = 762;
    const limit = 64;
    let image;
    let imageRequest;
    let pixels;
    let cuts = readCuts();
    let history = [];
    let draft = [];
    let pointer = null;
    let cursor = [0.5, 0.48];
    let keyboard = false;
    let frame = 0;
    const surfaces = new Map();
    if (!dialog || !canvas) return;

    function readCuts() {
        try {
            const value = JSON.parse(localStorage.getItem(storageKey));
            if (!Array.isArray(value) || value.length > limit) return [];
            return value.filter(cut => Array.isArray(cut) && cut.length >= 3 && cut.length <= 384
                && cut.every(point => Array.isArray(point) && point.length === 2
                    && point.every(coordinate => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)));
        } catch { return []; }
    }
    function surface(name) {
        if (!surfaces.has(name)) {
            const layer = document.createElement('canvas');
            layer.width = width;
            layer.height = height;
            surfaces.set(name, layer);
        }
        return surfaces.get(name);
    }
    function context(name) {
        const ctx = surface(name).getContext('2d');
        ctx.reset();
        return ctx;
    }
    function trace(ctx, points, close = true) {
        ctx.beginPath();
        points.forEach(([x, y], index) => index ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height));
        if (close) ctx.closePath();
    }
    async function loadImage() {
        if (!imageRequest) {
            imageRequest = (async () => {
                const loaded = new Image();
                loaded.src = asset;
                await loaded.decode();
                image = loaded;
                const hit = context('hit');
                hit.drawImage(image, 0, 0, width, height);
                pixels = hit.getImageData(0, 0, width, height).data;
            })().catch(error => { imageRequest = null; throw error; });
        }
        return imageRequest;
    }
    function renderBase() {
        const base = context('base');
        if (!cuts.length) { base.drawImage(image, 0, 0, width, height); return; }
        const mask = context('mask');
        mask.fillStyle = '#fff';
        mask.lineJoin = 'round';
        for (const cut of cuts) { trace(mask, cut); mask.fill(); }
        mask.globalCompositeOperation = 'destination-in';
        mask.drawImage(image, 0, 0, width, height);
        mask.clearRect(0, 0, width, height * 0.14);
        const inside = context('inside');
        inside.fillStyle = '#b75c16';
        inside.fillRect(0, 0, width, height);
        const light = context('light');
        const gradient = light.createRadialGradient(width * 0.5, height * 0.6, 0, width * 0.5, height * 0.55, width * 0.58);
        gradient.addColorStop(0, '#fff4ad');
        gradient.addColorStop(0.4, '#ffdb55');
        gradient.addColorStop(0.8, '#ffa928');
        gradient.addColorStop(1, '#ed811b');
        light.fillStyle = gradient;
        light.fillRect(0, 0, width, height);
        light.globalCompositeOperation = 'destination-in';
        light.drawImage(surface('mask'), 0, -width * 0.014);
        inside.drawImage(surface('light'), 0, 0);
        inside.globalCompositeOperation = 'destination-in';
        inside.drawImage(surface('mask'), 0, 0);
        base.drawImage(surface('inside'), 0, 0);
        const skin = context('skin');
        skin.drawImage(image, 0, 0, width, height);
        skin.globalCompositeOperation = 'destination-out';
        skin.drawImage(surface('mask'), 0, 0);
        const shaded = context('shaded');
        shaded.shadowColor = 'rgba(74, 25, 0, .82)';
        shaded.shadowBlur = width * 0.011;
        shaded.shadowOffsetY = width * 0.002;
        shaded.drawImage(surface('skin'), 0, 0);
        shaded.shadowColor = 'transparent';
        shaded.globalCompositeOperation = 'destination-in';
        shaded.drawImage(image, 0, 0, width, height);
        base.drawImage(surface('shaded'), 0, 0);
        const glow = context('glow');
        glow.filter = 'blur(9px)';
        glow.drawImage(surface('inside'), 0, 0);
        glow.filter = 'none';
        glow.globalCompositeOperation = 'destination-in';
        glow.drawImage(image, 0, 0, width, height);
        base.globalCompositeOperation = 'screen';
        base.globalAlpha = 0.22;
        base.drawImage(surface('glow'), 0, 0);
    }
    function render() {
        frame = 0;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(surface('base'), 0, 0);
        if (draft.length) {
            trace(ctx, draft, false);
            ctx.strokeStyle = '#1e1008';
            ctx.lineWidth = 2.5;
            ctx.lineCap = ctx.lineJoin = 'round';
            ctx.stroke();
            ctx.strokeStyle = '#ffe7a5';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.moveTo(draft.at(-1)[0] * width, draft.at(-1)[1] * height);
            ctx.lineTo(draft[0][0] * width, draft[0][1] * height);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        if (keyboard && document.activeElement === canvas) {
            const [x, y] = cursor.map((value, index) => value * (index ? height : width));
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.moveTo(x - 13, y); ctx.lineTo(x + 13, y);
            ctx.moveTo(x, y - 13); ctx.lineTo(x, y + 13);
            ctx.strokeStyle = '#fff4c9';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(render); }
    const languages = {
        en: {undo:'Undo',reset:'Start over',language:'Language',canvas:'Pumpkin carving surface',title:'Pumpkin',limit:'64 cuts reached. Undo or start over.',small:'Draw a larger shape.',load:'Unable to load pumpkin. Please reload.',storage:'Unable to save on this device.'},
        nb: {undo:'Angre',reset:'Begynn på nytt',language:'Språk',canvas:'Gresskar til utskjæring',title:'Gresskar',limit:'64 utskjæringer nådd. Angre eller begynn på nytt.',small:'Tegn en større figur.',load:'Kunne ikke laste gresskaret. Last siden på nytt.',storage:'Kunne ikke lagre på denne enheten.'},
        ja: {undo:'元に戻す',reset:'やり直す',language:'言語',canvas:'かぼちゃを彫るキャンバス',title:'かぼちゃ',limit:'彫れるのは64か所までです。元に戻すか、やり直してください。',small:'もっと大きな形を描いてください。',load:'かぼちゃを読み込めません。再読み込みしてください。',storage:'この端末に保存できませんでした。'}
    };
    const languageSelect = document.getElementById('language');
    let language = 'en';
    let notice = '';
    try { const saved = localStorage.getItem('pumpkinWorkshop:language'); if (languages[saved]) language = saved; } catch {}
    function controls(message = '') {
        notice = message;
        undo.disabled = !history.length;
        reset.disabled = !cuts.length;
        status.textContent = languages[language][notice] || '';
    }
    function applyLanguage() {
        const text = languages[language];
        document.documentElement.lang = language;
        document.title = text.title;
        languageSelect.value = language;
        languageSelect.setAttribute('aria-label', text.language);
        canvas.setAttribute('aria-label', text.canvas);
        undo.textContent = '↶ ' + text.undo;
        reset.textContent = '↺ ' + text.reset;
        controls(notice);
    }
    languageSelect.addEventListener('change', () => {
        language = languageSelect.value;
        try { localStorage.setItem('pumpkinWorkshop:language', language); } catch {}
        applyLanguage();
    });
    function save() {
        try { localStorage.setItem(storageKey, JSON.stringify(cuts)); } catch { controls('storage'); }
    }
    applyLanguage();
    function commit(next, message) {
        if (next.length > limit) { controls('limit'); schedule(); return; }
        history.push(cuts);
        if (history.length > limit) history.shift();
        cuts = next;
        draft = [];
        renderBase(); schedule(); controls(); save();
    }
    function carve() {
        const points = draft;
        draft = [];
        const area = points.reduce((sum, point, index) => {
            const next = points[(index + 1) % points.length];
            return sum + point[0] * next[1] - next[0] * point[1];
        }, 0);
        if (points.length >= 3 && Math.abs(area) > 0.00015) commit([...cuts, points], 'Cut carved. Looking brighter already.');
        else { controls('small'); schedule(); }
    }
    function hit([x, y]) {
        if (!pixels) return false;
        return y >= 0.14 && x >= 0 && x < 1 && y < 1 && pixels[(Math.floor(y * height) * width + Math.floor(x * width)) * 4 + 3] > 128;
    }
    function point(event) {
        const bounds = canvas.getBoundingClientRect();
        return [Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))];
    }
    function append(value) {
        const last = draft.at(-1);
        if (last && Math.hypot(value[0] - last[0], value[1] - last[1]) < 0.002) return;
        if (draft.length >= 384) draft = draft.filter((_, index) => index % 2 === 0);
        draft.push(value);
        schedule();
    }
    canvas.addEventListener('pointerdown', event => {
        if (event.button !== 0 || pointer !== null || !event.isPrimary) return;
        const start = point(event);
        if (!hit(start)) return;
        event.preventDefault(); keyboard = false;
        canvas.focus(); pointer = event.pointerId;
        draft = [start]; canvas.setPointerCapture(pointer); schedule();
    });
    canvas.addEventListener('pointermove', event => {
        if (event.pointerId !== pointer) return;
        const samples = event.getCoalescedEvents?.();
        for (const sample of samples?.length ? samples : [event]) append(point(sample));
    });
    canvas.addEventListener('pointerup', event => {
        if (event.pointerId !== pointer) return;
        append(point(event)); pointer = null;
        canvas.releasePointerCapture(event.pointerId); carve();
    });
    const cancelPointer = () => { pointer = null; draft = []; schedule(); };
    canvas.addEventListener('pointercancel', cancelPointer);
    canvas.addEventListener('lostpointercapture', () => { if (pointer !== null) cancelPointer(); });
    canvas.addEventListener('keydown', event => {
        const movement = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (movement) {
            event.preventDefault(); keyboard = true;
            cursor = cursor.map((value, index) => Math.max(0.02, Math.min(0.98, value + movement[index] * (event.shiftKey ? 0.03 : 0.01))));
            schedule();
        } else if (event.key === ' ') {
            event.preventDefault(); keyboard = true;
            if (hit(cursor)) { append(cursor.slice()); controls(); }
            else controls();
        } else if (event.key === 'Enter') { event.preventDefault(); carve(); }
    });
    canvas.addEventListener('focus', schedule);
    canvas.addEventListener('blur', schedule);
    canvas.addEventListener('keydown', event => {
        if(event.key === 'Escape') { draft = []; pointer = null; controls(); schedule(); }
    });
    undo.addEventListener('click', () => {
        if (!history.length) return;
        cuts = history.pop(); draft = []; renderBase(); schedule(); controls(); save();
    });
    reset.addEventListener('click', () => commit([], 'A fresh pumpkin. Undo brings your previous design back.'));
    loadImage().then(() => { renderBase(); controls(); schedule(); }).catch(() => controls('load'));
})();
