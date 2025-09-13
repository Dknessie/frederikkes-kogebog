// js/inventory.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, query, where, getDocs, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { debounce, formatDate } from './utils.js';
import { openReorderAssistantModal } from './shoppingList.js';

let appState;
let appElements;
let onBatchSaveSuccessCallback = null;

// Lokal state for den nye varelager-side
let inventoryState = {
    searchTerm: '',
    selectedCategory: '',
    // Holder styr på sortering for hver lokation, f.eks. { Fryser: 'expiry', Køleskab: 'alpha' }
    locationSort: {},
};
// State for impulse purchase modal
let impulseState = {
    selectedItem: null,
    searchTerm: ''
};


export function initInventory(state, elements) {
    appState = state;
    appElements = elements;

    // ----- MODAL EVENT LISTENERS -----
    // Knappen på dashboardet, som ikke findes på selve inventory-siden
    if (appElements.addInventoryItemBtn) {
        appElements.addInventoryItemBtn.addEventListener('click', () => openInventoryItemModal(null));
    }
    appElements.inventoryItemForm.addEventListener('submit', handleSaveInventoryItem);

    const deleteBtn = document.getElementById('delete-inventory-item-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', handleDeleteInventoryItem);

    const addConversionBtn = document.getElementById('add-conversion-rule-btn');
    const conversionRulesContainer = document.getElementById('conversion-rules-container');
    if (addConversionBtn) addConversionBtn.addEventListener('click', () => addConversionRuleRow());
    if (conversionRulesContainer) conversionRulesContainer.addEventListener('click', e => {
        if (e.target.closest('.delete-rule-btn')) {
            e.target.closest('.conversion-rule-row').remove();
        }
    });
    const mainCategorySelectModal = document.getElementById('inventory-item-main-category');
    if (mainCategorySelectModal) {
        mainCategorySelectModal.addEventListener('change', () => {
            populateSubCategoryDropdown(document.getElementById('inventory-item-sub-category'), mainCategorySelectModal.value);
        });
    }

    // ----- NYE EVENT LISTENERS FOR REDESIGN -----
    if (appElements.inventorySearch) {
        appElements.inventorySearch.addEventListener('input', debounce(e => {
            inventoryState.searchTerm = e.target.value.toLowerCase();
            renderInventory();
        }, 300));
    }
    if (appElements.inventoryMainCatFilter) {
        appElements.inventoryMainCatFilter.addEventListener('change', e => {
            inventoryState.selectedCategory = e.target.value;
            renderInventory();
        });
    }
    if (appElements.inventoryMainContentContainer) {
        appElements.inventoryMainContentContainer.addEventListener('click', handleMainContentClick);
        appElements.inventoryMainContentContainer.addEventListener('change', handleSortChange);
    }
    if (appElements.favoriteItemsList) {
        appElements.favoriteItemsList.addEventListener('click', handleFavoriteWidgetClick);
    }

    // Tilslut knapperne i sidebaren
    if (appElements.inventoryImpulsePurchaseBtn) appElements.inventoryImpulsePurchaseBtn.addEventListener('click', openImpulsePurchaseModal);
    if (appElements.inventoryReorderAssistantBtn) appElements.inventoryReorderAssistantBtn.addEventListener('click', handleReorderAssistantClick);
    if (appElements.inventoryUseInCookbookBtn) appElements.inventoryUseInCookbookBtn.addEventListener('click', () => {
        showNotification({ title: "Kommer Snart", message: "Funktionen til at finde opskrifter baseret på lager er under udvikling." })
    });

    // Batch management
    const addBatchBtn = document.getElementById('add-batch-btn');
    const batchListContainer = document.getElementById('batch-list-container');
    const batchEditModal = document.getElementById('batch-edit-modal');
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
            const itemId = document.getElementById('inventory-item-id').value;
            const batchId = editBtn.dataset.batchId;
            openBatchModal(itemId, batchId);
        }
    });
    if(batchEditForm) batchEditForm.addEventListener('submit', handleSaveBatch);
    if(deleteBatchBtn) deleteBatchBtn.addEventListener('click', handleDeleteBatch);
    if (batchEditModal) {
        batchEditModal.addEventListener('click', (e) => {
            if (e.target.matches('.modal-overlay') || e.target.matches('.close-modal-btn')) {
                onBatchSaveSuccessCallback = null;
            }
        });
    }

    // Impulse Purchase
    appElements.impulsePurchaseForm.addEventListener('submit', handleImpulseAction);
    const impulseSearchInput = document.getElementById('impulse-item-search');
    if (impulseSearchInput) {
        impulseSearchInput.addEventListener('input', debounce(handleImpulseSearch, 200));
        impulseSearchInput.addEventListener('blur', () => {
            setTimeout(() => {
                document.getElementById('impulse-item-suggestions').innerHTML = '';
            }, 150);
        });
    }

    // Quick Stock Adjust
    if (appElements.quickStockAdjustForm) {
        appElements.quickStockAdjustForm.addEventListener('submit', handleQuickStockUpdate);
    }
}


export function renderInventory() {
    if (!appElements.inventoryMainContentContainer) return;

    // ----- Sidebar -----
    populateCategoryFilter();
    renderFavoritesWidget();
    const totalValue = (appState.inventory || []).reduce((sum, item) => {
        return sum + (item.batches || []).reduce((batchSum, batch) => batchSum + (batch.price || 0), 0);
    }, 0);
    appElements.inventoryTotalValueDisplay.textContent = `${totalValue.toFixed(2).replace('.', ',')} kr.`;

    // ----- Main Content -----
    const container = appElements.inventoryMainContentContainer;
    container.innerHTML = '';

    let filteredItems = [...(appState.inventory || [])];
    if (inventoryState.searchTerm) {
        filteredItems = filteredItems.filter(item => item.name.toLowerCase().includes(inventoryState.searchTerm));
    }
    if (inventoryState.selectedCategory) {
        filteredItems = filteredItems.filter(item => item.mainCategory === inventoryState.selectedCategory);
    }

    const itemsByLocation = filteredItems.reduce((acc, item) => {
        const location = item.location || 'Ukendt Placering';
        if (!acc[location]) acc[location] = [];
        acc[location].push(item);
        return acc;
    }, {});

    const locationOrder = ['Fryser', 'Køleskab', 'Køkkenskab'];
    const sortedLocations = Object.keys(itemsByLocation).sort((a, b) => {
        const indexA = locationOrder.indexOf(a);
        const indexB = locationOrder.indexOf(b);
        if (indexA === -1 && indexB === -1) return a.localeCompare(b);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    if (sortedLocations.length === 0) {
        container.innerHTML = `<p class="empty-state">Ingen varer fundet, der matcher dine filtre.</p>`;
        return;
    }

    sortedLocations.forEach(location => {
        const items = itemsByLocation[location];
        container.insertAdjacentHTML('beforeend', createLocationCard(location, items));
    });
}

function createLocationCard(location, items) {
    const iconClass = {
        'Fryser': 'fa-snowflake',
        'Køleskab': 'fa-carrot',
        'Køkkenskab': 'fa-door-closed'
    }[location] || 'fa-box';

    const sortKey = inventoryState.locationSort[location] || 'alpha';
    items.sort((a, b) => {
        if (sortKey === 'expiry') {
            const expiryA = getEarliestExpiry(a.batches);
            const expiryB = getEarliestExpiry(b.batches);
            if (!expiryA) return 1;
            if (!expiryB) return -1;
            return expiryA - expiryB;
        }
        return a.name.localeCompare(b.name); // 'alpha'
    });
    
    const tableRows = items.map(createItemRow).join('');
    
    return `
        <details class="storage-location-card" open>
            <summary>
                <div class="storage-header"><h2><i class="fas ${iconClass}"></i> ${location}</h2></div>
                <div class="storage-header-controls">
                    <div class="sort-control">
                        <select title="Sortér varer" data-location="${location}">
                            <option value="alpha" ${sortKey === 'alpha' ? 'selected' : ''}>Sortér A-Å</option>
                            <option value="expiry" ${sortKey === 'expiry' ? 'selected' : ''}>Sortér efter holdbarhed</option>
                        </select>
                    </div>
                    <span class="item-count">${items.length} varer</span>
                    <i class="fas fa-chevron-down toggle-icon"></i>
                </div>
            </summary>
            <div class="item-table-container">
                <table class="item-table">
                    <thead><tr><th style="width: 40%;">Vare</th><th style="width: 20%;">Beholdning</th><th style="width: 25%;">Holdbarhed/Udløb</th><th style="width: 15%;"></th></tr></thead>
                    <tbody>${tableRows || `<tr><td colspan="4" class="empty-list-message">Ingen varer her.</td></tr>`}</tbody>
                </table>
            </div>
        </details>
    `;
}

function createItemRow(item) {
    const { statusColor, statusTitle } = getStockStatus(item);
    const earliestExpiry = getEarliestExpiry(item.batches);
    const { expiryHTML } = getExpiryInfo(earliestExpiry, item.location);
    const quantityDisplay = formatQuantity(item);
    const isFavorite = item.is_favorite || false;

    return `
        <tr data-id="${item.id}">
            <td class="item-name-cell">
                <div class="item-stock-status-dot" style="background-color: ${statusColor};" title="${statusTitle}"></div>
                <span class="item-name">${item.name}</span>
            </td>
            <td class="quantity-cell">${quantityDisplay}</td>
            <td>${expiryHTML}</td>
            <td class="actions-cell">
                <button class="btn-icon favorite-btn ${isFavorite ? 'is-favorite' : ''}" title="${isFavorite ? 'Fjern fra' : 'Tilføj til'} favoritter"><i class="${isFavorite ? 'fas' : 'far'} fa-star"></i></button>
                <button class="btn-icon edit-btn" title="Rediger varekort"><i class="fas fa-edit"></i></button>
            </td>
        </tr>
    `;
}

function renderFavoritesWidget() {
    const list = appElements.favoriteItemsList;
    const favoriteItems = (appState.inventory || []).filter(item => item.is_favorite);

    if (favoriteItems.length === 0) {
        list.innerHTML = `<li class="empty-state-small" style="text-align: left;">Ingen favoritter valgt.</li>`;
        return;
    }

    list.innerHTML = favoriteItems.map(item => {
        const { statusColor } = getStockStatus(item);
        const quantityDisplay = formatQuantity(item);
        return `
            <li class="favorite-item" data-id="${item.id}">
                <div class="favorite-item-name">
                    <div class="item-stock-status-dot" style="background-color: ${statusColor};"></div>
                    <span>${item.name}</span>
                </div>
                <div class="favorite-item-actions">
                     <span>${quantityDisplay}</span>
                    <button class="btn-icon add-to-cart-btn" title="Tilføj til indkøbsliste"><i class="fas fa-cart-plus"></i></button>
                </div>
            </li>
        `;
    }).join('');
}


// ----- HJÆLPEFUNKTIONER & LOGIK -----

function getStockStatus(item) {
    const { totalStock = 0, reorderPoint = 0 } = item;
    if (totalStock <= 0) return { statusColor: 'var(--status-red)', statusTitle: 'Udsolgt' };
    if (reorderPoint > 0 && totalStock <= reorderPoint) return { statusColor: 'var(--status-yellow)', statusTitle: 'Lav beholdning' };
    return { statusColor: 'var(--status-green)', statusTitle: 'På lager' };
}

function getEarliestExpiry(batches) {
    if (!batches || batches.length === 0) return null;
    const validDates = batches.map(b => b.expiryDate ? new Date(b.expiryDate) : null).filter(Boolean);
    if (validDates.length === 0) return null;
    return new Date(Math.min(...validDates));
}

function getExpiryInfo(earliestExpiry, location) {
    if (!earliestExpiry) return { expiryHTML: '-' };
    
    if (location === 'Fryser') {
        // Her skal logik for frysevarers holdbarhed implementeres baseret på indstillinger i 'Referencer'
        return { expiryHTML: `Udløber ${earliestExpiry.toLocaleDateString('da-DK')}` };
    }

    const today = new Date();
    today.setHours(0,0,0,0);
    const daysLeft = Math.ceil((earliestExpiry - today) / (1000 * 60 * 60 * 24));
    let colorClass = '';
    if (daysLeft <= 0) colorClass = 'status-red';
    else if (daysLeft <= 7) colorClass = 'status-yellow';
    
    const expiryHTML = `<span class="${colorClass}">${earliestExpiry.toLocaleDateString('da-DK', {day: '2-digit', month: 'short', year: 'numeric'})}</span>`;
    return { expiryHTML };
}

function formatQuantity(item) {
    if (!item.totalStock || item.totalStock <= 0) return '0';
    // Round to avoid floating point inaccuracies
    const totalStock = Math.round(item.totalStock * 100) / 100;
    return `${totalStock} ${item.defaultUnit}`;
}


function populateCategoryFilter() {
    const select = appElements.inventoryMainCatFilter;
    if (!select) return;
    const mainCategories = [...new Set((appState.references.itemCategories || []).map(cat => (typeof cat === 'string' ? cat : cat.name)))];
    select.innerHTML = '<option value="">Alle Kategorier</option>';
    mainCategories.sort().forEach(cat => select.add(new Option(cat, cat)));
    select.value = inventoryState.selectedCategory;
}

// ----- EVENT HANDLERS -----

async function handleMainContentClick(e) {
    const row = e.target.closest('tr[data-id]');
    if (!row) return;
    const itemId = row.dataset.id;
    
    if (e.target.closest('.edit-btn')) {
        openInventoryItemModal(itemId);
    } else if (e.target.closest('.favorite-btn')) {
        await toggleFavorite(itemId);
    } else if (e.target.closest('.quantity-cell')) {
        openQuickStockAdjustModal(itemId);
    }
}


function handleReorderAssistantClick() {
    const itemsToReorder = (appState.inventory || []).filter(item => {
        return item.reorderPoint && item.reorderPoint > 0 && item.totalStock <= item.reorderPoint;
    });

    if (itemsToReorder.length === 0) {
        showNotification({ title: "Alt er fyldt op!", message: "Der er ingen varer, der er under genbestillingspunktet." });
        return;
    }

    openReorderAssistantModal(itemsToReorder);
}


function handleFavoriteWidgetClick(e) {
    const item = e.target.closest('.favorite-item');
    if (!item) return;
    if (e.target.closest('.add-to-cart-btn')) {
        showNotification({ title: "Kommer Snart", message: "Funktionen til at tilføje direkte til indkøbskurv er under udvikling." });
    }
}

function handleSortChange(e) {
    if (e.target.matches('select[data-location]')) {
        const location = e.target.dataset.location;
        const newSortKey = e.target.value;
        inventoryState.locationSort[location] = newSortKey;
        renderInventory();
    }
}

async function toggleFavorite(itemId) {
    const item = appState.inventory.find(i => i.id === itemId);
    if (!item) return;
    try {
        await updateDoc(doc(db, 'inventory_items', itemId), { is_favorite: !item.is_favorite });
    } catch (error) {
        handleError(error, "Kunne ikke opdatere favoritstatus.", "toggleFavorite");
    }
}

// ----- MODAL FUNKTIONER -----

function openInventoryItemModal(itemId, prefillName = '') {
    const form = appElements.inventoryItemForm;
    form.reset();
    document.getElementById('conversion-rules-container').innerHTML = '';
    document.getElementById('batch-list-container').innerHTML = '';
    
    const item = itemId ? appState.inventory.find(p => p.id === itemId) : null;
    appElements.inventoryModalTitle.textContent = item ? 'Rediger Vare' : 'Opret Ny Vare';
    
    document.getElementById('inventory-item-id').value = item ? item.id : '';
    document.getElementById('inventory-item-name').value = item ? item.name : prefillName;
    document.getElementById('inventory-item-default-unit').value = item ? item.defaultUnit : 'g';
    document.getElementById('inventory-item-reorder-point').value = item ? item.reorderPoint || '' : '';
    document.getElementById('delete-inventory-item-btn').style.display = item ? 'inline-flex' : 'none';
    document.getElementById('add-batch-btn').style.display = item ? 'inline-flex' : 'none';
    
    if (item?.conversion_rules) {
        for (const unit in item.conversion_rules) {
            addConversionRuleRow({ unit, value: item.conversion_rules[unit] });
        }
    }
    
    renderBatchListInModal(item?.batches || []);

    populateMainCategoryDropdown(document.getElementById('inventory-item-main-category'), item?.mainCategory);
    populateSubCategoryDropdown(document.getElementById('inventory-item-sub-category'), item?.mainCategory, item?.subCategory);
    populateReferenceDropdown(document.getElementById('inventory-item-location'), appState.references.itemLocations, 'Vælg placering...', item?.location);
    
    appElements.inventoryItemModal.classList.remove('hidden');
}

async function handleSaveInventoryItem(e) {
    e.preventDefault();
    const itemId = document.getElementById('inventory-item-id').value;
    const conversionRules = {};
    document.getElementById('conversion-rules-container').querySelectorAll('.conversion-rule-row').forEach(row => {
        const unit = row.querySelector('.rule-unit-select').value;
        const value = parseFloat(row.querySelector('.rule-value-input').value);
        if (unit && value > 0) conversionRules[unit] = value;
    });

    const itemData = {
        name: document.getElementById('inventory-item-name').value.trim(),
        mainCategory: document.getElementById('inventory-item-main-category').value,
        subCategory: document.getElementById('inventory-item-sub-category').value,
        location: document.getElementById('inventory-item-location').value,
        defaultUnit: document.getElementById('inventory-item-default-unit').value,
        reorderPoint: Number(document.getElementById('inventory-item-reorder-point').value) || null,
        conversion_rules: conversionRules,
        userId: appState.currentUser.uid,
        is_favorite: appState.inventory.find(i => i.id === itemId)?.is_favorite || false,
    };

    if (!itemData.name || !itemData.mainCategory || !itemData.subCategory || !itemData.location) {
        return handleError({message: "Udfyld venligst alle påkrævede felter."}, "Ufuldstændige data");
    }

    try {
        if (itemId) {
            await updateDoc(doc(db, 'inventory_items', itemId), itemData);
        } else {
            await addDoc(collection(db, 'inventory_items'), itemData);
        }
        appElements.inventoryItemModal.classList.add('hidden');
        showNotification({ title: 'Gemt!', message: 'Varens informationer er gemt.' });
    } catch (error) {
        handleError(error, "Varen kunne ikke gemmes.");
    }
}

async function handleDeleteInventoryItem() {
    const itemId = document.getElementById('inventory-item-id').value;
    if (!itemId) return;
    const confirmed = await showNotification({ type: 'confirm', title: "Slet Vare", message: "Sikker på du vil slette denne vare og ALLE dens batches?" });
    if (!confirmed) return;

    try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'inventory_items', itemId));
        const q = query(collection(db, 'inventory_batches'), where("itemId", "==", itemId));
        const batchSnapshot = await getDocs(q);
        batchSnapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        appElements.inventoryItemModal.classList.add('hidden');
        showNotification({ title: 'Slettet', message: 'Varen er slettet.' });
    } catch (error) { handleError(error, "Varen kunne ikke slettes."); }
}

function renderBatchListInModal(batches) {
    const container = document.getElementById('batch-list-container');
    container.innerHTML = (!batches || batches.length === 0)
        ? '<p class="empty-state-small">Ingen batches registreret.</p>'
        : batches.map(b => `
            <div class="batch-item">
                <span class="batch-info">Udløber: ${b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('da-DK') : 'N/A'}</span>
                <span class="batch-info">Antal: ${b.quantity} x ${b.size}${b.unit}</span>
                <span class="batch-info">Pris: ${b.price ? `${b.price.toFixed(2)} kr.` : 'N/A'}</span>
                <button class="btn-icon edit-batch-btn" data-batch-id="${b.id}" title="Rediger batch"><i class="fas fa-edit"></i></button>
            </div>`).join('');
}


function addConversionRuleRow(rule = {}) {
    const container = document.getElementById('conversion-rules-container');
    const row = document.createElement('div');
    row.className = 'conversion-rule-row';
    row.innerHTML = `
        <div class="input-group"><input type="number" class="rule-quantity-input" value="1" disabled></div>
        <div class="input-group"><select class="rule-unit-select"></select></div>
        <span>=</span>
        <div class="input-group"><input type="number" class="rule-value-input" placeholder="Værdi" value="${rule.value || ''}"></div>
        <span class="rule-base-unit-label">${document.getElementById('inventory-item-default-unit').value}</span>
        <button type="button" class="btn-icon delete-rule-btn" title="Fjern regel"><i class="fas fa-trash"></i></button>`;
    
    const unitSelect = row.querySelector('.rule-unit-select');
    const allUnits = (appState.references.standardUnits || []).filter(u => u !== document.getElementById('inventory-item-default-unit').value);
    populateReferenceDropdown(unitSelect, allUnits, 'Vælg enhed', rule.unit);
    
    container.appendChild(row);
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

function openImpulsePurchaseModal() {
    appElements.impulsePurchaseForm.reset();
    impulseState.selectedItem = null;
    impulseState.searchTerm = '';
    updateImpulseActionButton();
    appElements.impulsePurchaseModal.classList.remove('hidden');
    setTimeout(() => document.getElementById('impulse-item-search').focus(), 100);
}


export function openBatchModal(itemId, batchId, onSaveSuccess) {
    onBatchSaveSuccessCallback = onSaveSuccess || null;
    const form = document.getElementById('batch-edit-form');
    form.reset();
    
    const item = appState.inventory.find(i => i.id === itemId);
    if (!item) {
        return handleError(new Error("Vare ikke fundet"), "Kan ikke åbne batch-modal.");
    }

    const batch = batchId ? appState.inventoryBatches.find(b => b.id === batchId) : null;

    document.getElementById('batch-edit-item-id').value = itemId;
    document.getElementById('batch-edit-unit').value = item.defaultUnit || 'stk';
    document.getElementById('batch-edit-size-unit').textContent = item.defaultUnit || 'stk';
    
    const modal = document.getElementById('batch-edit-modal');
    modal.querySelector('h3').textContent = batch ? `Rediger Batch for ${item.name}` : `Nyt Batch for ${item.name}`;
    document.getElementById('batch-edit-batch-id').value = batchId || '';
    document.getElementById('batch-edit-purchase-date').value = batch?.purchaseDate || formatDate(new Date());
    document.getElementById('batch-edit-expiry-date').value = batch?.expiryDate || '';
    document.getElementById('batch-edit-quantity').value = batch?.quantity || 1;
    document.getElementById('batch-edit-size').value = batch?.size || '';
    document.getElementById('batch-edit-price').value = batch?.price || '';
    document.getElementById('delete-batch-btn').style.display = batch ? 'inline-flex' : 'none';

    modal.classList.remove('hidden');
}

async function handleSaveBatch(e) {
    e.preventDefault();
    const itemId = document.getElementById('batch-edit-item-id').value;
    const batchId = document.getElementById('batch-edit-batch-id').value;
    
    const batchData = {
        itemId,
        userId: appState.currentUser.uid,
        purchaseDate: document.getElementById('batch-edit-purchase-date').value,
        expiryDate: document.getElementById('batch-edit-expiry-date').value || null,
        quantity: Number(document.getElementById('batch-edit-quantity').value),
        size: Number(document.getElementById('batch-edit-size').value),
        unit: document.getElementById('batch-edit-unit').value,
        price: Number(document.getElementById('batch-edit-price').value) || null,
    };

    if (!batchData.purchaseDate || batchData.quantity <= 0 || batchData.size <= 0) {
        return showNotification({title: "Udfyld påkrævede felter", message: "Dato, antal og størrelse er påkrævet."});
    }

    try {
        if (batchId) {
            await updateDoc(doc(db, 'inventory_batches', batchId), batchData);
        } else {
            await addDoc(collection(db, 'inventory_batches'), batchData);
        }
        document.getElementById('batch-edit-modal').classList.add('hidden');
        showNotification({title: "Batch Gemt", message: "Dit batch er blevet gemt."});

        if (onBatchSaveSuccessCallback) {
            onBatchSaveSuccessCallback(itemId);
        }
        onBatchSaveSuccessCallback = null;
    } catch (error) {
        handleError(error, "Batchet kunne ikke gemmes.", "handleSaveBatch");
    }
}

async function handleDeleteBatch() {
    const batchId = document.getElementById('batch-edit-batch-id').value;
    if (!batchId) return;
    const confirmed = await showNotification({type: 'confirm', title: "Slet Batch", message: "Er du sikker?"});
    if (!confirmed) return;
    try {
        await deleteDoc(doc(db, 'inventory_batches', batchId));
        document.getElementById('batch-edit-modal').classList.add('hidden');
        showNotification({title: "Batch Slettet", message: "Batchet er blevet fjernet."});

        // Opdater varekort-modalen, hvis den er åben
        const itemId = document.getElementById('inventory-item-id').value;
        if(itemId) {
            const item = appState.inventory.find(i => i.id === itemId);
            renderBatchListInModal(item.batches.filter(b => b.id !== batchId));
        }

    } catch (error) {
        handleError(error, "Batchet kunne ikke slettes.", "handleDeleteBatch");
    }
}

async function handleImpulseAction(e) {
    e.preventDefault();
    appElements.impulsePurchaseModal.classList.add('hidden');

    const handleSaveAndAddBatch = async (event) => {
        // Stopper standard form-submit
        if (event) event.preventDefault();
        
        // Gemmer den nye vare
        const newItemId = await handleSaveInventoryItemFromImpulse();
        
        // Fjerner den midlertidige submit-handler
        appElements.inventoryItemForm.removeEventListener('submit', handleSaveAndAddBatch);
        
        if (newItemId) {
            // Lukker varekort-modalen og åbner batch-modalen for den nye vare
            appElements.inventoryItemModal.classList.add('hidden');
            openBatchModal(newItemId, null);
        }
    };

    if (impulseState.selectedItem) {
        openBatchModal(impulseState.selectedItem.id, null);
    } else if (impulseState.searchTerm) {
        // Sætter en midlertidig submit-handler på varekortet
        appElements.inventoryItemForm.addEventListener('submit', handleSaveAndAddBatch);
        openInventoryItemModal(null, impulseState.searchTerm);
    }
}

async function handleSaveInventoryItemFromImpulse() {
    const itemData = {
        name: document.getElementById('inventory-item-name').value.trim(),
        mainCategory: document.getElementById('inventory-item-main-category').value,
        subCategory: document.getElementById('inventory-item-sub-category').value,
        location: document.getElementById('inventory-item-location').value,
        defaultUnit: document.getElementById('inventory-item-default-unit').value,
        userId: appState.currentUser.uid,
    };
    if (!itemData.name || !itemData.mainCategory || !itemData.subCategory || !itemData.location) {
        showNotification({ title: "Udfyld påkrævede felter", message: "Udfyld venligst alle felter for at oprette varen." });
        return null;
    }
    try {
        const docRef = await addDoc(collection(db, 'inventory_items'), itemData);
        return docRef.id;
    } catch (error) {
        handleError(error, "Varen kunne ikke oprettes.", "saveItemFromImpulse");
        return null;
    }
}


function handleImpulseSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    impulseState.searchTerm = e.target.value;
    impulseState.selectedItem = null;
    const suggestionsContainer = document.getElementById('impulse-item-suggestions');
    suggestionsContainer.innerHTML = '';
    
    if (searchTerm.length > 0) {
        appState.inventory
            .filter(item => item.name.toLowerCase().includes(searchTerm))
            .slice(0, 5)
            .forEach(item => {
                const div = document.createElement('div');
                div.className = 'autocomplete-suggestion';
                div.textContent = item.name;
                div.addEventListener('mousedown', () => selectImpulseItem(item));
                suggestionsContainer.appendChild(div);
            });
    }
    updateImpulseActionButton();
}

function selectImpulseItem(item) {
    impulseState.selectedItem = item;
    impulseState.searchTerm = item.name;
    document.getElementById('impulse-item-search').value = item.name;
    document.getElementById('impulse-item-suggestions').innerHTML = '';
    updateImpulseActionButton();
}

function updateImpulseActionButton() {
    const btn = document.getElementById('impulse-action-btn');
    if (impulseState.selectedItem) {
        btn.textContent = 'Tilføj Batch til Lager';
        btn.disabled = false;
    } else if (impulseState.searchTerm.length > 1) {
        btn.textContent = `Opret "${impulseState.searchTerm}" & Tilføj Batch`;
        btn.disabled = false;
    } else {
        btn.textContent = 'Søg efter en vare';
        btn.disabled = true;
    }
}

// NY FUNKTION: Åbner modal for hurtig lagerjustering
function openQuickStockAdjustModal(itemId) {
    const item = appState.inventory.find(i => i.id === itemId);
    if (!item) return;

    const modal = appElements.quickStockAdjustModal;
    document.getElementById('quick-stock-modal-title').textContent = `Juster Beholdning: ${item.name}`;
    document.getElementById('quick-stock-item-id').value = item.id;
    document.getElementById('quick-stock-unit-label').textContent = item.defaultUnit;
    const input = document.getElementById('quick-stock-new-total');
    input.value = item.totalStock || 0;
    
    modal.classList.remove('hidden');
    setTimeout(() => input.select(), 10);
}

// NY FUNKTION: Håndterer den "intelligente" opdatering af batches
async function handleQuickStockUpdate(e) {
    e.preventDefault();
    const itemId = document.getElementById('quick-stock-item-id').value;
    const newTotalStock = parseFloat(document.getElementById('quick-stock-new-total').value);
    
    const item = appState.inventory.find(i => i.id === itemId);
    if (!item || isNaN(newTotalStock) || newTotalStock < 0) {
        return showNotification({title: "Ugyldigt input", message: "Indtast venligst en gyldig beholdning."});
    }

    const currentTotalStock = item.totalStock || 0;
    const difference = newTotalStock - currentTotalStock;

    if (difference === 0) {
        appElements.quickStockAdjustModal.classList.add('hidden');
        return;
    }

    try {
        if (difference > 0) {
            // Tilføj et nyt batch med differencen
            const lastBatch = [...item.batches].sort((a,b) => new Date(b.purchaseDate) - new Date(a.purchaseDate))[0];
            const newBatchData = {
                itemId: itemId,
                userId: appState.currentUser.uid,
                purchaseDate: formatDate(new Date()),
                expiryDate: null,
                quantity: 1, // Altid 1 stk for simplicitet ved hurtig tilføjelse
                size: difference,
                unit: item.defaultUnit,
                price: lastBatch ? (lastBatch.price / lastBatch.quantity) * (difference / lastBatch.size) : null,
            };
            if (item.defaultUnit === 'stk') {
                newBatchData.quantity = difference;
                newBatchData.size = 1;
            }
            await addDoc(collection(db, 'inventory_batches'), newBatchData);
        } else {
            // Fjern fra lager, startende med de ældste batches
            let amountToRemove = Math.abs(difference);
            const sortedBatches = [...item.batches].sort((a,b) => {
                const dateA = a.expiryDate ? new Date(a.expiryDate) : new Date(a.purchaseDate);
                const dateB = b.expiryDate ? new Date(b.expiryDate) : new Date(b.purchaseDate);
                return dateA - dateB;
            });

            const batch = writeBatch(db);

            for (const b of sortedBatches) {
                if (amountToRemove <= 0) break;
                
                const batchStock = (b.quantity || 0) * (b.size || 0);
                const removalAmount = Math.min(amountToRemove, batchStock);
                
                const newBatchStock = batchStock - removalAmount;
                if (newBatchStock > 0) {
                    const newQuantity = newBatchStock / b.size;
                    batch.update(doc(db, 'inventory_batches', b.id), { quantity: newQuantity });
                } else {
                    batch.delete(doc(db, 'inventory_batches', b.id));
                }
                amountToRemove -= removalAmount;
            }
            await batch.commit();
        }
        
        appElements.quickStockAdjustModal.classList.add('hidden');
        showNotification({ title: "Lager Opdateret", message: `${item.name} er justeret til ${newTotalStock} ${item.defaultUnit}.` });
    } catch (error) {
        handleError(error, "Lageret kunne ikke opdateres.", "quickStockUpdate");
    }
}

