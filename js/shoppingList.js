// js/shoppingList.js

import { db } from './firebase.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { getWeekNumber, getStartOfWeek, formatDate, convertToGrams } from './utils.js';
import { openBatchModal } from './inventory.js';

let appState;
let appElements;
let currentListType = 'groceries'; // To track which list is open in the modal

export function initShoppingList(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        shoppingListModal: document.getElementById('shopping-list-modal'),
        shoppingListModalTitle: document.getElementById('shopping-list-modal-title'),
        shoppingListModalContentWrapper: document.getElementById('shopping-list-modal-content-wrapper'),
    };

    appElements.generateGroceriesBtn.addEventListener('click', generateGroceriesList);
    
    // Modal listeners
    appElements.shoppingListModal.addEventListener('click', (e) => {
        if (e.target.closest('.shopping-list-clear-btn')) {
            handleClearShoppingList();
        } else if (e.target.closest('.shopping-list-confirm-btn')) {
            handleConfirmPurchase();
        } else if (e.target.closest('.remove-from-list-btn')) {
            const itemName = e.target.closest('[data-item-name]').dataset.itemName;
            handleRemoveShoppingItem(itemName);
        } else if (e.target.matches('.shopping-list-checkbox')) {
            const listItem = e.target.closest('.shopping-list-item');
            listItem.classList.toggle('is-checked');
        }
    });

    appElements.shoppingListModal.addEventListener('submit', (e) => {
        if (e.target.matches('.add-item-form')) {
            e.preventDefault();
            const input = e.target.querySelector('input');
            const itemName = input.value.trim();
            if (itemName) {
                handleAddShoppingItem(itemName);
                input.value = '';
            }
        }
    });
}

export function openShoppingListModal(listType) {
    currentListType = listType;
    const titles = {
        groceries: 'Indkøbsliste - Dagligvarer',
        materials: 'Indkøbsliste - Materialer & Værktøj',
        wishlist: 'Ønskeliste'
    };
    appElements.shoppingListModalTitle.textContent = titles[listType];
    
    const modalContent = appElements.shoppingListModal.querySelector('.modal-content');
    modalContent.className = 'modal-content'; // Reset classes
    modalContent.classList.add(`shopping-list-theme-${listType}`);

    renderListInModal();
    appElements.shoppingListModal.classList.remove('hidden');
}

function renderListInModal() {
    const wrapper = appElements.shoppingListModalContentWrapper;
    const list = appState.shoppingLists[currentListType] || {};
    wrapper.innerHTML = ''; // Clear previous content

    switch (currentListType) {
        case 'groceries':
            wrapper.innerHTML = renderGroceriesList(list);
            break;
        case 'materials':
            wrapper.innerHTML = renderMaterialsList(list);
            break;
        case 'wishlist':
            wrapper.innerHTML = renderWishlist(list);
            break;
    }
}

function renderGroceriesList(list) {
    const groupedByStore = {};
    Object.values(list).forEach(item => {
        const store = item.storeId || 'Andet';
        if (!groupedByStore[store]) groupedByStore[store] = [];
        groupedByStore[store].push(item);
    });

    if (Object.keys(groupedByStore).length === 0) {
        return `<p class="empty-state">Indkøbslisten er tom.</p>${getModalFooter()}`;
    }

    let html = '';
    const storeOrder = [appState.preferences.favoriteStoreId, ...Object.keys(groupedByStore).filter(s => s !== appState.preferences.favoriteStoreId).sort()];
    
    storeOrder.forEach(store => {
        if (groupedByStore[store]) {
            html += `<div class="store-section"><h4>${store}</h4><ul>`;
            groupedByStore[store].sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
                const safeItemName = item.name.replace(/[^a-zA-Z0-9]/g, '-');
                html += `
                    <li class="shopping-list-item" data-item-name="${item.name}">
                        <input type="checkbox" id="shop-${safeItemName}" class="shopping-list-checkbox">
                        <label for="shop-${safeItemName}" class="shopping-list-item-label">${item.name} <span>(${item.quantity_to_buy} ${item.unit})</span></label>
                        <button class="btn-icon remove-from-list-btn" title="Fjern fra liste"><i class="fas fa-times-circle"></i></button>
                    </li>`;
            });
            html += `</ul></div>`;
        }
    });

    html += getModalFooter();
    return html;
}

function renderMaterialsList(list) {
    const groupedByProject = {};
     Object.values(list).forEach(item => {
        const project = item.projectId || 'Generelle Materialer';
        if (!groupedByProject[project]) groupedByProject[project] = [];
        groupedByProject[project].push(item);
    });

    if (Object.keys(groupedByProject).length === 0) {
        return `<p class="empty-state">Materialelisten er tom.</p>${getModalFooter()}`;
    }

    let html = '';
    for (const projectId in groupedByProject) {
        const projectName = appState.projects.find(p => p.id === projectId)?.title || projectId;
        html += `<div class="project-group"><h4>${projectName}</h4>`;
        html += `
            <div class="material-row material-header">
                <span>Materiale</span>
                <span>Antal</span>
                <span>Butik</span>
                <span>Pris</span>
            </div>
        `;
        groupedByProject[projectId].forEach(item => {
            html += `
                <div class="material-row" data-item-name="${item.name}">
                    <span class="material-name">${item.name}</span>
                    <span>${item.quantity_to_buy} ${item.unit || ''}</span>
                    <span>${item.storeId || 'N/A'}</span>
                    <span>${item.price ? `${item.price.toFixed(2)} kr.` : 'N/A'}</span>
                </div>
            `;
        });
        html += `</div>`;
    }
    html += getModalFooter();
    return html;
}

function renderWishlist(list) {
    const items = Object.values(list);
    if (items.length === 0) {
        return `<p class="empty-state">Ønskelisten er tom.</p>${getModalFooter(true)}`;
    }

    let html = '<div class="wishlist-grid">';
    items.forEach(item => {
        const imageUrl = item.imageUrl || `https://placehold.co/200x150/f3f0e9/d1603d?text=${encodeURIComponent(item.name)}`;
        html += `
            <div class="wishlist-card" data-item-name="${item.name}">
                <a href="${item.url || '#'}" target="_blank" rel="noopener noreferrer">
                    <img src="${imageUrl}" alt="${item.name}" class="wishlist-card-image" onerror="this.onerror=null;this.src='https://placehold.co/200x150/f3f0e9/d1603d?text=Billede+mangler';">
                    <div class="wishlist-card-content">
                        <span class="wishlist-card-title">${item.name}</span>
                        ${item.price ? `<span class="wishlist-card-price">${item.price.toFixed(2)} kr.</span>` : ''}
                    </div>
                </a>
                <div class="wishlist-card-actions">
                    <button class="btn-icon remove-from-list-btn" title="Fjern ønske"><i class="fas fa-times"></i></button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    html += getModalFooter(true); // isWishlist = true
    return html;
}

function getModalFooter(isWishlist = false) {
    const confirmText = isWishlist ? "Marker som købt" : "Bekræft Indkøb";
    return `
        <div class="shopping-list-actions form-actions">
            <button class="btn btn-secondary shopping-list-clear-btn"><i class="fas fa-trash"></i> Ryd Liste</button>
            ${!isWishlist ? `<button class="btn btn-primary shopping-list-confirm-btn"><i class="fas fa-check"></i> ${confirmText}</button>` : ''}
        </div>
        <form class="add-item-form">
            <input type="text" placeholder="Tilføj ${isWishlist ? 'ønske' : 'vare'}..." required>
            <button type="submit" class="btn-icon"><i class="fas fa-plus-circle"></i></button>
        </form>
    `;
}


async function updateShoppingListInFirestore(listType, newList) {
    if (!appState.currentUser) return;
    try {
        const shoppingListRef = doc(db, 'shopping_lists', appState.currentUser.uid);
        await setDoc(shoppingListRef, { [listType]: newList }, { merge: true });
    } catch (error) {
        handleError(error, "Indkøbslisten kunne ikke gemmes.", "updateShoppingList");
    }
}

async function generateGroceriesList() {
    const start = getStartOfWeek(appState.currentDate); 
    const allIngredientsNeeded = {};

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(start);
        dayDate.setDate(start.getDate() + i); 
        const dateString = formatDate(dayDate);
        const dayPlan = appState.mealPlan[dateString];

        if (dayPlan) {
            for (const mealType in dayPlan) {
                for (const meal of dayPlan[mealType]) {
                    if (meal.type === 'recipe') {
                        const recipe = appState.recipes.find(r => r.id === meal.recipeId);
                        if (recipe && recipe.ingredients) {
                            const scaleFactor = (meal.portions || recipe.portions || 1) / (recipe.portions || 1);
                            for (const ing of recipe.ingredients) {
                                const key = ing.name.toLowerCase();
                                if (!allIngredientsNeeded[key]) {
                                    allIngredientsNeeded[key] = { total: 0, unit: ing.unit, name: ing.name };
                                }
                                allIngredientsNeeded[key].total += (ing.quantity || 0) * scaleFactor;
                            }
                        }
                    }
                }
            }
        }
    }

    if (Object.keys(allIngredientsNeeded).length === 0) {
        showNotification({title: "Tom Madplan", message: "Der er ingen opskrifter på madplanen for denne uge."});
        return;
    }
    
    const shoppingList = {};
    for (const ingKey in allIngredientsNeeded) {
        const needed = allIngredientsNeeded[ingKey];
        const inventoryItem = appState.inventory.find(item => item.name.toLowerCase() === ingKey);

        if (!inventoryItem) {
            shoppingList[ingKey] = { name: needed.name, quantity_to_buy: Math.ceil(needed.total), unit: needed.unit, storeId: 'Ukendt Vare', itemId: null };
            continue;
        }

        const conversion = convertToGrams(needed.total, needed.unit, inventoryItem);
        if (conversion.error) {
            shoppingList[ingKey] = { name: needed.name, quantity_to_buy: Math.ceil(needed.total), unit: needed.unit, storeId: 'Konv. Fejl', itemId: inventoryItem.id };
            continue;
        }

        const neededInBaseUnit = conversion.grams;
        const toBuyInBaseUnit = Math.max(0, neededInBaseUnit - (inventoryItem.totalStock || 0));

        if (toBuyInBaseUnit > 0) {
            const representativeBatch = inventoryItem.batches
                .filter(b => b.size > 0)
                .sort((a,b) => (a.price/a.size) - (b.price/b.size))[0];
            
            const purchaseSize = representativeBatch?.size || 1;
            const purchaseUnit = representativeBatch?.unit || inventoryItem.defaultUnit;
            const storeId = representativeBatch?.store || appState.preferences.favoriteStoreId || 'Ukendt';
            const pricePerUnit = representativeBatch?.price ? (representativeBatch.price / representativeBatch.quantity) : 0;
            
            let quantityToBuy = 1;
            if (inventoryItem.defaultUnit !== 'stk') {
                 quantityToBuy = Math.ceil(toBuyInBaseUnit / purchaseSize);
            }

            const key = inventoryItem.name.toLowerCase();
            shoppingList[key] = {
                name: inventoryItem.name,
                quantity_to_buy: quantityToBuy,
                unit: `stk á ${purchaseSize}${purchaseUnit}`,
                storeId: storeId,
                itemId: inventoryItem.id,
                estimatedPrice: quantityToBuy * pricePerUnit
            };
        }
    }
    
    await updateShoppingListInFirestore('groceries', shoppingList);
    showNotification({ title: "Opdateret", message: `Indkøbslisten for dagligvarer (uge ${getWeekNumber(start)}) er blevet genereret.` });
}


async function handleClearShoppingList() {
    const confirmed = await showNotification({
        title: "Ryd Indkøbsliste",
        message: `Er du sikker på, at du vil slette alle varer fra listen "${appElements.shoppingListModalTitle.textContent}"?`,
        type: 'confirm'
    });
    if (confirmed) {
        await updateShoppingListInFirestore(currentListType, {});
        renderListInModal(); // Immediate UI update
    }
}

async function handleAddShoppingItem(itemName) {
    const list = appState.shoppingLists[currentListType] || {};
    const updatedList = { ...list };
    const key = itemName.toLowerCase();

    if (updatedList[key]) {
        showNotification({ title: "Vare findes allerede", message: `${itemName} er allerede på listen.`});
        return;
    }
    
    const inventoryItem = appState.inventory.find(i => i.name.toLowerCase() === key);
    
    let newItem = {
        name: itemName,
        quantity_to_buy: 1,
        unit: 'stk',
        storeId: appState.preferences.favoriteStoreId || 'Andet',
        itemId: null,
        price: null,
        url: null
    };

    if (inventoryItem) {
        newItem.name = inventoryItem.name; // Use correct casing
        newItem.itemId = inventoryItem.id;
        newItem.unit = inventoryItem.defaultUnit || 'stk';
        const lastBatch = inventoryItem.batches.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate))[0];
        if (lastBatch) {
            newItem.storeId = lastBatch.store;
            newItem.price = lastBatch.price / lastBatch.quantity;
        }
    }
    
    updatedList[key] = newItem;
    await updateShoppingListInFirestore(currentListType, updatedList);
    renderListInModal(); // Immediate UI update
}


async function handleRemoveShoppingItem(itemName) {
    const list = appState.shoppingLists[currentListType] || {};
    const updatedList = { ...list };
    const keyToDelete = Object.keys(updatedList).find(k => updatedList[k].name.toLowerCase() === itemName.toLowerCase());
    if(keyToDelete) {
        delete updatedList[keyToDelete];
        await updateShoppingListInFirestore(currentListType, updatedList);
        renderListInModal(); // Immediate UI update
    }
}

async function handleConfirmPurchase() {
    const checkedItems = [];
    document.querySelectorAll('.shopping-list-checkbox:checked').forEach(checkbox => {
        const itemName = checkbox.closest('.shopping-list-item').dataset.itemName;
        const item = Object.values(appState.shoppingLists.groceries).find(i => i.name === itemName);
        if (item) checkedItems.push(item);
    });

    if (checkedItems.length === 0) {
        await showNotification({ title: "Intet valgt", message: "Vælg venligst de varer, du har købt, ved at sætte flueben." });
        return;
    }
    
    // Process items one by one to handle modals correctly
    processItemsSequentially(checkedItems);
}

async function processItemsSequentially(items) {
    let currentList = { ...appState.shoppingLists.groceries };
    let listChanged = false;

    for (const item of items) {
        const wasHandled = await new Promise(async (resolve) => {
            if (item.itemId) {
                // This function will be called ONLY if a batch is saved
                const onSaveSuccess = (savedItemId) => {
                    const itemToRemove = appState.inventory.find(i => i.id === savedItemId);
                    if (itemToRemove) {
                        const keyToDelete = Object.keys(currentList).find(k => currentList[k].name.toLowerCase() === itemToRemove.name.toLowerCase());
                        if (keyToDelete) {
                            delete currentList[keyToDelete];
                            listChanged = true;
                        }
                    }
                    resolve(true); // Mark as handled
                };
                openBatchModal(item.itemId, null, onSaveSuccess);

                // We need to know if the user just closes the modal
                const modal = document.getElementById('batch-edit-modal');
                const closeHandler = () => {
                    // If onSaveSuccess has not been called, it means the user cancelled.
                    if (modal.classList.contains('hidden')) { // Check if it's still open
                        resolve(false); // Mark as not handled
                    }
                };
                // Listen for the modal to be hidden
                const observer = new MutationObserver((mutations) => {
                    for (let mutation of mutations) {
                        if (mutation.attributeName === 'class' && modal.classList.contains('hidden')) {
                            resolve(false); // User closed the modal
                            observer.disconnect();
                        }
                    }
                });
                observer.observe(modal, { attributes: true });

            } else {
                const createNew = await showNotification({
                    title: "Ny Vare",
                    message: `Varen "${item.name}" findes ikke i dit varelager. Vil du oprette den nu?`,
                    type: 'confirm'
                });
                if (createNew) {
                    appElements.shoppingListModal.classList.add('hidden');
                    document.getElementById('add-inventory-item-btn').click();
                }
                resolve(false); // Not handled in this loop
            }
        });

        // If user cancelled the batch modal for an item, we stop the whole process
        if (!wasHandled) {
            showNotification({ title: "Annulleret", message: "Processen blev afbrudt. Resterende varer er ikke blevet behandlet." });
            return;
        }
    }

    if (listChanged) {
        await updateShoppingListInFirestore('groceries', currentList);
        renderListInModal(); // Update the UI with the final list
    }
}
