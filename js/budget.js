// js/budget.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleError, showNotification } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;
let currentYear;
let currentMonth;

/**
 * Initializes the new budget module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
export function initBudget(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        budgetPage: document.getElementById('budget'),
    };
    
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();

    // Event delegation for the entire budget page
    if (appElements.budgetPage) {
        appElements.budgetPage.addEventListener('submit', handleFormSubmit);
        appElements.budgetPage.addEventListener('click', handleButtonClick);
    }
}

/**
 * Renders the entire budget page from scratch based on the new vision.
 */
export function renderBudgetPage() {
    if (!appElements.budgetPage) return;

    const pageContent = `
        <div class="budget-container">
            <div class="budget-form-container">
                <h3 id="budget-form-title">Tilføj ny post</h3>
                <form id="budget-entry-form">
                    <input type="hidden" id="budget-entry-id">
                    <div class="form-grid-3-col">
                        <div class="input-group">
                            <label for="budget-entry-type">Type</label>
                            <select id="budget-entry-type" required>
                                <option value="udgift">Udgift</option>
                                <option value="indtægt">Indtægt</option>
                            </select>
                        </div>
                        <div class="input-group">
                            <label for="budget-entry-category">Kategori</label>
                            <input type="text" id="budget-entry-category" required>
                        </div>
                        <div class="input-group">
                            <label for="budget-entry-amount">Beløb (kr.)</label>
                            <input type="number" id="budget-entry-amount" step="0.01" required>
                        </div>
                        <div class="input-group">
                            <label for="budget-entry-interval">Interval</label>
                            <select id="budget-entry-interval" required>
                                <option value="monthly">Månedligt</option>
                                <option value="quarterly">Kvartalsvist</option>
                                <option value="yearly">Årligt</option>
                                <option value="once">Én gang</option>
                            </select>
                        </div>
                        <div class="input-group">
                            <label for="budget-entry-start-date">Start / Betalingsdato</label>
                            <input type="date" id="budget-entry-start-date" required>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="button" id="clear-budget-form-btn" class="btn btn-secondary">Ryd</button>
                        <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i> Gem Post</button>
                    </div>
                </form>
            </div>
            <hr>
            <div class="budget-grid-header">
                <h2>Budgetoversigt</h2>
                <div class="budget-nav">
                    <button id="prev-year-btn" class="btn btn-secondary"><i class="fas fa-chevron-left"></i></button>
                    <span id="budget-year-display">${currentYear}</span>
                    <button id="next-year-btn" class="btn btn-secondary"><i class="fas fa-chevron-right"></i></button>
                </div>
            </div>
            <div id="budget-grid-container" class="budget-grid-container">
                <!-- Grid will be rendered here by JS -->
            </div>
        </div>
    `;
    appElements.budgetPage.innerHTML = pageContent;
    renderBudgetGrid();
}

/**
 * Calculates and renders the main budget grid.
 */
function renderBudgetGrid() {
    const container = document.getElementById('budget-grid-container');
    if (!container) return;

    const months = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];
    const monthlyTotals = Array(12).fill(0);
    const budgetEntries = appState.budgetEntries || [];

    // --- Grid Header ---
    const headerHtml = `
        <div class="budget-grid-cell header-cell category-header">Kategori</div>
        ${months.map(m => `<div class="budget-grid-cell header-cell">${m}</div>`).join('')}
        <div class="budget-grid-cell header-cell"></div> <!-- Actions column -->
    `;

    // --- Grid Body (Entries) ---
    const bodyHtml = budgetEntries
        .sort((a, b) => a.category.localeCompare(b.category))
        .map(entry => {
            const rowCells = Array(12).fill(0);
            const startDate = new Date(entry.startDate);
            const startMonth = startDate.getMonth();
            const startYear = startDate.getFullYear();
            const amount = entry.type === 'indtægt' ? entry.amount : -entry.amount;

            for (let i = 0; i < 12; i++) {
                const currentCellDate = new Date(currentYear, i, 1);
                
                if (currentYear > startYear || (currentYear === startYear && i >= startMonth)) {
                    if (entry.interval === 'monthly') {
                        rowCells[i] = amount;
                    } else if (entry.interval === 'quarterly' && (i - startMonth) % 3 === 0) {
                        rowCells[i] = amount;
                    } else if (entry.interval === 'yearly' && i === startMonth) {
                        rowCells[i] = amount;
                    } else if (entry.interval === 'once' && currentYear === startYear && i === startMonth) {
                        rowCells[i] = amount;
                    }
                }
            }
            
            // Add this row's values to the monthly totals
            rowCells.forEach((val, index) => monthlyTotals[index] += val);

            const rowClass = entry.type === 'indtægt' ? 'income-row' : 'expense-row';
            return `
                <div class="budget-grid-cell category-cell ${rowClass}">${entry.category}</div>
                ${rowCells.map(val => `<div class="budget-grid-cell ${val >= 0 ? 'income' : 'expense'}">${val !== 0 ? val.toLocaleString('da-DK') : '-'}</div>`).join('')}
                <div class="budget-grid-cell actions-cell">
                    <button class="btn-icon edit-entry-btn" data-id="${entry.id}"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete-entry-btn" data-id="${entry.id}"><i class="fas fa-trash"></i></button>
                </div>
            `;
        }).join('');

    // --- Grid Footer (Totals) ---
    const footerHtml = `
        <div class="budget-grid-cell total-header-cell">Total</div>
        ${monthlyTotals.map(total => `<div class="budget-grid-cell total-cell ${total >= 0 ? 'income' : 'expense'}">${total.toLocaleString('da-DK')} kr.</div>`).join('')}
        <div class="budget-grid-cell"></div>
    `;

    container.innerHTML = `<div class="budget-grid">${headerHtml}${bodyHtml}${footerHtml}</div>`;
}

/**
 * Handles all form submissions on the budget page.
 * @param {Event} e - The submit event.
 */
function handleFormSubmit(e) {
    if (e.target.id === 'budget-entry-form') {
        e.preventDefault();
        handleSaveBudgetEntry();
    }
}

/**
 * Handles all button clicks on the budget page.
 * @param {Event} e - The click event.
 */
function handleButtonClick(e) {
    const target = e.target.closest('button');
    if (!target) return;

    if (target.id === 'clear-budget-form-btn') {
        resetFixedExpenseForm();
    } else if (target.id === 'prev-year-btn') {
        currentYear--;
        renderBudgetPage();
    } else if (target.id === 'next-year-btn') {
        currentYear++;
        renderBudgetPage();
    } else if (target.classList.contains('edit-entry-btn')) {
        populateFormForEdit(target.dataset.id);
    } else if (target.classList.contains('delete-entry-btn')) {
        handleDeleteBudgetEntry(target.dataset.id);
    }
}

/**
 * Saves a new or updated budget entry to Firestore.
 */
async function handleSaveBudgetEntry() {
    const entryId = document.getElementById('budget-entry-id').value;
    const entryData = {
        type: document.getElementById('budget-entry-type').value,
        category: document.getElementById('budget-entry-category').value.trim(),
        amount: parseFloat(document.getElementById('budget-entry-amount').value),
        interval: document.getElementById('budget-entry-interval').value,
        startDate: document.getElementById('budget-entry-start-date').value,
        userId: appState.currentUser.uid,
        lastUpdated: serverTimestamp()
    };

    if (!entryData.category || isNaN(entryData.amount) || !entryData.startDate) {
        showNotification({ title: "Udfyld alle felter", message: "Kategori, beløb og startdato er påkrævet." });
        return;
    }

    try {
        if (entryId) {
            await updateDoc(doc(db, 'budget_entries', entryId), entryData);
            showNotification({ title: "Opdateret", message: "Budgetposten er blevet opdateret." });
        } else {
            await addDoc(collection(db, 'budget_entries'), entryData);
            showNotification({ title: "Gemt", message: "Den nye budgetpost er blevet tilføjet." });
        }
        resetFixedExpenseForm();
    } catch (error) {
        handleError(error, "Budgetposten kunne ikke gemmes.", "saveBudgetEntry");
    }
}

/**
 * Deletes a budget entry from Firestore.
 * @param {string} entryId - The ID of the entry to delete.
 */
async function handleDeleteBudgetEntry(entryId) {
    const confirmed = await showNotification({
        title: "Slet Post",
        message: "Er du sikker på, du vil slette denne budgetpost permanent?",
        type: 'confirm'
    });

    if (confirmed) {
        try {
            await deleteDoc(doc(db, 'budget_entries', entryId));
            showNotification({ title: "Slettet", message: "Budgetposten er blevet fjernet." });
        } catch (error) {
            handleError(error, "Posten kunne ikke slettes.", "deleteBudgetEntry");
        }
    }
}

/**
 * Populates the form with data from an existing entry for editing.
 * @param {string} entryId - The ID of the entry to edit.
 */
function populateFormForEdit(entryId) {
    const entry = appState.budgetEntries.find(e => e.id === entryId);
    if (!entry) return;

    document.getElementById('budget-entry-id').value = entry.id;
    document.getElementById('budget-entry-type').value = entry.type;
    document.getElementById('budget-entry-category').value = entry.category;
    document.getElementById('budget-entry-amount').value = entry.amount;
    document.getElementById('budget-entry-interval').value = entry.interval;
    document.getElementById('budget-entry-start-date').value = entry.startDate;
    
    document.getElementById('budget-form-title').textContent = 'Rediger Post';
    document.querySelector('#budget-entry-form button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Opdater Post';
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Resets the budget entry form to its default state.
 */
function resetFixedExpenseForm() {
    document.getElementById('budget-entry-form').reset();
    document.getElementById('budget-entry-id').value = '';
    document.getElementById('budget-form-title').textContent = 'Tilføj ny post';
    document.querySelector('#budget-entry-form button[type="submit"]').innerHTML = '<i class="fas fa-plus"></i> Gem Post';
}
