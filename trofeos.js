// ===================================
// LA SALA DE TROFEOS
// ===================================

// Cada tabla entrega sus trofeos: la copa al campeón, plata y bronce, las
// distinciones del año y las que nadie quiere. Salen solos de las actas,
// con seasonFacts (pronostico.js). Una tabla en juego muestra los suyos
// "si terminara hoy"; se entregan de verdad cuando cierra.
//
// Empates: el trofeo se lo llevan todos los empatados.

const TROPHIES = {
    champion: { name: 'Copa de campeón', short: 'Campeón' },
    silver:   { name: 'Medalla de plata', short: 'Segundo', color: '#c9ccd1', glyph: 'two' },
    bronze:   { name: 'Medalla de bronce', short: 'Tercero', color: '#c8814a', glyph: 'three' },
    present:  { name: 'El que nunca falta', short: 'Nunca falta', color: 'var(--s3)', glyph: 'check' },
    party:    { name: 'El fiestero', short: 'Fiestero', color: 'var(--s5)', glyph: 'note' },
    streak:   { name: 'La racha', short: 'Racha', color: 'var(--s4)', glyph: 'flame' },
    clean:    { name: 'Año sin multas', short: 'Sin multas', color: 'var(--s1)', glyph: 'shield' },
    comeback: { name: 'La remontada', short: 'Remontada', color: 'var(--s7)', glyph: 'arrow' },
    grill:    { name: 'La parrilla', short: 'Pagó el asado', color: 'var(--ember)', glyph: 'grill', anti: true },
    fined:    { name: 'El multado', short: 'Multado', color: 'var(--negative)', glyph: 'card', anti: true },
    ghost:    { name: 'El fantasma', short: 'Fantasma', color: '#8a847d', glyph: 'ghost', anti: true }
};

// El orden en que se muestran: la copa, el podio, lo bueno, lo que nadie quiere.
const TROPHY_ORDER = Object.keys(TROPHIES);

const seasonYear = (s) => String(s.close_date || s.start_date || '').slice(0, 4);
const seasonDone = (s) => s.close_date < todayLocalISO();

function trophiesAvailable() {
    return !!db && seasons.some(s => seasonEvents(s.id).length > 0);
}

// Los trofeos de una tabla: [{ kind, winners: [id], detail }]
function seasonTrophies(season) {
    const F = seasonFacts(season.id);
    if (!F.N || F.n < 2) return [];

    const out = [];
    // todos los que comparten el mejor valor, si el valor alcanza
    const best = (value, min = 1) => {
        const top = Math.max(...F.stats.map(value));
        return top >= min ? { top, who: F.stats.filter(s => value(s) === top) } : null;
    };
    const add = (kind, who, detail) => out.push({ kind, winners: who.map(s => s.p.id), detail });

    // el podio por puesto: dos empatados arriba son dos campeones y no hay plata
    const byPos = (pos) => F.stats.filter((_, i) => F.finalPos[i] === pos);
    const scoreOf = (s) => F.totals[F.stats.indexOf(s)];
    [['champion', 1], ['silver', 2], ['bronze', 3]].forEach(([kind, pos]) => {
        const who = byPos(pos);
        if (who.length) add(kind, who, `${signed(scoreOf(who[0]))} puntos`);
    });

    const present = best(s => s.went);
    if (present) add('present', present.who, `Sumó en ${present.top} de ${F.N}`);

    const party = best(s => s.full);
    if (party) add('party', party.who, `${plural(party.top, 'vez', 'veces')} asado y boliche`);

    const streak = best(s => s.best, 5);
    if (streak) add('streak', streak.who, `${streak.top} juntadas seguidas`);

    const clean = F.stats.filter(s => s.fineCount === 0);
    if (clean.length && clean.length < F.n) add('clean', clean, 'Cero penalizaciones');

    const climbs = F.stats.map((s, i) => ({ s, gain: F.worst[i] - F.finalPos[i], from: F.worst[i], to: F.finalPos[i] }));
    const climb = Math.max(...climbs.map(c => c.gain));
    if (climb >= 3) {
        const who = climbs.filter(c => c.gain === climb);
        add('comeback', who.map(c => c.s), `De ${who[0].from}º a ${who[0].to}º`);
    }

    const lastPos = Math.max(...F.finalPos);
    const last = F.stats.filter((_, i) => F.finalPos[i] === lastPos);
    if (lastPos > 1) add('grill', last, `${signed(scoreOf(last[0]))} puntos`);

    const fined = best(s => -s.fines);
    if (fined) add('fined', fined.who, `${plural(fined.top, 'punto', 'puntos')} de multa`);

    const ghost = best(s => s.ghost, 3);
    if (ghost) add('ghost', ghost.who, `${plural(ghost.top, 'faltazo', 'faltazos')}`);

    return out;
}

// ===================================
// Los dibujos: la copa y las medallas
// ===================================

// La copa: oro plano en dos tonos, sobre una base de madera con la chapa del año.
function cupSVG(year, { pending = false } = {}) {
    return `<svg class="cup${pending ? ' is-pending' : ''}" viewBox="0 0 120 150" role="img" aria-label="Copa de campeón ${esc(year)}">
        <g class="cup-sparks" aria-hidden="true">
            <path d="M14 22 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/>
            <path d="M104 12 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5z"/>
            <path d="M108 60 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5z"/>
        </g>
        <path class="cup-handle" d="M30 32 C6 32 6 72 40 76"/>
        <path class="cup-handle" d="M90 32 C114 32 114 72 80 76"/>
        <path class="cup-gold" d="M24 20 H96 V40 C96 70 80 88 60 88 C40 88 24 70 24 40 Z"/>
        <path class="cup-shade" d="M60 20 H96 V40 C96 70 80 88 60 88 Z"/>
        <rect class="cup-rim" x="20" y="14" width="80" height="10" rx="3"/>
        <path class="cup-star" d="M60 36 l4.2 8.6 9.4 1.4 -6.8 6.6 1.6 9.4 -8.4 -4.4 -8.4 4.4 1.6 -9.4 -6.8 -6.6 9.4 -1.4z"/>
        <rect class="cup-shade" x="54" y="86" width="12" height="18"/>
        <ellipse class="cup-gold" cx="60" cy="98" rx="11" ry="4"/>
        <rect class="cup-gold" x="36" y="104" width="48" height="10" rx="2"/>
        <rect class="cup-plinth" x="26" y="114" width="68" height="26" rx="3"/>
        <rect class="cup-plaque" x="38" y="120" width="44" height="14" rx="2"/>
        <text class="cup-year" x="60" y="130.5" text-anchor="middle">${esc(year)}</text>
    </svg>`;
}

const GLYPHS = {
    two: '<text class="medal-num" x="32" y="62" text-anchor="middle">2</text>',
    three: '<text class="medal-num" x="32" y="62" text-anchor="middle">3</text>',
    check: '<path class="medal-line" d="M23 56 L29.5 62.5 L41 49"/>',
    note: '<circle class="medal-fill" cx="27.5" cy="62" r="4.5"/><path class="medal-line" d="M31.5 62 V46 L40 49.5"/>',
    flame: '<path class="medal-fill" d="M32 43 C39 50 41 55 39 61 C37 67 27 67 25 61 C23 55 28 52 30 47 C31 53 34 54 34 50 C34 48 33 45.5 32 43 Z"/>',
    shield: '<path class="medal-line" d="M32 45 L41 48.5 V56 C41 62 37 66 32 68 C27 66 23 62 23 56 V48.5 Z"/>',
    arrow: '<path class="medal-line" d="M32 67 V46 M24 53.5 L32 45.5 L40 53.5"/>',
    grill: '<path class="medal-line" d="M22 53 H42 M25.5 53 V61 M32 53 V61 M38.5 53 V61 M23 64 H41"/><circle class="medal-fill" cx="28" cy="47" r="2"/><circle class="medal-fill" cx="35" cy="45" r="2.5"/>',
    card: '<rect class="medal-fill" x="26" y="45" width="12" height="18" rx="2" transform="rotate(12 32 54)"/>',
    ghost: '<path class="medal-fill" d="M24 67 V54 C24 48 27.5 45 32 45 C36.5 45 40 48 40 54 V67 L37.3 64 L34.6 67 L32 64 L29.4 67 L26.7 64 Z"/><circle class="medal-eye" cx="29" cy="54" r="1.8"/><circle class="medal-eye" cx="35" cy="54" r="1.8"/>'
};

// La medalla: cinta en V, el disco del color del trofeo y su dibujo.
function medalSVG(kind) {
    const t = TROPHIES[kind];
    return `<svg class="medal${t.anti ? ' is-anti' : ''}" viewBox="0 0 64 84" role="img" aria-label="${esc(t.name)}" style="--medal:${t.color}">
        <g class="medal-ribbon">
            <path class="medal-ribbon-a" d="M16 0 H29 L38 32 H25 Z"/>
            <path class="medal-ribbon-b" d="M48 0 H35 L26 32 H39 Z"/>
        </g>
        <circle class="medal-disc" cx="32" cy="56" r="23"/>
        <circle class="medal-ring" cx="32" cy="56" r="17.5"/>
        <g class="medal-glyph">${GLYPHS[t.glyph] || ''}</g>
    </svg>`;
}

const whoNames = (ids) => ids.map(id => db.participants.find(p => p.id === id)?.name || '—');
const joinNames = (names) => names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0];

// ===================================
// Los trofeos de esta tabla (en La tabla)
// ===================================

function renderSeasonTrophies() {
    const el = document.getElementById('trophySection');
    if (!el) return;
    const season = currentSeason();
    const list = season && !isGlobal() ? seasonTrophies(season) : [];
    el.hidden = !list.length || currentView !== 'tabla';
    if (el.hidden) return;

    const done = seasonDone(season);
    const year = seasonYear(season);
    const champ = list.find(t => t.kind === 'champion');
    const rest = list.filter(t => t.kind !== 'champion');

    document.getElementById('trophyNote').textContent = done
        ? `Entregados el ${formatLongDate(season.close_date)}.`
        : `Si la tabla terminara hoy. Se entregan el ${formatLongDate(season.close_date)}.`;

    const names = whoNames(champ.winners);
    document.getElementById('trophyBody').innerHTML = `
        <div class="tr-champ${done ? '' : ' is-live'}">
            ${cupSVG(year)}
            <div class="tr-champ-who">
                <span class="tr-champ-faces">${champ.winners.map(id => avatar(id, 'lg')).join('')}</span>
                <p class="tr-champ-label">${done ? (names.length > 1 ? 'Campeones' : 'Campeón') : 'Va primero'}</p>
                <p class="tr-champ-name">${esc(joinNames(names))}</p>
                <p class="tr-champ-detail">${esc(champ.detail)}</p>
            </div>
        </div>
        <ul class="tr-medals">
            ${rest.map((t, k) => `
            <li class="tr-medal${TROPHIES[t.kind].anti ? ' is-anti' : ''}" style="--i:${k}">
                ${medalSVG(t.kind)}
                <div class="tr-medal-text">
                    <strong>${esc(TROPHIES[t.kind].name)}</strong>
                    <span class="tr-medal-who">${t.winners.map(id => avatar(id, 'xs')).join('')}${esc(joinNames(whoNames(t.winners)))}</span>
                    <small>${esc(t.detail)}</small>
                </div>
            </li>`).join('')}
        </ul>`;
}

// ===================================
// La sala: las copas de todos los años y la vitrina de cada uno
// ===================================

function openTrophyRoom() {
    if (currentView === 'trofeos') return;
    currentView = 'trofeos';
    writeSeasonHash();
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderTrophies() {
    renderSeasonTrophies();

    const room = document.getElementById('trophyRoom');
    if (!room) return;
    const on = currentView === 'trofeos';
    document.body.classList.toggle('is-trophies', on);
    room.hidden = !on;
    if (!on) return;
    if (!trophiesAvailable()) { currentView = 'tabla'; writeSeasonHash(); renderAll(); return; }

    // de la más vieja a la más nueva: la sala se lee como una historia
    const all = seasons.slice().reverse()
        .filter(s => seasonEvents(s.id).length > 0)
        .map(s => ({ season: s, done: seasonDone(s), year: seasonYear(s), list: seasonTrophies(s) }));

    // las copas
    document.getElementById('roomCups').innerHTML = all.map((x, k) => {
        const champ = x.list.find(t => t.kind === 'champion');
        if (!champ) return '';
        const names = whoNames(champ.winners);
        return `
        <figure class="room-cup${x.done ? '' : ' is-live'}" style="--i:${k}">
            ${cupSVG(x.year, { pending: !x.done })}
            <figcaption>
                <span class="room-cup-faces">${champ.winners.map(id => avatar(id, 'md')).join('')}</span>
                <strong>${esc(joinNames(names))}</strong>
                <small>${esc(x.season.name)} · ${x.done ? esc(champ.detail) : `va primero, se define el ${formatLongDate(x.season.close_date).replace(/ de \d{4}$/, '')}`}</small>
            </figcaption>
        </figure>`;
    }).join('');

    // la vitrina de cada uno: todo lo que ganó, tabla por tabla
    const shelves = new Map();
    all.forEach(x => x.list.forEach(t => t.winners.forEach(id => {
        if (!shelves.has(id)) shelves.set(id, []);
        shelves.get(id).push({ ...t, year: x.year, season: x.season, done: x.done });
    })));

    const count = (items, test) => items.filter(t => t.done && test(t)).length;
    const rows = [...shelves.entries()].map(([id, items]) => {
        items.sort((a, b) => TROPHY_ORDER.indexOf(a.kind) - TROPHY_ORDER.indexOf(b.kind) || a.year.localeCompare(b.year));
        return {
            id, items,
            cups: count(items, t => t.kind === 'champion'),
            podium: count(items, t => t.kind === 'silver' || t.kind === 'bronze'),
            good: count(items, t => !TROPHIES[t.kind].anti && t.kind !== 'champion'),
            bad: count(items, t => TROPHIES[t.kind].anti),
            name: whoNames([id])[0]
        };
    }).sort((a, b) => b.cups - a.cups || b.podium - a.podium || b.good - a.good || a.bad - b.bad || a.name.localeCompare(b.name));

    document.getElementById('roomShelves').innerHTML = rows.map((r, k) => {
        const summary = [
            r.cups && plural(r.cups, 'copa', 'copas'),
            r.good && plural(r.good, 'medalla', 'medallas'),
            r.bad && plural(r.bad, 'antitrofeo', 'antitrofeos')
        ].filter(Boolean).join(' · ') || 'Por ahora, solo trofeos en juego';
        const item = (t) => `
            <li tabindex="0" class="shelf-item${t.kind === 'champion' ? ' is-cup' : ''}${TROPHIES[t.kind].anti ? ' is-anti' : ''}${t.done ? '' : ' is-live'}"
                title="${esc(TROPHIES[t.kind].name)} · ${esc(t.season.name)} · ${esc(t.detail)}${t.done ? '' : ' (en juego)'}">
                ${t.kind === 'champion' ? cupSVG(t.year, { pending: !t.done }) : medalSVG(t.kind)}
                <span>${esc(TROPHIES[t.kind].short)}</span>
                <small>${esc(t.year)}${t.done ? '' : ', en juego'}</small>
                <em class="shelf-detail">${esc(t.detail)}</em>
            </li>`;
        const good = r.items.filter(t => !TROPHIES[t.kind].anti);
        const bad = r.items.filter(t => TROPHIES[t.kind].anti);
        return `
        <article class="shelf${r.cups ? ' has-cup' : ''}" style="--i:${k}; --hue:${hueByPlayer.get(r.id) || 'var(--faint)'}">
            <header class="shelf-head">
                ${avatar(r.id, 'md')}
                <div>
                    <h3>${esc(r.name)}</h3>
                    <p>${summary}</p>
                </div>
            </header>
            <ul class="shelf-items">
                ${good.map(item).join('')}
                ${bad.length ? `<li class="shelf-gap" aria-hidden="true"></li>${bad.map(item).join('')}` : ''}
            </ul>
        </article>`;
    }).join('');

    // el título de la pantalla dice quién es el más ganador
    const top = rows[0];
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const closed = all.filter(x => x.done).length;
    set('pageTitle', 'Sala de trofeos');
    set('scopeLabel', 'Sala de trofeos');
    document.title = 'Sala de trofeos · Tabla Cavani y el taburete';
    // con empate en copas, se dice el empate y quién desempata por medallas
    const tied = top ? rows.filter(r => r.cups === top.cups) : [];
    let finding;
    if (!top || !top.cups) {
        finding = `${plural(closed, 'tabla cerrada', 'tablas cerradas')}. Los trofeos de la tabla en juego se entregan al cierre.`;
    } else if (tied.length > 1) {
        finding = `${joinNames(tied.map(r => r.name))} tienen ${plural(top.cups, 'copa', 'copas')} cada uno. ${top.name} desempata con más medallas.`;
    } else {
        finding = `${top.name} es el más ganador: ${plural(top.cups, 'copa', 'copas')} en ${plural(closed, 'tabla cerrada', 'tablas cerradas')}.`;
    }
    set('pageFinding', `${finding} Tocá un trofeo para ver de qué es.`);

    observeReveals(room);
}

// En el teléfono no hay mouse: tocar un trofeo muestra de qué es.
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('roomShelves')?.addEventListener('click', (e) => {
        const item = e.target.closest('.shelf-item');
        if (!item) return;
        document.querySelectorAll('.shelf-item.is-open').forEach(x => x !== item && x.classList.remove('is-open'));
        item.classList.toggle('is-open');
    });
});
