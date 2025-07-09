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
    writeBatch
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Korrekt Firebase-konfiguration til applikationen
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

    // --- Madplan Elementer ---
    const mealPlanModal = document.getElementById('meal-plan-modal');
    const mealPlanForm = document.getElementById('meal-plan-form');
    const mealPlanContainer = document.getElementById('meal-plan-container');
    const generateWeeklyShoppingListBtn = document.getElementById('generate-weekly-shopping-list-btn');

    // --- Indkøbsliste Elementer ---
    const shoppingListContainer = document.getElementById('shopping-list-container');
    const confirmPurchaseBtn = document.getElementById('confirm-purchase-btn');

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
            navigateTo(window.location.hash || '#dashboard');
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
        const loginButton = loginForm.querySelector('button[type="submit"]');
        const originalButtonHTML = loginButton.innerHTML;
        loginButton.disabled = true;
        loginButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Logger ind...`;
        signInWithEmailAndPassword(auth, email, password)
            .catch((error) => {
                console.error("Login Fejl:", error.code);
                loginForm.querySelector('#login-error').textContent = 'Login fejlede. Tjek email og adgangskode.';
            })
            .finally(() => {
                loginButton.disabled = false;
                loginButton.innerHTML = originalButtonHTML;
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
            document.getElementById('dashboard').classList.remove('hidden');
        }
        navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === hash);
        });
    };
    
    headerTitleLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('#dashboard');
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
        navigateTo(window.location.hash || '#dashboard');
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
            document.getElementById('profile-recipe-count').textContent = currentRecipes.length;
            const favoriteCount = currentRecipes.filter(r => r.is_favorite).length;
            document.getElementById('profile-favorite-count').textContent = favoriteCount;
        }, error => console.error("Fejl i opskrift-listener:", error));

        const weekNumber = getWeekNumber(new Date());
        const year = new Date().getFullYear();
        const mealPlanDocId = `week_${weekNumber}_${year}`;
        const mealPlanRef = doc(db, 'meal_plans', mealPlanDocId);
        mealPlanUnsubscribe = onSnapshot(mealPlanRef, (doc) => {
            if (doc.exists()) {
                currentMealPlan = doc.data();
            } else {
                currentMealPlan = {};
            }
            renderMealPlan(currentMealPlan);
        });
    }

    // =================================================================
    // 4. RENDER FUNKTIONER
    // =================================================================
    function renderInventory(items) {
        inventoryTableBody.innerHTML = '';
        if (items.length === 0) {
             inventoryTableBody.innerHTML = `<tr><td colspan="5">Dit varelager er tomt. Tilføj en vare for at starte.</td></tr>`;
             return;
        }
        items.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
            const tr = document.createElement('tr');
            tr.dataset.id = item.id;
            const stockPercentage = (item.current_stock && item.max_stock) ? (item.current_stock / item.max_stock) * 100 : 100;
            let stockColor = '#4CAF50';
            if (stockPercentage < 50) stockColor = '#FFC107';
            if (stockPercentage < 20) stockColor = '#F44336';
            tr.innerHTML = `<td>${item.name || ''}</td><td><div class="stock-bar"><div class="stock-level" style="width: ${stockPercentage}%; background-color: ${stockColor};"></div></div><span>${item.current_stock || 0} ${item.unit || ''}</span></td><td>${item.category || ''}</td><td>${item.home_location || ''}</td><td><button class="btn-icon edit-item"><i class="fas fa-edit"></i></button> <button class="btn-icon delete-item"><i class="fas fa-trash"></i></button></td>`;
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
            const imageUrl = recipe.imageUrl || `https://placehold.co/600x400/f3f0e9/d1603d?text=${encodeURIComponent(recipe.title)}`;
            
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
                    <button class="btn-icon add-to-shopping-list-btn" title="Føj til indkøbsliste"><i class="fas fa-cart-plus"></i></button>
                    <i class="${isFavoriteClass} fa-heart favorite-icon" title="Marker som favorit"></i>
                </div>`;
            recipeGrid.appendChild(card);
        });
    }

    function renderTagFilters() {
        const allTags = new Set();
        currentRecipes.forEach(r => {
            if (r.tags) {
                r.tags.forEach(tag => allTags.add(tag));
            }
        });

        recipeFilterContainer.innerHTML = '';
        const allButton = document.createElement('button');
        allButton.className = 'filter-tag';
        allButton.textContent = 'Alle';
        if (!activeRecipeFilterTag) {
            allButton.classList.add('active');
        }
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
            if (activeRecipeFilterTag === tag) {
                tagButton.classList.add('active');
            }
            tagButton.addEventListener('click', () => {
                activeRecipeFilterTag = tag;
                renderTagFilters();
                renderRecipes();
            });
            recipeFilterContainer.appendChild(tagButton);
        });
    }

    function renderMealPlan(plan) {
        mealPlanContainer.innerHTML = '';
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const dayNames = { monday: 'Mandag', tuesday: 'Tirsdag', wednesday: 'Onsdag', thursday: 'Torsdag', friday: 'Fredag', saturday: 'Lørdag', sunday: 'Søndag' };

        days.forEach(day => {
            const meal = plan[day];
            const recipe = meal ? currentRecipes.find(r => r.id === meal.recipeId) : null;
            const mealDiv = document.createElement('div');
            mealDiv.className = 'meal-plan-day';
            mealDiv.innerHTML = `
                <strong>${dayNames[day]}</strong>
                <span>${recipe ? `${recipe.title} (${meal.portions} port.)` : 'Ikke planlagt'}</span>
            `;
            mealPlanContainer.appendChild(mealDiv);
        });
    }

    function renderShoppingList() {
        shoppingListContainer.innerHTML = '';
        const groupedList = {};

        Object.values(currentShoppingList).sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
            const section = item.store_section || 'Andet';
            if (!groupedList[section]) {
                groupedList[section] = [];
            }
            groupedList[section].push(item);
        });

        if (Object.keys(groupedList).length === 0) {
            shoppingListContainer.innerHTML = `<p>Din indkøbsliste er tom.</p>`;
            confirmPurchaseBtn.classList.add('hidden');
            return;
        }

        confirmPurchaseBtn.classList.remove('hidden');

        for (const section in groupedList) {
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'store-section';
            
            let listItemsHTML = '';
            groupedList[section].forEach(item => {
                const itemInInventory = currentInventoryItems.find(invItem => invItem.name.toLowerCase() === item.name.toLowerCase());
                const newItemIndicator = !itemInInventory 
                    ? `<button class="btn-icon new-item-indicator" data-item-name="${item.name}" title="Tilføj '${item.name}' til varelageret"><i class="fas fa-plus-circle"></i></button>`
                    : '';

                listItemsHTML += `
                    <li class="shopping-list-item" data-item-name="${item.name}">
                        <div class="item-info">
                            <input type="checkbox" id="shop-${item.name}">
                            <label for="shop-${item.name}">${item.quantity_to_buy} ${item.unit} ${item.name}</label>
                        </div>
                        <div>
                            ${newItemIndicator}
                            <button class="btn-icon remove-from-list-btn" title="Fjern fra liste"><i class="fas fa-times-circle"></i></button>
                        </div>
                    </li>`;
            });

            sectionDiv.innerHTML = `<h3>${section}</h3><ul>${listItemsHTML}</ul>`;
            shoppingListContainer.appendChild(sectionDiv);
        }
    }
    
    function renderReadView(recipe) {
        document.getElementById('read-view-image').src = recipe.imageUrl || `https://placehold.co/600x400/f3f0e9/d1603d?text=${encodeURIComponent(recipe.title)}`;
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
            price: Number(document.getElementById('item-price').value) || null,
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
            alert("Der skete en fejl. Varen blev ikke gemt.");
        }
    });

    inventoryTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const docId = target.closest('tr').dataset.id;
        
        if (target.classList.contains('delete-item')) {
            if (confirm('Er du sikker på, at du vil slette denne vare?')) {
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
                document.getElementById('item-price').value = item.price || '';
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

    const parseSingleIngredientLine = (line) => {
        line = line.trim().toLowerCase();
        if (!line) return null;

        let quantity = null;
        let unit = '';
        let name = '';

        const knownUnits = {
            'gram': 'g', 'g': 'g', 'stk': 'stk', 'fed': 'fed', 'dl': 'dl', 'l': 'l', 'ml': 'ml', 'tsk': 'tsk', 'spsk': 'spsk', 'dåse': 'dåse', 'bundt': 'bundt', 'knivspids': 'knivspids'
        };
        
        const quantityMatch = line.match(/^(\d[\d\s.,]*)/);
        if (quantityMatch) {
            quantity = parseFloat(quantityMatch[0].replace(',', '.').replace(/\s/g, ''));
            line = line.substring(quantityMatch[0].length).trim();
        }

        const lineParts = line.split(' ');
        let potentialUnit = lineParts[0].replace(/[^a-zæøå]/gi, '');
        let potentialName = lineParts.slice(1).join(' ').trim();
        if (!potentialName) potentialName = potentialUnit;
        
        const inventoryItem = currentInventoryItems.find(item => potentialName.includes(item.name.toLowerCase()));

        if (inventoryItem && inventoryItem.conversion_from_unit === potentialUnit) {
            unit = inventoryItem.conversion_to_unit;
            quantity = (quantity || 1) * inventoryItem.conversion_to_quantity;
            name = inventoryItem.name;
        } else if (knownUnits[potentialUnit]) {
            unit = knownUnits[potentialUnit];
            name = potentialName;
        } else {
            let unitFound = false;
            for (const u in knownUnits) {
                if (line.startsWith(u)) {
                    unit = knownUnits[u];
                    name = line.substring(u.length).trim();
                    unitFound = true;
                    break;
                }
            }
            if (!unitFound) {
                name = line;
            }
        }
        
        return { quantity, unit, name: name.charAt(0).toUpperCase() + name.slice(1) };
    };

    importIngredientsBtn.addEventListener('click', () => {
        const text = recipeImportTextarea.value;
        if (!text) return;
        ingredientsContainer.innerHTML = '';
        const lines = text.split('\n');
        lines.forEach(line => {
            const parsed = parseSingleIngredientLine(line);
            if (parsed && parsed.name) {
                addIngredientRow(parsed);
            }
        });
        recipeImportTextarea.value = '';
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
            alert("Der skete en fejl. Opskriften blev ikke gemt.");
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

        if (e.target.closest('.add-to-shopping-list-btn')) {
            addToShoppingListFromRecipe(docId);
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
            recipeImportTextarea.value = '';
            if (recipe.ingredients && recipe.ingredients.length > 0) {
                recipe.ingredients.forEach(ing => addIngredientRow(ing));
            } else {
                addIngredientRow();
            }
            recipeEditModal.classList.remove('hidden');
        }
    });
    
    readViewAddToMealPlanBtn.addEventListener('click', () => {
        const recipe = currentRecipes.find(r => r.id === currentlyViewedRecipeId);
        if (recipe) {
            document.getElementById('meal-plan-recipe-id').value = recipe.id;
            document.getElementById('meal-plan-portions').value = recipe.portions || 2;
            mealPlanModal.classList.remove('hidden');
        }
    });

    // =================================================================
    // 7. MADPLAN & INDKØBSLISTE
    // =================================================================
    mealPlanForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const recipeId = document.getElementById('meal-plan-recipe-id').value;
        const day = document.getElementById('meal-plan-day').value;
        const portions = Number(document.getElementById('meal-plan-portions').value);

        const weekNumber = getWeekNumber(new Date());
        const year = new Date().getFullYear();
        const mealPlanDocId = `week_${weekNumber}_${year}`;
        const mealPlanRef = doc(db, 'meal_plans', mealPlanDocId);

        try {
            await setDoc(mealPlanRef, {
                [day]: { recipeId, portions }
            }, { merge: true });
            mealPlanModal.classList.add('hidden');
            recipeReadModal.classList.add('hidden');
            alert("Opskriften er føjet til madplanen!");
        } catch (error) {
            console.error("Fejl ved opdatering af madplan:", error);
            alert("Der skete en fejl.");
        }
    });

    generateWeeklyShoppingListBtn.addEventListener('click', () => {
        const allIngredientsNeeded = [];
        for (const day in currentMealPlan) {
            const meal = currentMealPlan[day];
            if (meal && meal.recipeId) {
                const recipe = currentRecipes.find(r => r.id === meal.recipeId);
                if (recipe) {
                    const scaleFactor = (recipe.portions && meal.portions) ? meal.portions / recipe.portions : 1;
                    recipe.ingredients.forEach(ing => {
                        allIngredientsNeeded.push({
                            ...ing,
                            quantity: (ing.quantity || 0) * scaleFactor
                        });
                    });
                }
            }
        }
        
        addToShoppingList(allIngredientsNeeded, "ugens madplan");
    });

    function addToShoppingListFromRecipe(recipeId) {
        const recipe = currentRecipes.find(r => r.id === recipeId);
        if (!recipe) return;
        addToShoppingList(recipe.ingredients, `"${recipe.title}"`);
    }
    
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
                        unit: ing.unit,
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
        alert(`Varer fra ${sourceText} er tilføjet til indkøbslisten.`);
        navigateTo('#shopping-list');
    }

    confirmPurchaseBtn.addEventListener('click', async () => {
        if (Object.keys(currentShoppingList).length === 0) return;
        if (!confirm("Er du sikker på, at du vil tilføje alle varer på listen til dit varelager?")) return;

        const batch = writeBatch(db);
        
        Object.values(currentShoppingList).forEach(item => {
            const inventoryItem = currentInventoryItems.find(inv => inv.name.toLowerCase() === item.name.toLowerCase());
            if (inventoryItem) {
                const itemRef = doc(db, "inventory_items", inventoryItem.id);
                const newStock = (inventoryItem.current_stock || 0) + item.quantity_to_buy;
                batch.update(itemRef, { current_stock: newStock });
            }
        });

        try {
            await batch.commit();
            currentShoppingList = {};
            renderShoppingList();
            alert("Varelager opdateret!");
        } catch (error) {
            console.error("Fejl ved bekræftelse af indkøb:", error);
            alert("Der skete en fejl under opdatering af varelager.");
        }
    });

    shoppingListContainer.addEventListener('click', (e) => {
        const newItemBtn = e.target.closest('.new-item-indicator');
        if (newItemBtn) {
            const itemName = newItemBtn.dataset.itemName;
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

    function getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
        return weekNo;
    }
});
