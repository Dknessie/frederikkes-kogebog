// js/auth.js

// This module handles all authentication logic.

import { 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from './firebase.js';
import { handleError } from './ui.js';

/**
 * Initializes authentication and listens for state changes.
 * @param {Function} onLogin - Callback function to execute on user login.
 * @param {Function} onLogout - Callback function to execute on user logout.
 */
export function initAuth(onLogin, onLogout) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            onLogin(user);
        } else {
            onLogout();
        }
    });
}

/**
 * Sets up the login form and logout button event listeners.
 * @param {object} elements - The cached DOM elements from app.js.
 */
export function setupAuthEventListeners(elements) {
    if (elements.loginForm) {
        elements.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const loginError = elements.loginForm.querySelector('#login-error');
            
            signInWithEmailAndPassword(auth, email, password)
                .catch((error) => {
                    console.error("Login Fejl:", error.code);
                    if (loginError) {
                        loginError.textContent = 'Login fejlede. Tjek email og adgangskode.';
                    }
                });
        });
    }

    // Filter out any null elements before adding listeners to make it more robust
    const validLogoutButtons = elements.logoutButtons.filter(btn => btn !== null);
    
    validLogoutButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            signOut(auth).catch(error => handleError(error, "Logout fejlede.", "signOut"));
        });
    });
}
