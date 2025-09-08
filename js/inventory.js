// js/inventory.js

import { db } from './firebase.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';

let appState;
let appElements;
let draggedItemData = null;

// Lokal state for den nye varelager-side
const inventoryState = {
    currentView: 'dashboard', // 'dashboard' or a specific location like 'Fryser'
    searchTerm: '',
};

// Mapning af lokations-ID'er til ikoner og navne
const locationConfig = {
    'Køleskab': { icon: 'fa-temperature-low', name: 'Køleskab' },
    'Fryser': { icon: 'fa-snowflake', name: 'Fryser' },
    'Tørvarelager': { icon: 'fa-box', name: 'Tørvarelager' },
};

export function initInventory(state, elements) {
    appState = state;
    appElements = elements;
    
    // Event delegation for den nye dynamiske side
    const pageContainer = document.getElementById('inventory');
    if (pageContainer) {
        pageContainer.addEventListener('click', handleInventoryPageClick);
        
        // Drag and Drop event listeners
        pageContainer.addEventListener('dragstart', handleDragStart);
        pageContainer.addEventListener('dragover', handleDragOver);
        pageContainer.addEventListener('dragleave', handleDragLeave);
        pageContainer.addEventListener('drop', handleDrop);
        pageContainer.addEventListener('dragend', handleDragEnd);
    }
}

export function renderInventory() {
    const pageContainer = document.getElementById('inventory-page-content');
    if (!pageContainer) return;

    // Byg sidens skelet, hvis det ikke allerede eksisterer
    if (!pageContainer.querySelector('.inventory-header')) {
        pageContainer.innerHTML = `
            <div class="inventory-header">
                <div id="inventory-breadcrumb"></div>
                <div class="search-bar">
                    <input type="text" id="inventory-live-search" placeholder="Søg i hele varelageret...">
                    <i class="fas fa-search"></i>
                </div>
            </div>
            <div id="inventory-main-view"></div>
        `;
        // Tilføj event listener til den nye søgebar
        document.getElementById('inventory-live-search').addEventListener('input', (e) => {
            inventoryState.searchTerm = e.target.value.toLowerCase();
            renderCurrentView(); // Gen-render den aktuelle visning med søgefilteret
        });
    }

    renderCurrentView();
}

function renderCurrentView() {
    updateBreadcrumb();
    if (inventoryState.currentView === 'dashboard') {
        renderDashboardView();
    } else {
        renderLocationDetailView(inventoryState.currentView);
    }
}

function updateBreadcrumb() {
    const breadcrumb = document.getElementById('inventory-breadcrumb');
    if (!breadcrumb) return;

    if (inventoryState.currentView === 'dashboard') {
        breadcrumb.innerHTML = `<h3>Mit Varelager</h3>`;
    } else {
        breadcrumb.innerHTML = `
            <a href="#" class="inventory-breadcrumb-link" data-view="dashboard">Mit Varelager</a>
            <i class="fas fa-chevron-right"></i>
            <h3>${inventoryState.currentView}</h3>
        `;
    }
}

function renderDashboardView() {
    const container = document.getElementById('inventory-main-view');
    const locations = ['Køleskab', 'Fryser', 'Tørvarelager'];
    
    let locationsHTML = locations.map(loc => {
        const itemsInLocation = appState.inventory.filter(item => item.location === loc);
        const expiringSoon = itemsInLocation.filter(item => {
            const daysLeft = calculateDaysLeft(item);
            return daysLeft !== null && daysLeft <= 7;
        }).length;

        return `
            <div class="location-widget" data-location="${loc}">
                <div class="location-widget-header">
                    <i class="fas ${locationConfig[loc].icon}"></i>
                    <h4>${locationConfig[loc].name}</h4>
                </div>
                <div class="location-widget-content">
                    <p><strong>${itemsInLocation.length}</strong> vare${itemsInLocation.length !== 1 ? 'r' : ''} i alt</p>
                    ${expiringSoon > 0 ? `<p class="expiring-soon-warning">${expiringSoon} udløber snart!</p>` : ''}
                </div>
            </div>
        `;
    }).join('');

    // Anvend søgefilter hvis der er en søgeterm
    if (inventoryState.searchTerm) {
        const filteredItems = appState.inventory.filter(item => item.name.toLowerCase().includes(inventoryState.searchTerm));
        locationsHTML = `<div class="search-results-container">${renderItemCards(filteredItems)}</div>`;
        if (filteredItems.length === 0) {
             locationsHTML = `<p class="empty-state">Ingen varer matchede din søgning.</p>`;
        }
    }

    container.innerHTML = `<div class="location-dashboard-grid">${locationsHTML}</div>`;
}

function renderLocationDetailView(locationName) {
    const container = document.getElementById('inventory-main-view');
    let itemsInLocation = appState.inventory.filter(item => item.location === locationName);
    
    if (inventoryState.searchTerm) {
        itemsInLocation = itemsInLocation.filter(item => item.name.toLowerCase().includes(inventoryState.searchTerm));
    }
    
    let contentHTML = '';

    if (locationName === 'Fryser') {
        const freezerDrawers = appState.references.itemCategories
            .find(cat => cat.name === 'Kød' || cat.name === 'Frostvarer')?.subcategories || ['Brød', 'Oksekød', 'Svin', 'Kylling', 'Grøntsager', 'Is', 'Andet'];
        
        const groupedByDrawer = {};
        freezerDrawers.forEach(drawer => groupedByDrawer[drawer] = []);
        groupedByDrawer['Andet'] = groupedByDrawer['Andet'] || [];

        itemsInLocation.forEach(item => {
            const drawer = item.subCategory && freezerDrawers.includes(item.subCategory) ? item.subCategory : 'Andet';
            groupedByDrawer[drawer].push(item);
        });

        contentHTML = Object.entries(groupedByDrawer).map(([drawerName, items]) => {
            const shelfLife = appState.references.freezerShelfLife?.[drawerName];
            const shelfLifeText = shelfLife ? `<span class="shelf-life-info">Est. holdbarhed: ${shelfLife} mdr.</span>` : '';
            return `
                <div class="freezer-drawer" data-location="${locationName}" data-subcategory="${drawerName}">
                    <div class="freezer-drawer-header">
                        <h5>${drawerName}</h5>
                        ${shelfLifeText}
                    </div>
                    <div class="inventory-item-grid">
                        ${items.length > 0 ? renderItemCards(items) : '<p class="empty-state-small">Tom skuffe</p>'}
                    </div>
                </div>
            `;
        }).join('');

    } else {
        contentHTML = `<div class="inventory-item-grid">${renderItemCards(itemsInLocation)}</div>`;
    }

    container.innerHTML = contentHTML;
}

function renderItemCards(items) {
    if (items.length === 0 && !inventoryState.searchTerm) {
        return `<p class="empty-state">Der er ingen varer her.</p>`;
    }
    return items.map(item => {
        const daysLeft = calculateDaysLeft(item);
        let expiryStatus = 'ok';
        let expiryText = '';

        if (daysLeft !== null) {
            if (daysLeft <= 0) {
                expiryStatus = 'expired';
                expiryText = `Udløbet for ${Math.abs(daysLeft)} dage siden`;
            } else if (daysLeft <= 7) {
                expiryStatus = 'soon';
                expiryText = `Udløber om ${daysLeft} dage`;
            } else {
                expiryText = `Udløber ${item.batches[0].expiryDate}`;
            }
        }
        
        return `
            <div class="inventory-item-card" draggable="true" data-item-id="${item.id}">
                <div class="item-card-border item-card-border-${expiryStatus}"></div>
                <div class="item-card-content">
                    <span class="item-card-name">${item.name}</span>
                    <span class="item-card-quantity">${item.totalStock.toFixed(0)} ${item.defaultUnit}</span>
                    <span class="item-card-expiry">${expiryText}</span>
                </div>
            </div>
        `;
    }).join('');
}

function calculateDaysLeft(item) {
    if (!item.batches || item.batches.length === 0) return null;

    // Find den tidligste udløbsdato
    const earliestExpiry = item.batches
        .map(b => b.expiryDate)
        .filter(Boolean)
        .sort()[0];

    if (earliestExpiry) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiryDate = new Date(earliestExpiry);
        return Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    }
    
    // Hvis ingen udløbsdato, og varen er i fryseren, beregn estimat
    if (item.location === 'Fryser') {
        const shelfLifeMonths = appState.references.freezerShelfLife?.[item.subCategory];
        if (shelfLifeMonths) {
            const purchaseDate = new Date(item.batches[0].purchaseDate);
            const estimatedExpiry = new Date(purchaseDate.setMonth(purchaseDate.getMonth() + shelfLifeMonths));
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return Math.ceil((estimatedExpiry - today) / (1000 * 60 * 60 * 24));
        }
    }

    return null;
}

function handleInventoryPageClick(e) {
    const widget = e.target.closest('.location-widget');
    if (widget) {
        inventoryState.currentView = widget.dataset.location;
        renderCurrentView();
        return;
    }

    const breadcrumbLink = e.target.closest('.inventory-breadcrumb-link');
    if (breadcrumbLink) {
        e.preventDefault();
        inventoryState.currentView = breadcrumbLink.dataset.view;
        renderCurrentView();
        return;
    }
}

// --- Drag and Drop Handlers ---
function handleDragStart(e) {
    const itemCard = e.target.closest('.inventory-item-card');
    if (itemCard) {
        draggedItemData = { itemId: itemCard.dataset.itemId };
        e.dataTransfer.effectAllowed = 'move';
        // Gør det lidt gennemsigtigt
        setTimeout(() => itemCard.classList.add('dragging'), 0);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    const dropZone = e.target.closest('.location-widget, .freezer-drawer');
    if (dropZone) {
        dropZone.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const dropZone = e.target.closest('.location-widget, .freezer-drawer');
    if (dropZone) {
        dropZone.classList.remove('drag-over');
    }
}

async function handleDrop(e) {
    e.preventDefault();
    const dropZone = e.target.closest('.location-widget, .freezer-drawer');
    if (!dropZone || !draggedItemData) return;

    dropZone.classList.remove('drag-over');
    
    const targetLocation = dropZone.dataset.location;
    const targetSubCategory = dropZone.dataset.subcategory || null;

    const itemRef = doc(db, 'inventory_items', draggedItemData.itemId);
    const updateData = { location: targetLocation };
    if (targetSubCategory) {
        updateData.subCategory = targetSubCategory;
    }

    try {
        await updateDoc(itemRef, updateData);
        showNotification({title: "Vare flyttet", message: "Placeringen er opdateret."});
    } catch (error) {
        handleError(error, "Kunne ikke flytte varen.", "moveInventoryItem");
    }

    draggedItemData = null;
}

function handleDragEnd(e) {
    const draggedCard = document.querySelector('.inventory-item-card.dragging');
    if (draggedCard) {
        draggedCard.classList.remove('dragging');
    }
    draggedItemData = null;
}
