// js/projects.js

import { db } from './firebase.js';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showModal, hideModal } from './ui.js';
// Rettet import til at bruge den centrale fejlhåndtering fra utils.js
import { handleError } from './utils.js';

let state;

export function initProjects(appState) {
    state = appState;

    const addProjectBtn = document.getElementById('add-project-btn');
    const projectForm = document.getElementById('project-form');

    if (addProjectBtn) {
        addProjectBtn.addEventListener('click', () => {
            projectForm.reset();
            projectForm.dataset.id = '';
            showModal('project-edit-modal');
        });
    }

    if (projectForm) {
        projectForm.addEventListener('submit', handleSaveProject);
    }
    
    renderProjects();
}

export function renderProjects() {
    const projectsGrid = document.getElementById('projects-grid');
    if (!projectsGrid) return;

    projectsGrid.innerHTML = '';
    if (!state.projects || state.projects.length === 0) {
        projectsGrid.innerHTML = '<p>Ingen aktive projekter.</p>';
        return;
    }

    state.projects.forEach(project => {
        const projectCard = document.createElement('div');
        projectCard.className = 'project-card';
        projectCard.dataset.id = project.id;
        projectCard.innerHTML = `
            <h4>${project.name}</h4>
            <p>${project.description}</p>
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${project.progress || 0}%;"></div>
            </div>
        `;
        projectsGrid.appendChild(projectCard);
    });
}

async function handleSaveProject(e) {
    e.preventDefault();
    if (!state.currentUser) return;

    const form = e.target;
    const projectId = form.dataset.id;
    const projectData = {
        userId: state.currentUser.uid,
        name: form.name.value,
        description: form.description.value,
        status: form.status.value,
    };

    try {
        if (projectId) {
            await updateDoc(doc(db, 'projects', projectId), projectData);
        } else {
            projectData.createdAt = serverTimestamp();
            projectData.progress = 0;
            await addDoc(collection(db, 'projects'), projectData);
        }
        hideModal('project-edit-modal');
        renderProjects();
    } catch (error) {
        handleError(error, "Kunne ikke gemme projektet.", "handleSaveProject");
    }
}
