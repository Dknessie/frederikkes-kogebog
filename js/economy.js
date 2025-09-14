// js/economy.js
// Dette modul håndterer logikken for økonomi-siden.

import { db } from './firebase.js';
import { doc, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, getDocs, writeBatch, deleteField, arrayUnion, arrayRemove, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { toDKK, parseDKK } from './utils.js';
import { showNotification, handleError } from './ui.js';


let appState; // Reference til den centrale state
let appElements; // Reference til centrale DOM-elementer

// Lokal state for økonomisiden
const economyState = {
    currentView: 'budget', // 'dashboard', 'budget', 'assets'
    currentDate: new Date(), // Til at navigere i budget-måneder
    activePersonId: 'daniel' // Standard person
};

// =================================================================
// DATAHÅNDTERING FOR BUDGET
// =================================================================

/**
 * En sikker funktion, der tjekker om standardbudgetterne findes i Firestore og opretter dem, hvis de mangler.
 * Denne funktion er "idempotent", hvilket betyder, at den er sikker at køre flere gange.
 */
async function ensureDefaultBudgets() {
    if (!appState.currentUser) return;

    const personIds = ['daniel', 'frederikke'];
    const personNames = { daniel: 'Daniel', frederikke: 'Frederikke' };
    const budgetsColRef = collection(db, 'budgets');

    for (const id of personIds) {
        // Spørg databasen direkte for at undgå race conditions med lokal state
        const q = query(budgetsColRef, where("userId", "==", appState.currentUser.uid), where("personId", "==", id));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            // Kun hvis dokumentet vitterligt ikke findes i databasen, opretter vi det.
            try {
                await addDoc(budgetsColRef, {
                    userId: appState.currentUser.uid,
                    personId: id,
                    name: personNames[id],
                    budget: { income: [], expenses: [] },
                    actuals: {}
                });
            } catch (error) {
                // Denne fejl kan opstå, hvis to browser-vinduer forsøger at oprette samtidig. Det er ok.
                console.warn(`Kunne ikke oprette budget for ${id}, det blev sandsynligvis lige oprettet.`, error);
            }
        }
    }
}

/**
 * Initialiserer economy-modulet.
 * @param {object} state - Den centrale state fra app.js.
 * @param {object} elements - De cachede DOM-elementer fra app.js.
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

    // Tilknyt event listeners til de nye modals
    const assetForm = document.getElementById('asset-form');
    if (assetForm) assetForm.addEventListener('submit', handleSaveAsset);
    const deleteAssetBtn = document.getElementById('delete-asset-btn');
    if (deleteAssetBtn) deleteAssetBtn.addEventListener('click', handleDeleteAsset);

    const liabilityForm = document.getElementById('liability-form');
    if (liabilityForm) liabilityForm.addEventListener('submit', handleSaveLiability);
    const deleteLiabilityBtn = document.getElementById('delete-liability-btn');
    if (deleteLiabilityBtn) deleteLiabilityBtn.addEventListener('click', handleDeleteLiability);
}

/**
 * Hoved-renderingsfunktion for økonomisiden.
 */
export async function renderEconomy() {
    renderSidebar();
    
    // Kør det sikre tjek for at sikre, at budget-dokumenterne eksisterer.
    await ensureDefaultBudgets();

    // Render selve indholdet, efter tjekket er kørt.
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
        renderView(); // Kun render selve view'et, ikke hele siden
        return;
    }

    const nextMonthBtn = e.target.closest('#next-month-btn');
    if (nextMonthBtn) {
        economyState.currentDate.setMonth(economyState.currentDate.getMonth() + 1);
        renderView();
        return;
    }

    if (economyState.currentView === 'assets') {
        if (e.target.closest('#add-asset-btn')) {
            openAssetModal();
        } else if (e.target.closest('#add-liability-btn')) {
            openLiabilityModal();
        } else if (e.target.closest('.asset-card')) {
            openAssetModal(e.target.closest('.asset-card').dataset.id);
        } else if (e.target.closest('.liability-card')) {
            openLiabilityModal(e.target.closest('.liability-card').dataset.id);
        }
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
    const assets = appState.assets || [];
    const liabilities = appState.liabilities || [];

    const totalAssets = assets.reduce((sum, asset) => sum + asset.value, 0);
    const totalLiabilities = liabilities.reduce((sum, liability) => sum + liability.currentBalance, 0);
    const netWorth = totalAssets - totalLiabilities;

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
                ${Object.keys(assetsByType).map(type => `
                    <h5>${type}</h5>
                    ${assetsByType[type].map(asset => createAssetCard(asset, liabilities)).join('')}
                `).join('')}
            </div>
            <div class="liability-column">
                <div class="column-header">
                    <h4>Gæld</h4>
                    <button id="add-liability-btn" class="btn btn-secondary btn-small"><i class="fas fa-plus"></i> Tilføj Gæld</button>
                </div>
                ${Object.keys(liabilitiesByType).map(type => `
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
     const nextYearBalance = calculateProjectedValues(new Date(new Date().setFullYear(new Date().getFullYear() + 1))).liabilities.find(l => l.id === liability.id)?.currentBalance || liability.currentBalance;

    return `
        <div class="liability-card" data-id="${liability.id}">
            <div class="liability-card-header">
                <span class="liability-name">${liability.name}</span>
                <span class="liability-balance">${toDKK(liability.currentBalance)} kr.</span>
            </div>
            <div class="liability-card-footer">
                <span>Rente: ${liability.interestRate || 'N/A'}%</span>
                <span>Om 1 år: ~${toDKK(nextYearBalance)} kr.</span>
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
    modal.querySelector('h3').textContent = isEditing ? 'Rediger Gæld' : 'Ny Gæld';
    document.getElementById('delete-liability-btn').classList.toggle('hidden', !isEditing);

    if (isEditing) {
        document.getElementById('liability-name').value = liability.name;
        document.getElementById('liability-current-balance').value = liability.currentBalance;
        document.getElementById('liability-monthly-payment').value = liability.monthlyPayment || '';
        document.getElementById('liability-interest-rate').value = liability.interestRate || '';
    }
    
    populateReferenceDropdown(document.getElementById('liability-type'), appState.references.liabilityTypes, 'Vælg type...', liability?.type);
    modal.classList.remove('hidden');
}
async function handleSaveLiability(e) {
    e.preventDefault();
    const liabilityId = document.getElementById('liability-id').value;
    
    const liabilityData = {
        name: document.getElementById('liability-name').value.trim(),
        type: document.getElementById('liability-type').value,
        currentBalance: parseFloat(document.getElementById('liability-current-balance').value),
        monthlyPayment: parseFloat(document.getElementById('liability-monthly-payment').value) || null,
        interestRate: parseFloat(document.getElementById('liability-interest-rate').value) || null,
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
    (appState.liabilities || []).forEach(l => selectElement.add(new Option(l.name, l.id)));
    
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
    today.setHours(0,0,0,0);
    const target = new Date(targetDate);
    target.setHours(0,0,0,0);

    let projectedLiabilities = JSON.parse(JSON.stringify(appState.liabilities || []));
    let projectedAssets = JSON.parse(JSON.stringify(appState.assets || []));

    if (target > today) {
        let currentDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        
        while (currentDate <= target) {
            projectedLiabilities.forEach(liability => {
                if (liability.currentBalance > 0 && liability.monthlyPayment && liability.interestRate) {
                    const monthlyInterest = (liability.currentBalance * (liability.interestRate / 100)) / 12;
                    let principalPayment = liability.monthlyPayment - monthlyInterest;
                    if (liability.currentBalance < principalPayment) {
                        principalPayment = liability.currentBalance;
                    }
                    liability.currentBalance -= principalPayment;
                    liability.currentBalance = Math.max(0, liability.currentBalance);
                }
            });
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
    }
    const totalAssets = projectedAssets.reduce((sum, asset) => sum + asset.value, 0);
    const totalProjectedLiabilities = projectedLiabilities.reduce((sum, l) => sum + l.currentBalance, 0);
    const netWorth = totalAssets - totalProjectedLiabilities;

    return { assets: projectedAssets, liabilities: projectedLiabilities, netWorth };
}

// =================================================================
// BUDGET LOGIK
// =================================================================

/**
 * Bygger budget-arket dynamisk.
 * @param {HTMLElement} container - Elementet som budgettet skal renderes ind i.
 */
function renderBudgetView(container) {
    // Viser en loading-spinner, hvis budget-data stadig hentes
    if (!appState.budgets || appState.budgets.length < 2) {
        container.innerHTML = `<div class="loading-spinner"></div><p>Initialiserer budget...</p>`;
        return;
    }
    
    const activePersonBudget = appState.budgets.find(b => b.personId === economyState.activePersonId);

    if (!activePersonBudget) {
        // Hvis den aktive person af en eller anden grund ikke findes, vælg den første som fallback
        economyState.activePersonId = appState.budgets[0]?.personId || 'daniel';
        renderBudgetView(container); // Prøv at rendere igen
        return;
    }

    const monthHeaders = getMonthHeaders(economyState.currentDate);
    const monthDisplay = economyState.currentDate.toLocaleString('da-DK', { month: 'long', year: 'numeric' });
    
    const tableHeader = renderTableHeader(monthHeaders);
    const incomeRows = (activePersonBudget.budget.income || []).map(item => renderRow(item, monthHeaders, activePersonBudget.actuals)).join('');
    const expenseRows = (activePersonBudget.budget.expenses || []).map(item => renderRow(item, monthHeaders, activePersonBudget.actuals, true)).join('');
    const totals = calculateTotals(activePersonBudget, monthHeaders);
    const tableFooter = renderFooter(totals);
    const personTabs = renderPersonTabs();

    container.innerHTML = `
        <div class="spreadsheet-card">
            <div class="spreadsheet-header">
                <div class="person-tabs">
                    ${personTabs}
                </div>
                <div class="economy-month-navigator">
                    <button id="prev-month-btn" class="btn-icon"><i class="fas fa-chevron-left"></i></button>
                    <h4 id="current-month-display">${monthDisplay}</h4>
                    <button id="next-month-btn" class="btn-icon"><i class="fas fa-chevron-right"></i></button>
                </div>
                <div>
                    <button id="add-income-row" class="btn btn-secondary"><i class="fas fa-plus"></i> Tilføj Indkomst</button>
                    <button id="add-expense-row" class="btn btn-primary"><i class="fas fa-plus"></i> Tilføj Udgift</button>
                </div>
            </div>
            <div class="table-wrapper">
                <table class="spreadsheet-table">
                    ${tableHeader}
                    <tbody>
                        <tr class="category-row"><td colspan="15">Indkomst</td></tr>
                        ${incomeRows}
                        <tr class="category-row"><td colspan="15">Udgifter</td></tr>
                        ${expenseRows}
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
    return sortedPersons.map(p => `
        <button class="person-tab ${economyState.activePersonId === p.personId ? 'active' : ''}" data-person-id="${p.personId}">
            ${p.name}
        </button>
    `).join('');
}
function renderTableHeader(monthHeaders) {
    return `
        <thead>
            <tr>
                <th>Post</th>
                <th class="currency">Budgetteret</th>
                ${monthHeaders.map(h => `<th class="currency">${h.label}</th>`).join('')}
                <th class="currency">Difference (År)</th>
            </tr>
        </thead>`;
}
function renderRow(item, monthHeaders, allActuals, isExpense = false) {
    const yearlyBudget = item.allocated * 12;
    let actualTotal = 0;

    const actualsByMonth = monthHeaders.map(h => {
        const actual = allActuals[item.id]?.[h.key] || 0;
        actualTotal += actual;
        
        let colorClass = '';
        if (actual !== 0) {
            if (isExpense) {
                colorClass = actual > item.allocated ? 'negative-text' : 'positive-text';
            } else {
                colorClass = actual < item.allocated ? 'negative-text' : 'positive-text';
            }
        }

        return `<td class="currency editable ${colorClass}" contenteditable="true" data-id="${item.id}" data-month-key="${h.key}">${toDKK(actual)}</td>`;
    }).join('');

    const difference = isExpense ? (yearlyBudget - actualTotal) : (actualTotal - yearlyBudget);
    
    return `
        <tr>
            <td class="editable" contenteditable="true" data-id="${item.id}" data-field="name">
                ${item.name}
                <button class="delete-row" data-id="${item.id}" data-type="${isExpense ? 'expenses' : 'income'}">&times;</button>
            </td>
            <td class="currency editable" contenteditable="true" data-id="${item.id}" data-field="allocated">${toDKK(item.allocated)}</td>
            ${actualsByMonth}
            <td class="currency ${difference >= 0 ? 'positive-bg' : 'negative-bg'}">${toDKK(difference)}</td>
        </tr>`;
}
function renderFooter(totals) {
    const result = {
        budget: totals.income.budget - totals.expenses.budget,
        actuals: totals.income.actuals.map((inc, i) => inc - totals.expenses.actuals[i]),
        diff: totals.income.diff + totals.expenses.diff
    };
    
    return `
        <tr>
            <td>Total Indkomst</td>
            <td class="currency">${toDKK(totals.income.budget)}</td>
            ${totals.income.actuals.map(t => `<td class="currency">${toDKK(t)}</td>`).join('')}
            <td class="currency ${totals.income.diff >= 0 ? 'positive-bg' : 'negative-bg'}">${toDKK(totals.income.diff)}</td>
        </tr>
        <tr>
            <td>Total Udgifter</td>
            <td class="currency">${toDKK(totals.expenses.budget)}</td>
            ${totals.expenses.actuals.map(t => `<td class="currency">${toDKK(t)}</td>`).join('')}
            <td class="currency ${totals.expenses.diff >= 0 ? 'positive-bg' : 'negative-bg'}">${toDKK(totals.expenses.diff)}</td>
        </tr>
        <tr>
            <td>Resultat</td>
            <td class="currency">${toDKK(result.budget)}</td>
            ${result.actuals.map(t => `<td class="currency ${t >= 0 ? 'positive-bg' : 'negative-bg'}">${toDKK(t)}</td>`).join('')}
            <td class="currency ${result.diff >= 0 ? 'positive-bg' : 'negative-bg'}">${toDKK(result.diff)}</td>
        </tr>
    `;
}

// --- LOGIK & BEREGNINGER ---

function getMonthHeaders(startDate) {
    const headers = [];
    let date = new Date(startDate);
    date.setDate(1);
    
    // RETTELSE: Start 11 måneder FØR den valgte dato for at vise de seneste 12 måneder
    date.setMonth(date.getMonth() - 11);

    for (let i = 0; i < 12; i++) {
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        const label = date.toLocaleString('da-DK', { month: 'short', year: '2-digit' });
        headers.push({ key: monthKey, label });
        date.setMonth(date.getMonth() + 1);
    }
    return headers;
}
function calculateTotals(person, monthHeaders) {
    const income = { budget: 0, actuals: Array(12).fill(0), diff: 0 };
    const expenses = { budget: 0, actuals: Array(12).fill(0), diff: 0 };

    (person.budget.income || []).forEach(item => {
        income.budget += item.allocated;
        let totalActual = 0;
        monthHeaders.forEach((h, i) => {
            const actual = person.actuals[item.id]?.[h.key] || 0;
            income.actuals[i] += actual;
            totalActual += actual;
        });
        income.diff += totalActual - (item.allocated * 12);
    });

    (person.budget.expenses || []).forEach(item => {
        expenses.budget += item.allocated;
        let totalActual = 0;
        monthHeaders.forEach((h, i) => {
            const actual = person.actuals[item.id]?.[h.key] || 0;
            expenses.actuals[i] += actual;
            totalActual += actual;
        });
        expenses.diff += (item.allocated * 12) - totalActual;
    });
    
    return { income, expenses };
}

// --- EVENT HANDLERS ---
async function handleContainerClick(e) {
    const activePersonBudget = appState.budgets.find(b => b.personId === economyState.activePersonId);
    if (!activePersonBudget) return;

    // Skift person-faneblad
    if (e.target.closest('.person-tab')) {
        const newActiveId = e.target.closest('.person-tab').dataset.personId;
        if (newActiveId !== economyState.activePersonId) {
            economyState.activePersonId = newActiveId;
            renderView();
        }
    }
    // Tilføj række
    else if (e.target.closest('#add-expense-row') || e.target.closest('#add-income-row')) {
        const isExpense = !!e.target.closest('#add-expense-row');
        const type = isExpense ? 'expenses' : 'income';
        const prefix = isExpense ? 'b' : 'i';
        const newId = prefix + Date.now();
        
        const newItem = { id: newId, name: 'Ny post', allocated: 0 };

        try {
            const budgetRef = doc(db, 'budgets', activePersonBudget.id);
            // Brug arrayUnion til at tilføje det nye element atomisk
            await updateDoc(budgetRef, {
                [`budget.${type}`]: arrayUnion(newItem)
            });
            // onSnapshot vil automatisk opdatere UI
        } catch (error) {
            handleError(error, "Kunne ikke tilføje den nye post.", "addRowToBudget");
        }
    }
    // Slet række
    else if (e.target.closest('.delete-row')) {
        const button = e.target.closest('.delete-row');
        const id = button.dataset.id;
        const type = button.dataset.type;
        
        // Find det specifikke element, der skal fjernes
        const itemToRemove = (activePersonBudget.budget[type] || []).find(item => item.id === id);
        
        if (itemToRemove) {
            const batch = writeBatch(db);
            const budgetRef = doc(db, 'budgets', activePersonBudget.id);
            
            // Brug arrayRemove til at fjerne elementet fra array'et
            batch.update(budgetRef, {
                [`budget.${type}`]: arrayRemove(itemToRemove)
            });
            // Slet også de faktiske data for den slettede post
            batch.update(budgetRef, {
                [`actuals.${id}`]: deleteField()
            });
            
            await batch.commit();
            // onSnapshot vil håndtere UI-opdateringen
        }
    }
}

async function handleCellBlur(e) {
    if (!e.target.classList.contains('editable')) return;
    
    const cell = e.target;
    const id = cell.dataset.id;
    const monthKey = cell.dataset.monthKey;
    const field = cell.dataset.field;
    const newValueRaw = cell.textContent;
    
    const activePersonBudget = appState.budgets.find(b => b.personId === economyState.activePersonId);
    if (!activePersonBudget) return;
    
    const budgetRef = doc(db, 'budgets', activePersonBudget.id);

    try {
        await runTransaction(db, async (transaction) => {
            const budgetDoc = await transaction.get(budgetRef);
            if (!budgetDoc.exists()) {
                throw new Error("Budget document not found!");
            }

            const budgetData = budgetDoc.data();
            
            // Håndter opdatering af budgetterede felter (name, allocated)
            if (field) {
                const isExpense = (budgetData.budget.expenses || []).some(i => i.id === id);
                const type = isExpense ? 'expenses' : 'income';
                const itemsArray = budgetData.budget[type] || [];
                const itemIndex = itemsArray.findIndex(i => i.id === id);

                if (itemIndex > -1) {
                    if (field === 'name') {
                        itemsArray[itemIndex].name = newValueRaw;
                    } else if (field === 'allocated') {
                        const numericValue = parseDKK(newValueRaw);
                        itemsArray[itemIndex].allocated = numericValue;
                        cell.textContent = toDKK(numericValue); // Opdater UI med formateret værdi
                    }
                    transaction.update(budgetRef, { [`budget.${type}`]: itemsArray });
                }
            } 
            // Håndter opdatering af faktiske månedlige værdier
            else if (monthKey) {
                const numericValue = parseDKK(newValueRaw);
                const fieldPath = `actuals.${id}.${monthKey}`;
                
                // Brug set med merge:true for at oprette nøgle-stier, der ikke eksisterer
                transaction.set(budgetRef, { 
                    actuals: { 
                        [id]: { 
                            [monthKey]: numericValue 
                        } 
                    } 
                }, { merge: true });
                cell.textContent = toDKK(numericValue); // Opdater UI med formateret værdi
            }
        });
    } catch (error) {
        handleError(error, "Ændringen kunne ikke gemmes.", "handleCellBlurTransaction");
        // Gendan UI til den gamle værdi, hvis transaktionen fejler
        renderView();
    }
}

