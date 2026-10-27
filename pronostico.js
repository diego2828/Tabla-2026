// ===================================
// EL PRONÓSTICO: el resto del año, simulado
// ===================================

// Cómo se calcula, en criollo. Cada final simulado tira cuántas juntadas
// quedan (al ritmo que viene la tabla), de qué tipo es cada una (de 1 o de 3
// puntos, en la proporción que vienen saliendo) y qué saca cada uno en cada
// una: lo sortea de sus propias juntadas de ese tipo, y las últimas pesan
// más que las de marzo. Una de cada cuatro veces sortea del grupo entero:
// nadie está condenado a repetir su año. Se repite 10.000 veces y se cuenta.
//
// Usa todo lo que ya trae script.js: db, seasonEvents, seasonParticipants,
// seasonScores, avatar, hueByPlayer, plural, esc, parseLocalDate...

const FORECAST_RUNS = 10000;
const HALF_LIFE = 15;      // juntadas: la de hace 15 pesa la mitad que la última
const POOL_SHARE = 0.25;   // una de cada cuatro, sortea del grupo
const MIN_OWN = 3;         // con menos juntadas propias de un tipo, sortea del grupo
const MIN_EVENTS = 3;      // antes de esto no hay pronóstico que valga
const DAY = 86400000;

let currentView = 'tabla'; // 'tabla' | 'pronostico'
let forecast = null;       // lo calculado para la tabla que se mira

// ===================================
// El azar, con semilla: todos ven los mismos números
// ===================================

// Con la misma tabla, el mismo pronóstico en todos los teléfonos. Cambia
// cuando se carga una juntada o cambia el día, no cada vez que se recarga.
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function poisson(lambda, rng) {
    if (lambda <= 0) return 0;
    if (lambda > 60) {
        const g = Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
        return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * g));
    }
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rng(); } while (p > L);
    return k - 1;
}

// Un sorteo con pesos. Los puntajes posibles son pocos (de −2 a +3), así que
// los pesos se juntan por valor y el sorteo recorre seis casilleros como mucho.
function makeSampler(entries) {
    const byValue = new Map();
    entries.forEach(e => byValue.set(e.v, (byValue.get(e.v) || 0) + e.w));
    const values = [], cum = [];
    let total = 0;
    byValue.forEach((w, v) => { total += w; values.push(v); cum.push(total); });
    return { values, cum, total, size: entries.length };
}

function sample(s, rng) {
    const r = rng() * s.total;
    const last = s.cum.length - 1;
    for (let k = 0; k < last; k++) if (r < s.cum[k]) return s.values[k];
    return s.values[last];
}

// ===================================
// El modelo
// ===================================

// Lo que se sabe después de las primeras `k` juntadas (en orden de fecha),
// mirando desde `fromDate`.
function forecastInputs(players, eventsAsc, byEvent, k, fromDate, start, close) {
    const n = players.length;
    const current = players.map(p => p.starting_points || 0);
    const own = [players.map(() => []), players.map(() => [])];
    const pool = [[], []];
    let big = 0;

    for (let e = 0; e < k; e++) {
        const ev = eventsAsc[e];
        const type = (ev.total_points_disputed || 0) >= 3 ? 1 : 0;
        if (type) big++;
        const w = Math.pow(0.5, (k - 1 - e) / HALF_LIFE);
        const row = byEvent.get(ev.id);
        players.forEach((p, i) => {
            // sin fila en el acta es que no fue: cero
            const v = row?.get(p.id) ?? 0;
            current[i] += v;
            own[type][i].push({ v, w });
            pool[type].push({ v, w });
        });
    }

    const elapsed = Math.max(14, (fromDate - start) / DAY);
    const left = Math.max(0, Math.round((close - fromDate) / DAY));
    return {
        n,
        current,
        own: own.map(t => t.map(makeSampler)),
        pool: pool.map(makeSampler),
        pBig: (big + 1) / (k + 2),
        lambda: (k / elapsed) * left,
        left,
        fromDate
    };
}

function drawScore(inp, i, type, rng) {
    // si nunca hubo una juntada de ese tipo, se usa la del otro
    const t = inp.pool[type].size ? type : 1 - type;
    const mine = inp.own[t][i];
    const from = mine.size >= MIN_OWN && rng() >= POOL_SHARE ? mine : inp.pool[t];
    return sample(from, rng);
}

// Muchos finales. Guarda el puntaje final de cada uno en cada final: con eso
// se responde después cualquier "¿y si...?" sin volver a simular.
function simulate(inp, runs, rng) {
    const n = inp.n;
    const finals = new Int16Array(runs * n);
    const pWin = new Float64Array(n);
    const pLast = new Float64Array(n);
    const total = new Array(n);

    for (let r = 0; r < runs; r++) {
        for (let i = 0; i < n; i++) total[i] = inp.current[i];
        const m = poisson(inp.lambda, rng);
        for (let e = 0; e < m; e++) {
            const type = rng() < inp.pBig ? 1 : 0;
            for (let i = 0; i < n; i++) total[i] += drawScore(inp, i, type, rng);
        }
        let hi = -Infinity, lo = Infinity;
        for (let i = 0; i < n; i++) {
            finals[r * n + i] = total[i];
            if (total[i] > hi) hi = total[i];
            if (total[i] < lo) lo = total[i];
        }
        // empatados, se reparten el puesto
        let nh = 0, nl = 0;
        for (let i = 0; i < n; i++) { if (total[i] === hi) nh++; if (total[i] === lo) nl++; }
        for (let i = 0; i < n; i++) {
            if (total[i] === hi) pWin[i] += 1 / nh;
            if (total[i] === lo) pLast[i] += 1 / nl;
        }
    }
    for (let i = 0; i < n; i++) { pWin[i] /= runs; pLast[i] /= runs; }
    return { runs, n, finals, pWin, pLast };
}

// Un solo final, juntada por juntada, para mirarlo. Este no lleva semilla:
// cada "Otro final" es distinto.
function simulateStory(inp, rng = Math.random) {
    const m = Math.max(1, poisson(inp.lambda, rng));
    const span = Math.max(1, inp.left);
    const days = Array.from({ length: m }, () => 1 + Math.floor(rng() * span)).sort((a, b) => a - b);
    return days.map(d => {
        const big = rng() < inp.pBig;
        return {
            date: new Date(inp.fromDate.getTime() + d * DAY),
            big,
            scores: Array.from({ length: inp.n }, (_, i) => drawScore(inp, i, big ? 1 : 0, rng))
        };
    });
}

// ===================================
// Los datos de la tabla que se mira
// ===================================

function forecastData(seasonId = currentSeasonId) {
    const players = seasonParticipants(seasonId);
    const eventsAsc = seasonEvents(seasonId).slice().reverse();
    const byEvent = new Map();
    seasonScores(seasonId).forEach(s => {
        if (!byEvent.has(s.event_id)) byEvent.set(s.event_id, new Map());
        byEvent.get(s.event_id).set(s.participant_id, s.score || 0);
    });
    return { players, eventsAsc, byEvent };
}

const forecastAvailable = () => !isGlobal() && !seasonClosed()
    && seasonEvents(currentSeasonId).length >= MIN_EVENTS
    && seasonParticipants(currentSeasonId).length >= 2;

const storiesAvailable = () => !isGlobal() && seasonEvents(currentSeasonId).length >= MIN_EVENTS;

function todayDate() {
    return parseLocalDate(todayLocalISO());
}

// Se calcula una vez por tabla y por día; cargar una juntada lo invalida.
function ensureForecast() {
    const data = forecastData();
    const sum = seasonScores(currentSeasonId).reduce((a, s) => a + (s.score || 0) * 7 + s.event_id.length, 0);
    const key = [currentSeasonId, todayLocalISO(), data.eventsAsc.length, sum,
        data.players.map(p => `${p.id}:${p.starting_points}`).join(',')].join('|');
    if (forecast?.key === key) return forecast;

    const today = todayDate();
    const inputs = forecastInputs(data.players, data.eventsAsc, data.byEvent,
        data.eventsAsc.length, today, SEASON_START, SEASON_CLOSE);
    const sim = simulate(inputs, FORECAST_RUNS, mulberry32(hashString(key)));

    stopShow();
    forecast = { key, data, inputs, sim };
    return forecast;
}

// ===================================
// Formatos
// ===================================

function pct(p) {
    if (p <= 0) return '0%';
    if (p < 0.005) return '<1%';
    if (p > 0.995 && p < 1) return '>99%';
    return `${Math.round(p * 100)}%`;
}

function odds(p) {
    if (p <= 0.001) return '—';
    const o = 1 / p;
    return o >= 100 ? Math.round(o).toLocaleString('es-AR')
        : o.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const signed = (n) => `${n > 0 ? '+' : ''}${n}`;
const shortDate = (d) => `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

// Lo que diría la casa de apuestas de cada uno.
function oddsLine(pWin, pLast) {
    if (pLast >= 0.5) return 'Ya puede ir comprando el carbón.';
    if (pWin >= 0.5) return 'Favorito. Ya ensaya el discurso.';
    if (pLast >= 0.25) return 'Zona roja: tiene que ir a todo.';
    if (pWin >= 0.2) return 'Pelea la punta mano a mano.';
    if (pLast >= 0.08) return 'Transpira, pero zafa.';
    if (pWin >= 0.05) return 'Candidato de afuera.';
    if (pWin > 0 && pWin < 0.01 && pLast < 0.01) return 'Matemáticamente vivo. Espiritualmente, no.';
    if (pLast < 0.005) return 'Salvado: come gratis en diciembre.';
    return 'Mitad de tabla, sin sobresaltos.';
}

// ===================================
// La vista: La tabla / Pronóstico
// ===================================

function setView(view) {
    if (view === currentView) return;
    currentView = view;
    writeSeasonHash();
    renderForecastView();
    renderCards();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderForecastView() {
    const bar = document.getElementById('viewBar');
    const view = document.getElementById('forecastView');
    if (!bar || !view) return;

    // la sala de trofeos tiene su propia pantalla
    if (currentView === 'trofeos') {
        bar.hidden = true;
        view.hidden = true;
        document.body.classList.remove('is-forecast');
        stopShow();
        return;
    }

    const canForecast = forecastAvailable();
    const canStories = storiesAvailable();
    const canCards = cardsAvailable();
    if (!canForecast && currentView === 'pronostico') currentView = 'tabla';
    if (!canCards && currentView === 'cartas') currentView = 'tabla';

    bar.hidden = !canForecast && !canStories && !canCards;
    document.getElementById('viewSwitch').hidden = !canForecast && !canCards;
    bar.querySelector('[data-view="pronostico"]').hidden = !canForecast;
    bar.querySelector('[data-view="cartas"]').hidden = !canCards;
    document.getElementById('btnStories').hidden = !canStories;
    bar.querySelectorAll('.view-tab').forEach(tab =>
        tab.setAttribute('aria-pressed', String(tab.dataset.view === currentView)));

    const on = currentView === 'pronostico';
    document.body.classList.toggle('is-forecast', on);
    view.hidden = !on;
    if (!on) { stopShow(); return; }

    const f = ensureForecast();
    renderOdds(f);
    renderShow(f);
    renderMethod(f);
    observeReveals(view);
}

// ===================================
// Las chances: la casa de apuestas
// ===================================

function renderOdds(f) {
    const { players } = f.data;
    const { pWin, pLast } = f.sim;
    const ranking = seasonRanking(currentSeasonId);
    const order = ranking.map(r => players.findIndex(p => p.id === r.id)).filter(i => i >= 0);

    const payer = order.reduce((a, b) => pLast[b] > pLast[a] ? b : a, order[0]);
    const champ = order.reduce((a, b) => pWin[b] > pWin[a] ? b : a, order[0]);
    const events = Math.round(f.inputs.lambda);

    document.getElementById('fcHeadline').innerHTML =
        `<span class="is-ember">${esc(players[payer].name)}</span> paga el asado en el ${pct(pLast[payer])} de los finales.`;
    document.getElementById('fcSub').textContent =
        `${players[champ].name} sale campeón en el ${pct(pWin[champ])}. ` +
        `Quedan ${plural(daysToClose(), 'día', 'días')} y, al ritmo que vienen, unas ${plural(events, 'juntada', 'juntadas')} más.`;

    const maxLast = Math.max(...pLast, 0.0001);
    const maxWin = Math.max(...pWin, 0.0001);

    document.getElementById('fcBoard').innerHTML = `
        <div class="fc-board-head" aria-hidden="true">
            <span>Hoy</span><span>Campeón</span><span>Paga el asado</span>
        </div>
        ${order.map((i, row) => {
            const p = players[i];
            const score = f.inputs.current[i];
            return `
            <button type="button" class="fc-odd${i === payer ? ' is-payer' : ''}${i === champ ? ' is-champ' : ''}"
                    data-player-id="${p.id}" style="--i:${row}"
                    aria-label="${esc(p.name)}: campeón ${pct(pWin[i])}, paga el asado ${pct(pLast[i])}. Ver su año">
                <span class="fc-odd-who">
                    ${avatar(p.id, 'sm')}
                    <span class="fc-odd-name">
                        <strong>${esc(p.name)}</strong>
                        <small>${oddsLine(pWin[i], pLast[i])}</small>
                    </span>
                </span>
                <span class="fc-odd-score num">${signed(score)}</span>
                <span class="fc-odd-cell is-gold">
                    <span class="fc-odd-figure num">${pct(pWin[i])}</span>
                    <span class="fc-odd-bar"><i style="--w:${(pWin[i] / maxWin * 100).toFixed(1)}%"></i></span>
                    <small class="num">cuota ${odds(pWin[i])}</small>
                </span>
                <span class="fc-odd-cell is-ember">
                    <span class="fc-odd-figure num">${pct(pLast[i])}</span>
                    <span class="fc-odd-bar"><i style="--w:${(pLast[i] / maxLast * 100).toFixed(1)}%"></i></span>
                    <small class="num">cuota ${odds(pLast[i])}</small>
                </span>
            </button>`;
        }).join('')}`;

    document.querySelectorAll('#fcBoard .fc-odd').forEach(btn => {
        btn.addEventListener('click', () => showPlayerModal(btn.dataset.playerId));
    });
}

// ===================================
// Ver cómo termina: un final, juntada por juntada
// ===================================

const show = {
    key: null,       // de qué pronóstico es
    story: [],       // las juntadas simuladas
    frames: [],      // el puntaje de cada uno después de cada juntada (0 = hoy)
    step: 0,
    playing: false,
    fast: false,
    timer: null,
    order: []        // el puesto de cada uno en el cuadro anterior, para desempatar
};

function stopShow() {
    clearTimeout(show.timer);
    show.timer = null;
    show.playing = false;
    updateShowControls();
}

function newStory(f) {
    show.key = f.key;
    show.story = simulateStory(f.inputs);
    show.frames = [f.inputs.current.slice()];
    show.story.forEach(ev => {
        const prev = show.frames[show.frames.length - 1];
        show.frames.push(prev.map((v, i) => v + ev.scores[i]));
    });
    show.step = 0;
    show.order = [];
}

function renderShow(f) {
    if (show.key !== f.key) newStory(f);
    const rows = document.getElementById('fcRows');
    const { players } = f.data;

    rows.style.setProperty('--n', players.length);
    rows.innerHTML = players.map((p, i) => `
        <div class="fc-row" data-index="${i}" style="--hue:${hueByPlayer.get(p.id) || 'var(--faint)'}">
            <span class="fc-row-pos num"></span>
            <span class="fc-row-who">${avatar(p.id, 'xs')}<span>${esc(p.name)}</span></span>
            <span class="fc-row-track"><i></i></span>
            <span class="fc-row-delta num" aria-hidden="true"></span>
            <span class="fc-row-score num"></span>
        </div>`).join('');

    document.getElementById('fcFinale').hidden = true;
    document.getElementById('fcFinale').innerHTML = '';
    drawFrame(f, show.step, false);
    if (!show.playing && show.step >= show.story.length) finishShow(f);
    else if (show.step === 0) {
        setNarrator(`Así está hoy. Faltan ${plural(daysToClose(), 'día', 'días')}: dale play y mirá un final posible.`);
    }
    updateShowControls();
}

// El puesto de cada uno: el de más puntos arriba; empatados, como venían.
function rankOrder(totals) {
    const idx = totals.map((_, i) => i);
    const prev = show.order.length ? show.order : idx;
    return idx.sort((a, b) => totals[b] - totals[a] || prev.indexOf(a) - prev.indexOf(b));
}

function drawFrame(f, step, animate) {
    const totals = show.frames[step];
    const order = rankOrder(totals);
    show.order = order;
    const max = Math.max(...show.frames[show.frames.length - 1], ...totals, 1);
    const lo = Math.min(...totals);
    const hi = Math.max(...totals);
    const ev = step > 0 ? show.story[step - 1] : null;

    document.querySelectorAll('#fcRows .fc-row').forEach(row => {
        const i = Number(row.dataset.index);
        const rank = order.indexOf(i);
        const position = 1 + totals.filter(t => t > totals[i]).length;
        row.style.setProperty('--rank', rank);
        row.style.setProperty('--w', `${Math.max(2, (Math.max(0, totals[i]) / max) * 100).toFixed(1)}%`);
        row.classList.toggle('is-first', totals[i] === hi);
        row.classList.toggle('is-last', totals[i] === lo && hi !== lo);
        row.querySelector('.fc-row-pos').textContent = position;
        tweenNumber(row.querySelector('.fc-row-score'), totals[i], animate);

        const delta = row.querySelector('.fc-row-delta');
        delta.classList.remove('is-pop', 'is-pos', 'is-neg', 'is-zero');
        if (ev) {
            const s = ev.scores[i];
            delta.textContent = s === 0 ? '0' : signed(s);
            delta.classList.add(s > 0 ? 'is-pos' : s < 0 ? 'is-neg' : 'is-zero');
            if (animate) { void delta.offsetWidth; delta.classList.add('is-pop'); }
        } else {
            delta.textContent = '';
        }
    });

    const clock = document.getElementById('fcClock');
    const stepEl = document.getElementById('fcStep');
    clock.textContent = ev ? shortDate(ev.date) : 'Hoy';
    stepEl.textContent = ev
        ? `Juntada ${step} de ${show.story.length} · ${ev.big ? 'Asado y boliche' : 'Asado o salida'}`
        : `${show.story.length > 1 ? `Este final trae ${show.story.length} juntadas más` : 'Este final trae una juntada más'}`;
    if (animate) {
        clock.classList.remove('is-tick');
        void clock.offsetWidth;
        clock.classList.add('is-tick');
    }
    document.getElementById('fcProgress').style.setProperty('--p', `${(step / show.story.length * 100).toFixed(1)}%`);
}

function tweenNumber(el, to, animate) {
    const from = Number(el.dataset.value ?? to);
    el.dataset.value = to;
    if (!animate || from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = signed(to);
        return;
    }
    const t0 = performance.now();
    const dur = show.fast ? 300 : 600;
    const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - k, 3);
        el.textContent = signed(Math.round(from + (to - from) * eased));
        if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

function setNarrator(text) {
    const el = document.getElementById('fcNarrator');
    el.classList.remove('is-in');
    el.textContent = text;
    void el.offsetWidth;
    el.classList.add('is-in');
}

// El relator: de todo lo que pasó en la juntada, cuenta lo más jugoso.
function narrate(f, step) {
    const names = f.data.players.map(p => p.name);
    const n = names.length;
    const prev = show.frames[step - 1];
    const next = show.frames[step];
    const ev = show.story[step - 1];

    const argmax = (t) => { const m = Math.max(...t); const all = t.map((v, i) => v === m ? i : -1).filter(i => i >= 0); return all; };
    const argmin = (t) => { const m = Math.min(...t); const all = t.map((v, i) => v === m ? i : -1).filter(i => i >= 0); return all; };

    const lines = [];
    const lastPrev = argmin(prev), lastNext = argmin(next);
    const topPrev = argmax(prev), topNext = argmax(next);

    if (lastNext.length === 1 && lastPrev.length === 1 && lastNext[0] !== lastPrev[0]) {
        lines.push(fill(pick([
            '¡Cambio en el fondo! {new} agarra la pinza y {old} respira.',
            '{old} se salva por ahora: el carbón lo compra {new}.',
            '{new} cae al último puesto. Ya huele a chorizo.'
        ]), { new: names[lastNext[0]], old: names[lastPrev[0]] }));
    } else if (lastNext.length === 2 && lastPrev.join() !== lastNext.join()) {
        lines.push(`Empate en el fondo entre ${names[lastNext[0]]} y ${names[lastNext[1]]}. Nadie quiere la pinza.`);
    }

    if (topNext.length === 1 && !topPrev.includes(topNext[0])) {
        lines.push(fill(pick([
            '{new} se sube a la punta.',
            '{new} pasa adelante y queda primero.',
            'Hay nuevo puntero: {new}.'
        ]), { new: names[topNext[0]] }));
    }

    const worst = ev.scores.reduce((a, s, i) => s < ev.scores[a] ? i : a, 0);
    if (ev.scores[worst] <= -2) {
        lines.push(`Tres fechas sin aparecer: ${signed(ev.scores[worst])} para ${names[worst]}.`);
    } else if (ev.scores[worst] < 0) {
        lines.push(fill(pick([
            '{a} la mató cuatro horas antes: {s}. El grupo no perdona.',
            '{a} hizo la del tibio: {s}.',
            '{a} faltó al cumple. {s} y a dar explicaciones en el grupo.'
        ]), { a: names[worst], s: signed(ev.scores[worst]) }));
    }

    const went = ev.scores.filter(s => s > 0).length;
    if (lines.length < 2) {
        const last = lastPrev.length === 1 ? lastPrev[0] : -1;
        if (ev.big && last >= 0 && ev.scores[last] === 3) {
            lines.push(`${names[last]} fue a todo: +3 y sigue peleando.`);
        } else if (ev.big && went >= n - 1) {
            lines.push(`Asado y boliche con ${went} de ${n}. Noche histórica.`);
        } else if (went <= Math.floor(n / 2)) {
            lines.push(`Juntada flaca: ${went === 1 ? 'fue uno solo' : `fueron ${went}`}.`);
        }
    }

    if (!lines.length) {
        lines.push(pick([
            'Asadito tranquilo. Nadie se mueve.',
            'Juntada sin sobresaltos. La tabla ni se entera.',
            'Fernet, truco y a casa. Todo igual.'
        ]));
    }
    return lines.slice(0, 2).join(' ');
}

function playStep(f) {
    if (show.step >= show.story.length) { finishShow(f); return; }
    show.step++;
    drawFrame(f, show.step, true);
    setNarrator(narrate(f, show.step));
    if (show.step >= show.story.length) {
        show.timer = setTimeout(() => finishShow(f), show.fast ? 700 : 1400);
    } else {
        show.timer = setTimeout(() => playStep(f), show.fast ? 950 : 2100);
    }
}

function finishShow(f) {
    show.playing = false;
    show.step = show.story.length;
    clearTimeout(show.timer);

    const { players } = f.data;
    const totals = show.frames[show.frames.length - 1];
    const hi = Math.max(...totals), lo = Math.min(...totals);
    const champs = totals.map((t, i) => t === hi ? i : -1).filter(i => i >= 0);
    const payers = totals.map((t, i) => t === lo ? i : -1).filter(i => i >= 0);
    const names = (list) => list.map(i => players[i].name).join(' y ');
    const payer = payers[0];

    const finale = document.getElementById('fcFinale');
    finale.innerHTML = `
        <div class="fc-finale-card is-gold">
            <div class="fc-confetti" aria-hidden="true">${confetti(36)}</div>
            ${avatar(players[champs[0]].id, 'xl')}
            <p class="fc-finale-label">${champs.length > 1 ? 'Campeones' : 'Campeón'}</p>
            <p class="fc-finale-name">${esc(names(champs))}</p>
            <p class="fc-finale-score num">${signed(hi)}</p>
        </div>
        <div class="fc-finale-card is-ember">
            ${grill()}
            ${avatar(players[payer].id, 'xl')}
            <p class="fc-finale-label">${payers.length > 1 ? 'Pagan el asado' : 'Paga el asado'}</p>
            <p class="fc-finale-name">${esc(names(payers))}</p>
            <p class="fc-finale-score num">${signed(lo)}</p>
        </div>`;
    finale.hidden = false;

    const share = f.sim.pLast[payer];
    setNarrator(fill(pick([
        '21 de diciembre. {w} campeón y {l} paga el asado. Andá calentando la parrilla.',
        'Se terminó: {l} pone la tarjeta. {w} elige el corte.',
        'Final del año. {w} levanta la copa y {l}, la cuenta.'
    ]), { w: names(champs), l: names(payers) }) +
        ` En los 10.000 finales, a ${players[payer].name} le toca pagar en el ${pct(share)}.`);
    updateShowControls();
}

function confetti(count) {
    const colors = ['var(--gold)', 'var(--s1)', 'var(--s3)', 'var(--s5)', 'var(--s7)', 'var(--text)'];
    return Array.from({ length: count }, (_, k) => {
        const x = (Math.random() * 2 - 1) * 180;
        const y = -60 - Math.random() * 160;
        const r = Math.round(Math.random() * 720 - 360);
        const d = Math.round(Math.random() * 220);
        return `<i style="--x:${x.toFixed(0)}px;--y:${y.toFixed(0)}px;--r:${r}deg;--d:${d}ms;background:${colors[k % colors.length]}"></i>`;
    }).join('');
}

// La parrilla: brasas que laten, dos chorizos y el humo que sube.
function grill() {
    return `<svg class="fc-grill" viewBox="0 0 160 120" aria-hidden="true">
        <g class="fc-smoke">
            <circle cx="62" cy="40" r="9"/><circle cx="84" cy="34" r="11"/><circle cx="100" cy="42" r="8"/>
        </g>
        <rect class="fc-grill-sausage" x="46" y="56" width="30" height="9" rx="4.5"/>
        <rect class="fc-grill-sausage" x="84" y="56" width="30" height="9" rx="4.5"/>
        <g class="fc-grill-bars">
            <line x1="30" y1="68" x2="130" y2="68"/>
            <line x1="40" y1="68" x2="40" y2="84"/><line x1="60" y1="68" x2="60" y2="84"/>
            <line x1="80" y1="68" x2="80" y2="84"/><line x1="100" y1="68" x2="100" y2="84"/>
            <line x1="120" y1="68" x2="120" y2="84"/>
        </g>
        <g class="fc-embers">
            <circle cx="48" cy="90" r="6"/><circle cx="66" cy="92" r="7"/><circle cx="86" cy="90" r="6"/>
            <circle cx="104" cy="92" r="7"/><circle cx="76" cy="96" r="5"/>
        </g>
        <path class="fc-grill-base" d="M24 98 H136 L128 108 H32 Z"/>
    </svg>`;
}

function updateShowControls() {
    const play = document.getElementById('btnShowPlay');
    if (!play) return;
    const done = show.story.length && show.step >= show.story.length;
    play.textContent = show.playing ? 'Pausa' : done ? 'Otro final' : show.step > 0 ? 'Seguir' : 'Ver cómo termina';
    play.setAttribute('aria-pressed', String(show.playing));
    document.getElementById('btnShowSkip').disabled = done;
    document.getElementById('btnShowNew').hidden = !(show.step > 0) || done;
    document.getElementById('btnShowFast').setAttribute('aria-pressed', String(show.fast));
}

function wireShow() {
    document.getElementById('btnShowPlay').addEventListener('click', () => {
        const f = forecast;
        if (!f) return;
        if (show.playing) { stopShow(); return; }
        if (show.step >= show.story.length) { newStory(f); renderShow(f); }
        show.playing = true;
        document.getElementById('fcFinale').hidden = true;
        updateShowControls();
        playStep(f);
    });
    document.getElementById('btnShowNew').addEventListener('click', () => {
        if (!forecast) return;
        stopShow();
        newStory(forecast);
        renderShow(forecast);
    });
    document.getElementById('btnShowSkip').addEventListener('click', () => {
        if (!forecast) return;
        stopShow();
        show.step = show.story.length;
        drawFrame(forecast, show.step, true);
        finishShow(forecast);
    });
    document.getElementById('btnShowFast').addEventListener('click', () => {
        show.fast = !show.fast;
        updateShowControls();
    });
}

function renderMethod(f) {
    const { inputs } = f;
    const k = f.data.eventsAsc.length;
    const bigShare = Math.round(inputs.pBig * 100);
    document.getElementById('fcMethod').innerHTML = `
        <li><strong>Cuántas juntadas quedan.</strong> Al ritmo de esta tabla (${plural(k, 'juntada', 'juntadas')} hasta hoy) salen unas ${Math.round(inputs.lambda)} en los ${plural(daysToClose(), 'día', 'días')} que faltan. Cada final tira su propio número: a veces hay más, a veces menos.</li>
        <li><strong>De qué tipo.</strong> Más o menos ${bigShare} de cada 100 son de asado y boliche, como vienen saliendo.</li>
        <li><strong>Qué saca cada uno.</strong> Se sortea de sus propias juntadas de ese tipo, y las últimas pesan más que las de hace meses. Una de cada cuatro veces se sortea del grupo entero, porque nadie está condenado a repetir su año.</li>
        <li><strong>Y se cuenta.</strong> ${FORECAST_RUNS.toLocaleString('es-AR')} finales distintos. El porcentaje es en cuántos de esos le toca a cada uno. Margen de error: de bar.</li>`;
}

// ===================================
// El año en historias
// ===================================

const stories = { slides: [], index: 0, paused: false };

// Las cuentas del año de una tabla: las usan las historias y los trofeos.
function seasonFacts(seasonId = currentSeasonId) {
    const { players, eventsAsc, byEvent } = forecastData(seasonId);
    const n = players.length;
    const N = eventsAsc.length;
    const scoreOf = (ev, p) => byEvent.get(ev.id)?.get(p.id) ?? 0;

    const stats = players.map(p => {
        let went = 0, full = 0, ghost = 0, fines = 0, fineCount = 0, streak = 0, best = 0;
        eventsAsc.forEach(ev => {
            const s = scoreOf(ev, p);
            if (s > 0) { went++; streak++; best = Math.max(best, streak); } else streak = 0;
            if (s >= 3) full++;
            if (s === 0) ghost++;
            if (s < 0) { fines += s; fineCount++; }
        });
        return { p, went, full, ghost, fines, fineCount, best };
    });

    // el puesto de cada uno después de cada juntada, para la remontada
    const totals = players.map(p => p.starting_points || 0);
    const worst = players.map(() => 1);
    eventsAsc.forEach((ev, k) => {
        players.forEach((p, i) => { totals[i] += scoreOf(ev, p); });
        if (k >= 4) players.forEach((_, i) => {
            worst[i] = Math.max(worst[i], 1 + totals.filter(t => t > totals[i]).length);
        });
    });
    const finalPos = players.map((_, i) => 1 + totals.filter(t => t > totals[i]).length);

    const byMonth = new Map();
    eventsAsc.forEach(ev => { const m = parseLocalDate(ev.date).getMonth(); byMonth.set(m, (byMonth.get(m) || 0) + 1); });

    const party = eventsAsc.map(ev => ({
        ev, went: players.filter(p => scoreOf(ev, p) > 0).length, big: (ev.total_points_disputed || 0) >= 3
    })).sort((a, b) => b.went - a.went || b.big - a.big || String(b.ev.date).localeCompare(String(a.ev.date)))[0];

    return { players, eventsAsc, n, N, stats, totals, worst, finalPos, byMonth, party };
}

function leaders(list, value) {
    const best = Math.max(...list.map(value));
    return { best, who: list.filter(x => value(x) === best) };
}

function buildSlides() {
    const season = currentSeason();
    const F = seasonFacts();
    const closed = seasonClosed();
    const slides = [];
    const hue = (id) => hueByPlayer.get(id) || 'var(--faint)';
    const also = (who) => who.length > 1 ? ` Empatado con ${who.slice(1).map(x => x.p.name).join(' y ')}.` : '';

    const points = F.totals.reduce((a, t) => a + t, 0);
    slides.push({
        tone: 'surface',
        title: season?.name || 'La tabla',
        big: plural(F.N, 'juntada', 'juntadas'),
        text: `${points} puntos repartidos entre ${F.n}. ${closed ? 'Esto fue lo que pasó.' : 'Y todavía falta.'}`
    });

    const present = leaders(F.stats, s => s.went);
    slides.push({
        tone: hue(present.who[0].p.id), face: present.who[0].p.id,
        title: 'El que nunca falta',
        big: present.who[0].p.name,
        text: `Sumó en ${present.best} de ${F.N} juntadas.${also(present.who)}`
    });

    const party = leaders(F.stats, s => s.full);
    if (party.best > 0) slides.push({
        tone: hue(party.who[0].p.id), face: party.who[0].p.id,
        title: 'El fiestero',
        big: party.who[0].p.name,
        text: `${plural(party.best, 'vez', 'veces')} asado y boliche. En el boliche ya lo saludan por el nombre.${also(party.who)}`
    });

    const streak = leaders(F.stats, s => s.best);
    if (streak.best >= 3) slides.push({
        tone: hue(streak.who[0].p.id), face: streak.who[0].p.id,
        title: 'La racha más larga',
        big: `${streak.best} seguidas`,
        text: `${streak.who[0].p.name} sumó ${streak.best} juntadas de corrido. Ni una gripe.${also(streak.who)}`
    });

    const fined = leaders(F.stats, s => -s.fines);
    if (fined.best > 0) slides.push({
        tone: 'ember', face: fined.who[0].p.id,
        title: 'El multado del año',
        big: fined.who[0].p.name,
        text: `${fined.best} puntos de multa en ${plural(fined.who[0].fineCount, 'penalización', 'penalizaciones')}. El reglamento lo tiene de cliente.${also(fined.who)}`
    });
    else slides.push({
        tone: 'surface', title: 'Cero multas', big: 'Nadie',
        text: 'Ni una penalización en todo el año. Sospechoso.'
    });

    const ghost = leaders(F.stats, s => s.ghost);
    if (ghost.best >= 3) slides.push({
        tone: hue(ghost.who[0].p.id), face: ghost.who[0].p.id,
        title: 'El fantasma',
        big: ghost.who[0].p.name,
        text: `No apareció en ${plural(ghost.best, 'juntada', 'juntadas')}. Se lo extraña. Más o menos.${also(ghost.who)}`
    });

    const [month, inMonth] = [...F.byMonth.entries()].sort((a, b) => b[1] - a[1])[0];
    const monthName = new Date(2000, month, 1).toLocaleDateString('es-AR', { month: 'long' });
    slides.push({
        tone: 'gold',
        title: 'El mes más picante',
        big: monthName[0].toUpperCase() + monthName.slice(1),
        text: `${plural(inMonth, 'juntada', 'juntadas')} en un mes. Los hígados todavía no se recuperan.`
    });

    if (F.party) slides.push({
        tone: 'surface',
        title: 'La juntada del año',
        big: F.party.ev.name,
        text: `${formatActaDate(F.party.ev.date)} · fueron ${F.party.went} de ${F.n}${F.party.big ? ', asado y boliche' : ''}.`
    });

    const comeback = F.players.map((p, i) => ({ p, gain: F.worst[i] - F.finalPos[i], from: F.worst[i], to: F.finalPos[i] }))
        .sort((a, b) => b.gain - a.gain)[0];
    if (comeback && comeback.gain >= 2) slides.push({
        tone: hue(comeback.p.id), face: comeback.p.id,
        title: 'La remontada',
        big: comeback.p.name,
        text: `Llegó a estar ${comeback.from}º y ${closed ? 'terminó' : 'hoy está'} ${comeback.to}º.`
    });

    const ranking = seasonRanking(currentSeasonId);
    const last = ranking[ranking.length - 1];
    let tail = '';
    if (!closed && forecastAvailable()) {
        const f = ensureForecast();
        const i = f.data.players.findIndex(p => p.id === last.id);
        if (i >= 0) tail = ` El pronóstico le da ${pct(f.sim.pLast[i])} de pagar.`;
    }
    slides.push({
        tone: 'ember', podium: ranking.slice(0, 3), face: last.id,
        title: closed ? 'Pagó el asado' : 'Hoy paga el asado',
        big: last.name,
        text: `${signed(last.score)} puntos.${tail}`
    });

    return slides;
}

function slideHTML(s, k) {
    const named = ['surface', 'ember', 'gold'];
    const tone = named.includes(s.tone) ? `story is-${s.tone}` : 'story';
    const style = named.includes(s.tone) ? '' : ` style="--hue:${s.tone}"`;
    const podium = s.podium ? `<ol class="story-podium">${s.podium.map((r, i) => `
        <li class="story-in" style="--d:${3 + i}">${avatar(r.id, i === 0 ? 'lg' : 'md')}<span>${i + 1}º ${esc(r.name)}</span><b class="num">${signed(r.score)}</b></li>`).join('')}</ol>` : '';
    return `<section class="${tone}" data-k="${k}"${style} aria-roledescription="historia" aria-label="${k + 1} de ${stories.slides.length}">
        <h3 class="story-title story-in" style="--d:0">${esc(s.title)}</h3>
        ${s.face && !s.podium ? `<div class="story-face story-in" style="--d:1">${avatar(s.face, 'xl')}</div>` : ''}
        ${podium}
        <p class="story-big story-in" style="--d:2">${esc(s.big)}</p>
        <p class="story-text story-in" style="--d:3">${esc(s.text)}</p>
    </section>`;
}

function openStories() {
    stories.slides = buildSlides();
    stories.index = 0;
    stories.paused = false;
    const modal = document.getElementById('storiesModal');
    document.getElementById('storiesProgress').innerHTML = stories.slides.map(() => '<span><i></i></span>').join('');
    modal.classList.add('active');
    document.body.classList.add('has-stories');
    showSlide(0);
    document.getElementById('btnCloseStories').focus();
}

function closeStories() {
    document.getElementById('storiesModal').classList.remove('active');
    document.body.classList.remove('has-stories');
    document.getElementById('storiesSlides').innerHTML = '';
    document.getElementById('btnStories').focus();
}

function showSlide(k) {
    if (k < 0) k = 0;
    if (k >= stories.slides.length) { closeStories(); return; }
    stories.index = k;
    document.getElementById('storiesSlides').innerHTML = slideHTML(stories.slides[k], k);
    document.querySelectorAll('#storiesProgress span').forEach((bar, i) => {
        bar.classList.toggle('is-done', i < k);
        bar.classList.remove('is-now');
        if (i === k) { void bar.offsetWidth; bar.classList.add('is-now'); }
    });
    setStoriesPaused(false);
}

function setStoriesPaused(paused) {
    stories.paused = paused;
    document.getElementById('storiesModal').classList.toggle('is-paused', paused);
}

function wireStories() {
    document.getElementById('btnStories').addEventListener('click', openStories);
    document.getElementById('btnCloseStories').addEventListener('click', closeStories);
    document.getElementById('btnStoryPrev').addEventListener('click', () => showSlide(stories.index - 1));
    document.getElementById('btnStoryNext').addEventListener('click', () => showSlide(stories.index + 1));
    document.getElementById('storiesProgress').addEventListener('animationend', (e) => {
        if (e.target.closest('.is-now')) showSlide(stories.index + 1);
    });

    // tocar y mantener pausa, como en cualquier historia
    const frame = document.getElementById('storiesSlides');
    let held = null;
    frame.addEventListener('pointerdown', () => { held = setTimeout(() => setStoriesPaused(true), 180); });
    frame.addEventListener('pointerup', (e) => {
        clearTimeout(held);
        if (stories.paused) { setStoriesPaused(false); return; }
        const r = frame.getBoundingClientRect();
        showSlide(stories.index + (e.clientX - r.left < r.width / 3 ? -1 : 1));
    });
    frame.addEventListener('pointerleave', () => { clearTimeout(held); if (stories.paused) setStoriesPaused(false); });

    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('storiesModal').classList.contains('active')) return;
        if (e.key === 'Escape') { e.stopImmediatePropagation(); closeStories(); }
        else if (e.key === 'ArrowRight') showSlide(stories.index + 1);
        else if (e.key === 'ArrowLeft') showSlide(stories.index - 1);
        else if (e.key === ' ') { e.preventDefault(); setStoriesPaused(!stories.paused); }
    }, true);
}

// ===================================
// Cableado
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#viewSwitch .view-tab').forEach(tab =>
        tab.addEventListener('click', () => setView(tab.dataset.view)));
    wireShow();
    wireStories();
});
