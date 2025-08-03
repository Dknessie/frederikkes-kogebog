// js/inventory.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { debounce, formatDate } from './utils.js';

let appState;
let appElements;
let inventoryState = {
    searchTerm: '',
    referencesLoaded: false,
    selectedCategory: '',
    selectedLocation: '',
    selectedStockStatus: ''
};

export function initInventory(state, elements) {
    appState = state;
    appElements = elements;

    // Event Listeners for main item modal
    appElements.addInventoryItemBtn.addEventListener('click', () => openInventoryItemModal(null));
    appElements.inventoryItemForm.addEventListener('submit', handleSaveInventoryItem);
    
    const deleteBtn = document.getElementById('delete-inventory-item-btn');
    if(deleteBtn) deleteBtn.addEventListener('click', handleDeleteInventoryItem);
    
    // Event Listeners for conversion rules
    const addConversionBtn = document.getElementById('add-conversion-rule-btn');
    const conversionRulesContainer = document.getElementById('conversion-rules-container');
    if(addConversionBtn) addConversionBtn.addEventListener('click', () => addConversionRuleRow());
    if(conversionRulesContainer) conversionRulesContainer.addEventListener('click', e => {
        if (e.target.closest('.delete-rule-btn')) {
            e.target.closest('.conversion-rule-row').remove();
        }
    });

    // Event Listeners for filtering and searching
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
    appElements.inventoryFilterStockStatus.addEventListener('change', e => {
        inventoryState.selectedStockStatus = e.target.value;
        renderInventory();
    });
    appElements.clearInventoryFiltersBtn.addEventListener('click', () => {
        inventoryState.selectedCategory = '';
        inventoryState.selectedLocation = '';
        inventoryState.selectedStockStatus = '';
        inventoryState.searchTerm = '';
        appElements.inventoryFilterCategory.value = '';
        appElements.inventoryFilterLocation.value = '';
        appElements.inventoryFilterStockStatus.value = '';
        appElements.inventorySearchInput.value = '';
        renderInventory();
    });

    // Event Listeners for the inventory list (expanding items, editing batches)
    appElements.inventoryListContainer.addEventListener('click', e => {
        const button = e.target.closest('button');
        const header = e.target.closest('.inventory-item-header');

        if (button && button.classList.contains('edit-item-btn')) {
            e.stopPropagation();
            openInventoryItemModal(button.dataset.id);
        } else if (header) {
            header.parentElement.classList.toggle('is-open');
        }
    });
    
    // Event Listeners for batch management
    const addBatchBtn = document.getElementById('add-batch-btn');
    const batchListContainer = document.getElementById('batch-list-container');
    const batchEditForm = document.getElementById('batch-edit-form');
    const deleteBatchBtn = document.getElementById('delete-batch-btn');

    if(addBatchBtn) addBatchBtn.addEventListener('click', () => {
        const itemId = document.getElementById('inventory-item-id').value;
        if (itemId) {
            openBatchModal(itemId, null);
        } else {
            showNotification({title: "Gem Vare Først", message: "Du skal gemme varen, før du kan tilføje et batch."});
        }
    });
    if(batchListContainer) batchListContainer.addEventListener('click', e => {
        const editBtn = e.target.closest('.edit-batch-btn');
        if (editBtn) {
            const itemId = editBtn.dataset.itemId;
            const batchId = editBtn.dataset.batchId;
            openBatchModal(itemId, batchId);
        }
    });
    if(batchEditForm) batchEditForm.addEventListener('submit', handleSaveBatch);
    if(deleteBatchBtn) deleteBatchBtn.addEventListener('click', handleDeleteBatch);
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

    let inventoryItems = [...appState.inventory];

    // Apply filters
    if (inventoryState.selectedCategory) {
        inventoryItems = inventoryItems.filter(item => item.category === inventoryState.selectedCategory);
    }
    if (inventoryState.selectedLocation) {
        inventoryItems = inventoryItems.filter(item => item.location === inventoryState.selectedLocation);
    }
    if (inventoryState.searchTerm) {
        const term = inventoryState.searchTerm;
        inventoryItems = inventoryItems.filter(item => item.name.toLowerCase().includes(term));
    }
    if (inventoryState.selectedStockStatus) {
        inventoryItems = inventoryItems.filter(item => {
            const reorderPoint = item.reorderPoint || 0;
            const totalStock = item.totalStock || 0;
            if (inventoryState.selectedStockStatus === 'out_of_stock') return totalStock <= 0;
            if (inventoryState.selectedStockStatus === 'low_stock') return totalStock > 0 && totalStock <= reorderPoint;
            if (inventoryState.selectedStockStatus === 'in_stock') return totalStock > reorderPoint;
            return true;
        });
    }

    if (inventoryItems.length === 0) {
        container.innerHTML = `<p class="empty-state">Ingen varer fundet, der matcher dine filtre.</p>`;
        return;
    }

    inventoryItems.sort((a, b) => a.name.localeCompare(b.name));

    const fragment = document.createDocumentFragment();
    inventoryItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'inventory-item';

        const batchesHTML = (item.batches || []).map(b => {
            const expiryDate = b.expiryDate ? new Date(b.expiryDate) : null;
            const today = new Date();
            today.setHours(0,0,0,0);
            let expiryClass = '';
            if (expiryDate) {
                const sevenDaysFromNow = new Date();
                sevenDaysFromNow.setDate(today.getDate() + 7);
                if (expiryDate < today) expiryClass = 'status-red';
                else if (expiryDate <= sevenDaysFromNow) expiryClass = 'status-yellow';
            }
            
            return `
                <div class="batch-item">
                    <span class="batch-info">Indkøbt: ${formatDate(b.purchaseDate)}</span>
                    <span class="batch-info ${expiryClass}">Udløber: ${b.expiryDate ? formatDate(b.expiryDate) : 'N/A'}</span>
                    <span class="batch-info">Antal: ${b.quantity} x ${b.size}${b.unit}</span>
                    <span class="batch-info">Butik: ${b.store || 'N/A'}</span>
                    <span class="batch-info">Pris: ${b.price ? `${b.price.toFixed(2)} kr.` : 'N/A'}</span>
                    <button class="btn-icon edit-batch-btn" data-item-id="${item.id}" data-batch-id="${b.id}" title="Rediger batch"><i class="fas fa-edit"></i></button>
                </div>
            `;
        }).join('');

        const totalStockDisplay = `${item.totalStock.toFixed(0)} ${item.defaultUnit}`;
        
        let stockStatusClass = 'status-green';
        const reorderPoint = item.reorderPoint || 0;
        if (item.totalStock <= 0) stockStatusClass = 'status-red';
        else if (reorderPoint > 0 && item.totalStock <= reorderPoint) stockStatusClass = 'status-yellow';

        itemDiv.innerHTML = `
            <div class="inventory-item-header" data-id="${item.id}">
                <div class="inventory-item-info">
                    <div class="inventory-item-title-group">
                        <span class="completeness-indicator status-indicator ${stockStatusClass}" title="Lagerstatus"></span>
                        <h4>${item.name}</h4>
                    </div>
                </div>
                <div class="inventory-item-stock-info">
                    <span>Total lager:</span>
                    <span class="inventory-item-stock-amount">${totalStockDisplay}</span>
                </div>
                <div class="inventory-item-actions">
                    <button class="btn-icon edit-item-btn" data-id="${item.id}" title="Rediger generel vareinfo"><i class="fas fa-edit"></i></button>
                    <i class="fas fa-chevron-down expand-icon"></i>
                </div>
            </div>
            <div class="batch-list">
                ${batchesHTML || '<p class="empty-state-small">Ingen batches registreret for denne vare.</p>'}
            </div>
        `;
        fragment.appendChild(itemDiv);
    });

    container.appendChild(fragment);
}

function openInventoryItemModal(itemId) {
    const form = appElements.inventoryItemForm;
    form.reset();
    document.getElementById('conversion-rules-container').innerHTML = '';
    document.getElementById('batch-list-container').innerHTML = '';
    
    const item = itemId ? appState.inventory.find(p => p.id === itemId) : null;

    if (item) {
        appElements.inventoryModalTitle.textContent = 'Rediger Vare';
        document.getElementById('inventory-item-id').value = item.id;
        document.getElementById('inventory-item-name').value = item.name;
        document.getElementById('inventory-item-default-unit').value = item.defaultUnit;
        document.getElementById('inventory-item-reorder-point').value = item.reorderPoint || '';
        document.getElementById('delete-inventory-item-btn').style.display = 'inline-flex';
        document.getElementById('add-batch-btn').style.display = 'inline-flex';

        if (item.conversion_rules) {
            for (const unit in item.conversion_rules) {
                addConversionRuleRow({ unit, value: item.conversion_rules[unit] });
            }
        }
        renderBatchListInModal(item.batches);
    } else {
        appElements.inventoryModalTitle.textContent = 'Opret Ny Vare';
        document.getElementById('inventory-item-id').value = '';
        document.getElementById('delete-inventory-item-btn').style.display = 'none';
        document.getElementById('add-batch-btn').style.display = 'none';
        document.getElementById('batch-list-container').innerHTML = '<p class="empty-state-small">Gem varen for at kunne tilføje batches.</p>';
    }
    
    populateReferenceDropdown(document.getElementById('inventory-item-category'), appState.references.itemCategories, 'Vælg kategori...');
    populateReferenceDropdown(document.getElementById('inventory-item-location'), appState.references.itemLocations, 'Vælg placering...');
    
    if(item) {
        document.getElementById('inventory-item-category').value = item.category;
        document.getElementById('inventory-item-location').value = item.location;
    }

    appElements.inventoryItemModal.classList.remove('hidden');
}

function renderBatchListInModal(batches) {
    const container = document.getElementById('batch-list-container');
    if (!batches || batches.length === 0) {
        container.innerHTML = '<p class="empty-state-small">Ingen batches registreret.</p>';
        return;
    }
    container.innerHTML = batches.map(b => `
         <div class="batch-item">
            <span class="batch-info">Udløber: ${b.expiryDate ? formatDate(b.expiryDate) : 'N/A'}</span>
            <span class="batch-info">Antal: ${b.quantity} x ${b.size}${b.unit}</span>
            <button class="btn-icon edit-batch-btn" data-item-id="${b.itemId}" data-batch-id="${b.id}" title="Rediger batch"><i class="fas fa-edit"></i></button>
        </div>
    `).join('');
}

async function handleSaveInventoryItem(e) {
    e.preventDefault();
    const itemId = document.getElementById('inventory-item-id').value;
    const userId = appState.currentUser.uid;
    const itemName = document.getElementById('inventory-item-name').value.trim();

    const conversionRules = {};
    document.getElementById('conversion-rules-container').querySelectorAll('.conversion-rule-row').forEach(row => {
        const unit = row.querySelector('.rule-unit-select').value;
        const value = parseFloat(row.querySelector('.rule-value-input').value);
        if (unit && value > 0) {
            conversionRules[unit] = value;
        }
    });

    const itemData = {
        name: itemName,
        category: document.getElementById('inventory-item-category').value,
        location: document.getElementById('inventory-item-location').value,
        defaultUnit: document.getElementById('inventory-item-default-unit').value,
        reorderPoint: Number(document.getElementById('inventory-item-reorder-point').value) || null,
        conversion_rules: conversionRules,
        userId: userId
    };

    if (!itemData.name || !itemData.category || !itemData.location) {
        handleError(new Error("Udfyld venligst alle påkrævede felter for varen."), "Ufuldstændige data");
        return;
    }

    try {
        if (itemId) {
            await updateDoc(doc(db, 'inventory_items', itemId), itemData);
        } else {
            const newDocRef = await addDoc(collection(db, 'inventory_items'), itemData);
            document.getElementById('inventory-item-id').value = newDocRef.id;
            document.getElementById('add-batch-btn').style.display = 'inline-flex';
            document.getElementById('batch-list-container').innerHTML = '';
        }
        
        showNotification({ title: 'Gemt!', message: 'Varens generelle informationer er blevet gemt.' });

    } catch (error) {
        handleError(error, "Der opstod en fejl under lagring af varen.", "handleSaveInventoryItem");
    }
}

async function handleDeleteInventoryItem() {
    const itemId = document.getElementById('inventory-item-id').value;
    if (!itemId) return;

    const confirmed = await showNotification({
        title: "Slet Vare",
        message: "Er du sikker på du vil slette denne vare og ALLE dens batches? Handlingen kan ikke fortrydes.",
        type: 'confirm'
    });

    if (!confirmed) return;

    try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'inventory_items', itemId));
        const q = query(collection(db, 'inventory_batches'), where("itemId", "==", itemId));
        const batchSnapshot = await getDocs(q);
        batchSnapshot.forEach(doc => batch.delete(doc.ref));

        await batch.commit();
        appElements.inventoryItemModal.classList.add('hidden');
        showNotification({ title: 'Slettet', message: 'Varen og alle dens batches er blevet slettet.' });
    } catch (error) {
        handleError(error, "Varen kunne ikke slettes.", "handleDeleteInventoryItem");
    }
}

// Batch Management Functions
export function openBatchModal(itemId, batchId) {
    const form = document.getElementById('batch-edit-form');
    form.reset();
    
    const item = appState.inventory.find(i => i.id === itemId);
    if (!item) {
        handleError(new Error("Vare ikke fundet"), "Kan ikke åbne batch-modal, da varen ikke findes.");
        return;
    }

    const batch = batchId ? appState.inventoryBatches.find(b => b.id === batchId) : null;

    document.getElementById('batch-edit-item-id').value = itemId;
    document.getElementById('batch-edit-unit').value = item.defaultUnit || 'g';
    document.getElementById('batch-edit-unit').disabled = true;
    
    const modal = document.getElementById('batch-edit-modal');
    if (batch) {
        modal.querySelector('h3').textContent = `Rediger Batch for ${item.name}`;
        document.getElementById('batch-edit-batch-id').value = batch.id;
        document.getElementById('batch-edit-purchase-date').value = batch.purchaseDate || formatDate(new Date());
        document.getElementById('batch-edit-expiry-date').value = batch.expiryDate || '';
        document.getElementById('batch-edit-quantity').value = batch.quantity || 1;
        document.getElementById('batch-edit-size').value = batch.size || '';
        document.getElementById('batch-edit-price').value = batch.price || '';
        document.getElementById('delete-batch-btn').style.display = 'inline-flex';
    } else {
        modal.querySelector('h3').textContent = `Nyt Batch for ${item.name}`;
        document.getElementById('batch-edit-batch-id').value = '';
        document.getElementById('batch-edit-purchase-date').value = formatDate(new Date());
        document.getElementById('delete-batch-btn').style.display = 'none';
    }

    populateReferenceDropdown(document.getElementById('batch-edit-store'), appState.references.stores, 'Vælg butik...', batch?.store);
    modal.classList.remove('hidden');
}

async function handleSaveBatch(e) {
    e.preventDefault();
    const itemId = document.getElementById('batch-edit-item-id').value;
    const batchId = document.getElementById('batch-edit-batch-id').value;
    
    const batchData = {
        itemId: itemId,
        userId: appState.currentUser.uid,
        purchaseDate: document.getElementById('batch-edit-purchase-date').value,
        expiryDate: document.getElementById('batch-edit-expiry-date').value || null,
        quantity: Number(document.getElementById('batch-edit-quantity').value),
        size: Number(document.getElementById('batch-edit-size').value),
        unit: document.getElementById('batch-edit-unit').value,
        price: Number(document.getElementById('batch-edit-price').value) || null,
        store: document.getElementById('batch-edit-store').value,
    };

    if (!batchData.purchaseDate || batchData.quantity <= 0 || batchData.size <= 0 || !batchData.store) {
        showNotification({title: "Udfyld påkrævede felter", message: "Sørg for at indkøbsdato, antal, størrelse og butik er udfyldt korrekt."});
        return;
    }

    try {
        if (batchId) {
            await updateDoc(doc(db, 'inventory_batches', batchId), batchData);
        } else {
            await addDoc(collection(db, 'inventory_batches'), batchData);
        }
        document.getElementById('batch-edit-modal').classList.add('hidden');
        showNotification({title: "Batch Gemt", message: "Dit batch er blevet gemt."});
    } catch (error) {
        handleError(error, "Batchet kunne ikke gemmes.", "handleSaveBatch");
    }
}

async function handleDeleteBatch() {
    const batchId = document.getElementById('batch-edit-batch-id').value;
    if (!batchId) return;

    const confirmed = await showNotification({title: "Slet Batch", message: "Er du sikker på du vil slette dette batch?", type: 'confirm'});
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, 'inventory_batches', batchId));
        document.getElementById('batch-edit-modal').classList.add('hidden');
        showNotification({title: "Batch Slettet", message: "Batchet er blevet fjernet fra lageret."});
    } catch (error) {
        handleError(error, "Batchet kunne ikke slettes.", "handleDeleteBatch");
    }
}

// Helper functions
function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    selectElement.value = currentValue || "";
}

function addConversionRuleRow(rule = { unit: '', value: '' }) {
    const container = document.getElementById('conversion-rules-container');
    const row = document.createElement('div');
    row.className = 'conversion-rule-row';

    const unitSelect = document.createElement('select');
    unitSelect.className = 'rule-unit-select';
    const allUnits = (appState.references.standardUnits || []).filter(u => u !== document.getElementById('inventory-item-default-unit').value);
    populateReferenceDropdown(unitSelect, allUnits, 'Vælg enhed', rule.unit);

    row.innerHTML = `
        <div class="input-group">
            <input type="number" class="rule-quantity-input" value="1" disabled>
        </div>
        <div class="input-group">
        </div>
        <span>=</span>
        <div class="input-group">
            <input type="number" class="rule-value-input" placeholder="Værdi" value="${rule.value || ''}">
        </div>
        <span class="rule-base-unit-label">${document.getElementById('inventory-item-default-unit').value}</span>
        <button type="button" class="btn-icon delete-rule-btn" title="Fjern regel"><i class="fas fa-trash"></i></button>
    `;
    row.querySelector('.input-group:nth-child(2)').appendChild(unitSelect);
    container.appendChild(row);
}
