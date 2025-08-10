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

// D3.js farveskala til diagrammet
const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

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
        budgetUserSelector: document.getElementById('budget-user-selector'),
        budgetGridContainer: document.getElementById('budget-grid-container'),
        budgetYearDisplay: document.getElementById('budget-year-display'),
        prevYearBtn: document.getElementById('prev-year-btn'),
        nextYearBtn: document.getElementById('next-year-btn'),
        addExpenseModal: document.getElementById('add-expense-modal'),
        addExpenseForm: document.getElementById('add-expense-form'),
    };
    
    // Sæt lytter på knapper
    if (appElements.addFixedExpenseBtn) {
        appElements.addFixedExpenseBtn.addEventListener('click', () => openFixedExpenseModal());
    }
    if (appElements.fixedExpenseForm) {
        appElements.fixedExpenseForm.addEventListener('submit', handleSaveFixedExpense);
    }
    
    // Event delegation for redigering/sletning af faste udgifter
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

    // Lytter på skift i bruger
    if (appElements.budgetUserSelector) {
        appElements.budgetUserSelector.addEventListener('change', (e) => {
            currentBudgetViewUserId = e.target.value === 'all' ? null : e.target.value;
            renderBudgetPage();
        });
    }

    // Lytter på årsnavigation
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

    // Event delegation for at åbne modal fra gitteret
    if (appElements.budgetGridContainer) {
        appElements.budgetGridContainer.addEventListener('click', e => {
            const cell = e.target.closest('.budget-grid-cell');
            if (cell && cell.dataset.month && cell.dataset.expenseId) {
                openAddExpenseModal(cell.dataset.month, cell.dataset.expenseId);
            }
        });
    }
    
    // Lytter på gem-knappen i udgifts-modalen
    if (appElements.addExpenseForm) {
        appElements.addExpenseForm.addEventListener('submit', handleSaveExpense);
    }

    // Lytter til Firestore-ændringer for faste udgifter
    const fixedExpensesQuery = query(collection(db, 'fixed_expenses'));
    userListeners.fixedExpenses = onSnapshot(fixedExpensesQuery, (snapshot) => {
        appState.fixedExpenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderBudgetPage();
    }, (error) => handleError(error, "Kunne ikke hente faste udgifter.", "onSnapshot(fixed_expenses)"));
}

/**
 * Renders the entire budget page.
 */
export function renderBudgetPage() {
    if (!appState.expenses || !appElements.budgetGridContainer) {
        return;
    }

    // Opdater brugerselector og sæt initial bruger
    renderUserSelector();
    
    appElements.budgetYearDisplay.textContent = currentBudgetYear;

    const monthlyExpenses = calculateMonthlyExpensesByCategory();
    renderBudgetGrid(monthlyExpenses);
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

    // Antag at appState.currentUser og en "partner" findes
    const myId = appState.currentUser?.uid;
    const partnerId = "some_partner_id_here"; // Skal erstattes med dynamisk partner-ID
    
    const myOption = document.createElement('option');
    myOption.value = myId;
    myOption.textContent = 'Mine udgifter';
    selector.appendChild(myOption);

    const partnerOption = document.createElement('option');
    partnerOption.value = partnerId;
    partnerOption.textContent = 'Frederikkes udgifter';
    selector.appendChild(partnerOption);
    
    // Sæt den valgte bruger
    if (currentBudgetViewUserId === null) {
        selector.value = 'all';
    } else {
        selector.value = currentBudgetViewUserId;
    }
}

/**
 * Calculates the total monthly expenses grouped by category.
 * @returns {Array<{category: string, amount: number}>} An array of expense objects.
 */
function calculateMonthlyExpensesByCategory() {
    const expensesByMonthAndCategory = {};
    const userIdToFilter = currentBudgetViewUserId;
    const months = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

    months.forEach(month => {
        expensesByMonthAndCategory[month] = {};
    });

    // Inkluderer faste udgifter
    appState.fixedExpenses.forEach(exp => {
        if (userIdToFilter && exp.userId !== userIdToFilter) return;

        const category = exp.category || 'Faste udgifter';
        let monthlyAmount = exp.amount;
        if (exp.interval === 'kvartalsvist') {
            monthlyAmount = exp.amount / 3;
        } else if (exp.interval === 'årligt') {
            monthlyAmount = exp.amount / 12;
        }

        months.forEach(month => {
            if (!expensesByMonthAndCategory[month][category]) {
                expensesByMonthAndCategory[month][category] = 0;
            }
            expensesByMonthAndCategory[month][category] += monthlyAmount;
        });
    });

    // Inkluderer variable udgifter
    appState.expenses.forEach(expense => {
        if (userIdToFilter && expense.userId !== userIdToFilter) return;

        if (!expense.date || !expense.date.toDate) return;
        const expenseDate = expense.date.toDate();
        if (expenseDate.getFullYear() === currentBudgetYear) {
            const month = months[expenseDate.getMonth()];
            const category = expense.category || 'Andet';

            if (!expensesByMonthAndCategory[month][category]) {
                expensesByMonthAndCategory[month][category] = 0;
            }
            expensesByMonthAndCategory[month][category] += expense.amount;
        }
    });

    return expensesByMonthAndCategory;
}

/**
 * Renders the budget grid.
 */
function renderBudgetGrid(data) {
    const container = appElements.budgetGridContainer;
    container.innerHTML = '';
    
    const months = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    const allCategories = [...new Set(Object.values(data).flatMap(monthData => Object.keys(monthData)))].sort();

    const headerHtml = `
        <div class="budget-grid-header">
            <div class="budget-grid-cell header-cell">Post</div>
            ${months.map(month => `<div class="budget-grid-cell header-cell">${month}</div>`).join('')}
        </div>
    `;

    const bodyHtml = allCategories.map(category => {
        const rowHtml = months.map(month => {
            const amount = data[month][category] || 0;
            return `<div class="budget-grid-cell" data-month="${month}" data-expense-id="${category}">${amount.toFixed(2).replace('.', ',')}</div>`;
        }).join('');
        return `
            <div class="budget-grid-row">
                <div class="budget-grid-cell category-cell">${category}</div>
                ${rowHtml}
            </div>
        `;
    }).join('');

    container.innerHTML = headerHtml + bodyHtml;
}

/**
 * Renders the list of fixed expenses.
 */
function renderFixedExpensesList() {
    const container = appElements.budgetFixedExpensesContainer;
    container.innerHTML = '';
    const userIdToFilter = currentBudgetViewUserId;
    
    // Filtrer udgifter baseret på den valgte bruger
    const filteredFixedExpenses = appState.fixedExpenses.filter(exp => {
        if (userIdToFilter) {
            return exp.userId === userIdToFilter;
        }
        return true; // Vis alle for "Hele Husstanden"
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
    
    // Tilføj altid formularen, så man kan oprette nye
    const formHtml = `
        <hr>
        <h4>Tilføj ny fast udgift</h4>
        <form id="add-fixed-expense-form" class="add-fixed-expense-form">
            <div class="form-grid-3-col">
                <div class="input-group">
                    <label for="fixed-expense-name-new">Navn</label>
                    <input type="text" id="fixed-expense-name-new" required>
                </div>
                <div class="input-group">
                    <label for="fixed-expense-amount-new">Beløb</label>
                    <div class="price-input-wrapper">
                        <input type="number" id="fixed-expense-amount-new" step="0.01" required>
                    </div>
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
    const modal = appElements.addFixedExpenseModal;
    const form = appElements.fixedExpenseForm;
    form.reset();

    if (expenseId) {
        const expense = appState.fixedExpenses.find(e => e.id === expenseId);
        if (expense) {
            modal.querySelector('h3').textContent = 'Rediger Fast Udgift';
            document.getElementById('fixed-expense-id').value = expense.id;
            document.getElementById('fixed-expense-name').value = expense.name;
            document.getElementById('fixed-expense-amount').value = expense.amount;
            document.getElementById('fixed-expense-interval').value = expense.interval;
            document.getElementById('fixed-expense-category').value = expense.category;
            document.getElementById('delete-fixed-expense-btn').style.display = 'inline-flex';
        }
    } else {
        modal.querySelector('h3').textContent = 'Tilføj Fast Udgift';
        document.getElementById('fixed-expense-id').value = '';
        document.getElementById('delete-fixed-expense-btn').style.display = 'none';
    }

    modal.classList.remove('hidden');
}

async function handleSaveFixedExpense(e) {
    e.preventDefault();
    const formId = e.target.id;
    let expenseId, name, amount, interval, category;

    if (formId === 'fixed-expense-form') { // Redigering
        expenseId = document.getElementById('fixed-expense-id').value;
        name = document.getElementById('fixed-expense-name').value;
        amount = parseFloat(document.getElementById('fixed-expense-amount').value);
        interval = document.getElementById('fixed-expense-interval').value;
        category = document.getElementById('fixed-expense-category').value;
    } else { // Oprettelse via den inline form
        name = document.getElementById('fixed-expense-name-new').value;
        amount = parseFloat(document.getElementById('fixed-expense-amount-new').value);
        interval = document.getElementById('fixed-expense-interval-new').value;
        category = document.getElementById('fixed-expense-category-new').value;
    }

    if (!name || isNaN(amount) || amount <= 0 || !interval || !category) {
        showNotification({ title: "Udfyld alle felter", message: "Navn, beløb, interval og kategori skal være udfyldt korrekt." });
        return;
    }

    const expenseData = {
        userId: appState.currentUser.uid,
        name,
        amount,
        interval,
        category
    };
    
    try {
        if (expenseId) {
            await updateDoc(doc(db, 'fixed_expenses', expenseId), expenseData);
        } else {
            await addDoc(collection(db, 'fixed_expenses'), expenseData);
        }
        
        if (formId === 'fixed-expense-form') {
            appElements.addFixedExpenseModal.classList.add('hidden');
        } else {
            e.target.reset(); // Nulstil den inline form
        }

        showNotification({ title: "Gemt!", message: "Fast udgift er blevet gemt." });

    } catch (error) {
        handleError(error, "Den faste udgift kunne ikke gemmes.", "saveFixedExpense");
    }
}


async function handleDeleteFixedExpense(expenseId) {
    const confirmed = await showNotification({
        title: "Slet Fast Udgift",
        message: "Er du sikker på, du vil slette denne faste udgift?",
        type: 'confirm'
    });

    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, 'fixed_expenses', expenseId));
        showNotification({ title: "Slettet", message: "Fast udgift er blevet slettet." });
    } catch (error) {
        handleError(error, "Den faste udgift kunne ikke slettes.", "deleteFixedExpense");
    }
}

function openAddExpenseModal(month, category) {
    appElements.addExpenseModal.classList.remove('hidden');
    appElements.addExpenseModal.querySelector('h3').textContent = `Tilføj udgift for ${month}`;
    appElements.addExpenseForm.reset();
    document.getElementById('add-expense-category').value = category;
    document.getElementById('add-expense-date').value = formatDate(new Date(currentBudgetYear, getMonthIndex(month), 1));
}

async function handleSaveExpense(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('add-expense-amount').value);
    const date = document.getElementById('add-expense-date').value;
    const category = document.getElementById('add-expense-category').value;
    const description = document.getElementById('add-expense-description').value || `Manuel udgift for ${category}`;

    if (isNaN(amount) || amount <= 0 || !date || !category) {
        showNotification({title: "Udfyld alle felter", message: "Alle felter skal være udfyldt korrekt."});
        return;
    }

    try {
        await addDoc(collection(db, 'expenses'), {
            userId: appState.currentUser.uid,
            amount: amount,
            category: category,
            description: description,
            date: new Date(date)
        });
        appElements.addExpenseModal.classList.add('hidden');
        showNotification({title: "Gemt!", message: "Din udgift er blevet tilføjet."});
    } catch (error) {
        handleError(error, "Udgiften kunne ikke gemmes.", "saveExpense");
    }
}

function getMonthIndex(month) {
    const months = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    return months.indexOf(month);
}

