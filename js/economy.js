// js/economy.js

import { db } from './firebase.js';
import { doc, setDoc, updateDoc, addDoc, deleteDoc, collection, writeBatch, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;
let economyState = {
    currentView: 'monthly-budget',
    viewDate: new Date(), 
};

export function initEconomy(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        economyTabs: document.querySelector('.economy-tabs'),
        economyViews: document.querySelectorAll('.economy-view'),
        
        addVariableExpenseBtn: document.getElementById('add-variable-expense-btn'),

        addExpenseModal: document.getElementById('add-expense-modal'),
        addExpenseForm: document.getElementById('add-expense-form'),
        deleteExpenseBtn: document.getElementById('delete-expense-btn'),

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
        liabilitySettingsList: document.getElementById('liability-settings-list'),

        netWorthTotalAssets: document.getElementById('net-worth-total-assets'),
        netWorthTotalLiabilities: document.getElementById('net-worth-total-liabilities'),
        netWorthTotalValue: document.getElementById('net-worth-total-value'),

        fixedExpenseModal: document.getElementById('fixed-expense-modal'),
        fixedExpenseForm: document.getElementById('fixed-expense-form'),
        deleteFixedExpenseBtn: document.getElementById('delete-fixed-expense-btn'),
        repaymentLinkGroup: document.getElementById('repayment-liability-link-group'),
        economySettingsForm: document.getElementById('economy-settings-form'),
        fixedExpensesList: document.getElementById('fixed-expenses-list'),
        addFixedExpenseBtn: document.getElementById('add-fixed-expense-btn'),
        
        monthlyBudgetBarsContainer: document.getElementById('monthly-budget-bars'),
        pinnedSavingsGoalsContainer: document.getElementById('pinned-savings-goals-container'),
        budgetCategorySettingsList: document.getElementById('budget-category-settings-list'),
        transactionsListContainer: document.getElementById('transactions-list-container'),
    };

    appElements.economyTabs.addEventListener('click', (e) => {
        if (e.target.matches('.economy-tab-btn')) {
            switchEconomyView(e.target.dataset.view);
        }
    });

    if(appElements.addVariableExpenseBtn) appElements.addVariableExpenseBtn.addEventListener('click', () => openAddExpenseModal());
    if(appElements.addExpenseForm) appElements.addExpenseForm.addEventListener('submit', handleSaveVariableExpense);
    if(appElements.deleteExpenseBtn) appElements.deleteExpenseBtn.addEventListener('click', handleDeleteVariableExpense);
    
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
    
    if(appElements.assetsList) appElements.assetsList.addEventListener('click', e => {
        if (e.target.closest('.asset-card')) openAssetModal(e.target.closest('.asset-card').dataset.id);
    });
    if(appElements.liabilitiesList) appElements.liabilitiesList.addEventListener('click', e => {
        if (e.target.closest('.liability-card')) openLiabilityModal(e.target.closest('.liability-card').dataset.id);
    });
    if(appElements.fixedExpensesList) appElements.fixedExpensesList.addEventListener('click', e => {
        if (e.target.closest('.fixed-expense-item')) openFixedExpenseModal(e.target.closest('.fixed-expense-item').dataset.id);
    });
    if(appElements.liabilitySettingsList) appElements.liabilitySettingsList.addEventListener('click', e => {
        if (e.target.closest('.liability-card')) openLiabilityModal(e.target.closest('.liability-card').dataset.id);
    });
    if(appElements.transactionsListContainer) appElements.transactionsListContainer.addEventListener('click', e => {
        if (e.target.closest('.transaction-item')) openAddExpenseModal(e.target.closest('.transaction-item').dataset.id);
    });

    const isRepaymentCheckbox = document.getElementById('fixed-expense-is-repayment');
    if (isRepaymentCheckbox) {
        isRepaymentCheckbox.addEventListener('change', (e) => {
            appElements.repaymentLinkGroup.classList.toggle('hidden', !e.target.checked);
        });
    }

    const mainCategorySelect = document.getElementById('add-expense-main-category');
    if (mainCategorySelect) {
        mainCategorySelect.addEventListener('change', () => {
             populateSubCategoryDropdown(document.getElementById('add-expense-sub-category'), mainCategorySelect.value);
        });
    }
    const fixedMainCategorySelect = document.getElementById('fixed-expense-main-category');
    if (fixedMainCategorySelect) {
        fixedMainCategorySelect.addEventListener('change', () => {
             populateSubCategoryDropdown(document.getElementById('fixed-expense-sub-category'), fixedMainCategorySelect.value);
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
    renderEconomyPage();
}

export function renderEconomyPage() {
    switch (economyState.currentView) {
        case 'monthly-budget':
            renderMonthlyBudgetView();
            break;
        case 'transactions':
            renderTransactionsView();
            break;
        case 'net-worth':
            renderNetWorthView();
            break;
        case 'settings':
            renderSettingsView();
            break;
    }
}

// --- RENDER FUNCTIONS FOR EACH VIEW ---

function renderMonthlyBudgetView() {
    const year = economyState.viewDate.getFullYear();
    const month = economyState.viewDate.getMonth();

    const monthlyExpenses = (appState.expenses || []).filter(exp => {
        const expDate = new Date(exp.date.seconds * 1000);
        return expDate.getFullYear() === year && expDate.getMonth() === month;
    });

    const monthlyFixedExpenses = (appState.fixedExpenses || []).filter(fe => {
        const startDate = new Date(fe.startDate);
        const endDate = fe.endDate ? new Date(fe.endDate) : null;
        const viewDate = new Date(year, month, 15);
        if (startDate > viewDate) return false;
        if (endDate && endDate < viewDate) return false;
        return true;
    });

    renderBudgetBars(monthlyExpenses, monthlyFixedExpenses);
    renderSavingsDashboard(monthlyFixedExpenses);
}

function renderTransactionsView() {
    const container = appElements.transactionsListContainer;
    container.innerHTML = '';
    const expenses = [...(appState.expenses || [])].sort((a, b) => b.date.seconds - a.date.seconds);

    if (expenses.length === 0) {
        container.innerHTML = '<p class="empty-state">Ingen transaktioner registreret endnu.</p>';
        return;
    }

    expenses.forEach(exp => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        item.dataset.id = exp.id;
        const date = new Date(exp.date.seconds * 1000);
        item.innerHTML = `
            <div class="transaction-date">${date.toLocaleDateString('da-DK')}</div>
            <div class="transaction-description">${exp.description}</div>
            <div class="transaction-category">${exp.mainCategory} ${exp.subCategory ? `> ${exp.subCategory}` : ''}</div>
            <div class="transaction-amount">${exp.amount.toLocaleString('da-DK', {style: 'currency', currency: 'DKK'})}</div>
        `;
        container.appendChild(item);
    });
}

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

function renderSettingsView() {
    document.getElementById('monthly-income').value = appState.economySettings.monthlyIncome || '';
    renderBudgetCategorySettings();
    renderLiabilitySettings();
    renderFixedExpensesList();
}

// --- COMPONENT RENDER FUNCTIONS ---

function renderBudgetBars(monthlyExpenses, monthlyFixedExpenses) {
    const container = appElements.monthlyBudgetBarsContainer.querySelector('.dashboard-widget-content');
    container.innerHTML = '';

    const budgetCategories = (appState.references.budgetCategories || [])
        .filter(cat => cat.budget && cat.budget > 0);

    if (budgetCategories.length === 0) {
        container.innerHTML = `<p class="empty-state-small">Definér budgetter under "Indstillinger".</p>`;
        return;
    }

    budgetCategories.forEach(cat => {
        const fixedSpending = monthlyFixedExpenses.filter(exp => exp.mainCategory === cat.name).reduce((sum, exp) => sum + exp.amount, 0);
        const variableSpending = monthlyExpenses.filter(exp => exp.mainCategory === cat.name).reduce((sum, exp) => sum + exp.amount, 0);
        const totalSpent = fixedSpending + variableSpending;
        const budgetAmount = cat.budget;
        const percentage = (totalSpent / budgetAmount) * 100;
        const remaining = budgetAmount - totalSpent;

        let barColorClass = 'status-green';
        if (percentage > 80) barColorClass = 'status-yellow';
        if (percentage >= 100) barColorClass = 'status-red';

        const barItem = document.createElement('div');
        barItem.className = 'budget-category-item';
        barItem.innerHTML = `
            <div class="budget-bar-header">
                <span class="budget-bar-label">${cat.name}</span>
                <span class="budget-bar-amount">${totalSpent.toLocaleString('da-DK')} / ${budgetAmount.toLocaleString('da-DK')} kr.</span>
            </div>
            <div class="budget-bar-container">
                <div class="budget-bar-inner ${barColorClass}" style="width: ${Math.min(100, percentage)}%;"></div>
            </div>
            <div class="budget-bar-footer">
                <span>${remaining >= 0 ? `${remaining.toLocaleString('da-DK')} kr. tilbage` : `${Math.abs(remaining).toLocaleString('da-DK')} kr. over budget`}</span>
            </div>
        `;
        container.appendChild(barItem);
    });
}

function renderSavingsDashboard(monthlyFixedExpenses) {
    const container = appElements.pinnedSavingsGoalsContainer;
    container.innerHTML = '';

    const income = appState.economySettings.monthlyIncome || 0;
    const totalFixed = monthlyFixedExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const savingsPotential = income - totalFixed;

    container.innerHTML = `<div class="savings-potential"><span>Opsparingspotentiale:</span><strong>${savingsPotential.toLocaleString('da-DK')} kr./md.</strong></div>`;

    const pinnedGoals = appState.economySettings.pinnedGoals || [];

    if (pinnedGoals.length === 0) {
        container.innerHTML += `<p class="empty-state-small">Pin et projekt eller ønske for at følge din opsparing.</p>`;
        return;
    }

    pinnedGoals.forEach(goal => {
        let goalData;
        if (goal.type === 'project') {
            goalData = appState.projects.find(p => p.id === goal.id);
            if(goalData) goalData.targetAmount = (goalData.materials || []).reduce((sum, mat) => sum + (mat.price || 0), 0);
        } else if (goal.type === 'wishlist') {
            const allWishes = Object.values(appState.shoppingLists.wishlist || {});
            goalData = allWishes.find(w => w.name.toLowerCase() === goal.id.toLowerCase());
            if(goalData) goalData.targetAmount = goalData.price || 0;
        }

        if (!goalData || !goalData.targetAmount) return;

        const monthsToGoal = savingsPotential > 0 ? Math.ceil(goalData.targetAmount / savingsPotential) : Infinity;
        
        const goalItem = document.createElement('div');
        goalItem.className = 'savings-goal-item';
        goalItem.dataset.goalId = goal.id;
        goalItem.innerHTML = `
            <div class="savings-goal-header">
                <span class="savings-goal-title">${goalData.title || goalData.name}</span>
                <button class="btn-icon unpin-goal-btn" title="Fjern mål"><i class="fas fa-thumbtack"></i></button>
            </div>
            <div class="savings-goal-progress">
                <div class="progress-bar"><div class="progress-bar-inner" style="width: 0%;"></div></div>
                <span class="savings-goal-amount">0 / ${goalData.targetAmount.toLocaleString('da-DK')} kr.</span>
            </div>
            <div class="savings-goal-forecast">${monthsToGoal !== Infinity ? `Ca. ${monthsToGoal} måneder til mål` : 'Opsparing påkrævet'}</div>`;
        container.appendChild(goalItem);
    });
}

function renderBudgetCategorySettings() {
    const container = appElements.budgetCategorySettingsList;
    container.innerHTML = '';
    const categories = appState.references.budgetCategories || [];
    if (categories.length === 0) {
        container.innerHTML = `<p class="empty-state-small">Opret budgetkategorier under "Referencer".</p>`;
        return;
    }
    categories.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'reference-item'; // Re-use style
        item.innerHTML = `
            <span class="reference-name">${cat.name}</span>
            <div class="price-input-wrapper">
                <input type="number" class="category-budget-input" placeholder="Budget" value="${cat.budget || ''}" data-category-name="${cat.name}">
            </div>
        `;
        container.appendChild(item);
    });
}

function renderLiabilitySettings() {
    const container = appElements.liabilitySettingsList;
    container.innerHTML = '';
    if (!appState.liabilities || appState.liabilities.length === 0) {
        container.innerHTML = '<p class="empty-state-small">Ingen gældsposter tilføjet.</p>';
        return;
    }
    appState.liabilities.forEach(liability => {
        const card = document.createElement('div');
        card.className = 'liability-card';
        card.dataset.id = liability.id;
        card.innerHTML = `<h5>${liability.name}</h5><p>Nuværende gæld: ${liability.currentBalance.toLocaleString('da-DK')} kr.</p>`;
        container.appendChild(card);
    });
}

// --- DATA HANDLING FUNCTIONS ---

// ... (Asset, Liability, Fixed Expense, and Settings save/delete functions remain the same)

async function handleSaveVariableExpense(e) {
    e.preventDefault();
    const expenseId = document.getElementById('add-expense-id').value;
    const expenseData = {
        amount: parseFloat(document.getElementById('add-expense-amount').value),
        date: Timestamp.fromDate(new Date(document.getElementById('add-expense-date').value)),
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
        if (expenseId) {
            await updateDoc(doc(db, 'expenses', expenseId), expenseData);
        } else {
            await addDoc(collection(db, 'expenses'), expenseData);
        }
        appElements.addExpenseModal.classList.add('hidden');
        showNotification({ title: 'Gemt!', message: 'Din udgift er registreret.' });
    } catch (error) {
        handleError(error, 'Kunne ikke gemme udgift.', 'saveVariableExpense');
    }
}

async function handleDeleteVariableExpense() {
    const expenseId = document.getElementById('add-expense-id').value;
    if (!expenseId) return;

    const confirmed = await showNotification({title: "Slet Udgift", message: "Er du sikker?", type: 'confirm'});
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, 'expenses', expenseId));
        appElements.addExpenseModal.classList.add('hidden');
        showNotification({title: "Slettet", message: "Udgiften er blevet slettet."});
    } catch (error) {
        handleError(error, "Udgiften kunne ikke slettes.", "handleDeleteVariableExpense");
    }
}

// --- MODAL & HELPER FUNCTIONS ---

function openAddExpenseModal(expenseId = null) {
    const form = appElements.addExpenseForm;
    form.reset();
    const isEditing = !!expenseId;
    const expense = isEditing ? appState.expenses.find(e => e.id === expenseId) : null;

    document.getElementById('add-expense-id').value = expenseId || '';
    appElements.addExpenseModal.querySelector('h3').textContent = isEditing ? 'Rediger Udgift' : 'Registrer Køb';
    appElements.deleteExpenseBtn.classList.toggle('hidden', !isEditing);
    
    if (isEditing) {
        document.getElementById('add-expense-amount').value = expense.amount;
        document.getElementById('add-expense-date').value = formatDate(new Date(expense.date.seconds * 1000));
        document.getElementById('add-expense-description').value = expense.description;
        document.getElementById('add-expense-is-impulse').checked = expense.isImpulse;
    } else {
        document.getElementById('add-expense-date').value = formatDate(new Date());
    }
    
    populateMainCategoryDropdown(document.getElementById('add-expense-main-category'), expense?.mainCategory);
    populateSubCategoryDropdown(document.getElementById('add-expense-sub-category'), expense?.mainCategory, expense?.subCategory);
    appElements.addExpenseModal.classList.remove('hidden');
}

// ... (Other modal and helper functions remain the same)
// NOTE: The content of functions like renderAssets, openAssetModal, handleSaveAsset, etc., is omitted for brevity but remains unchanged from the previous version.
// The full, unchanged code for those functions should be considered part of this file.
// The following are stubs for the unchanged functions to indicate their presence.

function renderAssets() { /* ... unchanged ... */ }
function openAssetModal(assetId = null) { /* ... unchanged ... */ }
async function handleSaveAsset(e) { /* ... unchanged ... */ }
async function handleDeleteAsset() { /* ... unchanged ... */ }
function renderLiabilities() { /* ... unchanged ... */ }
function openLiabilityModal(liabilityId = null) { /* ... unchanged ... */ }
async function handleSaveLiability(e) { /* ... unchanged ... */ }
async function handleDeleteLiability() { /* ... unchanged ... */ }
function renderFixedExpensesList() { /* ... unchanged ... */ }
function openFixedExpenseModal(expenseId = null) { /* ... unchanged ... */ }
async function handleSaveFixedExpense(e) { /* ... unchanged ... */ }
async function handleDeleteFixedExpense() { /* ... unchanged ... */ }
async function handleSaveEconomySettings(e) { /* ... unchanged ... */ }
async function togglePinnedSavingsGoal(goal) { /* ... unchanged ... */ }
async function unpinSavingsGoal(goalId) { /* ... unchanged ... */ }
function populateReferenceDropdown(selectElement, options, placeholder, currentValue) { /* ... unchanged ... */ }
function populateLiabilitiesDropdown(selectElement, placeholder, currentValue) { /* ... unchanged ... */ }
function populateMainCategoryDropdown(selectElement, currentValue) { /* ... unchanged ... */ }
function populateSubCategoryDropdown(selectElement, mainCategoryName, currentValue) { /* ... unchanged ... */ }
