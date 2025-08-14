// js/hjemmet.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate } from './utils.js';

// Global state for this module
let appState;
let appElements;
let hjemmetState = {
    currentView: 'oversigt', // 'oversigt', 'onskeliste', or a room ID
    currentRoomTab: 'projekter' // Default tab for room view
};

/**
 * Initializes the Hjemmet module, setting up event listeners.
 * @param {object} state - The global application state.
 * @param {object} elements - Cached DOM elements.
 */
export function initHjemmet(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        hjemmetPage: document.getElementById('hjemmet'),
        hjemmetSidebar: document.querySelector('.hjemmet-sidebar'),
        hjemmetNav: document.getElementById('hjemmet-nav'),
        hjemmetMainContent: document.getElementById('hjemmet-main-content'),
        plantEditModal: document.getElementById('plant-edit-modal'),
        plantForm: document.getElementById('plant-form'),
        deletePlantBtn: document.getElementById('delete-plant-btn'),
    };

    // Event delegation for the main content area
    if (appElements.hjemmetMainContent) {
        appElements.hjemmetMainContent.addEventListener('click', handleMainContentClick);
    }
    
    // Event delegation for the sidebar navigation
    if (appElements.hjemmetNav) {
        appElements.hjemmetNav.addEventListener('click', handleSidebarNavClick);
    }

    // Event listeners for the plant modal
    if (appElements.plantForm) {
        appElements.plantForm.addEventListener('submit', handleSavePlant);
    }
    if (appElements.deletePlantBtn) {
        appElements.deletePlantBtn.addEventListener('click', handleDeletePlant);
    }
}

/**
 * Renders the entire Hjemmet page based on the current state.
 */
export function renderHjemmetPage() {
    if (!appElements.hjemmetPage || appElements.hjemmetPage.classList.contains('hidden')) {
        return; // Don't render if the page is not visible
    }
    renderSidebar();
    renderMainView();
}

// --- SIDENAVIGATION ---

/**
 * Renders the sidebar navigation with links to overview, wishlist, and all rooms.
 */
function renderSidebar() {
    const nav = appElements.hjemmetNav;
    if (!nav) return;

    const rooms = (appState.references.rooms || []).sort();
    const roomsHTML = rooms.map(roomName => `
        <a href="#hjemmet/${roomName}" data-view="${roomName}" class="${hjemmetState.currentView === roomName ? 'active' : ''}">${roomName}</a>
    `).join('');

    nav.innerHTML = `
        <a href="#hjemmet/oversigt" data-view="oversigt" class="${hjemmetState.currentView === 'oversigt' ? 'active' : ''}">Oversigt</a>
        <a href="#hjemmet/onskeliste" data-view="onskeliste" class="${hjemmetState.currentView === 'onskeliste' ? 'active' : ''}">Ønskeliste</a>
        <div class="nav-divider"></div>
        ${roomsHTML}
    `;
}

/**
 * Handles clicks on the sidebar navigation links.
 * @param {Event} e - The click event.
 */
function handleSidebarNavClick(e) {
    e.preventDefault();
    const link = e.target.closest('a');
    if (!link) return;

    const view = link.dataset.view;
    if (view) {
        hjemmetState.currentView = view;
        // Update URL hash to reflect the new view
        window.location.hash = `#hjemmet/${view}`;
    }
}

// --- HOVEDINDHOLD (VIEWS) ---

/**
 * Renders the main content area based on the current view state.
 */
function renderMainView() {
    const content = appElements.hjemmetMainContent;
    switch (hjemmetState.currentView) {
        case 'oversigt':
            renderOversigtView(content);
            break;
        case 'onskeliste':
            renderOnskelisteView(content);
            break;
        default:
            // Assumes the view is a room ID
            renderRoomView(content, hjemmetState.currentView);
            break;
    }
}

/**
 * Renders the main dashboard/overview view with widgets.
 * @param {HTMLElement} container - The container element to render into.
 */
function renderOversigtView(container) {
    container.innerHTML = `
        <h2 class="hjemmet-view-title">Oversigt</h2>
        <div class="hjemmet-grid">
            <div id="watering-widget" class="hjemmet-widget"></div>
            <div id="reminders-widget" class="hjemmet-widget"></div>
            <div id="latest-wishes-widget" class="hjemmet-widget"></div>
            <div id="active-projects-widget" class="hjemmet-widget full-width"></div>
        </div>
    `;
    renderWateringWidget();
    renderRemindersWidget();
    renderLatestWishesWidget();
    renderActiveProjectsWidget();
}

/**
 * Renders the global wishlist view.
 * @param {HTMLElement} container - The container element to render into.
 */
function renderOnskelisteView(container) {
    const wishlistItems = Object.values(appState.shoppingLists.wishlist || {});
    
    let itemsHTML = '<p class="empty-state">Ønskelisten er tom.</p>';
    if (wishlistItems.length > 0) {
        itemsHTML = wishlistItems.map(item => `
            <div class="wishlist-card" data-item-name="${item.name}">
                 <a href="${item.url || '#'}" target="_blank" rel="noopener noreferrer">
                    <img src="https://placehold.co/200x150/f3f0e9/d1603d?text=${encodeURIComponent(item.name)}" alt="${item.name}" class="wishlist-card-image">
                    <div class="wishlist-card-content">
                        <span class="wishlist-card-title">${item.name}</span>
                        ${item.price ? `<span class="wishlist-card-price">${item.price.toFixed(2)} kr.</span>` : ''}
                    </div>
                </a>
            </div>
        `).join('');
    }

    container.innerHTML = `
        <div class="widget-header">
            <h2 class="hjemmet-view-title">Global Ønskeliste</h2>
            <button class="btn btn-primary" data-action="add-wish"><i class="fas fa-plus"></i> Nyt Ønske</button>
        </div>
        <div class="wishlist-grid">${itemsHTML}</div>
    `;
}

/**
 * Renders the detailed view for a specific room with tabs.
 * @param {HTMLElement} container - The container element to render into.
 * @param {string} roomName - The name of the room to render.
 */
function renderRoomView(container, roomName) {
    const tabs = ['Projekter', 'Planter', 'Påmindelser', 'Vedligehold', 'Inventar'];
    const tabsHTML = tabs.map(tab => `
        <div class="room-view-tab ${hjemmetState.currentRoomTab.toLowerCase() === tab.toLowerCase() ? 'active' : ''}" data-tab="${tab.toLowerCase()}">
            ${tab}
        </div>
    `).join('');

    container.innerHTML = `
        <div class="widget-header">
             <h2 class="hjemmet-view-title">${roomName}</h2>
             <button class="btn btn-secondary" data-action="edit-room-details" data-room-name="${roomName}"><i class="fas fa-cog"></i> Administrer Rum</button>
        </div>
        <div class="room-view-tabs">${tabsHTML}</div>
        <div id="room-view-tab-content" class="hjemmet-widget"></div>
    `;
    renderRoomTabContent(roomName);
}

/**
 * Renders the content for the currently active tab in the room view.
 * @param {string} roomName - The name of the current room.
 */
function renderRoomTabContent(roomName) {
    const container = document.getElementById('room-view-tab-content');
    if (!container) return;

    const actionButton = (action, text, icon) => `<div class="form-actions" style="justify-content: flex-start; margin-top: 0;"><button class="btn btn-primary" data-action="${action}" data-room-name="${roomName}"><i class="fas ${icon}"></i> ${text}</button></div>`;

    switch (hjemmetState.currentRoomTab) {
        case 'projekter':
            const roomProjects = appState.projects.filter(p => p.room === roomName);
            let projectsHTML = '<p class="empty-state-small">Ingen projekter for dette rum.</p>';
            if (roomProjects.length > 0) {
                projectsHTML = roomProjects.map(p => `<div class="list-item">${p.title} (${p.status})</div>`).join('');
            }
            container.innerHTML = `${actionButton('add-project', 'Nyt Projekt', 'fa-plus')} ${projectsHTML}`;
            break;
        case 'planter':
            const roomPlants = appState.plants.filter(p => p.room === roomName);
            let plantsHTML = '<p class="empty-state-small">Ingen planter i dette rum.</p>';
            if (roomPlants.length > 0) {
                 plantsHTML = roomPlants.map(p => `
                    <div class="widget-list-item" data-plant-id="${p.id}">
                        <div class="content">
                            <div class="title">${p.name}</div>
                            <div class="subtitle">Vandes hver ${p.wateringInterval} dage. Sidst vandes: ${formatDate(p.lastWatered)}</div>
                        </div>
                         <div class="actions">
                            <button class="btn-icon" data-action="edit-plant" title="Rediger"><i class="fas fa-edit"></i></button>
                        </div>
                    </div>
                 `).join('');
            }
            container.innerHTML = `${actionButton('add-plant', 'Ny Plante', 'fa-leaf')} <div class="widget-list">${plantsHTML}</div>`;
            break;
        default:
            container.innerHTML = `<p>Indhold for ${hjemmetState.currentRoomTab} kommer snart.</p>`;
            break;
    }
}

// --- WIDGETS ---

function renderWateringWidget() {
    const container = document.getElementById('watering-widget');
    if (!container) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const plantsToWater = appState.plants
        .map(plant => {
            const lastWatered = new Date(plant.lastWatered);
            const nextWatering = new Date(lastWatered.setDate(lastWatered.getDate() + plant.wateringInterval));
            const daysLeft = Math.ceil((nextWatering - today) / (1000 * 60 * 60 * 24));
            return { ...plant, nextWatering, daysLeft };
        })
        .filter(plant => plant.daysLeft <= 2)
        .sort((a, b) => a.daysLeft - b.daysLeft)
        .slice(0, 5);

    let content = '<p class="empty-state-small">Ingen planter trænger til vand.</p>';
    if (plantsToWater.length > 0) {
        content = plantsToWater.map(plant => `
            <li class="widget-list-item">
                <span class="icon" style="color: ${plant.daysLeft <= 0 ? 'var(--status-red)' : 'var(--status-yellow)'};"><i class="fas fa-tint"></i></span>
                <div class="content">
                    <div class="title">${plant.name}</div>
                    <div class="subtitle">${plant.room}</div>
                </div>
                <div class="actions">
                    <button class="btn btn-secondary" data-action="water-plant" data-plant-id="${plant.id}">Vandet</button>
                </div>
            </li>
        `).join('');
        content = `<ul class="widget-list">${content}</ul>`;
    }
    container.innerHTML = `<h4>Kommende Vanding</h4>${content}`;
}

function renderRemindersWidget() {
    const container = document.getElementById('reminders-widget');
    if (!container) return;
    container.innerHTML = '<h4>Påmindelser</h4><p class="empty-state-small">Funktion kommer snart.</p>';
}

function renderLatestWishesWidget() {
    const container = document.getElementById('latest-wishes-widget');
    if (!container) return;
    container.innerHTML = '<h4>Seneste Ønsker</h4><p class="empty-state-small">Funktion kommer snart.</p>';
}

function renderActiveProjectsWidget() {
    const container = document.getElementById('active-projects-widget');
    if (!container) return;
    
    const activeProjects = appState.projects.filter(p => p.status !== 'Afsluttet');
    
    let content = '<p class="empty-state-small">Ingen aktive projekter.</p>';
    if (activeProjects.length > 0) {
        content = activeProjects.map(p => `
             <li class="widget-list-item">
                <div class="content">
                    <div class="title">${p.title}</div>
                    <div class="subtitle">${p.room || 'Generelt'} - Status: ${p.status}</div>
                </div>
            </li>
        `).join('');
        content = `<ul class="widget-list">${content}</ul>`;
    }
    container.innerHTML = `<h4>Aktive Projekter</h4>${content}`;
}

// --- EVENT HANDLERS ---

/**
 * Handles clicks within the main content area using event delegation.
 * @param {Event} e - The click event.
 */
async function handleMainContentClick(e) {
    const actionTarget = e.target.closest('[data-action]');
    if (!actionTarget) return;

    const action = actionTarget.dataset.action;
    
    if (action === 'water-plant') {
        const plantId = actionTarget.dataset.plantId;
        const plantRef = doc(db, 'plants', plantId);
        await updateDoc(plantRef, { lastWatered: formatDate(new Date()) });
        showNotification({ title: "Godt gået!", message: "Planten er markeret som vandet." });
    } else if (action === 'add-plant') {
        openPlantModal(null, actionTarget.dataset.roomName);
    } else if (action === 'edit-plant') {
        const plantId = e.target.closest('[data-plant-id]').dataset.plantId;
        openPlantModal(plantId);
    }

    const tabTarget = e.target.closest('.room-view-tab');
    if (tabTarget) {
        hjemmetState.currentRoomTab = tabTarget.dataset.tab;
        renderRoomView(appElements.hjemmetMainContent, hjemmetState.currentView);
    }
}

// --- PLANTE FUNKTIONALITET (integreret fra plants.js) ---

function openPlantModal(plantId = null, roomName = null) {
    appElements.plantForm.reset();
    document.getElementById('plant-id').value = plantId || '';
    
    const plant = plantId ? appState.plants.find(p => p.id === plantId) : null;
    
    appElements.plantEditModal.querySelector('h3').textContent = plant ? 'Rediger Plante' : 'Tilføj Ny Plante';
    appElements.deletePlantBtn.classList.toggle('hidden', !plant);

    if (plant) {
        document.getElementById('plant-name').value = plant.name;
        document.getElementById('plant-last-watered').value = plant.lastWatered;
        document.getElementById('plant-watering-interval').value = plant.wateringInterval;
    } else {
        document.getElementById('plant-last-watered').value = formatDate(new Date());
    }
    
    const roomSelect = document.getElementById('plant-room');
    populateReferenceDropdown(roomSelect, appState.references.rooms, 'Vælg et rum...', plant ? plant.room : roomName);

    appElements.plantEditModal.classList.remove('hidden');
}

async function handleSavePlant(e) {
    e.preventDefault();
    const plantId = document.getElementById('plant-id').value;

    const plantData = {
        name: document.getElementById('plant-name').value.trim(),
        room: document.getElementById('plant-room').value,
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
        appElements.plantEditModal.classList.add('hidden');
        showNotification({ title: "Gemt!", message: "Din plante er blevet gemt." });
    } catch (error) {
        handleError(error, "Planten kunne ikke gemmes.", "savePlant");
    }
}

async function handleDeletePlant() {
    const plantId = document.getElementById('plant-id').value;
    if (!plantId) return;

    const confirmed = await showNotification({
        title: "Slet Plante",
        message: "Er du sikker på, du vil slette denne plante?",
        type: 'confirm'
    });

    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, 'plants', plantId));
        appElements.plantEditModal.classList.add('hidden');
        showNotification({ title: "Slettet", message: "Planten er blevet slettet." });
    } catch (error) {
        handleError(error, "Planten kunne ikke slettes.", "deletePlant");
    }
}

// --- HJÆLPEFUNKTIONER ---

function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    selectElement.value = currentValue || "";
}
