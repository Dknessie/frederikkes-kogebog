// js/events.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;

/**
 * Initializes the personal events module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
export function initEvents(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        eventModal: document.getElementById('event-modal'),
        eventForm: document.getElementById('event-form'),
        eventModalTitle: document.getElementById('event-modal-title'),
        eventTypeSpecificFields: document.getElementById('event-type-specific-fields'),
        eventTypeSelect: document.getElementById('event-type'),
    };

    if (appElements.eventForm) {
        appElements.eventForm.addEventListener('submit', handleSaveEvent);
    }
    if (appElements.eventTypeSelect) {
        appElements.eventTypeSelect.addEventListener('change', toggleEventTypeFields);
    }
}

/**
 * Opens the modal to add or edit a personal event.
 * @param {string} [date] - Optional date to pre-fill.
 * @param {object} [eventData] - Optional event data for editing.
 */
export function openEventModal(date, eventData = null) {
    const modal = appElements.eventModal;
    const form = appElements.eventForm;
    form.reset();

    if (eventData) {
        // Editing existing event
        appElements.eventModalTitle.textContent = 'Rediger Begivenhed';
        document.getElementById('event-id').value = eventData.id;
        document.getElementById('event-title').value = eventData.title;
        document.getElementById('event-date').value = eventData.date;
        document.getElementById('event-type').value = eventData.category;
        
        if (eventData.isRecurring) {
            document.getElementById('event-is-recurring').checked = true;
        }
        if (eventData.isComplete) {
            document.getElementById('event-is-complete').checked = true;
        }
    } else {
        // Adding new event
        appElements.eventModalTitle.textContent = 'Tilføj Begivenhed';
        document.getElementById('event-id').value = '';
        document.getElementById('event-date').value = date || formatDate(new Date());
    }

    toggleEventTypeFields();
    modal.classList.remove('hidden');
}

/**
 * Shows or hides specific form fields based on the selected event type.
 */
function toggleEventTypeFields() {
    const category = appElements.eventTypeSelect.value;
    const specificFieldsContainer = appElements.eventTypeSpecificFields;
    
    let specificHTML = '';
    if (category === 'Fødselsdag') {
        specificHTML = `
            <div class="input-group-inline">
                <input type="checkbox" id="event-is-recurring" name="event-is-recurring">
                <label for="event-is-recurring">Gentag årligt</label>
            </div>
        `;
    } else if (category === 'To-do') {
        specificHTML = `
            <div class="input-group-inline">
                <input type="checkbox" id="event-is-complete" name="event-is-complete">
                <label for="event-is-complete">Marker som færdig</label>
            </div>
        `;
    }
    specificFieldsContainer.innerHTML = specificHTML;

    // Pre-check recurring for birthdays if it's a new event
    if (category === 'Fødselsdag' && !document.getElementById('event-id').value) {
        document.getElementById('event-is-recurring').checked = true;
    }
}

/**
 * Handles saving an event from the modal form.
 * @param {Event} e - The form submission event.
 */
async function handleSaveEvent(e) {
    e.preventDefault();
    const eventId = document.getElementById('event-id').value;
    const category = document.getElementById('event-type').value;

    const eventData = {
        title: document.getElementById('event-title').value.trim(),
        date: document.getElementById('event-date').value,
        category: category,
        isRecurring: category === 'Fødselsdag' ? document.getElementById('event-is-recurring')?.checked || false : false,
        isComplete: category === 'To-do' ? document.getElementById('event-is-complete')?.checked || false : false,
        userId: appState.currentUser.uid
    };

    if (!eventData.title || !eventData.date || !eventData.category) {
        showNotification({ title: "Udfyld påkrævede felter", message: "Titel, dato og kategori skal være udfyldt." });
        return;
    }

    try {
        if (eventId) {
            await updateDoc(doc(db, 'events', eventId), eventData);
        } else {
            await addDoc(collection(db, 'events'), eventData);
        }
        appElements.eventModal.classList.add('hidden');
        showNotification({ title: "Gemt!", message: "Din begivenhed er blevet gemt." });
    } catch (error) {
        handleError(error, "Begivenheden kunne ikke gemmes.", "saveEvent");
    }
}
