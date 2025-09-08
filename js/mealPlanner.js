// js/mealPlanner.js

import { db } from './firebase.js';
import { doc, setDoc, writeBatch, deleteField, arrayUnion, arrayRemove, getDoc, runTransaction, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { getWeekNumber, getStartOfWeek, formatDate } from './utils.js';
import { openShoppingListModal } from './shoppingList.js';
import { renderReadView } from './recipes.js';

let appState;
let appElements;
let draggedMealData = null;

export function initMealPlanner(state, elements) {
    appState = state;
    appElements = elements;

    // Navigation
    if (appElements.hubPrevWeekBtn) appElements.hubPrevWeekBtn.addEventListener('click', () => navigateWeek(-1));
    if (appElements.hubNextWeekBtn) appElements.hubNextWeekBtn.addEventListener('click', () => navigateWeek(1));

    // Hovedhandlinger
    if (appElements.hubClearWeekBtn) appElements.hubClearWeekBtn.addEventListener('click', handleClearMealPlan);
    
    // Event delegation
    if (appElements.mealPlanSection) {
        appElements.mealPlanSection.addEventListener('click', handleMealPlanClick);
        appElements.mealPlanSection.addEventListener('dragstart', handleDragStart);
        appElements.mealPlanSection.addEventListener('dragover', handleDragOver);
        appElements.mealPlanSection.addEventListener('dragleave', handleDragLeave);
        appElements.mealPlanSection.addEventListener('drop', handleDrop);
        appElements.mealPlanSection.addEventListener('dragend', handleDragEnd);
    }
    if (appElements.sidebarSection) {
        appElements.sidebarSection.addEventListener('click', handleSidebarClick);
    }

    // Modals
    if (appElements.planMealForm) {
        appElements.planMealForm.addEventListener('submit', handlePlanMealSubmit);
        const mealTypeSelector = appElements.planMealForm.querySelector('.meal-type-selector');
        if(mealTypeSelector) {
            mealTypeSelector.addEventListener('click', (e) => {
                if(e.target.tagName === 'BUTTON') {
                    mealTypeSelector.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                    e.target.classList.add('active');
                }
            });
        }
    }
}

function navigateWeek(direction) {
    appState.currentDate.setDate(appState.currentDate.getDate() + (7 * direction));
    renderMealPlanner();
}

export function renderMealPlanner() {
    if (!appState.recipes || !appState.inventory || !appElements.hubTitle) return;

    const startOfWeek = getStartOfWeek(appState.currentDate);
    appElements.hubTitle.textContent = `Uge ${getWeekNumber(startOfWeek)}, ${startOfWeek.getFullYear()}`;

    renderMealPlanSection(startOfWeek);
    renderSidebarSection(startOfWeek);
}

function renderMealPlanSection(startOfWeek) {
    const section = appElements.mealPlanSection;
    section.innerHTML = '';
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(startOfWeek);
        dayDate.setDate(startOfWeek.getDate() + i);
        fragment.appendChild(createDayCard(dayDate));
    }
    section.appendChild(fragment);
}

// HJÆLPEFUNKTION: Returnerer et ikon baseret på event-kategori
function getIconForCategory(category) {
    switch (category) {
        case 'To-do': return 'fa-check-square';
        case 'Aftale': return 'fa-calendar-check';
        case 'Fødselsdag': return 'fa-birthday-cake';
        case 'Udgivelse': return 'fa-book';
        case 'Andet': return 'fa-info-circle';
        default: return 'fa-star';
    }
}

/**
 * OPDATERET: Skaber HTML for et "dagskort" inklusiv begivenheder.
 * @param {Date} date - Datoen for kortet.
 * @returns {HTMLElement} - Det færdige div-element for dagen.
 */
function createDayCard(date) {
    const card = document.createElement('div');
    card.className = 'day-card';
    const dateString = formatDate(date);
    const dayName = date.toLocaleDateString('da-DK', { weekday: 'long' });
    const dayAndMonth = date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });

    // Find begivenheder for denne specifikke dag
    const eventsForDay = (appState.events || []).filter(event => event.date === dateString);
    let eventsHTML = '';
    if (eventsForDay.length > 0) {
        eventsHTML = eventsForDay.map(event => {
            const icon = getIconForCategory(event.category);
            return `<span class="day-event-pill event-${event.category.toLowerCase()}" title="${event.title}"><i class="fas ${icon}"></i> ${event.title}</span>`;
        }).join('');
    }

    const meals = appState.mealPlan[dateString] || {};
    
    card.innerHTML = `
        <div class="day-header">
            <div class="day-header-main">
                 <h3>${dayName}</h3>
                 <span class="date-string">${dayAndMonth}</span>
            </div>
            <div class="day-events-container">
                ${eventsHTML}
            </div>
        </div>
        <div class="meal-slots-container">
            ${createMealSlotHTML('Morgenmad', meals.breakfast, dateString, 'breakfast')}
            ${createMealSlotHTML('Frokost', meals.lunch, dateString, 'lunch')}
            ${createMealSlotHTML('Aftensmad', meals.dinner, dateString, 'dinner')}
        </div>
    `;
    return card;
}


/**
 * OPDATERET: Skaber HTML for et måltids-slot med slette-knap.
 * @param {string} title - Titlen (f.eks. "Morgenmad").
 * @param {Array} mealData - Array af måltider.
 * @param {string} dateString - Datoen (YYYY-MM-DD).
 * @param {string} mealType - Typen af måltid ('breakfast', 'lunch', 'dinner').
 * @returns {string} - HTML-strengen for måltids-slottet.
 */
function createMealSlotHTML(title, mealData, dateString, mealType) {
    let content = '';
    if (mealData && mealData.length > 0) {
        const meal = mealData[0];
        const recipe = appState.recipes.find(r => r.id === meal.recipeId);
        if (recipe) {
            const imageUrl = recipe.imageBase64 || recipe.imageUrl || `https://placehold.co/80x80/f3f0e9/d1603d?text=${encodeURIComponent(recipe.title[0])}`;
            content = `
                <div class="meal-card" 
                     draggable="true" 
                     data-recipe-id="${recipe.id}" 
                     data-meal-id="${meal.id}"
                     data-source-date="${dateString}"
                     data-source-meal-type="${mealType}"
                     title="Klik for at se, træk for at flytte">
                    <img src="${imageUrl}" alt="${recipe.title}">
                    <span>${recipe.title}</span>
                    <span class="delete-meal-btn" title="Fjern fra madplan"><i class="fas fa-times-circle"></i></span>
                </div>
            `;
        }
    } else {
        content = `
            <div class="empty-meal-slot" data-date="${dateString}" data-meal-type="${mealType}" title="Tilføj ${mealType.toLowerCase()}">
                <i class="fas fa-plus fa-2x"></i>
            </div>
        `;
    }

    return `
        <div class="meal-slot" data-date="${dateString}" data-meal-type="${mealType}">
            <h4>${title}</h4>
            ${content}
        </div>
    `;
}

function renderSidebarSection(startOfWeek) {
    const sidebar = appElements.sidebarSection;
    sidebar.innerHTML = `
        ${createWeeklyEventsWidgetHTML(startOfWeek)}
        ${createWeeklyTodosWidgetHTML()}
        ${createShoppingListWidgetHTML()}
    `;
}

function createWeeklyEventsWidgetHTML(startOfWeek) {
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const weeklyEvents = (appState.events || [])
        .filter(event => {
            if (event.category === 'To-do') return false;
            const eventDate = new Date(event.date);
            return eventDate >= startOfWeek && eventDate <= endOfWeek;
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    let listItems = '<p class="empty-state-small">Ingen aftaler denne uge.</p>';
    if (weeklyEvents.length > 0) {
        listItems = weeklyEvents.map(event => {
            const dayName = new Date(event.date).toLocaleDateString('da-DK', { weekday: 'short' });
            return `
                <li class="widget-list-item">
                    <span class="icon"><i class="fas fa-calendar-star"></i></span>
                    <div class="content">
                        <span class="title">${event.title}</span>
                        <span class="subtitle">${dayName}, ${new Date(event.date).toLocaleDateString('da-DK')}</span>
                    </div>
                </li>
            `;
        }).join('');
    }

    return `
        <div class="widget-card">
            <h4><i class="fas fa-calendar-star"></i> Ugens Aftaler</h4>
            <ul class="widget-list">${listItems}</ul>
        </div>
    `;
}

function createWeeklyTodosWidgetHTML() {
    const upcomingTodos = (appState.events || [])
        .filter(event => event.category === 'To-do' && !event.isComplete)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 5);

    let listItems = '<p class="empty-state-small">Alt er klaret! Godt gået.</p>';
    if (upcomingTodos.length > 0) {
        listItems = upcomingTodos.map(todo => `
            <li class="todo-item" data-id="${todo.id}">
                <label>
                    <input type="checkbox" ${todo.isComplete ? 'checked' : ''}>
                    <span class="custom-checkbox"></span>
                    <span class="todo-text">${todo.title}</span>
                </label>
            </li>
        `).join('');
    }

    return `
        <div class="widget-card">
            <h4><i class="fas fa-tasks"></i> Ugens To-Do's</h4>
            <ul class="widget-list">${listItems}</ul>
        </div>
    `;
}

function createShoppingListWidgetHTML() {
    const itemCount = Object.keys(appState.shoppingLists.groceries || {}).length;
    return `
        <div class="widget-card shopping-list-widget">
            <h4><i class="fas fa-shopping-cart"></i> Indkøbsliste</h4>
            <p>Du har <strong>${itemCount} vare${itemCount === 1 ? '' : 'r'}</strong> på din indkøbsliste.</p>
            <button class="btn btn-secondary" id="widget-open-shopping-list-btn"><i class="fas fa-list-ul"></i> Se Indkøbsliste</button>
        </div>
    `;
}

/**
 * OPDATERET: Håndterer klik på sletteknap.
 * @param {Event} e - Klik-event.
 */
function handleMealPlanClick(e) {
    const emptySlot = e.target.closest('.empty-meal-slot');
    const mealCard = e.target.closest('.meal-card');
    const deleteBtn = e.target.closest('.delete-meal-btn');

    if (deleteBtn) {
        e.stopPropagation(); // Forhindrer at opskriften åbnes
        const card = deleteBtn.closest('.meal-card');
        handleDeleteMeal(
            card.dataset.mealId, 
            card.dataset.sourceDate, 
            card.dataset.sourceMealType
        );
    } else if (emptySlot) {
        const date = emptySlot.dataset.date;
        const mealType = emptySlot.dataset.mealType;
        openPlanMealModal(null, date, mealType);
    } else if (mealCard) {
        const recipeId = mealCard.dataset.recipeId;
        const recipe = appState.recipes.find(r => r.id === recipeId);
        if (recipe) {
            renderReadView(recipe);
        }
    }
}

async function handleSidebarClick(e) {
    if (e.target.closest('#widget-open-shopping-list-btn')) {
        openShoppingListModal('groceries');
    }

    const todoCheckbox = e.target.closest('.todo-item input[type="checkbox"]');
    if (!todoCheckbox) return;

    const todoItemElement = todoCheckbox.closest('.todo-item');
    const todoId = todoItemElement?.dataset.id;
    
    if (!todoId) return;

    const isChecked = todoCheckbox.checked;

    try {
        const eventRef = doc(db, 'events', todoId);
        await updateDoc(eventRef, { isComplete: isChecked });
        showNotification({ title: "To-do Opdateret", message: "Din opgave er blevet opdateret." });
    } catch (error) {
        todoCheckbox.checked = !isChecked;
        handleError(error, "Kunne ikke opdatere to-do.", "updateTodo");
    }
}

// ... resten af filen er uændret ...

async function handleClearMealPlan() {
    const confirmed = await showNotification({
        title: "Ryd Madplan",
        message: "Er du sikker på, at du vil fjerne alle måltider fra denne uge?",
        type: 'confirm'
    });
    if (!confirmed) return;
    
    const start = getStartOfWeek(appState.currentDate);
    const batch = writeBatch(db);
    const mealPlanRef = doc(db, 'meal_plans', appState.currentUser.uid);

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

    const mealPlanRef = doc(db, 'meal_plans', appState.currentUser.uid);
    
    try {
        await setDoc(mealPlanRef, {
            [date]: {
                [mealType]: arrayUnion(mealData)
            }
        }, { merge: true });

        appElements.planMealModal.classList.add('hidden');
        showNotification({title: "Planlagt!", message: "Retten er føjet til din madplan."});
    } catch (error) {
        handleError(error, "Måltidet kunne ikke gemmes.", "savePlannedMeal");
    }
}

export function openPlanMealModal(recipeId, date = null, mealType = null) {
    const form = appElements.planMealForm;
    form.reset();
    form.querySelectorAll('.meal-type-selector .btn').forEach(btn => btn.classList.remove('active'));

    let recipe;
    if (recipeId) {
        recipe = appState.recipes.find(r => r.id === recipeId);
        if (!recipe) return;
        appElements.planMealModalTitle.textContent = `Planlæg: ${recipe.title}`;
        document.getElementById('plan-meal-recipe-id').value = recipeId;
        document.getElementById('plan-meal-portions').value = recipe.portions || 1;
    } else {
        appElements.planMealModalTitle.textContent = 'Vælg og Planlæg Måltid';
        const recipeName = prompt("Hvilken opskrift vil du tilføje? (skriv præcist navn)");
        if (!recipeName) return;
        recipe = appState.recipes.find(r => r.title.toLowerCase() === recipeName.toLowerCase());
        if (!recipe) {
            showNotification({title: "Fejl", message: "Opskrift ikke fundet."});
            return;
        }
        document.getElementById('plan-meal-recipe-id').value = recipe.id;
        document.getElementById('plan-meal-portions').value = recipe.portions || 1;
    }

    document.getElementById('plan-meal-date').value = date || formatDate(new Date());
    
    if (mealType) {
        const btn = form.querySelector(`.meal-type-selector .btn[data-meal="${mealType}"]`);
        if (btn) btn.classList.add('active');
    }

    appElements.planMealModal.classList.remove('hidden');
}


function handleDragStart(e) {
    const mealCard = e.target.closest('.meal-card');
    if (!mealCard) return;

    draggedMealData = {
        mealId: mealCard.dataset.mealId,
        recipeId: mealCard.dataset.recipeId,
        sourceDate: mealCard.dataset.sourceDate,
        sourceMealType: mealCard.dataset.sourceMealType,
    };
    
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', mealCard.dataset.recipeId);
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    const dropTarget = e.target.closest('.meal-slot, .empty-meal-slot');
    if (dropTarget && draggedMealData) {
        e.preventDefault(); 
        dropTarget.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const dropTarget = e.target.closest('.meal-slot, .empty-meal-slot');
    if (dropTarget) {
        dropTarget.classList.remove('drag-over');
    }
}

async function handleDrop(e) {
    e.preventDefault();
    const dropTarget = e.target.closest('.meal-slot, .empty-meal-slot');
    if (!dropTarget || !draggedMealData) return;

    dropTarget.classList.remove('drag-over');
    
    const targetDate = dropTarget.dataset.date;
    const targetMealType = dropTarget.dataset.mealType;

    if (targetDate === draggedMealData.sourceDate && targetMealType === draggedMealData.sourceMealType) {
        return;
    }

    await moveMealInFirestore(draggedMealData, { date: targetDate, mealType: targetMealType });
}

function handleDragEnd(e) {
    if (e.target.classList.contains('meal-card')) {
        e.target.classList.remove('dragging');
    }
    draggedMealData = null;
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

async function moveMealInFirestore(source, target) {
    const mealPlanRef = doc(db, 'meal_plans', appState.currentUser.uid);

    try {
        await runTransaction(db, async (transaction) => {
            const mealPlanDoc = await transaction.get(mealPlanRef);
            const planData = mealPlanDoc.exists() ? mealPlanDoc.data() : {};

            const sourceMeals = planData[source.sourceDate]?.[source.sourceMealType] || [];
            const mealIndex = sourceMeals.findIndex(m => m.id === source.mealId);

            if (mealIndex === -1) {
                return;
            }
            
            const [mealToMove] = sourceMeals.splice(mealIndex, 1);

            if (!planData[source.sourceDate]) planData[source.sourceDate] = {};
            planData[source.sourceDate][source.sourceMealType] = sourceMeals;
            if (planData[source.sourceDate][source.sourceMealType].length === 0) {
                delete planData[source.sourceDate][source.sourceMealType];
            }
            if (Object.keys(planData[source.sourceDate]).length === 0) {
                delete planData[source.sourceDate];
            }
            
            if (!planData[target.date]) planData[target.date] = {};
            planData[target.date][target.mealType] = [mealToMove];

            transaction.set(mealPlanRef, planData);
        });

        showNotification({title: "Madplan opdateret", message: "Måltidet er blevet flyttet."});
    } catch (error) {
        handleError(error, "Kunne ikke flytte måltidet.", "moveMealInFirestore");
    }
}

/**
 * NY: Funktion til at slette et måltid fra madplanen.
 * @param {string} mealId - ID på måltidet, der skal slettes.
 * @param {string} date - Datoen for måltidet.
 * @param {string} mealType - Måltidstypen (f.eks. 'dinner').
 */
async function handleDeleteMeal(mealId, date, mealType) {
    const mealPlanRef = doc(db, 'meal_plans', appState.currentUser.uid);

    const confirmed = await showNotification({
        title: "Fjern Måltid",
        message: "Er du sikker på, at du vil fjerne dette måltid fra madplanen?",
        type: 'confirm'
    });

    if (!confirmed) return;

    try {
        // Hent den nuværende madplan for at finde det specifikke måltidsobjekt
        const mealPlanDoc = await getDoc(mealPlanRef);
        if (!mealPlanDoc.exists()) return;

        const planData = mealPlanDoc.data();
        const mealsForSlot = planData[date]?.[mealType] || [];
        const mealToRemove = mealsForSlot.find(m => m.id === mealId);

        if (mealToRemove) {
            // Brug arrayRemove til at fjerne det præcise objekt fra arrayet i Firestore
            await updateDoc(mealPlanRef, {
                [`${date}.${mealType}`]: arrayRemove(mealToRemove)
            });
            showNotification({ title: "Fjernet", message: "Måltidet er blevet fjernet fra madplanen." });
        }
    } catch (error) {
        handleError(error, "Kunne ikke fjerne måltidet.", "handleDeleteMeal");
    }
}

