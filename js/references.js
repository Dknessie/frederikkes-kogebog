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
}

export function renderReferencesPage() {
    appElements.referencesContainer.innerHTML = '';
    const referenceData = {
        itemCategories: {
            title: 'Varekategorier',
            items: appState.references.itemCategories || [],
            isHierarchical: true
        },
        itemLocations: {
            title: 'Placeringer i Hjemmet',
            items: appState.references.itemLocations || [],
            isSimpleList: true
        },
        rooms: {
            title: 'Rum',
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

        if (data.isSimpleList) {
            const listItemsHTML = (data.items || []).sort((a,b) => a.localeCompare(b)).map(item => `
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
        } else if (data.isHierarchical) {
            const listItemsHTML = (data.items || [])
                .map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat)) // **FIX: Handle old string format**
                .sort((a,b) => a.name.localeCompare(b.name))
                .map(cat => `
                <li class="category-item" data-value="${cat.name}">
                    <div class="category-header">
                        <span class="reference-name">${cat.name}</span>
                        <div class="reference-actions">
                            <button class="btn-icon edit-reference-item"><i class="fas fa-edit"></i></button>
                            <button class="btn-icon delete-reference-item"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                    <ul class="subcategory-list">
                        ${(cat.subcategories || []).sort().map(sub => `
                            <li class="subcategory-item" data-value="${sub}">
                                <span>${sub}</span>
                                <div class="reference-actions">
                                    <button class="btn-icon edit-subcategory-item"><i class="fas fa-edit"></i></button>
                                    <button class="btn-icon delete-subcategory-item"><i class="fas fa-trash"></i></button>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                    <form class="add-subcategory-form">
                        <input type="text" placeholder="Tilføj underkategori..." required>
                        <button type="submit" class="btn-icon"><i class="fas fa-plus-circle"></i></button>
                    </form>
                </li>
            `).join('');
            card.innerHTML = `
                <h4>${data.title}</h4>
                <ul class="reference-list">${listItemsHTML}</ul>
                <form class="add-reference-form">
                    <div class="input-group">
                        <input type="text" placeholder="Tilføj ny overkategori..." required>
                    </div>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i></button>
                </form>
            `;
        }
        
        appElements.referencesContainer.appendChild(card);
    }
}


async function handleListClick(e) {
    const target = e.target;
    const key = e.target.closest('.reference-card')?.dataset.key;

    if (target.closest('.delete-reference-item')) {
        const itemElement = target.closest('.reference-item, .category-item');
        const value = itemElement.dataset.value;
        await deleteReferenceItem(key, value);
    } else if (target.closest('.edit-reference-item')) {
        const itemElement = target.closest('.reference-item, .category-item');
        toggleEditMode(itemElement, true);
    } else if (target.closest('.cancel-edit-reference')) {
        const itemElement = target.closest('.reference-item, .category-item, .subcategory-item');
        toggleEditMode(itemElement, false);
    } else if (target.closest('.save-reference-item')) {
        const itemElement = target.closest('.reference-item, .category-item');
        const oldValue = itemElement.dataset.value;
        const newValue = itemElement.querySelector('.edit-reference-input').value.trim();
        await saveReferenceUpdate(key, oldValue, newValue);
    } else if (target.closest('.delete-subcategory-item')) {
        const subCatItem = target.closest('.subcategory-item');
        const mainCatItem = target.closest('.category-item');
        const subCatValue = subCatItem.dataset.value;
        const mainCatValue = mainCatItem.dataset.value;
        await deleteSubCategory(mainCatValue, subCatValue);
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const key = e.target.closest('.reference-card').dataset.key;

    if (e.target.classList.contains('add-reference-form')) {
        const input = e.target.querySelector('input');
        const value = input.value.trim();
        if (!value) return;

        if (key === 'itemCategories') {
            await addMainCategory(value);
        } else {
            await addSimpleReference(key, value);
        }
        input.value = '';
    } else if (e.target.classList.contains('add-subcategory-form')) {
        const input = e.target.querySelector('input');
        const mainCategory = e.target.closest('.category-item').dataset.value;
        const subCategory = input.value.trim();
        if (!subCategory) return;
        await addSubCategory(mainCategory, subCategory);
        input.value = '';
    }
}

async function addSimpleReference(key, value) {
    if (appState.references[key] && appState.references[key].includes(value)) {
        showNotification({title: "Eksisterer allerede", message: `"${value}" findes allerede.`});
        return;
    }
    const ref = doc(db, 'references', appState.currentUser.uid);
    await updateDoc(ref, { [key]: arrayUnion(value) });
}

async function addMainCategory(name) {
    const categories = (appState.references.itemCategories || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
    if (categories.some(cat => cat.name.toLowerCase() === name.toLowerCase())) {
        showNotification({title: "Eksisterer allerede", message: `Overkategorien "${name}" findes allerede.`});
        return;
    }
    const newCategory = { name: name, subcategories: [] };
    categories.push(newCategory);
    const ref = doc(db, 'references', appState.currentUser.uid);
    await updateDoc(ref, { itemCategories: categories });
}

async function addSubCategory(mainCategoryName, subCategoryName) {
    const categories = (appState.references.itemCategories || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
    const mainCat = categories.find(cat => cat.name === mainCategoryName);
    if (!mainCat) return;

    if ((mainCat.subcategories || []).some(sub => sub.toLowerCase() === subCategoryName.toLowerCase())) {
        showNotification({title: "Eksisterer allerede", message: `Underkategorien "${subCategoryName}" findes allerede.`});
        return;
    }
    
    if (!mainCat.subcategories) mainCat.subcategories = [];
    mainCat.subcategories.push(subCategoryName);
    const ref = doc(db, 'references', appState.currentUser.uid);
    await updateDoc(ref, { itemCategories: categories });
}

async function deleteSubCategory(mainCategoryName, subCategoryName) {
    const categories = (appState.references.itemCategories || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
    const mainCat = categories.find(cat => cat.name === mainCategoryName);
    if (!mainCat || !mainCat.subcategories) return;

    mainCat.subcategories = mainCat.subcategories.filter(sub => sub !== subCategoryName);
    const ref = doc(db, 'references', appState.currentUser.uid);
    await updateDoc(ref, { itemCategories: categories });
}

async function deleteReferenceItem(key, value) {
    if (!appState.currentUser || !key || !value) return;

    const confirmed = await showNotification({title: "Slet Reference", message: `Er du sikker på du vil slette "${value}"? Dette kan ikke fortrydes.`, type: 'confirm'});
    if (!confirmed) return;

    const ref = doc(db, 'references', appState.currentUser.uid);
    
    if (key === 'itemCategories') {
        const updatedCategories = (appState.references.itemCategories || [])
            .map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat))
            .filter(cat => cat.name !== value);
        await updateDoc(ref, { itemCategories: updatedCategories });
    } else {
        await updateDoc(ref, { [key]: arrayRemove(value) });
    }
    
    showNotification({title: "Slettet", message: `Referencen "${value}" er blevet slettet.`});
}

function toggleEditMode(itemElement, isEditing) {
    const nameSpan = itemElement.querySelector('.reference-name');
    const actionsDiv = itemElement.querySelector('.reference-actions');

    if (isEditing) {
        const originalValue = itemElement.dataset.value;
        const inputHTML = `<input type="text" class="edit-reference-input" value="${originalValue}">`;
        
        nameSpan.style.display = 'none';

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
        if (editContainer) editContainer.remove();
        nameSpan.style.display = 'inline';
        actionsDiv.style.display = 'flex';
    }
}

async function saveReferenceUpdate(key, oldValue, newValue) {
    if (!newValue || newValue === oldValue) {
        const itemElement = document.querySelector(`.reference-item[data-value="${oldValue}"], .category-item[data-value="${oldValue}"]`);
        if(itemElement) toggleEditMode(itemElement, false);
        return;
    }
    
    const ref = doc(db, 'references', appState.currentUser.uid);
    
    if (key === 'itemCategories') {
        const categories = (appState.references.itemCategories || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
        const catToUpdate = categories.find(cat => cat.name === oldValue);
        if (catToUpdate) {
            catToUpdate.name = newValue;
            await updateDoc(ref, { itemCategories: categories });
            showNotification({title: "Opdateret!", message: `Kategorien er blevet omdøbt.`});
        }
    } else {
        const batch = writeBatch(db);
        batch.update(ref, { [key]: arrayRemove(oldValue) });
        batch.update(ref, { [key]: arrayUnion(newValue) });
        // Add logic to update documents that use this reference...
        await batch.commit();
        showNotification({title: "Opdateret!", message: `Referencen er blevet omdøbt.`});
    }
}
