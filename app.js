```javascript
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
    console.log("DEBUG: DOM er fuldt indlæst. Initialiserer app...");

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

    // --- State ---
    let currentUser = null;
    let inventoryUnsubscribe = null;
    let recipesUnsubscribe = null;
    let currentInventoryItems = []; // Gem en lokal kopi af varerne

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
            document.getElementById('dashboard-page').classList.remove('hidden');
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

    // Luk modaler
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
            const recipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderRecipes(recipes);
            document.getElementById('profile-recipe-count').textContent = recipes.length;
            const favoriteCount = recipes.filter(r => r.is_favorite).length;
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

    const recipeGrid = document.querySelector('.recipe-grid');
    function renderRecipes(recipes) {
        recipeGrid.innerHTML = '';
        if (recipes.length === 0) {
            recipeGrid.innerHTML = `<p>Du har ingen opskrifter endnu. Tilføj en for at starte.</p>`;
            return;
        }
        recipes.forEach(recipe => {
            const card = document.createElement('div');
            card.className = 'recipe-card';
            card.dataset.id = recipe.id;
            const isFavoriteClass = recipe.is_favorite ? 'fas is-favorite' : 'far';
            card.innerHTML = `<h4>${recipe.title}</h4><p>${recipe.description || 'Klik for at se detaljer.'}</p><div class="recipe-card-actions"><i class="${isFavoriteClass} fa-heart favorite-icon"></i></div>`;
            recipeGrid.appendChild(card);
        });
    }

    // =================================================================
    // 5. CRUD-HANDLINGER FOR VARELAGER
    // =================================================================

    // Åbn modal for at tilføje en ny vare
    addInventoryItemBtn.addEventListener('click', () => {
        inventoryModalTitle.textContent = 'Tilføj ny vare';
        inventoryItemForm.reset();
        document.getElementById('inventory-item-id').value = '';
        inventoryItemModal.classList.remove('hidden');
    });

    // Gem eller opdater en vare
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
        };

        try {
            if (itemId) {
                // Opdater eksisterende vare
                const itemRef = doc(db, 'inventory_items', itemId);
                await updateDoc(itemRef, itemData);
                console.log("Vare opdateret:", itemId);
            } else {
                // Tilføj ny vare
                await addDoc(collection(db, 'inventory_items'), itemData);
                console.log("Ny vare tilføjet");
            }
            inventoryItemModal.classList.add('hidden');
        } catch (error) {
            console.error("Fejl ved lagring af vare:", error);
            alert("Der skete en fejl. Varen blev ikke gemt.");
        }
    });

    // Håndter klik på rediger- og slet-knapper i varetabellen
    inventoryTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        const row = target.closest('tr');
        const docId = row.dataset.id;
        
        // Slet vare
        if (target.classList.contains('delete-item')) {
            if (confirm('Er du sikker på, at du vil slette denne vare?')) {
                try {
                    await deleteDoc(doc(db, 'inventory_items', docId));
                } catch (error) {
                    console.error("FEJL ved sletning af vare:", error);
                }
            }
        }

        // Rediger vare
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
                inventoryItemModal.classList.remove('hidden');
            }
        }
    });

    // =================================================================
    // 6. CRUD-HANDLINGER FOR OPSKRIFTER (Pladsholder)
    // =================================================================
    
    recipeGrid.addEventListener('click', async (e) => {
        const favoriteIcon = e.target.closest('.favorite-icon');
        const card = e.target.closest('.recipe-card');
        if (!card) return;
        const docId = card.dataset.id;
        const recipeRef = doc(db, 'recipes', docId);

        if (favoriteIcon) {
            const isCurrentlyFavorite = favoriteIcon.classList.contains('is-favorite');
            try {
                await updateDoc(recipeRef, { is_favorite: !isCurrentlyFavorite });
            } catch (error) {
                console.error("FEJL ved opdatering af favorit:", error);
            }
            return;
        }
        console.log("DEBUG: Åbn detaljer for opskrift:", docId);
    });
});
