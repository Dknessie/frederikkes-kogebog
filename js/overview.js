// js/overview.js

// Handles all logic for the overview page, including the new budget card.

import { db } from './firebase.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { calculateRecipePrice } from './recipes.js';

let appState;
let appElements;

/**
 * Initializes the overview module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
export function initOverview(state, elements) {
    appState = state;
    appElements = elements;

    const editBudgetBtn = document.getElementById('edit-budget-btn');
    editBudgetBtn.addEventListener('click', openEditBudgetModal);

    appElements.editBudgetForm.addEventListener('submit', handleSaveBudget);
}

/**
 * Renders the budget overview card with current spending and progress bar.
 */
export function renderBudgetOverview() {
    if (!appState.currentUser) return;

    const monthlyBudget = appState.budget.monthlyAmount || 0;
    const monthlySpent = calculateMonthlySpending();

    appElements.budgetTotalEl.textContent = `${monthlyBudget.toFixed(2)} kr.`;
    appElements.budgetSpentEl.textContent = `${monthlySpent.toFixed(2)} kr.`;

    const percentage = monthlyBudget > 0 ? (monthlySpent / monthlyBudget) * 100 : 0;
    const progressBar = appElements.budgetProgressBar;
    
    progressBar.style.width = `${Math.min(percentage, 100)}%`; // Cap width at 100%

    // Update progress bar color based on user's preference
    progressBar.classList.remove('green', 'yellow', 'red');
    if (percentage > 100) {
        progressBar.classList.add('red');
    } else if (percentage > 75) {
        progressBar.classList.add('yellow');
    } else {
        progressBar.classList.add('green');
    }
}

/**
 * Calculates the total estimated cost of all planned meals for the current month.
 * @returns {number} The total cost for the month.
 */
function calculateMonthlySpending() {
    let totalCost = 0;
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    for (const dateString in appState.mealPlan) {
        const date = new Date(dateString);
        if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
            const dayPlan = appState.mealPlan[dateString];
            for (const mealType in dayPlan) {
                const mealArray = dayPlan[mealType];
                if (Array.isArray(mealArray)) {
                    mealArray.forEach(meal => {
                        const recipe = appState.recipes.find(r => r.id === meal.recipeId);
                        if (recipe) {
                            totalCost += calculateRecipePrice(recipe, appState.inventory, meal.portions);
                        }
                    });
                }
            }
        }
    }
    return totalCost;
}

/**
 * Opens the modal to edit the monthly budget.
 */
function openEditBudgetModal() {
    appElements.monthlyBudgetInput.value = appState.budget.monthlyAmount;
    appElements.editBudgetModal.classList.remove('hidden');
}

/**
 * Handles the form submission for saving the new budget.
 * @param {Event} e - The form submission event.
 */
async function handleSaveBudget(e) {
    e.preventDefault();
    const newAmount = parseFloat(appElements.monthlyBudgetInput.value);

    if (isNaN(newAmount) || newAmount < 0) {
        showNotification({ title: "Ugyldigt Beløb", message: "Indtast venligst et gyldigt, positivt tal for budgettet." });
        return;
    }

    const settingsRef = doc(db, 'users', appState.currentUser.uid, 'settings', 'budget');
    try {
        await setDoc(settingsRef, { monthlyAmount: newAmount });
        appElements.editBudgetModal.classList.add('hidden');
        showNotification({ title: "Budget Opdateret", message: "Dit månedlige budget er blevet gemt." });
    } catch (error) {
        handleError(error, "Budgettet kunne ikke gemmes.", "saveBudget");
    }
}
