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
    const groupedByStore = {};

    Object.values(appState.shoppingList).sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
        const store = item.storeId || 'Andet';
        if (!groupedByStore[store]) groupedByStore[store] = [];
        groupedByStore[store].push(item);
    });

    const hasItems = Object.keys(groupedByStore).length > 0;
    const fragment = document.createDocumentFragment();

    if (!hasItems) {
        const p = document.createElement('p');
        p.className = 'empty-state';
        p.textContent = 'Din indkøbsliste er tom.';
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
                                            <input type="number" class="item-quantity-input" value="${item.quantity_to_buy.toFixed(2).replace(/\.00$/, '')}" step="any">
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

async function handleGenerateShoppingList() {
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
                                if (!allIngredientsNeeded[ing.name]) {
                                    allIngredientsNeeded[ing.name] = { total: 0, unit: ing.unit, name: ing.name };
                                }
                                allIngredientsNeeded[ing.name].total += (ing.quantity || 0) * scaleFactor;
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
    for (const ingName in allIngredientsNeeded) {
        const needed = allIngredientsNeeded[ingName];
        const masterProduct = appState.inventory.find(mp => mp.name.toLowerCase() === ingName.toLowerCase());

        if (!masterProduct || masterProduct.variants.length === 0) {
            shoppingList[ingName.toLowerCase()] = { name: ingName, quantity_to_buy: needed.total, unit: needed.unit, storeId: 'Ukendt' };
            continue;
        }

        const conversion = convertToGrams(needed.total, needed.unit, masterProduct);
        if (conversion.error) {
            shoppingList[ingName.toLowerCase()] = { name: ingName, quantity_to_buy: needed.total, unit: needed.unit, storeId: 'Ukendt (konv. fejl)' };
            continue;
        }

        const neededGrams = conversion.grams;
        const gramsToBuy = Math.max(0, neededGrams - (masterProduct.totalStockGrams || 0));

        if (gramsToBuy > 0) {
            let bestVariant = 
                masterProduct.variants.find(v => v.storeId === appState.preferences.favoriteStoreId) ||
                masterProduct.variants.find(v => v.isFavoritePurchase) ||
                masterProduct.variants.filter(v => v.purchaseSize > 0).sort((a, b) => (a.kgPrice || Infinity) - (b.kgPrice || Infinity))[0];

            if (bestVariant) {
                const quantityToBuy = Math.ceil(gramsToBuy / bestVariant.purchaseSize);
                const key = `${bestVariant.masterProductId}-${bestVariant.id}`;
                shoppingList[key] = {
                    name: `${masterProduct.name} (${bestVariant.variantName})`,
                    quantity_to_buy: quantityToBuy,
                    unit: 'stk',
                    storeId: bestVariant.storeId,
                    variantId: bestVariant.id,
                    masterProductId: bestVariant.masterProductId
                };
            } else {
                // Fallback if no suitable variant is found
                shoppingList[ingName.toLowerCase()] = { name: ingName, quantity_to_buy: gramsToBuy, unit: 'g', storeId: 'Ukendt (ingen variant)' };
            }
        }
    }
    
    await updateShoppingListInFirestore(shoppingList);
    showNotification({ title: "Opdateret", message: `Indkøbslisten for uge ${getWeekNumber(start)} er blevet genereret.` });
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
    
    updatedList[key] = {
        name: itemName,
        quantity_to_buy: 1,
        unit: 'stk',
        storeId: 'Manuelt tilføjet',
    };
    updateShoppingListInFirestore(updatedList);
}

async function handleConfirmPurchase() {
    const checkedItems = [];
    document.querySelectorAll('.shopping-list-checkbox:checked').forEach(checkbox => {
        const itemName = checkbox.closest('.shopping-list-item').dataset.itemName;
        const item = Object.values(appState.shoppingList).find(i => i.name === itemName);
        if (item) {
            checkedItems.push(item);
        }
    });

    if (checkedItems.length === 0) {
        await showNotification({ title: "Intet valgt", message: "Vælg venligst de varer, du har købt." });
        return;
    }

    const confirmedPurchase = await showNotification({ title: "Bekræft Indkøb", message: "Vil du tilføje de valgte varer til dit varelager?", type: 'confirm' });
    if (!confirmedPurchase) return;

    const batch = writeBatch(db);
    const updatedList = { ...appState.shoppingList };
    
    checkedItems.forEach(item => {
        if (item.variantId) {
            const variantRef = doc(db, "inventory_variants", item.variantId);
            // This requires fetching the document to increment, which is complex in a batch without a transaction.
            // For simplicity, we'll just show a notification. A full implementation would use a transaction.
            console.log(`Ville opdatere lager for variant ${item.variantId} med ${item.quantity_to_buy} stk.`);
        }
        
        const keyToDelete = Object.keys(updatedList).find(k => updatedList[k].name === item.name);
        if(keyToDelete) {
            delete updatedList[keyToDelete];
        }
    });

    try {
        // await batch.commit(); // Deactivated for now
        await updateShoppingListInFirestore(updatedList); 
        await showNotification({ title: "Succes", message: "Dit varelager ville være blevet opdateret! (Funktion under udvikling)" });
    } catch (error) {
        handleError(error, "Lageret kunne ikke opdateres.", "confirmPurchase");
    }
}

function handleShoppingListInput(e) {
    const target = e.target;
    if (target.classList.contains('item-quantity-input')) {
        const listItem = target.closest('.shopping-list-item');
        const itemName = listItem.dataset.itemName;
        const updatedList = { ...appState.shoppingList };
        const keyToUpdate = Object.keys(updatedList).find(k => updatedList[k].name === itemName);

        if(keyToUpdate) {
            updatedList[keyToUpdate].quantity_to_buy = parseFloat(target.value) || 0;
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
    const keyToUpdate = Object.keys(appState.shoppingList).find(k => appState.shoppingList[k].name === itemName);

    if (button.classList.contains('remove-from-list-btn')) {
        const updatedList = { ...appState.shoppingList };
        if (keyToUpdate) {
            delete updatedList[keyToUpdate];
        }
        updateShoppingListInFirestore(updatedList);
        return;
    }

    if (button.classList.contains('quantity-btn')) {
        const updatedList = { ...appState.shoppingList };
        if (keyToUpdate) {
            const item = updatedList[keyToUpdate];
            if (button.classList.contains('increase-quantity')) {
                item.quantity_to_buy += 1;
            } else if (button.classList.contains('decrease-quantity')) {
                item.quantity_to_buy = Math.max(0, item.quantity_to_buy - 1);
            }
            updateShoppingListInFirestore(updatedList);
        }
    }
}
