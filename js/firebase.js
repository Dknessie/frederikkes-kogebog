// js/firebase.js

// This module initializes Firebase and exports the necessary services.
// This centralizes the Firebase setup.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// WARNING: It is strongly recommended to use environment variables or a secure key management system
// instead of hardcoding your Firebase configuration in a client-side script.
// Consider using Firebase Hosting's reserved URLs to load this configuration securely.
const firebaseConfig = {
  apiKey: "AIzaSyAs8XVRkru11e8MpZLJrzB-iXKg3SGjHnw",
  authDomain: "frederikkes-kogebog.firebaseapp.com",
  projectId: "frederikkes-kogebog",
  storageBucket: "frederikkes-kogebog.firebasestorage.app",
  messagingSenderId: "557087234453",
  appId: "1:557087234453:web:9abec4eb124bc08583be9c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Export the initialized services for other modules to use
export { app, auth, db };
