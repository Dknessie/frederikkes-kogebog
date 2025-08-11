// js/budget.js
// Dette modul håndterer logikken og visningen for den nye Budget-side.

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleError, showNotification } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;
let budgetState = {
    currentYear: new Date().getFullYear(),
    selectedOwner: 'all',
    selectedMainCategory: 'all'
};

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
        addExpenseSplitBtn: document.getElementById('add-expense-split-btn'),
        expenseSplitContainer: document.getElementById('expense-split-container'),
        budgetMainCategoryFilter: document.getElementById('budget-main-category-filter'),
    };
    
    if (appElements.addFixedExpenseForm) {
        appElements.addFixedExpenseForm.addEventListener('submit', handleSaveFixedExpense);
        appElements.addFixedExpenseForm.addEventListener('input', updateTotalAmountIndicator);
    }
    if (appElements.clearFixedExpenseFormBtn) {
        appElements.clearFixedExpenseFormBtn.addEventListener('click', resetFixedExpenseForm);
    }
    if (appElements.addExpenseSplitBtn) {
        appElements.addExpenseSplitBtn.addEventListener('click', () => createSplitRow());
    }
    if(appElements.expenseSplitContainer) {
        appElements.expenseSplitContainer.addEventListener('click', (e) => {
            if(e.target.closest('.remove-split-btn')) {
                e.target.closest('.expense-split-row').remove();
                updateTotalAmountIndicator();
            }
        });
    }
    
    if (appElements.budgetUserSelector) {
        appElements.budgetUserSelector.addEventListener('change', (e) => {
            budgetState.selectedOwner = e.target.value;
            renderBudgetPage();
        });
    }
    if (appElements.budgetMainCategoryFilter) {
        appElements.budgetMainCategoryFilter.addEventListener('change', (e) => {
            budgetState.selectedMainCategory = e.target.value;
            renderBudgetPage();
        });
    }

    if (appElements.prevYearBtn) {
        appElements.prevYearBtn.addEventListener('click', () => {
            budgetState.currentYear--;
            renderBudgetPage();
        });
    }
    if (appElements.nextYearBtn) {
        appElements.nextYearBtn.addEventListener('click', () => {
            budgetState.currentYear++;
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

    appElements.budgetYearDisplay.textContent = budgetState.currentYear;
    populateDropdowns();
    calculateAndRenderBudgetGrid();
}

/**
 * Populates all necessary dropdowns on the page.
 */
function populateDropdowns() {
    const ownerSelect = document.getElementById('fixed-expense-owner-new');
    const userSelector = appElements.budgetUserSelector;
    const mainCategoryFilter = appElements.budgetMainCategoryFilter;

    // Populate user/owner dropdowns
    const householdMembers = appState.references.householdMembers || [];
    [ownerSelect, userSelector].forEach(select => {
        if (!select) return;
        const currentValue = select.value;
        select.innerHTML = ''; 
        if (select === userSelector) select.add(new Option('Hele Husstanden', 'all'));
        householdMembers.forEach(member => select.add(new Option(member, member)));
        select.value = currentValue || (select === userSelector ? 'all' : (appState.currentUser?.displayName || ''));
    });

    // Populate main category filter
    const budgetCategories = (appState.references.budgetCategories || []).map(c => c.name);
    populateReferenceDropdown(mainCategoryFilter, budgetCategories, "Alle Hovedkategorier", budgetState.selectedMainCategory);
}

function resetFixedExpenseForm() {
    appElements.addFixedExpenseForm.reset();
    document.getElementById('fixed-expense-id').value = '';
    document.getElementById('fixed-expense-owner-new').value = appState.currentUser?.displayName || '';
    document.getElementById('fixed-expense-start-date').value = formatDate(new Date());
    appElements.expenseSplitContainer.innerHTML = '';
    createSplitRow();
    updateTotalAmountIndicator();
    appElements.addFixedExpenseForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Gem Udgift';
}

function populateFormForEdit(expenseId) {
    const expense = appState.fixedExpenses.find(exp => exp.id === expenseId);
    if (!expense) return;

    resetFixedExpenseForm();
    document.getElementById('fixed-expense-id').value = expense.id;
    document.getElementById('fixed-expense-title').value = expense.title;
    document.getElementById('fixed-expense-total-amount').value = expense.totalAmount;
    document.getElementById('fixed-expense-start-date').value = expense.startDate;
    document.getElementById('fixed-expense-end-date').value = expense.endDate || '';
    document.getElementById('fixed-expense-interval-new').value = expense.interval;
    document.getElementById('fixed-expense-owner-new').value = expense.owner;
    
    appElements.expenseSplitContainer.innerHTML = '';
    if (expense.splits && expense.splits.length > 0) {
        expense.splits.forEach(split => createSplitRow(split));
    } else { // Handle old format for backward compatibility
        createSplitRow({ mainCategory: expense.category, subCategory: '', amount: expense.amount });
    }
    
    updateTotalAmountIndicator();
    appElements.addFixedExpenseForm.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Opdater Udgift';
    window.scrollTo({ top: appElements.addFixedExpenseForm.offsetTop, behavior: 'smooth' });
}

async function handleSaveFixedExpense(e) {
    e.preventDefault();
    const expenseId = document.getElementById('fixed-expense-id').value;
    const isEditing = !!expenseId;

    const splits = [];
    let splitSum = 0;
    document.querySelectorAll('.expense-split-row').forEach(row => {
        const amount = parseFloat(row.querySelector('.split-amount').value);
        if (amount > 0) {
            splits.push({
                mainCategory: row.querySelector('.split-main-category').value,
                subCategory: row.querySelector('.split-sub-category').value,
                amount: amount
            });
            splitSum += amount;
        }
    });

    const totalAmount = parseFloat(document.getElementById('fixed-expense-total-amount').value);
    if (Math.abs(totalAmount - splitSum) > 0.01) { // Allow for floating point inaccuracies
        showNotification({ title: "Fejl i opdeling", message: `Summen af dine opdelinger (${splitSum.toFixed(2)} kr) matcher ikke det totale beløb (${totalAmount.toFixed(2)} kr).` });
        return;
    }

    const expenseData = {
        title: document.getElementById('fixed-expense-title').value.trim(),
        totalAmount: totalAmount,
        startDate: document.getElementById('fixed-expense-start-date').value,
        endDate: document.getElementById('fixed-expense-end-date').value || null,
        interval: document.getElementById('fixed-expense-interval-new').value,
        owner: document.getElementById('fixed-expense-owner-new').value,
        splits: splits,
        userId: appState.currentUser.uid,
    };

    if (!expenseData.title || isNaN(expenseData.totalAmount) || !expenseData.startDate) {
        showNotification({ title: "Fejl", message: "Udfyld venligst Titel, Total Beløb og Startdato." });
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
            resetFixedExpenseForm();
        } catch (error) {
            handleError(error, "Udgiften kunne ikke slettes.", "handleDeleteFixedExpense");
        }
    }
}

function calculateAndRenderBudgetGrid() {
    const months = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
    const monthlyTotals = Array(12).fill(0);
    const budgetData = {}; // { mainCat: { subCat: { monthlyAmounts: [], owner, id }, ... }, ... }

    // 1. Process fixed expenses
    appState.fixedExpenses
        .filter(exp => budgetState.selectedOwner === 'all' || exp.owner === budgetState.selectedOwner)
        .forEach(exp => {
            for (let i = 0; i < 12; i++) {
                const monthDate = new Date(budgetState.currentYear, i, 15); // Use mid-month to avoid timezone issues
                const startDate = new Date(exp.startDate);
                const endDate = exp.endDate ? new Date(exp.endDate) : null;
                
                if (monthDate < startDate || (endDate && monthDate > endDate)) continue;

                let shouldApply = false;
                if (exp.interval === 'månedligt') {
                    shouldApply = true;
                } else if (exp.interval === 'kvartalsvist') {
                    if ((i - startDate.getMonth()) % 3 === 0) shouldApply = true;
                } else if (exp.interval === 'årligt') {
                    if (i === startDate.getMonth()) shouldApply = true;
                }
                
                if (shouldApply) {
                    exp.splits.forEach(split => {
                        if (budgetState.selectedMainCategory !== 'all' && split.mainCategory !== budgetState.selectedMainCategory) return;

                        if (!budgetData[split.mainCategory]) budgetData[split.mainCategory] = {};
                        if (!budgetData[split.mainCategory][split.subCategory]) {
                            budgetData[split.mainCategory][split.subCategory] = { id: exp.id, monthlyAmounts: Array(12).fill(0), owner: exp.owner };
                        }
                        budgetData[split.mainCategory][split.subCategory].monthlyAmounts[i] += split.amount;
                    });
                }
            }
        });

    // 2. Process variable expenses (simplified for now)
    // This part can be expanded to also use the new category system
    appState.expenses
        .filter(exp => {
            const expDate = exp.date.toDate();
            const owner = appState.users.find(u => u.id === exp.userId)?.name || 'Ukendt';
            return expDate.getFullYear() === budgetState.currentYear && (budgetState.selectedOwner === 'all' || owner === budgetState.selectedOwner);
        })
        .forEach(exp => {
            if (budgetState.selectedMainCategory !== 'all' && exp.category !== budgetState.selectedMainCategory) return;
            const mainCat = exp.category || 'Variable Udgifter';
            const subCat = exp.description || 'Diverse';
            if (!budgetData[mainCat]) budgetData[mainCat] = {};
            if (!budgetData[mainCat][subCat]) {
                 budgetData[mainCat][subCat] = { id: null, monthlyAmounts: Array(12).fill(0), owner: 'Variabel' };
            }
            const monthIndex = exp.date.toDate().getMonth();
            budgetData[mainCat][subCat].monthlyAmounts[monthIndex] += exp.amount;
        });

    // 3. Render Grid
    const container = appElements.budgetGridContainer;
    container.innerHTML = '';
    const sortedMainCats = Object.keys(budgetData).sort((a, b) => a.localeCompare(b));

    if (sortedMainCats.length === 0) {
        container.innerHTML = '<p class="empty-state">Ingen udgifter fundet for de valgte filtre.</p>';
        appElements.budgetTotalsBar.innerHTML = '';
        return;
    }

    sortedMainCats.forEach(mainCat => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'budget-group';
        
        const headerHtml = `
            <div class="budget-grid-row budget-grid-header">
                <div class="budget-grid-cell header-cell category-cell">${mainCat}</div>
                ${months.map(month => `<div class="budget-grid-cell header-cell">${month}</div>`).join('')}
                <div class="budget-grid-cell header-cell">Årstotal</div>
                <div class="budget-grid-cell header-cell actions-cell"></div>
            </div>`;

        const sortedSubCats = Object.keys(budgetData[mainCat]).sort((a, b) => a.localeCompare(b));
        let mainCatTotal = 0;

        const bodyHtml = sortedSubCats.map(subCat => {
            const data = budgetData[mainCat][subCat];
            const yearlyTotal = data.monthlyAmounts.reduce((sum, amount) => sum + amount, 0);
            mainCatTotal += yearlyTotal;
            
            data.monthlyAmounts.forEach((amount, index) => monthlyTotals[index] += amount);

            const actionsHtml = data.id
                ? `<div class="actions">
                       <button class="btn-icon edit-fixed-expense-btn" data-id="${data.id}"><i class="fas fa-edit"></i></button>
                       <button class="btn-icon delete-fixed-expense-btn" data-id="${data.id}"><i class="fas fa-trash"></i></button>
                   </div>`
                : '';

            return `
                <div class="budget-grid-row">
                    <div class="budget-grid-cell category-cell sub-category-cell">${subCat} <span class="owner-tag">(${data.owner})</span></div>
                    ${data.monthlyAmounts.map(amount => `<div class="budget-grid-cell">${amount > 0 ? amount.toFixed(2).replace('.', ',') : '-'}</div>`).join('')}
                    <div class="budget-grid-cell total-cell">${yearlyTotal.toFixed(2).replace('.', ',')}</div>
                    <div class="budget-grid-cell actions-cell">${actionsHtml}</div>
                </div>`;
        }).join('');
        
        groupDiv.innerHTML = `<div class="budget-grid">${headerHtml}${bodyHtml}</div>`;
        container.appendChild(groupDiv);
    });
    
    // 4. Render Totals Bar
    const grandTotal = monthlyTotals.reduce((sum, total) => sum + total, 0);
    appElements.budgetTotalsBar.innerHTML = `
        <div class="budget-totals-cell header-cell">Grand Total</div>
        ${monthlyTotals.map(total => `<div class="budget-totals-cell">${total.toFixed(2).replace('.', ',')}</div>`).join('')}
        <div class="budget-totals-cell grand-total-cell">${grandTotal.toFixed(2).replace('.', ',')}</div>
        <div class="budget-totals-cell"></div>
    `;
}

// Helper Functions for Form
function createSplitRow(split = { mainCategory: '', subCategory: '', amount: '' }) {
    const container = appElements.expenseSplitContainer;
    const row = document.createElement('div');
    row.className = 'expense-split-row';

    const mainCatSelect = document.createElement('select');
    mainCatSelect.className = 'split-main-category';
    const subCatSelect = document.createElement('select');
    subCatSelect.className = 'split-sub-category';

    const budgetCategories = appState.references.budgetCategories || [];
    populateReferenceDropdown(mainCatSelect, budgetCategories.map(c => c.name), 'Vælg Hovedkategori...', split.mainCategory);
    
    mainCatSelect.addEventListener('change', () => {
        const selectedMain = budgetCategories.find(c => c.name === mainCatSelect.value);
        populateReferenceDropdown(subCatSelect, selectedMain?.subcategories || [], 'Vælg Underkategori...', split.subCategory);
    });
    mainCatSelect.dispatchEvent(new Event('change')); // Trigger change to populate subcategories initially

    row.innerHTML = `
        <div class="input-group"></div>
        <div class="input-group"></div>
        <div class="input-group">
            <input type="number" class="split-amount" placeholder="Beløb" step="0.01" value="${split.amount}" required>
        </div>
        <button type="button" class="btn-icon remove-split-btn"><i class="fas fa-trash"></i></button>
    `;
    row.children[0].appendChild(mainCatSelect);
    row.children[1].appendChild(subCatSelect);
    container.appendChild(row);
}

function updateTotalAmountIndicator() {
    const totalAmount = parseFloat(document.getElementById('fixed-expense-total-amount').value) || 0;
    let splitSum = 0;
    document.querySelectorAll('.split-amount').forEach(input => {
        splitSum += parseFloat(input.value) || 0;
    });
    
    const indicator = document.getElementById('split-sum-indicator');
    const difference = totalAmount - splitSum;
    
    if (Math.abs(difference) < 0.01) {
        indicator.textContent = `(Opdelt beløb matcher total)`;
        indicator.className = 'split-sum-indicator status-green';
    } else {
        indicator.textContent = `(Difference: ${difference.toFixed(2).replace('.',',')} kr)`;
        indicator.className = 'split-sum-indicator status-red';
    }
}

function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    if (currentValue) {
        selectElement.value = currentValue;
    }
}
