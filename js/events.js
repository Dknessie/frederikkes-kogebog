// js/events.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate } from './utils.js';

let appState;

/**
 * Initializes the personal events module by setting up permanent event listeners.
 * @param {object} state - The global app state.
 */
export function initEvents(state) {
    appState = state;
    
    // Find the form and attach the submit listener once.
    const eventFormElement = document.getElementById('event-form');
    if (eventFormElement) {
        eventFormElement.addEventListener('submit', handleSaveEvent);
    }
    
    // Attach the change listener for the dropdown once.
    const eventTypeSelect = document.getElementById('event-type');
    if (eventTypeSelect) {
        eventTypeSelect.addEventListener('change', toggleEventTypeFields);
    }
}

/**
 * Opens the modal to add or edit a personal event.
 * @param {string} [date] - Optional date to pre-fill.
 * @param {object} [eventData] - Optional event data for editing.
 */
export function openEventModal(date, eventData = null) {
    // FIX: Look up elements directly when the function is called for robustness.
    const modal = document.getElementById('event-modal');
    const form = document.getElementById('event-form');
    const modalTitle = document.getElementById('event-modal-title');

    // Defensive check to ensure modal elements exist before proceeding.
    if (!form || !modal || !modalTitle) {
        console.error("Event modal elements not found in the DOM.");
        return;
    }
    
    form.reset();

    if (eventData) {
        // Editing an existing event
        modalTitle.textContent = 'Rediger Begivenhed';
        document.getElementById('event-id').value = eventData.id;
        document.getElementById('event-title').value = eventData.title;
        document.getElementById('event-date').value = eventData.date;
        document.getElementById('event-type').value = eventData.category;
        
        toggleEventTypeFields(); // Create the specific fields for the event type.
        
        // Use a timeout to ensure dynamic fields are in the DOM before populating them.
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
        
    } else {
        // Adding a new event
        modalTitle.textContent = 'Tilføj Begivenhed';
        document.getElementById('event-id').value = '';
        document.getElementById('event-date').value = date || formatDate(new Date());
        toggleEventTypeFields(); // Set the initial state for a new event.
    }

    modal.classList.remove('hidden');
}

/**
 * Shows or hides specific form fields based on the selected event type.
 */
function toggleEventTypeFields() {
    // FIX: Look up elements directly each time to handle dynamic content.
    const eventTypeSelect = document.getElementById('event-type');
    const specificFieldsContainer = document.getElementById('event-type-specific-fields');
    const eventTitleGroup = document.getElementById('event-title-group');

    if (!eventTypeSelect || !specificFieldsContainer || !eventTitleGroup) {
        return;
    }

    const category = eventTypeSelect.value;
    eventTitleGroup.classList.toggle('hidden', ['Fødselsdag', 'Udgivelse'].includes(category));
    
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

/**
 * Handles saving an event from the modal form.
 * @param {Event} e - The form submission event.
 */
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

    if (!eventData.title || !eventData.date || !eventData.category) {
        showNotification({ title: "Udfyld påkrævede felter", message: "Alle nødvendige felter skal være udfyldt." });
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
