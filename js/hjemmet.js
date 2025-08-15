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
    currentRoomTab: 'projekter', // Aktiv fane for en rum-side
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
    if (appElements.projectForm) appElements.projectForm.addEventListener('submit', handleSaveProject);
    if (appElements.reminderForm) appElements.reminderForm.addEventListener('submit', handleSaveReminder);
    if (appElements.maintenanceForm) appElements.maintenanceForm.addEventListener('submit', handleSaveMaintenance);
    if (appElements.homeInventoryForm) appElements.homeInventoryForm.addEventListener('submit', handleSaveHomeInventory);
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

    if (newView === 'add_room') {
        handleAddNewRoom();
        return;
    }

    if (newView && newView !== hjemmetState.currentView) {
        hjemmetState.currentView = newView;
        hjemmetState.currentRoomTab = 'projekter'; 
        renderHjemmetPage();
    }
}

/**
 * Håndterer klik inde i hovedindholdet.
 * @param {Event} e - Klik-eventen.
 */
function handleMainContentClick(e) {
    const tab = e.target.closest('.room-tab');
    if (tab) {
        e.preventDefault();
        hjemmetState.currentRoomTab = tab.dataset.tab;
        renderRoomPage(hjemmetState.currentView);
        return;
    }
    
    // Knapper til at åbne modals
    if (e.target.closest('#add-project-btn')) openProjectModal(hjemmetState.currentView);
    if (e.target.closest('#add-plant-btn')) openPlantModal(hjemmetState.currentView);
    if (e.target.closest('#add-reminder-btn')) openReminderModal(hjemmetState.currentView);
    if (e.target.closest('#add-maintenance-btn')) openMaintenanceModal(hjemmetState.currentView);
    if (e.target.closest('#add-home-inventory-btn')) openHomeInventoryModal(hjemmetState.currentView);
    if (e.target.closest('#add-wish-btn')) openWishlistModal();

    const waterBtn = e.target.closest('.water-plant-btn');
    if (waterBtn) {
        const plantId = waterBtn.dataset.plantId;
        if (plantId) markPlantAsWatered(plantId);
    }
}

/**
 * Renderer hele Hjemmet-siden.
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
                <a href="#" class="hjemmet-nav-link add-new-room-btn" data-view="add_room">
                    <i class="fas fa-plus-circle"></i>
                    <span>Tilføj Rum</span>
                </a>
            </div>
        </nav>
    `;
}

/**
 * Renderer hovedindholdet baseret på det aktive view.
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
            renderRoomPage(view);
            break;
    }
}

/**
 * Bygger skelettet til Oversigt-dashboardet.
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
                    <button class="btn btn-secondary btn-small water-plant-btn" data-plant-id="${plant.id}">Vandet</button>
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
        case 'projekter':
            tabContent = renderRoomProjects(roomName);
            break;
        case 'planter':
            tabContent = renderRoomPlants(roomName);
            break;
        case 'påmindelser':
            tabContent = renderRoomReminders(roomName);
            break;
        case 'vedligehold':
            tabContent = renderRoomMaintenance(roomName);
            break;
        case 'inventar':
            tabContent = renderRoomInventory(roomName);
            break;
        default:
            tabContent = `<p class="empty-state">Noget gik galt.</p>`;
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

// --- RENDER FUNKTIONER FOR FANEBLADE ---

function renderRoomProjects(roomName) {
    const projectsInRoom = (appState.projects || []).filter(p => p.room === roomName);
    const content = projectsInRoom.length === 0
        ? `<p class="empty-state-small">Ingen projekter i dette rum.</p>`
        : projectsInRoom.map(p => `<div class="hjemmet-card"><h5>${p.title}</h5><p>${p.status}</p></div>`).join('');
    
    return `
        <div class="tab-header"><h3>Projekter i ${roomName}</h3><button id="add-project-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Nyt Projekt</button></div>
        <div class="hjemmet-grid">${content}</div>
    `;
}

function renderRoomPlants(roomName) {
    const plantsInRoom = (appState.plants || []).filter(p => p.room === roomName);
    const content = plantsInRoom.length === 0
        ? `<p class="empty-state-small">Ingen planter i dette rum.</p>`
        : plantsInRoom.map(p => `<div class="hjemmet-card"><h5>${p.name}</h5><p>Sidst vandet: ${formatDate(p.lastWatered)}</p></div>`).join('');

    return `
        <div class="tab-header"><h3>Planter i ${roomName}</h3><button id="add-plant-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Tilføj Plante</button></div>
        <div class="hjemmet-grid">${content}</div>
    `;
}

function renderRoomReminders(roomName) {
    const remindersInRoom = (appState.reminders || []).filter(r => r.room === roomName);
     const content = remindersInRoom.length === 0
        ? `<p class="empty-state-small">Ingen påmindelser i dette rum.</p>`
        : remindersInRoom.map(r => `<div class="hjemmet-card"><h5>${r.text}</h5></div>`).join('');

    return `
        <div class="tab-header"><h3>Påmindelser i ${roomName}</h3><button id="add-reminder-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Ny Påmindelse</button></div>
        <div class="hjemmet-grid">${content}</div>
    `;
}

function renderRoomMaintenance(roomName) {
    const maintenanceInRoom = (appState.maintenance || []).filter(m => m.room === roomName);
    const content = maintenanceInRoom.length === 0
        ? `<p class="empty-state-small">Intet vedligehold i dette rum.</p>`
        : maintenanceInRoom.map(m => `<div class="hjemmet-card"><h5>${m.task}</h5><p>Interval: ${m.interval} dage</p></div>`).join('');

    return `
        <div class="tab-header"><h3>Vedligehold i ${roomName}</h3><button id="add-maintenance-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Ny Opgave</button></div>
        <div class="hjemmet-grid">${content}</div>
    `;
}

function renderRoomInventory(roomName) {
    const inventoryInRoom = (appState.home_inventory || []).filter(i => i.room === roomName);
    const content = inventoryInRoom.length === 0
        ? `<p class="empty-state-small">Intet inventar i dette rum.</p>`
        : inventoryInRoom.map(i => `<div class="hjemmet-card"><h5>${i.name}</h5><p>Købt: ${formatDate(i.purchaseDate)}</p></div>`).join('');

    return `
        <div class="tab-header"><h3>Inventar i ${roomName}</h3><button id="add-home-inventory-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Nyt Inventar</button></div>
        <div class="hjemmet-grid">${content}</div>
    `;
}

// --- ØNSKELISTE & DIVERSE ---

function renderWishlistPage() {
    const wishlist = appState.shoppingLists.wishlist || {};
    const items = Object.values(wishlist);

    let itemsHTML = '';
    if (items.length === 0) {
        itemsHTML = `<p class="empty-state">Ønskelisten er tom.</p>`;
    } else {
        itemsHTML = '<div class="wishlist-page-grid">';
        items.sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
            itemsHTML += `
                <div class="wishlist-item-card" data-name="${item.name}">
                    <a href="${item.url || '#'}" target="_blank" rel="noopener noreferrer">
                        <div class="wishlist-item-content">
                            <span class="wishlist-item-title">${item.name}</span>
                            <span class="wishlist-item-subtitle">${item.roomId || 'Generelt'}</span>
                        </div>
                        ${item.price ? `<span class="wishlist-item-price">${item.price.toFixed(2).replace('.',',')} kr.</span>` : ''}
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

async function handleAddNewRoom() {
    const roomName = prompt("Hvad hedder det nye rum?");
    if (!roomName || roomName.trim() === "") return;

    const trimmedName = roomName.trim();
    const existingRooms = (appState.references.rooms || []).map(r => r.toLowerCase());

    if (existingRooms.includes(trimmedName.toLowerCase())) {
        showNotification({ title: "Rum findes allerede", message: `Et rum med navnet "${trimmedName}" eksisterer allerede.` });
        return;
    }

    try {
        const ref = doc(db, 'references', appState.currentUser.uid);
        await updateDoc(ref, { rooms: arrayUnion(trimmedName) });
        showNotification({ title: "Rum Tilføjet", message: `"${trimmedName}" er blevet tilføjet.` });
    } catch (error) {
        handleError(error, "Rummet kunne ikke tilføjes.", "addNewRoom");
    }
}

// --- MODAL & SAVE FUNKTIONER ---

// PLANTER
function openPlantModal(roomName, plantId = null) {
    appElements.plantForm.reset();
    document.getElementById('plant-room-hidden').value = roomName;
    document.getElementById('plant-id').value = plantId || '';
    appElements.plantModal.querySelector('h3').textContent = `Ny Plante i ${roomName}`;
    document.getElementById('plant-last-watered').value = formatDate(new Date());
    appElements.plantModal.classList.remove('hidden');
}

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
    if (!plantData.name || !plantData.wateringInterval) {
        showNotification({ title: "Udfyld alle felter", message: "Navn og interval er påkrævet." });
        return;
    }
    try {
        if (plantId) {
            await updateDoc(doc(db, 'plants', plantId), plantData);
        } else {
            await addDoc(collection(db, 'plants'), plantData);
        }
        appElements.plantModal.classList.add('hidden');
    } catch (error) { handleError(error, "Planten kunne ikke gemmes.", "savePlant"); }
}

async function markPlantAsWatered(plantId) {
    try {
        await updateDoc(doc(db, 'plants', plantId), { lastWatered: formatDate(new Date()) });
        showNotification({ title: "Plante Vandet", message: "Datoen for sidste vanding er opdateret." });
    } catch (error) { handleError(error, "Kunne ikke opdatere planten.", "markPlantAsWatered"); }
}

// ØNSKELISTE
function openWishlistModal() {
    appElements.wishlistForm.reset();
    const roomSelect = document.getElementById('wish-room');
    const roomNames = appState.references.rooms || [];
    const populateDropdown = (select, options, placeholder) => {
        select.innerHTML = `<option value="">${placeholder}</option>`;
        options.sort().forEach(opt => select.add(new Option(opt, opt)));
    };
    populateDropdown(roomSelect, roomNames, 'Vælg et rum (valgfri)...');
    appElements.wishlistModal.classList.remove('hidden');
}

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
    };
    const shoppingListRef = doc(db, 'shopping_lists', appState.currentUser.uid);
    try {
        await setDoc(shoppingListRef, { wishlist: { [key]: wishData } }, { merge: true });
        appElements.wishlistModal.classList.add('hidden');
    } catch (error) { handleError(error, "Ønsket kunne ikke gemmes.", "saveWish"); }
}

// PROJEKTER
function openProjectModal(roomName, projectId = null) {
    appElements.projectForm.reset();
    document.getElementById('project-room-hidden').value = roomName;
    document.getElementById('project-id').value = projectId || '';
    appElements.projectModal.querySelector('h3').textContent = `Nyt Projekt i ${roomName}`;
    appElements.projectModal.classList.remove('hidden');
}

async function handleSaveProject(e) {
    e.preventDefault();
    const projectId = document.getElementById('project-id').value;
    const projectData = {
        title: document.getElementById('project-title').value.trim(),
        status: document.getElementById('project-status').value,
        room: document.getElementById('project-room-hidden').value,
        userId: appState.currentUser.uid,
    };
    if (!projectData.title) return;
    try {
        if (projectId) {
            await updateDoc(doc(db, 'projects', projectId), projectData);
        } else {
            await addDoc(collection(db, 'projects'), projectData);
        }
        appElements.projectModal.classList.add('hidden');
    } catch (error) { handleError(error, "Projektet kunne ikke gemmes.", "saveProject"); }
}

// PÅMINDELSER
function openReminderModal(roomName, reminderId = null) {
    appElements.reminderForm.reset();
    document.getElementById('reminder-room-hidden').value = roomName;
    document.getElementById('reminder-id').value = reminderId || '';
    appElements.reminderModal.querySelector('h3').textContent = `Ny Påmindelse i ${roomName}`;
    appElements.reminderModal.classList.remove('hidden');
}

async function handleSaveReminder(e) {
    e.preventDefault();
    const reminderId = document.getElementById('reminder-id').value;
    const reminderData = {
        text: document.getElementById('reminder-text').value.trim(),
        room: document.getElementById('reminder-room-hidden').value,
        userId: appState.currentUser.uid,
    };
    if (!reminderData.text) return;
    try {
        if (reminderId) {
            await updateDoc(doc(db, 'reminders', reminderId), reminderData);
        } else {
            await addDoc(collection(db, 'reminders'), reminderData);
        }
        appElements.reminderModal.classList.add('hidden');
    } catch (error) { handleError(error, "Påmindelsen kunne ikke gemmes.", "saveReminder"); }
}

// VEDLIGEHOLD
function openMaintenanceModal(roomName, taskId = null) {
    appElements.maintenanceForm.reset();
    document.getElementById('maintenance-room-hidden').value = roomName;
    document.getElementById('maintenance-id').value = taskId || '';
    appElements.maintenanceModal.querySelector('h3').textContent = `Ny Vedligeholdelsesopgave i ${roomName}`;
    appElements.maintenanceModal.classList.remove('hidden');
}

async function handleSaveMaintenance(e) {
    e.preventDefault();
    const taskId = document.getElementById('maintenance-id').value;
    const maintenanceData = {
        task: document.getElementById('maintenance-task').value.trim(),
        interval: Number(document.getElementById('maintenance-interval').value),
        room: document.getElementById('maintenance-room-hidden').value,
        userId: appState.currentUser.uid,
    };
    if (!maintenanceData.task || !maintenanceData.interval) return;
    try {
        if (taskId) {
            await updateDoc(doc(db, 'maintenance', taskId), maintenanceData);
        } else {
            await addDoc(collection(db, 'maintenance'), maintenanceData);
        }
        appElements.maintenanceModal.classList.add('hidden');
    } catch (error) { handleError(error, "Opgaven kunne ikke gemmes.", "saveMaintenance"); }
}

// INVENTAR
function openHomeInventoryModal(roomName, itemId = null) {
    appElements.homeInventoryForm.reset();
    document.getElementById('home-inventory-room-hidden').value = roomName;
    document.getElementById('home-inventory-id').value = itemId || '';
    appElements.homeInventoryModal.querySelector('h3').textContent = `Nyt Inventar i ${roomName}`;
    document.getElementById('home-inventory-purchaseDate').value = formatDate(new Date());
    appElements.homeInventoryModal.classList.remove('hidden');
}

async function handleSaveHomeInventory(e) {
    e.preventDefault();
    const itemId = document.getElementById('home-inventory-id').value;
    const inventoryData = {
        name: document.getElementById('home-inventory-name').value.trim(),
        purchaseDate: document.getElementById('home-inventory-purchaseDate').value,
        manualUrl: document.getElementById('home-inventory-manualUrl').value.trim() || null,
        room: document.getElementById('home-inventory-room-hidden').value,
        userId: appState.currentUser.uid,
    };
    if (!inventoryData.name || !inventoryData.purchaseDate) return;
    try {
        if (itemId) {
            await updateDoc(doc(db, 'home_inventory', itemId), inventoryData);
        } else {
            await addDoc(collection(db, 'home_inventory'), inventoryData);
        }
        appElements.homeInventoryModal.classList.add('hidden');
    } catch (error) { handleError(error, "Inventar kunne ikke gemmes.", "saveHomeInventory"); }
}
