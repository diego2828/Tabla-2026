// ===================================
// TABLA CAVANI 2026 - Main Script
// ===================================

// Password Protection with Obfuscation
// Using Base64 + simple character shifting to hide from simple inspection
const PROTECTED_KEY = btoa('123Admin987').split('').map(c =>
    String.fromCharCode(c.charCodeAt(0) + 3)
).join('');

// Data Structure
let appData = {
    participants: [],
    events: [],
    globalStats: {
        totalPointsDisputed: 0
    }
};

// Login state
let isLoggedIn = false;

// Current action context for password modal
let currentAction = null;
let currentEventId = null;

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
    const savedData = localStorage.getItem('tablaCavani2026');
    if (savedData) {
        try {
            appData = JSON.parse(savedData);
        } catch (e) {
            console.error('Error loading data:', e);
        }
    }
}

function saveData() {
    localStorage.setItem('tablaCavani2026', JSON.stringify(appData));
}

// ===================================
// Login Management
// ===================================

function checkLoginStatus() {
    isLoggedIn = localStorage.getItem('escribanoLoggedIn') === 'true';
}

function login() {
    console.log('✅ Login successful!');
    isLoggedIn = true;
    localStorage.setItem('escribanoLoggedIn', 'true');
    updateLoginUI();
    alert('✅ Inicio de sesión exitoso');
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
        if (exportBtn) exportBtn.disabled = false;
    } else {
        loginBtn.innerHTML = '🔒 Login Escribano';
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
        showPasswordModal('login');
    }
}

// ===================================
// Password Protection
// ===================================

function verifyPassword(input) {
    // Simple PIN check
    // Clave retirada: esta version quedo obsoleta. El login real usa
    // Supabase Auth (ver script.js). No reutilizar este archivo.
    return false;
}

function showPasswordModal(action, eventId = null) {
    currentAction = action;
    currentEventId = eventId;
    const modal = document.getElementById('passwordModal');
    const input = document.getElementById('pinInput');
    input.value = '';
    modal.classList.add('active');
    input.focus();
}

function hidePasswordModal() {
    const modal = document.getElementById('passwordModal');
    modal.classList.remove('active');
    currentAction = null;
    currentEventId = null;
}

function handlePasswordSubmit() {
    const input = document.getElementById('pinInput');
    const password = input.value;

    console.log('🔍 PIN ingresado:', password);
    console.log('🔍 Verificando...', verifyPassword(password));
    console.log('🔍 currentAction:', currentAction);

    if (verifyPassword(password)) {
        console.log('✅ PIN correcto! Cerrando modal y ejecutando acción...');
        executeAction();      // Primero ejecutar la acción
        hidePasswordModal();  // Después cerrar el modal
    } else {
        console.log('❌ PIN incorrecto');
        alert('❌ Contraseña incorrecta');
        input.value = '';
        input.focus();
    }
}

function executeAction() {
    console.log('🎯 Ejecutando acción:', currentAction);
    switch (currentAction) {
        case 'login':
            console.log('🔐 Caso: login');
            login();
            break;
        case 'addParticipant':
            showAddParticipantModal();
            break;
        case 'addEvent':
            showAddEventModal();
            break;
        case 'editEvent':
            showEditEventModal(currentEventId);
            break;
        case 'deleteEvent':
            deleteEvent(currentEventId);
            break;
        default:
            console.log('⚠️ Acción no reconocida:', currentAction);
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
                        <button class="btn btn-small btn-primary" onclick="requestEditEvent('${event.id}')">
                            ✏️ Editar
                        </button>
                        <button class="btn btn-small btn-danger" onclick="requestDeleteEvent('${event.id}')">
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

    appData.globalStats.totalPointsDisputed = totalPoints;

    document.getElementById('totalPointsDisputed').textContent = totalPoints;
    document.getElementById('totalEvents').textContent = appData.events.length;
}

// ===================================
// Participant Functions
// ===================================

function showAddParticipantModal() {
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

    // Show success message
    showNotification('✅ Participante agregado correctamente');
}

// ===================================
// Event CRUD Functions
// ===================================

function showAddEventModal() {
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
    // Simple notification using alert for now
    // Can be enhanced with custom notification UI
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

    // Action buttons
    document.getElementById('btnAddParticipant').addEventListener('click', () => {
        if (!isLoggedIn) {
            alert('❌ Debes iniciar sesión primero');
            return;
        }
        showAddParticipantModal();
    });

    document.getElementById('btnAddEvent').addEventListener('click', () => {
        if (!isLoggedIn) {
            alert('❌ Debes iniciar sesión primero');
            return;
        }
        showAddEventModal();
    });

    document.getElementById('btnExportExcel').addEventListener('click', () => {
        if (!isLoggedIn) {
            alert('❌ Debes iniciar sesión para exportar datos');
            return;
        }
        exportToExcel();
    });

    document.getElementById('btnReglamento').addEventListener('click', showReglamentoModal);

    // Password modal
    document.getElementById('btnPasswordSubmit').addEventListener('click', handlePasswordSubmit);
    document.getElementById('btnPasswordCancel').addEventListener('click', hidePasswordModal);
    document.getElementById('pinInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handlePasswordSubmit();
        }
    });

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

// ===================================
// Excel Export Function
// ===================================

function exportToExcel() {
    try {
        // Create workbook
        const wb = XLSX.utils.book_new();

        // ===== HOJA 1: Ranking =====
        const rankingData = getRankingData();
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

        if (appData.events.length === 0) {
            eventsSheet.push(['No hay juntadas registradas']);
        } else {
            appData.events.forEach((event, eventIndex) => {
                const formattedDate = new Date(event.date).toLocaleDateString('es-AR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                eventsSheet.push([`JUNTADA #${eventIndex + 1}: ${event.name}`]);
                eventsSheet.push(['Fecha:', formattedDate]);
                eventsSheet.push(['Puntos Disputados:', event.totalPointsDisputed || 0]);
                eventsSheet.push([]);
                eventsSheet.push(['Participante', 'Puntaje', 'Descripción']);

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
        if (!wsEvents['!cols']) wsEvents['!cols'] = [];
        wsEvents['!cols'][0] = { wch: 25 };
        wsEvents['!cols'][1] = { wch: 12 };
        wsEvents['!cols'][2] = { wch: 50 };

        XLSX.utils.book_append_sheet(wb, wsEvents, 'Historial Juntadas');

        // Generate filename
        const today = new Date().toISOString().split('T')[0];
        const filename = `TablaCavani_2026_${today}.xlsx`;

        XLSX.writeFile(wb, filename);

        alert('✅ Excel exportado correctamente');

    } catch (error) {
        console.error('Error exporting Excel:', error);
        alert('❌ Error al exportar Excel: ' + error.message);
    }
}

// Make functions globally available for onclick handlers
window.requestEditEvent = requestEditEvent;
window.requestDeleteEvent = requestDeleteEvent;
