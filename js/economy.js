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
    currentView: 'budget', // 'dashboard', 'budget', 'assets'
    currentDate: new Date(), // Til at navigere i budget-måneder
    projectionDate: new Date(), // NYT: Til fremskrivning på Aktiver/Gæld
    activePersonId: 'faelles', // Standard person, nu Fælles
    lastEditedLoanField: 'term' // 'term' or 'payment', to handle interest changes intelligently
};

const defaultExpenseCategories = {
    bolig: { budgetName: "Bolig", budgetedAmount: 0, subItems: [] },
    transport: { budgetName: "Transport", budgetedAmount: 0, subItems: [] },
    personlig: { budgetName: "Personlig", budgetedAmount: 0, subItems: [] },
    diverse: { budgetName: "Diverse", budgetedAmount: 0, subItems: [] },
    opsparing: { budgetName: "Opsparing & Investering", budgetedAmount: 0, subItems: [] }
};


// =================================================================
// DATAHÅNDTERING FOR BUDGET
// =================================================================

/**
 * En sikker funktion, der tjekker om standardbudgetterne findes i Firestore og opretter/opdaterer dem, hvis de mangler.
 */
async function ensureDefaultBudgets() {
    if (!appState.currentUser) return;

    const budgetsColRef = collection(db, 'budgets');
    const q = query(budgetsColRef, where("userId", "==", appState.currentUser.uid));
    const snapshot = await getDocs(q);

    const personData = {
        daniel: 'Daniel',
        frederikke: 'Frederikke'
    };
    
    const existingBudgets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const existingPersonIds = new Set(existingBudgets.map(b => b.personId));
    
    const batch = writeBatch(db);
    let needsUpdate = false;

    // Opret manglende budget-dokumenter
    for (const id in personData) {
        if (!existingPersonIds.has(id)) {
            const newDocRef = doc(budgetsColRef);
            batch.set(newDocRef, {
                userId: appState.currentUser.uid,
                personId: id,
                name: personData[id],
                budget: { 
                    income: [], 
                    expenses: defaultExpenseCategories 
                },
                actuals: {}
            });
            needsUpdate = true;
        }
    }

    // Tjek eksisterende budgetter for den nye struktur
    for (const budget of existingBudgets) {
        if (Array.isArray(budget.budget.expenses)) { // Gammel struktur fundet
            const upgradedExpenses = { ...defaultExpenseCategories };
            upgradedExpenses.diverse.subItems = budget.budget.expenses; // Flyt gamle poster til Diverse
            
            const docRef = doc(db, 'budgets', budget.id);
            batch.update(docRef, { "budget.expenses": upgradedExpenses });
            needsUpdate = true;
        }
    }

    if (needsUpdate) {
        try {
            await batch.commit();
            console.log("Budget-dokumenter blev oprettet/opdateret.");
        } catch (error) {
            handleError(error, "Kunne ikke initialisere budgetter.", "ensureDefaultBudgets");
        }
    }
}


/**
 * Initialiserer economy-modulet.
 */
export function initEconomy(state, elements) {
    appState = state;
    appElements = elements;

    economyState.currentDate.setDate(1);

    const pageContainer = document.getElementById('oekonomi');
    if (pageContainer) {
        pageContainer.addEventListener('click', handlePageClick);
        pageContainer.addEventListener('blur', handleCellBlur, true);
    }

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

/**
 * Hoved-renderingsfunktion for økonomisiden.
 */
export async function renderEconomy() {
    renderSidebar();
    await ensureDefaultBudgets();
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

    // NYT: Håndtering af måneds-navigator for Aktiver/Gæld
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


    if (economyState.currentView === 'assets') {
        if (e.target.closest('#add-asset-btn')) openAssetModal();
        else if (e.target.closest('#add-liability-btn')) openLiabilityModal();
        else if (e.target.closest('.asset-card')) openAssetModal(e.target.closest('.asset-card').dataset.id);
        else if (e.target.closest('.liability-card')) openLiabilityModal(e.target.closest('.liability-card').dataset.id);
    }

    handleContainerClick(e);
}

function renderSidebar() {
    const navContainer = document.getElementById('economy-nav-list');
    if (!navContainer) return;

    const views = [
        { key: 'dashboard', name: 'Dashboard', icon: 'fa-tachometer-alt' },
        { key: 'budget', name: 'Budget', icon: 'fa-file-invoice-dollar' },
        { key: 'assets', name: 'Aktiver / Gæld', icon: 'fa-balance-scale' }
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
        case 'dashboard':
            contentArea.innerHTML = `<h3>Økonomi Dashboard</h3><p class="empty-state">Dette dashboard er under udvikling.</p>`;
            break;
        case 'budget':
            renderBudgetView(contentArea);
            break;
        case 'assets':
            renderAssetsView(contentArea);
            break;
        default:
            contentArea.innerHTML = `<p>Vælg en visning fra menuen.</p>`;
    }
}

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
        // KORREKTION: Brug den valgte 'projectionDate' som udgangspunkt for beregningen.
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

            // KORREKTION: Tjek om aktivet er linket til gæld for at undgå dobbelt tælling
            const isDepreciatingAssetWithLoan = asset.linkedLiabilityIds && asset.linkedLiabilityIds.length > 0;

            if (direction === 1) { // Frem i tiden
                const contribution = isDepreciatingAssetWithLoan ? 0 : monthlyContribution;
                asset.value = asset.value * (1 + monthlyGrowthRate) + contribution;
            } else { // Tilbage i tiden
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
// BUDGET LOGIK
// =================================================================

function renderBudgetView(container) {
    if (!appState.budgets || appState.budgets.length === 0) {
        container.innerHTML = `<div class="loading-spinner"></div><p>Initialiserer budget...</p>`;
        return;
    }
    
    const isJointView = economyState.activePersonId === 'faelles';
    const budgetData = isJointView 
        ? generateJointBudget() 
        : appState.budgets.find(b => b.personId === economyState.activePersonId);

    if (!budgetData) {
        economyState.activePersonId = 'faelles';
        renderBudgetView(container);
        return;
    }

    const monthHeaders = getMonthHeaders(economyState.currentDate);
    const monthDisplay = economyState.currentDate.toLocaleString('da-DK', { month: 'long', year: 'numeric' });
    
    const personTabs = renderPersonTabs();
    const tableHeader = renderTableHeader(monthHeaders);
    const incomeRows = (budgetData.budget.income || []).map(item => renderSubItemRow('income', item, monthHeaders, budgetData.actuals, false, isJointView)).join('');
    
    const expenseCategoriesHTML = Object.keys(defaultExpenseCategories).map(catKey => {
        const categoryData = budgetData.budget.expenses[catKey] || defaultExpenseCategories[catKey];
        return renderExpenseCategory(catKey, categoryData, monthHeaders, budgetData.actuals, isJointView);
    }).join('');

    const tableFooter = renderFooter(budgetData, monthHeaders);

    container.innerHTML = `
        <div class="spreadsheet-card">
            <div class="spreadsheet-header">
                <div class="person-tabs">${personTabs}</div>
                <div class="economy-month-navigator">
                    <button id="prev-month-btn" class="btn-icon"><i class="fas fa-chevron-left"></i></button>
                    <h4 id="current-month-display">${monthDisplay}</h4>
                    <button id="next-month-btn" class="btn-icon"><i class="fas fa-chevron-right"></i></button>
                </div>
                <div>
                    <button id="add-income-row" class="btn btn-secondary" ${isJointView ? 'style="display:none;"' : ''}>
                        <i class="fas fa-plus"></i> Tilføj Indkomst
                    </button>
                </div>
            </div>
            <div class="table-wrapper">
                <table class="spreadsheet-table">
                    ${tableHeader}
                    <tbody>
                        <tr class="main-category-row"><td colspan="14">Indkomst</td></tr>
                        ${incomeRows}
                    </tbody>
                    <tbody id="expense-categories-body">
                        ${expenseCategoriesHTML}
                    </tbody>
                    <tfoot>
                        ${tableFooter}
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

// --- RENDERING HJÆLPEFUNKTIONER ---

function renderPersonTabs() {
    const sortedPersons = [...appState.budgets].sort((a, b) => a.name.localeCompare(b.name));
    const personTabsHTML = sortedPersons.map(p => `
        <button class="person-tab ${economyState.activePersonId === p.personId ? 'active' : ''}" data-person-id="${p.personId}">
            ${p.name}
        </button>
    `).join('');
    
    const jointTabHTML = `
        <button class="person-tab ${economyState.activePersonId === 'faelles' ? 'active' : ''}" data-person-id="faelles">
            Fælles
        </button>
    `;

    return jointTabHTML + personTabsHTML;
}
function renderTableHeader(monthHeaders) {
    return `
        <thead>
            <tr>
                <th>Post</th>
                <th class="currency">Budgetteret</th>
                ${monthHeaders.map(h => `<th class="currency">${h.label}</th>`).join('')}
            </tr>
        </thead>`;
}

function renderSubItemRow(catKey, item, monthHeaders, allActuals, isExpense, isReadOnly = false) {
    const actualsByMonth = monthHeaders.map(h => {
        const actual = allActuals[item.id]?.[h.key] || 0;
        let colorClass = '';
        if (actual !== 0 && item.allocated > 0) {
            colorClass = isExpense
                ? (actual > item.allocated ? 'negative-text' : 'positive-text')
                : (actual < item.allocated ? 'negative-text' : 'positive-text');
        }
        return `
            <td class="currency ${!isReadOnly ? 'editable' : ''} ${colorClass}" data-id="${item.id}" data-month-key="${h.key}" data-category-key="${catKey}">
                <span ${!isReadOnly ? 'contenteditable="true"' : ''}>${toDKK(actual)}</span>
                ${!isReadOnly ? '<button class="autofill-btn" title="Indsæt budgetteret beløb">⮫</button>' : ''}
            </td>`;
    }).join('');

    return `
        <tr class="sub-item-row">
            <td class="name-cell ${!isReadOnly ? 'editable' : ''} ${isExpense ? 'indented' : ''}" data-id="${item.id}" data-field="name" data-category-key="${catKey}">
                <span ${!isReadOnly ? 'contenteditable="true"' : ''}>${item.name}</span>
                ${!isReadOnly ? `<button class="delete-row" data-id="${item.id}" data-type="${isExpense ? 'expenses' : 'income'}" data-category-key="${catKey}">&times;</button>` : ''}
            </td>
            <td class="currency ${!isReadOnly ? 'editable' : ''}" data-id="${item.id}" data-field="allocated" data-category-key="${catKey}">
                <span ${!isReadOnly ? 'contenteditable="true"' : ''}>${toDKK(item.allocated)}</span>
            </td>
            ${actualsByMonth}
        </tr>`;
}

function renderExpenseCategory(catKey, categoryData, monthHeaders, allActuals, isReadOnly = false) {
    const subItemsHTML = (categoryData.subItems || []).map(item => renderSubItemRow(catKey, item, monthHeaders, allActuals, true, isReadOnly)).join('');
    
    const monthlyCells = monthHeaders.map(h => {
        const monthlyActualTotal = (categoryData.subItems || []).reduce((sum, item) => sum + (allActuals[item.id]?.[h.key] || 0), 0);
        const budgetedAmountForSubItems = (categoryData.subItems || []).reduce((sum, item) => sum + item.allocated, 0);
        const difference = budgetedAmountForSubItems - monthlyActualTotal;
        const colorClass = difference < 0 ? 'negative-text' : 'positive-text';
        return `<td class="currency ${colorClass}">${toDKK(difference)}</td>`;
    }).join('');
    
    const totalAllocatedForSubItems = (categoryData.subItems || []).reduce((sum, item) => sum + item.allocated, 0);

    return `
        <tr class="main-category-row" data-category-key="${catKey}">
            <td class="name-cell">
                <span>${categoryData.budgetName}</span>
                ${!isReadOnly ? `<button class="add-sub-item-btn" title="Tilføj post til ${categoryData.budgetName}">+</button>` : ''}
            </td>
            <td class="currency ${!isReadOnly ? 'editable' : ''}" data-category-key="${catKey}" data-field="budgetedAmount">
                <span ${!isReadOnly ? 'contenteditable="true"' : ''}>${toDKK(categoryData.budgetedAmount)}</span>
            </td>
            ${monthlyCells}
        </tr>
        ${subItemsHTML}
        <tr class="subtotal-row">
            <td>Subtotal for ${categoryData.budgetName}</td>
            <td class="currency">${toDKK(totalAllocatedForSubItems)}</td>
             ${monthHeaders.map(h => {
                const monthlyActualTotal = (categoryData.subItems || []).reduce((sum, item) => sum + (allActuals[item.id]?.[h.key] || 0), 0);
                return `<td class="currency">${toDKK(monthlyActualTotal)}</td>`
             }).join('')}
        </tr>
    `;
}

function renderFooter(person, monthHeaders) {
    const totalBudgetIncome = (person.budget.income || []).reduce((sum, item) => sum + item.allocated, 0);
    const totalBudgetExpenses = Object.values(person.budget.expenses || {}).reduce((sum, cat) => sum + cat.budgetedAmount, 0);
    const netBudgetResult = totalBudgetIncome - totalBudgetExpenses;
    
    const monthlyResultCells = monthHeaders.map(h => {
        const monthlyIncome = (person.budget.income || []).reduce((sum, item) => sum + (person.actuals[item.id]?.[h.key] || 0), 0);
        
        let monthlyExpenses = 0;
        Object.values(person.budget.expenses || {}).forEach(cat => {
            monthlyExpenses += (cat.subItems || []).reduce((sum, item) => sum + (person.actuals[item.id]?.[h.key] || 0), 0);
        });

        const netMonthlyResult = monthlyIncome - monthlyExpenses;
        const resultClass = netMonthlyResult < 0 ? 'negative-text' : 'positive-text';
        return `<td class="currency ${resultClass}">${toDKK(netMonthlyResult)}</td>`;
    }).join('');

    return `
        <tr class="total-summary-row available-row">
            <td>Resultat (Over/Under)</td>
            <td class="currency ${netBudgetResult >= 0 ? 'positive-text' : 'negative-text'}">${toDKK(netBudgetResult)}</td>
            ${monthlyResultCells}
        </tr>
    `;
}


// --- LOGIK & BEREGNINGER ---

function getMonthHeaders(startDate) {
    const headers = [];
    let date = new Date(startDate);
    date.setDate(1);
    
    date.setMonth(date.getMonth() - 11);

    for (let i = 0; i < 12; i++) {
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        const label = date.toLocaleString('da-DK', { month: 'short' }); // Fjernet år for et renere look
        headers.push({ key: monthKey, label });
        date.setMonth(date.getMonth() + 1);
    }
    return headers;
}

function generateJointBudget() {
    const jointBudget = {
        personId: 'faelles',
        name: 'Fælles',
        budget: {
            income: [],
            expenses: JSON.parse(JSON.stringify(defaultExpenseCategories))
        },
        actuals: {}
    };

    const incomeMap = new Map();
    const expenseSubItemMap = new Map();

    for (const personBudget of appState.budgets) {
        (personBudget.budget.income || []).forEach(item => {
            const key = item.name.toLowerCase();
            if (!incomeMap.has(key)) {
                incomeMap.set(key, { ...item, id: 'j_inc_' + key.replace(/\s+/g, ''), allocated: 0 });
            }
            const jointItem = incomeMap.get(key);
            jointItem.allocated += item.allocated;

            const personActuals = personBudget.actuals[item.id] || {};
            for (const monthKey in personActuals) {
                if (!jointBudget.actuals[jointItem.id]) jointBudget.actuals[jointItem.id] = {};
                jointBudget.actuals[jointItem.id][monthKey] = (jointBudget.actuals[jointItem.id][monthKey] || 0) + personActuals[monthKey];
            }
        });

        for (const catKey in personBudget.budget.expenses) {
            const personCategory = personBudget.budget.expenses[catKey];
            const jointCategory = jointBudget.budget.expenses[catKey];
            jointCategory.budgetedAmount += personCategory.budgetedAmount;

            (personCategory.subItems || []).forEach(subItem => {
                const key = `${catKey}||${subItem.name.toLowerCase()}`;
                if (!expenseSubItemMap.has(key)) {
                    expenseSubItemMap.set(key, { ...subItem, id: 'j_exp_' + key.replace(/\s+/g, ''), allocated: 0 });
                }
                const jointSubItem = expenseSubItemMap.get(key);
                jointSubItem.allocated += subItem.allocated;

                const personActuals = personBudget.actuals[subItem.id] || {};
                for (const monthKey in personActuals) {
                    if (!jointBudget.actuals[jointSubItem.id]) jointBudget.actuals[jointSubItem.id] = {};
                    jointBudget.actuals[jointSubItem.id][monthKey] = (jointBudget.actuals[jointSubItem.id][monthKey] || 0) + personActuals[monthKey];
                }
            });
        }
    }

    jointBudget.budget.income = Array.from(incomeMap.values()).sort((a,b) => a.name.localeCompare(b.name));
    
    expenseSubItemMap.forEach((jointSubItem, key) => {
        const [catKey, ] = key.split('||');
        jointBudget.budget.expenses[catKey].subItems.push(jointSubItem);
    });

    // Sorter sub-items i hver kategori
    for (const catKey in jointBudget.budget.expenses) {
        jointBudget.budget.expenses[catKey].subItems.sort((a,b) => a.name.localeCompare(b.name));
    }

    return jointBudget;
}


// --- EVENT HANDLERS ---
async function handleContainerClick(e) {
    // KORREKTION: Håndter fanebladsskift først, uanset hvilken fane der er aktiv.
    if (e.target.closest('.person-tab')) {
        const newActiveId = e.target.closest('.person-tab').dataset.personId;
        if (newActiveId !== economyState.activePersonId) {
            economyState.activePersonId = newActiveId;
            renderView();
        }
        return; // Afslut altid efter fanebladsskift
    }

    // Stop yderligere handlinger hvis vi er i "Fælles" visning
    if (economyState.activePersonId === 'faelles') {
        return;
    }

    const activePersonBudget = appState.budgets.find(b => b.personId === economyState.activePersonId);
    if (!activePersonBudget) return;

    if (e.target.closest('#add-income-row')) {
        const newId = 'i' + Date.now();
        const newItem = { id: newId, name: 'Ny indkomst', allocated: 0 };
        const budgetRef = doc(db, 'budgets', activePersonBudget.id);
        await updateDoc(budgetRef, { "budget.income": arrayUnion(newItem) });
    }
    else if (e.target.closest('.add-sub-item-btn')) {
        const catKey = e.target.closest('.main-category-row').dataset.categoryKey;
        const newId = 'b' + Date.now();
        const newItem = { id: newId, name: 'Ny post', allocated: 0 };
        const budgetRef = doc(db, 'budgets', activePersonBudget.id);
        await updateDoc(budgetRef, { [`budget.expenses.${catKey}.subItems`]: arrayUnion(newItem) });
    }
    else if (e.target.closest('.delete-row')) {
        const button = e.target.closest('.delete-row');
        const id = button.dataset.id;
        const type = button.dataset.type;
        const catKey = button.dataset.categoryKey;

        const budgetRef = doc(db, 'budgets', activePersonBudget.id);
        
        if (type === 'income') {
            const itemToRemove = (activePersonBudget.budget.income || []).find(item => item.id === id);
            if(itemToRemove) await updateDoc(budgetRef, { "budget.income": arrayRemove(itemToRemove) });
        } else if (type === 'expenses' && catKey) {
            const itemToRemove = (activePersonBudget.budget.expenses[catKey].subItems || []).find(item => item.id === id);
            if(itemToRemove) await updateDoc(budgetRef, { [`budget.expenses.${catKey}.subItems`]: arrayRemove(itemToRemove) });
        }
    }
    else if (e.target.closest('.autofill-btn')) {
        const button = e.target.closest('.autofill-btn');
        const cell = button.closest('td');
        const row = cell.closest('tr');
        const budgetCell = row.querySelector('td[data-field="allocated"] span');
        
        if (cell && row && budgetCell) {
            const budgetValue = budgetCell.textContent;
            const editableSpan = cell.querySelector('span[contenteditable="true"]');
            if (editableSpan) {
                editableSpan.textContent = budgetValue;
                editableSpan.focus();
                setTimeout(() => editableSpan.blur(), 0); 
            }
        }
    }
}

async function handleCellBlur(e) {
    if (economyState.activePersonId === 'faelles') return;
    
    const editableSpan = e.target;
    if (editableSpan.tagName !== 'SPAN' || !editableSpan.isContentEditable) return;
    
    const cell = editableSpan.closest('td');
    const newValueRaw = editableSpan.textContent;
    const activePersonBudget = appState.budgets.find(b => b.personId === economyState.activePersonId);
    if (!activePersonBudget) return;
    
    const budgetRef = doc(db, 'budgets', activePersonBudget.id);
    const catKey = cell.dataset.categoryKey;
    const id = cell.dataset.id;
    const field = cell.dataset.field;

    try {
        await runTransaction(db, async (transaction) => {
            const budgetDoc = await transaction.get(budgetRef);
            if (!budgetDoc.exists()) throw "Budget document not found!";
            const budgetData = budgetDoc.data();

            if (field === 'budgetedAmount') {
                const numericValue = parseDKK(newValueRaw);
                budgetData.budget.expenses[catKey].budgetedAmount = numericValue;
                editableSpan.textContent = toDKK(numericValue);
            } else if (id && field) {
                let itemsArray;
                if ((budgetData.budget.income || []).some(i => i.id === id)) {
                    itemsArray = budgetData.budget.income;
                } else {
                    itemsArray = budgetData.budget.expenses[catKey].subItems;
                }
                const itemIndex = itemsArray.findIndex(i => i.id === id);

                if (itemIndex > -1) {
                    if (field === 'name') {
                        itemsArray[itemIndex].name = newValueRaw;
                    } else if (field === 'allocated') {
                        const numericValue = parseDKK(newValueRaw);
                        itemsArray[itemIndex].allocated = numericValue;
                        editableSpan.textContent = toDKK(numericValue);
                    }
                }
            } else {
                const monthKey = cell.dataset.monthKey;
                const numericValue = parseDKK(newValueRaw);
                if (!budgetData.actuals[id]) budgetData.actuals[id] = {};
                budgetData.actuals[id][monthKey] = numericValue;
                editableSpan.textContent = toDKK(numericValue);
            }
            transaction.update(budgetRef, { budget: budgetData.budget, actuals: budgetData.actuals });
        });
    } catch (error) {
        handleError(error, "Ændringen kunne ikke gemmes.", "handleCellBlurTransaction");
        renderView();
    }
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
