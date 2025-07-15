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
    selectedCategory: '',
    selectedLocation: '',
    selectedStore: ''
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
        inventoryFilterCategory: document.getElementById('inventory-filter-category'),
        inventoryFilterLocation: document.getElementById('inventory-filter-location'),
        inventoryFilterStore: document.getElementById('inventory-filter-store'),
        clearInventoryFiltersBtn: document.getElementById('clear-inventory-filters-btn'),
        variantEditModal: document.getElementById('variant-edit-modal'),
        variantEditForm: document.getElementById('variant-edit-form'),
        variantEditKcalInput: document.getElementById('variant-edit-kcal'),
        bulkImportBtn: document.getElementById('bulk-import-btn'),
        bulkImportModal: document.getElementById('bulk-import-modal'),
        bulkImportTextarea: document.getElementById('bulk-import-textarea'),
        startBulkImportBtn: document.getElementById('start-bulk-import-btn'),
        bulkImportSummary: document.getElementById('bulk-import-summary'),
        bulkImportSummaryContent: document.getElementById('bulk-import-summary-content'),
    };

    appElements.addInventoryItemBtn.addEventListener('click', () => openMasterProductModal(null));
    appElements.masterProductForm.addEventListener('submit', handleSaveMasterProduct);
    appElements.addVariantFormBtn.addEventListener('click', () => addVariantRow());
    appElements.gemBotImportBtn.addEventListener('click', handleGemBotImport);
    
    appElements.bulkImportBtn.addEventListener('click', openBulkImportModal);
    appElements.startBulkImportBtn.addEventListener('click', handleBulkImport);

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
        inventoryState.searchTerm = '';
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
        } else if (button && button.classList.contains('edit-variant-btn')) {
            e.stopPropagation();
            const masterId = button.dataset.masterId;
            const variantId = button.dataset.variantId;
            openVariantEditModal(masterId, variantId);
        }
    });

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

    populateReferenceDropdown(appElements.inventoryFilterCategory, appState.references.itemCategories, 'Alle kategorier', inventoryState.selectedCategory);
    populateReferenceDropdown(appElements.inventoryFilterLocation, appState.references.itemLocations, 'Alle placeringer', inventoryState.selectedLocation);
    populateReferenceDropdown(appElements.inventoryFilterStore, appState.references.stores, 'Alle butikker', inventoryState.selectedStore);


    let masterProducts = [...appState.inventory];

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
        
        const variantsHTML = (mp.variants || []).map(v => {
            const storeName = appState.references.stores?.find(s => s === v.storeId) || v.storeId || 'Ukendt butik';
            const sizeDisplay = v.purchaseSize ? `${v.purchaseSize}${mp.defaultUnit}` : '';
            const priceDisplay = v.kgPrice ? `${v.kgPrice.toFixed(2)} kr/${mp.defaultUnit === 'g' ? 'kg' : 'l'}` : '';
            const kcalDisplay = v.kcal ? `${v.kcal} kcal` : '';
            const favoriteIcon = v.isFavoritePurchase ? '<i class="fas fa-star favorite-variant-icon" title="Favoritkøb"></i>' : '';
            return `
                <div class="variant-item">
                    <span class="variant-name">${favoriteIcon} ${v.variantName}</span>
                    <div class="variant-info-group">
                        <span class="variant-store">${storeName}</span>
                        <span class="variant-stock">${v.currentStock || 0} stk.</span>
                        <span class="variant-size">${sizeDisplay}</span>
                        <span class="variant-price">${priceDisplay}</span>
                        <span class="variant-kcal">${kcalDisplay}</span>
                    </div>
                    <button class="btn-icon edit-variant-btn" data-master-id="${mp.id}" data-variant-id="${v.id}" title="Rediger variant"><i class="fas fa-edit"></i></button>
                </div>
            `;
        }).join('');

        const totalStockDisplay = `${mp.totalStockItems || 0} stk`;

        masterDiv.innerHTML = `
            <div class="master-product-header" data-id="${mp.id}">
                <div class="master-product-info">
                    <h4>${mp.name}</h4>
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
        addVariantRow();
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
    row.dataset.id = variant.id || '';

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
        <div class="input-group">
            <label>Kalorier (kcal)</label>
            <input type="number" class="variant-kcal-input" min="0" step="1" value="${variant.kcal || ''}">
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
    const masterName = document.getElementById('master-product-name').value.trim();

    // NYT: Validering for duplikatnavne
    const existingProduct = appState.inventory.find(
        p => p.name.toLowerCase() === masterName.toLowerCase()
    );

    if (existingProduct && existingProduct.id !== masterId) {
        showNotification({
            title: "Vare eksisterer allerede",
            message: `En vare med navnet "${masterName}" findes allerede. Vælg venligst et unikt navn.`,
        });
        return; // Stop funktionen
    }

    const conversionRules = {};
    appElements.conversionRulesContainer.querySelectorAll('.conversion-rule-row').forEach(row => {
        const unit = row.querySelector('.rule-unit-select').value;
        const grams = parseFloat(row.querySelector('.rule-grams-input').value);
        if (unit && grams > 0) {
            conversionRules[unit] = grams;
        }
    });

    const masterData = {
        name: masterName,
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
                kcal: Number(row.querySelector('.variant-kcal-input').value) || null,
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

function parseGemBotText(text) {
    const data = { master: {}, variants: [] };
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);

    let currentSection = '';
    let currentVariant = null;

    for (const line of lines) {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('--- master produkt ---')) {
            currentSection = 'master';
            continue;
        }
        if (lowerLine.includes('--- varianter ---')) {
            currentSection = 'variants';
            if (currentVariant) {
                data.variants.push(currentVariant);
                currentVariant = null;
            }
            continue;
        }
        if (lowerLine.startsWith('variant:')) {
            if (currentVariant) data.variants.push(currentVariant);
            currentVariant = {};
            const variantName = line.substring(line.indexOf(':') + 1).trim();
            if (variantName) currentVariant.variantName = variantName;
            continue;
        }

        const parts = line.split(':');
        if (parts.length < 2) continue;
        const key = parts[0].trim().toLowerCase();
        const value = parts.slice(1).join(':').trim();

        if (currentSection === 'master') {
            if (key === 'navn') data.master.name = value;
            if (key === 'kategori') data.master.category = value;
            if (key === 'placering') data.master.location = value;
            if (key === 'standard enhed') data.master.defaultUnit = value;
        } else if (currentSection === 'variants') {
            if (!currentVariant) currentVariant = {};
            if (key === 'navn') currentVariant.variantName = value;
            if (key === 'butik') currentVariant.storeId = value;
            if (key === 'lager') currentVariant.currentStock = parseInt(value, 10) || 0;
            if (key === 'størrelse') currentVariant.purchaseSize = parseFloat(value);
            if (key === 'pris pr kg') currentVariant.kgPrice = parseFloat(value);
            if (key === 'kcal') currentVariant.kcal = parseInt(value, 10) || null;
            if (key === 'favorit') currentVariant.isFavoritePurchase = value.toLowerCase() === 'ja';
        }
    }
    if (currentVariant) data.variants.push(currentVariant);

    return data;
}

function findReferenceMatch(valueToFind, referenceList) {
    if (!valueToFind || !Array.isArray(referenceList)) return null;
    const normalizedValue = valueToFind.trim().toLowerCase();
    return referenceList.find(ref => ref.trim().toLowerCase() === normalizedValue) || null;
}

function populateFormWithImportedData(data) {
    document.getElementById('master-product-name').value = data.master.name || '';
    
    const matchedCategory = findReferenceMatch(data.master.category, appState.references.itemCategories);
    document.getElementById('master-product-category').value = matchedCategory || '';
    
    const matchedLocation = findReferenceMatch(data.master.location, appState.references.itemLocations);
    document.getElementById('master-product-location').value = matchedLocation || '';

    document.getElementById('master-product-default-unit').value = data.master.defaultUnit || 'g';

    appElements.conversionRulesContainer.innerHTML = '';
    if (data.master.conversion_rules) {
        for (const unit in data.master.conversion_rules) {
            addConversionRuleRow({ unit, grams: data.master.conversion_rules[unit] });
        }
    }

    appElements.variantFormContainer.innerHTML = '';
    
    if (data.variants && data.variants.length > 0) {
        data.variants.forEach(importedVariant => {
             const matchedStore = findReferenceMatch(importedVariant.storeId, appState.references.stores);
             addVariantRow({ ...importedVariant, storeId: matchedStore });
        });
    } else {
        addVariantRow();
    }
}

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

function openVariantEditModal(masterId, variantId) {
    const masterProduct = appState.inventory.find(mp => mp.id === masterId);
    const variant = masterProduct?.variants.find(v => v.id === variantId);

    if (!masterProduct || !variant) {
        handleError(new Error("Variant ikke fundet."), "Kunne ikke finde varianten til redigering.", "openVariantEditModal");
        return;
    }

    document.getElementById('variant-edit-master-id').value = masterId;
    document.getElementById('variant-edit-variant-id').value = variantId;
    document.getElementById('variant-edit-modal-title').textContent = `Rediger variant: ${variant.variantName} (${masterProduct.name})`;

    document.getElementById('variant-edit-name').value = variant.variantName || '';
    populateReferenceDropdown(document.getElementById('variant-edit-store'), appState.references.stores, 'Vælg butik...', variant.storeId);
    document.getElementById('variant-edit-stock').value = variant.currentStock || 0;
    document.getElementById('variant-edit-size').value = variant.purchaseSize || '';
    document.getElementById('variant-edit-price').value = variant.kgPrice || '';
    appElements.variantEditKcalInput.value = variant.kcal || '';
    document.getElementById('variant-edit-favorite').checked = variant.isFavoritePurchase || false;

    appElements.variantEditModal.classList.remove('hidden');
}

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
        kcal: Number(appElements.variantEditKcalInput.value) || null,
        isFavoritePurchase: document.getElementById('variant-edit-favorite').checked,
        masterProductId: masterId,
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

function openBulkImportModal() {
    appElements.bulkImportTextarea.value = '';
    appElements.bulkImportSummary.classList.add('hidden');
    appElements.bulkImportSummaryContent.innerHTML = '';
    appElements.bulkImportModal.classList.remove('hidden');
}

function parseBulkImportText(text) {
    const productChunks = text.split(/--- NY VARE ---/i);
    const parsedProducts = [];
    const errors = [];

    productChunks.forEach((chunk, index) => {
        const trimmedChunk = chunk.trim();
        if (trimmedChunk) {
            try {
                const productData = parseGemBotText(trimmedChunk);
                if (!productData.master.name) {
                    throw new Error("Master-produkt mangler et navn.");
                }
                parsedProducts.push(productData);
            } catch (error) {
                errors.push(`Fejl i vare #${index + 1}: ${error.message}`);
            }
        }
    });

    return { parsedProducts, errors };
}

async function handleBulkImport() {
    const text = appElements.bulkImportTextarea.value;
    const userId = appState.currentUser.uid;
    if (!text.trim()) {
        showNotification({ title: "Tomt felt", message: "Indsæt venligst data til import." });
        return;
    }

    appElements.startBulkImportBtn.disabled = true;
    appElements.startBulkImportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importerer...';

    const { parsedProducts, errors: parseErrors } = parseBulkImportText(text);
    const summary = {
        success: 0,
        skipped: 0,
        variants: 0,
        errors: [...parseErrors]
    };

    if (parsedProducts.length === 0) {
        summary.errors.push("Ingen gyldige varer fundet i teksten.");
        displayImportSummary(summary);
        return;
    }

    const batch = writeBatch(db);

    for (const productData of parsedProducts) {
        const masterName = productData.master.name.trim();

        // NYT: Validering for duplikatnavne i masse-import
        const existingProduct = appState.inventory.find(
            p => p.name.toLowerCase() === masterName.toLowerCase()
        );

        if (existingProduct) {
            summary.skipped++;
            summary.errors.push(`Varen '${masterName}' eksisterer allerede og blev sprunget over.`);
            continue; // Spring til næste produkt
        }
        
        const masterData = {
            name: masterName,
            category: findReferenceMatch(productData.master.category, appState.references.itemCategories) || 'Ukategoriseret',
            location: findReferenceMatch(productData.master.location, appState.references.itemLocations) || 'Ukendt',
            defaultUnit: productData.master.defaultUnit || 'g',
            conversion_rules: {},
            userId: userId
        };

        if (!masterData.name) {
            summary.errors.push(`En vare mangler et navn.`);
            continue;
        }

        const newMasterRef = doc(collection(db, 'master_products'));
        batch.set(newMasterRef, masterData);
        summary.success++;

        (productData.variants || []).forEach(variant => {
            const variantData = {
                masterProductId: newMasterRef.id,
                variantName: variant.variantName || 'Standard',
                storeId: findReferenceMatch(variant.storeId, appState.references.stores) || 'Ukendt',
                currentStock: Number(variant.currentStock) || 0,
                purchaseSize: Number(variant.purchaseSize) || 0,
                purchaseUnit: masterData.defaultUnit,
                kgPrice: Number(variant.kgPrice) || null,
                kcal: Number(variant.kcal) || null,
                isFavoritePurchase: variant.isFavoritePurchase || false,
                userId: userId
            };
            batch.set(doc(collection(db, 'inventory_variants')), variantData);
            summary.variants++;
        });
    }

    try {
        await batch.commit();
    } catch (error) {
        handleError(error, "Der skete en kritisk fejl under importen. Nogle varer blev muligvis ikke gemt.", "bulkImportCommit");
        summary.errors.push(`Firestore fejl: ${error.message}`);
    } finally {
        displayImportSummary(summary);
    }
}

function displayImportSummary(summary) {
    const contentEl = appElements.bulkImportSummaryContent;
    
    let html = `<p><strong>Importeret med succes:</strong> ${summary.success} master-produkter</p>`;
    html += `<p><strong>Varianter tilføjet:</strong> ${summary.variants}</p>`;
    if (summary.skipped > 0) {
        html += `<p><strong>Springet over (eksisterede allerede):</strong> ${summary.skipped}</p>`;
    }

    if (summary.errors.length > 0) {
        html += `<h4>Fejllog:</h4>`;
        html += `<ul class="error-log">`;
        summary.errors.forEach(err => {
            html += `<li>${err}</li>`;
        });
        html += `</ul>`;
    }

    contentEl.innerHTML = html;
    appElements.bulkImportSummary.classList.remove('hidden');
    appElements.startBulkImportBtn.disabled = false;
    appElements.startBulkImportBtn.innerHTML = 'Start Import';
}
