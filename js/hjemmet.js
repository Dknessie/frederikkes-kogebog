// js/hjemmet.js

// Denne fil vil håndtere al logik for "Hjemmet" siden.

let appState;
let appElements;

// Lokal state for at holde styr på, hvad der vises på Hjemmet-siden
const hjemmetState = {
    currentView: 'oversigt', // 'oversigt', 'onskeliste', eller et rum-navn
};

/**
 * Initialiserer Hjemmet-modulet.
 * @param {object} state - Den centrale state for applikationen.
 * @param {object} elements - Cachede DOM-elementer.
 */
export function initHjemmet(state, elements) {
    appState = state;
    appElements = elements;

    // Lyt efter klik i sidebaren for at håndtere navigation
    if (appElements.hjemmetSidebar) {
        appElements.hjemmetSidebar.addEventListener('click', handleNavClick);
    }
}

/**
 * Håndterer klik på navigationslinks i sidebaren.
 * @param {Event} e - Klik-eventen.
 */
function handleNavClick(e) {
    e.preventDefault();
    const navLink = e.target.closest('.hjemmet-nav-link');
    if (!navLink) return;

    const newView = navLink.dataset.view;
    if (newView && newView !== hjemmetState.currentView) {
        hjemmetState.currentView = newView;
        renderHjemmetPage();
    }
}

/**
 * Renderer hele Hjemmet-siden, inklusiv sidebar og det aktive view.
 */
export function renderHjemmetPage() {
    if (!appState.currentUser || !appElements.hjemmetSidebar || !appElements.hjemmetMainContent) return;

    renderSidebar();
    renderMainContent();
}

/**
 * Bygger og renderer navigationsmenuen i sidebaren.
 */
function renderSidebar() {
    const rooms = appState.references.rooms || [];
    
    const roomLinks = rooms
        .sort()
        .map(roomName => `
            <a href="#" class="hjemmet-nav-link ${hjemmetState.currentView === roomName ? 'active' : ''}" data-view="${roomName}">
                <i class="fas fa-door-open"></i>
                <span>${roomName}</span>
            </a>
        `).join('');

    appElements.hjemmetSidebar.innerHTML = `
        <nav class="hjemmet-nav">
            <div class="hjemmet-nav-section">
                <a href="#" class="hjemmet-nav-link ${hjemmetState.currentView === 'oversigt' ? 'active' : ''}" data-view="oversigt">
                    <i class="fas fa-tachometer-alt"></i>
                    <span>Oversigt</span>
                </a>
                <a href="#" class="hjemmet-nav-link ${hjemmetState.currentView === 'onskeliste' ? 'active' : ''}" data-view="onskeliste">
                    <i class="fas fa-gift"></i>
                    <span>Ønskeliste</span>
                </a>
            </div>
            <div class="hjemmet-nav-section">
                <h4 class="hjemmet-nav-header">Rum</h4>
                ${roomLinks}
            </div>
        </nav>
    `;
}

/**
 * Renderer hovedindholdet baseret på det aktive view i hjemmetState.
 */
function renderMainContent() {
    const view = hjemmetState.currentView;
    const mainContent = appElements.hjemmetMainContent;

    switch(view) {
        case 'oversigt':
            renderOversigtDashboard();
            break;
        case 'onskeliste':
            mainContent.innerHTML = `<h1>Global Ønskeliste</h1><p>Her vil du kunne se og administrere alle dine ønsker.</p>`;
            break;
        default:
            // Dette håndterer alle rum-views
            mainContent.innerHTML = `<h1>Rum: ${view}</h1><p>Her vil du se detaljer og faneblade for ${view}.</p>`;
            break;
    }
}

/**
 * Bygger skelettet til Oversigt-dashboardet og kalder funktioner til at fylde widgets.
 */
function renderOversigtDashboard() {
    appElements.hjemmetMainContent.innerHTML = `
        <div class="hjemmet-oversigt-grid">
            <div id="watering-widget" class="hjemmet-widget"></div>
            <div id="reminders-widget" class="hjemmet-widget"></div>
            <div id="active-projects-widget" class="hjemmet-widget full-width"></div>
        </div>
    `;
    renderWateringWidget();
    renderRemindersWidget();
    renderActiveProjectsWidget();
}

/**
 * Renderer "Kommende vanding" widget.
 */
function renderWateringWidget() {
    const container = document.getElementById('watering-widget');
    if (!container) return;

    const plantsToWater = (appState.plants || [])
        .map(plant => {
            const lastWatered = new Date(plant.lastWatered);
            const nextWateringDate = new Date(lastWatered);
            nextWateringDate.setDate(lastWatered.getDate() + plant.wateringInterval);
            return { ...plant, nextWateringDate };
        })
        .sort((a, b) => a.nextWateringDate - b.nextWateringDate)
        .slice(0, 5);

    let content = '<h4><i class="fas fa-tint"></i> Kommende vanding</h4>';
    if (plantsToWater.length === 0) {
        content += `<p class="empty-state-small">Ingen planter trænger til vanding. Godt gået!</p>`;
    } else {
        content += '<ul class="widget-list">';
        plantsToWater.forEach(plant => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const daysLeft = Math.ceil((plant.nextWateringDate - today) / (1000 * 60 * 60 * 24));
            let statusText = `om ${daysLeft} dage`;
            let statusClass = '';

            if (daysLeft <= 0) {
                statusText = 'I dag!';
                statusClass = 'status-red';
            } else if (daysLeft === 1) {
                statusText = 'I morgen';
                statusClass = 'status-yellow';
            }
            content += `
                <li class="widget-list-item">
                    <div class="item-main-info">
                        <span class="item-title">${plant.name}</span>
                        <span class="item-subtitle">${plant.room}</span>
                    </div>
                    <div class="item-status ${statusClass}">
                        <span>${statusText}</span>
                    </div>
                </li>
            `;
        });
        content += '</ul>';
    }
    container.innerHTML = content;
}

/**
 * Renderer "Påmindelser" widget (pladsholder).
 */
function renderRemindersWidget() {
    const container = document.getElementById('reminders-widget');
    if (!container) return;
    container.innerHTML = `<h4><i class="fas fa-bell"></i> Påmindelser</h4><p class="empty-state-small">Ingen påmindelser.</p>`;
}

/**
 * Renderer "Aktive Projekter" widget (pladsholder).
 */
function renderActiveProjectsWidget() {
    const container = document.getElementById('active-projects-widget');
    if (!container) return;
    container.innerHTML = `<h4><i class="fas fa-tasks"></i> Aktive Projekter</h4><p class="empty-state-small">Ingen aktive projekter.</p>`;
}
