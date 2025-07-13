// js/mealPlanner.js

import { db } from './firebase.js';
import { doc, setDoc, writeBatch, deleteField, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { getWeekNumber, getStartOfWeek, formatDate } from './utils.js';
import { addToKitchenCounterFromRecipe } from './kitchenCounter.js';
import { calculateRecipePrice, calculateRecipeMatch } from './recipes.js';

let appState;
let appElements;

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
        if (dateString === todayString) dayDiv.classList.add('is-today');

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
    renderWeeklyPrice();
}

function populateCalendarWithData() {
    document.querySelectorAll('.meal-slot').forEach(slot => {
        slot.innerHTML = ''; // Clear previous content
        const date = slot.dataset.date;
        const mealType = slot.dataset.meal;
        const meals = appState.mealPlan[date]?.[mealType] || [];

        if (Array.isArray(meals)) {
            meals.forEach(mealData => {
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
                recipeDiv.dataset.meal = JSON.stringify(mealData); // Store the whole meal object
                
                const cookBtnHTML = recipeExists && !isLeftovers ? `<button class="btn-icon cook-meal-btn" title="Læg på Køkkenbord"><i class="fas fa-concierge-bell"></i></button>` : '';

                recipeDiv.innerHTML = `
                    <span>${recipeName}</span>
                    <div class="planned-recipe-actions">
                        ${cookBtnHTML}
                        <button class="btn-icon remove-meal-btn" title="Fjern fra madplan"><i class="fas fa-trash"></i></button>
                    </div>
                `;
                slot.appendChild(recipeDiv);
            });
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
    const plannedRecipeDiv = e.target.closest('.planned-recipe');
    if (!plannedRecipeDiv) return;

    const mealData = JSON.parse(plannedRecipeDiv.dataset.meal);

    if (e.target.closest('.cook-meal-btn')) {
        await addToKitchenCounterFromRecipe(mealData.recipeId, mealData.portions);
        return;
    }

    if (e.target.closest('.remove-meal-btn')) {
        const slot = plannedRecipeDiv.closest('.meal-slot');
        const date = slot.dataset.date;
        const mealType = slot.dataset.meal;

        const year = new Date(date).getFullYear();
        const mealPlanRef = doc(db, 'meal_plans', `plan_${year}`);
        const fieldPath = `${date}.${mealType}`;
        
        try {
            await updateDoc(mealPlanRef, {
                [fieldPath]: arrayRemove(mealData)
            });
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
        return !(recipePrice > (budget / 7) && recipePrice > 0);
    });

    if(useLeftovers) {
        eligibleRecipes = eligibleRecipes.map(r => calculateRecipeMatch(r, appState.inventory)).sort((a,b) => a.missingCount - b.missingCount);
    }

    if (eligibleRecipes.length < 1) {
        showNotification({title: "Ingen Opskrifter", message: "Kunne ikke finde opskrifter, der matcher dine kriterier."});
        return;
    }

    const weeklyPlan = {};
    const start = getStartOfWeek(appState.currentDate);
    let usedRecipeIds = new Set();

    for (let i = 0; i < 7; i++) {
        let chosenRecipe = eligibleRecipes.find(r => !usedRecipeIds.has(r.id));
        if (!chosenRecipe) {
            chosenRecipe = eligibleRecipes[Math.floor(Math.random() * eligibleRecipes.length)];
        }
        usedRecipeIds.add(chosenRecipe.id);
        
        const dateString = formatDate(new Date(start.getTime() + i * 86400000));
        weeklyPlan[dateString] = {
            dinner: [{
                mealId: crypto.randomUUID(),
                recipeId: chosenRecipe.id,
                type: 'recipe',
                portions: chosenRecipe.portions
            }]
        };
    }
    
    const confirmed = await showNotification({title: "Forslag til Madplan", message: "En ny madplan er genereret. Vil du gemme den?", type: 'confirm'});
    if (confirmed) {
        const year = appState.currentDate.getFullYear();
        const mealPlanRef = doc(db, 'meal_plans', `plan_${year}`);
        try {
            await updateDoc(mealPlanRef, weeklyPlan);
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
        handleError(new Error("Udfyld venligst alle felter."), "Udfyld venligst alle felter.", "planMealSubmit");
        return;
    }
    
    const mealType = mealTypeBtn.dataset.meal;
    const mealData = {
        mealId: crypto.randomUUID(), // Unique ID for this specific meal instance
        recipeId,
        type: 'recipe',
        portions,
    };

    const year = new Date(date).getFullYear();
    const mealPlanRef = doc(db, 'meal_plans', `plan_${year}`);
    const fieldPath = `${date}.${mealType}`;
    
    try {
        await updateDoc(mealPlanRef, {
            [fieldPath]: arrayUnion(mealData)
        });
        appElements.planMealModal.classList.add('hidden');
        showNotification({title: "Planlagt!", message: "Retten er føjet til din madplan."});
    } catch (error) {
        // If the document or field doesn't exist, set it instead of updating
        if (error.code === 'not-found' || error.message.includes('No document to update')) {
            try {
                await setDoc(mealPlanRef, { [date]: { [mealType]: [mealData] } }, { merge: true });
                appElements.planMealModal.classList.add('hidden');
                showNotification({title: "Planlagt!", message: "Retten er føjet til din madplan."});
            } catch (set_error) {
                handleError(set_error, "Kunne ikke tilføje måltidet.", "planMealSubmit-set");
            }
        } else {
            handleError(error, "Kunne ikke tilføje måltidet.", "planMealSubmit-update");
        }
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
                    mealArray.forEach(meal => {
                        const recipe = appState.recipes.find(r => r.id === meal.recipeId);
                        if (recipe) {
                            weeklyTotal += calculateRecipePrice(recipe, appState.inventory, meal.portions);
                        }
                    });
                }
            });
        }
    }
    
    appElements.weeklyPriceDisplay.textContent = `Estimeret Ugepris: ${weeklyTotal.toFixed(2)} kr.`;
}
