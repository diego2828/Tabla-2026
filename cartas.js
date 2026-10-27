// ===================================
// LAS CARTAS: una figurita por jugador, y el álbum para bajar
// ===================================

// Cada uno tiene su carta de la tabla que se mira, con media y seis atributos
// que salen de las actas. La forma de la carta es un escudo y el fondo es la
// parrilla: el asado es lo que está en juego. El primero tiene la carta de
// leyenda; el último, la de carbón.
//
// El álbum es un PDF: una tapa y una página por jugador. Las páginas se arman
// en HTML fuera de la pantalla y se fotografían con html2canvas; las librerías
// se bajan recién cuando alguien toca "Descargar álbum".
//
// Usa lo de script.js, pronostico.js y trofeos.js: seasonFacts, forecastData,
// seasonTrophies, avatar, hueByPlayer, plural, esc, signed, oddsLine...

const CARD_LIBS = {
    html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
};

// Los colores van escritos, no como variables: el dibujo de la carta es un
// SVG, y html2canvas lo fotografía sin la hoja de estilos.
const CARD_TIERS = {
    legend: { name: 'Leyenda', rim: '#f2c14e', ground: '#17130b', grill: '#2a2214', ink: '#f2c14e', sub: '#eadfc0' },
    gold:   { name: 'Oro',     rim: '#b98a1e', ground: '#e8c15a', grill: '#dab14a', ink: '#231904', sub: '#4a3a12' },
    silver: { name: 'Plata',   rim: '#8d949c', ground: '#cdd1d6', grill: '#c0c5cb', ink: '#14171b', sub: '#3c4249' },
    bronze: { name: 'Bronce',  rim: '#8a4f25', ground: '#c9844f', grill: '#bc7744', ink: '#26140a', sub: '#4d2b16' },
    coal:   { name: 'Carbón',  rim: '#ff6a1f', ground: '#1b1512', grill: '#2b1f19', ink: '#ff6a1f', sub: '#f1d6c6', ember: '#5c260c' }
};

const CARD_ROLES = {
    TIT: ['Titular indiscutido', 'Abono a platea', 'Ni con fiebre falta', 'El que nunca falta', 'Vive en la juntada', 'Llega primero'],
    BOL: ['El Rey del Boliche', 'Cierra el boliche', 'Sale de día', 'Socio del patovica', 'Pide la última', 'Duerme de día'],
    ASA: ['Solo por el asado', 'Asado y a casa', 'Va por el vacío', 'Hace la del tibio', 'Se va a la 1', 'Fan del chimichurri', 'Postre y retirada'],
    FAN: ['El Fantasma', 'Paradero desconocido', 'Se busca', 'Visto en marzo', 'Leído y no contestado'],
    MUL: ['Cliente del reglamento', 'Prontuario largo', 'El Multado', 'Socio del escribano', 'Libertad condicional'],
    SUP: ['Suplente de lujo', 'Viene cuando puede', 'Juega de visitante', 'Media jornada', 'Aparece en las fotos']
};

// El rol, con todas las letras: va debajo de la media
const ROLE_NAMES = { TIT: 'Titular', BOL: 'Bolichero', ASA: 'Asadero', FAN: 'Fantasma', MUL: 'Multado', SUP: 'Suplente' };

// El escudo: la muesca arriba, la punta abajo.
const CARD_SHAPE = 'M14 0H56Q80 11 104 0H146Q160 0 160 14V194Q160 205 149 209L88 228Q80 231 72 228L11 209Q0 205 0 194V14Q0 0 14 0Z';

let cardDeck = [];          // las cartas de la tabla que se mira, en el orden de la tabla
let cardOpen = -1;          // la que está abierta en grande

const cardsAvailable = () => !isGlobal() && !!db
    && seasonEvents(currentSeasonId).length > 0
    && seasonParticipants(currentSeasonId).length >= 2;

// ===================================
// Las cuentas de cada carta
// ===================================

function seasonCards(seasonId = currentSeasonId) {
    const season = seasons.find(s => s.id === seasonId);
    const F = seasonFacts(seasonId);
    if (!season || !F.N || F.n < 2) return [];
    const { byEvent } = forecastData(seasonId);
    const scoreOf = (ev, id) => byEvent.get(ev.id)?.get(id) ?? 0;
    const noteOf = new Map(seasonScores(seasonId).map(s => [`${s.event_id}|${s.participant_id}`, s.description || '']));

    const top = (value) => Math.max(0, ...F.stats.map(value));
    const maxFull = top(s => s.full), maxBest = top(s => s.best), maxFines = top(s => s.fineCount);
    const lo = Math.min(...F.totals), hi = Math.max(...F.totals);
    const lastPos = Math.max(...F.finalPos);
    const rate = (r) => Math.round(40 + 59 * Math.min(1, Math.max(0, r)));
    const recent = F.eventsAsc.slice(-6);
    const trophies = seasonTrophies(season);
    const closed = seasonDone(season);
    const live = !closed && forecastAvailable();
    const f = live ? ensureForecast() : null;

    const cards = F.stats.map((s, i) => {
        const id = s.p.id;
        const total = F.totals[i];
        const form = recent.reduce((a, ev) => a + scoreOf(ev, id), 0) / recent.length;
        const avg = form.toLocaleString('es-AR', { maximumFractionDigits: 1 });
        // cada atributo, con la cuenta de este jugador dicha en criollo
        const attrs = [
            { name: 'Asistencia', value: rate(s.went / F.N), w: 1.5,
              why: `Sumó en ${s.went} de ${plural(F.N, 'juntada', 'juntadas')}.` },
            { name: 'Fiesta', value: rate(maxFull ? s.full / maxFull : 0), w: 1,
              why: s.full === maxFull && s.full ? `Fue a asado y boliche ${plural(s.full, 'vez', 'veces')}: nadie fue más.`
                  : `Fue a asado y boliche ${plural(s.full, 'vez', 'veces')}. El que más fue, ${maxFull}.` },
            { name: 'Racha', value: rate(maxBest ? s.best / maxBest : 0), w: 1,
              why: s.best === maxBest ? `Sumó ${s.best} seguidas: la racha más larga de la tabla.`
                  : `Sumó ${s.best} seguidas. La racha más larga de la tabla es de ${maxBest}.` },
            { name: 'Disciplina', value: rate(maxFines ? 1 - s.fineCount / maxFines : 1), w: 0.8,
              why: !s.fineCount ? 'Ni una multa en toda la tabla.'
                  : `${plural(s.fineCount, 'multa', 'multas')}. El más multado tiene ${maxFines}.` },
            { name: 'Forma', value: rate((form + 1) / 4), w: 0.7,
              why: `Promedio de ${avg} ${avg === '1' ? 'punto' : 'puntos'} en las últimas ${plural(recent.length, 'juntada', 'juntadas')}.` },
            { name: 'Puntos', value: rate(hi > lo ? (total - lo) / (hi - lo) : 1), w: 2,
              why: `Tiene ${signed(total)}. El último tiene ${signed(lo)} y el primero ${signed(hi)}.` }
        ];
        const overall = Math.round(attrs.reduce((a, x) => a + x.value * x.w, 0) / attrs.reduce((a, x) => a + x.w, 0));

        const pos = F.finalPos[i];
        const tier = pos === 1 ? 'legend' : pos === lastPos ? 'coal'
            : overall >= 78 ? 'gold' : overall >= 64 ? 'silver' : 'bronze';

        // el rol: lo que más lo define, en el orden en que se nota
        const wentShare = s.went / F.N;
        const role = s.ghost / F.N >= 0.5 ? 'FAN'
            : maxFines >= 2 && s.fineCount === maxFines ? 'MUL'
            : maxFull > 0 && s.full === maxFull ? 'BOL'
            : wentShare >= 0.85 ? 'TIT'
            : s.went && s.full / s.went >= 0.5 ? 'BOL'
            : wentShare < 0.4 ? 'SUP'
            : 'ASA';

        // las fechas: la mejor es la de más puntos en la que menos lo igualaron
        // (la que se lució); la peor, la de menos puntos, mejor si tiene motivo
        const mine = F.eventsAsc.map(ev => ({
            ev, score: scoreOf(ev, id), note: noteOf.get(`${ev.id}|${id}`) || '',
            matched: F.stats.filter(o => o !== s && scoreOf(ev, o.p.id) >= scoreOf(ev, id)).length
        }));
        const bestDay = mine.reduce((a, x) => (x.score > a.score || (x.score === a.score && x.matched <= a.matched) ? x : a), mine[0]);
        const worstDay = mine.reduce((a, x) => (x.score < a.score || (x.score === a.score && x.note && !a.note) ? x : a), mine[0]);
        const lastSeen = mine.filter(x => x.score > 0).pop()?.ev || null;

        // el socio: con quién coincidió más veces
        const partner = F.stats.filter(o => o !== s).map(o => ({
            id: o.p.id, name: o.p.name,
            together: F.eventsAsc.filter(ev => scoreOf(ev, id) > 0 && scoreOf(ev, o.p.id) > 0).length
        })).sort((a, b) => b.together - a.together || a.name.localeCompare(b.name))[0];

        // el año, juntada a juntada
        let run = s.p.starting_points || 0;
        const path = mine.map(x => ({ date: parseLocalDate(x.ev.date), total: (run += x.score) }));

        const k = f ? f.data.players.findIndex(p => p.id === id) : -1;
        const odds = k >= 0 ? { win: f.sim.pWin[k], last: f.sim.pLast[k] } : null;

        return {
            id, name: s.p.name, hue: hueByPlayer.get(id) || 'var(--faint)',
            pos, tied: F.finalPos.filter(p => p === pos).length > 1, total, overall, attrs, tier, role,
            stats: s, N: F.N, n: F.n, bestDay, worstDay, lastSeen, partner, path, odds,
            trophies: trophies.filter(t => t.winners.includes(id)).map(t => t.kind),
            season, closed
        };
    });

    // el apodo sale sorteado con semilla, sin repetir dentro de la tabla
    const used = new Set();
    cards.forEach(c => {
        const list = CARD_ROLES[c.role];
        const start = hashString(`${c.id}|${seasonId}`) % list.length;
        for (let k = 0; k < list.length && !c.alias; k++) {
            const a = list[(start + k) % list.length];
            if (!used.has(a)) c.alias = a;
        }
        c.alias ||= list[start];
        used.add(c.alias);
        c.verdict = cardVerdict(c, lastPos);
    });
    return cards.sort((a, b) => a.pos - b.pos || b.overall - a.overall || a.name.localeCompare(b.name));
}

// Lo que dice el escribano de cada uno: su puesto y su costumbre.
function cardVerdict(c, lastPos) {
    const s = c.stats;
    let first;
    if (c.pos === 1) first = c.closed ? 'Campeón. Que lo cuelguen en un cuadro.' : 'Va primero. Ya ensaya el discurso.';
    else if (c.pos === lastPos) first = c.closed ? 'Pagó el asado. El vacío lo eligió a él.' : 'Hoy paga el asado. Que vaya averiguando el precio del vacío.';
    else if (c.odds) first = oddsLine(c.odds.win, c.odds.last);
    else if (c.pos <= 3) first = 'Podio. Para la foto alcanza.';
    else first = 'Mitad de tabla, sin sobresaltos.';

    const lines = {
        TIT: `Faltó a ${plural(c.N - s.went, 'juntada', 'juntadas')} en todo el año.`,
        BOL: `${plural(s.full, 'vez', 'veces')} asado y boliche. En la puerta ya lo saludan por el nombre.`,
        ASA: `Sumó en ${s.went} de ${c.N}, casi siempre de a uno. Asado y a dormir.`,
        FAN: c.lastSeen ? `Visto por última vez el ${formatActaDate(c.lastSeen.date)}.` : 'Nadie lo vio en todo el año.',
        MUL: `${plural(s.fineCount, 'penalización', 'penalizaciones')}. El reglamento lo tiene de cliente.`,
        SUP: `Sumó en ${s.went} de ${c.N}. Viene cuando puede.`
    };
    return `${first} ${lines[c.role]}`;
}

// ===================================
// El dibujo de la carta
// ===================================

// El escudo con su borde, y adentro la parrilla: barras de lado a lado,
// recortadas por la forma. En la de carbón, algunas son brasas.
let grillClip = 0;
function grillSVG(t) {
    const clip = `fig-clip-${++grillClip}`;
    const inner = 'translate(4 4) scale(0.95 0.9652)';
    const bars = [];
    for (let y = 112, k = 0; y < 230; y += 8, k++) {
        const ember = t.ember && (k % 3 === 1);
        bars.push(`<rect x="0" y="${y}" width="160" height="3" fill="${ember ? t.ember : t.grill}"/>`);
    }
    return `<svg class="fig-shape" viewBox="0 0 160 230" preserveAspectRatio="none" aria-hidden="true">
        <defs><clipPath id="${clip}"><path d="${CARD_SHAPE}" transform="${inner}"/></clipPath></defs>
        <path d="${CARD_SHAPE}" fill="${t.rim}"/>
        <path d="${CARD_SHAPE}" transform="${inner}" fill="${t.ground}"/>
        <g clip-path="url(#${clip})">${bars.join('')}</g>
    </svg>`;
}

function cardFace(c) {
    const p = db.participants.find(x => x.id === c.id);
    const photo = p?.photo_url
        ? `<img src="${esc(p.photo_url)}" alt="" crossorigin="anonymous" decoding="async">`
        : '';
    const t = CARD_TIERS[c.tier];
    const long = c.name.length > 9 ? ' is-long' : '';
    return `<div class="fig fig-${c.tier}" style="--fig-ink:${t.ink}; --fig-sub:${t.sub}; --hue:${c.hue}">
        ${grillSVG(t)}
        <div class="fig-rating">
            <b class="num">${c.overall}</b>
            <span>${ROLE_NAMES[c.role]}</span>
            <small>${esc(t.name)}</small>
        </div>
        <div class="fig-photo"><span>${esc(initials(c.name))}</span>${photo}</div>
        <p class="fig-name${long}">${esc(c.name)}</p>
        <p class="fig-alias">${esc(c.alias)}</p>
        <dl class="fig-attrs">
            ${c.attrs.map(a => `<div><dd class="num">${a.value}</dd><dt>${a.name}</dt></div>`).join('')}
        </dl>
        <p class="fig-foot num">${c.pos}º · ${signed(c.total)}</p>
    </div>`;
}

// ===================================
// La vista
// ===================================

function renderCards() {
    const view = document.getElementById('cardsView');
    if (!view) return;
    const on = currentView === 'cartas' && cardsAvailable();
    document.body.classList.toggle('is-cards', on);
    view.hidden = !on;
    if (!on) return;

    cardDeck = seasonCards();
    const season = currentSeason();
    document.getElementById('cardsNote').textContent =
        `${plural(cardDeck.length, 'carta', 'cartas')} de ${season.name}, en el orden de la tabla. ${seasonDone(season) ? 'Edición final.' : 'Se actualizan con cada juntada.'}`;

    const grid = document.getElementById('cardsGrid');
    grid.innerHTML = cardDeck.map((c, k) => `
        <li class="fig-slot" style="--i:${k}">
            <button type="button" class="fig-btn" data-k="${k}" aria-label="${esc(c.name)}: media ${c.overall}, ${c.pos}º con ${signed(c.total)}. Abrir su página del álbum">
                ${cardFace(c)}
            </button>
        </li>`).join('');

    // se reparten una vez por cada vez que se entra
    grid.classList.remove('is-dealt');
    requestAnimationFrame(() => requestAnimationFrame(() => grid.classList.add('is-dealt')));
}

// Mover el mouse inclina la carta, como si la tuvieras en la mano.
function wireCardTilt(grid) {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    grid.addEventListener('pointermove', (e) => {
        const btn = e.target.closest('.fig-btn');
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        btn.style.setProperty('--ry', `${(x * 16).toFixed(2)}deg`);
        btn.style.setProperty('--rx', `${(-y * 16).toFixed(2)}deg`);
        btn.style.setProperty('--lx', `${((x + 0.5) * 100).toFixed(1)}%`);
    });
    grid.addEventListener('pointerout', (e) => {
        const btn = e.target.closest('.fig-btn');
        if (!btn || btn.contains(e.relatedTarget)) return;
        btn.style.removeProperty('--rx');
        btn.style.removeProperty('--ry');
    });
}

// ===================================
// La página del álbum: en grande en pantalla, y en el PDF
// ===================================

// El color de cada uno escrito en hex, para los dibujos que se fotografían.
function hueHex(c) {
    const m = /var\((--s\d)\)/.exec(c.hue);
    return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() : '#949494';
}

// El año de uno contra el de todos, como en la carrera, sin grilla.
function albumChart(c) {
    const W = 1000, H = 260, PAD = 14;
    const t0 = SEASON_START.getTime(), t1 = Math.max(SEASON_CLOSE.getTime(), t0 + DAY);
    const all = cardDeck.flatMap(x => [x.stats.p.starting_points || 0, ...x.path.map(p => p.total)]);
    const lo = Math.min(0, ...all), hi = Math.max(1, ...all);
    const X = (d) => PAD + (W - 2 * PAD) * Math.min(1, Math.max(0, (d.getTime() - t0) / (t1 - t0)));
    const Y = (v) => PAD + (H - 2 * PAD) * (1 - (v - lo) / (hi - lo));
    // cada línea arranca el primer día con los puntos iniciales
    const line = (x) => [`${X(SEASON_START).toFixed(1)},${Y(x.stats.p.starting_points || 0).toFixed(1)}`]
        .concat(x.path.map(p => `${X(p.date).toFixed(1)},${Y(p.total).toFixed(1)}`)).join(' ');
    const others = cardDeck.filter(x => x.id !== c.id)
        .map(x => `<polyline points="${line(x)}" fill="none" stroke="#3a3430" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
    const end = c.path[c.path.length - 1];
    const hex = hueHex(c);
    return `<svg class="alb-chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="El año de ${esc(c.name)}: termina con ${signed(c.total)}">
        <rect x="${PAD}" y="${Y(0).toFixed(1)}" width="${W - 2 * PAD}" height="2" fill="#26211d"/>
        ${others}
        <polyline points="${line(c)}" fill="none" stroke="${hex}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
        ${end ? `<circle cx="${X(end.date).toFixed(1)}" cy="${Y(end.total).toFixed(1)}" r="10" fill="${hex}"/>` : ''}
    </svg>`;
}

function albumPage(c, k, { print = false } = {}) {
    const s = c.stats;
    const t = CARD_TIERS[c.tier];
    const hex = hueHex(c);
    const standing = `${c.pos}º${c.tied ? ' (empatado)' : ''} de ${c.n}`;
    const trophyChips = c.trophies.map(kind =>
        `<li class="${TROPHIES[kind].anti ? 'is-anti' : ''}">${esc(TROPHIES[kind].name)}</li>`).join('');

    const fact = (label, value, note = '') => `
        <div class="alb-fact"><dt>${label}</dt><dd class="num">${value}</dd>${note ? `<p>${note}</p>` : ''}</div>`;
    const day = (label, x, empty) => x && (label === 'La mejor' ? x.score > 0 : x.score < 0) ? `
        <div class="alb-day">
            <h4>${label}</h4>
            <p class="alb-day-name">${esc(x.ev.name)}</p>
            <p class="alb-day-meta num">${esc(formatActaDate(x.ev.date))} · ${signed(x.score)}${x.note ? ` · “${esc(x.note)}”` : ''}</p>
        </div>` : `<div class="alb-day"><h4>${label}</h4><p class="alb-day-name">${empty}</p></div>`;

    return `<article class="alb-page${print ? ' is-print' : ''}" style="--hue-hex:${hex}; --fig-ink:${t.ink}">
        <header class="alb-top">
            <span>${esc(c.season.name)} · Álbum oficial</span>
            <span class="num">Figurita ${k + 1} de ${cardDeck.length}</span>
        </header>
        <div class="alb-hero">
            <div class="alb-card">${cardFace(c)}</div>
            <div class="alb-who">
                <p class="alb-tier">Carta ${esc(t.name.toLowerCase())} · ${esc(c.alias)}</p>
                <h3 class="alb-name">${esc(c.name)}</h3>
                <p class="alb-standing num">${standing} · ${signed(c.total)} ${Math.abs(c.total) === 1 ? 'punto' : 'puntos'}</p>
                <p class="alb-verdict">${esc(c.verdict)}</p>
                ${trophyChips ? `<ul class="alb-trophies" aria-label="Trofeos${c.closed ? '' : ' en juego'}">${trophyChips}</ul>` : ''}
            </div>
        </div>
        ${print ? '' : `<section class="alb-attrs">
            <h4>Sus atributos</h4>
            <dl>${c.attrs.map(a => `
                <div class="alb-attr">
                    <dt><b class="num">${a.value}</b> ${a.name}</dt>
                    <dd>${esc(a.why)}</dd>
                </div>`).join('')}
            </dl>
        </section>`}
        <section class="alb-year">
            <h4>Su año</h4>
            ${albumChart(c)}
            <p class="alb-scale"><span>${esc(shortDate(SEASON_START))}</span><span>${esc(shortDate(SEASON_CLOSE))}</span></p>
        </section>
        <dl class="alb-facts">
            ${fact('Sumó en', `${s.went}<small>/${c.N}</small>`, `${Math.round(100 * s.went / c.N)}% de las juntadas`)}
            ${fact('Asado y boliche', s.full, s.full ? 'Las de tres puntos' : 'Ni una completa')}
            ${fact('Racha', s.best, s.best === 1 ? 'juntada seguida' : 'juntadas seguidas')}
            ${fact('Multas', s.fineCount, s.fineCount ? `${plural(-s.fines, 'punto perdido', 'puntos perdidos')}` : 'Limpio')}
            ${fact('Faltazos', s.ghost, s.ghost ? `de ${c.N}` : 'Ninguno')}
            ${fact('Su socio', `<span class="alb-fact-name">${esc(c.partner?.name || '—')}</span>`, c.partner ? `Fueron juntos a ${c.partner.together}` : '')}
        </dl>
        <div class="alb-days">
            ${day('La mejor', c.bestDay, 'Todavía no sumó')}
            ${day('La peor', c.worstDay, 'Sin manchas')}
        </div>
        <footer class="alb-foot">
            <span>Tabla Cavani y el taburete</span>
            <span>Viva el escribano</span>
        </footer>
    </article>`;
}

function albumCover() {
    const season = currentSeason();
    const leader = cardDeck.filter(c => c.pos === 1);
    const done = seasonDone(season);
    const events = cardDeck[0]?.N || 0;
    return `<article class="alb-page alb-cover is-print">
        <header class="alb-top">
            <span>Tabla Cavani y el taburete</span>
            <span class="num">${plural(cardDeck.length, 'figurita', 'figuritas')}</span>
        </header>
        <div class="alb-cover-title">
            <h3>Álbum<br>${esc(season.name)}</h3>
            <p class="num">${esc(formatLongDate(season.start_date))} – ${esc(formatLongDate(season.close_date))} · ${plural(events, 'juntada', 'juntadas')}</p>
            <p>${done ? (leader.length > 1 ? 'Campeones' : 'Campeón') : 'Va primero'}: ${esc(joinNames(leader.map(c => c.name)))}.</p>
        </div>
        <div class="alb-cover-grid">${cardDeck.map(c => cardFace(c)).join('')}</div>
        <footer class="alb-foot">
            <span>${done ? 'Edición final' : `Edición del ${esc(formatLongDate(todayLocalISO()))}`}</span>
            <span>Viva el escribano</span>
        </footer>
    </article>`;
}

function openCard(k) {
    if (!cardDeck[k]) return;
    cardOpen = k;
    document.getElementById('figPage').innerHTML = albumPage(cardDeck[k], k);
    document.getElementById('btnFigPrev').disabled = k === 0;
    document.getElementById('btnFigNext').disabled = k === cardDeck.length - 1;
    const modal = document.getElementById('figModal');
    if (!modal.classList.contains('active')) {
        modal.classList.add('active');
        document.getElementById('btnCloseFig').focus();
    }
    modal.scrollTop = 0;
}

function closeCard() {
    const modal = document.getElementById('figModal');
    if (!modal.classList.contains('active')) return;
    modal.classList.remove('active');
    document.querySelector(`.fig-btn[data-k="${cardOpen}"]`)?.focus();
    cardOpen = -1;
}

// ===================================
// Bajar: la carta en PNG y el álbum en PDF
// ===================================

const loadedLibs = new Map();
function loadLib(src) {
    if (!loadedLibs.has(src)) {
        loadedLibs.set(src, new Promise((resolve, reject) => {
            const el = document.createElement('script');
            el.src = src;
            el.onload = resolve;
            el.onerror = () => { loadedLibs.delete(src); reject(new Error(`No cargó ${src}`)); };
            document.head.appendChild(el);
        }));
    }
    return loadedLibs.get(src);
}

// Pone el HTML fuera de la pantalla y espera a que estén las letras y las fotos.
async function stage(html) {
    const el = document.getElementById('albumStage');
    el.innerHTML = html;
    await document.fonts?.ready;
    await Promise.all([...el.querySelectorAll('img')].map(img =>
        img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = r; })));
    return el;
}

const shoot = (el, scale, background) => window.html2canvas(el, {
    scale, useCORS: true, backgroundColor: background, logging: false
});

const fileSafe = (text) => String(text).replace(/[\\/:*?"<>|]+/g, '').trim();

function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function downloadCard() {
    const c = cardDeck[cardOpen];
    if (!c) return;
    const btn = document.getElementById('btnFigDownload');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Armando la carta…';
    try {
        await loadLib(CARD_LIBS.html2canvas);
        const el = await stage(`<div class="alb-solo">${cardFace(c)}</div>`);
        const canvas = await shoot(el.firstElementChild, 3, null);
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        const name = `${fileSafe(c.name)} · ${fileSafe(c.season.name)}.png`;
        const file = new File([blob], name, { type: 'image/png' });
        // en el teléfono, directo al menú de compartir (WhatsApp); si no, se baja
        if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
            await navigator.share({ files: [file], title: `${c.name} · ${c.season.name}` }).catch(() => {});
        } else {
            saveBlob(blob, name);
        }
    } catch (err) {
        console.error(err);
        showNotification('No se pudo armar la carta. Probá de nuevo.');
    } finally {
        document.getElementById('albumStage').innerHTML = '';
        btn.disabled = false;
        btn.textContent = label;
    }
}

async function downloadAlbum() {
    if (!cardDeck.length) return;
    const btn = document.getElementById('btnAlbum');
    const label = btn.textContent;
    btn.disabled = true;
    const total = cardDeck.length + 1;
    btn.textContent = 'Preparando…';
    try {
        await Promise.all([loadLib(CARD_LIBS.html2canvas), loadLib(CARD_LIBS.jspdf)]);
        const season = currentSeason();
        const el = await stage(albumCover() + cardDeck.map((c, k) => albumPage(c, k, { print: true })).join(''));
        const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        const pages = [...el.children];
        for (let k = 0; k < pages.length; k++) {
            btn.textContent = `Página ${k + 1} de ${total}…`;
            const canvas = await shoot(pages[k], 1.5, '#0a0908');
            if (k > 0) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        }
        pdf.save(`Álbum ${fileSafe(season.name)}.pdf`);
    } catch (err) {
        console.error(err);
        showNotification('No se pudo armar el álbum. Probá de nuevo.');
    } finally {
        document.getElementById('albumStage').innerHTML = '';
        btn.disabled = false;
        btn.textContent = label;
    }
}

// ===================================
// Los botones
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('cardsGrid');
    if (!grid) return;
    grid.addEventListener('click', (e) => {
        const btn = e.target.closest('.fig-btn');
        if (btn) openCard(Number(btn.dataset.k));
    });
    wireCardTilt(grid);

    document.getElementById('btnAlbum').addEventListener('click', downloadAlbum);
    document.getElementById('btnCloseFig').addEventListener('click', closeCard);
    document.getElementById('btnFigPrev').addEventListener('click', () => openCard(cardOpen - 1));
    document.getElementById('btnFigNext').addEventListener('click', () => openCard(cardOpen + 1));
    document.getElementById('btnFigDownload').addEventListener('click', downloadCard);

    const modal = document.getElementById('figModal');
    modal.addEventListener('click', (e) => { if (e.target === modal) closeCard(); });
    document.addEventListener('keydown', (e) => {
        if (!modal.classList.contains('active')) return;
        if (e.key === 'Escape') { e.stopImmediatePropagation(); closeCard(); }
        if (e.key === 'ArrowLeft') openCard(cardOpen - 1);
        if (e.key === 'ArrowRight') openCard(cardOpen + 1);
    }, true);
});
