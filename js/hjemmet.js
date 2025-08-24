// js/hjemmet.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, setDoc, arrayUnion, writeBatch, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;
let plantFormImage = { type: null, data: null };

const hjemmetState = {
    currentView: 'oversigt',
    currentRoomTab: 'projekter',
};

export function initHjemmet(state, elements) {
    appState = state;
    appElements = elements;

    if (appElements.hjemmetSidebar) {
        appElements.hjemmetSidebar.addEventListener('click', handleNavClick);
    }
    if (appElements.hjemmetMainContent) {
        appElements.hjemmetMainContent.addEventListener('click', handleMainContentClick);
    }
    
    if (appElements.plantForm) appElements.plantForm.addEventListener('submit', handleSavePlant);
    if (appElements.wishlistForm) appElements.wishlistForm.addEventListener('submit', handleSaveWish);
    if (appElements.projectForm) appElements.projectForm.addEventListener('submit', handleSaveProject);
    if (appElements.reminderForm) appElements.reminderForm.addEventListener('submit', handleSaveReminder);
    if (appElements.maintenanceForm) appElements.maintenanceForm.addEventListener('submit', handleSaveMaintenance);
    if (appElements.homeInventoryForm) appElements.homeInventoryForm.addEventListener('submit', handleSaveHomeInventory);

    const deletePlantBtn = document.getElementById('delete-plant-btn');
    if (deletePlantBtn) deletePlantBtn.addEventListener('click', handleDeletePlant);
    
    const deleteWishBtn = document.getElementById('delete-wish-btn');
    if (deleteWishBtn) deleteWishBtn.addEventListener('click', () => handleDeleteWish());

    if (appElements.deleteProjectBtn) appElements.deleteProjectBtn.addEventListener('click', handleDeleteProject);
    if (appElements.deleteReminderBtn) appElements.deleteReminderBtn.addEventListener('click', handleDeleteReminder);
    if (appElements.deleteMaintenanceBtn) appElements.deleteMaintenanceBtn.addEventListener('click', handleDeleteMaintenance);
    if (appElements.deleteHomeInventoryBtn) appElements.deleteHomeInventoryBtn.addEventListener('click', handleDeleteHomeInventory);

    const plantImageUpload = document.getElementById('plant-image-upload');
    if (plantImageUpload) {
        plantImageUpload.addEventListener('change', handlePlantImageUpload);
    }
}

// NY Funktion: Eksporteres så dashboard kan skifte view
export function switchToHjemmetView(view) {
    hjemmetState.currentView = view;
    window.location.hash = '#hjem'; // Dette vil trigge hashchange-event og rendere den korrekte side
}

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
        switchToHjemmetView(newView);
    }
}

function handleMainContentClick(e) {
    const tab = e.target.closest('.room-tab');
    if (tab) {
        e.preventDefault();
        hjemmetState.currentRoomTab = tab.dataset.tab;
        renderRoomPage(hjemmetState.currentView);
        return;
    }
    
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

    const editWishBtn = e.target.closest('.edit-wish-btn');
    if (editWishBtn) {
        e.preventDefault();
        const wishName = editWishBtn.closest('.wishlist-item-card').dataset.name;
        openWishlistModal(wishName);
        return;
    }

    const deleteWishBtn = e.target.closest('.delete-wish-btn');
    if (deleteWishBtn) {
        e.preventDefault();
        const wishName = deleteWishBtn.closest('.wishlist-item-card').dataset.name;
        handleDeleteWish(wishName);
        return;
    }

    const card = e.target.closest('.hjemmet-card');
    if (card && card.dataset.id) {
        const id = card.dataset.id;
        const type = card.dataset.type;
        const room = card.dataset.room;
        switch(type) {
            case 'project': openProjectModal(room, id); break;
            case 'plant': openPlantModal(room, id); break;
            case 'reminder': openReminderModal(room, id); break;
            case 'maintenance': openMaintenanceModal(room, id); break;
            case 'home_inventory': openHomeInventoryModal(room, id); break;
        }
    }
}

export function renderHjemmetPage() {
    if (!appState.currentUser || !appElements.hjemmetSidebar || !appElements.hjemmetMainContent) return;

    renderSidebar();
    renderMainContent();
}

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
                 <h4 class="hjemmet-nav-header">Mit Hjem</h4>
                <a href="#" class="hjemmet-nav-link ${hjemmetState.currentView === 'oversigt' ? 'active' : ''}" data-view="oversigt">
                    <i class="fas fa-home"></i>
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

function renderOversigtDashboard() {
    const today = new Date();
    const dateString = today.toLocaleDateString('da-DK', { day: 'numeric', month: 'long' });
    appElements.hjemmetMainContent.innerHTML = `
        <div class="room-header">
            <h2>Oversigt</h2>
            <p>Dine vigtigste opgaver og påmindelser for i dag, ${dateString}.</p>
        </div>
        <div class="hjemmet-oversigt-grid">
            <div id="watering-widget" class="hjemmet-widget"></div>
            <div id="reminders-widget" class="hjemmet-widget"></div>
            <div id="wishlist-widget" class="hjemmet-widget"></div>
        </div>
        <div id="active-projects-widget" class="hjemmet-widget"></div>
    `;
    renderWateringWidget();
    renderRemindersWidget();
    renderWishlistWidget();
    renderActiveProjectsWidget();
}

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
            let statusText = `${plant.nextWateringDate.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}`;
            let statusClass = '';

            if (daysLeft <= 0) {
                statusText = 'I dag';
                statusClass = 'status-red';
            } else if (daysLeft === 1) {
                statusText = 'I morgen';
                statusClass = 'status-yellow';
            }
            content += `
                <li class="widget-list-item">
                    <div class="item-main-info">
                        <span class="item-title">${plant.name} (${plant.room})</span>
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

function renderRemindersWidget() {
    const container = document.getElementById('reminders-widget');
    if (!container) return;
    const reminders = (appState.reminders || []).slice(0, 5);

    let content = '<h4><i class="fas fa-bell"></i> Påmindelser</h4>';
    if(reminders.length === 0) {
        content += `<p class="empty-state-small">Ingen påmindelser.</p>`;
    } else {
        content += '<ul class="widget-list">';
        reminders.forEach(r => {
            content += `<li class="widget-list-item"><div class="item-main-info"><span class="item-title">${r.text} (${r.room})</span></div></li>`;
        });
        content += '</ul>';
    }
    container.innerHTML = content;
}

function renderWishlistWidget() {
    const container = document.getElementById('wishlist-widget');
    if (!container) return;
    
    const allWishlistItems = Object.values(appState.shoppingLists.wishlist || {});
    const itemsToDisplay = allWishlistItems.slice(0, 4);
    const totalValue = allWishlistItems.reduce((sum, item) => sum + (item.price || 0), 0);

    let content = '<h4><i class="fas fa-gift"></i> Ønskeliste</h4>';
    
    if (itemsToDisplay.length === 0) {
        content += `<p class="empty-state-small">Ønskelisten er tom.</p>`;
    } else {
        content += '<ul class="widget-list">';
        itemsToDisplay.forEach(item => {
            const priceText = item.price ? `${item.price.toFixed(2).replace('.', ',')} kr.` : '';
            const roomText = item.roomId || 'Generelt';

            content += `
                <li class="widget-list-item">
                    <div class="item-main-info">
                        <span class="item-title">${item.name}</span>
                        <span class="item-subtitle" style="font-size: 0.8em; color: #6B7280; display: block; margin-top: 2px;">${roomText}</span>
                    </div>
                    <div class="item-status" style="font-weight: 500;">
                        <span>${priceText}</span>
                    </div>
                </li>
            `;
        });
        content += '</ul>';

        content += `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #E5E7EB; display: flex; justify-content: space-between; font-weight: 600; font-size: 0.875rem;">
                <span>Total Værdi:</span>
                <span>${totalValue.toFixed(2).replace('.', ',')} kr.</span>
            </div>
        `;
    }
    container.innerHTML = content;
}

function renderActiveProjectsWidget() {
    const container = document.getElementById('active-projects-widget');
    if (!container) return;
    const activeProjects = (appState.projects || []).filter(p => p.status === 'Igangværende');

    let content = '<h4><i class="fas fa-tasks"></i> Aktive Projekter</h4>';
    if(activeProjects.length === 0) {
        content += `<p class="empty-state-small">Ingen aktive projekter.</p>`;
    } else {
        content += '<ul class="widget-list">';
        activeProjects.forEach(p => {
            content += `<li class="widget-list-item"><div class="item-main-info"><span class="item-title">${p.title}</span><span class="item-subtitle">${p.room}</span></div></li>`;
        });
        content += '</ul>';
    }
    container.innerHTML = content;
}

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
        <button class="room-tab ${hjemmetState.currentRoomTab.toLowerCase() === tab.toLowerCase() ? 'active' : ''}" data-tab="${tab.toLowerCase()}">
            <i class="fas ${tabIcons[tab]}"></i> ${tab}
        </button>
    `).join('');

    let tabContent = '';
    switch(hjemmetState.currentRoomTab) {
        case 'projekter': tabContent = renderRoomProjects(roomName); break;
        case 'planter': tabContent = renderRoomPlants(roomName); break;
        case 'påmindelser': tabContent = renderRoomReminders(roomName); break;
        case 'vedligehold': tabContent = renderRoomMaintenance(roomName); break;
        case 'inventar': tabContent = renderRoomInventory(roomName); break;
        default: tabContent = `<p class="empty-state">Noget gik galt.</p>`; break;
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

function renderRoomProjects(roomName) {
    const projectsInRoom = (appState.projects || []).filter(p => p.room === roomName);
    const content = projectsInRoom.length === 0
        ? `<p class="empty-state-small">Ingen projekter i dette rum.</p>`
        : projectsInRoom.map(p => `<div class="hjemmet-card" data-id="${p.id}" data-type="project" data-room="${p.room}"><h5>${p.title}</h5><p>${p.status}</p></div>`).join('');
    
    return `
        <div class="tab-header"><h3>Projekter i ${roomName}</h3><button id="add-project-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Nyt Projekt</button></div>
        <div class="hjemmet-grid">${content}</div>
    `;
}

function renderRoomPlants(roomName) {
    const plantsInRoom = (appState.plants || []).filter(p => p.room === roomName);
    const content = plantsInRoom.length === 0
        ? `<p class="empty-state-small">Ingen planter i dette rum.</p>`
        : plantsInRoom.map(p => {
            const nextWatering = new Date(p.lastWatered);
            nextWatering.setDate(nextWatering.getDate() + p.wateringInterval);
            const imageUrl = p.imageBase64 || 'https://placehold.co/400x300/f3f0e9/d1603d?text=Billede+mangler';
            return `
                <div class="hjemmet-card plant-card" data-id="${p.id}" data-type="plant" data-room="${p.room}">
                    <img src="${imageUrl}" class="plant-card-image" alt="${p.name}">
                    <h5>${p.name}</h5>
                    <p>Vandes: ${nextWatering.toLocaleDateString('da-DK', {day: '2-digit', month: 'short'})}</p>
                    <p class="small-text">${p.light || ''}</p>
                </div>
            `;
        }).join('');

    return `
        <div class="tab-header"><h3>Planter i ${roomName}</h3><button id="add-plant-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Tilføj Plante</button></div>
        <div class="hjemmet-grid">${content}</div>
    `;
}

function renderRoomReminders(roomName) {
    const remindersInRoom = (appState.reminders || []).filter(r => r.room === roomName);
     const content = remindersInRoom.length === 0
        ? `<p class="empty-state-small">Ingen påmindelser i dette rum.</p>`
        : remindersInRoom.map(r => `<div class="hjemmet-card" data-id="${r.id}" data-type="reminder" data-room="${r.room}"><h5>${r.text}</h5></div>`).join('');

    return `
        <div class="tab-header"><h3>Påmindelser i ${roomName}</h3><button id="add-reminder-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Ny Påmindelse</button></div>
        <div class="hjemmet-grid">${content}</div>
    `;
}

function renderRoomMaintenance(roomName) {
    const maintenanceInRoom = (appState.maintenance || []).filter(m => m.room === roomName);
    const content = maintenanceInRoom.length === 0
        ? `<p class="empty-state-small">Intet vedligehold i dette rum.</p>`
        : maintenanceInRoom.map(m => `<div class="hjemmet-card" data-id="${m.id}" data-type="maintenance" data-room="${m.room}"><h5>${m.task}</h5><p>Interval: ${m.interval} dage</p></div>`).join('');

    return `
        <div class="tab-header"><h3>Vedligehold i ${roomName}</h3><button id="add-maintenance-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Ny Opgave</button></div>
        <div class="hjemmet-grid">${content}</div>
    `;
}

function renderRoomInventory(roomName) {
    const inventoryInRoom = (appState.home_inventory || []).filter(i => i.room === roomName);
    const content = inventoryInRoom.length === 0
        ? `<p class="empty-state-small">Intet inventar i dette rum.</p>`
        : inventoryInRoom.map(i => `<div class="hjemmet-card" data-id="${i.id}" data-type="home_inventory" data-room="${i.room}"><h5>${i.name}</h5><p>Købt: ${new Date(i.purchaseDate).toLocaleDateString('da-DK')}</p></div>`).join('');

    return `
        <div class="tab-header"><h3>Inventar i ${roomName}</h3><button id="add-home-inventory-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Nyt Inventar</button></div>
        <div class="hjemmet-grid">${content}</div>
    `;
}

function renderWishlistPage() {
    const wishlist = appState.shoppingLists.wishlist || {};
    const items = Object.values(wishlist);

    let itemsHTML = '';
    if (items.length === 0) {
        itemsHTML = `<p class="empty-state" style="grid-column: 1 / -1;">Ønskelisten er tom.</p>`;
    } else {
        items.sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
            itemsHTML += createWishlistItemCard(item);
        });
    }
    
    appElements.hjemmetMainContent.innerHTML = `
        <div class="tab-header">
            <h2>Ønskeliste</h2>
            <button id="add-wish-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Nyt Ønske</button>
        </div>
        <div class="wishlist-page-grid">${itemsHTML}</div>
    `;
}

function createWishlistItemCard(item) {
    const imageUrl = item.imageUrl || `https://placehold.co/400x300/f3f0e9/d1603d?text=${encodeURIComponent(item.name)}`;
    const priceHTML = item.price ? `<span class="wishlist-item-price">${item.price.toFixed(2).replace('.',',')} kr.</span>` : '<span></span>';

    return `
        <div class="wishlist-item-card" data-name="${item.name}">
            <a href="${item.url || '#'}" target="_blank" rel="noopener noreferrer">
                <div class="wishlist-item-image-wrapper">
                    <img src="${imageUrl}" alt="${item.name}" class="wishlist-item-image" onerror="this.onerror=null;this.src='https://placehold.co/400x300/f3f0e9/d1603d?text=Billede+mangler';">
                </div>
            </a>
            <div class="wishlist-item-content">
                <span class="wishlist-item-title">${item.name}</span>
                <span class="wishlist-item-subtitle">${item.roomId || 'Generelt'}</span>
                <div class="wishlist-item-footer">
                    ${priceHTML}
                    <div class="wishlist-item-actions">
                        <button class="btn-icon edit-wish-btn" title="Rediger"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete-wish-btn" title="Slet"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>
        </div>
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

function openPlantModal(roomName, plantId = null) {
    const modal = document.getElementById('plant-edit-modal');
    const form = document.getElementById('plant-form');
    form.reset();
    document.getElementById('plant-room-hidden').value = roomName;
    document.getElementById('plant-id').value = plantId || '';
    document.getElementById('delete-plant-btn').classList.toggle('hidden', !plantId);
    
    const imagePreview = document.getElementById('plant-image-preview');
    imagePreview.src = 'https://placehold.co/600x400/f3f0e9/d1603d?text=Vælg+billede';
    plantFormImage = { type: null, data: null };

    if (plantId) {
        const plant = appState.plants.find(p => p.id === plantId);
        modal.querySelector('h3').textContent = `Rediger ${plant.name}`;
        document.getElementById('plant-name').value = plant.name;
        document.getElementById('plant-watering-interval').value = plant.wateringInterval;
        document.getElementById('plant-last-watered').value = plant.lastWatered;
        document.getElementById('plant-fertilizer-interval').value = plant.fertilizerInterval || '';
        document.getElementById('plant-last-fertilized').value = plant.lastFertilized || '';
        document.getElementById('plant-light').value = plant.light || '';
        document.getElementById('plant-humidity').value = plant.humidity || '';
        document.getElementById('plant-soil').value = plant.soil || '';
        document.getElementById('plant-pot').value = plant.pot || '';
        document.getElementById('plant-dormancy').value = plant.dormancy || '';
        document.getElementById('plant-care-guide').value = plant.careGuide || '';
        
        if (plant.imageBase64) {
            imagePreview.src = plant.imageBase64;
            plantFormImage = { type: 'base64', data: plant.imageBase64 };
        }
    } else {
        modal.querySelector('h3').textContent = `Ny Plante i ${roomName}`;
        document.getElementById('plant-last-watered').value = formatDate(new Date());
    }
    modal.classList.remove('hidden');
}

async function handleSavePlant(e) {
    e.preventDefault();
    const plantId = document.getElementById('plant-id').value;
    const plantData = {
        name: document.getElementById('plant-name').value.trim(),
        room: document.getElementById('plant-room-hidden').value,
        wateringInterval: Number(document.getElementById('plant-watering-interval').value),
        lastWatered: document.getElementById('plant-last-watered').value,
        fertilizerInterval: Number(document.getElementById('plant-fertilizer-interval').value) || null,
        lastFertilized: document.getElementById('plant-last-fertilized').value || null,
        light: document.getElementById('plant-light').value || null,
        humidity: document.getElementById('plant-humidity').value || null,
        soil: document.getElementById('plant-soil').value.trim() || null,
        pot: document.getElementById('plant-pot').value.trim() || null,
        dormancy: document.getElementById('plant-dormancy').value.trim() || null,
        careGuide: document.getElementById('plant-care-guide').value.trim() || null,
        imageBase64: plantFormImage.type === 'base64' ? plantFormImage.data : null,
        userId: appState.currentUser.uid,
    };

    if (!plantData.name || !plantData.wateringInterval) {
        showNotification({ title: "Udfyld alle felter", message: "Navn og vandingsinterval er påkrævet." });
        return;
    }
    try {
        if (plantId) {
            await updateDoc(doc(db, 'plants', plantId), plantData);
        } else {
            await addDoc(collection(db, 'plants'), plantData);
        }
        document.getElementById('plant-edit-modal').classList.add('hidden');
    } catch (error) { handleError(error, "Planten kunne ikke gemmes.", "savePlant"); }
}

async function handleDeletePlant() {
    const plantId = document.getElementById('plant-id').value;
    if (!plantId) return;
    const confirmed = await showNotification({type: 'confirm', title: 'Slet Plante', message: 'Er du sikker?'});
    if (confirmed) {
        try {
            await deleteDoc(doc(db, 'plants', plantId));
            document.getElementById('plant-edit-modal').classList.add('hidden');
        } catch (error) { handleError(error, "Planten kunne ikke slettes.", "deletePlant"); }
    }
}

function handlePlantImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            document.getElementById('plant-image-preview').src = event.target.result;
            plantFormImage = { type: 'base64', data: event.target.result };
        };
        reader.readAsDataURL(file);
    }
}

async function markPlantAsWatered(plantId) {
    try {
        await updateDoc(doc(db, 'plants', plantId), { lastWatered: formatDate(new Date()) });
        showNotification({ title: "Plante Vandet", message: "Datoen for sidste vanding er opdateret." });
    } catch (error) { handleError(error, "Kunne ikke opdatere planten.", "markPlantAsWatered"); }
}

function openWishlistModal(wishName = null) {
    const modal = appElements.wishlistModal;
    const form = appElements.wishlistForm;
    form.reset();
    
    const isEditing = wishName !== null;
    const wishKey = isEditing ? wishName.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const wish = isEditing ? appState.shoppingLists.wishlist[wishKey] : null;

    modal.querySelector('h3').textContent = isEditing ? 'Rediger Ønske' : 'Nyt Ønske';
    document.getElementById('delete-wish-btn').classList.toggle('hidden', !isEditing);
    document.getElementById('wish-original-name-key').value = isEditing ? wishKey : '';

    if (isEditing && wish) {
        document.getElementById('wish-name').value = wish.name;
        document.getElementById('wish-price').value = wish.price || '';
        document.getElementById('wish-image-url').value = wish.imageUrl || '';
        document.getElementById('wish-url').value = wish.url || '';
        document.getElementById('wish-room').value = wish.roomId || '';
    }

    const roomSelect = document.getElementById('wish-room');
    const roomNames = appState.references.rooms || [];
    const populateDropdown = (select, options, placeholder, selected) => {
        select.innerHTML = `<option value="">${placeholder}</option>`;
        options.sort().forEach(opt => select.add(new Option(opt, opt)));
        select.value = selected || '';
    };
    populateDropdown(roomSelect, roomNames, 'Vælg et rum (valgfri)...', wish?.roomId);
    
    modal.classList.remove('hidden');
}

async function handleSaveWish(e) {
    e.preventDefault();
    const originalKey = document.getElementById('wish-original-name-key').value;
    const wishName = document.getElementById('wish-name').value.trim();
    if (!wishName) return;

    const newKey = wishName.toLowerCase().replace(/[^a-z0-9]/g, '');

    const wishData = {
        name: wishName,
        price: Number(document.getElementById('wish-price').value) || null,
        imageUrl: document.getElementById('wish-image-url').value.trim() || null,
        url: document.getElementById('wish-url').value.trim() || null,
        roomId: document.getElementById('wish-room').value || null,
    };
    
    const shoppingListRef = doc(db, 'shopping_lists', appState.currentUser.uid);
    
    try {
        const batch = writeBatch(db);

        if (originalKey && originalKey !== newKey) {
            batch.update(shoppingListRef, { [`wishlist.${originalKey}`]: deleteField() });
        }
        
        batch.update(shoppingListRef, { [`wishlist.${newKey}`]: wishData });
        
        await batch.commit();
        appElements.wishlistModal.classList.add('hidden');
    } catch (error) { handleError(error, "Ønsket kunne ikke gemmes.", "saveWish"); }
}

// OPDATERET: Kan nu kaldes med og uden argument
async function handleDeleteWish(wishNameToDelete) {
    // Hvis funktionen kaldes uden argument (fra modal-knappen), hentes navnet fra inputfeltet.
    const name = wishNameToDelete || document.getElementById('wish-name').value;
    if (!name) return;

    const wishKey = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    const confirmed = await showNotification({
        title: "Slet Ønske",
        message: `Er du sikker på, at du vil slette "${name}"?`,
        type: 'confirm'
    });

    if (!confirmed) return;

    const shoppingListRef = doc(db, 'shopping_lists', appState.currentUser.uid);
    try {
        await updateDoc(shoppingListRef, {
            [`wishlist.${wishKey}`]: deleteField()
        });
        showNotification({ title: "Slettet", message: "Ønsket er blevet fjernet." });
        
        if (document.getElementById('wish-original-name-key').value === wishKey) {
            appElements.wishlistModal.classList.add('hidden');
        }
    } catch (error) {
        handleError(error, "Ønsket kunne ikke slettes.", "deleteWish");
    }
}


function openProjectModal(roomName, projectId = null) {
    appElements.projectForm.reset();
    document.getElementById('project-room-hidden').value = roomName;
    document.getElementById('project-id').value = projectId || '';
    appElements.deleteProjectBtn.classList.toggle('hidden', !projectId);
    if (projectId) {
        const project = appState.projects.find(p => p.id === projectId);
        appElements.projectModal.querySelector('h3').textContent = `Rediger ${project.title}`;
        document.getElementById('project-title').value = project.title;
        document.getElementById('project-status').value = project.status;
    } else {
        appElements.projectModal.querySelector('h3').textContent = `Nyt Projekt i ${roomName}`;
    }
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

async function handleDeleteProject() {
    const projectId = document.getElementById('project-id').value;
    if (!projectId) return;
    const confirmed = await showNotification({type: 'confirm', title: 'Slet Projekt', message: 'Er du sikker?'});
    if(confirmed) {
        try {
            await deleteDoc(doc(db, 'projects', projectId));
            appElements.projectModal.classList.add('hidden');
        } catch (error) { handleError(error, "Projektet kunne ikke slettes.", "deleteProject"); }
    }
}

function openReminderModal(roomName, reminderId = null) {
    appElements.reminderForm.reset();
    document.getElementById('reminder-room-hidden').value = roomName;
    document.getElementById('reminder-id').value = reminderId || '';
    appElements.deleteReminderBtn.classList.toggle('hidden', !reminderId);
    if (reminderId) {
        const reminder = appState.reminders.find(r => r.id === reminderId);
        appElements.reminderModal.querySelector('h3').textContent = `Rediger Påmindelse`;
        document.getElementById('reminder-text').value = reminder.text;
    } else {
        appElements.reminderModal.querySelector('h3').textContent = `Ny Påmindelse i ${roomName}`;
    }
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

async function handleDeleteReminder() {
    const reminderId = document.getElementById('reminder-id').value;
    if (!reminderId) return;
    const confirmed = await showNotification({type: 'confirm', title: 'Slet Påmindelse', message: 'Er du sikker?'});
    if(confirmed) {
        try {
            await deleteDoc(doc(db, 'reminders', reminderId));
            appElements.reminderModal.classList.add('hidden');
        } catch (error) { handleError(error, "Påmindelsen kunne ikke slettes.", "deleteReminder"); }
    }
}

function openMaintenanceModal(roomName, taskId = null) {
    appElements.maintenanceForm.reset();
    document.getElementById('maintenance-room-hidden').value = roomName;
    document.getElementById('maintenance-id').value = taskId || '';
    appElements.deleteMaintenanceBtn.classList.toggle('hidden', !taskId);
    if (taskId) {
        const task = appState.maintenance.find(m => m.id === taskId);
        appElements.maintenanceModal.querySelector('h3').textContent = `Rediger Opgave`;
        document.getElementById('maintenance-task').value = task.task;
        document.getElementById('maintenance-interval').value = task.interval;
    } else {
        appElements.maintenanceModal.querySelector('h3').textContent = `Ny Vedligeholdelsesopgave i ${roomName}`;
    }
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

async function handleDeleteMaintenance() {
    const taskId = document.getElementById('maintenance-id').value;
    if (!taskId) return;
    const confirmed = await showNotification({type: 'confirm', title: 'Slet Opgave', message: 'Er du sikker?'});
    if(confirmed) {
        try {
            await deleteDoc(doc(db, 'maintenance', taskId));
            appElements.maintenanceModal.classList.add('hidden');
        } catch (error) { handleError(error, "Opgaven kunne ikke slettes.", "deleteMaintenance"); }
    }
}

function openHomeInventoryModal(roomName, itemId = null) {
    appElements.homeInventoryForm.reset();
    document.getElementById('home-inventory-room-hidden').value = roomName;
    document.getElementById('home-inventory-id').value = itemId || '';
    appElements.deleteHomeInventoryBtn.classList.toggle('hidden', !itemId);
    if (itemId) {
        const item = appState.home_inventory.find(i => i.id === itemId);
        appElements.homeInventoryModal.querySelector('h3').textContent = `Rediger Inventar`;
        document.getElementById('home-inventory-name').value = item.name;
        document.getElementById('home-inventory-purchaseDate').value = item.purchaseDate;
        document.getElementById('home-inventory-manualUrl').value = item.manualUrl || '';
    } else {
        appElements.homeInventoryModal.querySelector('h3').textContent = `Nyt Inventar i ${roomName}`;
        document.getElementById('home-inventory-purchaseDate').value = formatDate(new Date());
    }
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

async function handleDeleteHomeInventory() {
    const itemId = document.getElementById('home-inventory-id').value;
    if (!itemId) return;
    const confirmed = await showNotification({type: 'confirm', title: 'Slet Inventar', message: 'Er du sikker?'});
    if(confirmed) {
        try {
            await deleteDoc(doc(db, 'home_inventory', itemId));
            appElements.homeInventoryModal.classList.add('hidden');
        } catch (error) { handleError(error, "Inventar kunne ikke slettes.", "deleteHomeInventory"); }
    }
}
