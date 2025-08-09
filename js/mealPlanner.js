// js/mealPlanner.js

import { db } from './firebase.js';
import { doc, setDoc, writeBatch, deleteField, updateDoc, arrayUnion, arrayRemove, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { getWeekNumber, getStartOfWeek, formatDate, debounce } from './utils.js';
import { confirmAndDeductIngredients } from './kitchenCounter.js';
import { openEventModal } from './events.js';

let appState;
let appElements;
let calendarEventState = {
    date: null,
    meal: null
};
let calendarViewState = {
    currentView: 'week', // 'week' or 'month'
    draggedEventData: null,
    dayDetailsDate: null,
    mobileCurrentDayIndex: 0 // 0 for Monday, 6 for Sunday
};

export function initMealPlanner(state, elements) {
    appState = state;
    appElements = elements;

    // View Toggle
    appElements.weekViewBtn.addEventListener('click', () => switchCalendarView('week'));
    appElements.monthViewBtn.addEventListener('click', () => switchCalendarView('month'));

    // Navigation
    appElements.prevPeriodBtn.addEventListener('click', () => navigateCalendarPeriod(-1));
    appElements.nextPeriodBtn.addEventListener('click', () => navigateCalendarPeriod(1));

    // Main Actions
    appElements.clearMealPlanBtn.addEventListener('click', handleClearMealPlan);

    // Event Delegation for Grids
    appElements.calendarGrid.addEventListener('click', handleCalendarClick);
    appElements.calendarMonthGrid.addEventListener('click', handleMonthGridClick);

    // Drag and Drop Listeners
    setupDragAndDrop();
    
    // Modals
    appElements.planMealForm.addEventListener('submit', handlePlanMealSubmit);
    appElements.calendarEventViewChooser.addEventListener('click', handleCalendarEventViewChoice);
    appElements.calendarRecipeSearch.addEventListener('input', debounce(e => populateCalendarRecipeList(e.target.value), 300));
    appElements.calendarRecipeList.addEventListener('click', handleCalendarRecipeSelect);
    appElements.calendarProjectList.addEventListener('click', handleCalendarProjectSelect);
    appElements.calendarTaskSearch.addEventListener('input', debounce(e => populateCalendarTaskList(e.target.value), 300));
    appElements.calendarTaskList.addEventListener('click', handleCalendarTaskSelect);
    appElements.calendarTaskForm.addEventListener('submit', handleCalendarTaskSubmit);

    // Listeners for Day Details Modal
    if (appElements.dayDetailsModal) {
        appElements.dayDetailsModal.addEventListener('click', e => {
            const eventDiv = e.target.closest('[data-event]');
            if (eventDiv) {
                const eventData = JSON.parse(eventDiv.dataset.event);
                if (eventData.type === 'personal') {
                    appElements.dayDetailsModal.classList.add('hidden'); // Close details before opening edit
                    openEventModal(null, eventData);
                }
            } else if (e.target.closest('#day-details-add-event-btn')) {
                appElements.dayDetailsModal.classList.add('hidden'); // Close details before opening new
                openEventModal(calendarViewState.dayDetailsDate);
            }
        });
    }
}

function switchCalendarView(view) {
    calendarViewState.currentView = view;
    appElements.weekViewBtn.classList.toggle('active', view === 'week');
    appElements.monthViewBtn.classList.toggle('active', view === 'month');
    appElements.calendarWeekView.classList.toggle('active', view === 'week');
    appElements.calendarMonthView.classList.toggle('active', view === 'month');
    renderMealPlanner();
}

function navigateCalendarPeriod(direction) {
    const isMobile = window.innerWidth <= 768;
    if (calendarViewState.currentView === 'week') {
        if (isMobile) {
            // Navigate day by day on mobile
            appState.currentDate.setDate(appState.currentDate.getDate() + direction);
        } else {
            // Navigate week by week on desktop
            appState.currentDate.setDate(appState.currentDate.getDate() + (7 * direction));
        }
    } else {
        appState.currentDate.setMonth(appState.currentDate.getMonth() + direction, 1);
    }
    renderMealPlanner();
}

export function renderMealPlanner() {
    if (!appState.recipes || !appState.inventory) return;
    
    if (calendarViewState.currentView === 'week') {
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            // Mobile Day View
            const today = new Date(appState.currentDate);
            appElements.calendarTitle.textContent = today.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });
        } else {
            // Desktop Week View
            const startOfWeek = getStartOfWeek(appState.currentDate);
            appElements.calendarTitle.textContent = `Uge ${getWeekNumber(startOfWeek)}, ${startOfWeek.getFullYear()}`;
        }
        renderWeekView();
    } else {
        appElements.calendarTitle.textContent = appState.currentDate.toLocaleDateString('da-DK', { month: 'long', year: 'numeric' });
        renderMonthView();
    }
}

function renderWeekView() {
    const grid = appElements.calendarGrid;
    const header = appElements.calendarWeekHeader;
    grid.innerHTML = '';
    header.innerHTML = '';

    const startOfWeek = getStartOfWeek(appState.currentDate);
    const days = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
    const isMobile = window.innerWidth <= 768;
    const mobileCurrentDay = appState.currentDate.getDay(); // 0=Sun, 1=Mon
    const mobileCurrentDayIndex = mobileCurrentDay === 0 ? 6 : mobileCurrentDay - 1;

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setDate(startOfWeek.getDate() + i);
        
        const headerEl = document.createElement('div');
        headerEl.className = 'calendar-week-day-header';
        headerEl.innerHTML = `<span>${days[i]}</span><span class="date-number">${dayDate.getDate()}</span>`;
        header.appendChild(headerEl);

        const dayCard = document.createElement('div');
        dayCard.className = 'calendar-day-card';
        if (formatDate(dayDate) === formatDate(new Date())) {
            dayCard.classList.add('is-today');
        }
        // On mobile, only show the current day
        if (isMobile && i === mobileCurrentDayIndex) {
            dayCard.classList.add('mobile-visible');
        }

        dayCard.innerHTML = `
            <div class="meal-slot" data-date="${formatDate(dayDate)}" data-meal="events">
                 <button class="add-event-to-slot-btn" title="Tilføj begivenhed"><i class="fas fa-plus"></i></button>
            </div>
            <div class="meal-slot" data-date="${formatDate(dayDate)}" data-meal="breakfast">
                 <button class="add-event-to-slot-btn" title="Tilføj til morgenmad"><i class="fas fa-plus"></i></button>
            </div>
            <div class="meal-slot" data-date="${formatDate(dayDate)}" data-meal="lunch">
                 <button class="add-event-to-slot-btn" title="Tilføj til frokost"><i class="fas fa-plus"></i></button>
            </div>
            <div class="meal-slot" data-date="${formatDate(dayDate)}" data-meal="dinner">
                 <button class="add-event-to-slot-btn" title="Tilføj til aftensmad"><i class="fas fa-plus"></i></button>
            </div>
        `;
        grid.appendChild(dayCard);
    }
    populateWeekViewWithData();
}

function populateWeekViewWithData() {
    document.querySelectorAll('#calendar-week-view .meal-slot').forEach(slot => {
        slot.querySelectorAll('.calendar-event').forEach(el => el.remove());

        const date = slot.dataset.date;
        const mealType = slot.dataset.meal;

        // Populate meals
        const mealEvents = appState.mealPlan[date]?.[mealType] || [];
        if (Array.isArray(mealEvents)) {
            mealEvents.forEach(eventData => {
                const eventDiv = createEventDiv(eventData);
                slot.appendChild(eventDiv);
            });
        }

        // Populate personal events into the top slot
        if (mealType === 'events') {
            const today = new Date();
            const currentYear = today.getFullYear();
            const personalEvents = appState.events.filter(event => {
                // RETTET: Viser nu To-do events her.
                // Fjernet "event.category !== 'To-do'" fra filteret
                if (event.isRecurring) {
                    const eventDateThisYear = new Date(event.date);
                    eventDateThisYear.setFullYear(new Date(date).getFullYear());
                    return formatDate(eventDateThisYear) === date;
                }
                return event.date === date;
            });

            personalEvents.forEach(eventData => {
                const eventDiv = createEventDiv({ ...eventData, type: 'personal' });
                slot.appendChild(eventDiv);
            });
        }
    });
}

function renderMonthView() {
    const grid = appElements.calendarMonthGrid;
    const header = document.querySelector('.calendar-month-header');
    grid.innerHTML = '';
    header.innerHTML = '';

    const days = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
    days.forEach(day => {
        const headerEl = document.createElement('div');
        headerEl.className = 'calendar-month-day-header';
        headerEl.textContent = day;
        header.appendChild(headerEl);
    });

    const date = appState.currentDate;
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7; // 0=Mandag, 6=Søndag
    
    for (let i = 0; i < startDayOfWeek; i++) {
        grid.appendChild(document.createElement('div'));
    }

    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
        const dayDate = new Date(year, month, day);
        const dateString = formatDate(dayDate);
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-month-day';
        dayCell.dataset.date = dateString;
        if (dateString === formatDate(new Date())) {
            dayCell.classList.add('is-today');
        }

        const mealEventsToday = Object.values(appState.mealPlan[dateString] || {}).flat();
        const personalEventsToday = appState.events.filter(event => event.date === dateString); // Rettet til at vise alle events
        const allEvents = [...mealEventsToday, ...personalEventsToday.map(e => ({...e, type: 'personal'}))];

        const eventDots = allEvents
            .map(event => `<div class="event-dot ${event.type === 'personal' ? event.category.toLowerCase() : event.type}"></div>`)
            .join('');

        dayCell.innerHTML = `
            <div class="month-day-number">${day}</div>
            <div class="event-dots-container">${eventDots}</div>
        `;
        grid.appendChild(dayCell);
    }
}


function createEventDiv(eventData) {
    const eventDiv = document.createElement('div');
    eventDiv.dataset.event = JSON.stringify(eventData);
    eventDiv.className = 'calendar-event';
    let content = '';
    let icon = '';

    switch (eventData.type) {
        case 'recipe':
            eventDiv.draggable = true;
            const recipe = appState.recipes.find(r => r.id === eventData.recipeId);
            eventDiv.classList.add('recipe');
            if (eventData.cooked) eventDiv.classList.add('is-cooked');
            if (!recipe) eventDiv.classList.add('deleted');
            
            const cookBtnHTML = recipe && !eventData.cooked
                ? `<button class="btn-icon cook-meal-btn" title="Markér som lavet"><i class="fas fa-hat-chef"></i></button>`
                : '';
            
            content = recipe ? recipe.title : 'Slettet Opskrift';
            icon = `<i class="fas fa-utensils"></i>`;
            eventDiv.innerHTML = `
                <div class="event-content">${icon} ${content}</div>
                <div class="event-actions">
                    ${cookBtnHTML}
                    <button class="btn-icon remove-meal-btn" title="Fjern"><i class="fas fa-times"></i></button>
                </div>`;
            break;
        
        case 'project':
            eventDiv.draggable = true;
            const project = appState.projects.find(p => p.id === eventData.projectId);
            eventDiv.classList.add('project');
            content = project ? project.title : 'Slettet Projekt';
            icon = `<i class="fas fa-tasks"></i>`;
            eventDiv.innerHTML = `<div class="event-content">${icon} ${content}</div><div class="event-actions"><button class="btn-icon remove-meal-btn" title="Fjern"><i class="fas fa-times"></i></button></div>`;
            break;

        case 'task':
            eventDiv.draggable = true;
            eventDiv.classList.add('task');
            content = eventData.taskName;
            icon = `<i class="fas fa-sticky-note"></i>`; // Updated icon
            eventDiv.innerHTML = `<div class="event-content">${icon} ${content}</div><div class="event-actions"><button class="btn-icon remove-meal-btn" title="Fjern"><i class="fas fa-times"></i></button></div>`;
            break;

        case 'personal':
            eventDiv.draggable = false;
            eventDiv.classList.add(eventData.category.toLowerCase());
            content = eventData.title;
            icon = `<i class="fas ${getIconForCategory(eventData)}"></i>`;
            eventDiv.innerHTML = `<div class="event-content">${icon} ${content}</div>`;
            break;
    }
    return eventDiv;
}

function getIconForCategory(eventData) {
    switch (eventData.category) {
        case 'To-do': return 'fa-sticky-note'; // Updated icon
        case 'Aftale': return 'fa-calendar-check';
        case 'Fødselsdag': return 'fa-birthday-cake';
        case 'Udgivelse':
            switch(eventData.subCategory) {
                case 'Film': return 'fa-film';
                case 'Bog': return 'fa-book-open';
                case 'Spil': return 'fa-gamepad';
                case 'Produkt': return 'fa-box';
                default: return 'fa-star';
            }
        default: return 'fa-info-circle';
    }
}


async function handleClearMealPlan() {
    const confirmed = await showNotification({
        title: "Ryd Madplan",
        message: "Er du sikker på, at du vil fjerne alle måltider fra denne uge?",
        type: 'confirm'
    });
    if (!confirmed) return;
    
    const start = getStartOfWeek(appState.currentDate);
    const batch = writeBatch(db);

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(start);
        dayDate.setDate(start.getDate() + i);
        const dateString = formatDate(dayDate);
        if (appState.mealPlan[dateString]) {
            const mealPlanRef = doc(db, 'meal_plans', `plan_${dayDate.getFullYear()}`);
            batch.update(mealPlanRef, { [dateString]: deleteField() });
        }
    }

    try {
        await batch.commit();
        showNotification({title: "Madplan Tømt", message: "Alle måltider for denne uge er fjernet."});
    } catch (error) {
        handleError(error, "Madplanen kunne ikke ryddes.", "clearMealPlan");
    }
}

async function handleCalendarClick(e) {
    const eventDiv = e.target.closest('[data-event]');
    
    const addBtn = e.target.closest('.add-event-to-slot-btn');
    if (addBtn) {
        const slot = addBtn.closest('.meal-slot');
        if (slot.dataset.meal === 'events') {
            openEventModal(slot.dataset.date);
        } else {
            openAddCalendarEventModal(slot.dataset.date, slot.dataset.meal);
        }
        return;
    }

    if (!eventDiv) return;

    const eventData = JSON.parse(eventDiv.dataset.event);
    
    if (eventData.type === 'personal') {
        openEventModal(null, eventData);
        return;
    }

    const slot = eventDiv.closest('.meal-slot');
    const date = slot.dataset.date;
    const mealType = slot.dataset.meal;

    if (e.target.closest('.cook-meal-btn')) {
        const wasDeducted = await confirmAndDeductIngredients(eventData.recipeId, eventData.portions);
        if (wasDeducted) {
            const updatedEventData = { ...eventData, cooked: true };
            await updateCalendarEvent(date, mealType, eventData, updatedEventData);
        }
        return;
    }

    if (e.target.closest('.remove-meal-btn')) {
        await removeEventFromCalendar(date, mealType, eventData);
    }
}

async function handleMonthGridClick(e) {
    const dayCell = e.target.closest('.calendar-month-day');
    if (!dayCell) return;

    const date = dayCell.dataset.date;
    calendarViewState.dayDetailsDate = date; 

    const mealEventsToday = Object.values(appState.mealPlan[date] || {}).flat();
    const personalEventsToday = appState.events.filter(event => event.date === date); // Rettet til at vise alle events
    const allEvents = [...mealEventsToday, ...personalEventsToday.map(e => ({...e, type: 'personal'}))];

    appElements.dayDetailsTitle.textContent = new Date(date).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });
    const contentDiv = appElements.dayDetailsContent;
    contentDiv.innerHTML = '';

    if (allEvents.length === 0) {
        contentDiv.innerHTML = '<p class="empty-state">Ingen begivenheder planlagt.</p>';
    } else {
        allEvents.forEach(event => {
            contentDiv.appendChild(createEventDiv(event));
        });
    }

    appElements.dayDetailsModal.classList.remove('hidden');
}

async function updateCalendarEvent(date, mealType, oldEvent, newEvent) {
    const year = new Date(date).getFullYear();
    const mealPlanRef = doc(db, 'meal_plans', `plan_${year}`);
    const fieldPath = `${date}.${mealType}`;

    try {
        const docSnap = await getDoc(mealPlanRef);
        if (docSnap.exists()) {
            const batch = writeBatch(db);
            batch.update(mealPlanRef, { [fieldPath]: arrayRemove(oldEvent) });
            batch.update(mealPlanRef, { [fieldPath]: arrayUnion(newEvent) });
            await batch.commit();
        }
    } catch (error) {
        handleError(error, "Kunne ikke opdatere begivenhed.", "updateCalendarEvent");
    }
}

async function removeEventFromCalendar(date, mealType, eventData) {
    const year = new Date(date).getFullYear();
    const mealPlanRef = doc(db, 'meal_plans', `plan_${year}`);
    const fieldPath = `${date}.${mealType}`;
    
    try {
        await updateDoc(mealPlanRef, { [fieldPath]: arrayRemove(eventData) });
    } catch (error) {
        handleError(error, "Begivenheden kunne ikke fjernes.", "removeEvent");
    }
}


async function handlePlanMealSubmit(e) {
    e.preventDefault();
    
    const recipeId = document.getElementById('plan-meal-recipe-id').value;
    const date = document.getElementById('plan-meal-date').value;
    const portions = Number(document.getElementById('plan-meal-portions').value);
    const mealTypeBtn = document.querySelector('#plan-meal-form .meal-type-selector .btn.active');

    if (!recipeId || !date || !portions || !mealTypeBtn) {
        handleError(new Error("Udfyld venligst alle felter."), "Udfyld venligst alle felter.", "planMealSubmit");
        return;
    }
    
    const mealType = mealTypeBtn.dataset.meal;
    const mealData = {
        id: crypto.randomUUID(),
        recipeId,
        type: 'recipe',
        portions,
        cooked: false,
    };

    await addEventToCalendar(date, mealType, mealData);
    appElements.planMealModal.classList.add('hidden');
    showNotification({title: "Planlagt!", message: "Retten er føjet til din madplan."});
}

export function openPlanMealModal(recipeId) {
    const recipe = appState.recipes.find(r => r.id === recipeId);
    if (!recipe) return;

    appElements.planMealModalTitle.textContent = `Planlæg: ${recipe.title}`;
    appElements.planMealForm.reset();
    document.getElementById('plan-meal-recipe-id').value = recipeId;
    document.getElementById('plan-meal-portions').value = recipe.portions || 1;
    document.getElementById('plan-meal-date').value = formatDate(new Date());
    
    document.querySelectorAll('#plan-meal-form .meal-type-selector .btn').forEach(btn => btn.classList.remove('active'));
    appElements.planMealModal.classList.remove('hidden');
}


// "Add to Calendar" Modal Functions

function openAddCalendarEventModal(date, meal = 'dinner') {
    calendarEventState.date = date;
    calendarEventState.meal = meal;

    const mealName = { breakfast: 'morgenmad', lunch: 'frokost', dinner: 'aftensmad'}[meal];
    appElements.calendarEventModalTitle.textContent = `Tilføj til ${new Date(date).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric' })} (${mealName})`;
    
    appElements.calendarEventViewChooser.classList.remove('hidden');
    appElements.calendarEventViews.forEach(view => view.classList.add('hidden'));
    
    appElements.addCalendarEventModal.classList.remove('hidden');
}

function handleCalendarEventViewChoice(e) {
    const choiceBtn = e.target.closest('.quick-action-btn');
    if (!choiceBtn) return;

    const viewName = choiceBtn.dataset.view;
    appElements.calendarEventViewChooser.classList.add('hidden');
    appElements.calendarEventViews.forEach(view => {
        view.classList.toggle('hidden', !view.id.includes(viewName));
    });

    if (viewName === 'recipe') populateCalendarRecipeList();
    if (viewName === 'project') populateCalendarProjectList();
    if (viewName === 'task') populateCalendarTaskList();
}

function populateCalendarRecipeList(searchTerm = '') {
    const list = appElements.calendarRecipeList;
    list.innerHTML = '';
    const filteredRecipes = appState.recipes
        .filter(r => r.title.toLowerCase().includes(searchTerm.toLowerCase()))
        .slice(0, 10); 

    if (filteredRecipes.length === 0) {
        list.innerHTML = `<li class="selection-list-item-empty">Ingen opskrifter fundet.</li>`;
        return;
    }

    filteredRecipes.forEach(recipe => {
        const li = document.createElement('li');
        li.className = 'selection-list-item';
        li.dataset.id = recipe.id;
        li.innerHTML = `<span>${recipe.title}</span><i class="fas fa-plus-circle"></i>`;
        list.appendChild(li);
    });
}

function populateCalendarProjectList() {
    const list = appElements.calendarProjectList;
    list.innerHTML = '';
    const activeProjects = appState.projects.filter(p => p.status !== 'Afsluttet');
    
    if (activeProjects.length === 0) {
        list.innerHTML = `<li class="selection-list-item-empty">Ingen aktive projekter fundet.</li>`;
        return;
    }

    activeProjects.forEach(project => {
        const li = document.createElement('li');
        li.className = 'selection-list-item';
        li.dataset.id = project.id;
        li.innerHTML = `<span>${project.title}</span><i class="fas fa-plus-circle"></i>`;
        list.appendChild(li);
    });
}

function populateCalendarTaskList(searchTerm = '') {
    const list = appElements.calendarTaskList;
    list.innerHTML = '';
    // FJERNET: Maintenance tasks fra referencer, da modulet er fjernet.
    const filteredTasks = appState.events
        .filter(t => t.category === 'To-do' && t.title.toLowerCase().includes(searchTerm.toLowerCase()))
        .map(t => t.title);
        
    const uniqueTasks = [...new Set(filteredTasks)];

    if (uniqueTasks.length === 0 && searchTerm) {
        list.innerHTML = `<li class="selection-list-item" data-name="${searchTerm}">Opret ny note: "${searchTerm}"</li>`;
    } else {
        uniqueTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = 'selection-list-item';
            li.dataset.name = task;
            li.innerHTML = `<span>${task}</span><i class="fas fa-plus-circle"></i>`;
            list.appendChild(li);
        });
    }
}

async function handleCalendarRecipeSelect(e) {
    const item = e.target.closest('.selection-list-item');
    if (!item) return;

    const recipeId = item.dataset.id;
    const recipe = appState.recipes.find(r => r.id === recipeId);
    const eventData = {
        id: crypto.randomUUID(),
        type: 'recipe',
        recipeId: recipeId,
        portions: recipe.portions || 1,
        cooked: false
    };
    await addEventToCalendar(calendarEventState.date, calendarEventState.meal, eventData);
    appElements.addCalendarEventModal.classList.add('hidden');
}

async function handleCalendarProjectSelect(e) {
    const item = e.target.closest('.selection-list-item');
    if (!item) return;

    const eventData = {
        id: crypto.randomUUID(),
        type: 'project',
        projectId: item.dataset.id
    };
    await addEventToCalendar(calendarEventState.date, calendarEventState.meal, eventData);
    appElements.addCalendarEventModal.classList.add('hidden');
}

function handleCalendarTaskSelect(e) {
    const item = e.target.closest('.selection-list-item');
    if (!item) return;

    const taskName = item.dataset.name;
    document.getElementById('calendar-task-search').value = taskName;
    document.getElementById('calendar-task-name-hidden').value = taskName;
    appElements.calendarTaskList.innerHTML = '';
}

async function handleCalendarTaskSubmit(e) {
    e.preventDefault();
    const taskName = document.getElementById('calendar-task-name-hidden').value;
    if (!taskName) {
        showNotification({title: "Mangler påmindelse", message: "Vælg eller skriv en påmindelse."});
        return;
    }
    const eventData = {
        id: crypto.randomUUID(),
        type: 'task',
        taskName: taskName
    };
    await addEventToCalendar(calendarEventState.date, calendarEventState.meal, eventData);
    appElements.addCalendarEventModal.classList.add('hidden');
}

async function addEventToCalendar(date, mealType, eventData) {
    const year = new Date(date).getFullYear();
    const mealPlanRef = doc(db, 'meal_plans', `plan_${year}`);
    const fieldPath = `${date}.${mealType}`;
    
    try {
        await setDoc(mealPlanRef, {
            userId: appState.currentUser.uid,
            [date]: {
                [mealType]: arrayUnion(eventData)
            }
        }, { merge: true });
    } catch (error) {
        handleError(error, "Kunne ikke tilføje begivenhed.", "addEventToCalendar");
    }
}

// Drag and Drop Logic
function setupDragAndDrop() {
    const container = appElements.calendarGrid;

    container.addEventListener('dragstart', e => {
        const eventEl = e.target.closest('.calendar-event');
        if (eventEl) {
            e.dataTransfer.effectAllowed = 'move';
            calendarViewState.draggedEventData = JSON.parse(eventEl.dataset.event);
            setTimeout(() => eventEl.classList.add('is-dragging'), 0);
        }
    });

    container.addEventListener('dragend', e => {
        const eventEl = e.target.closest('.calendar-event');
        if (eventEl) {
            eventEl.classList.remove('is-dragging');
        }
        calendarViewState.draggedEventData = null;
    });

    container.addEventListener('dragover', e => {
        e.preventDefault();
        const slot = e.target.closest('.meal-slot');
        if (slot) {
            slot.classList.add('drag-over');
        }
    });

    container.addEventListener('dragleave', e => {
        const slot = e.target.closest('.meal-slot');
        if (slot) {
            slot.classList.remove('drag-over');
        }
    });

    container.addEventListener('drop', async e => {
        e.preventDefault();
        const dropSlot = e.target.closest('.meal-slot');
        if (!dropSlot || !calendarViewState.draggedEventData) return;

        dropSlot.classList.remove('drag-over');
        
        const originalEvent = calendarViewState.draggedEventData;
        const originalSlot = document.querySelector(`.calendar-event[data-event*='${originalEvent.id}']`).closest('.meal-slot');

        const fromDate = originalSlot.dataset.date;
        const fromMeal = originalSlot.dataset.meal;
        const toDate = dropSlot.dataset.date;
        const toMeal = dropSlot.dataset.meal;

        if (fromDate === toDate && fromMeal === toMeal) return;

        // Update Firestore
        await removeEventFromCalendar(fromDate, fromMeal, originalEvent);
        await addEventToCalendar(toDate, toMeal, originalEvent);
    });
}
