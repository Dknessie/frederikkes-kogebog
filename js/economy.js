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
    currentView: 'dashboard',
    projectionDate: new Date(),
    activePerson: {
        dashboard: 'faelles',
        assets: 'faelles'
    }
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
    
    const personTab = e.target.closest('.person-tab');
    if(personTab) {
        const view = personTab.dataset.view;
        const person = personTab.dataset.person;
        economyState.activePerson[view] = person;
        renderView();
        return;
    }


    // Håndter klik baseret på aktiv visning
    switch(economyState.currentView) {
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
        case 'fixed':
            if (e.target.closest('#add-fixed-expense-btn')) openFixedExpenseModal();
            else if (e.target.closest('.fixed-expense-row')) openFixedExpenseModal(e.target.closest('.fixed-expense-row').dataset.id);
            break;
    }
}

function renderSidebar() {
    const navContainer = document.getElementById('economy-nav-list');
    if (!navContainer) return;

    const views = [
        { key: 'dashboard', name: 'Økonomisk Dashboard', icon: 'fa-chart-pie' },
        { key: 'fixed', name: 'Faste Poster', icon: 'fa-sync-alt' },
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
        case 'dashboard':
            renderEconomicDashboardView(contentArea);
            break;
        case 'fixed':
            renderFixedExpensesView(contentArea);
            break;
        case 'assets':
            renderAssetsView(contentArea);
            break;
        default:
            contentArea.innerHTML = `<p>Vælg en visning fra menuen.</p>`;
    }
}

function renderPersonTabs(view) {
    const members = appState.references.householdMembers || [];
    let tabs = `<button class="person-tab ${economyState.activePerson[view] === 'faelles' ? 'active' : ''}" data-view="${view}" data-person="faelles">Fælles</button>`;
    
    tabs += members.map(person => {
        return `<button class="person-tab ${economyState.activePerson[view] === person ? 'active' : ''}" data-view="${view}" data-person="${person}">${person}</button>`;
    }).join('');

    return `<div class="person-tabs">${tabs}</div>`;
}

// =================================================================
// ØKONOMISK DASHBOARD (NYT)
// =================================================================

function renderEconomicDashboardView(container) {
    const activePerson = economyState.activePerson.dashboard;
    let fixedItems = appState.fixedExpenses || [];
    
    if (activePerson !== 'faelles') {
        fixedItems = fixedItems.filter(item => item.person === activePerson);
    }
    
    const totalIncome = fixedItems.filter(i => i.type === 'income').reduce((sum, i) => sum + i.amount, 0);
    const totalExpenses = fixedItems.filter(i => i.type === 'expense').reduce((sum, i) => sum + i.amount, 0);
    const disposableIncome = totalIncome - totalExpenses;

    const expensesByCategory = fixedItems
        .filter(i => i.type === 'expense')
        .reduce((acc, item) => {
            const category = item.mainCategory || 'Diverse';
            if (!acc[category]) {
                acc[category] = { total: 0, items: [] };
            }
            acc[category].total += item.amount;
            acc[category].items.push(item);
            return acc;
        }, {});

    const chartData = Object.entries(expensesByCategory).map(([name, data]) => ({
        name: name,
        value: data.total,
        percentage: totalExpenses > 0 ? (data.total / totalExpenses) * 100 : 0
    }));

    container.innerHTML = `
        <div class="economy-dashboard-header">
            <h3>Dit Månedlige Økonomiske Overblik</h3>
            <p>Baseret på dine faste, gennemsnitlige poster.</p>
            ${renderPersonTabs('dashboard')}
        </div>
        <div class="economy-dashboard-layout">
            <div class="economy-main">
                <div class="economy-widget-chart">
                    <h4>Forbrugsfordeling</h4>
                    <div id="spending-chart-container"></div>
                </div>
            </div>
            <div class="economy-sidebar" id="budget-overview-list">
                <!-- Detaljeret oversigt indsættes her -->
            </div>
        </div>
    `;

    renderSpendingChart(chartData, disposableIncome);
    renderBudgetOverviewList({
        totalIncome,
        totalExpenses,
        disposableIncome,
        expensesByCategory,
        incomeItems: fixedItems.filter(i => i.type === 'income')
    });
}

function renderSpendingChart(data, disposableIncome) {
    const container = d3.select("#spending-chart-container");
    container.html(""); // Ryd tidligere indhold

    if (data.length === 0) {
        container.append("p").attr("class", "empty-state").text("Tilføj faste udgifter for at se diagrammet.");
        return;
    }

    const width = 350, height = 350, margin = 40;
    const radius = Math.min(width, height) / 2 - margin;

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
      .append("g")
        .attr("transform", `translate(${width / 2},${height / 2})`);

    const color = d3.scaleOrdinal()
      .domain(data.map(d => d.name))
      .range(["#d1603d", "#5d8a66", "#f3f0e9", "#a9a9a9", "#6b483c"]);

    const pie = d3.pie().value(d => d.value).sort(null);
    const data_ready = pie(data);

    const arc = d3.arc().innerRadius(radius * 0.5).outerRadius(radius);
    
    const tooltip = d3.select("body").append("div")
      .attr("class", "chart-tooltip");

    svg.selectAll('path')
      .data(data_ready)
      .enter()
      .append('path')
      .attr('d', arc)
      .attr('fill', d => color(d.data.name))
      .attr("stroke", "white")
      .style("stroke-width", "2px")
      .on("mouseover", (event, d) => {
          tooltip.style("opacity", 1)
                 .html(`<strong>${d.data.name}</strong><br>${toDKK(d.data.value)} kr. (${d.data.percentage.toFixed(1)}%)`);
      })
      .on("mousemove", (event) => {
          tooltip.style("left", (event.pageX + 15) + "px")
                 .style("top", (event.pageY - 28) + "px");
      })
      .on("mouseout", () => {
          tooltip.style("opacity", 0);
      });

    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "-0.5em")
        .style("font-size", "1.8em")
        .style("font-weight", "700")
        .text(`${toDKK(disposableIncome)} kr.`);
    
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "1.0em")
        .style("font-size", "0.9em")
        .style("color", "#666")
        .text("Rådighedsbeløb");
}

function renderBudgetOverviewList(data) {
    const container = document.getElementById('budget-overview-list');
    if(!container) return;

    const incomeHTML = data.incomeItems.map(item => `
        <div class="overview-item"><span>${item.description}</span><span>${toDKK(item.amount)} kr.</span></div>
    `).join('');

    const expensesHTML = Object.entries(data.expensesByCategory).map(([category, details]) => `
        <div class="overview-category">
            <h5>${category}</h5>
            ${details.items.map(item => `
                <div class="overview-item"><span>${item.description}</span><span>-${toDKK(item.amount)} kr.</span></div>
            `).join('')}
            <div class="overview-subtotal"><span>Subtotal</span><span>-${toDKK(details.total)} kr.</span></div>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="economy-sidebar-widget">
            <h5>Budgetoversigt</h5>
            <div class="overview-section">
                <h4>Indkomst</h4>
                ${incomeHTML}
                <div class="overview-total"><span>Total Indkomst</span><span>${toDKK(data.totalIncome)} kr.</span></div>
            </div>
            <div class="overview-section">
                <h4>Udgifter</h4>
                ${expensesHTML}
                <div class="overview-total"><span>Total Udgifter</span><span>-${toDKK(data.totalExpenses)} kr.</span></div>
            </div>
            <div class="overview-final">
                <span>Rådighedsbeløb</span>
                <span class="${data.disposableIncome >= 0 ? 'positive-text' : 'negative-text'}">${toDKK(data.disposableIncome)} kr.</span>
            </div>
        </div>
    `;
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
            <td>${item.person}</td>
            <td>${new Date(item.startDate).toLocaleDateString('da-DK')}</td>
            <td>${item.endDate ? new Date(item.endDate).toLocaleDateString('da-DK') : 'Løbende'}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <div class="tab-header">
            <h3>Faste Poster</h3>
            <p>Dette er dit budgetgrundlag. Definer alle dine faste, månedlige indtægter og udgifter her.</p>
            <button id="add-fixed-expense-btn" class="btn btn-primary"><i class="fas fa-plus"></i> Ny Fast Post</button>
        </div>
        <div class="table-wrapper">
            <table class="spreadsheet-table">
                <thead>
                    <tr><th>Beskrivelse</th><th>Beløb</th><th>Kategori</th><th>Person</th><th>Startdato</th><th>Slutdato</th></tr>
                </thead>
                <tbody>${itemsHTML || `<tr><td colspan="6" class="empty-state">Ingen faste poster endnu.</td></tr>`}</tbody>
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
// AKIVER & GÆLD
// =================================================================

function renderAssetsView(container) {
    const activePerson = economyState.activePerson.assets;
    let assets = appState.assets || [];
    let liabilities = appState.liabilities || [];
    
    const getFilteredAndCalculatedValues = (person) => {
        let personAssets = assets.filter(a => a.owner === person);
        let personLiabilities = liabilities.filter(l => l.owner === person);
        
        let commonAssetsValue = assets.filter(a => a.owner === 'Fælles').reduce((sum, a) => sum + a.value, 0);
        let commonLiabilitiesValue = liabilities.filter(l => l.owner === 'Fælles').reduce((sum, l) => sum + l.currentBalance, 0);
        
        const totalAssets = personAssets.reduce((sum, a) => sum + a.value, 0) + (commonAssetsValue / 2);
        const totalLiabilities = personLiabilities.reduce((sum, l) => sum + l.currentBalance, 0) + (commonLiabilitiesValue / 2);
        
        return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities };
    };

    let totalAssets, totalLiabilities, netWorth;

    if (activePerson === 'faelles') {
        totalAssets = assets.reduce((sum, asset) => sum + (asset.value || 0), 0);
        totalLiabilities = liabilities.reduce((sum, liability) => sum + (liability.currentBalance || 0), 0);
        netWorth = totalAssets - totalLiabilities;
    } else {
        ({ totalAssets, totalLiabilities, netWorth } = getFilteredAndCalculatedValues(activePerson));
        assets = assets.filter(a => a.owner === activePerson || a.owner === 'Fælles');
        liabilities = liabilities.filter(l => l.owner === activePerson || l.owner === 'Fælles');
    }
    
    const projectedData = calculateProjectedValues(economyState.projectionDate, assets, liabilities);
    
    const monthDisplay = economyState.projectionDate.toLocaleString('da-DK', { month: 'long', year: 'numeric' });
    const monthNavigatorHTML = `
        <div class="economy-month-navigator">
            <button id="assets-prev-month-btn" class="btn-icon"><i class="fas fa-chevron-left"></i></button>
            <h4 id="assets-current-month-display">${monthDisplay}</h4>
            <button id="assets-next-month-btn" class="btn-icon"><i class="fas fa-chevron-right"></i></button>
        </div>
    `;

    const assetsByType = projectedData.assets.reduce((acc, asset) => {
        const type = asset.type || 'Andet';
        if (!acc[type]) acc[type] = [];
        acc[type].push(asset);
        return acc;
    }, {});

    const liabilitiesByType = projectedData.liabilities.reduce((acc, liability) => {
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
                ${renderPersonTabs('assets')}
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
    
    let value = asset.value;
    if (economyState.activePerson.assets !== 'faelles' && asset.owner === 'Fælles') {
        value /= 2;
    }
    
    const totalDebtOnAsset = linkedLiabilities.reduce((sum, l) => sum + l.currentBalance, 0);
    const netValue = value - totalDebtOnAsset;
    const debtRatio = value > 0 ? (totalDebtOnAsset / value) * 100 : 0;

    return `
        <div class="asset-card" data-id="${asset.id}">
            <div class="asset-card-header">
                <span class="asset-name">${asset.name} ${asset.owner !== 'Fælles' ? `(${asset.owner})` : ''}</span>
                <span class="asset-value">${toDKK(value)} kr.</span>
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
    let { originalPrincipal = 0, currentBalance = 0, monthlyPayment = 0, interestRate = 0 } = liability;
    
    if (economyState.activePerson.assets !== 'faelles' && liability.owner === 'Fælles') {
        originalPrincipal /= 2;
        currentBalance /= 2;
        monthlyPayment /= 2;
    }

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
                <span class="liability-name">${liability.name} ${liability.owner !== 'Fælles' ? `(${liability.owner})` : ''}</span>
                <span class="liability-balance">${toDKK(currentBalance)} kr.</span>
            </div>
            <div class="asset-card-body">
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
    populateOwnerDropdown(document.getElementById('asset-owner'), asset?.owner);
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
        owner: document.getElementById('asset-owner').value,
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
    populateOwnerDropdown(document.getElementById('liability-owner'), liability?.owner);
    
    handleLoanCalculatorChange({ target: form.querySelector('input') });
    
    modal.classList.remove('hidden');
}

async function handleSaveLiability(e) {
    e.preventDefault();
    const liabilityId = document.getElementById('liability-id').value;
    
    const liabilityData = {
        name: document.getElementById('liability-name').value.trim(),
        type: document.getElementById('liability-type').value,
        owner: document.getElementById('liability-owner').value,
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
function calculateProjectedValues(targetDate, assets, liabilities) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);

    let projectedLiabilities = JSON.parse(JSON.stringify(liabilities || []));
    let projectedAssets = JSON.parse(JSON.stringify(assets || []));

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

function populateOwnerDropdown(select, val) {
    const owners = ['Fælles', ...(appState.references.householdMembers || [])];
    populateReferenceDropdown(select, owners, 'Vælg ejer...', val)
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
    let lastEditedLoanField = 'term'; // default

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
    } else if (changedElementId === 'liability-interest-rate' || changedElementId === 'liability-current-balance') {
        if (lastEditedLoanField === 'term' && termMonths > 0) {
            const newPayment = calculateMonthlyPayment(principal, annualRate, termMonths);
            if (newPayment) paymentInput.value = newPayment.toFixed(2);
        } else if (lastEditedLoanField === 'payment' && monthlyPayment > 0) {
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

