// js/shoppingList.js

import { db } from './firebase.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// Rettet import til at hente fra utils.js
import { handleError, convertToGrams } from './utils.js';

let state;

export function initShoppingList(appState) {
    state = appState;
    // Fremtidige event listeners for indkøbslisten kan tilføjes her.
}

export function generateGroceriesFromMealPlan() {
    if (!state.mealPlan || !state.recipes) return {};

    const requiredIngredients = {};

    for (const mealId in state.mealPlan) {
        const meal = state.mealPlan[mealId];
        const recipe = state.recipes.find(r => r.id === meal.recipeId);

        if (recipe && recipe.ingredients) {
            recipe.ingredients.forEach(ingredient => {
                const key = ingredient.name.toLowerCase();
                const amountInGrams = convertToGrams(ingredient.quantity, ingredient.unit);

                if (requiredIngredients[key]) {
                    requiredIngredients[key].quantity += amountInGrams;
                } else {
                    requiredIngredients[key] = {
                        name: ingredient.name,
                        quantity: amountInGrams,
                        unit: 'g' // Alt er nu standardiseret til gram
                    };
                }
            });
        }
    }
    return requiredIngredients;
}

export async function saveShoppingList(listType, listData) {
    if (!state.currentUser) return;
    try {
        const listRef = doc(db, 'shopping_lists', state.currentUser.uid);
        await updateDoc(listRef, {
            [listType]: listData
        }, { merge: true });
    } catch (error) {
        handleError(error, `Kunne ikke gemme indkøbslisten (${listType}).`, "saveShoppingList");
    }
}
