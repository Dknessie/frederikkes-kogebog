// js/references.js

import { db } from './firebase.js';
import { doc, setDoc, updateDoc, arrayRemove, arrayUnion, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';

let appState;
let appElements;

export function initReferences(state, elements) {
    appState = state;
    appElements = elements;

    if (appElements.referencesContainer) {
        // A single, consolidated event listener for all clicks
        appElements.referencesContainer.addEventListener('click', (e) => {
            // Handle member deletion
            if (e.target.closest('.delete-member-btn')) {
                const memberName = e.target.closest('[data-member-name]').dataset.memberName;
                deleteHouseholdMember(memberName);
            } else {
                // Handle all other clicks for other reference lists
                handleListClick(e);
            }
        });

        // A single, consolidated event listener for all form submissions
        appElements.referencesContainer.addEventListener('submit', (e) => {
            e.preventDefault();
            // Handle household member form submission specifically
            if (e.target.matches('#add-member-form')) {
                const nameInput = e.target.querySelector('#new-member-name');
                const name = nameInput.value.trim();
                if (name) {
                    addHouseholdMember(name);
                    nameInput.value = '';
                }
            } else {
                // Handle all other form submissions
                handleFormSubmit(e);
            }
        });
    }
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
        stores: {
            title: 'Butikker',
            items: appState.references.stores || [],
            isSimpleList: true
        },
        standardUnits: {
            title: 'Standardenheder',
            items: appState.references.standardUnits || [],
            isSimpleList: true,
            isReadOnly: true
        }
    };

    // Household members card
    const householdCard = document.createElement('div');
    householdCard.className = 'reference-card household-members-card';
    householdCard.innerHTML = `
        <h4>Husstandsmedlemmer</h4>
        <p class="small-text">Opret navne her, som kan bruges i budgettet. Disse navne er kun for opdeling og er ikke rigtige brugerkonti.</p>
        <ul id="household-members-list" class="reference-list"></ul>
        <form id="add-member-form" class="add-reference-form">
            <div class="input-group">
                <input type="text" id="new-member-name" placeholder="Tilføj nyt navn..." required>
            </div>
            <button type="submit" class="btn btn-primary"><i class="fas fa-user-plus"></i></button>
        </form>
    `;
    appElements.referencesContainer.appendChild(householdCard);
    appElements.householdMembersList = householdCard.querySelector('#household-members-list');
    
    // Render other reference cards
    for (const key in referenceData) {
        const data = referenceData[key];
        const card = document.createElement('div');
        card.className = 'reference-card';
        card.dataset.key = key;

        if (data.isSimpleList) {
            const listItemsHTML = (data.items || []).sort((a,b) => a.localeCompare(b)).map(item => `
                <li class="reference-item" data-value="${item}">
                    <span class="reference-name">${item}</span>
                    ${!data.isReadOnly ? `
                    <div class="reference-actions">
                        <button class="btn-icon edit-reference-item"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete-reference-item"><i class="fas fa-trash"></i></button>
                    </div>` : ''}
                </li>
            `).join('');
            card.innerHTML = `
                <h4>${data.title}</h4>
                <ul class="reference-list">${listItemsHTML}</ul>
                ${!data.isReadOnly ? `
                <form class="add-reference-form">
                    <div class="input-group">
                        <input type="text" placeholder="Tilføj ny..." required>
                    </div>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i></button>
                </form>` : '<p class="small-text">Denne liste administreres af systemet.</p>'}
            `;
        } else if (data.isHierarchical) {
            const listItemsHTML = (data.items || [])
                .map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat))
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
    
    renderHouseholdMembers();
}

function renderHouseholdMembers() {
    const list = appElements.householdMembersList;
    if (!list) return;

    list.innerHTML = '';
    const members = appState.references.householdMembers || [];
    
    if (members.length === 0) {
        list.innerHTML = `<li class="empty-state-small">Ingen medlemmer tilføjet.</li>`;
        return;
    }

    members.sort().forEach(name => {
        const memberRow = document.createElement('li');
        memberRow.className = 'reference-item';
        memberRow.dataset.memberName = name;

        memberRow.innerHTML = `
            <span class="reference-name">${name}</span>
            <div class="reference-actions">
                <button class="btn-icon delete-member-btn" title="Fjern medlem"><i class="fas fa-trash"></i></button>
            </div>
        `;
        list.appendChild(memberRow);
    });
}

async function addHouseholdMember(name) {
    const members = appState.references.householdMembers || [];
    if (members.map(m => m.toLowerCase()).includes(name.toLowerCase())) {
        showNotification({title: "Navn findes allerede", message: `"${name}" er allerede på listen.`});
        return;
    }

    try {
        const ref = doc(db, 'references', appState.currentUser.uid);
        await setDoc(ref, { householdMembers: arrayUnion(name) }, { merge: true });
        showNotification({title: "Tilføjet!", message: `"${name}" er nu tilføjet til listen.`});
    } catch (error) {
        handleError(error, "Kunne ikke tilføje navn.", "addHouseholdMember");
    }
}

async function deleteHouseholdMember(name) {
    const confirmed = await showNotification({
        title: "Slet Husstandsmedlem",
        message: `Er du sikker på, at du vil slette "${name}"? Det vil fjerne navnet fra budget-dropdowns.`,
        type: 'confirm'
    });

    if (!confirmed) return;

    try {
        const ref = doc(db, 'references', appState.currentUser.uid);
        await updateDoc(ref, { householdMembers: arrayRemove(name) });
        showNotification({title: "Slettet", message: "Navnet er blevet slettet."});
    } catch (error) {
        handleError(error, "Kunne ikke slette navn.", "deleteHouseholdMember");
    }
}

async function handleListClick(e) {
    const target = e.target;
    const key = e.target.closest('.reference-card')?.dataset.key;
    if (!key) return;

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
    const key = e.target.closest('.reference-card')?.dataset.key;
    if (!key) return;

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
    if (appState.references[key] && appState.references[key].map(v => v.toLowerCase()).includes(value.toLowerCase())) {
        showNotification({title: "Eksisterer allerede", message: `"${value}" findes allerede.`});
        return;
    }
    const ref = doc(db, 'references', appState.currentUser.uid);
    await setDoc(ref, { [key]: arrayUnion(value) }, { merge: true });
}

async function addMainCategory(name) {
    const categories = (appState.references.itemCategories || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
    if (categories.some(cat => cat.name.toLowerCase() === name.toLowerCase())) {
        showNotification({title: "Eksisterer allerede", message: `Overkategorien "${name}" findes allerede.`});
        return;
    }
    const newCategory = { name: name, subcategories: [] };
    const ref = doc(db, 'references', appState.currentUser.uid);
    await updateDoc(ref, { itemCategories: arrayUnion(newCategory) });
}

async function addSubCategory(mainCategoryName, subCategoryName) {
    const categories = (appState.references.itemCategories || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
    const mainCatIndex = categories.findIndex(cat => cat.name === mainCategoryName);
    if (mainCatIndex === -1) return;

    const mainCat = categories[mainCatIndex];
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
    const mainCatIndex = categories.findIndex(cat => cat.name === mainCategoryName);
    if (mainCatIndex === -1) return;

    const mainCat = categories[mainCatIndex];
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
        const categoryToDelete = (appState.references.itemCategories || [])
            .find(cat => (typeof cat === 'object' ? cat.name : cat) === value);
        
        if (categoryToDelete) {
            await updateDoc(ref, { itemCategories: arrayRemove(categoryToDelete) });
        }
    } else {
        const batch = writeBatch(db);
        batch.update(ref, { [key]: arrayRemove(value) });
        await batch.commit();
        showNotification({title: "Slettet", message: `Referencen "${value}" er blevet slettet.`});
    }
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
        await batch.commit();
        showNotification({title: "Opdateret!", message: `Referencen er blevet omdøbt.`});
    }
}
