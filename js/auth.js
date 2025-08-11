// js/auth.js

import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth } from './firebase.js';
import { handleError } from './utils.js';

/**
 * Opsætter event listener for login-formularen.
 * Når formularen submittes, forsøger den at logge brugeren ind med Firebase.
 * Fejl (f.eks. forkert kodeord) bliver håndteret og vist for brugeren.
 */
export function setupLogin() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) {
        console.error("Login-formular blev ikke fundet.");
        return;
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.email.value;
        const password = loginForm.password.value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Login er succesfuldt. 'onAuthStateChanged' i app.js vil nu tage over.
            console.log("Login-forsøg succesfuldt. Venter på onAuthStateChanged.");
        } catch (error) {
            console.error("Login fejl:", error.code);
            handleError(error, "Login fejlede. Tjek venligst din email og kodeord.");
        }
    });
}

/**
 * Opsætter event listener for logud-knappen.
 */
export function setupLogout() {
    const logoutBtn = document.getElementById('logout-btn-header');
    if (!logoutBtn) {
        console.error("Logud-knap blev ikke fundet.");
        return;
    }
    
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
            // Logud er succesfuldt. 'onAuthStateChanged' i app.js vil nu tage over.
            console.log("Bruger logget ud.");
            // Nulstil siden for at sikre, at alt er ryddet.
            window.location.hash = '';
            window.location.reload();
        } catch (error) {
            handleError(error, "Kunne ikke logge ud.");
        }
    });
}
