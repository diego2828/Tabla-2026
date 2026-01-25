// ===================================
// TABLA CAVANI 2026 - Supabase Version
// ===================================

// PIN correcto
const CORRECT_PIN = '270701';

// Login state
let isLoggedIn = false;

// Realtime subscriptions
let participantsSubscription = null;
let eventsSubscription = null;
let scoresSubscription = null;

// ===================================
// Initialization
// ===================================

document.addEventListener('DOMContentLoaded', async () => {
    checkLoginStatus();
    updateLoginUI();
    await loadAndRenderAll();
    setupRealtimeSubscriptions();
    initializeEventListeners();
});

// ===================================
// Login Management
// ===================================

function checkLoginStatus() {
    isLoggedIn = localStorage.getItem('escribanoLoggedIn') === 'true';
}

function login() {
    isLoggedIn = true;
    localStorage.setItem('escribanoLoggedIn', 'true');
    updateLoginUI();
}

function logout() {
    isLoggedIn = false;
    localStorage.removeItem('escribanoLoggedIn');
    updateLoginUI();
}

function updateLoginUI() {
    const loginBtn = document.getElementById('btnLoginEscribano');
    const addParticipantBtn = document.getElementById('btnAddParticipant');
    const addEventBtn = document.getElementById('btnAddEvent');
    const exportBtn = document.getElementById('btnExportExcel');

    if (isLoggedIn) {
        loginBtn.innerHTML = '✅ Logout Escribano';
        loginBtn.classList.add('logged-in');
        addParticipantBtn.disabled = false;
        addEventBtn.disabled = false;
        exportBtn.disabled = false;
    } else {
        loginBtn.innerHTML = '🔒 Login Escribano';
        loginBtn.classList.remove('logged-in');
        addParticipantBtn.disabled = true;
        addEventBtn.disabled = true;
        exportBtn.disabled = true;
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

function handleLogin() {
    const pinInput = document.getElementById('pinInput');
    const pin = pinInput.value.trim();

    if (pin === CORRECT_PIN) {
        login();
        hideLoginModal();
        showNotification('✅ Inicio de sesión exitoso');
    } else {
        alert('❌ PIN incorrecto');
        pinInput.value = '';
        pinInput.focus();
    }
}

// ===================================
// Supabase Realtime Subscriptions
// ===================================

function setupRealtimeSubscriptions() {
    if (!supabase) {
        console.warn('Supabase not initialized, skipping realtime subscriptions');
        return;
    }

    // Subscribe to participants changes
    participantsSubscription = supabase
        .channel('participants_channel')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'participants' },
            (payload) => {
                console.log('Participants changed:', payload);
                loadAndRenderAll();
            }
        )
        .subscribe();

    // Subscribe to events changes
    eventsSubscription = supabase
        .channel('events_channel')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'events' },
            (payload) => {
                console.log('Events changed:', payload);
                loadAndRenderAll();
            }
        )
        .subscribe();

    // Subscribe to event_scores changes
    scoresSubscription = supabase
        .channel('scores_channel')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'event_scores' },
            (payload) => {
                console.log('Scores changed:', payload);
                loadAndRenderAll();
            }
        )
        .subscribe();
}

// ===================================
// Data Loading Functions
// ===================================

async function loadAndRenderAll() {
    await renderRanking();
    await renderEvents();
    await updateStats();
}

async function getParticipants() {
    if (!supabase) return [];

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
    if (!supabase) return [];

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
    if (!supabase) return [];

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
    const { data: scores, error } = await supabase
        .from('event_scores')
        .select('score')
        .eq('participant_id', participantId);

    if (error) {
        console.error('Error calculating score:', error);
        return 0;
    }

    const eventScores = scores.reduce((sum, s) => sum + (s.score || 0), 0);

    // Get starting points
    const { data: participant } = await supabase
        .from('participants')
        .select('starting_points')
        .eq('id', participantId)
        .single();

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
                <p>🎯 Todavía no hay participantes</p>
                <p class="empty-hint">Agrega participantes para comenzar</p>
            </div>
        `;
        return;
    }

    container.innerHTML = rankingData.map((item, index) => {
        const position = index + 1;
        const positionClass = position <= 3 ? `position-${position}` : '';
        const scoreClass = item.score < 0 ? 'negative' : '';

        return `
            <div class="ranking-item ${positionClass}">
                <div class="ranking-position">#${position}</div>
                <div class="ranking-name">${item.name}</div>
                <div class="ranking-score ${scoreClass}">${item.score > 0 ? '+' : ''}${item.score}</div>
            </div>
        `;
    }).join('');
}

// ===================================
// Event Functions
// ===================================

async function renderEvents() {
    const container = document.getElementById('eventsList');
    const events = await getEvents();

    if (events.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>📅 No hay juntadas registradas</p>
                <p class="empty-hint">Crea tu primera juntada</p>
            </div>
        `;
        return;
    }

    const participants = await getParticipants();
    const allScores = await getEventScores();

    const disabledAttr = !isLoggedIn ? 'disabled' : '';

    const eventsHTML = await Promise.all(events.map(async (event) => {
        const formattedDate = new Date(event.date).toLocaleDateString('es-AR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

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
            <div class="event-card">
                <div class="event-header">
                    <div class="event-info">
                        <h3>${event.name}</h3>
                        <div class="event-meta">
                            <span>📅 ${formattedDate}</span>
                            <span>🏆 ${event.total_points_disputed || 0} puntos</span>
                        </div>
                    </div>
                    <div class="event-actions">
                        <button class="btn btn-small btn-primary" onclick="requestEditEvent('${event.id}')" ${disabledAttr}>
                            ✏️ Editar
                        </button>
                        <button class="btn btn-small btn-danger" onclick="requestDeleteEvent('${event.id}')" ${disabledAttr}>
                            🗑️ Eliminar
                        </button>
                    </div>
                </div>
                ${participantScoresHTML}
            </div>
        `;
    }));

    container.innerHTML = eventsHTML.join('');
}

// ===================================
// Stats Functions
// ===================================

async function updateStats() {
    const events = await getEvents();

    const totalPoints = events.reduce((sum, event) =>
        sum + (event.total_points_disputed || 0), 0
    );

    document.getElementById('totalPointsDisputed').textContent = totalPoints;
    document.getElementById('totalEvents').textContent = events.length;
}

// ===================================
// Participant Functions
// ===================================

async function showAddParticipantModal() {
    if (!isLoggedIn) {
        alert('❌ Debes iniciar sesión primero');
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
        alert('❌ Por favor ingresa un nombre');
        return;
    }

    if (!isLoggedIn) {
        alert('❌ Debes iniciar sesión para agregar participantes');
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
            alert('❌ Ya existe un participante con ese nombre');
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
        showNotification('✅ Participante agregado correctamente');

    } catch (error) {
        console.error('Error adding participant:', error);
        alert('❌ Error al agregar participante: ' + error.message);
    }
}

// ===================================
// Event CRUD Functions
// ===================================

async function showAddEventModal() {
    if (!isLoggedIn) {
        alert('❌ Debes iniciar sesión primero');
        return;
    }

    const participants = await getParticipants();

    if (participants.length === 0) {
        alert('❌ Primero debes agregar participantes');
        return;
    }

    const modal = document.getElementById('addEventModal');

    // Reset form
    document.getElementById('eventName').value = '';
    document.getElementById('eventDate').value = new Date().toISOString().split('T')[0];
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
        alert('❌ Por favor ingresa un nombre para la juntada');
        return;
    }

    if (!date) {
        alert('❌ Por favor selecciona una fecha');
        return;
    }

    if (!isLoggedIn) {
        alert('❌ Debes iniciar sesión para agregar eventos');
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
        showNotification('✅ Juntada agregada correctamente');

    } catch (error) {
        console.error('Error adding event:', error);
        alert('❌ ' + error.message);
    }
}

async function requestEditEvent(eventId) {
    if (!isLoggedIn) {
        alert('❌ Debes iniciar sesión para editar eventos');
        return;
    }
    showEditEventModal(eventId);
}

async function showEditEventModal(eventId) {
    try {
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (eventError) throw eventError;
        if (!event) {
            alert('❌ Evento no encontrado');
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
        alert('❌ Error al abrir formulario: ' + error.message);
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
        alert('❌ Error: ID de evento no encontrado');
        return;
    }

    const name = document.getElementById('editEventName').value.trim();
    const date = document.getElementById('editEventDate').value;
    const totalPointsDisputed = parseInt(document.getElementById('editEventPoints').value) || 0;

    if (!name) {
        alert('❌ Por favor ingresa un nombre para la juntada');
        return;
    }

    if (!date) {
        alert('❌ Por favor selecciona una fecha');
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
        showNotification('✅ Juntada actualizada correctamente');

    } catch (error) {
        console.error('Error updating event:', error);
        alert('❌ ' + error.message);
    }
}

async function requestDeleteEvent(eventId) {
    if (!isLoggedIn) {
        alert('❌ Debes iniciar sesión para eliminar eventos');
        return;
    }
    deleteEvent(eventId);
}

async function deleteEvent(eventId) {
    if (!confirm('⚠️ ¿Estás seguro de que quieres eliminar esta juntada?')) {
        return;
    }

    try {
        // Delete event (scores will be deleted automatically due to CASCADE)
        const { error } = await supabase
            .from('events')
            .delete()
            .eq('id', eventId);

        if (error) throw error;

        showNotification('✅ Juntada eliminada correctamente');

    } catch (error) {
        console.error('Error deleting event:', error);
        alert('❌ Error al eliminar evento: ' + error.message);
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
        alert('❌ Debes iniciar sesión para exportar datos');
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

        showNotification('✅ Excel exportado correctamente');

    } catch (error) {
        console.error('Error exporting Excel:', error);
        alert('❌ Error al exportar Excel: ' + error.message);
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
