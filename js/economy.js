// js/economy.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc, writeBatch, Timestamp, getDoc, setDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { formatDate } from './utils.js'; // Assuming you have formatDate in utils

// Lokal state for økonomisiden
let appState;
let appElements;
let economyState = {
    currentDate: new Date(),
    fixedPostsSort: {
        key: 'description', // 'description' or 'amount'
        order: 'asc' // 'asc' or 'desc'
    }
};

// --- HJÆLPEFUNKTIONER ---

function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => {
        const option = new Option(opt, opt);
        selectElement.add(option);
    });
    if (selectElement.multiple) {
        Array.from(selectElement.options).forEach(opt => {
            if (currentValue && currentValue.includes(opt.value)) {
                opt.selected = true;
            }
        });
    } else {
        selectElement.value = currentValue || "";
    }
}

function populateLiabilitiesDropdown(selectElement, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = '';
    (appState.liabilities || []).forEach(l => selectElement.add(new Option(l.name, l.id)));
    
    if (selectElement.multiple) {
        Array.from(selectElement.options).forEach(opt => {
            if (currentValue && currentValue.includes(opt.value)) {
                opt.selected = true;
            }
        });
    } else {
        selectElement.value = currentValue || "";
    }
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

export function initEconomyPage(state, elements) {
    appState = state;
    appElements = elements; // Gem referencen til de globale elementer
    const pageContainer = document.getElementById('oekonomi');
    if (!pageContainer) return;

    attachEventListeners(pageContainer);
    attachModalEventListeners();
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
        if (e.target.closest('#add-asset-btn')) openAssetModal();
        if (e.target.closest('#add-liability-btn')) openLiabilityModal();
        if (e.target.closest('#manage-goals-btn')) openSavingsGoalModal();
        if (e.target.closest('#manage-fixed-btn')) openFixedExpenseModal();

        const assetItem = e.target.closest('.economy-item-row[data-asset-id]');
        if (assetItem) openAssetModal(assetItem.dataset.assetId);
        
        const liabilityItem = e.target.closest('.economy-item-row[data-liability-id]');
        if (liabilityItem) openLiabilityModal(liabilityItem.dataset.liabilityId);

        const fixedPostItem = e.target.closest('.economy-item-row[data-fixed-id]');
        if (fixedPostItem) openFixedExpenseModal(fixedPostItem.dataset.fixedId);
        
        const transactionRow = e.target.closest('#transactions-table tbody tr[data-id]');
        if(transactionRow) openTransactionEditModal(transactionRow.dataset.id);

        const sortBtn = e.target.closest('.sort-fixed-posts-btn');
        if (sortBtn) {
            const newSortKey = sortBtn.dataset.sortKey;
            if (economyState.fixedPostsSort.key === newSortKey) {
                economyState.fixedPostsSort.order = economyState.fixedPostsSort.order === 'asc' ? 'desc' : 'asc';
            } else {
                economyState.fixedPostsSort.key = newSortKey;
                economyState.fixedPostsSort.order = 'asc';
            }
            renderEconomyPage();
        }
    });

    const transactionForm = container.querySelector('#transaction-form');
    if (transactionForm) {
        transactionForm.addEventListener('submit', handleSaveTransaction);
    }
    
    const transactionMainCategorySelect = container.querySelector('#transaction-main-category');
    if (transactionMainCategorySelect) {
        transactionMainCategorySelect.addEventListener('change', () => {
            populateSubCategoryDropdown(
                container.querySelector('#transaction-sub-category'),
                transactionMainCategorySelect.value
            );
        });
    }
}

function attachModalEventListeners() {
    const assetForm = document.getElementById('asset-form');
    if (assetForm) assetForm.addEventListener('submit', handleSaveAsset);
    const deleteAssetBtn = document.getElementById('delete-asset-btn');
    if (deleteAssetBtn) deleteAssetBtn.addEventListener('click', handleDeleteAsset);

    const liabilityForm = document.getElementById('liability-form');
    if (liabilityForm) liabilityForm.addEventListener('submit', handleSaveLiability);
    const deleteLiabilityBtn = document.getElementById('delete-liability-btn');
    if (deleteLiabilityBtn) deleteLiabilityBtn.addEventListener('click', handleDeleteLiability);

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

    const transactionEditForm = document.getElementById('transaction-edit-form');
    if(transactionEditForm) transactionEditForm.addEventListener('submit', handleUpdateTransaction);
    const deleteTransactionBtn = document.getElementById('delete-transaction-btn');
    if(deleteTransactionBtn) deleteTransactionBtn.addEventListener('click', handleDeleteTransaction);

    const savingsGoalForm = document.getElementById('edit-budget-form');
    if (savingsGoalForm) savingsGoalForm.addEventListener('submit', handleSaveSavingsGoal);

    // Listener for the new expense modal
    const addExpenseForm = document.getElementById('add-expense-form');
    if (addExpenseForm) {
        addExpenseForm.addEventListener('submit', handleSaveExpenseFromModal);
    }
}

// --- RENDERING & BEREGNING ---

export function renderEconomyPage() {
    const monthDisplay = document.getElementById('current-month-display');
    if (monthDisplay) {
        monthDisplay.textContent = economyState.currentDate.toLocaleString('da-DK', { month: 'long', year: 'numeric' });
    }
    populateDropdowns();
    document.getElementById('transaction-date').value = formatDate(new Date());

    const year = economyState.currentDate.getFullYear();
    const month = economyState.currentDate.getMonth();
    
    const monthlyTransactions = (appState.expenses || []).filter(exp => {
        const expDate = exp.date.toDate();
        return expDate.getFullYear() === year && expDate.getMonth() === month;
    });

    const activeFixedPosts = (appState.fixedExpenses || []).filter(fp => {
        const startDate = new Date(fp.startDate);
        const endDate = fp.endDate ? new Date(fp.endDate) : null;
        const viewDate = new Date(year, month, 15);
        if (startDate > viewDate) return false;
        if (endDate && endDate < viewDate) return false;
        return true;
    });

    const totalFixedIncome = activeFixedPosts.filter(fp => fp.type === 'income').reduce((sum, p) => sum + p.amount, 0);
    const totalFixedExpense = activeFixedPosts.filter(fp => fp.type === 'expense').reduce((sum, p) => sum + p.amount, 0);
    const totalVariableIncome = monthlyTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalVariableExpense = monthlyTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const totalIncome = totalVariableIncome + totalFixedIncome;
    const totalExpense = totalVariableExpense + totalFixedExpense;
    const monthlyDisposable = totalIncome - totalExpense;

    document.getElementById('total-income').textContent = `${totalIncome.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.`;
    document.getElementById('total-expense').textContent = `${totalExpense.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.`;
    document.getElementById('monthly-disposable').textContent = `${monthlyDisposable.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.`;

    const projected = calculateProjectedValues(economyState.currentDate);
    document.getElementById('net-worth-summary').innerHTML = `<strong>Beregnet Friværdi:</strong> ${projected.netWorth.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.`;
    
    renderTransactionsTable(monthlyTransactions);
    renderAssetsListWidget(projected.assets);
    renderLiabilitiesListWidget(projected.liabilities);
    renderSpendingCategories(activeFixedPosts);
    renderFixedPostsWidget(activeFixedPosts);
    renderSavingsGoalWidget();
    renderSavingsVsWishlistWidget(projected.assets);
    renderSpendingAccounts(activeFixedPosts);
}

// OPDATERET: calculateProjectedValues med intelligent gældsafvikling
function calculateProjectedValues(targetDate) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const target = new Date(targetDate);
    target.setHours(0,0,0,0);

    let projectedLiabilities = JSON.parse(JSON.stringify(appState.liabilities || []));
    let projectedAssets = JSON.parse(JSON.stringify(appState.assets || []));

    if (target > today) {
        let currentDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        
        while (currentDate <= target) {
            projectedLiabilities.forEach(liability => {
                // Kun afdrag hvis der er gæld tilbage
                if (liability.currentBalance > 0 && liability.monthlyPayment && liability.interestRate) {
                    const monthlyInterest = (liability.currentBalance * (liability.interestRate / 100)) / 12;
                    let principalPayment = liability.monthlyPayment - monthlyInterest;

                    // Hvis den sidste betaling er mindre end et normalt afdrag
                    if (liability.currentBalance < principalPayment) {
                        principalPayment = liability.currentBalance;
                    }
                    
                    liability.currentBalance -= principalPayment;
                    liability.currentBalance = Math.max(0, liability.currentBalance); // Sikrer den ikke går under 0
                }
            });
            
            const savingsGoal = appState.economySettings.monthlySavingsGoal || 0;
            const linkedAssetId = appState.economySettings.linkedSavingsAssetId;
            if (savingsGoal > 0 && linkedAssetId) {
                const savingsAsset = projectedAssets.find(a => a.id === linkedAssetId);
                if (savingsAsset) {
                    savingsAsset.value += savingsGoal;
                }
            }

            currentDate.setMonth(currentDate.getMonth() + 1);
        }
    }

    const totalAssets = projectedAssets.reduce((sum, asset) => sum + asset.value, 0);
    const totalProjectedLiabilities = projectedLiabilities.reduce((sum, l) => sum + l.currentBalance, 0);
    const netWorth = totalAssets - totalProjectedLiabilities;

    return { assets: projectedAssets, liabilities: projectedLiabilities, netWorth };
}


function populateDropdowns() {
    const mainCategorySelect = document.getElementById('transaction-main-category');
    const personSelect = document.getElementById('transaction-person');
    const addExpenseMainCategory = document.getElementById('add-expense-main-category');
    const addExpensePerson = document.getElementById('add-expense-person');

    populateMainCategoryDropdown(mainCategorySelect);
    populateReferenceDropdown(personSelect, appState.references.householdMembers, 'Vælg person...');
    populateMainCategoryDropdown(addExpenseMainCategory);
    populateReferenceDropdown(addExpensePerson, appState.references.householdMembers, 'Vælg person...');
}

function renderTransactionsTable(transactions) {
    const tableBody = document.querySelector('#transactions-table tbody');
    if (!tableBody) return;

    if (transactions.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="empty-state-small">Ingen variable bevægelser for denne måned.</td></tr>';
        return;
    }

    tableBody.innerHTML = transactions
        .sort((a, b) => b.date.toDate() - a.date.toDate())
        .map(t => `
            <tr data-id="${t.id}" class="clickable-row">
                <td>${t.date.toDate().toLocaleDateString('da-DK', { day: '2-digit', month: 'short' })}</td>
                <td>${t.description}</td>
                <td>${t.person || 'Fælles'}</td>
                <td>${t.subCategory ? `${t.mainCategory} / ${t.subCategory}` : t.mainCategory}</td>
                <td class="text-right ${t.type === 'income' ? 'income-amount' : 'expense-amount'}">
                    ${t.type === 'expense' ? '-' : ''}${t.amount.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.
                </td>
            </tr>
        `).join('');
}

function renderAssetsListWidget(assetsToRender) {
    const container = document.getElementById('assets-list-widget');
    if (!container) return;
    container.innerHTML = '<h6>Aktiver</h6>';
    const assets = assetsToRender || appState.assets || [];
    if (assets.length === 0) {
        container.innerHTML += '<p class="empty-state-small">Ingen aktiver tilføjet.</p>';
        return;
    }
    assets.forEach(asset => {
        const row = document.createElement('div');
        row.className = 'economy-item-row';
        row.dataset.assetId = asset.id;
        row.innerHTML = `
            <span>${asset.name}</span>
            <span class="economy-item-value">${asset.value.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.</span>
        `;
        container.appendChild(row);
    });
}

function renderLiabilitiesListWidget(liabilitiesToRender) {
    const container = document.getElementById('liabilities-list-widget');
    if (!container) return;
    container.innerHTML = '<h6>Gæld</h6>';
    const liabilities = liabilitiesToRender || appState.liabilities || [];
    if (liabilities.length === 0) {
        container.innerHTML += '<p class="empty-state-small">Ingen gæld tilføjet.</p>';
        return;
    }
    liabilities.forEach(liability => {
        const row = document.createElement('div');
        row.className = 'economy-item-row';
        row.dataset.liabilityId = liability.id;
        row.innerHTML = `
            <span>${liability.name}</span>
            <span class="economy-item-value">${liability.currentBalance.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.</span>
        `;
        container.appendChild(row);
    });
}

function renderFixedPostsWidget(fixedPosts) {
    const container = document.getElementById('fixed-posts-list-widget');
    if (!container) return;

    const sortedPosts = [...fixedPosts].sort((a, b) => {
        const order = economyState.fixedPostsSort.order === 'asc' ? 1 : -1;
        if (economyState.fixedPostsSort.key === 'description') {
            return a.description.localeCompare(b.description) * order;
        } else {
            return (a.amount - b.amount) * order;
        }
    });

    document.querySelectorAll('.sort-fixed-posts-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sortKey === economyState.fixedPostsSort.key);
    });

    container.innerHTML = '';
    if (!sortedPosts || sortedPosts.length === 0) {
        container.innerHTML = '<p class="empty-state-small">Ingen faste poster endnu.</p>';
        return;
    }
    sortedPosts.forEach(post => {
        const row = document.createElement('div');
        row.className = 'economy-item-row';
        row.dataset.fixedId = post.id;
        row.innerHTML = `
            <span>${post.description}</span>
            <span class="economy-item-value ${post.type === 'income' ? 'income-amount' : 'expense-amount'}">
                ${post.amount.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.
            </span>
        `;
        container.appendChild(row);
    });
}


function renderSpendingCategories(fixedExpenses) {
    const container = document.getElementById('spending-categories-content');
    if (!container) return;

    const fixedSpending = (fixedExpenses || []).filter(exp => exp.type === 'expense');
    const totalFixed = fixedSpending.reduce((sum, exp) => sum + exp.amount, 0);

    if (totalFixed === 0) {
        container.innerHTML = '<p class="empty-state-small">Ingen faste udgifter at vise.</p>';
        return;
    }

    const categories = {};
    fixedSpending.forEach(exp => {
        const key = exp.mainCategory;
        if (!categories[key]) categories[key] = 0;
        categories[key] += exp.amount;
    });

    const sortedCategories = Object.entries(categories).sort(([,a],[,b]) => b-a);

    container.innerHTML = sortedCategories.map(([name, amount]) => {
        const percentage = (amount / totalFixed) * 100;
        return `
            <div class="category-summary-item">
                <span class="category-name" title="${name}">${name}</span>
                <div class="category-bar-container">
                    <div class="category-bar" style="width: ${percentage}%;"></div>
                </div>
                <span class="category-amount">${amount.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.</span>
            </div>
        `;
    }).join('');
}

function renderSpendingAccounts(fixedExpenses) {
    const container = document.getElementById('spending-accounts-content');
    if (!container) return;

    const fixedSpending = (fixedExpenses || []).filter(exp => exp.type === 'expense');
    const totalFixed = fixedSpending.reduce((sum, exp) => sum + exp.amount, 0);

    if (totalFixed === 0) {
        container.innerHTML = '<p class="empty-state-small">Ingen faste udgifter at vise.</p>';
        return;
    }

    const accounts = {};
    fixedSpending.forEach(exp => {
        const key = exp.account || 'Ikke tildelt';
        if (!accounts[key]) accounts[key] = 0;
        accounts[key] += exp.amount;
    });

    const sortedAccounts = Object.entries(accounts).sort(([,a],[,b]) => b-a);

    container.innerHTML = sortedAccounts.map(([name, amount]) => {
        const percentage = (amount / totalFixed) * 100;
        return `
            <div class="category-summary-item">
                <span class="category-name" title="${name}">${name}</span>
                <div class="category-bar-container">
                    <div class="category-bar" style="width: ${percentage}%;"></div>
                </div>
                <span class="category-amount">${amount.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.</span>
            </div>
        `;
    }).join('');
}

function renderSavingsGoalWidget() {
    const summary = document.getElementById('savings-goal-summary');
    if (!summary) return;
    const goal = appState.economySettings.monthlySavingsGoal;
    if (goal && goal > 0) {
        summary.innerHTML = `<strong>${goal.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.</strong> / måned`;
    } else {
        summary.textContent = "Intet mål sat endnu.";
    }
}

function renderSavingsVsWishlistWidget(projectedAssets) {
    const container = document.getElementById('savings-vs-wishlist-widget');
    if (!container) return;

    const linkedAssetId = appState.economySettings.linkedSavingsAssetId;
    const savingsAsset = linkedAssetId ? (projectedAssets || appState.assets).find(a => a.id === linkedAssetId) : null;
    const currentSavings = savingsAsset ? savingsAsset.value : 0;

    const wishlistItems = Object.values(appState.shoppingLists.wishlist || {});
    const wishlistTotal = wishlistItems.reduce((sum, item) => sum + (item.price || 0), 0);
    
    const percentage = wishlistTotal > 0 ? (currentSavings / wishlistTotal) * 100 : 0;
    const percentageClamped = Math.min(100, percentage);

    container.innerHTML = `
        <h5>Opsparing vs. Ønskeliste</h5>
        <div class="savings-progress-bar">
            <div class="savings-progress-bar-inner" style="width: ${percentageClamped}%;"></div>
        </div>
        <div class="savings-vs-wishlist-summary">
            <span>Opsparet: <strong>${currentSavings.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.</strong></span>
            <span>Ønsker: <strong>${wishlistTotal.toLocaleString('da-DK', {minimumFractionDigits: 2})} kr.</strong></span>
        </div>
    `;
}


// --- DATA HÅNDTERING ---

async function handleSaveTransaction(e) {
    e.preventDefault();
    
    const transactionData = {
        amount: parseFloat(document.getElementById('transaction-amount').value),
        date: Timestamp.fromDate(new Date(document.getElementById('transaction-date').value)),
        description: document.getElementById('transaction-description').value.trim(),
        type: document.getElementById('transaction-type').value,
        mainCategory: document.getElementById('transaction-main-category').value,
        subCategory: document.getElementById('transaction-sub-category').value || null,
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
async function handleSaveExpenseFromModal(e) {
    e.preventDefault();
    const expenseData = {
        amount: parseFloat(document.getElementById('add-expense-amount').value),
        date: Timestamp.fromDate(new Date(document.getElementById('add-expense-date').value)),
        description: document.getElementById('add-expense-description').value.trim(),
        type: 'expense',
        mainCategory: document.getElementById('add-expense-main-category').value,
        subCategory: document.getElementById('add-expense-sub-category').value || null,
        person: document.getElementById('add-expense-person').value,
        userId: appState.currentUser.uid,
    };

    if (isNaN(expenseData.amount) || !expenseData.description || !expenseData.mainCategory) {
        showNotification({ title: "Ugyldigt input", message: "Udfyld venligst alle felter." });
        return;
    }
    try {
        await addDoc(collection(db, 'expenses'), expenseData);
        showNotification({ title: "Udgift Gemt!", message: "Din udgift er blevet registreret." });
        document.getElementById('add-expense-modal').classList.add('hidden');
        e.target.reset();
    } catch (error) {
        handleError(error, "Udgiften kunne ikke gemmes.", "saveExpenseFromModal");
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
    populateLiabilitiesDropdown(document.getElementById('asset-linked-liability'), 'Tilknyt gæld...', asset?.linkedLiabilityIds);
    modal.classList.remove('hidden');
}

async function handleSaveAsset(e) {
    e.preventDefault();
    const assetId = document.getElementById('asset-id').value;
    const linkedLiabilitySelect = document.getElementById('asset-linked-liability');
    const linkedLiabilityIds = Array.from(linkedLiabilitySelect.selectedOptions).map(opt => opt.value);

    const assetData = {
        name: document.getElementById('asset-name').value.trim(),
        type: document.getElementById('asset-type').value,
        value: parseFloat(document.getElementById('asset-value').value),
        linkedLiabilityIds: linkedLiabilityIds,
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
        document.getElementById('liability-current-balance').value = liability.currentBalance;
        document.getElementById('liability-monthly-payment').value = liability.monthlyPayment || '';
        document.getElementById('liability-interest-rate').value = liability.interestRate || '';
    }
    
    populateReferenceDropdown(document.getElementById('liability-type'), appState.references.liabilityTypes, 'Vælg type...', liability?.type);
    modal.classList.remove('hidden');
}

async function handleSaveLiability(e) {
    e.preventDefault();
    const liabilityId = document.getElementById('liability-id').value;
    
    const liabilityData = {
        name: document.getElementById('liability-name').value.trim(),
        type: document.getElementById('liability-type').value,
        currentBalance: parseFloat(document.getElementById('liability-current-balance').value),
        monthlyPayment: parseFloat(document.getElementById('liability-monthly-payment').value) || null,
        interestRate: parseFloat(document.getElementById('liability-interest-rate').value) || null,
        userId: appState.currentUser.uid
    };

    if (!liabilityData.name || !liabilityData.type || isNaN(liabilityData.currentBalance)) {
        showNotification({title: "Udfyld påkrævede felter", message: "Navn, type og restgæld skal være udfyldt."});
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

        const linkedAssets = (appState.assets || []).filter(a => a.linkedLiabilityIds && a.linkedLiabilityIds.includes(liabilityId));
        linkedAssets.forEach(asset => {
            const assetRef = doc(db, 'assets', asset.id);
            const updatedIds = asset.linkedLiabilityIds.filter(id => id !== liabilityId);
            batch.update(assetRef, { linkedLiabilityIds: updatedIds });
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
    modal.querySelector('h3').textContent = isEditing ? 'Rediger Fast Post' : 'Ny Fast Post';
    document.getElementById('delete-fixed-expense-btn').classList.toggle('hidden', !isEditing);

    populateReferenceDropdown(document.getElementById('fixed-expense-account'), appState.references.accounts, 'Vælg konto...', expense?.account);
    populateMainCategoryDropdown(document.getElementById('fixed-expense-main-category'), expense?.mainCategory);
    populateSubCategoryDropdown(document.getElementById('fixed-expense-sub-category'), expense?.mainCategory, expense?.subCategory);

    if (isEditing) {
        document.getElementById('fixed-expense-description').value = expense.description;
        document.getElementById('fixed-expense-amount').value = expense.amount;
        document.getElementById('fixed-expense-type').value = expense.type;
        document.getElementById('fixed-expense-start-date-edit').value = expense.startDate;
        document.getElementById('fixed-expense-end-date-edit').value = expense.endDate || '';
    } else {
        document.getElementById('fixed-expense-start-date-edit').value = formatDate(new Date());
    }
    
    modal.classList.remove('hidden');
}

async function handleSaveFixedExpense(e) {
    e.preventDefault();
    const expenseId = document.getElementById('fixed-expense-id-edit').value;
    const expenseData = {
        description: document.getElementById('fixed-expense-description').value.trim(),
        amount: parseFloat(document.getElementById('fixed-expense-amount').value),
        type: document.getElementById('fixed-expense-type').value,
        account: document.getElementById('fixed-expense-account').value,
        mainCategory: document.getElementById('fixed-expense-main-category').value,
        subCategory: document.getElementById('fixed-expense-sub-category').value,
        startDate: document.getElementById('fixed-expense-start-date-edit').value,
        endDate: document.getElementById('fixed-expense-end-date-edit').value || null,
        userId: appState.currentUser.uid,
    };

    if (!expenseData.description || isNaN(expenseData.amount) || !expenseData.mainCategory || !expenseData.account) {
        showNotification({title: "Udfyld påkrævede felter", message: "Beskrivelse, beløb, konto og kategori er påkrævet."});
        return;
    }

    try {
        if (expenseId) {
            await updateDoc(doc(db, 'fixed_expenses', expenseId), expenseData);
        } else {
            await addDoc(collection(db, 'fixed_expenses'), expenseData);
        }
        document.getElementById('fixed-expense-modal').classList.add('hidden');
        showNotification({title: "Gemt!", message: "Fast post er gemt."});
    } catch (error) {
        handleError(error, "Kunne ikke gemme fast post.", "saveFixedExpense");
    }
}

async function handleDeleteFixedExpense() {
    const expenseId = document.getElementById('fixed-expense-id-edit').value;
    if (!expenseId) return;

    const confirmed = await showNotification({title: "Slet Fast Post", message: "Er du sikker?", type: 'confirm'});
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, 'fixed_expenses', expenseId));
        document.getElementById('fixed-expense-modal').classList.add('hidden');
        showNotification({title: "Slettet", message: "Den faste post er blevet slettet."});
    } catch (error) {
        handleError(error, "Posten kunne ikke slettes.", "handleDeleteFixedExpense");
    }
}

function openTransactionEditModal(transactionId) {
    const modal = document.getElementById('transaction-edit-modal');
    const form = document.getElementById('transaction-edit-form');
    const transaction = appState.expenses.find(t => t.id === transactionId);
    if (!transaction) return;

    form.reset();
    document.getElementById('transaction-edit-id').value = transaction.id;
    document.getElementById('transaction-edit-description').value = transaction.description;
    document.getElementById('transaction-edit-amount').value = transaction.amount;
    document.getElementById('transaction-edit-type').value = transaction.type || 'expense';
    document.getElementById('transaction-edit-date').value = formatDate(transaction.date.toDate());
    
    populateMainCategoryDropdown(document.getElementById('transaction-edit-category'), transaction.mainCategory);
    populateSubCategoryDropdown(document.getElementById('transaction-edit-sub-category'), transaction.mainCategory, transaction.subCategory);
    populateReferenceDropdown(document.getElementById('transaction-edit-person'), appState.references.householdMembers, 'Vælg person...', transaction.person);
    
    modal.classList.remove('hidden');
}

async function handleUpdateTransaction(e) {
    e.preventDefault();
    const transactionId = document.getElementById('transaction-edit-id').value;
    if (!transactionId) return;

    const transactionData = {
        amount: parseFloat(document.getElementById('transaction-edit-amount').value),
        date: Timestamp.fromDate(new Date(document.getElementById('transaction-edit-date').value)),
        description: document.getElementById('transaction-edit-description').value.trim(),
        type: document.getElementById('transaction-edit-type').value,
        mainCategory: document.getElementById('transaction-edit-category').value,
        subCategory: document.getElementById('transaction-edit-sub-category').value,
        person: document.getElementById('transaction-edit-person').value,
    };

    try {
        await updateDoc(doc(db, 'expenses', transactionId), transactionData);
        document.getElementById('transaction-edit-modal').classList.add('hidden');
        showNotification({ title: "Opdateret!", message: "Posteringen er blevet opdateret." });
    } catch (error) {
        handleError(error, "Kunne ikke opdatere postering.", "handleUpdateTransaction");
    }
}

async function handleDeleteTransaction() {
    const transactionId = document.getElementById('transaction-edit-id').value;
    if (!transactionId) return;

    const confirmed = await showNotification({title: "Slet Postering", message: "Er du sikker?", type: 'confirm'});
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, 'expenses', transactionId));
        document.getElementById('transaction-edit-modal').classList.add('hidden');
        showNotification({title: "Slettet", message: "Posteringen er blevet slettet."});
    } catch(error) {
        handleError(error, "Kunne ikke slette postering.", "handleDeleteTransaction");
    }
}

function openSavingsGoalModal() {
    const modal = document.getElementById('edit-budget-modal');
    const form = document.getElementById('edit-budget-form');
    form.reset();

    const savingsAssets = (appState.assets || []).filter(a => a.type === 'Opsparing');
    const select = document.getElementById('linked-savings-asset');
    select.innerHTML = '<option value="">Vælg opsparingskonto...</option>';
    savingsAssets.forEach(a => select.add(new Option(a.name, a.id)));

    const currentGoal = appState.economySettings.monthlySavingsGoal;
    const currentAssetId = appState.economySettings.linkedSavingsAssetId;
    if (currentGoal) {
        document.getElementById('monthly-savings-goal-input').value = currentGoal;
    }
    if (currentAssetId) {
        select.value = currentAssetId;
    }

    modal.classList.remove('hidden');
}

async function handleSaveSavingsGoal(e) {
    e.preventDefault();
    const goal = parseFloat(document.getElementById('monthly-savings-goal-input').value);
    const assetId = document.getElementById('linked-savings-asset').value;

    if (isNaN(goal) || goal < 0 || !assetId) {
        showNotification({title: "Ugyldigt input", message: "Angiv venligst et gyldigt beløb og vælg et tilknyttet opsparingsaktiv."});
        return;
    }

    try {
        const settingsRef = doc(db, 'users', appState.currentUser.uid, 'settings', 'economy');
        await setDoc(settingsRef, {
            monthlySavingsGoal: goal,
            linkedSavingsAssetId: assetId
        }, { merge: true });
        
        document.getElementById('edit-budget-modal').classList.add('hidden');
        showNotification({title: "Opsparingsmål Gemt", message: "Dit månedlige mål er blevet opdateret."});
    } catch (error) {
        handleError(error, "Kunne ikke gemme opsparingsmål.", "saveSavingsGoal");
    }
}

export function promptForExpenseCreation(totalAmount, description) {
    const modal = document.getElementById('add-expense-modal');
    if (!modal) return;
    
    // Udfyld felter
    document.getElementById('add-expense-description').value = description;
    document.getElementById('add-expense-amount').value = totalAmount.toFixed(2);
    document.getElementById('add-expense-date').value = formatDate(new Date());

    // Forsøg at forudvælge 'Dagligvarer'
    const mainCategorySelect = document.getElementById('add-expense-main-category');
    const dagligvarerOption = Array.from(mainCategorySelect.options).find(opt => opt.value.toLowerCase() === 'dagligvarer');
    if (dagligvarerOption) {
        mainCategorySelect.value = dagligvarerOption.value;
    }
    
    modal.classList.remove('hidden');
}
