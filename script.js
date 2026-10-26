// ===================================
// TAB LACAVANI 2026 - Supabase Version
// ===================================

// El escribano es un usuario real de Supabase. Su clave NO está acá, ni en
// ningún archivo del repositorio, ni viaja al navegador: la verifica el
// servidor de Supabase. Esto es solo la casilla de correo con la que se
// identifica esa cuenta, y no sirve de nada sin la clave.
const ESCRIBANO_EMAIL = 'escribano@tablacavani.app';

// Login state
let isLoggedIn = false;

// La temporada: del 1 de enero al 21 de diciembre
const SEASON_START = new Date(2026, 0, 1);
const SEASON_CLOSE = new Date(2026, 11, 21);

// ===================================
// Date Helpers
// ===================================

// 'YYYY-MM-DD' leido como fecha local, no como UTC: new Date('2026-10-22')
// cae en el dia anterior en Argentina (UTC-3) y mostraba la fecha corrida.
function parseLocalDate(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

function formatActaDate(iso) {
    return parseLocalDate(iso).toLocaleDateString('es-AR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function todayLocalISO() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0'); // taste-skill-ignore: formato de fecha ISO
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function daysToClose() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.round((SEASON_CLOSE - today) / 86400000));
}

function plural(n, one, many) {
    return `${n} ${Math.abs(n) === 1 ? one : many}`;
}

// La tabla se dibuja sola una vez por visita, no en cada refresco.
let rankingDrawn = false;
let lastRanking = [];

// ===================================
// Initialization
// ===================================

document.addEventListener('DOMContentLoaded', async () => {
    await checkLoginStatus();
    updateLoginUI();
    await loadAndRenderAll();
    initializeEventListeners();
    observeReveals();

    // Si la sesión vence o se renueva, la interfaz se entera sola y no queda
    // mostrando botones habilitados que el servidor ya va a rechazar.
    supabase?.auth?.onAuthStateChange((_event, session) => {
        const wasLoggedIn = isLoggedIn;
        isLoggedIn = !!session;
        if (wasLoggedIn !== isLoggedIn) updateLoginUI();
    });
});

// ===================================
// Login Management
// ===================================

// La sesión la guarda y la renueva el propio cliente de Supabase.
async function checkLoginStatus() {
    if (!supabase?.auth) { isLoggedIn = false; return; }
    try {
        const { data } = await supabase.auth.getSession();
        isLoggedIn = !!data?.session;
    } catch (error) {
        console.error('Error leyendo la sesión:', error);
        isLoggedIn = false;
    }
}

async function logout() {
    try {
        await supabase?.auth?.signOut();
    } catch (error) {
        console.error('Error cerrando sesión:', error);
    }
    isLoggedIn = false;
    updateLoginUI();
}

function updateLoginUI() {
    const loginBtn = document.getElementById('btnLoginEscribano');
    const addParticipantBtn = document.getElementById('btnAddParticipant');
    const addEventBtn = document.getElementById('btnAddEvent');
    const exportBtn = document.getElementById('btnExportExcel');

    if (isLoggedIn) {
        loginBtn.textContent = 'Salir';
        loginBtn.classList.add('logged-in');
        addParticipantBtn.disabled = false;
        addEventBtn.disabled = false;
        if (exportBtn) exportBtn.disabled = false;
    } else {
        loginBtn.textContent = 'Entrar';
        loginBtn.classList.remove('logged-in');
        addParticipantBtn.disabled = true;
        addEventBtn.disabled = true;
        if (exportBtn) exportBtn.disabled = true;
    }

    // Re-render events to update edit/delete button states
    renderEvents();
}

function handleLoginLogout() {
    if (isLoggedIn) {
        if (confirm('¿Deseas cerrar sesión?')) {
            logout();
        }
    } else {
        showLoginModal();
    }
}

function showLoginModal() {
    const modal = document.getElementById('passwordModal');
    const pinInput = document.getElementById('pinInput');
    pinInput.value = '';
    modal.classList.add('active');
    pinInput.focus();
}

function hideLoginModal() {
    const modal = document.getElementById('passwordModal');
    modal.classList.remove('active');
}

async function handleLogin() {
    const pinInput = document.getElementById('pinInput');
    const btn = document.getElementById('btnPasswordSubmit');
    const pin = pinInput.value.trim();

    if (pin.length < 6) {
        alert('La clave tiene 6 dígitos');
        pinInput.focus();
        return;
    }

    if (!supabase?.auth) {
        alert('No hay conexión con Supabase');
        return;
    }

    // La comparación la hace el servidor: acá no hay ninguna clave con qué comparar.
    btn.disabled = true;
    btn.textContent = 'Verificando…';
    try {
        const { error } = await supabase.auth.signInWithPassword({
            email: ESCRIBANO_EMAIL,
            password: pin
        });

        if (error) {
            alert('Clave incorrecta');
            pinInput.value = '';
            pinInput.focus();
            return;
        }

        isLoggedIn = true;
        updateLoginUI();
        hideLoginModal();
    } catch (error) {
        console.error('Error iniciando sesión:', error);
        alert('No se pudo verificar la clave: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Entrar';
    }
}

// ===================================
// Supabase Data Functions
// ===================================

async function loadAndRenderAll() {
    await renderRanking();
    await renderRace();
    await renderEvents();
    await updateStats();
}

async function getParticipants() {
    if (!supabase) {
        console.error('Supabase not initialized');
        return [];
    }

    const { data, error } = await supabase
        .from('participants')
        .select('*')
        .order('name');

    if (error) {
        console.error('Error loading participants:', error);
        return [];
    }

    return data || [];
}

async function getEvents() {
    if (!supabase) {
        console.error('Supabase not initialized');
        return [];
    }

    const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('date', { ascending: false });

    if (error) {
        console.error('Error loading events:', error);
        return [];
    }

    return data || [];
}

async function getEventScores() {
    if (!supabase) {
        console.error('Supabase not initialized');
        return [];
    }

    const { data, error } = await supabase
        .from('event_scores')
        .select('*');

    if (error) {
        console.error('Error loading event scores:', error);
        return [];
    }

    return data || [];
}

// ===================================
// Ranking Functions
// ===================================

async function calculateParticipantScore(participantId) {
    if (!supabase) return 0;

    const { data: scores, error: scoresError } = await supabase
        .from('event_scores')
        .select('score')
        .eq('participant_id', participantId);

    if (scoresError) {
        console.error('Error calculating score:', scoresError);
        return 0;
    }

    const eventScores = scores.reduce((sum, s) => sum + (s.score || 0), 0);

    // Get starting points
    const { data: participant, error: participantError } = await supabase
        .from('participants')
        .select('starting_points')
        .eq('id', participantId)
        .single();

    if (participantError) {
        console.error('Error getting participant:', participantError);
        return eventScores;
    }

    const startingPoints = participant?.starting_points || 0;

    return startingPoints + eventScores;
}

async function getRankingData() {
    const participants = await getParticipants();

    const rankingData = await Promise.all(
        participants.map(async (p) => ({
            id: p.id,
            name: p.name,
            score: await calculateParticipantScore(p.id)
        }))
    );

    return rankingData.sort((a, b) => b.score - a.score);
}

async function renderRanking() {
    const container = document.getElementById('rankingTable');
    const rankingData = await getRankingData();

    if (rankingData.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Todavía no hay participantes</p>
                <p class="empty-hint">El escribano los carga desde «Participante».</p>
            </div>
        `;
        updateStake(rankingData);
        return;
    }

    // El relleno de cada fila es la barra: su parte del puntaje del puntero.
    const leader = Math.max(...rankingData.map(i => i.score));
    const lastIndex = rankingData.length - 1;

    container.innerHTML = rankingData.map((item, index) => {
        const position = index + 1;
        const positionClass = position <= 3 ? `position-${position}` : '';
        const scoreClass = item.score < 0 ? 'negative' : '';
        const isLast = index === lastIndex && rankingData.length > 1;
        const bar = leader > 0 ? Math.max(0, Math.min(100, (item.score / leader) * 100)) : 0;
        const tag = isLast ? '<span class="ranking-tag">Paga el asado</span>' : '';

        return `
            <button type="button" class="ranking-item ${positionClass}${isLast ? ' is-last' : ''}"
                    style="--bar: ${bar.toFixed(1)}%; --i: ${index}"
                    data-player-id="${item.id}"
                    aria-label="Ver el año de ${item.name}">
                <div class="ranking-position">${position}</div>
                <div class="ranking-name">${item.name}${tag}</div>
                <div class="ranking-score ${scoreClass}">${item.score > 0 ? '+' : ''}${item.score}</div>
            </button>
        `;
    }).join('');

    // La carrera se dibuja sola una sola vez. Despues se saca la clase, para que
    // guardar una juntada refresque la tabla sin volver a animarla entera.
    if (!rankingDrawn) {
        rankingDrawn = true;
        container.classList.add('is-fresh');
        setTimeout(() => container.classList.remove('is-fresh'), 1700);
    }

    container.querySelectorAll('.ranking-item').forEach((row) => {
        row.addEventListener('click', () => showPlayerModal(row.dataset.playerId));
        // la fila y su linea en la carrera son la misma persona: se enfocan juntas
        row.addEventListener('mouseenter', () => setRaceFocus(row.dataset.playerId));
        row.addEventListener('focus', () => setRaceFocus(row.dataset.playerId));
        row.addEventListener('mouseleave', () => setRaceFocus(null));
        row.addEventListener('blur', () => setRaceFocus(null));
    });

    lastRanking = rankingData;
    updateStake(rankingData);
}

// El bloque que responde la pregunta de la pantalla: quien paga, y cuanto año queda.
function updateStake(rankingData) {
    const nameEl = document.getElementById('stakeName');
    const metaEl = document.getElementById('stakeMeta');
    const findingEl = document.getElementById('pageFinding');
    const noteEl = document.getElementById('rankingNote');
    if (!nameEl || !metaEl) return;

    const days = daysToClose();
    const left = days === 0
        ? 'La temporada está cerrada.'
        : `Quedan ${plural(days, 'día', 'días')} para el cierre.`;

    if (rankingData.length === 0) {
        nameEl.textContent = '—';
        metaEl.textContent = 'Todavía no hay tabla.';
        if (findingEl) findingEl.textContent = `Sin participantes cargados. ${left}`;
        if (noteEl) noteEl.textContent = '—';
        return;
    }

    const last = rankingData[rankingData.length - 1];
    const above = rankingData[rankingData.length - 2];
    const score = `${last.score > 0 ? '+' : ''}${last.score}`;

    nameEl.textContent = last.name;

    if (!above) {
        metaEl.textContent = `${score} puntos · único participante`;
        if (findingEl) findingEl.textContent = `${last.name} es el único en la tabla con ${score}. ${left}`;
    } else {
        const gap = above.score - last.score;
        const position = gap === 0
            ? `empatado con ${above.name}`
            : `a ${plural(gap, 'punto', 'puntos')} de ${above.name}`;
        metaEl.textContent = `${score} puntos · ${position}`;
        if (findingEl) {
            findingEl.textContent = `${last.name} va último con ${score}, ${position}. ${left}`;
        }
    }

    if (noteEl) noteEl.textContent = plural(rankingData.length, 'participante', 'participantes');
}

// ===================================
// La carrera: los 8 a lo largo del año
// ===================================

// El color sigue a la persona, nunca a su puesto: el orden es por antigüedad,
// así agregar a alguien no le cambia el color a nadie.
let hueByPlayer = new Map();
let raceDrawn = false;

function assignHues(participants) {
    const order = participants.slice().sort((a, b) =>
        String(a.created_at).localeCompare(String(b.created_at)) || a.name.localeCompare(b.name));
    hueByPlayer = new Map(order.map((p, i) => [p.id, `var(--s${(i % 8) + 1})`]));
}

const MONTHS = [
    [0, 'ene'], [2, 'mar'], [4, 'may'], [6, 'jul'], [8, 'sep'], [10, 'nov']
];

async function renderRace() {
    const el = document.getElementById('racePlot');
    if (!el) return;

    const participants = await getParticipants();
    const events = (await getEvents()).slice().reverse(); // de enero en adelante
    const scores = await getEventScores();
    assignHues(participants);

    if (!participants.length || !events.length) {
        el.innerHTML = `<p class="empty-hint">La carrera se dibuja cuando haya juntadas cargadas.</p>`;
        return;
    }

    // En un telefono la tarjeta mide ~318px: con el viewBox ancho del escritorio
    // un texto de 12px se renderiza a 7px y no se lee. El movil lleva su propio
    // lienzo, mas angosto, para que la tipografia salga a tamano real.
    const compact = window.innerWidth < 700;
    const W = compact ? 340 : 1080;
    const H = compact ? 300 : 330;
    const PAD_L = compact ? 26 : 38;
    const PAD_R = compact ? 62 : 118;
    const PAD_T = 14;
    const PAD_B = compact ? 34 : 40;
    const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;

    const series = participants.map(p => ({
        id: p.id,
        name: p.name,
        hue: hueByPlayer.get(p.id),
        points: runningTotal(p.id, events, scores, p.starting_points || 0)
    }));

    const values = series.flatMap(s => s.points.map(pt => pt.total));
    const rawMax = Math.max(...values, 1);
    const rawMin = Math.min(...values, 0);
    const step = Math.max(10, Math.ceil(rawMax / 4 / 10) * 10);
    const top = Math.ceil(rawMax / step) * step || step;
    const bottom = Math.min(0, Math.floor(rawMin / step) * step);

    // El eje termina en la ultima juntada, no en diciembre: si llegara hasta el
    // cierre, cada linea quedaria a 150px de su propio nombre.
    const now = new Date();
    const axisEnd = new Date(Math.max(parseLocalDate(events[events.length - 1].date), new Date(now.getFullYear(), now.getMonth(), now.getDate())));
    const span = Math.max(axisEnd - SEASON_START, 86400000);
    const x = (d) => PAD_L + ((d - SEASON_START) / span) * plotW;
    const y = (v) => PAD_T + (1 - (v - bottom) / (top - bottom)) * plotH;
    const path = (pts) => pts.map((pt, i) => `${i ? 'L' : 'M'}${x(pt.date).toFixed(1)},${y(pt.total).toFixed(1)}`).join(' ');

    // grilla: 4-5 pasos redondos, el cero es la línea fuerte
    let grid = '';
    for (let v = bottom; v <= top; v += step) {
        grid += `<line class="${v === 0 ? 'race-base' : 'race-grid'}" x1="${PAD_L}" y1="${y(v).toFixed(1)}" x2="${PAD_L + plotW}" y2="${y(v).toFixed(1)}"/>`
            + `<text class="race-axis" x="${PAD_L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${v}</text>`;
    }

    const months = (compact ? MONTHS.filter((_, i) => i % 2 === 0) : MONTHS)
        .filter(([m]) => new Date(2026, m, 1) <= axisEnd)
        .map(([m, label]) =>
            `<text class="race-axis" x="${x(new Date(2026, m, 1)).toFixed(1)}" y="${H - 8}" text-anchor="middle">${label}</text>`
        ).join('');

    // la cinta de juntadas, ahora como base del gráfico
    const rugTop = H - PAD_B + 9;
    const rug = events.map(ev =>
        `<line class="race-rug" x1="${x(parseLocalDate(ev.date)).toFixed(1)}" y1="${rugTop}" x2="${x(parseLocalDate(ev.date)).toFixed(1)}" y2="${rugTop + ((ev.total_points_disputed || 0) >= 3 ? 11 : 6)}"/>`
    ).join('');

    // las etiquetas se separan si dos terminan empatados
    const ends = series.map((s, i) => ({ i, s, yEnd: y(s.points[s.points.length - 1].total) }))
        .sort((a, b) => a.yEnd - b.yEnd);
    const MIN_GAP = compact ? 15 : 16;
    ends.forEach((e, idx) => {
        if (idx > 0) e.yEnd = Math.max(e.yEnd, ends[idx - 1].yEnd + MIN_GAP);
    });
    const labelY = new Map(ends.map(e => [e.s.id, e.yEnd]));

    const lastPlace = lastRanking.length ? lastRanking[lastRanking.length - 1].id : null;

    const groups = series.map((s, i) => {
        const end = s.points[s.points.length - 1];
        const ly = labelY.get(s.id);
        const lx = x(end.date);
        const total = end.total;
        return `<g class="race-series${s.id === lastPlace ? ' is-last' : ''}" data-player-id="${s.id}" style="--i:${i}">
            <path class="race-line" d="${path(s.points)}" stroke="${s.hue}" pathLength="1"/>
            <path class="race-hit" d="${path(s.points)}"><title>${s.name}: ${total > 0 ? '+' : ''}${total}</title></path>
            <line class="race-dash" x1="${lx + 5}" y1="${ly.toFixed(1)}" x2="${lx + (compact ? 12 : 20)}" y2="${ly.toFixed(1)}" stroke="${s.hue}"/>
            <text class="race-label" x="${lx + (compact ? 17 : 26)}" y="${(ly + 4).toFixed(1)}">${s.name}</text>
            ${compact ? '' : `<text class="race-label-score" x="${W}" y="${(ly + 4).toFixed(1)}" text-anchor="end">${total > 0 ? '+' : ''}${total}</text>`}
        </g>`;
    }).join('');

    el.classList.toggle('is-compact', compact);
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img"
        aria-label="Puntaje acumulado de los ${series.length} participantes entre enero y diciembre de 2026">
        ${grid}${months}${rug}${groups}
    </svg>`;

    if (!raceDrawn) {
        raceDrawn = true;
        el.classList.add('is-fresh');
        setTimeout(() => el.classList.remove('is-fresh'), 2600);
    }

    wireRaceFocus(el);
}

// Enfocar una línea: la de al lado se corre a un lado, no desaparece.
function setRaceFocus(playerId) {
    document.querySelectorAll('.race-series').forEach((g) => {
        const mine = g.dataset.playerId === playerId;
        g.classList.toggle('is-dim', !!playerId && !mine);
        g.classList.toggle('is-focus', !!playerId && mine);
    });
}

function wireRaceFocus(el) {
    el.addEventListener('mouseover', (e) => {
        const g = e.target.closest('.race-series');
        if (g) setRaceFocus(g.dataset.playerId);
    });
    el.addEventListener('mouseleave', () => setRaceFocus(null));
    el.addEventListener('click', (e) => {
        const g = e.target.closest('.race-series');
        if (g) showPlayerModal(g.dataset.playerId);
    });
}

// ===================================
// El año de un jugador
// ===================================

// Puntaje acumulado acta por acta, en orden de fecha.
function runningTotal(participantId, events, scores, startingPoints = 0) {
    const byEvent = new Map();
    scores.filter(s => s.participant_id === participantId)
        .forEach(s => byEvent.set(s.event_id, s));

    let total = startingPoints;
    return events.map((event) => {
        const row = byEvent.get(event.id);
        total += (row?.score || 0);
        return { date: parseLocalDate(event.date), total, score: row?.score ?? null, description: row?.description || '' };
    });
}

// Una línea por serie, segmentos rectos, sin marcadores. 4 líneas de grilla.
function plotYear(el, you, reference, refLabel, youHue) {
    const W = 680, H = 190, PAD_L = 34, PAD_R = 8, PAD_T = 12, PAD_B = 22;
    const series = [you, reference].filter(s => s && s.length);
    if (!series.length) { el.innerHTML = ''; return; }

    const all = series.flat().map(p => p.total);
    const rawMax = Math.max(...all, 1);
    const rawMin = Math.min(...all, 0);
    const step = Math.max(10, Math.ceil(rawMax / 4 / 10) * 10);
    const top = Math.ceil(rawMax / step) * step || step;
    const bottom = Math.min(0, Math.floor(rawMin / step) * step);

    const span = SEASON_CLOSE - SEASON_START;
    const x = (d) => PAD_L + ((d - SEASON_START) / span) * (W - PAD_L - PAD_R);
    const y = (v) => PAD_T + (1 - (v - bottom) / (top - bottom)) * (H - PAD_T - PAD_B);
    const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');

    const ticks = [];
    for (let v = bottom; v <= top; v += step) ticks.push(v);

    const grid = ticks.map(v =>
        `<line class="${v === 0 ? 'plot-base' : 'plot-grid'}" x1="${PAD_L}" y1="${y(v).toFixed(1)}" x2="${W - PAD_R}" y2="${y(v).toFixed(1)}"/>` +
        `<text class="plot-tick" x="${PAD_L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${v}</text>`
    ).join('');

    const refPath = reference && reference.length
        ? `<path class="plot-line-ref" d="${path(reference)}" pathLength="1" style="--len:1"/>` : '';

    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img"
        aria-label="Puntaje acumulado en el año${refLabel ? `, comparado con ${refLabel}` : ''}">
        ${grid}${refPath}
        <path class="plot-line-you" d="${path(you)}" pathLength="1" style="--len:1"${youHue ? ` stroke="${youHue}"` : ''}/>
    </svg>`;
}

async function showPlayerModal(participantId) {
    if (!participantId) return;

    const modal = document.getElementById('playerModal');
    const participants = await getParticipants();
    const me = participants.find(p => p.id === participantId);
    if (!me) return;

    const events = (await getEvents()).slice().reverse(); // de enero en adelante
    const scores = await getEventScores();

    const index = lastRanking.findIndex(r => r.id === participantId);
    const position = index >= 0 ? index + 1 : null;
    const total = index >= 0 ? lastRanking[index].score : 0;
    const isLast = position === lastRanking.length && lastRanking.length > 1;

    // La comparación: si sos el último, el que tenés que alcanzar. Si no, el que paga.
    const refEntry = isLast ? lastRanking[lastRanking.length - 2] : lastRanking[lastRanking.length - 1];

    document.getElementById('playerName').textContent = me.name;
    document.getElementById('playerStanding').textContent =
        position ? `${position}º de ${lastRanking.length} · ${total > 0 ? '+' : ''}${total} puntos` : `${total} puntos`;

    const mine = runningTotal(participantId, events, scores, me.starting_points || 0);
    let refSeries = null;
    if (refEntry && refEntry.id !== participantId) {
        const refP = participants.find(p => p.id === refEntry.id);
        refSeries = runningTotal(refEntry.id, events, scores, refP?.starting_points || 0);
    }

    plotYear(document.getElementById('playerPlot'), mine, refSeries, refEntry?.name, hueByPlayer.get(participantId));

    const myHue = hueByPlayer.get(participantId) || 'var(--text)';
    document.getElementById('playerLegend').innerHTML = refEntry && refEntry.id !== participantId
        ? `<span class="key-you"><i style="background:${myHue}"></i>${me.name}</span><span class="key-ref"><i></i>${refEntry.name}${isLast ? '' : ' (paga)'}</span>`
        : `<span class="key-you"><i style="background:${myHue}"></i>${me.name}</span>`;

    // Las cuentas salen de las actas, no se escriben a mano.
    const myScores = scores.filter(s => s.participant_id === participantId);
    const went = myScores.filter(s => (s.score || 0) > 0).length;
    const penalties = myScores.filter(s => (s.score || 0) < 0);
    const penaltyPoints = penalties.reduce((sum, s) => sum + s.score, 0);
    const best = Math.max(0, ...mine.map(p => p.score || 0));

    let streak = 0, bestStreak = 0;
    mine.forEach(p => { streak = (p.score || 0) > 0 ? streak + 1 : 0; bestStreak = Math.max(bestStreak, streak); });

    document.getElementById('playerStats').innerHTML = `
        <div class="player-stat"><dt>Sumó en</dt><dd>${went}<small> de ${events.length}</small></dd></div>
        <div class="player-stat"><dt>Penalizaciones</dt><dd>${penalties.length}${penaltyPoints ? `<small> · ${penaltyPoints} pts</small>` : ''}</dd></div>
        <div class="player-stat"><dt>Mejor racha</dt><dd>${bestStreak}<small> seguidas</small></dd></div>
        <div class="player-stat"><dt>Mejor juntada</dt><dd>${best > 0 ? '+' : ''}${best}</dd></div>
    `;

    const verdict = document.getElementById('playerVerdict');
    const days = daysToClose();
    if (isLast) {
        const gap = refEntry ? refEntry.score - total : 0;
        verdict.classList.add('is-danger');
        verdict.innerHTML = gap > 0
            ? `Hoy <strong>${me.name} paga el asado</strong>. Le faltan ${plural(gap, 'punto', 'puntos')} para pasar a ${refEntry.name}, con ${plural(days, 'día', 'días')} por delante.`
            : `Hoy <strong>${me.name} paga el asado</strong>.`;
    } else if (refEntry) {
        const cushion = total - refEntry.score;
        verdict.classList.remove('is-danger');
        verdict.innerHTML = `<strong>${plural(cushion, 'punto', 'puntos')} de colchón</strong> sobre ${refEntry.name}, que hoy paga. Quedan ${plural(days, 'día', 'días')}.`;
    } else {
        verdict.classList.remove('is-danger');
        verdict.textContent = `Quedan ${plural(days, 'día', 'días')} para el cierre.`;
    }

    modal.classList.add('active');
    document.getElementById('btnClosePlayer').focus();
}

function hidePlayerModal() {
    document.getElementById('playerModal').classList.remove('active');
}

// ===================================
// Event Functions
// ===================================

async function renderEvents() {
    const container = document.getElementById('eventsList');
    const events = await getEvents();

    const countEl = document.getElementById('actasCount');
    if (countEl) countEl.textContent = plural(events.length, 'juntada', 'juntadas');

    if (events.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Sin juntadas registradas</p>
                <p class="empty-hint">El escribano carga la primera desde «Nueva juntada».</p>
            </div>
        `;
        return;
    }

    const participants = await getParticipants();
    const allScores = await getEventScores();

    const disabledAttr = !isLoggedIn ? 'disabled' : '';

    const eventsHTML = await Promise.all(events.map(async (event) => {
        const formattedDate = formatActaDate(event.date);

        // Get scores for this event
        const eventScores = allScores.filter(s => s.event_id === event.id);

        let participantScoresHTML = '';
        if (eventScores.length > 0) {
            const scoresHTML = eventScores
                .filter(es => es.score !== 0 || es.description)
                .map(es => {
                    const participant = participants.find(p => p.id === es.participant_id);
                    if (!participant) return '';

                    const scoreClass = es.score > 0 ? 'positive' : es.score < 0 ? 'negative' : 'zero';
                    return `
                        <div class="participant-score-item">
                            <div class="participant-score-header">
                                <span class="participant-score-name">${participant.name}</span>
                                <span class="participant-score-value ${scoreClass}">
                                    ${es.score > 0 ? '+' : ''}${es.score}
                                </span>
                            </div>
                            ${es.description ? `<div class="participant-score-description">${es.description}</div>` : ''}
                        </div>
                    `;
                }).join('');

            if (scoresHTML) {
                participantScoresHTML = `<div class="event-participants">${scoresHTML}</div>`;
            }
        }

        return `
            <div class="event-card" data-acta>
                <div class="event-header">
                    <div class="event-info">
                        <h3>${event.name}</h3>
                        <div class="event-meta">
                            <span>${formattedDate}</span>
                            <span>${plural(event.total_points_disputed || 0, 'punto', 'puntos')} en juego</span>
                        </div>
                    </div>
                    <div class="event-actions">
                        <button class="btn btn-small btn-primary" onclick="requestEditEvent('${event.id}')" ${disabledAttr}>
                            Editar
                        </button>
                        <button class="btn btn-small btn-danger" onclick="requestDeleteEvent('${event.id}')" ${disabledAttr}>
                            Eliminar
                        </button>
                    </div>
                </div>
                ${participantScoresHTML}
            </div>
        `;
    }));

    container.innerHTML = eventsHTML.join('');
    observeReveals(container);
}

// Reveals: una vez, cuando el elemento entra. Nunca se repiten.
const revealObserver = ('IntersectionObserver' in window)
    ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-in');
                revealObserver.unobserve(entry.target);
            }
        }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 })
    : null;

function observeReveals(root = document) {
    if (!revealObserver) {
        // sin IntersectionObserver no se esconde nada
        root.querySelectorAll('[data-reveal], [data-acta]').forEach(el => el.classList.add('is-in'));
        return;
    }
    root.querySelectorAll('[data-reveal]:not(.is-in), [data-acta]:not(.is-in)')
        .forEach(el => revealObserver.observe(el));
    sweepReveals();
}

// Red de seguridad: si alguien salta con la barra de scroll o con la tecla Fin,
// el observador no alcanza a disparar para lo que se salteó. Todo lo que ya
// quedó por encima del borde inferior se muestra sí o sí: nada queda en blanco.
let sweepQueued = false;
function sweepReveals() {
    const limit = window.innerHeight;
    document.querySelectorAll('[data-reveal]:not(.is-in), [data-acta]:not(.is-in)').forEach((el) => {
        if (el.getBoundingClientRect().top < limit) {
            el.classList.add('is-in');
            revealObserver?.unobserve(el);
        }
    });
}

// Rotar el telefono cambia de lienzo: se redibuja, con freno.
let resizeTimer = null;
let wasCompact = window.innerWidth < 700;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const nowCompact = window.innerWidth < 700;
        if (nowCompact !== wasCompact) { wasCompact = nowCompact; renderRace(); }
    }, 250);
});

window.addEventListener('scroll', () => {
    if (sweepQueued) return;
    sweepQueued = true;
    requestAnimationFrame(() => { sweepQueued = false; sweepReveals(); });
}, { passive: true });

// ===================================
// Stats Functions
// ===================================

async function updateStats() {
    const events = await getEvents();
    const participants = await getParticipants();

    const totalPoints = events.reduce((sum, event) =>
        sum + (event.total_points_disputed || 0), 0
    );

    document.getElementById('totalPointsDisputed').textContent = totalPoints;
    document.getElementById('totalEvents').textContent = events.length;

    const participantsEl = document.getElementById('totalParticipants');
    if (participantsEl) participantsEl.textContent = participants.length;

    const avgEl = document.getElementById('avgPoints');
    if (avgEl) avgEl.textContent = events.length ? (totalPoints / events.length).toFixed(1) : '—';

    const daysEl = document.getElementById('daysLeft');
    if (daysEl) daysEl.textContent = daysToClose();

    // getEvents() ya viene ordenado por fecha descendente
    const lastActaEl = document.getElementById('lastActa');
    const lastNameEl = document.getElementById('lastActaName');
    if (lastActaEl) {
        lastActaEl.textContent = events.length
            ? parseLocalDate(events[0].date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
            : '—';
    }
    if (lastNameEl) lastNameEl.textContent = events.length ? events[0].name : 'Sin juntadas todavía';

}

// ===================================
// Participant Functions
// ===================================

async function showAddParticipantModal() {
    if (!isLoggedIn) {
        alert('Debes iniciar sesión primero');
        return;
    }

    const modal = document.getElementById('addParticipantModal');
    document.getElementById('participantName').value = '';
    document.getElementById('startingPoints').value = '0';
    modal.classList.add('active');
    document.getElementById('participantName').focus();
}

function hideAddParticipantModal() {
    const modal = document.getElementById('addParticipantModal');
    modal.classList.remove('active');
}

async function saveParticipant() {
    const name = document.getElementById('participantName').value.trim();
    const startingPoints = parseInt(document.getElementById('startingPoints').value) || 0;

    if (!name) {
        alert('Por favor ingresa un nombre');
        return;
    }

    if (!isLoggedIn) {
        alert('Debes iniciar sesión para agregar participantes');
        return;
    }

    if (!supabase) {
        alert('Supabase no está configurado');
        return;
    }

    try {
        // Check for duplicates
        const { data: existing } = await supabase
            .from('participants')
            .select('id')
            .ilike('name', name)
            .single();

        if (existing) {
            alert('Ya existe un participante con ese nombre');
            return;
        }

        // Insert participant
        const { error } = await supabase
            .from('participants')
            .insert([{
                name: name,
                starting_points: startingPoints
            }]);

        if (error) throw error;

        hideAddParticipantModal();
        alert('Participante agregado correctamente');
        await loadAndRenderAll();

    } catch (error) {
        console.error('Error adding participant:', error);
        alert('Error al agregar participante: ' + error.message);
    }
}

// ===================================
// Event CRUD Functions
// ===================================

async function showAddEventModal() {
    if (!isLoggedIn) {
        alert('Debes iniciar sesión primero');
        return;
    }

    const participants = await getParticipants();

    if (participants.length === 0) {
        alert('Primero debes agregar participantes');
        return;
    }

    const modal = document.getElementById('addEventModal');

    // Reset form
    document.getElementById('eventName').value = '';
    document.getElementById('eventDate').value = todayLocalISO();
    document.getElementById('eventPoints').value = '1';

    // Populate participant scores
    const container = document.getElementById('participantScores');
    container.innerHTML = participants.map(p => `
        <div class="participant-score-form">
            <h4>${p.name}</h4>
            <div class="score-input-group">
                <div class="form-group mb-0">
                    <label for="score-${p.id}">Puntaje (-3 a +3)</label>
                    <input type="number" id="score-${p.id}" class="input-field" 
                           min="-3" max="3" value="0" step="1">
                </div>
                <div class="form-group mb-0">
                    <label for="desc-${p.id}">Descripción</label>
                    <textarea id="desc-${p.id}" class="input-field" 
                              placeholder="Opcional: razón del puntaje"></textarea>
                </div>
            </div>
        </div>
    `).join('');

    modal.classList.add('active');
    document.getElementById('eventName').focus();
}

function hideAddEventModal() {
    const modal = document.getElementById('addEventModal');
    modal.classList.remove('active');
}

async function saveEvent() {
    const name = document.getElementById('eventName').value.trim();
    const date = document.getElementById('eventDate').value;
    const totalPointsDisputed = parseInt(document.getElementById('eventPoints').value) || 0;

    if (!name) {
        alert('Por favor ingresa un nombre para la juntada');
        return;
    }

    if (!date) {
        alert('Por favor selecciona una fecha');
        return;
    }

    if (!isLoggedIn) {
        alert('Debes iniciar sesión para agregar eventos');
        return;
    }

    if (!supabase) {
        alert('Supabase no está configurado');
        return;
    }

    try {
        const participants = await getParticipants();

        // Create event first
        const { data: event, error: eventError } = await supabase
            .from('events')
            .insert([{
                name: name,
                date: date,
                total_points_disputed: totalPointsDisputed
            }])
            .select()
            .single();

        if (eventError) throw eventError;

        // Collect and insert participant scores
        const scores = [];
        for (const participant of participants) {
            const scoreInput = document.getElementById(`score-${participant.id}`);
            const descInput = document.getElementById(`desc-${participant.id}`);
            const score = parseInt(scoreInput.value) || 0;
            const description = descInput.value.trim();

            // Validate score range
            if (score < -3 || score > 3) {
                throw new Error(`El puntaje de ${participant.name} debe estar entre -3 y +3`);
            }

            // Only insert if score is not 0 or has description
            if (score !== 0 || description) {
                scores.push({
                    event_id: event.id,
                    participant_id: participant.id,
                    score: score,
                    description: description
                });
            }
        }

        if (scores.length > 0) {
            const { error: scoresError } = await supabase
                .from('event_scores')
                .insert(scores);

            if (scoresError) throw scoresError;
        }

        hideAddEventModal();
        alert('Juntada agregada correctamente');
        await loadAndRenderAll();

    } catch (error) {
        console.error('Error adding event:', error);
        alert('' + error.message);
    }
}

async function requestEditEvent(eventId) {
    if (!isLoggedIn) {
        alert('Debes iniciar sesión para editar eventos');
        return;
    }
    showEditEventModal(eventId);
}

async function showEditEventModal(eventId) {
    if (!supabase) {
        alert('Supabase no está configurado');
        return;
    }

    try {
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (eventError) throw eventError;
        if (!event) {
            alert('Evento no encontrado');
            return;
        }

        const modal = document.getElementById('editEventModal');

        // Populate form
        document.getElementById('editEventName').value = event.name;
        document.getElementById('editEventDate').value = event.date;
        document.getElementById('editEventPoints').value = event.total_points_disputed || 0;

        // Get existing scores
        const { data: eventScores } = await supabase
            .from('event_scores')
            .select('*')
            .eq('event_id', eventId);

        const scoresMap = {};
        if (eventScores) {
            eventScores.forEach(es => {
                scoresMap[es.participant_id] = es;
            });
        }

        // Populate participant scores
        const participants = await getParticipants();
        const container = document.getElementById('editParticipantScores');
        container.innerHTML = participants.map(p => {
            const scoreData = scoresMap[p.id] || { score: 0, description: '' };
            return `
                <div class="participant-score-form">
                    <h4>${p.name}</h4>
                    <div class="score-input-group">
                        <div class="form-group mb-0">
                            <label for="edit-score-${p.id}">Puntaje (-3 a +3)</label>
                            <input type="number" id="edit-score-${p.id}" class="input-field" 
                                   min="-3" max="3" value="${scoreData.score}" step="1">
                        </div>
                        <div class="form-group mb-0">
                            <label for="edit-desc-${p.id}">Descripción</label>
                            <textarea id="edit-desc-${p.id}" class="input-field" 
                                      placeholder="Opcional: razón del puntaje">${scoreData.description || ''}</textarea>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        modal.dataset.eventId = eventId;
        modal.classList.add('active');

    } catch (error) {
        console.error('Error showing edit modal:', error);
        alert('Error al abrir formulario: ' + error.message);
    }
}

function hideEditEventModal() {
    const modal = document.getElementById('editEventModal');
    modal.classList.remove('active');
    delete modal.dataset.eventId;
}

async function updateEvent() {
    const modal = document.getElementById('editEventModal');
    const eventId = modal.dataset.eventId;

    if (!eventId) {
        alert('Error: ID de evento no encontrado');
        return;
    }

    const name = document.getElementById('editEventName').value.trim();
    const date = document.getElementById('editEventDate').value;
    const totalPointsDisputed = parseInt(document.getElementById('editEventPoints').value) || 0;

    if (!name) {
        alert('Por favor ingresa un nombre para la juntada');
        return;
    }

    if (!date) {
        alert('Por favor selecciona una fecha');
        return;
    }

    if (!supabase) {
        alert('Supabase no está configurado');
        return;
    }

    try {
        // Update event
        const { error: eventError } = await supabase
            .from('events')
            .update({
                name: name,
                date: date,
                total_points_disputed: totalPointsDisputed
            })
            .eq('id', eventId);

        if (eventError) throw eventError;

        // Delete existing scores and insert new ones
        const { error: deleteError } = await supabase
            .from('event_scores')
            .delete()
            .eq('event_id', eventId);

        if (deleteError) throw deleteError;

        // Collect and insert new scores
        const participants = await getParticipants();
        const scores = [];

        for (const participant of participants) {
            const scoreInput = document.getElementById(`edit-score-${participant.id}`);
            const descInput = document.getElementById(`edit-desc-${participant.id}`);
            const score = parseInt(scoreInput.value) || 0;
            const description = descInput.value.trim();

            // Validate score range
            if (score < -3 || score > 3) {
                throw new Error(`El puntaje de ${participant.name} debe estar entre -3 y +3`);
            }

            if (score !== 0 || description) {
                scores.push({
                    event_id: eventId,
                    participant_id: participant.id,
                    score: score,
                    description: description
                });
            }
        }

        if (scores.length > 0) {
            const { error: scoresError } = await supabase
                .from('event_scores')
                .insert(scores);

            if (scoresError) throw scoresError;
        }

        hideEditEventModal();
        alert('Juntada actualizada correctamente');
        await loadAndRenderAll();

    } catch (error) {
        console.error('Error updating event:', error);
        alert('' + error.message);
    }
}

async function requestDeleteEvent(eventId) {
    if (!isLoggedIn) {
        alert('Debes iniciar sesión para eliminar eventos');
        return;
    }
    deleteEvent(eventId);
}

async function deleteEvent(eventId) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta juntada?')) {
        return;
    }

    if (!supabase) {
        alert('Supabase no está configurado');
        return;
    }

    try {
        // Delete event (scores will be deleted automatically due to CASCADE)
        const { error } = await supabase
            .from('events')
            .delete()
            .eq('id', eventId);

        if (error) throw error;

        alert('Juntada eliminada correctamente');
        await loadAndRenderAll();

    } catch (error) {
        console.error('Error deleting event:', error);
        alert('Error al eliminar evento: ' + error.message);
    }
}

// ===================================
// Reglamento Modal
// ===================================

function showReglamentoModal() {
    const modal = document.getElementById('reglamentoModal');
    modal.classList.add('active');
}

function hideReglamentoModal() {
    const modal = document.getElementById('reglamentoModal');
    modal.classList.remove('active');
}

// ===================================
// Excel Export Functions
// ===================================

async function exportToExcel() {
    if (!isLoggedIn) {
        alert('Debes iniciar sesión para exportar datos');
        return;
    }

    try {
        const participants = await getParticipants();
        const events = await getEvents();
        const allScores = await getEventScores();

        // Create workbook
        const wb = XLSX.utils.book_new();

        // ===== HOJA 1: Ranking =====
        const rankingData = await getRankingData();
        const rankingSheet = [];

        rankingSheet.push(['RANKING TABLA CAVANI 2026']);
        rankingSheet.push([]);
        rankingSheet.push(['Posición', 'Nombre', 'Puntaje Total']);

        rankingData.forEach((item, index) => {
            rankingSheet.push([
                `#${index + 1}`,
                item.name,
                item.score
            ]);
        });

        const wsRanking = XLSX.utils.aoa_to_sheet(rankingSheet);
        if (!wsRanking['!cols']) wsRanking['!cols'] = [];
        wsRanking['!cols'][0] = { wch: 12 };
        wsRanking['!cols'][1] = { wch: 25 };
        wsRanking['!cols'][2] = { wch: 15 };

        XLSX.utils.book_append_sheet(wb, wsRanking, 'Ranking');

        // ===== HOJA 2: Historial de Juntadas =====
        const eventsSheet = [];
        eventsSheet.push(['HISTORIAL DE JUNTADAS']);
        eventsSheet.push([]);

        if (events.length === 0) {
            eventsSheet.push(['No hay juntadas registradas']);
        } else {
            events.forEach((event, eventIndex) => {
                const formattedDate = new Date(event.date).toLocaleDateString('es-AR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                eventsSheet.push([`JUNTADA #${eventIndex + 1}: ${event.name}`]);
                eventsSheet.push(['Fecha:', formattedDate]);
                eventsSheet.push(['Puntos Disputados:', event.total_points_disputed || 0]);
                eventsSheet.push([]);
                eventsSheet.push(['Participante', 'Puntaje', 'Descripción']);

                const eventScores = allScores.filter(s => s.event_id === event.id);
                eventScores.forEach(es => {
                    const participant = participants.find(p => p.id === es.participant_id);
                    if (participant && (es.score !== 0 || es.description)) {
                        eventsSheet.push([
                            participant.name,
                            es.score > 0 ? `+${es.score}` : es.score,
                            es.description || '-'
                        ]);
                    }
                });

                eventsSheet.push([]);
                eventsSheet.push([]);
            });
        }

        const wsEvents = XLSX.utils.aoa_to_sheet(eventsSheet);
        if (!wsEvents['!cols']) wsEvents['!cols'] = [];
        wsEvents['!cols'][0] = { wch: 25 };
        wsEvents['!cols'][1] = { wch: 12 };
        wsEvents['!cols'][2] = { wch: 50 };

        XLSX.utils.book_append_sheet(wb, wsEvents, 'Historial Juntadas');

        // ===== HOJA 3: Resumen =====
        const summarySheet = [];
        summarySheet.push(['RESUMEN GENERAL TABLA CAVANI 2026']);
        summarySheet.push([]);
        summarySheet.push(['Total de Participantes:', participants.length]);
        summarySheet.push(['Total de Juntadas:', events.length]);

        const totalPoints = events.reduce((sum, event) =>
            sum + (event.total_points_disputed || 0), 0
        );
        summarySheet.push(['Total Puntos Disputados:', totalPoints]);
        summarySheet.push([]);
        summarySheet.push(['Fecha de Exportación:', new Date().toLocaleString('es-AR')]);
        summarySheet.push([]);
        summarySheet.push([]);
        summarySheet.push(['ESTADÍSTICAS POR PARTICIPANTE']);
        summarySheet.push([]);
        summarySheet.push(['Participante', 'Juntadas Jugadas', 'Puntaje Total', 'Promedio por Juntada']);

        for (const participant of participants) {
            const totalScore = await calculateParticipantScore(participant.id);
            const participantScores = allScores.filter(s => s.participant_id === participant.id && s.score !== 0);
            const eventsPlayed = participantScores.length;
            const average = eventsPlayed > 0 ? (totalScore / eventsPlayed).toFixed(2) : 0;

            summarySheet.push([
                participant.name,
                eventsPlayed,
                totalScore,
                average
            ]);
        }

        const wsSummary = XLSX.utils.aoa_to_sheet(summarySheet);
        if (!wsSummary['!cols']) wsSummary['!cols'] = [];
        wsSummary['!cols'][0] = { wch: 25 };
        wsSummary['!cols'][1] = { wch: 20 };
        wsSummary['!cols'][2] = { wch: 15 };
        wsSummary['!cols'][3] = { wch: 22 };

        XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

        // Generate filename
        const today = new Date().toISOString().split('T')[0];
        const filename = `TablaCavani_2026_${today}.xlsx`;

        XLSX.writeFile(wb, filename);

        alert('Excel exportado correctamente');

    } catch (error) {
        console.error('Error exporting Excel:', error);
        alert('Error al exportar Excel: ' + error.message);
    }
}

// ===================================
// Utility Functions
// ===================================

function showNotification(message) {
    setTimeout(() => {
        alert(message);
    }, 100);
}

// ===================================
// Event Listeners
// ===================================

function initializeEventListeners() {
    // Login button
    document.getElementById('btnLoginEscribano').addEventListener('click', handleLoginLogout);

    // Login modal
    document.getElementById('btnPasswordSubmit').addEventListener('click', handleLogin);
    document.getElementById('btnPasswordCancel').addEventListener('click', hideLoginModal);

    // PIN input - solo permitir números
    const pinInput = document.getElementById('pinInput');
    pinInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });
    pinInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });

    // Action buttons
    document.getElementById('btnAddParticipant').addEventListener('click', showAddParticipantModal);
    document.getElementById('btnAddEvent').addEventListener('click', showAddEventModal);
    document.getElementById('btnExportExcel').addEventListener('click', exportToExcel);
    document.getElementById('btnReglamento').addEventListener('click', showReglamentoModal);

    // Add participant modal
    document.getElementById('btnSaveParticipant').addEventListener('click', saveParticipant);
    document.getElementById('btnCancelParticipant').addEventListener('click', hideAddParticipantModal);

    // Add event modal
    document.getElementById('btnSaveEvent').addEventListener('click', saveEvent);
    document.getElementById('btnCancelEvent').addEventListener('click', hideAddEventModal);

    // Edit event modal
    document.getElementById('btnUpdateEvent').addEventListener('click', updateEvent);
    document.getElementById('btnCancelEditEvent').addEventListener('click', hideEditEventModal);

    // Panel del jugador
    document.getElementById('btnClosePlayer').addEventListener('click', hidePlayerModal);

    // Reglamento modal
    document.getElementById('btnCloseReglamento').addEventListener('click', hideReglamentoModal);
    document.getElementById('btnCloseReglamentoBtn').addEventListener('click', hideReglamentoModal);

    // Close modals on background click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });

    // ESC key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(modal => {
                modal.classList.remove('active');
            });
        }
    });
}

// Make functions globally available for onclick handlers
window.requestEditEvent = requestEditEvent;
window.requestDeleteEvent = requestDeleteEvent;
