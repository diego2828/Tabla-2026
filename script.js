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

// La temporada que se está mirando. Las fechas salen de la tabla elegida
// (applySeasonView); estas son las de la Tabla 2026 mientras carga.
let SEASON_START = new Date(2026, 0, 1);
let SEASON_CLOSE = new Date(2026, 11, 21);

// ===================================
// Las tablas
// ===================================

// Cada tabla es una temporada con su plantel y sus juntadas. La global no
// existe en la base: es la suma de todas.
const GLOBAL_ID = 'global';

// Mientras no se corra supabase-temporadas.sql la base no tiene tablas, y la
// única es la de siempre: todas las juntadas, todos los participantes.
const LEGACY_SEASON = { id: null, name: 'Tabla 2026', start_date: '2026-01-01', close_date: '2026-12-21' };

let seasons = [];            // de la más nueva a la más vieja
let currentSeasonId = null;  // el id de una tabla, o GLOBAL_ID
let seasonsReady = false;    // la base ya tiene tablas
let db = null;               // todo lo leído de la base en esta vuelta
let dbPromise = null;

const isGlobal = () => currentSeasonId === GLOBAL_ID;
const currentSeason = () => seasons.find(s => s.id === currentSeasonId) || null;
const seasonClosed = () => !isGlobal() && daysToClose() === 0;

function esc(text) {
    return String(text ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

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
    await loadAndRenderAll();
    updateLoginUI();
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

    if (isLoggedIn) {
        loginBtn.textContent = 'Salir';
        loginBtn.classList.add('logged-in');
        addParticipantBtn.disabled = false;
        addEventBtn.disabled = false;
    } else {
        loginBtn.textContent = 'Entrar';
        loginBtn.classList.remove('logged-in');
        addParticipantBtn.disabled = true;
        addEventBtn.disabled = true;
    }

    // Re-render events to update edit/delete button states
    renderSeasonBar();
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
    dbPromise = loadData();
    await dbPromise;
    await renderAll();
}

// Cambiar de tabla no vuelve a la base: lo leído alcanza para todas.
async function renderAll() {
    applySeasonView();
    renderSeasonBar();
    await renderRanking();
    await renderRace();
    await renderEvents();
    renderSeasonsSummary();
    await updateStats();
}

function ensureData() {
    if (!dbPromise) dbPromise = loadData();
    return dbPromise;
}

// PostgREST corta en 1000 filas por pedido: los puntajes de varios años
// pasan ese número, así que se piden de a páginas.
async function fetchAll(table, orderBy) {
    const PAGE = 1000;
    let rows = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .order(orderBy)
            .range(from, from + PAGE - 1);
        if (error) throw error;
        rows = rows.concat(data || []);
        if (!data || data.length < PAGE) return rows;
    }
}

async function loadData() {
    const empty = { participants: [], events: [], scores: [], roster: [] };
    if (!supabase) {
        console.error('Supabase not initialized');
        seasons = [LEGACY_SEASON];
        pickSeason();
        db = empty;
        return db;
    }

    let seasonRows = [];
    let roster = [];
    try {
        [seasonRows, roster] = await Promise.all([
            fetchAll('seasons', 'id'),
            fetchAll('season_participants', 'participant_id')
        ]);
        seasonsReady = seasonRows.length > 0;
    } catch (error) {
        // PGRST205: la tabla todavía no existe. Se muestra la tabla de siempre.
        console.warn('La base todavía no tiene tablas (falta supabase-temporadas.sql):', error.message);
        seasonsReady = false;
    }

    let participants, events, scores;
    try {
        [participants, events, scores] = await Promise.all([
            fetchAll('participants', 'id'),
            fetchAll('events', 'id'),
            fetchAll('event_scores', 'id')
        ]);
    } catch (error) {
        console.error('Error loading data:', error);
        db = empty;
        seasons = seasonsReady ? seasonRows : [LEGACY_SEASON];
        pickSeason();
        return db;
    }

    if (seasonsReady) {
        seasons = seasonRows.slice().sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
    } else {
        seasons = [LEGACY_SEASON];
        roster = participants.map(p => ({ season_id: null, participant_id: p.id, starting_points: p.starting_points || 0 }));
        events = events.map(e => ({ ...e, season_id: null }));
    }

    db = { participants, events, scores, roster };
    // el color de cada uno es el mismo en todas las tablas y en su avatar
    assignHues(participants);
    pickSeason();
    return db;
}

// La tabla a mirar: la del enlace (#global o #tabla-<id>), si no la que está
// en curso hoy, si no la más nueva.
function pickSeason() {
    const hash = decodeURIComponent(location.hash.slice(1));
    const fromHash = hash === GLOBAL_ID && seasons.length > 1
        ? GLOBAL_ID
        : seasons.find(s => hash === `tabla-${s.id}`)?.id;
    const keep = currentSeasonId === GLOBAL_ID ? (seasons.length > 1 ? GLOBAL_ID : null)
        : seasons.find(s => s.id === currentSeasonId)?.id;

    const today = todayLocalISO();
    const running = seasons.find(s => s.start_date <= today && today <= s.close_date);

    currentSeasonId = fromHash ?? keep ?? running?.id ?? seasons[0]?.id ?? null;
}

async function selectSeason(seasonId) {
    if (seasonId === currentSeasonId) return;
    currentSeasonId = seasonId;
    const hash = seasonId === GLOBAL_ID ? GLOBAL_ID : seasonsReady ? `tabla-${seasonId}` : '';
    history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
    // cada tabla se dibuja sola cuando llega, como la primera
    rankingDrawn = false;
    raceDrawn = false;
    await renderAll();
}

// Las juntadas de una tabla; en la global, todas.
function seasonEvents(seasonId) {
    const list = seasonId === GLOBAL_ID
        ? db.events
        : db.events.filter(e => (e.season_id ?? null) === seasonId);
    return list.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

// El plantel de una tabla, con los puntos iniciales de esa tabla. En la
// global, todo el que jugó alguna, con la suma de sus puntos iniciales.
function seasonParticipants(seasonId) {
    const rows = seasonId === GLOBAL_ID
        ? db.roster
        : db.roster.filter(r => (r.season_id ?? null) === seasonId);
    const start = new Map();
    rows.forEach(r => start.set(r.participant_id, (start.get(r.participant_id) || 0) + (r.starting_points || 0)));
    return db.participants
        .filter(p => start.has(p.id))
        .map(p => ({ ...p, starting_points: start.get(p.id) }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function seasonScores(seasonId) {
    const ids = new Set(seasonEvents(seasonId).map(e => e.id));
    return db.scores.filter(s => ids.has(s.event_id));
}

function seasonRanking(seasonId) {
    const scores = seasonScores(seasonId);
    return seasonParticipants(seasonId)
        .map(p => ({
            id: p.id,
            name: p.name,
            score: p.starting_points + scores
                .filter(s => s.participant_id === p.id)
                .reduce((sum, s) => sum + (s.score || 0), 0)
        }))
        .sort((a, b) => b.score - a.score);
}

async function getParticipants() {
    await ensureData();
    return seasonParticipants(currentSeasonId);
}

async function getEvents() {
    await ensureData();
    return seasonEvents(currentSeasonId);
}

async function getEventScores() {
    await ensureData();
    return seasonScores(currentSeasonId);
}

// ===================================
// Ranking Functions
// ===================================

async function calculateParticipantScore(participantId) {
    await ensureData();
    return seasonRanking(currentSeasonId).find(r => r.id === participantId)?.score ?? 0;
}

async function getRankingData() {
    await ensureData();
    return seasonRanking(currentSeasonId);
}

// ===================================
// La barra de tablas y la vista de cada una
// ===================================

function formatLongDate(iso) {
    return parseLocalDate(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderSeasonBar() {
    const tabs = document.getElementById('seasonTabs');
    if (!tabs) return;

    const items = seasons.map(s => ({ id: s.id, name: s.name }));
    if (seasons.length > 1) items.push({ id: GLOBAL_ID, name: 'Global' });

    tabs.innerHTML = items.map(item => `
        <button type="button" class="season-tab${item.id === GLOBAL_ID ? ' is-global' : ''}"
                data-season-id="${item.id ?? ''}"
                aria-pressed="${item.id === currentSeasonId}">${esc(item.name)}</button>
    `).join('');

    tabs.querySelectorAll('.season-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.seasonId;
            selectSeason(id === '' ? null : id);
        });
    });

    const importBtn = document.getElementById('btnImportSeason');
    if (importBtn) importBtn.hidden = !isLoggedIn || !seasonsReady;
    const addBtn = document.getElementById('btnAddSeason');
    const editBtn = document.getElementById('btnEditSeason');
    const note = document.getElementById('seasonNote');
    if (addBtn) addBtn.hidden = !isLoggedIn || !seasonsReady;
    if (editBtn) editBtn.hidden = !isLoggedIn || !seasonsReady || isGlobal();
    if (note) note.hidden = !isLoggedIn || seasonsReady;
}

// Títulos, fechas y qué bloques tienen sentido en la tabla elegida.
function applySeasonView() {
    const global = isGlobal();
    const season = currentSeason();

    if (global) {
        const starts = seasons.map(s => s.start_date).sort();
        const closes = seasons.map(s => s.close_date).sort();
        SEASON_START = parseLocalDate(starts[0]);
        SEASON_CLOSE = parseLocalDate(closes[closes.length - 1]);
    } else if (season) {
        SEASON_START = parseLocalDate(season.start_date);
        SEASON_CLOSE = parseLocalDate(season.close_date);
    }

    const title = global ? 'Tabla global' : (season?.name || 'Tabla');
    const closed = seasonClosed();

    document.title = `${title} · Tabla Cavani y el taburete`;
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set('pageTitle', title);
    set('scopeLabel', global ? 'Todas las tablas' : title);
    set('stakeHeading', closed ? 'Pagó el asado' : 'Paga el asado');
    set('closeLabel', closed ? 'Cierre' : 'Para el cierre');
    set('rankingHeading', global ? 'La tabla de todos los años' : 'La tabla');

    if (season) {
        set('closeMeta', closed ? `Terminó el ${formatLongDate(season.close_date)}` : `Hasta el ${formatLongDate(season.close_date)}`);
        set('footerDates', `${formatLongDate(season.start_date)} – ${formatLongDate(season.close_date)} · Viva el escribano`);
        set('scaleStart', parseLocalDate(season.start_date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }));
        set('scaleEnd', parseLocalDate(season.close_date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }));
    } else if (global) {
        set('footerDates', `${plural(seasons.length, 'tabla', 'tablas')} · Viva el escribano`);
    }

    document.body.classList.toggle('is-global', global);
    // la global no se escribe: es una suma
    ['stakeSection', 'raceSection', 'actasSection', 'btnAddParticipant', 'btnAddEvent'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.hidden = global;
    });
    const summary = document.getElementById('seasonsSection');
    if (summary) summary.hidden = !global;
}

// En la global: cada tabla en una fila, con su campeón y quién pagó.
function renderSeasonsSummary() {
    const el = document.getElementById('seasonsList');
    if (!el || !isGlobal()) return;

    const today = todayLocalISO();
    el.innerHTML = seasons.map(s => {
        const ranking = seasonRanking(s.id);
        const count = seasonEvents(s.id).length;
        const first = ranking[0];
        const last = ranking.length > 1 ? ranking[ranking.length - 1] : null;
        const fmt = (n) => `${n > 0 ? '+' : ''}${n}`;
        const done = s.close_date < today;
        return `
            <button type="button" class="season-row" data-season-id="${s.id ?? ''}">
                <span class="season-row-name">
                    <strong>${esc(s.name)}</strong>
                    <small>${plural(count, 'juntada', 'juntadas')} · ${done ? 'terminada' : 'en juego'}</small>
                </span>
                <span class="season-row-cell is-gold">
                    <small>${done ? 'Campeón' : 'Va primero'}</small>
                    ${first ? `<span class="season-row-who">${avatar(first.id, 'xs')}${esc(first.name)} <b>${fmt(first.score)}</b></span>` : '—'}
                </span>
                <span class="season-row-cell is-ember">
                    <small>${done ? 'Pagó el asado' : 'Paga el asado'}</small>
                    ${last ? `<span class="season-row-who">${avatar(last.id, 'xs')}${esc(last.name)} <b>${fmt(last.score)}</b></span>` : '—'}
                </span>
            </button>
        `;
    }).join('');

    el.querySelectorAll('.season-row').forEach(row => {
        row.addEventListener('click', () => {
            const id = row.dataset.seasonId;
            selectSeason(id === '' ? null : id);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

// ===================================
// Crear, editar y borrar una tabla
// ===================================

function showSeasonModal(mode) {
    if (!isLoggedIn || !seasonsReady) return;
    const modal = document.getElementById('seasonModal');
    const season = mode === 'edit' ? currentSeason() : null;
    if (mode === 'edit' && !season) return;

    const year = new Date().getFullYear() + (mode === 'create' ? 1 : 0);
    document.getElementById('seasonTitle').textContent = season ? 'Editar tabla' : 'Nueva tabla';
    document.getElementById('seasonName').value = season ? season.name : `Tabla ${year}`;
    document.getElementById('seasonStart').value = season ? season.start_date : `${year}-01-01`;
    document.getElementById('seasonClose').value = season ? season.close_date : `${year}-12-21`;
    document.getElementById('seasonCopyRow').hidden = !!season;
    document.getElementById('seasonCopy').checked = true;
    document.getElementById('btnDeleteSeason').hidden = !season;

    modal.dataset.mode = mode;
    modal.classList.add('active');
    document.getElementById('seasonName').focus();
}

function hideSeasonModal() {
    document.getElementById('seasonModal').classList.remove('active');
}

async function saveSeason() {
    const modal = document.getElementById('seasonModal');
    const editing = modal.dataset.mode === 'edit';
    const name = document.getElementById('seasonName').value.trim();
    const start = document.getElementById('seasonStart').value;
    const close = document.getElementById('seasonClose').value;

    if (!name) { alert('Ponele un nombre a la tabla'); return; }
    if (!start || !close) { alert('Faltan las fechas de inicio y de cierre'); return; }
    if (close < start) { alert('El cierre no puede ser antes del inicio'); return; }
    if (seasons.some(s => s.name.toLowerCase() === name.toLowerCase() && (!editing || s.id !== currentSeasonId))) {
        alert('Ya hay una tabla con ese nombre');
        return;
    }
    if (!isLoggedIn) { alert('Debes iniciar sesión primero'); return; }

    try {
        if (editing) {
            const { error } = await supabase
                .from('seasons')
                .update({ name, start_date: start, close_date: close })
                .eq('id', currentSeasonId);
            if (error) throw error;
        } else {
            // el plantel se copia de la tabla que se estaba mirando (o de la más nueva)
            const source = isGlobal() ? seasons[0]?.id : currentSeasonId;
            const copy = document.getElementById('seasonCopy').checked;

            const { data: season, error } = await supabase
                .from('seasons')
                .insert([{ name, start_date: start, close_date: close }])
                .select()
                .single();
            if (error) throw error;

            if (copy && source) {
                const rows = seasonParticipants(source).map(p => ({
                    season_id: season.id,
                    participant_id: p.id,
                    starting_points: 0
                }));
                if (rows.length) {
                    const { error: rosterError } = await supabase.from('season_participants').insert(rows);
                    if (rosterError) throw rosterError;
                }
            }
            currentSeasonId = season.id;
            history.replaceState(null, '', `#tabla-${season.id}`);
        }

        hideSeasonModal();
        rankingDrawn = false;
        raceDrawn = false;
        await loadAndRenderAll();
    } catch (error) {
        console.error('Error saving season:', error);
        alert('No se pudo guardar la tabla: ' + error.message);
    }
}

async function deleteSeason() {
    const season = currentSeason();
    if (!season || !isLoggedIn) return;

    const count = seasonEvents(season.id).length;
    if (count > 0) {
        alert(`${season.name} tiene ${plural(count, 'juntada', 'juntadas')}. Borralas primero para poder eliminar la tabla.`);
        return;
    }
    if (!confirm(`¿Eliminar ${season.name}? Se borra la tabla y su plantel; las personas siguen en las otras tablas.`)) return;

    try {
        const { error } = await supabase.from('seasons').delete().eq('id', season.id);
        if (error) throw error;
        hideSeasonModal();
        currentSeasonId = null;
        history.replaceState(null, '', location.pathname + location.search);
        await loadAndRenderAll();
    } catch (error) {
        console.error('Error deleting season:', error);
        alert('No se pudo eliminar la tabla: ' + error.message);
    }
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
        // en la global nadie paga: es una suma, no una temporada
        const isLast = index === lastIndex && rankingData.length > 1 && !isGlobal();
        const bar = leader > 0 ? Math.max(0, Math.min(100, (item.score / leader) * 100)) : 0;
        const tag = isLast
            ? `<span class="ranking-tag">${seasonClosed() ? 'Pagó el asado' : 'Paga el asado'}</span>`
            : position === 1 && rankingData.length > 1
                ? '<span class="ranking-tag is-gold">Campeón</span>'
                : '';

        return `
            <button type="button" class="ranking-item ${positionClass}${isLast ? ' is-last' : ''}"
                    style="--bar: ${bar.toFixed(1)}%; --i: ${index}"
                    data-player-id="${item.id}"
                    aria-label="${isGlobal() ? item.name : `Ver el año de ${item.name}`}"${isGlobal() ? ' tabindex="-1"' : ''}>
                <div class="ranking-position">${position}</div>
                <div class="ranking-name">${avatar(item.id, position === 1 ? 'md' : 'sm')}<span class="ranking-name-text">${item.name}</span>${tag}</div>
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

    container.classList.toggle('is-static', isGlobal());
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
    const faceEl = document.getElementById('stakeAvatar');
    if (!nameEl || !metaEl) return;
    if (faceEl) faceEl.innerHTML = '';

    const days = daysToClose();
    const closed = seasonClosed();
    const left = closed
        ? 'La temporada está cerrada.'
        : `Quedan ${plural(days, 'día', 'días')} para el cierre.`;

    // La global responde otra pregunta: quién suma más en todos los años.
    if (isGlobal()) {
        const names = seasons.slice().reverse().map(s => s.name).join(', ');
        if (findingEl) {
            findingEl.textContent = rankingData.length
                ? `Suma de ${plural(seasons.length, 'tabla', 'tablas')} (${names}). ${rankingData[0].name} lidera con ${rankingData[0].score > 0 ? '+' : ''}${rankingData[0].score}.`
                : `Suma de ${plural(seasons.length, 'tabla', 'tablas')}.`;
        }
        if (noteEl) noteEl.textContent = plural(rankingData.length, 'participante', 'participantes');
        return;
    }

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
    if (faceEl) faceEl.innerHTML = avatar(last.id, 'lg');

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
            findingEl.textContent = `${last.name} ${closed ? 'terminó' : 'va'} último con ${score}, ${position}. ${left}`;
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

// ===================================
// Las caras: una foto por persona
// ===================================

const PHOTO_BUCKET = 'fotos';
// 800px: se ve nítida también abierta en grande, y pesa ~100 KB.
const PHOTO_SIZE = 800;

// La columna photo_url existe recién después de supabase-fotos.sql.
const photosReady = () => !!db?.participants.length && 'photo_url' in db.participants[0];

const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase() || '?';

// Su foto, o su inicial en su color mientras no tenga. La inicial queda
// debajo: si la foto no carga, se ve la inicial en vez de un hueco.
function avatar(participantId, size = 'sm', fallbackName = '') {
    const p = db?.participants.find(x => x.id === participantId);
    const name = p?.name || fallbackName;
    const hue = hueByPlayer.get(participantId) || 'var(--faint)';
    const photo = p?.photo_url
        ? `<img src="${esc(p.photo_url)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
        : '';
    // con foto, la cara se toca y se abre en grande (ver openPhoto)
    const zoom = p?.photo_url ? ` has-photo" data-photo-id="${p.id}` : '';
    return `<span class="avatar avatar-${size}${zoom}" style="--hue:${hue}" aria-hidden="true"><span>${esc(initials(name))}</span>${photo}</span>`;
}

// La foto en grande, encima de todo, sin salir de la página.
function openPhoto(participantId) {
    const p = db?.participants.find(x => x.id === participantId);
    if (!p?.photo_url) return;
    const modal = document.getElementById('photoModal');
    const img = document.getElementById('photoModalImg');
    img.src = p.photo_url;
    img.alt = `Foto de ${p.name}`;
    document.getElementById('photoModalName').textContent = p.name;
    modal.classList.add('active');
    document.getElementById('btnClosePhoto').focus();
}

function hidePhotoModal() {
    document.getElementById('photoModal').classList.remove('active');
}

// Recorta al centro y achica a 800px: una foto de teléfono de 4 MB queda en ~100 KB.
async function squarePhoto(file) {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error('No se pudo leer la imagen. Probá con una JPG o PNG.'));
            im.src = url;
        });
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = PHOTO_SIZE;
        canvas.getContext('2d').drawImage(
            img,
            (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
            0, 0, PHOTO_SIZE, PHOTO_SIZE
        );
        return await new Promise((resolve, reject) =>
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo preparar la foto.')), 'image/jpeg', 0.86));
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function uploadPhoto(participantId, file) {
    if (!isLoggedIn || !participantId || !file) return;
    if (!photosReady()) {
        alert('Para subir fotos falta correr supabase-fotos.sql en Supabase.');
        return;
    }
    const btn = document.getElementById('playerPhotoLabel');
    btn.textContent = 'Subiendo…';
    try {
        const blob = await squarePhoto(file);
        const path = `${participantId}.jpg`;
        const { error } = await supabase.storage.from(PHOTO_BUCKET)
            .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
        if (error) throw error;

        // la ?v= obliga a los navegadores a bajar la nueva y no mostrar la vieja guardada
        const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
        const { error: rowError } = await supabase
            .from('participants')
            .update({ photo_url: `${data.publicUrl}?v=${Date.now()}` })
            .eq('id', participantId);
        if (rowError) throw rowError;

        await loadAndRenderAll();
        await showPlayerModal(participantId);
    } catch (error) {
        console.error('Error uploading photo:', error);
        alert('No se pudo subir la foto: ' + error.message);
    } finally {
        btn.textContent = 'Cambiar foto';
    }
}

async function removePhoto(participantId) {
    const p = db?.participants.find(x => x.id === participantId);
    if (!isLoggedIn || !p?.photo_url) return;
    if (!confirm(`¿Quitar la foto de ${p.name}?`)) return;
    try {
        const { error } = await supabase
            .from('participants')
            .update({ photo_url: null })
            .eq('id', participantId);
        if (error) throw error;
        await supabase.storage.from(PHOTO_BUCKET).remove([`${participantId}.jpg`]);
        await loadAndRenderAll();
        await showPlayerModal(participantId);
    } catch (error) {
        console.error('Error removing photo:', error);
        alert('No se pudo quitar la foto: ' + error.message);
    }
}

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

async function renderRace() {
    const el = document.getElementById('racePlot');
    if (!el) return;

    const participants = await getParticipants();
    const events = (await getEvents()).slice().reverse(); // de enero en adelante
    const scores = await getEventScores();

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
    // Una tabla terminada corta en su última juntada; una en juego, en hoy.
    const now = new Date();
    const lastDate = parseLocalDate(events[events.length - 1].date);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const axisEnd = seasonClosed() ? lastDate : new Date(Math.min(Math.max(lastDate, today), Math.max(SEASON_CLOSE, lastDate)));
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

    // un mes sí y uno no (de a cuatro en el teléfono), desde el inicio de la tabla
    const monthTicks = [];
    for (let d = new Date(SEASON_START.getFullYear(), SEASON_START.getMonth(), 1); d <= axisEnd; d = new Date(d.getFullYear(), d.getMonth() + (compact ? 4 : 2), 1)) {
        if (d >= SEASON_START) monthTicks.push(new Date(d));
    }
    const months = monthTicks.map(d =>
        `<text class="race-axis" x="${x(d).toFixed(1)}" y="${H - 8}" text-anchor="middle">${MONTH_NAMES[d.getMonth()]}</text>`
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
            ${compact
                ? `<line class="race-dash" x1="${lx + 5}" y1="${ly.toFixed(1)}" x2="${lx + 12}" y2="${ly.toFixed(1)}" stroke="${s.hue}"/>`
                : raceFace(s.id, s.name, s.hue, lx + 14, ly)}
            <text class="race-label" x="${lx + (compact ? 17 : 26)}" y="${(ly + 4).toFixed(1)}">${s.name}</text>
            ${compact ? '' : `<text class="race-label-score" x="${W}" y="${(ly + 4).toFixed(1)}" text-anchor="end">${total > 0 ? '+' : ''}${total}</text>`}
        </g>`;
    }).join('');

    el.classList.toggle('is-compact', compact);
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img"
        aria-label="Puntaje acumulado de los ${series.length} participantes en ${esc(currentSeason()?.name || 'la tabla')}">
        ${grid}${months}${rug}${groups}
    </svg>`;

    if (!raceDrawn) {
        raceDrawn = true;
        el.classList.add('is-fresh');
        setTimeout(() => el.classList.remove('is-fresh'), 2600);
    }

    wireRaceFocus(el);
}

// La cara al final de cada línea: un aro de su color con la foto adentro
// (o la inicial). Mide 16px, lo mismo que la separación mínima entre nombres.
function raceFace(id, name, hue, cx, cy) {
    const photo = db?.participants.find(p => p.id === id)?.photo_url;
    const clip = `race-face-${id}`;
    const y = cy.toFixed(1);
    return `<g class="race-face">
        <circle cx="${cx}" cy="${y}" r="8" fill="${hue}"/>
        ${photo
            ? `<clipPath id="${clip}"><circle cx="${cx}" cy="${y}" r="6.5"/></clipPath>
               <image href="${esc(photo)}" x="${cx - 6.5}" y="${(cy - 6.5).toFixed(1)}" width="13" height="13" clip-path="url(#${clip})" preserveAspectRatio="xMidYMid slice"/>`
            : `<circle cx="${cx}" cy="${y}" r="6.5" class="race-face-ground"/>
               <text class="race-face-initial" x="${cx}" y="${(cy + 3).toFixed(1)}" text-anchor="middle" fill="${hue}">${esc(initials(name))}</text>`}
    </g>`;
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
        <path class="plot-line-you" d="${path(you)}" pathLength="1" style="--len:1${youHue ? `;stroke:${youHue}` : ''}"/>
    </svg>`;
}

async function showPlayerModal(participantId) {
    // la global no tiene un año que mostrar
    if (!participantId || isGlobal()) return;

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
    document.getElementById('playerAvatar').innerHTML = avatar(participantId, 'xl');
    // la cara grande del panel también se abre con el teclado
    const face = document.getElementById('playerAvatar');
    const hasPhoto = !!db.participants.find(p => p.id === participantId)?.photo_url;
    face.tabIndex = hasPhoto ? 0 : -1;
    face.setAttribute('role', hasPhoto ? 'button' : 'presentation');
    face.setAttribute('aria-label', hasPhoto ? `Ver la foto de ${me.name} en grande` : '');
    modal.dataset.playerId = participantId;
    const photoActions = document.getElementById('playerPhotoActions');
    photoActions.hidden = !isLoggedIn || !photosReady();
    document.getElementById('btnRemovePhoto').hidden = !db.participants.find(p => p.id === participantId)?.photo_url;
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
    if (seasonClosed()) {
        verdict.classList.toggle('is-danger', isLast);
        verdict.innerHTML = isLast
            ? `<strong>${me.name} pagó el asado</strong>.`
            : refEntry
                ? `Terminó <strong>${plural(total - refEntry.score, 'punto', 'puntos')} arriba</strong> de ${refEntry.name}, que pagó.`
                : 'La temporada está cerrada.';
    } else if (isLast) {
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
            // Todos los participantes, siempre en el mismo orden: cada uno cae
            // en la misma celda de la grilla en todas las juntadas.
            const scoresHTML = participants
                .map(participant => {
                    const es = eventScores.find(s => s.participant_id === participant.id);
                    if (!es) return '';

                    const scoreClass = es.score > 0 ? 'positive' : es.score < 0 ? 'negative' : 'zero';
                    return `
                        <div class="participant-score-item ${scoreClass}">
                            <div class="participant-score-header">
                                <span class="participant-score-name">${avatar(participant.id, 'xs')}${participant.name}</span>
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

    // terminada, la celda muestra el día que cerró en vez de un cero
    const daysEl = document.getElementById('daysLeft');
    const unitEl = document.getElementById('daysUnit');
    if (daysEl) {
        daysEl.textContent = seasonClosed()
            ? SEASON_CLOSE.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
            : daysToClose();
    }
    if (unitEl) unitEl.hidden = seasonClosed();

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
    if (isGlobal()) return;

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

    if (!seasonsReady) {
        await saveParticipantLegacy(name, startingPoints);
        return;
    }

    // Las personas son las mismas en todas las tablas: si ya jugó otra, se la
    // suma a esta; así la global le junta los puntos de todos los años.
    await ensureData();
    const seasonId = currentSeasonId;
    const existing = db.participants.find(p => p.name.toLowerCase() === name.toLowerCase());
    const inSeason = existing && db.roster.some(r => r.season_id === seasonId && r.participant_id === existing.id);
    const seasonName = currentSeason()?.name || 'esta tabla';

    try {
        if (inSeason) {
            if (!confirm(`${existing.name} ya está en ${seasonName}. ¿Cambiar sus puntos iniciales a ${startingPoints}?`)) return;
            const { error } = await supabase
                .from('season_participants')
                .update({ starting_points: startingPoints })
                .eq('season_id', seasonId)
                .eq('participant_id', existing.id);
            if (error) throw error;
        } else {
            let participantId = existing?.id;
            if (!participantId) {
                const { data: created, error } = await supabase
                    .from('participants')
                    .insert([{ name: name, starting_points: 0 }])
                    .select()
                    .single();
                if (error) throw error;
                participantId = created.id;
            }
            const { error: rosterError } = await supabase
                .from('season_participants')
                .insert([{ season_id: seasonId, participant_id: participantId, starting_points: startingPoints }]);
            if (rosterError) throw rosterError;
        }

        hideAddParticipantModal();
        alert(inSeason ? 'Puntos iniciales actualizados' : `${existing?.name || name} entra en ${seasonName}`);
        await loadAndRenderAll();

    } catch (error) {
        console.error('Error adding participant:', error);
        alert('Error al agregar participante: ' + error.message);
    }
}

// Antes de supabase-temporadas.sql: el alta de siempre.
async function saveParticipantLegacy(name, startingPoints) {
    try {
        // Check for duplicates
        const { data: existing } = await supabase
            .from('participants')
            .select('id')
            .ilike('name', name)
            .maybeSingle();

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

    if (isGlobal()) return;

    const participants = await getParticipants();

    if (participants.length === 0) {
        alert('Primero debes agregar participantes a esta tabla');
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
            <h4>${avatar(p.id, 'xs')}${p.name}</h4>
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

        // Create event first, en la tabla que se está mirando
        const row = { name: name, date: date, total_points_disputed: totalPointsDisputed };
        if (seasonsReady) row.season_id = currentSeasonId;

        const { data: event, error: eventError } = await supabase
            .from('events')
            .insert([row])
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
                    <h4>${avatar(p.id, 'xs')}${p.name}</h4>
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
// Importar una tabla desde Excel
// ===================================

// Lee el mismo formato que baja «Exportar» (la grilla de la hoja Juntadas,
// con Puntos iniciales, Total y la hoja Comentarios), o una hoja de solo
// totales (Nombre | Total) para los años que no tienen el detalle. Nada se
// escribe hasta que el escribano ve la vista previa y confirma.

let importState = null; // { fileName, parsed, plan }

const norm = (text) => String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

// Una fecha de Excel puede llegar como número de serie, como texto 18/01/2026
// o como 2026-01-18. Devuelve 'YYYY-MM-DD' o null.
function importDate(value) {
    const pad = (n) => String(n).padStart(2, '0'); // taste-skill-ignore: formato de fecha ISO
    if (typeof value === 'number' && value > 0) {
        const d = XLSX.SSF.parse_date_code(value);
        return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : null;
    }
    if (value instanceof Date && !isNaN(value)) {
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    const text = String(value ?? '').trim();
    let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return validYMD(+m[1], +m[2], +m[3]);
    m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    if (m) return validYMD(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    return null;

    function validYMD(y, mo, d) {
        const date = new Date(y, mo - 1, d);
        return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d
            ? `${y}-${pad(mo)}-${pad(d)}` : null;
    }
}

// Un puntaje: vacío es 0; "+1", "-2", 3 valen; lo demás no.
function importScore(value) {
    if (isBlank(value)) return 0;
    const n = typeof value === 'number' ? value : Number(String(value).trim().replace(/^\+/, '').replace('−', '-'));
    return Number.isInteger(n) ? n : NaN;
}

const sheetRows = (ws) => XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });

function findHeader(rows, test) {
    for (let i = 0; i < Math.min(rows.length, 12); i++) {
        if (test(rows[i].map(norm))) return i;
    }
    return -1;
}

function parseImportWorkbook(wb, fileName) {
    const out = {
        mode: null, people: [], events: [], starting: {}, totals: null,
        comments: [], errors: [], warnings: [], suggestedName: '', isGlobalExport: false
    };

    // el nombre: el título de la hoja Tabla de un export, si no el del archivo
    const tableSheet = wb.Sheets[wb.SheetNames.find(n => norm(n) === 'tabla')];
    const title = tableSheet ? String(sheetRows(tableSheet)[0]?.[0] ?? '').trim() : '';
    out.suggestedName = title && norm(title) !== 'tabla global'
        ? title
        : fileName.replace(/\.[^.]+$/, '').replace(/^TablaCavani_/i, '').replace(/_\d{4}-\d{2}-\d{2}$/, '').replace(/_/g, ' ').trim();

    const ordered = [
        ...wb.SheetNames.filter(n => norm(n) === 'juntadas'),
        ...wb.SheetNames.filter(n => norm(n) !== 'juntadas')
    ];

    // 1. ¿Hay una grilla de juntadas con algo cargado? Una vacía (la de la
    //    planilla modelo sin tocar) se saltea, por si lo cargado son los totales.
    for (const name of ordered) {
        const rows = sheetRows(wb.Sheets[name]);
        const h = findHeader(rows, r => r.includes('fecha') && r.includes('juntada'));
        if (h < 0) continue;
        const trial = { ...out, people: [], events: [], starting: {}, totals: null, errors: [], warnings: [] };
        parseGrid(rows, h, trial);
        const empty = !trial.events.length && Object.values(trial.starting).every(n => !n);
        if (empty) continue;
        Object.assign(out, trial, { mode: 'grid' });
        break;
    }

    // 2. Si no, una hoja de totales
    if (!out.mode) {
        for (const name of ordered) {
            const rows = sheetRows(wb.Sheets[name]);
            const h = findHeader(rows, r => r.includes('nombre') && (r.includes('total') || r.includes('puntos') || r.includes('puntaje')));
            if (h >= 0) { parseTotals(rows, h, out); out.mode = 'totals'; break; }
        }
    }

    if (!out.mode) {
        out.errors.push('No encontré una hoja con columnas «Fecha» y «Juntada», ni una con «Nombre» y «Total». Bajá la planilla modelo para ver el formato.');
        return out;
    }

    // 3. Comentarios: van pegados al puntaje de su juntada
    if (out.mode === 'grid') {
        const notesName = wb.SheetNames.find(n => norm(n) === 'comentarios');
        if (notesName) parseComments(sheetRows(wb.Sheets[notesName]), out);
    }
    return out;
}

function parseGrid(rows, h, out) {
    const head = rows[h].map(c => String(c ?? '').trim());
    const key = head.map(norm);
    const col = (...names) => key.findIndex(k => names.includes(k));
    const cDate = col('fecha');
    const cName = col('juntada');
    const cPoints = col('en juego', 'puntos en juego', 'puntos disputados');
    const cTable = col('tabla');
    if (cTable >= 0) out.isGlobalExport = true;

    const known = new Set([cDate, cName, cPoints, cTable].filter(i => i >= 0));
    const people = [];
    head.forEach((label, i) => {
        if (known.has(i) || !label) return;
        people.push({ col: i, name: label });
    });

    const seen = new Set();
    for (let i = people.length - 1; i >= 0; i--) {
        // la segunda columna con el mismo nombre no se lee: pisaría a la primera
        if (people.slice(0, i).some(p => norm(p.name) === norm(people[i].name))) {
            if (!seen.has(norm(people[i].name))) out.errors.push(`«${people[i].name}» aparece dos veces como columna.`);
            seen.add(norm(people[i].name));
            people.splice(i, 1);
        }
    }
    out.people = people.map(p => p.name);
    if (!people.length) out.errors.push('La grilla no tiene columnas de participantes.');

    for (let r = h + 1; r < rows.length; r++) {
        const row = rows[r];
        const first = norm(row[cDate]) || norm(row[0]);
        if (row.every(isBlank)) continue;
        const excelRow = r + 1;

        if (first === 'puntos iniciales' || first === 'total') {
            const target = first === 'total' ? (out.totals = {}) : out.starting;
            people.forEach(p => {
                const n = importScore(row[p.col]);
                if (Number.isNaN(n)) out.errors.push(`Fila ${excelRow} (${row[cDate] || row[0]}), ${p.name}: «${row[p.col]}» no es un número entero.`);
                else target[p.name] = n;
            });
            continue;
        }

        const date = importDate(row[cDate]);
        const name = String(row[cName] ?? '').trim();
        if (!date) out.errors.push(`Fila ${excelRow}: la fecha «${row[cDate]}» no se entiende. Usá 18/01/2026.`);
        if (!name) out.errors.push(`Fila ${excelRow}: falta el nombre de la juntada.`);

        const points = cPoints >= 0 ? importScore(row[cPoints]) : 0;
        if (Number.isNaN(points) || points < 0) out.errors.push(`Fila ${excelRow}: «${row[cPoints]}» no vale como puntos en juego.`);

        const scores = {};
        people.forEach(p => {
            const n = importScore(row[p.col]);
            if (Number.isNaN(n)) out.errors.push(`Fila ${excelRow}, ${p.name}: «${row[p.col]}» no es un puntaje.`);
            else if (n < -3 || n > 3) out.errors.push(`Fila ${excelRow}, ${p.name}: ${n} está fuera de −3 a +3.`);
            else scores[p.name] = n;
        });

        out.events.push({ row: excelRow, date, name, points: Number.isNaN(points) ? 0 : points, scores, notes: {} });
    }

    if (!out.events.length && Object.values(out.starting).every(n => !n)) {
        out.errors.push('La grilla no tiene juntadas ni puntos cargados.');
    }
}

function parseTotals(rows, h, out) {
    const key = rows[h].map(norm);
    const cName = key.indexOf('nombre');
    const cTotal = ['total', 'puntos', 'puntaje'].map(k => key.indexOf(k)).find(i => i >= 0);
    const seen = new Set();

    for (let r = h + 1; r < rows.length; r++) {
        const row = rows[r];
        if (row.every(isBlank)) continue;
        const name = String(row[cName] ?? '').trim();
        // sin total no jugó ese año; un 0 escrito sí cuenta
        if (!name || isBlank(row[cTotal])) continue;
        const n = importScore(row[cTotal]);
        if (Number.isNaN(n)) { out.errors.push(`Fila ${r + 1}, ${name}: «${row[cTotal]}» no es un número entero.`); continue; }
        if (seen.has(norm(name))) { out.errors.push(`«${name}» aparece dos veces.`); continue; }
        seen.add(norm(name));
        out.people.push(name);
        out.starting[name] = n;
    }
    if (!out.people.length) out.errors.push('La hoja de totales no tiene a nadie cargado.');
    else if (Object.values(out.starting).every(n => !n)) out.errors.push('Todos los totales están vacíos o en cero.');
}

function parseComments(rows, out) {
    const h = findHeader(rows, r => r.includes('fecha') && r.includes('participante') && r.includes('comentario'));
    if (h < 0) return;
    const key = rows[h].map(norm);
    const [cDate, cName, cWho, cText] = ['fecha', 'juntada', 'participante', 'comentario'].map(k => key.indexOf(k));
    const byName = new Map(out.people.map(n => [norm(n), n]));
    let lost = 0;

    for (let r = h + 1; r < rows.length; r++) {
        const row = rows[r];
        const text = String(row[cText] ?? '').trim();
        if (!text || norm(row[cDate]) === 'sin comentarios') continue;
        const date = importDate(row[cDate]);
        const ev = out.events.find(e => e.date === date && norm(e.name) === norm(row[cName]));
        const who = byName.get(norm(row[cWho]));
        if (!ev || !who) { lost++; continue; }
        ev.notes[who] = text;
    }
    if (lost) out.warnings.push(`${plural(lost, 'comentario no coincide', 'comentarios no coinciden')} con ninguna juntada o persona de la grilla y no se va a cargar.`);
}

// Junta lo leído con el nombre y las fechas elegidas: qué se va a crear y qué no cierra.
function planImport(parsed, meta) {
    const errors = [...parsed.errors];
    const warnings = [...parsed.warnings];

    if (parsed.isGlobalExport) {
        errors.push('Este Excel es de la tabla global (tiene la columna «Tabla»). Importá el de una sola tabla.');
    }
    if (!meta.name) errors.push('Ponele un nombre a la tabla.');
    else if (seasons.some(s => norm(s.name) === norm(meta.name))) errors.push(`Ya existe una tabla llamada «${meta.name}». Cambiá el nombre.`);
    if (!meta.start || !meta.close) errors.push('Faltan las fechas de inicio y de cierre.');
    else if (meta.close < meta.start) errors.push('El cierre no puede ser antes del inicio.');

    const existing = new Map(db.participants.map(p => [norm(p.name), p]));
    const people = parsed.people.map(name => ({
        name: existing.get(norm(name))?.name || name,
        fileName: name,
        existing: existing.get(norm(name)) || null,
        start: parsed.starting[name] || 0
    }));

    // fechas fuera de la temporada y juntadas repetidas
    if (meta.start && meta.close) {
        const outside = parsed.events.filter(e => e.date && (e.date < meta.start || e.date > meta.close));
        if (outside.length) {
            warnings.push(`${plural(outside.length, 'juntada cae', 'juntadas caen')} fuera de las fechas de la tabla (por ejemplo la fila ${outside[0].row}).`);
        }
    }
    const keys = new Map();
    parsed.events.forEach(e => {
        const k = `${e.date}|${norm(e.name)}`;
        if (keys.has(k)) warnings.push(`Las filas ${keys.get(k)} y ${e.row} son la misma juntada (misma fecha y nombre).`);
        else keys.set(k, e.row);
    });

    // el total del archivo contra lo que suman las juntadas
    const totals = people.map(p => ({
        ...p,
        total: p.start + parsed.events.reduce((sum, e) => sum + (e.scores[p.fileName] || 0), 0)
    })).sort((a, b) => b.total - a.total);

    if (parsed.totals) {
        totals.forEach(p => {
            const said = parsed.totals[p.fileName];
            if (said !== undefined && said !== p.total) {
                warnings.push(`El total de ${p.name} en el archivo dice ${said}, pero las juntadas suman ${p.total}. Se carga lo que suman las juntadas.`);
            }
        });
    }

    const scoreRows = parsed.events.reduce((n, e) =>
        n + people.filter(p => (e.scores[p.fileName] || 0) !== 0 || e.notes[p.fileName]).length, 0);
    const notes = parsed.events.reduce((n, e) => n + Object.keys(e.notes).length, 0);

    return { errors, warnings, people, totals, scoreRows, notes, events: parsed.events, meta };
}

// ----- la ventana -----

function showImportModal() {
    if (!isLoggedIn || !seasonsReady) return;
    if (typeof XLSX === 'undefined') {
        alert('No se pudo cargar la librería de Excel. Probá recargar la página.');
        return;
    }
    importState = null;
    document.getElementById('importFile').value = '';
    document.getElementById('importFileLabel').textContent = 'Elegir archivo';
    document.getElementById('importFileName').textContent = '';
    document.getElementById('importName').value = '';
    document.getElementById('importStart').value = '';
    document.getElementById('importClose').value = '';
    document.getElementById('importPreview').innerHTML = '';
    document.getElementById('importMeta').hidden = true;
    document.getElementById('btnConfirmImport').disabled = true;
    document.getElementById('importModal').classList.add('active');
}

function hideImportModal() {
    document.getElementById('importModal').classList.remove('active');
    importState = null;
}

async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = document.getElementById('importPreview');
    preview.innerHTML = '<p class="import-empty">Leyendo el archivo…</p>';
    document.getElementById('importFileLabel').textContent = 'Cambiar archivo';
    document.getElementById('importFileName').textContent = file.name;

    try {
        await ensureData();
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const parsed = parseImportWorkbook(wb, file.name);
        importState = { fileName: file.name, parsed };

        // sugerir nombre y fechas: el año de la primera y la última juntada
        const dates = parsed.events.map(ev => ev.date).filter(Boolean).sort();
        const yearFromName = (parsed.suggestedName.match(/(19|20)\d{2}/) || [])[0];
        const y1 = dates[0]?.slice(0, 4) || yearFromName || String(new Date().getFullYear());
        const y2 = dates[dates.length - 1]?.slice(0, 4) || y1;
        document.getElementById('importName').value = parsed.suggestedName || `Tabla ${y1}`;
        document.getElementById('importStart').value = `${y1}-01-01`;
        document.getElementById('importClose').value = `${y2}-12-21`;
        document.getElementById('importMeta').hidden = false;

        renderImportPreview();
    } catch (error) {
        console.error('Error reading import file:', error);
        importState = null;
        preview.innerHTML = `<p class="import-issue is-error">No se pudo leer el archivo: ${esc(error.message)}</p>`;
        document.getElementById('btnConfirmImport').disabled = true;
    }
}

function renderImportPreview() {
    if (!importState) return;
    const meta = {
        name: document.getElementById('importName').value.trim(),
        start: document.getElementById('importStart').value,
        close: document.getElementById('importClose').value
    };
    const plan = planImport(importState.parsed, meta);
    importState.plan = plan;

    const fresh = plan.people.filter(p => !p.existing);
    const fmt = (n) => `${n > 0 ? '+' : ''}${n}`;
    const issues = [
        ...plan.errors.map(t => `<li class="import-issue is-error">${esc(t)}</li>`),
        ...plan.warnings.map(t => `<li class="import-issue is-warn">${esc(t)}</li>`)
    ].join('');

    const ranking = plan.totals.map((p, i) => `
        <li class="import-rank${i === 0 ? ' is-first' : ''}${i === plan.totals.length - 1 && plan.totals.length > 1 ? ' is-last' : ''}">
            <span class="import-rank-pos">${i + 1}</span>
            <span class="import-rank-name">${avatar(p.existing?.id, 'xs', p.name)}${esc(p.name)}${p.existing ? '' : ' <em>nuevo</em>'}</span>
            <span class="import-rank-score">${fmt(p.total)}</span>
        </li>`).join('');

    const sample = plan.events.slice(0, 6);
    const grid = sample.length ? `
        <div class="import-grid-wrap">
            <table class="import-grid">
                <thead><tr><th>Fecha</th><th>Juntada</th>${plan.people.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr></thead>
                <tbody>${sample.map(e => `<tr>
                    <td>${e.date ? parseLocalDate(e.date).toLocaleDateString('es-AR') : '—'}</td>
                    <td>${esc(e.name)}</td>
                    ${plan.people.map(p => {
                        const n = e.scores[p.fileName] || 0;
                        return `<td class="${n < 0 ? 'is-neg' : n === 0 ? 'is-zero' : ''}"${e.notes[p.fileName] ? ` title="${esc(e.notes[p.fileName])}"` : ''}>${fmt(n)}${e.notes[p.fileName] ? '*' : ''}</td>`;
                    }).join('')}
                </tr>`).join('')}</tbody>
            </table>
        </div>
        ${plan.events.length > sample.length ? `<p class="import-more">y ${plural(plan.events.length - sample.length, 'juntada más', 'juntadas más')}. * tiene comentario.</p>` : ''}` : '';

    document.getElementById('importPreview').innerHTML = `
        <dl class="import-summary">
            <div><dt>Juntadas</dt><dd>${plan.events.length}</dd></div>
            <div><dt>Participantes</dt><dd>${plan.people.length}<small>${fresh.length ? ` · ${fresh.length} ${fresh.length === 1 ? 'nuevo' : 'nuevos'}` : ''}</small></dd></div>
            <div><dt>Puntajes</dt><dd>${plan.scoreRows}</dd></div>
            <div><dt>Comentarios</dt><dd>${plan.notes}</dd></div>
        </dl>
        ${issues ? `<ul class="import-issues">${issues}</ul>` : '<p class="import-ok">Todo cierra. Revisá la tabla y cargala.</p>'}
        ${fresh.length ? `<p class="import-note">Se van a crear: ${fresh.map(p => esc(p.name)).join(', ')}. El resto se reconoce por nombre y suma a su historial en la global.</p>` : ''}
        <h4 class="import-heading">Así queda la tabla</h4>
        <ol class="import-ranking">${ranking}</ol>
        ${grid ? `<h4 class="import-heading">Primeras juntadas</h4>${grid}` : ''}
    `;

    document.getElementById('btnConfirmImport').disabled = plan.errors.length > 0;
}

// Supabase no da transacciones desde el navegador: si algo falla a mitad de
// camino, se borra lo que se alcanzó a crear para no dejar una tabla a medias.
async function confirmImport() {
    const plan = importState?.plan;
    if (!plan || plan.errors.length || !isLoggedIn) return;

    const btn = document.getElementById('btnConfirmImport');
    btn.disabled = true;
    btn.textContent = 'Cargando…';

    const seasonId = crypto.randomUUID();
    const created = { season: false, participants: [] };

    try {
        const { error: seasonError } = await supabase.from('seasons').insert([{
            id: seasonId, name: plan.meta.name, start_date: plan.meta.start, close_date: plan.meta.close
        }]);
        if (seasonError) throw seasonError;
        created.season = true;

        const ids = new Map();
        const fresh = plan.people.filter(p => !p.existing).map(p => ({ id: crypto.randomUUID(), name: p.name, starting_points: 0 }));
        if (fresh.length) {
            const { error } = await supabase.from('participants').insert(fresh);
            if (error) throw error;
            created.participants = fresh.map(p => p.id);
        }
        plan.people.forEach(p => ids.set(p.fileName, p.existing?.id || fresh.find(f => f.name === p.name).id));

        const { error: rosterError } = await supabase.from('season_participants').insert(
            plan.people.map(p => ({ season_id: seasonId, participant_id: ids.get(p.fileName), starting_points: p.start }))
        );
        if (rosterError) throw rosterError;

        const events = plan.events.map(e => ({ ...e, id: crypto.randomUUID() }));
        for (let i = 0; i < events.length; i += 200) {
            const { error } = await supabase.from('events').insert(events.slice(i, i + 200).map(e => ({
                id: e.id, season_id: seasonId, name: e.name, date: e.date, total_points_disputed: e.points
            })));
            if (error) throw error;
        }

        // como al cargar a mano: solo los que sumaron, restaron o tienen comentario
        const scores = [];
        events.forEach(e => plan.people.forEach(p => {
            const score = e.scores[p.fileName] || 0;
            const description = e.notes[p.fileName] || '';
            if (score !== 0 || description) {
                scores.push({ event_id: e.id, participant_id: ids.get(p.fileName), score, description });
            }
        }));
        for (let i = 0; i < scores.length; i += 500) {
            const { error } = await supabase.from('event_scores').insert(scores.slice(i, i + 500));
            if (error) throw error;
        }

        hideImportModal();
        currentSeasonId = seasonId;
        history.replaceState(null, '', `#tabla-${seasonId}`);
        rankingDrawn = false;
        raceDrawn = false;
        await loadAndRenderAll();
        alert(`${plan.meta.name} cargada: ${plural(events.length, 'juntada', 'juntadas')}, ${plural(plan.people.length, 'participante', 'participantes')}.`);

    } catch (error) {
        console.error('Error importing season:', error);
        // deshacer: las juntadas y los puntajes caen con la tabla (borrado en cascada)
        if (created.season) {
            await supabase.from('events').delete().eq('season_id', seasonId);
            await supabase.from('seasons').delete().eq('id', seasonId);
        }
        if (created.participants.length) {
            await supabase.from('participants').delete().in('id', created.participants);
        }
        alert('No se pudo cargar la tabla y no quedó nada a medias: ' + error.message);
    } finally {
        btn.textContent = 'Cargar tabla';
        if (importState?.plan) btn.disabled = importState.plan.errors.length > 0;
    }
}

// Una planilla vacía con la forma que el importador entiende, con los
// nombres que ya existen para no tener que tipearlos.
function downloadImportTemplate() {
    if (typeof XLSX === 'undefined') {
        alert('No se pudo cargar la librería de Excel. Probá recargar la página.');
        return;
    }
    const names = (db?.participants || []).map(p => p.name).sort((a, b) => a.localeCompare(b));
    const wb = XLSX.utils.book_new();

    const grid = XLSX.utils.aoa_to_sheet([
        ['Fecha', 'Juntada', 'En juego', ...names],
        [],
        ['Puntos iniciales', '', '', ...names.map(() => 0)]
    ]);
    grid['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 9 }, ...names.map(n => ({ wch: Math.max(8, n.length + 2) }))];
    XLSX.utils.book_append_sheet(wb, grid, 'Juntadas');

    const notes = XLSX.utils.aoa_to_sheet([['Fecha', 'Juntada', 'Participante', 'Puntaje', 'Comentario']]);
    notes['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 9 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, notes, 'Comentarios');

    const totals = XLSX.utils.aoa_to_sheet([
        ['Si de ese año solo tenés el total de cada uno, completá esta hoja y dejá vacía la de Juntadas.'],
        [],
        ['Nombre', 'Total'],
        ...names.map(n => [n, ''])
    ]);
    totals['!cols'] = [{ wch: 20 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, totals, 'Solo totales');

    XLSX.writeFile(wb, 'TablaCavani_planilla_modelo.xlsx');
}

// ===================================
// Excel Export Functions
// ===================================

// Exportar no escribe nada: lo puede hacer cualquiera, de la tabla que esté
// mirando (o de la global). Los números salen de lo mismo que dibuja la web.
async function exportToExcel() {
    if (typeof XLSX === 'undefined') {
        alert('No se pudo cargar la librería de Excel. Probá recargar la página.');
        return;
    }

    try {
        await ensureData();
        const global = isGlobal();
        const title = global ? 'Tabla global' : (currentSeason()?.name || 'Tabla');
        const ranking = seasonRanking(currentSeasonId);
        const participants = ranking.map(r => db.participants.find(p => p.id === r.id)).filter(Boolean);
        const events = seasonEvents(currentSeasonId).slice().reverse(); // de la primera a la última
        const scores = seasonScores(currentSeasonId);
        const startById = new Map(seasonParticipants(currentSeasonId).map(p => [p.id, p.starting_points]));
        const seasonById = new Map(seasons.map(s => [s.id ?? null, s]));

        const scoreOf = new Map(scores.map(s => [`${s.event_id}|${s.participant_id}`, s]));
        const cell = (eventId, participantId) => scoreOf.get(`${eventId}|${participantId}`)?.score ?? 0;

        const wb = XLSX.utils.book_new();
        const widths = (ws, cols) => { ws['!cols'] = cols.map(wch => ({ wch })); };

        // ===== Hoja 1: la tabla =====
        // En la global, una columna por año para ver de dónde sale cada total.
        const yearList = global ? seasons.slice().reverse() : [];
        const tableHead = global
            ? ['Puesto', 'Nombre', ...yearList.map(s => s.name), 'Total']
            : ['Puesto', 'Nombre', 'Puntos iniciales', 'Puntos en juntadas', 'Total'];
        const tableRows = ranking.map((r, i) => {
            if (global) {
                const perYear = yearList.map(s => seasonRanking(s.id).find(x => x.id === r.id)?.score ?? '');
                return [i + 1, r.name, ...perYear, r.score];
            }
            const start = startById.get(r.id) || 0;
            return [i + 1, r.name, start, r.score - start, r.score];
        });
        const wsTable = XLSX.utils.aoa_to_sheet([[title], [], tableHead, ...tableRows]);
        widths(wsTable, [8, 18, ...tableHead.slice(2).map(h => Math.max(12, h.length + 2))]);
        XLSX.utils.book_append_sheet(wb, wsTable, 'Tabla');

        // ===== Hoja 2: juntadas, una fila cada una y una columna por persona =====
        const gridHead = [
            'Fecha', 'Juntada', ...(global ? ['Tabla'] : []), 'En juego',
            ...participants.map(p => p.name)
        ];
        const lead = global ? 4 : 3;
        const gridRows = events.map(ev => [
            parseLocalDate(ev.date),
            ev.name,
            ...(global ? [seasonById.get(ev.season_id ?? null)?.name || ''] : []),
            ev.total_points_disputed || 0,
            ...participants.map(p => cell(ev.id, p.id))
        ]);
        const pad = Array(lead - 1).fill('');
        const startRow = ['Puntos iniciales', ...pad, ...participants.map(p => startById.get(p.id) || 0)];
        const totalRow = ['Total', ...pad, ...participants.map(p => ranking.find(r => r.id === p.id)?.score ?? 0)];

        const wsGrid = XLSX.utils.aoa_to_sheet(
            [gridHead, ...gridRows, [], startRow, totalRow],
            { cellDates: true, dateNF: 'dd/mm/yyyy' }
        );
        if (gridRows.length) {
            wsGrid['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: gridRows.length, c: gridHead.length - 1 } }) };
        }
        widths(wsGrid, [12, 34, ...(global ? [14] : []), 9, ...participants.map(p => Math.max(8, p.name.length + 2))]);
        XLSX.utils.book_append_sheet(wb, wsGrid, 'Juntadas');

        // ===== Hoja 3: comentarios, en lista para filtrar =====
        const notes = [];
        events.forEach(ev => {
            participants.forEach(p => {
                const row = scoreOf.get(`${ev.id}|${p.id}`);
                if (row?.description) {
                    notes.push([parseLocalDate(ev.date), ev.name, p.name, row.score, row.description]);
                }
            });
        });
        const notesHead = ['Fecha', 'Juntada', 'Participante', 'Puntaje', 'Comentario'];
        const wsNotes = XLSX.utils.aoa_to_sheet(
            notes.length ? [notesHead, ...notes] : [notesHead, ['Sin comentarios']],
            { cellDates: true, dateNF: 'dd/mm/yyyy' }
        );
        if (notes.length) {
            wsNotes['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: notes.length, c: 4 } }) };
        }
        widths(wsNotes, [12, 34, 16, 9, 50]);
        XLSX.utils.book_append_sheet(wb, wsNotes, 'Comentarios');

        // ===== Hoja 4: resumen =====
        // Las mismas cuentas que el panel de cada jugador.
        const totalPoints = events.reduce((sum, ev) => sum + (ev.total_points_disputed || 0), 0);
        const summary = [
            [`Resumen · ${title}`],
            [],
            ['Período', global
                ? `${formatLongDate(seasons[seasons.length - 1].start_date)} – ${formatLongDate(seasons[0].close_date)}`
                : `${formatLongDate(currentSeason().start_date)} – ${formatLongDate(currentSeason().close_date)}`],
            ['Juntadas', events.length],
            ['Puntos disputados', totalPoints],
            ['Participantes', participants.length],
            ['Exportado', new Date().toLocaleString('es-AR')],
            [],
            ['Participante', 'Total', 'Sumó en', 'Penalizaciones', 'Puntos perdidos', 'Mejor juntada']
        ];
        participants.forEach(p => {
            const mine = scores.filter(s => s.participant_id === p.id);
            const penalties = mine.filter(s => (s.score || 0) < 0);
            summary.push([
                p.name,
                ranking.find(r => r.id === p.id)?.score ?? 0,
                mine.filter(s => (s.score || 0) > 0).length,
                penalties.length,
                penalties.reduce((sum, s) => sum + s.score, 0),
                Math.max(0, ...mine.map(s => s.score || 0))
            ]);
        });
        const wsSummary = XLSX.utils.aoa_to_sheet(summary);
        widths(wsSummary, [20, 30, 10, 15, 16, 14]);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

        const slug = title.replace(/[^\w-]+/g, '_');
        XLSX.writeFile(wb, `TablaCavani_${slug}_${todayLocalISO()}.xlsx`);

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
    document.getElementById('playerPhotoInput').addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        uploadPhoto(document.getElementById('playerModal').dataset.playerId, file);
    });
    document.getElementById('btnRemovePhoto').addEventListener('click', () =>
        removePhoto(document.getElementById('playerModal').dataset.playerId));

    // Tablas
    document.getElementById('btnAddSeason').addEventListener('click', () => showSeasonModal('create'));
    document.getElementById('btnEditSeason').addEventListener('click', () => showSeasonModal('edit'));
    document.getElementById('btnSaveSeason').addEventListener('click', saveSeason);
    document.getElementById('btnCancelSeason').addEventListener('click', hideSeasonModal);
    document.getElementById('btnDeleteSeason').addEventListener('click', deleteSeason);

    // Importar una tabla
    document.getElementById('btnImportSeason').addEventListener('click', showImportModal);
    document.getElementById('btnCancelImport').addEventListener('click', hideImportModal);
    document.getElementById('btnConfirmImport').addEventListener('click', confirmImport);
    document.getElementById('btnImportTemplate').addEventListener('click', downloadImportTemplate);
    document.getElementById('importFile').addEventListener('change', handleImportFile);
    ['importName', 'importStart', 'importClose'].forEach(id =>
        document.getElementById(id).addEventListener('input', renderImportPreview));

    // Volver atrás con el navegador entre tablas
    window.addEventListener('hashchange', () => {
        const before = currentSeasonId;
        currentSeasonId = null;
        pickSeason();
        if (currentSeasonId !== before) {
            rankingDrawn = false;
            raceDrawn = false;
            renderAll();
        }
    });

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

    // Tocar una cara con foto la abre en grande. Va en captura y corta el
    // clic: dentro de una fila de la tabla, la cara abre la foto y el resto
    // de la fila sigue abriendo el panel.
    document.addEventListener('click', (e) => {
        const face = e.target.closest('.avatar.has-photo');
        if (!face) return;
        e.preventDefault();
        e.stopPropagation();
        openPhoto(face.dataset.photoId);
    }, true);
    document.getElementById('playerAvatar').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const face = e.currentTarget.querySelector('.avatar.has-photo');
        if (face) { e.preventDefault(); openPhoto(face.dataset.photoId); }
    });
    document.getElementById('btnClosePhoto').addEventListener('click', hidePhotoModal);
    document.getElementById('photoModalImg').addEventListener('click', hidePhotoModal);

    // ESC cierra solo la ventana de arriba: cerrar la foto deja abierto el panel
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const open = [...document.querySelectorAll('.modal.active')];
            open[open.length - 1]?.classList.remove('active');
        }
    });
}

// Make functions globally available for onclick handlers
window.requestEditEvent = requestEditEvent;
window.requestDeleteEvent = requestDeleteEvent;
