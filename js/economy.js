// js/economy.js

import { db } from './firebase.js';
import { doc, setDoc, updateDoc, addDoc, deleteDoc, collection } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;
let economyState = {
    currentView: 'monthly-budget',
    netWorthYear: new Date().getFullYear(),
};

export function initEconomy(state, elements) {
    appState = state;
    appElements = { // Cache all economy-related elements
        ...elements,
        economyTabs: document.querySelector('.economy-tabs'),
        economyViews: document.querySelectorAll('.economy-view'),
        addExpenseBtn: document.querySelector('[data-action="add-expense"]'),
        addExpenseModal: document.getElementById('add-expense-modal'),
        addExpenseForm: document.getElementById('add-expense-form'),
        assetModal: document.getElementById('asset-modal'),
        assetForm: document.getElementById('asset-form'),
        addAssetBtn: document.getElementById('add-asset-btn'),
        assetsList: document.getElementById('assets-list'),
        deleteAssetBtn: document.getElementById('delete-asset-btn'),
        liabilityModal: document.getElementById('liability-modal'),
        liabilityForm: document.getElementById('liability-form'),
        addLiabilityBtn: document.getElementById('add-liability-btn'),
        liabilitiesList: document.getElementById('liabilities-list'),
        deleteLiabilityBtn: document.getElementById('delete-liability-btn'),
        fixedExpenseModal: document.getElementById('fixed-expense-modal'),
        fixedExpenseForm: document.getElementById('fixed-expense-form'),
        deleteFixedExpenseBtn: document.getElementById('delete-fixed-expense-btn'),
        repaymentLinkGroup: document.getElementById('repayment-liability-link-group'),
        economySettingsForm: document.getElementById('economy-settings-form'),
    };

    // Main view tabs
    appElements.economyTabs.addEventListener('click', (e) => {
        if (e.target.matches('.economy-tab-btn')) {
            switchEconomyView(e.target.dataset.view);
        }
    });

    // Listeners for modals
    appElements.addExpenseBtn.addEventListener('click', openAddExpenseModal);
    appElements.addExpenseForm.addEventListener('submit', handleSaveVariableExpense);
    appElements.addAssetBtn.addEventListener('click', () => openAssetModal());
    appElements.assetForm.addEventListener('submit', handleSaveAsset);
    appElements.deleteAssetBtn.addEventListener('click', handleDeleteAsset);
    appElements.addLiabilityBtn.addEventListener('click', () => openLiabilityModal());
    appElements.liabilityForm.addEventListener('submit', handleSaveLiability);
    appElements.deleteLiabilityBtn.addEventListener('click', handleDeleteLiability);
    
    // Event delegation for asset/liability lists
    appElements.assetsList.addEventListener('click', e => {
        if (e.target.closest('.asset-card')) openAssetModal(e.target.closest('.asset-card').dataset.id);
    });
    appElements.liabilitiesList.addEventListener('click', e => {
        if (e.target.closest('.liability-card')) openLiabilityModal(e.target.closest('.liability-card').dataset.id);
    });
}

function switchEconomyView(viewName) {
    economyState.currentView = viewName;
    appElements.economyTabs.querySelectorAll('.economy-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    appElements.economyViews.forEach(view => {
        view.classList.toggle('active', view.id.includes(viewName));
    });
    renderEconomyPage(); // Re-render content for the active view
}

export function renderEconomyPage() {
    switch (economyState.currentView) {
        case 'monthly-budget':
            // Functions to render savings dashboard, what-if, and budget bars will go here
            break;
        case 'net-worth':
            renderNetWorthView();
            break;
        case 'settings':
            // Function to populate settings form will go here
            break;
    }
}

function renderNetWorthView() {
    renderAssets();
    renderLiabilities();
    // Logic to calculate and display total net worth will go here
}

// ASSET MANAGEMENT
function renderAssets() {
    const container = appElements.assetsList;
    container.innerHTML = '';
    if (!appState.assets || appState.assets.length === 0) {
        container.innerHTML = '<p class="empty-state-small">Ingen aktiver tilføjet.</p>';
        return;
    }
    appState.assets.forEach(asset => {
        const card = document.createElement('div');
        card.className = 'asset-card';
        card.dataset.id = asset.id;
        // Calculation for equity will be added here
        card.innerHTML = `
            <h5>${asset.name}</h5>
            <p>Værdi: ${asset.value.toLocaleString('da-DK')} kr.</p>
            <!-- Progress bar and equity details will go here -->
        `;
        container.appendChild(card);
    });
}

function openAssetModal(assetId = null) {
    appElements.assetForm.reset();
    const isEditing = !!assetId;
    const asset = isEditing ? appState.assets.find(a => a.id === assetId) : null;

    document.getElementById('asset-id').value = assetId || '';
    appElements.assetModal.querySelector('h3').textContent = isEditing ? 'Rediger Aktiv' : 'Nyt Aktiv';
    appElements.deleteAssetBtn.classList.toggle('hidden', !isEditing);

    if (isEditing) {
        document.getElementById('asset-name').value = asset.name;
        document.getElementById('asset-type').value = asset.type;
        document.getElementById('asset-value').value = asset.value;
        // Logic to select linked liability
    }

    populateReferenceDropdown(document.getElementById('asset-type'), appState.references.assetTypes, 'Vælg type...');
    // Logic to populate liabilities dropdown
    appElements.assetModal.classList.remove('hidden');
}

async function handleSaveAsset(e) {
    e.preventDefault();
    const assetId = document.getElementById('asset-id').value;
    const assetData = {
        name: document.getElementById('asset-name').value,
        type: document.getElementById('asset-type').value,
        value: parseFloat(document.getElementById('asset-value').value),
        linkedLiabilityId: document.getElementById('asset-linked-liability').value || null,
        userId: appState.currentUser.uid
    };

    try {
        if (assetId) {
            await updateDoc(doc(db, 'assets', assetId), assetData);
        } else {
            await addDoc(collection(db, 'assets'), assetData);
        }
        appElements.assetModal.classList.add('hidden');
        showNotification({ title: 'Gemt!', message: 'Dit aktiv er blevet gemt.' });
    } catch (error) {
        handleError(error, 'Kunne ikke gemme aktiv.', 'saveAsset');
    }
}

async function handleDeleteAsset() {
    // Logic for deleting an asset
}

// LIABILITY MANAGEMENT
function renderLiabilities() {
    const container = appElements.liabilitiesList;
    container.innerHTML = '';
    if (!appState.liabilities || appState.liabilities.length === 0) {
        container.innerHTML = '<p class="empty-state-small">Ingen gæld tilføjet.</p>';
        return;
    }
    appState.liabilities.forEach(liability => {
        const card = document.createElement('div');
        card.className = 'liability-card';
        card.dataset.id = liability.id;
        card.innerHTML = `
            <h5>${liability.name}</h5>
            <p>Nuværende gæld: ${liability.currentBalance.toLocaleString('da-DK')} kr.</p>
        `;
        container.appendChild(card);
    });
}

function openLiabilityModal(liabilityId = null) {
    appElements.liabilityForm.reset();
    const isEditing = !!liabilityId;
    const liability = isEditing ? appState.liabilities.find(l => l.id === liabilityId) : null;

    document.getElementById('liability-id').value = liabilityId || '';
    appElements.liabilityModal.querySelector('h3').textContent = isEditing ? 'Rediger Gæld' : 'Ny Gæld';
    appElements.deleteLiabilityBtn.classList.toggle('hidden', !isEditing);

    if (isEditing) {
        document.getElementById('liability-name').value = liability.name;
        document.getElementById('liability-original-amount').value = liability.originalAmount;
    }
    appElements.liabilityModal.classList.remove('hidden');
}

async function handleSaveLiability(e) {
    e.preventDefault();
    const liabilityId = document.getElementById('liability-id').value;
    const originalAmount = parseFloat(document.getElementById('liability-original-amount').value);
    const liabilityData = {
        name: document.getElementById('liability-name').value,
        originalAmount: originalAmount,
        currentBalance: liabilityId ? appState.liabilities.find(l=>l.id===liabilityId).currentBalance : originalAmount, // Set initial balance
        userId: appState.currentUser.uid
    };

    try {
        if (liabilityId) {
            await updateDoc(doc(db, 'liabilities', liabilityId), liabilityData);
        } else {
            await addDoc(collection(db, 'liabilities'), liabilityData);
        }
        appElements.liabilityModal.classList.add('hidden');
        showNotification({ title: 'Gemt!', message: 'Din gældspost er blevet gemt.' });
    } catch (error) {
        handleError(error, 'Kunne ikke gemme gæld.', 'saveLiability');
    }
}

async function handleDeleteLiability() {
    // Logic for deleting a liability
}


// VARIABLE EXPENSE MANAGEMENT
function openAddExpenseModal() {
    appElements.addExpenseForm.reset();
    document.getElementById('add-expense-date').value = formatDate(new Date());
    populateReferenceDropdown(document.getElementById('add-expense-main-category'), (appState.references.budgetCategories || []).map(c => c.name), 'Vælg kategori...');
    appElements.addExpenseModal.classList.remove('hidden');
}

async function handleSaveVariableExpense(e) {
    e.preventDefault();
    const expenseData = {
        amount: parseFloat(document.getElementById('add-expense-amount').value),
        date: new Date(document.getElementById('add-expense-date').value),
        mainCategory: document.getElementById('add-expense-main-category').value,
        description: document.getElementById('add-expense-description').value,
        isImpulse: document.getElementById('add-expense-is-impulse').checked,
        userId: appState.currentUser.uid
    };

    try {
        await addDoc(collection(db, 'expenses'), expenseData);
        appElements.addExpenseModal.classList.add('hidden');
        showNotification({ title: 'Gemt!', message: 'Din udgift er registreret.' });
    } catch (error) {
        handleError(error, 'Kunne ikke gemme udgift.', 'saveVariableExpense');
    }
}


// Helper function
function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    selectElement.value = currentValue || "";
}
