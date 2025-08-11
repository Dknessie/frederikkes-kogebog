// js/firebase.js

// Importer de nødvendige funktioner fra Firebase SDK'erne
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, getDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Din webapps Firebase-konfiguration
const firebaseConfig = {
  apiKey: "AIzaSyAs8XVRkru11e8MpZLJrzB-iXKg3SGjHnw",
  authDomain: "frederikkes-kogebog.firebaseapp.com",
  projectId: "frederikkes-kogebog",
  storageBucket: "frederikkes-kogebog.appspot.com",
  messagingSenderId: "557087234453",
  appId: "1:557087234453:web:9abec4eb124bc08583be9c"
};

// Initialiser Firebase
const app = initializeApp(firebaseConfig);

// Eksporter Firebase-tjenester, så de kan bruges i andre moduler
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * Henter alle nødvendige startdata for en given bruger fra Firestore.
 * @param {string} userId - ID'et på den bruger, der er logget ind.
 * @returns {Promise<object>} Et objekt, der indeholder alle de hentede data.
 */
export async function getAllData(userId) {
    const data = {
        recipes: [],
        inventory: [],
        shoppingList: {}, // Ændret til objekt
        mealPlan: {},     // Ændret til objekt
        projects: []
    };

    try {
        // --- Hent collections hvor dokumenter har et 'userId' felt ---
        const collectionsToFetch = ['recipes', 'projects', 'inventory_items', 'inventory_batches'];
        const collectionPromises = collectionsToFetch.map(async (collectionName) => {
            const q = query(collection(db, collectionName), where("userId", "==", userId));
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
        
        // --- Hent enkelte dokumenter hvor dokument-ID er userId ---
        const mealPlanDocRef = doc(db, 'meal_plans', userId);
        const shoppingListDocRef = doc(db, 'shopping_lists', userId);

        const docPromises = [
            getDoc(mealPlanDocRef),
            getDoc(shoppingListDocRef)
        ];

        // Kør alle databasekald parallelt
        const [collectionResults, docResults] = await Promise.all([
            Promise.all(collectionPromises),
            Promise.all(docPromises)
        ]);

        // Tildel resultater fra collections
        data.recipes = collectionResults[0];
        data.projects = collectionResults[1];
        
        // Kombiner inventory_items og inventory_batches til et samlet inventory
        const inventoryItems = collectionResults[2];
        const inventoryBatches = collectionResults[3];
        data.inventory = inventoryItems.map(item => ({
            ...item,
            batches: inventoryBatches.filter(batch => batch.itemId === item.id)
        }));

        // Tildel resultater fra enkelte dokumenter
        if (docResults[0].exists()) {
            data.mealPlan = docResults[0].data();
        }
        if (docResults[1].exists()) {
            data.shoppingList = docResults[1].data();
        }

        console.log('Alle data hentet korrekt fra Firestore:', data);
        return data;

    } catch (error) {
        console.error("Fejl under hentning af alle data i getAllData:", error);
        // Vis en mere specifik fejl, hvis det er et tilladelsesproblem
        if (error.code === 'permission-denied') {
            console.error("Dette skyldes sandsynligvis en fejl i Firestore sikkerhedsreglerne. Dobbelttjek dine regler i Firebase-konsollen.");
        }
        return data; // Returner tomt data-objekt for at undgå at appen crasher
    }
}
