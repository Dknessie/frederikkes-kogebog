// js/inventory.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { debounce, formatDate } from './utils.js';
import { addToShoppingList } from './shoppingList.js';

let appState;
let appElements;
let inventoryState = {
    searchTerm: '',
    activeFilter: 'all',
    activeCategories: new Set(),
    sortBy: 'name_asc',
    referencesLoaded: false 
};

export function initInventory(state, elements) {
    appState = state;
    appElements = elements;

    appElements.addInventoryItemBtn.addEventListener('click', () => openMasterProductModal(null));
    // appElements.reorderAssistantBtn.addEventListener('click', openReorderAssistant);
    
    // appElements.inventoryItemForm.addEventListener('submit', handleSaveItem);
    // appElements.reorderForm.addEventListener('submit', handleReorderSubmit);

    appElements.inventorySearchInput.addEventListener('input', debounce(e => {
        inventoryState.searchTerm = e.target.value.toLowerCase();
        renderInventory();
    }, 300));

    appElements.inventoryListContainer.addEventListener('click', e => {
        const button = e.target.closest('button');
        if (!button) return;
    
        if (button.classList.contains('edit-master-btn')) {
            openMasterProductModal(button.dataset.id);
        }
        if (button.classList.contains('add-variant-btn')) {
            openMasterProductModal(button.dataset.masterId, true); // Open modal with focus on adding a variant
        }
    });
}

export function setReferencesLoaded(isLoaded) {
    inventoryState.referencesLoaded = isLoaded;
    if (document.querySelector('#inventory:not(.hidden)')) {
        renderInventory();
    }
}

export function renderInventory() {
    const container = appElements.inventoryListContainer;
    container.innerHTML = '';

    let masterProducts = [...appState.inventory];

    // Midlertidig simplificeret filtrering
    if (inventoryState.searchTerm) {
        const term = inventoryState.searchTerm.toLowerCase();
        masterProducts = masterProducts.filter(mp => 
            mp.name.toLowerCase().includes(term) || 
            mp.variants.some(v => v.variantName.toLowerCase().includes(term))
        );
    }

    if (masterProducts.length === 0) {
        container.innerHTML = `<p class="empty-state">Ingen varer fundet. Klik på "Tilføj ny vare" for at oprette dit første master-produkt.</p>`;
        return;
    }

    masterProducts.sort((a, b) => a.name.localeCompare(b.name));

    const fragment = document.createDocumentFragment();
    masterProducts.forEach(mp => {
        const masterDiv = document.createElement('div');
        masterDiv.className = 'master-product-item';
        
        const variantsHTML = mp.variants.map(v => {
            const storeName = appState.references.stores?.find(s => s === v.storeId) || v.storeId || 'Ukendt butik';
            return `
                <div class="variant-item">
                    <span class="variant-name">${v.variantName} <span class="variant-store">(${storeName})</span></span>
                    <span class="variant-stock">Lager: ${v.currentStock || 0} stk.</span>
                    <span class="variant-price">${v.kgPrice ? v.kgPrice.toFixed(2) + ' kr/kg' : ''}</span>
                    <div class="variant-actions">
                        <button class="btn-icon edit-variant-btn" data-id="${v.id}" title="Rediger variant"><i class="fas fa-edit"></i></button>
                    </div>
                </div>
            `;
        }).join('');

        const totalStockDisplay = mp.totalStockGrams >= 1000 
            ? `${(mp.totalStockGrams / 1000).toFixed(2)} kg`
            : `${mp.totalStockGrams.toFixed(0)} g`;

        masterDiv.innerHTML = `
            <div class="master-product-header" data-id="${mp.id}">
                <div class="master-product-info">
                    <h4>${mp.name}</h4>
                    <span class="master-product-category">${mp.category || 'Ukategoriseret'}</span>
                </div>
                <div class="master-product-stock-info">
                    <span>Total lager (ca.):</span>
                    <span class="master-product-stock-amount">${totalStockDisplay}</span>
                </div>
                <div class="master-product-actions">
                    <button class="btn-icon edit-master-btn" data-id="${mp.id}" title="Rediger master-produkt"><i class="fas fa-cog"></i></button>
                    <button class="btn-icon add-variant-btn" data-master-id="${mp.id}" title="Tilføj ny variant"><i class="fas fa-plus"></i></button>
                </div>
            </div>
            <div class="variant-list">
                ${variantsHTML || '<p class="empty-state-small">Ingen varianter oprettet.</p>'}
            </div>
        `;
        fragment.appendChild(masterDiv);
    });

    container.appendChild(fragment);
}

function openMasterProductModal(masterProductId, focusOnVariant = false) {
    showNotification({ 
        title: "Under Ombygning", 
        message: "Funktionen til at tilføje og redigere varer er ved at blive genopbygget for at understøtte varevarianter. Dette er næste skridt." 
    });
}
