// js/weeklyPlan.js

// This module handles all logic for the new "Weekly Plan" (Ugeplan) feature on the Hjem page.

import { db } from './firebase.js';
import { doc, setDoc, updateDoc, arrayUnion, arrayRemove, getDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;

/**
 * Initializes the weekly plan module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
export function initWeeklyPlan(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        weeklyPlanGrid: document.getElementById('weekly-plan-grid'),
        addWeeklyPlanRowBtn: document.getElementById('add-weekly-plan-row-btn'),
        weeklyPlanRoomSelect: document.getElementById('weekly-plan-room-select'),
        weeklyPlanTaskSelect: document.getElementById('weekly-plan-task-select'),
    };

    if (appElements.addWeeklyPlanRowBtn) {
        appElements.addWeeklyPlanRowBtn.addEventListener('click', handleAddRowToPlan);
    }

    if (appElements.weeklyPlanGrid) {
        appElements.weeklyPlanGrid.addEventListener('change', handleCheckboxChange);
    }
}

/**
 * Renders the entire weekly plan grid.
 */
export function renderWeeklyPlan() {
    if (!appElements.weeklyPlanGrid) return;
    
    // Populate dropdowns
    populateReferenceDropdown(appElements.weeklyPlanRoomSelect, appState.references.rooms, 'Vælg rum...');
    populateReferenceDropdown(appElements.weeklyPlanTaskSelect, appState.references.maintenanceTasks, 'Vælg opgave...');

    const gridBody = appElements.weeklyPlanGrid.querySelector('tbody');
    gridBody.innerHTML = ''; // Clear existing rows

    const weeklyPlanData = appState.preferences.weeklyPlan || [];

    if (weeklyPlanData.length === 0) {
        gridBody.innerHTML = '<tr><td colspan="9" class="empty-state">Ugeplanen er tom. Tilføj rum og opgaver for at komme i gang.</td></tr>';
        return;
    }

    weeklyPlanData.forEach(rowData => {
        const row = document.createElement('tr');
        row.dataset.room = rowData.room;
        row.dataset.task = rowData.task;

        let checkboxHTML = '';
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        days.forEach(day => {
            const isChecked = rowData.completed && rowData.completed[day];
            checkboxHTML += `<td><input type="checkbox" data-day="${day}" ${isChecked ? 'checked' : ''}></td>`;
        });

        row.innerHTML = `
            <td>${rowData.room}</td>
            <td>${rowData.task}</td>
            ${checkboxHTML}
            <td><button class="btn-icon remove-row-btn"><i class="fas fa-trash"></i></button></td>
        `;
        gridBody.appendChild(row);
    });
}

/**
 * Handles adding a new room/task combination to the weekly plan.
 */
async function handleAddRowToPlan() {
    const room = appElements.weeklyPlanRoomSelect.value;
    const task = appElements.weeklyPlanTaskSelect.value;

    if (!room || !task) {
        showNotification({ title: 'Mangler Valg', message: 'Vælg venligst både et rum og en opgave.' });
        return;
    }

    const currentPlan = appState.preferences.weeklyPlan || [];
    const alreadyExists = currentPlan.some(row => row.room === room && row.task === task);

    if (alreadyExists) {
        showNotification({ title: 'Findes Allerede', message: 'Denne kombination af rum og opgave er allerede på ugeplanen.' });
        return;
    }

    const newRow = {
        room: room,
        task: task,
        completed: { mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false }
    };

    const preferencesRef = doc(db, 'users', appState.currentUser.uid, 'settings', 'preferences');
    try {
        await updateDoc(preferencesRef, {
            weeklyPlan: arrayUnion(newRow)
        });
        showNotification({ title: 'Tilføjet', message: 'Rækken er blevet tilføjet til din ugeplan.' });
    } catch (error) {
        handleError(error, 'Kunne ikke tilføje række til ugeplan.', 'addWeeklyPlanRow');
    }
}

/**
 * Handles changes to any checkbox in the grid, saving the state.
 * @param {Event} e - The change event from the checkbox.
 */
async function handleCheckboxChange(e) {
    if (e.target.type !== 'checkbox') return;

    const row = e.target.closest('tr');
    const room = row.dataset.room;
    const task = row.dataset.task;
    const day = e.target.dataset.day;
    const isChecked = e.target.checked;

    const currentPlan = appState.preferences.weeklyPlan || [];
    const planIndex = currentPlan.findIndex(p => p.room === room && p.task === task);

    if (planIndex === -1) return;

    // Create a new object to avoid directly mutating state
    const updatedPlan = [...currentPlan];
    updatedPlan[planIndex].completed[day] = isChecked;

    const preferencesRef = doc(db, 'users', appState.currentUser.uid, 'settings', 'preferences');
    try {
        await setDoc(preferencesRef, { weeklyPlan: updatedPlan }, { merge: true });
    } catch (error) {
        handleError(error, 'Kunne ikke gemme ændring i ugeplan.', 'updateWeeklyPlanCheckbox');
    }
}

/**
 * Helper to populate a dropdown select element.
 * @param {HTMLElement} selectElement - The <select> element.
 * @param {Array<string>} options - An array of string options.
 * @param {string} placeholder - The placeholder text.
 */
function populateReferenceDropdown(selectElement, options, placeholder) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
}
