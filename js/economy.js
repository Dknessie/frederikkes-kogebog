// js/economy.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';

// Lokal state for økonomisiden
let appState;
let economyState = {
    currentDate: new Date(), // Start med den nuværende måned
};

// --- HJÆLPEFUNKTIONER ---

function formatDate(date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('-');
}

function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    selectElement.value = currentValue || "";
}

function populateLiabilitiesDropdown(selectElement, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (appState.liabilities || []).forEach(l => selectElement.add(new Option(l.name, l.id)));
    selectElement.value = currentValue || "";
}

function populateMainCategoryDropdown(selectElement, currentValue) {
    const mainCategories = (appState.references.budgetCategories || [])
        .map(cat => (typeof cat === 'string' ? cat : cat.name));
    populateReferenceDropdown(selectElement, mainCategories, 'Vælg hovedkategori...', currentValue);
}

function populateSubCategoryDropdown(selectElement, mainCategoryName, currentValue) {
    const allCategories = (appState.references.budgetCategories || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));
    const mainCat = allCategories.find(cat => cat.name === mainCategoryName);
    const subCategories = mainCat ? mainCat.subcategories : [];
    populateReferenceDropdown(selectElement, subCategories, 'Vælg underkategori...', currentValue);
    selectElement.disabled = !mainCategoryName;
}


// --- INITIALISERING ---

export function initEconomyPage(state) {
    appState = state;
    const pageContainer = document.getElementById('oekonomi');
    if (!pageContainer) return;

    if (!pageContainer.querySelector('.economy-dashboard-layout')) {
        buildPageSkeleton(pageContainer);
        attachEventListeners(pageContainer);
    }
    
    // Sørg for at modals har de nødvendige event listeners
    attachModalEventListeners();

    renderEconomyPage();
}

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
                        <tbody></tbody>
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
                    <button id="manage-liabilities-btn" class="btn btn-secondary">Administrer Gæld</button>
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
        if (e.target.closest('#manage-assets-btn')) openAssetModal();
        if (e.target.closest('#manage-liabilities-btn')) openLiabilityModal();
        if (e.target.closest('#manage-fixed-btn')) openFixedExpenseModal();
    });

    const transactionForm = container.querySelector('#transaction-form');
    if (transactionForm) {
        transactionForm.addEventListener('submit', handleSaveTransaction);
    }
}

function attachModalEventListeners() {
    // Asset Modal
    const assetForm = document.getElementById('asset-form');
    if (assetForm) assetForm.addEventListener('submit', handleSaveAsset);
    const deleteAssetBtn = document.getElementById('delete-asset-btn');
    if (deleteAssetBtn) deleteAssetBtn.addEventListener('click', handleDeleteAsset);

    // Liability Modal
    const liabilityForm = document.getElementById('liability-form');
    if (liabilityForm) liabilityForm.addEventListener('submit', handleSaveLiability);
    const deleteLiabilityBtn = document.getElementById('delete-liability-btn');
    if (deleteLiabilityBtn) deleteLiabilityBtn.addEventListener('click', handleDeleteLiability);

    // Fixed Expense Modal
    const fixedExpenseForm = document.getElementById('fixed-expense-form');
    if (fixedExpenseForm) fixedExpenseForm.addEventListener('submit', handleSaveFixedExpense);
    const deleteFixedExpenseBtn = document.getElementById('delete-fixed-expense-btn');
    if (deleteFixedExpenseBtn) deleteFixedExpenseBtn.addEventListener('click', handleDeleteFixedExpense);

    const fixedMainCategorySelect = document.getElementById('fixed-expense-main-category');
    if (fixedMainCategorySelect) {
        fixedMainCategorySelect.addEventListener('change', () => {
             populateSubCategoryDropdown(
                document.getElementById('fixed-expense-sub-category'), 
                fixedMainCategorySelect.value
             );
        });
    }
}

// --- RENDERING ---

export function renderEconomyPage() {
    const monthDisplay = document.getElementById('current-month-display');
    if (monthDisplay) {
        monthDisplay.textContent = economyState.currentDate.toLocaleDateString('da-DK', { month: 'long', year: 'numeric' });
    }
    populateDropdowns();
    document.getElementById('transaction-date').value = formatDate(new Date());

    const year = economyState.currentDate.getFullYear();
    const month = economyState.currentDate.getMonth();
    
    const monthlyTransactions = (appState.expenses || []).filter(exp => {
        const expDate = exp.date.toDate();
        return expDate.getFullYear() === year && expDate.getMonth() === month;
    });

    const totalIncome = monthlyTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = monthlyTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const monthlyDisposable = totalIncome - totalExpense;

    document.getElementById('total-income').textContent = `${totalIncome.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.`;
    document.getElementById('total-expense').textContent = `${totalExpense.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.`;
    document.getElementById('monthly-disposable').textContent = `${monthlyDisposable.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.`;

    const totalAssets = (appState.assets || []).reduce((sum, asset) => sum + asset.value, 0);
    const totalLiabilities = (appState.liabilities || []).reduce((sum, l) => sum + l.currentBalance, 0);
    const netWorth = totalAssets - totalLiabilities;
    document.getElementById('net-worth-summary').innerHTML = `<strong>Beregnet Friværdi:</strong> ${netWorth.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.`;
    
    const fixedSummary = document.getElementById('fixed-expenses-summary');
    const totalFixed = (appState.fixedExpenses || []).reduce((sum, fe) => sum + fe.amount, 0);
    if (totalFixed > 0) {
        fixedSummary.innerHTML = `<strong>Total:</strong> ${totalFixed.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr./md.`;
    } else {
        fixedSummary.textContent = 'Du har ingen faste poster endnu.';
    }

    renderTransactionsTable(monthlyTransactions);
}

function populateDropdowns() {
    const categorySelect = document.getElementById('transaction-category');
    const personSelect = document.getElementById('transaction-person');

    const budgetCategories = (appState.references.budgetCategories || []).flatMap(cat => 
        (typeof cat === 'object' && cat.subcategories) ? cat.subcategories.map(sub => `${cat.name}: ${sub}`) : []
    );
    categorySelect.innerHTML = '<option value="">Vælg kategori...</option>';
    budgetCategories.sort().forEach(cat => {
        const option = new Option(cat, cat);
        categorySelect.add(option);
    });

    const householdMembers = appState.references.householdMembers || [];
    personSelect.innerHTML = '<option value="">Vælg person...</option>';
    householdMembers.sort().forEach(person => {
        const option = new Option(person, person);
        personSelect.add(option);
    });
}

function renderTransactionsTable(transactions) {
    const tableBody = document.querySelector('#transactions-table tbody');
    if (!tableBody) return;

    if (transactions.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty-state-small">Ingen bevægelser for denne måned.</td></tr>';
        return;
    }

    tableBody.innerHTML = transactions
        .sort((a, b) => b.date.toDate() - a.date.toDate())
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

// --- DATA HÅNDTERING ---

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
        await addDoc(collection(db, 'expenses'), transactionData);
        showNotification({ title: "Gemt!", message: "Din postering er blevet registreret." });
        e.target.reset();
        document.getElementById('transaction-date').value = formatDate(new Date());
    } catch (error) {
        handleError(error, "Posteringen kunne ikke gemmes.", "saveTransaction");
    }
}

// --- MODAL LOGIK ---

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
    }
    
    populateReferenceDropdown(document.getElementById('asset-type'), appState.references.assetTypes, 'Vælg type...', asset?.type);
    populateLiabilitiesDropdown(document.getElementById('asset-linked-liability'), 'Tilknyt gæld...', asset?.linkedLiabilityId);
    modal.classList.remove('hidden');
}

async function handleSaveAsset(e) {
    e.preventDefault();
    const assetId = document.getElementById('asset-id').value;
    const assetData = {
        name: document.getElementById('asset-name').value.trim(),
        type: document.getElementById('asset-type').value,
        value: parseFloat(document.getElementById('asset-value').value),
        linkedLiabilityId: document.getElementById('asset-linked-liability').value || null,
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
    modal.querySelector('h3').textContent = isEditing ? 'Rediger Gæld' : 'Ny Gæld';
    document.getElementById('delete-liability-btn').classList.toggle('hidden', !isEditing);

    if (isEditing) {
        document.getElementById('liability-name').value = liability.name;
        document.getElementById('liability-original-amount').value = liability.originalAmount;
        document.getElementById('liability-current-balance').value = liability.currentBalance;
    }
    modal.classList.remove('hidden');
}

async function handleSaveLiability(e) {
    e.preventDefault();
    const liabilityId = document.getElementById('liability-id').value;
    const originalAmount = parseFloat(document.getElementById('liability-original-amount').value);
    const currentBalance = parseFloat(document.getElementById('liability-current-balance').value);
    
    const liabilityData = {
        name: document.getElementById('liability-name').value.trim(),
        originalAmount: isNaN(originalAmount) ? 0 : originalAmount,
        currentBalance: isNaN(currentBalance) ? originalAmount : currentBalance,
        userId: appState.currentUser.uid
    };

    if (!liabilityData.name) {
        showNotification({title: "Udfyld påkrævede felter", message: "Navn skal være udfyldt."});
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

        const linkedAssets = (appState.assets || []).filter(a => a.linkedLiabilityId === liabilityId);
        linkedAssets.forEach(asset => {
            const assetRef = doc(db, 'assets', asset.id);
            batch.update(assetRef, { linkedLiabilityId: null });
        });

        await batch.commit();
        document.getElementById('liability-modal').classList.add('hidden');
        showNotification({title: "Slettet", message: "Gældsposten er blevet slettet."});
    } catch (error) {
        handleError(error, "Gældsposten kunne ikke slettes.", "deleteLiability");
    }
}

function openFixedExpenseModal(expenseId = null) {
    const modal = document.getElementById('fixed-expense-modal');
    const form = document.getElementById('fixed-expense-form');
    form.reset();
    const isEditing = !!expenseId;
    const expense = isEditing ? appState.fixedExpenses.find(e => e.id === expenseId) : null;

    document.getElementById('fixed-expense-id-edit').value = expenseId || '';
    modal.querySelector('h3').textContent = isEditing ? 'Rediger Fast Udgift' : 'Ny Fast Udgift';
    document.getElementById('delete-fixed-expense-btn').classList.toggle('hidden', !isEditing);

    populateMainCategoryDropdown(document.getElementById('fixed-expense-main-category'), expense?.mainCategory);
    populateSubCategoryDropdown(document.getElementById('fixed-expense-sub-category'), expense?.mainCategory, expense?.subCategory);
    populateLiabilitiesDropdown(document.getElementById('fixed-expense-linked-liability'), 'Vælg lån...', expense?.linkedLiabilityId);

    if (isEditing) {
        document.getElementById('fixed-expense-amount').value = expense.amount;
        document.getElementById('fixed-expense-start-date-edit').value = expense.startDate;
        document.getElementById('fixed-expense-end-date-edit').value = expense.endDate || '';
        document.getElementById('fixed-expense-is-repayment').checked = expense.isRepayment || false;
    } else {
        document.getElementById('fixed-expense-start-date-edit').value = formatDate(new Date());
    }
    
    document.getElementById('repayment-liability-link-group').classList.toggle('hidden', !expense?.isRepayment);
    modal.classList.remove('hidden');
}

async function handleSaveFixedExpense(e) {
    e.preventDefault();
    const expenseId = document.getElementById('fixed-expense-id-edit').value;
    const expenseData = {
        amount: parseFloat(document.getElementById('fixed-expense-amount').value),
        mainCategory: document.getElementById('fixed-expense-main-category').value,
        subCategory: document.getElementById('fixed-expense-sub-category').value,
        startDate: document.getElementById('fixed-expense-start-date-edit').value,
        endDate: document.getElementById('fixed-expense-end-date-edit').value || null,
        isRepayment: document.getElementById('fixed-expense-is-repayment').checked,
        linkedLiabilityId: document.getElementById('fixed-expense-linked-liability').value || null,
        userId: appState.currentUser.uid,
    };

    try {
        if (expenseId) {
            await updateDoc(doc(db, 'fixed_expenses', expenseId), expenseData);
        } else {
            await addDoc(collection(db, 'fixed_expenses'), expenseData);
        }
        document.getElementById('fixed-expense-modal').classList.add('hidden');
        showNotification({title: "Gemt!", message: "Fast udgift er gemt."});
    } catch (error) {
        handleError(error, "Kunne ikke gemme fast udgift.", "saveFixedExpense");
    }
}

async function handleDeleteFixedExpense() {
    const expenseId = document.getElementById('fixed-expense-id-edit').value;
    if (!expenseId) return;

    const confirmed = await showNotification({title: "Slet Fast Udgift", message: "Er du sikker?", type: 'confirm'});
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, 'fixed_expenses', expenseId));
        document.getElementById('fixed-expense-modal').classList.add('hidden');
        showNotification({title: "Slettet", message: "Den faste udgift er blevet slettet."});
    } catch (error) {
        handleError(error, "Udgiften kunne ikke slettes.", "handleDeleteFixedExpense");
    }
}
