// js/budget.js
import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleError, showNotification } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;
let currentBudgetYear = new Date().getFullYear();

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
    
    if (appElements.addFixedExpenseForm) appElements.addFixedExpenseForm.addEventListener('submit', handleSaveFixedExpense);
    if (appElements.clearFixedExpenseFormBtn) appElements.clearFixedExpenseFormBtn.addEventListener('click', resetFixedExpenseForm);
    if (appElements.budgetUserSelector) appElements.budgetUserSelector.addEventListener('change', renderBudgetPage);
    if (appElements.prevYearBtn) appElements.prevYearBtn.addEventListener('click', () => { currentBudgetYear--; renderBudgetPage(); });
    if (appElements.nextYearBtn) appElements.nextYearBtn.addEventListener('click', () => { currentBudgetYear++; renderBudgetPage(); });

    if (appElements.budgetGridContainer) {
        appElements.budgetGridContainer.addEventListener('click', e => {
            const editBtn = e.target.closest('.edit-fixed-expense-btn');
            const deleteBtn = e.target.closest('.delete-fixed-expense-btn');
            if (editBtn) populateFormForEdit(editBtn.dataset.id);
            if (deleteBtn) handleDeleteFixedExpense(deleteBtn.dataset.id);
        });
    }
}

export function renderBudgetPage() {
    if (!appState.fixedExpenses || !appState.expenses) return;
    appElements.budgetYearDisplay.textContent = currentBudgetYear;
    populateDropdowns();
    calculateAndRenderBudgetGrid();
}

function populateDropdowns() {
    const ownerSelect = document.getElementById('fixed-expense-owner-new');
    const userSelector = appElements.budgetUserSelector;
    const householdMembers = appState.references.householdMembers || [];
    const currentUser = appState.currentUser?.displayName || appState.currentUser?.email.split('@')[0];
    
    [ownerSelect, userSelector].forEach(select => {
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML = '';
        if (select === userSelector) select.add(new Option('Hele Husstanden', 'all'));
        householdMembers.forEach(member => select.add(new Option(member, member)));
        select.value = currentValue && householdMembers.includes(currentValue) ? currentValue : (select === ownerSelect ? (householdMembers.includes(currentUser) ? currentUser : '') : 'all');
    });
}

function resetFixedExpenseForm() {
    appElements.addFixedExpenseForm.reset();
    document.getElementById('fixed-expense-id').value = '';
    document.getElementById('fixed-expense-start-date-new').value = formatDate(new Date());
    populateDropdowns();
    appElements.addFixedExpenseForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-plus"></i> Gem Udgift';
}

function populateFormForEdit(expenseId) {
    const expense = appState.fixedExpenses.find(exp => exp.id === expenseId);
    if (!expense) return;
    document.getElementById('fixed-expense-id').value = expense.id;
    document.getElementById('fixed-expense-name-new').value = expense.name;
    document.getElementById('fixed-expense-category-new').value = expense.category;
    document.getElementById('fixed-expense-amount-new').value = expense.amount;
    document.getElementById('fixed-expense-interval-new').value = expense.interval;
    document.getElementById('fixed-expense-start-date-new').value = expense.startDate;
    document.getElementById('fixed-expense-owner-new').value = expense.owner;
    appElements.addFixedExpenseForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Opdater Udgift';
    window.scrollTo({ top: appElements.addFixedExpenseForm.offsetTop, behavior: 'smooth' });
}

async function handleSaveFixedExpense(e) {
    e.preventDefault();
    const expenseId = document.getElementById('fixed-expense-id').value;
    const expenseData = {
        name: document.getElementById('fixed-expense-name-new').value.trim(),
        category: document.getElementById('fixed-expense-category-new').value.trim(),
        amount: parseFloat(document.getElementById('fixed-expense-amount-new').value),
        interval: document.getElementById('fixed-expense-interval-new').value,
        startDate: document.getElementById('fixed-expense-start-date-new').value,
        owner: document.getElementById('fixed-expense-owner-new').value,
        userId: appState.currentUser.uid,
    };

    if (!expenseData.name || !expenseData.category || isNaN(expenseData.amount) || !expenseData.startDate || !expenseData.owner) {
        showNotification({ title: "Fejl", message: "Udfyld venligst alle påkrævede felter." });
        return;
    }

    try {
        if (expenseId) {
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

async function handleDeleteFixedExpense(expenseId) {
    const confirmed = await showNotification({ title: "Slet Udgift", message: "Er du sikker på?", type: 'confirm' });
    if (confirmed) {
        try {
            await deleteDoc(doc(db, 'fixed_expenses', expenseId));
            showNotification({ title: "Slettet", message: "Den faste udgift er blevet slettet." });
            resetFixedExpenseForm();
        } catch (error) {
            handleError(error, "Udgiften kunne ikke slettes.", "handleDeleteFixedExpense");
        }
    }
}

function calculateAndRenderBudgetGrid() {
    const selectedOwner = appElements.budgetUserSelector.value;
    const months = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
    const monthlyTotals = Array(12).fill(0);
    const budgetData = {};

    appState.fixedExpenses
        .filter(exp => selectedOwner === 'all' || exp.owner === selectedOwner)
        .forEach(exp => {
            const key = `${exp.category}-${exp.name}-${exp.owner}`;
            if (!budgetData[key]) {
                budgetData[key] = { id: exp.id, category: exp.category, name: exp.name, monthlyAmounts: Array(12).fill(0), owner: exp.owner };
            }
            const startDate = new Date(exp.startDate);
            const startMonth = startDate.getMonth();
            const startYear = startDate.getFullYear();

            for (let i = 0; i < 12; i++) {
                const currentMonthDate = new Date(currentBudgetYear, i, startDate.getDate());
                if (currentMonthDate < startDate) continue;

                let shouldApply = false;
                if (exp.interval === 'månedligt') {
                    shouldApply = true;
                } else if (exp.interval === 'kvartalsvist' && (i - startMonth) % 3 === 0) {
                    shouldApply = true;
                } else if (exp.interval === 'årligt' && i === startMonth) {
                    shouldApply = true;
                }
                if (shouldApply) budgetData[key].monthlyAmounts[i] += exp.amount;
            }
        });

    const container = appElements.budgetGridContainer;
    const headerHtml = `
        <div class="budget-grid-row budget-grid-header">
            <div class="budget-grid-cell header-cell category-cell">Kategori / Navn</div>
            ${months.map(month => `<div class="budget-grid-cell header-cell">${month}</div>`).join('')}
            <div class="budget-grid-cell header-cell">Årstotal</div>
            <div class="budget-grid-cell header-cell actions-cell"></div>
        </div>`;

    const sortedKeys = Object.keys(budgetData).sort((a, b) => a.localeCompare(b));
    const bodyHtml = sortedKeys.map(key => {
        const data = budgetData[key];
        const yearlyTotal = data.monthlyAmounts.reduce((sum, amount) => sum + amount, 0);
        data.monthlyAmounts.forEach((amount, index) => monthlyTotals[index] += amount);
        const actionsHtml = `<div class="actions"><button class="btn-icon edit-fixed-expense-btn" data-id="${data.id}"><i class="fas fa-edit"></i></button><button class="btn-icon delete-fixed-expense-btn" data-id="${data.id}"><i class="fas fa-trash"></i></button></div>`;
        return `
            <div class="budget-grid-row">
                <div class="budget-grid-cell category-cell">${data.category} - ${data.name} <span class="owner-tag">(${data.owner})</span></div>
                ${data.monthlyAmounts.map(amount => `<div class="budget-grid-cell">${amount > 0 ? amount.toFixed(2).replace('.', ',') : '-'}</div>`).join('')}
                <div class="budget-grid-cell total-cell">${yearlyTotal.toFixed(2).replace('.', ',')}</div>
                <div class="budget-grid-cell actions-cell">${actionsHtml}</div>
            </div>`;
    }).join('');

    container.innerHTML = `<div class="budget-grid">${headerHtml}${bodyHtml || `<div class="empty-grid-row"><div class="budget-grid-cell empty-state">Ingen faste udgifter fundet for i år.</div></div>`}</div>`;
    
    const totalsBar = appElements.budgetTotalsBar;
    const grandTotal = monthlyTotals.reduce((sum, total) => sum + total, 0);
    totalsBar.innerHTML = `
        <div class="budget-totals-cell header-cell">Månedstotal</div>
        ${monthlyTotals.map(total => `<div class="budget-totals-cell">${total.toFixed(2).replace('.', ',')}</div>`).join('')}
        <div class="budget-totals-cell grand-total-cell">${grandTotal.toFixed(2).replace('.', ',')}</div>
        <div class="budget-totals-cell"></div>`;
}
