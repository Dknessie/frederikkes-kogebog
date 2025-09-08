// js/recipes.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { normalizeUnit, convertToGrams, calculateRecipePrice } from './utils.js';
import { openPlanMealModal } from './mealPlanner.js';
import { confirmAndDeductIngredients } from './kitchenCounter.js';

let appState;
let appElements;

// Lokal state for Kogebog-siden
const cookbookState = {
    flipperIndex: 0,
    searchTerm: '',
    activeListFilterTags: new Set(),
    selectedKeyIngredient: null,
};

export function initRecipes(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        importRecipeBtn: document.getElementById('import-recipe-btn')
    };

    if (appElements.cookbookAddRecipeBtn) appElements.cookbookAddRecipeBtn.addEventListener('click', openAddRecipeModal);
    if (appElements.prevRecipeBtn) appElements.prevRecipeBtn.addEventListener('click', () => navigateFlipper(-1));
    if (appElements.nextRecipeBtn) appElements.nextRecipeBtn.addEventListener('click', () => navigateFlipper(1));
    if (appElements.recipeFlipper) appElements.recipeFlipper.addEventListener('click', handleFlipperClick);
    if (appElements.recipeListGrid) appElements.recipeListGrid.addEventListener('click', handleGridClick);
    if (appElements.listFilterTagsContainer) appElements.listFilterTagsContainer.addEventListener('click', handleFilterTagClick);
    if (appElements.recipeSearchInputSidebar) appElements.recipeSearchInputSidebar.addEventListener('input', (e) => {
        cookbookState.searchTerm = e.target.value.toLowerCase();
        renderRecipeListPage();
    });
     if (appElements.goToCalendarBtn) appElements.goToCalendarBtn.addEventListener('click', () => window.location.hash = '#calendar');

    if (appElements.whatCanIMakeWidget) {
        appElements.whatCanIMakeWidget.addEventListener('click', handleWhatCanIMakeClick);
    }

    appElements.addIngredientBtn.addEventListener('click', () => createIngredientRow(appElements.ingredientsContainer));
    appElements.importRecipeBtn.addEventListener('click', handleRecipeImport);
    appElements.recipeForm.addEventListener('submit', handleSaveRecipe);
    appElements.recipeEditModal.addEventListener('click', (e) => {
        if (e.target.closest('.remove-ingredient-btn')) {
            e.target.closest('.ingredient-row').remove();
        }
    });
    appElements.recipeImageUploadInput.addEventListener('change', handleImageUpload);
    appElements.recipeImageUrlInput.addEventListener('input', handleImageUrlInput);

    appElements.readViewPlanBtn.addEventListener('click', () => {
        appElements.recipeReadModal.classList.add('hidden');
        openPlanMealModal(appState.currentlyViewedRecipeId);
    });
    appElements.readViewCookBtn.addEventListener('click', async () => {
        const recipeId = appState.currentlyViewedRecipeId;
        const recipe = appState.recipes.find(r => r.id === recipeId);
        if (recipe) {
            const wasDeducted = await confirmAndDeductIngredients(recipeId, recipe.portions);
            if (wasDeducted) {
                appElements.recipeReadModal.classList.add('hidden');
            }
        }
    });
    appElements.readViewEditBtn.addEventListener('click', openEditRecipeModal);
    appElements.readViewDeleteBtn.addEventListener('click', handleDeleteRecipeFromReadView);
}

export function renderRecipes() {
    renderFlipper();
    renderRecipeListPage();
    renderSidebarWidgets();
}

function renderFlipper() {
    const container = appElements.recipeFlipper;
    if (!container) return;
    container.innerHTML = '';
    
    const allRecipes = [...appState.recipes].sort((a, b) => a.title.localeCompare(b.title));

    if (allRecipes.length === 0) {
        container.innerHTML = '<p class="empty-state">Du har endnu ikke tilføjet nogen opskrifter.</p>';
        return;
    }

    allRecipes.forEach((recipe) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'recipe-card-wrapper';
        wrapper.dataset.id = recipe.id;
        const imageUrl = recipe.imageBase64 || recipe.imageUrl || `https://placehold.co/600x400/f3f0e9/d1603d?text=${encodeURIComponent(recipe.title)}`;
        const intro = (recipe.introduction || '').substring(0, 150) + ((recipe.introduction || '').length > 150 ? '...' : '');
        wrapper.innerHTML = `
            <div class="recipe-display-card">
                <img src="${imageUrl}" alt="${recipe.title}" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/600x400/f3f0e9/d1603d?text=Billede+mangler';">
                <div class="recipe-content">
                    <h3>${recipe.title}</h3>
                    <div class="recipe-meta">
                        <span><i class="fas fa-clock"></i> ${recipe.time || '?'} min.</span>
                        <span><i class="fas fa-users"></i> ${recipe.portions || '?'} port.</span>
                        <span><i class="fas fa-coins"></i> ~${calculateRecipePrice(recipe, appState.inventory).toFixed(2)} kr.</span>
                    </div>
                    <p class="recipe-intro">${intro}</p>
                    <div class="recipe-card-actions">
                        <button class="btn btn-secondary plan-recipe-btn"><i class="fas fa-calendar-plus"></i> Planlæg</button>
                        <button class="btn btn-secondary edit-recipe-btn"><i class="fas fa-edit"></i> Rediger</button>
                    </div>
                </div>
            </div>`;
        container.appendChild(wrapper);
    });
    updateFlipperCards();
}
function updateFlipperCards() {
    const cards = appElements.recipeFlipper.querySelectorAll('.recipe-card-wrapper');
    if (cards.length === 0) return;
    cards.forEach((card, i) => {
        card.classList.remove('active', 'previous', 'next');
        if (i === cookbookState.flipperIndex) card.classList.add('active');
        else if (i === (cookbookState.flipperIndex - 1 + cards.length) % cards.length) card.classList.add('previous');
        else if (i === (cookbookState.flipperIndex + 1) % cards.length) card.classList.add('next');
    });
}
function navigateFlipper(direction) {
    const cardCount = appElements.recipeFlipper.querySelectorAll('.recipe-card-wrapper').length;
    if (cardCount === 0) return;
    cookbookState.flipperIndex = (cookbookState.flipperIndex + direction + cardCount) % cardCount;
    updateFlipperCards();
}

function renderRecipeListPage() {
    const container = appElements.recipeListGrid;
    if (!container) return;
    container.innerHTML = '';
    let recipesToRender = [...appState.recipes];
    if (cookbookState.searchTerm) {
        recipesToRender = recipesToRender.filter(r => r.title.toLowerCase().includes(cookbookState.searchTerm));
    }
    if (cookbookState.activeListFilterTags.size > 0) {
        recipesToRender = recipesToRender.filter(r => {
            if (!r.tags) return false;
            return [...cookbookState.activeListFilterTags].every(tag => r.tags.includes(tag));
        });
    }
    recipesToRender.sort((a,b) => a.title.localeCompare(b.title));
    if (recipesToRender.length === 0) {
        container.innerHTML = `<p class="empty-state" style="grid-column: 1 / -1;">Ingen opskrifter matcher dine valg.</p>`;
        return;
    }
    recipesToRender.forEach(recipe => container.appendChild(createRecipeListCard(recipe)));
    renderListFilterTags();
}
function createRecipeListCard(recipe) {
    const card = document.createElement('div');
    card.className = 'recipe-list-card';
    card.dataset.id = recipe.id;
    const imageUrl = recipe.imageBase64 || recipe.imageUrl || `https://placehold.co/400x300/f3f0e9/d1603d?text=${encodeURIComponent(recipe.title)}`;
    card.innerHTML = `
        <img src="${imageUrl}" alt="${recipe.title}" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/400x300/f3f0e9/d1603d?text=Billede+mangler';">
        <div class="list-card-content">
            <h4>${recipe.title}</h4>
            <span class="list-card-category">${recipe.category || 'Ukategoriseret'}</span>
        </div>
        <i class="${recipe.is_favorite ? 'fas favorited' : 'far'} fa-heart favorite-icon"></i>`;
    return card;
}
function renderListFilterTags() {
    const container = appElements.listFilterTagsContainer;
    if (!container) return;
    const allTags = new Set();
    appState.recipes.forEach(r => { if (r.tags) r.tags.forEach(tag => allTags.add(tag)); });
    container.innerHTML = '';
    const allButton = document.createElement('button');
    allButton.className = `filter-tag ${cookbookState.activeListFilterTags.size === 0 ? 'active' : ''}`;
    allButton.textContent = 'Alle';
    allButton.dataset.tag = 'all';
    container.appendChild(allButton);
    [...allTags].sort().forEach(tag => {
        const isActive = cookbookState.activeListFilterTags.has(tag);
        const button = document.createElement('button');
        button.className = `filter-tag ${isActive ? 'active' : ''}`;
        button.dataset.tag = tag;
        button.textContent = tag;
        container.appendChild(button);
    });
}

function renderSidebarWidgets() {
    renderWhatCanIMakeWidget();
    renderUpcomingMealPlanWidget();
}

function findKeyIngredients() {
    const ingredientFrequency = {};
    appState.recipes.forEach(recipe => {
        recipe.ingredients.forEach(ing => {
            const key = ing.name.toLowerCase();
            ingredientFrequency[key] = (ingredientFrequency[key] || 0) + 1;
        });
    });

    return appState.inventory
        .filter(item => item.totalStock > 0)
        .map(item => ({
            name: item.name,
            frequency: ingredientFrequency[item.name.toLowerCase()] || 0
        }))
        .filter(item => item.frequency > 1)
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 4);
}

function handleWhatCanIMakeClick(e) {
    const keyIngredientBtn = e.target.closest('.key-ingredient-btn');
    if (keyIngredientBtn) {
        const ingredientName = keyIngredientBtn.dataset.ingredient;
        if (cookbookState.selectedKeyIngredient === ingredientName) {
            cookbookState.selectedKeyIngredient = null;
        } else {
            cookbookState.selectedKeyIngredient = ingredientName;
        }
        renderWhatCanIMakeWidget();
    }
}

function renderWhatCanIMakeWidget() {
    const widget = appElements.whatCanIMakeWidget;
    if (!widget) return;

    const keyIngredients = findKeyIngredients();
    
    let keyIngredientsHTML = '';
    if (keyIngredients.length > 0) {
        keyIngredientsHTML = keyIngredients.map(ing => `
            <button class="filter-tag key-ingredient-btn ${cookbookState.selectedKeyIngredient === ing.name ? 'active' : ''}" data-ingredient="${ing.name}">
                ${ing.name}
            </button>
        `).join('');
    } else {
        keyIngredientsHTML = '<p class="empty-state-small">Tilføj varer på lager for at få forslag.</p>';
    }

    widget.innerHTML = `
        <h5><i class="fas fa-hat-chef"></i> Hvad kan jeg lave?</h5>
        <p class="small-text" style="margin-top: -10px;">Vælg en ingrediens for at få forslag:</p>
        <div class="list-filter-tags" style="margin-bottom: 1rem;">
            ${keyIngredientsHTML}
        </div>
        <div id="what-can-i-make-results" class="widget-list">
            ${renderKeyIngredientResults()}
        </div>
    `;
}

function renderKeyIngredientResults() {
    if (!cookbookState.selectedKeyIngredient) {
        return '<p class="empty-state-small">Vælg en ingrediens ovenfor.</p>';
    }

    const recipesWithIngredient = appState.recipes
        .filter(r => r.ingredients.some(ing => ing.name.toLowerCase() === cookbookState.selectedKeyIngredient.toLowerCase()))
        .map(r => calculateRecipeMatch(r, appState.inventory))
        .sort((a, b) => a.missingCount - b.missingCount || a.title.localeCompare(b.title))
        .slice(0, 5);

    if (recipesWithIngredient.length === 0) {
        return `<p class="empty-state-small">Ingen opskrifter fundet med ${cookbookState.selectedKeyIngredient}.</p>`;
    }

    return recipesWithIngredient.map(recipe => {
        const statusClass = recipe.missingCount === 0 ? 'status-green' : 'status-yellow';
        const missingText = recipe.missingCount > 0 ? `<small>Mangler ${recipe.missingCount}</small>` : '';
        return `
            <li class="widget-list-item">
                <span><span class="status-indicator ${statusClass}"></span>${recipe.title}</span>
                ${missingText}
            </li>
        `;
    }).join('');
}


function renderUpcomingMealPlanWidget() {
    const list = appElements.upcomingMealPlanWidget.querySelector('.widget-list');
    if (!list) return;
    list.innerHTML = '';
    const today = new Date();
    today.setHours(0,0,0,0);
    const upcomingMeals = [];
    for (let i = 0; i < 5; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateString = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        if (appState.mealPlan[dateString] && appState.mealPlan[dateString].dinner) {
            const dinnerPlan = appState.mealPlan[dateString].dinner[0];
            if (dinnerPlan && dinnerPlan.recipeId) {
                const recipe = appState.recipes.find(r => r.id === dinnerPlan.recipeId);
                if (recipe) {
                    let dayLabel = i === 0 ? 'I dag' : i === 1 ? 'I morgen' : date.toLocaleDateString('da-DK', { weekday: 'long' });
                    upcomingMeals.push({ day: dayLabel, recipe: recipe.title });
                }
            }
        }
    }
    if (upcomingMeals.length === 0) {
        list.innerHTML = `<li class="empty-state-small">Ingen måltider planlagt.</li>`;
        return;
    }
    upcomingMeals.slice(0, 3).forEach(meal => {
        const li = document.createElement('li');
        li.className = 'widget-list-item';
        li.innerHTML = `<span class="meal-plan-day">${meal.day}</span><span class="meal-plan-recipe">${meal.recipe}</span>`;
        list.appendChild(li);
    });
}

function handleFilterTagClick(e) {
    const tagButton = e.target.closest('.filter-tag');
    if (!tagButton) return;
    const tag = tagButton.dataset.tag;
    if (tag === 'all') {
        cookbookState.activeListFilterTags.clear();
    } else {
        if (cookbookState.activeListFilterTags.has(tag)) {
            cookbookState.activeListFilterTags.delete(tag);
        } else {
            cookbookState.activeListFilterTags.add(tag);
        }
    }
    renderRecipeListPage();
}
function handleFlipperClick(e) {
    const card = e.target.closest('.recipe-card-wrapper');
    if (!card) return;
    const recipeId = card.dataset.id;
    if (e.target.closest('.plan-recipe-btn')) {
        openPlanMealModal(recipeId);
    } else if (e.target.closest('.edit-recipe-btn')) {
        appState.currentlyViewedRecipeId = recipeId;
        openEditRecipeModal();
    } else {
        const recipe = appState.recipes.find(r => r.id === recipeId);
        if(recipe) renderReadView(recipe);
    }
}
async function handleGridClick(e) {
    const card = e.target.closest('.recipe-list-card');
    if (!card) return;
    const recipeId = card.dataset.id;
    const recipe = appState.recipes.find(r => r.id === recipeId);
    if (e.target.closest('.favorite-icon')) {
        e.stopPropagation();
        const icon = e.target.closest('.favorite-icon');
        const isCurrentlyFavorite = icon.classList.contains('favorited');
        try {
            await updateDoc(doc(db, 'recipes', recipeId), { is_favorite: !isCurrentlyFavorite });
            showNotification({title: "Favorit opdateret!", message: `"${recipe.title}" er ${!isCurrentlyFavorite ? 'tilføjet til' : 'fjernet fra'} favoritter.`});
        } catch (error) { handleError(error, "Kunne ikke opdatere favoritstatus.", "toggleFavorite"); }
    } else {
        if(recipe) renderReadView(recipe);
    }
}

function createIngredientRow(container, ingredient = { name: '', quantity: '', unit: '', note: '' }) {
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.innerHTML = `
        <input type="text" class="ingredient-name" placeholder="Ingrediensnavn" value="${ingredient.name || ''}" required>
        <input type="number" step="any" class="ingredient-quantity" placeholder="Antal" value="${ingredient.quantity || ''}">
        <input type="text" class="ingredient-unit" placeholder="Enhed" value="${ingredient.unit || ''}">
        <input type="text" class="ingredient-note-input" placeholder="Note (f.eks. finthakket)" value="${ingredient.note || ''}">
        <button type="button" class="btn-icon remove-ingredient-btn"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);
    const nameInput = row.querySelector('.ingredient-name');
    const removeAutocomplete = () => {
        const suggestions = row.querySelector('.autocomplete-suggestions');
        if (suggestions) suggestions.remove();
    };
    nameInput.addEventListener('input', (e) => {
        const value = e.target.value.toLowerCase();
        removeAutocomplete();
        if (value.length < 1) return;
        const suggestions = appState.inventoryItems.filter(item => item.name.toLowerCase().startsWith(value));
        if (suggestions.length > 0) {
            const suggestionsContainer = document.createElement('div');
            suggestionsContainer.className = 'autocomplete-suggestions';
            suggestions.slice(0, 5).forEach(item => {
                const suggestionDiv = document.createElement('div');
                suggestionDiv.className = 'autocomplete-suggestion';
                suggestionDiv.innerHTML = item.name.replace(new RegExp(`^${value}`, 'i'), `<strong>$&</strong>`);
                suggestionDiv.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    nameInput.value = item.name;
                    row.querySelector('.ingredient-unit').value = item.defaultUnit || 'g';
                    removeAutocomplete();
                });
                suggestionsContainer.appendChild(suggestionDiv);
            });
            row.appendChild(suggestionsContainer);
        }
    });
    nameInput.addEventListener('blur', () => setTimeout(removeAutocomplete, 150));
}

// OPDATERING: Gør funktionen tilgængelig for andre moduler ved at tilføje 'export'
export function renderReadView(recipe) {
    if (!recipe) return;
    const imageUrl = recipe.imageBase64 || recipe.imageUrl || `https://placehold.co/600x400/f3f0e9/d1603d?text=${encodeURIComponent(recipe.title)}`;
    document.getElementById('read-view-image').src = imageUrl;
    document.getElementById('read-view-title').textContent = recipe.title;
    document.getElementById('read-view-category').textContent = recipe.category || '';
    document.getElementById('read-view-time').innerHTML = `<i class="fas fa-clock"></i> ${recipe.time || '?'} min.`;
    document.getElementById('read-view-portions').innerHTML = `<i class="fas fa-users"></i> ${recipe.portions || '?'} portioner`;
    const recipePrice = calculateRecipePrice(recipe, appState.inventory);
    appElements.readViewPrice.innerHTML = `<i class="fas fa-coins"></i> ${recipePrice > 0 ? `~${recipePrice.toFixed(2)} kr.` : 'Pris ukendt'}`;
    const tagsContainer = document.getElementById('read-view-tags');
    tagsContainer.innerHTML = '';
    if (recipe.tags && recipe.tags.length > 0) {
        recipe.tags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'recipe-card-tag';
            tagEl.textContent = tag;
            tagsContainer.appendChild(tagEl);
        });
    }
    document.getElementById('read-view-introduction').textContent = recipe.introduction || '';
    const ingredientsList = document.getElementById('read-view-ingredients-list');
    ingredientsList.innerHTML = '';
    if (recipe.ingredients && recipe.ingredients.length > 0) {
        recipe.ingredients.forEach(ing => {
            const li = document.createElement('li');
            const { canBeMade } = calculateRecipeMatch({ ingredients: [ing] }, appState.inventory);
            const statusIcon = canBeMade ? `<span class="ingredient-stock-status in-stock"><i class="fas fa-check-circle"></i></span>` : `<span class="ingredient-stock-status out-of-stock"><i class="fas fa-times-circle"></i></span>`;
            const noteHTML = ing.note ? `<span class="ingredient-note">(${ing.note})</span>` : '';
            li.innerHTML = `<span>${ing.quantity || ''} ${ing.unit || ''} ${ing.name} ${noteHTML}</span> ${statusIcon}`;
            ingredientsList.appendChild(li);
        });
    }
    const instructionsContainer = document.getElementById('read-view-instructions-text');
    instructionsContainer.innerHTML = '';
    const instructions = recipe.instructions || '';
    instructions.split('\n').forEach(line => {
        if (line.trim() !== '') {
            const p = document.createElement('p');
            p.textContent = line;
            instructionsContainer.appendChild(p);
        }
    });
    appState.currentlyViewedRecipeId = recipe.id;
    appElements.recipeReadModal.classList.remove('hidden');
}

function parseIngredientLine(line) {
    line = line.trim();
    if (!line) return null;
    let quantity = null, unit = '', name = '', note = '';
    const notes = [];
    const parenMatch = line.match(/\(([^)]+)\)/);
    if (parenMatch) {
        notes.push(parenMatch[1].trim());
        line = line.replace(parenMatch[0], '').trim();
    }
    const knownUnits = ['g', 'gram', 'kg', 'ml', 'l', 'stk', 'tsk', 'spsk', 'dl', 'fed', 'dåse', 'dåser', 'knivspids', 'bundt'];
    const unitRegex = new RegExp(`^(${knownUnits.join('|')})[e|s|\\.]*\\b`, 'i');
    const quantityMatch = line.match(/^((\d+-\d+)|(\d+[\.,]\d+)|(\d+)|(en|et))\s*/i);
    if (quantityMatch) {
        let qStr = quantityMatch[1].toLowerCase();
        if (qStr.includes('-')) {
            const [start, end] = qStr.split('-').map(Number);
            quantity = (start + end) / 2;
        } else if (qStr === 'en' || qStr === 'et') {
            quantity = 1;
        } else {
            quantity = parseFloat(qStr.replace(',', '.'));
        }
        line = line.substring(quantityMatch[0].length).trim();
        const unitMatchAfterQuantity = line.match(unitRegex);
        if (unitMatchAfterQuantity) {
            unit = unitMatchAfterQuantity[0];
            line = line.substring(unitMatchAfterQuantity[0].length).trim();
        } else {
            unit = 'stk';
        }
    }
    if (line.toLowerCase().startsWith('knivspids')) {
        quantity = quantity || 1;
        unit = 'knivspids';
        line = line.substring('knivspids'.length).trim();
    }
    const isSpecialMeatCase = /\bhakket\b/i.test(line) && /\b(oksekød|kylling|svin|lam)\b/i.test(line);
    let descriptors = ['tørret', 'tørrede', 'frisk', 'friske', 'friskkværnet', 'friskrevet', 'i tern', 'i strimler', 'finthakket', 'grofthakket', 'revet', 'flager'];
    if (!isSpecialMeatCase) {
        descriptors.push('hakket', 'hakkede');
    }
    descriptors.forEach(desc => {
        const regex = new RegExp(`\\b${desc}\\b`, 'i');
        if (regex.test(line)) {
            notes.push(desc.replace(/e$/, ''));
            line = line.replace(regex, '').trim();
        }
    });
    name = line.replace(/^af\s+/, '').replace(/,$/, '').trim();
    name = name.charAt(0).toUpperCase() + name.slice(1);
    note = [...new Set(notes)].join(', ');
    return { name, quantity, unit: normalizeUnit(unit), note };
}
function parseFullRecipeText(text) {
    const recipe = {};
    const lines = text.split('\n');
    let currentSection = '';
    for(const line of lines) {
        const lowerLine = line.toLowerCase().trim();
        if(lowerLine.startsWith('titel:')) recipe.title = line.substring(6).trim();
        else if (lowerLine.startsWith('kategori:')) recipe.category = line.substring(9).trim();
        else if (lowerLine.startsWith('antal portioner:')) recipe.portions = line.match(/\d+/)?.[0];
        else if (lowerLine.startsWith('tilberedelsestid:')) recipe.time = line.match(/\d+/)?.[0];
        else if (lowerLine.startsWith('tags:')) recipe.tags = line.substring(5).split(',').map(t => t.trim());
        else if (lowerLine.startsWith('introduktion:')) { currentSection = 'introduction'; recipe.introduction = line.substring(13).trim(); }
        else if (lowerLine.startsWith('ingrediensliste:')) { currentSection = 'ingredients'; recipe.ingredientsText = ''; }
        else if (lowerLine.startsWith('fremgangsmåde:')) { currentSection = 'instructions'; recipe.instructions = line.substring(14).trim(); }
        else {
            if (currentSection === 'introduction') recipe.introduction += '\n' + line;
            if (currentSection === 'ingredients') recipe.ingredientsText += line + '\n';
            if (currentSection === 'instructions') recipe.instructions += '\n' + line;
        }
    }
    return recipe;
}
function handleRecipeImport() {
    const text = appElements.recipeImportTextarea.value;
    if (!text) return;
    const fullRecipeData = parseFullRecipeText(text);
    if (fullRecipeData && fullRecipeData.title && fullRecipeData.ingredientsText && fullRecipeData.instructions) {
        document.getElementById('recipe-title').value = fullRecipeData.title || '';
        document.getElementById('recipe-category').value = fullRecipeData.category || '';
        document.getElementById('recipe-portions').value = fullRecipeData.portions || '';
        document.getElementById('recipe-time').value = fullRecipeData.time || '';
        document.getElementById('recipe-tags').value = fullRecipeData.tags?.join(', ') || '';
        document.getElementById('recipe-introduction').value = fullRecipeData.introduction || '';
        document.getElementById('recipe-instructions').value = fullRecipeData.instructions || '';
        appElements.ingredientsContainer.innerHTML = '';
        if (fullRecipeData.ingredientsText) {
            fullRecipeData.ingredientsText.split('\n').forEach(line => {
                const ingredientData = parseIngredientLine(line);
                if (ingredientData && ingredientData.name) createIngredientRow(appElements.ingredientsContainer, ingredientData);
            });
        }
        showNotification({ title: "Importeret!", message: "Hele opskriften er blevet indlæst." });
    } else {
        appElements.ingredientsContainer.innerHTML = '';
        text.split('\n').forEach(line => {
            const ingredientData = parseIngredientLine(line);
            if (ingredientData && ingredientData.name) createIngredientRow(appElements.ingredientsContainer, ingredientData);
        });
        showNotification({ title: "Importeret!", message: "Ingredienslisten er blevet opdateret." });
    }
    appElements.recipeImportTextarea.value = '';
}
async function handleSaveRecipe(e) {
    e.preventDefault();
    const recipeId = document.getElementById('recipe-id').value;
    const ingredients = [];
    appElements.ingredientsContainer.querySelectorAll('.ingredient-row').forEach(row => {
        const name = row.querySelector('.ingredient-name').value.trim();
        const quantity = row.querySelector('.ingredient-quantity').value;
        const unit = row.querySelector('.ingredient-unit').value.trim();
        const note = row.querySelector('.ingredient-note-input').value.trim();
        if (name) {
            ingredients.push({ name, quantity: Number(quantity) || null, unit: normalizeUnit(unit), note: note || null });
        }
    });
    const tags = document.getElementById('recipe-tags').value.split(',').map(tag => tag.trim()).filter(tag => tag);
    const recipeData = {
        title: document.getElementById('recipe-title').value,
        category: document.getElementById('recipe-category').value,
        tags: tags,
        portions: Number(document.getElementById('recipe-portions').value) || null,
        time: Number(document.getElementById('recipe-time').value) || null,
        introduction: document.getElementById('recipe-introduction').value,
        notes: document.getElementById('recipe-notes').value,
        instructions: document.getElementById('recipe-instructions').value,
        source_url: document.getElementById('recipe-source-url').value,
        ingredients: ingredients,
        is_favorite: appState.recipes.find(r => r.id === recipeId)?.is_favorite || false,
        imageUrl: null,
        imageBase64: null,
        userId: appState.currentUser.uid
    };
    if (appState.recipeFormImage.type === 'url') recipeData.imageUrl = appState.recipeFormImage.data;
    else if (appState.recipeFormImage.type === 'base64') recipeData.imageBase64 = appState.recipeFormImage.data;
    try {
        if (recipeId) await updateDoc(doc(db, 'recipes', recipeId), recipeData);
        else await addDoc(collection(db, 'recipes'), recipeData);
        appElements.recipeEditModal.classList.add('hidden');
    } catch (error) { handleError(error, "Opskriften kunne ikke gemmes.", "saveRecipe"); }
}
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            appElements.recipeImagePreview.src = event.target.result;
            appState.recipeFormImage = { type: 'base64', data: event.target.result };
            appElements.recipeImageUrlInput.value = '';
        };
        reader.readAsDataURL(file);
    }
}
function handleImageUrlInput(e) {
    const url = e.target.value;
    appElements.recipeImagePreview.src = url || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Vælg+billede';
    if (url) {
        appState.recipeFormImage = { type: 'url', data: url };
        appElements.recipeImageUploadInput.value = '';
    }
}
function openAddRecipeModal() {
    appElements.recipeEditModalTitle.textContent = 'Tilføj ny opskrift';
    appElements.recipeForm.reset();
    document.getElementById('recipe-id').value = '';
    appElements.ingredientsContainer.innerHTML = '';
    appElements.recipeImagePreview.src = 'https://placehold.co/600x400/f3f0e9/d1603d?text=Vælg+billede';
    appState.recipeFormImage = { type: null, data: null };
    createIngredientRow(appElements.ingredientsContainer);
    appElements.recipeEditModal.classList.remove('hidden');
}
function openEditRecipeModal() {
    const recipe = appState.recipes.find(r => r.id === appState.currentlyViewedRecipeId);
    if (recipe) {
        appElements.recipeReadModal.classList.add('hidden');
        appElements.recipeEditModalTitle.textContent = 'Rediger opskrift';
        appElements.recipeForm.reset();
        appState.recipeFormImage = { type: null, data: null };
        document.getElementById('recipe-id').value = recipe.id;
        document.getElementById('recipe-title').value = recipe.title || '';
        document.getElementById('recipe-category').value = recipe.category || '';
        document.getElementById('recipe-tags').value = (recipe.tags && recipe.tags.join(', ')) || '';
        document.getElementById('recipe-portions').value = recipe.portions || '';
        document.getElementById('recipe-time').value = recipe.time || '';
        document.getElementById('recipe-introduction').value = recipe.introduction || '';
        document.getElementById('recipe-notes').value = recipe.notes || '';
        document.getElementById('recipe-instructions').value = recipe.instructions || '';
        document.getElementById('recipe-source-url').value = recipe.source_url || '';
        const imageUrl = recipe.imageBase64 || recipe.imageUrl;
        appElements.recipeImagePreview.src = imageUrl || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Billede+mangler';
        if(recipe.imageUrl) {
            appElements.recipeImageUrlInput.value = recipe.imageUrl;
            appState.recipeFormImage = { type: 'url', data: recipe.imageUrl };
        } else if (recipe.imageBase64) {
            appState.recipeFormImage = { type: 'base64', data: recipe.imageBase64 };
        }
        appElements.ingredientsContainer.innerHTML = '';
        if (recipe.ingredients && recipe.ingredients.length > 0) {
            recipe.ingredients.forEach(ing => createIngredientRow(appElements.ingredientsContainer, ing));
        } else {
            createIngredientRow(appElements.ingredientsContainer);
        }
        appElements.recipeEditModal.classList.remove('hidden');
    }
}
async function handleDeleteRecipeFromReadView() {
    const recipeId = appState.currentlyViewedRecipeId;
    if (!recipeId) return;
    const confirmed = await showNotification({title: "Slet Opskrift", message: "Er du sikker på, du vil slette denne opskrift?", type: 'confirm'});
    if(confirmed) {
        try {
            await deleteDoc(doc(db, 'recipes', recipeId));
            appElements.recipeReadModal.classList.add('hidden');
            showNotification({title: "Slettet", message: "Opskriften er blevet slettet."});
        } catch (error) {
            handleError(error, "Opskriften kunne ikke slettes.", "deleteRecipeFromReadView");
        }
    }
}
function calculateRecipeMatch(recipe, inventory) {
    let missingCount = 0;
    if (!recipe.ingredients || recipe.ingredients.length === 0) {
        return { ...recipe, missingCount: 0, canBeMade: true };
    }
    let canBeMade = true;
    recipe.ingredients.forEach(ing => {
        const inventoryItem = inventory.find(item => item.name.toLowerCase() === ing.name.toLowerCase());
        if (!inventoryItem) {
            missingCount++;
            canBeMade = false;
            return;
        }
        const conversion = convertToGrams(ing.quantity, ing.unit, inventoryItem);
        if (conversion.error) {
            missingCount++;
            canBeMade = false;
            return;
        }
        if (conversion.grams > (inventoryItem.totalStock || 0)) {
            missingCount++;
            canBeMade = false;
        }
    });
    return { ...recipe, missingCount, canBeMade };
}
