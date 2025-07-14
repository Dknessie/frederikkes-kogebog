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
    appElements.referencesContainer.addEventListener('change', handleShelfLifeChange);
}

export function renderReferencesPage() {
    appElements.referencesContainer.innerHTML = '';
    const referenceData = {
        itemCategories: {
            title: 'Varekategorier & Standard Holdbarhed (dage)',
            items: appState.references.itemCategories || [],
            isCombinedList: true
        },
        itemLocations: {
            title: 'Placeringer i Hjemmet',
            items: appState.references.itemLocations || [],
            isSimpleList: true
        },
        standardUnits: {
            title: 'Standardenheder',
            items: appState.references.standardUnits || [],
            isSimpleList: true
        }
    };

    for (const key in referenceData) {
        const data = referenceData[key];
        const card = document.createElement('div');
        card.className = 'reference-card';
        card.dataset.key = key;

        let listItemsHTML = '';
        if (data.isSimpleList) {
            listItemsHTML = (data.items || []).sort((a,b) => a.localeCompare(b)).map(item => `
                <li class="reference-item">
                    <span>${item}</span>
                    <button class="btn-icon delete-reference-item" data-value="${item}"><i class="fas fa-trash"></i></button>
                </li>
            `).join('');
            card.innerHTML = `
                <h4>${data.title}</h4>
                <ul class="reference-list">${listItemsHTML}</ul>
                <form class="add-reference-form">
                    <div class="input-group">
                        <input type="text" placeholder="Tilføj ny..." required>
                    </div>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i></button>
                </form>
            `;
        } else if (data.isCombinedList) {
            const shelfLifeRules = appState.references.shelfLife || {};
            listItemsHTML = (data.items || []).sort((a,b) => a.localeCompare(b)).map(category => `
                <li class="reference-item combined-item">
                    <span>${category}</span>
                    <div class="shelf-life-group">
                        <input type="number" id="shelf-life-${category}" class="shelf-life-input" data-category="${category}" value="${shelfLifeRules[category] || ''}" placeholder="dage">
                        <button class="btn-icon delete-reference-item" data-value="${category}"><i class="fas fa-trash"></i></button>
                    </div>
                </li>
            `).join('');
             card.innerHTML = `
                <h4>${data.title}</h4>
                <ul class="reference-list">${listItemsHTML}</ul>
                 <form class="add-reference-form">
                    <div class="input-group">
                        <input type="text" placeholder="Tilføj ny kategori..." required>
                    </div>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i></button>
                </form>
            `;
        }
        
        appElements.referencesContainer.appendChild(card);
    }
}

async function handleShelfLifeChange(e) {
    if (e.target.classList.contains('shelf-life-input')) {
        const category = e.target.dataset.category;
        const days = e.target.value ? parseInt(e.target.value, 10) : null;
        
        if (!appState.currentUser || !category) return;
        
        const ref = doc(db, 'references', appState.currentUser.uid);
        try {
            // Using dot notation to update a field within a map
            await updateDoc(ref, {
                [`shelfLife.${category}`]: days
            });
        } catch (error) {
            handleError(error, "Holdbarhed kunne ikke opdateres.", "updateShelfLife");
        }
    }
}

async function handleListClick(e) {
    const deleteBtn = e.target.closest('.delete-reference-item');
    if (deleteBtn) {
        const value = deleteBtn.dataset.value;
        const key = deleteBtn.closest('.reference-card').dataset.key;
        if (!appState.currentUser || !key || !value) return;

        const confirmed = await showNotification({title: "Slet Reference", message: `Er du sikker på du vil slette "${value}"? Dette vil også fjerne den tilknyttede holdbarhed.`, type: 'confirm'});
        if (!confirmed) return;

        const ref = doc(db, 'references', appState.currentUser.uid);
        try {
            const updatePayload = { [key]: arrayRemove(value) };
            // Also remove from shelfLife if it's a category
            if (key === 'itemCategories') {
                updatePayload[`shelfLife.${value}`] = deleteField();
            }
            await updateDoc(ref, updatePayload);
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

        // Prevent adding duplicates
        if (appState.references[key] && appState.references[key].includes(value)) {
            showNotification({title: "Eksisterer allerede", message: `Referencen "${value}" findes allerede i listen.`});
            return;
        }

        const ref = doc(db, 'references', appState.currentUser.uid);
        try {
            const updatePayload = { [key]: arrayUnion(value) };
            await setDoc(ref, updatePayload, { merge: true });
            input.value = '';
        } catch (error) {
            handleError(error, "Referencen kunne ikke tilføjes.", "addReference");
        }
    }
}
