// js/kitchenCounter.js

import { db } from './firebase.js';
import { doc, setDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { convertToGrams } from './utils.js';
import { calculateRecipeMatch } from './recipes.js';


let appState;
let appElements;

/**
 * Initializes the kitchen counter module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
export function initKitchenCounter(state, elements) {
    appState = state;
    appElements = elements;

    [appElements.kitchenCounter, appElements.kitchenCounterMobile].forEach(ui => {
        if (ui.clearBtn) ui.clearBtn.addEventListener('click', handleClearKitchenCounter);
        if (ui.confirmBtn) ui.confirmBtn.addEventListener('click', handleConfirmCooking);
        if (ui.container) ui.container.addEventListener('click', handleKitchenCounterClick);
    });
}

/**
 * Renders the kitchen counter for both desktop and mobile views.
 */
export function renderKitchenCounter() {
    const containers = [appElements.kitchenCounter.container, appElements.kitchenCounterMobile.container];
    const items = Object.values(appState.kitchenCounter);
    const hasItems = items.length > 0;

    const fragment = document.createDocumentFragment();
    if (!hasItems) {
        const p = document.createElement('p');
        p.className = 'empty-state';
        p.textContent = 'Dit køkkenbord er tomt. Tilføj en opskrift for at starte.';
        fragment.appendChild(p);
    } else {
        items.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
            const li = document.createElement('li');
            li.className = 'kitchen-counter-item';
            
            const recipeMatch = calculateRecipeMatch({ ingredients: [item] }, appState.inventory);
            const stockStatus = recipeMatch.canBeMade ? 'status-green' : 'status-red';

            li.innerHTML = `
                <div class="item-main-info">
                    <span class="status-indicator ${stockStatus}" title="${stockStatus === 'status-green' ? 'På lager' : 'Ikke nok på lager'}"></span>
                    <div class="item-name-details">
                        <span class="item-name">${item.name}</span>
                        <div class="item-details">
                            <span>${item.quantity ? item.quantity.toFixed(2).replace(/\.00$/, '') : ''} ${item.unit || ''}</span>
                        </div>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn-icon remove-from-list-btn" data-item-name="${item.name}" title="Fjern fra køkkenbord"><i class="fas fa-times-circle"></i></button>
                </div>
            `;
            fragment.appendChild(li);
        });
    }

    containers.forEach(container => {
        if (container) {
            container.innerHTML = '';
            container.appendChild(fragment.cloneNode(true));
        }
    });

    [appElements.kitchenCounter, appElements.kitchenCounterMobile].forEach(ui => {
        if (ui.confirmBtn) ui.confirmBtn.disabled = !hasItems;
        if (ui.clearBtn) ui.clearBtn.disabled = !hasItems;
    });
}

async function addToKitchenCounter(ingredients) {
    if (!appState.currentUser) return;
    
    const kitchenCounterRef = doc(db, 'kitchen_counters', appState.currentUser.uid);
    const currentCounter = { ...appState.kitchenCounter };
    
    ingredients.forEach(ing => {
        const key = ing.name.toLowerCase();
        // Simple addition; assuming units are consistent from recipe.
        if (currentCounter[key]) {
            currentCounter[key].quantity += ing.quantity;
        } else {
            currentCounter[key] = { ...ing };
        }
    });

    try {
        await setDoc(kitchenCounterRef, { items: currentCounter });
        showNotification({ title: "Tilføjet", message: "Ingredienser er lagt på køkkenbordet." });
    } catch (error) {
        handleError(error, "Kunne ikke opdatere køkkenbordet.", "addToKitchenCounter");
    }
}

export async function addToKitchenCounterFromRecipe(recipeId, portions) {
    const recipe = appState.recipes.find(r => r.id === recipeId);
    if (!recipe || !recipe.ingredients) return;

    let ingredientsToAdd = recipe.ingredients;
    if (portions && recipe.portions) {
        const scaleFactor = portions / recipe.portions;
        ingredientsToAdd = ingredientsToAdd.map(ing => ({...ing, quantity: (ing.quantity || 0) * scaleFactor }));
    }
    
    await addToKitchenCounter(ingredientsToAdd);
}

async function handleClearKitchenCounter() {
    const confirmed = await showNotification({
        title: "Ryd Køkkenbord",
        message: "Er du sikker på, at du vil fjerne alle varer fra dit køkkenbord?",
        type: 'confirm'
    });
    if (confirmed) {
        const kitchenCounterRef = doc(db, 'kitchen_counters', appState.currentUser.uid);
        await setDoc(kitchenCounterRef, { items: {} });
    }
}

async function handleKitchenCounterClick(e) {
    const removeBtn = e.target.closest('.remove-from-list-btn');
    if (removeBtn) {
        const itemName = removeBtn.dataset.itemName.toLowerCase();
        const updatedCounter = { ...appState.kitchenCounter };
        delete updatedCounter[itemName];
        const kitchenCounterRef = doc(db, 'kitchen_counters', appState.currentUser.uid);
        await setDoc(kitchenCounterRef, { items: updatedCounter });
    }
}

async function handleConfirmCooking() {
    const itemsToCook = Object.values(appState.kitchenCounter);
    if (itemsToCook.length === 0) {
        showNotification({title: "Tomt Køkkenbord", message: "Der er ingen ingredienser på dit køkkenbord."});
        return;
    }

    const confirmed = await showNotification({
        title: "Bekræft Madlavning",
        message: "Er du sikker på, du vil nedskrive disse ingredienser fra dit lager?",
        type: 'confirm'
    });
    if (!confirmed) return;

    try {
        await runTransaction(db, async (transaction) => {
            const validationErrors = [];
            const updates = [];

            for (const item of itemsToCook) {
                const inventoryItem = appState.inventory.find(inv => inv.name.toLowerCase() === item.name.toLowerCase());
                if (!inventoryItem) {
                    validationErrors.push(`Varen '${item.name}' findes ikke på lager.`);
                    continue;
                }

                const itemRef = doc(db, "inventory_items", inventoryItem.id);
                const invDoc = await transaction.get(itemRef);
                if (!invDoc.exists()) {
                     validationErrors.push(`Varen '${item.name}' blev ikke fundet i databasen.`);
                     continue;
                }
                const currentData = invDoc.data();
                
                const conversion = convertToGrams(item.quantity, item.unit, currentData);

                if (conversion.error) {
                    validationErrors.push(conversion.error);
                    continue;
                }
                
                const gramsToConsume = conversion.grams;
                const gramsInStock = currentData.grams_in_stock || 0;

                if (gramsInStock < gramsToConsume) {
                    validationErrors.push(`Ikke nok '${item.name}' på lager. Mangler ${(gramsToConsume - gramsInStock).toFixed(0)}g.`);
                } else {
                    const newGramsInStock = gramsInStock - gramsToConsume;
                    let newStockInDisplayUnits = 0;
                    if (currentData.grams_per_unit > 0) {
                        newStockInDisplayUnits = newGramsInStock / currentData.grams_per_unit;
                    }
                    updates.push({ 
                        ref: itemRef, 
                        data: { 
                            current_stock: newStockInDisplayUnits, 
                            grams_in_stock: newGramsInStock 
                        } 
                    });
                }
            }

            if (validationErrors.length > 0) {
                throw new Error(validationErrors.join('\n'));
            }

            updates.forEach(update => {
                transaction.update(update.ref, update.data);
            });

            const kitchenCounterRef = doc(db, 'kitchen_counters', appState.currentUser.uid);
            transaction.set(kitchenCounterRef, { items: {} });
        });
        showNotification({title: "Succes!", message: "Dit lager er blevet opdateret, og køkkenbordet er ryddet."});
    } catch (error) {
        handleError(error, `Madlavning fejlede: <br><br>${error.message.replace(/\n/g, '<br>')}`, "confirmCooking");
    }
}
