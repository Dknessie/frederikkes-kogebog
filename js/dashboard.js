// js/dashboard.js
import { db } from './firebase.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate } from './utils.js';
import { openShoppingListModal, addSingleItemToGroceries } from './shoppingList.js';
import { openEventModal } from './events.js';

let appState;
let appElements;
let budgetGauge;

export function initDashboard(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        welcomeTitle: document.getElementById('welcome-title'),
        welcomeSummary: document.getElementById('welcome-summary'),
        timelineContent: document.getElementById('timeline-content'),
        addEventBtn: document.getElementById('add-event-btn'),
        projectsFocusContent: document.getElementById('projects-focus-content'),
        budgetGaugeContainer: document.getElementById('budget-gauge-container'),
        inventoryNotificationsContent: document.getElementById('inventory-notifications-content'),
        quickActionsContainer: document.getElementById('quick-actions-widget'),
        categoryValuesContent: document.getElementById('category-values-content'),
        groceriesSummaryWidget: document.getElementById('widget-groceries-summary'),
        materialsSummaryWidget: document.getElementById('widget-materials-summary'),
        wishlistSummaryWidget: document.getElementById('widget-wishlist-summary'),
        groceriesCount: document.getElementById('groceries-count'),
        materialsCount: document.getElementById('materials-count'),
        materialsPrice: document.getElementById('materials-price'),
        wishlistCount: document.getElementById('wishlist-count'),
        wishlistPrice: document.getElementById('wishlist-price'),
    };

    if (appElements.editBudgetBtn) appElements.editBudgetBtn.addEventListener('click', openEditBudgetModal);
    if (appElements.editBudgetForm) appElements.editBudgetForm.addEventListener('submit', handleSaveBudget);
    if (appElements.groceriesSummaryWidget) appElements.groceriesSummaryWidget.addEventListener('click', () => openShoppingListModal('groceries'));
    if (appElements.materialsSummaryWidget) appElements.materialsSummaryWidget.addEventListener('click', () => openShoppingListModal('materials'));
    if (appElements.wishlistSummaryWidget) appElements.wishlistSummaryWidget.addEventListener('click', () => openShoppingListModal('wishlist'));
    if (appElements.quickActionsContainer) appElements.quickActionsContainer.addEventListener('click', handleQuickActionClick);
    if (appElements.inventoryNotificationsContent) appElements.inventoryNotificationsContent.addEventListener('click', handleNotificationClick);
    if (appElements.addEventBtn) appElements.addEventBtn.addEventListener('click', () => openEventModal());
}

export function renderDashboardPage() {
    if (!appState.currentUser || !appState.recipes || !appState.projects || !appState.inventory) return;
    
    renderWelcomeWidget();
    renderTimelineWidget();
    renderProjectsFocusWidget();
    renderBudgetWidget();
    renderInventoryNotificationsWidget();
    renderShoppingListWidgets();
    renderCategoryValuesWidget();
}

function handleQuickActionClick(e) {
    const actionBtn = e.target.closest('.quick-action-btn');
    if (!actionBtn) return;
    
    e.preventDefault();
    const action = actionBtn.dataset.action;
    if (action === 'add-recipe') document.getElementById('add-recipe-btn').click();
    else if (action === 'add-project') document.getElementById('add-project-btn').click();
    else if (action === 'add-inventory') document.getElementById('add-inventory-item-btn').click();
    else window.location.hash = actionBtn.getAttribute('href');
}

function handleNotificationClick(e) {
    const addBtn = e.target.closest('.add-notification-to-list-btn');
    if (addBtn) {
        addSingleItemToGroceries(addBtn.dataset.itemId);
    }
}

function renderTimelineWidget() {
    const container = appElements.timelineContent;
    container.innerHTML = '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let allFutureEvents = [];

    // 1. Aggregate Meals for the next 7 days
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateString = formatDate(date);
        const dayPlan = appState.mealPlan[dateString];
        if (dayPlan) {
            Object.entries(dayPlan).forEach(([mealType, meals]) => {
                meals.forEach(meal => {
                    if (meal.type === 'recipe') {
                        const recipe = appState.recipes.find(r => r.id === meal.recipeId);
                        allFutureEvents.push({
                            date: date,
                            type: 'Madplan',
                            icon: 'fa-utensils',
                            text: `${mealType.charAt(0).toUpperCase() + mealType.slice(1)}: ${recipe ? recipe.title : 'Slettet opskrift'}`
                        });
                    }
                });
            });
        }
    }

    // 2. Aggregate all future Personal Events
    appState.events.forEach(event => {
        let displayDate;
        const eventDate = new Date(event.date);
        
        if (event.isRecurring) {
            // Calculate next occurrence of recurring event
            displayDate = new Date(event.date);
            displayDate.setFullYear(today.getFullYear());
            if (displayDate < today) {
                displayDate.setFullYear(today.getFullYear() + 1);
            }
        } else {
            displayDate = eventDate;
        }
        
        // Only include events from today onwards
        if (displayDate >= today) {
            let title = event.title;
            if (event.category === 'Fødselsdag' && event.birthYear) {
                const age = displayDate.getFullYear() - event.birthYear;
                title = `${event.name}'s Fødselsdag (${age} år)`;
            }

            allFutureEvents.push({
                date: displayDate,
                type: event.category,
                icon: getIconForCategory(event),
                text: title,
                isComplete: event.isComplete
            });
        }
    });

    // 3. Sort all events by date and take the next 10
    allFutureEvents.sort((a, b) => a.date - b.date);
    const timelineItems = allFutureEvents.slice(0, 10);

    // 4. Group and Render
    const groupedByDate = {};
    timelineItems.forEach(item => {
        const dateString = formatDate(item.date);
        if (!groupedByDate[dateString]) {
            groupedByDate[dateString] = [];
        }
        groupedByDate[dateString].push(item);
    });

    if (Object.keys(groupedByDate).length === 0) {
        container.innerHTML = `<p class="empty-state">Der er intet planlagt i den nærmeste fremtid.</p>`;
        return;
    }

    let html = '';
    Object.keys(groupedByDate).sort().forEach(dateString => {
        const date = new Date(dateString);
        // Set time to noon to avoid timezone issues with date comparison
        date.setHours(12, 0, 0, 0);
        const dayDiff = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
        
        let dayLabel = date.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });
        if (dayDiff === 0) dayLabel = 'I dag';
        if (dayDiff === 1) dayLabel = 'I morgen';
        
        html += `<div class="timeline-day-group"><h4>${dayLabel}</h4>`;
        groupedByDate[dateString].forEach(item => {
            const textClass = item.isComplete ? 'is-complete' : '';
            html += `
                <div class="timeline-item">
                    <span class="timeline-item-icon"><i class="fas ${item.icon}"></i></span>
                    <span class="timeline-item-text ${textClass}">${item.text}</span>
                </div>
            `;
        });
        html += `</div>`;
    });
    container.innerHTML = html;
}


function getIconForCategory(eventData) {
    switch (eventData.category) {
        case 'To-do': return 'fa-check-square';
        case 'Aftale': return 'fa-calendar-check';
        case 'Fødselsdag': return 'fa-birthday-cake';
        case 'Udgivelse':
            switch(eventData.subCategory) {
                case 'Film': return 'fa-film';
                case 'Bog': return 'fa-book-open';
                case 'Spil': return 'fa-gamepad';
                case 'Produkt': return 'fa-box';
                default: return 'fa-star';
            }
        default: return 'fa-info-circle';
    }
}

function renderShoppingListWidgets() {
    const groceriesCount = Object.keys(appState.shoppingLists.groceries || {}).length;
    appElements.groceriesCount.textContent = `${groceriesCount} vare${groceriesCount !== 1 ? 'r' : ''}`;
    const materialsList = Object.values(appState.shoppingLists.materials || {});
    const materialsCount = materialsList.length;
    const materialsPrice = materialsList.reduce((sum, item) => sum + (item.price || 0), 0);
    appElements.materialsCount.textContent = `${materialsCount} stk.`;
    appElements.materialsPrice.textContent = `${materialsPrice.toFixed(2).replace('.',',')} kr.`;
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
    const activeProjects = appState.projects.filter(p => p.status !== 'completed').length;
    appElements.welcomeSummary.innerHTML = `Du har <strong>${mealsToday}</strong> måltid(er) planlagt i dag og <strong>${activeProjects}</strong> aktive projekter.`;
}

function renderProjectsFocusWidget() {
    const container = appElements.projectsFocusContent;
    const activeProjects = appState.projects.filter(p => p.status !== 'completed').slice(0, 2);
    if (activeProjects.length === 0) {
        container.innerHTML = '<p class="empty-state">Ingen aktive projekter. Start et nyt fra "Hjem" siden.</p>';
        return;
    }
    container.innerHTML = activeProjects.map(p => {
        const progress = p.progress || 30;
        return `<div class="project-focus-item"><span class="project-focus-title">${p.title}</span><div class="project-progress-bar"><div style="width: ${progress}%"></div></div></div>`;
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
            max: monthlyBudget > 0 ? monthlyBudget : 1,
            title: "Faktisk Forbrug",
            label: "kr.",
            levelColors: ["#4CAF50", "#FFC107", "#F44336"],
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
    const expiringBatches = appState.inventoryBatches.filter(batch => {
        if (!batch.expiryDate) return false;
        const expiryDate = new Date(batch.expiryDate);
        return expiryDate >= today && expiryDate <= sevenDaysFromNow;
    }).map(b => ({ ...b, itemName: appState.inventoryItems.find(i => i.id === b.itemId)?.name || 'Ukendt vare', daysLeft: Math.ceil((new Date(b.expiryDate) - today) / (1000 * 60 * 60 * 24)) })).sort((a, b) => a.daysLeft - b.daysLeft);
    const lowStockItems = appState.inventory.filter(item => item.reorderPoint && item.totalStock > 0 && item.totalStock <= item.reorderPoint);
    const outOfStockItems = appState.inventory.filter(item => item.reorderPoint && item.totalStock <= 0);
    let html = '';
    if (expiringBatches.length > 0) {
        html += `<h4>Udløber Snart</h4>`;
        html += expiringBatches.map(item => `<div class="notification-item expiring"><span class="notification-text"><strong>${item.itemName}</strong> udløber om ${item.daysLeft} dag(e)</span><button class="btn-icon add-notification-to-list-btn" data-item-id="${item.itemId}" title="Tilføj til indkøbsliste"><i class="fas fa-plus-circle"></i></button></div>`).join('');
    }
    if (lowStockItems.length > 0) {
        html += `<h4>Lav Beholdning</h4>`;
        html += lowStockItems.map(item => `<div class="notification-item low-stock"><span class="notification-text"><strong>${item.name}</strong> <span class="stock-details">(${item.totalStock.toFixed(0)} / ${item.reorderPoint} ${item.defaultUnit})</span></span><button class="btn-icon add-notification-to-list-btn" data-item-id="${item.id}" title="Tilføj til indkøbsliste"><i class="fas fa-plus-circle"></i></button></div>`).join('');
    }
    if (outOfStockItems.length > 0) {
        html += `<h4>Løbet Tør</h4>`;
        html += outOfStockItems.map(item => `<div class="notification-item out-of-stock"><span class="notification-text"><strong>${item.name}</strong> <span class="stock-details">(0 / ${item.reorderPoint} ${item.defaultUnit})</span></span><button class="btn-icon add-notification-to-list-btn" data-item-id="${item.id}" title="Tilføj til indkøbsliste"><i class="fas fa-plus-circle"></i></button></div>`).join('');
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
        if (!categoryValues[category]) categoryValues[category] = 0;
        item.batches.forEach(batch => { categoryValues[category] += batch.price || 0; });
    });
    const sortedCategories = Object.entries(categoryValues).sort(([, a], [, b]) => b - a);
    const totalValue = sortedCategories.reduce((sum, [, value]) => sum + value, 0);
    if (sortedCategories.length === 0) {
        container.innerHTML = '<p class="empty-state">Ingen varer med pris på lager.</p>';
        return;
    }
    container.innerHTML = sortedCategories.map(([name, value]) => {
        const percentage = totalValue > 0 ? (value / totalValue) * 100 : 0;
        return `<div class="category-value-item"><span class="category-name" title="${name}">${name}</span><div class="category-bar-container"><div class="category-bar" style="width: ${percentage}%">${value.toFixed(0)} kr.</div></div></div>`;
    }).join('');
}

function openEditBudgetModal() {
    if (appElements.monthlyBudgetInput) appElements.monthlyBudgetInput.value = appState.budget.monthlyAmount || '';
    if (appElements.editBudgetModal) appElements.editBudgetModal.classList.remove('hidden');
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
