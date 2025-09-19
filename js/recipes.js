// js/recipes.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { normalizeUnit, calculateRecipePrice, calculateRecipeNutrition } from './utils.js';
import { openPlanMealModal } from './mealPlanner.js';

let appState;
let appElements;

// Lokal state for Kogebog-siden
const cookbookState = {
    flipperIndex: 0,
    searchTerm: '',
    activeListFilterTags: new Set(),
};

export function initRecipes(state, elements) {
    appState = state;
    appElements = elements;

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

    if (appElements.addIngredientBtnRecipe) appElements.addIngredientBtnRecipe.addEventListener('click', () => createIngredientRow(appElements.ingredientsContainer));
    if (appElements.importRecipeBtn) appElements.importRecipeBtn.addEventListener('click', handleRecipeImport);
    if (appElements.recipeForm) appElements.recipeForm.addEventListener('submit', handleSaveRecipe);
    
    if (appElements.recipeEditModal) {
        appElements.recipeEditModal.addEventListener('click', (e) => {
            if (e.target.closest('.remove-ingredient-btn')) {
                e.target.closest('.ingredient-row').remove();
            }
        });
    }

    if (appElements.recipeImageUploadInput) appElements.recipeImageUploadInput.addEventListener('change', handleImageUpload);
    if (appElements.recipeImageUrlInput) appElements.recipeImageUrlInput.addEventListener('input', handleImageUrlInput);

    if (appElements.readViewPlanBtn) {
        appElements.readViewPlanBtn.addEventListener('click', () => {
            appElements.recipeReadModal.classList.add('hidden');
            openPlanMealModal(appState.currentlyViewedRecipeId);
        });
    }
    
    const createMissingBtn = document.getElementById('create-missing-ingredients-btn');
    if (createMissingBtn) {
        createMissingBtn.addEventListener('click', handleCreateMissingIngredients);
    }

    if (appElements.readViewEditBtn) appElements.readViewEditBtn.addEventListener('click', openEditRecipeModal);
    if (appElements.readViewDeleteBtn) appElements.readViewDeleteBtn.addEventListener('click', handleDeleteRecipeFromReadView);
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
        
        const price = calculateRecipePrice(recipe, appState.ingredientInfo);
        const { caloriesPer100g } = calculateRecipeNutrition(recipe, appState.ingredientInfo);

        wrapper.innerHTML = `
            <div class="recipe-display-card">
                <img src="${imageUrl}" alt="${recipe.title}" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/600x400/f3f0e9/d1603d?text=Billede+mangler';">
                <div class="recipe-content">
                    <h3>${recipe.title}</h3>
                    <div class="recipe-meta">
                        <span><i class="fas fa-clock"></i> ${recipe.time || '?'} min.</span>
                        <span><i class="fas fa-users"></i> ${recipe.portions || '?'} port.</span>
                        <span><i class="fas fa-coins"></i> ~${price.toFixed(2)} kr.</span>
                        ${caloriesPer100g > 0 ? `<span><i class="fas fa-fire-alt"></i> ~${Math.round(caloriesPer100g)} kcal/100g</span>` : ''}
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
    appElements.whatCanIMakeWidget.innerHTML = `<h5><i class="fas fa-hat-chef"></i> Hvad kan jeg lave?</h5><p class="empty-state-small">Denne funktion er midlertidigt fjernet under ombygningen af varelageret.</p>`;
    renderUpcomingMealPlanWidget();
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
        const suggestions = appState.ingredientInfo.filter(item => item.name.toLowerCase().startsWith(value));
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

export function renderReadView(recipe) {
    if (!recipe) return;
    const imageUrl = recipe.imageBase64 || recipe.imageUrl || `https://placehold.co/600x400/f3f0e9/d1603d?text=${encodeURIComponent(recipe.title)}`;
    document.getElementById('read-view-image').src = imageUrl;
    document.getElementById('read-view-title').textContent = recipe.title;
    document.getElementById('read-view-category').textContent = recipe.category || '';
    document.getElementById('read-view-time').innerHTML = `<i class="fas fa-clock"></i> ${recipe.time || '?'} min.`;
    document.getElementById('read-view-portions').innerHTML = `<i class="fas fa-users"></i> ${recipe.portions || '?'} portioner`;

    const recipePrice = calculateRecipePrice(recipe, appState.ingredientInfo);
    const { caloriesPer100g } = calculateRecipeNutrition(recipe, appState.ingredientInfo);
    
    document.getElementById('read-view-price').innerHTML = `<i class="fas fa-coins"></i> ${recipePrice > 0 ? `~${recipePrice.toFixed(2)} kr.` : 'Pris ukendt'}`;
    const caloriesElement = document.getElementById('read-view-calories-100g');
    if(caloriesElement) {
        caloriesElement.innerHTML = caloriesPer100g > 0 ? `<i class="fas fa-fire-alt"></i> ~${Math.round(caloriesPer100g)} kcal/100g` : '';
    }

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
        const libraryNames = new Set(appState.ingredientInfo.map(i => i.name.toLowerCase()));
        const aliasMap = new Map();
        appState.ingredientInfo.forEach(i => {
            if (i.aliases) {
                i.aliases.forEach(alias => aliasMap.set(alias.toLowerCase(), i.name.toLowerCase()));
            }
        });

        recipe.ingredients.forEach(ing => {
            const li = document.createElement('li');
            const nameLower = ing.name.toLowerCase();
            const exists = libraryNames.has(nameLower) || aliasMap.has(nameLower);
            const statusClass = exists ? 'status-ok' : 'status-missing';
            const statusTitle = exists ? 'Findes i biblioteket' : 'Mangler i biblioteket';

            const noteHTML = ing.note ? `<span class="ingredient-note">(${ing.note})</span>` : '';
            li.innerHTML = `
                <span class="ingredient-status-indicator ${statusClass}" title="${statusTitle}"></span>
                <span>${ing.quantity || ''} ${ing.unit || ''} ${ing.name} ${noteHTML}</span>`;
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
        // ÆNDRING: Tilføjer i stedet for at slette
        text.split('\n').forEach(line => {
            const ingredientData = parseIngredientLine(line);
            if (ingredientData && ingredientData.name) createIngredientRow(appElements.ingredientsContainer, ingredientData);
        });
        showNotification({ title: "Importeret!", message: "Ingredienser er blevet tilføjet til listen." });
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

function handleCreateMissingIngredients() {
    const recipe = appState.recipes.find(r => r.id === appState.currentlyViewedRecipeId);
    if (!recipe || !recipe.ingredients) return;

    const existingIngredientNames = new Set(appState.ingredientInfo.map(i => i.name.toLowerCase()));
    const missingIngredients = recipe.ingredients.filter(ing => !existingIngredientNames.has(ing.name.toLowerCase()));

    if (missingIngredients.length === 0) {
        showNotification({title: "Alle Findes", message: "Alle ingredienser i denne opskrift findes allerede i dit bibliotek."});
        return;
    }

    openIngredientAssistantModal(missingIngredients);
}

function openIngredientAssistantModal(missingIngredients) {
    const modal = document.getElementById('ingredient-assistant-modal');
    const listContainer = document.getElementById('ingredient-assistant-list');
    listContainer.innerHTML = '';

    const mainCategories = (appState.references.itemCategories || []).map(cat => (typeof cat === 'string' ? { name: cat, subcategories: [] } : cat));

    missingIngredients.forEach(ing => {
        const row = document.createElement('div');
        row.className = 'assistant-item-row';
        row.dataset.name = ing.name;

        // Opret dropdowns for kategorier
        const mainCatSelect = document.createElement('select');
        mainCatSelect.className = 'assistant-main-cat';
        populateReferenceDropdown(mainCatSelect, mainCategories.map(c => c.name), 'Vælg kategori...');
        
        const subCatSelect = document.createElement('select');
        subCatSelect.className = 'assistant-sub-cat';
        subCatSelect.disabled = true;

        mainCatSelect.addEventListener('change', () => {
            const selectedMain = mainCategories.find(c => c.name === mainCatSelect.value);
            populateReferenceDropdown(subCatSelect, selectedMain ? selectedMain.subcategories : [], 'Vælg underkategori...');
            subCatSelect.disabled = !selectedMain;
        });

        row.innerHTML = `
            <div class="assistant-item-name">${ing.name}</div>
            <div class="assistant-item-inputs">
                <div class="input-group">${mainCatSelect.outerHTML}</div>
                <div class="input-group">${subCatSelect.outerHTML}</div>
                <div class="input-group">
                    <input type="number" step="0.01" class="assistant-price" placeholder="Pris (kg/l/stk)">
                </div>
                <div class="input-group">
                    <select class="assistant-unit">
                        <option value="g">kr/kg</option>
                        <option value="ml">kr/l</option>
                        <option value="stk">kr/stk</option>
                    </select>
                </div>
                <div class="input-group">
                    <input type="number" class="assistant-calories" placeholder="kcal/100g">
                </div>
            </div>
        `;
        listContainer.appendChild(row);
    });
    
    modal.classList.remove('hidden');
}

function populateReferenceDropdown(select, opts, ph, val) {
    if (!select) return;
    select.innerHTML = `<option value="">${ph}</option>`;
    (opts || []).sort().forEach(opt => select.add(new Option(opt, opt)));
    select.value = val || "";
}

