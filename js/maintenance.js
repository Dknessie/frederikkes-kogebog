// js/maintenance.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;

/**
 * Initializes the maintenance module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
export function initMaintenance(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        maintenanceLogContainer: document.getElementById('maintenance-log-container'),
        addMaintenanceLogBtn: document.getElementById('add-maintenance-log-btn'),
        maintenanceLogModal: document.getElementById('maintenance-log-modal'),
        maintenanceLogForm: document.getElementById('maintenance-log-form'),
        maintenanceLogModalTitle: document.getElementById('maintenance-log-modal-title'),
    };

    if (appElements.addMaintenanceLogBtn) {
        appElements.addMaintenanceLogBtn.addEventListener('click', openAddMaintenanceLogModal);
    }
    if (appElements.maintenanceLogForm) {
        appElements.maintenanceLogForm.addEventListener('submit', handleSaveMaintenanceLog);
    }
    if (appElements.maintenanceLogContainer) {
        appElements.maintenanceLogContainer.addEventListener('click', handleLogClick);
    }
}

/**
 * Renders the maintenance page, showing logs grouped by room.
 */
export function renderMaintenancePage() {
    const container = appElements.maintenanceLogContainer;
    if (!container) return;
    container.innerHTML = '';
    
    if (appState.maintenanceLogs.length === 0) {
        container.innerHTML = `<p class="empty-state">Ingen vedligeholdelsesopgaver er logget endnu. Klik på knappen for at tilføje den første.</p>`;
        return;
    }

    const logsByRoom = {};
    appState.maintenanceLogs.forEach(log => {
        const roomName = log.room || 'Generelt';
        if (!logsByRoom[roomName]) {
            logsByRoom[roomName] = [];
        }
        logsByRoom[roomName].push(log);
    });

    const fragment = document.createDocumentFragment();
    Object.keys(logsByRoom).sort().forEach(roomName => {
        const roomSection = document.createElement('div');
        roomSection.className = 'maintenance-room-section';
        const roomTitle = document.createElement('h3');
        roomTitle.textContent = roomName;
        roomSection.appendChild(roomTitle);

        const logTable = document.createElement('table');
        logTable.className = 'maintenance-log-table';
        logTable.innerHTML = `
            <thead>
                <tr>
                    <th>Dato</th>
                    <th>Opgave</th>
                    <th>Note</th>
                    <th>Handlinger</th>
                </tr>
            </thead>
            <tbody>
            </tbody>
        `;
        const tbody = logTable.querySelector('tbody');
        logsByRoom[roomName]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .forEach(log => {
                const tr = document.createElement('tr');
                tr.dataset.id = log.id;
                tr.innerHTML = `
                    <td>${formatDate(log.date)}</td>
                    <td>${log.task}</td>
                    <td>${log.note || ''}</td>
                    <td>
                        <button class="btn-icon edit-log-btn" title="Rediger"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete-log-btn" title="Slet"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        
        roomSection.appendChild(logTable);
        fragment.appendChild(roomSection);
    });

    container.appendChild(fragment);
}

/**
 * Opens the modal to add a new maintenance log entry.
 */
function openAddMaintenanceLogModal() {
    const modal = appElements.maintenanceLogModal;
    appElements.maintenanceLogModalTitle.textContent = 'Log ny vedligeholdelsesopgave';
    appElements.maintenanceLogForm.reset();
    document.getElementById('maintenance-log-id').value = '';
    document.getElementById('maintenance-log-date').value = formatDate(new Date());

    populateReferenceDropdown(document.getElementById('maintenance-log-room'), appState.references.rooms, 'Vælg rum...');
    populateReferenceDropdown(document.getElementById('maintenance-log-task'), appState.references.maintenanceTasks, 'Vælg opgave...');

    modal.classList.remove('hidden');
}

/**
 * Opens the modal to edit an existing maintenance log entry.
 * @param {string} logId - The ID of the log to edit.
 */
function openEditMaintenanceLogModal(logId) {
    const log = appState.maintenanceLogs.find(l => l.id === logId);
    if (!log) return;

    const modal = appElements.maintenanceLogModal;
    appElements.maintenanceLogModalTitle.textContent = 'Rediger log';
    appElements.maintenanceLogForm.reset();
    document.getElementById('maintenance-log-id').value = log.id;
    document.getElementById('maintenance-log-date').value = log.date;
    document.getElementById('maintenance-log-note').value = log.note || '';

    populateReferenceDropdown(document.getElementById('maintenance-log-room'), appState.references.rooms, 'Vælg rum...', log.room);
    populateReferenceDropdown(document.getElementById('maintenance-log-task'), appState.references.maintenanceTasks, 'Vælg opgave...', log.task);

    modal.classList.remove('hidden');
}

/**
 * Handles saving a maintenance log from the modal form.
 * @param {Event} e - The form submission event.
 */
async function handleSaveMaintenanceLog(e) {
    e.preventDefault();
    const logId = document.getElementById('maintenance-log-id').value;
    const logData = {
        date: document.getElementById('maintenance-log-date').value,
        room: document.getElementById('maintenance-log-room').value,
        task: document.getElementById('maintenance-log-task').value,
        note: document.getElementById('maintenance-log-note').value.trim(),
        userId: appState.currentUser.uid
    };

    if (!logData.date || !logData.task) {
        showNotification({ title: "Udfyld påkrævede felter", message: "Dato og opgave skal være udfyldt." });
        return;
    }

    try {
        if (logId) {
            await updateDoc(doc(db, 'maintenance_logs', logId), logData);
        } else {
            await addDoc(collection(db, 'maintenance_logs'), logData);
        }
        appElements.maintenanceLogModal.classList.add('hidden');
        showNotification({ title: "Gemt!", message: "Din vedligeholdelseslog er blevet gemt." });
    } catch (error) {
        handleError(error, "Loggen kunne ikke gemmes.", "saveMaintenanceLog");
    }
}

/**
 * Handles clicks within the maintenance log list (edit, delete).
 * @param {Event} e - The click event.
 */
async function handleLogClick(e) {
    const editBtn = e.target.closest('.edit-log-btn');
    const deleteBtn = e.target.closest('.delete-log-btn');

    if (editBtn) {
        const logId = editBtn.closest('tr').dataset.id;
        openEditMaintenanceLogModal(logId);
    }

    if (deleteBtn) {
        const logId = deleteBtn.closest('tr').dataset.id;
        const confirmed = await showNotification({
            title: "Slet Log",
            message: "Er du sikker på, du vil slette denne logning? Handlingen kan ikke fortrydes.",
            type: 'confirm'
        });
        if (confirmed) {
            try {
                await deleteDoc(doc(db, 'maintenance_logs', logId));
                showNotification({ title: "Slettet", message: "Logningen er blevet slettet." });
            } catch (error) {
                handleError(error, "Logningen kunne ikke slettes.", "deleteMaintenanceLog");
            }
        }
    }
}

/**
 * Helper to populate a dropdown select element.
 * @param {HTMLElement} selectElement - The <select> element.
 * @param {Array<string>} options - An array of string options.
 * @param {string} placeholder - The placeholder text.
 * @param {string} [currentValue] - The value to pre-select.
 */
function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    selectElement.value = currentValue || "";
}
