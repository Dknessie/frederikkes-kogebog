// js/dashboard.js
import { showNotification, handleError } from './ui.js';
import { openShoppingListModal, addSingleItemToGroceries } from './shoppingList.js';
import { openEventModal } from './events.js';

let appState;
let appElements;

export function initDashboard(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        welcomeTitle: document.getElementById('welcome-title'),
        welcomeSummary: document.getElementById('welcome-summary'),
        timelineContent: document.getElementById('timeline-content'),
        addEventBtn: document.getElementById('add-event-btn'),
        projectsFocusContent: document.getElementById('projects-focus-content'),
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
        timelineBirthdays: document.getElementById('timeline-birthdays'),
        timelineEvents: document.getElementById('timeline-events'),
        timelineTodos: document.getElementById('timeline-todos'),
        netWorthWidgetContent: document.getElementById('net-worth-widget-content'),
    };

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
    renderNetWorthWidget();
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
    else if (action === 'add-expense') {
        // This will be handled by the economy module, we just need to open the modal
        const addExpenseModal = document.getElementById('add-expense-modal');
        if (addExpenseModal) addExpenseModal.classList.remove('hidden');
    }
    else window.location.hash = actionBtn.getAttribute('href');
}

function handleNotificationClick(e) {
    const addBtn = e.target.closest('.add-notification-to-list-btn');
    if (addBtn) {
        addSingleItemToGroceries(addBtn.dataset.itemId);
    }
}

function renderTimelineWidget() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allEvents = [...appState.events]
        .map(event => {
            if (event.category === 'Fødselsdag' && event.date) {
                const eventDateThisYear = new Date(event.date);
                eventDateThisYear.setFullYear(today.getFullYear());
                if (eventDateThisYear < today) {
                    eventDateThisYear.setFullYear(today.getFullYear() + 1);
                }
                return { ...event, displayDate: eventDateThisYear, title: event.name + "'s Fødselsdag" };
            }
            return { ...event, displayDate: new Date(event.date) };
        })
        .filter(event => new Date(event.date) >= today)
        .sort((a, b) => a.displayDate - b.displayDate);

    const birthdays = allEvents.filter(item => item.category === 'Fødselsdag');
    const todos = allEvents.filter(item => item.category === 'To-do');
    const otherEvents = allEvents.filter(item => item.category !== 'Fødselsdag' && item.category !== 'To-do');

    renderTimelineColumn(appElements.timelineBirthdays, birthdays.slice(0, 5), 'Fødselsdage');
    renderTimelineColumn(appElements.timelineEvents, otherEvents.slice(0, 5), 'Begivenheder');
    renderTimelineColumn(appElements.timelineTodos, todos.slice(0, 5), 'To-do');
}

function renderTimelineColumn(container, items, title) {
    if (!container) return;
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = `<h4 class="timeline-column-title">${title}</h4><p class="empty-state-small">Ingen kommende begivenheder.</p>`;
        return;
    }
    
    const listHtml = items.map(item => {
        const daysLeft = Math.ceil((item.displayDate - new Date()) / (1000 * 60 * 60 * 24));
        const countdownText = daysLeft > 0 ? `${daysLeft} dage` : 'I dag';
        const countdownClass = daysLeft <= 1 ? 'countdown soon' : 'countdown';
        const iconClass = getIconForCategory(item);
        
        return `
            <div class="timeline-item">
                <span class="timeline-item-icon"><i class="fas ${iconClass}"></i></span>
                <span class="timeline-item-text">${item.title}</span>
                <span class="${countdownClass}">${countdownText}</span>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `<h4 class="timeline-column-title">${title}</h4>${listHtml}`;
}

function getIconForCategory(eventData) {
    switch (eventData.category) {
        case 'To-do': return 'fa-sticky-note';
        case 'Aftale': return 'fa-calendar-check';
        case 'Fødselsdag': return 'fa-birthday-cake';
        case 'Udgivelse': return 'fa-book';
        case 'Projekt': return 'fa-tasks';
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
    const activeProjects = appState.projects.filter(p => p.status !== 'Afsluttet').length;
    appElements.welcomeSummary.innerHTML = `Du har <strong>${activeProjects}</strong> aktive projekt(er).`;
}

function renderProjectsFocusWidget() {
    const container = appElements.projectsFocusContent;
    if (!container) return;
    const activeProjects = appState.projects.filter(p => p.status !== 'Afsluttet').slice(0, 3);
    if (activeProjects.length === 0) {
        container.innerHTML = '<p class="empty-state">Ingen aktive projekter. Start et nyt fra "Hjem" siden.</p>';
        return;
    }
    container.innerHTML = activeProjects.map(p => {
        return `<div class="project-focus-item"><span class="project-focus-title">${p.title}</span><span class="project-status-tag">${p.status}</span></div>`;
    }).join('');
}

function renderNetWorthWidget() {
    const container = appElements.netWorthWidgetContent;
    if (!container) return;

    const assets = appState.assets || [];
    const liabilities = appState.liabilities || [];

    if (assets.length === 0) {
        container.innerHTML = '<p class="empty-state-small">Tilføj aktiver under "Økonomi" for at se din formue her.</p>';
        return;
    }

    const sortedAssets = [...assets].sort((a, b) => b.value - a.value).slice(0, 3);

    container.innerHTML = sortedAssets.map(asset => {
        const linkedLiability = liabilities.find(l => l.id === asset.linkedLiabilityId);
        const equity = linkedLiability ? asset.value - linkedLiability.currentBalance : asset.value;
        const ownershipPercentage = asset.value > 0 ? (equity / asset.value) * 100 : 0;

        return `
            <div class="net-worth-item">
                <div class="net-worth-item-header">
                    <span class="net-worth-item-title">${asset.name}</span>
                    <span class="net-worth-item-value">${equity.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' })}</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-bar-inner" style="width: ${ownershipPercentage.toFixed(2)}%;"></div>
                </div>
            </div>
        `;
    }).join('');
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
