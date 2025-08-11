// js/firebase.js

// Importer de nødvendige funktioner fra Firebase SDK'erne
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Din webapps Firebase-konfiguration
// Sørg for at dine faktiske konfigurationsværdier er her
const firebaseConfig = {
  apiKey: "AIzaSyAs8XVRkru11e8MpZLJrzB-iXKg3SGjHnw",
  authDomain: "frederikkes-kogebog.firebaseapp.com",
  projectId: "frederikkes-kogebog",
  storageBucket: "frederikkes-kogebog.firebasestorage.app",
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
 * Dette samler flere databasekald i én funktion for at forenkle initialiseringen i app.js.
 * @param {string} userId - ID'et på den bruger, der er logget ind.
 * @returns {Promise<object>} Et objekt, der indeholder alle de hentede data (opskrifter, varelager osv.).
 */
export async function getAllData(userId) {
    const data = {
        recipes: [],
        inventory: [],
        shoppingList: [],
        mealPlan: [],
        projects: []
    };

    try {
        // Definer de collections, vi vil hente
        const collectionsToFetch = [
            'recipes',
            'inventory', // Bemærk: Dette skal muligvis justeres ift. din datamodel (f.eks. inventory_items)
            'shoppingList', // Bemærk: Dette er måske et enkelt dokument, ikke en collection
            'mealPlan', // Bemærk: Dette er måske et enkelt dokument, ikke en collection
            'projects'
        ];

        // Opret en liste af promises for hvert databasekald
        const promises = collectionsToFetch.map(async (collectionName) => {
            const q = query(collection(db, collectionName), where("userId", "==", userId));
            const querySnapshot = await getDocs(q);
            return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });

        // Kør alle databasekald parallelt
        const results = await Promise.all(promises);

        // Tildel resultaterne til vores data-objekt
        data.recipes = results[0];
        data.inventory = results[1];
        data.shoppingList = results[2];
        data.mealPlan = results[3];
        data.projects = results[4];

        console.log('Alle data hentet fra Firestore:', data);
        return data;

    } catch (error) {
        console.error("Fejl under hentning af alle data i getAllData:", error);
        // Returner det tomme data-objekt, så appen ikke crasher
        return data;
    }
}
