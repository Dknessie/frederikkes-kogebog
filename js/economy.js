// js/economy.js
// Dette modul håndterer logikken for økonomi-siden.

import { db } from './firebase.js';
import { doc, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, getDocs, writeBatch, deleteField, arrayUnion, arrayRemove, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { toDKK, parseDKK, formatDate, calculateMonthlyPayment, calculateTermMonths } from './utils.js';
import { showNotification, handleError } from './ui.js';


let appState; // Reference til den centrale state
let appElements; // Reference til centrale DOM-elementer

// Lokal state for økonomisiden
const economyState = {
    currentView: 'budget', // 'budget', 'fixed', 'transactions', 'assets'
    currentDate: new Date(), // Til at navigere i budget-måneder
    projectionDate: new Date(),
};

// =================================================================
// INITIALISERING & EVENT LISTENERS
// =================================================================

export function initEconomy(state, elements) {
    appState = state;
    appElements = elements;

    const pageContainer = document.getElementById('oekonomi');
    if (pageContainer) {
        pageContainer.addEventListener('click', handlePageClick);
    }

    // Modals
    const assetForm = document.getElementById('asset-form');
    if (assetForm) assetForm.addEventListener('submit', handleSaveAsset);
    const deleteAssetBtn = document.getElementById('delete-asset-btn');
    if (deleteAssetBtn) deleteAssetBtn.addEventListener('click', handleDeleteAsset);

    const liabilityForm = document.getElementById('liability-form');
    if (liabilityForm) {
        liabilityForm.addEventListener('submit', handleSaveLiability);
        liabilityForm.addEventListener('input', handleLoanCalculatorChange);
    }
    const deleteLiabilityBtn = document.getElementById('delete-liability-btn');
    if (deleteLiabilityBtn) deleteLiabilityBtn.addEventListener('click', handleDeleteLiability);
    
    const fixedExpenseForm = document.getElementById('fixed-expense-form');
    if (fixedExpenseForm) fixedExpenseForm.addEventListener('submit', handleSaveFixedExpense);
    const deleteFixedExpenseBtn = document.getElementById('delete-fixed-expense-btn');
    if(deleteFixedExpenseBtn) deleteFixedExpenseBtn.addEventListener('click', handleDeleteFixedExpense);

    const transactionForm = document.getElementById('transaction-edit-form');
    if (transactionForm) transactionForm.addEventListener('submit', handleSaveTransaction);
    const deleteTransactionBtn = document.getElementById('delete-transaction-btn');
    if (deleteTransactionBtn) deleteTransactionBtn.addEventListener('click', handleDeleteTransaction);
}

// =================================================================
// HOVED-RENDERING & NAVIGATION
// =================================================================

export function renderEconomy() {
    renderSidebar();
    renderView();
}

function handlePageClick(e) {
    const navLink = e.target.closest('.economy-nav-link');
    if (navLink) {
        e.preventDefault();
        economyState.currentView = navLink.dataset.view;
        renderEconomy();
        return;
    }

    const prevMonthBtn = e.target.closest('#prev-month-btn');
    if (prevMonthBtn) {
        economyState.currentDate.setMonth(economyState.currentDate.getMonth() - 1);
        renderView();
        return;
    }

    const nextMonthBtn = e.target.closest('#next-month-btn');
    if (nextMonthBtn) {
        economyState.currentDate.setMonth(economyState.currentDate.getMonth() + 1);
        renderView();
        return;
    }

    const assetsPrevMonthBtn = e.target.closest('#assets-prev-month-btn');
    if (assetsPrevMonthBtn) {
        economyState.projectionDate.setMonth(economyState.projectionDate.getMonth() - 1);
        renderView();
        return;
    }
    const assetsNextMonthBtn = e.target.closest('#assets-next-month-btn');
    if (assetsNextMonthBtn) {
        economyState.projectionDate.setMonth(economyState.projectionDate.getMonth() + 1);
        renderView();
        return;
    }
    
    // Håndter klik baseret på aktiv visning
    switch(economyState.currentView) {
        case 'assets':
            if (e.target.closest('#add-asset-btn')) openAssetModal();
            else if (e.target.closest('#add-liability-btn')) openLiabilityModal();
            else if (e.target.closest('.asset-card')) openAssetModal(e.target.closest('.asset-card').dataset.id);
            else if (e.target.closest('.liability-card')) openLiabilityModal(e.target.closest('.liability-card').dataset.id);
            break;
        case 'fixed':
            if (e.target.closest('#add-fixed-expense-btn')) openFixedExpenseModal();
            else if (e.target.closest('.fixed-expense-row')) openFixedExpenseModal(e.target.closest('.fixed-expense-row').dataset.id);
            break;
        case 'transactions':
            if (e.target.closest('#add-transaction-btn')) openTransactionModal();
            else if (e.target.closest('.transaction-row')) openTransactionModal(e.target.closest('.transaction-row').dataset.id);
            break;
    }
}

function renderSidebar() {
    const navContainer = document.getElementById('economy-nav-list');
    if (!navContainer) return;

    const views = [
        { key: 'budget', name: 'Nulsumsbudget', icon: 'fa-balance-scale' },
        { key: 'fixed', name: 'Faste Poster', icon: 'fa-sync-alt' },
        { key: 'transactions', name: 'Transaktioner', icon: 'fa-receipt' },
        { key: 'assets', name: 'Aktiver / Gæld', icon: 'fa-chart-line' }
    ];

    navContainer.innerHTML = views.map(view => `
        <li>
            <a href="#" class="references-nav-link economy-nav-link ${economyState.currentView === view.key ? 'active' : ''}" data-view="${view.key}">
                <i class="fas ${view.icon}"></i>
                <span>${view.name}</span>
            </a>
        </li>
    `).join('');
}
function renderView() {
    const contentArea = document.getElementById('economy-content-area');
    if (!contentArea) return;

    switch (economyState.currentView) {
        case 'budget':
            renderBudgetView(contentArea);
            break;
        case 'fixed':
            renderFixedExpensesView(contentArea);
            break;
        case 'transactions':
            renderTransactionsView(contentArea);
            break;
        case 'assets':
            renderAssetsView(contentArea);
            break;
        default:
            contentArea.innerHTML = `<p>Vælg en visning fra menuen.</p>`;
    }
}

// =================================================================
// NULSUMSBUDGET
// =================================================================
async function renderBudgetView(container) {
    const monthKey = `${economyState.currentDate.getFullYear()}-${(economyState.currentDate.getMonth() + 1).toString().padStart(2, '0')}`;
    
    // Auto-populate fixed expenses for the current month if not already done
    await autoPopulateFixedExpensesForMonth(monthKey);
    
    const transactionsForMonth = (appState.transactions || []).filter(t => t.date.startsWith(monthKey));
    const fixedForMonth = (appState.fixedExpenses || []).filter(item => {
        const startDate = new Date(item.startDate);
        const endDate = item.endDate ? new Date(item.endDate) : null;
        const currentDate = new Date(economyState.currentDate);
        currentDate.setDate(1);

        return startDate <= currentDate && (!endDate || endDate >= currentDate);
    });

    const totalIncome = fixedForMonth.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalFixedExpenses = fixedForMonth.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const availableForSpending = totalIncome - totalFixedExpenses;

    const spendingByCategory = transactionsForMonth.reduce((acc, t) => {
        if(t.type === 'expense') {
            const cat = t.mainCategory || 'Diverse';
            if (!acc[cat]) acc[cat] = 0;
            acc[cat] += t.amount;
        }
        return acc;
    }, {});
    
    const totalVariableSpending = Object.values(spendingByCategory).reduce((sum, amount) => sum + amount, 0);
    const remaining = availableForSpending - totalVariableSpending;

    const monthDisplay = economyState.currentDate.toLocaleString('da-DK', { month: 'long', year: 'numeric' });
    const monthNavigatorHTML = `
        <div class="economy-month-navigator">
            <button id="prev-month-btn" class="btn-icon"><i class="fas fa-chevron-left"></i></button>
            <h4 id="current-month-display">${monthDisplay}</h4>
            <button id="next-month-btn" class="btn-icon"><i class="fas fa-chevron-right"></i></button>
        </div>
    `;

    container.innerHTML = `
        <div class="nulsums-header">
            <h3>Budget for ${monthDisplay}</h3>
            ${monthNavigatorHTML}
        </div>
        <div class="nulsums-grid">
            <div class="nulsums-card">
                <h4>Indkomst</h4>
                <p class="amount positive-text">${toDKK(totalIncome)} kr.</p>
                <ul>${fixedForMonth.filter(t => t.type === 'income').map(t => `<li><span>${t.description}</span><span>${toDKK(t.amount)} kr.</span></li>`).join('')}</ul>
            </div>
            <div class="nulsums-card">
                <h4>Faste Udgifter</h4>
                <p class="amount negative-text">${toDKK(totalFixedExpenses)} kr.</p>
                 <ul>${fixedForMonth.filter(t => t.type === 'expense').map(t => `<li><span>${t.description}</span><span>${toDKK(t.amount)} kr.</span></li>`).join('')}</ul>
            </div>
            <div class="nulsums-card highlight">
                <h4>Til Rådighed for Forbrug</h4>
                <p class="amount">${toDKK(availableForSpending)} kr.</p>
            </div>
            <div class="nulsums-card">
                <h4>Variabelt Forbrug</h4>
                <p class="amount negative-text">${toDKK(totalVariableSpending)} kr.</p>
                 <ul>${Object.entries(spendingByCategory).map(([cat, amount]) => `<li><span>${cat}</span><span>${toDKK(amount)} kr.</span></li>`).join('') || '<li>Ingen variable udgifter endnu.</li>'}</ul>
            </div>
             <div class="nulsums-card highlight">
                <h4>Resultat</h4>
                <p class="amount ${remaining >= 0 ? 'positive-text' : 'negative-text'}">${toDKK(remaining)} kr.</p>
                 <p class="subtitle">${remaining >= 0 ? 'Over / Til Opsparing' : 'Overforbrug'}</p>
            </div>
        </div>
    `;
}

async function autoPopulateFixedExpensesForMonth(monthKey) {
    if (!appState.currentUser) return;
    
    const settingsRef = doc(db, 'users', appState.currentUser.uid, 'settings', 'economy');
    const settingsDoc = await getDocs(query(collection(db, 'users', appState.currentUser.uid, 'settings')));
    
    let lastPopulated = '';
    if(!settingsDoc.empty) {
        const economySettings = settingsDoc.docs.find(d => d.id === 'economy');
        if(economySettings) {
             lastPopulated = economySettings.data().lastPopulatedMonth_fixed || '';
        }
    }
    
    if (lastPopulated === monthKey) return;

    const fixedForMonth = (appState.fixedExpenses || []).filter(item => {
        const startDate = new Date(item.startDate);
        const endDate = item.endDate ? new Date(item.endDate) : null;
        const [year, month] = monthKey.split('-').map(Number);
        const currentMonthStart = new Date(year, month - 1, 1);
        
        return startDate <= currentMonthStart && (!endDate || endDate >= currentMonthStart);
    });

    if (fixedForMonth.length > 0) {
        const batch = writeBatch(db);
        const transactionsColRef = collection(db, 'transactions');

        for (const item of fixedForMonth) {
            const transactionDate = `${monthKey}-${item.startDate.split('-')[2]}`; // Use the day from the fixed expense start date
            
            const newTransaction = {
                ...item,
                date: transactionDate,
                isFixed: true
            };
            delete newTransaction.id;
            delete newTransaction.startDate;
            delete newTransaction.endDate;

            batch.set(doc(transactionsColRef), newTransaction);
        }

        try {
            await batch.commit();
            await setDoc(settingsRef, { lastPopulatedMonth_fixed: monthKey }, { merge: true });
        } catch(error) {
            handleError(error, "Kunne ikke auto-udfylde faste udgifter.", "autoPopulateFixed");
        }
    }
}


// =================================================================
// FASTE POSTER
// =================================================================
function renderFixedExpensesView(container) {
    const items = appState.fixedExpenses || [];
    const itemsHTML = items
        .sort((a,b) => a.description.localeCompare(b.description))
        .map(item => `
        <tr class="fixed-expense-row" data-id="${item.id}">
            <td>${item.description}</td>
            <td class="currency ${item.type === 'income' ? 'positive-text' : 'negative-text'}">${toDKK(item.amount)} kr.</td>
            <td>${item.mainCategory}</td>
            <td>${new Date(item.startDate).toLocaleDateString('da-DK')}</td>
            <td>${item.endDate ? new Date(item.endDate).toLocaleDateString('da-DK') : 'Løbende'}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <div class="tab-header">
            <h3>Faste Poster</h3>
            <button id="add-fixed-expense-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Ny Fast Post</button>
        </div>
        <div class="table-wrapper">
            <table class="spreadsheet-table">
                <thead>
                    <tr><th>Beskrivelse</th><th>Beløb</th><th>Kategori</th><th>Startdato</th><th>Slutdato</th></tr>
                </thead>
                <tbody>${itemsHTML}</tbody>
            </table>
        </div>
    `;
}

function openFixedExpenseModal(id = null) {
    const modal = document.getElementById('fixed-expense-modal');
    const form = document.getElementById('fixed-expense-form');
    form.reset();

    const isEditing = !!id;
    const item = isEditing ? appState.fixedExpenses.find(i => i.id === id) : null;
    
    modal.querySelector('h3').textContent = isEditing ? 'Rediger Fast Post' : 'Ny Fast Post';
    document.getElementById('fixed-expense-id-edit').value = id || '';
    document.getElementById('delete-fixed-expense-btn').classList.toggle('hidden', !isEditing);
    
    if(isEditing && item) {
        document.getElementById('fixed-expense-description').value = item.description;
        document.getElementById('fixed-expense-amount').value = item.amount;
        document.getElementById('fixed-expense-type').value = item.type;
        document.getElementById('fixed-expense-start-date-edit').value = item.startDate;
        document.getElementById('fixed-expense-end-date-edit').value = item.endDate || '';
    } else {
        document.getElementById('fixed-expense-start-date-edit').value = formatDate(new Date());
    }
    
    populateReferenceDropdown(document.getElementById('fixed-expense-account'), appState.references.accounts, 'Vælg konto...', item?.account);
    populateReferenceDropdown(document.getElementById('fixed-expense-person'), appState.references.householdMembers, 'Vælg person...', item?.person);
    
    const mainCatSelect = document.getElementById('fixed-expense-main-category');
    populateMainCategoryDropdown(mainCatSelect, item?.mainCategory);
    mainCatSelect.onchange = () => populateSubCategoryDropdown(document.getElementById('fixed-expense-sub-category'), mainCatSelect.value);
    populateSubCategoryDropdown(document.getElementById('fixed-expense-sub-category'), item?.mainCategory, item?.subCategory);
    
    modal.classList.remove('hidden');
}

async function handleSaveFixedExpense(e) {
    e.preventDefault();
    const id = document.getElementById('fixed-expense-id-edit').value;

    const data = {
        description: document.getElementById('fixed-expense-description').value,
        amount: parseFloat(document.getElementById('fixed-expense-amount').value),
        type: document.getElementById('fixed-expense-type').value,
        account: document.getElementById('fixed-expense-account').value,
        person: document.getElementById('fixed-expense-person').value,
        mainCategory: document.getElementById('fixed-expense-main-category').value,
        subCategory: document.getElementById('fixed-expense-sub-category').value,
        startDate: document.getElementById('fixed-expense-start-date-edit').value,
        endDate: document.getElementById('fixed-expense-end-date-edit').value || null,
        userId: appState.currentUser.uid
    };

    try {
        if(id) {
            await updateDoc(doc(db, 'fixed_expenses', id), data);
        } else {
            await addDoc(collection(db, 'fixed_expenses'), data);
        }
        document.getElementById('fixed-expense-modal').classList.add('hidden');
    } catch(error) {
        handleError(error, "Kunne ikke gemme fast post.", "saveFixedExpense");
    }
}

async function handleDeleteFixedExpense() {
    const id = document.getElementById('fixed-expense-id-edit').value;
    if(!id) return;
    const confirmed = await showNotification({type: 'confirm', title: 'Slet Fast Post', message: 'Er du sikker?'});
    if(confirmed) {
        try {
            await deleteDoc(doc(db, 'fixed_expenses', id));
            document.getElementById('fixed-expense-modal').classList.add('hidden');
        } catch(error) {
            handleError(error, "Kunne ikke slette fast post.", "deleteFixedExpense");
        }
    }
}

// =================================================================
// TRANSAKTIONER
// =================================================================
function renderTransactionsView(container) {
     const items = appState.transactions || [];
    const itemsHTML = items
        .sort((a,b) => new Date(b.date) - new Date(a.date)) // Sort by date descending
        .map(item => `
        <tr class="transaction-row" data-id="${item.id}">
            <td>${new Date(item.date).toLocaleDateString('da-DK')}</td>
            <td>${item.description}</td>
            <td>${item.mainCategory} / ${item.subCategory}</td>
            <td class="currency ${item.type === 'income' ? 'positive-text' : 'negative-text'}">${toDKK(item.amount)} kr.</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <div class="tab-header">
            <h3>Transaktioner</h3>
            <button id="add-transaction-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Ny Transaktion</button>
        </div>
        <div class="table-wrapper">
            <table class="spreadsheet-table">
                <thead>
                    <tr><th>Dato</th><th>Beskrivelse</th><th>Kategori</th><th>Beløb</th></tr>
                </thead>
                <tbody>${itemsHTML}</tbody>
            </table>
        </div>
    `;
}

function openTransactionModal(id = null) {
    const modal = document.getElementById('transaction-edit-modal');
    const form = document.getElementById('transaction-edit-form');
    form.reset();

    const isEditing = !!id;
    const item = isEditing ? appState.transactions.find(i => i.id === id) : null;
    
    modal.querySelector('h3').textContent = isEditing ? 'Rediger Transaktion' : 'Ny Transaktion';
    document.getElementById('transaction-edit-id').value = id || '';
    document.getElementById('delete-transaction-btn').classList.toggle('hidden', !isEditing);
    
    if(isEditing && item) {
        document.getElementById('transaction-edit-description').value = item.description;
        document.getElementById('transaction-edit-amount').value = item.amount;
        document.getElementById('transaction-edit-type').value = item.type;
        document.getElementById('transaction-edit-date').value = item.date;
    } else {
        document.getElementById('transaction-edit-date').value = formatDate(new Date());
    }
    
    populateReferenceDropdown(document.getElementById('transaction-edit-person'), appState.references.householdMembers, 'Vælg person...', item?.person);
    
    const mainCatSelect = document.getElementById('transaction-edit-category');
    populateMainCategoryDropdown(mainCatSelect, item?.mainCategory);
    mainCatSelect.onchange = () => populateSubCategoryDropdown(document.getElementById('transaction-edit-sub-category'), mainCatSelect.value);
    populateSubCategoryDropdown(document.getElementById('transaction-edit-sub-category'), item?.mainCategory, item?.subCategory);
    
    modal.classList.remove('hidden');
}

async function handleSaveTransaction(e) {
     e.preventDefault();
    const id = document.getElementById('transaction-edit-id').value;

    const data = {
        description: document.getElementById('transaction-edit-description').value,
        amount: parseFloat(document.getElementById('transaction-edit-amount').value),
        type: document.getElementById('transaction-edit-type').value,
        person: document.getElementById('transaction-edit-person').value,
        mainCategory: document.getElementById('transaction-edit-category').value,
        subCategory: document.getElementById('transaction-edit-sub-category').value,
        date: document.getElementById('transaction-edit-date').value,
        isFixed: false,
        userId: appState.currentUser.uid
    };

    try {
        if(id) {
            await updateDoc(doc(db, 'transactions', id), data);
        } else {
            await addDoc(collection(db, 'transactions'), data);
        }
        document.getElementById('transaction-edit-modal').classList.add('hidden');
    } catch(error) {
        handleError(error, "Kunne ikke gemme transaktion.", "saveTransaction");
    }
}

async function handleDeleteTransaction() {
    const id = document.getElementById('transaction-edit-id').value;
    if(!id) return;
    const confirmed = await showNotification({type: 'confirm', title: 'Slet Transaktion', message: 'Er du sikker?'});
    if(confirmed) {
        try {
            await deleteDoc(doc(db, 'transactions', id));
            document.getElementById('transaction-edit-modal').classList.add('hidden');
        } catch(error) {
            handleError(error, "Kunne ikke slette transaktion.", "deleteTransaction");
        }
    }
}


// =================================================================
// AKIVER & GÆLD (Eksisterende kode, ingen ændringer)
// =================================================================

function renderAssetsView(container) {
    const projectedData = calculateProjectedValues(economyState.projectionDate);
    const { assets, liabilities } = projectedData;

    const totalAssets = assets.reduce((sum, asset) => sum + (asset.value || 0), 0);
    const totalLiabilities = liabilities.reduce((sum, liability) => sum + (liability.currentBalance || 0), 0);
    const netWorth = totalAssets - totalLiabilities;
    
    const monthDisplay = economyState.projectionDate.toLocaleString('da-DK', { month: 'long', year: 'numeric' });
    const monthNavigatorHTML = `
        <div class="economy-month-navigator">
            <button id="assets-prev-month-btn" class="btn-icon"><i class="fas fa-chevron-left"></i></button>
            <h4 id="assets-current-month-display">${monthDisplay}</h4>
            <button id="assets-next-month-btn" class="btn-icon"><i class="fas fa-chevron-right"></i></button>
        </div>
    `;

    const assetsByType = assets.reduce((acc, asset) => {
        const type = asset.type || 'Andet';
        if (!acc[type]) acc[type] = [];
        acc[type].push(asset);
        return acc;
    }, {});

    const liabilitiesByType = liabilities.reduce((acc, liability) => {
        const type = liability.type || 'Andet';
        if (!acc[type]) acc[type] = [];
        acc[type].push(liability);
        return acc;
    }, {});


    container.innerHTML = `
        <div class="assets-header">
            <div>
                <h3>Aktiver & Gæld</h3>
                <p>Et overblik over din nettoformue.</p>
            </div>
            ${monthNavigatorHTML}
            <div class="assets-summary">
                <div>Total Formue: <strong>${toDKK(netWorth)} kr.</strong></div>
                <div>Aktiver: ${toDKK(totalAssets)} kr.</div>
                <div>Gæld: ${toDKK(totalLiabilities)} kr.</div>
            </div>
        </div>
        <div class="asset-liability-layout">
            <div class="asset-column">
                <div class="column-header">
                    <h4>Aktiver</h4>
                    <button id="add-asset-btn" class="btn btn-secondary btn-small"><i class="fas fa-plus"></i> Tilføj Aktiv</button>
                </div>
                ${Object.keys(assetsByType).length === 0 ? '<p class="empty-state-small">Ingen aktiver tilføjet.</p>' : Object.keys(assetsByType).map(type => `
                    <h5>${type}</h5>
                    ${assetsByType[type].map(asset => createAssetCard(asset, liabilities)).join('')}
                `).join('')}
            </div>
            <div class="liability-column">
                <div class="column-header">
                    <h4>Gæld</h4>
                    <button id="add-liability-btn" class="btn btn-secondary btn-small"><i class="fas fa-plus"></i> Tilføj Gæld</button>
                </div>
                ${Object.keys(liabilitiesByType).length === 0 ? '<p class="empty-state-small">Ingen gæld tilføjet.</p>' : Object.keys(liabilitiesByType).map(type => `
                    <h5>${type}</h5>
                    ${liabilitiesByType[type].map(createLiabilityCard).join('')}
                `).join('')}
            </div>
        </div>
    `;
}
function createAssetCard(asset, allLiabilities) {
    const linkedLiabilities = (asset.linkedLiabilityIds || [])
        .map(id => allLiabilities.find(l => l.id === id))
        .filter(Boolean);
    
    const totalDebtOnAsset = linkedLiabilities.reduce((sum, l) => sum + l.currentBalance, 0);
    const netValue = asset.value - totalDebtOnAsset;
    const debtRatio = asset.value > 0 ? (totalDebtOnAsset / asset.value) * 100 : 0;

    return `
        <div class="asset-card" data-id="${asset.id}">
            <div class="asset-card-header">
                <span class="asset-name">${asset.name}</span>
                <span class="asset-value">${toDKK(asset.value)} kr.</span>
            </div>
            <div class="asset-card-body">
                <div class="net-value">
                    <span>Friværdi</span>
                    <strong>${toDKK(netValue)} kr.</strong>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${100 - debtRatio}%;"></div>
                </div>
            </div>
        </div>
    `;
}
function createLiabilityCard(liability) {
    const { originalPrincipal = 0, currentBalance = 0, monthlyPayment = 0, interestRate = 0 } = liability;
    const paidAmount = originalPrincipal - currentBalance;
    const progress = originalPrincipal > 0 ? (paidAmount / originalPrincipal) * 100 : 0;

    const monthlyInterest = (currentBalance * (interestRate / 100)) / 12;
    const principalPayment = monthlyPayment - monthlyInterest;

    const termMonths = calculateTermMonths(currentBalance, liability.interestRate || 0, monthlyPayment);
    let endDateText = 'Ukendt';
    if (termMonths && isFinite(termMonths)) {
        const endDate = new Date(economyState.projectionDate);
        endDate.setMonth(endDate.getMonth() + termMonths);
        endDateText = endDate.toLocaleDateString('da-DK', { month: 'long', year: 'numeric'});
    } else if (termMonths === Infinity) {
        endDateText = 'Betales aldrig af';
    }
    
    return `
        <div class="liability-card" data-id="${liability.id}">
            <div class="liability-card-header">
                <span class="liability-name">${liability.name}</span>
                <span class="liability-balance">${toDKK(currentBalance)} kr.</span>
            </div>
            <div class="asset-card-body"> <!-- Genbruger styling -->
                <div class="net-value">
                    <span>Afbetalt</span>
                    <strong>${toDKK(paidAmount)} kr.</strong>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${progress}%;"></div>
                </div>
            </div>
            <div class="liability-card-footer">
                <span>Afdrag: ${toDKK(principalPayment)} kr.</span>
                <span>Rente: ${toDKK(monthlyInterest)} kr.</span>
                <span>Slut: ~${endDateText}</span>
            </div>
        </div>
    `;
}
function openAssetModal(assetId = null) {
    const modal = document.getElementById('asset-modal');
    const form = document.getElementById('asset-form');
    form.reset();
    const isEditing = !!assetId;
    const asset = isEditing ? appState.assets.find(a => a.id === assetId) : null;

    document.getElementById('asset-id').value = assetId || '';
    modal.querySelector('h3').textContent = isEditing ? 'Rediger Aktiv' : 'Nyt Aktiv';
    document.getElementById('delete-asset-btn').classList.toggle('hidden', !isEditing);

    if (isEditing) {
        document.getElementById('asset-name').value = asset.name;
        document.getElementById('asset-value').value = asset.value;
        document.getElementById('asset-monthly-contribution').value = asset.monthlyContribution || '';
        document.getElementById('asset-annual-growth-rate').value = asset.annualGrowthRate || '';
    }
    
    populateReferenceDropdown(document.getElementById('asset-type'), appState.references.assetTypes, 'Vælg type...', asset?.type);
    populateLiabilitiesDropdown(document.getElementById('asset-linked-liability'), 'Tilknyt gæld...', asset?.linkedLiabilityIds);
    modal.classList.remove('hidden');
}
async function handleSaveAsset(e) {
    e.preventDefault();
    const assetId = document.getElementById('asset-id').value;
    const linkedLiabilitySelect = document.getElementById('asset-linked-liability');
    const linkedLiabilityIds = Array.from(linkedLiabilitySelect.selectedOptions).map(opt => opt.value);

    const assetData = {
        name: document.getElementById('asset-name').value.trim(),
        type: document.getElementById('asset-type').value,
        value: parseFloat(document.getElementById('asset-value').value),
        monthlyContribution: parseFloat(document.getElementById('asset-monthly-contribution').value) || null,
        annualGrowthRate: parseFloat(document.getElementById('asset-annual-growth-rate').value) || null,
        linkedLiabilityIds: linkedLiabilityIds,
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
        document.getElementById('asset-modal').classList.add('hidden');
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
        document.getElementById('asset-modal').classList.add('hidden');
        showNotification({title: "Slettet", message: "Aktivet er blevet slettet."});
    } catch (error) {
        handleError(error, "Aktivet kunne ikke slettes.", "deleteAsset");
    }
}

function openLiabilityModal(liabilityId = null) {
    const modal = document.getElementById('liability-modal');
    const form = document.getElementById('liability-form');
    form.reset();
    const isEditing = !!liabilityId;
    const liability = isEditing ? appState.liabilities.find(l => l.id === liabilityId) : null;

    document.getElementById('liability-id').value = liabilityId || '';
    modal.querySelector('h3').textContent = isEditing ? `Rediger ${liability.name}` : 'Ny Gæld';
    document.getElementById('delete-liability-btn').classList.toggle('hidden', !isEditing);

    if (isEditing) {
        document.getElementById('liability-name').value = liability.name || '';
        document.getElementById('liability-type').value = liability.type || '';
        document.getElementById('liability-original-principal').value = liability.originalPrincipal || '';
        document.getElementById('liability-start-date').value = formatDate(liability.startDate);
        document.getElementById('liability-current-balance').value = liability.currentBalance || '';
        document.getElementById('liability-interest-rate').value = liability.interestRate || '';
        document.getElementById('liability-monthly-payment').value = liability.monthlyPayment || '';
        document.getElementById('liability-term-months').value = liability.termMonths || '';
    }
    
    populateReferenceDropdown(document.getElementById('liability-type'), appState.references.liabilityTypes, 'Vælg type...', liability?.type);
    
    handleLoanCalculatorChange({ target: form.querySelector('input') });
    
    modal.classList.remove('hidden');
}

async function handleSaveLiability(e) {
    e.preventDefault();
    const liabilityId = document.getElementById('liability-id').value;
    
    const liabilityData = {
        name: document.getElementById('liability-name').value.trim(),
        type: document.getElementById('liability-type').value,
        originalPrincipal: parseFloat(document.getElementById('liability-original-principal').value) || null,
        startDate: document.getElementById('liability-start-date').value || null,
        currentBalance: parseFloat(document.getElementById('liability-current-balance').value),
        monthlyPayment: parseFloat(document.getElementById('liability-monthly-payment').value) || null,
        interestRate: parseFloat(document.getElementById('liability-interest-rate').value) || null,
        termMonths: parseInt(document.getElementById('liability-term-months').value, 10) || null,
        userId: appState.currentUser.uid
    };

    if (!liabilityData.name || !liabilityData.type || isNaN(liabilityData.currentBalance)) {
        showNotification({title: "Udfyld påkrævede felter", message: "Navn, type og restgæld skal være udfyldt."});
        return;
    }

    try {
        if (liabilityId) {
            await updateDoc(doc(db, 'liabilities', liabilityId), liabilityData);
        } else {
            await addDoc(collection(db, 'liabilities'), liabilityData);
        }
        document.getElementById('liability-modal').classList.add('hidden');
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

        (appState.assets || []).forEach(asset => {
            if (asset.linkedLiabilityIds && asset.linkedLiabilityIds.includes(liabilityId)) {
                const assetRef = doc(db, 'assets', asset.id);
                const updatedIds = asset.linkedLiabilityIds.filter(id => id !== liabilityId);
                batch.update(assetRef, { linkedLiabilityIds: updatedIds });
            }
        });

        await batch.commit();
        document.getElementById('liability-modal').classList.add('hidden');
        showNotification({title: "Slettet", message: "Gældsposten er blevet slettet."});
    } catch (error) {
        handleError(error, "Gældsposten kunne ikke slettes.", "deleteLiability");
    }
}
function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => {
        const option = new Option(opt, opt);
        selectElement.add(option);
    });
    if (currentValue) {
        selectElement.value = currentValue;
    }
}
function populateLiabilitiesDropdown(selectElement, placeholder, currentValues) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (appState.liabilities || []).sort((a,b) => a.name.localeCompare(b.name)).forEach(l => selectElement.add(new Option(l.name, l.id)));
    
    if (currentValues && Array.isArray(currentValues)) {
        Array.from(selectElement.options).forEach(opt => {
            if (currentValues.includes(opt.value)) {
                opt.selected = true;
            }
        });
    }
}
function calculateProjectedValues(targetDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);

    let projectedLiabilities = JSON.parse(JSON.stringify(appState.liabilities || []));
    let projectedAssets = JSON.parse(JSON.stringify(appState.assets || []));

    const monthsDiff = (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth());
    const direction = monthsDiff >= 0 ? 1 : -1;

    for (let i = 0; i < Math.abs(monthsDiff); i++) {
        projectedLiabilities.forEach(liability => {
            const { currentBalance, monthlyPayment = 0, interestRate = 0 } = liability;
            if (currentBalance <= 0) return;
            const monthlyInterestRate = (interestRate / 100) / 12;
            
            if (direction === 1) { // Forward in time
                const monthlyInterest = currentBalance * monthlyInterestRate;
                const principalPayment = monthlyPayment - monthlyInterest;
                liability.currentBalance -= principalPayment;
            } else { // Backward in time
                const principalPaymentGuess = monthlyPayment - (currentBalance * monthlyInterestRate);
                liability.currentBalance += principalPaymentGuess;
            }
            liability.currentBalance = Math.max(0, liability.currentBalance);
        });

        projectedAssets.forEach(asset => {
            const { monthlyContribution = 0, annualGrowthRate = 0 } = asset;
            const monthlyGrowthRate = (annualGrowthRate / 100) / 12;

            const isDepreciatingAssetWithLoan = asset.linkedLiabilityIds && asset.linkedLiabilityIds.length > 0;

            if (direction === 1) {
                const contribution = isDepreciatingAssetWithLoan ? 0 : monthlyContribution;
                asset.value = asset.value * (1 + monthlyGrowthRate) + contribution;
            } else {
                const contribution = isDepreciatingAssetWithLoan ? 0 : monthlyContribution;
                asset.value = (asset.value - contribution) / (1 + monthlyGrowthRate);
            }
        });
    }

    const totalAssets = projectedAssets.reduce((sum, asset) => sum + asset.value, 0);
    const totalLiabilities = projectedLiabilities.reduce((sum, l) => sum + l.currentBalance, 0);
    const netWorth = totalAssets - totalLiabilities;

    return { assets: projectedAssets, liabilities: projectedLiabilities, netWorth };
}

// =================================================================
// HJÆLPEFUNKTIONER (f.eks. til dropdowns)
// =================================================================

function populateMainCategoryDropdown(select, val) {
    const mainCategories = (appState.references.budgetCategories || []).map(cat => (typeof cat === 'string' ? cat : cat.name));
    populateReferenceDropdown(select, mainCategories, 'Vælg overkategori...', val);
}

function populateSubCategoryDropdown(select, mainCat, val) {
    const allCategories = (appState.references.budgetCategories || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
    const mainCatData = allCategories.find(cat => cat.name === mainCat);
    const subCategories = mainCatData ? mainCatData.subcategories : [];
    populateReferenceDropdown(select, subCategories, 'Vælg underkategori...', val);
    select.disabled = !mainCat;
}

// =================================================================
// LÅNEBEREGNER LOGIK
// =================================================================

function handleLoanCalculatorChange(e) {
    const form = e.target.closest('#liability-form');
    if (!form) return;

    const principalInput = form.querySelector('#liability-current-balance');
    const rateInput = form.querySelector('#liability-interest-rate');
    const termMonthsInput = form.querySelector('#liability-term-months');
    const paymentInput = form.querySelector('#liability-monthly-payment');
    const termDisplay = form.querySelector('#liability-remaining-term-display');

    const principal = parseFloat(principalInput.value) || 0;
    const annualRate = parseFloat(rateInput.value) || 0;
    let termMonths = parseInt(termMonthsInput.value, 10) || 0;
    let monthlyPayment = parseFloat(paymentInput.value) || 0;

    const changedElementId = e.target.id;

    if (changedElementId === 'liability-term-months') {
        economyState.lastEditedLoanField = 'term';
    } else if (changedElementId === 'liability-monthly-payment') {
        economyState.lastEditedLoanField = 'payment';
    }

    if (changedElementId === 'liability-term-months') {
        const newPayment = calculateMonthlyPayment(principal, annualRate, termMonths);
        if (newPayment) paymentInput.value = newPayment.toFixed(2);
    } else if (changedElementId === 'liability-monthly-payment') {
        const newTermMonths = calculateTermMonths(principal, annualRate, monthlyPayment);
        if (newTermMonths !== null && isFinite(newTermMonths)) termMonthsInput.value = Math.round(newTermMonths);
    } else if (changedElementId === 'liability-interest-rate' || changedElementId === 'liability-current-balance') {
        if (economyState.lastEditedLoanField === 'term' && termMonths > 0) {
            const newPayment = calculateMonthlyPayment(principal, annualRate, termMonths);
            if (newPayment) paymentInput.value = newPayment.toFixed(2);
        } else if (economyState.lastEditedLoanField === 'payment' && monthlyPayment > 0) {
            const newTermMonths = calculateTermMonths(principal, annualRate, monthlyPayment);
            if (newTermMonths !== null && isFinite(newTermMonths)) termMonthsInput.value = Math.round(newTermMonths);
        }
    }

    const finalPayment = parseFloat(paymentInput.value) || 0;
    const finalTermMonths = calculateTermMonths(principal, annualRate, finalPayment);
    updateRemainingTermDisplay(finalTermMonths, termDisplay);
}

function updateRemainingTermDisplay(totalMonths, displayElement) {
    if (totalMonths === null || totalMonths <= 0) {
        displayElement.value = 'N/A';
        return;
    }
    if (!isFinite(totalMonths)) {
        displayElement.value = 'Betales aldrig af';
        return;
    }
    
    const years = Math.floor(totalMonths / 12);
    const months = Math.round(totalMonths % 12);
    let result = '';
    if (years > 0) result += `${years} år `;
    if (months > 0) result += `${months} mdr.`;
    
    displayElement.value = result.trim() || '0 mdr.';
}

