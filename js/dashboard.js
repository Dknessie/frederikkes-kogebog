// js/dashboard.js
import { db } from './firebase.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate, convertToGrams } from './utils.js';
import { openShoppingListModal, addSingleItemToGroceries } from './shoppingList.js';

let appState;
let appElements;
let budgetGauge;

export function initDashboard(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        // New Dashboard Elements
        welcomeTitle: document.getElementById('welcome-title'),
        welcomeSummary: document.getElementById('welcome-summary'),
        todayOverviewContent: document.getElementById('today-overview-content'),
        projectsFocusContent: document.getElementById('projects-focus-content'),
        budgetGaugeContainer: document.getElementById('budget-gauge-container'),
        inventoryNotificationsContent: document.getElementById('inventory-notifications-content'),
        quickActionsContainer: document.getElementById('quick-actions-widget'),
        categoryValuesContent: document.getElementById('category-values-content'),
        
        // Shopping List Widget Items
        groceriesSummaryWidget: document.getElementById('widget-groceries-summary'),
        materialsSummaryWidget: document.getElementById('widget-materials-summary'),
        wishlistSummaryWidget: document.getElementById('widget-wishlist-summary'),
        
        // Shopping list counts and prices
        groceriesCount: document.getElementById('groceries-count'),
        materialsCount: document.getElementById('materials-count'),
        materialsPrice: document.getElementById('materials-price'),
        wishlistCount: document.getElementById('wishlist-count'),
        wishlistPrice: document.getElementById('wishlist-price'),
    };

    if (appElements.editBudgetBtn) {
        appElements.editBudgetBtn.addEventListener('click', openEditBudgetModal);
    }
    if (appElements.editBudgetForm) {
        appElements.editBudgetForm.addEventListener('submit', handleSaveBudget);
    }

    // Add click listeners for shopping list widgets
    if (appElements.groceriesSummaryWidget) {
        appElements.groceriesSummaryWidget.addEventListener('click', () => openShoppingListModal('groceries'));
    }
    if (appElements.materialsSummaryWidget) {
        appElements.materialsSummaryWidget.addEventListener('click', () => openShoppingListModal('materials'));
    }
    if (appElements.wishlistSummaryWidget) {
        appElements.wishlistSummaryWidget.addEventListener('click', () => openShoppingListModal('wishlist'));
    }
    
    // Quick Actions
    if (appElements.quickActionsContainer) {
        appElements.quickActionsContainer.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('.quick-action-btn');
            if (!actionBtn) return;
            
            e.preventDefault(); // Prevent hash change for actions that open modals
            const action = actionBtn.dataset.action;
            if (action === 'add-recipe') {
                document.getElementById('add-recipe-btn').click();
            } else if (action === 'add-project') {
                document.getElementById('add-project-btn').click();
            } else if (action === 'add-inventory') {
                document.getElementById('add-inventory-item-btn').click();
            } else {
                // For actions that navigate, let the default href work
                window.location.hash = actionBtn.getAttribute('href');
            }
        });
    }

    // NEW: Event listener for adding items from notifications widget to shopping list
    if (appElements.inventoryNotificationsContent) {
        appElements.inventoryNotificationsContent.addEventListener('click', e => {
            const addBtn = e.target.closest('.add-notification-to-list-btn');
            if (addBtn) {
                const itemId = addBtn.dataset.itemId;
                addSingleItemToGroceries(itemId); 
            }
        });
    }
}

export function renderDashboardPage() {
    if (!appState.currentUser || !appState.recipes || !appState.projects || !appState.inventory) return;
    
    renderWelcomeWidget();
    renderTodayOverviewWidget();
    renderProjectsFocusWidget();
    renderBudgetWidget();
    renderInventoryNotificationsWidget();
    renderShoppingListWidgets();
    renderCategoryValuesWidget();
}

function renderShoppingListWidgets() {
    // Groceries
    const groceriesCount = Object.keys(appState.shoppingLists.groceries || {}).length;
    appElements.groceriesCount.textContent = `${groceriesCount} vare${groceriesCount !== 1 ? 'r' : ''}`;

    // Materials (Computed)
    const materialsList = Object.values(appState.shoppingLists.materials || {});
    const materialsCount = materialsList.length;
    const materialsPrice = materialsList.reduce((sum, item) => sum + (item.price || 0), 0);
    appElements.materialsCount.textContent = `${materialsCount} stk.`;
    appElements.materialsPrice.textContent = `${materialsPrice.toFixed(2).replace('.',',')} kr.`;

    // Wishlist (Computed)
    const wishlistItems = Object.values(appState.shoppingLists.wishlist || {});
    const wishlistCount = wishlistItems.length;
    const wishlistPrice = wishlistItems.reduce((sum, item) => sum + (item.price || 0), 0);
    appElements.wishlistCount.textContent = `${wishlistCount} ${wishlistCount !== 1 ? 'ønsker' : 'ønske'}`;
    appElements.wishlistPrice.textContent = `${wishlistPrice.toFixed(2).replace('.',',')} kr.`;
}


function renderWelcomeWidget() {
    const userEmail = appState.currentUser.email;
    const name = userEmail.split('@')[0];
    const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
    
    const hours = new Date().getHours();
    let greeting = "Velkommen";
    if (hours < 10) greeting = "Godmorgen";
    else if (hours < 18) greeting = "Goddag";
    else greeting = "Godaften";

    appElements.welcomeTitle.textContent = `${greeting}, ${capitalizedName}`;

    const today = formatDate(new Date());
    const mealsToday = appState.mealPlan[today] ? Object.values(appState.mealPlan[today]).flat().length : 0;
    const activeProjects = appState.projects.filter(p => p.status !== 'completed').length; // Assuming a status field

    appElements.welcomeSummary.innerHTML = `Du har <strong>${mealsToday}</strong> måltid(er) planlagt i dag og <strong>${activeProjects}</strong> aktive projekter.`;
}

function renderTodayOverviewWidget() {
    const container = appElements.todayOverviewContent;
    container.innerHTML = '';
    const today = formatDate(new Date());
    const dayPlan = appState.mealPlan[today];

    let contentHTML = '';

    if (dayPlan) {
        if (dayPlan.dinner && dayPlan.dinner.length > 0) {
            const recipe = appState.recipes.find(r => r.id === dayPlan.dinner[0].recipeId);
            contentHTML += `<div class="overview-item"><span class="overview-item-label"><i class="fas fa-utensils"></i> Aftensmad</span> <span>${recipe ? recipe.title : 'Ukendt'}</span></div>`;
        }
        if (dayPlan.lunch && dayPlan.lunch.length > 0) {
            const recipe = appState.recipes.find(r => r.id === dayPlan.lunch[0].recipeId);
            contentHTML += `<div class="overview-item"><span class="overview-item-label"><i class="fas fa-sun"></i> Frokost</span> <span>${recipe ? recipe.title : 'Ukendt'}</span></div>`;
        }
    }
    
    const firstProject = appState.projects.find(p => p.status !== 'completed');
    if(firstProject) {
        contentHTML += `<div class="overview-item"><span class="overview-item-label"><i class="fas fa-tasks"></i> Næste opgave</span> <span>${firstProject.title}</span></div>`;
    }


    if (contentHTML === '') {
        container.innerHTML = '<p class="empty-state">Intet planlagt for i dag. Tid til at slappe af!</p>';
    } else {
        container.innerHTML = contentHTML;
    }
}

function renderProjectsFocusWidget() {
    const container = appElements.projectsFocusContent;
    const activeProjects = appState.projects.filter(p => p.status !== 'completed').slice(0, 2);

    if (activeProjects.length === 0) {
        container.innerHTML = '<p class="empty-state">Ingen aktive projekter. Start et nyt fra "Hjem" siden.</p>';
        return;
    }

    container.innerHTML = activeProjects.map(p => {
        const progress = p.progress || 30; // Placeholder
        return `
        <div class="project-focus-item">
            <span class="project-focus-title">${p.title}</span>
            <div class="project-progress-bar"><div style="width: ${progress}%"></div></div>
        </div>
        `;
    }).join('');
}

function calculateMonthlySpending() {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    return appState.expenses
        .filter(expense => {
            if (!expense.date || !expense.date.toDate) return false;
            const expenseDate = expense.date.toDate();
            return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear;
        })
        .reduce((total, expense) => total + expense.amount, 0);
}


function renderBudgetWidget() {
    const monthlyBudget = appState.budget.monthlyAmount || 0;
    const monthlySpent = calculateMonthlySpending();

    appElements.budgetSpentEl.textContent = `${monthlySpent.toFixed(2).replace('.',',')} kr.`;
    appElements.budgetTotalEl.textContent = `${monthlyBudget.toFixed(2).replace('.',',')} kr.`;
    
    appElements.budgetGaugeContainer.innerHTML = '';
    if (typeof JustGage !== 'undefined') {
        budgetGauge = new JustGage({
            id: 'budget-gauge-container',
            value: monthlySpent,
            min: 0,
            max: monthlyBudget > 0 ? monthlyBudget : 1, // Ensure max is not 0
            title: "Faktisk Forbrug",
            label: "kr.",
            levelColors: ["#4CAF50", "#FFC107", "#F44336"], // Green, Yellow, Red
            valueFontColor: "#3d3d3d",
            titleFontColor: "#3d3d3d",
            labelFontColor: "#777",
            gaugeWidthScale: 0.6,
            counter: true,
            formatNumber: true,
            humanFriendlyDecimal: 2,
            decimals: 2,
        });
    } else {
        appElements.budgetGaugeContainer.innerHTML = '<p class="empty-state">Kunne ikke indlæse budget-graf.</p>';
    }
}

function renderInventoryNotificationsWidget() {
    const container = appElements.inventoryNotificationsContent;
    container.innerHTML = '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);

    // Get expiring items
    const expiringBatches = appState.inventoryBatches
        .filter(batch => {
            if (!batch.expiryDate) return false;
            const expiryDate = new Date(batch.expiryDate);
            return expiryDate >= today && expiryDate <= sevenDaysFromNow;
        })
        .map(b => ({
            ...b,
            itemName: appState.inventoryItems.find(i => i.id === b.itemId)?.name || 'Ukendt vare',
            daysLeft: Math.ceil((new Date(b.expiryDate) - today) / (1000 * 60 * 60 * 24))
        }))
        .sort((a, b) => a.daysLeft - b.daysLeft);

    // Get low stock items
    const lowStockItems = appState.inventory
        .filter(item => item.reorderPoint && item.totalStock > 0 && item.totalStock <= item.reorderPoint);

    // Get out of stock items
    const outOfStockItems = appState.inventory
        .filter(item => item.reorderPoint && item.totalStock <= 0);

    let html = '';

    if (expiringBatches.length > 0) {
        html += `<h4>Udløber Snart</h4>`;
        html += expiringBatches.map(item => `
            <div class="notification-item expiring">
                <span class="notification-text">
                    <strong>${item.itemName}</strong> udløber om ${item.daysLeft} dag(e)
                </span>
                <button class="btn-icon add-notification-to-list-btn" data-item-id="${item.itemId}" title="Tilføj til indkøbsliste"><i class="fas fa-plus-circle"></i></button>
            </div>
        `).join('');
    }

    if (lowStockItems.length > 0) {
        html += `<h4>Lav Beholdning</h4>`;
        html += lowStockItems.map(item => `
            <div class="notification-item low-stock">
                <span class="notification-text">
                    <strong>${item.name}</strong> <span class="stock-details">(${item.totalStock.toFixed(0)} / ${item.reorderPoint} ${item.defaultUnit})</span>
                </span>
                <button class="btn-icon add-notification-to-list-btn" data-item-id="${item.id}" title="Tilføj til indkøbsliste"><i class="fas fa-plus-circle"></i></button>
            </div>
        `).join('');
    }
    
    if (outOfStockItems.length > 0) {
        html += `<h4>Løbet Tør</h4>`;
        html += outOfStockItems.map(item => `
            <div class="notification-item out-of-stock">
                <span class="notification-text">
                    <strong>${item.name}</strong> <span class="stock-details">(0 / ${item.reorderPoint} ${item.defaultUnit})</span>
                </span>
                <button class="btn-icon add-notification-to-list-btn" data-item-id="${item.id}" title="Tilføj til indkøbsliste"><i class="fas fa-plus-circle"></i></button>
            </div>
        `).join('');
    }


    if (html === '') {
        container.innerHTML = '<p class="empty-state">Alt er fyldt op, og intet udløber snart. Godt gået!</p>';
    } else {
        container.innerHTML = html;
    }
}


function renderCategoryValuesWidget() {
    const container = appElements.categoryValuesContent;
    const categoryValues = {};

    appState.inventory.forEach(item => {
        const category = item.mainCategory || 'Ukategoriseret';
        if (!categoryValues[category]) {
            categoryValues[category] = 0;
        }
        item.batches.forEach(batch => {
            categoryValues[category] += batch.price || 0;
        });
    });

    const sortedCategories = Object.entries(categoryValues).sort(([,a],[,b]) => b-a);
    const totalValue = sortedCategories.reduce((sum, [,value]) => sum + value, 0);

    if (sortedCategories.length === 0) {
        container.innerHTML = '<p class="empty-state">Ingen varer med pris på lager.</p>';
        return;
    }

    container.innerHTML = sortedCategories.map(([name, value]) => {
        const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;
        return `
            <div class="category-value-item">
                <span class="category-name" title="${name}">${name}</span>
                <div class="category-bar-container">
                    <div class="category-bar" style="width: ${percentage}%">${value.toFixed(0)} kr.</div>
                </div>
            </div>
        `;
    }).join('');
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
