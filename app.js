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
    deleteField
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('#app-main-content .page');
    const headerTitleLink = document.querySelector('.header-title-link');

    // --- Vare Modal Elementer ---
    const inventoryItemModal = document.getElementById('inventory-item-modal');
    const inventoryItemForm = document.getElementById('inventory-item-form');
    const addInventoryItemBtn = document.getElementById('add-inventory-item-btn');
    const inventoryModalTitle = document.getElementById('inventory-modal-title');
    const inventoryTableBody = document.querySelector('.inventory-table tbody');
    
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
    
    // --- Opskrift Læsevisning Modal Elementer ---
    const recipeReadModal = document.getElementById('recipe-read-modal');
    const readViewAddToMealPlanBtn = document.getElementById('read-view-add-to-meal-plan-btn');
    const readViewEditBtn = document.getElementById('read-view-edit-btn');
    const readViewDeleteBtn = document.getElementById('read-view-delete-btn');
    const readViewPrice = document.getElementById('read-view-price');

    // --- Madplan Side Elementer ---
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarTitle = document.getElementById('calendar-title');
    const prevWeekBtn = document.getElementById('prev-week-btn');
    const nextWeekBtn = document.getElementById('next-week-btn');
    const sidebarRecipeList = document.getElementById('sidebar-recipe-list');
    const sidebarTabs = document.querySelectorAll('.sidebar-tab');
    const sidebarSearchInput = document.getElementById('sidebar-recipe-search');
    const sidebarTagFilters = document.getElementById('sidebar-tag-filters');
    const autogenPlanBtn = document.getElementById('autogen-plan-btn');

    // --- Indkøbsliste (nu i sidebar) ---
    const shoppingListContainer = document.getElementById('shopping-list-container');
    const shoppingListTotalContainer = document.getElementById('shopping-list-total-container');
    const confirmPurchaseBtn = document.getElementById('confirm-purchase-btn');
    const generateWeeklyShoppingListBtn = document.getElementById('generate-weekly-shopping-list-btn');
    const addShoppingItemForm = document.getElementById('add-shopping-item-form');

    // --- Inspiration Side ---
    const inspirationGrid = document.getElementById('inspiration-grid');

    // --- Autogen Modal ---
    const autogenModal = document.getElementById('autogen-modal');
    const autogenForm = document.getElementById('autogen-form');
    const autogenDietTagsContainer = document.getElementById('autogen-diet-tags');

    // --- Notifikations Modal Elementer ---
    const notificationModal = document.getElementById('notification-modal');
    const notificationTitle = document.getElementById('notification-title');
    const notificationMessage = document.getElementById('notification-message');
    const notificationActions = document.getElementById('notification-actions');

    // --- State Management ---
    const state = {
        currentUser: null,
        inventory: [],
        recipes: [],
        mealPlan: {},
        shoppingList: {},
        activeRecipeFilterTags: new Set(),
        activeSidebarTags: new Set(),
        currentDate: new Date(),
        currentlyViewedRecipeId: null,
        listeners: {
            inventory: null,
            recipes: null,
            mealPlan: null,
            shoppingList: null,
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

    function convertToPrimaryUnit(quantity, fromUnit, inventoryItem) {
        const primaryUnit = 'g';
        fromUnit = (fromUnit || '').toLowerCase();

        if (fromUnit === primaryUnit) {
            return { convertedQuantity: quantity, finalUnit: primaryUnit, error: null };
        }
        
        if (fromUnit === 'kg') {
            return { convertedQuantity: quantity * 1000, finalUnit: primaryUnit, error: null };
        }

        if ((inventoryItem.unit || '').toLowerCase() === 'g') {
             return { convertedQuantity: quantity, finalUnit: primaryUnit, error: null };
        }
        
        if (inventoryItem.grams_per_unit) {
            return { convertedQuantity: quantity * inventoryItem.grams_per_unit, finalUnit: primaryUnit, error: null };
        }

        return { convertedQuantity: null, finalUnit: primaryUnit, error: `Kan ikke omregne fra '${fromUnit}' til '${primaryUnit}'.` };
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
        pages.forEach(page => page.classList.add('hidden'));
        const targetPage = document.querySelector(hash);
        if (targetPage) {
            targetPage.classList.remove('hidden');
        } else {
            document.getElementById('meal-planner').classList.remove('hidden');
        }
        navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === hash);
        });
        switch(hash) {
            case '#meal-planner':
            case '':
                renderMealPlanner();
                renderSidebarRecipeList();
                renderSidebarTagFilters();
                renderShoppingList();
                break;
            case '#recipes':
                renderRecipes();
                renderTagFilters();
                break;
            case '#inspiration':
                renderInspirationPage();
                break;
            case '#inventory':
                renderInventory();
                break;
        }
    };
    
    headerTitleLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('#meal-planner');
    });

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const hash = e.currentTarget.getAttribute('href');
            history.pushState(null, null, hash);
            navigateTo(hash);
        });
    });
    
    window.addEventListener('popstate', () => {
        navigateTo(window.location.hash || '#meal-planner');
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
            if (document.querySelector('#inspiration:not(.hidden)')) renderInspirationPage();
        }, error => handleError(error, "Kunne ikke hente varelager."));

        const recipesRef = collection(db, 'recipes');
        state.listeners.recipes = onSnapshot(recipesRef, (snapshot) => {
            state.recipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (document.querySelector('#recipes:not(.hidden)')) {
                renderTagFilters(); 
                renderRecipes();
            }
            if (document.querySelector('#meal-planner:not(.hidden)')) {
                renderSidebarRecipeList();
                renderSidebarTagFilters();
            }
            if (document.querySelector('#inspiration:not(.hidden)')) {
                renderInspirationPage();
            }
            document.getElementById('profile-recipe-count').textContent = state.recipes.length;
            const favoriteCount = state.recipes.filter(r => r.is_favorite).length;
            document.getElementById('profile-favorite-count').textContent = favoriteCount;
        }, error => handleError(error, "Kunne ikke hente opskrifter."));

        const year = state.currentDate.getFullYear();
        const mealPlanDocId = `plan_${year}`; 
        const mealPlanRef = doc(db, 'meal_plans', mealPlanDocId);
        state.listeners.mealPlan = onSnapshot(mealPlanRef, (doc) => {
            state.mealPlan = doc.exists() ? doc.data() : {};
            if (document.querySelector('#meal-planner:not(.hidden)')) {
                renderMealPlanner(); 
            }
        }, error => handleError(error, "Kunne ikke hente madplan."));

        const shoppingListRef = doc(db, 'shopping_lists', userId);
        state.listeners.shoppingList = onSnapshot(shoppingListRef, (doc) => {
            state.shoppingList = doc.exists() ? doc.data().items || {} : {};
            if (document.querySelector('#meal-planner:not(.hidden)')) {
                renderShoppingList();
            }
        }, error => handleError(error, "Kunne ikke hente indkøbsliste."));
    }

    // =================================================================
    // 4. RENDER FUNKTIONER
    // =================================================================
    
    function renderInventory() {
        const items = state.inventory;
        const fragment = document.createDocumentFragment();
        inventoryTableBody.innerHTML = ''; 

        if (items.length === 0) {
             inventoryTableBody.innerHTML = `<tr><td colspan="8">Dit varelager er tomt. Tilføj en vare for at starte.</td></tr>`;
             return;
        }
        
        items.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
            const tr = document.createElement('tr');
            tr.dataset.id = item.id;
            
            // RETTET: Status baseres nu på current_stock (antal) vs max_stock (antal)
            const stockPercentage = (item.current_stock && item.max_stock) ? (item.current_stock / item.max_stock) * 100 : 100;
            let stockColor = '#4CAF50';
            if (stockPercentage < 50) stockColor = '#FFC107';
            if (stockPercentage < 20) stockColor = '#F44336';

            let stockStatus = { text: 'På lager', className: 'status-ok' };
            if (item.max_stock && item.max_stock > 0) {
                const stockLevel = item.current_stock || 0;
                if (stockLevel === 0) {
                    stockStatus = { text: 'Tom', className: 'status-critical' };
                } else if (stockLevel < item.max_stock / 2) {
                    stockStatus = { text: 'Lav', className: 'status-low' };
                }
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
    
    const lazyImageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove("lazy-load");
                observer.unobserve(img);
            }
        });
    });

    function renderRecipes() {
        const fragment = document.createDocumentFragment();
        recipeGrid.innerHTML = '';
        let recipesToRender = state.recipes;

        if (state.activeRecipeFilterTags.size > 0) {
            recipesToRender = recipesToRender.filter(r => {
                if (!r.tags) return false;
                return [...state.activeRecipeFilterTags].every(tag => r.tags.includes(tag));
            });
        }

        if (recipesToRender.length === 0) {
            recipeGrid.innerHTML = `<p>Ingen opskrifter matcher dit filter.</p>`;
            return;
        }

        recipesToRender.sort((a,b) => a.title.localeCompare(b.title)).forEach(recipe => {
            const card = document.createElement('div');
            card.className = 'recipe-card';
            card.dataset.id = recipe.id;
            const isFavoriteClass = recipe.is_favorite ? 'fas is-favorite' : 'far';
            const imageUrl = recipe.imageUrl || `https://placehold.co/400x300/f3f0e9/d1603d?text=${encodeURIComponent(recipe.title)}`;
            
            const tagsHTML = (recipe.tags && recipe.tags.length > 0) 
                ? recipe.tags.map(tag => `<span class="recipe-card-tag">${tag}</span>`).join('')
                : '';

            card.innerHTML = `
                <img data-src="${imageUrl}" alt="Billede af ${recipe.title}" class="recipe-card-image lazy-load" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/400x300/f3f0e9/d1603d?text=Billede+mangler';">
                <div class="recipe-card-content">
                    <span class="recipe-card-category">${recipe.category || 'Ukategoriseret'}</span>
                    <h4>${recipe.title}</h4>
                    <div class="recipe-card-tags">${tagsHTML}</div>
                </div>
                <div class="recipe-card-actions">
                    <i class="${isFavoriteClass} fa-heart favorite-icon" title="Marker som favorit"></i>
                    <button class="btn-icon delete-recipe-btn" title="Slet opskrift"><i class="fas fa-trash"></i></button>
                </div>`;
            fragment.appendChild(card);
        });
        recipeGrid.appendChild(fragment);
        document.querySelectorAll('.lazy-load').forEach(img => lazyImageObserver.observe(img));
    }

    function renderTagFilters() {
        const allTags = new Set();
        state.recipes.forEach(r => {
            if (r.tags) r.tags.forEach(tag => allTags.add(tag));
        });

        recipeFilterContainer.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        [...allTags].sort().forEach(tag => {
            const tagButton = document.createElement('button');
            tagButton.className = 'filter-tag';
            tagButton.textContent = tag;
            if (state.activeRecipeFilterTags.has(tag)) tagButton.classList.add('active');
            
            tagButton.addEventListener('click', () => {
                if (state.activeRecipeFilterTags.has(tag)) {
                    state.activeRecipeFilterTags.delete(tag);
                } else {
                    state.activeRecipeFilterTags.add(tag);
                }
                renderTagFilters();
                renderRecipes();
            });
            fragment.appendChild(tagButton);
        });
        recipeFilterContainer.appendChild(fragment);
    }
    
    function renderShoppingList() {
        shoppingListContainer.innerHTML = '';
        const groupedList = {};

        Object.values(state.shoppingList).sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
            const section = item.store_section || 'Andet';
            if (!groupedList[section]) groupedList[section] = [];
            groupedList[section].push(item);
        });

        if (Object.keys(groupedList).length === 0) {
            shoppingListContainer.innerHTML = `<p>Din indkøbsliste er tom.</p>`;
            shoppingListTotalContainer.classList.add('hidden');
            confirmPurchaseBtn.style.display = 'none';
            return;
        }

        shoppingListTotalContainer.classList.remove('hidden');
        confirmPurchaseBtn.style.display = 'inline-flex';
        
        const fragment = document.createDocumentFragment();
        for (const section in groupedList) {
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'store-section';
            
            let listItemsHTML = '';
            groupedList[section].forEach(item => {
                const safeItemName = item.name.replace(/[^a-zA-Z0-9]/g, '-');
                const itemInInventory = state.inventory.find(invItem => invItem.name.toLowerCase() === item.name.toLowerCase());
                const newItemIndicator = !itemInInventory 
                    ? `<button class="btn-icon new-item-indicator" data-item-name="${item.name}" title="Tilføj '${item.name}' til varelageret"><i class="fas fa-plus-circle"></i></button>`
                    : '';

                listItemsHTML += `
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
                        <div class="item-actions">
                            ${newItemIndicator}
                            <button class="btn-icon remove-from-list-btn" title="Fjern fra liste"><i class="fas fa-times-circle"></i></button>
                        </div>
                    </li>`;
            });

            sectionDiv.innerHTML = `<h4>${section}</h4><ul>${listItemsHTML}</ul>`;
            fragment.appendChild(sectionDiv);
        }
        shoppingListContainer.appendChild(fragment);
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

        const tagsContainer = document.getElementById('read-view-tags');
        tagsContainer.innerHTML = '';
        if (recipe.tags && recipe.tags.length > 0) {
            recipe.tags.forEach(tag => {
                const tagEl = document.createElement('span');
                tagEl.className = 'recipe-card-tag';
                tagEl.textContent = tag;
                tagsContainer.appendChild(tagEl);
            });
        }
        
        document.getElementById('read-view-notes').textContent = recipe.notes || '';
        
        const ingredientsList = document.getElementById('read-view-ingredients-list');
        ingredientsList.innerHTML = '';
        if (recipe.ingredients && recipe.ingredients.length > 0) {
            recipe.ingredients.forEach(ing => {
                const li = document.createElement('li');
                li.textContent = `${ing.quantity || ''} ${ing.unit || ''} ${ing.name}`;
                ingredientsList.appendChild(li);
            });
        }
        
        document.getElementById('read-view-instructions-text').textContent = recipe.instructions || '';
        
        state.currentlyViewedRecipeId = recipe.id;
        recipeReadModal.classList.remove('hidden');
    }

    // =================================================================
    // 5. CRUD & INTELLIGENS FOR VARELAGER (OPDATERET)
    // =================================================================
    
    function updateCalculatedFields() {
        const quantity = parseFloat(document.getElementById('item-current-stock').value) || 0;
        const unit = document.getElementById('item-unit').value.toLowerCase();
        const gramsPerUnit = parseFloat(document.getElementById('item-grams-per-unit').value) || 0;
        const kgPrice = parseFloat(document.getElementById('item-kg-price').value) || 0;

        let totalGrams = 0;
        if (unit === 'g' || unit === 'gram') {
            totalGrams = quantity;
        } else if (gramsPerUnit > 0) {
            totalGrams = quantity * gramsPerUnit;
        }
        document.getElementById('item-grams-in-stock').textContent = `${totalGrams.toFixed(0)} g`;

        let pricePerUnit = 0;
        if (kgPrice > 0 && gramsPerUnit > 0) {
            pricePerUnit = (kgPrice / 1000) * gramsPerUnit;
        }
        document.getElementById('item-price-per-unit').textContent = `${pricePerUnit.toFixed(2)} kr`;
    }

    addInventoryItemBtn.addEventListener('click', () => {
        inventoryModalTitle.textContent = 'Tilføj ny vare';
        inventoryItemForm.reset();
        document.getElementById('inventory-item-id').value = '';
        updateCalculatedFields();
        inventoryItemModal.classList.remove('hidden');
    });

    ['item-current-stock', 'item-unit', 'item-grams-per-unit', 'item-kg-price', 'item-buy-whole'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateCalculatedFields);
    });

    inventoryItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const itemId = document.getElementById('inventory-item-id').value;
        
        const quantity = parseFloat(document.getElementById('item-current-stock').value) || 0;
        const unit = document.getElementById('item-unit').value;
        const gramsPerUnit = parseFloat(document.getElementById('item-grams-per-unit').value) || null;

        let gramsInStock = 0;
        if (unit.toLowerCase() === 'g' || unit.toLowerCase() === 'gram') {
            gramsInStock = quantity;
        } else if (gramsPerUnit) {
            gramsInStock = quantity * gramsPerUnit;
        }

        const itemData = {
            name: document.getElementById('item-name').value,
            category: document.getElementById('item-category').value,
            current_stock: quantity,
            max_stock: Number(document.getElementById('item-max-stock').value) || null,
            unit: unit,
            kg_price: Number(document.getElementById('item-kg-price').value) || null,
            grams_per_unit: gramsPerUnit,
            grams_in_stock: gramsInStock,
            buy_as_whole_unit: document.getElementById('item-buy-whole').checked,
            home_location: document.getElementById('item-home-location').value,
        };
        try {
            if (itemId) {
                await updateDoc(doc(db, 'inventory_items', itemId), itemData);
            } else {
                await addDoc(collection(db, 'inventory_items'), itemData);
            }
            inventoryItemModal.classList.add('hidden');
        } catch (error) {
            handleError(error, "Varen kunne ikke gemmes.");
        }
    });

    inventoryTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const docId = target.closest('tr').dataset.id;
        
        if (target.classList.contains('delete-item')) {
            const confirmed = await showNotification({ title: "Slet Vare", message: `Er du sikker på, at du vil slette denne vare? Handlingen kan ikke fortrydes.`, type: 'confirm' });
            if (confirmed) {
                try {
                    await deleteDoc(doc(db, 'inventory_items', docId));
                } catch (error) { handleError(error, "Varen kunne ikke slettes."); }
            }
        }

        if (target.classList.contains('edit-item')) {
            const item = state.inventory.find(i => i.id === docId);
            if (item) {
                inventoryModalTitle.textContent = 'Rediger vare';
                document.getElementById('inventory-item-id').value = item.id;
                document.getElementById('item-name').value = item.name || '';
                document.getElementById('item-category').value = item.category || '';
                document.getElementById('item-current-stock').value = item.current_stock || 0;
                document.getElementById('item-max-stock').value = item.max_stock || '';
                document.getElementById('item-unit').value = item.unit || '';
                document.getElementById('item-kg-price').value = item.kg_price || '';
                document.getElementById('item-grams-per-unit').value = item.grams_per_unit || '';
                document.getElementById('item-buy-whole').checked = item.buy_as_whole_unit || false;
                document.getElementById('item-home-location').value = item.home_location || '';
                
                updateCalculatedFields();
                inventoryItemModal.classList.remove('hidden');
            }
        }
    });


    // =================================================================
    // 6. OPSKRIFTER & IMPORT
    // =================================================================
    const addIngredientRow = (ingredient = { name: '', quantity: '', unit: '' }) => {
        const row = document.createElement('div');
        row.className = 'ingredient-row';
        row.innerHTML = `
            <input type="text" class="ingredient-name" placeholder="Ingrediensnavn" value="${ingredient.name}" required>
            <input type="number" step="any" class="ingredient-quantity" placeholder="Antal" value="${ingredient.quantity}">
            <input type="text" class="ingredient-unit" placeholder="Enhed" value="${ingredient.unit}">
            <button type="button" class="btn-icon remove-ingredient-btn"><i class="fas fa-trash"></i></button>
        `;
        ingredientsContainer.appendChild(row);
    };

    importIngredientsBtn.addEventListener('click', () => {
        const text = recipeImportTextarea.value;
        if (!text) return;
        
        const ingredientRegex = /^\s*([\d.,]+)?\s*([a-zA-ZæøåÆØÅ]+)?\s*(.+)\s*$/;
        
        const lines = text.split('\n');
        ingredientsContainer.innerHTML = ''; 
        
        lines.forEach(line => {
            if (line.trim() === '') return;
            
            const match = line.match(ingredientRegex);
            if (match) {
                const quantity = (match[1] || '').replace(',', '.').trim();
                const unit = (match[2] || '').trim();
                const name = (match[3] || '').trim();
                
                addIngredientRow({
                    name: name,
                    quantity: quantity ? parseFloat(quantity) : '',
                    unit: unit
                });
            } else {
                addIngredientRow({ name: line.trim(), quantity: '', unit: '' });
            }
        });
        recipeImportTextarea.value = '';
    });

    addRecipeBtn.addEventListener('click', () => {
        recipeEditModalTitle.textContent = 'Tilføj ny opskrift';
        recipeForm.reset();
        document.getElementById('recipe-id').value = '';
        ingredientsContainer.innerHTML = '';
        recipeImagePreview.src = 'https://placehold.co/600x400/f3f0e9/d1603d?text=Indsæt+URL';
        addIngredientRow();
        recipeEditModal.classList.remove('hidden');
    });

    addIngredientBtn.addEventListener('click', () => addIngredientRow());

    ingredientsContainer.addEventListener('click', (e) => {
        if (e.target.closest('.remove-ingredient-btn')) {
            e.target.closest('.ingredient-row').remove();
        }
    });
    
    recipeImageUrlInput.addEventListener('input', (e) => {
        recipeImagePreview.src = e.target.value || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Indsæt+URL';
    });

    recipeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const recipeId = document.getElementById('recipe-id').value;
        const ingredients = [];
        document.querySelectorAll('.ingredient-row').forEach(row => {
            const name = row.querySelector('.ingredient-name').value.trim();
            const quantity = row.querySelector('.ingredient-quantity').value;
            const unit = row.querySelector('.ingredient-unit').value.trim();
            if (name) {
                ingredients.push({ name, quantity: Number(quantity) || null, unit });
            }
        });

        const tags = document.getElementById('recipe-tags').value.split(',').map(tag => tag.trim()).filter(tag => tag);

        const recipeData = {
            title: document.getElementById('recipe-title').value,
            category: document.getElementById('recipe-category').value,
            tags: tags,
            portions: Number(document.getElementById('recipe-portions').value) || null,
            time: Number(document.getElementById('recipe-time').value) || null,
            notes: document.getElementById('recipe-notes').value,
            instructions: document.getElementById('recipe-instructions').value,
            source_url: document.getElementById('recipe-source-url').value,
            ingredients: ingredients,
            imageUrl: document.getElementById('recipe-imageUrl').value || null,
            is_favorite: state.recipes.find(r => r.id === recipeId)?.is_favorite || false
        };

        try {
            if (recipeId) {
                await updateDoc(doc(db, 'recipes', recipeId), recipeData);
            } else {
                await addDoc(collection(db, 'recipes'), recipeData);
            }
            recipeEditModal.classList.add('hidden');
        } catch (error) {
            handleError(error, "Opskriften kunne ikke gemmes.");
        }
    });

    recipeGrid.addEventListener('click', async (e) => {
        const card = e.target.closest('.recipe-card');
        if (!card) return;
        const docId = card.dataset.id;
        
        if (e.target.closest('.favorite-icon')) {
            const isCurrentlyFavorite = e.target.closest('.favorite-icon').classList.contains('is-favorite');
            try {
                await updateDoc(doc(db, 'recipes', docId), { is_favorite: !isCurrentlyFavorite });
            } catch (error) { handleError(error, "Kunne ikke opdatere favoritstatus."); }
            return;
        }

        if (e.target.closest('.delete-recipe-btn')) {
            e.stopPropagation(); 
            const confirmed = await showNotification({title: "Slet Opskrift", message: "Er du sikker på, du vil slette denne opskrift?", type: 'confirm'});
            if(confirmed) {
                try {
                    await deleteDoc(doc(db, 'recipes', docId));
                    showNotification({title: "Slettet", message: "Opskriften er blevet slettet."});
                } catch (error) {
                    handleError(error, "Opskriften kunne ikke slettes.");
                }
            }
            return;
        }

        const recipe = state.recipes.find(r => r.id === docId);
        if (recipe) {
            renderReadView(recipe);
        }
    });
    
    readViewEditBtn.addEventListener('click', () => {
        const recipe = state.recipes.find(r => r.id === state.currentlyViewedRecipeId);
        if (recipe) {
            recipeReadModal.classList.add('hidden');
            
            recipeEditModalTitle.textContent = 'Rediger opskrift';
            document.getElementById('recipe-id').value = recipe.id;
            document.getElementById('recipe-title').value = recipe.title || '';
            document.getElementById('recipe-category').value = recipe.category || '';
            document.getElementById('recipe-tags').value = (recipe.tags && recipe.tags.join(', ')) || '';
            document.getElementById('recipe-portions').value = recipe.portions || '';
            document.getElementById('recipe-time').value = recipe.time || '';
            document.getElementById('recipe-notes').value = recipe.notes || '';
            document.getElementById('recipe-instructions').value = recipe.instructions || '';
            document.getElementById('recipe-source-url').value = recipe.source_url || '';
            document.getElementById('recipe-imageUrl').value = recipe.imageUrl || '';
            
            recipeImagePreview.src = recipe.imageUrl || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Indsæt+URL';

            ingredientsContainer.innerHTML = '';
            if (recipe.ingredients && recipe.ingredients.length > 0) {
                recipe.ingredients.forEach(ing => addIngredientRow(ing));
            } else {
                addIngredientRow();
            }
            recipeEditModal.classList.remove('hidden');
        }
    });
    
    readViewDeleteBtn.addEventListener('click', async () => {
        const recipeId = state.currentlyViewedRecipeId;
        if (!recipeId) return;

        const confirmed = await showNotification({title: "Slet Opskrift", message: "Er du sikker på, du vil slette denne opskrift?", type: 'confirm'});
        if(confirmed) {
            try {
                await deleteDoc(doc(db, 'recipes', recipeId));
                recipeReadModal.classList.add('hidden');
                showNotification({title: "Slettet", message: "Opskriften er blevet slettet."});
            } catch (error) {
                handleError(error, "Opskriften kunne ikke slettes.");
            }
        }
    });
    
    readViewAddToMealPlanBtn.addEventListener('click', () => {
        navigateTo('#meal-planner');
        recipeReadModal.classList.add('hidden');
        showNotification({title: "Klar til planlægning", message: "Træk opskriften fra sidebaren over på den ønskede dag."})
    });

    // =================================================================
    // 7. INDKØBSLISTE LOGIK (FINALISERET)
    // =================================================================
    
    async function updateShoppingListInFirestore(newList) {
        if (!state.currentUser) return;
        try {
            const shoppingListRef = doc(db, 'shopping_lists', state.currentUser.uid);
            await setDoc(shoppingListRef, { items: newList });
        } catch (error) {
            handleError(error, "Indkøbslisten kunne ikke gemmes.");
        }
    }
    
    generateWeeklyShoppingListBtn.addEventListener('click', () => {
        const allIngredientsNeeded = [];
        const start = getStartOfWeek(state.currentDate); 

        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(start);
            dayDate.setDate(start.getDate() + i);
            const dateString = formatDate(dayDate);
            const dayPlan = state.mealPlan[dateString];

            if (dayPlan) {
                Object.values(dayPlan).forEach(meal => {
                    if (meal && meal.recipeId && meal.type === 'recipe') {
                        const recipe = state.recipes.find(r => r.id === meal.recipeId);
                        if (recipe && recipe.ingredients) {
                            recipe.ingredients.forEach(ing => allIngredientsNeeded.push({ ...ing }));
                        }
                    }
                });
            }
        }

        if (allIngredientsNeeded.length === 0) {
            showNotification({title: "Tom Madplan", message: "Der er ingen opskrifter på madplanen for denne uge."});
            return;
        }
        
        addToShoppingList(allIngredientsNeeded, `madplanen for uge ${getWeekNumber(start)}`);
    });
    
    // FINALISERET: Denne funktion håndterer nu alle scenarier korrekt.
    async function addToShoppingList(ingredients, sourceText) {
        const updatedList = { ...state.shoppingList };
        let conversionErrors = [];
        const itemsToBuy = {};
        const wholeUnitItemsNeeded = new Set();

        // Første loop: Beregn hvad der skal købes
        for (const ing of ingredients) {
            const inventoryItem = state.inventory.find(item => item.name.toLowerCase() === ing.name.toLowerCase());
            
            let quantityToBuy = ing.quantity || 1;
            let unitToBuy = ing.unit || 'stk';
            let storeSection = inventoryItem ? inventoryItem.category : 'Andet';

            if (inventoryItem) {
                if (inventoryItem.buy_as_whole_unit) {
                    if ((inventoryItem.current_stock || 0) === 0) {
                        wholeUnitItemsNeeded.add(inventoryItem.name);
                    }
                    continue; // Gå videre til næste ingrediens
                }

                const conversionResult = convertToPrimaryUnit(ing.quantity, ing.unit, inventoryItem);
                if (conversionResult.convertedQuantity !== null) {
                    const neededInGrams = conversionResult.convertedQuantity;
                    const inStockInGrams = inventoryItem.grams_in_stock || 0;
                    const neededFromStoreInGrams = Math.max(0, neededInGrams - inStockInGrams);
                    
                    if (neededFromStoreInGrams > 0) {
                        // RETTET: Tilføj den originale mængde og enhed, ikke gram.
                        quantityToBuy = ing.quantity;
                        unitToBuy = ing.unit;
                    } else {
                        quantityToBuy = 0;
                    }
                } else {
                    if(ing.unit) conversionErrors.push(ing.name);
                }
            }
            
            if (quantityToBuy > 0) {
                const key = `${ing.name.toLowerCase()}_${unitToBuy}`;
                if (itemsToBuy[key]) {
                    itemsToBuy[key].quantity_to_buy += quantityToBuy;
                } else {
                    itemsToBuy[key] = {
                        name: ing.name,
                        quantity_to_buy: quantityToBuy,
                        unit: unitToBuy,
                        store_section: storeSection,
                    };
                }
            }
        }

        // Andet loop: Håndter "køb hel enhed"-varer
        wholeUnitItemsNeeded.forEach(itemName => {
            const inventoryItem = state.inventory.find(item => item.name === itemName);
            const unit = inventoryItem.unit || 'stk';
            const key = `${itemName.toLowerCase()}_${unit}`;
            if (!itemsToBuy[key]) { // Tilføj kun hvis den ikke allerede er på listen
                 itemsToBuy[key] = {
                    name: itemName,
                    quantity_to_buy: 1,
                    unit: unit,
                    store_section: inventoryItem.category || 'Andet',
                };
            }
        });

        // Flet den beregnede liste med den eksisterende indkøbsliste
        for(const key in itemsToBuy) {
            const item = itemsToBuy[key];
            const existingKey = item.name.toLowerCase();
            if(updatedList[existingKey] && updatedList[existingKey].unit === item.unit) {
                updatedList[existingKey].quantity_to_buy += item.quantity_to_buy;
            } else {
                updatedList[existingKey] = item;
            }
        }
        
        await updateShoppingListInFirestore(updatedList);
        if (sourceText) {
            let message = `Varer fra ${sourceText} er tilføjet til indkøbslisten.`;
            if (conversionErrors.length > 0) {
                message += `<br><br>Bemærk: Kunne ikke omregne enheder for: ${[...new Set(conversionErrors)].join(', ')}.`;
            }
            showNotification({ title: "Opdateret", message: message });
        }
    }

    addShoppingItemForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('add-shopping-item-name');
        const itemName = input.value.trim();
        if (itemName) {
            const updatedList = { ...state.shoppingList };
            const key = itemName.toLowerCase();
            const inventoryItem = state.inventory.find(inv => inv.name.toLowerCase() === key);
            
            if (updatedList[key]) {
                updatedList[key].quantity_to_buy += 1;
            } else {
                updatedList[key] = {
                    name: itemName,
                    quantity_to_buy: 1,
                    unit: 'stk',
                    store_section: inventoryItem ? inventoryItem.category : 'Andet'
                };
            }
            updateShoppingListInFirestore(updatedList);
            input.value = '';
        }
    });

    confirmPurchaseBtn.addEventListener('click', async () => {
        const checkedItemsNames = [];
        document.querySelectorAll('.shopping-list-checkbox:checked').forEach(checkbox => {
            const itemName = checkbox.closest('.shopping-list-item').dataset.itemName;
            checkedItemsNames.push(itemName);
        });

        if (checkedItemsNames.length === 0) {
            await showNotification({ title: "Intet valgt", message: "Vælg venligst de varer, du har købt." });
            return;
        }

        const checkedItems = checkedItemsNames.map(name => state.shoppingList[name.toLowerCase()]);
        const itemsWithoutInventory = checkedItems.filter(item => !state.inventory.some(inv => inv.name.toLowerCase() === item.name.toLowerCase()));

        if (itemsWithoutInventory.length > 0) {
            const confirmed = await showNotification({ 
                title: "Varer mangler i lager", 
                message: `Følgende varer findes ikke i dit varelager: ${itemsWithoutInventory.map(i => i.name).join(', ')}. Vil du fortsætte og kun opdatere de kendte varer?`,
                type: 'confirm'
            });
            if (!confirmed) return;
        }

        const confirmedPurchase = await showNotification({ title: "Bekræft Indkøb", message: "Vil du tilføje de valgte varer til dit varelager?", type: 'confirm' });
        if (!confirmedPurchase) return;

        const batch = writeBatch(db);
        const updatedList = { ...state.shoppingList };
        
        checkedItems.forEach(item => {
            const inventoryItem = state.inventory.find(inv => inv.name.toLowerCase() === item.name.toLowerCase());
            if (inventoryItem) {
                const itemRef = doc(db, "inventory_items", inventoryItem.id);
                
                const newStock = (inventoryItem.current_stock || 0) + item.quantity_to_buy;
                let newGramsInStock = inventoryItem.grams_in_stock || 0;
                const conversionResult = convertToPrimaryUnit(item.quantity_to_buy, item.unit, inventoryItem);
                if (conversionResult.convertedQuantity !== null) {
                    newGramsInStock += conversionResult.convertedQuantity;
                }

                batch.update(itemRef, { 
                    current_stock: newStock,
                    grams_in_stock: newGramsInStock
                });
            }
            delete updatedList[item.name.toLowerCase()];
        });

        try {
            await batch.commit();
            await updateShoppingListInFirestore(updatedList); 
            await showNotification({ title: "Succes", message: "Dit varelager er blevet opdateret!" });
        } catch (error) {
            handleError(error, "Lageret kunne ikke opdateres.");
        }
    });

    shoppingListContainer.addEventListener('input', (e) => {
        const target = e.target;
        if (target.classList.contains('item-quantity-input') || target.classList.contains('item-unit-input')) {
            const listItem = target.closest('.shopping-list-item');
            const itemName = listItem.dataset.itemName.toLowerCase();
            const updatedList = { ...state.shoppingList };
            const item = updatedList[itemName];

            if(item) {
                if (target.classList.contains('item-quantity-input')) {
                    item.quantity_to_buy = parseFloat(target.value) || 0;
                }
                if (target.classList.contains('item-unit-input')) {
                    item.unit = target.value;
                }
                updateShoppingListInFirestore(updatedList);
            }
        }
    });

    shoppingListContainer.addEventListener('click', (e) => {
        const newItemBtn = e.target.closest('.new-item-indicator');
        if (newItemBtn) {
            const itemName = newItemBtn.dataset.itemName;
            navigateTo('#inventory');
            addInventoryItemBtn.click();
            document.getElementById('item-name').value = itemName;
            return;
        }

        const removeItemBtn = e.target.closest('.remove-from-list-btn');
        if(removeItemBtn) {
            const itemName = removeItemBtn.closest('.shopping-list-item').dataset.itemName;
            const updatedList = { ...state.shoppingList };
            delete updatedList[itemName.toLowerCase()];
            updateShoppingListInFirestore(updatedList);
        }
    });

    function getQuantityInKg(quantity, unit, inventoryItem) {
        const conversion = convertToPrimaryUnit(quantity, unit, inventoryItem);
        if(conversion.convertedQuantity !== null) {
            return conversion.convertedQuantity / 1000;
        }
        return null; 
    }

    function calculateAndRenderShoppingListTotal() {
        let totalPrice = 0;
        Object.values(state.shoppingList).forEach(item => {
            const inventoryItem = state.inventory.find(inv => inv.name.toLowerCase() === item.name.toLowerCase());
            if (inventoryItem && inventoryItem.kg_price) {
                const quantityInKg = getQuantityInKg(item.quantity_to_buy, item.unit, inventoryItem);
                if (quantityInKg !== null) {
                    totalPrice += quantityInKg * inventoryItem.kg_price;
                }
            }
        });
        shoppingListTotalContainer.innerHTML = `<span>Estimeret Pris: <strong>${totalPrice.toFixed(2)} kr.</strong></span>`;
    }

    function calculateRecipePrice(recipe) {
        let totalPrice = 0;
        if (!recipe.ingredients) return 0;

        recipe.ingredients.forEach(ing => {
            const inventoryItem = state.inventory.find(inv => inv.name.toLowerCase() === ing.name.toLowerCase());
            if(inventoryItem && inventoryItem.kg_price) {
                const quantityInKg = getQuantityInKg(ing.quantity, ing.unit, inventoryItem);
                if (quantityInKg !== null) {
                    totalPrice += quantityInKg * inventoryItem.kg_price;
                }
            }
        });
        return totalPrice;
    }

    // =================================================================
    // 8. MADPLAN SIDE LOGIK
    // =================================================================
    
    function renderMealPlanner() {
        calendarGrid.innerHTML = '';
        const start = getStartOfWeek(state.currentDate);
        calendarTitle.textContent = `Uge ${getWeekNumber(start)}, ${start.getFullYear()}`;
        const days = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];

        const fragment = document.createDocumentFragment();
        for(let i = 0; i < 7; i++) {
            const dayDate = new Date(start);
            dayDate.setDate(start.getDate() + i);
            const dateString = formatDate(dayDate);

            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            dayDiv.innerHTML = `
                <div class="calendar-day-header">${days[i]} <span class="date-number">${dayDate.getDate()}.</span></div>
                <div class="meal-slots">
                    <div class="meal-slot" data-date="${dateString}" data-meal="breakfast"><span class="meal-slot-title">Morgen</span></div>
                    <div class="meal-slot" data-date="${dateString}" data-meal="lunch"><span class="meal-slot-title">Frokost</span></div>
                    <div class="meal-slot" data-date="${dateString}" data-meal="dinner"><span class="meal-slot-title">Aften</span></div>
                </div>
            `;
            fragment.appendChild(dayDiv);
        }
        calendarGrid.appendChild(fragment);
        populateCalendarWithData();
    }

    function populateCalendarWithData() {
        document.querySelectorAll('.meal-slot').forEach(slot => {
            const date = slot.dataset.date;
            const meal = slot.dataset.meal;
            const mealData = state.mealPlan[date]?.[meal];
            
            slot.querySelector('.planned-recipe')?.remove();

            if (mealData) {
                let recipeName = "Ukendt";
                let isLeftovers = mealData.type === 'leftovers';
                let recipeExists = true;

                if (isLeftovers) {
                    recipeName = "Rester";
                } else if (mealData.recipeId) {
                    const recipe = state.recipes.find(r => r.id === mealData.recipeId);
                    if (recipe) {
                        recipeName = recipe.title;
                    } else {
                        recipeName = "Slettet Opskrift";
                        recipeExists = false;
                    }
                }
                
                const recipeDiv = document.createElement('div');
                recipeDiv.className = 'planned-recipe';
                if (isLeftovers) recipeDiv.classList.add('leftovers');
                if (mealData.status === 'cooked') recipeDiv.classList.add('cooked');
                if (!recipeExists) recipeDiv.classList.add('deleted');

                recipeDiv.draggable = recipeExists;
                recipeDiv.dataset.sourceDate = date;
                recipeDiv.dataset.sourceMeal = meal;
                recipeDiv.dataset.mealData = JSON.stringify(mealData);

                const isCooked = mealData.status === 'cooked';
                const cookedBtnClass = isCooked ? 'cooked' : '';
                const cookedBtnTitle = isCooked ? 'Retten er markeret som lavet' : 'Marker som lavet (nedskriv fra lager)';
                
                const cookedBtnHTML = recipeExists ? `<button class="btn-icon mark-cooked-btn ${cookedBtnClass}" title="${cookedBtnTitle}" ${isCooked ? 'disabled' : ''}><i class="fas fa-utensils"></i></button>` : '';

                recipeDiv.innerHTML = `
                    <span>${recipeName}</span>
                    <div class="planned-recipe-actions">
                        ${cookedBtnHTML}
                        <button class="btn-icon remove-meal-btn" title="Fjern fra madplan"><i class="fas fa-times"></i></button>
                    </div>
                `;
                slot.appendChild(recipeDiv);
            }
        });
    }

    function renderSidebarRecipeList() {
        sidebarRecipeList.innerHTML = '';
        const activeTab = document.querySelector('.sidebar-tab.active').dataset.tab;
        const searchTerm = sidebarSearchInput.value.toLowerCase();
        
        let recipesToRender = state.recipes;
        if (activeTab === 'favorites') {
            recipesToRender = recipesToRender.filter(r => r.is_favorite);
        }

        if (searchTerm) {
            recipesToRender = recipesToRender.filter(r => r.title.toLowerCase().includes(searchTerm));
        }

        if (state.activeSidebarTags.size > 0) {
            recipesToRender = recipesToRender.filter(r => {
                if (!r.tags) return false;
                return [...state.activeSidebarTags].every(tag => r.tags.includes(tag));
            });
        }
        
        const fragment = document.createDocumentFragment();
        recipesToRender.sort((a,b) => a.title.localeCompare(b.title)).forEach(recipe => {
            const imageUrl = recipe.imageUrl || `https://placehold.co/400x300/f3f0e9/d1603d?text=${encodeURIComponent(recipe.title)}`;
            const div = document.createElement('div');
            div.className = 'sidebar-recipe-item';
            div.draggable = true;
            div.dataset.recipeId = recipe.id;
            div.innerHTML = `
                <div class="sidebar-recipe-header">
                    <span>${recipe.title}</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="sidebar-recipe-body">
                    <img src="${imageUrl}" alt="${recipe.title}" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/400x300/f3f0e9/d1603d?text=Billede+mangler';">
                </div>
            `;
            fragment.appendChild(div);
        });
        sidebarRecipeList.appendChild(fragment);
    }

    function renderSidebarTagFilters() {
        const allTags = new Set();
        state.recipes.forEach(r => {
            if (r.tags) r.tags.forEach(tag => allTags.add(tag));
        });

        sidebarTagFilters.innerHTML = '';
        const fragment = document.createDocumentFragment();
        
        [...allTags].sort().forEach(tag => {
            const tagButton = document.createElement('button');
            tagButton.className = 'filter-tag';
            tagButton.textContent = tag;
            if (state.activeSidebarTags.has(tag)) tagButton.classList.add('active');
            
            tagButton.addEventListener('click', () => {
                if (state.activeSidebarTags.has(tag)) {
                    state.activeSidebarTags.delete(tag);
                } else {
                    state.activeSidebarTags.add(tag);
                }
                renderSidebarTagFilters();
                renderSidebarRecipeList();
            });
            fragment.appendChild(tagButton);
        });
        sidebarTagFilters.appendChild(fragment);
    }

    prevWeekBtn.addEventListener('click', () => {
        state.currentDate.setDate(state.currentDate.getDate() - 7);
        renderMealPlanner();
    });

    nextWeekBtn.addEventListener('click', () => {
        state.currentDate.setDate(state.currentDate.getDate() + 7);
        renderMealPlanner();
    });

    sidebarTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            sidebarTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderSidebarRecipeList();
        });
    });
    
    sidebarSearchInput.addEventListener('input', debounce(renderSidebarRecipeList, 300));

    sidebarRecipeList.addEventListener('click', (e) => {
        const header = e.target.closest('.sidebar-recipe-header');
        if (header) {
            const item = header.closest('.sidebar-recipe-item');
            const wasExpanded = item.classList.contains('expanded');
            
            sidebarRecipeList.querySelectorAll('.sidebar-recipe-item').forEach(i => i.classList.remove('expanded'));
            
            if (!wasExpanded) {
                item.classList.add('expanded');
            }
        }
    });

    document.addEventListener('dragstart', (e) => {
        if (!e.target.closest('.meal-planner-layout')) return;
        e.target.style.opacity = '0.5';
        if (e.target.classList.contains('sidebar-recipe-item')) { 
            e.dataTransfer.setData('application/json', JSON.stringify({
                type: 'new-item',
                recipeId: e.target.dataset.recipeId
            }));
        }
        if (e.target.classList.contains('planned-recipe')) {
            e.dataTransfer.setData('application/json', JSON.stringify({
                type: 'move-item',
                sourceDate: e.target.dataset.sourceDate,
                sourceMeal: e.target.dataset.sourceMeal,
                mealData: JSON.parse(e.target.dataset.mealData)
            }));
        }
    });

    document.addEventListener('dragend', (e) => {
        if (!e.target.closest('.meal-planner-layout')) return;
        e.target.style.opacity = '1';
    });

    calendarGrid.addEventListener('dragover', (e) => {
        e.preventDefault();
        const slot = e.target.closest('.meal-slot');
        if (slot) {
            slot.classList.add('drag-over');
        }
    });

    calendarGrid.addEventListener('dragleave', (e) => {
        const slot = e.target.closest('.meal-slot');
        if (slot) {
            slot.classList.remove('drag-over');
        }
    });

    calendarGrid.addEventListener('drop', async (e) => {
        e.preventDefault();
        const slot = e.target.closest('.meal-slot');
        if (slot) {
            slot.classList.remove('drag-over');
            const dragData = JSON.parse(e.dataTransfer.getData('application/json'));
            const targetDate = slot.dataset.date;
            const targetMeal = slot.dataset.meal;

            const year = new Date(targetDate).getFullYear();
            const mealPlanDocId = `plan_${year}`;
            const mealPlanRef = doc(db, 'meal_plans', mealPlanDocId);
            
            let updates = {};
            let dataToSet;
            if (dragData.type === 'new-item') {
                 dataToSet = { recipeId: dragData.recipeId, type: 'recipe', status: 'planned' };
            } else { 
                dataToSet = dragData.mealData;
            }

            const targetFieldPath = `${targetDate}.${targetMeal}`;
            updates[targetFieldPath] = dataToSet;

            if (dragData.type === 'move-item') {
                const sourceFieldPath = `${dragData.sourceDate}.${dragData.sourceMeal}`;
                if (sourceFieldPath !== targetFieldPath) {
                    updates[sourceFieldPath] = deleteField();
                }
            }

            try {
                await updateDoc(mealPlanRef, updates);
            } catch (error) {
                if (error.code === 'not-found') {
                    const newPlan = {};
                    newPlan[targetDate] = { [targetMeal]: dataToSet };
                    await setDoc(mealPlanRef, newPlan);
                } else {
                    handleError(error, "Kunne ikke gemme ændringen i madplanen.");
                }
            }
        }
    });
    
    calendarGrid.addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('.remove-meal-btn');
        if (removeBtn) {
            const slot = removeBtn.closest('.meal-slot');
            const date = slot.dataset.date;
            const mealType = slot.dataset.meal;

            const confirmed = await showNotification({title: "Fjern måltid", message: "Er du sikker?", type: 'confirm'});
            if (!confirmed) return;

            const year = new Date(date).getFullYear();
            const mealPlanDocId = `plan_${year}`;
            const mealPlanRef = doc(db, 'meal_plans', mealPlanDocId);
            const fieldPath = `${date}.${mealType}`;
            
            try {
                await updateDoc(mealPlanRef, { [fieldPath]: deleteField() });
            } catch (error) {
                handleError(error, "Måltidet kunne ikke fjernes.");
            }
            return; 
        }

        const cookedBtn = e.target.closest('.mark-cooked-btn');
        if (cookedBtn && !cookedBtn.disabled) {
            const slot = cookedBtn.closest('.meal-slot');
            const date = slot.dataset.date;
            const mealType = slot.dataset.meal;
            const mealData = JSON.parse(slot.querySelector('.planned-recipe').dataset.mealData);
            const recipe = state.recipes.find(r => r.id === mealData.recipeId);

            if (!recipe || !recipe.ingredients) {
                showNotification({title: "Fejl", message: "Opskriften eller dens ingredienser kunne ikke findes."});
                return;
            }

            let validationErrors = [];
            for (const ingredient of recipe.ingredients) {
                const inventoryItem = state.inventory.find(item => item.name.toLowerCase() === ingredient.name.toLowerCase());

                if (!inventoryItem) {
                    validationErrors.push(`Varen '${ingredient.name}' er ikke oprettet i dit varelager.`);
                    continue;
                }

                const conversionResult = convertToPrimaryUnit(ingredient.quantity, ingredient.unit, inventoryItem);
                
                if (conversionResult.error) {
                    validationErrors.push(`For '${ingredient.name}': ${conversionResult.error}`);
                    continue;
                }
                
                const neededInGrams = conversionResult.convertedQuantity;
                const inStockInGrams = inventoryItem.grams_in_stock || 0;

                if (inStockInGrams < neededInGrams) {
                    validationErrors.push(`Mangler ${neededInGrams - inStockInGrams} g '${ingredient.name}'.`);
                }
            }

            if (validationErrors.length > 0) {
                const message = "Du kan ikke lave denne ret af følgende årsager:<br><br>" + validationErrors.join('<br>');
                showNotification({title: "Manglende Varer", message: message});
                return;
            }

            const confirmed = await showNotification({title: "Bekræft Madlavning", message: "Vil du markere denne ret som 'lavet'? Dette vil trække ingredienserne fra dit varelager.", type: 'confirm'});
            if (!confirmed) return;
            
            cookedBtn.disabled = true;

            const year = new Date(date).getFullYear();
            const mealPlanDocId = `plan_${year}`;
            const mealPlanRef = doc(db, 'meal_plans', mealPlanDocId);
            const fieldPath = `${date}.${mealType}.status`;
            const eventIdPath = `${date}.${mealType}.cookedEventId`;

            try {
                await updateDoc(mealPlanRef, { 
                    [fieldPath]: "cooked",
                    [eventIdPath]: crypto.randomUUID()
                });
                showNotification({title: "Ret Lavet", message: "Retten er markeret, og lageret vil blive opdateret."});
            } catch (error) {
                handleError(error, "Kunne ikke markere måltidet.");
                cookedBtn.disabled = false;
            }
        }
    });

    // =================================================================
    // 9. INSPIRATION & AUTOGEN LOGIK
    // =================================================================
    function calculateRecipeMatch(recipe) {
        let missingCount = 0;
        if (!recipe.ingredients || recipe.ingredients.length === 0) {
            return { ...recipe, missingCount: 99 };
        }

        recipe.ingredients.forEach(ing => {
            const inventoryItem = state.inventory.find(item => item.name.toLowerCase() === ing.name.toLowerCase());
            if (!inventoryItem) {
                missingCount++;
                return;
            }
            
            const conversionResult = convertToPrimaryUnit(ing.quantity, ing.unit, inventoryItem);
            if(conversionResult.error) {
                missingCount++;
                return;
            }

            const neededInGrams = conversionResult.convertedQuantity;
            const inStockInGrams = inventoryItem.grams_in_stock || 0;
            if (neededInGrams > inStockInGrams) {
                missingCount++;
            }
        });
        return { ...recipe, missingCount };
    }

    function renderInspirationPage() {
        inspirationGrid.innerHTML = '';
        
        const recipesWithMatch = state.recipes.map(calculateRecipeMatch);
        
        recipesWithMatch.sort((a, b) => {
            if (a.missingCount !== b.missingCount) {
                return a.missingCount - b.missingCount;
            }
            return a.title.localeCompare(b.title);
        });

        if (recipesWithMatch.length === 0) {
            inspirationGrid.innerHTML = `<p>Du har ingen opskrifter endnu. Tilføj en for at få inspiration.</p>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        recipesWithMatch.forEach(recipe => {
            let statusClass = 'status-red';
            let statusTitle = `Mangler ${recipe.missingCount} ingredienser`;
            if (recipe.missingCount === 0) {
                statusClass = 'status-green';
                statusTitle = 'Du har alle ingredienser';
            } else if (recipe.missingCount === 1) {
                statusClass = 'status-yellow';
                statusTitle = 'Mangler 1 ingrediens';
            }

            const card = document.createElement('div');
            card.className = 'recipe-card';
            card.dataset.id = recipe.id;
            const isFavoriteClass = recipe.is_favorite ? 'fas is-favorite' : 'far';
            const imageUrl = recipe.imageUrl || `https://placehold.co/400x300/f3f0e9/d1603d?text=${encodeURIComponent(recipe.title)}`;
            
            const tagsHTML = (recipe.tags && recipe.tags.length > 0) 
                ? recipe.tags.map(tag => `<span class="recipe-card-tag">${tag}</span>`).join('')
                : '';

            card.innerHTML = `
                <div class="status-indicator ${statusClass}" title="${statusTitle}"></div>
                <img data-src="${imageUrl}" alt="Billede af ${recipe.title}" class="recipe-card-image lazy-load" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/400x300/f3f0e9/d1603d?text=Billede+mangler';">
                <div class="recipe-card-content">
                    <span class="recipe-card-category">${recipe.category || 'Ukategoriseret'}</span>
                    <h4>${recipe.title}</h4>
                    <div class="recipe-card-tags">${tagsHTML}</div>
                </div>
                <div class="recipe-card-actions">
                    <i class="${isFavoriteClass} fa-heart favorite-icon" title="Marker som favorit"></i>
                    <button class="btn-icon delete-recipe-btn" title="Slet opskrift"><i class="fas fa-trash"></i></button>
                </div>`;
            fragment.appendChild(card);
        });
        inspirationGrid.appendChild(fragment);
        document.querySelectorAll('.lazy-load').forEach(img => lazyImageObserver.observe(img));
    }

    autogenPlanBtn.addEventListener('click', () => {
        const allTags = new Set();
        state.recipes.forEach(r => {
            if (r.tags) r.tags.forEach(tag => allTags.add(tag));
        });

        autogenDietTagsContainer.innerHTML = '';
        [...allTags].sort().forEach(tag => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" value="${tag}"> ${tag}`;
            autogenDietTagsContainer.appendChild(label);
        });

        autogenModal.classList.remove('hidden');
    });

    autogenForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const budget = parseFloat(document.getElementById('autogen-budget').value) || Infinity;
        const maxTime = parseInt(document.getElementById('autogen-time').value, 10);
        const useLeftovers = document.getElementById('autogen-use-leftovers').checked;
        const selectedDietTags = [...autogenDietTagsContainer.querySelectorAll('input:checked')].map(el => el.value);

        let eligibleRecipes = state.recipes.filter(recipe => {
            if (recipe.time > maxTime) return false;
            if (selectedDietTags.length > 0 && !selectedDietTags.every(tag => recipe.tags?.includes(tag))) return false;
            
            const recipePrice = calculateRecipePrice(recipe);
            if (recipePrice > (budget / 7) && recipePrice > 0) return false;

            return true;
        });

        if(useLeftovers) {
            eligibleRecipes = eligibleRecipes.map(calculateRecipeMatch).sort((a,b) => a.missingCount - b.missingCount);
        }

        if (eligibleRecipes.length < 7) {
            showNotification({title: "Ikke nok opskrifter", message: "Kunne ikke finde nok opskrifter, der matcher dine kriterier. Prøv med færre begrænsninger."});
            return;
        }

        const weeklyPlan = {};
        const start = getStartOfWeek(state.currentDate);
        let usedRecipeIds = new Set();

        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(start);
            dayDate.setDate(start.getDate() + i);
            const dateString = formatDate(dayDate);
            
            let chosenRecipe = null;
            for(let recipe of eligibleRecipes) {
                if (!usedRecipeIds.has(recipe.id)) {
                    chosenRecipe = recipe;
                    break;
                }
            }
            if (!chosenRecipe) {
                chosenRecipe = eligibleRecipes[Math.floor(Math.random() * eligibleRecipes.length)];
            }
            
            usedRecipeIds.add(chosenRecipe.id);
            
            weeklyPlan[dateString] = {
                dinner: { recipeId: chosenRecipe.id, type: 'recipe', status: 'planned' }
            };
        }
        
        const confirmed = await showNotification({title: "Forslag til Madplan", message: "En ny madplan er genereret baseret på dine kriterier. Vil du gemme den?", type: 'confirm'});
        if (confirmed) {
            const year = state.currentDate.getFullYear();
            const mealPlanDocId = `plan_${year}`;
            const mealPlanRef = doc(db, 'meal_plans', mealPlanDocId);

            try {
                const updates = {};
                Object.keys(weeklyPlan).forEach(date => {
                    updates[date] = weeklyPlan[date];
                });
                await setDoc(mealPlanRef, updates, { merge: true });
                autogenModal.classList.add('hidden');
                showNotification({title: "Madplan Gemt", message: "Din nye madplan er blevet gemt."});
            } catch (error) {
                handleError(error, "Den autogenererede madplan kunne ikke gemmes.");
            }
        }
    });

});
