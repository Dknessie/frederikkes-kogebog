// js/auth.js

import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth } from './firebase.js';
import { handleError } from './utils.js';

/**
 * Opsætter event listener for login-formularen.
 */
export function setupLogin() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.email.value;
        const password = loginForm.password.value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // onAuthStateChanged i app.js tager over herfra.
        } catch (error) {
            handleError(error, "Login fejlede. Tjek venligst din email og kodeord.");
        }
    });
}

/**
 * Opsætter event listener for logud-knappen.
 * @param {function} unsubscribeAll - En funktion der stopper alle Firestore listeners.
 */
export function setupLogout(unsubscribeAll) {
    const logoutBtn = document.getElementById('logout-btn-header');
    if (!logoutBtn) return;
    
    // Sørg for at fjerne gamle listeners for at undgå dobbelt-logud
    const newBtn = logoutBtn.cloneNode(true);
    logoutBtn.parentNode.replaceChild(newBtn, logoutBtn);

    newBtn.addEventListener('click', async () => {
        try {
            // Frakobl Firestore listeners FØR logud for at undgå fejl
            if (typeof unsubscribeAll === 'function') {
                unsubscribeAll();
            }
            await signOut(auth);
            // onAuthStateChanged i app.js tager over og genindlæser siden.
            window.location.hash = '';
            window.location.reload();
        } catch (error) {
            handleError(error, "Kunne ikke logge ud.");
        }
    });
}
