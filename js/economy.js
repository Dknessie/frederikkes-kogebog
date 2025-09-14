// js/economy.js
// Dette modul håndterer logikken for budget-siden.

import { toDKK, parseDKK } from './utils.js';

let appState; // Reference til den centrale state
let appElements; // Reference til centrale DOM-elementer

/**
 * Initialiserer economy-modulet.
 * @param {object} state - Den centrale state fra app.js.
 * @param {object} elements - De cachede DOM-elementer fra app.js.
 */
export function initEconomy(state, elements) {
    appState = state;
    appElements = elements;

    // Vi bruger event delegation på containeren for at håndtere alle klik
    if (appElements.spreadsheetContainer) {
        appElements.spreadsheetContainer.addEventListener('click', handleContainerClick);
        appElements.spreadsheetContainer.addEventListener('blur', handleCellBlur, true); // Brug 'capture' fase for at fange blur-eventet
    }
}

/**
 * Hoved-renderingsfunktion for økonomisiden.
 * Den bygger hele budget-arket dynamisk.
 */
export function renderEconomy() {
    if (!appElements.spreadsheetContainer) return;

    const budgetData = appState.budget;
    const activePerson = budgetData.persons[budgetData.activePersonId];
    if (!activePerson) {
        appElements.spreadsheetContainer.innerHTML = '<p>Vælg venligst en person.</p>';
        return;
    }

    const monthHeaders = getMonthHeaders();
    
    // Bygger de forskellige dele af tabellen
    const tableHeader = renderTableHeader(monthHeaders);
    const incomeRows = (activePerson.budget.income || []).map(item => renderRow(item, monthHeaders, activePerson.actuals)).join('');
    const expenseRows = (activePerson.budget.expenses || []).map(item => renderRow(item, monthHeaders, activePerson.actuals, true)).join('');
    const totals = calculateTotals(activePerson, monthHeaders);
    const tableFooter = renderFooter(totals);
    const personTabs = renderPersonTabs(budgetData);

    // Samler hele HTML-strukturen
    appElements.spreadsheetContainer.innerHTML = `
        <div class="spreadsheet-card">
            <div class="spreadsheet-header">
                <div class="person-tabs">
                    ${personTabs}
                    <button id="add-person" class="btn-icon" title="Tilføj Person"><i class="fas fa-user-plus"></i></button>
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

/**
 * Genererer HTML for fanebladene for hver person.
 * @param {object} budgetData - Hele budget-objektet fra state.
 * @returns {string} HTML-strengen for fanebladene.
 */
function renderPersonTabs(budgetData) {
    return Object.values(budgetData.persons).map(p => `
        <button class="person-tab ${budgetData.activePersonId === p.name.toLowerCase() ? 'active' : ''}" data-person-id="${p.name.toLowerCase()}">
            ${p.name}
        </button>
    `).join('');
}

/**
 * Genererer HTML for tabel-headeren.
 * @param {Array} monthHeaders - Et array af måneds-objekter.
 * @returns {string} HTML-strengen for thead.
 */
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

/**
 * Genererer HTML for en enkelt række (indkomst eller udgift).
 * @param {object} item - Posten der skal renderes (f.eks. { id, name, allocated }).
 * @param {Array} monthHeaders - Array af måneds-objekter.
 * @param {object} allActuals - Objekt med alle faktiske tal.
 * @param {boolean} isExpense - Angiver om posten er en udgift.
 * @returns {string} HTML-strengen for en <tr>.
 */
function renderRow(item, monthHeaders, allActuals, isExpense = false) {
    const yearlyBudget = item.allocated * 12;
    let actualTotal = 0;

    const actualsByMonth = monthHeaders.map(h => {
        const actual = allActuals[item.id]?.[h.key] || 0;
        actualTotal += actual;
        
        let colorClass = '';
        if (actual !== 0) {
            if (isExpense) {
                // For udgifter er et højere faktiske tal negativt (rødt)
                colorClass = actual > item.allocated ? 'negative-text' : 'positive-text';
            } else {
                // For indkomst er et lavere faktiske tal negativt (rødt)
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
                <button class="btn-danger delete-row" data-id="${item.id}" data-type="${isExpense ? 'expenses' : 'income'}">&times;</button>
            </td>
            <td class="currency editable" contenteditable="true" data-id="${item.id}" data-field="allocated">${toDKK(item.allocated)}</td>
            ${actualsByMonth}
            <td class="currency ${difference >= 0 ? 'positive-bg' : 'negative-bg'}">${toDKK(difference)}</td>
        </tr>`;
}

/**
 * Genererer HTML for footeren med totaler.
 * @param {object} totals - Objekt med beregnede totaler for indkomst og udgifter.
 * @returns {string} HTML-strengen for <tfoot> indhold.
 */
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

/**
 * Genererer et array af de seneste 12 måneder til brug i headeren.
 * @returns {Array<{key: string, label: string}>}
 */
function getMonthHeaders() {
    const headers = [];
    let date = new Date();
    // Gå til starten af den nuværende måned for at undgå fejl
    date.setDate(1); 
    for (let i = 0; i < 12; i++) {
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        const label = date.toLocaleString('da-DK', { month: 'short', year: '2-digit' });
        headers.push({ key: monthKey, label });
        date.setMonth(date.getMonth() - 1);
    }
    return headers.reverse(); // Viser nyeste måned til højre
}

/**
 * Beregner totaler for budget, faktiske beløb og differencer.
 * @param {object} person - Den aktive persons data.
 * @param {Array} monthHeaders - Array af måneds-objekter.
 * @returns {object} Objekt med totaler for 'income' og 'expenses'.
 */
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
        // Diff for indkomst: faktiske - budgetterede
        income.diff += totalActual - (item.allocated * monthHeaders.length);
    });

    (person.budget.expenses || []).forEach(item => {
        expenses.budget += item.allocated;
        let totalActual = 0;
        monthHeaders.forEach((h, i) => {
            const actual = person.actuals[item.id]?.[h.key] || 0;
            expenses.actuals[i] += actual;
            totalActual += actual;
        });
        // Diff for udgifter: budgetterede - faktiske
        expenses.diff += (item.allocated * monthHeaders.length) - totalActual;
    });
    
    return { income, expenses };
}


// --- EVENT HANDLERS ---

/**
 * Håndterer klik-events på hele budget-containeren.
 * @param {Event} e - Klik-eventet.
 */
function handleContainerClick(e) {
    const state = appState.budget;

    // Skift person-faneblad
    if (e.target.closest('.person-tab')) {
        state.activePersonId = e.target.closest('.person-tab').dataset.personId;
        renderEconomy();
    }
    // Tilføj person
    else if (e.target.closest('#add-person')) {
        const name = prompt("Navn på ny person:");
        if (name && !state.persons[name.toLowerCase()]) {
            const newId = name.toLowerCase();
            state.persons[newId] = {
                name: name,
                budget: { income: [], expenses: [] },
                actuals: {}
            };
            state.activePersonId = newId;
            renderEconomy();
        }
    }
    // Tilføj række (indkomst eller udgift)
    else if (e.target.closest('#add-expense-row') || e.target.closest('#add-income-row')) {
        const isExpense = !!e.target.closest('#add-expense-row');
        const type = isExpense ? 'expenses' : 'income';
        const prefix = isExpense ? 'b' : 'i';
        const newId = prefix + Date.now();
        
        state.persons[state.activePersonId].budget[type].push({ id: newId, name: 'Ny post', allocated: 0 });
        renderEconomy();
    }
    // Slet række
    else if (e.target.closest('.delete-row')) {
        const button = e.target.closest('.delete-row');
        const id = button.dataset.id;
        const type = button.dataset.type;
        const person = state.persons[state.activePersonId];
        
        person.budget[type] = person.budget[type].filter(item => item.id !== id);
        delete person.actuals[id]; // Slet også de faktiske tal
        renderEconomy();
    }
}

/**
 * Håndterer, når en bruger er færdig med at redigere en celle.
 * @param {Event} e - Blur-eventet.
 */
function handleCellBlur(e) {
    if (!e.target.classList.contains('editable')) return;
    
    const state = appState.budget;
    const person = state.persons[state.activePersonId];
    const cell = e.target;
    
    const id = cell.dataset.id;
    const field = cell.dataset.field;
    const monthKey = cell.dataset.monthKey;
    const newValue = cell.textContent;

    const isExpense = (person.budget.expenses || []).some(i => i.id === id);
    const type = isExpense ? 'expenses' : 'income';
    const item = person.budget[type].find(i => i.id === id);

    if (!item) return;

    if (field === 'name') {
        item.name = newValue;
    } else if (field === 'allocated') {
        item.allocated = parseDKK(newValue);
    } else if (monthKey) {
        if (!person.actuals[id]) person.actuals[id] = {};
        person.actuals[id][monthKey] = parseDKK(newValue);
    }

    // Gen-render for at opdatere totaler og formatering
    renderEconomy();
}
