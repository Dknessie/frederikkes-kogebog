// js/inventory.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';

let appState;
let appElements;

// Lokal state for den nye Ingrediens-bibliotek side
let libraryState = {
    searchTerm: '',
    selectedCategory: '',
    sortBy: 'name', // 'name', 'price', 'calories'
    sortOrder: 'asc' // 'asc', 'desc'
};

/**
 * OPDATERET: Initialiserer det nye Ingrediens-bibliotek modul.
 * @param {object} state - Den centrale state for applikationen.
 * @param {object} elements - Cachede DOM-elementer.
 */
export function initIngredientLibrary(state, elements) {
    appState = state;
    appElements = elements;

    // Tilslut event listeners til den nye UI
    const page = document.getElementById('inventory');
    if(page) {
        page.addEventListener('click', handlePageClick);
        page.addEventListener('input', handlePageInput);
        page.addEventListener('change', handlePageChange);
    }
    
    // Tilslut modal formen
    if (appElements.ingredientForm) {
        appElements.ingredientForm.addEventListener('submit', handleSaveIngredient);
    }
    const deleteBtn = document.getElementById('delete-ingredient-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', handleDeleteIngredient);
    }

    const mainCategorySelectModal = document.getElementById('ingredient-info-main-category');
    if (mainCategorySelectModal) {
        mainCategorySelectModal.addEventListener('change', () => {
            populateSubCategoryDropdown(document.getElementById('ingredient-info-sub-category'), mainCategorySelectModal.value);
        });
    }
}

/**
 * OPDATERET: Renderer hele Ingrediens-bibliotek siden.
 */
export function renderIngredientLibrary() {
    const container = document.getElementById('ingredient-library-container');
    if (!container) return;

    // Filtrering
    let filteredItems = [...(appState.ingredientInfo || [])];
    if (libraryState.searchTerm) {
        filteredItems = filteredItems.filter(item => item.name.toLowerCase().includes(libraryState.searchTerm));
    }
    if (libraryState.selectedCategory) {
        filteredItems = filteredItems.filter(item => item.mainCategory === libraryState.selectedCategory);
    }

    // Sortering
    filteredItems.sort((a, b) => {
        let valA = a[libraryState.sortBy] || 0;
        let valB = b[libraryState.sortBy] || 0;
        if (libraryState.sortBy === 'name') {
            valA = a.name.toLowerCase();
            valB = b.name.toLowerCase();
        }
        
        if (valA < valB) return libraryState.sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return libraryState.sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    const tableRows = filteredItems.map(createIngredientRowHTML).join('');

    container.innerHTML = `
        <table class="spreadsheet-table">
            <thead>
                <tr>
                    <th data-sort="name">Vare ${getSortIcon('name')}</th>
                    <th>Kategori</th>
                    <th data-sort="averagePrice" class="currency">Pris pr. Enhed ${getSortIcon('averagePrice')}</th>
                    <th data-sort="caloriesPer100g" class="currency">Kalorier pr. 100g ${getSortIcon('caloriesPer100g')}</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${tableRows || `<tr><td colspan="5" class="empty-state">Ingen ingredienser fundet.</td></tr>`}
            </tbody>
        </table>
    `;
}

function getSortIcon(column) {
    if (libraryState.sortBy !== column) return '';
    return libraryState.sortOrder === 'asc' ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>';
}

function createIngredientRowHTML(item) {
    const priceText = item.averagePrice ? `${item.averagePrice.toFixed(2).replace('.', ',')} kr.` : 'N/A';
    const unitText = item.defaultUnit ? `pr. ${item.defaultUnit}` : '';
    const caloriesText = item.caloriesPer100g ? `${item.caloriesPer100g}` : 'N/A';

    return `
        <tr data-id="${item.id}">
            <td>${item.name}</td>
            <td>${item.subCategory || item.mainCategory}</td>
            <td class="currency">${priceText} <small>${unitText}</small></td>
            <td class="currency">${caloriesText}</td>
            <td>
                <button class="btn-icon btn-small edit-ingredient-btn" title="Rediger"><i class="fas fa-edit"></i></button>
            </td>
        </tr>
    `;
}

// ----- EVENT HANDLERS -----

function handlePageClick(e) {
    if (e.target.closest('#add-ingredient-btn')) {
        openIngredientModal(null);
    }
    if (e.target.closest('.edit-ingredient-btn')) {
        const itemId = e.target.closest('tr').dataset.id;
        openIngredientModal(itemId);
    }
    if (e.target.closest('th[data-sort]')) {
        const newSortBy = e.target.closest('th').dataset.sort;
        if (libraryState.sortBy === newSortBy) {
            libraryState.sortOrder = libraryState.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            libraryState.sortBy = newSortBy;
            libraryState.sortOrder = 'asc';
        }
        renderIngredientLibrary();
    }
}

function handlePageInput(e) {
    if (e.target.id === 'library-search') {
        libraryState.searchTerm = e.target.value.toLowerCase();
        renderIngredientLibrary();
    }
}

function handlePageChange(e) {
    if (e.target.id === 'library-category-filter') {
        libraryState.selectedCategory = e.target.value;
        renderIngredientLibrary();
    }
}

// ----- MODAL FUNKTIONER -----

function openIngredientModal(itemId) {
    const form = appElements.ingredientForm;
    form.reset();
    
    const item = itemId ? appState.ingredientInfo.find(i => i.id === itemId) : null;
    appElements.ingredientModalTitle.textContent = item ? `Rediger ${item.name}` : 'Opret Ny Ingrediens';
    
    document.getElementById('ingredient-info-id').value = item ? item.id : '';
    document.getElementById('ingredient-info-name').value = item ? item.name : '';
    document.getElementById('ingredient-info-default-unit').value = item ? item.defaultUnit : 'g';
    document.getElementById('ingredient-info-price').value = item ? item.averagePrice || '' : '';
    document.getElementById('ingredient-info-calories').value = item ? item.caloriesPer100g || '' : '';
    
    document.getElementById('delete-ingredient-btn').classList.toggle('hidden', !item);
    
    populateMainCategoryDropdown(document.getElementById('ingredient-info-main-category'), item?.mainCategory);
    populateSubCategoryDropdown(document.getElementById('ingredient-info-sub-category'), item?.mainCategory, item?.subCategory);
    
    appElements.ingredientModal.classList.remove('hidden');
}

async function handleSaveIngredient(e) {
    e.preventDefault();
    const itemId = document.getElementById('ingredient-info-id').value;
    
    const itemData = {
        name: document.getElementById('ingredient-info-name').value.trim(),
        mainCategory: document.getElementById('ingredient-info-main-category').value,
        subCategory: document.getElementById('ingredient-info-sub-category').value,
        defaultUnit: document.getElementById('ingredient-info-default-unit').value,
        averagePrice: parseFloat(document.getElementById('ingredient-info-price').value) || null,
        caloriesPer100g: parseInt(document.getElementById('ingredient-info-calories').value, 10) || null,
        userId: appState.currentUser.uid,
    };

    if (!itemData.name || !itemData.mainCategory || !itemData.subCategory) {
        return handleError({message: "Udfyld venligst alle påkrævede felter (Navn, Kategorier)."}, "Ufuldstændige data");
    }

    try {
        if (itemId) {
            await updateDoc(doc(db, 'ingredient_info', itemId), itemData);
        } else {
            // OPDATERING: Gemmer til den nye collection
            await addDoc(collection(db, 'ingredient_info'), itemData);
        }
        appElements.ingredientModal.classList.add('hidden');
        showNotification({ title: 'Gemt!', message: 'Ingrediensens informationer er gemt.' });
    } catch (error) {
        handleError(error, "Ingrediensen kunne ikke gemmes.");
    }
}

async function handleDeleteIngredient() {
    const itemId = document.getElementById('ingredient-info-id').value;
    if (!itemId) return;
    const confirmed = await showNotification({ type: 'confirm', title: "Slet Ingrediens", message: "Sikker på du vil slette denne ingrediens fra biblioteket?" });
    if (!confirmed) return;

    try {
        // OPDATERING: Sletter fra den nye collection
        await deleteDoc(doc(db, 'ingredient_info', itemId));
        appElements.ingredientModal.classList.add('hidden');
        showNotification({ title: 'Slettet', message: 'Ingrediensen er slettet.' });
    } catch (error) { handleError(error, "Ingrediensen kunne ikke slettes."); }
}

// ----- HJÆLPEFUNKTIONER -----

function populateMainCategoryDropdown(select, val) {
    const mainCategories = (appState.references.itemCategories || []).map(cat => (typeof cat === 'string' ? cat : cat.name));
    populateReferenceDropdown(select, mainCategories, 'Vælg overkategori...', val);
}

function populateSubCategoryDropdown(select, mainCat, val) {
    const allCategories = (appState.references.itemCategories || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
    const mainCatData = allCategories.find(cat => cat.name === mainCat);
    const subCategories = mainCatData ? mainCatData.subcategories : [];
    populateReferenceDropdown(select, subCategories, 'Vælg underkategori...', val);
    select.disabled = !mainCat;
}

function populateReferenceDropdown(select, opts, ph, val) {
    if (!select) return;
    select.innerHTML = `<option value="">${ph}</option>`;
    (opts || []).sort().forEach(opt => select.add(new Option(opt, opt)));
    select.value = val || "";
}
