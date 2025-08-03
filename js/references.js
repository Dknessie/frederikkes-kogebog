// js/references.js

import { db } from './firebase.js';
import { doc, setDoc, updateDoc, arrayRemove, arrayUnion, writeBatch, collection, query, where, getDocs, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
        rooms: { // NEW
            title: 'Rum i Hjemmet',
            items: appState.references.rooms || [],
            isSimpleList: true
        },
        standardUnits: {
            title: 'Standardenheder',
            items: appState.references.standardUnits || [],
            isSimpleList: true
        },
        stores: {
            title: 'Butikker',
            items: appState.references.stores || [],
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
                <li class="reference-item" data-value="${item}">
                    <span class="reference-name">${item}</span>
                    <div class="reference-actions">
                        <button class="btn-icon edit-reference-item"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete-reference-item"><i class="fas fa-trash"></i></button>
                    </div>
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
                <li class="reference-item combined-item" data-value="${category}">
                    <span class="reference-name">${category}</span>
                    <div class="shelf-life-group">
                        <input type="number" id="shelf-life-${category}" class="shelf-life-input" data-category="${category}" value="${shelfLifeRules[category] || ''}" placeholder="dage">
                        <div class="reference-actions">
                            <button class="btn-icon edit-reference-item"><i class="fas fa-edit"></i></button>
                            <button class="btn-icon delete-reference-item"><i class="fas fa-trash"></i></button>
                        </div>
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
            await updateDoc(ref, {
                [`shelfLife.${category}`]: days
            });
        } catch (error) {
            handleError(error, "Holdbarhed kunne ikke opdateres.", "updateShelfLife");
        }
    }
}

async function handleListClick(e) {
    const target = e.target;

    if (target.closest('.delete-reference-item')) {
        const itemElement = target.closest('.reference-item');
        const value = itemElement.dataset.value;
        const key = itemElement.closest('.reference-card').dataset.key;
        await deleteReferenceItem(key, value);
    }

    if (target.closest('.edit-reference-item')) {
        const itemElement = target.closest('.reference-item');
        toggleEditMode(itemElement, true);
    }

    if (target.closest('.cancel-edit-reference')) {
        const itemElement = target.closest('.reference-item');
        toggleEditMode(itemElement, false);
    }

    if (target.closest('.save-reference-item')) {
        const itemElement = target.closest('.reference-item');
        const key = itemElement.closest('.reference-card').dataset.key;
        const oldValue = itemElement.dataset.value;
        const newValue = itemElement.querySelector('.edit-reference-input').value.trim();
        await saveReferenceUpdate(key, oldValue, newValue);
    }
}

async function deleteReferenceItem(key, value) {
    if (!appState.currentUser || !key || !value) return;

    const confirmed = await showNotification({title: "Slet Reference", message: `Er du sikker på du vil slette "${value}"? Dette kan ikke fortrydes.`, type: 'confirm'});
    if (!confirmed) return;

    const ref = doc(db, 'references', appState.currentUser.uid);
    try {
        const updatePayload = { [key]: arrayRemove(value) };
        if (key === 'itemCategories') {
            updatePayload[`shelfLife.${value}`] = deleteField();
        }
        await updateDoc(ref, updatePayload);
        showNotification({title: "Slettet", message: `Referencen "${value}" er blevet slettet.`});
    } catch (error) {
        handleError(error, "Referencen kunne ikke slettes.", "deleteReference");
    }
}

function toggleEditMode(itemElement, isEditing) {
    const nameSpan = itemElement.querySelector('.reference-name');
    const actionsDiv = itemElement.querySelector('.reference-actions');
    const shelfLifeGroup = itemElement.querySelector('.shelf-life-group'); // For combined view

    if (isEditing) {
        const originalValue = itemElement.dataset.value;
        const inputHTML = `<input type="text" class="edit-reference-input" value="${originalValue}">`;
        
        nameSpan.style.display = 'none';
        if (shelfLifeGroup) {
            shelfLifeGroup.style.display = 'none';
        }

        const editContainer = document.createElement('div');
        editContainer.className = 'edit-container';
        editContainer.innerHTML = `
            ${inputHTML}
            <div class="edit-actions">
                <button class="btn-icon save-reference-item" title="Gem"><i class="fas fa-check"></i></button>
                <button class="btn-icon cancel-edit-reference" title="Annuller"><i class="fas fa-times"></i></button>
            </div>
        `;
        
        actionsDiv.style.display = 'none';
        itemElement.prepend(editContainer);
        editContainer.querySelector('input').focus();

    } else { // Cancel editing
        const editContainer = itemElement.querySelector('.edit-container');
        if (editContainer) {
            editContainer.remove();
        }
        nameSpan.style.display = 'inline';
        actionsDiv.style.display = 'flex';
        if (shelfLifeGroup) {
            shelfLifeGroup.style.display = 'flex';
        }
    }
}

async function saveReferenceUpdate(key, oldValue, newValue) {
    if (!newValue) {
        showNotification({title: "Fejl", message: "Navnet kan ikke være tomt."});
        return;
    }
    if (newValue === oldValue) {
        // If no change, just exit edit mode
        const itemElement = document.querySelector(`.reference-item[data-value="${oldValue}"]`);
        toggleEditMode(itemElement, false);
        return;
    }
    if (appState.references[key] && appState.references[key].includes(newValue)) {
        showNotification({title: "Eksisterer allerede", message: `Referencen "${newValue}" findes allerede.`});
        return;
    }

    const confirmed = await showNotification({
        title: "Opdater Referencer",
        message: `Vil du omdøbe "${oldValue}" til "${newValue}"? <br><br><strong>Vigtigt:</strong> Dette vil opdatere alle varer, der bruger denne reference.`,
        type: 'confirm'
    });

    if (!confirmed) return;

    const batch = writeBatch(db);
    const userRef = doc(db, 'references', appState.currentUser.uid);

    // 1. Update the references document
    const updatePayload = {
        [key]: arrayRemove(oldValue),
    };
    batch.update(userRef, updatePayload);
    
    const secondUpdatePayload = {
        [key]: arrayUnion(newValue)
    };

    if (key === 'itemCategories') {
        const oldShelfLife = appState.references.shelfLife?.[oldValue];
        if (oldShelfLife !== undefined) {
            secondUpdatePayload[`shelfLife.${oldValue}`] = deleteField();
            secondUpdatePayload[`shelfLife.${newValue}`] = oldShelfLife;
        }
    }
    batch.set(userRef, secondUpdatePayload, { merge: true });


    // 2. Update all related documents in other collections
    let fieldToUpdate = '';
    if (key === 'itemCategories') fieldToUpdate = 'category';
    if (key === 'itemLocations') fieldToUpdate = 'location';
    if (key === 'rooms') fieldToUpdate = 'room'; // For projects
    
    let collectionToUpdate = 'inventory_items';
    if (key === 'rooms') collectionToUpdate = 'projects';

    if (fieldToUpdate) {
        const q = query(collection(db, collectionToUpdate), where(fieldToUpdate, "==", oldValue));
        try {
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((doc) => {
                batch.update(doc.ref, { [fieldToUpdate]: newValue });
            });
        } catch (error) {
            handleError(error, `Kunne ikke finde relaterede emner at opdatere i ${collectionToUpdate}.`, "queryForUpdate");
            return; // Stop if we can't query
        }
    }

    // 3. Commit the batch
    try {
        await batch.commit();
        showNotification({title: "Opdateret!", message: `Referencen er blevet omdøbt, og alle relaterede emner er opdateret.`});
    } catch (error) {
        handleError(error, "En fejl opstod under opdateringen.", "saveReferenceUpdate");
    }
}


async function handleFormSubmit(e) {
    e.preventDefault();
    if (e.target.classList.contains('add-reference-form')) {
        const input = e.target.querySelector('input');
        const value = input.value.trim();
        const key = e.target.closest('.reference-card').dataset.key;

        if (!appState.currentUser || !key || !value) return;

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
