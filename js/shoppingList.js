// js/shoppingList.js

import { db } from './firebase.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { getWeekNumber, getStartOfWeek, formatDate } from './utils.js';
// FJERNET: openBatchModal og openInventoryItemModal er ikke længere nødvendige her
// import { openBatchModal, openInventoryItemModal } from './inventory.js';

let appState;
let appElements;
let currentListType = 'groceries'; // To track which list is open in the modal

export function initShoppingList(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        // FJERNET: bulk add modal er ikke længere i brug
    };

    if (appElements.generateGroceriesBtn) {
        appElements.generateGroceriesBtn.addEventListener('click', generateGroceriesList);
    }
    
    // Modal listeners
    if (appElements.shoppingListModal) {
        appElements.shoppingListModal.addEventListener('click', (e) => {
            if (e.target.closest('.shopping-list-clear-btn')) {
                handleClearShoppingList();
            } else if (e.target.closest('.shopping-list-confirm-btn')) {
                // FJERNET: Bekræft indkøb er ikke en funktion længere
                showNotification({title: "Funktion Fjernet", message: "Denne funktion er fjernet, da lagerstyring er udgået."});
            } else if (e.target.closest('.remove-from-list-btn')) {
                const itemName = e.target.closest('[data-item-name]').dataset.itemName;
                handleRemoveShoppingItem(itemName);
            } else if (e.target.matches('.shopping-list-checkbox')) {
                const listItem = e.target.closest('.shopping-list-item');
                listItem.classList.toggle('is-checked');
            }
            // FJERNET: Opret vare fra indkøbsliste er ikke længere relevant
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

    // FJERNET: Listeners for bulk add og reorder er fjernet
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

    renderListInModal();
    appElements.shoppingListModal.classList.remove('hidden');
}

function renderListInModal() {
    const wrapper = appElements.shoppingListModalContentWrapper;
    if (!wrapper) {
        console.error("shoppingListModalContentWrapper is not found in the DOM");
        return;
    }
    const list = appState.shoppingLists[currentListType] || {};
    wrapper.innerHTML = ''; // Clear previous content

    let listContentHTML = '';

    switch (currentListType) {
        case 'groceries':
            listContentHTML = renderGroceriesList(list);
            break;
        case 'materials':
            // Denne funktion skal muligvis opdateres i fremtiden, hvis materialer skal have pris/kalorier
            listContentHTML = renderMaterialsList(list);
            break;
        case 'wishlist':
            listContentHTML = renderWishlist(list);
            break;
    }

    wrapper.innerHTML = `
        ${createModalControlsHTML(currentListType === 'wishlist')}
        <div class="shopping-list-scroll-container">
            ${listContentHTML}
        </div>
    `;
}

function renderGroceriesList(list) {
    const groupedBySubCategory = {};
    Object.values(list).forEach(item => {
        // OPDATERING: Finder info fra ingrediens-biblioteket
        const info = appState.ingredientInfo.find(i => i.name.toLowerCase() === item.name.toLowerCase());
        const subCategory = info?.subCategory || 'Andet';
        if (!groupedBySubCategory[subCategory]) {
            groupedBySubCategory[subCategory] = [];
        }
        groupedBySubCategory[subCategory].push(item);
    });

    if (Object.keys(groupedBySubCategory).length === 0) {
        return `<p class="empty-state">Indkøbslisten er tom.</p>`;
    }

    let html = '';
    const sortedCategories = Object.keys(groupedBySubCategory).sort((a, b) => a.localeCompare(b));
    
    sortedCategories.forEach(subCategory => {
        html += `<div class="store-section"><h4>${subCategory}</h4><ul>`;
        groupedBySubCategory[subCategory].sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
            const safeItemName = item.name.replace(/[^a-zA-Z0-9]/g, '-');
            // OPDATERING: Forenklet quantity-tekst
            const quantityText = `${item.quantity} ${item.unit}`;

            html += `
                <li class="shopping-list-item" data-item-name="${item.name}">
                    <input type="checkbox" id="shop-${safeItemName}" class="shopping-list-checkbox">
                    <label for="shop-${safeItemName}" class="shopping-list-item-label">${item.name} <span>(${quantityText})</span></label>
                    <div class="shopping-list-item-actions">
                        <button class="btn-icon remove-from-list-btn" title="Fjern fra liste"><i class="fas fa-times-circle"></i></button>
                    </div>
                </li>`;
        });
        html += `</ul></div>`;
    });

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
        return `<p class="empty-state">Materialelisten er tom.</p>`;
    }

    let html = '';
    for (const projectId in groupedByProject) {
        const projectName = appState.projects.find(p => p.id === projectId)?.title || projectId;
        html += `<div class="project-group"><h4>${projectName}</h4>`;
        html += `
            <div class="material-row material-header">
                <span>Materiale</span>
                <span style="text-align: right;">Mængde</span>
                <span>Note</span>
            </div>
        `;
        groupedByProject[projectId].forEach(item => {
            html += `
                <div class="material-row" data-item-name="${item.name}">
                    <span class="material-name">${item.name}</span>
                    <span style="text-align: right;">${(item.quantity_to_buy || 0).toFixed(0)} ${item.unit || ''}</span>
                    <span class="small-text">${item.note || ''}</span>
                </div>
            `;
        });
        html += `</div>`;
    }
    return html;
}

function renderWishlist(list) {
    const items = Object.values(list);
    if (items.length === 0) {
        return `<p class="empty-state">Ønskelisten er tom.</p>`;
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
    return html;
}

function createModalControlsHTML(isWishlist = false) {
    // FJERNET: Bekræft-knap er fjernet, da lagerstyring er udgået
    const addText = isWishlist ? 'ønske' : 'vare';
    
    return `
        <div class="shopping-list-controls">
            <form class="add-item-form">
                <input type="text" placeholder="Tilføj ${addText}..." required>
                <button type="submit" class="btn-icon"><i class="fas fa-plus-circle"></i></button>
            </form>
            <div class="shopping-list-actions">
                <button class="btn btn-secondary shopping-list-clear-btn"><i class="fas fa-trash"></i> Ryd Liste</button>
            </div>
        </div>
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

/**
 * OPDATERING: Funktionen er kraftigt simplificeret. Den tjekker ikke længere lagerstatus.
 */
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
        // Opretter et simpelt objekt til listen uden at tjekke lager
        shoppingList[ingKey] = { 
            name: needed.name, 
            quantity: Math.ceil(needed.total), // Runder op til nærmeste hele tal for simplicitet
            unit: needed.unit
        };
    }
    
    await updateShoppingListInFirestore('groceries', shoppingList);
    showNotification({ title: "Opdateret", message: `Indkøbslisten for dagligvarer (uge ${getWeekNumber(start)}) er blevet genereret.` });
}


async function handleClearShoppingList() {
    if (currentListType !== 'groceries' && currentListType !== 'wishlist') {
        showNotification({title: "Handling ikke tilladt", message: "Denne liste kan kun redigeres fra dens kilde (Projekter)."})
        return;
    }
    const confirmed = await showNotification({
        title: "Ryd Liste",
        message: `Er du sikker på, at du vil slette alle emner fra listen "${appElements.shoppingListModalTitle.textContent}"?`,
        type: 'confirm'
    });
    if (confirmed) {
        await updateShoppingListInFirestore(currentListType, {});
        renderListInModal(); // Immediate UI update
    }
}

async function handleAddShoppingItem(itemName) {
    if (currentListType !== 'groceries') {
        showNotification({title: "Handling ikke tilladt", message: "Varer til denne liste tilføjes automatisk."});
        return;
    }
    const list = appState.shoppingLists.groceries || {};
    const updatedList = { ...list };
    const key = itemName.toLowerCase();

    if (updatedList[key]) {
        showNotification({ title: "Vare findes allerede", message: `${itemName} er allerede på listen.`});
        return;
    }
    
    // Opretter et simpelt objekt
    updatedList[key] = {
        name: itemName,
        quantity: 1,
        unit: 'stk',
    };
    
    await updateShoppingListInFirestore('groceries', updatedList);
    renderListInModal();
}


async function handleRemoveShoppingItem(itemName) {
    if (currentListType !== 'groceries' && currentListType !== 'wishlist') {
        showNotification({title: "Handling ikke tilladt", message: "Denne liste kan kun redigeres fra dens kilde."})
        return;
    }
    const list = appState.shoppingLists[currentListType] || {};
    const updatedList = { ...list };
    const keyToDelete = Object.keys(updatedList).find(k => updatedList[k].name.toLowerCase() === itemName.toLowerCase());
    if(keyToDelete) {
        delete updatedList[keyToDelete];
        await updateShoppingListInFirestore(currentListType, updatedList);
        renderListInModal();
    }
}
