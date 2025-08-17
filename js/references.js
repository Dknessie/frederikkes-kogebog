// js/references.js

import { db } from './firebase.js';
import { doc, setDoc, updateDoc, arrayRemove, arrayUnion, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';

let appState;
let appElements;
let currentCategoryKey = 'householdMembers'; // Start med en standardkategori

// Definition af referencekategorier for at styre UI'en
const referenceCategories = {
    householdMembers: {
        title: 'Husstandsmedlemmer',
        icon: 'fa-users',
        description: 'Opret navne her, som kan bruges i budgettet. Disse navne er ikke rigtige brugerkonti.',
        isSimpleList: true
    },
    budgetCategories: {
        title: 'Budgetkategorier',
        icon: 'fa-money-bill-wave',
        isHierarchical: true
    },
    itemCategories: {
        title: 'Varekategorier',
        icon: 'fa-tags',
        isHierarchical: true
    },
    itemLocations: {
        title: 'Placeringer i Hjemmet',
        icon: 'fa-map-marker-alt',
        isSimpleList: true
    },
    stores: {
        title: 'Butikker',
        icon: 'fa-store',
        isSimpleList: true
    },
    assetTypes: {
        title: 'Aktivtyper',
        icon: 'fa-building',
        isSimpleList: true
    },
    liabilityTypes: {
        title: 'Gældstyper',
        icon: 'fa-file-invoice-dollar',
        isSimpleList: true
    }
};

export function initReferences(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        referencesNavList: document.getElementById('references-nav-list'),
        referencesContentArea: document.getElementById('references-content-area'),
    };

    if (appElements.referencesNavList) {
        appElements.referencesNavList.addEventListener('click', handleNavClick);
    }
    if (appElements.referencesContentArea) {
        appElements.referencesContentArea.addEventListener('click', handleContentClick);
        appElements.referencesContentArea.addEventListener('submit', handleFormSubmit);
    }
}

function handleNavClick(e) {
    const link = e.target.closest('.references-nav-link');
    if (!link) return;

    e.preventDefault();
    currentCategoryKey = link.dataset.category;
    renderReferencesPage();
}

export function renderReferencesPage() {
    if (!appElements.referencesNavList || !appElements.referencesContentArea) return;

    renderSidebarNav();
    renderCategoryContent();
}

function renderSidebarNav() {
    const navList = appElements.referencesNavList;
    navList.innerHTML = '';
    for (const key in referenceCategories) {
        const category = referenceCategories[key];
        const li = document.createElement('li');
        li.innerHTML = `
            <a href="#" class="references-nav-link ${currentCategoryKey === key ? 'active' : ''}" data-category="${key}">
                <i class="fas ${category.icon}"></i>
                <span>${category.title}</span>
            </a>
        `;
        navList.appendChild(li);
    }
}

function renderCategoryContent() {
    const contentArea = appElements.referencesContentArea;
    const categoryConfig = referenceCategories[currentCategoryKey];
    const data = appState.references[currentCategoryKey] || [];

    let itemsHTML = '';
    if (categoryConfig.isSimpleList) {
        itemsHTML = [...data].sort((a, b) => a.localeCompare(b)).map(item => `
            <li class="reference-item" data-value="${item}">
                <span class="reference-name">${item}</span>
                <div class="reference-actions">
                    <button class="btn-icon edit-reference-item"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete-reference-item"><i class="fas fa-trash"></i></button>
                </div>
            </li>
        `).join('');
    } else if (categoryConfig.isHierarchical) {
        const categories = [...data].map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
        itemsHTML = categories.sort((a, b) => a.name.localeCompare(b.name)).map(cat => `
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
    }

    contentArea.innerHTML = `
        <div class="reference-category-content" data-key="${currentCategoryKey}">
            <h4>${categoryConfig.title}</h4>
            ${categoryConfig.description ? `<p class="small-text">${categoryConfig.description}</p>` : ''}
            <ul class="reference-list">${itemsHTML || '<p class="empty-state-small">Ingen elementer tilføjet endnu.</p>'}</ul>
            <form class="add-reference-form">
                <div class="input-group">
                    <input type="text" placeholder="Tilføj ny..." required>
                </div>
                <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i></button>
            </form>
        </div>
    `;
}

function handleContentClick(e) {
    const key = e.target.closest('.reference-category-content')?.dataset.key;
    if (!key) return;

    if (e.target.closest('.delete-reference-item')) {
        const itemElement = e.target.closest('.reference-item, .category-item');
        const value = itemElement.dataset.value;
        deleteReferenceItem(key, value);
    } else if (e.target.closest('.edit-reference-item')) {
        const itemElement = e.target.closest('.reference-item, .category-item');
        toggleEditMode(itemElement, true);
    } else if (e.target.closest('.cancel-edit-reference')) {
        const itemElement = e.target.closest('.reference-item, .category-item, .subcategory-item');
        toggleEditMode(itemElement, false);
    } else if (e.target.closest('.save-reference-item')) {
        const itemElement = e.target.closest('.reference-item, .category-item');
        const oldValue = itemElement.dataset.value;
        const newValue = itemElement.querySelector('.edit-reference-input').value.trim();
        saveReferenceUpdate(key, oldValue, newValue);
    } else if (e.target.closest('.delete-subcategory-item')) {
        const subCatItem = e.target.closest('.subcategory-item');
        const mainCatItem = e.target.closest('.category-item');
        const subCatValue = subCatItem.dataset.value;
        const mainCatValue = mainCatItem.dataset.value;
        deleteSubCategory(key, mainCatValue, subCatValue);
    }
}

function handleFormSubmit(e) {
    e.preventDefault();
    const key = e.target.closest('.reference-category-content')?.dataset.key;
    if (!key) return;

    if (e.target.classList.contains('add-reference-form')) {
        const input = e.target.querySelector('input');
        const value = input.value.trim();
        if (!value) return;

        if (referenceCategories[key].isHierarchical) {
            addMainCategory(key, value);
        } else {
            addSimpleReference(key, value);
        }
        input.value = '';
    } else if (e.target.classList.contains('add-subcategory-form')) {
        const input = e.target.querySelector('input');
        const mainCategory = e.target.closest('.category-item').dataset.value;
        const subCategory = input.value.trim();
        if (!subCategory) return;
        addSubCategory(key, mainCategory, subCategory);
        input.value = '';
    }
}

async function addSimpleReference(key, value) {
    const currentList = appState.references[key] || [];
    if (currentList.map(v => v.toLowerCase()).includes(value.toLowerCase())) {
        showNotification({title: "Eksisterer allerede", message: `"${value}" findes allerede.`});
        return;
    }
    const ref = doc(db, 'references', appState.currentUser.uid);
    await setDoc(ref, { [key]: arrayUnion(value) }, { merge: true });
}

async function addMainCategory(key, name) {
    const categories = (appState.references[key] || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
    if (categories.some(cat => cat.name.toLowerCase() === name.toLowerCase())) {
        showNotification({title: "Eksisterer allerede", message: `Overkategorien "${name}" findes allerede.`});
        return;
    }
    const newCategory = { name: name, subcategories: [] };
    const ref = doc(db, 'references', appState.currentUser.uid);
    await updateDoc(ref, { [key]: arrayUnion(newCategory) });
}

async function addSubCategory(key, mainCategoryName, subCategoryName) {
    const categories = (appState.references[key] || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
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
    await updateDoc(ref, { [key]: categories });
}

async function deleteSubCategory(key, mainCategoryName, subCategoryName) {
    const categories = (appState.references[key] || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
    const mainCatIndex = categories.findIndex(cat => cat.name === mainCategoryName);
    if (mainCatIndex === -1) return;

    const mainCat = categories[mainCatIndex];
    if (!mainCat || !mainCat.subcategories) return;

    mainCat.subcategories = mainCat.subcategories.filter(sub => sub !== subCategoryName);
    const ref = doc(db, 'references', appState.currentUser.uid);
    await updateDoc(ref, { [key]: categories });
}

async function deleteReferenceItem(key, value) {
    if (!appState.currentUser || !key || !value) return;

    const confirmed = await showNotification({title: "Slet Reference", message: `Er du sikker på du vil slette "${value}"? Dette kan ikke fortrydes.`, type: 'confirm'});
    if (!confirmed) return;

    const ref = doc(db, 'references', appState.currentUser.uid);
    
    if (referenceCategories[key].isHierarchical) {
        const categoryToDelete = (appState.references[key] || [])
            .find(cat => (typeof cat === 'object' ? cat.name : cat) === value);
        
        if (categoryToDelete) {
            await updateDoc(ref, { [key]: arrayRemove(categoryToDelete) });
        }
    } else {
        await updateDoc(ref, { [key]: arrayRemove(value) });
    }
    showNotification({title: "Slettet", message: `Referencen "${value}" er blevet slettet.`});
}

function toggleEditMode(itemElement, isEditing) {
    const nameSpan = itemElement.querySelector('.reference-name, .category-header > .reference-name');
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
        nameSpan.insertAdjacentElement('afterend', editContainer);
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
    
    if (referenceCategories[key].isHierarchical) {
        const categories = (appState.references[key] || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
        const catToUpdate = categories.find(cat => cat.name === oldValue);
        if (catToUpdate) {
            catToUpdate.name = newValue;
            await updateDoc(ref, { [key]: categories });
        }
    } else {
        const batch = writeBatch(db);
        batch.update(ref, { [key]: arrayRemove(oldValue) });
        batch.update(ref, { [key]: arrayUnion(newValue) });
        await batch.commit();
    }
    showNotification({title: "Opdateret!", message: `Referencen er blevet omdøbt.`});
}
