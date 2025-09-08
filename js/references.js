// js/references.js

import { db } from './firebase.js';
import { doc, setDoc, updateDoc, arrayRemove, arrayUnion, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';

let appState;
let appElements;
let currentCategoryKey = 'householdMembers';

const referenceCategories = {
    householdMembers: {
        title: 'Husstandsmedlemmer',
        icon: 'fa-users',
        description: 'Opret navne her, som kan bruges i budgettet.',
        isSimpleList: true
    },
    accounts: {
        title: 'Konti',
        icon: 'fa-wallet',
        description: 'Administrer de konti, som faste udgifter trækkes fra.',
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
        description: 'Definerer hovedlokationer for varelager (f.eks. Køleskab, Fryser).',
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
    },
    freezerShelfLife: {
        title: 'Holdbarhed i Fryser',
        icon: 'fa-snowflake',
        description: 'Sæt standard holdbarhed i måneder for forskellige varekategorier i fryseren.',
        isKeyValue: true,
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
    const data = appState.references[currentCategoryKey] || (categoryConfig.isKeyValue ? {} : []);

    let itemsHTML = '';
    if (categoryConfig.isSimpleList) {
        itemsHTML = [...data].sort((a, b) => a.localeCompare(b)).map(item => createSimpleItemHTML(item)).join('');
    } else if (categoryConfig.isHierarchical) {
        const categories = [...data].map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
        itemsHTML = categories.sort((a, b) => a.name.localeCompare(b.name)).map(cat => createHierarchicalItemHTML(cat)).join('');
    } else if (categoryConfig.isKeyValue) {
        const freezerCategories = appState.references.itemCategories?.find(c => c.name === 'Frostvarer')?.subcategories || [];
        itemsHTML = freezerCategories.map(cat => createKeyValueItemHTML(cat, data[cat])).join('');
    }

    contentArea.innerHTML = `
        <div class="reference-category-content" data-key="${currentCategoryKey}">
            <h4>${categoryConfig.title}</h4>
            ${categoryConfig.description ? `<p class="small-text">${categoryConfig.description}</p>` : ''}
            <ul class="reference-list">${itemsHTML || '<p class="empty-state-small">Ingen elementer tilføjet endnu.</p>'}</ul>
            ${!categoryConfig.isKeyValue ? getAddFormHTML() : ''}
        </div>
    `;
}

function createSimpleItemHTML(item) {
    return `
        <li class="reference-item" data-value="${item}">
            <span class="reference-name">${item}</span>
            <div class="reference-actions">
                <button class="btn-icon edit-reference-item"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete-reference-item"><i class="fas fa-trash"></i></button>
            </div>
        </li>
    `;
}

function createHierarchicalItemHTML(cat) {
    return `
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
    `;
}

function createKeyValueItemHTML(key, value) {
    return `
        <li class="reference-item key-value-item" data-key="${key}">
            <span class="reference-name">${key}</span>
            <div class="key-value-input">
                <input type="number" value="${value || ''}" placeholder="Måneder">
                <span>mdr.</span>
            </div>
        </li>
    `;
}

function getAddFormHTML() {
    return `
        <form class="add-reference-form">
            <div class="input-group">
                <input type="text" placeholder="Tilføj ny..." required>
            </div>
            <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i></button>
        </form>
    `;
}

async function handleContentClick(e) {
    const key = e.target.closest('.reference-category-content')?.dataset.key;
    if (!key) return;

    if (e.target.closest('.delete-reference-item')) {
        const itemElement = e.target.closest('.reference-item, .category-item');
        const value = itemElement.dataset.value;
        await deleteReferenceItem(key, value);
    } else if (e.target.closest('.edit-reference-item')) {
        toggleEditMode(e.target.closest('.reference-item, .category-item'), true);
    } else if (e.target.closest('.cancel-edit-reference')) {
        toggleEditMode(e.target.closest('.reference-item, .category-item, .subcategory-item'), false);
    } else if (e.target.closest('.save-reference-item')) {
        const itemElement = e.target.closest('.reference-item, .category-item');
        const oldValue = itemElement.dataset.value;
        const newValue = itemElement.querySelector('.edit-reference-input').value.trim();
        await saveReferenceUpdate(key, oldValue, newValue);
    } else if (e.target.closest('.delete-subcategory-item')) {
        const mainCatValue = e.target.closest('.category-item').dataset.value;
        const subCatValue = e.target.closest('.subcategory-item').dataset.value;
        await deleteSubCategory(key, mainCatValue, subCatValue);
    } else if (e.target.matches('.key-value-input input')) {
        // Gem automatisk ved ændring i key-value felter (med debounce)
        debouncedSaveKeyValue(key, e.target.closest('.key-value-item').dataset.key, e.target.value);
    }
}

const debouncedSaveKeyValue = debounce(async (categoryKey, itemKey, value) => {
    const ref = doc(db, 'references', appState.currentUser.uid);
    await updateDoc(ref, {
        [`${categoryKey}.${itemKey}`]: Number(value) || null
    });
    showNotification({title: "Gemt", message: "Holdbarhed er opdateret."});
}, 500);

function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const key = e.target.closest('.reference-category-content')?.dataset.key;
    if (!key) return;

    if (e.target.classList.contains('add-reference-form')) {
        const input = e.target.querySelector('input');
        const value = input.value.trim();
        if (!value) return;

        if (referenceCategories[key].isHierarchical) {
            await addMainCategory(key, value);
        } else {
            await addSimpleReference(key, value);
        }
        input.value = '';
    } else if (e.target.classList.contains('add-subcategory-form')) {
        const input = e.target.querySelector('input');
        const mainCategory = e.target.closest('.category-item').dataset.value;
        const subCategory = input.value.trim();
        if (!subCategory) return;
        await addSubCategory(key, mainCategory, subCategory);
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
    const mainCat = categories.find(cat => cat.name === mainCategoryName);
    if (!mainCat) return;

    if ((mainCat.subcategories || []).some(sub => sub.toLowerCase() === subCategoryName.toLowerCase())) {
        showNotification({title: "Eksisterer allerede", message: `Underkategorien "${subCategoryName}" findes allerede.`});
        return;
    }
    
    mainCat.subcategories = [...(mainCat.subcategories || []), subCategoryName];
    
    const ref = doc(db, 'references', appState.currentUser.uid);
    await updateDoc(ref, { [key]: categories });
}

async function deleteSubCategory(key, mainCategoryName, subCategoryName) {
    const categories = (appState.references[key] || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
    const mainCat = categories.find(cat => cat.name === mainCategoryName);

    if (mainCat && mainCat.subcategories) {
        mainCat.subcategories = mainCat.subcategories.filter(sub => sub !== subCategoryName);
        const ref = doc(db, 'references', appState.currentUser.uid);
        await updateDoc(ref, { [key]: categories });
    }
}

async function deleteReferenceItem(key, value) {
    const confirmed = await showNotification({title: "Slet Reference", message: `Er du sikker på du vil slette "${value}"?`, type: 'confirm'});
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
}

function toggleEditMode(itemElement, isEditing) {
    const nameSpan = itemElement.querySelector('.reference-name, .category-header > .reference-name');
    const actionsDiv = itemElement.querySelector('.reference-actions');

    if (isEditing) {
        const originalValue = itemElement.dataset.value;
        nameSpan.style.display = 'none';

        const editContainer = document.createElement('div');
        editContainer.className = 'edit-container';
        editContainer.innerHTML = `
            <input type="text" class="edit-reference-input" value="${originalValue}">
            <div class="edit-actions">
                <button class="btn-icon save-reference-item" title="Gem"><i class="fas fa-check"></i></button>
                <button class="btn-icon cancel-edit-reference" title="Annuller"><i class="fas fa-times"></i></button>
            </div>
        `;
        
        actionsDiv.style.display = 'none';
        nameSpan.insertAdjacentElement('afterend', editContainer);
        editContainer.querySelector('input').focus();

    } else {
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
}
