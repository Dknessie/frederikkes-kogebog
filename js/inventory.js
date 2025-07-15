// js/inventory.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { debounce } from './utils.js';

let appState;
let appElements;
let inventoryState = {
    searchTerm: '',
    referencesLoaded: false,
    selectedCategory: '', // Nyt: valgt kategori filter
    selectedLocation: '', // Nyt: valgt placering filter
    selectedStore: ''     // Nyt: valgt butik filter
};

export function initInventory(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        masterProductModal: document.getElementById('master-product-modal'),
        masterProductForm: document.getElementById('master-product-form'),
        masterProductModalTitle: document.getElementById('master-product-modal-title'),
        addVariantFormBtn: document.getElementById('add-variant-form-btn'),
        variantFormContainer: document.getElementById('variant-form-container'),
        deleteMasterProductBtn: document.getElementById('delete-master-product-btn'),
        conversionRulesContainer: document.getElementById('conversion-rules-container'),
        addConversionRuleBtn: document.getElementById('add-conversion-rule-btn'),
        gemBotImportBtn: document.getElementById('gem-bot-import-btn'),
        gemBotImportTextarea: document.getElementById('gem-bot-import-textarea'),
        inventoryFilterCategory: document.getElementById('inventory-filter-category'), // Nyt element
        inventoryFilterLocation: document.getElementById('inventory-filter-location'), // Nyt element
        inventoryFilterStore: document.getElementById('inventory-filter-store'),       // Nyt element
        clearInventoryFiltersBtn: document.getElementById('clear-inventory-filters-btn'), // Nyt element
        variantEditModal: document.getElementById('variant-edit-modal'), // Nyt: Modal til variantredigering
        variantEditForm: document.getElementById('variant-edit-form'),   // Nyt: Form til variantredigering
    };

    appElements.addInventoryItemBtn.addEventListener('click', () => openMasterProductModal(null));
    appElements.masterProductForm.addEventListener('submit', handleSaveMasterProduct);
    appElements.addVariantFormBtn.addEventListener('click', () => addVariantRow());
    appElements.gemBotImportBtn.addEventListener('click', handleGemBotImport);
    
    appElements.variantFormContainer.addEventListener('click', (e) => {
        if (e.target.closest('.delete-variant-row-btn')) {
            e.target.closest('.variant-form-row').remove();
        }
    });

    appElements.deleteMasterProductBtn.addEventListener('click', handleDeleteMasterProduct);
    appElements.addConversionRuleBtn.addEventListener('click', () => addConversionRuleRow());
    appElements.conversionRulesContainer.addEventListener('click', e => {
        if (e.target.closest('.delete-rule-btn')) {
            e.target.closest('.conversion-rule-row').remove();
        }
    });

    // Event listeners for filters
    appElements.inventorySearchInput.addEventListener('input', debounce(e => {
        inventoryState.searchTerm = e.target.value.toLowerCase();
        renderInventory();
    }, 300));

    appElements.inventoryFilterCategory.addEventListener('change', (e) => {
        inventoryState.selectedCategory = e.target.value;
        renderInventory();
    });
    appElements.inventoryFilterLocation.addEventListener('change', (e) => {
        inventoryState.selectedLocation = e.target.value;
        renderInventory();
    });
    appElements.inventoryFilterStore.addEventListener('change', (e) => {
        inventoryState.selectedStore = e.target.value;
        renderInventory();
    });
    appElements.clearInventoryFiltersBtn.addEventListener('click', () => {
        inventoryState.selectedCategory = '';
        inventoryState.selectedLocation = '';
        inventoryState.selectedStore = '';
        inventoryState.searchTerm = ''; // Ryd også søgefeltet
        appElements.inventoryFilterCategory.value = '';
        appElements.inventoryFilterLocation.value = '';
        appElements.inventoryFilterStore.value = '';
        appElements.inventorySearchInput.value = '';
        renderInventory();
    });


    appElements.inventoryListContainer.addEventListener('click', e => {
        const button = e.target.closest('button');
        const header = e.target.closest('.master-product-header');

        if (button && button.classList.contains('edit-master-btn')) {
            e.stopPropagation();
            openMasterProductModal(button.dataset.id);
        } else if (header) {
            header.parentElement.classList.toggle('is-open');
        } else if (button && button.classList.contains('edit-variant-btn')) { // Nyt: Håndter klik på rediger variant knap
            e.stopPropagation();
            const masterId = button.dataset.masterId;
            const variantId = button.dataset.variantId;
            openVariantEditModal(masterId, variantId);
        }
    });

    // Event listener for at gemme redigeret variant
    appElements.variantEditForm.addEventListener('submit', handleSaveVariant);
}

export function setReferencesLoaded(isLoaded) {
    inventoryState.referencesLoaded = isLoaded;
    if (document.querySelector('#inventory:not(.hidden)')) {
        renderInventory();
    }
}

export function renderInventory() {
    const container = appElements.inventoryListContainer;
    container.innerHTML = '';

    // Populate filter dropdowns
    populateReferenceDropdown(appElements.inventoryFilterCategory, appState.references.itemCategories, 'Alle kategorier', inventoryState.selectedCategory);
    populateReferenceDropdown(appElements.inventoryFilterLocation, appState.references.itemLocations, 'Alle placeringer', inventoryState.selectedLocation);
    populateReferenceDropdown(appElements.inventoryFilterStore, appState.references.stores, 'Alle butikker', inventoryState.selectedStore);


    let masterProducts = [...appState.inventory];

    // Apply filters
    if (inventoryState.selectedCategory) {
        masterProducts = masterProducts.filter(mp => mp.category === inventoryState.selectedCategory);
    }
    if (inventoryState.selectedLocation) {
        masterProducts = masterProducts.filter(mp => mp.location === inventoryState.selectedLocation);
    }
    if (inventoryState.selectedStore) {
        masterProducts = masterProducts.filter(mp => 
            mp.variants && mp.variants.some(v => v.storeId === inventoryState.selectedStore)
        );
    }

    // Apply search term
    if (inventoryState.searchTerm) {
        const term = inventoryState.searchTerm.toLowerCase();
        masterProducts = masterProducts.filter(mp => 
            mp.name.toLowerCase().includes(term) || 
            (mp.variants && mp.variants.some(v => v.variantName.toLowerCase().includes(term)))
        );
    }

    if (masterProducts.length === 0) {
        container.innerHTML = `<p class="empty-state">Ingen varer fundet, der matcher dine filtre.</p>`;
        return;
    }

    masterProducts.sort((a, b) => a.name.localeCompare(b.name));

    const fragment = document.createDocumentFragment();
    masterProducts.forEach(mp => {
        const masterDiv = document.createElement('div');
        masterDiv.className = 'master-product-item';
        
        // Opdateret variantsHTML for at vise Butik, Størrelse og Pris separat
        const variantsHTML = (mp.variants || []).map(v => {
            const storeName = appState.references.stores?.find(s => s === v.storeId) || v.storeId || 'Ukendt butik';
            const sizeDisplay = v.purchaseSize ? `${v.purchaseSize}${mp.defaultUnit}` : '';
            const priceDisplay = v.kgPrice ? `${v.kgPrice.toFixed(2)} kr/${mp.defaultUnit === 'g' ? 'kg' : 'l'}` : ''; // Bruger defaultUnit for kr/kg eller kr/l
            const favoriteIcon = v.isFavoritePurchase ? '<i class="fas fa-star favorite-variant-icon" title="Favoritkøb"></i>' : ''; // Nyt: Favoritindikator
            return `
                <div class="variant-item">
                    <span class="variant-name">${favoriteIcon} ${v.variantName}</span>
                    <span class="variant-store">${storeName}</span>
                    <span class="variant-stock">${v.currentStock || 0} stk.</span>
                    <span class="variant-size">${sizeDisplay}</span>
                    <span class="variant-price">${priceDisplay}</span>
                    <button class="btn-icon edit-variant-btn" data-master-id="${mp.id}" data-variant-id="${v.id}" title="Rediger variant"><i class="fas fa-edit"></i></button>
                </div>
            `;
        }).join('');

        const totalStockDisplay = `${mp.totalStockItems || 0} stk`;

        masterDiv.innerHTML = `
            <div class="master-product-header" data-id="${mp.id}">
                <div class="master-product-info">
                    <h4>${mp.name}</h4>
                    <span class="master-product-category">${mp.category || 'Ukategoriseret'}</span>
                </div>
                <div class="master-product-stock-info">
                    <span>Total lager:</span>
                    <span class="master-product-stock-amount">${totalStockDisplay}</span>
                </div>
                <div class="master-product-actions">
                    <button class="btn-icon edit-master-btn" data-id="${mp.id}" title="Rediger master-produkt og varianter"><i class="fas fa-edit"></i></button>
                    <i class="fas fa-chevron-down expand-icon"></i>
                </div>
            </div>
            <div class="variant-list">
                ${variantsHTML || '<p class="empty-state-small">Ingen varianter oprettet.</p>'}
            </div>
        `;
        fragment.appendChild(masterDiv);
    });

    container.appendChild(fragment);
}

function openMasterProductModal(masterProductId) {
    const form = appElements.masterProductForm;
    form.reset();
    appElements.variantFormContainer.innerHTML = '';
    appElements.conversionRulesContainer.innerHTML = '';
    appElements.gemBotImportTextarea.value = '';
    
    const masterProduct = masterProductId ? appState.inventory.find(p => p.id === masterProductId) : null;

    if (masterProduct) {
        appElements.masterProductModalTitle.textContent = 'Rediger Vare';
        document.getElementById('master-product-id').value = masterProduct.id;
        document.getElementById('master-product-name').value = masterProduct.name;
        document.getElementById('master-product-default-unit').value = masterProduct.defaultUnit;
        appElements.deleteMasterProductBtn.style.display = 'inline-flex';

        // Load existing variants
        (masterProduct.variants || []).forEach(variant => addVariantRow(variant));
        if (masterProduct.conversion_rules) {
            for (const unit in masterProduct.conversion_rules) {
                addConversionRuleRow({ unit, grams: masterProduct.conversion_rules[unit] });
            }
        }
    } else {
        appElements.masterProductModalTitle.textContent = 'Opret Ny Vare';
        document.getElementById('master-product-id').value = '';
        appElements.deleteMasterProductBtn.style.display = 'none';
        addVariantRow(); // Add an empty row for new master product
    }
    
    populateReferenceDropdown(document.getElementById('master-product-category'), appState.references.itemCategories, 'Vælg kategori...');
    populateReferenceDropdown(document.getElementById('master-product-location'), appState.references.itemLocations, 'Vælg placering...');
    
    if(masterProduct) {
        document.getElementById('master-product-category').value = masterProduct.category;
        document.getElementById('master-product-location').value = masterProduct.location;
    }

    appElements.masterProductModal.classList.remove('hidden');
}

function addVariantRow(variant = {}) {
    const container = appElements.variantFormContainer;
    const row = document.createElement('div');
    row.className = 'variant-form-row';
    row.dataset.id = variant.id || ''; // Bevar eksisterende ID for opdatering

    const storeOptions = (appState.references.stores || []).map(s => `<option value="${s}">${s}</option>`).join('');

    row.innerHTML = `
        <div class="input-group">
            <label>Variant Navn</label>
            <input type="text" class="variant-name-input" placeholder="F.eks. 400g bakke" value="${variant.variantName || ''}" required>
        </div>
        <div class="input-group">
            <label>Butik</label>
            <select class="variant-store-select"><option value="">Vælg butik...</option>${storeOptions}</select>
        </div>
        <div class="input-group">
            <label>Lager (stk)</label>
            <input type="number" class="variant-stock-input" value="${variant.currentStock || 0}">
        </div>
        <div class="input-group">
            <label>Størrelse (g/ml)</label>
            <input type="number" class="variant-size-input" placeholder="F.eks. 400" value="${variant.purchaseSize || ''}">
        </div>
        <div class="input-group">
            <label>Pris pr. kg/l</label>
            <input type="number" step="0.01" class="variant-price-input" value="${variant.kgPrice || ''}">
        </div>
        <div class="input-group switch-group">
            <label>Favoritkøb?</label>
            <label class="switch">
                <input type="checkbox" class="variant-favorite-checkbox" ${variant.isFavoritePurchase ? 'checked' : ''}>
                <span class="slider round"></span>
            </label>
        </div>
        <button type="button" class="btn-icon delete-variant-row-btn" title="Slet variant"><i class="fas fa-trash"></i></button>
    `;

    if (variant.storeId) {
        row.querySelector('.variant-store-select').value = variant.storeId;
    }
    container.appendChild(row);
}

function addConversionRuleRow(rule = { unit: '', grams: '' }) {
    const container = appElements.conversionRulesContainer;
    const row = document.createElement('div');
    row.className = 'conversion-rule-row';

    const unitSelect = document.createElement('select');
    unitSelect.className = 'rule-unit-select';
    populateReferenceDropdown(unitSelect, appState.references.standardUnits, 'Vælg enhed', rule.unit);

    row.innerHTML = `
        <div class="input-group">
            <!-- Unit select is inserted here -->
        </div>
        <span>=</span>
        <div class="input-group">
            <input type="number" class="rule-grams-input" placeholder="Gram" value="${rule.grams || ''}">
        </div>
        <span>g</span>
        <button type="button" class="btn-icon delete-rule-btn" title="Fjern regel"><i class="fas fa-trash"></i></button>
    `;
    row.querySelector('.input-group:first-child').appendChild(unitSelect);
    container.appendChild(row);
}

async function handleSaveMasterProduct(e) {
    e.preventDefault();
    const masterId = document.getElementById('master-product-id').value;
    const userId = appState.currentUser.uid;

    const conversionRules = {};
    appElements.conversionRulesContainer.querySelectorAll('.conversion-rule-row').forEach(row => {
        const unit = row.querySelector('.rule-unit-select').value;
        const grams = parseFloat(row.querySelector('.rule-grams-input').value);
        if (unit && grams > 0) {
            conversionRules[unit] = grams;
        }
    });

    const masterData = {
        name: document.getElementById('master-product-name').value,
        category: document.getElementById('master-product-category').value,
        location: document.getElementById('master-product-location').value,
        defaultUnit: document.getElementById('master-product-default-unit').value,
        conversion_rules: conversionRules,
        userId: userId
    };

    if (!masterData.name || !masterData.category || !masterData.location) {
        handleError(new Error("Udfyld venligst alle felter for master-produktet."), "Ufuldstændige data");
        return;
    }

    try {
        const batch = writeBatch(db);
        let currentMasterId = masterId;

        if (currentMasterId) {
            batch.update(doc(db, 'master_products', currentMasterId), masterData);
        } else {
            const newMasterRef = doc(collection(db, 'master_products'));
            batch.set(newMasterRef, masterData);
            currentMasterId = newMasterRef.id;
        }

        const variantRows = appElements.variantFormContainer.querySelectorAll('.variant-form-row');
        const existingVariantIds = Array.from(variantRows).map(row => row.dataset.id).filter(id => id);
        
        const originalMaster = appState.inventory.find(mp => mp.id === masterId);
        if (originalMaster) {
            (originalMaster.variants || []).forEach(v => {
                if (!existingVariantIds.includes(v.id)) {
                    batch.delete(doc(db, 'inventory_variants', v.id));
                }
            });
        }

        variantRows.forEach(row => {
            const variantId = row.dataset.id;
            const variantData = {
                masterProductId: currentMasterId,
                variantName: row.querySelector('.variant-name-input').value,
                storeId: row.querySelector('.variant-store-select').value,
                currentStock: Number(row.querySelector('.variant-stock-input').value) || 0,
                purchaseSize: Number(row.querySelector('.variant-size-input').value) || 0,
                purchaseUnit: masterData.defaultUnit,
                kgPrice: Number(row.querySelector('.variant-price-input').value) || null,
                isFavoritePurchase: row.querySelector('.variant-favorite-checkbox').checked,
                userId: userId
            };

            if (variantId) {
                batch.update(doc(db, 'inventory_variants', variantId), variantData);
            } else {
                batch.set(doc(collection(db, 'inventory_variants')), variantData);
            }
        });

        await batch.commit();
        appElements.masterProductModal.classList.add('hidden');
        showNotification({ title: 'Gemt!', message: 'Varen og dens varianter er blevet gemt.' });

    } catch (error) {
        handleError(error, "Der opstod en fejl under lagring.", "handleSaveMasterProduct");
    }
}

async function handleDeleteMasterProduct() {
    const masterId = document.getElementById('master-product-id').value;
    if (!masterId) return;

    const confirmed = await showNotification({
        title: "Slet Vare",
        message: "Er du sikker på du vil slette denne vare og ALLE dens varianter? Denne handling kan ikke fortrydes.",
        type: 'confirm'
    });

    if (!confirmed) return;

    try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'master_products', masterId));
        const q = query(collection(db, 'inventory_variants'), where("masterProductId", "==", masterId));
        const variantSnapshot = await getDocs(q);
        variantSnapshot.forEach(doc => batch.delete(doc.ref));

        await batch.commit();
        appElements.masterProductModal.classList.add('hidden');
        showNotification({ title: 'Slettet', message: 'Varen og alle dens varianter er blevet slettet.' });
    } catch (error) {
        handleError(error, "Varen kunne ikke slettes.", "handleDeleteMasterProduct");
    }
}

function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    selectElement.value = currentValue || "";
}

/**
 * Parses the text from Gem-bot and returns a structured data object.
 * @param {string} text - The text to parse.
 * @returns {object} A structured object with master and variant data.
 */
function parseGemBotText(text) {
    const data = {
        master: {},
        variants: []
    };

    // Regex for Master Product section, made more robust to handle whitespace and case-insensitivity
    const masterMatch = text.match(/---\s*Master Produkt\s*---\s*([\s\S]*?)\s*---\s*Varianter\s*---/i); 
    if (!masterMatch) {
        // Fallback: If "--- Varianter ---" is not found after master, assume master goes to end
        const masterOnlyMatch = text.match(/---\s*Master Produkt\s*---\s*([\s\S]*)/i);
        if (masterOnlyMatch) {
             const masterLines = masterOnlyMatch[1].trim().split('\n');
             masterLines.forEach(line => {
                const parts = line.split(':');
                if (parts.length < 2) return;
                const key = parts[0].trim().toLowerCase();
                const value = parts.slice(1).join(':').trim();
                if (key === 'navn') data.master.name = value;
                if (key === 'kategori') data.master.category = value;
                if (key === 'placering') data.master.location = value;
                if (key === 'standard enhed') data.master.defaultUnit = value;
             });
            return data; // Return with master data, variants will be empty
        }
        throw new Error("Kunne ikke finde 'Master Produkt' sektion.");
    }

    const masterLines = masterMatch[1].trim().split('\n');
    masterLines.forEach(line => {
        const parts = line.split(':');
        if (parts.length < 2) return;
        const key = parts[0].trim().toLowerCase();
        const value = parts.slice(1).join(':').trim();
        if (key === 'navn') data.master.name = value;
        if (key === 'kategori') data.master.category = value;
        if (key === 'placering') data.master.location = value;
        if (key === 'standard enhed') data.master.defaultUnit = value;
    });

    // Regex for Variants section, made more robust to handle whitespace and case-insensitivity
    const variantsMatch = text.match(/---\s*Varianter\s*---\s*([\s\S]*)/i);
    if (!variantsMatch) return data; // It's okay if no variants section is found

    const variantBlocks = variantsMatch[1].trim().split(/Variant:\s*/i).filter(b => b.trim()); // More robust split
    variantBlocks.forEach(block => {
        const variantData = {};
        const blockLines = block.trim().split('\n');
        blockLines.forEach(line => {
            const parts = line.split(':');
            if (parts.length < 2) return;
            const key = parts[0].trim().toLowerCase();
            const value = parts.slice(1).join(':').trim();

            if (key === 'navn') variantData.variantName = value;
            if (key === 'butik') variantData.storeId = value;
            if (key === 'lager') variantData.currentStock = parseInt(value, 10) || 0;
            if (key === 'størrelse') variantData.purchaseSize = parseFloat(value);
            if (key === 'pris pr kg') variantData.kgPrice = parseFloat(value);
            if (key === 'favorit') variantData.isFavoritePurchase = value.toLowerCase() === 'ja';
        });
        if(Object.keys(variantData).length > 0) {
            data.variants.push(variantData);
        }
    });

    return data;
}

/**
 * Finds a matching value in a reference list, ignoring case and extra whitespace.
 * @param {string} valueToFind - The value from the import.
 * @param {string[]} referenceList - The list of available options (e.g., from appState.references).
 * @returns {string|null} The original value from the reference list if a match is found, otherwise null.
 */
function findReferenceMatch(valueToFind, referenceList) {
    if (!valueToFind || !Array.isArray(referenceList)) return null;
    const normalizedValue = valueToFind.trim().toLowerCase();
    return referenceList.find(ref => ref.trim().toLowerCase() === normalizedValue) || null;
}

/**
 * Sammenligner to variantobjekter for at se, om de er identiske.
 * Ignorerer 'id' og 'masterProductId' da disse er interne.
 * @param {object} variant1 - Første variantobjekt.
 * @param {object} variant2 - Andet variantobjekt.
 * @returns {boolean} True hvis varianterne er identiske, ellers false.
 */
function areVariantsIdentical(variant1, variant2) {
    // Sammenlign de relevante felter
    const fieldsToCompare = ['variantName', 'storeId', 'currentStock', 'purchaseSize', 'kgPrice', 'isFavoritePurchase'];
    for (let key of fieldsToCompare) {
        // Håndter null/undefined og sammenlign værdier
        if (variant1[key] !== variant2[key]) {
            return false;
        }
    }
    return true;
}

/**
 * Populates the master product form with data from a parsed object.
 * @param {object} data - The structured data object from parseGemBotText.
 */
function populateFormWithImportedData(data) {
    document.getElementById('master-product-name').value = data.master.name || '';
    
    const matchedCategory = findReferenceMatch(data.master.category, appState.references.itemCategories);
    document.getElementById('master-product-category').value = matchedCategory || '';
    
    const matchedLocation = findReferenceMatch(data.master.location, appState.references.itemLocations);
    document.getElementById('master-product-location').value = matchedLocation || '';

    document.getElementById('master-product-default-unit').value = data.master.defaultUnit || 'g';

    // Konverteringsregler overskrives altid, da de er direkte knyttet til masterproduktet
    appElements.conversionRulesContainer.innerHTML = '';
    if (data.master.conversion_rules) {
        for (const unit in data.master.conversion_rules) {
            addConversionRuleRow({ unit, grams: data.master.conversion_rules[unit] });
        }
    }


    // Håndter varianter: Tilføj kun nye, spring over identiske
    const currentVariantElements = appElements.variantFormContainer.querySelectorAll('.variant-form-row');
    const existingVariantsInForm = Array.from(currentVariantElements).map(row => ({
        id: row.dataset.id,
        variantName: row.querySelector('.variant-name-input').value,
        storeId: row.querySelector('.variant-store-select').value,
        currentStock: Number(row.querySelector('.variant-stock-input').value) || 0,
        purchaseSize: Number(row.querySelector('.variant-size-input').value) || 0,
        kgPrice: Number(row.querySelector('.variant-price-input').value) || null,
        isFavoritePurchase: row.querySelector('.variant-favorite-checkbox').checked,
    }));

    if (data.variants && data.variants.length > 0) {
        data.variants.forEach(importedVariant => {
            const matchedStore = findReferenceMatch(importedVariant.storeId, appState.references.stores);
            // Opret en midlertidig variant til sammenligning, der matcher den struktur, der læses fra formularen
            const variantToCompare = {
                variantName: importedVariant.variantName || '',
                storeId: matchedStore || '',
                currentStock: importedVariant.currentStock || 0,
                purchaseSize: importedVariant.purchaseSize || 0,
                kgPrice: importedVariant.kgPrice || null,
                isFavoritePurchase: importedVariant.isFavoritePurchase || false,
            };

            // Tjek om den importerede variant allerede eksisterer i formularen
            const exists = existingVariantsInForm.some(existingVariant => 
                areVariantsIdentical(existingVariant, variantToCompare)
            );

            if (!exists) {
                // Tilføj kun hvis den ikke allerede eksisterer
                addVariantRow({ ...importedVariant, storeId: matchedStore });
            }
        });
    } else if (existingVariantsInForm.length === 0) {
        // Hvis der hverken er importerede varianter eller eksisterende i formularen, tilføj en tom række
        addVariantRow();
    }
}


/**
 * Main handler for the Gem-bot import button.
 */
function handleGemBotImport() {
    const text = appElements.gemBotImportTextarea.value;
    if (!text.trim()) {
        showNotification({ title: "Tomt felt", message: "Indsæt venligst tekst fra din Gem-bot." });
        return;
    }

    try {
        const importedData = parseGemBotText(text);
        populateFormWithImportedData(importedData);
        
        showNotification({ title: "Importeret!", message: "Data er blevet udfyldt. Gennemse og gem." });
        appElements.gemBotImportTextarea.value = '';

    } catch (error) {
        handleError(error, "Fejl ved import. Tjek at formatet er korrekt.", "gemBotImport");
    }
}

/**
 * Åbner modalen til redigering af en enkelt variant.
 * @param {string} masterId - ID'et på masterproduktet.
 * @param {string} variantId - ID'et på varianten, der skal redigeres.
 */
function openVariantEditModal(masterId, variantId) {
    const masterProduct = appState.inventory.find(mp => mp.id === masterId);
    const variant = masterProduct?.variants.find(v => v.id === variantId);

    if (!masterProduct || !variant) {
        handleError(new Error("Variant ikke fundet."), "Kunne ikke finde varianten til redigering.", "openVariantEditModal");
        return;
    }

    // Sæt master produkt ID og variant ID i skjulte felter i formularen
    document.getElementById('variant-edit-master-id').value = masterId;
    document.getElementById('variant-edit-variant-id').value = variantId;
    document.getElementById('variant-edit-modal-title').textContent = `Rediger variant: ${variant.variantName} (${masterProduct.name})`;

    // Udfyld felter i variantredigeringsformularen
    document.getElementById('variant-edit-name').value = variant.variantName || '';
    populateReferenceDropdown(document.getElementById('variant-edit-store'), appState.references.stores, 'Vælg butik...', variant.storeId);
    document.getElementById('variant-edit-stock').value = variant.currentStock || 0;
    document.getElementById('variant-edit-size').value = variant.purchaseSize || '';
    document.getElementById('variant-edit-price').value = variant.kgPrice || '';
    document.getElementById('variant-edit-favorite').checked = variant.isFavoritePurchase || false;

    appElements.variantEditModal.classList.remove('hidden');
}

/**
 * Håndterer gem af en enkelt variant.
 * @param {Event} e - Submit event fra formularen.
 */
async function handleSaveVariant(e) {
    e.preventDefault();

    const masterId = document.getElementById('variant-edit-master-id').value;
    const variantId = document.getElementById('variant-edit-variant-id').value;
    const userId = appState.currentUser.uid;

    const variantData = {
        variantName: document.getElementById('variant-edit-name').value,
        storeId: document.getElementById('variant-edit-store').value,
        currentStock: Number(document.getElementById('variant-edit-stock').value) || 0,
        purchaseSize: Number(document.getElementById('variant-edit-size').value) || 0,
        kgPrice: Number(document.getElementById('variant-edit-price').value) || null,
        isFavoritePurchase: document.getElementById('variant-edit-favorite').checked,
        masterProductId: masterId, // Sørg for at masterProductId er med
        userId: userId
    };

    if (!variantData.variantName || !variantData.storeId) {
        handleError(new Error("Variantnavn og butik skal udfyldes."), "Ufuldstændige data for variant.", "handleSaveVariant");
        return;
    }

    try {
        await updateDoc(doc(db, 'inventory_variants', variantId), variantData);
        appElements.variantEditModal.classList.add('hidden');
        showNotification({ title: 'Gemt!', message: 'Variant er blevet opdateret.' });
    } catch (error) {
        handleError(error, "Kunne ikke gemme variant.", "handleSaveVariant");
    }
}
