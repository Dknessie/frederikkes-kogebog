// =================================================================
// START PÅ app.js - Sørg for at alt indhold er inden for denne fil.
// =================================================================

// 0. FIREBASE INITIALISERING & IMPORTS
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
    query,
    where
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Firebase-konfiguration til applikationen
const firebaseConfig = {
  apiKey: "AIzaSyDUuGEqZ53r5PWMwg1_hj7Jpu7DubK-Lo8",
  authDomain: "frederikkes-kogebog.firebaseapp.com",
  projectId: "frederikkes-kogebog",
  storageBucket: "frederikkes-kogebog.appspot.com",
  messagingSenderId: "557087234453",
  appId: "1:557087234453:web:9abec4eb124bc08583be9c"
};

// Initialiser Firebase og services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOM er fuldt indlæst. Initialiserer app...");

    // --- Elementer ---
    const loginPage = document.getElementById('login-page');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const loginButton = loginForm.querySelector('button[type="submit"]');
    const logoutButtons = [document.getElementById('logout-btn-header'), document.getElementById('logout-btn-profile')];
    
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('#app-main-content .page');

    // --- State ---
    let currentUser = null;
    let inventoryUnsubscribe = null;
    let recipesUnsubscribe = null;

    if (!loginForm) {
        console.error("KRITISK FEJL: Kunne ikke finde login-formularen (#login-form).");
        return;
    }

    // =================================================================
    // 1. AUTHENTICATION LOGIK
    // =================================================================

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            console.log("DEBUG: onAuthStateChanged - BRUGER FUNDET. Viser app-container.");
            document.getElementById('profile-email').textContent = user.email;
            loginPage.classList.remove('active');
            loginPage.classList.add('hidden');
            appContainer.classList.remove('hidden');
            setupRealtimeListeners();
            navigateTo(window.location.hash || '#dashboard');
        } else {
            currentUser = null;
            console.log("DEBUG: onAuthStateChanged - INGEN BRUGER. Viser login-side.");
            appContainer.classList.add('hidden');
            loginPage.classList.remove('hidden');
            loginPage.classList.add('active');
            if (inventoryUnsubscribe) inventoryUnsubscribe();
            if (recipesUnsubscribe) recipesUnsubscribe();
        }
    });

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        console.log("DEBUG: Login-formular afsendt. Forsøger at logge ind...");
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const originalButtonHTML = loginButton.innerHTML;

        loginButton.disabled = true;
        loginButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Logger ind...`;
        loginError.textContent = '';

        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                console.log("DEBUG: signInWithEmailAndPassword - SUCCES.");
                // onAuthStateChanged håndterer resten
            })
            .catch((error) => {
                console.error("DEBUG: signInWithEmailAndPassword - FEJL:", error.code);
                loginError.textContent = 'Login fejlede. Tjek at email og adgangskode er korrekte.';
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
    // 2. NAVIGATION
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

    // =================================================================
    // 3. FIRESTORE REAL-TIME LISTENERS
    // =================================================================

    function setupRealtimeListeners() {
        if (inventoryUnsubscribe) inventoryUnsubscribe();
        if (recipesUnsubscribe) recipesUnsubscribe();

        const inventoryRef = collection(db, 'inventory_items');
        inventoryUnsubscribe = onSnapshot(inventoryRef, (snapshot) => {
            const inventoryItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderInventory(inventoryItems);
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

    const inventoryTableBody = document.querySelector('.inventory-table tbody');
    function renderInventory(items) {
        inventoryTableBody.innerHTML = '';
        if (items.length === 0) {
             inventoryTableBody.innerHTML = `<tr><td colspan="5">Dit varelager er tomt. Tilføj en vare for at starte.</td></tr>`;
             return;
        }
        items.forEach(item => {
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
    // 5. CRUD-HANDLINGER
    // =================================================================

    inventoryTableBody.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const row = target.closest('tr');
        const docId = row.dataset.id;
        const itemRef = doc(db, 'inventory_items', docId);

        if (target.classList.contains('delete-item')) {
            try {
                await deleteDoc(itemRef);
            } catch (error) {
                console.error("FEJL ved sletning af vare:", error);
            }
        }

        if (target.classList.contains('edit-item')) {
            const currentStock = prompt("Indtast ny beholdning:");
            if (currentStock !== null && !isNaN(currentStock)) {
                try {
                    await updateDoc(itemRef, { current_stock: Number(currentStock) });
                } catch (error) {
                    console.error("FEJL ved opdatering af vare:", error);
                }
            }
        }
    });

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
