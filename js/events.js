// js/events.js

import { db } from './firebase.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleError, formatDate } from './utils.js'; // Rettet import

let state;
let elements;

export function initEvents(appState, appElements) {
    state = appState;
    elements = appElements;

    if (elements.eventForm) {
        elements.eventForm.addEventListener('submit', handleAddEvent);
    }
}

async function handleAddEvent(e) {
    e.preventDefault();
    if (!state.currentUser) return;

    const formData = new FormData(e.target);
    const eventData = {
        userId: state.currentUser.uid,
        title: formData.get('event-title'),
        date: new Date(formData.get('event-date')),
        type: formData.get('event-type'),
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, 'events'), eventData);
        e.target.reset();
        // Luk modalen her, hvis den er åben
    } catch (error) {
        handleError(error, "Kunne ikke oprette begivenhed.", "handleAddEvent");
    }
}
