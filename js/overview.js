// js/overview.js

import { db } from './firebase.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { calculateRecipePrice } from './recipes.js';
import { formatDate } from './utils.js';

let appState;
let appElements;

export function initOverview(state, elements) {
    appState = state;
    appElements = elements;

    document.getElementById('edit-budget-btn').addEventListener('click', openEditBudgetModal);
    appElements.editBudgetForm.addEventListener('submit', handleSaveBudget);
    appElements.favoriteStoreSelect.addEventListener('change', handleSaveFavoriteStore);
}

export function renderOverviewPage() {
    renderBudgetOverview();
    renderInventorySummary();
    renderExpiringItems();
    renderFavoriteStoreSelector();
}

function renderBudgetOverview() {
    if (!appState.currentUser) return;

    const monthlyBudget = appState.budget.monthlyAmount || 0;
    const monthlySpent = calculateMonthlySpending();

    appElements.budgetSpentEl.textContent = `${monthlySpent.toFixed(2)} kr.`;
    appElements.budgetTotalEl.textContent = `${monthlyBudget.toFixed(2)} kr.`;

    const percentage = monthlyBudget > 0 ? (monthlySpent / monthlyBudget) * 100 : 0;
    const progressBar = appElements.budgetProgressBar;
    
    progressBar.style.width = `${Math.min(percentage, 100)}%`;

    progressBar.classList.remove('green', 'yellow', 'red');
    if (percentage > 100) {
        progressBar.classList.add('red');
    } else if (percentage > 75) {
        progressBar.classList.add('yellow');
    } else {
        progressBar.classList.add('green');
    }
}

function renderExpiringItems() {
    const listEl = document.getElementById('expiring-items-list');
    const today = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);

    const expiringItems = [];
    appState.inventory.forEach(item => {
        if (item.batches && Array.isArray(item.batches)) {
            item.batches.forEach(batch => {
                if (batch.expiry_date) {
                    const expiryDate = new Date(batch.expiry_date);
                    if (expiryDate <= sevenDaysFromNow) {
                        expiringItems.push({
                            name: item.name,
                            expiryDate: expiryDate,
                            isExpired: expiryDate < today
                        });
                    }
                }
            });
        }
    });

    expiringItems.sort((a, b) => a.expiryDate - b.expiryDate);
    
    if (expiringItems.length === 0) {
        listEl.innerHTML = '<p class="empty-state">Alt ser godt ud! Ingen varer udløber inden for 7 dage.</p>';
        return;
    }

    listEl.innerHTML = expiringItems.slice(0, 5).map(item => `
        <div class="expiring-item">
            <span>${item.name}</span>
            <span class="expiring-date ${item.isExpired ? 'is-expired' : ''}">
                ${item.isExpired ? 'Udløbet' : ''} ${formatDate(item.expiryDate)}
            </span>
        </div>
    `).join('');
}

function renderInventorySummary() {
    // This function will need a major overhaul once the data model changes.
    // For now, it will likely show incorrect data or break.
    const summaryCard = appElements.inventorySummaryCard;
    summaryCard.innerHTML = '<h3>Lagerstatus</h3><p><em>Opdateres efter ombygning...</em></p>';
}

function renderFavoriteStoreSelector() {
    const select = appElements.favoriteStoreSelect;
    const stores = appState.references.stores || [];
    const favoriteStore = appState.preferences?.favoriteStoreId || '';

    const focused = document.activeElement === select;

    select.innerHTML = '<option value="">Vælg favoritbutik...</option>';
    stores.sort((a, b) => a.localeCompare(b)).forEach(store => {
        const option = document.createElement('option');
        option.value = store;
        option.textContent = store;
        select.appendChild(option);
    });
    select.value = favoriteStore;

    if (focused) {
        select.focus();
    }
}

async function handleSaveFavoriteStore(e) {
    const newFavoriteStore = e.target.value;
    if (!appState.currentUser) return;

    const settingsRef = doc(db, 'users', appState.currentUser.uid, 'settings', 'preferences');
    try {
        await setDoc(settingsRef, { favoriteStoreId: newFavoriteStore }, { merge: true });
        showNotification({ title: "Gemt", message: "Din favoritbutik er opdateret." });
    } catch (error) {
        handleError(error, "Favoritbutik kunne ikke gemmes.", "saveFavoriteStore");
    }
}


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

function openEditBudgetModal() {
    appElements.monthlyBudgetInput.value = appState.budget.monthlyAmount;
    appElements.editBudgetModal.classList.remove('hidden');
}

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
