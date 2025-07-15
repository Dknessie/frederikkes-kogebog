// js/mealPlanner.js

import { db } from './firebase.js';
import { doc, setDoc, writeBatch, deleteField, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { getWeekNumber, getStartOfWeek, formatDate } from './utils.js';
import { addToKitchenCounterFromRecipe } from './kitchenCounter.js';
import { calculateRecipePrice } from './recipes.js';

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
            // This will remove the specific meal object from the array.
            await updateDoc(mealPlanRef, {
                [fieldPath]: arrayRemove(mealData)
            });
        } catch (error) {
            handleError(error, "Måltidet kunne ikke fjernes.", "removeMeal");
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
        // Using setDoc with merge ensures the document and nested fields are created if they don't exist.
        await setDoc(mealPlanRef, {
            [date]: {
                [mealType]: arrayUnion(mealData)
            }
        }, { merge: true });

        appElements.planMealModal.classList.add('hidden');
        showNotification({title: "Planlagt!", message: "Retten er føjet til din madplan."});
    } catch (error) {
        handleError(error, "Kunne ikke tilføje måltidet.", "planMealSubmit");
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
