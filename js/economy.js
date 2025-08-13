import { db, auth } from './firebase.js';
import { collection, doc, addDoc, onSnapshot, setDoc, deleteDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { formatCurrency, getMonthlyAmount, monthsBetween, generateId } from './utils.js';
import { showToast } from './ui.js';

// State variabler for økonomi-siden
let userId = null;
let currentDate = new Date();
let allTransactions = [], allAssets = [], allRecurringItems = [], allSavingsGoals = [];
let unsubscribeListeners = []; // Til at holde styr på listeners for at undgå memory leaks

const getCollectionPath = (name) => `users/${userId}/${name}`;

/**
 * Initialiserer Økonomi-siden
 */
export function initEconomyPage() {
    const appContainer = document.getElementById('app');
    appContainer.innerHTML = ''; // Ryd tidligere indhold
    appContainer.className = 'economy-page'; // Tilføj specifik klasse for styling

    // Ryd op i gamle listeners før vi starter nye
    unsubscribeListeners.forEach(unsub => unsub());
    unsubscribeListeners = [];

    if (auth.currentUser) {
        userId = auth.currentUser.uid;
        buildEconomyUI(appContainer);
        setupRealtimeListeners();
        setupEventListeners();
        updateUI(); // Kald en gang for at rendere initial state
    } else {
        appContainer.innerHTML = '<div class="text-center p-10"><h1 class="text-2xl">Log venligst ind for at se din økonomi.</h1></div>';
    }
}

/**
 * Bygger hele HTML-strukturen for økonomisiden
 * @param {HTMLElement} container - Elementet som UI'en skal bygges i.
 */
function buildEconomyUI(container) {
    container.innerHTML = `
        <div class="container mx-auto p-4 md:p-8 max-w-7xl">
            <header class="mb-10 text-center">
                <h1 class="text-5xl font-bold text-gray-800">Mit Økonomiske Overblik</h1>
                <p class="text-xl text-gray-500 mt-2">Planlæg din fremtid, en krone ad gangen.</p>
            </header>

            <main class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div class="lg:col-span-2 space-y-8">
                    <!-- Controls and Overview -->
                    <div class="card p-4 flex justify-between items-center">
                        <div class="flex items-center space-x-2">
                            <button id="prevMonthBtn" class="p-3 rounded-full hover:bg-blue-100"><i class="fas fa-chevron-left text-blue-500"></i></button>
                            <h2 class="text-3xl font-bold text-center text-gray-700" id="currentMonthDisplay"></h2>
                            <button id="nextMonthBtn" class="p-3 rounded-full hover:bg-blue-100"><i class="fas fa-chevron-right text-blue-500"></i></button>
                        </div>
                    </div>
                    <section>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div class="card p-6"><h3 class="text-lg font-semibold text-green-500">Total Indkomst</h3><p id="totalIncome" class="text-4xl font-bold mt-2 text-gray-800">0,00 kr.</p></div>
                            <div class="card p-6"><h3 class="text-lg font-semibold text-red-500">Total Udgift</h3><p id="totalExpense" class="text-4xl font-bold mt-2 text-gray-800">0,00 kr.</p></div>
                            <div class="card p-6"><h3 class="text-lg font-semibold text-blue-500">Månedligt Råderum</h3><p id="netResult" class="text-4xl font-bold mt-2 text-gray-800">0,00 kr.</p></div>
                        </div>
                    </section>

                    <!-- Add Transaction & Savings Transfer -->
                    <section class="card p-8">
                        <h2 class="text-2xl font-bold mb-4 text-gray-700">Ny Postering</h2>
                         <div class="flex space-x-4 mb-6">
                            <button id="showTransactionFormBtn" class="btn-primary flex-1">Tilføj Udgift/Indkomst</button>
                            <button id="showSavingsTransferBtn" class="btn-secondary flex-1">Overfør til Opsparing</button>
                        </div>
                        
                        <form id="transactionForm" class="space-y-4">
                            <input type="hidden" id="category" value="variable">
                            <div><label for="description" class="block text-sm font-medium text-gray-600">Beskrivelse</label><input type="text" id="description" placeholder="F.eks. Indkøb, Restaurantbesøg" class="input-field" required></div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label for="amount" class="block text-sm font-medium text-gray-600">Beløb (kr.)</label><input type="number" id="amount" placeholder="350" step="0.01" class="input-field" required></div>
                                <div><label for="type" class="block text-sm font-medium text-gray-600">Type</label><select id="type" class="input-field"><option value="expense">Udgift</option><option value="income">Indkomst</option></select></div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div><label for="subCategory" class="block text-sm font-medium text-gray-600">Kategori</label><input type="text" id="subCategory" placeholder="Mad, Transport, Tøj" class="input-field" required></div>
                                <div><label for="person" class="block text-sm font-medium text-gray-600">Person</label><input type="text" id="person" placeholder="Navn" class="input-field" required></div>
                            </div>
                            <div><label for="date" class="block text-sm font-medium text-gray-600">Dato</label><input type="date" id="date" class="input-field" required></div>
                            <div class="text-right"><button type="submit" class="btn-primary">Tilføj</button></div>
                        </form>

                        <form id="savingsTransferForm" class="hidden space-y-4">
                            <div><label class="block text-sm font-medium text-gray-600">Vælg Opsparingsmål</label><select id="savingsGoalSelect" class="input-field" required></select></div>
                            <div><label class="block text-sm font-medium text-gray-600">Beløb at overføre</label><input type="number" id="savingsTransferAmount" placeholder="500" class="input-field" required></div>
                            <div class="text-right"><button type="submit" class="btn-primary">Overfør</button></div>
                        </form>
                    </section>
                </div>

                <!-- Right Column -->
                <div class="lg:col-span-1 space-y-8">
                    <section class="card p-8">
                        <h2 class="text-2xl font-bold mb-4 text-gray-700">Opsparingsmål</h2>
                        <div id="savingsGoalList" class="space-y-6"></div>
                        <button id="manageSavingsGoalBtn" class="mt-6 w-full btn-secondary">Administrer Mål</button>
                    </section>
                    <section class="card p-8">
                        <h2 class="text-2xl font-bold mb-4 text-gray-700">Formue & Gæld</h2>
                        <div id="assetLiabilitySummary" class="space-y-4"></div>
                        <div class="mt-6"><h3 class="text-lg font-semibold text-gray-600">Beregnet Friværdi</h3><p id="netWorth" class="text-3xl font-bold text-gray-800">0,00 kr.</p></div>
                        <button id="addAssetLiabilityBtn" class="mt-6 w-full btn-secondary">Administrer Aktiver</button>
                    </section>
                    <section class="card p-8">
                        <h2 class="text-2xl font-bold mb-4 text-gray-700">Faste Poster</h2>
                        <div id="recurringSummary" class="space-y-2"></div>
                        <button id="manageRecurringBtn" class="mt-6 w-full btn-secondary">Administrer Faste Poster</button>
                    </section>
                </div>
            </main>
        </div>

        <!-- Modals -->
        <div id="assetLiabilityModal" class="modal economy-page">
            <div class="modal-content">
                <h2 id="assetModalTitle" class="text-2xl font-bold mb-4"></h2>
                <form id="assetLiabilityForm" class="space-y-4">
                    <input type="hidden" id="assetId">
                    <div><label for="modalAssetName" class="block text-sm font-medium text-gray-600">Navn (f.eks. Hus, Bil)</label><input type="text" id="modalAssetName" class="input-field" required></div>
                    <div><label for="modalAssetValue" class="block text-sm font-medium text-gray-600">Værdi (kr.)</label><input type="number" id="modalAssetValue" step="0.01" class="input-field" required></div>
                    <div class="border-t pt-4">
                        <div class="flex justify-between items-center"><p class="font-semibold text-lg">Tilknyttede Lån</p><button type="button" id="addLoanBtn" class="btn-secondary py-1 px-3 text-sm">Tilføj Lån</button></div>
                        <div id="liabilitiesContainer" class="mt-4 space-y-4"></div>
                    </div>
                    <div class="flex justify-between items-center pt-4">
                        <button type="button" id="deleteAssetBtn" class="btn-primary bg-red-500 hover:bg-red-600 hidden">Slet Aktiv</button>
                        <div class="flex justify-end space-x-3 flex-grow"><button type="button" id="closeAssetModal" class="btn-secondary">Annuller</button><button type="submit" class="btn-primary">Gem</button></div>
                    </div>
                </form>
            </div>
        </div>
        <div id="recurringModal" class="modal economy-page">
            <div class="modal-content">
                <h2 class="text-2xl font-bold mb-4">Administrer Faste Poster</h2>
                <div id="recurringList" class="max-h-60 overflow-y-auto mb-4 border-b pb-4"></div>
                <h3 class="text-xl font-semibold mb-4">Tilføj / Rediger Fast Post</h3>
                <form id="recurringForm" class="space-y-4">
                    <input type="hidden" id="recurringId">
                    <div><label class="block text-sm font-medium text-gray-600">Beskrivelse</label><input type="text" id="recurringDescription" placeholder="F.eks. Husforsikring" class="input-field" required></div>
                    <div class="grid grid-cols-2 gap-4">
                        <div><label class="block text-sm font-medium text-gray-600">Beløb (Total)</label><input type="number" id="recurringAmount" placeholder="1200" class="input-field" required></div>
                        <div><label class="block text-sm font-medium text-gray-600">Type</label><select id="recurringType" class="input-field"><option value="expense">Udgift</option><option value="income">Indkomst</option></select></div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div><label class="block text-sm font-medium text-gray-600">Kategori</label><input type="text" id="recurringSubCategory" placeholder="Forsikring, Lån" class="input-field" required></div>
                         <div><label class="block text-sm font-medium text-gray-600">Interval</label><select id="recurringInterval" class="input-field"><option value="monthly">Månedligt</option><option value="quarterly">Kvartalsvist</option><option value="yearly">Årligt</option></select></div>
                    </div>
                    <div class="flex justify-end space-x-3 pt-4">
                        <button type="button" id="closeRecurringModal" class="btn-secondary">Luk</button>
                        <button type="submit" class="btn-primary">Gem Post</button>
                    </div>
                </form>
            </div>
        </div>
        <div id="savingsGoalModal" class="modal economy-page">
            <div class="modal-content">
                <h2 class="text-2xl font-bold mb-4">Administrer Opsparingsmål</h2>
                <div id="savingsGoalListModal" class="max-h-60 overflow-y-auto mb-4 border-b pb-4"></div>
                <h3 class="text-xl font-semibold mb-4">Tilføj / Rediger Mål</h3>
                <form id="savingsGoalForm" class="space-y-4">
                    <input type="hidden" id="savingsGoalId">
                    <div><label class="block text-sm font-medium text-gray-600">Målets Navn</label><input type="text" id="goalName" placeholder="Ny Trappe" class="input-field" required></div>
                    <div class="grid grid-cols-2 gap-4">
                        <div><label class="block text-sm font-medium text-gray-600">Målbeløb (kr.)</label><input type="number" id="goalTargetAmount" placeholder="42000" class="input-field" required></div>
                        <div><label class="block text-sm font-medium text-gray-600">Måldato</label><input type="date" id="goalTargetDate" class="input-field" required></div>
                    </div>
                    <div class="flex justify-end space-x-3 pt-4">
                        <button type="button" class="btn-secondary" id="closeSavingsGoalModal">Luk</button>
                        <button type="submit" class="btn-primary">Gem Mål</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function setupRealtimeListeners() {
    const collections = ['transactions', 'assets', 'recurringItems', 'savingsGoals'];
    collections.forEach(name => {
        const unsub = onSnapshot(collection(db, getCollectionPath(name)), (snapshot) => {
            switch (name) {
                case 'transactions': allTransactions = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); break;
                case 'assets': allAssets = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); break;
                case 'recurringItems': allRecurringItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); break;
                case 'savingsGoals': allSavingsGoals = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); break;
            }
            updateUI();
        });
        unsubscribeListeners.push(unsub);
    });
}

function updateUI() {
    if (!userId) return;
    const { actualTransactions } = filterAndProcessTransactions();
    updateMonthDisplay();
    renderDashboardCards(actualTransactions, allRecurringItems);
    renderTransactionList(actualTransactions);
    renderSavingsGoals(allSavingsGoals);
    renderAssetsAndLiabilities(allAssets);
    renderRecurringSummary(allRecurringItems);
}

function filterAndProcessTransactions() {
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    let actualTransactions = allTransactions.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    return { actualTransactions };
}

function updateMonthDisplay() {
    const el = document.getElementById('currentMonthDisplay');
    if (el) el.textContent = `${currentDate.toLocaleString('da-DK', { month: 'long' })} ${currentDate.getFullYear()}`;
}

function renderDashboardCards(actualTransactions, recurringItems) {
    let income = actualTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    let expense = actualTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    recurringItems.forEach(item => {
        const monthlyAmount = getMonthlyAmount(item);
        if (item.type === 'income') income += monthlyAmount;
        else expense += monthlyAmount;
    });
    const incomeEl = document.getElementById('totalIncome');
    const expenseEl = document.getElementById('totalExpense');
    const netEl = document.getElementById('netResult');
    if (incomeEl) incomeEl.textContent = formatCurrency(income);
    if (expenseEl) expenseEl.textContent = formatCurrency(expense);
    if (netEl) netEl.textContent = formatCurrency(income - expense);
}

function renderTransactionList(transactions) {
    const listEl = document.getElementById('transactionList');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (transactions.length === 0) { listEl.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-500">Ingen bevægelser for denne måned.</td></tr>`; return; }
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(t => {
        const row = listEl.insertRow();
        row.className = 'border-b border-gray-100';
        row.innerHTML = `<td class="p-3 text-sm text-gray-600">${new Date(t.date).toLocaleDateString('da-DK')}</td><td class="p-3 font-semibold text-gray-800">${t.description}</td><td class="p-3 text-sm text-gray-600">${t.person || '-'}</td><td class="p-3 text-sm text-gray-600">${t.subCategory || '-'}</td><td class="p-3 text-right font-semibold ${t.type === 'income' || t.description.includes('Opsparing') ? 'text-green-500' : 'text-red-500'}">${t.type === 'income' ? '+' : '-'} ${formatCurrency(t.amount)}</td>`;
    });
}

function renderSavingsGoals(goals) {
    const listEl = document.getElementById('savingsGoalList');
    const selectEl = document.getElementById('savingsGoalSelect');
    if (!listEl || !selectEl) return;
    listEl.innerHTML = '';
    selectEl.innerHTML = '<option value="">Vælg et mål...</option>';
    if (goals.length === 0) { listEl.innerHTML = '<p class="text-sm text-center text-gray-500">Du har ingen opsparingsmål endnu.</p>'; return; }
    goals.forEach(goal => {
        const saved = goal.savedAmount || 0, target = goal.targetAmount, percentage = target > 0 ? (saved / target) * 100 : 0, monthsLeft = monthsBetween(new Date(), new Date(goal.targetDate)), neededPerMonth = monthsLeft > 0 ? (target - saved) / monthsLeft : 0;
        const div = document.createElement('div');
        div.innerHTML = `<div class="flex justify-between items-center mb-1"><span class="font-bold text-gray-700">${goal.name}</span><span class="text-sm font-semibold text-gray-600">${formatCurrency(saved)} / ${formatCurrency(target)}</span></div><div class="w-full bg-blue-100 rounded-full h-4"><div class="bg-gradient-to-r from-yellow-300 to-yellow-400 h-4 rounded-full" style="width: ${percentage}%"></div></div><p class="text-xs text-right mt-1 text-gray-500">Du mangler at spare ${formatCurrency(neededPerMonth)}/md. for at nå målet.</p>`;
        listEl.appendChild(div);
        const option = document.createElement('option');
        option.value = goal.id; option.textContent = goal.name; selectEl.appendChild(option);
    });
}

function renderAssetsAndLiabilities(assets) {
    const summaryEl = document.getElementById('assetLiabilitySummary');
    if (!summaryEl) return;
    summaryEl.innerHTML = '';
    let totalAssetValue = 0, totalLiabilityValue = 0;

    if (assets.length === 0) {
        summaryEl.innerHTML = '<p class="text-gray-500 text-sm">Ingen aktiver tilføjet.</p>';
    }

    assets.forEach(asset => {
        totalAssetValue += asset.value;
        let assetLiabilityTotal = 0;
        let liabilityHTML = '';

        if (asset.liabilities && asset.liabilities.length > 0) {
            asset.liabilities.forEach(loan => {
                assetLiabilityTotal += loan.amount || 0;
                liabilityHTML += `<div class="flex justify-between items-center text-sm pl-4"><p class="text-gray-600">${loan.name}</p><p class="font-semibold text-red-500">-${formatCurrency(loan.amount)}</p></div>`;
            });
        }
        totalLiabilityValue += assetLiabilityTotal;

        const assetDiv = document.createElement('div');
        assetDiv.className = 'border-b pb-3';
        assetDiv.innerHTML = `<div class="flex justify-between items-center"><div class="flex items-center"><p class="font-semibold">${asset.name}</p><button class="edit-asset-btn ml-2 text-gray-400 hover:text-blue-600" data-id="${asset.id}"><i class="fas fa-pencil-alt fa-xs"></i></button></div><p class="font-bold text-green-500">${formatCurrency(asset.value)}</p></div>${liabilityHTML}`;
        summaryEl.appendChild(assetDiv);
    });

    const netWorthEl = document.getElementById('netWorth');
    if (netWorthEl) netWorthEl.textContent = formatCurrency(totalAssetValue - totalLiabilityValue);
}

function renderRecurringSummary(items) {
    const summaryEl = document.getElementById('recurringSummary');
    if (!summaryEl) return;
    summaryEl.innerHTML = '';
    if (items.length === 0) { summaryEl.innerHTML = '<p class="text-gray-500 text-sm">Ingen faste poster tilføjet.</p>'; return; }
    items.forEach(item => {
        const monthlyAmount = getMonthlyAmount(item);
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center text-sm';
        div.innerHTML = `<span class="text-gray-700">${item.description}</span><span class="font-semibold ${item.type === 'expense' ? 'text-red-600' : 'text-green-600'}">${formatCurrency(monthlyAmount)}/md.</span>`;
        summaryEl.appendChild(div);
    });
}

function setupEventListeners() {
    const app = document.getElementById('app');
    app.addEventListener('click', (e) => {
        // Navigation
        if (e.target.closest('#prevMonthBtn')) { currentDate.setMonth(currentDate.getMonth() - 1); updateUI(); }
        if (e.target.closest('#nextMonthBtn')) { currentDate.setMonth(currentDate.getMonth() + 1); updateUI(); }
        // Form Toggling
        if (e.target.closest('#showTransactionFormBtn')) {
            document.getElementById('transactionForm')?.classList.remove('hidden');
            document.getElementById('savingsTransferForm')?.classList.add('hidden');
        }
        if (e.target.closest('#showSavingsTransferBtn')) {
            document.getElementById('transactionForm')?.classList.add('hidden');
            document.getElementById('savingsTransferForm')?.classList.remove('hidden');
        }
        // Modal Triggers
        if (e.target.closest('#manageSavingsGoalBtn')) openSavingsGoalModal();
        if (e.target.closest('#addAssetLiabilityBtn')) openAssetModal();
        if (e.target.closest('#manageRecurringBtn')) openRecurringModal();
        // Modal Closers
        if (e.target.closest('#closeSavingsGoalModal')) document.getElementById('savingsGoalModal').classList.remove('active');
        if (e.target.closest('#closeAssetModal')) document.getElementById('assetLiabilityModal').classList.remove('active');
        if (e.target.closest('#closeRecurringModal')) document.getElementById('recurringModal').classList.remove('active');
        // Asset/Loan buttons
        if (e.target.closest('#addLoanBtn')) addLoanToModal();
        if (e.target.closest('.edit-asset-btn')) {
            const asset = allAssets.find(a => a.id === e.target.closest('.edit-asset-btn').dataset.id);
            if (asset) openAssetModal(asset);
        }
        if (e.target.closest('.remove-loan-btn')) {
            e.target.closest('.loan-form-group').remove();
        }
    });

    app.addEventListener('submit', (e) => {
        if (e.target.id === 'transactionForm') handleTransactionSubmit(e);
        if (e.target.id === 'savingsGoalForm') handleSavingsGoalSubmit(e);
        if (e.target.id === 'savingsTransferForm') handleSavingsTransfer(e);
        if (e.target.id === 'assetLiabilityForm') handleAssetFormSubmit(e);
        if (e.target.id === 'recurringForm') handleRecurringSubmit(e);
    });
}

function openSavingsGoalModal() {
    const form = document.getElementById('savingsGoalForm');
    if (form) { form.reset(); document.getElementById('savingsGoalId').value = ''; document.getElementById('savingsGoalModal').classList.add('active'); }
}

function openAssetModal(asset = null) {
    const form = document.getElementById('assetLiabilityForm');
    if (form) {
        form.reset();
        document.getElementById('liabilitiesContainer').innerHTML = '';
        const nameInput = document.getElementById('modalAssetName');
        if (asset) {
            document.getElementById('assetId').value = asset.id;
            document.getElementById('assetModalTitle').textContent = `Rediger: ${asset.name}`;
            nameInput.value = asset.name;
            nameInput.readOnly = true;
            document.getElementById('modalAssetValue').value = asset.value;
            if (asset.liabilities) {
                asset.liabilities.forEach(loan => addLoanToModal(loan));
            }
        } else {
            document.getElementById('assetId').value = '';
            document.getElementById('assetModalTitle').textContent = 'Tilføj Nyt Aktiv';
            nameInput.readOnly = false;
        }
        document.getElementById('assetLiabilityModal').classList.add('active');
    }
}

function openRecurringModal() {
    const form = document.getElementById('recurringForm');
    if (form) { form.reset(); document.getElementById('recurringId').value = ''; document.getElementById('recurringModal').classList.add('active'); }
}

function addLoanToModal(loan = {}) {
    const container = document.getElementById('liabilitiesContainer');
    const loanId = loan.id || `loan_${generateId()}`;
    const div = document.createElement('div');
    div.className = 'loan-form-group p-4 border rounded-lg bg-gray-50 relative';
    div.dataset.loanId = loanId;
    div.innerHTML = `<button type="button" class="remove-loan-btn absolute top-2 right-2 text-red-500 hover:text-red-700">&times;</button><div class="grid grid-cols-2 gap-x-4 gap-y-2"><div class="col-span-2"><label class="text-sm font-medium">Lånets Navn</label><input type="text" data-field="name" value="${loan.name || ''}" class="input-field mt-1"></div><div><label class="text-sm font-medium">Resterende Gæld</label><input type="number" data-field="amount" value="${loan.amount || ''}" class="input-field mt-1"></div><div><label class="text-sm font-medium">Total Månedlig Betaling</label><input type="number" data-field="monthlyPayment" value="${loan.monthlyPayment || ''}" class="input-field mt-1"></div><div><label class="text-sm font-medium">Heraf Afdrag</label><input type="number" data-field="principalPayment" value="${loan.principalPayment || ''}" class="input-field mt-1"></div><div><label class="text-sm font-medium">Heraf Renter/Gebyr</label><input type="number" data-field="interestPayment" value="${loan.interestPayment || ''}" class="input-field mt-1"></div></div>`;
    container.appendChild(div);
}

async function handleTransactionSubmit(e) {
    e.preventDefault();
    await addDoc(collection(db, getCollectionPath('transactions')), {
        description: document.getElementById('description').value,
        amount: parseFloat(document.getElementById('amount').value),
        type: document.getElementById('type').value,
        category: 'variable',
        subCategory: document.getElementById('subCategory').value,
        person: document.getElementById('person').value,
        date: document.getElementById('date').value,
    });
    e.target.reset();
    document.getElementById('date').valueAsDate = new Date();
    showToast('Transaktion tilføjet!');
}

async function handleSavingsGoalSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('savingsGoalId').value;
    const data = { name: document.getElementById('goalName').value, targetAmount: parseFloat(document.getElementById('goalTargetAmount').value), targetDate: document.getElementById('goalTargetDate').value, savedAmount: parseFloat(id ? allSavingsGoals.find(g=>g.id===id).savedAmount : 0) };
    const docRef = id ? doc(db, getCollectionPath('savingsGoals'), id) : doc(collection(db, getCollectionPath('savingsGoals')));
    await setDoc(docRef, data, { merge: true });
    document.getElementById('savingsGoalModal').classList.remove('active');
    showToast('Opsparingsmål gemt!');
}

async function handleSavingsTransfer(e) {
    e.preventDefault();
    const goalId = document.getElementById('savingsGoalSelect').value, amount = parseFloat(document.getElementById('savingsTransferAmount').value);
    if (!goalId || !amount || amount <= 0) { showToast('Vælg et mål og indtast et gyldigt beløb.'); return; }
    const goal = allSavingsGoals.find(g => g.id === goalId);
    await addDoc(collection(db, getCollectionPath('transactions')), { description: `Opsparing: ${goal.name}`, amount: amount, type: 'expense', category: 'savings', subCategory: 'Opsparing', person: 'System', date: new Date().toISOString().split('T')[0] });
    await updateDoc(doc(db, getCollectionPath('savingsGoals'), goalId), { savedAmount: increment(amount) });
    e.target.reset();
    showToast(`${formatCurrency(amount)} overført til ${goal.name}!`);
}

async function handleAssetFormSubmit(e) {
    e.preventDefault();
    const assetId = document.getElementById('assetId').value;
    const assetName = document.getElementById('modalAssetName').value;
    const liabilities = [];
    document.querySelectorAll('.loan-form-group').forEach(group => {
        const loan = { id: group.dataset.loanId };
        group.querySelectorAll('input[data-field]').forEach(input => {
            loan[input.dataset.field] = input.type === 'number' ? parseFloat(input.value) || 0 : input.value;
        });
        liabilities.push(loan);
    });
    const assetData = { name: assetName, value: parseFloat(document.getElementById('modalAssetValue').value), liabilities: liabilities };
    const docId = assetId || assetName; // Brug eksisterende ID eller navnet som nyt ID
    await setDoc(doc(db, getCollectionPath('assets'), docId), assetData);
    document.getElementById('assetLiabilityModal').classList.remove('active');
    showToast('Aktiv gemt!');
}

async function handleRecurringSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('recurringId').value;
    const data = {
        description: document.getElementById('recurringDescription').value,
        amount: parseFloat(document.getElementById('recurringAmount').value),
        type: document.getElementById('recurringType').value,
        subCategory: document.getElementById('recurringSubCategory').value,
        interval: document.getElementById('recurringInterval').value,
    };
    const docRef = id ? doc(db, getCollectionPath('recurringItems'), id) : doc(collection(db, getCollectionPath('recurringItems')));
    await setDoc(docRef, data, { merge: true });
    document.getElementById('recurringForm').reset();
    document.getElementById('recurringId').value = '';
    showToast('Fast post gemt!');
}
