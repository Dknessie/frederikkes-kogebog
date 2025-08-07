// js/rooms.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';

let appState;
let appElements;

export function initRooms(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        addWishlistItemBtn: document.getElementById('add-wishlist-item-btn'),
    };

    if (appElements.addRoomBtn) {
        appElements.addRoomBtn.addEventListener('click', openAddRoomModal);
    }
    if (appElements.roomsGrid) {
        appElements.roomsGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.recipe-card');
            if (card) {
                const roomId = card.dataset.id;
                window.location.hash = `#room-details/${roomId}`;
            }
        });
    }
    if (appElements.editRoomBtn) {
        appElements.editRoomBtn.addEventListener('click', () => {
            if(appState.currentlyViewedRoomId) {
                openEditRoomModal(appState.currentlyViewedRoomId);
            }
        });
    }
    if (appElements.roomForm) {
        appElements.roomForm.addEventListener('submit', handleSaveRoom);
    }

    // Event listeners for dynamic rows in modal
    if (appElements.roomEditModal) {
        appElements.roomEditModal.addEventListener('click', e => {
            if (e.target.closest('#add-room-inventory-btn')) {
                createInventoryRow();
            }
            if (e.target.closest('#add-wishlist-item-btn')) {
                createWishlistRow();
            }
            if (e.target.closest('.remove-room-inventory-btn')) {
                e.target.closest('.room-inventory-row').remove();
            }
            if (e.target.closest('.remove-wishlist-item-btn')) {
                e.target.closest('.wishlist-row').remove();
            }
        });
    }
}

export function renderRoomsListPage() {
    const grid = appElements.roomsGrid;
    if (!grid) return;
    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();

    if (appState.rooms.length === 0) {
        grid.innerHTML = `<p class="empty-state">Du har ikke tilføjet detaljer for nogen rum endnu. Opret dine rum under "Referencer" først, og tilføj dem derefter her.</p>`;
        return;
    }

    appState.rooms.sort((a, b) => a.name.localeCompare(b.name)).forEach(room => {
        const card = document.createElement('div');
        card.className = 'recipe-card'; // Re-use style
        card.dataset.id = room.id;
        
        const imageUrl = (room.images && room.images.length > 0) ? room.images[0] : `https://placehold.co/400x300/f3f0e9/d1603d?text=${encodeURIComponent(room.name)}`;

        card.innerHTML = `
            <img src="${imageUrl}" alt="Billede af ${room.name}" class="recipe-card-image" onerror="this.onerror=null;this.src='https://placehold.co/400x400/f3f0e9/d1603d?text=Billede+mangler';">
            <div class="recipe-card-content">
                <span class="recipe-card-category">${room.area ? `${room.area} m²` : 'Rum'}</span>
                <h4>${room.name}</h4>
            </div>
        `;
        fragment.appendChild(card);
    });
    grid.appendChild(fragment);
}

function renderDetailCard(title, content) {
    if (!content || (Array.isArray(content) && content.length === 0)) {
        return '';
    }
    return `
        <div class="room-detail-card">
            <h4>${title}</h4>
            <div class="info-list">
                ${content}
            </div>
        </div>
    `;
}

export function renderRoomDetailsPage() {
    const roomId = appState.currentlyViewedRoomId;
    const room = appState.rooms.find(r => r.id === roomId);

    if (!room) {
        handleError(new Error("Rum ikke fundet"), "Kunne ikke finde det valgte rum.");
        window.location.hash = '#hjem';
        return;
    }

    appElements.roomDetailsTitle.textContent = room.name;
    const content = appElements.roomDetailsContent;

    const keyInfoContent = [
        room.area ? `<div class="info-item"><span class="info-label">Størrelse:</span><span>${room.area} m²</span></div>` : '',
        room.ceilingHeight ? `<div class="info-item"><span class="info-label">Lofthøjde:</span><span>${room.ceilingHeight} m</span></div>` : ''
    ].filter(Boolean).join('');

    const notesContent = room.notes ? `<p>${room.notes.replace(/\n/g, '<br>')}</p>` : '';
    const vvsContent = room.notesVVS ? `<p>${room.notesVVS.replace(/\n/g, '<br>')}</p>` : '';
    const elContent = room.notesEl ? `<p>${room.notesEl.replace(/\n/g, '<br>')}</p>` : '';
    const windowsContent = room.notesWindows ? `<p>${room.notesWindows.replace(/\n/g, '<br>')}</p>` : '';
    const ventContent = room.notesVentilation ? `<p>${room.notesVentilation.replace(/\n/g, '<br>')}</p>` : '';
    const surfacesContent = room.notesSurfaces ? `<p>${room.notesSurfaces.replace(/\n/g, '<br>')}</p>` : '';

    const inventoryContent = (room.inventory && room.inventory.length > 0) 
        ? room.inventory.map(i => `<div class="info-item"><span>${i.name}</span></div>`).join('') 
        : '<p class="empty-state-small">Intet inventar registreret.</p>';

    const wishlistContent = (room.wishlist && room.wishlist.length > 0) 
        ? room.wishlist.map(i => {
            const link = i.url ? `<a href="${i.url}" target="_blank" rel="noopener noreferrer">${i.name} <i class="fas fa-external-link-alt"></i></a>` : i.name;
            return `<div class="info-item"><span>${link}</span></div>`;
        }).join('') 
        : '<p class="empty-state-small">Ingen ønsker for dette rum.</p>';

    content.innerHTML = `
        ${renderDetailCard('Nøgleinformation', keyInfoContent)}
        ${renderDetailCard('Generelle Noter', notesContent)}
        ${renderDetailCard('VVS & Sanitet', vvsContent)}
        ${renderDetailCard('El-installationer', elContent)}
        ${renderDetailCard('Vinduer & Døre', windowsContent)}
        ${renderDetailCard('Ventilation', ventContent)}
        ${renderDetailCard('Overflader', surfacesContent)}
        ${renderDetailCard('Inventar', inventoryContent)}
        ${renderDetailCard('Ønskeliste', wishlistContent)}
    `;
}

function openAddRoomModal() {
    const modal = appElements.roomEditModal;
    modal.querySelector('h3').textContent = 'Tilføj Rum Detaljer';
    appElements.roomForm.reset();
    document.getElementById('room-id').value = '';
    
    document.getElementById('room-name-select').classList.remove('hidden');
    document.getElementById('room-name-display').classList.add('hidden');

    document.getElementById('room-inventory-list-container').innerHTML = '';
    document.getElementById('room-wishlist-container').innerHTML = '';

    const existingRoomNames = appState.rooms.map(r => r.name);
    const availableRooms = (appState.references.rooms || []).filter(r => !existingRoomNames.includes(r));
    
    populateReferenceDropdown(document.getElementById('room-name-select'), availableRooms, 'Vælg et rum...');

    modal.classList.remove('hidden');
}

function openEditRoomModal(roomId) {
    const room = appState.rooms.find(r => r.id === roomId);
    if (!room) return;

    const modal = appElements.roomEditModal;
    modal.querySelector('h3').textContent = `Rediger ${room.name}`;
    appElements.roomForm.reset();
    document.getElementById('room-id').value = room.id;

    document.getElementById('room-name-select').classList.add('hidden');
    const nameDisplay = document.getElementById('room-name-display');
    nameDisplay.classList.remove('hidden');
    nameDisplay.value = room.name;

    document.getElementById('room-area').value = room.area || '';
    document.getElementById('room-ceiling-height').value = room.ceilingHeight || '';
    document.getElementById('room-notes').value = room.notes || '';
    document.getElementById('room-notes-vvs').value = room.notesVVS || '';
    document.getElementById('room-notes-el').value = room.notesEl || '';
    document.getElementById('room-notes-windows').value = room.notesWindows || '';
    document.getElementById('room-notes-ventilation').value = room.notesVentilation || '';
    document.getElementById('room-notes-surfaces').value = room.notesSurfaces || '';

    const inventoryContainer = document.getElementById('room-inventory-list-container');
    inventoryContainer.innerHTML = '';
    if (room.inventory) room.inventory.forEach(i => createInventoryRow(i));

    const wishlistContainer = document.getElementById('room-wishlist-container');
    wishlistContainer.innerHTML = '';
    if (room.wishlist) room.wishlist.forEach(i => createWishlistRow(i));

    modal.classList.remove('hidden');
}

async function handleSaveRoom(e) {
    e.preventDefault();
    const roomId = document.getElementById('room-id').value;
    const isEditing = !!roomId;

    const roomName = isEditing 
        ? document.getElementById('room-name-display').value
        : document.getElementById('room-name-select').value;

    if (!roomName) {
        showNotification({title: "Mangler Rum", message: "Vælg venligst et rum fra listen."});
        return;
    }

    const inventory = [];
    document.querySelectorAll('#room-inventory-list-container .room-inventory-row').forEach(row => {
        const name = row.querySelector('.room-inventory-name').value.trim();
        if (name) {
            inventory.push({ name });
        }
    });

    const wishlist = [];
    document.querySelectorAll('#room-wishlist-container .wishlist-row').forEach(row => {
        const name = row.querySelector('.wishlist-item-name').value.trim();
        const url = row.querySelector('.wishlist-item-url').value.trim();
        if (name) {
            wishlist.push({ name, url });
        }
    });

    const roomData = {
        name: roomName,
        area: Number(document.getElementById('room-area').value) || null,
        ceilingHeight: Number(document.getElementById('room-ceiling-height').value) || null,
        notes: document.getElementById('room-notes').value.trim() || null,
        notesVVS: document.getElementById('room-notes-vvs').value.trim() || null,
        notesEl: document.getElementById('room-notes-el').value.trim() || null,
        notesWindows: document.getElementById('room-notes-windows').value.trim() || null,
        notesVentilation: document.getElementById('room-notes-ventilation').value.trim() || null,
        notesSurfaces: document.getElementById('room-notes-surfaces').value.trim() || null,
        inventory: inventory,
        wishlist: wishlist,
        images: appState.rooms.find(r => r.id === roomId)?.images || [],
        userId: appState.currentUser.uid
    };

    try {
        if (isEditing) {
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

function createWishlistRow(item = {}) {
    const container = document.getElementById('room-wishlist-container');
    const row = document.createElement('div');
    row.className = 'wishlist-row';
    row.innerHTML = `
        <input type="text" class="wishlist-item-name" placeholder="Navn på ønske" value="${item.name || ''}">
        <input type="url" class="wishlist-item-url" placeholder="https://..." value="${item.url || ''}">
        <button type="button" class="btn-icon remove-wishlist-item-btn"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);
}

function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    selectElement.value = currentValue || "";
}
