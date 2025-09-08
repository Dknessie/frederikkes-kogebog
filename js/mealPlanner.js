// js/mealPlanner.js

import { db } from './firebase.js';
import { doc, setDoc, writeBatch, deleteField, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { getWeekNumber, getStartOfWeek, formatDate } from './utils.js';
import { openShoppingListModal } from './shoppingList.js';
// OPDATERING: Importer funktioner til at vise opskrifter og håndtere events
import { renderReadView } from './recipes.js';

let appState;
let appElements;
// NY: Variabel til at holde data om det element, der trækkes
let draggedMealData = null;

/**
 * Initialiserer kalender-modulet.
 * @param {object} state - Den globale app state.
 * @param {object} elements - De cachede DOM elementer.
 */
export function initMealPlanner(state, elements) {
    appState = state;
    appElements = elements;

    // Navigation
    if (appElements.hubPrevWeekBtn) appElements.hubPrevWeekBtn.addEventListener('click', () => navigateWeek(-1));
    if (appElements.hubNextWeekBtn) appElements.hubNextWeekBtn.addEventListener('click', () => navigateWeek(1));

    // Hovedhandlinger
    if (appElements.hubClearWeekBtn) appElements.hubClearWeekBtn.addEventListener('click', handleClearMealPlan);
    
    // Event delegation for dynamisk indhold
    if (appElements.mealPlanSection) {
        appElements.mealPlanSection.addEventListener('click', handleMealPlanClick);
        
        // NYE: Event listeners til træk-og-slip
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

/**
 * Navigerer en uge frem eller tilbage.
 * @param {number} direction - (-1) for forrige, (1) for næste.
 */
function navigateWeek(direction) {
    appState.currentDate.setDate(appState.currentDate.getDate() + (7 * direction));
    renderMealPlanner();
}

/**
 * Hovedrenderingsfunktion for hele kalendersiden.
 */
export function renderMealPlanner() {
    if (!appState.recipes || !appState.inventory || !appElements.hubTitle) return;

    const startOfWeek = getStartOfWeek(appState.currentDate);
    appElements.hubTitle.textContent = `Uge ${getWeekNumber(startOfWeek)}, ${startOfWeek.getFullYear()}`;

    renderMealPlanSection(startOfWeek);
    renderSidebarSection(startOfWeek);
}

/**
 * Renderer hele sektionen med ugens dage og måltider.
 * @param {Date} startOfWeek - Dato-objekt for mandagen i den valgte uge.
 */
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

/**
 * Skaber HTML for et enkelt "dagskort".
 * @param {Date} date - Datoen for det pågældende kort.
 * @returns {HTMLElement} - Det færdige div-element for dagen.
 */
function createDayCard(date) {
    const card = document.createElement('div');
    card.className = 'day-card';
    const dateString = formatDate(date);
    const dayName = date.toLocaleDateString('da-DK', { weekday: 'long' });
    const dayAndMonth = date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });

    const meals = appState.mealPlan[dateString] || {};
    
    card.innerHTML = `
        <div class="day-header">
            <h3>${dayName}</h3>
            <span class="date-string">${dayAndMonth}</span>
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
 * Skaber HTML for en enkelt måltids-slot (f.eks. Frokost).
 * OPDATERING: Gør måltidskort "trækbare" og tilføjer data-attributter.
 * @param {string} title - Titlen (f.eks. "Morgenmad").
 * @param {Array} mealData - Array af måltider for denne slot.
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
            // OPDATERING: Gør kortet trækbar og tilføj data-attributter til at identificere måltidet
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

    // OPDATERING: Tilføj data-attributter til selve slottet for at identificere drop-target.
    return `
        <div class="meal-slot" data-date="${dateString}" data-meal-type="${mealType}">
            <h4>${title}</h4>
            ${content}
        </div>
    `;
}

/**
 * Renderer hele sidebarssektionen med alle widgets.
 * @param {Date} startOfWeek - Dato-objekt for mandagen i den valgte uge.
 */
function renderSidebarSection(startOfWeek) {
    const sidebar = appElements.sidebarSection;
    sidebar.innerHTML = `
        ${createWeeklyEventsWidgetHTML(startOfWeek)}
        ${createWeeklyTodosWidgetHTML()}
        ${createShoppingListWidgetHTML()}
    `;
}

/**
 * Skaber HTML for "Ugens Aftaler" widget.
 * @param {Date} startOfWeek - Startdato for ugen.
 * @returns {string} - HTML-strengen for widget'en.
 */
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

/**
 * Skaber HTML for "Ugens To-Do's" widget.
 * @returns {string} - HTML-strengen for widget'en.
 */
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

/**
 * Skaber HTML for "Indkøbsliste" widget.
 * @returns {string} - HTML-strengen for widget'en.
 */
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
 * Event handler for klik i madplanssektionen.
 * @param {Event} e - Klik-event.
 */
function handleMealPlanClick(e) {
    const emptySlot = e.target.closest('.empty-meal-slot');
    const mealCard = e.target.closest('.meal-card');

    if (emptySlot) {
        const date = emptySlot.dataset.date;
        const mealType = emptySlot.dataset.mealType;
        openPlanMealModal(null, date, mealType);
    } else if (mealCard) {
        // OPDATERING: Åbn opskrift-modal direkte i stedet for at navigere
        const recipeId = mealCard.dataset.recipeId;
        const recipe = appState.recipes.find(r => r.id === recipeId);
        if (recipe) {
            renderReadView(recipe);
        }
    }
}

/**
 * Event handler for klik i sidebar-sektionen.
 * @param {Event} e - Klik-event.
 */
async function handleSidebarClick(e) {
    if (e.target.closest('#widget-open-shopping-list-btn')) {
        openShoppingListModal('groceries');
    }

    // FEJLRETTELSE: To-do checkbox logik
    const todoCheckbox = e.target.closest('.todo-item input[type="checkbox"]');
    if (todoCheckbox) {
        const todoId = todoCheckbox.closest('.todo-item').dataset.id;
        try {
            // Opdater databasen
            await updateDoc(doc(db, 'events', todoId), { isComplete: todoCheckbox.checked });
            
            // Vis en diskret notifikation
            showNotification({ title: "To-do Opdateret", message: "Din opgave er blevet opdateret." });
            
            // UI vil blive opdateret automatisk af onSnapshot-listeneren i app.js
        } catch (error) {
            // Hvis opdateringen fejler, vis en fejlbesked og rul ændringen tilbage
            handleError(error, "Kunne ikke opdatere to-do.", "updateTodo");
            todoCheckbox.checked = !todoCheckbox.checked; 
        }
    }
}

/**
 * Rydder alle måltider for den viste uge.
 */
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

/**
 * Gemmer et valgt måltid til kalenderen fra modal'en.
 */
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
    const fieldPath = `${date}.${mealType}`;
    
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

/**
 * Åbner modal'en for at planlægge et måltid.
 */
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

// --- NYE FUNKTIONER TIL TRÆK-OG-SLIP ---

/**
 * Håndterer starten af et træk af et måltidskort.
 * @param {DragEvent} e - dragstart event.
 */
function handleDragStart(e) {
    const mealCard = e.target.closest('.meal-card');
    if (!mealCard) return;

    // Gem data om det måltid, der trækkes
    draggedMealData = {
        mealId: mealCard.dataset.mealId,
        recipeId: mealCard.dataset.recipeId,
        sourceDate: mealCard.dataset.sourceDate,
        sourceMealType: mealCard.dataset.sourceMealType,
    };
    
    // Tilføj en klasse for visuel feedback
    e.target.classList.add('dragging');
    // Nødvendigt for Firefox
    e.dataTransfer.setData('text/plain', mealCard.dataset.recipeId);
    e.dataTransfer.effectAllowed = 'move';
}

/**
 * Håndterer når et element trækkes hen over et gyldigt drop-target.
 * @param {DragEvent} e - dragover event.
 */
function handleDragOver(e) {
    const dropTarget = e.target.closest('.meal-slot, .empty-meal-slot');
    if (dropTarget && draggedMealData) {
        e.preventDefault(); // Tillad drop
        dropTarget.classList.add('drag-over');
    }
}

/**
 * Håndterer når et element forlader et gyldigt drop-target.
 * @param {DragEvent} e - dragleave event.
 */
function handleDragLeave(e) {
    const dropTarget = e.target.closest('.meal-slot, .empty-meal-slot');
    if (dropTarget) {
        dropTarget.classList.remove('drag-over');
    }
}

/**
 * Håndterer når et element slippes på et gyldigt drop-target.
 * @param {DragEvent} e - drop event.
 */
async function handleDrop(e) {
    e.preventDefault();
    const dropTarget = e.target.closest('.meal-slot, .empty-meal-slot');
    if (!dropTarget || !draggedMealData) return;

    dropTarget.classList.remove('drag-over');
    
    const targetDate = dropTarget.dataset.date;
    const targetMealType = dropTarget.dataset.mealType;

    // Undgå at gøre noget, hvis måltidet slippes på sin oprindelige plads
    if (targetDate === draggedMealData.sourceDate && targetMealType === draggedMealData.sourceMealType) {
        return;
    }

    await moveMealInFirestore(draggedMealData, { date: targetDate, mealType: targetMealType });
}

/**
 * Rydder op efter et træk er afsluttet (uanset om det lykkedes eller ej).
 * @param {DragEvent} e - dragend event.
 */
function handleDragEnd(e) {
    if (e.target.classList.contains('meal-card')) {
        e.target.classList.remove('dragging');
    }
    draggedMealData = null;
    // Fjern eventuelle 'drag-over' klasser, hvis musen forlod vinduet
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
}

/**
 * Flytter et måltid i Firestore-databasen.
 * @param {object} source - Data om det oprindelige måltid { mealId, recipeId, sourceDate, sourceMealType }.
 * @param {object} target - Data om den nye placering { date, mealType }.
 */
async function moveMealInFirestore(source, target) {
    const mealPlanRef = doc(db, 'meal_plans', appState.currentUser.uid);
    const sourcePath = `${source.sourceDate}.${source.sourceMealType}`;
    const targetPath = `${target.date}.${target.mealType}`;

    try {
        const planDoc = await getDoc(mealPlanRef);
        const planData = planDoc.data() || {};
        
        const sourceMeals = planData[source.sourceDate]?.[source.sourceMealType] || [];
        const mealToMove = sourceMeals.find(m => m.id === source.mealId);

        if (!mealToMove) {
            throw new Error("Kunne ikke finde måltidet, der skulle flyttes.");
        }

        const batch = writeBatch(db);

        // Fjern fra den gamle placering
        batch.update(mealPlanRef, { [sourcePath]: arrayRemove(mealToMove) });
        // Tilføj til den nye placering
        batch.set(mealPlanRef, { [target.date]: { [target.mealType]: arrayUnion(mealToMove) } }, { merge: true });

        await batch.commit();
        showNotification({title: "Madplan opdateret", message: "Måltidet er blevet flyttet."});

    } catch (error) {
        handleError(error, "Kunne ikke flytte måltidet.", "moveMealInFirestore");
    }
}
