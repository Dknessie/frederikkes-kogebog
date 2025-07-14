// js/inventory.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { debounce, formatDate } from './utils.js';
import { addToShoppingList } from './shoppingList.js';

let appState;
let appElements;
let inventoryState = {
    searchTerm: '',
    activeFilter: 'all',
    activeCategories: new Set(),
    sortBy: 'name_asc'
};

export function initInventory(state, elements) {
    appState = state;
    appElements = elements;

    appElements.addInventoryItemBtn.addEventListener('click', () => openEditModal(null));
    appElements.reorderAssistantBtn.addEventListener('click', openReorderAssistant);
    
    appElements.inventoryItemForm.addEventListener('submit', handleSaveItem);
    appElements.reorderForm.addEventListener('submit', handleReorderSubmit);

    appElements.inventorySearchInput.addEventListener('input', debounce(e => {
        inventoryState.searchTerm = e.target.value.toLowerCase();
        renderInventory();
    }, 300));

    appElements.inventoryFilterButtons.addEventListener('click', e => {
        const button = e.target.closest('button');
        if (button) {
            inventoryState.activeFilter = button.dataset.filter;
            appElements.inventoryFilterButtons.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            renderInventory();
        }
    });

    document.getElementById('advanced-filter-btn').addEventListener('click', () => {
        document.getElementById('advanced-filter-panel').classList.toggle('hidden');
    });

    document.getElementById('filter-category-container').addEventListener('change', e => {
        if (e.target.type === 'checkbox') {
            if (e.target.checked) {
                inventoryState.activeCategories.add(e.target.value);
            } else {
                inventoryState.activeCategories.delete(e.target.value);
            }
            renderInventory();
        }
    });

    document.getElementById('sort-inventory-by').addEventListener('change', e => {
        inventoryState.sortBy = e.target.value;
        renderInventory();
    });

    appElements.inventoryLocationTabs.addEventListener('click', e => {
        const tab = e.target.closest('.location-tab');
        if (tab) {
            inventoryState.activeLocation = tab.dataset.location;
            renderInventory();
        }
    });

    appElements.inventoryListContainer.addEventListener('click', e => {
        const button = e.target.closest('button');
        if (!button) return;
    
        if (button.classList.contains('edit-item')) {
            const item = appState.inventory.find(i => i.id === button.dataset.id);
            if (item) openEditModal(item);
        }
        if (button.classList.contains('delete-item')) {
            handleDeleteItem(button.dataset.id);
        }
    });
    
    document.getElementById('add-conversion-rule-btn').addEventListener('click', () => addConversionRuleRow());
    document.getElementById('conversion-rules-container').addEventListener('click', e => {
        if (e.target.closest('.delete-rule-btn')) {
            e.target.closest('.conversion-rule-row').remove();
        }
    });
    
    document.getElementById('unprocessed-items-container').addEventListener('click', e => {
        const button = e.target.closest('button');
        if(!button) return;

        const itemName = button.dataset.itemName;
        const item = appState.inventory.find(inv => inv.name.toLowerCase() === itemName.toLowerCase());
        
        if (button.classList.contains('create-item-from-unprocessed-btn')) {
            openEditModal(null, itemName);
        } else if (button.classList.contains('update-item-from-unprocessed-btn')) {
            openEditModal(item);
        }
    });

    document.getElementById('add-batch-btn').addEventListener('click', () => addBatchRow());
    document.getElementById('item-batches-container').addEventListener('click', (e) => {
        if (e.target.closest('.delete-batch-btn')) {
            e.target.closest('.batch-row').remove();
        }
    });
}

function renderUnprocessedItems() {
    const unprocessedItemsContainer = document.getElementById('unprocessed-items-container');
    const unprocessedItemsSection = document.getElementById('unprocessed-items-section');
    const unprocessedItems = Object.values(appState.shoppingList).filter(item => item.is_unprocessed);

    unprocessedItemsContainer.innerHTML = '';
    if(unprocessedItems.length > 0) {
        unprocessedItems.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'unprocessed-item';
            
            const existingItem = appState.inventory.find(inv => inv.name.toLowerCase() === item.name.toLowerCase());
            let buttonHTML = '';
            if (existingItem) {
                buttonHTML = `<button class="btn btn-secondary btn-sm update-item-from-unprocessed-btn" data-item-name="${item.name}">Opdater Konvertering</button>`;
            } else {
                buttonHTML = `<button class="btn btn-primary btn-sm create-item-from-unprocessed-btn" data-item-name="${item.name}">+ Opret i Varelager</button>`;
            }

            itemDiv.innerHTML = `<span>${item.name}</span> ${buttonHTML}`;
            unprocessedItemsContainer.appendChild(itemDiv);
        });
        unprocessedItemsSection.classList.remove('hidden');
    } else {
        unprocessedItemsSection.classList.add('hidden');
    }
}

export function renderInventory() {
    renderUnprocessedItems();
    renderAdvancedFilterOptions();

    let items = [...appState.inventory];
    
    // Filtering
    if (inventoryState.searchTerm) {
        const term = inventoryState.searchTerm;
        items = items.filter(item => item.name.toLowerCase().includes(term) || (item.aliases || []).some(a => a.toLowerCase().includes(term)));
    }
    if (inventoryState.activeFilter === 'low') {
        items = items.filter(item => item.max_stock > 0 && (item.current_stock || 0) < item.max_stock);
    }
    if (inventoryState.activeFilter === 'expiring') {
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(new Date().getDate() + 7);
        items = items.filter(item => item.batches && item.batches.some(b => b.expiry_date && new Date(b.expiry_date) <= sevenDaysFromNow));
    }
    if (inventoryState.activeCategories.size > 0) {
        items = items.filter(item => inventoryState.activeCategories.has(item.category));
    }

    // Sorting
    items.sort((a, b) => {
        switch (inventoryState.sortBy) {
            case 'name_desc':
                return b.name.localeCompare(a.name);
            case 'stock_asc':
                const stockA = a.max_stock > 0 ? (a.current_stock / a.max_stock) : 1;
                const stockB = b.max_stock > 0 ? (b.current_stock / b.max_stock) : 1;
                return stockA - stockB;
            case 'expiry_asc':
                const expiryA = a.batches?.[0]?.expiry_date || '9999-12-31';
                const expiryB = b.batches?.[0]?.expiry_date || '9999-12-31';
                return new Date(expiryA) - new Date(expiryB);
            case 'name_asc':
            default:
                return a.name.localeCompare(b.name);
        }
    });

    renderLocationTabs(items);
    const container = appElements.inventoryListContainer;
    container.innerHTML = '';
    
    const groupedItems = groupBy(items, 'home_location');
    
    const locationsToRender = inventoryState.activeLocation === 'all' 
        ? Object.keys(groupedItems).sort()
        : (groupedItems[inventoryState.activeLocation] ? [inventoryState.activeLocation] : []);

    locationsToRender.forEach(location => {
        renderItemGroup(container, location, groupedItems[location]);
    });

    if (container.innerHTML === '') {
        container.innerHTML = `<p class="empty-state">Ingen varer matcher dine filtre.</p>`;
    }
}

function renderAdvancedFilterOptions() {
    const container = document.getElementById('filter-category-container');
    container.innerHTML = '';
    const categories = [...new Set(appState.inventory.map(i => i.category).filter(Boolean))].sort();
    categories.forEach(cat => {
        const isChecked = inventoryState.activeCategories.has(cat);
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" value="${cat}" ${isChecked ? 'checked' : ''}> ${cat}`;
        container.appendChild(label);
    });
}

function renderLocationTabs(filteredItems) {
    const tabsContainer = appElements.inventoryLocationTabs;
    const locations = [...new Set(filteredItems.map(item => item.home_location || 'Ukendt'))].sort();
    
    tabsContainer.innerHTML = `<button class="location-tab ${inventoryState.activeLocation === 'all' ? 'active' : ''}" data-location="all">Alle</button>`;
    
    locations.forEach(location => {
        const tab = document.createElement('button');
        tab.className = `location-tab ${inventoryState.activeLocation === location ? 'active' : ''}`;
        tab.dataset.location = location;
        tab.textContent = location;
        tabsContainer.appendChild(tab);
    });
}

function renderItemGroup(container, location, items) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'inventory-group';
    
    const header = document.createElement('h4');
    header.className = 'inventory-group-header';
    header.textContent = location;
    groupDiv.appendChild(header);

    items.forEach(item => {
        const itemRow = document.createElement('div');
        itemRow.className = 'inventory-item-row';
        
        const criticalIcon = item.is_critical ? `<i class="fas fa-fire-alt critical-item-icon" title="Kritisk vare"></i>` : '';
        const stockPercentage = (item.current_stock && item.max_stock) ? (item.current_stock / item.max_stock) * 100 : 0;
        let stockColor = '#4CAF50';
        if (stockPercentage < 50) stockColor = '#FFC107';
        if (stockPercentage < 20) stockColor = '#F44336';

        let stockStatus = { text: 'På lager', className: 'status-ok' };
        if (item.max_stock && item.max_stock > 0) {
            const stockLevel = item.current_stock || 0;
            if (stockLevel === 0) {
                stockStatus = { text: 'Tom', className: 'status-critical' };
            } else if (stockLevel < item.max_stock) {
                stockStatus = { text: 'Lav', className: 'status-low' };
            }
        } else {
            stockStatus = { text: '-', className: 'status-unknown' };
        }
        
        const displayStock = `${(item.current_stock || 0).toFixed(1).replace(/\.0$/, '')} ${item.display_unit || 'g'}`;

        itemRow.innerHTML = `
            <div class="item-name-cell">${criticalIcon}<span>${item.name || ''}</span></div>
            <div class="stock-display">
                <div class="stock-bar"><div class="stock-level" style="width: ${stockPercentage}%; background-color: ${stockColor};"></div></div>
                <span>${displayStock}</span>
            </div>
            <div><span class="status-badge ${stockStatus.className}">${stockStatus.text}</span></div>
            <div>${item.category || ''}</div>
            <div class="inventory-item-actions">
                <button class="btn-icon edit-item" data-id="${item.id}"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete-item" data-id="${item.id}"><i class="fas fa-trash"></i></button>
            </div>
        `;
        groupDiv.appendChild(itemRow);
    });
    container.appendChild(groupDiv);
}

function groupBy(array, key) {
    return array.reduce((result, currentValue) => {
        (result[currentValue[key] || 'Ukendt'] = result[currentValue[key] || 'Ukendt'] || []).push(currentValue);
        return result;
    }, {});
}

async function handleSaveItem(e) {
    e.preventDefault();
    const itemId = document.getElementById('inventory-item-id').value;
    
    const conversionRules = {};
    document.querySelectorAll('#conversion-rules-container .conversion-rule-row').forEach(row => {
        const unit = row.querySelector('.rule-unit-select').value;
        const grams = parseFloat(row.querySelector('.rule-grams-input').value);
        if (unit && grams > 0) {
            conversionRules[unit] = grams;
        }
    });

    const batches = [];
    let totalGrams = 0;
    let totalStock = 0;
    document.querySelectorAll('#item-batches-container .batch-row').forEach(row => {
        const quantity = parseFloat(row.querySelector('.batch-quantity-input').value) || 0;
        const expiryDate = row.querySelector('.batch-expiry-input').value;
        if (quantity > 0) {
            batches.push({
                id: row.dataset.id || crypto.randomUUID(),
                quantity: quantity,
                expiry_date: expiryDate
            });
            totalStock += quantity;
        }
    });

    const displayUnitRadio = document.querySelector('input[name="display-unit-radio"]:checked');
    const displayUnit = displayUnitRadio ? displayUnitRadio.value : 'g';
    const gramsPerDisplayUnit = conversionRules[displayUnit] || (displayUnit === 'g' ? 1 : 0);
    totalGrams = totalStock * gramsPerDisplayUnit;
    
    const itemName = document.getElementById('item-name').value.trim();
    if (!itemName) {
        showNotification({title: "Manglende Navn", message: "Varen skal have et navn."});
        return;
    }

    const itemData = {
        name: itemName,
        description: document.getElementById('item-description').value.trim(),
        category: document.getElementById('item-category').value,
        home_location: document.getElementById('item-home-location').value,
        batches: batches.sort((a,b) => new Date(a.expiry_date) - new Date(b.expiry_date)),
        current_stock: totalStock,
        grams_in_stock: totalGrams,
        display_unit: displayUnit,
        conversion_rules: conversionRules,
        max_stock: Number(document.getElementById('item-max-stock').value) || null,
        kg_price: Number(document.getElementById('item-kg-price').value) || null,
        is_critical: document.getElementById('item-is-critical').checked,
        aliases: (document.getElementById('item-aliases').value || '').split(',').map(a => a.trim()).filter(a => a),
        buy_as_whole_unit: document.getElementById('item-buy-whole').checked,
        purchase_size_grams: Number(document.getElementById('item-purchase-size-grams').value) || null,
    };

    try {
        if (itemId) {
            await updateDoc(doc(db, 'inventory_items', itemId), itemData);
        } else {
            await addDoc(collection(db, 'inventory_items'), itemData);
        }
        
        appElements.inventoryItemModal.classList.add('hidden');
    } catch (error) {
        handleError(error, "Varen kunne ikke gemmes.", "saveInventoryItem");
    }
}

async function handleDeleteItem(docId) {
    const confirmed = await showNotification({ title: "Slet Vare", message: `Er du sikker på, at du vil slette denne vare?`, type: 'confirm' });
    if (confirmed) {
        try {
            await deleteDoc(doc(db, 'inventory_items', docId));
        } catch (error) { handleError(error, "Varen kunne ikke slettes.", "deleteInventoryItem"); }
    }
}

function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    selectElement.value = currentValue || "";
}

function addConversionRuleRow(rule = { unit: '', grams: '' }) {
    if (rule.unit === 'g') return;
    const container = document.getElementById('conversion-rules-container');
    const row = document.createElement('div');
    row.className = 'conversion-rule-row';

    const unitSelect = document.createElement('select');
    unitSelect.className = 'rule-unit-select';
    const units = appState.references.standardUnits.filter(u => u !== 'g');
    populateReferenceDropdown(unitSelect, units, 'Vælg enhed', rule.unit);

    row.innerHTML = `
        <div class="input-group">
            <input type="radio" name="display-unit-radio" value="${rule.unit || ''}" title="Vælg som standardenhed for lager">
        </div>
        <div class="input-group">
            <!-- Unit select is inserted here -->
        </div>
        <div class="input-group">
            <input type="number" class="rule-grams-input" placeholder="Gram" value="${rule.grams || ''}">
        </div>
        <button type="button" class="btn-icon delete-rule-btn" title="Fjern regel"><i class="fas fa-trash"></i></button>
    `;
    row.querySelector('.input-group:nth-child(2)').appendChild(unitSelect);
    
    unitSelect.addEventListener('change', () => {
        row.querySelector('input[type="radio"]').value = unitSelect.value;
    });

    container.appendChild(row);
}

function addBatchRow(batch = { quantity: '', expiry_date: ''}) {
    const container = document.getElementById('item-batches-container');
    const row = document.createElement('div');
    row.className = 'batch-row';
    row.dataset.id = batch.id || crypto.randomUUID();

    row.innerHTML = `
        <div class="input-group">
            <label>Antal</label>
            <input type="number" class="batch-quantity-input" value="${batch.quantity}">
        </div>
        <div class="input-group">
            <label>Udløbsdato</label>
            <input type="date" class="batch-expiry-input" value="${batch.expiry_date}">
        </div>
        <button type="button" class="btn-icon delete-batch-btn" title="Fjern batch"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);
}


function openEditModal(item, prefilledName = null) {
    appElements.inventoryItemForm.reset();
    document.getElementById('conversion-rules-container').innerHTML = '';
    document.getElementById('item-batches-container').innerHTML = '';
    appElements.inventoryModalTitle.textContent = item ? 'Rediger vare' : 'Tilføj ny vare';

    populateReferenceDropdown(document.getElementById('item-category'), appState.references.itemCategories, 'Vælg kategori...', item?.category);
    populateReferenceDropdown(document.getElementById('item-home-location'), appState.references.itemLocations, 'Vælg placering...', item?.home_location);
    
    if (item) {
        document.getElementById('inventory-item-id').value = item.id;
        document.getElementById('item-name').value = item.name || '';
        document.getElementById('item-description').value = item.description || '';
        document.getElementById('item-max-stock').value = item.max_stock || '';
        document.getElementById('item-kg-price').value = item.kg_price || '';
        document.getElementById('item-aliases').value = (item.aliases || []).join(', ');
        document.getElementById('item-is-critical').checked = item.is_critical || false;
        document.getElementById('item-buy-whole').checked = item.buy_as_whole_unit || false;
        document.getElementById('item-purchase-size-grams').value = item.purchase_size_grams || '';
        
        const rules = item.conversion_rules || {};
        for (const unit in rules) {
            addConversionRuleRow({ unit: unit, grams: rules[unit] });
        }
        
        const displayUnit = item.display_unit || 'g';
        const radioToSelect = document.querySelector(`input[name="display-unit-radio"][value="${displayUnit}"]`);
        if (radioToSelect) {
            radioToSelect.checked = true;
        }

        if (item.batches && item.batches.length > 0) {
            item.batches.forEach(batch => addBatchRow(batch));
        } else {
            addBatchRow({ quantity: item.current_stock || 0, expiry_date: '' });
        }

    } else {
        document.getElementById('inventory-item-id').value = '';
        document.getElementById('item-name').value = prefilledName || '';
        addBatchRow();
    }
    
    appElements.inventoryItemModal.classList.remove('hidden');
}

function openReorderAssistant() {
    const itemsToReorder = appState.inventory.filter(item => {
        if (!item.max_stock || item.max_stock <= 0) return false;
        const stockLevel = item.current_stock || 0;
        return stockLevel < item.max_stock;
    });
    const container = appElements.reorderListContainer;
    container.innerHTML = '';
    if (itemsToReorder.length === 0) {
        container.innerHTML = '<p>Godt gået! Der er ingen varer med lav beholdning.</p>';
        return;
    }
    const criticalItems = itemsToReorder.filter(item => item.is_critical);
    const otherItems = itemsToReorder.filter(item => !item.is_critical);
    const createSection = (title, items) => {
        if (items.length === 0) return '';
        let itemsHTML = items.map(item => {
            const needed = (item.max_stock || 0) - (item.current_stock || 0);
            if (needed <= 0) return '';
            return `
                <div class="reorder-item">
                    <input type="checkbox" id="reorder-${item.id}" name="reorder-item" value="${item.id}" data-needed="${needed}" checked>
                    <label for="reorder-${item.id}">
                        <span class="item-name">${item.name}</span>
                        ${item.is_critical ? '<i class="fas fa-fire-alt critical-item-icon" title="Kritisk vare"></i>' : ''}
                        <span class="stock-info">(${item.current_stock.toFixed(1).replace(/\.0$/,'')} / ${item.max_stock} ${item.display_unit || 'g'})</span>
                    </label>
                </div>
            `;
        }).join('');
        return `<div class="reorder-category"><h4>${title}</h4>${itemsHTML}</div>`;
    };
    container.innerHTML = createSection('Kritiske Varer', criticalItems) + createSection('Andre Varer', otherItems);
    appElements.reorderAssistantModal.classList.remove('hidden');
}

async function handleReorderSubmit(e) {
    e.preventDefault();
    const selectedItems = [];
    appElements.reorderForm.querySelectorAll('input[name="reorder-item"]:checked').forEach(checkbox => {
        const item = appState.inventory.find(i => i.id === checkbox.value);
        if (item) {
            const needed = parseFloat(checkbox.dataset.needed) || 0;
            if (needed > 0) {
                selectedItems.push({
                    name: item.name,
                    quantity: needed,
                    unit: item.display_unit || 'g',
                });
            }
        }
    });
    if (selectedItems.length > 0) {
        await addToShoppingList(selectedItems, 'Genbestillings-assistenten');
        appElements.reorderAssistantModal.classList.add('hidden');
    } else {
        showNotification({title: "Intet valgt", message: "Vælg venligst mindst én vare at tilføje."});
    }
}
