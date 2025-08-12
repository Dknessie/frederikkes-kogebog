// js/projects.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { normalizeUnit } from './utils.js';
import { togglePinnedSavingsGoal } from './economy.js'; // NYT: Importeret

let appState;
let appElements;
let projectFormImageBefore = { type: null, data: null };
let projectFormImageAfter = { type: null, data: null };

/**
 * Initializes the projects module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
export function initProjects(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        projectImagePreviewBefore: document.getElementById('project-image-preview-before'),
        projectImageUploadBefore: document.getElementById('project-image-upload-before'),
        projectImageUrlInputBefore: document.getElementById('project-imageUrl-before'),
        projectImagePreviewAfter: document.getElementById('project-image-preview-after'),
        projectImageUploadAfter: document.getElementById('project-image-upload-after'),
        projectImageUrlInputAfter: document.getElementById('project-imageUrl-after'),
        projectLinksContainer: document.getElementById('project-links-container'),
        addProjectLinkBtn: document.getElementById('add-project-link-btn'),
    };

    appElements.addProjectBtn.addEventListener('click', openAddProjectModal);
    appElements.projectForm.addEventListener('submit', handleSaveProject);
    appElements.projectsGrid.addEventListener('click', handleGridClick);
    appElements.addMaterialBtn.addEventListener('click', () => createMaterialRow());
    
    appElements.projectEditModal.addEventListener('click', (e) => {
        if (e.target.closest('.remove-ingredient-btn')) {
            e.target.closest('.ingredient-row').remove();
        }
        if (e.target.closest('.remove-project-link-btn')) {
            e.target.closest('.project-link-row').remove();
        }
    });

    // Event listeners for image handling
    appElements.projectImageUploadBefore.addEventListener('change', (e) => handleImageUpload(e, 'before'));
    appElements.projectImageUrlInputBefore.addEventListener('input', (e) => handleImageUrlInput(e, 'before'));
    appElements.projectImageUploadAfter.addEventListener('change', (e) => handleImageUpload(e, 'after'));
    appElements.projectImageUrlInputAfter.addEventListener('input', (e) => handleImageUrlInput(e, 'after'));
    appElements.addProjectLinkBtn.addEventListener('click', () => createLinkRow());
}

/**
 * Renders the projects on the "Hjem" page.
 */
export function renderProjects() {
    const fragment = document.createDocumentFragment();
    appElements.projectsGrid.innerHTML = '';
    
    let projectsToRender = [...appState.projects];

    projectsToRender.sort((a,b) => a.title.localeCompare(b.title));

    if (projectsToRender.length === 0) {
        appElements.projectsGrid.innerHTML = `<p class="empty-state">Du har ingen projekter endnu. Klik på knappen for at tilføje dit første.</p>`;
        return;
    }

    projectsToRender.forEach(project => {
        const card = createProjectCard(project);
        fragment.appendChild(card);
    });
    appElements.projectsGrid.appendChild(fragment);
}

/**
 * Creates a card element for a single project.
 * @param {object} project - The project data.
 * @returns {HTMLElement} The created card element.
 */
function createProjectCard(project) {
    const card = document.createElement('div');
    card.className = 'recipe-card'; // Reusing recipe card styling
    card.dataset.id = project.id;
    
    const tagsHTML = (project.tags && project.tags.length > 0) 
        ? project.tags.map(tag => `<span class="recipe-card-tag">${tag}</span>`).join('')
        : '';
    
    const imageUrl = project.imageBase64Before || project.imageUrlBefore || `https://placehold.co/400x300/f3f0e9/d1603d?text=${encodeURIComponent(project.title)}`;

    // NYT: Tjek om projektet er pinnet som et opsparingsmål
    const isPinned = (appState.economySettings.pinnedGoals || []).some(g => g.id === project.id && g.type === 'project');
    const pinIconClass = isPinned ? 'fas' : 'far';

    card.innerHTML = `
        <img src="${imageUrl}" alt="Før billede af ${project.title}" class="recipe-card-image" onerror="this.onerror=null;this.src='https://placehold.co/400x300/f3f0e9/d1603d?text=Billede+mangler';">
        <div class="recipe-card-content">
            <span class="recipe-card-category">${project.room || 'Ukategoriseret'}</span>
            <h4>${project.title}</h4>
            <div class="recipe-card-tags">${tagsHTML}</div>
        </div>
        <div class="recipe-card-actions">
            <!-- NYT: Knap til at pinne opsparingsmål -->
            <button class="btn-icon pin-goal-btn" title="Pin til opsparing"><i class="${pinIconClass} fa-thumbtack"></i></button>
            <button class="btn-icon edit-project-btn" title="Rediger Projekt"><i class="fas fa-edit"></i></button>
            <button class="btn-icon delete-project-btn" title="Slet Projekt"><i class="fas fa-trash"></i></button>
        </div>`;
    return card;
}

/**
 * Creates a row for adding a material in the project modal.
 * @param {object} [material={}] - Optional material data to pre-fill the row.
 */
function createMaterialRow(material = {}) {
    const container = appElements.projectMaterialsContainer;
    const row = document.createElement('div');
    row.className = 'ingredient-row'; // Reusing recipe style
    row.innerHTML = `
        <input type="text" class="ingredient-name" placeholder="Materiale/Værktøj" value="${material.name || ''}" required>
        <input type="number" step="any" class="ingredient-quantity" placeholder="Antal" value="${material.quantity || ''}">
        <input type="text" class="ingredient-unit" placeholder="Enhed" value="${material.unit || ''}">
        <div class="price-input-wrapper">
            <input type="number" step="0.01" class="material-item-price" placeholder="Pris" value="${material.price || ''}">
        </div>
        <button type="button" class="btn-icon remove-ingredient-btn"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);
}

function createLinkRow(link = {}) {
    const container = appElements.projectLinksContainer;
    const row = document.createElement('div');
    row.className = 'project-link-row';
    row.innerHTML = `
        <input type="text" class="project-link-title" placeholder="Beskrivelse" value="${link.title || ''}">
        <input type="url" class="project-link-url" placeholder="https://..." value="${link.url || ''}">
        <button type="button" class="btn-icon remove-project-link-btn"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);
}

/**
 * Handles saving a project from the modal form.
 * @param {Event} e - The form submission event.
 */
async function handleSaveProject(e) {
    e.preventDefault();
    const projectId = document.getElementById('project-id').value;
    const materials = [];
    appElements.projectMaterialsContainer.querySelectorAll('.ingredient-row').forEach(row => {
        const name = row.querySelector('.ingredient-name').value.trim();
        const quantity = row.querySelector('.ingredient-quantity').value;
        const unit = row.querySelector('.ingredient-unit').value.trim();
        const price = Number(row.querySelector('.material-item-price').value) || null;
        if (name) {
            materials.push({ 
                name, 
                quantity: Number(quantity) || null, 
                unit: normalizeUnit(unit),
                price
            });
        }
    });

    const links = [];
    appElements.projectLinksContainer.querySelectorAll('.project-link-row').forEach(row => {
        const title = row.querySelector('.project-link-title').value.trim();
        const url = row.querySelector('.project-link-url').value.trim();
        if (title && url) {
            links.push({ title, url });
        }
    });

    const tags = document.getElementById('project-tags').value.split(',').map(tag => tag.trim()).filter(tag => tag);

    const projectData = {
        title: document.getElementById('project-title').value,
        status: document.getElementById('project-status').value,
        tags: tags,
        room: document.getElementById('project-room').value.trim() || null, 
        time: {
            days: Number(document.getElementById('project-time-days').value) || null,
            hours: Number(document.getElementById('project-time-hours').value) || null,
        },
        instructions: document.getElementById('project-instructions').value,
        materials: materials,
        links: links,
        userId: appState.currentUser.uid,
        imageUrlBefore: projectFormImageBefore.type === 'url' ? projectFormImageBefore.data : null,
        imageBase64Before: projectFormImageBefore.type === 'base64' ? projectFormImageBefore.data : null,
        imageUrlAfter: projectFormImageAfter.type === 'url' ? projectFormImageAfter.data : null,
        imageBase64After: projectFormImageAfter.type === 'base64' ? projectFormImageAfter.data : null,
    };

    try {
        if (projectId) {
            await updateDoc(doc(db, 'projects', projectId), projectData);
        } else {
            await addDoc(collection(db, 'projects'), projectData);
        }
        appElements.projectEditModal.classList.add('hidden');
    } catch (error) {
        handleError(error, "Projektet kunne ikke gemmes.", "saveProject");
    }
}

/**
 * Handles clicks within the projects grid (edit, delete, pin).
 * @param {Event} e - The click event.
 */
async function handleGridClick(e) {
    const card = e.target.closest('.recipe-card');
    if (!card) return;
    const docId = card.dataset.id;
    
    if (e.target.closest('.edit-project-btn')) {
        openEditProjectModal(docId);
        return;
    }

    if (e.target.closest('.delete-project-btn')) {
        e.stopPropagation(); 
        const confirmed = await showNotification({title: "Slet Projekt", message: "Er du sikker på, du vil slette dette projekt?", type: 'confirm'});
        if(confirmed) {
            try {
                await deleteDoc(doc(db, 'projects', docId));
                showNotification({title: "Slettet", message: "Projektet er blevet slettet."});
            } catch (error) {
                handleError(error, "Projektet kunne ikke slettes.", "deleteProject");
            }
        }
        return;
    }

    // NYT: Håndter klik på pin-knappen
    if (e.target.closest('.pin-goal-btn')) {
        e.stopPropagation();
        const goal = { id: docId, type: 'project' };
        await togglePinnedSavingsGoal(goal);
        return;
    }

    // Default action: open details (hvis vi implementerer en detaljevisning for projekter)
    // For nu gør vi ingenting, men lader pladsen være åben for fremtiden.
}

/**
 * Opens the modal to add a new project.
 */
function openAddProjectModal() {
    appElements.projectEditModal.querySelector('h3').textContent = 'Tilføj nyt projekt';
    appElements.projectForm.reset();
    document.getElementById('project-id').value = '';
    appElements.projectMaterialsContainer.innerHTML = '';
    appElements.projectLinksContainer.innerHTML = '';
    
    projectFormImageBefore = { type: null, data: null };
    projectFormImageAfter = { type: null, data: null };
    appElements.projectImagePreviewBefore.src = 'https://placehold.co/600x400/f3f0e9/d1603d?text=Før';
    appElements.projectImagePreviewAfter.src = 'https://placehold.co/600x400/f3f0e9/d1603d?text=Efter';
    
    const roomInput = document.getElementById('project-room');
    roomInput.value = '';

    createMaterialRow();
    createLinkRow();
    appElements.projectEditModal.classList.remove('hidden');
}

/**
 * Opens the modal to edit an existing project.
 * @param {string} projectId - The ID of the project to edit.
 */
function openEditProjectModal(projectId) {
    const project = appState.projects.find(p => p.id === projectId);
    if (project) {
        appElements.projectEditModal.querySelector('h3').textContent = 'Rediger Projekt';
        appElements.projectForm.reset();

        document.getElementById('project-id').value = project.id;
        document.getElementById('project-title').value = project.title || '';
        document.getElementById('project-status').value = project.status || 'Igangværende';
        document.getElementById('project-tags').value = (project.tags && project.tags.join(', ')) || '';
        
        document.getElementById('project-room').value = project.room || '';
        
        document.getElementById('project-time-days').value = project.time?.days || '';
        document.getElementById('project-time-hours').value = project.time?.hours || '';
        
        document.getElementById('project-instructions').value = project.instructions || '';
        
        projectFormImageBefore = { 
            type: project.imageUrlBefore ? 'url' : (project.imageBase64Before ? 'base64' : null),
            data: project.imageUrlBefore || project.imageBase64Before
        };
        projectFormImageAfter = { 
            type: project.imageUrlAfter ? 'url' : (project.imageBase64After ? 'base64' : null),
            data: project.imageUrlAfter || project.imageBase64After
        };

        appElements.projectImagePreviewBefore.src = projectFormImageBefore.data || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Før';
        appElements.projectImageUrlInputBefore.value = project.imageUrlBefore || '';
        appElements.projectImagePreviewAfter.src = projectFormImageAfter.data || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Efter';
        appElements.projectImageUrlInputAfter.value = project.imageUrlAfter || '';

        appElements.projectMaterialsContainer.innerHTML = '';
        if (project.materials && project.materials.length > 0) {
            project.materials.forEach(mat => createMaterialRow(mat));
        } else {
            createMaterialRow();
        }

        appElements.projectLinksContainer.innerHTML = '';
        if (project.links && project.links.length > 0) {
            project.links.forEach(link => createLinkRow(link));
        } else {
            createLinkRow();
        }

        appElements.projectEditModal.classList.remove('hidden');
    }
}

// Image Handling Functions
function handleImageUpload(e, type) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const imageData = { type: 'base64', data: event.target.result };
        if (type === 'before') {
            projectFormImageBefore = imageData;
            appElements.projectImagePreviewBefore.src = event.target.result;
            appElements.projectImageUrlInputBefore.value = '';
        } else {
            projectFormImageAfter = imageData;
            appElements.projectImagePreviewAfter.src = event.target.result;
            appElements.projectImageUrlInputAfter.value = '';
        }
    };
    reader.readAsDataURL(file);
}

function handleImageUrlInput(e, type) {
    const url = e.target.value;
    const imageData = { type: 'url', data: url };
    if (type === 'before') {
        projectFormImageBefore = imageData;
        appElements.projectImagePreviewBefore.src = url || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Før';
        appElements.projectImageUploadBefore.value = '';
    } else {
        projectFormImageAfter = imageData;
        appElements.projectImagePreviewAfter.src = url || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Efter';
        appElements.projectImageUploadAfter.value = '';
    }
}
