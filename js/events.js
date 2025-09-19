// js/events.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate } from './utils.js';

let appState;

export function initEvents(state) {
    appState = state;
    
    const eventFormElement = document.getElementById('event-form');
    if (eventFormElement) {
        eventFormElement.addEventListener('submit', handleSaveEvent);
    }
    
    const eventTypeSelect = document.getElementById('event-type');
    if (eventTypeSelect) {
        eventTypeSelect.addEventListener('change', toggleEventTypeFields);
    }

    const deleteEventBtn = document.getElementById('delete-event-btn');
    if (deleteEventBtn) {
        deleteEventBtn.addEventListener('click', async () => {
            const eventId = document.getElementById('event-id').value;
            if (eventId) {
                const success = await handleDeleteEvent(eventId);
                if (success) {
                    document.getElementById('event-modal').classList.add('hidden');
                }
            }
        });
    }
}

export function openEventModal(date, eventData = null, defaultCategory = null) {
    const modal = document.getElementById('event-modal');
    const form = document.getElementById('event-form');
    const modalTitle = document.getElementById('event-modal-title');
    const deleteBtn = document.getElementById('delete-event-btn');

    if (!form || !modal || !modalTitle || !deleteBtn) {
        console.error("Event modal elements not found in the DOM.");
        return;
    }
    
    form.reset();

    if (eventData) {
        // Redigering
        modalTitle.textContent = 'Rediger Begivenhed';
        document.getElementById('event-id').value = eventData.id;
        document.getElementById('event-title').value = eventData.title;
        document.getElementById('event-date').value = eventData.date;
        document.getElementById('event-type').value = eventData.category;
        deleteBtn.classList.remove('hidden');
        
    } else {
        // Ny begivenhed
        modalTitle.textContent = 'Tilføj Begivenhed';
        document.getElementById('event-id').value = '';
        document.getElementById('event-date').value = date || formatDate(new Date());
        deleteBtn.classList.add('hidden');
        if (defaultCategory) {
            document.getElementById('event-type').value = defaultCategory;
        }
    }

    toggleEventTypeFields();

    if (eventData) {
        setTimeout(() => {
            if (eventData.category === 'Fødselsdag') {
                document.getElementById('event-birthday-name').value = eventData.name || '';
                document.getElementById('event-birth-year').value = eventData.birthYear || '';
            }
            if (eventData.category === 'Udgivelse') {
                document.getElementById('event-release-title').value = eventData.releaseTitle || '';
                document.getElementById('event-release-subcategory').value = eventData.subCategory || '';
            }
            if (eventData.isComplete) {
                const checkbox = document.getElementById('event-is-complete');
                if (checkbox) checkbox.checked = true;
            }
        }, 0);
    }

    modal.classList.remove('hidden');
}


function toggleEventTypeFields() {
    const eventTypeSelect = document.getElementById('event-type');
    const specificFieldsContainer = document.getElementById('event-type-specific-fields');
    const eventTitleGroup = document.getElementById('event-title-group');
    const eventTitleInput = document.getElementById('event-title');

    if (!eventTypeSelect || !specificFieldsContainer || !eventTitleGroup || !eventTitleInput) {
        return;
    }

    const category = eventTypeSelect.value;
    const isTitleHidden = ['Fødselsdag', 'Udgivelse'].includes(category);

    eventTitleGroup.classList.toggle('hidden', isTitleHidden);
    eventTitleInput.required = !isTitleHidden;
    
    let specificHTML = '';
    switch(category) {
        case 'Fødselsdag':
            specificHTML = `
                <div class="form-grid-2-col">
                    <div class="input-group">
                        <label for="event-birthday-name">Navn</label>
                        <input type="text" id="event-birthday-name" required>
                    </div>
                    <div class="input-group">
                        <label for="event-birth-year">Fødselsår (valgfri)</label>
                        <input type="number" id="event-birth-year" placeholder="F.eks. 1990">
                    </div>
                </div>
            `;
            break;
        case 'Udgivelse':
            specificHTML = `
                <div class="form-grid-2-col">
                    <div class="input-group">
                        <label for="event-release-title">Titel</label>
                        <input type="text" id="event-release-title" required>
                    </div>
                    <div class="input-group">
                        <label for="event-release-subcategory">Type</label>
                        <select id="event-release-subcategory" required>
                            <option value="Film">Film</option>
                            <option value="Bog">Bog</option>
                            <option value="Spil">Spil</option>
                            <option value="Produkt">Produkt</option>
                        </select>
                    </div>
                </div>
            `;
            break;
        case 'To-do':
            specificHTML = `
                <div class="input-group-inline">
                    <input type="checkbox" id="event-is-complete" name="event-is-complete">
                    <label for="event-is-complete">Marker som færdig</label>
                </div>
            `;
            break;
    }
    specificFieldsContainer.innerHTML = specificHTML;
}

async function handleSaveEvent(e) {
    e.preventDefault();
    const eventId = document.getElementById('event-id').value;
    const category = document.getElementById('event-type').value;

    const eventData = {
        date: document.getElementById('event-date').value,
        category: category,
        userId: appState.currentUser.uid,
        title: document.getElementById('event-title').value.trim(),
        isRecurring: false,
        isComplete: false,
        name: null,
        birthYear: null,
        releaseTitle: null,
        subCategory: null,
    };

    if (category === 'Fødselsdag') {
        const name = document.getElementById('event-birthday-name').value.trim();
        const birthYear = document.getElementById('event-birth-year').value;
        eventData.name = name;
        eventData.birthYear = birthYear ? parseInt(birthYear, 10) : null;
        eventData.title = `${name}'s Fødselsdag`;
        eventData.isRecurring = true;
    } else if (category === 'Udgivelse') {
        const releaseTitle = document.getElementById('event-release-title').value.trim();
        eventData.releaseTitle = releaseTitle;
        eventData.subCategory = document.getElementById('event-release-subcategory').value;
        eventData.title = `${eventData.subCategory}: ${releaseTitle}`;
    } else if (category === 'To-do') {
        eventData.isComplete = document.getElementById('event-is-complete')?.checked || false;
    }

    if (!eventData.date || !eventData.category) {
        showNotification({ title: "Udfyld påkrævede felter", message: "Dato og kategori skal altid være udfyldt." });
        return;
    }

    try {
        if (eventId) {
            await updateDoc(doc(db, 'events', eventId), eventData);
        } else {
            await addDoc(collection(db, 'events'), eventData);
        }
        document.getElementById('event-modal').classList.add('hidden');
        showNotification({ title: "Gemt!", message: "Din begivenhed er blevet gemt." });
    } catch (error) {
        handleError(error, "Begivenheden kunne ikke gemmes.", "saveEvent");
    }
}

export async function handleDeleteEvent(eventId) {
    if (!eventId) return false;

    const eventToDelete = appState.events.find(e => e.id === eventId);
    if (!eventToDelete) return false;

    const confirmed = await showNotification({
        title: "Slet Begivenhed",
        message: `Er du sikker på, at du vil slette "${eventToDelete.title}"? Handlingen kan ikke fortrydes.`,
        type: 'confirm'
    });

    if (!confirmed) return false;

    try {
        await deleteDoc(doc(db, 'events', eventId));
        showNotification({ title: "Slettet!", message: "Begivenheden er blevet fjernet." });
        return true;
    } catch (error) {
        handleError(error, "Begivenheden kunne ikke slettes.", "deleteEvent");
        return false;
    }
}
