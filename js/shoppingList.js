// js/shoppingList.js

import { db } from './firebase.js';
import { doc, setDoc, writeBatch, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { getWeekNumber, getStartOfWeek, formatDate, convertToGrams } from './utils.js';
import { calculateRecipePrice } from './recipes.js';

let appState;
let appElements;

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
                        <input type="checkbox" id="shop-${safeItemName}" class="shopping-list-checkbox">
                        <div class="item-main-info">
                             <div class="item-name-details">
                                <label for="shop-${safeItemName}">${item.name}</label>
                                <div class="item-details">
                                    <div class="quantity-adjuster">
                                        <button class="btn-icon quantity-btn decrease-quantity" data-item-name="${item.name}"><i class="fas fa-minus-circle"></i></button>
                                        <input type="number" class="item-quantity-input" value="${item.quantity_to_buy}" step="any">
                                        <button class="btn-icon quantity-btn increase-quantity" data-item-name="${item.name}"><i class="fas fa-plus-circle"></i></button>
                                    </div>
                                    <span class="item-unit-display">${item.unit}</span>
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
            Object.values(dayPlan).forEach(mealArray => {
                if (Array.isArray(mealArray)) {
                    mealArray.forEach(meal => {
                        if (meal && meal.recipeId && meal.type === 'recipe') {
                            const recipe = appState.recipes.find(r => r.id === meal.recipeId);
                            if (recipe && recipe.ingredients) {
                                const scaleFactor = (meal.portions || recipe.portions || 1) / (recipe.portions || 1);
                                recipe.ingredients.forEach(ing => {
                                    allIngredientsNeeded.push({ ...ing, quantity: (ing.quantity || 0) * scaleFactor });
                                });
                            }
                        }
                    });
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

export async function addToShoppingList(ingredients, sourceText) {
    const updatedList = { ...appState.shoppingList };
    let conversionErrors = [];
    const totalGramsNeeded = {};

    // 1. Calculate total grams needed for each unique ingredient
    for (const ing of ingredients) {
        const inventoryItem = appState.inventory.find(item => item.name.toLowerCase() === ing.name.toLowerCase() || (item.aliases || []).includes(ing.name.toLowerCase()));
        if (!inventoryItem) {
            conversionErrors.push(`Varen '${ing.name}' findes ikke på lager og kan ikke tilføjes automatisk.`);
            continue;
        }

        const conversion = convertToGrams(ing.quantity, ing.unit, inventoryItem);
        if (conversion.error) {
            conversionErrors.push(conversion.error);
            continue;
        }

        const key = inventoryItem.name.toLowerCase();
        if (totalGramsNeeded[key]) {
            totalGramsNeeded[key].grams += conversion.grams;
        } else {
            totalGramsNeeded[key] = {
                grams: conversion.grams,
                inventoryItem: inventoryItem
            };
        }
    }

    // 2. Determine what to buy based on stock
    for (const key in totalGramsNeeded) {
        const { grams: neededGrams, inventoryItem } = totalGramsNeeded[key];
        const gramsInStock = inventoryItem.grams_in_stock || 0;
        const gramsToBuy = Math.max(0, neededGrams - gramsInStock);

        if (gramsToBuy > 0) {
            let quantityToBuy = 0;
            const purchaseUnit = inventoryItem.unit || 'stk';
            
            if (inventoryItem.grams_per_unit > 0) {
                quantityToBuy = Math.ceil(gramsToBuy / inventoryItem.grams_per_unit);
            } else {
                // Cannot convert back from grams if grams_per_unit is missing
                conversionErrors.push(`Kan ikke udregne antal for '${inventoryItem.name}', da 'gram pr. enhed' mangler.`);
                continue;
            }

            const existingItem = updatedList[key];
            if (existingItem && existingItem.unit === purchaseUnit) {
                existingItem.quantity_to_buy += quantityToBuy;
            } else {
                updatedList[key] = {
                    name: inventoryItem.name,
                    quantity_to_buy: quantityToBuy,
                    unit: purchaseUnit,
                    store_section: inventoryItem.category || 'Andet',
                };
            }
        }
    }
    
    await updateShoppingListInFirestore(updatedList);
    if (sourceText) {
        let message = `Varer fra ${sourceText} er tilføjet til indkøbslisten.`;
        if (conversionErrors.length > 0) {
            message += `<br><br><strong>Bemærk:</strong><br>${[...new Set(conversionErrors)].join('<br>')}`;
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
            unit: inventoryItem ? inventoryItem.unit : 'stk',
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
        const itemOnList = updatedList[name.toLowerCase()];
        const inventoryItem = appState.inventory.find(inv => inv.name.toLowerCase() === itemOnList.name.toLowerCase());
        
        if (inventoryItem && inventoryItem.grams_per_unit) {
            const itemRef = doc(db, "inventory_items", inventoryItem.id);
            
            const newStock = (inventoryItem.current_stock || 0) + itemOnList.quantity_to_buy;
            const newGramsInStock = (inventoryItem.grams_in_stock || 0) + (itemOnList.quantity_to_buy * inventoryItem.grams_per_unit);

            batch.update(itemRef, { 
                current_stock: newStock,
                grams_in_stock: newGramsInStock
            });
        }
        delete updatedList[itemOnList.name.toLowerCase()];
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
    if (target.classList.contains('item-quantity-input')) {
        const listItem = target.closest('.shopping-list-item');
        const itemName = listItem.dataset.itemName.toLowerCase();
        const updatedList = { ...appState.shoppingList };
        const item = updatedList[itemName];

        if(item) {
            item.quantity_to_buy = parseFloat(target.value) || 0;
            updateShoppingListInFirestore(updatedList);
        }
    }
}

function handleShoppingListClick(e) {
    const button = e.target.closest('button');
    if (!button) return;

    const listItem = button.closest('.shopping-list-item');
    if (!listItem) return;

    const itemName = listItem.dataset.itemName;
    const key = itemName.toLowerCase();

    if (button.classList.contains('new-item-indicator')) {
        window.location.hash = '#inventory';
        appElements.addInventoryItemBtn.click();
        document.getElementById('item-name').value = itemName;
        return;
    }

    if (button.classList.contains('remove-from-list-btn')) {
        const updatedList = { ...appState.shoppingList };
        delete updatedList[key];
        updateShoppingListInFirestore(updatedList);
        return;
    }

    if (button.classList.contains('quantity-btn')) {
        const updatedList = { ...appState.shoppingList };
        const item = updatedList[key];
        if (item) {
            if (button.classList.contains('increase-quantity')) {
                item.quantity_to_buy += 1;
            } else if (button.classList.contains('decrease-quantity')) {
                item.quantity_to_buy = Math.max(0, item.quantity_to_buy - 1);
            }
            updateShoppingListInFirestore(updatedList);
        }
    }
}


function calculateAndRenderShoppingListTotal() {
    let totalPrice = 0;
    Object.values(appState.shoppingList).forEach(item => {
        const inventoryItem = appState.inventory.find(inv => inv.name.toLowerCase() === item.name.toLowerCase());
        if (inventoryItem && inventoryItem.kg_price && inventoryItem.grams_per_unit) {
            const quantityInGrams = item.quantity_to_buy * inventoryItem.grams_per_unit;
            const quantityInKg = quantityInGrams / 1000;
            totalPrice += quantityInKg * inventoryItem.kg_price;
        }
    });
    const totalHTML = `<span>Estimeret Pris: <strong>${totalPrice.toFixed(2)} kr.</strong></span>`;
    appElements.shoppingList.totalContainer.innerHTML = totalHTML;
    appElements.shoppingListMobile.totalContainer.innerHTML = totalHTML;
}
