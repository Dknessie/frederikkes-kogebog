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
    getDoc
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

    // --- Vare Modal Elementer ---
    const inventoryItemModal = document.getElementById('inventory-item-modal');
    const inventoryItemForm = document.getElementById('inventory-item-form');
    const addInventoryItemBtn = document.getElementById('add-inventory-item-btn');
    const inventoryModalTitle = document.getElementById('inventory-modal-title');
    const inventoryTableBody = document.querySelector('.inventory-table tbody');
    const itemNameInput = document.getElementById('item-name');
    const itemCategoryInput = document.getElementById('item-category');
    const itemStoreSectionSelect = document.getElementById('item-store-section');

    // --- Opskrift Modal Elementer ---
    const recipeModal = document.getElementById('recipe-modal');
    const recipeForm = document.getElementById('recipe-form');
    const addRecipeBtn = document.getElementById('add-recipe-btn');
    const recipeModalTitle = document.getElementById('recipe-modal-title');
    const recipeGrid = document.querySelector('.recipe-grid');
    const ingredientsContainer = document.getElementById('ingredients-container');
    const addIngredientBtn = document.getElementById('add-ingredient-btn');
    const importIngredientsBtn = document.getElementById('import-ingredients-btn');
    const recipeImportTextarea = document.getElementById('recipe-import-textarea');
    const recipeImagePreview = document.getElementById('recipe-image-preview');
    const generateImageBtn = document.getElementById('generate-image-btn');

    // --- Indkøbsliste Elementer ---
    const shoppingListContainer = document.getElementById('shopping-list-container');

    // --- State ---
    let currentUser = null;
    let inventoryUnsubscribe = null;
    let recipesUnsubscribe = null;
    let currentInventoryItems = [];
    let currentRecipes = [];
    let currentImageUrl = '';

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

        const inventoryRef = collection(db, 'inventory_items');
        inventoryUnsubscribe = onSnapshot(inventoryRef, (snapshot) => {
            currentInventoryItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderInventory(currentInventoryItems);
        }, error => console.error("Fejl i varelager-listener:", error));

        const recipesRef = collection(db, 'recipes');
        recipesUnsubscribe = onSnapshot(recipesRef, (snapshot) => {
            currentRecipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderRecipes(currentRecipes);
            document.getElementById('profile-recipe-count').textContent = currentRecipes.length;
            const favoriteCount = currentRecipes.filter(r => r.is_favorite).length;
            document.getElementById('profile-favorite-count').textContent = favoriteCount;
        }, error => console.error("Fejl i opskrift-listener:", error));
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

    function renderRecipes(recipes) {
        recipeGrid.innerHTML = '';
        if (recipes.length === 0) {
            recipeGrid.innerHTML = `<p>Du har ingen opskrifter endnu. Tilføj en for at starte.</p>`;
            return;
        }
        recipes.sort((a,b) => a.title.localeCompare(b.title)).forEach(recipe => {
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
                    <button class="btn-icon generate-shopping-list-btn" title="Generer indkøbsliste"><i class="fas fa-cart-plus"></i></button>
                    <i class="${isFavoriteClass} fa-heart favorite-icon" title="Marker som favorit"></i>
                </div>`;
            recipeGrid.appendChild(card);
        });
    }

    function renderShoppingList(itemsToBuy) {
        shoppingListContainer.innerHTML = '';
        if (Object.keys(itemsToBuy).length === 0) {
            shoppingListContainer.innerHTML = `<p>Din indkøbsliste er tom, eller også har du alle varer på lager.</p>`;
            return;
        }

        for (const section in itemsToBuy) {
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'store-section';
            
            let listItems = '';
            itemsToBuy[section].forEach(item => {
                listItems += `<li><input type="checkbox" id="shop-${item.name}"><label for="shop-${item.name}">${item.quantity_to_buy} ${item.unit} ${item.name}</label></li>`;
            });

            sectionDiv.innerHTML = `<h3>${section}</h3><ul>${listItems}</ul>`;
            shoppingListContainer.appendChild(sectionDiv);
        }
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
        recipeModalTitle.textContent = 'Tilføj ny opskrift';
        recipeForm.reset();
        document.getElementById('recipe-id').value = '';
        ingredientsContainer.innerHTML = '';
        currentImageUrl = '';
        recipeImagePreview.src = 'https://placehold.co/600x400/f3f0e9/d1603d?text=Vælg+billede';
        addIngredientRow();
        recipeModal.classList.remove('hidden');
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
        if (!potentialName) potentialName = potentialUnit; // If only one word, it's the name
        
        const inventoryItem = currentInventoryItems.find(item => potentialName.includes(item.name.toLowerCase()));

        if (inventoryItem && inventoryItem.conversion_from_unit === potentialUnit) {
            unit = inventoryItem.conversion_to_unit;
            quantity = (quantity || 1) * inventoryItem.conversion_to_quantity;
            name = inventoryItem.name; // Use the official name from inventory
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

    generateImageBtn.addEventListener('click', () => {
        const title = document.getElementById('recipe-title').value;
        if (!title) {
            alert("Indtast venligst en titel for at generere et billede.");
            return;
        }
        currentImageUrl = `https://placehold.co/600x400/d1603d/FFFFFF?text=AI+Billede+af%0A${encodeURIComponent(title)}`;
        recipeImagePreview.src = currentImageUrl;
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
            notes: document.getElementById('recipe-notes').value,
            instructions: document.getElementById('recipe-instructions').value,
            source_url: document.getElementById('recipe-source-url').value,
            ingredients: ingredients,
            imageUrl: currentImageUrl,
            is_favorite: currentRecipes.find(r => r.id === recipeId)?.is_favorite || false
        };

        try {
            if (recipeId) {
                await updateDoc(doc(db, 'recipes', recipeId), recipeData);
            } else {
                await addDoc(collection(db, 'recipes'), recipeData);
            }
            recipeModal.classList.add('hidden');
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

        if (e.target.closest('.generate-shopping-list-btn')) {
            generateShoppingListFromRecipe(docId);
            return;
        }

        const recipe = currentRecipes.find(r => r.id === docId);
        if (recipe) {
            recipeModalTitle.textContent = 'Rediger opskrift';
            document.getElementById('recipe-id').value = recipe.id;
            document.getElementById('recipe-title').value = recipe.title || '';
            document.getElementById('recipe-category').value = recipe.category || '';
            document.getElementById('recipe-tags').value = (recipe.tags && recipe.tags.join(', ')) || '';
            document.getElementById('recipe-notes').value = recipe.notes || '';
            document.getElementById('recipe-instructions').value = recipe.instructions || '';
            document.getElementById('recipe-source-url').value = recipe.source_url || '';
            
            currentImageUrl = recipe.imageUrl || '';
            recipeImagePreview.src = recipe.imageUrl || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Vælg+billede';

            ingredientsContainer.innerHTML = '';
            recipeImportTextarea.value = '';
            if (recipe.ingredients && recipe.ingredients.length > 0) {
                recipe.ingredients.forEach(ing => addIngredientRow(ing));
            } else {
                addIngredientRow();
            }
            recipeModal.classList.remove('hidden');
        }
    });

    // =================================================================
    // 7. INDKØBSLISTE
    // =================================================================
    function generateShoppingListFromRecipe(recipeId) {
        const recipe = currentRecipes.find(r => r.id === recipeId);
        if (!recipe) return;

        const itemsToBuy = {};

        recipe.ingredients.forEach(ing => {
            const inventoryItem = currentInventoryItems.find(item => item.name.toLowerCase() === ing.name.toLowerCase());
            const needed = ing.quantity || 0;
            const inStock = inventoryItem ? inventoryItem.current_stock : 0;
            
            if (inStock < needed) {
                const toBuy = needed - inStock;
                const section = (inventoryItem && inventoryItem.store_section) ? inventoryItem.store_section : 'Andet';
                
                if (!itemsToBuy[section]) {
                    itemsToBuy[section] = [];
                }
                itemsToBuy[section].push({ name: ing.name, quantity_to_buy: toBuy, unit: ing.unit });
            }
        });
        
        renderShoppingList(itemsToBuy);
        alert(`Indkøbsliste genereret for "${recipe.title}". Gå til fanen "Indkøbsliste" for at se den.`);
        navigateTo('#shopping-list');
    }
});
