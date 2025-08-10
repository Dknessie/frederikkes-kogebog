// js/budget.js
// Dette modul håndterer logikken og visningen for den nye Budget-side.

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleError, showNotification } from './ui.js';

let appState;
let appElements;
let currentBudgetYear = new Date().getFullYear();

/**
 * Initializes the budget module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
export function initBudget(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        addFixedExpenseForm: document.getElementById('add-fixed-expense-form'),
        budgetGridContainer: document.getElementById('budget-grid-container'),
        budgetTotalsBar: document.getElementById('budget-totals-bar'),
        budgetUserSelector: document.getElementById('budgetUserSelector'),
        budgetYearDisplay: document.getElementById('budget-year-display'),
        prevYearBtn: document.getElementById('prev-year-btn'),
        nextYearBtn: document.getElementById('next-year-btn'),
        clearFixedExpenseFormBtn: document.getElementById('clear-fixed-expense-form-btn'),
    };
    
    if (appElements.addFixedExpenseForm) {
        appElements.addFixedExpenseForm.addEventListener('submit', handleSaveFixedExpense);
    }
    if (appElements.clearFixedExpenseFormBtn) {
        appElements.clearFixedExpenseFormBtn.addEventListener('click', resetFixedExpenseForm);
    }
    
    if (appElements.budgetUserSelector) {
        appElements.budgetUserSelector.addEventListener('change', renderBudgetPage);
    }

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

    // Event delegation for edit/delete buttons in the grid
    if (appElements.budgetGridContainer) {
        appElements.budgetGridContainer.addEventListener('click', e => {
            const editBtn = e.target.closest('.edit-fixed-expense-btn');
            const deleteBtn = e.target.closest('.delete-fixed-expense-btn');
            
            if (editBtn) {
                const expenseId = editBtn.dataset.id;
                populateFormForEdit(expenseId);
            } else if (deleteBtn) {
                const expenseId = deleteBtn.dataset.id;
                handleDeleteFixedExpense(expenseId);
            }
        });
    }
}

/**
 * Renders the entire budget page.
 */
export function renderBudgetPage() {
    if (!appState.fixedExpenses || !appState.expenses) return;

    appElements.budgetYearDisplay.textContent = currentBudgetYear;
    populateDropdowns();
    calculateAndRenderBudgetGrid();
}

/**
 * Populates all necessary dropdowns on the page.
 */
function populateDropdowns() {
    const ownerSelect = document.getElementById('fixed-expense-owner-new');
    const monthSelect = document.getElementById('fixed-expense-start-month-new');
    const userSelector = appElements.budgetUserSelector;

    // Populate user/owner dropdowns
    const householdMembers = appState.references.householdMembers || [];
    const currentUser = appState.currentUser?.displayName || appState.currentUser?.email.split('@')[0];
    
    [ownerSelect, userSelector].forEach(select => {
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML = ''; // Clear existing
        
        if (select === userSelector) {
            select.add(new Option('Hele Husstanden', 'all'));
        }
        
        householdMembers.forEach(member => select.add(new Option(member, member)));
        
        if (currentValue && householdMembers.includes(currentValue)) {
            select.value = currentValue;
        } else if (select === ownerSelect) {
            select.value = currentUser;
        } else {
            select.value = 'all';
        }
    });

    // Populate month dropdown
    const months = ["Januar", "Februar", "Marts", "April", "Maj", "Juni", "Juli", "August", "September", "Oktober", "November", "December"];
    if (monthSelect.options.length <= 1) { // Populate only once
        monthSelect.innerHTML = '<option value="">Vælg måned...</option>';
        months.forEach((month, index) => {
            monthSelect.add(new Option(month, index)); // Use index as value
        });
    }
}

/**
 * Resets the "Add Fixed Expense" form.
 */
function resetFixedExpenseForm() {
    appElements.addFixedExpenseForm.reset();
    document.getElementById('fixed-expense-id').value = '';
    document.getElementById('fixed-expense-owner-new').value = appState.currentUser?.displayName || '';
    appElements.addFixedExpenseForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-plus"></i> Gem Udgift';
}

/**
 * Populates the form with data from an existing expense for editing.
 * @param {string} expenseId - The ID of the expense to edit.
 */
function populateFormForEdit(expenseId) {
    const expense = appState.fixedExpenses.find(exp => exp.id === expenseId);
    if (!expense) return;

    document.getElementById('fixed-expense-id').value = expense.id;
    document.getElementById('fixed-expense-category-new').value = expense.category;
    document.getElementById('fixed-expense-amount-new').value = expense.amount;
    document.getElementById('fixed-expense-interval-new').value = expense.interval;
    document.getElementById('fixed-expense-start-month-new').value = expense.startMonth;
    document.getElementById('fixed-expense-owner-new').value = expense.owner;
    
    appElements.addFixedExpenseForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Opdater Udgift';
    window.scrollTo({ top: appElements.addFixedExpenseForm.offsetTop, behavior: 'smooth' });
}

/**
 * Handles saving or updating a fixed expense.
 * @param {Event} e - The form submission event.
 */
async function handleSaveFixedExpense(e) {
    e.preventDefault();
    const expenseId = document.getElementById('fixed-expense-id').value;
    const isEditing = !!expenseId;

    const expenseData = {
        category: document.getElementById('fixed-expense-category-new').value.trim(),
        amount: parseFloat(document.getElementById('fixed-expense-amount-new').value),
        interval: document.getElementById('fixed-expense-interval-new').value,
        startMonth: parseInt(document.getElementById('fixed-expense-start-month-new').value, 10),
        owner: document.getElementById('fixed-expense-owner-new').value,
        userId: appState.currentUser.uid,
    };

    if (!expenseData.category || isNaN(expenseData.amount) || expenseData.amount <= 0 || isNaN(expenseData.startMonth)) {
        showNotification({ title: "Fejl", message: "Udfyld venligst alle påkrævede felter korrekt." });
        return;
    }

    try {
        if (isEditing) {
            await updateDoc(doc(db, 'fixed_expenses', expenseId), expenseData);
            showNotification({ title: "Opdateret!", message: "Fast udgift er blevet opdateret." });
        } else {
            await addDoc(collection(db, 'fixed_expenses'), expenseData);
            showNotification({ title: "Gemt!", message: "Ny fast udgift er blevet tilføjet." });
        }
        resetFixedExpenseForm();
    } catch (error) {
        handleError(error, "Den faste udgift kunne ikke gemmes.", "handleSaveFixedExpense");
    }
}

/**
 * Handles deleting a fixed expense.
 * @param {string} expenseId - The ID of the expense to delete.
 */
async function handleDeleteFixedExpense(expenseId) {
    const confirmed = await showNotification({
        title: "Slet Udgift",
        message: "Er du sikker på, du vil slette denne faste udgift? Handlingen kan ikke fortrydes.",
        type: 'confirm'
    });

    if (confirmed) {
        try {
            await deleteDoc(doc(db, 'fixed_expenses', expenseId));
            showNotification({ title: "Slettet", message: "Den faste udgift er blevet slettet." });
            resetFixedExpenseForm(); // Clear form if the deleted item was being edited
        } catch (error) {
            handleError(error, "Udgiften kunne ikke slettes.", "handleDeleteFixedExpense");
        }
    }
}

/**
 * Calculates all expenses and renders the main budget grid and totals bar.
 */
function calculateAndRenderBudgetGrid() {
    const selectedOwner = appElements.budgetUserSelector.value;
    const months = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
    const monthlyTotals = Array(12).fill(0);
    const budgetData = {};

    // 1. Process fixed expenses
    appState.fixedExpenses
        .filter(exp => selectedOwner === 'all' || exp.owner === selectedOwner)
        .forEach(exp => {
            if (!budgetData[exp.category]) {
                budgetData[exp.category] = { id: exp.id, monthlyAmounts: Array(12).fill(0), owner: exp.owner };
            }
            
            for (let i = 0; i < 12; i++) {
                let shouldApply = false;
                if (exp.interval === 'månedligt') {
                    shouldApply = true;
                } else if (exp.interval === 'kvartalsvist') {
                    if ((i - exp.startMonth) % 3 === 0 && i >= exp.startMonth) {
                        shouldApply = true;
                    }
                } else if (exp.interval === 'årligt') {
                    if (i === exp.startMonth) {
                        shouldApply = true;
                    }
                }
                if (shouldApply) {
                    budgetData[exp.category].monthlyAmounts[i] += exp.amount;
                }
            }
        });

    // 2. Process variable expenses
    appState.expenses
        .filter(exp => {
            const expDate = exp.date.toDate();
            const owner = appState.users.find(u => u.id === exp.userId)?.name || 'Ukendt';
            return expDate.getFullYear() === currentBudgetYear && (selectedOwner === 'all' || owner === selectedOwner);
        })
        .forEach(exp => {
            const owner = appState.users.find(u => u.id === exp.userId)?.name || 'Ukendt';
            if (!budgetData[exp.category]) {
                budgetData[exp.category] = { id: null, monthlyAmounts: Array(12).fill(0), owner: owner };
            }
            const monthIndex = exp.date.toDate().getMonth();
            budgetData[exp.category].monthlyAmounts[monthIndex] += exp.amount;
        });

    // 3. Render Grid
    const container = appElements.budgetGridContainer;
    const headerHtml = `
        <div class="budget-grid-row budget-grid-header">
            <div class="budget-grid-cell header-cell category-cell">Kategori</div>
            ${months.map(month => `<div class="budget-grid-cell header-cell">${month}</div>`).join('')}
            <div class="budget-grid-cell header-cell">Årstotal</div>
            <div class="budget-grid-cell header-cell actions-cell"></div>
        </div>
    `;

    const sortedCategories = Object.keys(budgetData).sort((a, b) => a.localeCompare(b));
    const bodyHtml = sortedCategories.map(category => {
        const data = budgetData[category];
        const yearlyTotal = data.monthlyAmounts.reduce((sum, amount) => sum + amount, 0);
        
        data.monthlyAmounts.forEach((amount, index) => {
            monthlyTotals[index] += amount;
        });

        const actionsHtml = data.id // Only fixed expenses have an ID and can be edited/deleted
            ? `<div class="actions">
                   <button class="btn-icon edit-fixed-expense-btn" data-id="${data.id}"><i class="fas fa-edit"></i></button>
                   <button class="btn-icon delete-fixed-expense-btn" data-id="${data.id}"><i class="fas fa-trash"></i></button>
               </div>`
            : '';

        return `
            <div class="budget-grid-row">
                <div class="budget-grid-cell category-cell">${category} <span class="owner-tag">(${data.owner})</span></div>
                ${data.monthlyAmounts.map(amount => `<div class="budget-grid-cell">${amount > 0 ? amount.toFixed(2).replace('.', ',') : '-'}</div>`).join('')}
                <div class="budget-grid-cell total-cell">${yearlyTotal.toFixed(2).replace('.', ',')}</div>
                <div class="budget-grid-cell actions-cell">${actionsHtml}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="budget-grid">${headerHtml}${bodyHtml}</div>`;
    
    // 4. Render Totals Bar
    const totalsBar = appElements.budgetTotalsBar;
    const totalHeaderHtml = `<div class="budget-totals-cell header-cell">Månedstotal</div>`;
    const totalBodyHtml = monthlyTotals.map(total => `<div class="budget-totals-cell">${total.toFixed(2).replace('.', ',')}</div>`).join('');
    const grandTotal = monthlyTotals.reduce((sum, total) => sum + total, 0);
    const grandTotalHtml = `<div class="budget-totals-cell grand-total-cell">${grandTotal.toFixed(2).replace('.', ',')}</div>`;
    
    totalsBar.innerHTML = totalHeaderHtml + totalBodyHtml + grandTotalHtml;
}
