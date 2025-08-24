// js/dashboard.js
import { showNotification, handleError } from './ui.js';
import { openShoppingListModal } from './shoppingList.js';
import { openEventModal } from './events.js';
import { switchToHjemmetView } from './hjemmet.js'; // Importer den nye funktion

let appState;
let appElements;

export function initDashboard(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        welcomeTitle: document.getElementById('welcome-title'),
        welcomeSummary: document.getElementById('welcome-summary'),
        addEventBtn: document.getElementById('add-event-btn'),
        quickActionsContainer: document.getElementById('quick-actions-widget'),
        groceriesSummaryWidget: document.getElementById('widget-groceries-summary'),
        groceriesCount: document.getElementById('groceries-count'),
        // NYT: Elementer til wishlist widget
        wishlistSummaryWidget: document.getElementById('widget-wishlist-summary'),
        wishlistCount: document.getElementById('wishlist-count'),
        wishlistTotal: document.getElementById('wishlist-total'),
        timelineBirthdays: document.getElementById('timeline-birthdays'),
        timelineEvents: document.getElementById('timeline-events'),
        timelineTodos: document.getElementById('timeline-todos'),
        netWorthWidgetContent: document.getElementById('net-worth-widget-content'),
    };

    if (appElements.groceriesSummaryWidget) appElements.groceriesSummaryWidget.addEventListener('click', () => openShoppingListModal('groceries'));
    // NYT: Event listener for wishlist widget
    if (appElements.wishlistSummaryWidget) appElements.wishlistSummaryWidget.addEventListener('click', () => switchToHjemmetView('onskeliste'));
    
    if (appElements.quickActionsContainer) appElements.quickActionsContainer.addEventListener('click', handleQuickActionClick);
    if (appElements.addEventBtn) appElements.addEventBtn.addEventListener('click', () => openEventModal());
}

export function renderDashboardPage() {
    if (!appState.currentUser || !appState.inventory) return;
    
    renderWelcomeWidget();
    renderTimelineWidget();
    renderNetWorthWidget();
    renderShoppingListWidgets();
}

function handleQuickActionClick(e) {
    const actionBtn = e.target.closest('.quick-action-btn');
    if (!actionBtn) return;
    
    e.preventDefault();
    const action = actionBtn.dataset.action;
    if (action === 'add-recipe') document.getElementById('add-recipe-btn').click();
    else if (action === 'add-inventory') document.getElementById('add-inventory-item-btn').click();
    else if (action === 'add-expense') {
        const addExpenseModal = document.getElementById('add-expense-modal');
        if (addExpenseModal) {
            document.getElementById('add-expense-date').value = formatDate(new Date());
            populateReferenceDropdown(document.getElementById('add-expense-main-category'), (appState.references.budgetCategories || []).map(c => c.name), 'Vælg kategori...');
            addExpenseModal.classList.remove('hidden');
        }
    }
    else window.location.hash = actionBtn.getAttribute('href');
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


// OPDATERET: Viser nu også data for ønskelisten
function renderShoppingListWidgets() {
    // Dagligvarer
    const groceriesCount = Object.keys(appState.shoppingLists.groceries || {}).length;
    appElements.groceriesCount.textContent = `${groceriesCount} vare${groceriesCount !== 1 ? 'r' : ''}`;
    
    // Ønskeliste
    const wishlistItems = Object.values(appState.shoppingLists.wishlist || {});
    const wishlistCount = wishlistItems.length;
    const wishlistTotal = wishlistItems.reduce((sum, item) => sum + (item.price || 0), 0);
    
    appElements.wishlistCount.textContent = `${wishlistCount} ønske${wishlistCount !== 1 ? 'r' : ''}`;
    appElements.wishlistTotal.textContent = `${wishlistTotal.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.`;
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
    const recipeCount = appState.recipes.length;
    appElements.welcomeSummary.innerHTML = `Du har <strong>${recipeCount}</strong> opskrifter i din kogebog.`;
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

function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    selectElement.value = currentValue || "";
}

function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}
