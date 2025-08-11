// js/recipes.js

import { db } from './firebase.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleError } from './utils.js';
import { showModal, hideModal } from './ui.js';
// Korrekt import for lagerstyring
import { confirmAndDeductIngredients } from './inventory.js';
// Import for "Køkkenbord" funktionalitet
import { addToKitchenCounter } from './kitchenCounter.js';

let state;

// Funktion til at initialisere opskrifts-modulet
export function initRecipes(appState) {
    state = appState;
    
    // Find elementer første gang modulet initialiseres
    const addRecipeBtn = document.getElementById('add-recipe-btn');
    const recipeForm = document.getElementById('recipe-form');
    const recipeGrid = document.querySelector('#recipes .recipe-grid');

    if (addRecipeBtn) {
        addRecipeBtn.addEventListener('click', () => {
            // Nulstil formularen før den vises
            recipeForm.reset();
            document.getElementById('recipe-edit-modal-title').textContent = 'Tilføj Ny Opskrift';
            document.getElementById('recipe-form').dataset.id = '';
            showModal('recipe-edit-modal');
        });
    }

    if (recipeForm) {
        recipeForm.addEventListener('submit', handleSaveRecipe);
    }

    if (recipeGrid) {
        recipeGrid.addEventListener('click', handleRecipeGridClick);
    }

    renderRecipes();
}

// Funktion til at rendere alle opskrifter
export function renderRecipes() {
    const recipeGrid = document.querySelector('#recipes .recipe-grid');
    if (!recipeGrid) return;

    recipeGrid.innerHTML = ''; // Ryd eksisterende indhold
    if (!state.recipes || state.recipes.length === 0) {
        recipeGrid.innerHTML = '<p>Du har endnu ingen opskrifter. Klik på "Tilføj ny opskrift" for at starte.</p>';
        return;
    }

    state.recipes.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.dataset.id = recipe.id;
        card.innerHTML = `
            <img src="${recipe.imageUrl || 'https://placehold.co/300x200/e2e8f0/64748b?text=Billede+mangler'}" alt="${recipe.name}" onerror="this.onerror=null;this.src='https://placehold.co/300x200/e2e8f0/64748b?text=Billede+mangler';">
            <div class="recipe-card-content">
                <h3>${recipe.name}</h3>
                <p>${recipe.tags ? recipe.tags.join(', ') : ''}</p>
                <div class="recipe-card-actions">
                    <button class="cook-now-btn">Lav nu</button>
                </div>
            </div>
        `;
        recipeGrid.appendChild(card);
    });
}

// Funktion til at håndtere klik på opskriftskort
function handleRecipeGridClick(event) {
    const card = event.target.closest('.recipe-card');
    if (!card) return;

    const recipeId = card.dataset.id;

    if (event.target.classList.contains('cook-now-btn')) {
        // Her kalder vi den korrekt importerede funktion
        confirmAndDeductIngredients(recipeId);
        handleError(null, `Ingredienser for opskriften er nu fratrukket lageret (simuleret).`, "Success");
    } else {
        // Logik til at åbne "læs opskrift"-modalen
        console.log(`Viser detaljer for opskrift: ${recipeId}`);
    }
}

// Funktion til at gemme en ny eller eksisterende opskrift
async function handleSaveRecipe(event) {
    event.preventDefault();
    if (!state.currentUser) return;

    const form = event.target;
    const recipeId = form.dataset.id;
    const recipeData = {
        userId: state.currentUser.uid,
        name: form.name.value,
        description: form.description.value,
        imageUrl: form.imageUrl.value,
        tags: form.tags.value.split(',').map(tag => tag.trim()),
        // Her ville man normalt også hente ingredienser og fremgangsmåde
    };

    try {
        if (recipeId) {
            // Opdater eksisterende opskrift
            const recipeRef = doc(db, 'recipes', recipeId);
            await updateDoc(recipeRef, recipeData);
        } else {
            // Opret ny opskrift
            recipeData.createdAt = serverTimestamp();
            await addDoc(collection(db, 'recipes'), recipeData);
        }
        hideModal('recipe-edit-modal');
        renderRecipes(); // Re-render for at vise ændringer
    } catch (error) {
        handleError(error, "Kunne ikke gemme opskriften.", "handleSaveRecipe");
    }
}

// Funktion til at rendere filter-tags (kan udvides)
export function renderPageTagFilters() {
    // Logik til at vise filter-tags på siden
}
