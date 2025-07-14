// js/inventory.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { debounce, normalizeUnit } from './utils.js';

let appState;
let appElements;

export function initInventory(state, elements) {
    appState = state;
    appElements = elements;

    appElements.addInventoryItemBtn.addEventListener('click', () => {
        openEditModal(null); // Pass null to indicate a new item
    });

    appElements.buyWholeCheckbox.addEventListener('change', () => {
        appElements.buyWholeOptions.classList.toggle('hidden', !appElements.buyWholeCheckbox.checked);
    });

    appElements.inventoryItemForm.addEventListener('submit', handleSaveItem);

    appElements.inventoryTableBody.addEventListener('click', handleTableClick);
    
    const debouncedGuess = debounce(guessItemDetails, 400);
    document.getElementById('item-name').addEventListener('input', (e) => {
        if (!document.getElementById('inventory-item-id').value) {
            debouncedGuess(e.target.value);
        }
    });
}

export function renderInventory() {
    const items = appState.inventory;
    const fragment = document.createDocumentFragment();
    appElements.inventoryTableBody.innerHTML = ''; 

    if (items.length === 0) {
         appElements.inventoryTableBody.innerHTML = `<tr><td colspan="8">Dit varelager er tomt. Tilføj en vare for at starte.</td></tr>`;
         return;
    }
    
    items.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
        const tr = document.createElement('tr');
        tr.dataset.id = item.id;
        
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

        tr.innerHTML = `
            <td>${item.name || ''}</td>
            <td>
                <div class="stock-display">
                    <div class="stock-bar"><div class="stock-level" style="width: ${stockPercentage}%; background-color: ${stockColor};"></div></div>
                    <span>${item.current_stock || 0} ${item.unit || ''}</span>
                </div>
            </td>
            <td><span class="status-badge ${stockStatus.className}">${stockStatus.text}</span></td>
            <td>${item.category || ''}</td>
            <td>${item.kg_price ? `${item.kg_price.toFixed(2)} kr.` : ''}</td>
            <td>${item.grams_per_unit || ''}</td>
            <td>${item.home_location || ''}</td>
            <td><button class="btn-icon edit-item"><i class="fas fa-edit"></i></button> <button class="btn-icon delete-item"><i class="fas fa-trash"></i></button></td>`;
        fragment.appendChild(tr);
    });
    appElements.inventoryTableBody.appendChild(fragment);
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
    
    const quantity = parseFloat(document.getElementById('item-current-stock').value) || 0;
    const unit = (document.getElementById('item-unit').value || '').trim();
    const gramsPerUnit = parseFloat(document.getElementById('item-grams-per-unit').value) || null;

    let gramsInStock = 0;
    if (normalizeUnit(unit) === 'g') {
        gramsInStock = quantity;
    } else if (gramsPerUnit) {
        gramsInStock = quantity * gramsPerUnit;
    }

    const aliases = (document.getElementById('item-aliases').value || '').split(',').map(a => a.trim()).filter(a => a);
    const buyAsWhole = document.getElementById('item-buy-whole').checked;

    const itemData = {
        name: (document.getElementById('item-name').value || '').trim(),
        description: (document.getElementById('item-description').value || '').trim(),
        category: document.getElementById('item-category').value,
        home_location: document.getElementById('item-home-location').value,
        current_stock: quantity,
        max_stock: Number(document.getElementById('item-max-stock').value) || null,
        unit: unit,
        kg_price: Number(document.getElementById('item-kg-price').value) || null,
        grams_per_unit: gramsPerUnit,
        grams_in_stock: gramsInStock,
        buy_as_whole_unit: buyAsWhole,
        aliases: aliases,
        purchase_unit: null
    };

    if (buyAsWhole) {
        const purchaseUnitName = (document.getElementById('item-buy-unit-name').value || '').trim();
        const purchaseUnitQuantity = parseFloat(document.getElementById('item-buy-unit-quantity').value) || null;
        if (purchaseUnitName && purchaseUnitQuantity) {
            itemData.purchase_unit = {
                name: purchaseUnitName,
                quantity: purchaseUnitQuantity
            };
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

async function handleTableClick(e) {
    const target = e.target.closest('button');
    if (!target) return;
    const docId = target.closest('tr').dataset.id;
    
    if (target.classList.contains('delete-item')) {
        const confirmed = await showNotification({ title: "Slet Vare", message: `Er du sikker på, at du vil slette denne vare? Handlingen kan ikke fortrydes.`, type: 'confirm' });
        if (confirmed) {
            try {
                await deleteDoc(doc(db, 'inventory_items', docId));
            } catch (error) { handleError(error, "Varen kunne ikke slettes.", "deleteInventoryItem"); }
        }
    }

    if (target.classList.contains('edit-item')) {
        const item = appState.inventory.find(i => i.id === docId);
        if (item) {
            openEditModal(item);
        }
    }
}

function populateReferenceDropdowns() {
    const categorySelect = document.getElementById('item-category');
    const locationSelect = document.getElementById('item-home-location');

    // Clear existing options
    categorySelect.innerHTML = '<option value="">Vælg kategori...</option>';
    locationSelect.innerHTML = '<option value="">Vælg placering...</option>';

    // Populate categories
    const categories = appState.references.itemCategories || [];
    categories.forEach(cat => {
        const option = new Option(cat, cat);
        categorySelect.add(option);
    });

    // Populate locations
    const locations = appState.references.itemLocations || [];
    locations.forEach(loc => {
        const option = new Option(loc, loc);
        locationSelect.add(option);
    });
}


function openEditModal(item) {
    // Først, fyld dropdowns med de nyeste referencer
    populateReferenceDropdowns();
    
    // Nulstil formularen og sæt titel
    appElements.inventoryItemForm.reset();
    appElements.inventoryModalTitle.textContent = item ? 'Rediger vare' : 'Tilføj ny vare';
    
    // Udfyld formularen, hvis vi redigerer en eksisterende vare
    if (item) {
        document.getElementById('inventory-item-id').value = item.id;
        document.getElementById('item-name').value = item.name || '';
        document.getElementById('item-description').value = item.description || '';
        document.getElementById('item-category').value = item.category || '';
        document.getElementById('item-home-location').value = item.home_location || '';
        document.getElementById('item-current-stock').value = item.current_stock || 0;
        document.getElementById('item-max-stock').value = item.max_stock || '';
        document.getElementById('item-unit').value = item.unit || '';
        document.getElementById('item-kg-price').value = item.kg_price || '';
        document.getElementById('item-grams-per-unit').value = item.grams_per_unit || '';
        document.getElementById('item-aliases').value = (item.aliases || []).join(', ');
        
        appElements.buyWholeCheckbox.checked = item.buy_as_whole_unit || false;

        if (item.purchase_unit) {
            document.getElementById('item-buy-unit-name').value = item.purchase_unit.name || '';
            document.getElementById('item-buy-unit-quantity').value = item.purchase_unit.quantity || '';
        }
    } else {
        // Sikrer at ID-feltet er tomt for nye varer
        document.getElementById('inventory-item-id').value = '';
    }

    // Håndter synlighed af "køb hel"-sektionen
    appElements.buyWholeOptions.classList.toggle('hidden', !appElements.buyWholeCheckbox.checked);

    // Til sidst, vis modalen
    appElements.inventoryItemModal.classList.remove('hidden');
}

function guessItemDetails(itemName) {
    const existingItem = appState.inventory.find(item => item.name.toLowerCase() === itemName.toLowerCase());
    if (existingItem) {
        document.getElementById('item-description').value = existingItem.description || '';
        document.getElementById('item-category').value = existingItem.category || '';
        document.getElementById('item-home-location').value = existingItem.home_location || '';
        document.getElementById('item-unit').value = existingItem.unit || '';
        document.getElementById('item-grams-per-unit').value = existingItem.grams_per_unit || '';
        document.getElementById('item-aliases').value = (existingItem.aliases || []).join(', ');
    }
}
