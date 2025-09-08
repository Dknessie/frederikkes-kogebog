// js/shoppingList.js

import { db } from './firebase.js';
import { doc, setDoc, writeBatch, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
        bulkAddModal: document.getElementById('bulk-add-modal'),
        bulkAddForm: document.getElementById('bulk-add-form'),
        bulkAddListContainer: document.getElementById('bulk-add-list-container'),
    };

    if (appElements.generateGroceriesBtn) {
        appElements.generateGroceriesBtn.addEventListener('click', generateGroceriesList);
    }
    
    // Modal listeners
    if (appElements.shoppingListModal) {
        appElements.shoppingListModal.addEventListener('click', (e) => {
            const clearBtn = e.target.closest('#clear-shopping-list-btn');
            const confirmBtn = e.target.closest('#confirm-purchase-btn');

            if (clearBtn) {
                handleClearShoppingList();
            } else if (confirmBtn) {
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

    if (appElements.bulkAddForm) {
        appElements.bulkAddForm.addEventListener('submit', handleBulkSave);
    }
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
    if (!wrapper) return;
    
    const list = appState.shoppingLists[currentListType] || {};
    wrapper.innerHTML = ''; 

    switch (currentListType) {
        case 'groceries':
            wrapper.innerHTML = renderGroceriesList(list);
            break;
        case 'materials':
            // Denne del kan udbygges senere, hvis materialelisten skal have et unikt design
            wrapper.innerHTML = `<p class="empty-state">Materialelisten er under udvikling.</p>`;
            break;
        case 'wishlist':
            // Ønskelisten håndteres nu under 'Hjemmet', så vi viser en henvisning.
            wrapper.innerHTML = `<p class="empty-state">Ønskelisten administreres nu under 'Hjemmet'.</p>`;
            break;
    }
}

function renderGroceriesList(list) {
    const items = Object.values(list);
    if (items.length === 0) {
        return `<p class="empty-state">Indkøbslisten er tom.</p>`;
    }

    const groupedByStore = items.reduce((acc, item) => {
        const store = item.storeId || 'Andet';
        if (!acc[store]) acc[store] = [];
        acc[store].push(item);
        return acc;
    }, {});

    const storeOrder = [...Object.keys(groupedByStore)].sort();
    
    let html = '';
    storeOrder.forEach(store => {
        html += `<div class="store-section"><h4>${store}</h4><ul>`;
        groupedByStore[store].sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
            html += `
                <li class="shopping-list-item" data-item-name="${item.name}">
                    <label class="shopping-list-item-label">
                        <input type="checkbox" class="shopping-list-checkbox">
                        <span class="custom-checkbox"></span>
                        <div class="item-details">
                            <span class="item-name">${item.name}</span>
                            <span class="item-quantity">${item.quantity_to_buy} ${item.unit}</span>
                        </div>
                    </label>
                    <button class="btn-icon remove-from-list-btn" title="Fjern fra liste"><i class="fas fa-times"></i></button>
                </li>`;
        });
        html += `</ul></div>`;
    });

    return html;
}

async function updateShoppingListInFirestore(newList) {
    try {
        const shoppingListRef = doc(db, 'shopping_lists', appState.currentUser.uid);
        await setDoc(shoppingListRef, { groceries: newList }, { merge: true });
    } catch (error) {
        handleError(error, "Indkøbslisten kunne ikke gemmes.", "updateShoppingList");
    }
}

async function generateGroceriesList() {
    // Denne funktion er kompleks og forbliver som den er, da den genererer den nødvendige data.
    // ... (eksisterende logik for at beregne `shoppingList`)
}

async function handleClearShoppingList() {
    const confirmed = await showNotification({
        title: "Ryd Indkøbsliste",
        message: `Er du sikker på, du vil slette alle varer fra listen?`,
        type: 'confirm'
    });
    if (confirmed) {
        await updateShoppingListInFirestore({});
    }
}

async function handleAddShoppingItem(itemName) {
    // Logik tilføjes senere - denne er ikke en del af redesignet endnu
}

async function handleRemoveShoppingItem(itemName) {
    const list = appState.shoppingLists.groceries || {};
    const keyToDelete = Object.keys(list).find(k => list[k].name.toLowerCase() === itemName.toLowerCase());
    if(keyToDelete) {
        delete list[keyToDelete];
        await updateShoppingListInFirestore(list);
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
        return showNotification({ title: "Intet valgt", message: "Vælg de varer, du har købt." });
    }
    openBulkAddModal(checkedItems);
}

function openBulkAddModal(items) {
    // Eksisterende funktion
}

async function handleBulkSave(e) {
    // Eksisterende funktion
}

export async function addSingleItemToGroceries(itemId) {
    const inventoryItem = appState.inventory.find(i => i.id === itemId);
    if (!inventoryItem) {
        return handleError(new Error("Vare ikke fundet"), "Varen kunne ikke tilføjes.");
    }

    const list = appState.shoppingLists.groceries || {};
    const key = inventoryItem.name.toLowerCase();

    if (list[key]) {
        return showNotification({ title: "Vare findes allerede", message: `${inventoryItem.name} er allerede på listen.` });
    }
    
    const lastBatch = (inventoryItem.batches || []).sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate))[0];
    
    const newItem = {
        name: inventoryItem.name,
        quantity_to_buy: 1, // Default to 1
        unit: lastBatch ? `${lastBatch.size}${lastBatch.unit}` : inventoryItem.defaultUnit,
        storeId: lastBatch?.store || 'Andet',
        itemId: inventoryItem.id,
    };

    const updatedList = { ...list, [key]: newItem };
    await updateShoppingListInFirestore(updatedList);
    showNotification({ title: "Tilføjet!", message: `${inventoryItem.name} er tilføjet til indkøbslisten.` });
}

function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    selectElement.value = currentValue || "";
}

