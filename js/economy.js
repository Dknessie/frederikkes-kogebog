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
    currentView: 'budget', // 'budget', 'formue'
    currentMonth: new Date(), // Holder styr på den viste måned
    currentPerson: 'Fælles', // 'Fælles', 'Frederikke', 'Daniel'
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
    
    const fixedExpenseForm = document.getElementById('fixed-expense-form');
    if (fixedExpenseForm) {
        fixedExpenseForm.addEventListener('submit', handleSaveFixedExpense);
        const frequencySelect = document.getElementById('fixed-expense-frequency');
        if(frequencySelect) {
            frequencySelect.addEventListener('change', (e) => {
                const paymentMonthGroup = document.getElementById('payment-month-group');
                paymentMonthGroup.classList.toggle('hidden', e.target.value !== 'yearly');
            });
        }
    }
    const deleteFixedExpenseBtn = document.getElementById('delete-fixed-expense-btn');
    if(deleteFixedExpenseBtn) deleteFixedExpenseBtn.addEventListener('click', handleDeleteFixedExpense);

    // Listeners for Aktiver & Gæld
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

    // Håndter klik baseret på aktiv visning
    switch(economyState.currentView) {
        case 'budget':
            if (e.target.closest('#budget-prev-month-btn')) {
                economyState.currentMonth.setMonth(economyState.currentMonth.getMonth() - 1);
                renderBudgetView(document.getElementById('economy-content-area')); // Rettelse: Kald renderBudgetView direkte
            } else if (e.target.closest('#budget-next-month-btn')) {
                economyState.currentMonth.setMonth(economyState.currentMonth.getMonth() + 1);
                renderBudgetView(document.getElementById('economy-content-area')); // Rettelse: Kald renderBudgetView direkte
            } else if (e.target.closest('.person-tab')) {
                economyState.currentPerson = e.target.closest('.person-tab').dataset.person;
                renderBudgetView(document.getElementById('economy-content-area')); // Rettelse: Kald renderBudgetView direkte
            } else if (e.target.closest('#add-fixed-expense-btn')) {
                openFixedExpenseModal();
            } else if (e.target.closest('.budget-item-row[data-id]')) {
                openFixedExpenseModal(e.target.closest('.budget-item-row').dataset.id);
            }
            break;
        case 'formue':
             if (e.target.closest('#assets-prev-month-btn')) {
                economyState.currentMonth.setMonth(economyState.currentMonth.getMonth() - 1);
                renderAssetsView(document.getElementById('economy-content-area')); // Rettelse: Kald renderAssetsView direkte
            } else if (e.target.closest('#assets-next-month-btn')) {
                economyState.currentMonth.setMonth(economyState.currentMonth.getMonth() + 1);
                renderAssetsView(document.getElementById('economy-content-area')); // Rettelse: Kald renderAssetsView direkte
            } else if (e.target.closest('#add-asset-btn')) {
                openAssetModal();
            } else if (e.target.closest('#add-liability-btn')) {
                openLiabilityModal();
            } else if (e.target.closest('.asset-card')) {
                openAssetModal(e.target.closest('.asset-card').dataset.id);
            } else if (e.target.closest('.liability-card')) {
                openLiabilityModal(e.target.closest('.liability-card').dataset.id);
            }
            break;
    }
}

function renderSidebar() {
    const navContainer = document.getElementById('economy-nav-list');
    if (!navContainer) return;

    const views = [
        { key: 'budget', name: 'Budgetoversigt', icon: 'fa-wallet' },
        { key: 'formue', name: 'Formue', icon: 'fa-chart-line' },
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
    
    contentArea.innerHTML = '';

    switch (economyState.currentView) {
        case 'budget':
            renderBudgetView(contentArea);
            break;
        case 'formue':
            renderAssetsView(contentArea);
            break;
        default:
            renderBudgetView(contentArea);
    }
}


// =================================================================
// BUDGET VISNING
// =================================================================

function renderBudgetView(container) {
    container.innerHTML = `
        <div class="economy-page-container">
            <header class="economy-header">
                <div id="economy-month-navigator"></div>
                <div id="economy-person-filter"></div>
                <div class="economy-header-actions">
                    <button id="add-fixed-expense-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Ny Fast Post</button>
                    <button id="add-planned-expense-btn" class="btn btn-secondary" disabled><i class="fas fa-calendar-plus"></i> Planlæg Udgift</button>
                </div>
            </header>
            <div id="economy-summary-cards"></div>
            <div id="planned-expenses-warning-bar" class="hidden"></div>
            <main id="budget-details-container"></main>
        </div>
    `;

    const monthDisplay = economyState.currentMonth.toLocaleString('da-DK', { month: 'long', year: 'numeric' });
    
    const { monthlyAverages } = calculateMonthlyAverages(appState.fixedExpenses);
    const filteredData = filterAndGroupExpenses(monthlyAverages, economyState.currentPerson);
    
    const totalIncome = filteredData.reduce((sum, cat) => sum + cat.income, 0);
    const totalExpense = filteredData.reduce((sum, cat) => sum + cat.expense, 0);
    const disposable = totalIncome - totalExpense;

    renderMonthNavigator(container.querySelector('#economy-month-navigator'), monthDisplay);
    renderPersonFilter(container.querySelector('#economy-person-filter'));
    renderSummaryCards(container.querySelector('#economy-summary-cards'), totalIncome, totalExpense, disposable);
    renderBudgetDetails(container.querySelector('#budget-details-container'), filteredData);
}

function renderMonthNavigator(container, monthDisplay) {
    if (!container) return;
    container.innerHTML = `
        <button id="budget-prev-month-btn" class="btn-icon"><i class="fas fa-chevron-left"></i></button>
        <h3>${monthDisplay}</h3>
        <button id="budget-next-month-btn" class="btn-icon"><i class="fas fa-chevron-right"></i></button>
    `;
}

function renderPersonFilter(container) {
    if (!container) return;
    const persons = ['Fælles', 'Frederikke', 'Daniel'];
    container.innerHTML = persons.map(p => `
        <button class="person-tab ${economyState.currentPerson === p ? 'active' : ''}" data-person="${p}">${p}</button>
    `).join('');
}

function renderSummaryCards(container, income, expense, disposable) {
    if (!container) return;
    container.innerHTML = `
        <div class="summary-card income">
            <h4>Indkomst</h4>
            <p>${toDKK(income)} kr.</p>
        </div>
        <div class="summary-card expense">
            <h4>Udgifter</h4>
            <p>${toDKK(expense)} kr.</p>
        </div>
        <div class="summary-card disposable">
            <h4>Rådighedsbeløb</h4>
            <p>${toDKK(disposable)} kr.</p>
        </div>
    `;
}

function renderBudgetDetails(container, groupedData) {
    if (!container) return;
    if (groupedData.length === 0) {
        container.innerHTML = `<p class="empty-state">Ingen poster fundet for den valgte person.</p>`;
        return;
    }

    container.innerHTML = groupedData.map(category => `
        <div class="budget-category-section">
            <div class="category-header">
                <h4>${category.name}</h4>
                <div class="category-totals">
                    <span class="category-expense-total">${toDKK(category.expense)} kr.</span>
                </div>
            </div>
            <div class="budget-items-table">
                ${category.items.map(item => `
                    <div class="budget-item-row" data-id="${item.id}">
                        <span class="item-description">${item.description}</span>
                        <span class="item-person">${item.persons.join(' & ')}</span>
                        <span class="item-amount">${toDKK(item.monthlyAmount)} kr.</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// =================================================================
// DATA LOGIK (Budget)
// =================================================================

function calculateMonthlyAverages(fixedExpenses) {
    const monthlyAverages = (fixedExpenses || []).map(item => {
        let monthlyAmount = item.amount;
        if (item.frequency === 'yearly') {
            monthlyAmount = item.amount / 12;
        } else if (item.frequency === 'quarterly') {
            monthlyAmount = item.amount / 3;
        }
        return { ...item, monthlyAmount };
    });
    return { monthlyAverages };
}

function filterAndGroupExpenses(monthlyAverages, personFilter) {
    let itemsToShow = [];
    if (personFilter === 'Fælles') {
        itemsToShow = monthlyAverages;
    } else {
        itemsToShow = monthlyAverages.filter(item => item.person === personFilter);
    }

    if (personFilter === 'Fælles') {
        const consolidated = {};
        itemsToShow.forEach(item => {
            const key = item.description.toLowerCase();
            if (!consolidated[key]) {
                consolidated[key] = { ...item, persons: [item.person] };
            } else {
                consolidated[key].monthlyAmount += item.monthlyAmount;
                if (!consolidated[key].persons.includes(item.person)) {
                    consolidated[key].persons.push(item.person);
                }
            }
        });
        itemsToShow = Object.values(consolidated);
    } else {
         itemsToShow = itemsToShow.map(item => ({ ...item, persons: [item.person] }));
    }

    const groupedByCategory = {};
    itemsToShow.forEach(item => {
        const category = item.mainCategory || 'Diverse';
        if (!groupedByCategory[category]) {
            groupedByCategory[category] = { name: category, items: [], income: 0, expense: 0 };
        }
        groupedByCategory[category].items.push(item);
        if (item.type === 'income') {
            groupedByCategory[category].income += item.monthlyAmount;
        } else {
            groupedByCategory[category].expense += item.monthlyAmount;
        }
    });

    return Object.values(groupedByCategory).sort((a,b) => a.name.localeCompare(b.name));
}

// =================================================================
// FORMUE VISNING (Aktiver & Gæld)
// =================================================================

function renderAssetsView(container) {
    const projectedData = calculateProjectedValues(economyState.currentMonth);
    const { assets, liabilities } = projectedData;

    const totalAssets = assets.reduce((sum, asset) => sum + (asset.value || 0), 0);
    const totalLiabilities = liabilities.reduce((sum, liability) => sum + (liability.currentBalance || 0), 0);
    const netWorth = totalAssets - totalLiabilities;
    
    const monthDisplay = economyState.currentMonth.toLocaleString('da-DK', { month: 'long', year: 'numeric' });
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
                <h3>Formue (Aktiver & Gæld)</h3>
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
        const endDate = new Date(economyState.currentMonth);
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

// =================================================================
// MODAL & FIRESTORE FUNKTIONER
// =================================================================

function openFixedExpenseModal(id = null) {
    const modal = document.getElementById('fixed-expense-modal');
    const form = document.getElementById('fixed-expense-form');
    form.reset();

    const isEditing = !!id;
    const item = isEditing ? appState.fixedExpenses.find(i => i.id === id) : null;
    
    modal.querySelector('h3').textContent = isEditing ? `Rediger: ${item.description}` : 'Ny Fast Post';
    document.getElementById('fixed-expense-id-edit').value = id || '';
    document.getElementById('delete-fixed-expense-btn').classList.toggle('hidden', !isEditing);
    
    if(isEditing && item) {
        document.getElementById('fixed-expense-description').value = item.description;
        document.getElementById('fixed-expense-amount').value = item.amount;
        document.getElementById('fixed-expense-type').value = item.type;
        document.getElementById('fixed-expense-start-date-edit').value = item.startDate;
        document.getElementById('fixed-expense-end-date-edit').value = item.endDate || '';
        document.getElementById('fixed-expense-person').value = item.person || '';
        document.getElementById('fixed-expense-frequency').value = item.frequency || 'monthly';
        document.getElementById('fixed-expense-payment-month').value = item.paymentMonth || '1';
    } else {
        document.getElementById('fixed-expense-start-date-edit').value = formatDate(new Date());
    }
    
    const paymentMonthGroup = document.getElementById('payment-month-group');
    paymentMonthGroup.classList.toggle('hidden', document.getElementById('fixed-expense-frequency').value !== 'yearly');

    populateReferenceDropdown(document.getElementById('fixed-expense-person'), appState.references.householdMembers, 'Vælg person...', item?.person);
    populateReferenceDropdown(document.getElementById('fixed-expense-account'), appState.references.accounts, 'Vælg konto...', item?.account);
    
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
        person: document.getElementById('fixed-expense-person').value,
        frequency: document.getElementById('fixed-expense-frequency').value,
        paymentMonth: document.getElementById('fixed-expense-frequency').value === 'yearly' ? parseInt(document.getElementById('fixed-expense-payment-month').value, 10) : null,
        account: document.getElementById('fixed-expense-account').value,
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
        document.getElementById('liability-start-date').value = formatDate(new Date(liability.startDate));
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
    
    return { assets: projectedAssets, liabilities: projectedLiabilities };
}

// =================================================================
// HJÆLPEFUNKTIONER
// =================================================================

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
        const newPayment = calculateMonthlyPayment(principal, annualRate, termMonths);
        if (newPayment) paymentInput.value = newPayment.toFixed(2);
    } else if (changedElementId === 'liability-monthly-payment') {
        const newTermMonths = calculateTermMonths(principal, annualRate, monthlyPayment);
        if (newTermMonths !== null && isFinite(newTermMonths)) termMonthsInput.value = Math.round(newTermMonths);
    } else if (['liability-interest-rate', 'liability-current-balance'].includes(changedElementId)) {
        if (monthlyPayment > 0) {
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

