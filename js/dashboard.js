// js/dashboard.js
import { db } from './firebase.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { calculateRecipePrice } from './recipes.js';
import { formatDate } from './utils.js';
import { openShoppingListModal } from './shoppingList.js';

let appState;
let appElements;

export function initDashboard(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        groceriesSummaryWidget: document.getElementById('widget-groceries-summary'),
        materialsSummaryWidget: document.getElementById('widget-materials-summary'),
        wishlistSummaryWidget: document.getElementById('widget-wishlist-summary'),
    };

    if (appElements.editBudgetBtn) {
        appElements.editBudgetBtn.addEventListener('click', openEditBudgetModal);
    }
    if (appElements.editBudgetForm) {
        appElements.editBudgetForm.addEventListener('submit', handleSaveBudget);
    }
    if (appElements.favoriteStoreSelect) {
        appElements.favoriteStoreSelect.addEventListener('change', handleSaveFavoriteStore);
    }

    // Add click listeners for new summary widgets
    if (appElements.groceriesSummaryWidget) {
        appElements.groceriesSummaryWidget.addEventListener('click', () => openShoppingListModal('groceries'));
    }
    if (appElements.materialsSummaryWidget) {
        appElements.materialsSummaryWidget.addEventListener('click', () => openShoppingListModal('materials'));
    }
    if (appElements.wishlistSummaryWidget) {
        appElements.wishlistSummaryWidget.addEventListener('click', () => openShoppingListModal('wishlist'));
    }
}

export function renderDashboardPage() {
    if (!appState.currentUser) return;
    if (appElements.profileEmail) {
        appElements.profileEmail.textContent = appState.currentUser.email;
    }

    renderBudgetWidget();
    renderInventorySummaryWidget();
    renderExpiringItemsWidget();
    renderFavoriteStoreSelector();
}

function renderBudgetWidget() {
    if (!appElements.budgetSpentEl || !appElements.budgetTotalEl || !appElements.budgetProgressBar) return;

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

function renderExpiringItemsWidget() {
    if (!appElements.expiringItemsList) return;

    const listEl = appElements.expiringItemsList;
    const today = new Date();
    today.setHours(0,0,0,0);
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);

    const expiringBatches = appState.inventoryBatches.filter(batch => {
        if (!batch.expiryDate) return false;
        const expiryDate = new Date(batch.expiryDate);
        return expiryDate <= sevenDaysFromNow;
    });

    expiringBatches.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    
    if (expiringBatches.length === 0) {
        listEl.innerHTML = '<p class="empty-state">Alt ser godt ud! Ingen varer udløber inden for 7 dage.</p>';
        return;
    }

    listEl.innerHTML = expiringBatches.slice(0, 5).map(batch => {
        const item = appState.inventoryItems.find(i => i.id === batch.itemId);
        if (!item) return '';

        const expiryDate = new Date(batch.expiryDate);
        const isExpired = expiryDate < today;

        return `
            <div class="expiring-item">
                <span>${item.name} (${batch.quantity} x ${batch.size}${batch.unit})</span>
                <span class="expiring-date ${isExpired ? 'is-expired' : ''}">
                    ${isExpired ? 'Udløbet' : ''} ${formatDate(expiryDate)}
                </span>
            </div>
        `;
    }).join('');
}

function renderInventorySummaryWidget() {
    if (!appElements.inventorySummaryList) return;

    const listEl = appElements.inventorySummaryList;
    const totalItems = appState.inventoryItems.length;
    const itemsWithStock = appState.inventory.filter(item => item.totalStock > 0).length;
    let totalValue = 0;

    appState.inventoryBatches.forEach(batch => {
        totalValue += batch.price || 0;
    });
    
    listEl.innerHTML = `
        <div class="summary-item">
            <span>Antal varetyper</span>
            <span class="summary-value">${totalItems}</span>
        </div>
        <div class="summary-item">
            <span>Varetyper på lager</span>
            <span class="summary-value">${itemsWithStock}</span>
        </div>
        <div class="summary-item">
            <span>Estimeret lagerværdi</span>
            <span class="summary-value">${totalValue.toFixed(2)} kr.</span>
        </div>
    `;
}

function renderFavoriteStoreSelector() {
    if (!appElements.favoriteStoreSelect) return;

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
    if (appElements.monthlyBudgetInput) {
        appElements.monthlyBudgetInput.value = appState.budget.monthlyAmount || '';
    }
    if (appElements.editBudgetModal) {
        appElements.editBudgetModal.classList.remove('hidden');
    }
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
        await setDoc(settingsRef, { monthlyAmount: newAmount }, { merge: true });
        appElements.editBudgetModal.classList.add('hidden');
        showNotification({ title: "Budget Opdateret", message: "Dit månedlige budget er blevet gemt." });
    } catch (error) {
        handleError(error, "Budgettet kunne ikke gemmes.", "saveBudget");
    }
}
