// js/references.js

import { db } from './firebase.js';
import { doc, setDoc, updateDoc, arrayRemove, arrayUnion } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';

let appState;
let appElements;

export function initReferences(state, elements) {
    appState = state;
    appElements = elements;

    appElements.referencesContainer.addEventListener('click', handleListClick);
    appElements.referencesContainer.addEventListener('submit', handleFormSubmit);
}

export function renderReferencesPage() {
    appElements.referencesContainer.innerHTML = '';
    const referenceData = {
        itemDescriptions: {
            title: 'Varebeskrivelser',
            items: appState.references.itemDescriptions || []
        },
        itemCategories: {
            title: 'Varekategorier (Butik)',
            items: appState.references.itemCategories || []
        },
        itemLocations: {
            title: 'Placeringer i Hjemmet',
            items: appState.references.itemLocations || []
        },
        standardUnits: {
            title: 'Standardenheder',
            items: appState.references.standardUnits || []
        }
    };

    for (const key in referenceData) {
        const data = referenceData[key];
        const card = document.createElement('div');
        card.className = 'reference-card';
        card.dataset.key = key;

        const listItems = (data.items || []).sort((a,b) => a.localeCompare(b)).map(item => `
            <li class="reference-item">
                <span>${item}</span>
                <button class="btn-icon delete-reference-item" data-value="${item}"><i class="fas fa-trash"></i></button>
            </li>
        `).join('');

        card.innerHTML = `
            <h4>${data.title}</h4>
            <ul class="reference-list">${listItems}</ul>
            <form class="add-reference-form">
                <div class="input-group">
                    <input type="text" placeholder="Tilføj ny..." required>
                </div>
                <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i></button>
            </form>
        `;
        appElements.referencesContainer.appendChild(card);
    }
}

async function handleListClick(e) {
    const deleteBtn = e.target.closest('.delete-reference-item');
    if (deleteBtn) {
        const value = deleteBtn.dataset.value;
        const key = deleteBtn.closest('.reference-card').dataset.key;
        if (!appState.currentUser || !key || !value) return;

        const confirmed = await showNotification({title: "Slet Reference", message: `Er du sikker på du vil slette "${value}"?`, type: 'confirm'});
        if (!confirmed) return;

        const ref = doc(db, 'references', appState.currentUser.uid);
        try {
            await updateDoc(ref, {
                [key]: arrayRemove(value)
            });
        } catch (error) {
            handleError(error, "Referencen kunne ikke slettes.", "deleteReference");
        }
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    if (e.target.classList.contains('add-reference-form')) {
        const input = e.target.querySelector('input');
        const value = input.value.trim();
        const key = e.target.closest('.reference-card').dataset.key;

        if (!appState.currentUser || !key || !value) return;

        const ref = doc(db, 'references', appState.currentUser.uid);
        try {
            await setDoc(ref, {
                [key]: arrayUnion(value)
            }, { merge: true });
            input.value = '';
        } catch (error) {
            handleError(error, "Referencen kunne ikke tilføjes.", "addReference");
        }
    }
}
