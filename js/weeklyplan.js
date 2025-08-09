// js/weeklyPlan.js

import { db } from './firebase.js';
import { doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { getWeekNumber, getStartOfWeek, formatDate } from './utils.js';

let appState;
let appElements;

export function initWeeklyPlan(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        // Cache elements specific to the weekly plan view
        wpContainer: document.getElementById('weekly-plan-container'),
        wpTitle: document.getElementById('wp-title'),
        wpPrevBtn: document.getElementById('wp-prev-week-btn'),
        wpNextBtn: document.getElementById('wp-next-week-btn'),
        wpCopyBtn: document.getElementById('wp-copy-prev-week-btn'),
        wpClearBtn: document.getElementById('wp-clear-week-btn'),
        addRoomForm: document.getElementById('add-room-to-plan-form'),
    };

    // Navigation
    if (appElements.wpPrevBtn) appElements.wpPrevBtn.addEventListener('click', () => navigateWeek(-1));
    if (appElements.wpNextBtn) appElements.wpNextBtn.addEventListener('click', () => navigateWeek(1));
    
    // Actions
    if (appElements.wpClearBtn) appElements.wpClearBtn.addEventListener('click', clearWeek);
    if (appElements.wpCopyBtn) appElements.wpCopyBtn.addEventListener('click', copyPreviousWeek);

    // Forms
    if (appElements.addRoomForm) appElements.addRoomForm.addEventListener('submit', addRoomToPlan);

    // Event Delegation for the main container
    if (appElements.wpContainer) {
        appElements.wpContainer.addEventListener('submit', handleTaskSubmit);
        appElements.wpContainer.addEventListener('change', handleCheckboxChange);
        appElements.wpContainer.addEventListener('click', handleContainerClick);
    }
}

function navigateWeek(direction) {
    appState.currentDate.setDate(appState.currentDate.getDate() + (7 * direction));
    renderWeeklyPlan();
}

async function fetchWeeklyPlan(year, week) {
    if (!appState.currentUser) return null;
    const docId = `plan_${year}_${week}_${appState.currentUser.uid}`;
    const docRef = doc(db, 'weekly_plans', docId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        appState.weeklyPlan = docSnap.data();
    } else {
        appState.weeklyPlan = { id: docId, year, week, rooms: [] };
    }
}

export async function renderWeeklyPlan() {
    const startOfWeek = getStartOfWeek(appState.currentDate);
    const week = getWeekNumber(startOfWeek);
    const year = startOfWeek.getFullYear();

    await fetchWeeklyPlan(year, week);
    
    appElements.wpTitle.textContent = `Ugeplan for Uge ${week}, ${year}`;
    appElements.wpContainer.innerHTML = ''; // Clear previous content

    if (!appState.weeklyPlan || appState.weeklyPlan.rooms.length === 0) {
        appElements.wpContainer.innerHTML = `<p class="empty-state">Ugeplanen er tom. Tilføj et rum nedenfor for at starte.</p>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    appState.weeklyPlan.rooms.forEach(room => {
        fragment.appendChild(createRoomSection(room));
    });
    appElements.wpContainer.appendChild(fragment);
}

function createRoomSection(room) {
    const section = document.createElement('div');
    section.className = 'wp-room-section';
    section.dataset.roomId = room.id;

    const days = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
    const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    const headerHTML = days.map(day => `<div class="wp-grid-header">${day}</div>`).join('');
    
    const tasksHTML = room.tasks.map(task => {
        const checkboxesHTML = dayKeys.map(day => `
            <div class="wp-day-checkbox">
                <input type="checkbox" data-task-id="${task.id}" data-day="${day}" ${task.completedDays.includes(day) ? 'checked' : ''}>
            </div>
        `).join('');
        return `
            <div class="wp-task-name">
                <span>${task.name}</span>
                <button class="btn-icon delete-task-btn" data-task-id="${task.id}" title="Slet opgave"><i class="fas fa-trash"></i></button>
            </div>
            ${checkboxesHTML}
        `;
    }).join('');

    section.innerHTML = `
        <div class="wp-room-header">
            <h3>${room.name}</h3>
            <button class="btn-icon delete-room-btn" title="Fjern rum fra ugeplan"><i class="fas fa-trash"></i></button>
        </div>
        <div class="wp-grid">
            <div class="wp-grid-header">Opgave</div>
            ${headerHTML}
            ${tasksHTML}
        </div>
        <form class="add-task-form">
            <div class="input-group">
                <input type="text" placeholder="Tilføj ny opgave..." required>
            </div>
            <button type="submit" class="btn btn-secondary"><i class="fas fa-plus"></i></button>
        </form>
    `;
    return section;
}

async function addRoomToPlan(e) {
    e.preventDefault();
    const input = document.getElementById('add-room-name-input');
    const roomName = input.value.trim();
    if (!roomName) return;

    if (appState.weeklyPlan.rooms.some(r => r.name.toLowerCase() === roomName.toLowerCase())) {
        showNotification({ title: "Rum findes allerede", message: "Dette rum er allerede på ugeplanen." });
        return;
    }

    const newRoom = {
        id: crypto.randomUUID(),
        name: roomName,
        tasks: []
    };

    appState.weeklyPlan.rooms.push(newRoom);
    await saveCurrentWeeklyPlan();
    input.value = '';
}

function handleTaskSubmit(e) {
    if (e.target.classList.contains('add-task-form')) {
        e.preventDefault();
        const form = e.target;
        const input = form.querySelector('input');
        const taskName = input.value.trim();
        const roomId = form.closest('.wp-room-section').dataset.roomId;
        if (!taskName || !roomId) return;

        const room = appState.weeklyPlan.rooms.find(r => r.id === roomId);
        if (room) {
            const newTask = {
                id: crypto.randomUUID(),
                name: taskName,
                completedDays: []
            };
            room.tasks.push(newTask);
            saveCurrentWeeklyPlan();
            input.value = '';
        }
    }
}

function handleCheckboxChange(e) {
    if (e.target.type === 'checkbox') {
        const checkbox = e.target;
        const roomId = checkbox.closest('.wp-room-section').dataset.roomId;
        const taskId = checkbox.dataset.taskId;
        const day = checkbox.dataset.day;

        const room = appState.weeklyPlan.rooms.find(r => r.id === roomId);
        const task = room?.tasks.find(t => t.id === taskId);

        if (task) {
            if (checkbox.checked) {
                if (!task.completedDays.includes(day)) {
                    task.completedDays.push(day);
                }
            } else {
                task.completedDays = task.completedDays.filter(d => d !== day);
            }
            saveCurrentWeeklyPlan();
        }
    }
}

function handleContainerClick(e) {
    const deleteRoomBtn = e.target.closest('.delete-room-btn');
    const deleteTaskBtn = e.target.closest('.delete-task-btn');

    if (deleteRoomBtn) {
        const roomId = deleteRoomBtn.closest('.wp-room-section').dataset.roomId;
        appState.weeklyPlan.rooms = appState.weeklyPlan.rooms.filter(r => r.id !== roomId);
        saveCurrentWeeklyPlan();
    }

    if (deleteTaskBtn) {
        const roomId = deleteTaskBtn.closest('.wp-room-section').dataset.roomId;
        const taskId = deleteTaskBtn.dataset.taskId;
        const room = appState.weeklyPlan.rooms.find(r => r.id === roomId);
        if (room) {
            room.tasks = room.tasks.filter(t => t.id !== taskId);
            saveCurrentWeeklyPlan();
        }
    }
}

async function clearWeek() {
    const confirmed = await showNotification({
        title: "Ryd Ugeplan",
        message: "Er du sikker på, du vil slette alle rum og opgaver for denne uge?",
        type: 'confirm'
    });
    if (confirmed) {
        appState.weeklyPlan.rooms = [];
        await saveCurrentWeeklyPlan();
    }
}

async function copyPreviousWeek() {
    const confirmed = await showNotification({
        title: "Kopiér Sidste Uge",
        message: "Dette vil overskrive den nuværende ugeplan med opgaverne fra sidste uge. Er du sikker?",
        type: 'confirm'
    });
    if (!confirmed) return;

    const currentStartOfWeek = getStartOfWeek(appState.currentDate);
    const prevDate = new Date(currentStartOfWeek);
    prevDate.setDate(prevDate.getDate() - 7);
    
    const prevWeek = getWeekNumber(prevDate);
    const prevYear = prevDate.getFullYear();

    const prevDocId = `plan_${prevYear}_${prevWeek}_${appState.currentUser.uid}`;
    const prevDocRef = doc(db, 'weekly_plans', prevDocId);
    const prevDocSnap = await getDoc(prevDocRef);

    if (prevDocSnap.exists()) {
        const prevPlan = prevDocSnap.data();
        // Reset completed days when copying
        prevPlan.rooms.forEach(room => {
            room.tasks.forEach(task => {
                task.completedDays = [];
            });
        });
        appState.weeklyPlan.rooms = prevPlan.rooms;
        await saveCurrentWeeklyPlan();
        showNotification({title: "Kopieret!", message: "Sidste uges plan er blevet kopieret."});
    } else {
        showNotification({title: "Ingen Data", message: "Kunne ikke finde en plan for sidste uge."});
    }
}

async function saveCurrentWeeklyPlan() {
    if (!appState.currentUser || !appState.weeklyPlan) return;
    try {
        const docRef = doc(db, 'weekly_plans', appState.weeklyPlan.id);
        await setDoc(docRef, appState.weeklyPlan);
        renderWeeklyPlan(); // Re-render to reflect changes
    } catch (error) {
        handleError(error, "Ugeplanen kunne ikke gemmes.", "saveWeeklyPlan");
    }
}
