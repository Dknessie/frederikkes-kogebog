// js/inventory.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { normalizeUnit } from './utils.js';

let appState;
let appElements;

// Lokal state for den nye Ingrediens-bibliotek side
let libraryState = {
    searchTerm: '',
    selectedCategory: '',
    sortBy: 'name', // 'name', 'price', 'calories'
    sortOrder: 'asc', // 'asc', 'desc'
    currentView: 'grid' // 'grid' or 'list'
};

/**
 * Initialiserer det nye Ingrediens-bibliotek modul.
 * @param {object} state - Den centrale state for applikationen.
 * @param {object} elements - Cachede DOM-elementer.
 */
export function initIngredientLibrary(state, elements) {
    appState = state;
    appElements = elements;

    const page = document.getElementById('inventory');
    if(page) {
        page.addEventListener('click', handlePageClick);
        page.addEventListener('input', handlePageInput);
        page.addEventListener('change', handlePageChange);
    }
    
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

    const assistantForm = document.getElementById('ingredient-assistant-form');
    if(assistantForm) {
        assistantForm.addEventListener('submit', handleBulkSaveFromAssistant);
    }
    
    // NYT: Event listener for tekst import
    if(appElements.textImportForm) {
        appElements.textImportForm.addEventListener('submit', handleTextImportSubmit);
    }
}

/**
 * Renderer hele Ingrediens-bibliotek siden.
 */
export function renderIngredientLibrary() {
    // Opdater filter-dropdown, før vi renderer indholdet
    populateCategoryFilter();

    const gridContainer = document.getElementById('ingredient-grid-container');
    const listContainer = document.getElementById('ingredient-library-container').parentElement; // table-wrapper

    if (!gridContainer || !listContainer) return;

    if (libraryState.currentView === 'grid') {
        gridContainer.classList.remove('hidden');
        listContainer.classList.add('hidden');
        renderGridView(gridContainer);
    } else {
        gridContainer.classList.add('hidden');
        listContainer.classList.remove('hidden');
        renderListView(document.getElementById('ingredient-library-container'));
    }
}

function getFilteredAndSortedIngredients() {
    let items = [...(appState.ingredientInfo || [])];
    if (libraryState.searchTerm) {
        items = items.filter(item => item.name.toLowerCase().includes(libraryState.searchTerm));
    }
    if (libraryState.selectedCategory) {
        items = items.filter(item => item.mainCategory === libraryState.selectedCategory);
    }

    items.sort((a, b) => {
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

    return items;
}

function renderGridView(container) {
    const items = getFilteredAndSortedIngredients();
    container.innerHTML = items.length > 0 
        ? items.map(createIngredientCardHTML).join('')
        : `<p class="empty-state" style="grid-column: 1 / -1;">Ingen ingredienser fundet.</p>`;
}

function renderListView(container) {
    const items = getFilteredAndSortedIngredients();
    const tableRows = items.map(createIngredientRowHTML).join('');
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

function createIngredientCardHTML(item) {
    const price = item.averagePrice && item.defaultUnit ? `${(item.averagePrice * (item.defaultUnit === 'stk' ? 1 : 1000)).toFixed(2)} kr/${item.defaultUnit === 'stk' ? 'stk' : (item.defaultUnit === 'ml' ? 'l' : 'kg')}` : 'Pris ukendt';
    const calories = item.caloriesPer100g ? `${item.caloriesPer100g} kcal` : 'N/A';
    
    return `
        <div class="recipe-list-card ingredient-card" data-id="${item.id}">
            <div class="list-card-content">
                <h4>${item.name}</h4>
                <span class="list-card-category">${item.subCategory}</span>
                <div class="ingredient-card-info">
                    <span><i class="fas fa-coins"></i> ${price}</span>
                    <span><i class="fas fa-fire-alt"></i> ${calories}</span>
                </div>
            </div>
        </div>
    `;
}

function getSortIcon(column) {
    if (libraryState.sortBy !== column) return '';
    return libraryState.sortOrder === 'asc' ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>';
}

function createIngredientRowHTML(item) {
    const priceText = item.averagePrice ? `${(item.averagePrice * (item.defaultUnit === 'stk' ? 1 : 1000)).toFixed(2).replace('.', ',')} kr.` : 'N/A';
    const unitText = item.defaultUnit ? `pr. ${item.defaultUnit === 'stk' ? 'stk' : (item.defaultUnit === 'ml' ? 'l' : 'kg')}` : '';
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
    // NYT: Håndterer klik på tekst-import knap
    if (e.target.closest('#text-import-btn')) {
        appElements.textImportModal.classList.remove('hidden');
    }
    if (e.target.closest('.edit-ingredient-btn') || e.target.closest('.ingredient-card')) {
        const itemId = e.target.closest('[data-id]').dataset.id;
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
    if (e.target.closest('#view-grid-btn')) {
        libraryState.currentView = 'grid';
        document.getElementById('view-grid-btn').classList.add('active');
        document.getElementById('view-list-btn').classList.remove('active');
        renderIngredientLibrary();
    }
    if (e.target.closest('#view-list-btn')) {
        libraryState.currentView = 'list';
        document.getElementById('view-grid-btn').classList.remove('active');
        document.getElementById('view-list-btn').classList.add('active');
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
    
    let displayPrice = '';
    if (item && item.averagePrice) {
        displayPrice = item.defaultUnit === 'stk' ? item.averagePrice : item.averagePrice * 1000;
    }
    document.getElementById('ingredient-info-price').value = displayPrice;
    document.getElementById('ingredient-info-default-unit').value = item ? item.defaultUnit : 'g';
    document.getElementById('ingredient-info-calories').value = item ? item.caloriesPer100g || '' : '';
    
    document.getElementById('delete-ingredient-btn').classList.toggle('hidden', !item);
    
    populateMainCategoryDropdown(document.getElementById('ingredient-info-main-category'), item?.mainCategory);
    populateSubCategoryDropdown(document.getElementById('ingredient-info-sub-category'), item?.mainCategory, item?.subCategory);
    
    appElements.ingredientModal.classList.remove('hidden');
}

async function handleSaveIngredient(e) {
    e.preventDefault();
    const itemId = document.getElementById('ingredient-info-id').value;
    
    const priceInput = parseFloat(document.getElementById('ingredient-info-price').value) || null;
    const priceUnit = document.getElementById('ingredient-info-default-unit').value;
    let averagePrice = priceInput;

    if (priceInput && (priceUnit === 'g' || priceUnit === 'ml')) {
        averagePrice = priceInput / 1000;
    }
    
    const itemData = {
        name: document.getElementById('ingredient-info-name').value.trim(),
        mainCategory: document.getElementById('ingredient-info-main-category').value,
        subCategory: document.getElementById('ingredient-info-sub-category').value,
        defaultUnit: priceUnit,
        averagePrice: averagePrice,
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
        await deleteDoc(doc(db, 'ingredient_info', itemId));
        appElements.ingredientModal.classList.add('hidden');
        showNotification({ title: 'Slettet', message: 'Ingrediensen er slettet.' });
    } catch (error) { handleError(error, "Ingrediensen kunne ikke slettes."); }
}

async function handleBulkSaveFromAssistant(e) {
    e.preventDefault();
    const listContainer = document.getElementById('ingredient-assistant-list');
    const rows = listContainer.querySelectorAll('.assistant-item-row');
    const batch = writeBatch(db);
    const ingredientsCol = collection(db, "ingredient_info");
    let itemsAddedCount = 0;

    rows.forEach(row => {
        const name = row.dataset.name;
        const mainCategory = row.querySelector('.assistant-main-cat').value;
        const subCategory = row.querySelector('.assistant-sub-cat').value;
        
        if (name && mainCategory && subCategory) {
            const priceInput = parseFloat(row.querySelector('.assistant-price').value) || null;
            const priceUnit = row.querySelector('.assistant-unit').value;
            let averagePrice = priceInput;
            if (priceInput && (priceUnit === 'g' || priceUnit === 'ml')) {
                averagePrice = priceInput / 1000;
            }

            const ingredientData = {
                name: name,
                mainCategory: mainCategory,
                subCategory: subCategory,
                defaultUnit: priceUnit,
                averagePrice: averagePrice,
                caloriesPer100g: parseInt(row.querySelector('.assistant-calories').value, 10) || null,
                userId: appState.currentUser.uid,
            };
            
            const docRef = doc(ingredientsCol);
            batch.set(docRef, ingredientData);
            itemsAddedCount++;
        }
    });

    if (itemsAddedCount > 0) {
        try {
            await batch.commit();
            document.getElementById('ingredient-assistant-modal').classList.add('hidden');
            showNotification({title: "Succes!", message: `${itemsAddedCount} nye ingredienser er blevet tilføjet til dit bibliotek.`});
        } catch (error) {
            handleError(error, "Kunne ikke gemme de nye ingredienser.");
        }
    } else {
        document.getElementById('ingredient-assistant-modal').classList.add('hidden');
    }
}

// ----- NY TEKST IMPORT LOGIK -----

/**
 * Håndterer indsendelsen af tekst-import formularen.
 * @param {Event} e Form-submit eventet.
 */
async function handleTextImportSubmit(e) {
    e.preventDefault();
    const textarea = document.getElementById('text-import-textarea');
    const text = textarea.value;
    if (!text.trim()) return;

    const parsedIngredients = parseIngredientText(text);
    if (parsedIngredients.length === 0) {
        showNotification({title: "Intet at importere", message: "Kunne ikke finde gyldige ingredienser i den angivne tekst."});
        return;
    }

    const batch = writeBatch(db);
    const ingredientsCol = collection(db, "ingredient_info");
    const existingNames = new Set(appState.ingredientInfo.map(i => i.name.toLowerCase()));
    let newIngredientsCount = 0;
    let skippedCount = 0;

    for (const item of parsedIngredients) {
        if (existingNames.has(item.name.toLowerCase())) {
            skippedCount++;
            continue;
        }

        let averagePrice = item.priceInput;
        if (item.priceInput && (item.priceUnitForInput === 'kg' || item.priceUnitForInput === 'l')) {
            averagePrice = item.priceInput / 1000;
        }

        const finalData = {
            name: item.name,
            mainCategory: item.mainCategory,
            subCategory: item.subCategory,
            defaultUnit: normalizeUnit(item.defaultUnit),
            averagePrice: averagePrice,
            caloriesPer100g: item.caloriesPer100g,
            userId: appState.currentUser.uid,
        };

        if (finalData.name && finalData.mainCategory && finalData.subCategory && finalData.defaultUnit) {
            const docRef = doc(ingredientsCol);
            batch.set(docRef, finalData);
            newIngredientsCount++;
            existingNames.add(finalData.name.toLowerCase());
        } else {
            console.warn("Skipping invalid item from import:", item);
        }
    }

    try {
        await batch.commit();
        appElements.textImportModal.classList.add('hidden');
        textarea.value = '';
        let message = `${newIngredientsCount} ny${newIngredientsCount === 1 ? '' : 'e'} ingrediens${newIngredientsCount === 1 ? '' : 'er'} blev tilføjet.`;
        if (skippedCount > 0) {
            message += ` ${skippedCount} blev sprunget over, da de allerede fandtes.`;
        }
        showNotification({title: "Import Fuldført!", message: message});
    } catch (error) {
        handleError(error, "Der opstod en fejl under importen.");
    }
}

/**
 * Parser den rå tekst fra import-modalen til et array af ingrediens-objekter.
 * @param {string} text Den rå tekst.
 * @returns {Array<object>} Et array af parsede ingrediens-objekter.
 */
function parseIngredientText(text) {
    const ingredients = [];
    const blocks = text.trim().split(/\n\s*\n/); // Split by one or more empty lines

    for (const block of blocks) {
        const lines = block.split('\n');
        const ingredient = {};
        for (const line of lines) {
            const parts = line.split(/:\s*/); // Split by colon and optional whitespace
            if (parts.length < 2) continue;
            
            const key = parts[0].trim().toLowerCase();
            const value = parts.slice(1).join(':').trim();

            if (key.startsWith('pris/')) {
                ingredient.priceInput = parseFloat(value.replace(',', '.')) || null;
                if (key.includes('kg')) ingredient.priceUnitForInput = 'kg';
                else if (key.includes('l')) ingredient.priceUnitForInput = 'l';
                else if (key.includes('stk')) ingredient.priceUnitForInput = 'stk';
            } else if (key === 'kalorier/100g/ml') {
                ingredient.caloriesPer100g = parseInt(value, 10) || null;
            } else {
                const keyMap = {
                    'navn': 'name',
                    'overkategori': 'mainCategory',
                    'underkategori': 'subCategory',
                    'prisenhed': 'defaultUnit'
                };
                if (keyMap[key]) {
                    ingredient[keyMap[key]] = value;
                }
            }
        }
        if (ingredient.name) {
             ingredients.push(ingredient);
        }
    }
    return ingredients;
}

// ----- HJÆLPEFUNKTIONER -----

function populateCategoryFilter() {
    const select = document.getElementById('library-category-filter');
    if (!select) return;
    const mainCategories = [...new Set((appState.references.itemCategories || []).map(cat => (typeof cat === 'string' ? cat : cat.name)))];
    const currentValue = select.value;
    select.innerHTML = '<option value="">Alle Kategorier</option>';
    mainCategories.sort().forEach(cat => select.add(new Option(cat, cat)));
    select.value = currentValue;
}

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
