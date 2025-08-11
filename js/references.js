// js/references.js

import { db } from './firebase.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleError } from './utils.js';

let state;

export function initReferences(appState) {
    state = appState;

    const referencesContainer = document.getElementById('references-container');
    if (referencesContainer) {
        // Lyt efter 'submit' på hele containeren for at fange alle formularer indeni
        referencesContainer.addEventListener('submit', handleReferenceFormSubmit);
    }
    
    renderReferencesPage();
}

export function renderReferencesPage() {
    const container = document.getElementById('references-container');
    if (!container) return;

    // Her kan du bygge HTML for dine reference-formularer.
    // Dette er et simpelt eksempel baseret på en typisk referenceside.
    container.innerHTML = `
        <h2>Administrer Referencer</h2>
        <p>Her kan du administrere de grundlæggende data, som appen bruger, f.eks. varekategorier og enheder.</p>
        
        <form id="inventory-categories-form" class="reference-form">
            <h3>Varekategorier</h3>
            <textarea name="inventoryCategories" rows="8" placeholder="Indtast kategorier, én pr. linje..."></textarea>
            <button type="submit">Gem Kategorier</button>
        </form>

        <form id="units-form" class="reference-form">
            <h3>Måleenheder</h3>
            <textarea name="units" rows="8" placeholder="Indtast enheder, én pr. linje..."></textarea>
            <button type="submit">Gem Enheder</button>
        </form>
    `;

    // Udfyld formularerne med eksisterende data fra state
    if (state.references) {
        const inventoryCategoriesForm = document.querySelector('#inventory-categories-form textarea');
        const unitsForm = document.querySelector('#units-form textarea');

        if (inventoryCategoriesForm && state.references.inventoryCategories) {
            inventoryCategoriesForm.value = state.references.inventoryCategories.join('\n');
        }
        if (unitsForm && state.references.units) {
            unitsForm.value = state.references.units.join('\n');
        }
    }
}

async function handleReferenceFormSubmit(event) {
    event.preventDefault();
    if (!state.currentUser) return;

    const form = event.target;
    const formId = form.id;
    const textarea = form.querySelector('textarea');
    if (!textarea) return;

    // Konverter tekst i textarea til et array, fjern tomme linjer
    const dataArray = textarea.value.split('\n').map(line => line.trim()).filter(line => line);

    let dataToSave = {};

    if (formId === 'inventory-categories-form') {
        dataToSave = { inventoryCategories: dataArray };
    } else if (formId === 'units-form') {
        dataToSave = { units: dataArray };
    } else {
        return; // Gør intet, hvis formularen er ukendt
    }

    try {
        // Gemmer referencer i et enkelt dokument pr. bruger
        const referencesRef = doc(db, 'references', state.currentUser.uid);
        await setDoc(referencesRef, dataToSave, { merge: true });
        alert("Referencer er gemt!");
    } catch (error) {
        handleError(error, "Kunne ikke gemme referencer.", "handleReferenceFormSubmit");
    }
}
