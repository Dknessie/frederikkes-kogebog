// js/shoppingList.js

import { db } from './firebase.js';
import { doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
        shoppingListModalContainer: document.getElementById('shopping-list-modal-container'),
        shoppingListModalTotal: document.getElementById('shopping-list-modal-total'),
        shoppingListClearBtn: document.getElementById('shopping-list-clear-btn'),
        shoppingListConfirmBtn: document.getElementById('shopping-list-confirm-btn'),
        addShoppingItemModalForm: document.getElementById('add-shopping-item-modal-form'),
    };

    appElements.generateGroceriesBtn.addEventListener('click', generateGroceriesList);
    
    // Modal listeners
    appElements.shoppingListClearBtn.addEventListener('click', handleClearShoppingList);
    appElements.shoppingListConfirmBtn.addEventListener('click', handleConfirmPurchase);
    appElements.addShoppingItemModalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('add-shopping-item-modal-name');
        const itemName = input.value.trim();
        if (itemName) {
            handleAddShoppingItem(itemName);
            input.value = '';
        }
    });
    appElements.shoppingListModalContainer.addEventListener('input', handleShoppingListInput);
    appElements.shoppingListModalContainer.addEventListener('click', handleShoppingListClick);
}

export function renderShoppingListWidgets() {
    updateWidgetSummary('groceries');
    updateWidgetSummary('materials');
    updateWidgetSummary('wishlist');
}

function updateWidgetSummary(listType) {
    const list = appState.shoppingLists[listType] || {};
    const count = Object.keys(list).length;
    let totalEstimatedPrice = 0;
    Object.values(list).forEach(item => {
        totalEstimatedPrice += item.estimatedPrice || 0;
    });

    const countEl = document.getElementById(`${listType}-count`);
    const priceEl = document.getElementById(`${listType}-price`);

    if (countEl) countEl.textContent = `${count} ${listType === 'wishlist' ? 'ønsker' : 'varer'}`;
    if (priceEl) priceEl.textContent = `ca. ${totalEstimatedPrice.toFixed(2)} kr.`;
}

export function openShoppingListModal(listType) {
    currentListType = listType;
    const titles = {
        groceries: 'Indkøbsliste - Dagligvarer',
        materials: 'Indkøbsliste - Materialer & Værktøj',
        wishlist: 'Ønskeliste - Møbler & Inventar'
    };
    appElements.shoppingListModalTitle.textContent = titles[listType];
    renderListInModal();
    appElements.shoppingListModal.classList.remove('hidden');
}

function renderListInModal() {
    const container = appElements.shoppingListModalContainer;
    const list = appState.shoppingLists[currentListType] || {};
    
    const groupedByStore = {};
    let totalEstimatedPrice = 0;

    Object.values(list).sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
        const store = item.storeId || 'Andet';
        if (!groupedByStore[store]) groupedByStore[store] = [];
        groupedByStore[store].push(item);
        totalEstimatedPrice += item.estimatedPrice || 0;
    });

    const hasItems = Object.keys(groupedByStore).length > 0;
    const fragment = document.createDocumentFragment();

    if (!hasItems) {
        const p = document.createElement('p');
        p.className = 'empty-state';
        p.textContent = 'Denne indkøbsliste er tom.';
        fragment.appendChild(p);
    } else {
        const storeOrder = [appState.preferences.favoriteStoreId, ...Object.keys(groupedByStore).filter(s => s !== appState.preferences.favoriteStoreId).sort()];
        
        storeOrder.forEach(store => {
            if (groupedByStore[store]) {
                const sectionDiv = document.createElement('div');
                sectionDiv.className = 'store-section';
                
                let listItemsHTML = '';
                groupedByStore[store].forEach(item => {
                    const safeItemName = item.name.replace(/[^a-zA-Z0-9]/g, '-');
                    listItemsHTML += `
                        <li class="shopping-list-item" data-item-name="${item.name}">
                            <input type="checkbox" id="shop-${safeItemName}" class="shopping-list-checkbox">
                            <div class="item-main-info">
                                 <div class="item-name-details">
                                    <label for="shop-${safeItemName}">${item.name}</label>
                                    <div class="item-details">
                                        <div class="quantity-adjuster">
                                            <button class="btn-icon quantity-btn decrease-quantity" data-item-name="${item.name}"><i class="fas fa-minus-circle"></i></button>
                                            <input type="number" class="item-quantity-input" value="${item.quantity_to_buy}" step="1">
                                            <button class="btn-icon quantity-btn increase-quantity" data-item-name="${item.name}"><i class="fas fa-plus-circle"></i></button>
                                        </div>
                                        <span class="item-unit-display">${item.unit}</span>
                                    </div>
                                 </div>
                            </div>
                            <div class="item-actions">
                                <button class="btn-icon remove-from-list-btn" title="Fjern fra liste"><i class="fas fa-times-circle"></i></button>
                            </div>
                        </li>`;
                });

                sectionDiv.innerHTML = `<h4>${store}</h4><ul>${listItemsHTML}</ul>`;
                fragment.appendChild(sectionDiv);
            }
        });
    }

    container.innerHTML = '';
    container.appendChild(fragment.cloneNode(true));
    
    appElements.shoppingListModalTotal.textContent = `Est. Pris: ${totalEstimatedPrice.toFixed(2)} kr.`;
    appElements.shoppingListModalTotal.classList.toggle('hidden', !hasItems);
    appElements.shoppingListConfirmBtn.style.display = hasItems ? 'inline-flex' : 'none';
}

async function updateShoppingListInFirestore(listType, newList) {
    if (!appState.currentUser) return;
    try {
        const shoppingListRef = doc(db, 'shopping_lists', appState.currentUser.uid);
        await updateDoc(shoppingListRef, { [listType]: newList });
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

            const key = inventoryItem.id;
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
        renderListInModal();
        showNotification({title: "Indkøbsliste Tømt", message: "Alle varer er blevet fjernet."});
    }
}

function handleAddShoppingItem(itemName) {
    const list = appState.shoppingLists[currentListType];
    const updatedList = { ...list };
    const key = itemName.toLowerCase();
    
    const existingItem = appState.inventory.find(i => i.name.toLowerCase() === key);
    
    updatedList[key] = {
        name: existingItem ? existingItem.name : itemName,
        quantity_to_buy: 1,
        unit: 'stk',
        storeId: 'Manuelt tilføjet',
        itemId: existingItem ? existingItem.id : null
    };
    updateShoppingListInFirestore(currentListType, updatedList);
    renderListInModal();
}

async function handleConfirmPurchase() {
    const checkedItems = [];
    document.querySelectorAll('.shopping-list-checkbox:checked').forEach(checkbox => {
        const itemName = checkbox.closest('.shopping-list-item').dataset.itemName;
        const item = Object.values(appState.shoppingLists[currentListType]).find(i => i.name === itemName);
        if (item) checkedItems.push(item);
    });

    if (checkedItems.length === 0) {
        await showNotification({ title: "Intet valgt", message: "Vælg venligst de varer, du har købt." });
        return;
    }
    
    const list = appState.shoppingLists[currentListType];
    const updatedList = { ...list };

    for (const item of checkedItems) {
        if (item.itemId) {
            openBatchModal(item.itemId, null);
        } else {
            const createNew = await showNotification({
                title: "Ny Vare",
                message: `Varen "${item.name}" findes ikke i dit varelager. Vil du oprette den?`,
                type: 'confirm'
            });
            if (createNew) {
                showNotification({title: "Handling påkrævet", message: `Gå til varelager og opret "${item.name}" manuelt.`});
            }
        }
        
        const keyToDelete = Object.keys(updatedList).find(k => updatedList[k].name === item.name);
        if(keyToDelete) delete updatedList[keyToDelete];
    }
    
    await updateShoppingListInFirestore(currentListType, updatedList);
    renderListInModal();
}


function handleShoppingListInput(e) {
    const target = e.target;
    if (target.classList.contains('item-quantity-input')) {
        const listItem = target.closest('.shopping-list-item');
        const itemName = listItem.dataset.itemName;
        const list = appState.shoppingLists[currentListType];
        const updatedList = { ...list };
        const keyToUpdate = Object.keys(updatedList).find(k => updatedList[k].name === itemName);

        if(keyToUpdate) {
            updatedList[keyToUpdate].quantity_to_buy = parseFloat(target.value) || 0;
            updateShoppingListInFirestore(currentListType, updatedList);
        }
    }
}

function handleShoppingListClick(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const listItem = button.closest('.shopping-list-item');
    if (!listItem) return;

    const itemName = listItem.dataset.itemName;
    const list = appState.shoppingLists[currentListType];
    const keyToUpdate = Object.keys(list).find(k => list[k].name === itemName);
    if (!keyToUpdate) return;

    const updatedList = { ...list };

    if (button.classList.contains('remove-from-list-btn')) {
        delete updatedList[keyToUpdate];
        updateShoppingListInFirestore(currentListType, updatedList);
        renderListInModal();
        return;
    }

    if (button.classList.contains('quantity-btn')) {
        const item = updatedList[keyToUpdate];
        if (button.classList.contains('increase-quantity')) {
            item.quantity_to_buy += 1;
        } else if (button.classList.contains('decrease-quantity')) {
            item.quantity_to_buy = Math.max(0, item.quantity_to_buy - 1);
        }
        updateShoppingListInFirestore(currentListType, updatedList);
        renderListInModal();
    }
}
