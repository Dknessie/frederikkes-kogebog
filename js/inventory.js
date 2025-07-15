// js/inventory.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { debounce } from './utils.js';

let appState;
let appElements;
let inventoryState = {
    searchTerm: '',
    referencesLoaded: false 
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

    appElements.inventorySearchInput.addEventListener('input', debounce(e => {
        inventoryState.searchTerm = e.target.value.toLowerCase();
        renderInventory();
    }, 300));

    appElements.inventoryListContainer.addEventListener('click', e => {
        const button = e.target.closest('button');
        const header = e.target.closest('.master-product-header');

        if (button && button.classList.contains('edit-master-btn')) {
            e.stopPropagation();
            openMasterProductModal(button.dataset.id);
        } else if (header) {
            header.parentElement.classList.toggle('is-open');
        }
    });
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

    let masterProducts = [...appState.inventory];

    if (inventoryState.searchTerm) {
        const term = inventoryState.searchTerm.toLowerCase();
        masterProducts = masterProducts.filter(mp => 
            mp.name.toLowerCase().includes(term) || 
            mp.variants.some(v => v.variantName.toLowerCase().includes(term))
        );
    }

    if (masterProducts.length === 0) {
        container.innerHTML = `<p class="empty-state">Ingen varer fundet. Klik på "Tilføj ny vare" for at oprette dit første master-produkt.</p>`;
        return;
    }

    masterProducts.sort((a, b) => a.name.localeCompare(b.name));

    const fragment = document.createDocumentFragment();
    masterProducts.forEach(mp => {
        const masterDiv = document.createElement('div');
        masterDiv.className = 'master-product-item';
        
        const variantsHTML = mp.variants.map(v => {
            const storeName = appState.references.stores?.find(s => s === v.storeId) || v.storeId || 'Ukendt butik';
            return `
                <div class="variant-item">
                    <span class="variant-name">${v.variantName} <span class="variant-store">(${storeName})</span></span>
                    <span class="variant-stock">Lager: ${v.currentStock || 0} stk.</span>
                    <span class="variant-price">${v.kgPrice ? v.kgPrice.toFixed(2) + ' kr/kg' : ''}</span>
                </div>
            `;
        }).join('');

        const totalStockDisplay = mp.totalStockGrams >= 1000 
            ? `${(mp.totalStockGrams / 1000).toFixed(2)} kg`
            : `${mp.totalStockGrams.toFixed(0)} g`;

        masterDiv.innerHTML = `
            <div class="master-product-header" data-id="${mp.id}">
                <div class="master-product-info">
                    <h4>${mp.name}</h4>
                    <span class="master-product-category">${mp.category || 'Ukategoriseret'}</span>
                </div>
                <div class="master-product-stock-info">
                    <span>Total lager (ca.):</span>
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

        masterProduct.variants.forEach(variant => addVariantRow(variant));
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
    if(masterProduct) document.getElementById('master-product-category').value = masterProduct.category;

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
        defaultUnit: document.getElementById('master-product-default-unit').value,
        conversion_rules: conversionRules,
        userId: userId
    };

    if (!masterData.name || !masterData.category) {
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
            originalMaster.variants.forEach(v => {
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

    const masterMatch = text.match(/--- Master Produkt ---\s*([\s\S]*?)\s*--- Varianter ---/);
    if (!masterMatch) throw new Error("Kunne ikke finde 'Master Produkt' sektion.");

    const masterLines = masterMatch[1].trim().split('\n');
    masterLines.forEach(line => {
        const parts = line.split(':');
        if (parts.length < 2) return;
        const key = parts[0].trim().toLowerCase();
        const value = parts.slice(1).join(':').trim();
        if (key === 'navn') data.master.name = value;
        if (key === 'kategori') data.master.category = value;
        if (key === 'standard enhed') data.master.defaultUnit = value;
    });

    const variantsMatch = text.match(/--- Varianter ---\s*([\s\S]*)/);
    if (!variantsMatch) return data;

    const variantBlocks = variantsMatch[1].trim().split(/Variant:/).filter(b => b.trim());
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
 * Populates the master product form with data from a parsed object.
 * @param {object} data - The structured data object from parseGemBotText.
 */
function populateFormWithImportedData(data) {
    document.getElementById('master-product-name').value = data.master.name || '';
    
    // Use the robust matching function for the category dropdown
    const matchedCategory = findReferenceMatch(data.master.category, appState.references.itemCategories);
    document.getElementById('master-product-category').value = matchedCategory || '';
    
    document.getElementById('master-product-default-unit').value = data.master.defaultUnit || 'g';

    appElements.variantFormContainer.innerHTML = '';
    appElements.conversionRulesContainer.innerHTML = '';

    if (data.variants && data.variants.length > 0) {
        data.variants.forEach(variant => {
            // Use the robust matching function for the store dropdown in each variant
            const matchedStore = findReferenceMatch(variant.storeId, appState.references.stores);
            addVariantRow({ ...variant, storeId: matchedStore });
        });
    } else {
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
