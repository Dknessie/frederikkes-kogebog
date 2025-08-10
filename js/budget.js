// js/budget.js
// Dette modul håndterer logikken og visningen for den nye Budget-side.

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { initUI, handleError, showNotification } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;

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
    };

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

}

/**
 * Renders the entire budget page.
 */
export function renderBudgetPage() {
    if (!appState.expenses || !appElements.monthlyExpensesChart) {
        return;
    }

    const monthlyExpenses = calculateMonthlyExpensesByCategory();
    renderPieChart(monthlyExpenses);
    renderCategoryList(monthlyExpenses);
    renderFixedExpensesList();
}

/**
 * Calculates the total monthly expenses grouped by category.
 * @returns {Array<{category: string, amount: number}>} An array of expense objects.
 */
function calculateMonthlyExpensesByCategory() {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const expensesByCategory = {};

    // Inkluderer faste udgifter
    appState.fixedExpenses.forEach(exp => {
        const category = exp.category || 'Faste udgifter';
        let amount = exp.amount;
        if (exp.interval === 'kvartalsvist') {
            amount = exp.amount / 3;
        } else if (exp.interval === 'årligt') {
            amount = exp.amount / 12;
        }

        if (!expensesByCategory[category]) {
            expensesByCategory[category] = 0;
        }
        expensesByCategory[category] += amount;
    });

    // Inkluderer variable udgifter
    appState.expenses.forEach(expense => {
        if (!expense.date || !expense.date.toDate) return;
        const expenseDate = expense.date.toDate();
        if (expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear) {
            const category = expense.category || 'Andet';
            if (!expensesByCategory[category]) {
                expensesByCategory[category] = 0;
            }
            expensesByCategory[category] += expense.amount;
        }
    });

    return Object.entries(expensesByCategory).map(([category, amount]) => ({
        category,
        amount
    }));
}

/**
 * Renders a pie chart of the monthly expenses using D3.js.
 * @param {Array<{category: string, amount: number}>} data - The expense data.
 */
function renderPieChart(data) {
    const container = appElements.monthlyExpensesChart;
    if (!container) return;
    
    // Clear previous chart
    container.innerHTML = '';
    
    if (data.length === 0) {
        container.innerHTML = '<p class="empty-state">Ingen udgifter registreret for denne måned.</p>';
        return;
    }

    const width = container.clientWidth;
    const height = 400;
    const radius = Math.min(width, height) / 2;

    const svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${width / 2}, ${height / 2})`);

    const pie = d3.pie()
        .sort(null)
        .value(d => d.amount);

    const arc = d3.arc()
        .innerRadius(radius * 0.6)
        .outerRadius(radius * 0.9);

    const outerArc = d3.arc()
        .innerRadius(radius * 0.9)
        .outerRadius(radius * 0.9);

    const arcs = svg.selectAll("arc")
        .data(pie(data))
        .enter()
        .append("g")
        .attr("class", "arc");

    // Pie chart slices
    arcs.append("path")
        .attr("d", arc)
        .attr("fill", d => colorScale(d.data.category))
        .transition()
        .duration(750)
        .attrTween("d", function(d) {
            const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
            return function(t) {
                return arc(i(t));
            };
        });

    // Add labels
    arcs.append("text")
        .attr("transform", d => `translate(${arc.centroid(d)})`)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .text(d => d.data.category);
}

/**
 * Renders the list of expense categories and their amounts.
 * @param {Array<{category: string, amount: number}>} data - The expense data.
 */
function renderCategoryList(data) {
    const container = appElements.expenseCategoryList;
    if (!container) return;

    if (data.length === 0) {
        container.innerHTML = '<p class="empty-state">Ingen udgifter at vise.</p>';
        return;
    }

    const total = data.reduce((sum, item) => sum + item.amount, 0);

    const listHtml = data.map(item => {
        const percentage = total > 0 ? (item.amount / total) * 100 : 0;
        return `
            <div class="category-item">
                <span class="category-name">${item.category}</span>
                <span>${item.amount.toFixed(2).replace('.', ',')} kr. (${percentage.toFixed(0)}%)</span>
            </div>
        `;
    }).join('');

    container.innerHTML = listHtml;
}

/**
 * Renders the list of fixed expenses.
 */
function renderFixedExpensesList() {
    const container = appElements.budgetFixedExpensesContainer;
    container.innerHTML = '';

    if (appState.fixedExpenses.length === 0) {
        container.innerHTML = `
            <p class="empty-state">Ingen faste udgifter er registreret.</p>
            <form id="add-fixed-expense-form" class="add-fixed-expense-form">
                <div class="input-group">
                    <label for="fixed-expense-name-new">Navn</label>
                    <input type="text" id="fixed-expense-name-new" required>
                </div>
                <div class="form-grid-3-col">
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
        // Re-attach listener to the new form
        document.getElementById('add-fixed-expense-form').addEventListener('submit', handleSaveFixedExpense);
        return;
    }

    const formHtml = `
        <form class="add-fixed-expense-form">
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

    const cardsHtml = appState.fixedExpenses.map(exp => `
        <div class="fixed-expense-card" data-id="${exp.id}">
            <h4>${exp.name}</h4>
            <div class="actions">
                <button class="btn-icon edit-fixed-expense-btn"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete-fixed-expense-btn"><i class="fas fa-trash"></i></button>
            </div>
            <span class="amount">${exp.amount.toFixed(2).replace('.', ',')} kr.</span>
            <span class="interval">${exp.interval}</span>
        </div>
    `).join('');

    container.innerHTML = `
        <h3>Faste Udgifter</h3>
        <p class="small-text">Dette er gentagne udgifter, der automatisk medregnes i dit budget.</p>
        <div id="fixed-expenses-list">
            ${cardsHtml}
        </div>
        <hr>
        <h4>Tilføj ny fast udgift</h4>
        ${formHtml}
    `;
    
    // Re-attach listener to the form inside the rendered list
    document.querySelector('.add-fixed-expense-form').addEventListener('submit', handleSaveFixedExpense);
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

