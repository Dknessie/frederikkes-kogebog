// js/mealPlanner.js

import { db } from './firebase.js';
import { doc, setDoc, writeBatch, deleteField, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { getWeekNumber, getStartOfWeek, formatDate, debounce } from './utils.js';
import { confirmAndDeductIngredients } from './kitchenCounter.js';

let appState;
let appElements;
// State for the "Add to Calendar" modal
let calendarEventState = {
    date: null,
    meal: null
};

export function initMealPlanner(state, elements) {
    appState = state;
    appElements = elements;

    appElements.clearMealPlanBtn.addEventListener('click', handleClearMealPlan);
    appElements.prevWeekBtn.addEventListener('click', () => {
        appState.currentDate.setDate(appState.currentDate.getDate() - 7);
        renderMealPlanner();
    });
    appElements.nextWeekBtn.addEventListener('click', () => {
        appState.currentDate.setDate(appState.currentDate.getDate() + 7);
        renderMealPlanner();
    });
    appElements.calendarGrid.addEventListener('click', handleCalendarClick);
    
    appElements.mealTypeSelector.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        appElements.mealTypeSelector.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
        target.classList.add('active');
    });
    appElements.planMealForm.addEventListener('submit', handlePlanMealSubmit);

    // Listeners for the "Add to Calendar" modal
    appElements.calendarEventViewChooser.addEventListener('click', handleCalendarEventViewChoice);
    appElements.calendarRecipeSearch.addEventListener('input', debounce(e => populateCalendarRecipeList(e.target.value), 300));
    appElements.calendarRecipeList.addEventListener('click', handleCalendarRecipeSelect);
    appElements.calendarProjectList.addEventListener('click', handleCalendarProjectSelect);
    appElements.calendarTaskSearch.addEventListener('input', debounce(e => populateCalendarTaskList(e.target.value), 300));
    appElements.calendarTaskList.addEventListener('click', handleCalendarTaskSelect);
    appElements.calendarTaskForm.addEventListener('submit', handleCalendarTaskSubmit);
}

export function renderMealPlanner() {
    if (!appState.recipes || !appState.inventory) {
        appElements.calendarGrid.innerHTML = '<p class="empty-state">Indlæser data...</p>';
        return;
    }

    appElements.calendarGrid.innerHTML = '';
    const start = getStartOfWeek(appState.currentDate);
    appElements.calendarTitle.textContent = `Uge ${getWeekNumber(start)}, ${start.getFullYear()}`;
    const days = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
    const todayString = formatDate(new Date());

    const fragment = document.createDocumentFragment();
    for(let i = 0; i < 7; i++) {
        const dayDate = new Date(start);
        dayDate.setDate(start.getDate() + i);
        const dateString = formatDate(dayDate);

        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        if (dateString === todayString) dayDiv.classList.add('is-today');

        // UPDATED: Added add button to each slot, removed from day-container
        dayDiv.innerHTML = `
            <div class="calendar-day-header">${days[i]} <span class="date-number">${dayDate.getDate()}.</span></div>
            <div class="meal-slots">
                <div class="meal-slot" data-date="${dateString}" data-meal="breakfast">
                    <button class="add-event-to-slot-btn" title="Tilføj begivenhed"><i class="fas fa-plus"></i></button>
                </div>
                <div class="meal-slot" data-date="${dateString}" data-meal="lunch">
                    <button class="add-event-to-slot-btn" title="Tilføj begivenhed"><i class="fas fa-plus"></i></button>
                </div>
                <div class="meal-slot" data-date="${dateString}" data-meal="dinner">
                    <button class="add-event-to-slot-btn" title="Tilføj begivenhed"><i class="fas fa-plus"></i></button>
                </div>
            </div>
        `;
        fragment.appendChild(dayDiv);
    }
    appElements.calendarGrid.appendChild(fragment);
    populateCalendarWithData();
    renderWeeklyPrice();
}

function populateCalendarWithData() {
    document.querySelectorAll('.meal-slot').forEach(slot => {
        // Clear previous content, but keep the add button
        slot.querySelectorAll('[data-event]').forEach(el => el.remove());

        const date = slot.dataset.date;
        const mealType = slot.dataset.meal;
        const events = appState.mealPlan[date]?.[mealType] || [];

        if (Array.isArray(events)) {
            events.forEach(eventData => {
                const eventDiv = createEventDiv(eventData);
                slot.appendChild(eventDiv);
            });
        }
    });
}

// Create a div for any type of calendar event
function createEventDiv(eventData) {
    const eventDiv = document.createElement('div');
    eventDiv.dataset.event = JSON.stringify(eventData);
    let content = '';
    let icon = '';

    switch (eventData.type) {
        case 'recipe':
            const recipe = appState.recipes.find(r => r.id === eventData.recipeId);
            eventDiv.className = 'planned-recipe';
            if (eventData.cooked) eventDiv.classList.add('is-cooked');
            if (!recipe) eventDiv.classList.add('deleted');
            
            const cookBtnHTML = recipe && !eventData.cooked
                ? `<button class="btn-icon cook-meal-btn" title="Markér som lavet og træk fra lager"><i class="fas fa-hat-chef"></i></button>`
                : '';
            
            content = recipe ? recipe.title : 'Slettet Opskrift';
            icon = `<i class="fas fa-utensils"></i>`;
            eventDiv.innerHTML = `
                <span>${icon} ${content}</span>
                <div class="planned-recipe-actions">
                    ${cookBtnHTML}
                    <button class="btn-icon remove-meal-btn" title="Fjern fra madplan"><i class="fas fa-trash"></i></button>
                </div>`;
            break;
        
        case 'project':
            const project = appState.projects.find(p => p.id === eventData.projectId);
            eventDiv.className = 'planned-project';
            content = project ? project.title : 'Slettet Projekt';
            icon = `<i class="fas fa-tasks"></i>`;
            eventDiv.innerHTML = `<span>${icon} ${content}</span><button class="btn-icon remove-meal-btn" title="Fjern fra madplan"><i class="fas fa-trash"></i></button>`;
            break;

        case 'task':
            eventDiv.className = 'planned-task';
            content = eventData.taskName;
            icon = `<i class="fas fa-broom"></i>`;
            eventDiv.innerHTML = `<span>${icon} ${content}</span><button class="btn-icon remove-meal-btn" title="Fjern fra madplan"><i class="fas fa-trash"></i></button>`;
            break;
    }
    return eventDiv;
}


async function handleClearMealPlan() {
    const confirmed = await showNotification({
        title: "Ryd Madplan",
        message: "Er du sikker på, at du vil fjerne alle måltider fra denne uge?",
        type: 'confirm'
    });
    if (!confirmed) return;

    const year = appState.currentDate.getFullYear();
    const mealPlanRef = doc(db, 'meal_plans', `plan_${year}`);
    const batch = writeBatch(db);
    const start = getStartOfWeek(appState.currentDate);

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(start);
        dayDate.setDate(start.getDate() + i);
        const dateString = formatDate(dayDate);
        if (appState.mealPlan[dateString]) {
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
    
    // UPDATED: Handle click on "add event" button inside a slot
    const addBtn = e.target.closest('.add-event-to-slot-btn');
    if (addBtn) {
        const slot = addBtn.closest('.meal-slot');
        openAddCalendarEventModal(slot.dataset.date, slot.dataset.meal);
        return;
    }

    if (!eventDiv) return;

    const eventData = JSON.parse(eventDiv.dataset.event);
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
        const year = new Date(date).getFullYear();
        const mealPlanRef = doc(db, 'meal_plans', `plan_${year}`);
        const fieldPath = `${date}.${mealType}`;
        
        try {
            await updateDoc(mealPlanRef, { [fieldPath]: arrayRemove(eventData) });
        } catch (error) {
            handleError(error, "Begivenheden kunne ikke fjernes.", "removeEvent");
        }
    }
}

async function updateCalendarEvent(date, mealType, oldEvent, newEvent) {
    const year = new Date(date).getFullYear();
    const mealPlanRef = doc(db, 'meal_plans', `plan_${year}`);
    const fieldPath = `${date}.${mealType}`;

    try {
        const batch = writeBatch(db);
        // Atomically remove the old and add the new
        batch.update(mealPlanRef, { [fieldPath]: arrayRemove(oldEvent) });
        batch.update(mealPlanRef, { [fieldPath]: arrayUnion(newEvent) });
        await batch.commit();
    } catch (error) {
        handleError(error, "Kunne ikke opdatere begivenhed i kalenderen.", "updateCalendarEvent");
    }
}


async function handlePlanMealSubmit(e) {
    e.preventDefault();
    
    const recipeId = document.getElementById('plan-meal-recipe-id').value;
    const date = document.getElementById('plan-meal-date').value;
    const portions = Number(document.getElementById('plan-meal-portions').value);
    const mealTypeBtn = appElements.mealTypeSelector.querySelector('.btn.active');

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
    
    appElements.mealTypeSelector.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
    appElements.planMealModal.classList.remove('hidden');
}

function renderWeeklyPrice() {
    let weeklyTotal = 0;
    const start = getStartOfWeek(appState.currentDate);

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(start);
        dayDate.setDate(start.getDate() + i);
        const dateString = formatDate(dayDate);
        const dayPlan = appState.mealPlan[dateString];

        if (dayPlan) {
            Object.values(dayPlan).forEach(mealArray => {
                if(Array.isArray(mealArray)) {
                    mealArray.forEach(event => {
                        if (event.type === 'recipe') {
                            const recipe = appState.recipes.find(r => r.id === event.recipeId);
                            if (recipe) {
                                weeklyTotal += calculateRecipePrice(recipe, appState.inventory, event.portions);
                            }
                        }
                    });
                }
            });
        }
    }
    
    appElements.weeklyPriceDisplay.textContent = `Estimeret Ugepris: ${weeklyTotal.toFixed(2).replace('.',',')} kr.`;
}

// Helper to calculate recipe price, moved from recipes.js to avoid circular dependencies if needed, but fine here for now.
function calculateRecipePrice(recipe, inventory, portionsOverride) {
    let totalPrice = 0;
    if (!recipe.ingredients) return 0;

    const scaleFactor = (portionsOverride || recipe.portions || 1) / (recipe.portions || 1);

    recipe.ingredients.forEach(ing => {
        const inventoryItem = inventory.find(inv => inv.name.toLowerCase() === ing.name.toLowerCase());
        if (inventoryItem && inventoryItem.batches && inventoryItem.batches.length > 0) {
            const cheapestBatch = inventoryItem.batches
                .filter(b => b.price && b.size > 0 && b.quantity > 0)
                .sort((a, b) => (a.price / (a.quantity * a.size)) - (b.price / (b.quantity * b.size)))[0];
            
            if (cheapestBatch) {
                const scaledQuantity = (ing.quantity || 0) * scaleFactor;
                const conversion = convertToGrams(scaledQuantity, ing.unit, inventoryItem);
                
                if (conversion.grams !== null) {
                    const pricePerBaseUnit = cheapestBatch.price / (cheapestBatch.quantity * cheapestBatch.size);
                    totalPrice += conversion.grams * pricePerBaseUnit;
                }
            }
        }
    });
    return totalPrice;
}


// Functions for the "Add to Calendar" Modal

function openAddCalendarEventModal(date, meal = 'dinner') {
    calendarEventState.date = date;
    calendarEventState.meal = meal;

    appElements.calendarEventModalTitle.textContent = `Tilføj til ${new Date(date).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })}`;
    
    // Reset views
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

    // Populate the chosen view
    if (viewName === 'recipe') populateCalendarRecipeList();
    if (viewName === 'project') populateCalendarProjectList();
    if (viewName === 'task') populateCalendarTaskList();
}

function populateCalendarRecipeList(searchTerm = '') {
    const list = appElements.calendarRecipeList;
    list.innerHTML = '';
    const filteredRecipes = appState.recipes
        .filter(r => r.title.toLowerCase().includes(searchTerm.toLowerCase()))
        .slice(0, 10); // Limit results for performance

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
    const filteredTasks = (appState.references.maintenanceTasks || [])
        .filter(t => t.toLowerCase().includes(searchTerm.toLowerCase()));

    if (filteredTasks.length === 0 && searchTerm) {
        list.innerHTML = `<li class="selection-list-item" data-name="${searchTerm}">Opret ny opgave: "${searchTerm}"</li>`;
    } else {
        filteredTasks.forEach(task => {
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
    appElements.calendarTaskList.innerHTML = ''; // Clear suggestions
}

async function handleCalendarTaskSubmit(e) {
    e.preventDefault();
    const taskName = document.getElementById('calendar-task-name-hidden').value;
    if (!taskName) {
        showNotification({title: "Mangler opgave", message: "Vælg eller skriv en opgave."});
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
            [date]: {
                [mealType]: arrayUnion(eventData)
            }
        }, { merge: true });
    } catch (error) {
        handleError(error, "Kunne ikke tilføje begivenhed til kalenderen.", "addEventToCalendar");
    }
}
