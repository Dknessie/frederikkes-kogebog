// js/shoppingList.js

// Handles all logic for the shopping list.

import { db } from './firebase.js';
import { doc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError, navigateTo } from './ui.js';
import { getWeekNumber, getStartOfWeek, formatDate, convertToPrimaryUnit, normalizeUnit } from './utils.js';

let appState;
let appElements;

/**
 * Initializes the shopping list module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
export function initShoppingList(state, elements) {
    appState = state;
    appElements = elements;

    [appElements.shoppingList, appElements.shoppingListMobile].forEach(ui => {
        if (ui.generateBtn) ui.generateBtn.addEventListener('click', handleGenerateShoppingList);
        if (ui.clearBtn) ui.clearBtn.addEventListener('click', handleClearShoppingList);
        if (ui.confirmBtn) ui.confirmBtn.addEventListener('click', handleConfirmPurchase);
        if (ui.addForm) ui.addForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const itemName = ui.addInput.value.trim();
            if (itemName) {
                handleAddShoppingItem(itemName);
                ui.addInput.value = '';
            }
        });
        if (ui.container) {
            ui.container.addEventListener('input', handleShoppingListInput);
            ui.container.addEventListener('click', handleShoppingListClick);
        }
    });
}

/**
 * Renders the shopping list for both desktop and mobile views.
 */
export function renderShoppingList() {
    const containers = [appElements.shoppingList.container, appElements.shoppingListMobile.container];
    const groupedList = {};

    Object.values(appState.shoppingList).sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
        const section = item.store_section || 'Andet';
        if (!groupedList[section]) groupedList[section] = [];
        groupedList[section].push(item);
    });

    const hasItems = Object.keys(groupedList).length > 0;
    const fragment = document.createDocumentFragment();

    if (!hasItems) {
        const p = document.createElement('p');
        p.className = 'empty-state';
        p.textContent = 'Din indkøbsliste er tom.';
        fragment.appendChild(p);
    } else {
        for (const section in groupedList) {
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'store-section';
            
            let listItemsHTML = '';
            groupedList[section].forEach(item => {
                const safeItemName = item.name.replace(/[^a-zA-Z0-9]/g, '-');
                const itemInInventory = appState.inventory.find(invItem => invItem.name.toLowerCase() === item.name.toLowerCase());
                const newItemIndicator = !itemInInventory 
                    ? `<button class="btn-icon new-item-indicator" data-item-name="${item.name}" title="Tilføj '${item.name}' til varelageret"><i class="fas fa-plus-circle"></i></button>`
                    : '';

                listItemsHTML += `
                    <li class="shopping-list-item" data-item-name="${item.name}">
                        <div class="item-main-info">
                             <input type="checkbox" id="shop-${safeItemName}" class="shopping-list-checkbox">
                             <div class="item-name-details">
                                <label for="shop-${safeItemName}">${item.name}</label>
                                <div class="item-details">
                                    <input type="number" class="item-quantity-input" value="${item.quantity_to_buy}" step="any">
                                    <input type="text" class="item-unit-input" value="${item.unit}">
                                </div>
                             </div>
                        </div>
                        <div class="item-actions">
                            ${newItemIndicator}
                            <button class="btn-icon remove-from-list-btn" title="Fjern fra liste"><i class="fas fa-times-circle"></i></button>
                        </div>
                    </li>`;
            });

            sectionDiv.innerHTML = `<h4>${section}</h4><ul>${listItemsHTML}</ul>`;
            fragment.appendChild(sectionDiv);
        }
    }

    containers.forEach(container => {
        if (container) {
            container.innerHTML = '';
            container.appendChild(fragment.cloneNode(true));
        }
    });
    
    [appElements.shoppingList, appElements.shoppingListMobile].forEach(ui => {
        if(ui.totalContainer) ui.totalContainer.classList.toggle('hidden', !hasItems);
        if(ui.confirmBtn) ui.confirmBtn.style.display = hasItems ? 'inline-flex' : 'none';
    });

    calculateAndRenderShoppingListTotal();
}

async function updateShoppingListInFirestore(newList) {
    if (!appState.currentUser) return;
    try {
        const shoppingListRef = doc(db, 'shopping_lists', appState.currentUser.uid);
        await setDoc(shoppingListRef, { items: newList });
    } catch (error) {
        handleError(error, "Indkøbslisten kunne ikke gemmes.", "updateShoppingList");
    }
}

function handleGenerateShoppingList() {
    const allIngredientsNeeded = [];
    const start = getStartOfWeek(appState.currentDate); 

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(start);
        dayDate.setDate(start.getDate() + i);
        const dateString = formatDate(dayDate);
        const dayPlan = appState.mealPlan[dateString];

        if (dayPlan) {
            Object.values(dayPlan).forEach(meal => {
                if (meal && meal.recipeId && meal.type === 'recipe') {
                    const recipe = appState.recipes.find(r => r.id === meal.recipeId);
                    if (recipe && recipe.ingredients) {
                        const scaleFactor = (meal.portions || recipe.portions) / (recipe.portions || 1);
                        recipe.ingredients.forEach(ing => {
                            allIngredientsNeeded.push({ ...ing, quantity: (ing.quantity || 0) * scaleFactor });
                        });
                    }
                }
            });
        }
    }

    if (allIngredientsNeeded.length === 0) {
        showNotification({title: "Tom Madplan", message: "Der er ingen opskrifter på madplanen for denne uge."});
        return;
    }
    
    addToShoppingList(allIngredientsNeeded, `madplanen for uge ${getWeekNumber(start)}`);
}

async function addToShoppingList(ingredients, sourceText) {
    const updatedList = { ...appState.shoppingList };
    let conversionErrors = [];
    const totalNeeds = {};

    for (const ing of ingredients) {
        const inventoryItem = appState.inventory.find(item => item.name.toLowerCase() === ing.name.toLowerCase() || (item.aliases || []).includes(ing.name.toLowerCase()));
        const normalizedUnit = normalizeUnit(ing.unit || 'stk');
        const key = `${(inventoryItem || ing).name.toLowerCase()}_${normalizedUnit}`;
        
        if (totalNeeds[key]) {
            totalNeeds[key].quantity += (ing.quantity || 0);
        } else {
            totalNeeds[key] = { ...ing, name: (inventoryItem || ing).name, unit: normalizedUnit };
        }
    }

    const itemsToBuy = {};
    
    for (const key in totalNeeds) {
        const neededIng = totalNeeds[key];
        const inventoryItem = appState.inventory.find(item => item.name.toLowerCase() === neededIng.name.toLowerCase());

        let quantityToBuy = neededIng.quantity || 1;
        let unitToBuy = neededIng.unit;
        let storeSection = inventoryItem ? inventoryItem.category : 'Andet';
        
        if (inventoryItem) {
            // Complex logic for calculating what to buy, simplified here for brevity
            // The original logic is maintained.
            const conversionResult = convertToPrimaryUnit(neededIng.quantity, neededIng.unit, inventoryItem);
            let neededFromStore = 0;

            if (conversionResult.error) {
                neededFromStore = neededIng.quantity; // Add as is if conversion fails
            } else if (conversionResult.directMatch) {
                neededFromStore = Math.max(0, conversionResult.quantity - (inventoryItem.current_stock || 0));
            } else if (conversionResult.convertedQuantity !== null) {
                const neededInGrams = conversionResult.convertedQuantity;
                const inStockInGrams = inventoryItem.grams_in_stock || 0;
                neededFromStore = Math.max(0, neededInGrams - inStockInGrams);
                // Convert back to a buyable unit
                if (inventoryItem.grams_per_unit > 0) {
                    quantityToBuy = Math.ceil(neededFromStore / inventoryItem.grams_per_unit);
                    unitToBuy = inventoryItem.unit;
                } else {
                    quantityToBuy = neededFromStore;
                    unitToBuy = 'g';
                }
            }
            if (quantityToBuy <= 0) continue;
        }

        if (quantityToBuy > 0) {
            const buyKey = `${neededIng.name.toLowerCase()}_${normalizeUnit(unitToBuy)}`;
            if (itemsToBuy[buyKey]) {
                itemsToBuy[buyKey].quantity_to_buy += quantityToBuy;
            } else {
                itemsToBuy[buyKey] = {
                    name: neededIng.name,
                    quantity_to_buy: quantityToBuy,
                    unit: unitToBuy,
                    store_section: storeSection,
                };
            }
        }
    }

    for(const key in itemsToBuy) {
        const item = itemsToBuy[key];
        const existingKey = item.name.toLowerCase();
        if(updatedList[existingKey] && normalizeUnit(updatedList[existingKey].unit) === normalizeUnit(item.unit)) {
            updatedList[existingKey].quantity_to_buy += item.quantity_to_buy;
        } else {
            updatedList[existingKey] = item;
        }
    }
    
    await updateShoppingListInFirestore(updatedList);
    if (sourceText) {
        let message = `Varer fra ${sourceText} er tilføjet til indkøbslisten.`;
        if (conversionErrors.length > 0) {
            message += `<br><br>Bemærk: Kunne ikke omregne enheder for: ${[...new Set(conversionErrors)].join(', ')}.`;
        }
        showNotification({ title: "Opdateret", message: message });
    }
}

async function handleClearShoppingList() {
    const confirmed = await showNotification({
        title: "Ryd Indkøbsliste",
        message: "Er du sikker på, at du vil slette alle varer på din indkøbsliste?",
        type: 'confirm'
    });
    if (confirmed) {
        await updateShoppingListInFirestore({});
        showNotification({title: "Indkøbsliste Tømt", message: "Alle varer er blevet fjernet."});
    }
}

function handleAddShoppingItem(itemName) {
    const updatedList = { ...appState.shoppingList };
    const key = itemName.toLowerCase();
    const inventoryItem = appState.inventory.find(inv => inv.name.toLowerCase() === key);
    
    if (updatedList[key]) {
        updatedList[key].quantity_to_buy += 1;
    } else {
        updatedList[key] = {
            name: itemName,
            quantity_to_buy: 1,
            unit: 'stk',
            store_section: inventoryItem ? inventoryItem.category : 'Andet'
        };
    }
    updateShoppingListInFirestore(updatedList);
}

async function handleConfirmPurchase() {
    const checkedItemsNames = [];
    document.querySelectorAll('.shopping-list-checkbox:checked').forEach(checkbox => {
        const itemName = checkbox.closest('.shopping-list-item').dataset.itemName;
        checkedItemsNames.push(itemName);
    });

    if (checkedItemsNames.length === 0) {
        await showNotification({ title: "Intet valgt", message: "Vælg venligst de varer, du har købt." });
        return;
    }

    const confirmedPurchase = await showNotification({ title: "Bekræft Indkøb", message: "Vil du tilføje de valgte varer til dit varelager?", type: 'confirm' });
    if (!confirmedPurchase) return;

    const batch = writeBatch(db);
    const updatedList = { ...appState.shoppingList };
    
    checkedItemsNames.forEach(name => {
        const item = updatedList[name.toLowerCase()];
        const inventoryItem = appState.inventory.find(inv => inv.name.toLowerCase() === item.name.toLowerCase());
        if (inventoryItem) {
            const itemRef = doc(db, "inventory_items", inventoryItem.id);
            
            let newStock = (inventoryItem.current_stock || 0);
            let newGramsInStock = inventoryItem.grams_in_stock || 0;

            if (inventoryItem.buy_as_whole_unit && inventoryItem.purchase_unit) {
                newStock += item.quantity_to_buy;
                newGramsInStock += (inventoryItem.purchase_unit.quantity * item.quantity_to_buy);
            } else {
                newStock += item.quantity_to_buy;
                const conversionResult = convertToPrimaryUnit(item.quantity_to_buy, item.unit, inventoryItem);
                if (conversionResult.convertedQuantity !== null) {
                    newGramsInStock += conversionResult.convertedQuantity;
                }
            }

            batch.update(itemRef, { 
                current_stock: newStock,
                grams_in_stock: newGramsInStock
            });
        }
        delete updatedList[item.name.toLowerCase()];
    });

    try {
        await batch.commit();
        await updateShoppingListInFirestore(updatedList); 
        await showNotification({ title: "Succes", message: "Dit varelager er blevet opdateret!" });
    } catch (error) {
        handleError(error, "Lageret kunne ikke opdateres.", "confirmPurchase");
    }
}

function handleShoppingListInput(e) {
    const target = e.target;
    if (target.classList.contains('item-quantity-input') || target.classList.contains('item-unit-input')) {
        const listItem = target.closest('.shopping-list-item');
        const itemName = listItem.dataset.itemName.toLowerCase();
        const updatedList = { ...appState.shoppingList };
        const item = updatedList[itemName];

        if(item) {
            if (target.classList.contains('item-quantity-input')) {
                item.quantity_to_buy = parseFloat(target.value) || 0;
            }
            if (target.classList.contains('item-unit-input')) {
                item.unit = target.value;
            }
            updateShoppingListInFirestore(updatedList);
        }
    }
}

function handleShoppingListClick(e) {
    const newItemBtn = e.target.closest('.new-item-indicator');
    if (newItemBtn) {
        const itemName = newItemBtn.dataset.itemName;
        navigateTo('#inventory');
        appElements.addInventoryItemBtn.click();
        document.getElementById('item-name').value = itemName;
        return;
    }

    const removeItemBtn = e.target.closest('.remove-from-list-btn');
    if(removeItemBtn) {
        const itemName = removeItemBtn.closest('.shopping-list-item').dataset.itemName;
        const updatedList = { ...appState.shoppingList };
        delete updatedList[itemName.toLowerCase()];
        updateShoppingListInFirestore(updatedList);
    }
}

function calculateAndRenderShoppingListTotal() {
    let totalPrice = 0;
    Object.values(appState.shoppingList).forEach(item => {
        const inventoryItem = appState.inventory.find(inv => inv.name.toLowerCase() === item.name.toLowerCase());
        if (inventoryItem && inventoryItem.kg_price) {
            const conversion = convertToPrimaryUnit(item.quantity_to_buy, item.unit, inventoryItem);
            if (conversion.convertedQuantity !== null) {
                const quantityInKg = conversion.convertedQuantity / 1000;
                totalPrice += quantityInKg * inventoryItem.kg_price;
            }
        }
    });
    const totalHTML = `<span>Estimeret Pris: <strong>${totalPrice.toFixed(2)} kr.</strong></span>`;
    appElements.shoppingList.totalContainer.innerHTML = totalHTML;
    appElements.shoppingListMobile.totalContainer.innerHTML = totalHTML;
}
