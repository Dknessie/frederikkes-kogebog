// js/hjemmet.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, setDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;

// Lokal state for Hjemmet-siden
const hjemmetState = {
    currentView: 'oversigt', // 'oversigt', 'onskeliste', eller et rum-navn
    currentRoomTab: 'planter', // Aktiv fane for en rum-side
};

/**
 * Initialiserer Hjemmet-modulet.
 * @param {object} state - Den centrale state for applikationen.
 * @param {object} elements - Cachede DOM-elementer.
 */
export function initHjemmet(state, elements) {
    appState = state;
    appElements = elements;

    // Lyt efter klik i sidebaren og hovedindholdet
    if (appElements.hjemmetSidebar) {
        appElements.hjemmetSidebar.addEventListener('click', handleNavClick);
    }
    if (appElements.hjemmetMainContent) {
        appElements.hjemmetMainContent.addEventListener('click', handleMainContentClick);
    }
    
    // Lyt efter form submissions fra modals
    if (appElements.plantForm) appElements.plantForm.addEventListener('submit', handleSavePlant);
    if (appElements.wishlistForm) appElements.wishlistForm.addEventListener('submit', handleSaveWish);
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

    // OPDATERING: Håndter klik på "Tilføj Rum"
    if (newView === 'add_room') {
        handleAddNewRoom();
        return;
    }

    if (newView && newView !== hjemmetState.currentView) {
        hjemmetState.currentView = newView;
        // Nulstil faneblad, når vi skifter til et nyt rum eller en hovedsektion
        hjemmetState.currentRoomTab = 'planter'; 
        renderHjemmetPage();
    }
}

/**
 * Håndterer klik inde i hovedindholdet (f.eks. på faneblade eller knapper).
 * @param {Event} e - Klik-eventen.
 */
function handleMainContentClick(e) {
    // Håndter fanebladsskift i et rum
    const tab = e.target.closest('.room-tab');
    if (tab) {
        e.preventDefault();
        hjemmetState.currentRoomTab = tab.dataset.tab;
        renderRoomPage(hjemmetState.currentView);
        return;
    }
    
    // Håndter "Tilføj Plante" knap
    if (e.target.closest('#add-plant-btn')) {
        openPlantModal(hjemmetState.currentView);
    }

    // Håndter "Nyt Ønske" knap
    if (e.target.closest('#add-wish-btn')) {
        openWishlistModal();
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
                <!-- OPDATERING: Tilføjet "Tilføj Rum" knap -->
                <a href="#" class="hjemmet-nav-link add-new-room-btn" data-view="add_room">
                    <i class="fas fa-plus-circle"></i>
                    <span>Tilføj Rum</span>
                </a>
            </div>
        </nav>
    `;
}

/**
 * Renderer hovedindholdet baseret på det aktive view i hjemmetState.
 */
function renderMainContent() {
    const view = hjemmetState.currentView;

    switch(view) {
        case 'oversigt':
            renderOversigtDashboard();
            break;
        case 'onskeliste':
            renderWishlistPage();
            break;
        default:
            // Dette håndterer alle rum-views
            renderRoomPage(view);
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

/**
 * Renderer en specifik rum-side med faneblade.
 * @param {string} roomName - Navnet på det rum, der skal vises.
 */
function renderRoomPage(roomName) {
    const tabs = ['Projekter', 'Planter', 'Påmindelser', 'Vedligehold', 'Inventar'];
    const tabIcons = {
        'Projekter': 'fa-tasks',
        'Planter': 'fa-leaf',
        'Påmindelser': 'fa-bell',
        'Vedligehold': 'fa-tools',
        'Inventar': 'fa-couch'
    };

    const tabsHTML = tabs.map(tab => `
        <a href="#" class="room-tab ${hjemmetState.currentRoomTab.toLowerCase() === tab.toLowerCase() ? 'active' : ''}" data-tab="${tab.toLowerCase()}">
            <i class="fas ${tabIcons[tab]}"></i> ${tab}
        </a>
    `).join('');

    let tabContent = '';
    switch(hjemmetState.currentRoomTab) {
        case 'planter':
            tabContent = renderRoomPlants(roomName);
            break;
        default:
            tabContent = `<p class="empty-state">Funktionalitet for "${hjemmetState.currentRoomTab}" er endnu ikke implementeret.</p>`;
            break;
    }

    appElements.hjemmetMainContent.innerHTML = `
        <div class="room-header">
            <h2>${roomName}</h2>
        </div>
        <div class="room-tabs">
            ${tabsHTML}
        </div>
        <div class="room-tab-content">
            ${tabContent}
        </div>
    `;
}

/**
 * Renderer indholdet for "Planter" fanebladet for et specifikt rum.
 * @param {string} roomName - Navnet på rummet.
 * @returns {string} HTML-strengen for plante-sektionen.
 */
function renderRoomPlants(roomName) {
    const plantsInRoom = (appState.plants || []).filter(p => p.room === roomName);
    
    let plantsHTML = '';
    if (plantsInRoom.length === 0) {
        plantsHTML = `<p class="empty-state-small">Der er ingen planter i dette rum endnu.</p>`;
    } else {
        plantsHTML = '<div class="plant-list-grid">';
        plantsInRoom.forEach(plant => {
            plantsHTML += `
                <div class="plant-card-small" data-id="${plant.id}">
                    <h5>${plant.name}</h5>
                    <p>Vandes hver ${plant.wateringInterval}. dag</p>
                    <p class="small-text">Sidst vandet: ${formatDate(plant.lastWatered)}</p>
                </div>
            `;
        });
        plantsHTML += '</div>';
    }

    return `
        <div class="tab-header">
            <h3>Planter i ${roomName}</h3>
            <button id="add-plant-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Tilføj Plante</button>
        </div>
        ${plantsHTML}
    `;
}

/**
 * Renderer den globale ønskeliste-side.
 */
function renderWishlistPage() {
    const wishlist = appState.shoppingLists.wishlist || {};
    const items = Object.values(wishlist);

    let itemsHTML = '';
    if (items.length === 0) {
        itemsHTML = `<p class="empty-state">Ønskelisten er tom.</p>`;
    } else {
        itemsHTML = '<div class="wishlist-page-grid">';
        items.forEach(item => {
            itemsHTML += `
                <div class="wishlist-item-card" data-name="${item.name}">
                    <a href="${item.url || '#'}" target="_blank" rel="noopener noreferrer">
                        <div class="wishlist-item-content">
                            <span class="wishlist-item-title">${item.name}</span>
                            <span class="wishlist-item-subtitle">${item.roomId || 'Generelt'}</span>
                        </div>
                        ${item.price ? `<span class="wishlist-item-price">${item.price.toFixed(2)} kr.</span>` : ''}
                    </a>
                </div>
            `;
        });
        itemsHTML += '</div>';
    }
    
    appElements.hjemmetMainContent.innerHTML = `
        <div class="tab-header">
            <h2>Global Ønskeliste</h2>
            <button id="add-wish-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Nyt Ønske</button>
        </div>
        ${itemsHTML}
    `;
}

/**
 * Åbner modalen for at tilføje/redigere en plante.
 * @param {string} roomName - Navnet på det rum, planten tilhører.
 * @param {string|null} [plantId=null] - ID'et på planten, hvis den redigeres.
 */
function openPlantModal(roomName, plantId = null) {
    const modal = appElements.plantModal;
    const form = appElements.plantForm;
    form.reset();

    document.getElementById('plant-room-hidden').value = roomName;
    document.getElementById('plant-id').value = plantId || '';

    if (plantId) {
        // Logik for at redigere en plante (ikke implementeret endnu)
    } else {
        modal.querySelector('h3').textContent = `Ny Plante i ${roomName}`;
        document.getElementById('plant-last-watered').value = formatDate(new Date());
    }
    modal.classList.remove('hidden');
}

/**
 * Gemmer en plante til Firestore.
 * @param {Event} e - Form submission event.
 */
async function handleSavePlant(e) {
    e.preventDefault();
    const plantId = document.getElementById('plant-id').value;
    
    const plantData = {
        name: document.getElementById('plant-name').value.trim(),
        room: document.getElementById('plant-room-hidden').value,
        lastWatered: document.getElementById('plant-last-watered').value,
        wateringInterval: Number(document.getElementById('plant-watering-interval').value),
        userId: appState.currentUser.uid,
    };

    if (!plantData.name || !plantData.room || !plantData.lastWatered || !plantData.wateringInterval) {
        showNotification({ title: "Udfyld alle felter", message: "Alle felter skal være udfyldt." });
        return;
    }

    try {
        if (plantId) {
            await updateDoc(doc(db, 'plants', plantId), plantData);
        } else {
            await addDoc(collection(db, 'plants'), plantData);
        }
        appElements.plantModal.classList.add('hidden');
        showNotification({ title: "Gemt!", message: "Din plante er blevet gemt." });
    } catch (error) {
        handleError(error, "Planten kunne ikke gemmes.", "savePlant");
    }
}

/**
 * Åbner modalen for at tilføje et nyt ønske.
 */
function openWishlistModal() {
    const modal = appElements.wishlistModal;
    const form = appElements.wishlistForm;
    form.reset();
    
    const roomSelect = document.getElementById('wish-room');
    const roomNames = appState.references.rooms || [];
    // Helper function to populate dropdowns
    const populateDropdown = (select, options, placeholder) => {
        select.innerHTML = `<option value="">${placeholder}</option>`;
        options.sort().forEach(opt => select.add(new Option(opt, opt)));
    };
    populateDropdown(roomSelect, roomNames, 'Vælg et rum (valgfri)...');

    modal.classList.remove('hidden');
}

/**
 * Gemmer et ønske til Firestore.
 * @param {Event} e - Form submission event.
 */
async function handleSaveWish(e) {
    e.preventDefault();
    const wishName = document.getElementById('wish-name').value.trim();
    if (!wishName) return;

    const key = wishName.toLowerCase();
    
    const wishData = {
        name: wishName,
        price: Number(document.getElementById('wish-price').value) || null,
        url: document.getElementById('wish-url').value.trim() || null,
        roomId: document.getElementById('wish-room').value || null,
        quantity_to_buy: 1,
        unit: 'stk'
    };

    // Vi opdaterer direkte i shoppingLists dokumentet
    const shoppingListRef = doc(db, 'shopping_lists', appState.currentUser.uid);
    try {
        await setDoc(shoppingListRef, {
            wishlist: {
                [key]: wishData
            }
        }, { merge: true });

        appElements.wishlistModal.classList.add('hidden');
        showNotification({ title: "Gemt!", message: "Dit ønske er blevet tilføjet til listen." });
    } catch (error) {
        handleError(error, "Ønsket kunne ikke gemmes.", "saveWish");
    }
}

/**
 * OPDATERING: Håndterer tilføjelse af et nyt rum via en prompt.
 */
async function handleAddNewRoom() {
    const roomName = prompt("Hvad hedder det nye rum?");
    if (!roomName || roomName.trim() === "") {
        return; // Brugeren annullerede eller indtastede et tomt navn
    }

    const trimmedName = roomName.trim();
    const existingRooms = (appState.references.rooms || []).map(r => r.toLowerCase());

    if (existingRooms.includes(trimmedName.toLowerCase())) {
        showNotification({ title: "Rum findes allerede", message: `Et rum med navnet "${trimmedName}" eksisterer allerede.` });
        return;
    }

    try {
        const ref = doc(db, 'references', appState.currentUser.uid);
        await updateDoc(ref, {
            rooms: arrayUnion(trimmedName)
        });
        showNotification({ title: "Rum Tilføjet", message: `"${trimmedName}" er blevet tilføjet til din liste over rum.` });
        // Firestore listener vil automatisk opdatere UI'et.
    } catch (error) {
        handleError(error, "Rummet kunne ikke tilføjes.", "addNewRoom");
    }
}
