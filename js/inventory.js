// js/inventory.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { normalizeUnit, getRecipeUsedUnitsForIngredient } from './utils.js'; // Importerer den nye hjælpefunktion

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
    
    if(appElements.textImportForm) {
        appElements.textImportForm.addEventListener('submit', handleTextImportSubmit);
    }
}

/**
 * Renderer hele Ingrediens-bibliotek siden.
 */
export function renderIngredientLibrary() {
    populateCategoryFilter();

    const gridContainer = document.getElementById('ingredient-grid-container');
    const listContainer = document.getElementById('ingredient-library-container').parentElement; 

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
                    <th data-sort="priceTo" class="currency">Pris pr. Enhed ${getSortIcon('priceTo')}</th>
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
    let priceText = 'Pris ukendt';
    if (item.priceTo) {
        const unitLabel = item.defaultUnit === 'stk' ? 'stk' : (item.defaultUnit === 'ml' ? 'l' : 'kg');
        const priceToDisplay = item.priceTo * (item.defaultUnit === 'stk' ? 1 : 1); // Prisen er nu gemt per g/ml/stk, så ingen *1000 her
        if (item.priceFrom && item.priceFrom !== item.priceTo) {
            const priceFromDisplay = item.priceFrom * (item.defaultUnit === 'stk' ? 1 : 1);
            priceText = `${priceFromDisplay.toFixed(2)} - ${priceToDisplay.toFixed(2)} kr/${unitLabel}`;
        } else {
            priceText = `${priceToDisplay.toFixed(2)} kr/${unitLabel}`;
        }
    }
    const calories = item.caloriesPer100g ? `${item.caloriesPer100g} kcal` : 'N/A';
    
    return `
        <div class="recipe-list-card ingredient-card" data-id="${item.id}">
            <div class="list-card-content">
                <h4>${item.name}</h4>
                <span class="list-card-category">${item.subCategory}</span>
                <div class="ingredient-card-info">
                    <span><i class="fas fa-coins"></i> ${priceText}</span>
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
    let priceText = 'N/A';
     if (item.priceTo) {
        const unitLabel = `pr. ${item.defaultUnit}`;
        const priceToDisplay = item.priceTo * (item.defaultUnit === 'stk' ? 1 : 1); // Prisen er nu gemt per g/ml/stk, så ingen *1000 her
        if (item.priceFrom && item.priceFrom !== item.priceTo) {
            const priceFromDisplay = item.priceFrom * (item.defaultUnit === 'stk' ? 1 : 1);
            priceText = `${priceFromDisplay.toFixed(2).replace('.', ',')} - ${priceToDisplay.toFixed(2).replace('.', ',')} kr.`;
        } else {
            priceText = `${priceToDisplay.toFixed(2).replace('.', ',')} kr.`;
        }
         priceText += ` <small>${unitLabel}</small>`;
    }

    const caloriesText = item.caloriesPer100g ? `${item.caloriesPer100g}` : 'N/A';

    return `
        <tr data-id="${item.id}">
            <td>${item.name}</td>
            <td>${item.subCategory || item.mainCategory}</td>
            <td class="currency">${priceText}</td>
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
    document.getElementById('ingredient-info-aliases').value = item?.aliases?.join(', ') || '';
    
    // Udfyld nye prisfelter
    let priceFrom = '';
    let priceTo = '';
    if (item) {
        // Prisen er nu gemt per g/ml/stk, så ingen *1000 her
        if (item.priceFrom) priceFrom = item.priceFrom;
        if (item.priceTo) priceTo = item.priceTo;
    }
    document.getElementById('ingredient-info-price-from').value = priceFrom;
    document.getElementById('ingredient-info-price-to').value = priceTo;

    document.getElementById('ingredient-info-default-unit').value = item ? item.defaultUnit : 'g';
    document.getElementById('ingredient-info-calories').value = item ? item.caloriesPer100g || '' : '';
    
    document.getElementById('delete-ingredient-btn').classList.toggle('hidden', !item);
    
    populateMainCategoryDropdown(document.getElementById('ingredient-info-main-category'), item?.mainCategory);
    populateSubCategoryDropdown(document.getElementById('ingredient-info-sub-category'), item?.mainCategory, item?.subCategory);
    
    populateSubstituteForDropdown(document.getElementById('ingredient-info-substitute-for'), item?.substituteFor, itemId);

    // NY LOGIK: Håndtering af enhedskonverteringer
    const unitConversionsContainer = document.getElementById('unit-conversions-container');
    unitConversionsContainer.innerHTML = ''; // Ryd tidligere felter

    if (item) {
        const ingredientName = item.name;
        const usedUnitsInRecipes = getRecipeUsedUnitsForIngredient(ingredientName, appState.recipes);
        const existingConversions = item.unitConversions || {};

        const unitsToDefine = new Set();

        // Tilføj alle enheder fra opskrifter, der ikke allerede har en konvertering
        usedUnitsInRecipes.forEach(unit => {
            if (!existingConversions[unit]) {
                unitsToDefine.add(unit);
            }
        });

        // Tilføj også eksisterende konverteringer, så de kan redigeres
        for (const unit in existingConversions) {
            unitsToDefine.add(unit);
        }

        // Generer inputfelter for hver enhed
        unitsToDefine.forEach(unit => {
            if (unit === 'g' || unit === 'ml' || unit === 'kg' || unit === 'l' || unit === 'spsk' || unit === 'tsk') return; // Filtrer ud standardenheder som kan konverteres direkte i utils
            const currentValue = existingConversions[unit] || '';
            const unitRow = document.createElement('div');
            unitRow.className = 'input-group unit-conversion-row';
            unitRow.innerHTML = `
                <label for="unit-conversion-${unit}">1 ${unit} svarer til (gram)</label>
                <input type="number" id="unit-conversion-${unit}" data-unit="${unit}" step="any" placeholder="F.eks. 50" value="${currentValue}">
            `;
            unitConversionsContainer.appendChild(unitRow);
        });
    }

    appElements.ingredientModal.classList.remove('hidden');
}

function populateSubstituteForDropdown(selectElement, currentValue, currentItemId) {
    if (!selectElement) return;
    const options = (appState.ingredientInfo || [])
        .filter(item => item.id !== currentItemId) 
        .map(item => item.name)
        .sort((a, b) => a.localeCompare(b));
    
    populateReferenceDropdown(selectElement, options, 'Vælg generisk type...', currentValue);
}


async function handleSaveIngredient(e) {
    e.preventDefault();
    const itemId = document.getElementById('ingredient-info-id').value;
    
    const priceFromInput = parseFloat(document.getElementById('ingredient-info-price-from').value) || null;
    const priceToInput = parseFloat(document.getElementById('ingredient-info-price-to').value) || null;
    const priceUnit = document.getElementById('ingredient-info-default-unit').value;
    // Ingen multiplier her, da prisen gemmes direkte pr. defaultUnit (g/ml/stk)
    // const multiplier = (priceUnit === 'g' || priceUnit === 'ml') ? 1000 : 1;

    const aliases = document.getElementById('ingredient-info-aliases').value
        .split(',')
        .map(alias => alias.trim().toLowerCase())
        .filter(alias => alias.length > 0);
    
    // NY LOGIK: Læs enhedskonverteringer fra de dynamisk genererede felter
    const unitConversions = {};
    document.querySelectorAll('#unit-conversions-container .unit-conversion-row input').forEach(input => {
        const unit = input.dataset.unit;
        const value = parseFloat(input.value);
        if (unit && !isNaN(value) && value > 0) {
            unitConversions[unit] = value;
        }
    });

    const itemData = {
        name: document.getElementById('ingredient-info-name').value.trim(),
        substituteFor: document.getElementById('ingredient-info-substitute-for').value || null,
        aliases: aliases,
        mainCategory: document.getElementById('ingredient-info-main-category').value,
        subCategory: document.getElementById('ingredient-info-sub-category').value,
        defaultUnit: priceUnit,
        priceFrom: priceFromInput, // Gemmes direkte
        priceTo: priceToInput,     // Gemmes direkte
        caloriesPer100g: parseInt(document.getElementById('ingredient-info-calories').value, 10) || null,
        unitConversions: unitConversions, // Gem de nye konverteringer
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
        const mainCategory = row.querySelector('.assistant-main-cat').value || 'Ukategoriseret';
        const subCategory = row.querySelector('.assistant-sub-cat').value || 'Ukategoriseret';
        
        if (name) {
            const priceInput = parseFloat(row.querySelector('.assistant-price').value) || null;
            const priceUnit = row.querySelector('.assistant-unit').value; // Denne enhed er for input, ikke standard gemme enhed for pris
            // Ingen multiplier her, da prisen gemmes direkte pr. g/ml/stk

            const ingredientData = {
                name: name,
                aliases: [],
                mainCategory: mainCategory,
                subCategory: subCategory,
                defaultUnit: priceUnit, // Vi antager, at assistenten altid gemmer pris pr. denne enhed
                priceFrom: null,
                priceTo: priceInput,
                caloriesPer100g: parseInt(row.querySelector('.assistant-calories').value, 10) || null,
                unitConversions: {}, // Nye ingredienser har ingen konverteringer initialt
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
        showNotification({title: "Ingen handling", message: "Der var ingen ingredienser at tilføje."});
        document.getElementById('ingredient-assistant-modal').classList.add('hidden');
    }
}


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
    
    const nameToIdMap = new Map();
    const aliasToCanonicalNameMap = new Map();
    appState.ingredientInfo.forEach(item => {
        nameToIdMap.set(item.name.toLowerCase(), item.id);
        if (item.aliases) {
            item.aliases.forEach(alias => {
                aliasToCanonicalNameMap.set(alias.toLowerCase(), item.name);
            });
        }
    });

    let newCount = 0;
    let updatedCount = 0;
    const skippedItems = [];

    for (const item of parsedIngredients) {
        const itemNameLower = item.name.toLowerCase();

        const conflictingCanonicalName = aliasToCanonicalNameMap.get(itemNameLower);
        if (conflictingCanonicalName && conflictingCanonicalName.toLowerCase() !== itemNameLower) {
            skippedItems.push(`'${item.name}' blev sprunget over, da det er et alias for '${conflictingCanonicalName}'.`);
            continue;
        }

        // Ingen multiplier her, da prisen gemmes direkte pr. defaultUnit
        // const multiplier = (item.defaultUnit === 'g' || item.defaultUnit === 'ml') ? 1000 : 1;

        const finalData = {
            name: item.name,
            mainCategory: item.mainCategory,
            subCategory: item.subCategory,
            defaultUnit: normalizeUnit(item.defaultUnit),
            aliases: item.aliases || [],
            priceFrom: null,
            priceTo: item.priceInput,
            caloriesPer100g: item.caloriesPer100g || null,
            unitConversions: {}, // Tekstimport opretter ikke konverteringer
            userId: appState.currentUser.uid,
        };

        if (nameToIdMap.has(itemNameLower)) {
            const docId = nameToIdMap.get(itemNameLower);
            const docRef = doc(db, "ingredient_info", docId);
            batch.update(docRef, finalData);
            updatedCount++;
        } else {
            const docRef = doc(ingredientsCol);
            batch.set(docRef, finalData);
            newCount++;
        }
    }

    try {
        if (newCount > 0 || updatedCount > 0) {
            await batch.commit();
        }
        appElements.textImportModal.classList.add('hidden');
        textarea.value = '';
        
        let message = '';
        if (newCount > 0) message += `${newCount} ny${newCount === 1 ? '' : 'e'} ingrediens${newCount === 1 ? '' : 'er'} blev oprettet.<br>`;
        if (updatedCount > 0) message += `${updatedCount} eksisterende ingrediens${updatedCount === 1 ? '' : 'er'} blev opdateret.<br>`;
        if (skippedItems.length > 0) {
            message += `<br><b>Følgende blev sprunget over:</b><br>${skippedItems.join('<br>')}`;
        }
        if (message === '') message = "Ingen ændringer foretaget. Ingredienserne fandtes muligvis allerede eller var i konflikt.";
        
        showNotification({title: "Import Fuldført!", message: message});
    } catch (error) {
        handleError(error, "Der opstod en fejl under importen.");
    }
}


function parseIngredientText(text) {
    const ingredients = [];
    const blocks = text.trim().split(/\n\s*\n/); 

    for (const block of blocks) {
        const lines = block.split('\n');
        const ingredient = {};
        for (const line of lines) {
            const parts = line.split(/:\s*/); 
            if (parts.length < 2) continue;
            
            const key = parts[0].trim().toLowerCase();
            const value = parts.slice(1).join(':').trim();

            // OPDATERING: Pris-input gemmes direkte, ikke divideres med multiplier her
            if (key.startsWith('pris/')) {
                ingredient.priceInput = parseFloat(value.replace(',', '.')) || null;
                if (key.includes('kg')) ingredient.defaultUnit = 'kg'; // Antager pris pr. kg som defaultUnit
                else if (key.includes('l')) ingredient.defaultUnit = 'l'; // Antager pris pr. l som defaultUnit
                else if (key.includes('stk')) ingredient.defaultUnit = 'stk'; // Antager pris pr. stk som defaultUnit
                else if (key.includes('g')) ingredient.defaultUnit = 'g'; // Antager pris pr. g som defaultUnit
                else if (key.includes('ml')) ingredient.defaultUnit = 'ml'; // Antager pris pr. ml som defaultUnit
            } else if (key === 'kalorier/100g/ml') {
                ingredient.caloriesPer100g = parseInt(value, 10) || null;
            } else {
                const keyMap = {
                    'navn': 'name',
                    'alias': 'aliases',
                    'aliaser': 'aliases',
                    'overkategori': 'mainCategory',
                    'underkategori': 'subCategory',
                    'prisenhed': 'defaultUnit' // Prisenhed for input. Denne bliver til defaultUnit for pris.
                };
                if (keyMap[key]) {
                    if (key === 'alias' || key === 'aliaser') {
                        ingredient[keyMap[key]] = value.split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
                    } else {
                        ingredient[keyMap[key]] = value;
                    }
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
