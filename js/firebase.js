// js/firebase.js

// Importer funktioner fra den SAMME version som resten af din app.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Din Firebase konfiguration.
const firebaseConfig = {
    apiKey: "AIzaSyAs8XVRkru11e8MpZLJrzB-iXKg3SGjHnw",
    authDomain: "frederikkes-kogebog.firebaseapp.com",
    projectId: "frederikkes-kogebog",
    storageBucket: "frederikkes-kogebog.appspot.com",
    messagingSenderId: "557087234453",
    appId: "1:557087234453:web:9abec4eb124bc08583be9c"
};

// Initialisér Firebase én gang.
const app = initializeApp(firebaseConfig);

// Opret og eksporter de nødvendige services, så de kan importeres i andre filer.
export const db = getFirestore(app);
export const auth = getAuth(app);

// ALT logik vedrørende listeners (som setupRealtimeListeners) er fjernet herfra.
// Den logik hører korrekt hjemme i app.js, som du allerede har gjort.
