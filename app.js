// =================================================================
// 0. FIREBASE INITIALISERING & IMPORTS
// =================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getAuth,
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    getFirestore,
    collection, 
    onSnapshot,
    addDoc,
    doc,
    updateDoc,
    deleteDoc,
    setDoc,
    writeBatch,
    deleteField,
    runTransaction,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// WARNING: Det anbefales kraftigt at bruge miljøvariabler eller et sikkert system til nøglehåndtering
// i stedet for at hardcode din Firebase-konfiguration i et klientside-script.
const firebaseConfig = {
  apiKey: "AIzaSyAs8XVRkru11e8MpZLJrzB-iXKg3SGjHnw",
  authDomain: "frederikkes-kogebog.firebaseapp.com",
  projectId: "frederikkes-kogebog",
  storageBucket: "frederikkes-kogebog.firebasestorage.app",
  messagingSenderId: "557087234453",
  appId: "1:557087234453:web:9abec4eb124bc08583be9c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
    // --- Globale Elementer ---
    const loginPage = document.getElementById('login-page');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const logoutButtons = [document.getElementById('logout-btn-header'), document.getElementById('logout-btn-profile')];
    const navLinks = document.querySelectorAll('.desktop-nav .nav-link');
    const pages = document.querySelectorAll('#app-main-content .page');
    const headerTitleLink = document.querySelector('.header-title-link');

    // --- Vare Modal Elementer ---
    const inventoryItemModal = document.getElementById('inventory-item-modal');
    const inventoryItemForm = document.getElementById('inventory-item-form');
    const addInventoryItemBtn = document.getElementById('add-inventory-item-btn');
    const inventoryModalTitle = document.getElementById('inventory-modal-title');
    const inventoryTableBody = document.querySelector('.inventory-table tbody');
    const buyWholeCheckbox = document.getElementById('item-buy-whole');
    const buyWholeOptions = document.getElementById('buy-whole-options');
    
    // --- Opskrift Elementer ---
    const recipeEditModal = document.getElementById('recipe-edit-modal');
    const recipeForm = document.getElementById('recipe-form');
    const addRecipeBtn = document.getElementById('add-recipe-btn');
    const recipeEditModalTitle = document.getElementById('recipe-edit-modal-title');
    const recipeGrid = document.querySelector('.recipe-grid');
    const ingredientsContainer = document.getElementById('ingredients-container');
    const addIngredientBtn = document.getElementById('add-ingredient-btn');
    const importIngredientsBtn = document.getElementById('import-ingredients-btn');
    const recipeImportTextarea = document.getElementById('recipe-import-textarea');
    const recipeImagePreview = document.getElementById('recipe-image-preview');
    const recipeImageUrlInput = document.getElementById('recipe-imageUrl');
    const recipeFilterContainer = document.getElementById('recipe-filter-container');
    const sortByStockToggle = document.getElementById('sort-by-stock-toggle');
    
    // --- Opskrift Læsevisning Modal Elementer ---
    const recipeReadModal = document.getElementById('recipe-read-modal');
    const readViewPlanBtn = document.getElementById('read-view-plan-btn');
    const readViewEditBtn = document.getElementById('read-view-edit-btn');
    const readViewDeleteBtn = document.getElementById('read-view-delete-btn');
    const readViewPrice = document.getElementById('read-view-price');

    // --- Madplan Side Elementer ---
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarTitle = document.getElementById('calendar-title');
    const prevWeekBtn = document.getElementById('prev-week-btn');
    const nextWeekBtn = document.getElementById('next-week-btn');
    const autogenPlanBtn = document.getElementById('autogen-plan-btn');
    const clearMealPlanBtn = document.getElementById('clear-meal-plan-btn');
    
    // --- Indkøbsliste Elementer ---
    const shoppingListPanel = document.getElementById('shopping-list-panel');
    const generateWeeklyShoppingListBtn = document.getElementById('generate-weekly-shopping-list-btn');
    const clearShoppingListBtn = document.getElementById('clear-shopping-list-btn');
    const confirmPurchaseBtn = document.getElementById('confirm-purchase-btn');
    const addShoppingItemForm = document.getElementById('add-shopping-item-form');
    
    // --- "Planlæg Måltid" Modal Elementer ---
    const planMealModal = document.getElementById('plan-meal-modal');
    const planMealForm = document.getElementById('plan-meal-form');
    const planMealModalTitle = document.getElementById('plan-meal-modal-title');
    const mealTypeSelector = planMealModal.querySelector('.meal-type-selector');

    // --- Referencer Side ---
    const referencesContainer = document.getElementById('references-container');

    // --- Oversigt Side ---
    const inventorySummaryCard = document.getElementById('inventory-summary-card');

    // --- Mobil UI Elementer ---
    const mobileTabBar = document.getElementById('mobile-tab-bar');
    const mobileTabLinks = document.querySelectorAll('.mobile-tab-link');
    const mobilePanelOverlay = document.getElementById('mobile-panel-overlay');
    const mobileShoppingListPanel = document.getElementById('mobile-shopping-list-panel');

    // --- Autogen Modal ---
    const autogenModal = document.getElementById('autogen-modal');
    const autogenForm = document.getElementById('autogen-form');
    const autogenDietTagsContainer = document.getElementById('autogen-diet-tags');

    // --- Notifikations Modal Elementer ---
    const notificationModal = document.getElementById('notification-modal');
    const notificationTitle = document.getElementById('notification-title');
    const notificationMessage = document.getElementById('notification-message');
    const notificationActions = document.getElementById('notification-actions');

    // --- NY: Bekræft Madlavning Modal Elementer ---
    const confirmCookingModal = document.getElementById('confirm-cooking-modal');
    const confirmCookingTitle = document.getElementById('confirm-cooking-title');
    const confirmCookingList = document.getElementById('confirm-cooking-list');
    const confirmCookingActionBtn = document.getElementById('confirm-cooking-action-btn');
    const cancelCookingBtn = document.getElementById('cancel-cooking-btn');

    // --- State Management ---
    const state = {
        currentUser: null,
        inventory: [],
        recipes: [],
        references: {},
        mealPlan: {},
        shoppingList: {},
        activeRecipeFilterTags: new Set(),
        currentDate: new Date(),
        currentlyViewedRecipeId: null,
        listeners: {
            inventory: null,
            recipes: null,
            mealPlan: null,
            shoppingList: null,
            references: null,
        }
    };

    // =================================================================
    // 0. HJÆLPEFUNKTIONER & VÆRKTØJER
    // =================================================================
    
    function handleError(error, userMessage = "Der opstod en uventet fejl.") {
        console.error("En fejl opstod:", error);
        showNotification({ title: "Fejl", message: userMessage });
    }

    function debounce(func, delay = 300) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    }

    function showNotification({ title, message, type = 'alert' }) {
        notificationTitle.textContent = title;
        notificationMessage.innerHTML = message;
        notificationActions.innerHTML = ''; 

        return new Promise((resolve) => {
            if (type === 'confirm') {
                const confirmBtn = document.createElement('button');
                confirmBtn.className = 'btn btn-primary';
                confirmBtn.textContent = 'Bekræft';
                confirmBtn.onclick = () => {
                    notificationModal.classList.add('hidden');
                    resolve(true);
                };

                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'btn btn-secondary';
                cancelBtn.textContent = 'Annuller';
                cancelBtn.onclick = () => {
                    notificationModal.classList.add('hidden');
                    resolve(false);
                };
                notificationActions.append(cancelBtn, confirmBtn);
            } else {
                const okBtn = document.createElement('button');
                okBtn.className = 'btn btn-primary';
                okBtn.textContent = 'OK';
                okBtn.onclick = () => {
                    notificationModal.classList.add('hidden');
                    resolve(true);
                };
                notificationActions.append(okBtn);
            }
            notificationModal.classList.remove('hidden');
        });
    }
    
    function getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
        return weekNo;
    }

    function getStartOfWeek(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
        return new Date(d.setDate(diff));
    }

    function formatDate(date) {
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
    }

    // =================================================================
    // 1. AUTHENTICATION LOGIK
    // =================================================================
    onAuthStateChanged(auth, (user) => {
        if (user) {
            state.currentUser = user;
            document.getElementById('profile-email').textContent = user.email;
            loginPage.classList.add('hidden');
            appContainer.classList.remove('hidden');
            setupRealtimeListeners(user.uid); 
            navigateTo(window.location.hash || '#meal-planner');
        } else {
            state.currentUser = null;
            appContainer.classList.add('hidden');
            loginPage.classList.remove('hidden');
            Object.keys(state.listeners).forEach(key => {
                if (state.listeners[key]) state.listeners[key]();
            });
        }
    });

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        signInWithEmailAndPassword(auth, email, password)
            .catch((error) => {
                console.error("Login Fejl:", error.code);
                loginForm.querySelector('#login-error').textContent = 'Login fejlede. Tjek email og adgangskode.';
            });
    });

    logoutButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            signOut(auth).catch(error => handleError(error, "Logout fejlede."));
        });
    });

    // =================================================================
    // 2. NAVIGATION & MODAL HÅNDTERING
    // =================================================================
    const navigateTo = (hash) => {
        const cleanHash = hash.split('?')[0]; // Ignorer query parametre
        pages.forEach(page => page.classList.add('hidden'));
        const targetPage = document.querySelector(cleanHash);
        if (targetPage) {
            targetPage.classList.remove('hidden');
        } else {
            document.getElementById('meal-planner').classList.remove('hidden');
        }
        
        navLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === cleanHash));
        mobileTabLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === cleanHash));

        switch(cleanHash) {
            case '#meal-planner':
            case '':
                renderMealPlanner();
                renderShoppingList(document.getElementById('shopping-list-container'));
                break;
            case '#recipes':
                renderRecipes();
                renderPageTagFilters();
                break;
            case '#inventory':
                renderInventory();
                break;
            case '#references':
                renderReferencesPage();
                break;
            case '#overview':
                renderInventorySummary();
                break;
        }
    };
    
    window.addEventListener('hashchange', () => navigateTo(window.location.hash || '#meal-planner'));
    
    headerTitleLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.hash = '#meal-planner';
    });

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.hash = e.currentTarget.getAttribute('href');
        });
    });
    
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.currentTarget.closest('.modal-overlay').classList.add('hidden');
        });
    });

    // =================================================================
    // 3. FIRESTORE REAL-TIME LISTENERS
    // =================================================================
    function setupRealtimeListeners(userId) {
        if (!userId) return;

        Object.keys(state.listeners).forEach(key => {
            if (state.listeners[key]) state.listeners[key]();
        });

        const inventoryRef = collection(db, 'inventory_items');
        state.listeners.inventory = onSnapshot(inventoryRef, (snapshot) => {
            state.inventory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (document.querySelector('#inventory:not(.hidden)')) renderInventory();
            if (document.querySelector('#recipes:not(.hidden)')) renderRecipes();
            if (document.querySelector('#overview:not(.hidden)')) renderInventorySummary();
        }, (error) => handleError(error, "Kunne ikke hente varelager."));

        const recipesRef = collection(db, 'recipes');
        state.listeners.recipes = onSnapshot(recipesRef, (snapshot) => {
            state.recipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (document.querySelector('#recipes:not(.hidden)')) {
                renderPageTagFilters();
                renderRecipes();
            }
            document.getElementById('profile-recipe-count').textContent = state.recipes.length;
            document.getElementById('profile-favorite-count').textContent = state.recipes.filter(r => r.is_favorite).length;
        }, (error) => handleError(error, "Kunne ikke hente opskrifter."));

        const year = state.currentDate.getFullYear();
        const mealPlanDocId = `plan_${year}`; 
        const mealPlanRef = doc(db, 'meal_plans', mealPlanDocId);
        state.listeners.mealPlan = onSnapshot(mealPlanRef, (doc) => {
            state.mealPlan = doc.exists() ? doc.data() : {};
            if (document.querySelector('#meal-planner:not(.hidden)')) {
                renderMealPlanner(); 
            }
        }, (error) => handleError(error, "Kunne ikke hente madplan."));

        const shoppingListRef = doc(db, 'shopping_lists', userId);
        state.listeners.shoppingList = onSnapshot(shoppingListRef, (doc) => {
            state.shoppingList = doc.exists() ? doc.data().items || {} : {};
            if (document.querySelector('#meal-planner:not(.hidden)')) {
                renderShoppingList(document.getElementById('shopping-list-container'));
            }
            if(mobileShoppingListPanel.classList.contains('active')) {
                renderShoppingList(mobileShoppingListPanel.querySelector('.sidebar-content'));
            }
        }, (error) => handleError(error, "Kunne ikke hente indkøbsliste."));
        
        const referencesRef = doc(db, 'references', userId);
        state.listeners.references = onSnapshot(referencesRef, (doc) => {
            state.references = doc.exists() ? doc.data() : { itemCategories: [], itemLocations: [] };
            if (document.querySelector('#references:not(.hidden)')) {
                renderReferencesPage();
            }
        }, (error) => handleError(error, "Kunne ikke hente referencelister."));
    }

    // =================================================================
    // 4. RENDER FUNKTIONER
    // =================================================================
    
    function renderInventory() {
        inventoryTableBody.innerHTML = ''; 
        if (state.inventory.length === 0) {
             inventoryTableBody.innerHTML = `<tr><td colspan="8">Dit varelager er tomt. Tilføj en vare for at starte.</td></tr>`;
             return;
        }
        
        const fragment = document.createDocumentFragment();
        state.inventory.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
            const tr = document.createElement('tr');
            tr.dataset.id = item.id;
            
            const stockPercentage = (item.current_stock && item.max_stock) ? (item.current_stock / item.max_stock) * 100 : 100;
            let stockColor = 'var(--status-green)';
            if (stockPercentage < 50) stockColor = 'var(--status-yellow)';
            if (stockPercentage < 20) stockColor = 'var(--status-red)';

            let stockStatus = { text: 'På lager', className: 'status-ok' };
            if (item.max_stock > 0) {
                const stockLevel = item.current_stock || 0;
                if (stockLevel === 0) stockStatus = { text: 'Tom', className: 'status-critical' };
                else if (stockLevel < item.max_stock / 2) stockStatus = { text: 'Lav', className: 'status-low' };
            } else {
                stockStatus = { text: '-', className: 'status-unknown' };
            }

            tr.innerHTML = `
                <td>${item.name || ''}</td>
                <td>
                    <div class="stock-display">
                        <div class="stock-bar"><div class="stock-level" style="width: ${stockPercentage}%; background-color: ${stockColor};"></div></div>
                        <span>${item.current_stock || 0} ${item.unit || ''}</span>
                    </div>
                </td>
                <td><span class="status-badge ${stockStatus.className}">${stockStatus.text}</span></td>
                <td>${item.category || ''}</td>
                <td>${item.kg_price ? `${item.kg_price.toFixed(2)} kr.` : ''}</td>
                <td>${item.grams_per_unit || ''}</td>
                <td>${item.home_location || ''}</td>
                <td><button class="btn-icon edit-item"><i class="fas fa-edit"></i></button> <button class="btn-icon delete-item"><i class="fas fa-trash"></i></button></td>`;
            fragment.appendChild(tr);
        });
        inventoryTableBody.appendChild(fragment);
    }
    
    function renderRecipes() {
        recipeGrid.innerHTML = '';
        let recipesToRender = state.recipes.map(calculateRecipeMatch);

        if (state.activeRecipeFilterTags.size > 0) {
            recipesToRender = recipesToRender.filter(r => [...state.activeRecipeFilterTags].every(tag => r.tags?.includes(tag)));
        }
        
        recipesToRender.sort((a, b) => {
            if (sortByStockToggle.checked) {
                if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
            }
            return a.title.localeCompare(b.title);
        });

        if (recipesToRender.length === 0) {
            recipeGrid.innerHTML = `<p class="empty-state">Ingen opskrifter matcher dine valg.</p>`;
            return;
        }
        
        const fragment = document.createDocumentFragment();
        recipesToRender.forEach(recipe => {
            const card = document.createElement('div');
            card.className = 'recipe-card';
            card.dataset.id = recipe.id;
            
            let statusClass = 'status-red', statusTitle = `Mangler ${recipe.missingCount} ingrediens(er)`;
            if (recipe.missingCount === 0) { statusClass = 'status-green'; statusTitle = 'Du har alle ingredienser'; } 
            else if (recipe.missingCount === 1) { statusClass = 'status-yellow'; statusTitle = 'Mangler 1 ingrediens'; }

            card.innerHTML = `
                <div class="status-indicator ${statusClass}" title="${statusTitle}"></div>
                <img src="${recipe.imageUrl || `https://placehold.co/400x300/f3f0e9/d1603d?text=${encodeURIComponent(recipe.title)}`}" alt="Billede af ${recipe.title}" class="recipe-card-image" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/400x300/f3f0e9/d1603d?text=Billede+mangler';">
                <div class="recipe-card-content">
                    <span class="recipe-card-category">${recipe.category || 'Ukategoriseret'}</span>
                    <h4>${recipe.title}</h4>
                    <div class="recipe-card-tags">${(recipe.tags || []).map(tag => `<span class="recipe-card-tag">${tag}</span>`).join('')}</div>
                </div>
                <div class="recipe-card-actions">
                    <i class="${recipe.is_favorite ? 'fas is-favorite' : 'far'} fa-heart favorite-icon" title="Marker som favorit"></i>
                    <button class="btn-icon add-to-plan-btn" title="Føj til madplan"><i class="fas fa-calendar-plus"></i></button>
                    <button class="btn-icon delete-recipe-btn" title="Slet opskrift"><i class="fas fa-trash"></i></button>
                </div>`;
            fragment.appendChild(card);
        });
        recipeGrid.appendChild(fragment);
    }
    
    function renderPageTagFilters() {
        const allTags = new Set(state.recipes.flatMap(r => r.tags || []));
        recipeFilterContainer.innerHTML = '';
        [...allTags].sort().forEach(tag => {
            const isActive = state.activeRecipeFilterTags.has(tag);
            const tagButton = document.createElement('button');
            tagButton.className = `filter-tag ${isActive ? 'active' : ''}`;
            tagButton.innerHTML = isActive ? `<i class="fas fa-check"></i> ${tag}` : tag;
            tagButton.onclick = () => {
                state.activeRecipeFilterTags.has(tag) ? state.activeRecipeFilterTags.delete(tag) : state.activeRecipeFilterTags.add(tag);
                renderPageTagFilters();
                renderRecipes();
            };
            recipeFilterContainer.appendChild(tagButton);
        });
    }
    
    function renderShoppingList(container) {
        if(!container) return;
        container.innerHTML = '';
        const groupedList = Object.values(state.shoppingList).reduce((acc, item) => {
            const section = item.store_section || 'Andet';
            if (!acc[section]) acc[section] = [];
            acc[section].push(item);
            return acc;
        }, {});

        if (Object.keys(groupedList).length === 0) {
            container.innerHTML = `<p class="empty-state">Din indkøbsliste er tom.</p>`;
            document.getElementById('shopping-list-total-container').classList.add('hidden');
            confirmPurchaseBtn.style.display = 'none';
            return;
        }

        document.getElementById('shopping-list-total-container').classList.remove('hidden');
        confirmPurchaseBtn.style.display = 'inline-flex';
        
        const fragment = document.createDocumentFragment();
        Object.keys(groupedList).sort().forEach(section => {
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'store-section';
            const listItemsHTML = groupedList[section].sort((a,b) => a.name.localeCompare(b.name)).map(item => {
                const safeItemName = item.name.replace(/[^a-zA-Z0-9]/g, '-');
                const newItemIndicator = !state.inventory.some(inv => inv.name.toLowerCase() === item.name.toLowerCase()) 
                    ? `<button class="btn-icon new-item-indicator" data-item-name="${item.name}" title="Tilføj '${item.name}' til varelageret"><i class="fas fa-plus-circle"></i></button>`
                    : '';
                return `
                    <li class="shopping-list-item" data-item-name="${item.name}">
                        <div class="item-main-info">
                             <input type="checkbox" id="shop-${safeItemName}" class="shopping-list-checkbox">
                             <div class="item-name-details">
                                <label for="shop-${safeItemName}">${item.name}</label>
                                <div class="item-details">
                                    <input type="number" class="item-quantity-input" value="${item.quantity_to_buy}" step="any">
                                    <input type="text" class="item-unit-input" value="${item.unit}">
                                </div>
                             </div>
                        </div>
                        <div class="item-actions">${newItemIndicator}<button class="btn-icon remove-from-list-btn" title="Fjern fra liste"><i class="fas fa-times-circle"></i></button></div>
                    </li>`;
            }).join('');
            sectionDiv.innerHTML = `<h4>${section}</h4><ul>${listItemsHTML}</ul>`;
            fragment.appendChild(sectionDiv);
        });
        container.appendChild(fragment);
        calculateAndRenderShoppingListTotal();
    }
    
    function renderReadView(recipe) {
        document.getElementById('read-view-image').src = recipe.imageUrl || `https://placehold.co/600x400/f3f0e9/d1603d?text=${encodeURIComponent(recipe.title)}`;
        document.getElementById('read-view-title').textContent = recipe.title;
        document.getElementById('read-view-category').textContent = recipe.category || '';
        document.getElementById('read-view-time').innerHTML = `<i class="fas fa-clock"></i> ${recipe.time || '?'} min.`;
        document.getElementById('read-view-portions').innerHTML = `<i class="fas fa-users"></i> ${recipe.portions || '?'} portioner`;
        
        const recipePrice = calculateRecipePrice(recipe);
        readViewPrice.innerHTML = `<i class="fas fa-coins"></i> ${recipePrice > 0 ? `~${recipePrice.toFixed(2)} kr.` : 'Pris ukendt'}`;

        document.getElementById('read-view-tags').innerHTML = (recipe.tags || []).map(tag => `<span class="recipe-card-tag">${tag}</span>`).join('');
        document.getElementById('read-view-notes').textContent = recipe.notes || '';
        document.getElementById('read-view-ingredients-list').innerHTML = (recipe.ingredients || []).map(ing => `<li>${ing.quantity || ''} ${ing.unit || ''} ${ing.name}</li>`).join('');
        document.getElementById('read-view-instructions-text').innerHTML = (recipe.instructions || '').split('\n').map(line => `<p>${line}</p>`).join('');
        
        state.currentlyViewedRecipeId = recipe.id;
        recipeReadModal.classList.remove('hidden');
    }

    function renderReferencesPage() {
        referencesContainer.innerHTML = '';
        const referenceData = {
            itemCategories: { title: 'Varekategorier', items: state.references.itemCategories || [] },
            itemLocations: { title: 'Placeringer i Hjemmet', items: state.references.itemLocations || [] }
        };

        Object.entries(referenceData).forEach(([key, data]) => {
            const card = document.createElement('div');
            card.className = 'reference-card';
            card.dataset.key = key;
            card.innerHTML = `
                <h4>${data.title}</h4>
                <ul class="reference-list">${(data.items || []).map(item => `<li class="reference-item"><span>${item}</span><button class="btn-icon delete-reference-item" data-value="${item}"><i class="fas fa-trash"></i></button></li>`).join('')}</ul>
                <form class="add-reference-form">
                    <div class="input-group"><input type="text" placeholder="Tilføj ny..." required></div>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-plus"></i></button>
                </form>`;
            referencesContainer.appendChild(card);
        });
    }

    function renderInventorySummary() {
        let totalValue = 0, totalGrams = 0;
        state.inventory.forEach(item => {
            if (item.grams_in_stock) {
                totalGrams += item.grams_in_stock;
                if (item.kg_price) totalValue += (item.grams_in_stock / 1000) * item.kg_price;
            }
        });
        inventorySummaryCard.innerHTML = `
            <h3>Lagerstatus</h3>
            <div class="summary-item"><span>Samlet lagerværdi</span><span class="summary-value">${totalValue.toFixed(2)} kr.</span></div>
            <div class="summary-item"><span>Samlet vægt på lager</span><span class="summary-value">${(totalGrams / 1000).toFixed(2)} kg</span></div>`;
    }

    // =================================================================
    // 5. CRUD & INTELLIGENS (Varelager, Opskrifter, Referencer)
    // =================================================================
    
    // Varelager
    addInventoryItemBtn.addEventListener('click', () => {
        inventoryModalTitle.textContent = 'Tilføj ny vare';
        inventoryItemForm.reset();
        buyWholeOptions.classList.add('hidden');
        document.getElementById('inventory-item-id').value = '';
        inventoryItemModal.classList.remove('hidden');
    });

    buyWholeCheckbox.addEventListener('change', () => buyWholeOptions.classList.toggle('hidden', !buyWholeCheckbox.checked));

    inventoryItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const itemId = document.getElementById('inventory-item-id').value;
        const quantity = parseFloat(document.getElementById('item-current-stock').value) || 0;
        const unit = (document.getElementById('item-unit').value || '').trim();
        const gramsPerUnit = parseFloat(document.getElementById('item-grams-per-unit').value) || null;
        const buyAsWhole = document.getElementById('item-buy-whole').checked;

        const itemData = {
            name: (document.getElementById('item-name').value || '').trim(),
            description: (document.getElementById('item-description').value || '').trim(),
            category: (document.getElementById('item-category').value || '').trim(),
            home_location: (document.getElementById('item-home-location').value || '').trim(),
            current_stock: quantity,
            max_stock: Number(document.getElementById('item-max-stock').value) || null,
            unit: unit,
            kg_price: Number(document.getElementById('item-kg-price').value) || null,
            grams_per_unit: gramsPerUnit,
            grams_in_stock: (unit.toLowerCase() === 'g') ? quantity : (gramsPerUnit ? quantity * gramsPerUnit : 0),
            buy_as_whole_unit: buyAsWhole,
            aliases: (document.getElementById('item-aliases').value || '').split(',').map(a => a.trim()).filter(a => a),
            purchase_unit: buyAsWhole && (document.getElementById('item-buy-unit-name').value || '').trim() ? {
                name: (document.getElementById('item-buy-unit-name').value || '').trim(),
                quantity: parseFloat(document.getElementById('item-buy-unit-quantity').value) || null
            } : null
        };

        try {
            if (itemId) await updateDoc(doc(db, 'inventory_items', itemId), itemData);
            else await addDoc(collection(db, 'inventory_items'), itemData);
            inventoryItemModal.classList.add('hidden');
        } catch (error) { handleError(error, "Varen kunne ikke gemmes."); }
    });

    inventoryTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const docId = target.closest('tr').dataset.id;
        
        if (target.classList.contains('delete-item')) {
            if (await showNotification({ title: "Slet Vare", message: "Er du sikker?", type: 'confirm' })) {
                try { await deleteDoc(doc(db, 'inventory_items', docId)); } 
                catch (error) { handleError(error, "Varen kunne ikke slettes."); }
            }
        }

        if (target.classList.contains('edit-item')) {
            const item = state.inventory.find(i => i.id === docId);
            if (item) {
                inventoryModalTitle.textContent = 'Rediger vare';
                Object.keys(item).forEach(key => {
                    const input = document.getElementById(`item-${key.replace(/_/g, '-')}`);
                    if (input) input.value = item[key] ?? '';
                });
                document.getElementById('inventory-item-id').value = item.id;
                document.getElementById('item-aliases').value = (item.aliases || []).join(', ');
                buyWholeCheckbox.checked = item.buy_as_whole_unit || false;
                buyWholeOptions.classList.toggle('hidden', !buyWholeCheckbox.checked);
                if (item.purchase_unit) {
                    document.getElementById('item-buy-unit-name').value = item.purchase_unit.name || '';
                    document.getElementById('item-buy-unit-quantity').value = item.purchase_unit.quantity || '';
                }
                inventoryItemModal.classList.remove('hidden');
            }
        }
    });

    // Opskrifter
    addRecipeBtn.addEventListener('click', () => {
        recipeEditModalTitle.textContent = 'Tilføj ny opskrift';
        recipeForm.reset();
        document.getElementById('recipe-id').value = '';
        ingredientsContainer.innerHTML = '';
        recipeImagePreview.src = 'https://placehold.co/600x400/f3f0e9/d1603d?text=Indsæt+URL';
        createIngredientRow(ingredientsContainer);
        recipeEditModal.classList.remove('hidden');
    });
    
    recipeGrid.addEventListener('click', async (e) => {
        const card = e.target.closest('.recipe-card');
        if (!card) return;
        const docId = card.dataset.id;
        const recipe = state.recipes.find(r => r.id === docId);
        if (!recipe) return;

        const target = e.target.closest('button, i');
        if (target?.classList.contains('favorite-icon')) {
            await updateDoc(doc(db, 'recipes', docId), { is_favorite: !recipe.is_favorite });
        } else if (target?.classList.contains('add-to-plan-btn')) {
            openPlanMealModal(docId);
        } else if (target?.classList.contains('delete-recipe-btn')) {
            if (await showNotification({title: "Slet Opskrift", message: "Er du sikker?", type: 'confirm'})) {
                await deleteDoc(doc(db, 'recipes', docId));
            }
        } else if (e.target.closest('.recipe-card-content')) {
            renderReadView(recipe);
        }
    });

    recipeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const recipeId = document.getElementById('recipe-id').value;
        const recipeData = {
            title: document.getElementById('recipe-title').value,
            category: document.getElementById('recipe-category').value,
            tags: document.getElementById('recipe-tags').value.split(',').map(tag => tag.trim()).filter(Boolean),
            portions: Number(document.getElementById('recipe-portions').value) || null,
            time: Number(document.getElementById('recipe-time').value) || null,
            notes: document.getElementById('recipe-notes').value,
            instructions: document.getElementById('recipe-instructions').value,
            source_url: document.getElementById('recipe-source-url').value,
            imageUrl: document.getElementById('recipe-imageUrl').value || null,
            is_favorite: state.recipes.find(r => r.id === recipeId)?.is_favorite || false,
            ingredients: Array.from(ingredientsContainer.querySelectorAll('.ingredient-row')).map(row => ({
                name: row.querySelector('.ingredient-name').value.trim(),
                quantity: Number(row.querySelector('.ingredient-quantity').value) || null,
                unit: row.querySelector('.ingredient-unit').value.trim()
            })).filter(ing => ing.name)
        };

        try {
            if (recipeId) await updateDoc(doc(db, 'recipes', recipeId), recipeData);
            else await addDoc(collection(db, 'recipes'), recipeData);
            recipeEditModal.classList.add('hidden');
        } catch (error) { handleError(error, "Opskriften kunne ikke gemmes."); }
    });
    
    readViewEditBtn.addEventListener('click', () => {
        const recipe = state.recipes.find(r => r.id === state.currentlyViewedRecipeId);
        if (recipe) {
            recipeReadModal.classList.add('hidden');
            recipeEditModalTitle.textContent = 'Rediger opskrift';
            Object.keys(recipe).forEach(key => {
                const input = document.getElementById(`recipe-${key.replace(/_/g, '-')}`);
                if (input) input.value = recipe[key] ?? '';
            });
            document.getElementById('recipe-id').value = recipe.id;
            document.getElementById('recipe-tags').value = (recipe.tags || []).join(', ');
            recipeImagePreview.src = recipe.imageUrl || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Indsæt+URL';
            ingredientsContainer.innerHTML = '';
            (recipe.ingredients || []).forEach(ing => createIngredientRow(ingredientsContainer, ing));
            recipeEditModal.classList.remove('hidden');
        }
    });

    // Referencer
    referencesContainer.addEventListener('click', async (e) => {
        const deleteBtn = e.target.closest('.delete-reference-item');
        if (deleteBtn) {
            const value = deleteBtn.dataset.value;
            const key = deleteBtn.closest('.reference-card').dataset.key;
            if (await showNotification({title: "Slet Reference", message: `Sikker på du vil slette "${value}"?`, type: 'confirm'})) {
                await updateDoc(doc(db, 'references', state.currentUser.uid), { [key]: arrayRemove(value) });
            }
        }
    });

    referencesContainer.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (e.target.classList.contains('add-reference-form')) {
            const input = e.target.querySelector('input');
            const value = input.value.trim();
            const key = e.target.closest('.reference-card').dataset.key;
            if (value) {
                await setDoc(doc(db, 'references', state.currentUser.uid), { [key]: arrayUnion(value) }, { merge: true });
                input.value = '';
            }
        }
    });

    // =================================================================
    // 6. MADPLAN & PLANLÆGNING
    // =================================================================
    
    function renderMealPlanner() {
        calendarGrid.innerHTML = '';
        const start = getStartOfWeek(state.currentDate);
        calendarTitle.textContent = `Uge ${getWeekNumber(start)}, ${start.getFullYear()}`;
        const days = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
        const todayString = formatDate(new Date());

        for(let i = 0; i < 7; i++) {
            const dayDate = new Date(start);
            dayDate.setDate(start.getDate() + i);
            const dateString = formatDate(dayDate);
            const dayDiv = document.createElement('div');
            dayDiv.className = `calendar-day ${dateString === todayString ? 'is-today' : ''}`;
            dayDiv.innerHTML = `
                <div class="calendar-day-header">${days[i]} <span class="date-number">${dayDate.getDate()}.</span></div>
                <div class="meal-slots">
                    ${['breakfast', 'lunch', 'dinner'].map(meal => `<div class="meal-slot" data-date="${dateString}" data-meal="${meal}"><span class="meal-slot-title">${meal.charAt(0).toUpperCase() + meal.slice(1)}</span></div>`).join('')}
                </div>`;
            calendarGrid.appendChild(dayDiv);
        }
        populateCalendarWithData();
    }

    function populateCalendarWithData() {
        document.querySelectorAll('.meal-slot').forEach(slot => {
            const { date, meal } = slot.dataset;
            const mealData = state.mealPlan[date]?.[meal];
            slot.querySelector('.planned-recipe')?.remove();

            if (mealData) {
                const recipe = state.recipes.find(r => r.id === mealData.recipeId);
                const recipeName = recipe ? recipe.title : "Slettet Opskrift";
                const recipeDiv = document.createElement('div');
                recipeDiv.className = `planned-recipe ${!recipe ? 'deleted' : ''}`;
                recipeDiv.dataset.mealData = JSON.stringify(mealData);
                recipeDiv.innerHTML = `
                    <span>${recipeName}</span>
                    <div class="planned-recipe-actions">
                        ${recipe ? `<button class="btn-icon cook-this-meal-btn" title="Kog denne ret"><i class="fas fa-hat-chef"></i></button>` : ''}
                        <button class="btn-icon remove-meal-btn" title="Fjern fra madplan"><i class="fas fa-trash"></i></button>
                    </div>`;
                slot.appendChild(recipeDiv);
            }
        });
    }

    calendarGrid.addEventListener('click', async (e) => {
        const mealDiv = e.target.closest('.planned-recipe');
        if (!mealDiv) return;
        const mealData = JSON.parse(mealDiv.dataset.mealData);
        
        if (e.target.closest('.cook-this-meal-btn')) {
            openConfirmCookingModal(mealData);
        }
        if (e.target.closest('.remove-meal-btn')) {
            if (await showNotification({title: "Fjern måltid", message: "Er du sikker?", type: 'confirm'})) {
                const date = mealDiv.closest('.meal-slot').dataset.date;
                const mealType = mealDiv.closest('.meal-slot').dataset.meal;
                const fieldPath = `${date}.${mealType}`;
                await updateDoc(doc(db, 'meal_plans', `plan_${new Date(date).getFullYear()}`), { [fieldPath]: deleteField() });
            }
        }
    });

    planMealForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const recipeId = document.getElementById('plan-meal-recipe-id').value;
        const date = document.getElementById('plan-meal-date').value;
        const portions = Number(document.getElementById('plan-meal-portions').value);
        const mealType = mealTypeSelector.querySelector('.btn.active')?.dataset.meal;

        if (!recipeId || !date || !portions || !mealType) return handleError(new Error("Udfyld alle felter."), "Udfyld venligst alle felter.");
        
        const mealPlanRef = doc(db, 'meal_plans', `plan_${new Date(date).getFullYear()}`);
        await setDoc(mealPlanRef, { [date]: { [mealType]: { recipeId, portions, type: 'recipe' } } }, { merge: true });
        planMealModal.classList.add('hidden');
    });

    // =================================================================
    // 7. NY FUNKTIONALITET: BEKRÆFT MADLAVNING
    // =================================================================
    
    function openConfirmCookingModal(mealData) {
        const recipe = state.recipes.find(r => r.id === mealData.recipeId);
        if (!recipe) return handleError(new Error("Opskrift ikke fundet"), "Opskriften kunne ikke findes.");

        confirmCookingTitle.textContent = `Klargør: ${recipe.title}`;
        confirmCookingList.innerHTML = '';
        let canCook = true;

        const scaledIngredients = recipe.ingredients.map(ing => {
            const scaleFactor = (mealData.portions || recipe.portions) / recipe.portions;
            return { ...ing, quantity: ing.quantity * scaleFactor };
        });

        scaledIngredients.forEach(ing => {
            const inventoryItem = state.inventory.find(i => i.name.toLowerCase() === ing.name.toLowerCase());
            let stockStatusHTML = `<span class="stock-error">Mangler på lager</span>`;
            if (inventoryItem) {
                const needed = ing.quantity;
                const inStock = inventoryItem.current_stock || 0;
                if (inStock >= needed) {
                    stockStatusHTML = `<span class="stock-ok">(${inStock} ${inventoryItem.unit} på lager)</span>`;
                } else {
                    canCook = false;
                    stockStatusHTML = `<span class="stock-error">Mangler! (${inStock}/${needed} ${inventoryItem.unit})</span>`;
                }
            } else {
                canCook = false;
            }
            confirmCookingList.innerHTML += `<li><span class="item-name">${ing.name}</span> <span class="item-amount">${ing.quantity} ${ing.unit}</span> ${stockStatusHTML}</li>`;
        });
        
        confirmCookingActionBtn.disabled = !canCook;
        confirmCookingActionBtn.onclick = () => executeCookingTransaction(recipe, mealData.portions);
        confirmCookingModal.classList.remove('hidden');
    }
    
    cancelCookingBtn.addEventListener('click', () => confirmCookingModal.classList.add('hidden'));

    async function executeCookingTransaction(recipe, portions) {
        try {
            await runTransaction(db, async (transaction) => {
                const scaleFactor = (portions || recipe.portions) / recipe.portions;
                for (const ing of recipe.ingredients) {
                    const inventoryItem = state.inventory.find(i => i.name.toLowerCase() === ing.name.toLowerCase());
                    if (!inventoryItem) throw new Error(`Varen '${ing.name}' findes ikke på lager.`);
                    
                    const itemRef = doc(db, "inventory_items", inventoryItem.id);
                    const invDoc = await transaction.get(itemRef);
                    if (!invDoc.exists()) throw new Error(`Varen '${ing.name}' blev ikke fundet.`);
                    
                    const currentData = invDoc.data();
                    const neededQuantity = ing.quantity * scaleFactor;
                    
                    // Simpel nedskrivning baseret på 'current_stock'
                    // Forbedring: Brug 'grams_in_stock' for mere præcis nedskrivning
                    if (currentData.current_stock < neededQuantity) {
                        throw new Error(`Ikke nok '${ing.name}' på lager.`);
                    }
                    const newStock = currentData.current_stock - neededQuantity;
                    transaction.update(itemRef, { current_stock: newStock });
                }
            });
            confirmCookingModal.classList.add('hidden');
            showNotification({title: "Succes!", message: "Dit lager er blevet opdateret."});
        } catch (error) {
            handleError(error, `Madlavning fejlede: <br>${error.message}`);
        }
    }

    // =================================================================
    // 8. MOBIL UI LOGIK
    // =================================================================
    
    function showMobilePanel(panelId) {
        mobilePanelOverlay.classList.remove('hidden');
        if (panelId === 'shopping-list') {
            mobileShoppingListPanel.innerHTML = `
                <div class="mobile-panel-header">
                    <h3>Indkøbsliste</h3>
                    <button class="close-modal-btn">&times;</button>
                </div>
                <div class="sidebar-content"></div>`;
            renderShoppingList(mobileShoppingListPanel.querySelector('.sidebar-content'));
            mobileShoppingListPanel.querySelector('.close-modal-btn').onclick = hideMobilePanel;
            setTimeout(() => mobileShoppingListPanel.classList.add('active'), 10);
        }
    }

    function hideMobilePanel() {
        mobilePanelOverlay.classList.add('hidden');
        mobileShoppingListPanel.classList.remove('active');
    }

    mobileTabBar.addEventListener('click', (e) => {
        const link = e.target.closest('.mobile-tab-link');
        if (!link) return;
        e.preventDefault();
        const page = link.dataset.page;
        const panel = link.dataset.panel;
        if (page) window.location.hash = `#${page}`;
        else if (panel) showMobilePanel(panel);
    });

    mobilePanelOverlay.addEventListener('click', (e) => {
        if (e.target === mobilePanelOverlay) hideMobilePanel();
    });

});
