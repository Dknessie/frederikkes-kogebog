// js/mealPlanner.js

import { db } from './firebase.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleError } from './utils.js';
// Importerer nu fra inventory.js i stedet for kitchenCounter.js
import { confirmAndDeductIngredients } from './inventory.js'; 

let state;
let elements;

export function initMealPlanner(appState, appElements) {
    state = appState;
    elements = appElements;
    // Event listeners for madplanlæggeren, f.eks. til at åbne "planlæg måltid"-modalen.
}

export function renderMealPlanner() {
    // Logik til at rendere kalenderen/madplanen baseret på state.mealPlan
}

export async function planMeal(date, mealType, recipeId) {
    if (!state.currentUser) return;
    
    const mealPlanId = `${date}_${mealType}`;
    const mealPlanRef = doc(db, 'meal_plans', state.currentUser.uid);

    try {
        await setDoc(mealPlanRef, {
            [mealPlanId]: {
                recipeId: recipeId,
                plannedAt: new Date()
            }
        }, { merge: true });

        // Kald funktionen der (potentielt) fratrækker ingredienser fra lageret
        await confirmAndDeductIngredients(recipeId);

    } catch (error) {
        handleError(error, "Kunne ikke planlægge måltid.", "planMeal");
    }
}
