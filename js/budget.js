// js/budget.js
// Dette modul håndterer logikken og visningen for den nye Budget-side.

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initUI, handleError, showNotification } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;
let currentBudgetViewUserId = null;
let currentBudgetYear = new Date().getFullYear();
let userListeners = {};

/**
 * Initializes the budget module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
export function initBudget(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        addFixedExpenseModal: document.getElementById('add-fixed-expense-modal'),
        fixedExpenseForm: document.getElementById('fixed-expense-form'),
        addFixedExpenseBtn: document.getElementById('add-fixed-expense-btn'),
        budgetFixedExpensesContainer: document.getElementById('budget-fixed-expenses'),
        budgetUserSelector: document.getElementById('budgetUserSelector'),
        budgetGridContainer: document.getElementById('budget-grid-container'),
        budgetYearDisplay: document.getElementById('budget-year-display'),
        prevYearBtn: document.getElementById('prev-year-btn'),
        nextYearBtn: document.getElementById('next-year-btn'),
        addExpenseModal: document.getElementById('add-expense-modal'),
        addExpenseForm: document.getElementById('add-expense-form'),
    };
    
    // Set listeners for buttons
    if (appElements.addFixedExpenseBtn) {
        appElements.addFixedExpenseBtn.addEventListener('click', () => openFixedExpenseModal());
    }
    if (appElements.fixedExpenseForm) {
        appElements.fixedExpenseForm.addEventListener('submit', handleSaveFixedExpense);
    }
    
    // Event delegation for editing/deleting fixed expenses
    if (appElements.budgetFixedExpensesContainer) {
        appElements.budgetFixedExpensesContainer.addEventListener('click', e => {
            const editBtn = e.target.closest('.edit-fixed-expense-btn');
            const deleteBtn = e.target.closest('.delete-fixed-expense-btn');
            const card = e.target.closest('.fixed-expense-card');

            if (!card) return;

            const expenseId = card.dataset.id;
            
            if (editBtn) {
                openFixedExpenseModal(expenseId);
            } else if (deleteBtn) {
                handleDeleteFixedExpense(expenseId);
            }
        });
    }

    // Listener for user change
    if (appElements.budgetUserSelector) {
        appElements.budgetUserSelector.addEventListener('change', (e) => {
            currentBudgetViewUserId = e.target.value === 'all' ? null : e.target.value;
            renderBudgetPage();
        });
    }

    // Listener for year navigation
    if (appElements.prevYearBtn) {
        appElements.prevYearBtn.addEventListener('click', () => {
            currentBudgetYear--;
            renderBudgetPage();
        });
    }
    if (appElements.nextYearBtn) {
        appElements.nextYearBtn.addEventListener('click', () => {
            currentBudgetYear++;
            renderBudgetPage();
        });
    }

    // Event delegation to open modal from the grid
    if (appElements.budgetGridContainer) {
        appElements.budgetGridContainer.addEventListener('click', e => {
            const cell = e.target.closest('.budget-grid-cell');
            if (cell && cell.dataset.month && cell.dataset.expenseId) {
                openAddExpenseModal(cell.dataset.month, cell.dataset.expenseId);
            }
        });
    }
    
    // Listener for save button in expense modal
    if (appElements.addExpenseForm) {
        appElements.addExpenseForm.addEventListener('submit', handleSaveExpense);
    }

    // OPDATERET: Denne lytter er flyttet til app.js, hvor den er filtreret efter den nuværende bruger
    // for at undgå permissions-fejl.
}

/**
 * Renders the entire budget page.
 */
export function renderBudgetPage() {
    if (!appState.expenses || !appElements.budgetGridContainer) {
        return;
    }

    // Update user selector and set initial user
    renderUserSelector();
    
    appElements.budgetYearDisplay.textContent = currentBudgetYear;

    const expensesByItem = calculateExpensesByItem();
    renderBudgetGrid(expensesByItem);
    renderFixedExpensesList();
}

/**
 * Renders the user selector dropdown.
 */
function renderUserSelector() {
    const selector = appElements.budgetUserSelector;
    if (!selector) return;

    selector.innerHTML = '';
    
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'Hele Husstanden';
    selector.appendChild(allOption);

    // Get all users from the appState and add them to the dropdown
    appState.users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.name || 'Ukendt bruger';
        selector.appendChild(option);
    });
    
    // Set the selected user
    if (currentBudgetViewUserId === null) {
        selector.value = 'all';
    } else {
        selector.value = currentBudgetViewUserId;
    }
}

/**
 * Calculates expenses grouped by month and expense item.
 * @returns {object} An object with monthly expense data.
 */
function calculateExpensesByItem() {
    const expensesByItem = {};
    const userIdToFilter = currentBudgetViewUserId;
    const months = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

    const allExpenses = [
        ...appState.fixedExpenses.map(exp => ({ ...exp, isFixed: true })),
        ...appState.expenses.map(exp => ({ ...exp, isFixed: false, date: exp.date.toDate() }))
    ];

    const filteredExpenses = allExpenses.filter(exp => {
        if (userIdToFilter) {
            return exp.userId === userIdToFilter;
        }
        return true;
    });

    // Group expenses by item name and user
    filteredExpenses.forEach(exp => {
        // Vi bruger userId til at gruppere, så vi kan se udgifter pr. bruger, selvom vi kun filtrerer på én bruger.
        const user = appState.users.find(u => u.id === exp.userId) || { name: 'Ukendt' };
        const itemKey = `${exp.name}-${exp.userId}`;
        if (!expensesByItem[itemKey]) {
            expensesByItem[itemKey] = {
                name: exp.name,
                userId: exp.userId,
                category: exp.category,
                userName: user.name,
                months: {}
            };
        }

        if (exp.isFixed) {
            let monthlyAmount = exp.amount;
            if (exp.interval === 'kvartalsvist') {
                monthlyAmount = exp.amount / 3;
            } else if (exp.interval === 'årligt') {
                monthlyAmount = exp.amount / 12;
            }
            months.forEach(month => {
                expensesByItem[itemKey].months[month] = (expensesByItem[itemKey].months[month] || 0) + monthlyAmount;
            });
        } else {
            if (exp.date.getFullYear() === currentBudgetYear) {
                const month = months[exp.date.getMonth()];
                expensesByItem[itemKey].months[month] = (expensesByItem[itemKey].months[month] || 0) + exp.amount;
            }
        }
    });

    return expensesByItem;
}

/**
 * Renders the budget grid.
 */
function renderBudgetGrid(data) {
    const container = appElements.budgetGridContainer;
    container.innerHTML = '';
    
    const months = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    const itemKeys = Object.keys(data);
    const users = appState.users;

    // Calculate totals for the entire household and for each user
    const monthlyTotals = months.map(month => 
        itemKeys.reduce((sum, key) => sum + (data[key].months[month] || 0), 0)
    );
    const yearlyTotal = monthlyTotals.reduce((sum, amount) => sum + amount, 0);

    const userTotals = {};
    users.forEach(user => {
        userTotals[user.id] = { name: user.name || 'Ukendt', months: {} };
        months.forEach(month => {
            userTotals[user.id].months[month] = itemKeys
                .filter(key => data[key].userId === user.id)
                .reduce((sum, key) => sum + (data[key].months[month] || 0), 0);
        });
    });

    const headerHtml = `
        <div class="budget-grid-row budget-grid-header">
            <div class="budget-grid-cell header-cell">Post</div>
            ${months.map(month => `<div class="budget-grid-cell header-cell">${month.charAt(0).toUpperCase() + month.slice(1)}</div>`).join('')}
            <div class="budget-grid-cell header-cell">Total</div>
        </div>
    `;

    // Row for the entire household's total
    const totalRowHtml = `
        <div class="budget-grid-row">
            <div class="budget-grid-cell total-cell">Hele Husstanden</div>
            ${months.map((month, index) => `<div class="budget-grid-cell total-cell">${monthlyTotals[index].toFixed(2).replace('.', ',')}</div>`).join('')}
            <div class="budget-grid-cell total-cell">${yearlyTotal.toFixed(2).replace('.', ',')}</div>
        </div>
    `;

    // Rows for individual users' totals
    const userRowsHtml = Object.keys(userTotals).map(userId => {
        const user = userTotals[userId];
        const userMonthlyTotals = months.map(month => user.months[month] || 0);
        const userYearlyTotal = userMonthlyTotals.reduce((sum, amount) => sum + amount, 0);
        return `
            <div class="budget-grid-row">
                <div class="budget-grid-cell user-cell">${user.name} Total</div>
                ${userMonthlyTotals.map(amount => `<div class="budget-grid-cell user-cell">${amount.toFixed(2).replace('.', ',')}</div>`).join('')}
                <div class="budget-grid-cell user-cell">${userYearlyTotal.toFixed(2).replace('.', ',')}</div>
            </div>
        `;
    }).join('');

    // Rows for individual expense items
    const bodyHtml = itemKeys.map(key => {
        const item = data[key];
        const itemMonthlyTotals = months.map(month => item.months[month] || 0);
        const itemYearlyTotal = itemMonthlyTotals.reduce((sum, amount) => sum + amount, 0);
        const rowHtml = months.map(month => {
            const amount = item.months[month] || 0;
            return `<div class="budget-grid-cell" data-month="${month}" data-expense-id="${item.name}">${amount.toFixed(2).replace('.', ',')}</div>`;
        }).join('');
        return `
            <div class="budget-grid-row">
                <div class="budget-grid-cell category-cell">${item.name} (${item.userName})</div>
                ${rowHtml}
                <div class="budget-grid-cell">${itemYearlyTotal.toFixed(2).replace('.', ',')}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="budget-grid">` + headerHtml + totalRowHtml + userRowsHtml + bodyHtml + `</div>`;
}

/**
 * Renders the list of fixed expenses.
 */
function renderFixedExpensesList() {
    const container = appElements.budgetFixedExpensesContainer;
    const userIdToFilter = currentBudgetViewUserId;
    
    // Filter expenses based on the selected user
    const filteredFixedExpenses = appState.fixedExpenses.filter(exp => {
        if (userIdToFilter) {
            return exp.userId === userIdToFilter;
        }
        return true; // Show all for "Hele Husstanden"
    });

    if (filteredFixedExpenses.length === 0) {
        container.innerHTML = `<p class="empty-state">Ingen faste udgifter er registreret for denne bruger.</p>`;
    } else {
        const cardsHtml = filteredFixedExpenses.map(exp => `
            <div class="fixed-expense-card" data-id="${exp.id}">
                <h4>${exp.name}</h4>
                <div class="actions">
                    <button class="btn-icon edit-fixed-expense-btn"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete-fixed-expense-btn"><i class="fas fa-trash"></i></button>
                </div>
                <span class="amount">${exp.amount.toFixed(2).replace('.', ',')} kr.</span>
                <span class="interval">${exp.interval}</span>
                <span class="category">${exp.category}</span>
            </div>
        `).join('');
        
        container.innerHTML = `
            <h3>Faste Udgifter</h3>
            <p class="small-text">Dette er gentagne udgifter, der automatisk medregnes i dit budget.</p>
            <div id="fixed-expenses-list">
                ${cardsHtml}
            </div>
        `;
    }
    
    // Always add the form for creating new expenses
    const formHtml = `
        <hr>
        <h4>Tilføj ny fast udgift</h4>
        <form id="add-fixed-expense-form" class="add-fixed-expense-form">
            <div class="form-grid-2-col">
                <div class="input-group">
                    <label for="fixed-expense-name-new">Navn</label>
                    <input type="text" id="fixed-expense-name-new" required>
                </div>
                <div class="input-group">
                    <label for="fixed-expense-amount-new">Beløb (kr.)</label>
                    <input type="number" id="fixed-expense-amount-new" step="0.01" required>
                </div>
                <div class="input-group">
                    <label for="fixed-expense-interval-new">Interval</label>
                    <select id="fixed-expense-interval-new" required>
                        <option value="månedligt">Månedligt</option>
                        <option value="kvartalsvist">Kvartalsvist</option>
                        <option value="årligt">Årligt</option>
                    </select>
                </div>
                 <div class="input-group">
                    <label for="fixed-expense-category-new">Kategori</label>
                    <input type="text" id="fixed-expense-category-new" required>
                </div>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Tilføj</button>
            </div>
        </form>
    `;
    container.innerHTML += formHtml;
    document.getElementById('add-fixed-expense-form').addEventListener('submit', handleSaveFixedExpense);
}

function openFixedExpenseModal(expenseId = null) {
    // ... (unchanged)
}

async function handleSaveFixedExpense(e) {
    // ... (unchanged)
}


async function handleDeleteFixedExpense(expenseId) {
    // ... (unchanged)
}

function openAddExpenseModal(month, category) {
    // ... (unchanged)
}

async function handleSaveExpense(e) {
    // ... (unchanged)
}

function getMonthIndex(month) {
    const months = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    return months.indexOf(month);
}
