// js/economy.js

import { db } from './firebase.js';
import { doc, setDoc, updateDoc, addDoc, deleteDoc, collection, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;
let economyState = {
    currentView: 'monthly-budget',
    // NYT: Holder styr på den måned, vi kigger på
    viewDate: new Date(), 
};

export function initEconomy(state, elements) {
    appState = state;
    appElements = { // Cache all economy-related elements
        ...elements,
        economyTabs: document.querySelector('.economy-tabs'),
        economyViews: document.querySelectorAll('.economy-view'),
        
        // Expense Modal
        addExpenseBtn: document.querySelector('[data-action="add-expense"]'),
        addExpenseModal: document.getElementById('add-expense-modal'),
        addExpenseForm: document.getElementById('add-expense-form'),

        // Net Worth Elements
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
        netWorthTotalAssets: document.getElementById('net-worth-total-assets'),
        netWorthTotalLiabilities: document.getElementById('net-worth-total-liabilities'),
        netWorthTotalValue: document.getElementById('net-worth-total-value'),

        // Settings Elements
        fixedExpenseModal: document.getElementById('fixed-expense-modal'),
        fixedExpenseForm: document.getElementById('fixed-expense-form'),
        deleteFixedExpenseBtn: document.getElementById('delete-fixed-expense-btn'),
        repaymentLinkGroup: document.getElementById('repayment-liability-link-group'),
        economySettingsForm: document.getElementById('economy-settings-form'),
        fixedExpensesList: document.getElementById('fixed-expenses-list'),
        addFixedExpenseBtn: document.getElementById('add-fixed-expense-btn'),
    };

    // Main view tabs
    appElements.economyTabs.addEventListener('click', (e) => {
        if (e.target.matches('.economy-tab-btn')) {
            switchEconomyView(e.target.dataset.view);
        }
    });

    // Listeners for modals
    if(appElements.addExpenseBtn) appElements.addExpenseBtn.addEventListener('click', openAddExpenseModal);
    if(appElements.addExpenseForm) appElements.addExpenseForm.addEventListener('submit', handleSaveVariableExpense);
    if(appElements.addAssetBtn) appElements.addAssetBtn.addEventListener('click', () => openAssetModal());
    if(appElements.assetForm) appElements.assetForm.addEventListener('submit', handleSaveAsset);
    if(appElements.deleteAssetBtn) appElements.deleteAssetBtn.addEventListener('click', handleDeleteAsset);
    if(appElements.addLiabilityBtn) appElements.addLiabilityBtn.addEventListener('click', () => openLiabilityModal());
    if(appElements.liabilityForm) appElements.liabilityForm.addEventListener('submit', handleSaveLiability);
    if(appElements.deleteLiabilityBtn) appElements.deleteLiabilityBtn.addEventListener('click', handleDeleteLiability);
    if(appElements.addFixedExpenseBtn) appElements.addFixedExpenseBtn.addEventListener('click', () => openFixedExpenseModal());
    if(appElements.fixedExpenseForm) appElements.fixedExpenseForm.addEventListener('submit', handleSaveFixedExpense);
    if(appElements.deleteFixedExpenseBtn) appElements.deleteFixedExpenseBtn.addEventListener('click', handleDeleteFixedExpense);
    if(appElements.economySettingsForm) appElements.economySettingsForm.addEventListener('submit', handleSaveEconomySettings);
    
    // Event delegation for asset/liability/fixed expense lists
    if(appElements.assetsList) appElements.assetsList.addEventListener('click', e => {
        if (e.target.closest('.asset-card')) openAssetModal(e.target.closest('.asset-card').dataset.id);
    });
    if(appElements.liabilitiesList) appElements.liabilitiesList.addEventListener('click', e => {
        if (e.target.closest('.liability-card')) openLiabilityModal(e.target.closest('.liability-card').dataset.id);
    });
    if(appElements.fixedExpensesList) appElements.fixedExpensesList.addEventListener('click', e => {
        if (e.target.closest('.fixed-expense-item')) openFixedExpenseModal(e.target.closest('.fixed-expense-item').dataset.id);
    });

    // Connect checkbox to dropdown visibility in fixed expense modal
    const isRepaymentCheckbox = document.getElementById('fixed-expense-is-repayment');
    if (isRepaymentCheckbox) {
        isRepaymentCheckbox.addEventListener('change', (e) => {
            appElements.repaymentLinkGroup.classList.toggle('hidden', !e.target.checked);
        });
    }

    // Connect main category to sub category dropdowns
    const mainCategorySelect = document.getElementById('add-expense-main-category');
    if (mainCategorySelect) {
        mainCategorySelect.addEventListener('change', () => {
             populateSubCategoryDropdown(
                document.getElementById('add-expense-sub-category'), 
                mainCategorySelect.value
             );
        });
    }
    const fixedMainCategorySelect = document.getElementById('fixed-expense-main-category');
    if (fixedMainCategorySelect) {
        fixedMainCategorySelect.addEventListener('change', () => {
             populateSubCategoryDropdown(
                document.getElementById('fixed-expense-sub-category'), 
                fixedMainCategorySelect.value
             );
        });
    }
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
            renderMonthlyBudgetView();
            break;
        case 'net-worth':
            renderNetWorthView();
            break;
        case 'settings':
            renderSettingsView();
            break;
    }
}

// --- MONTHLY BUDGET VIEW ---

function renderMonthlyBudgetView() {
    // This will be the main function to orchestrate the rendering of the budget dashboard
    const year = economyState.viewDate.getFullYear();
    const month = economyState.viewDate.getMonth();

    // 1. Get all relevant expenses for the current view month
    const monthlyExpenses = (appState.expenses || []).filter(exp => {
        const expDate = new Date(exp.date.seconds * 1000);
        return expDate.getFullYear() === year && expDate.getMonth() === month;
    });

    // 2. Get all active fixed expenses for the current view month
    const monthlyFixedExpenses = (appState.fixedExpenses || []).filter(fe => {
        const startDate = new Date(fe.startDate);
        const endDate = fe.endDate ? new Date(fe.endDate) : null;
        const viewDate = new Date(year, month, 15); // Use mid-month to be safe
        
        if (startDate > viewDate) return false;
        if (endDate && endDate < viewDate) return false;
        return true;
    });

    // 3. Calculate summary numbers
    const totalVariable = monthlyExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const totalFixed = monthlyFixedExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const totalImpulse = monthlyExpenses.filter(exp => exp.isImpulse).reduce((sum, exp) => sum + exp.amount, 0);
    
    const totalCashFlow = totalVariable + totalFixed;
    const income = appState.economySettings.monthlyIncome || 0;
    const savingsGoal = appState.economySettings.monthlySavingsGoal || 0;

    const expectedSavings = income - totalCashFlow;
    const realSavings = income - totalCashFlow - totalImpulse; // Note: This is a simplified calculation

    // 4. Render the savings dashboard
    document.getElementById('savings-goal-value').textContent = `${savingsGoal.toLocaleString('da-DK')} kr.`;
    document.getElementById('savings-status-value').textContent = `${realSavings.toLocaleString('da-DK')} kr.`;
    document.getElementById('savings-prognosis-value').textContent = `${expectedSavings.toLocaleString('da-DK')} kr.`;

    const progress = savingsGoal > 0 ? (realSavings / savingsGoal) * 100 : 0;
    const progressBar = document.getElementById('savings-progress-bar-inner');
    progressBar.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    progressBar.style.backgroundColor = progress >= 100 ? 'var(--status-green)' : 'var(--accent-color)';

    // 5. Render budget bars (future implementation)
}


// --- NET WORTH VIEW ---

function renderNetWorthView() {
    renderAssets();
    renderLiabilities();
    
    const totalAssets = (appState.assets || []).reduce((sum, asset) => sum + asset.value, 0);
    const totalLiabilities = (appState.liabilities || []).reduce((sum, l) => sum + l.currentBalance, 0);
    const netWorth = totalAssets - totalLiabilities;

    appElements.netWorthTotalAssets.textContent = `${totalAssets.toLocaleString('da-DK')} kr.`;
    appElements.netWorthTotalLiabilities.textContent = `${totalLiabilities.toLocaleString('da-DK')} kr.`;
    appElements.netWorthTotalValue.textContent = `${netWorth.toLocaleString('da-DK')} kr.`;
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
        
        const linkedLiability = (appState.liabilities || []).find(l => l.id === asset.linkedLiabilityId);
        const equity = linkedLiability ? asset.value - linkedLiability.currentBalance : asset.value;
        const ownershipPercentage = asset.value > 0 ? (equity / asset.value) * 100 : 0;

        card.innerHTML = `
            <h5>${asset.name}</h5>
            <p>Værdi: ${asset.value.toLocaleString('da-DK')} kr.</p>
            <p>Friværdi: ${equity.toLocaleString('da-DK')} kr.</p>
            <div class="progress-bar">
                <div class="progress-bar-inner" style="width: ${ownershipPercentage.toFixed(2)}%;"></div>
            </div>
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
    }

    populateReferenceDropdown(document.getElementById('asset-type'), appState.references.assetTypes, 'Vælg type...', asset?.type);
    populateLiabilitiesDropdown(document.getElementById('asset-linked-liability'), 'Tilknyt gæld...', asset?.linkedLiabilityId);
    appElements.assetModal.classList.remove('hidden');
}

async function handleSaveAsset(e) {
    e.preventDefault();
    const assetId = document.getElementById('asset-id').value;
    const assetData = {
        name: document.getElementById('asset-name').value.trim(),
        type: document.getElementById('asset-type').value,
        value: parseFloat(document.getElementById('asset-value').value),
        linkedLiabilityId: document.getElementById('asset-linked-liability').value || null,
        userId: appState.currentUser.uid
    };

    if (!assetData.name || !assetData.type || isNaN(assetData.value)) {
        showNotification({title: "Udfyld påkrævede felter", message: "Navn, type og værdi skal være udfyldt."});
        return;
    }

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
    const assetId = document.getElementById('asset-id').value;
    if (!assetId) return;

    const confirmed = await showNotification({title: "Slet Aktiv", message: "Er du sikker? Handlingen kan ikke fortrydes.", type: 'confirm'});
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, 'assets', assetId));
        appElements.assetModal.classList.add('hidden');
        showNotification({title: "Slettet", message: "Aktivet er blevet slettet."});
    } catch (error) {
        handleError(error, "Aktivet kunne ikke slettes.", "deleteAsset");
    }
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
        document.getElementById('liability-current-balance').value = liability.currentBalance;
    }
    appElements.liabilityModal.classList.remove('hidden');
}

async function handleSaveLiability(e) {
    e.preventDefault();
    const liabilityId = document.getElementById('liability-id').value;
    const originalAmount = parseFloat(document.getElementById('liability-original-amount').value);
    const currentBalance = parseFloat(document.getElementById('liability-current-balance').value);
    
    const liabilityData = {
        name: document.getElementById('liability-name').value.trim(),
        originalAmount: isNaN(originalAmount) ? 0 : originalAmount,
        currentBalance: isNaN(currentBalance) ? originalAmount : currentBalance,
        userId: appState.currentUser.uid
    };

    if (!liabilityData.name) {
        showNotification({title: "Udfyld påkrævede felter", message: "Navn skal være udfyldt."});
        return;
    }

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
    const liabilityId = document.getElementById('liability-id').value;
    if (!liabilityId) return;

    const confirmed = await showNotification({title: "Slet Gæld", message: "Er du sikker? Dette vil også fjerne koblingen fra eventuelle aktiver.", type: 'confirm'});
    if (!confirmed) return;

    try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'liabilities', liabilityId));

        // Unlink from any assets
        const linkedAssets = (appState.assets || []).filter(a => a.linkedLiabilityId === liabilityId);
        linkedAssets.forEach(asset => {
            const assetRef = doc(db, 'assets', asset.id);
            batch.update(assetRef, { linkedLiabilityId: null });
        });

        await batch.commit();
        appElements.liabilityModal.classList.add('hidden');
        showNotification({title: "Slettet", message: "Gældsposten er blevet slettet."});
    } catch (error) {
        handleError(error, "Gældsposten kunne ikke slettes.", "deleteLiability");
    }
}


// VARIABLE EXPENSE MANAGEMENT
function openAddExpenseModal() {
    appElements.addExpenseForm.reset();
    document.getElementById('add-expense-date').value = formatDate(new Date());
    populateMainCategoryDropdown(document.getElementById('add-expense-main-category'), null);
    populateSubCategoryDropdown(document.getElementById('add-expense-sub-category'), null, null);
    appElements.addExpenseModal.classList.remove('hidden');
}

async function handleSaveVariableExpense(e) {
    e.preventDefault();
    const expenseData = {
        amount: parseFloat(document.getElementById('add-expense-amount').value),
        date: new Date(document.getElementById('add-expense-date').value),
        mainCategory: document.getElementById('add-expense-main-category').value,
        subCategory: document.getElementById('add-expense-sub-category').value,
        description: document.getElementById('add-expense-description').value.trim(),
        isImpulse: document.getElementById('add-expense-is-impulse').checked,
        userId: appState.currentUser.uid
    };

    if (isNaN(expenseData.amount) || !expenseData.date || !expenseData.mainCategory || !expenseData.description) {
        showNotification({title: "Udfyld påkrævede felter", message: "Beløb, dato, kategori og beskrivelse er påkrævet."});
        return;
    }

    try {
        await addDoc(collection(db, 'expenses'), expenseData);
        appElements.addExpenseModal.classList.add('hidden');
        showNotification({ title: 'Gemt!', message: 'Din udgift er registreret.' });
    } catch (error) {
        handleError(error, 'Kunne ikke gemme udgift.', 'saveVariableExpense');
    }
}

// --- SETTINGS VIEW ---

function renderSettingsView() {
    // Populate form with current settings
    document.getElementById('monthly-income').value = appState.economySettings.monthlyIncome || '';
    document.getElementById('monthly-savings-goal').value = appState.economySettings.monthlySavingsGoal || '';
    renderFixedExpensesList();
}

function renderFixedExpensesList() {
    const container = appElements.fixedExpensesList;
    container.innerHTML = '';
    const fixedExpenses = appState.fixedExpenses || [];

    if (fixedExpenses.length === 0) {
        container.innerHTML = '<p class="empty-state-small">Ingen faste udgifter tilføjet.</p>';
        return;
    }

    fixedExpenses.sort((a,b) => a.mainCategory.localeCompare(b.mainCategory)).forEach(exp => {
        const item = document.createElement('div');
        item.className = 'fixed-expense-item';
        item.dataset.id = exp.id;
        item.innerHTML = `
            <span>${exp.mainCategory} - ${exp.subCategory}</span>
            <span>${exp.amount.toLocaleString('da-DK')} kr.</span>
        `;
        container.appendChild(item);
    });
}

function openFixedExpenseModal(expenseId = null) {
    appElements.fixedExpenseForm.reset();
    const isEditing = !!expenseId;
    const expense = isEditing ? appState.fixedExpenses.find(e => e.id === expenseId) : null;

    document.getElementById('fixed-expense-id-edit').value = expenseId || '';
    appElements.fixedExpenseModal.querySelector('h3').textContent = isEditing ? 'Rediger Fast Udgift' : 'Ny Fast Udgift';
    appElements.deleteFixedExpenseBtn.classList.toggle('hidden', !isEditing);

    populateMainCategoryDropdown(document.getElementById('fixed-expense-main-category'), expense?.mainCategory);
    populateSubCategoryDropdown(document.getElementById('fixed-expense-sub-category'), expense?.mainCategory, expense?.subCategory);
    populateLiabilitiesDropdown(document.getElementById('fixed-expense-linked-liability'), 'Vælg lån...', expense?.linkedLiabilityId);

    if (isEditing) {
        document.getElementById('fixed-expense-amount').value = expense.amount;
        document.getElementById('fixed-expense-start-date-edit').value = expense.startDate;
        document.getElementById('fixed-expense-end-date-edit').value = expense.endDate || '';
        document.getElementById('fixed-expense-is-repayment').checked = expense.isRepayment || false;
    } else {
        document.getElementById('fixed-expense-start-date-edit').value = formatDate(new Date());
    }
    
    appElements.repaymentLinkGroup.classList.toggle('hidden', !expense?.isRepayment);
    appElements.fixedExpenseModal.classList.remove('hidden');
}

async function handleSaveFixedExpense(e) {
    e.preventDefault();
    const expenseId = document.getElementById('fixed-expense-id-edit').value;
    const expenseData = {
        amount: parseFloat(document.getElementById('fixed-expense-amount').value),
        mainCategory: document.getElementById('fixed-expense-main-category').value,
        subCategory: document.getElementById('fixed-expense-sub-category').value,
        startDate: document.getElementById('fixed-expense-start-date-edit').value,
        endDate: document.getElementById('fixed-expense-end-date-edit').value || null,
        isRepayment: document.getElementById('fixed-expense-is-repayment').checked,
        linkedLiabilityId: document.getElementById('fixed-expense-linked-liability').value || null,
        userId: appState.currentUser.uid,
    };

    try {
        if (expenseId) {
            await updateDoc(doc(db, 'fixed_expenses', expenseId), expenseData);
        } else {
            await addDoc(collection(db, 'fixed_expenses'), expenseData);
        }
        appElements.fixedExpenseModal.classList.add('hidden');
        showNotification({title: "Gemt!", message: "Fast udgift er gemt."});
    } catch (error) {
        handleError(error, "Kunne ikke gemme fast udgift.", "saveFixedExpense");
    }
}

async function handleDeleteFixedExpense() {
    // Similar to other delete functions
}

async function handleSaveEconomySettings(e) {
    e.preventDefault();
    const settingsData = {
        monthlyIncome: parseFloat(document.getElementById('monthly-income').value) || 0,
        monthlySavingsGoal: parseFloat(document.getElementById('monthly-savings-goal').value) || 0,
    };

    try {
        const settingsRef = doc(db, 'users', appState.currentUser.uid, 'settings', 'economy');
        await setDoc(settingsRef, settingsData, { merge: true });
        showNotification({title: "Gemt!", message: "Dine økonomi-indstillinger er blevet gemt."});
    } catch (error) {
        handleError(error, "Indstillingerne kunne ikke gemmes.", "saveEconomySettings");
    }
}


// --- HELPER FUNCTIONS ---

function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    selectElement.value = currentValue || "";
}

function populateLiabilitiesDropdown(selectElement, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (appState.liabilities || []).forEach(l => selectElement.add(new Option(l.name, l.id)));
    selectElement.value = currentValue || "";
}

function populateMainCategoryDropdown(selectElement, currentValue) {
    const mainCategories = (appState.references.budgetCategories || [])
        .map(cat => (typeof cat === 'string' ? cat : cat.name));
    populateReferenceDropdown(selectElement, mainCategories, 'Vælg hovedkategori...', currentValue);
}

function populateSubCategoryDropdown(selectElement, mainCategoryName, currentValue) {
    const allCategories = (appState.references.budgetCategories || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
    const mainCat = allCategories.find(cat => cat.name === mainCategoryName);
    const subCategories = mainCat ? mainCat.subcategories : [];
    populateReferenceDropdown(selectElement, subCategories, 'Vælg underkategori...', currentValue);
    selectElement.disabled = !mainCategoryName;
}
