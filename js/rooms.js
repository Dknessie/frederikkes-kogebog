// js/rooms.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;

// Handles listeners on the main #hjem page
export function initRooms(state, elements) {
    appState = state;
    appElements = elements;

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
    if (appElements.roomForm) {
        appElements.roomForm.addEventListener('submit', handleSaveRoom);
    }

    // Listeners for dynamic rows in the room edit modal
    if (appElements.roomEditModal) {
        appElements.roomEditModal.addEventListener('click', e => {
            if (e.target.closest('#add-wishlist-item-btn')) {
                createWishlistRow();
            }
            if (e.target.closest('.remove-wishlist-item-btn')) {
                e.target.closest('.wishlist-row').remove();
            }
            if (e.target.closest('#add-room-image-btn')) {
                const url = document.getElementById('room-image-url').value;
                if (url) {
                    createImagePreview(url);
                    document.getElementById('room-image-url').value = '';
                }
            }
            if (e.target.closest('.remove-image-btn')) {
                e.target.closest('.image-preview-item').remove();
            }
        });
    }
}

// Handles listeners on the #room-details page
export function initRoomDetails(state, elements) {
    appState = state;
    appElements = { // Cache elements specific to this module
        ...elements,
        logEntryModal: document.getElementById('log-entry-modal'),
        logEntryForm: document.getElementById('log-entry-form'),
        deleteLogEntryBtn: document.getElementById('delete-log-entry-btn'),
    };

    if (appElements.editRoomBtn) {
        appElements.editRoomBtn.addEventListener('click', () => {
            if(appState.currentlyViewedRoomId) {
                openEditRoomModal(appState.currentlyViewedRoomId);
            }
        });
    }
    
    const addLogBtn = document.getElementById('add-log-entry-btn');
    if (addLogBtn) {
        addLogBtn.addEventListener('click', () => openLogEntryModal());
    }

    if (appElements.logEntryForm) {
        appElements.logEntryForm.addEventListener('submit', handleSaveLogEntry);
    }
    if (appElements.deleteLogEntryBtn) {
        appElements.deleteLogEntryBtn.addEventListener('click', handleDeleteLogEntry);
    }

    // Event delegation for clicking on log entries to edit them
    if (appElements.roomDetailsContent) {
        appElements.roomDetailsContent.addEventListener('click', e => {
            const logItem = e.target.closest('.log-entry');
            if (logItem && logItem.dataset.logId) {
                openLogEntryModal(logItem.dataset.logId);
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

function renderDetailCard(title, content, cardClass = '') {
    if (!content || (Array.isArray(content) && content.length === 0) || (typeof content === 'string' && content.trim() === '')) {
        return '';
    }
    return `
        <div class="room-detail-card ${cardClass}">
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

    const galleryContent = (room.images && room.images.length > 0)
        ? `<div class="room-gallery">` + room.images.map(url => `<img src="${url}" alt="Billede af ${room.name}">`).join('') + `</div>`
        : '<p class="empty-state-small">Ingen billeder tilføjet.</p>';

    const wishlistContent = (room.wishlist && room.wishlist.length > 0) 
        ? room.wishlist.map(i => {
            const link = i.url ? `<a href="${i.url}" target="_blank" rel="noopener noreferrer">${i.name} <i class="fas fa-external-link-alt"></i></a>` : i.name;
            const price = i.price ? `<span>${i.price.toFixed(2).replace('.',',')} kr.</span>` : '';
            return `<div class="info-item"><span>${link}</span>${price}</div>`;
        }).join('') 
        : '<p class="empty-state-small">Ingen ønsker for dette rum.</p>';

    const logbookContent = (room.logbook && room.logbook.length > 0)
        ? `<div class="logbook-container">` + room.logbook
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .map(entry => {
                const icons = {
                    'Projekt': '🔨',
                    'Vedligehold': '🧹',
                    'Note': '📝'
                };
                return `
                    <div class="log-entry" data-log-id="${entry.id}">
                        <div class="log-entry-header">
                            <span class="log-entry-icon">${icons[entry.type] || '📌'}</span>
                            <span class="log-entry-date">${formatDate(entry.date)}</span>
                        </div>
                        <p class="log-entry-desc">${entry.description.replace(/\n/g, '<br>')}</p>
                    </div>
                `;
            }).join('') + `</div>`
        : '<p class="empty-state-small">Logbogen er tom. Tilføj din første note!</p>';

    content.innerHTML = `
        <div class="room-details-main-column">
            ${renderDetailCard('Logbog', logbookContent, 'logbook-card')}
        </div>
        <div class="room-details-sidebar">
            ${renderDetailCard('Nøgleinformation', keyInfoContent)}
            ${renderDetailCard('Galleri', galleryContent)}
            ${renderDetailCard('Ønskeliste', wishlistContent)}
        </div>
    `;
}

function openAddRoomModal() {
    const modal = appElements.roomEditModal;
    modal.querySelector('h3').textContent = 'Tilføj Rum Detaljer';
    appElements.roomForm.reset();
    document.getElementById('room-id').value = '';
    
    const roomNameSelect = document.getElementById('room-name-select');
    roomNameSelect.classList.remove('hidden');
    roomNameSelect.required = true;
    document.getElementById('room-name-display').classList.add('hidden');
    document.getElementById('room-wishlist-container').innerHTML = '';
    document.getElementById('room-images-preview-container').innerHTML = '';

    const existingRoomNames = appState.rooms.map(r => r.name);
    const availableRooms = (appState.references.rooms || []).filter(r => !existingRoomNames.includes(r));
    
    populateReferenceDropdown(roomNameSelect, availableRooms, 'Vælg et rum...');

    modal.classList.remove('hidden');
}

function openEditRoomModal(roomId) {
    const room = appState.rooms.find(r => r.id === roomId);
    if (!room) return;

    const modal = appElements.roomEditModal;
    modal.querySelector('h3').textContent = `Rediger ${room.name}`;
    appElements.roomForm.reset();
    document.getElementById('room-id').value = room.id;

    const roomNameSelect = document.getElementById('room-name-select');
    roomNameSelect.classList.add('hidden');
    roomNameSelect.required = false;
    const nameDisplay = document.getElementById('room-name-display');
    nameDisplay.classList.remove('hidden');
    nameDisplay.value = room.name;

    document.getElementById('room-area').value = room.area || '';
    document.getElementById('room-ceiling-height').value = room.ceilingHeight || '';

    const wishlistContainer = document.getElementById('room-wishlist-container');
    wishlistContainer.innerHTML = '';
    if (room.wishlist) room.wishlist.forEach(i => createWishlistRow(i));
    
    const imagesContainer = document.getElementById('room-images-preview-container');
    imagesContainer.innerHTML = '';
    if (room.images) room.images.forEach(url => createImagePreview(url));

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

    const wishlist = [];
    document.querySelectorAll('#room-wishlist-container .wishlist-row').forEach(row => {
        const name = row.querySelector('.wishlist-item-name').value.trim();
        const url = row.querySelector('.wishlist-item-url').value.trim();
        const price = Number(row.querySelector('.wishlist-item-price').value) || null;
        if (name) {
            wishlist.push({ name, url, price });
        }
    });

    const images = [];
    document.querySelectorAll('#room-images-preview-container .image-preview-item img').forEach(img => {
        images.push(img.src);
    });

    const roomData = {
        name: roomName,
        area: Number(document.getElementById('room-area').value) || null,
        ceilingHeight: Number(document.getElementById('room-ceiling-height').value) || null,
        wishlist: wishlist,
        images: images,
        logbook: isEditing ? appState.rooms.find(r => r.id === roomId)?.logbook || [] : [],
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

function createWishlistRow(item = {}) {
    const container = document.getElementById('room-wishlist-container');
    const row = document.createElement('div');
    row.className = 'wishlist-row';
    row.innerHTML = `
        <input type="text" class="wishlist-item-name" placeholder="Navn på ønske" value="${item.name || ''}" required>
        <input type="url" class="wishlist-item-url" placeholder="https://..." value="${item.url || ''}">
        <div class="price-input-wrapper">
            <input type="number" step="0.01" class="wishlist-item-price" placeholder="Pris" value="${item.price || ''}">
        </div>
        <button type="button" class="btn-icon remove-wishlist-item-btn"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);
}

function createImagePreview(url) {
    const container = document.getElementById('room-images-preview-container');
    const item = document.createElement('div');
    item.className = 'image-preview-item';
    item.innerHTML = `
        <img src="${url}" alt="Preview">
        <button type="button" class="btn-icon remove-image-btn"><i class="fas fa-times-circle"></i></button>
    `;
    container.appendChild(item);
}

function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    selectElement.value = currentValue || "";
}

// --- LOGBOOK FUNCTIONS ---

function openLogEntryModal(logId = null) {
    const form = appElements.logEntryForm;
    form.reset();
    
    const room = appState.rooms.find(r => r.id === appState.currentlyViewedRoomId);
    if (!room) return;

    document.getElementById('log-entry-room-id').value = room.id;
    const modalTitle = document.getElementById('log-entry-modal-title');
    const deleteBtn = appElements.deleteLogEntryBtn;

    if (logId) {
        const entry = room.logbook.find(e => e.id === logId);
        if (entry) {
            modalTitle.textContent = `Rediger Note i ${room.name}`;
            document.getElementById('log-entry-id').value = entry.id;
            document.getElementById('log-entry-date').value = entry.date;
            document.getElementById('log-entry-type').value = entry.type;
            document.getElementById('log-entry-description').value = entry.description;
            deleteBtn.style.display = 'inline-flex';
        }
    } else {
        modalTitle.textContent = `Tilføj til Logbog for ${room.name}`;
        document.getElementById('log-entry-id').value = '';
        document.getElementById('log-entry-date').value = formatDate(new Date());
        deleteBtn.style.display = 'none';
    }

    appElements.logEntryModal.classList.remove('hidden');
}

async function handleSaveLogEntry(e) {
    e.preventDefault();
    const roomId = document.getElementById('log-entry-room-id').value;
    const logId = document.getElementById('log-entry-id').value;
    
    const room = appState.rooms.find(r => r.id === roomId);
    if (!room) return;

    const entryData = {
        id: logId || crypto.randomUUID(),
        date: document.getElementById('log-entry-date').value,
        type: document.getElementById('log-entry-type').value,
        description: document.getElementById('log-entry-description').value.trim()
    };

    if (!entryData.date || !entryData.type || !entryData.description) {
        showNotification({title: "Udfyld alle felter", message: "Dato, type og beskrivelse skal være udfyldt."});
        return;
    }

    const roomRef = doc(db, 'rooms', roomId);
    try {
        if (logId) {
            // To edit, we must remove the old and add the new
            const oldEntry = room.logbook.find(e => e.id === logId);
            await updateDoc(roomRef, { logbook: arrayRemove(oldEntry) });
            await updateDoc(roomRef, { logbook: arrayUnion(entryData) });
        } else {
            // Just add the new one
            await updateDoc(roomRef, { logbook: arrayUnion(entryData) });
        }
        appElements.logEntryModal.classList.add('hidden');
        showNotification({title: "Gemt!", message: "Noten er blevet gemt i logbogen."});
    } catch(error) {
        handleError(error, "Noten kunne ikke gemmes.", "saveLogEntry");
    }
}

async function handleDeleteLogEntry() {
    const roomId = document.getElementById('log-entry-room-id').value;
    const logId = document.getElementById('log-entry-id').value;

    if (!roomId || !logId) return;

    const confirmed = await showNotification({
        title: "Slet Note",
        message: "Er du sikker på, du vil slette denne note fra logbogen?",
        type: 'confirm'
    });

    if (!confirmed) return;

    const room = appState.rooms.find(r => r.id === roomId);
    const entryToDelete = room.logbook.find(e => e.id === logId);
    
    if (entryToDelete) {
        try {
            const roomRef = doc(db, 'rooms', roomId);
            await updateDoc(roomRef, { logbook: arrayRemove(entryToDelete) });
            appElements.logEntryModal.classList.add('hidden');
            showNotification({title: "Slettet", message: "Noten er blevet fjernet fra logbogen."});
        } catch (error) {
            handleError(error, "Noten kunne ikke slettes.", "deleteLogEntry");
        }
    }
}
