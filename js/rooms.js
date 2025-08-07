// js/rooms.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError, navigateTo } from './ui.js';

let appState;
let appElements;

export function initRooms(state, elements) {
    appState = state;
    appElements = elements;

    appElements.addRoomBtn.addEventListener('click', openAddRoomModal);
    appElements.roomsGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.recipe-card');
        if (card) {
            const roomId = card.dataset.id;
            window.location.hash = `#room-details/${roomId}`;
        }
    });
    appElements.editRoomBtn.addEventListener('click', () => {
        if(appState.currentlyViewedRoomId) {
            openEditRoomModal(appState.currentlyViewedRoomId);
        }
    });
    appElements.roomForm.addEventListener('submit', handleSaveRoom);

    // Event listeners for dynamic rows in modal
    appElements.roomEditModal.addEventListener('click', e => {
        if (e.target.closest('#add-paint-btn')) {
            createPaintRow();
        }
        if (e.target.closest('#add-room-inventory-btn')) {
            createInventoryRow();
        }
        if (e.target.closest('.remove-paint-btn')) {
            e.target.closest('.paint-row').remove();
        }
        if (e.target.closest('.remove-room-inventory-btn')) {
            e.target.closest('.room-inventory-row').remove();
        }
    });
}

export function renderRoomsListPage() {
    const grid = appElements.roomsGrid;
    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    if (appState.rooms.length === 0) {
        grid.innerHTML = `<p class="empty-state">Du har ikke oprettet nogen rum endnu. Klik på knappen for at tilføje dit første!</p>`;
        return;
    }

    appState.rooms.sort((a, b) => a.name.localeCompare(b.name)).forEach(room => {
        const card = document.createElement('div');
        card.className = 'recipe-card'; // Re-use style
        card.dataset.id = room.id;
        
        // Use first image from gallery as preview, or a placeholder
        const imageUrl = (room.images && room.images.length > 0) ? room.images[0] : `https://placehold.co/400x300/f3f0e9/d1603d?text=${encodeURIComponent(room.name)}`;

        card.innerHTML = `
            <img src="${imageUrl}" alt="Billede af ${room.name}" class="recipe-card-image" onerror="this.onerror=null;this.src='https://placehold.co/400x300/f3f0e9/d1603d?text=Billede+mangler';">
            <div class="recipe-card-content">
                <span class="recipe-card-category">${room.type || 'Rum'}</span>
                <h4>${room.name}</h4>
            </div>
        `;
        fragment.appendChild(card);
    });
    grid.appendChild(fragment);
}

export function renderRoomDetailsPage() {
    const roomId = appState.currentlyViewedRoomId;
    const room = appState.rooms.find(r => r.id === roomId);

    if (!room) {
        handleError(new Error("Rum ikke fundet"), "Kunne ikke finde det valgte rum.");
        navigateTo('#hjem');
        return;
    }

    appElements.roomDetailsTitle.textContent = room.name;
    const content = appElements.roomDetailsContent;
    content.innerHTML = `
        <div class="room-detail-card">
            <h4>Galleri</h4>
            <div id="room-gallery-container" class="room-gallery">
                ${(room.images && room.images.length > 0) ? room.images.map(img => `<img src="${img}" alt="Billede af ${room.name}">`).join('') : '<p class="empty-state-small">Intet galleri.</p>'}
            </div>
        </div>
        <div class="room-detail-card">
            <h4>Nøgleinformation</h4>
            <div class="info-list">
                <div class="info-item"><span class="info-label">Type:</span><span>${room.type || 'N/A'}</span></div>
                <div class="info-item"><span class="info-label">Størrelse:</span><span>${room.area || 'N/A'} m²</span></div>
                <div class="info-item"><span class="info-label">Lofthøjde:</span><span>${room.ceilingHeight || 'N/A'} m</span></div>
                <div class="info-item"><span class="info-label">Gulv:</span><span>${room.flooring || 'N/A'}</span></div>
            </div>
        </div>
        <div class="room-detail-card">
            <h4>Maling</h4>
            <div class="info-list">
                ${(room.paints && room.paints.length > 0) ? room.paints.map(p => `
                    <div class="info-item">
                        <span>${p.brand || ''} <strong>${p.colorCode || ''}</strong></span>
                        <span>${p.finish || ''}</span>
                    </div>
                `).join('') : '<p class="empty-state-small">Ingen maling registreret.</p>'}
            </div>
        </div>
        <div class="room-detail-card">
            <h4>Inventar</h4>
             <div class="info-list">
                ${(room.inventory && room.inventory.length > 0) ? room.inventory.map(i => `
                    <div class="info-item"><span>${i.name}</span></div>
                `).join('') : '<p class="empty-state-small">Intet inventar registreret.</p>'}
            </div>
        </div>
    `;
}

function openAddRoomModal() {
    const modal = appElements.roomEditModal;
    modal.querySelector('h3').textContent = 'Opret Nyt Rum';
    appElements.roomForm.reset();
    document.getElementById('room-id').value = '';
    
    document.getElementById('paint-list-container').innerHTML = '';
    document.getElementById('room-inventory-list-container').innerHTML = '';

    populateReferenceDropdown(document.getElementById('room-type'), appState.references.roomTypes, 'Vælg type...');

    modal.classList.remove('hidden');
}

function openEditRoomModal(roomId) {
    const room = appState.rooms.find(r => r.id === roomId);
    if (!room) return;

    const modal = appElements.roomEditModal;
    modal.querySelector('h3').textContent = `Rediger ${room.name}`;
    appElements.roomForm.reset();
    document.getElementById('room-id').value = room.id;

    document.getElementById('room-name').value = room.name || '';
    document.getElementById('room-area').value = room.area || '';
    document.getElementById('room-ceiling-height').value = room.ceilingHeight || '';
    document.getElementById('room-flooring').value = room.flooring || '';

    populateReferenceDropdown(document.getElementById('room-type'), appState.references.roomTypes, 'Vælg type...', room.type);

    const paintContainer = document.getElementById('paint-list-container');
    paintContainer.innerHTML = '';
    if (room.paints) {
        room.paints.forEach(p => createPaintRow(p));
    }

    const inventoryContainer = document.getElementById('room-inventory-list-container');
    inventoryContainer.innerHTML = '';
    if (room.inventory) {
        room.inventory.forEach(i => createInventoryRow(i));
    }

    modal.classList.remove('hidden');
}

async function handleSaveRoom(e) {
    e.preventDefault();
    const roomId = document.getElementById('room-id').value;

    const paints = [];
    document.querySelectorAll('#paint-list-container .paint-row').forEach(row => {
        const brand = row.querySelector('.paint-brand').value.trim();
        const colorCode = row.querySelector('.paint-color-code').value.trim();
        const finish = row.querySelector('.paint-finish').value.trim();
        if (brand || colorCode || finish) {
            paints.push({ brand, colorCode, finish });
        }
    });

    const inventory = [];
    document.querySelectorAll('#room-inventory-list-container .room-inventory-row').forEach(row => {
        const name = row.querySelector('.room-inventory-name').value.trim();
        if (name) {
            inventory.push({ name });
        }
    });

    const roomData = {
        name: document.getElementById('room-name').value,
        type: document.getElementById('room-type').value,
        area: Number(document.getElementById('room-area').value) || null,
        ceilingHeight: Number(document.getElementById('room-ceiling-height').value) || null,
        flooring: document.getElementById('room-flooring').value.trim() || null,
        paints: paints,
        inventory: inventory,
        images: appState.rooms.find(r => r.id === roomId)?.images || [], // Preserve existing images for now
        userId: appState.currentUser.uid
    };

    try {
        if (roomId) {
            await updateDoc(doc(db, 'rooms', roomId), roomData);
        } else {
            await addDoc(collection(db, 'rooms'), roomData);
        }
        appElements.roomEditModal.classList.add('hidden');
        showNotification({ title: "Gemt!", message: "Rummet er blevet gemt." });
    } catch (error) {
        handleError(error, "Rummet kunne ikke gemmes.", "saveRoom");
    }
}

function createPaintRow(paint = {}) {
    const container = document.getElementById('paint-list-container');
    const row = document.createElement('div');
    row.className = 'paint-row';
    row.innerHTML = `
        <input type="text" class="paint-brand" placeholder="Mærke" value="${paint.brand || ''}">
        <input type="text" class="paint-color-code" placeholder="Farvekode" value="${paint.colorCode || ''}">
        <input type="text" class="paint-finish" placeholder="Finish/Glans" value="${paint.finish || ''}">
        <button type="button" class="btn-icon remove-paint-btn"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);
}

function createInventoryRow(item = {}) {
    const container = document.getElementById('room-inventory-list-container');
    const row = document.createElement('div');
    row.className = 'room-inventory-row';
    row.innerHTML = `
        <input type="text" class="room-inventory-name" placeholder="Navn på genstand" value="${item.name || ''}">
        <button type="button" class="btn-icon remove-room-inventory-btn"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);
}

function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    selectElement.value = currentValue || "";
}
