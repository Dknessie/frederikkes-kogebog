// js/firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
// Fjernet import af 'handleError' for at bryde cirkulær afhængighed.

// Korrekt Firebase-konfiguration fra din originale fil.
const firebaseConfig = {
    apiKey: "AIzaSyAs8XVRkru11e8MpZLJrzB-iXKg3SGjHnw",
    authDomain: "frederikkes-kogebog.firebaseapp.com",
    projectId: "frederikkes-kogebog",
    storageBucket: "frederikkes-kogebog.appspot.com",
    messagingSenderId: "557087234453",
    appId: "1:557087234453:web:9abec4eb124bc08583be9c"
};

// Initialiser Firebase og eksporter de nødvendige services med det samme.
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * Opsætter realtids-listeners for alle nødvendige data.
 * @param {string} userId - Brugerens ID.
 * @param {object} state - Appens centrale state-objekt, der skal opdateres.
 * @param {function} onInitialDataLoaded - Callback der køres, når de første data er hentet.
 */
export function setupRealtimeListeners(userId, state, onInitialDataLoaded) {
    const listeners = [];
    let initialLoadsPending = 0;

    const checkInitialLoad = () => {
        initialLoadsPending--;
        if (initialLoadsPending === 0) {
            console.log("Alle indledende data er hentet via onSnapshot.");
            onInitialDataLoaded();
        }
    };

    // Collections der følger standard 'userId' felt struktur
    const collectionsToListen = {
        'recipes': 'recipes',
        'projects': 'projects',
        'inventory_items': 'inventoryItems',
        'inventory_batches': 'inventoryBatches'
    };
    
    initialLoadsPending = Object.keys(collectionsToListen).length + 2; // +2 for mealPlan og shoppingList

    for (const [collectionName, stateKey] of Object.entries(collectionsToListen)) {
        const q = query(collection(db, collectionName), where("userId", "==", userId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            state[stateKey] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (stateKey === 'inventoryItems' || stateKey === 'inventoryBatches') {
                // Kombiner data for at skabe det samlede inventory
                state.inventory = (state.inventoryItems || []).map(item => ({
                    ...item,
                    batches: (state.inventoryBatches || []).filter(batch => batch.itemId === item.id)
                }));
            }
        }, err => {
            // Log fejlen direkte i stedet for at bruge en ekstern UI-funktion.
            console.error(`Fejl ved hentning af ${collectionName}:`, err);
        });
        
        // Sørg for at tælle ned, første gang data modtages
        const firstTimeListener = onSnapshot(q, () => {
             checkInitialLoad();
             firstTimeListener(); // Frakobl denne engangs-listener
        });
        
        listeners.push(unsubscribe);
    }

    // Listener for mealPlan (enkelt dokument)
    const mealPlanRef = doc(db, 'meal_plans', userId);
    const unsubMealPlan = onSnapshot(mealPlanRef, (doc) => {
        state.mealPlan = doc.exists() ? doc.data() : {};
    }, err => {
        console.error("Fejl ved hentning af madplan:", err);
    });
    const firstTimeMealPlan = onSnapshot(mealPlanRef, () => { checkInitialLoad(); firstTimeMealPlan(); });
    listeners.push(unsubMealPlan);

    // Listener for shoppingList (enkelt dokument)
    const shoppingListRef = doc(db, 'shopping_lists', userId);
    const unsubShoppingList = onSnapshot(shoppingListRef, (doc) => {
        state.shoppingList = doc.exists() ? doc.data() : {};
    }, err => {
        console.error("Fejl ved hentning af indkøbsliste:", err);
    });
    const firstTimeShoppingList = onSnapshot(shoppingListRef, () => { checkInitialLoad(); firstTimeShoppingList(); });
    listeners.push(unsubShoppingList);

    return () => {
        console.log("Frakobler alle Firestore listeners.");
        listeners.forEach(unsub => unsub());
    };
}
