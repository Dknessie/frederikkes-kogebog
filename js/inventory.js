// js/inventory.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, arrayUnion, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { debounce, normalizeUnit } from './utils.js';
import { addToShoppingList } from './shoppingList.js';

let appState;
let appElements;
let inventoryState = {
    searchTerm: '',
    activeFilter: 'all',
    activeLocation: 'all'
};

export function initInventory(state, elements) {
    appState = state;
    appElements = elements;

    appElements.addInventoryItemBtn.addEventListener('click', () => openEditModal(null));
    appElements.reorderAssistantBtn.addEventListener('click', openReorderAssistant);
    appElements.buyWholeCheckbox.addEventListener('change', () => {
        appElements.buyWholeOptions.classList.toggle('hidden', !appElements.buyWholeCheckbox.checked);
    });
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
}

export function renderInventory() {
    let items = appState.inventory;
    if (inventoryState.searchTerm) {
        items = items.filter(item => item.name.toLowerCase().includes(inventoryState.searchTerm));
    }
    if (inventoryState.activeFilter === 'low') {
        items = items.filter(item => item.max_stock > 0 && (item.current_stock || 0) < item.max_stock / 2);
    }
    if (inventoryState.activeFilter === 'critical') {
        items = items.filter(item => item.is_critical);
    }

    renderLocationTabs();
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

function renderLocationTabs() {
    const tabsContainer = appElements.inventoryLocationTabs;
    const locations = [...new Set(appState.inventory.map(item => item.home_location || 'Ukendt'))].sort();
    
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

    items.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
        const itemRow = document.createElement('div');
        itemRow.className = 'inventory-item-row';
        
        const criticalIcon = item.is_critical ? `<i class="fas fa-fire-alt critical-item-icon" title="Kritisk vare"></i>` : '';
        const stockPercentage = (item.current_stock && item.max_stock) ? (item.current_stock / item.max_stock) * 100 : 100;
        let stockColor = '#4CAF50';
        if (stockPercentage < 50) stockColor = '#FFC107';
        if (stockPercentage < 20) stockColor = '#F44336';

        let stockStatus = { text: 'På lager', className: 'status-ok' };
        if (item.max_stock && item.max_stock > 0) {
            const stockLevel = item.current_stock || 0;
            if (stockLevel === 0) {
                stockStatus = { text: 'Tom', className: 'status-critical' };
            } else if (stockLevel < item.max_stock / 2) {
                stockStatus = { text: 'Lav', className: 'status-low' };
            }
        } else {
            stockStatus = { text: '-', className: 'status-unknown' };
        }

        itemRow.innerHTML = `
            <div class="item-name-cell">${criticalIcon}<span>${item.name || ''}</span></div>
            <div class="stock-display">
                <div class="stock-bar"><div class="stock-level" style="width: ${stockPercentage}%; background-color: ${stockColor};"></div></div>
                <span>${item.current_stock || 0} ${item.unit || ''}</span>
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

export function renderInventorySummary() {
    let totalValue = 0;
    let totalGrams = 0;
    appState.inventory.forEach(item => {
        if (item.grams_in_stock) {
            totalGrams += item.grams_in_stock;
            if (item.kg_price) {
                totalValue += (item.grams_in_stock / 1000) * item.kg_price;
            }
        }
    });
    appElements.inventorySummaryCard.innerHTML = `
        <h3>Lagerstatus</h3>
        <div class="summary-item">
            <span>Samlet lagerværdi</span>
            <span class="summary-value">${totalValue.toFixed(2)} kr.</span>
        </div>
        <div class="summary-item">
            <span>Samlet vægt på lager</span>
            <span class="summary-value">${(totalGrams / 1000).toFixed(2)} kg</span>
        </div>
    `;
}

async function handleSaveItem(e) {
    e.preventDefault();
    const itemId = document.getElementById('inventory-item-id').value;
    
    const itemName = document.getElementById('item-name').value.trim();
    const itemDescription = document.getElementById('item-description').value.trim();
    const itemCategory = document.getElementById('item-category').value;
    const itemLocation = document.getElementById('item-home-location').value;
    const itemUnit = document.getElementById('item-unit').value;

    const quantity = parseFloat(document.getElementById('item-current-stock').value) || 0;
    const gramsPerUnit = parseFloat(document.getElementById('item-grams-per-unit').value) || null;
    let gramsInStock = 0;
    if (normalizeUnit(itemUnit) === 'g') {
        gramsInStock = quantity;
    } else if (gramsPerUnit) {
        gramsInStock = quantity * gramsPerUnit;
    }

    const itemData = {
        name: itemName,
        description: itemDescription,
        category: itemCategory,
        home_location: itemLocation,
        current_stock: quantity,
        max_stock: Number(document.getElementById('item-max-stock').value) || null,
        unit: itemUnit,
        kg_price: Number(document.getElementById('item-kg-price').value) || null,
        grams_per_unit: gramsPerUnit,
        grams_in_stock: gramsInStock,
        is_critical: document.getElementById('item-is-critical').checked,
        buy_as_whole_unit: document.getElementById('item-buy-whole').checked,
        aliases: (document.getElementById('item-aliases').value || '').split(',').map(a => a.trim()).filter(a => a),
        purchase_unit: null
    };

    if (itemData.buy_as_whole_unit) {
        const purchaseUnitName = (document.getElementById('item-buy-unit-name').value || '').trim();
        const purchaseUnitQuantity = parseFloat(document.getElementById('item-buy-unit-quantity').value) || null;
        if (purchaseUnitName && purchaseUnitQuantity) {
            itemData.purchase_unit = { name: purchaseUnitName, quantity: purchaseUnitQuantity };
        }
    }

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


function openEditModal(item) {
    appElements.inventoryItemForm.reset();
    appElements.inventoryModalTitle.textContent = item ? 'Rediger vare' : 'Tilføj ny vare';

    // Populate dropdowns from references
    populateReferenceDropdown(document.getElementById('item-category'), appState.references.itemCategories, 'Vælg kategori...', item?.category);
    populateReferenceDropdown(document.getElementById('item-home-location'), appState.references.itemLocations, 'Vælg placering...', item?.home_location);
    populateReferenceDropdown(document.getElementById('item-unit'), appState.references.standardUnits, 'Vælg enhed...', item?.unit);
    
    if (item) {
        document.getElementById('inventory-item-id').value = item.id;
        document.getElementById('item-name').value = item.name || '';
        document.getElementById('item-description').value = item.description || '';
        document.getElementById('item-current-stock').value = item.current_stock || 0;
        document.getElementById('item-max-stock').value = item.max_stock || '';
        document.getElementById('item-grams-per-unit').value = item.grams_per_unit || '';
        document.getElementById('item-kg-price').value = item.kg_price || '';
        document.getElementById('item-aliases').value = (item.aliases || []).join(', ');
        document.getElementById('item-is-critical').checked = item.is_critical || false;
        appElements.buyWholeCheckbox.checked = item.buy_as_whole_unit || false;
        if (item.purchase_unit) {
            document.getElementById('item-buy-unit-name').value = item.purchase_unit.name || '';
            document.getElementById('item-buy-unit-quantity').value = item.purchase_unit.quantity || '';
        }
    } else {
        document.getElementById('inventory-item-id').value = '';
    }
    appElements.buyWholeOptions.classList.toggle('hidden', !appElements.buyWholeCheckbox.checked);
    appElements.inventoryItemModal.classList.remove('hidden');
}

function openReorderAssistant() {
    const itemsToReorder = appState.inventory.filter(item => {
        if (!item.max_stock || item.max_stock <= 0) return false;
        const stockLevel = item.current_stock || 0;
        return stockLevel < item.max_stock / 2;
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
            return `
                <div class="reorder-item">
                    <input type="checkbox" id="reorder-${item.id}" name="reorder-item" value="${item.id}" data-needed="${needed}" checked>
                    <label for="reorder-${item.id}">
                        <span class="item-name">${item.name}</span>
                        ${item.is_critical ? '<i class="fas fa-fire-alt critical-item-icon" title="Kritisk vare"></i>' : ''}
                        <span class="stock-info">(${item.current_stock} / ${item.max_stock} ${item.unit})</span>
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
                    unit: item.unit,
                    store_section: item.category
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
