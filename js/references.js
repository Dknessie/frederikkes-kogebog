// js/references.js

import { db } from './firebase.js';
import { doc, setDoc, updateDoc, arrayRemove, arrayUnion, writeBatch, collection, query, where, getDocs, deleteField, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';

let appState;
let appElements;

export function initReferences(state, elements) {
    appState = state;
    appElements = elements;

    appElements.referencesContainer.addEventListener('click', handleListClick);
    appElements.referencesContainer.addEventListener('submit', handleFormSubmit);
    
    // NEW: Household member listeners
    if (appElements.addHouseholdMemberBtn) {
        appElements.addHouseholdMemberBtn.addEventListener('click', e => {
            e.preventDefault();
            const form = e.target.closest('form');
            const emailInput = form.querySelector('#new-member-email');
            const email = emailInput.value.trim();
            if (email) {
                addHouseholdMember(email);
                emailInput.value = '';
            }
        });
    }
    if (appElements.householdMembersList) {
        appElements.householdMembersList.addEventListener('click', e => {
            if (e.target.closest('.delete-member-btn')) {
                const memberId = e.target.closest('[data-member-id]').dataset.memberId;
                deleteHouseholdMember(memberId);
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
            isReadOnly: true // Example of a read-only list
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
                .map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat)) // Handle old string format
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


export function renderHouseholdMembers() {
    const list = appElements.householdMembersList;
    if (!list) return;

    list.innerHTML = '';
    const myId = appState.currentUser.uid;
    
    appState.users.forEach(user => {
        const isCurrentUser = user.id === myId;
        const name = isCurrentUser ? `${user.name || 'Dig selv'} (mig)` : user.name || 'Ukendt bruger';
        
        const memberRow = document.createElement('div');
        memberRow.className = 'member-row';
        memberRow.dataset.memberId = user.id;

        memberRow.innerHTML = `
            <span>${name}</span>
            <div class="actions">
                ${!isCurrentUser ? `<button class="btn-icon delete-member-btn" title="Fjern medlem"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        `;
        list.appendChild(memberRow);
    });
}

async function addHouseholdMember(email) {
    const existingMember = appState.users.find(user => user.email === email);
    if (existingMember) {
        showNotification({title: "Medlem findes allerede", message: "Denne email er allerede en del af husstanden."});
        return;
    }

    try {
        await addDoc(collection(db, 'users'), { email: email, name: email.split('@')[0], householdId: "your-household-id", userId: appState.currentUser.uid });
        showNotification({title: "Tilføjet!", message: `Brugeren med email "${email}" er nu tilføjet til husstanden.`});
    } catch (error) {
        handleError(error, "Kunne ikke tilføje medlem.", "addHouseholdMember");
    }
}

async function deleteHouseholdMember(memberId) {
    const confirmed = await showNotification({
        title: "Slet Husstandsmedlem",
        message: "Er du sikker på, at du vil slette dette medlem? Alle vedkommendes data vil blive slettet.",
        type: 'confirm'
    });

    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, 'users', memberId));
        showNotification({title: "Slettet", message: "Medlemmet er blevet slettet."});
    } catch (error) {
        handleError(error, "Kunne ikke slette medlem.", "deleteHouseholdMember");
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
        // Add logic to update documents that use this reference...
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
        // Add logic to update documents that use this reference...
        await batch.commit();
        showNotification({title: "Opdateret!", message: `Referencen er blevet omdøbt.`});
    }
}
