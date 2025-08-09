// js/plants.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;

export function initPlants(state, elements) {
    appState = state;
    appElements = elements;

    // Lytter til klik på knapper for at tilføje og redigere planter
    if (appElements.addPlantBtn) appElements.addPlantBtn.addEventListener('click', openAddPlantModal);
    if (appElements.plantForm) appElements.plantForm.addEventListener('submit', handleSavePlant);
    if (appElements.plantsGrid) appElements.plantsGrid.addEventListener('click', handleGridClick);

    // Lytter til klik på knappen til at slette en plante
    const deleteBtn = document.getElementById('delete-plant-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', handleDeletePlant);
}

export function renderPlants() {
    const grid = document.getElementById('plants-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    if (appState.plants.length === 0) {
        grid.innerHTML = `<p class="empty-state">Du har ingen planter endnu. Tilføj din første plante for at oprette en vandingsplan.</p>`;
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Sorterer planter efter, hvornår de skal vandes
    const sortedPlants = [...appState.plants].sort((a, b) => {
        const nextWateringA = new Date(a.lastWatered);
        const nextWateringB = new Date(b.lastWatered);
        nextWateringA.setDate(nextWateringA.getDate() + a.wateringInterval);
        nextWateringB.setDate(nextWateringB.getDate() + b.wateringInterval);
        return nextWateringA - nextWateringB;
    });

    sortedPlants.forEach(plant => {
        const card = createPlantCard(plant, today);
        fragment.appendChild(card);
    });
    grid.appendChild(fragment);
}

function createPlantCard(plant, today) {
    const card = document.createElement('div');
    card.className = 'plant-card';
    card.dataset.id = plant.id;

    const lastWateredDate = new Date(plant.lastWatered);
    const nextWateringDate = new Date(lastWateredDate);
    nextWateringDate.setDate(nextWateringDate.getDate() + plant.wateringInterval);
    
    let statusIcon, statusText, statusColor;
    const msBetweenWatering = nextWateringDate.getTime() - today.getTime();
    const daysLeft = Math.ceil(msBetweenWatering / (1000 * 60 * 60 * 24));
    
    if (daysLeft <= 0) {
        statusIcon = '<i class="fas fa-exclamation-circle"></i>';
        statusText = 'Skal vandes i dag!';
        statusColor = 'var(--status-red)';
    } else if (daysLeft <= 2) {
        statusIcon = '<i class="fas fa-tint"></i>';
        statusText = `Skal vandes om ${daysLeft} dag${daysLeft === 1 ? '' : 'e'}`;
        statusColor = 'var(--status-yellow)';
    } else {
        statusIcon = '<i class="fas fa-check-circle"></i>';
        statusText = `Vand igen om ${daysLeft} dag${daysLeft === 1 ? '' : 'e'}`;
        statusColor = 'var(--status-green)';
    }
    
    const lastWateredFormatted = lastWateredDate.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });

    card.innerHTML = `
        <div class="plant-card-icon" style="color: ${statusColor};">
            ${statusIcon}
        </div>
        <div class="plant-card-content">
            <h5>${plant.name}</h5>
            <p>${plant.room}</p>
        </div>
        <div class="plant-card-status">
            <p>${statusText}</p>
            <p class="small-text">Sidst vandet: ${lastWateredFormatted}</p>
        </div>
    `;

    return card;
}

// NY FUNKTION: Renderer ønskelisten for Hjem-siden
export function renderWishlist() {
    const grid = document.getElementById('wishlist-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    const wishlistItems = appState.shoppingLists.wishlist ? Object.values(appState.shoppingLists.wishlist) : [];

    if (wishlistItems.length === 0) {
        grid.innerHTML = `<p class="empty-state">Ingen ønsker på listen. Tilføj dine største ønsker her!</p>`;
        return;
    }

    wishlistItems.forEach(item => {
        const card = createWishlistItemCard(item);
        fragment.appendChild(card);
    });
    grid.appendChild(fragment);
}

function createWishlistItemCard(item) {
    const card = document.createElement('div');
    card.className = 'wishlist-item-card';
    card.dataset.name = item.name;

    const imageUrl = item.imageUrl || `https://placehold.co/200x150/f3f0e9/d1603d?text=${encodeURIComponent(item.name)}`;

    card.innerHTML = `
        <img src="${imageUrl}" alt="${item.name}" class="wishlist-item-card-image" onerror="this.onerror=null;this.src='https://placehold.co/200x150/f3f0e9/d1603d?text=Billede+mangler';">
        <div class="wishlist-item-card-content">
            <span class="wishlist-item-card-title">${item.name}</span>
            ${item.price ? `<span class="wishlist-item-card-price">${item.price.toFixed(2)} kr.</span>` : ''}
        </div>
        <div class="wishlist-item-card-actions">
            <button class="btn-icon delete-wishlist-item-btn" title="Fjern ønske"><i class="fas fa-trash"></i></button>
        </div>
    `;
    return card;
}


function openAddPlantModal() {
    appElements.plantEditModal.querySelector('h3').textContent = 'Tilføj ny plante';
    appElements.plantForm.reset();
    document.getElementById('plant-id').value = '';
    document.getElementById('delete-plant-btn').classList.add('hidden');
    
    // Udfyld rum-dropdown baseret på eksisterende rum
    const roomSelect = document.getElementById('plant-room');
    const roomNames = appState.rooms.map(r => r.name);
    populateReferenceDropdown(roomSelect, roomNames, 'Vælg et rum...');
    
    document.getElementById('plant-last-watered').value = formatDate(new Date());

    appElements.plantEditModal.classList.remove('hidden');
}

function openEditPlantModal(plantId) {
    const plant = appState.plants.find(p => p.id === plantId);
    if (!plant) return;

    appElements.plantEditModal.querySelector('h3').textContent = 'Rediger plante';
    appElements.plantForm.reset();
    document.getElementById('plant-id').value = plant.id;
    document.getElementById('delete-plant-btn').classList.remove('hidden');

    document.getElementById('plant-name').value = plant.name;
    document.getElementById('plant-room').value = plant.room;
    document.getElementById('plant-last-watered').value = plant.lastWatered;
    document.getElementById('plant-watering-interval').value = plant.wateringInterval;

    const roomSelect = document.getElementById('plant-room');
    const roomNames = appState.rooms.map(r => r.name);
    populateReferenceDropdown(roomSelect, roomNames, 'Vælg et rum...', plant.room);

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
        message: "Er du sikker på, du vil slette denne plante? Handlingen kan ikke fortrydes.",
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

function handleGridClick(e) {
    const card = e.target.closest('.plant-card');
    if (card) {
        const plantId = card.dataset.id;
        // Markér planten som vandet, eller åbn redigeringsmodal ved shift-klik
        if (e.shiftKey) {
            openEditPlantModal(plantId);
        } else {
            markPlantAsWatered(plantId);
        }
    }
}

async function markPlantAsWatered(plantId) {
    const plant = appState.plants.find(p => p.id === plantId);
    if (!plant) return;

    const confirmed = await showNotification({
        title: "Vand plante",
        message: `Vil du markere "${plant.name}" som vandet i dag?`,
        type: 'confirm'
    });

    if (!confirmed) return;

    const plantRef = doc(db, 'plants', plantId);
    try {
        await updateDoc(plantRef, { lastWatered: formatDate(new Date()) });
        showNotification({ title: "Opdateret", message: `"${plant.name}" er nu markeret som vandet.` });
    } catch (error) {
        handleError(error, "Kunne ikke opdatere vandingsdato.", "markPlantAsWatered");
    }
}

function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    selectElement.value = currentValue || "";
}
