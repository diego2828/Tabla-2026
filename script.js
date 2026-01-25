// ===================================
// TABLA CAVANI 2025 - Simple PIN Login Version
// ===================================

// PIN correcto
const CORRECT_PIN = '270701';

// Data Structure
let appData = {
    participants: [],
    events: []
};

// Login state
let isLoggedIn = false;

// ===================================
// Initialization
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    checkLoginStatus();
    updateLoginUI();
    renderRanking();
    renderEvents();
    updateStats();
    initializeEventListeners();
});

// ===================================
// Data Management
// ===================================

function loadData() {
    const savedData = localStorage.getItem('tablaCavani2025');
    if (savedData) {
        try {
            appData = JSON.parse(savedData);
        } catch (e) {
            console.error('Error loading data:', e);
        }
    }
}

function saveData() {
    localStorage.setItem('tablaCavani2025', JSON.stringify(appData));
}

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
// Ranking Functions
// ===================================

function calculateParticipantScore(participantId) {
    const participant = appData.participants.find(p => p.id === participantId);
    if (!participant) return 0;

    let totalScore = participant.startingPoints || 0;

    participant.events.forEach(eventScore => {
        totalScore += eventScore.score;
    });

    return totalScore;
}

function getRankingData() {
    return appData.participants.map(p => ({
        id: p.id,
        name: p.name,
        score: calculateParticipantScore(p.id)
    })).sort((a, b) => b.score - a.score);
}

function renderRanking() {
    const container = document.getElementById('rankingTable');
    const rankingData = getRankingData();

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

function renderEvents() {
    const container = document.getElementById('eventsList');

    if (appData.events.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>📅 No hay juntadas registradas</p>
                <p class="empty-hint">Crea tu primera juntada</p>
            </div>
        `;
        return;
    }

    // Sort events by date (newest first)
    const sortedEvents = [...appData.events].sort((a, b) =>
        new Date(b.date) - new Date(a.date)
    );

    const disabledAttr = !isLoggedIn ? 'disabled' : '';

    container.innerHTML = sortedEvents.map(event => {
        const formattedDate = new Date(event.date).toLocaleDateString('es-AR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const participantScores = appData.participants.map(participant => {
            const eventScore = participant.events.find(e => e.eventId === event.id);
            return {
                name: participant.name,
                score: eventScore ? eventScore.score : 0,
                description: eventScore ? eventScore.description : ''
            };
        }).filter(ps => ps.score !== 0 || ps.description);

        return `
            <div class="event-card">
                <div class="event-header">
                    <div class="event-info">
                        <h3>${event.name}</h3>
                        <div class="event-meta">
                            <span>📅 ${formattedDate}</span>
                            <span>🏆 ${event.totalPointsDisputed} puntos</span>
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
                ${participantScores.length > 0 ? `
                    <div class="event-participants">
                        ${participantScores.map(ps => `
                            <div class="participant-score-item">
                                <div class="participant-score-header">
                                    <span class="participant-score-name">${ps.name}</span>
                                    <span class="participant-score-value ${ps.score > 0 ? 'positive' : ps.score < 0 ? 'negative' : 'zero'}">
                                        ${ps.score > 0 ? '+' : ''}${ps.score}
                                    </span>
                                </div>
                                ${ps.description ? `<div class="participant-score-description">${ps.description}</div>` : ''}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// ===================================
// Stats Functions
// ===================================

function updateStats() {
    // Calculate total points disputed
    const totalPoints = appData.events.reduce((sum, event) =>
        sum + (event.totalPointsDisputed || 0), 0
    );

    document.getElementById('totalPointsDisputed').textContent = totalPoints;
    document.getElementById('totalEvents').textContent = appData.events.length;
}

// ===================================
// Participant Functions
// ===================================

function showAddParticipantModal() {
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

function saveParticipant() {
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

    // Check for duplicate names
    if (appData.participants.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        alert('❌ Ya existe un participante con ese nombre');
        return;
    }

    const newParticipant = {
        id: generateId(),
        name: name,
        startingPoints: startingPoints,
        events: []
    };

    appData.participants.push(newParticipant);
    saveData();
    renderRanking();
    hideAddParticipantModal();

    showNotification('✅ Participante agregado correctamente');
}

// ===================================
// Event CRUD Functions
// ===================================

function showAddEventModal() {
    if (!isLoggedIn) {
        alert('❌ Debes iniciar sesión primero');
        return;
    }

    const modal = document.getElementById('addEventModal');

    if (appData.participants.length === 0) {
        alert('❌ Primero debes agregar participantes');
        return;
    }

    // Reset form
    document.getElementById('eventName').value = '';
    document.getElementById('eventDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('eventPoints').value = '1';

    // Populate participant scores
    renderParticipantScoresForm('participantScores');

    modal.classList.add('active');
    document.getElementById('eventName').focus();
}

function hideAddEventModal() {
    const modal = document.getElementById('addEventModal');
    modal.classList.remove('active');
}

function renderParticipantScoresForm(containerId) {
    const container = document.getElementById(containerId);

    container.innerHTML = appData.participants.map(participant => `
        <div class="participant-score-form">
            <h4>${participant.name}</h4>
            <div class="score-input-group">
                <div class="form-group mb-0">
                    <label for="score-${participant.id}">Puntaje (-3 a +3)</label>
                    <input type="number" id="score-${participant.id}" class="input-field" 
                           min="-3" max="3" value="0" step="1">
                </div>
                <div class="form-group mb-0">
                    <label for="desc-${participant.id}">Descripción</label>
                    <textarea id="desc-${participant.id}" class="input-field" 
                              placeholder="Opcional: razón del puntaje"></textarea>
                </div>
            </div>
        </div>
    `).join('');
}

function saveEvent() {
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

    const eventId = generateId();

    // Collect participant scores
    const participantScores = [];
    appData.participants.forEach(participant => {
        const scoreInput = document.getElementById(`score-${participant.id}`);
        const descInput = document.getElementById(`desc-${participant.id}`);
        const score = parseInt(scoreInput.value) || 0;
        const description = descInput.value.trim();

        // Validate score range
        if (score < -3 || score > 3) {
            alert(`❌ El puntaje de ${participant.name} debe estar entre -3 y +3`);
            throw new Error('Invalid score range');
        }

        participantScores.push({
            participantId: participant.id,
            score: score,
            description: description
        });
    });

    // Create event
    const newEvent = {
        id: eventId,
        name: name,
        date: date,
        totalPointsDisputed: totalPointsDisputed
    };

    appData.events.push(newEvent);

    // Add scores to participants
    participantScores.forEach(ps => {
        const participant = appData.participants.find(p => p.id === ps.participantId);
        if (participant) {
            participant.events.push({
                eventId: eventId,
                score: ps.score,
                description: ps.description
            });
        }
    });

    saveData();
    renderRanking();
    renderEvents();
    updateStats();
    hideAddEventModal();

    showNotification('✅ Juntada agregada correctamente');
}

function requestEditEvent(eventId) {
    if (!isLoggedIn) {
        alert('❌ Debes iniciar sesión para editar eventos');
        return;
    }
    showEditEventModal(eventId);
}

function showEditEventModal(eventId) {
    const event = appData.events.find(e => e.id === eventId);
    if (!event) return;

    const modal = document.getElementById('editEventModal');

    // Populate form with event data
    document.getElementById('editEventName').value = event.name;
    document.getElementById('editEventDate').value = event.date;
    document.getElementById('editEventPoints').value = event.totalPointsDisputed;

    // Populate participant scores
    const container = document.getElementById('editParticipantScores');
    container.innerHTML = appData.participants.map(participant => {
        const eventScore = participant.events.find(e => e.eventId === eventId);
        const score = eventScore ? eventScore.score : 0;
        const description = eventScore ? eventScore.description : '';

        return `
            <div class="participant-score-form">
                <h4>${participant.name}</h4>
                <div class="score-input-group">
                    <div class="form-group mb-0">
                        <label for="edit-score-${participant.id}">Puntaje (-3 a +3)</label>
                        <input type="number" id="edit-score-${participant.id}" class="input-field" 
                               min="-3" max="3" value="${score}" step="1">
                    </div>
                    <div class="form-group mb-0">
                        <label for="edit-desc-${participant.id}">Descripción</label>
                        <textarea id="edit-desc-${participant.id}" class="input-field" 
                                  placeholder="Opcional: razón del puntaje">${description}</textarea>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Store current event ID for update
    modal.dataset.eventId = eventId;
    modal.classList.add('active');
}

function hideEditEventModal() {
    const modal = document.getElementById('editEventModal');
    modal.classList.remove('active');
    delete modal.dataset.eventId;
}

function updateEvent() {
    const modal = document.getElementById('editEventModal');
    const eventId = modal.dataset.eventId;
    const event = appData.events.find(e => e.id === eventId);

    if (!event) return;

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

    // Update event
    event.name = name;
    event.date = date;
    event.totalPointsDisputed = totalPointsDisputed;

    // Update participant scores
    appData.participants.forEach(participant => {
        const scoreInput = document.getElementById(`edit-score-${participant.id}`);
        const descInput = document.getElementById(`edit-desc-${participant.id}`);
        const score = parseInt(scoreInput.value) || 0;
        const description = descInput.value.trim();

        // Validate score range
        if (score < -3 || score > 3) {
            alert(`❌ El puntaje de ${participant.name} debe estar entre -3 y +3`);
            throw new Error('Invalid score range');
        }

        // Find and update or create event score
        const eventScoreIndex = participant.events.findIndex(e => e.eventId === eventId);
        if (eventScoreIndex >= 0) {
            participant.events[eventScoreIndex].score = score;
            participant.events[eventScoreIndex].description = description;
        } else {
            participant.events.push({
                eventId: eventId,
                score: score,
                description: description
            });
        }
    });

    saveData();
    renderRanking();
    renderEvents();
    updateStats();
    hideEditEventModal();

    showNotification('✅ Juntada actualizada correctamente');
}

function requestDeleteEvent(eventId) {
    if (!isLoggedIn) {
        alert('❌ Debes iniciar sesión para eliminar eventos');
        return;
    }
    deleteEvent(eventId);
}

function deleteEvent(eventId) {
    if (!confirm('⚠️ ¿Estás seguro de que quieres eliminar esta juntada?')) {
        return;
    }

    // Remove event
    appData.events = appData.events.filter(e => e.id !== eventId);

    // Remove event scores from all participants
    appData.participants.forEach(participant => {
        participant.events = participant.events.filter(e => e.eventId !== eventId);
    });

    saveData();
    renderRanking();
    renderEvents();
    updateStats();

    showNotification('✅ Juntada eliminada correctamente');
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
// Utility Functions
// ===================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function showNotification(message) {
    setTimeout(() => {
        alert(message);
    }, 100);
}

// ===================================
// Excel Export Functions
// ===================================

function exportToExcel() {
    if (!isLoggedIn) {
        alert('❌ Debes iniciar sesión para exportar datos');
        return;
    }

    try {
        // Create a new workbook
        const wb = XLSX.utils.book_new();

        // ===== HOJA 1: Ranking =====
        const rankingData = getRankingData();
        const rankingSheet = [];

        // Headers
        rankingSheet.push(['RANKING TABLA CAVANI 2025']);
        rankingSheet.push([]);
        rankingSheet.push(['Posición', 'Nombre', 'Puntaje Total']);

        // Data
        rankingData.forEach((item, index) => {
            rankingSheet.push([
                `#${index + 1}`,
                item.name,
                item.score
            ]);
        });

        const wsRanking = XLSX.utils.aoa_to_sheet(rankingSheet);

        // Style the ranking sheet
        if (!wsRanking['!cols']) wsRanking['!cols'] = [];
        wsRanking['!cols'][0] = { wch: 12 };
        wsRanking['!cols'][1] = { wch: 25 };
        wsRanking['!cols'][2] = { wch: 15 };

        XLSX.utils.book_append_sheet(wb, wsRanking, 'Ranking');

        // ===== HOJA 2: Eventos Detallados =====
        const eventsSheet = [];

        eventsSheet.push(['HISTORIAL DE JUNTADAS']);
        eventsSheet.push([]);

        if (appData.events.length === 0) {
            eventsSheet.push(['No hay juntadas registradas']);
        } else {
            // Sort events by date
            const sortedEvents = [...appData.events].sort((a, b) =>
                new Date(b.date) - new Date(a.date)
            );

            sortedEvents.forEach((event, eventIndex) => {
                const formattedDate = new Date(event.date).toLocaleDateString('es-AR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                // Event header
                eventsSheet.push([`JUNTADA #${eventIndex + 1}: ${event.name}`]);
                eventsSheet.push(['Fecha:', formattedDate]);
                eventsSheet.push(['Puntos Disputados:', event.totalPointsDisputed || 0]);
                eventsSheet.push([]);
                eventsSheet.push(['Participante', 'Puntaje', 'Descripción']);

                // Participant scores for this event
                appData.participants.forEach(participant => {
                    const eventScore = participant.events.find(e => e.eventId === event.id);
                    if (eventScore && (eventScore.score !== 0 || eventScore.description)) {
                        eventsSheet.push([
                            participant.name,
                            eventScore.score > 0 ? `+${eventScore.score}` : eventScore.score,
                            eventScore.description || '-'
                        ]);
                    }
                });

                eventsSheet.push([]);
                eventsSheet.push([]);
            });
        }

        const wsEvents = XLSX.utils.aoa_to_sheet(eventsSheet);

        // Style the events sheet
        if (!wsEvents['!cols']) wsEvents['!cols'] = [];
        wsEvents['!cols'][0] = { wch: 25 };
        wsEvents['!cols'][1] = { wch: 12 };
        wsEvents['!cols'][2] = { wch: 50 };

        XLSX.utils.book_append_sheet(wb, wsEvents, 'Historial Juntadas');

        // ===== HOJA 3: Resumen General =====
        const summarySheet = [];

        summarySheet.push(['RESUMEN GENERAL TABLA CAVANI 2025']);
        summarySheet.push([]);
        summarySheet.push(['Total de Participantes:', appData.participants.length]);
        summarySheet.push(['Total de Juntadas:', appData.events.length]);

        const totalPoints = appData.events.reduce((sum, event) =>
            sum + (event.totalPointsDisputed || 0), 0
        );
        summarySheet.push(['Total Puntos Disputados:', totalPoints]);
        summarySheet.push([]);
        summarySheet.push(['Fecha de Exportación:', new Date().toLocaleString('es-AR')]);
        summarySheet.push([]);
        summarySheet.push([]);
        summarySheet.push(['ESTADÍSTICAS POR PARTICIPANTE']);
        summarySheet.push([]);
        summarySheet.push(['Participante', 'Juntadas Jugadas', 'Puntaje Total', 'Promedio por Juntada']);

        appData.participants.forEach(participant => {
            const totalScore = calculateParticipantScore(participant.id);
            const eventsPlayed = participant.events.filter(e => e.score !== 0).length;
            const average = eventsPlayed > 0 ? (totalScore / eventsPlayed).toFixed(2) : 0;

            summarySheet.push([
                participant.name,
                eventsPlayed,
                totalScore,
                average
            ]);
        });

        const wsSummary = XLSX.utils.aoa_to_sheet(summarySheet);

        // Style the summary sheet
        if (!wsSummary['!cols']) wsSummary['!cols'] = [];
        wsSummary['!cols'][0] = { wch: 25 };
        wsSummary['!cols'][1] = { wch: 20 };
        wsSummary['!cols'][2] = { wch: 15 };
        wsSummary['!cols'][3] = { wch: 22 };

        XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

        // Generate filename with current date
        const today = new Date().toISOString().split('T')[0];
        const filename = `TablaCavani_2025_${today}.xlsx`;

        // Write and download the file
        XLSX.writeFile(wb, filename);

        showNotification('✅ Excel exportado correctamente');

    } catch (error) {
        console.error('Error exportando Excel:', error);
        alert('❌ Error al exportar Excel: ' + error.message);
    }
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
