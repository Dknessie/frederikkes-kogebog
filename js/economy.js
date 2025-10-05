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
    currentView: 'budget', // 'budget' or 'assets'
    selectedPerson: 'Fælles', // 'Fælles', 'Frederikke', 'Daniel'
    currentMonth: new Date(),
    projectionDate: new Date(),
    showExcludedFromNetWorth: false, // NY state til at styre visning
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
        // Tilføj event listener for den nye checkbox
        pageContainer.addEventListener('change', (e) => {
            if (e.target.id === 'show-excluded-toggle') {
                economyState.showExcludedFromNetWorth = e.target.checked;
                renderView();
            }
        });
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
        const newView = navLink.dataset.view;
        if (economyState.currentView !== newView) {
            economyState.currentView = newView;
            // Nulstil projektionsdatoen til i dag, når der skiftes til Formue-visning
            if (newView === 'assets') {
                economyState.projectionDate = new Date();
            }
        }
        renderEconomy();
        return;
    }

    // Håndter klik baseret på aktiv visning
    switch(economyState.currentView) {
        case 'budget':
            const personTab = e.target.closest('.person-tab');
            if(personTab) {
                economyState.selectedPerson = personTab.dataset.person;
                renderBudgetView(); // Kun render budget-delen, ikke hele siden
                return;
            }
            if (e.target.closest('#add-fixed-expense-btn')) {
                openFixedExpenseModal();
                return;
            }
            const budgetItemRow = e.target.closest('.budget-item-row');
            if (budgetItemRow) {
                openFixedExpenseModal(budgetItemRow.dataset.id);
                return;
            }
            break;
        case 'assets':
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
            if (e.target.closest('#add-asset-btn')) openAssetModal();
            else if (e.target.closest('#add-liability-btn')) openLiabilityModal();
            else if (e.target.closest('.asset-card')) openAssetModal(e.target.closest('.asset-card').dataset.id);
            else if (e.target.closest('.liability-card')) openLiabilityModal(e.target.closest('.liability-card').dataset.id);
            break;
    }
}

function renderSidebar() {
    const navContainer = document.getElementById('economy-nav-list');
    if (!navContainer) return;

    const views = [
        { key: 'budget', name: 'Budgetoversigt', icon: 'fa-wallet' },
        { key: 'assets', name: 'Formue', icon: 'fa-chart-line' }
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
            contentArea.innerHTML = `<div id="budget-view-container" class="economy-page-container"></div>`;
            renderBudgetView();
            break;
        case 'assets':
            contentArea.innerHTML = `<div id="assets-view-container" class="economy-page-container"></div>`;
            renderAssetsView(document.getElementById('assets-view-container'));
            break;
        default:
            contentArea.innerHTML = `<p>Vælg en visning fra menuen.</p>`;
    }
}

// =================================================================
// NY BUDGETOVERSIGT
// =================================================================

function renderBudgetView() {
    const container = document.getElementById('budget-view-container');
    if (!container) return;

    const activeFixedExpenses = appState.fixedExpenses || [];
    const monthlyAverages = calculateMonthlyAverages(activeFixedExpenses);
    const groupedData = filterAndGroupExpenses(monthlyAverages, economyState.selectedPerson);

    const totalIncome = groupedData.income.reduce((sum, item) => sum + item.monthlyAmount, 0);
    const totalExpenses = groupedData.expenses.reduce((sum, item) => sum + item.monthlyAmount, 0);
    const disposable = totalIncome - totalExpenses;

    let sharedExpensesTitle = 'Fællesudgifter';
    let sharedExpensesAmount = 0;
    
    // Totalen af alle udgifter betalt fra "Fælles Budget"
    const totalFromSharedAccount = monthlyAverages
        .filter(item => item.account === 'Fælles Budget' && item.type === 'expense')
        .reduce((sum, item) => sum + item.monthlyAmount, 0);

    if (economyState.selectedPerson === 'Fælles') {
        sharedExpensesAmount = totalFromSharedAccount;
    } else {
        // For en individuel person: Hvad skal de overføre?
        // Det er summen af deres egne poster, der er markeret til at blive betalt fra fælleskontoen.
        sharedExpensesAmount = monthlyAverages
            .filter(item => item.person === economyState.selectedPerson && item.account === 'Fælles Budget' && item.type === 'expense')
            .reduce((sum, item) => sum + item.monthlyAmount, 0);
        sharedExpensesTitle = 'Overførsel til Fælles';
    }


    const categories = [...new Set(groupedData.expenses.map(item => item.mainCategory))].sort();

    container.innerHTML = `
        <div class="economy-header">
            <div id="economy-month-navigator">
                <h3>${economyState.currentMonth.toLocaleString('da-DK', { month: 'long', year: 'numeric' })}</h3>
            </div>
            <div id="economy-person-filter">
                <button class="person-tab ${economyState.selectedPerson === 'Fælles' ? 'active' : ''}" data-person="Fælles">Fælles</button>
                <button class="person-tab ${economyState.selectedPerson === 'Frederikke' ? 'active' : ''}" data-person="Frederikke">Frederikke</button>
                <button class="person-tab ${economyState.selectedPerson === 'Daniel' ? 'active' : ''}" data-person="Daniel">Daniel</button>
            </div>
            <div class="economy-header-actions">
                <button id="add-fixed-expense-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Ny Fast Post</button>
            </div>
        </div>

        <div id="economy-summary-cards">
            <div class="summary-card income"><h4>Total Indkomst</h4><p>${toDKK(totalIncome)} kr.</p></div>
            <div class="summary-card expense"><h4>Total Udgifter</h4><p>${toDKK(totalExpenses)} kr.</p></div>
            <div class="summary-card shared"><h4>${sharedExpensesTitle}</h4><p>${toDKK(sharedExpensesAmount)} kr.</p></div>
            <div class="summary-card disposable"><h4>Rådighedsbeløb</h4><p>${toDKK(disposable)} kr.</p></div>
        </div>

        <div id="budget-details-container">
            ${categories.map(category => renderCategorySection(category, groupedData.expenses)).join('')}
        </div>
    `;
}

function renderCategorySection(category, allExpenses) {
    const itemsInCategory = allExpenses.filter(item => item.mainCategory === category);
    const categoryTotal = itemsInCategory.reduce((sum, item) => sum + item.monthlyAmount, 0);

    return `
        <div class="budget-category-section">
            <div class="category-header">
                <h4>${category}</h4>
                <span class="category-expense-total">-${toDKK(categoryTotal)} kr.</span>
            </div>
            <div class="budget-items-table">
                ${itemsInCategory.map(item => `
                    <div class="budget-item-row" data-id="${item.id}">
                        <span class="item-description">${item.description}</span>
                        <span class="item-amount">-${toDKK(item.monthlyAmount)} kr.</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function calculateMonthlyAverages(items) {
    return items.map(item => {
        let monthlyAmount = item.amount;
        switch (item.frequency) {
            case 'yearly':
                monthlyAmount /= 12;
                break;
            case 'semi-annually':
                monthlyAmount /= 6;
                break;
            case 'quarterly':
                monthlyAmount /= 3;
                break;
            // 'monthly' is default
        }
        return { ...item, monthlyAmount };
    });
}

function filterAndGroupExpenses(items, personFilter) {
    let filteredItems = items;
    // Visning for en specifik person: Vis KUN den persons poster.
    if (personFilter !== 'Fælles') {
        filteredItems = items.filter(item => item.person === personFilter);
    }
    // For "Fælles"-visning, brug alle items.
    
    const income = filteredItems.filter(item => item.type === 'income');
    let expenses = filteredItems.filter(item => item.type === 'expense');

    // Konsolidering sker KUN for "Fælles"-visningen
    if (personFilter === 'Fælles') {
        const consolidatedExpenses = {};
        expenses.forEach(item => {
            const key = `${item.description.toLowerCase()}_${item.mainCategory.toLowerCase()}`;
            if (consolidatedExpenses[key]) {
                consolidatedExpenses[key].monthlyAmount += item.monthlyAmount;
            } else {
                consolidatedExpenses[key] = { ...item };
            }
        });
        expenses = Object.values(consolidatedExpenses);
    }
    
    return { income, expenses };
}



// =================================================================
// FASTE POSTER (MODAL & SAVE LOGIC)
// =================================================================

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
        document.getElementById('fixed-expense-frequency').value = item.frequency || 'monthly';
        document.getElementById('fixed-expense-payment-month').value = item.paymentMonth || '';
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
        frequency: document.getElementById('fixed-expense-frequency').value,
        paymentMonth: document.getElementById('fixed-expense-payment-month').value || null,
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
// AKIVER & GÆLD
// =================================================================

function renderAssetsView(container) {
    const projectedData = calculateProjectedValues(economyState.projectionDate, economyState.showExcludedFromNetWorth);
    
    const sortedAssets = (projectedData.assets || []).sort((a, b) => {
        const aHasDebt = (a.linkedLiabilityIds || []).length > 0;
        const bHasDebt = (b.linkedLiabilityIds || []).length > 0;
        if (aHasDebt && !bHasDebt) return -1;
        if (!aHasDebt && bHasDebt) return 1;
        return a.name.localeCompare(b.name);
    });

    const { liabilities } = projectedData;

    const totalAssets = sortedAssets.reduce((sum, asset) => sum + (asset.value || 0), 0);
    const totalLiabilities = liabilities.reduce((sum, liability) => sum + (liability.currentBalance || 0), 0);
    const netWorth = totalAssets - totalLiabilities;
    
    const monthDisplay = economyState.projectionDate.toLocaleString('da-DK', { month: 'long', year: 'numeric' });
    const monthNavigatorHTML = `
        <div class="economy-month-navigator">
            <button id="assets-prev-month-btn" class="btn-icon"><i class="fas fa-chevron-left"></i></button>
            <h4>${monthDisplay}</h4>
            <button id="assets-next-month-btn" class="btn-icon"><i class="fas fa-chevron-right"></i></button>
        </div>
    `;

    const assetsByType = sortedAssets.reduce((acc, asset) => {
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
                <div class="input-group-inline" style="justify-content: flex-end; margin-top: 8px;">
                    <input type="checkbox" id="show-excluded-toggle" ${economyState.showExcludedFromNetWorth ? 'checked' : ''}>
                    <label for="show-excluded-toggle">Vis poster ekskluderet fra formue</label>
                </div>
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
    
    let bodyContent;

    if (linkedLiabilities.length > 0) {
        const totalDebtOnAsset = linkedLiabilities.reduce((sum, l) => sum + l.currentBalance, 0);
        const netValue = asset.value - totalDebtOnAsset;
        const debtRatio = asset.value > 0 ? (totalDebtOnAsset / asset.value) * 100 : 0;
        bodyContent = `
            <div class="net-value">
                <span>Friværdi</span>
                <strong>${toDKK(netValue)} kr.</strong>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: ${100 - debtRatio}%;"></div>
            </div>
        `;
    } else {
        bodyContent = `
            <div class="asset-kpis">
                <div class="kpi-item">
                    <span class="kpi-label">Månedligt Indskud</span>
                    <span class="kpi-value">${toDKK(asset.monthlyContribution || 0)} kr.</span>
                </div>
                <div class="kpi-item">
                    <span class="kpi-label">Forv. Årligt Afkast</span>
                    <span class="kpi-value">${asset.annualGrowthRate || 0} %</span>
                </div>
            </div>
        `;
    }
    // Visuel indikator hvis den er ekskluderet og "vis alle" er slået til
    const excludedClass = !asset.includeInNetWorth && economyState.showExcludedFromNetWorth ? 'excluded-item' : '';

    return `
        <div class="asset-card ${excludedClass}" data-id="${asset.id}">
            <div class="asset-card-header">
                <span class="asset-name">${asset.name}</span>
                <span class="asset-value">${toDKK(asset.value)} kr.</span>
            </div>
            <div class="asset-card-body">
                ${bodyContent}
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
    
    const excludedClass = !liability.includeInNetWorth && economyState.showExcludedFromNetWorth ? 'excluded-item' : '';

    return `
        <div class="liability-card ${excludedClass}" data-id="${liability.id}">
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
        document.getElementById('asset-start-value').value = asset.startValue;
        document.getElementById('asset-start-date').value = formatDate(asset.startDate);
        document.getElementById('asset-monthly-contribution').value = asset.monthlyContribution || '';
        document.getElementById('asset-annual-growth-rate').value = asset.annualGrowthRate || '';
        document.getElementById('asset-include-in-net-worth').checked = asset.includeInNetWorth !== false;
    } else {
        document.getElementById('asset-start-date').value = formatDate(new Date());
        document.getElementById('asset-include-in-net-worth').checked = true;
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
        startValue: parseFloat(document.getElementById('asset-start-value').value),
        startDate: document.getElementById('asset-start-date').value,
        monthlyContribution: parseFloat(document.getElementById('asset-monthly-contribution').value) || null,
        annualGrowthRate: parseFloat(document.getElementById('asset-annual-growth-rate').value) || null,
        linkedLiabilityIds: linkedLiabilityIds,
        includeInNetWorth: document.getElementById('asset-include-in-net-worth').checked,
        userId: appState.currentUser.uid
    };

    if (!assetData.name || !assetData.type || isNaN(assetData.startValue) || !assetData.startDate) {
        showNotification({title: "Udfyld påkrævede felter", message: "Navn, type, startværdi og startdato skal være udfyldt."});
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
        document.getElementById('liability-current-balance').value = liability.originalPrincipal || ''; // Viser originalt beløb
        document.getElementById('liability-interest-rate').value = liability.interestRate || '';
        document.getElementById('liability-monthly-payment').value = liability.monthlyPayment || '';
        document.getElementById('liability-term-months').value = liability.termMonths || '';
        document.getElementById('liability-include-in-net-worth').checked = liability.includeInNetWorth !== false;
    } else {
        document.getElementById('liability-start-date').value = formatDate(new Date());
        document.getElementById('liability-include-in-net-worth').checked = true;
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
        monthlyPayment: parseFloat(document.getElementById('liability-monthly-payment').value) || null,
        interestRate: parseFloat(document.getElementById('liability-interest-rate').value) || null,
        termMonths: parseInt(document.getElementById('liability-term-months').value, 10) || null,
        includeInNetWorth: document.getElementById('liability-include-in-net-worth').checked,
        userId: appState.currentUser.uid
    };

    if (!liabilityData.name || !liabilityData.type || !liabilityData.originalPrincipal) {
        showNotification({title: "Udfyld påkrævede felter", message: "Navn, type og oprindeligt lånbeløb skal være udfyldt."});
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

function calculateProjectedValues(targetDate, showExcluded = false) {
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);

    let assetsToProject = JSON.parse(JSON.stringify(appState.assets || []));
    let liabilitiesToProject = JSON.parse(JSON.stringify(appState.liabilities || []));
    
    if (!showExcluded) {
        assetsToProject = assetsToProject.filter(a => a.includeInNetWorth !== false);
        liabilitiesToProject = liabilitiesToProject.filter(l => l.includeInNetWorth !== false);
    }
    
    // Projekter gæld
    liabilitiesToProject.forEach(liability => {
        if (!liability.startDate || !liability.originalPrincipal) {
            liability.currentBalance = liability.originalPrincipal || 0;
            return; 
        }
        const startDate = new Date(liability.startDate);
        if (isNaN(startDate.getTime())) {
            liability.currentBalance = liability.originalPrincipal || 0;
            return;
        }
        startDate.setHours(0, 0, 0, 0);
        
        if (target < startDate) {
            liability.currentBalance = liability.originalPrincipal;
            return;
        }

        const monthsDiff = (target.getFullYear() - startDate.getFullYear()) * 12 + (target.getMonth() - startDate.getMonth());
        
        let balance = liability.originalPrincipal;
        for (let i = 0; i < monthsDiff; i++) {
            if (balance <= 0) break;
            const { monthlyPayment = 0, interestRate = 0 } = liability;
            const monthlyInterestRate = (interestRate / 100) / 12;
            const monthlyInterest = balance * monthlyInterestRate;
            const principalPayment = monthlyPayment - monthlyInterest;
            balance -= principalPayment;
        }
        liability.currentBalance = Math.max(0, balance);
    });

    // Projekter aktiver
    assetsToProject.forEach(asset => {
        if (!asset.startDate || !asset.startValue) {
            asset.value = asset.startValue || 0;
            return;
        }
        const startDate = new Date(asset.startDate);
        if(isNaN(startDate.getTime())) {
            asset.value = asset.startValue || 0;
            return;
        }
        startDate.setHours(0,0,0,0);

        if (target < startDate) {
            asset.value = asset.startValue;
            return;
        }
        
        const monthsDiff = (target.getFullYear() - startDate.getFullYear()) * 12 + (target.getMonth() - startDate.getMonth());
        let value = asset.startValue;

        for (let i = 0; i < monthsDiff; i++) {
            const { monthlyContribution = 0, annualGrowthRate = 0 } = asset;
            const monthlyGrowthRate = (annualGrowthRate / 100) / 12;
            value = value * (1 + monthlyGrowthRate) + monthlyContribution;
        }
        asset.value = value;
    });
    
    return { assets: assetsToProject, liabilities: liabilitiesToProject };
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

    const principalInput = form.querySelector('#liability-original-principal');
    const rateInput = form.querySelector('#liability-interest-rate');
    const termMonthsInput = form.querySelector('#liability-term-months');
    const paymentInput = form.querySelector('#liability-monthly-payment');
    const termDisplay = form.querySelector('#liability-remaining-term-display');

    const principal = parseFloat(principalInput.value) || 0;
    const annualRate = parseFloat(rateInput.value) || 0;
    let termMonths = parseInt(termMonthsInput.value, 10) || 0;
    let monthlyPayment = parseFloat(paymentInput.value) || 0;

    const changedElementId = e.target.id;
    let lastEditedLoanField = 'term';

    if (changedElementId === 'liability-term-months') {
        lastEditedLoanField = 'term';
    } else if (changedElementId === 'liability-monthly-payment') {
        lastEditedLoanField = 'payment';
    }

    if (changedElementId === 'liability-term-months') {
        const newPayment = calculateMonthlyPayment(principal, annualRate, termMonths);
        if (newPayment) paymentInput.value = newPayment.toFixed(2);
    } else if (changedElementId === 'liability-monthly-payment') {
        const newTermMonths = calculateTermMonths(principal, annualRate, monthlyPayment);
        if (newTermMonths !== null && isFinite(newTermMonths)) termMonthsInput.value = Math.round(newTermMonths);
    } else if (changedElementId === 'liability-interest-rate' || changedElementId === 'liability-original-principal') {
        if (lastEditedLoanField === 'term' && termMonths > 0) {
            const newPayment = calculateMonthlyPayment(principal, annualRate, termMonths);
            if (newPayment) paymentInput.value = newPayment.toFixed(2);
        } else if (lastEditedLoanField === 'payment' && monthlyPayment > 0) {
            const newTermMonths = calculateTermMonths(principal, annualRate, monthlyPayment);
            if (newTermMonths !== null && isFinite(newTermMonths)) termMonthsInput.value = Math.round(newTermMonths);
        }
    }
    
    const startDate = new Date(form.querySelector('#liability-start-date').value);
    const today = new Date();
    const monthsPassed = (today.getFullYear() - startDate.getFullYear()) * 12 + (today.getMonth() - startDate.getMonth());
    
    let currentBalanceForDisplay = principal;
    for (let i = 0; i < monthsPassed; i++) {
        if(currentBalanceForDisplay <= 0) break;
        const interest = currentBalanceForDisplay * ((annualRate/100)/12);
        currentBalanceForDisplay -= (parseFloat(paymentInput.value) - interest);
    }
    
    const finalTermMonths = calculateTermMonths(currentBalanceForDisplay, annualRate, parseFloat(paymentInput.value) || 0);
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
