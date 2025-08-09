// js/ugeplan.js

import { db } from './firebase.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { getWeekNumber } from './utils.js';

let appState;
let appElements;
let currentWeekId;

/**
 * Initializes the weekly plan module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
export function initUgeplan(state, elements) {
    appState = state;
    appElements = elements;

    // Event delegation for adding tasks and checking boxes
    if (appElements.ugeplanContainer) {
        appElements.ugeplanContainer.addEventListener('submit', handleAddTask);
        appElements.ugeplanContainer.addEventListener('change', handleCheckboxChange);
    }
}

/**
 * Renders the entire weekly plan page.
 */
export function renderUgeplan() {
    const today = new Date();
    const weekNumber = getWeekNumber(today);
    currentWeekId = `${today.getFullYear()}-W${weekNumber}`;
    
    appElements.ugeplanTitle.textContent = `Uge ${weekNumber}, ${today.getFullYear()}`;
    const container = appElements.ugeplanContainer;
    container.innerHTML = '';

    const rooms = appState.references.rooms || [];
    if (rooms.length === 0) {
        container.innerHTML = `<p class="empty-state">Du skal oprette "Rum" under "Referencer" for at kunne bruge ugeplanen.</p>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    rooms.sort().forEach(roomName => {
        const section = createRoomSection(roomName);
        fragment.appendChild(section);
    });
    container.appendChild(fragment);
}

/**
 * Creates the HTML structure for a single room section.
 * @param {string} roomName - The name of the room.
 * @returns {HTMLElement} The created section element.
 */
function createRoomSection(roomName) {
    const section = document.createElement('div');
    section.className = 'ugeplan-room-section';
    section.dataset.room = roomName;

    const roomData = appState.weeklyPlan.rooms?.[roomName] || { tasks: [] };
    const tasksHTML = roomData.tasks.map(createTaskRow).join('');

    section.innerHTML = `
        <h4>${roomName}</h4>
        <div class="ugeplan-task-list">
            ${tasksHTML}
        </div>
        <form class="add-ugeplan-task-form">
            <input type="text" placeholder="Tilføj ny opgave til ${roomName}..." required>
        </form>
    `;
    return section;
}

/**
 * Creates the HTML for a single task row.
 * @param {object} task - The task object { id, name, days: { mon: true, ... } }.
 * @returns {string} The HTML string for the row.
 */
function createTaskRow(task) {
    const days = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
    const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    const checkboxesHTML = days.map((day, index) => {
        const dayKey = dayKeys[index];
        const isChecked = task.days && task.days[dayKey];
        return `
            <div class="ugeplan-day-checkbox">
                <label for="task-${task.id}-${dayKey}">${day}</label>
                <input type="checkbox" id="task-${task.id}-${dayKey}" data-task-id="${task.id}" data-day="${dayKey}" ${isChecked ? 'checked' : ''}>
            </div>
        `;
    }).join('');

    return `
        <div class="ugeplan-task-row" data-task-id="${task.id}">
            <span class="ugeplan-task-name">${task.name}</span>
            <div class="ugeplan-task-days">
                ${checkboxesHTML}
            </div>
        </div>
    `;
}

/**
 * Handles the form submission for adding a new task.
 * @param {Event} e - The submit event.
 */
async function handleAddTask(e) {
    e.preventDefault();
    if (!e.target.classList.contains('add-ugeplan-task-form')) return;

    const input = e.target.querySelector('input');
    const taskName = input.value.trim();
    const roomName = e.target.closest('.ugeplan-room-section').dataset.room;

    if (!taskName || !roomName) return;

    const newTask = {
        id: crypto.randomUUID(),
        name: taskName,
        days: {} // Initial state with no days checked
    };

    // Optimistic UI update
    const taskList = e.target.previousElementSibling;
    taskList.insertAdjacentHTML('beforeend', createTaskRow(newTask));
    input.value = '';

    // Update state and save to Firestore
    const plan = appState.weeklyPlan;
    if (!plan.rooms) plan.rooms = {};
    if (!plan.rooms[roomName]) plan.rooms[roomName] = { tasks: [] };
    plan.rooms[roomName].tasks.push(newTask);
    
    await saveWeeklyPlan();
}

/**
 * Handles the change event for any checkbox in the plan.
 * @param {Event} e - The change event.
 */
async function handleCheckboxChange(e) {
    if (e.target.type !== 'checkbox') return;

    const checkbox = e.target;
    const taskId = checkbox.dataset.taskId;
    const day = checkbox.dataset.day;
    const roomName = checkbox.closest('.ugeplan-room-section').dataset.room;
    const isChecked = checkbox.checked;

    // Update state and save to Firestore
    const plan = appState.weeklyPlan;
    const task = plan.rooms?.[roomName]?.tasks.find(t => t.id === taskId);

    if (task) {
        if (!task.days) task.days = {};
        task.days[day] = isChecked;
        await saveWeeklyPlan();
    }
}

/**
 * Saves the entire current weekly plan to Firestore.
 */
async function saveWeeklyPlan() {
    try {
        const planRef = doc(db, 'weekly_plans', currentWeekId);
        // Ensure the plan has the userId before saving
        const dataToSave = {
            ...appState.weeklyPlan,
            userId: appState.currentUser.uid
        };
        await setDoc(planRef, dataToSave, { merge: true });
    } catch (error) {
        handleError(error, "Kunne ikke gemme ugeplanen.", "saveWeeklyPlan");
    }
}
