// Importer nødvendige funktioner fra Firebase SDK'et
import { 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    signOut 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { 
    collection, 
    onSnapshot,
    addDoc,
    doc,
    updateDoc,
    deleteDoc,
    query,
    where
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

console.log("DEBUG: app.js script er startet.");

document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOM er fuldt indlæst. Initialiserer app...");

    // Firebase services (initialiseret i index.html)
    const auth = window.auth;
    const db = window.db;

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

    // Kritisk tjek: Findes login-formularen?
    if (!loginForm) {
        console.error("KRITISK FEJL: Kunne ikke finde login-formularen (#login-form). Scriptet kan ikke fortsætte.");
        return;
    }

    // =================================================================
    // 1. AUTHENTICATION LOGIK
    // =================================================================

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            console.log("DEBUG: Bruger er logget ind:", user.uid);
            loginPage.classList.remove('active');
            loginPage.classList.add('hidden');
            appContainer.classList.remove('hidden');
            setupRealtimeListeners();
            navigateTo(window.location.hash || '#dashboard');
        } else {
            currentUser = null;
            console.log("DEBUG: Bruger er logget ud eller ikke logget ind.");
            appContainer.classList.add('hidden');
            loginPage.classList.remove('hidden');
            loginPage.classList.add('active');
            if (inventoryUnsubscribe) inventoryUnsubscribe();
            if (recipesUnsubscribe) recipesUnsubscribe();
        }
    });

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        console.log("DEBUG: Login-knap klikket! Forsøger at logge ind...");
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const originalButtonHTML = loginButton.innerHTML;

        console.log(`DEBUG: Forsøger login med Email: ${email}`);

        loginButton.disabled = true;
        loginButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Logger ind...`;
        loginError.textContent = '';

        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                console.log("DEBUG: Firebase login succesfuldt.");
                // onAuthStateChanged håndterer resten
            })
            .catch((error) => {
                console.error("DEBUG: Firebase login FEJLEDE:", error.code, error.message);
                loginError.textContent = 'Forkert email eller adgangskode. Prøv igen.';
            })
            .finally(() => {
                loginButton.disabled = false;
                loginButton.innerHTML = originalButtonHTML;
            });
    });

    logoutButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            console.log("DEBUG: Logout-knap klikket.");
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
            const stockPercentage = item.max_stock ? (item.current_stock / item.max_stock) * 100 : 100;
            let stockColor = '#4CAF50';
            if (stockPercentage < 50) stockColor = '#FFC107';
            if (stockPercentage < 20) stockColor = '#F44336';
            tr.innerHTML = `<td>${item.name}</td><td><div class="stock-bar"><div class="stock-level" style="width: ${stockPercentage}%; background-color: ${stockColor};"></div></div><span>${item.current_stock} ${item.unit}</span></td><td>${item.category}</td><td>${item.home_location}</td><td><button class="btn-icon edit-item"><i class="fas fa-edit"></i></button> <button class="btn-icon delete-item"><i class="fas fa-trash"></i></button></td>`;
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
            console.log(`DEBUG: Forsøger at slette vare ${docId}. Afventer bekræftelse...`);
            // Erstatter confirm() med en log-besked. Handlingen udføres direkte.
            try {
                await deleteDoc(itemRef);
                console.log("SUCCESS: Vare slettet:", docId);
            } catch (error) {
                console.error("FEJL ved sletning af vare:", error);
            }
        }

        if (target.classList.contains('edit-item')) {
            const currentStock = row.querySelector('span').textContent.split(' ')[0];
            const newStock = prompt("Indtast ny beholdning:", currentStock);
            if (newStock !== null && !isNaN(newStock)) {
                try {
                    await updateDoc(itemRef, { current_stock: Number(newStock) });
                    console.log("SUCCESS: Vare opdateret:", docId);
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
```

### Sådan Fejlsøger Vi Sammen

Nu skal vi bruge browserens "Udviklerværktøjer" til at se, hvad der sker.

1.  **Åbn Udviklerværktøjer:**
    * Højreklik et sted på login-siden og vælg **"Undersøg"** (eller "Inspect").
    * Find og klik på fanen, der hedder **"Konsol"** (eller "Console").

2.  **Genindlæs Siden:**
    * Tryk `Ctrl + R` (eller `Cmd + R` på Mac) for at genindlæse siden. Hold gerne `Shift`-tasten nede, mens du gør det, for at sikre at du får den nyeste version af filerne (`Shift + Ctrl + R`).

3.  **Analyser Konsollen:**
    * Du burde nu se de første par "DEBUG"-beskeder i konsollen, f.eks. `app.js script er startet.` og `DOM er fuldt indlæst.`. Hvis du ikke ser dem, bliver `app.js` slet ikke kørt.

4.  **Test Login-knappen:**
    * Klik på "Log ind"-knappen.
    * Kig nu i konsollen. Du **skal** se beskeden: `DEBUG: Login-knap klikket! Forsøger at logge ind...`.

**Fortæl mig, hvad du ser i konsollen:**

* **Scenarie A:** Du ser `Login-knap klikket!` efterfulgt af en fejlmeddelelse (en rød linje). Kopier og indsæt gerne fejlen her. Det er sandsynligvis et problem med din `firebaseConfig`.
* **Scenarie B:** Du ser `Login-knap klikket!`, men der sker ikke mere. Det kan tyde på et netværksproblem eller en fejl i Firebase-reglerne.
* **Scenarie C:** Du ser **slet ikke** `Login-knap klikket!`. Det betyder, at scriptet af en eller anden grund ikke har registreret klikket. Det er det mest kritiske problem, som vi så skal dykke ned i.

Med denne information kan vi helt sikkert finde og løse problem