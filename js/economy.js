// js/economy.js

import { db } from './firebase.js';
import { collection, addDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';

// Lokal state for økonomisiden
let appState;
let economyState = {
    currentDate: new Date(), // Start med den nuværende måned
};

// Funktion til at formatere datoer til YYYY-MM-DD
function formatDate(date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
}

/**
 * Initialiserer hele økonomisiden
 * @param {object} state - Applikationens globale state-objekt
 */
export function initEconomyPage(state) {
    appState = state;
    const pageContainer = document.getElementById('oekonomi');
    if (!pageContainer) return;

    // Byg sidens skelet én gang, hvis den ikke allerede findes
    if (!pageContainer.querySelector('.economy-dashboard-layout')) {
        buildPageSkeleton(pageContainer);
        attachEventListeners(pageContainer);
    }

    // Render altid indholdet, når siden vises
    renderEconomyPage();
}

/**
 * Bygger den grundlæggende HTML-struktur for økonomisiden
 * @param {HTMLElement} container - Container-elementet for økonomisiden (#oekonomi)
 */
function buildPageSkeleton(container) {
    container.innerHTML = `
        <div class="economy-dashboard-layout">
            <div class="economy-header">
                <h2>Mit Økonomiske Overblik</h2>
                <p>Planlæg din fremtid, en krone ad gangen.</p>
            </div>

            <div class="economy-main">
                <div class="economy-month-navigator">
                    <button id="prev-month-btn" class="btn-icon"><i class="fas fa-chevron-left"></i></button>
                    <h3 id="current-month-display"></h3>
                    <button id="next-month-btn" class="btn-icon"><i class="fas fa-chevron-right"></i></button>
                </div>

                <div class="economy-summary-grid">
                    <div class="economy-summary-card">
                        <h4>Total Indkomst</h4>
                        <p id="total-income">0,00 kr.</p>
                    </div>
                    <div class="economy-summary-card">
                        <h4>Total Udgift</h4>
                        <p id="total-expense">0,00 kr.</p>
                    </div>
                    <div class="economy-summary-card">
                        <h4>Månedligt Råderum</h4>
                        <p id="monthly-disposable">0,00 kr.</p>
                    </div>
                </div>

                <div class="new-transaction-form">
                    <h4>Ny Postering</h4>
                    <form id="transaction-form">
                        <div class="input-group">
                            <label for="transaction-description">Beskrivelse</label>
                            <input type="text" id="transaction-description" placeholder="F.eks. Indkøb, Restaurantbesøg" required>
                        </div>
                        <div class="form-grid-2-col">
                            <div class="input-group">
                                <label for="transaction-amount">Beløb (kr.)</label>
                                <input type="number" id="transaction-amount" step="0.01" required>
                            </div>
                            <div class="input-group">
                                <label for="transaction-type">Type</label>
                                <select id="transaction-type" required>
                                    <option value="expense">Udgift</option>
                                    <option value="income">Indkomst</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-grid-2-col">
                            <div class="input-group">
                                <label for="transaction-category">Kategori</label>
                                <select id="transaction-category" required></select>
                            </div>
                            <div class="input-group">
                                <label for="transaction-person">Person</label>
                                <select id="transaction-person" required></select>
                            </div>
                        </div>
                        <div class="input-group">
                            <label for="transaction-date">Dato</label>
                            <input type="date" id="transaction-date" required>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="btn btn-primary">Tilføj</button>
                        </div>
                    </form>
                </div>

                <div class="transactions-list">
                    <h4>Bevægelser for Måneden</h4>
                    <table id="transactions-table">
                        <thead>
                            <tr>
                                <th>DATO</th>
                                <th>POST</th>
                                <th>PERSON</th>
                                <th>KATEGORI</th>
                                <th class="text-right">BELØB</th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- Rækker indsættes her af JS -->
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="economy-sidebar">
                <div class="economy-sidebar-widget">
                    <h5>Opsparingsmål</h5>
                    <p class="empty-state-small">Du har ingen opsparingsmål endnu.</p>
                    <button class="btn btn-secondary" disabled>Administrer Mål</button>
                </div>
                <div class="economy-sidebar-widget">
                    <h5>Formue & Gæld</h5>
                    <p id="net-worth-summary"><strong>Beregnet Friværdi:</strong> 0,00 kr.</p>
                    <button id="manage-assets-btn" class="btn btn-secondary">Administrer Aktiver</button>
                </div>
                <div class="economy-sidebar-widget">
                    <h5>Faste Poster</h5>
                     <p id="fixed-expenses-summary" class="empty-state-small">Du har ingen faste poster endnu.</p>
                    <button id="manage-fixed-btn" class="btn btn-secondary">Administrer Faste Poster</button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Tilføjer event listeners til de dynamisk oprettede elementer
 * @param {HTMLElement} container - Container-elementet for økonomisiden (#oekonomi)
 */
function attachEventListeners(container) {
    container.addEventListener('click', (e) => {
        if (e.target.closest('#prev-month-btn')) {
            economyState.currentDate.setMonth(economyState.currentDate.getMonth() - 1);
            renderEconomyPage();
        }
        if (e.target.closest('#next-month-btn')) {
            economyState.currentDate.setMonth(economyState.currentDate.getMonth() + 1);
            renderEconomyPage();
        }
        if (e.target.closest('#manage-assets-btn')) {
            document.getElementById('asset-modal').classList.remove('hidden');
        }
         if (e.target.closest('#manage-fixed-btn')) {
            document.getElementById('fixed-expense-modal').classList.remove('hidden');
        }
    });

    const transactionForm = container.querySelector('#transaction-form');
    if (transactionForm) {
        transactionForm.addEventListener('submit', handleSaveTransaction);
    }
}

/**
 * Renderer alt dynamisk indhold på dashboardet (tal, lister, etc.)
 */
export function renderEconomyPage() {
    // Opdater månedsvælger
    const monthDisplay = document.getElementById('current-month-display');
    if (monthDisplay) {
        monthDisplay.textContent = economyState.currentDate.toLocaleDateString('da-DK', {
            month: 'long',
            year: 'numeric'
        });
    }

    // Udfyld dropdowns i formular
    populateDropdowns();
    document.getElementById('transaction-date').value = formatDate(new Date());

    const year = economyState.currentDate.getFullYear();
    const month = economyState.currentDate.getMonth();
    
    // Filtrer transaktioner for den valgte måned
    const monthlyTransactions = (appState.expenses || []).filter(exp => {
        const expDate = exp.date.toDate();
        return expDate.getFullYear() === year && expDate.getMonth() === month;
    });

    // Beregn og vis summer
    const totalIncome = monthlyTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = monthlyTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const monthlyDisposable = totalIncome - totalExpense;

    document.getElementById('total-income').textContent = `${totalIncome.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.`;
    document.getElementById('total-expense').textContent = `${totalExpense.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.`;
    document.getElementById('monthly-disposable').textContent = `${monthlyDisposable.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.`;

    // Opdater formue-widget
    const totalAssets = (appState.assets || []).reduce((sum, asset) => sum + asset.value, 0);
    const totalLiabilities = (appState.liabilities || []).reduce((sum, l) => sum + l.currentBalance, 0);
    const netWorth = totalAssets - totalLiabilities;
    document.getElementById('net-worth-summary').innerHTML = `<strong>Beregnet Friværdi:</strong> ${netWorth.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.`;
    
    // Opdater faste poster widget
    const fixedSummary = document.getElementById('fixed-expenses-summary');
    const totalFixed = (appState.fixedExpenses || []).reduce((sum, fe) => sum + fe.amount, 0);
    if (totalFixed > 0) {
        fixedSummary.innerHTML = `<strong>Total:</strong> ${totalFixed.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr./md.`;
    } else {
        fixedSummary.textContent = 'Du har ingen faste poster endnu.';
    }


    // Render transaktionstabel
    renderTransactionsTable(monthlyTransactions);
}

/**
 * Udfylder Kategori og Person dropdowns i transaktionsformularen
 */
function populateDropdowns() {
    const categorySelect = document.getElementById('transaction-category');
    const personSelect = document.getElementById('transaction-person');

    // Udfyld kategorier
    const budgetCategories = (appState.references.budgetCategories || []).flatMap(cat => 
        (typeof cat === 'object' && cat.subcategories) ? cat.subcategories.map(sub => `${cat.name}: ${sub}`) : []
    );
    categorySelect.innerHTML = '<option value="">Vælg kategori...</option>';
    budgetCategories.sort().forEach(cat => {
        const option = new Option(cat, cat);
        categorySelect.add(option);
    });

    // Udfyld personer
    const householdMembers = appState.references.householdMembers || [];
    personSelect.innerHTML = '<option value="">Vælg person...</option>';
    householdMembers.sort().forEach(person => {
        const option = new Option(person, person);
        personSelect.add(option);
    });
}

/**
 * Renderer rækkerne i tabellen med månedens bevægelser
 * @param {Array} transactions - Et array af transaktionsobjekter for den valgte måned
 */
function renderTransactionsTable(transactions) {
    const tableBody = document.querySelector('#transactions-table tbody');
    if (!tableBody) return;

    if (transactions.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty-state-small">Ingen bevægelser for denne måned.</td></tr>';
        return;
    }

    tableBody.innerHTML = transactions
        .sort((a, b) => b.date.toDate() - a.date.toDate()) // Sorter efter dato
        .map(t => `
            <tr>
                <td>${t.date.toDate().toLocaleDateString('da-DK', { day: '2-digit', month: 'short' })}</td>
                <td>${t.description}</td>
                <td>${t.person || 'Fælles'}</td>
                <td>${t.subCategory ? t.subCategory : t.mainCategory}</td>
                <td class="text-right ${t.type === 'income' ? 'income-amount' : 'expense-amount'}">
                    ${t.type === 'expense' ? '-' : ''}${t.amount.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.
                </td>
            </tr>
        `).join('');
}

/**
 * Håndterer indsendelse af en ny transaktion
 * @param {Event} e - Form submit event
 */
async function handleSaveTransaction(e) {
    e.preventDefault();

    const categoryValue = document.getElementById('transaction-category').value;
    const [mainCategory, subCategory] = categoryValue ? categoryValue.split(': ') : [null, null];

    const transactionData = {
        amount: parseFloat(document.getElementById('transaction-amount').value),
        date: Timestamp.fromDate(new Date(document.getElementById('transaction-date').value)),
        description: document.getElementById('transaction-description').value.trim(),
        type: document.getElementById('transaction-type').value,
        mainCategory: mainCategory ? mainCategory.trim() : null,
        subCategory: subCategory ? subCategory.trim() : null,
        person: document.getElementById('transaction-person').value,
        userId: appState.currentUser.uid,
    };

    if (isNaN(transactionData.amount) || !transactionData.description || !transactionData.mainCategory) {
        showNotification({ title: "Ugyldigt input", message: "Udfyld venligst beskrivelse, beløb og kategori." });
        return;
    }

    try {
        // Fremadrettet skal dette gemmes i en 'transactions' collection
        await addDoc(collection(db, 'expenses'), transactionData);
        showNotification({ title: "Gemt!", message: "Din postering er blevet registreret." });
        e.target.reset(); // Nulstil formularen
        document.getElementById('transaction-date').value = formatDate(new Date());
    } catch (error) {
        handleError(error, "Posteringen kunne ikke gemmes.", "saveTransaction");
    }
}
