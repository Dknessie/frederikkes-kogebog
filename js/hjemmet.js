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
            mainContent.innerHTML = `<h1>Oversigt Dashboard</h1><p>Her vil dine widgets blive vist.</p>`;
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
