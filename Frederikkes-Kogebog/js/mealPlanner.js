// js/mealPlanner.js

// Handles logic for the meal planner calendar and planning modals.

import { db } from './firebase.js';
import { doc, setDoc, writeBatch, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { getWeekNumber, getStartOfWeek, formatDate } from './utils.js';
import { addToKitchenCounterFromRecipe } from './kitchenCounter.js';
import { calculateRecipePrice } from './recipes.js';

let appState;
let appElements;

/**
 * Initializes the meal planner module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
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
    
    // --- Planning Modals ---
    appElements.autogenPlanBtn.addEventListener('click', openAutogenModal);
    appElements.autogenForm.addEventListener('submit', handleAutogenSubmit);
    appElements.mealTypeSelector.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        appElements.mealTypeSelector.querySelectorAll('.btn').forEach(btn => btn.classList.remove('active'));
        target.classList.add('active');
    });
    appElements.planMealForm.addEventListener('submit', handlePlanMealSubmit);
}

/**
 * Renders the main meal planner calendar grid.
 */
export function renderMealPlanner() {
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
        if (dateString === todayString) {
            dayDiv.classList.add('is-today');
        }

        dayDiv.innerHTML = `
            <div class="calendar-day-header">${days[i]} <span class="date-number">${dayDate.getDate()}.</span></div>
            <div class="meal-slots">
                <div class="meal-slot" data-date="${dateString}" data-meal="breakfast"></div>
                <div class="meal-slot" data-date="${dateString}" data-meal="lunch"></div>
                <div class="meal-slot" data-date="${dateString}" data-meal="dinner"></div>
            </div>
        `;
        fragment.appendChild(dayDiv);
    }
    appElements.calendarGrid.appendChild(fragment);
    populateCalendarWithData();
}

/**
 * Fills the calendar with data from the state.
 */
function populateCalendarWithData() {
    document.querySelectorAll('.meal-slot').forEach(slot => {
        const date = slot.dataset.date;
        const meal = slot.dataset.meal;
        const mealData = appState.mealPlan[date]?.[meal];
        
        slot.querySelector('.planned-recipe')?.remove();

        if (mealData) {
            let recipeName = "Ukendt";
            let isLeftovers = mealData.type === 'leftovers';
            let recipeExists = true;

            if (isLeftovers) {
                recipeName = "Rester";
            } else if (mealData.recipeId) {
                const recipe = appState.recipes.find(r => r.id === mealData.recipeId);
                if (recipe) {
                    recipeName = recipe.title;
                } else {
                    recipeName = "Slettet Opskrift";
                    recipeExists = false;
                }
            }
            
            const recipeDiv = document.createElement('div');
            recipeDiv.className = 'planned-recipe';
            if (isLeftovers) recipeDiv.classList.add('leftovers');
            if (!recipeExists) recipeDiv.classList.add('deleted');

            recipeDiv.draggable = recipeExists;
            recipeDiv.dataset.sourceDate = date;
            recipeDiv.dataset.sourceMeal = meal;
            recipeDiv.dataset.mealData = JSON.stringify(mealData);
            
            const cookBtnHTML = recipeExists && !isLeftovers ? `<button class="btn-icon cook-meal-btn" title="Læg på Køkkenbord"><i class="fas fa-concierge-bell"></i></button>` : '';

            recipeDiv.innerHTML = `
                <span>${recipeName}</span>
                <div class="planned-recipe-actions">
                    ${cookBtnHTML}
                    <button class="btn-icon remove-meal-btn" title="Fjern fra madplan"><i class="fas fa-trash"></i></button>
                </div>
            `;
            slot.appendChild(recipeDiv);
        }
    });
}

async function handleClearMealPlan() {
    const confirmed = await showNotification({
        title: "Ryd Madplan",
        message: "Er du sikker på, at du vil fjerne alle måltider fra denne uge?",
        type: 'confirm'
    });
    if (!confirmed) return;

    const year = appState.currentDate.getFullYear();
    const mealPlanDocId = `plan_${year}`;
    const mealPlanRef = doc(db, 'meal_plans', mealPlanDocId);

    const batch = writeBatch(db);
    const start = getStartOfWeek(appState.currentDate);
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(start);
        dayDate.setDate(start.getDate() + i);
        const dateString = formatDate(dayDate);
        batch.update(mealPlanRef, { [dateString]: deleteField() });
    }

    try {
        await batch.commit();
        showNotification({title: "Madplan Tømt", message: "Alle måltider for denne uge er fjernet."});
    } catch (error) {
        handleError(error, "Madplanen kunne ikke ryddes. Måske er den allerede tom.", "clearMealPlan");
    }
}

async function handleCalendarClick(e) {
    const cookBtn = e.target.closest('.cook-meal-btn');
    if (cookBtn) {
        const mealData = JSON.parse(cookBtn.closest('.planned-recipe').dataset.mealData);
        await addToKitchenCounterFromRecipe(mealData.recipeId, mealData.portions);
        return;
    }

    const removeBtn = e.target.closest('.remove-meal-btn');
    if (removeBtn) {
        const slot = removeBtn.closest('.meal-slot');
        const date = slot.dataset.date;
        const mealType = slot.dataset.meal;

        const confirmed = await showNotification({title: "Fjern måltid", message: "Er du sikker?", type: 'confirm'});
        if (!confirmed) return;

        const year = new Date(date).getFullYear();
        const mealPlanDocId = `plan_${year}`;
        const mealPlanRef = doc(db, 'meal_plans', mealPlanDocId);
        const fieldPath = `${date}.${mealType}`;
        
        try {
            await updateDoc(mealPlanRef, { [fieldPath]: deleteField() });
        } catch (error) {
            handleError(error, "Måltidet kunne ikke fjernes.", "removeMeal");
        }
    }
}

function openAutogenModal() {
    const allTags = new Set();
    appState.recipes.forEach(r => {
        if (r.tags) r.tags.forEach(tag => allTags.add(tag));
    });

    appElements.autogenDietTagsContainer.innerHTML = '';
    [...allTags].sort().forEach(tag => {
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" value="${tag}"> ${tag}`;
        appElements.autogenDietTagsContainer.appendChild(label);
    });

    appElements.autogenModal.classList.remove('hidden');
}

async function handleAutogenSubmit(e) {
    e.preventDefault();
    
    const budget = parseFloat(document.getElementById('autogen-budget').value) || Infinity;
    const maxTime = parseInt(document.getElementById('autogen-time').value, 10);
    const useLeftovers = document.getElementById('autogen-use-leftovers').checked;
    const selectedDietTags = [...appElements.autogenDietTagsContainer.querySelectorAll('input:checked')].map(el => el.value);

    let eligibleRecipes = appState.recipes.filter(recipe => {
        if (recipe.time > maxTime) return false;
        if (selectedDietTags.length > 0 && !selectedDietTags.every(tag => recipe.tags?.includes(tag))) return false;
        
        const recipePrice = calculateRecipePrice(recipe, appState.inventory);
        if (recipePrice > (budget / 7) && recipePrice > 0) return false;

        return true;
    });

    if(useLeftovers) {
        eligibleRecipes = eligibleRecipes.map(r => calculateRecipeMatch(r, appState.inventory)).sort((a,b) => a.missingCount - b.missingCount);
    }

    if (eligibleRecipes.length < 7) {
        showNotification({title: "Ikke nok opskrifter", message: "Kunne ikke finde nok opskrifter, der matcher dine kriterier. Prøv med færre begrænsninger."});
        return;
    }

    const weeklyPlan = {};
    const start = getStartOfWeek(appState.currentDate);
    let usedRecipeIds = new Set();

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(start);
        dayDate.setDate(start.getDate() + i);
        const dateString = formatDate(dayDate);
        
        let chosenRecipe = null;
        for(let recipe of eligibleRecipes) {
            if (!usedRecipeIds.has(recipe.id)) {
                chosenRecipe = recipe;
                break;
            }
        }
        if (!chosenRecipe) {
            chosenRecipe = eligibleRecipes[Math.floor(Math.random() * eligibleRecipes.length)];
        }
        
        usedRecipeIds.add(chosenRecipe.id);
        
        weeklyPlan[dateString] = {
            dinner: { recipeId: chosenRecipe.id, type: 'recipe', portions: chosenRecipe.portions }
        };
    }
    
    const confirmed = await showNotification({title: "Forslag til Madplan", message: "En ny madplan er genereret baseret på dine kriterier. Vil du gemme den?", type: 'confirm'});
    if (confirmed) {
        const year = appState.currentDate.getFullYear();
        const mealPlanDocId = `plan_${year}`;
        const mealPlanRef = doc(db, 'meal_plans', mealPlanDocId);

        try {
            const updates = {};
            Object.keys(weeklyPlan).forEach(date => {
                updates[date] = weeklyPlan[date];
            });
            await setDoc(mealPlanRef, updates, { merge: true });
            appElements.autogenModal.classList.add('hidden');
            showNotification({title: "Madplan Gemt", message: "Din nye madplan er blevet gemt."});
        } catch (error) {
            handleError(error, "Den autogenererede madplan kunne ikke gemmes.", "saveAutogenPlan");
        }
    }
}

async function handlePlanMealSubmit(e) {
    e.preventDefault();
    
    const recipeId = document.getElementById('plan-meal-recipe-id').value;
    const date = document.getElementById('plan-meal-date').value;
    const portions = Number(document.getElementById('plan-meal-portions').value);
    const mealTypeBtn = appElements.mealTypeSelector.querySelector('.btn.active');

    if (!recipeId || !date || !portions || !mealTypeBtn) {
        handleError(new Error("Udfyld venligst alle felter."), "Udfyld venligst alle felter for at planlægge måltidet.", "planMealSubmit");
        return;
    }
    
    const mealType = mealTypeBtn.dataset.meal;

    const mealData = {
        recipeId,
        type: 'recipe',
        portions,
    };

    const year = new Date(date).getFullYear();
    const mealPlanDocId = `plan_${year}`;
    const mealPlanRef = doc(db, 'meal_plans', mealPlanDocId);
    
    try {
        await setDoc(mealPlanRef, {
            [date]: {
                [mealType]: mealData
            }
        }, { merge: true });

        appElements.planMealModal.classList.add('hidden');
        showNotification({title: "Planlagt!", message: "Retten er blevet føjet til din madplan."});

    } catch (error) {
        handleError(error, "Kunne ikke tilføje måltidet til madplanen.", "planMealSubmit");
    }
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
