// =================================================================
// 0. FIREBASE INITIALISERING & IMPORTS
// =================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { 
    getAuth,
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    signOut 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
    getFirestore,
    collection, 
    onSnapshot,
    addDoc,
    doc,
    updateDoc,
    deleteDoc,
    getDoc,
    setDoc,
    writeBatch,
    deleteField
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Firebase-konfiguration
const firebaseConfig = {
  apiKey: "AIzaSyDUuGEqZ53r5PWMwg1_hj7Jpu7DubK-Lo8",
  authDomain: "frederikkes-kogebog.firebaseapp.com",
  projectId: "frederikkes-kogebog",
  storageBucket: "frederikkes-kogebog.firebasestorage.app",
  messagingSenderId: "557087234453",
  appId: "1:557087234453:web:9abec4eb124bc08583be9c"
};

// Initialiser Firebase og services
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
    const itemNameInput = document.getElementById('item-name');
    const itemCategoryInput = document.getElementById('item-category');
    const itemStoreSectionSelect = document.getElementById('item-store-section');

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

    // --- Madplan Side Elementer ---
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarTitle = document.getElementById('calendar-title');
    const prevWeekBtn = document.getElementById('prev-week-btn');
    const nextWeekBtn = document.getElementById('next-week-btn');
    const sidebarRecipeList = document.getElementById('sidebar-recipe-list');
    const sidebarTabs = document.querySelectorAll('.sidebar-tab');
    const sidebarSearchInput = document.getElementById('sidebar-recipe-search');
    const sidebarTagFilters = document.getElementById('sidebar-tag-filters');

    // --- Indkøbsliste (nu i sidebar) ---
    const shoppingListContainer = document.getElementById('shopping-list-container');
    const shoppingListTotalContainer = document.getElementById('shopping-list-total-container');
    const confirmPurchaseBtn = document.getElementById('confirm-purchase-btn');
    const generateWeeklyShoppingListBtn = document.getElementById('generate-weekly-shopping-list-btn');
    const addShoppingItemForm = document.getElementById('add-shopping-item-form');

    // --- Notifikations Modal Elementer ---
    const notificationModal = document.getElementById('notification-modal');
    const notificationTitle = document.getElementById('notification-title');
    const notificationMessage = document.getElementById('notification-message');
    const notificationActions = document.getElementById('notification-actions');

    // --- State ---
    let currentUser = null;
    let inventoryUnsubscribe = null;
    let recipesUnsubscribe = null;
    let mealPlanUnsubscribe = null;
    let currentInventoryItems = [];
    let currentRecipes = [];
    let currentMealPlan = {}; 
    let currentShoppingList = {};
    let currentlyViewedRecipeId = null;
    let activeRecipeFilterTag = null; 
    let activeSidebarTag = null; 
    let currentDate = new Date(); 

    // =================================================================
    // 0. HJÆLPEFUNKTIONER
    // =================================================================
    
    function showNotification({ title, message, type = 'alert' }) {
        notificationTitle.textContent = title;
        notificationMessage.textContent = message;
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
            currentUser = user;
            document.getElementById('profile-email').textContent = user.email;
            loginPage.classList.add('hidden');
            appContainer.classList.remove('hidden');
            setupRealtimeListeners();
            navigateTo(window.location.hash || '#meal-planner');
        } else {
            currentUser = null;
            appContainer.classList.add('hidden');
            loginPage.classList.remove('hidden');
            if (inventoryUnsubscribe) inventoryUnsubscribe();
            if (recipesUnsubscribe) recipesUnsubscribe();
            if (mealPlanUnsubscribe) mealPlanUnsubscribe();
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
            signOut(auth).catch(error => console.error("Logout Fejl:", error));
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
        if (hash === '#meal-planner' || hash === '') {
            renderMealPlanner();
            renderSidebarRecipeList();
            renderSidebarTagFilters();
            renderShoppingList();
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
    function setupRealtimeListeners() {
        if (inventoryUnsubscribe) inventoryUnsubscribe();
        if (recipesUnsubscribe) recipesUnsubscribe();
        if (mealPlanUnsubscribe) mealPlanUnsubscribe();

        const inventoryRef = collection(db, 'inventory_items');
        inventoryUnsubscribe = onSnapshot(inventoryRef, (snapshot) => {
            currentInventoryItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderInventory(currentInventoryItems);
        }, error => console.error("Fejl i varelager-listener:", error));

        const recipesRef = collection(db, 'recipes');
        recipesUnsubscribe = onSnapshot(recipesRef, (snapshot) => {
            currentRecipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderTagFilters(); 
            renderRecipes();
            if (document.querySelector('#meal-planner:not(.hidden)')) {
                renderSidebarRecipeList();
                renderSidebarTagFilters();
            }
            document.getElementById('profile-recipe-count').textContent = currentRecipes.length;
            const favoriteCount = currentRecipes.filter(r => r.is_favorite).length;
            document.getElementById('profile-favorite-count').textContent = favoriteCount;
        }, error => console.error("Fejl i opskrift-listener:", error));

        const year = currentDate.getFullYear();
        const mealPlanDocId = `plan_${year}`;
        const mealPlanRef = doc(db, 'meal_plans', mealPlanDocId);
        mealPlanUnsubscribe = onSnapshot(mealPlanRef, (doc) => {
            currentMealPlan = doc.exists() ? doc.data() : {};
            if (document.querySelector('#meal-planner:not(.hidden)')) {
                renderMealPlanner(); 
            }
        });
    }

    // =================================================================
    // 4. RENDER FUNKTIONER 
    // =================================================================
    function renderInventory(items) {
        inventoryTableBody.innerHTML = '';
        if (items.length === 0) {
             inventoryTableBody.innerHTML = `<tr><td colspan="6">Dit varelager er tomt. Tilføj en vare for at starte.</td></tr>`;
             return;
        }
        items.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
            const tr = document.createElement('tr');
            tr.dataset.id = item.id;
            const stockPercentage = (item.current_stock && item.max_stock) ? (item.current_stock / item.max_stock) * 100 : 100;
            let stockColor = '#4CAF50';
            if (stockPercentage < 50) stockColor = '#FFC107';
            if (stockPercentage < 20) stockColor = '#F44336';
            tr.innerHTML = `
                <td>${item.name || ''}</td>
                <td><div class="stock-bar"><div class="stock-level" style="width: ${stockPercentage}%; background-color: ${stockColor};"></div></div><span>${item.current_stock || 0} ${item.unit || ''}</span></td>
                <td>${item.category || ''}</td>
                <td>${item.kg_price ? `${item.kg_price.toFixed(2)} kr.` : ''}</td>
                <td>${item.home_location || ''}</td>
                <td><button class="btn-icon edit-item"><i class="fas fa-edit"></i></button> <button class="btn-icon delete-item"><i class="fas fa-trash"></i></button></td>`;
            inventoryTableBody.appendChild(tr);
        });
    }

    function renderRecipes() {
        recipeGrid.innerHTML = '';
        const recipesToRender = activeRecipeFilterTag 
            ? currentRecipes.filter(r => r.tags && r.tags.includes(activeRecipeFilterTag))
            : currentRecipes;

        if (recipesToRender.length === 0) {
            recipeGrid.innerHTML = `<p>Ingen opskrifter matcher dit filter.</p>`;
            return;
        }

        recipesToRender.sort((a,b) => a.title.localeCompare(b.title)).forEach(recipe => {
            const card = document.createElement('div');
            card.className = 'recipe-card';
            card.dataset.id = recipe.id;
            const isFavoriteClass = recipe.is_favorite ? 'fas is-favorite' : 'far';
            const imageUrl = recipe.imageUrl || `https://placehold.co/600x400/f3f0e9/d1603d?text=${recipe.title ? encodeURIComponent(recipe.title) : 'Opskrift'}`;
            
            const tagsHTML = (recipe.tags && recipe.tags.length > 0) 
                ? recipe.tags.map(tag => `<span class="recipe-card-tag">${tag}</span>`).join('')
                : '';

            card.innerHTML = `
                <img src="${imageUrl}" alt="Billede af ${recipe.title}" class="recipe-card-image" onerror="this.onerror=null;this.src='https://placehold.co/600x400/f3f0e9/d1603d?text=Billede+mangler';">
                <div class="recipe-card-content">
                    <span class="recipe-card-category">${recipe.category || 'Ukategoriseret'}</span>
                    <h4>${recipe.title}</h4>
                    <div class="recipe-card-tags">${tagsHTML}</div>
                </div>
                <div class="recipe-card-actions">
                    <i class="${isFavoriteClass} fa-heart favorite-icon" title="Marker som favorit"></i>
                    <button class="btn-icon delete-recipe-btn" title="Slet opskrift"><i class="fas fa-trash"></i></button>
                </div>`;
            recipeGrid.appendChild(card);
        });
    }

    function renderTagFilters() {
        const allTags = new Set();
        currentRecipes.forEach(r => {
            if (r.tags) r.tags.forEach(tag => allTags.add(tag));
        });

        recipeFilterContainer.innerHTML = '';
        const allButton = document.createElement('button');
        allButton.className = 'filter-tag';
        allButton.textContent = 'Alle';
        if (!activeRecipeFilterTag) allButton.classList.add('active');
        allButton.addEventListener('click', () => {
            activeRecipeFilterTag = null;
            renderTagFilters();
            renderRecipes();
        });
        recipeFilterContainer.appendChild(allButton);

        allTags.forEach(tag => {
            const tagButton = document.createElement('button');
            tagButton.className = 'filter-tag';
            tagButton.textContent = tag;
            if (activeRecipeFilterTag === tag) tagButton.classList.add('active');
            tagButton.addEventListener('click', () => {
                activeRecipeFilterTag = tag;
                renderTagFilters();
                renderRecipes();
            });
            recipeFilterContainer.appendChild(tagButton);
        });
    }
    
    function renderShoppingList() {
        shoppingListContainer.innerHTML = '';
        const groupedList = {};

        Object.values(currentShoppingList).sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
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

        for (const section in groupedList) {
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'store-section';
            
            let listItemsHTML = '';
            groupedList[section].forEach(item => {
                const safeItemName = item.name.replace(/[^a-zA-Z0-9]/g, '-');
                const itemInInventory = currentInventoryItems.find(invItem => invItem.name.toLowerCase() === item.name.toLowerCase());
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
            shoppingListContainer.appendChild(sectionDiv);
        }
        calculateAndRenderShoppingListTotal();
    }
    
    function renderReadView(recipe) {
        document.getElementById('read-view-image').src = recipe.imageUrl || `https://placehold.co/600x400/f3f0e9/d1603d?text=${recipe.title ? encodeURIComponent(recipe.title) : 'Opskrift'}`;
        document.getElementById('read-view-title').textContent = recipe.title;
        document.getElementById('read-view-category').textContent = recipe.category || '';
        document.getElementById('read-view-time').innerHTML = `<i class="fas fa-clock"></i> ${recipe.time || '?'} min.`;
        document.getElementById('read-view-portions').innerHTML = `<i class="fas fa-users"></i> ${recipe.portions || '?'} portioner`;
        
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
        
        currentlyViewedRecipeId = recipe.id;
        recipeReadModal.classList.remove('hidden');
    }

    // =================================================================
    // 5. CRUD & INTELLIGENS FOR VARELAGER
    // =================================================================
    const categoryKeywords = {
        'Frugt & Grønt': ['agurk', 'tomat', 'salat', 'løg', 'hvidløg', 'peberfrugt', 'gulerod', 'kartoffel', 'æble', 'banan', 'appelsin', 'pære'],
        'Kød & Fisk': ['kylling', 'oksekød', 'svinekød', 'fisk', 'laks', 'kalkun', 'lam'],
        'Mejeri': ['mælk', 'ost', 'smør', 'yoghurt', 'fløde', 'æg'],
        'Tørvarer': ['pasta', 'ris', 'mel', 'sukker', 'gær', 'havregryn', 'brød', 'rugbrød', 'bolle'],
        'Konserves': ['hakkede tomater', 'majs', 'bønner', 'kikærter', 'tun'],
    };

    itemNameInput.addEventListener('keyup', () => {
        const name = itemNameInput.value.toLowerCase();
        for (const category in categoryKeywords) {
            if (categoryKeywords[category].some(keyword => name.includes(keyword))) {
                itemCategoryInput.value = category;
                const sectionMap = { 'Mejeri': 'Mejeri', 'Kød & Fisk': 'Kød & Fisk', 'Frugt & Grønt': 'Frugt & Grønt', 'Tørvarer': 'Tørvarer', 'Konserves': 'Konserves'};
                if (sectionMap[category]) {
                    itemStoreSectionSelect.value = sectionMap[category];
                }
                break;
            }
        }
    });
    
    addInventoryItemBtn.addEventListener('click', () => {
        inventoryModalTitle.textContent = 'Tilføj ny vare';
        inventoryItemForm.reset();
        document.getElementById('inventory-item-id').value = '';
        inventoryItemModal.classList.remove('hidden');
    });

    inventoryItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const itemId = document.getElementById('inventory-item-id').value;
        const itemData = {
            name: document.getElementById('item-name').value,
            category: document.getElementById('item-category').value,
            current_stock: Number(document.getElementById('item-current-stock').value),
            max_stock: Number(document.getElementById('item-max-stock').value) || null,
            unit: document.getElementById('item-unit').value,
            kg_price: Number(document.getElementById('item-kg-price').value) || null, // OPDATERET
            store_section: document.getElementById('item-store-section').value,
            home_location: document.getElementById('item-home-location').value,
            conversion_from_unit: document.getElementById('item-conversion-from').value.toLowerCase() || null,
            conversion_to_quantity: Number(document.getElementById('item-conversion-to-quantity').value) || null,
            conversion_to_unit: document.getElementById('item-conversion-to-unit').value.toLowerCase() || null,
        };
        try {
            if (itemId) {
                await updateDoc(doc(db, 'inventory_items', itemId), itemData);
            } else {
                await addDoc(collection(db, 'inventory_items'), itemData);
            }
            inventoryItemModal.classList.add('hidden');
        } catch (error) {
            console.error("Fejl ved lagring af vare:", error);
            await showNotification({ title: "Fejl", message: "Der skete en fejl. Varen blev ikke gemt." });
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
                } catch (error) { console.error("FEJL ved sletning af vare:", error); }
            }
        }

        if (target.classList.contains('edit-item')) {
            const item = currentInventoryItems.find(i => i.id === docId);
            if (item) {
                inventoryModalTitle.textContent = 'Rediger vare';
                document.getElementById('inventory-item-id').value = item.id;
                document.getElementById('item-name').value = item.name || '';
                document.getElementById('item-category').value = item.category || '';
                document.getElementById('item-current-stock').value = item.current_stock || 0;
                document.getElementById('item-max-stock').value = item.max_stock || '';
                document.getElementById('item-unit').value = item.unit || '';
                document.getElementById('item-kg-price').value = item.kg_price || ''; // OPDATERET
                document.getElementById('item-store-section').value = item.store_section || '';
                document.getElementById('item-home-location').value = item.home_location || '';
                document.getElementById('item-conversion-from').value = item.conversion_from_unit || '';
                document.getElementById('item-conversion-to-quantity').value = item.conversion_to_quantity || '';
                document.getElementById('item-conversion-to-unit').value = item.conversion_to_unit || '';
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
            is_favorite: currentRecipes.find(r => r.id === recipeId)?.is_favorite || false
        };

        try {
            if (recipeId) {
                await updateDoc(doc(db, 'recipes', recipeId), recipeData);
            } else {
                await addDoc(collection(db, 'recipes'), recipeData);
            }
            recipeEditModal.classList.add('hidden');
        } catch (error) {
            console.error("Fejl ved lagring af opskrift:", error);
            await showNotification({ title: "Fejl", message: "Der skete en fejl. Opskriften blev ikke gemt." });
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
            } catch (error) { console.error("FEJL ved opdatering af favorit:", error); }
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
                    console.error("Fejl ved sletning af opskrift:", error);
                    showNotification({title: "Fejl", message: "Opskriften kunne ikke slettes."});
                }
            }
            return;
        }

        const recipe = currentRecipes.find(r => r.id === docId);
        if (recipe) {
            renderReadView(recipe);
        }
    });
    
    readViewEditBtn.addEventListener('click', () => {
        const recipe = currentRecipes.find(r => r.id === currentlyViewedRecipeId);
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
        const recipeId = currentlyViewedRecipeId;
        if (!recipeId) return;

        const confirmed = await showNotification({title: "Slet Opskrift", message: "Er du sikker på, du vil slette denne opskrift?", type: 'confirm'});
        if(confirmed) {
            try {
                await deleteDoc(doc(db, 'recipes', recipeId));
                recipeReadModal.classList.add('hidden');
                showNotification({title: "Slettet", message: "Opskriften er blevet slettet."});
            } catch (error) {
                console.error("Fejl ved sletning af opskrift:", error);
                showNotification({title: "Fejl", message: "Opskriften kunne ikke slettes."});
            }
        }
    });
    
    readViewAddToMealPlanBtn.addEventListener('click', () => {
        navigateTo('#meal-planner');
        recipeReadModal.classList.add('hidden');
        showNotification({title: "Klar til planlægning", message: "Træk opskriften fra sidebaren over på den ønskede dag."})
    });

    // =================================================================
    // 7. INDKØBSLISTE LOGIK
    // =================================================================
    
    generateWeeklyShoppingListBtn.addEventListener('click', () => {
        const allIngredientsNeeded = [];
        const start = getStartOfWeek(currentDate); 

        for (let i = 0; i < 7; i++) {
            const dayDate = new Date(start);
            dayDate.setDate(start.getDate() + i);
            const dateString = formatDate(dayDate);
            const dayPlan = currentMealPlan[dateString];

            if (dayPlan) {
                Object.values(dayPlan).forEach(meal => {
                    if (meal && meal.recipeId && meal.type === 'recipe') {
                        const recipe = currentRecipes.find(r => r.id === meal.recipeId);
                        if (recipe) {
                            const scaleFactor = 1; 
                            recipe.ingredients.forEach(ing => {
                                allIngredientsNeeded.push({
                                    ...ing,
                                    quantity: (ing.quantity || 0) * scaleFactor
                                });
                            });
                        }
                    }
                });
            }
        }
        
        addToShoppingList(allIngredientsNeeded, `madplanen for uge ${getWeekNumber(start)}`);
    });
    
    function addToShoppingList(ingredients, sourceText) {
        ingredients.forEach(ing => {
            const key = ing.name.toLowerCase();
            const existingItem = currentShoppingList[key];
            
            if (existingItem) {
                existingItem.quantity_to_buy += ing.quantity || 0;
            } else {
                const inventoryItem = currentInventoryItems.find(item => item.name.toLowerCase() === key);
                const needed = ing.quantity || 0;
                const inStock = inventoryItem ? inventoryItem.current_stock : 0;
                const toBuy = needed - inStock;

                if (toBuy > 0) {
                    currentShoppingList[key] = {
                        name: ing.name,
                        quantity_to_buy: toBuy,
                        unit: ing.unit || '',
                        store_section: inventoryItem ? inventoryItem.store_section : 'Andet'
                    };
                }
            }
        });

        for (const key in currentShoppingList) {
            const item = currentShoppingList[key];
            if (item.unit !== 'g' && item.unit !== 'kg' && item.unit !== 'l' && item.unit !== 'ml') {
                item.quantity_to_buy = Math.ceil(item.quantity_to_buy);
            }
        }
        
        renderShoppingList();
        if (sourceText) {
            showNotification({ title: "Opdateret", message: `Varer fra ${sourceText} er tilføjet til indkøbslisten.` });
        }
    }

    addShoppingItemForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('add-shopping-item-name');
        const itemName = input.value.trim();
        if (itemName) {
            addToShoppingList([{ name: itemName, quantity: 1, unit: 'stk' }]);
            input.value = '';
        }
    });

    confirmPurchaseBtn.addEventListener('click', async () => {
        const checkedItems = [];
        document.querySelectorAll('.shopping-list-checkbox:checked').forEach(checkbox => {
            const itemName = checkbox.closest('.shopping-list-item').dataset.itemName;
            checkedItems.push(currentShoppingList[itemName.toLowerCase()]);
        });

        if (checkedItems.length === 0) {
            await showNotification({ title: "Intet valgt", message: "Vælg venligst de varer, du har købt." });
            return;
        }

        const itemsWithoutInventory = checkedItems.filter(item => !currentInventoryItems.some(inv => inv.name.toLowerCase() === item.name.toLowerCase()));

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
        
        checkedItems.forEach(item => {
            const inventoryItem = currentInventoryItems.find(inv => inv.name.toLowerCase() === item.name.toLowerCase());
            if (inventoryItem) {
                const itemRef = doc(db, "inventory_items", inventoryItem.id);
                const newStock = (inventoryItem.current_stock || 0) + item.quantity_to_buy;
                batch.update(itemRef, { current_stock: newStock });
            }
            delete currentShoppingList[item.name.toLowerCase()];
        });

        try {
            await batch.commit();
            renderShoppingList();
            await showNotification({ title: "Succes", message: "Dit varelager er blevet opdateret!" });
        } catch (error) {
            console.error("Fejl ved bekræftelse af indkøb:", error);
            await showNotification({ title: "Fejl", message: "Der skete en fejl." });
        }
    });

    shoppingListContainer.addEventListener('input', (e) => {
        const target = e.target;
        if (target.classList.contains('item-quantity-input') || target.classList.contains('item-unit-input')) {
            const listItem = target.closest('.shopping-list-item');
            const itemName = listItem.dataset.itemName.toLowerCase();
            const item = currentShoppingList[itemName];

            if(item) {
                if (target.classList.contains('item-quantity-input')) {
                    item.quantity_to_buy = parseFloat(target.value) || 0;
                }
                if (target.classList.contains('item-unit-input')) {
                    item.unit = target.value;
                }
            }
            calculateAndRenderShoppingListTotal(); // Opdater totalen live
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
            delete currentShoppingList[itemName.toLowerCase()];
            renderShoppingList();
        }
    });

    // NYT: Funktion til at beregne og vise totalpris
    function calculateAndRenderShoppingListTotal() {
        let totalPrice = 0;
        Object.values(currentShoppingList).forEach(item => {
            const inventoryItem = currentInventoryItems.find(inv => inv.name.toLowerCase() === item.name.toLowerCase());
            if (inventoryItem && inventoryItem.kg_price) {
                let quantityInKg = 0;
                const unit = item.unit.toLowerCase();
                if (unit === 'g' || unit === 'gram') {
                    quantityInKg = item.quantity_to_buy / 1000;
                } else if (unit === 'kg') {
                    quantityInKg = item.quantity_to_buy;
                }
                totalPrice += quantityInKg * inventoryItem.kg_price;
            }
        });
        shoppingListTotalContainer.innerHTML = `<span>Estimeret Pris: <strong>${totalPrice.toFixed(2)} kr.</strong></span>`;
    }

    // =================================================================
    // 8. MADPLAN SIDE LOGIK
    // =================================================================
    
    function renderMealPlanner() {
        calendarGrid.innerHTML = '';
        const start = getStartOfWeek(currentDate);
        calendarTitle.textContent = `Uge ${getWeekNumber(start)}, ${start.getFullYear()}`;
        const days = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];

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
            calendarGrid.appendChild(dayDiv);
        }
        populateCalendarWithData();
    }

    function populateCalendarWithData() {
        document.querySelectorAll('.meal-slot').forEach(slot => {
            const date = slot.dataset.date;
            const meal = slot.dataset.meal;
            const mealData = currentMealPlan[date]?.[meal];
            
            slot.querySelector('.planned-recipe')?.remove();

            if (mealData) {
                let recipeName = "Ukendt";
                let isLeftovers = mealData.type === 'leftovers';

                if (isLeftovers) {
                    recipeName = "Rester";
                } else if (mealData.recipeId) {
                    const recipe = currentRecipes.find(r => r.id === mealData.recipeId);
                    if (recipe) recipeName = recipe.title;
                }
                
                const recipeDiv = document.createElement('div');
                recipeDiv.className = 'planned-recipe';
                if (isLeftovers) recipeDiv.classList.add('leftovers');
                
                recipeDiv.draggable = true;
                recipeDiv.dataset.sourceDate = date;
                recipeDiv.dataset.sourceMeal = meal;
                recipeDiv.dataset.mealData = JSON.stringify(mealData);

                recipeDiv.innerHTML = `
                    <span>${recipeName}</span>
                    <button class="btn-icon remove-meal-btn" title="Fjern fra madplan">&times;</button>
                `;
                slot.appendChild(recipeDiv);
            }
        });
    }

    function renderSidebarRecipeList() {
        sidebarRecipeList.innerHTML = '';
        const activeTab = document.querySelector('.sidebar-tab.active').dataset.tab;
        const searchTerm = sidebarSearchInput.value.toLowerCase();
        
        let recipesToRender = currentRecipes;
        if (activeTab === 'favorites') {
            recipesToRender = currentRecipes.filter(r => r.is_favorite);
        }

        if (searchTerm) {
            recipesToRender = recipesToRender.filter(r => r.title.toLowerCase().includes(searchTerm));
        }

        if (activeSidebarTag) {
            recipesToRender = recipesToRender.filter(r => r.tags && r.tags.includes(activeSidebarTag));
        }
        
        recipesToRender.sort((a,b) => a.title.localeCompare(b.title)).forEach(recipe => {
            const imageUrl = recipe.imageUrl || `https://placehold.co/600x400/f3f0e9/d1603d?text=${recipe.title ? encodeURIComponent(recipe.title) : 'Opskrift'}`;
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
                    <img src="${imageUrl}" alt="${recipe.title}" onerror="this.onerror=null;this.src='https://placehold.co/600x400/f3f0e9/d1603d?text=Billede+mangler';">
                </div>
            `;
            sidebarRecipeList.appendChild(div);
        });
    }

    function renderSidebarTagFilters() {
        const allTags = new Set();
        currentRecipes.forEach(r => {
            if (r.tags) r.tags.forEach(tag => allTags.add(tag));
        });

        sidebarTagFilters.innerHTML = '';
        const allButton = document.createElement('button');
        allButton.className = 'filter-tag';
        allButton.textContent = 'Alle';
        if (!activeSidebarTag) allButton.classList.add('active');
        allButton.addEventListener('click', () => {
            activeSidebarTag = null;
            renderSidebarTagFilters();
            renderSidebarRecipeList();
        });
        sidebarTagFilters.appendChild(allButton);

        [...allTags].sort().forEach(tag => {
            const tagButton = document.createElement('button');
            tagButton.className = 'filter-tag';
            tagButton.textContent = tag;
            if (activeSidebarTag === tag) tagButton.classList.add('active');
            tagButton.addEventListener('click', () => {
                activeSidebarTag = tag;
                renderSidebarTagFilters();
                renderSidebarRecipeList();
            });
            sidebarTagFilters.appendChild(tagButton);
        });
    }

    // Event Listeners for Madplan
    prevWeekBtn.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() - 7);
        renderMealPlanner();
    });

    nextWeekBtn.addEventListener('click', () => {
        currentDate.setDate(currentDate.getDate() + 7);
        renderMealPlanner();
    });

    sidebarTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            sidebarTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderSidebarRecipeList();
        });
    });

    sidebarSearchInput.addEventListener('input', renderSidebarRecipeList);

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


    // Drag and Drop Logik
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
                 dataToSet = { recipeId: dragData.recipeId, type: 'recipe' };
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
                    console.error("Fejl ved drop:", error);
                    showNotification({title: "Fejl", message: "Kunne ikke gemme ændringen."});
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
                console.error("Fejl ved sletning af måltid:", error);
                showNotification({title: "Fejl", message: "Kunne ikke fjerne måltidet."});
            }
        }
    });

});
