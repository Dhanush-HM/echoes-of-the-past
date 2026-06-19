// --- FIREBASE SETUP ---
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  doc,
  deleteDoc,
  setDoc,
  getDocs,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signInWithCustomToken,
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

// =================================================================================
//  CONFIGURATION LOGIC
// =================================================================================
let firebaseConfig;

if (typeof __firebase_config !== 'undefined') {
  firebaseConfig = JSON.parse(__firebase_config); 
} else {
  firebaseConfig = {
    apiKey: 'AIzaSyA8Alqjx9zfAyVo6oKmv2VAjvqGJWN8TvE',
    authDomain: 'culturalheritagearchive-794fb.firebaseapp.com',
    projectId: 'culturalheritagearchive-794fb',
    storageBucket: 'culturalheritagearchive-794fb.firebasestorage.app',
    messagingSenderId: '818309455912',
    appId: '1:818309455912:web:115fee6c12d6c8a9f0951d',
  };
}

const appId = typeof __app_id !== 'undefined' ? __app_id : firebaseConfig.appId;

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const artifactsCollectionRef = collection(
  db,
  `artifacts/${appId}/public/data/artifacts`
);

// Using 'tours_v4' to ensure clean state with working images
const toursCollectionRef = collection(
    db,
    `artifacts/${appId}/public/data/tours_v4`
);


// --- GLOBAL STATE ---
let allArtifacts = [];
let allTours = [];
let currentFilter = 'All';

// --- 3D RENDERER LOGIC ---
let scene, camera, renderer, controls;

const THREE = window.THREE;

// Init AOS
if (typeof AOS !== 'undefined') {
    AOS.init({
        once: false, // animations only happen once
        duration: 800, // default duration
        offset: 100 // offset (in px) from the original trigger point
    });
}

function init3DViewer(container, modelUrl, isDiamond = false) {
  if (!THREE) {
    console.error('THREE.js is not loaded');
    container.innerHTML = `<div class="text-white text-center flex items-center justify-center h-full bg-red-800/50 rounded-lg p-4">THREE.js library failed to load.</div>`;
    return;
  }

  const width = container.clientWidth || 400;
  const height = container.clientHeight || 400;

  scene = new THREE.Scene();
  
  // Dark blue-grey background for diamonds
  scene.background = new THREE.Color(isDiamond ? 0x0a0a1a : 0x282c34);

  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  
  renderer.physicallyCorrectLights = true; 
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = isDiamond ? 1.0 : 1.2; 
  renderer.outputEncoding = THREE.sRGBEncoding;
  
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  
  if (isDiamond) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.0;
  }

  // --- ENVIRONMENT MAP (CRITICAL FOR DIAMOND) ---
  const envLoader = new THREE.TextureLoader();
  envLoader.setCrossOrigin('anonymous');
  envLoader.load(
      'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/2294472375_24a3b8ef46_o.jpg',
      function (texture) {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          scene.environment = texture; 
      }
  );

  // --- LIGHTING SETUP ---
  if (isDiamond) {
      // GEM SETUP: Focused points of light for "fire"
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.2); 
      scene.add(ambientLight);

      const light1 = new THREE.PointLight(0xffffff, 2.0);
      light1.position.set(5, 5, 5);
      scene.add(light1);

      const light2 = new THREE.PointLight(0xffffff, 2.0);
      light2.position.set(-5, -5, 5);
      scene.add(light2);
      
  } else {
      // STANDARD SETUP
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.5); 
      scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
      directionalLight.position.set(5, 10, 7.5).normalize();
      scene.add(directionalLight);

      const fillLight = new THREE.DirectionalLight(0xffffff, 1.5);
      fillLight.position.set(-5, 10, -7.5).normalize();
      scene.add(fillLight);
  }

  const loader = new THREE.GLTFLoader();

  if (THREE.DRACOLoader) {
    const dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
    loader.setDRACOLoader(dracoLoader);
  }

  loader.load(
    modelUrl,
    function (gltf) {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      if (size.length() === 0) {
        scene.add(model);
        camera.position.z = 5;
        return;
      }

      model.position.x -= center.x;
      model.position.y -= center.y;
      model.position.z -= center.z;

      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 4.0 / maxDim;
      model.scale.set(scale, scale, scale);

      // --- MATERIAL OVERRIDE FOR DIAMONDS ---
      if (isDiamond) {
        model.traverse((child) => {
            if (child.isMesh) {
                if(child.geometry.attributes.color) {
                    child.geometry.deleteAttribute('color');
                }

                // ULTRA-CLEAR GEM MATERIAL
                const gemMaterial = new THREE.MeshPhysicalMaterial({
                    color: 0xffffff,        
                    metalness: 0.0,         
                    roughness: 0.0,
                    transmission: 1.0,
                    transparent: true,
                    thickness: 1.0, // Adds volume
                    envMap: scene.environment,
                    envMapIntensity: 2.0,
                    ior: 2.417,
                    specularIntensity: 1.0, 
                    clearcoat: 1.0,
                    clearcoatRoughness: 0.05,
                    attenuationColor: new THREE.Color(0x2222ff), // Subtle blue "fire"
                    attenuationDistance: 1.0, // Light absorbs over this distance
                    side: THREE.DoubleSide
                });
                child.material = gemMaterial;
            }
        });
      }

      scene.add(model);

      const newBox = new THREE.Box3().setFromObject(model);
      const newSize = newBox.getSize(new THREE.Vector3());
      const newCenter = newBox.getCenter(new THREE.Vector3());
      const fov = camera.fov * (Math.PI / 180);
      const cameraDistance = Math.abs(
        newSize.length() / (2 * Math.tan(fov / 2))
      );

      camera.position.copy(newCenter);
      camera.position.z += cameraDistance * 1.2;
      camera.lookAt(newCenter);
      controls.target.copy(newCenter);
      controls.update();
    },
    function (xhr) {
      const loadingText = `Loading Model... ${Math.round(
        (xhr.loaded / xhr.total) * 100
      )}%`;
      if (container.querySelector('.loading-text')) {
        container.querySelector('.loading-text').textContent = loadingText;
      }
    },
    function (error) {
      console.error('Error loading model:', error);
      container.innerHTML = `<div class="text-white text-center flex items-center justify-center h-full bg-red-800/50 rounded-lg p-4">Failed to load 3D model.</div>`;
    }
  );

  function animate() {
    if (!renderer) return;
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

// Function to initialize the Virtual Tour (360 Sphere)
function initTourViewer(container, imageUrl) {
  if (!THREE) {
    console.error('THREE.js is not loaded');
    container.innerHTML = `<div class="text-white text-center flex items-center justify-center h-full bg-red-800/50 rounded-lg p-4">THREE.js library failed to load.</div>`;
    return;
  }

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  camera.position.set(0, 0, 0.1);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const geometry = new THREE.SphereGeometry(500, 60, 40);
  geometry.scale(-1, 1, 1);

  const loader = new THREE.TextureLoader();
  // Allow Cross-Origin Resource Sharing for external images
  loader.setCrossOrigin('anonymous');

  loader.load(
    imageUrl,
    (texture) => {
      const material = new THREE.MeshBasicMaterial({ map: texture });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
    },
    (xhr) => {
      const loadingText = `Loading 360° View... ${Math.round(
        (xhr.loaded / xhr.total) * 100
      )}%`;
      const loadingEl = document.getElementById('tour-loading-text');
      if (loadingEl) {
        loadingEl.innerHTML = `<div class="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-2"></div><span>Loading 360° View... ${Math.round((xhr.loaded / xhr.total) * 100)}%</span>`;
      }
    },
    (error) => {
      console.error('Error loading 360 texture:', error);
      container.innerHTML = `<div class="text-white text-center flex flex-col items-center justify-center h-full bg-red-800/50 rounded-lg p-4">
        <p class="font-bold text-lg mb-2">Failed to load 360° image.</p>
        <p class="text-sm text-red-200">The image URL is blocked by CORS policy or 404.</p>
        <p class="text-xs mt-2 text-gray-300 break-all bg-black/30 p-2 rounded">${imageUrl}</p>
      </div>`;
    }
  );

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.rotateSpeed = -0.25;
  controls.enableZoom = false;
  controls.enablePan = false;

  function animate() {
    if (!renderer) return;
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
  if (camera && renderer && document.getElementById('tourModal').classList.contains('flex')) {
      const container = document.getElementById('tour-viewer-container');
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
  }
}

function destroy3DViewer() {
  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
    renderer = null;
    scene = null;
    camera = null;
    controls = null;
    window.removeEventListener('resize', onWindowResize);
  }
}

// --- SKELETON LOADER ---
function renderSkeletons(containerId, count = 4) {
  const container = document.getElementById(containerId);
  // Safety check
  if (!container) return;
  
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const skeleton = document.createElement('div');
    skeleton.className = 'bg-white rounded-xl shadow-md overflow-hidden border border-gray-100 h-96 animate-pulse';
    skeleton.innerHTML = `
      <div class="h-56 bg-gray-200 w-full skeleton"></div>
      <div class="p-5 space-y-3">
        <div class="h-6 bg-gray-200 rounded w-3/4 skeleton"></div>
        <div class="h-4 bg-gray-200 rounded w-1/2 skeleton"></div>
        <div class="h-20 bg-gray-200 rounded w-full skeleton mt-4"></div>
      </div>
    `;
    container.appendChild(skeleton);
  }
}


// --- UI RENDERING ---
function renderArtifacts(artifactsToRender) {
  const artifactsGrid = document.getElementById('artifactsGrid');
  if (!artifactsGrid) return; 

  artifactsGrid.innerHTML = '';
  if (artifactsToRender.length === 0 && allArtifacts.length > 0) {
    document.getElementById('no-results').classList.remove('hidden');
  } else {
    document.getElementById('no-results').classList.add('hidden');
  }

  artifactsToRender.forEach((artifact, index) => {
    const card = document.createElement('div');
    // Added AOS attributes for scroll animation
    card.className = 'artifact-card bg-white rounded-xl shadow-md overflow-hidden border border-gray-100 cursor-pointer h-full flex flex-col group';
    card.dataset.aos = 'fade-up';
    card.dataset.aosDelay = (index * 50).toString(); // Staggered animation
    card.dataset.id = artifact.id;
    
    card.innerHTML = `
            <div class="h-64 flex items-center justify-center bg-gray-50 rounded-t-lg overflow-hidden p-2">
                <img src="${artifact.image}" alt="${
      artifact.title
    }" class="object-contain max-h-full max-w-full rounded-lg shadow-sm" onerror="this.onerror=null;this.src='https://placehold.co/600x600/ccc/FFFFFF?text=Image+Not+Found';">
                ${artifact.has3dModel ? '<span class="absolute top-3 right-3 bg-white/90 backdrop-blur-sm text-orange-700 text-xs font-bold px-3 py-1 rounded-full shadow-sm z-20 border border-orange-100 flex items-center gap-1"><span>🧊</span> 3D Model</span>' : ''}
            </div>
            <div class="p-5 flex-grow flex flex-col">
                <div class="text-xs font-bold tracking-wider text-orange-600 uppercase mb-1">${artifact.category}</div>
                <h3 class="text-xl font-bold font-lora text-gray-900 mb-1 group-hover:text-orange-700 transition-colors">${artifact.title}</h3>
                <p class="text-sm text-gray-500 mb-3 flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    ${artifact.period}
                </p>
                <p class="text-gray-600 text-sm line-clamp-3 leading-relaxed">${artifact.description}</p>
            </div>
        `;
    card.addEventListener('click', () => showArtifactModal(artifact.id));
    artifactsGrid.appendChild(card);
  });
}

function renderTours(toursToRender) {
    const toursGrid = document.getElementById('toursGrid');
    if (!toursGrid) return;

    toursGrid.innerHTML = '';

    if (toursToRender.length === 0) {
        return; 
    }

    toursToRender.forEach((tour, index) => {
        const card = document.createElement('div');
        card.className = 'tour-card bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100 cursor-pointer transform transition-all duration-300 hover:-translate-y-2 hover:shadow-xl group';
        card.dataset.aos = 'fade-up';
        card.dataset.aosDelay = (index * 100).toString();
        card.dataset.tourName = tour.title;
        card.dataset.tourImageUrl = tour.tour360Url;
        card.dataset.tourDescription = tour.description;

        card.innerHTML = `
            <div class="h-64 flex items-center justify-center bg-gray-50 rounded-t-lg overflow-hidden p-2">
                <img src="${tour.thumbnail}" alt="${tour.title}" class="object-contain max-h-full max-w-full rounded-lg shadow-sm">
            </div>
            <div class="p-6">
                <h3 class="text-xl font-bold font-lora">${tour.title}</h3>
                <p class="text-gray-600 mt-2 line-clamp-3">${tour.description}</p>
            </div>
        `;
        toursGrid.appendChild(card);
    });
    
    setupTourCardListeners();
}


function renderCategories() {
  const categories = ['All', ...new Set(allArtifacts.map((a) => a.category))];
  const categoryFilters = document.getElementById('categoryFilters');
  if (!categoryFilters) return;

  categoryFilters.innerHTML = '';
  categories.forEach((category, index) => {
    const button = document.createElement('button');
    button.textContent = category;
    button.className = `category-btn px-6 py-2 border rounded-full text-sm font-semibold transition-all duration-300 ${
      currentFilter === category 
        ? 'active bg-gradient-to-r from-orange-600 to-red-600 text-white border-transparent shadow-lg scale-105' 
        : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-600 hover:shadow-sm'
    }`;
    button.dataset.aos = "fade-down";
    button.dataset.aosDelay = (index * 50).toString();
    
    button.dataset.category = category;
    button.addEventListener('click', () => {
      currentFilter = category;
      document.querySelectorAll('.category-btn').forEach((btn) => {
        btn.classList.remove('active', 'bg-gradient-to-r', 'from-orange-600', 'to-red-600', 'text-white', 'border-transparent', 'shadow-lg', 'scale-105');
        btn.classList.add('bg-white', 'text-gray-600', 'border-gray-200', 'hover:border-orange-300', 'hover:text-orange-600');
      });
      button.classList.remove('bg-white', 'text-gray-600', 'border-gray-200', 'hover:border-orange-300', 'hover:text-orange-600');
      button.classList.add('active', 'bg-gradient-to-r', 'from-orange-600', 'to-red-600', 'text-white', 'border-transparent', 'shadow-lg', 'scale-105');
      filterAndRender();
    });
    categoryFilters.appendChild(button);
  });
}

// --- MODAL LOGIC ---
function showArtifactModal(id) {
  const artifact = allArtifacts.find((a) => a.id === id);
  if (!artifact) return;
  destroy3DViewer();

  const modalContent = document.getElementById('modalContent');
  
  let mediaContent = '';
  if (artifact.has3dModel && artifact.modelUrl && artifact.modelUrl.trim() !== '') {
      mediaContent = `<div id="three-d-viewer" class="w-full h-[400px] bg-gray-900 rounded-xl shadow-inner relative overflow-hidden">
                        <div class="absolute inset-0 flex items-center justify-center text-white">
                             <div class="flex flex-col items-center">
                                <div class="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                <span class="text-sm">Loading Model...</span>
                             </div>
                        </div>
                      </div>`;
  } else {
      mediaContent = `<div class="w-full h-[400px] bg-gray-50 rounded-xl flex items-center justify-center p-4 shadow-inner">
                        <img src="${artifact.image}" alt="${artifact.title}" class="max-w-full max-h-full object-contain rounded-lg shadow-md">
                      </div>`;
  }

  modalContent.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div class="order-2 lg:order-1">
                ${mediaContent}
                <p class="text-xs text-center text-gray-400 mt-2 italic">Use mouse to rotate/zoom (if 3D)</p>
            </div>
            <div class="order-1 lg:order-2 flex flex-col h-full justify-center">
                <div class="mb-4">
                    <span class="inline-block px-3 py-1 bg-orange-100 text-orange-800 text-xs font-bold tracking-wide uppercase rounded-full mb-2">${artifact.category}</span>
                    <h2 class="text-4xl font-bold font-lora text-gray-900 leading-tight">${artifact.title}</h2>
                </div>
                <div class="flex items-center gap-2 text-gray-500 mb-6 border-b border-gray-100 pb-4">
                    <span class="text-xl">🕰️</span>
                    <span class="font-medium font-lora italic text-lg">${artifact.period}</span>
                </div>
                <div class="prose prose-orange text-gray-600 leading-relaxed">
                    ${artifact.description}
                </div>
            </div>
        </div>`;

  document.getElementById('artifactModal').classList.replace('hidden', 'flex');
  document.getElementById('artifactModal').querySelector('div').classList.remove('scale-95', 'opacity-0');
  document.getElementById('artifactModal').querySelector('div').classList.add('scale-100', 'opacity-100');

  if (artifact.has3dModel && artifact.modelUrl && artifact.modelUrl.trim() !== '') {
      const isDiamond = (artifact.title && artifact.title.toLowerCase().includes('diamond')) || 
                        (artifact.description && artifact.description.toLowerCase().includes('diamond'));
      
      setTimeout(() => {
        init3DViewer(document.getElementById('three-d-viewer'), artifact.modelUrl, isDiamond);
      }, 300);
  }
}

// --- FIRESTORE & AUTHENTICATION LOGIC ---
function setupFirestoreListeners() {
  
  renderSkeletons('artifactsGrid', 4);
  renderSkeletons('toursGrid', 3);

  onSnapshot(
    artifactsCollectionRef,
    (snapshot) => {
      allArtifacts = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      if (snapshot.empty && !window.hasSeededArtifacts) {
        window.hasSeededArtifacts = true;
        seedArtifactsDatabase();
      }
      
      document.getElementById('loading-state')?.classList.add('hidden');
      
      filterAndRender();
      renderCategories();
      renderAdminArtifactList();
    },
    (error) => {
      console.error('Firestore Snapshot Error (Artifacts): ', error);
    }
  );

  onSnapshot(
      toursCollectionRef,
      (snapshot) => {
          allTours = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
          }));

          if(snapshot.empty && !window.hasSeededTours) {
              window.hasSeededTours = true;
              seedToursDatabase();
          }

          renderTours(allTours);
          renderAdminTourList();
      },
      (error) => {
          console.error("Error fetching tours:", error);
      }
  );
}

// --- CMS LOGIC ---
function setupFormHandlers() {
  const artifactForm = document.getElementById('artifact-form');
  if (artifactForm) {
    artifactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('artifact-id').value;
        const artifactData = {
        title: document.getElementById('title').value,
        category: document.getElementById('category').value,
        period: document.getElementById('period').value,
        image: document.getElementById('image').value,
        description: document.getElementById('description').value,
        has3dModel: document.getElementById('has3dModel').checked,
        modelUrl: document.getElementById('modelUrl').value,
        };
        if (id) {
        await setDoc(doc(db, artifactsCollectionRef.path, id), artifactData);
        } else {
        await addDoc(artifactsCollectionRef, artifactData);
        }
        artifactForm.reset();
        cancelArtifactEditMode();
    });
  }

  const tourForm = document.getElementById('tour-form');
  if (tourForm) {
    tourForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('tour-id').value;
        const tourData = {
            title: document.getElementById('tour-title').value,
            thumbnail: document.getElementById('tour-thumb').value,
            tour360Url: document.getElementById('tour-360-url').value,
            description: document.getElementById('tour-desc').value
        };

        if (id) {
            await setDoc(doc(db, toursCollectionRef.path, id), tourData);
        } else {
            await addDoc(toursCollectionRef, tourData);
        }
        tourForm.reset();
        cancelTourEditMode();
    });
  }
}

// --- ARTIFACT ADMIN FUNCTIONS ---
function enterArtifactEditMode(artifact) {
  document.getElementById('artifact-id').value = artifact.id;
  document.getElementById('title').value = artifact.title;
  document.getElementById('category').value = artifact.category;
  document.getElementById('period').value = artifact.period;
  document.getElementById('image').value = artifact.image;
  document.getElementById('description').value = artifact.description;
  document.getElementById('has3dModel').checked = artifact.has3dModel || false;
  document.getElementById('modelUrl').value = artifact.modelUrl || '';
  document.getElementById('form-title').textContent = 'Edit Artifact';
  document.getElementById('submit-btn').textContent = 'Update Artifact';
  document.getElementById('cancel-edit-btn').classList.remove('hidden');
  window.scrollTo(0, 0);
}

function cancelArtifactEditMode() {
  const artifactForm = document.getElementById('artifact-form');
  artifactForm.reset();
  document.getElementById('artifact-id').value = '';
  document.getElementById('modelUrl').value = '';
  document.getElementById('form-title').textContent = 'Add New Artifact';
  document.getElementById('submit-btn').textContent = 'Add Artifact';
  document.getElementById('cancel-edit-btn').classList.add('hidden');
}

function renderAdminArtifactList() {
  const adminArtifactsList = document.getElementById('admin-artifacts-list');
  if (!adminArtifactsList) return;

  adminArtifactsList.innerHTML = '';
  allArtifacts.forEach((artifact) => {
    const item = document.createElement('div');
    item.className = 'flex justify-between items-center bg-gray-50 p-4 rounded-lg border border-gray-100 hover:shadow-sm transition-shadow';
    item.innerHTML = `
      <div class="flex items-center gap-4">
         <img src="${artifact.image}" class="w-12 h-12 rounded-md object-cover bg-gray-100">
         <div>
             <p class="font-bold text-gray-800">${artifact.title}</p>
             <p class="text-xs text-gray-500">${artifact.category}</p>
         </div>
      </div>
      <div class="flex gap-2">
         <button class="edit-artifact-btn bg-blue-100 text-blue-700 py-1 px-3 rounded-md text-sm font-medium hover:bg-blue-200 transition-colors" data-id="${artifact.id}">Edit</button>
         <button class="delete-artifact-btn bg-red-100 text-red-700 py-1 px-3 rounded-md text-sm font-medium hover:bg-red-200 transition-colors" data-id="${artifact.id}">Delete</button>
      </div>`;
    adminArtifactsList.appendChild(item);
  });
}

// --- TOUR ADMIN FUNCTIONS ---
function enterTourEditMode(tour) {
    document.getElementById('tour-id').value = tour.id;
    document.getElementById('tour-title').value = tour.title;
    document.getElementById('tour-thumb').value = tour.thumbnail;
    document.getElementById('tour-360-url').value = tour.tour360Url;
    document.getElementById('tour-desc').value = tour.description;
    
    document.getElementById('tour-form-title').textContent = 'Edit Virtual Tour';
    document.getElementById('submit-tour-btn').textContent = 'Update Tour';
    document.getElementById('cancel-tour-edit-btn').classList.remove('hidden');
}

function cancelTourEditMode() {
    document.getElementById('tour-form').reset();
    document.getElementById('tour-id').value = '';
    document.getElementById('tour-form-title').textContent = 'Add New Virtual Tour';
    document.getElementById('submit-tour-btn').textContent = 'Add Tour';
    document.getElementById('cancel-tour-edit-btn').classList.add('hidden');
}

function renderAdminTourList() {
    const list = document.getElementById('admin-tours-list');
    if (!list) return;

    list.innerHTML = '';
    allTours.forEach(tour => {
        const item = document.createElement('div');
        item.className = 'flex justify-between items-center bg-gray-50 p-4 rounded-lg border border-gray-100 hover:shadow-sm transition-shadow';
        item.innerHTML = `
            <div class="flex items-center gap-4">
                <img src="${tour.thumbnail}" class="w-12 h-12 rounded-md object-cover bg-gray-100">
                <p class="font-bold text-gray-800">${tour.title}</p>
            </div>
            <div class="flex gap-2">
                <button class="edit-tour-btn bg-blue-100 text-blue-700 py-1 px-3 rounded-md text-sm font-medium hover:bg-blue-200 transition-colors" data-id="${tour.id}">Edit</button>
                <button class="delete-tour-btn bg-red-100 text-red-700 py-1 px-3 rounded-md text-sm font-medium hover:bg-red-200 transition-colors" data-id="${tour.id}">Delete</button>
            </div>`;
        list.appendChild(item);
    });
}


// --- SEEDING FUNCTIONS ---
async function seedArtifactsDatabase() {
  try {
    const seedArtifacts = [
      {
        title: 'Chola Bronze Nataraja',
        category: 'Sculpture',
        period: 'Chola Dynasty, 11th Century',
        description:
          'This exquisite bronze sculpture depicts Shiva as Nataraja...',
        image: 'https://placehold.co/600x600/a16207/FFFFFF?text=Nataraja',
        has3dModel: false,
        modelUrl: '',
      },
      {
        title: 'Bani Thani',
        category: 'Painting',
        period: 'Kishangarh School, c. 1750',
        description:
          "Often called India's 'Mona Lisa', this miniature painting...",
        image: 'https://placehold.co/600x600/f7b538/FFFFFF?text=Bani+Thani',
        has3dModel: false,
        modelUrl: '',
      },
      {
        title: 'Indus Valley Seal',
        category: 'Artifact',
        period: 'Indus Valley Civilization, c. 2500 BC',
        description: 'A steatite seal from the ancient city of Mohenjo-daro...',
        image: 'https://placehold.co/600x600/7f5539/FFFFFF?text=Indus+Seal',
        has3dModel: true,
        modelUrl: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
      },
      {
        title: 'Ashoka Pillar',
        category: 'Architecture',
        period: 'Mauryan Empire, 3rd Century BC',
        description: 'The pillars of Ashoka are a series of columns...',
        image: 'https://placehold.co/600x600/b08968/FFFFFF?text=Ashoka+Pillar',
        has3dModel: false,
        modelUrl: '',
      },
    ];
    const batch = writeBatch(db);
    seedArtifacts.forEach((artifact) => {
      batch.set(doc(artifactsCollectionRef), artifact);
    });
    await batch.commit();
  } catch (error) {
    console.error('Error seeding artifacts: ', error);
  }
}

async function seedToursDatabase() {
    try {
        // Using 100% Reliable CORS-Enabled URLs from GitHub Raw.
        const hampiUrl = 'https://raw.githubusercontent.com/aframevr/aframe/master/examples/boilerplate/panorama/puydesancy.jpg';
        const ajantaUrl = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/2294472375_24a3b8ef46_o.jpg';
        const konarkUrl = 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/kandao3.jpg';

        const seedTours = [
            {
                title: 'The Ruins of Hampi',
                thumbnail: 'https://placehold.co/600x400/8d5b4c/FFFFFF?text=Hampi,+Karnataka',
                tour360Url: hampiUrl,
                description: 'Journey through the magnificent ruins of the Vijayanagara Empire.'
            },
            {
                title: 'Ajanta & Ellora Caves',
                thumbnail: 'https://placehold.co/600x400/3e3c3c/FFFFFF?text=Ajanta+Caves',
                tour360Url: ajantaUrl,
                description: 'Explore the ancient rock-cut caves featuring masterpieces of Buddhist art.'
            },
            {
                title: 'Konark Sun Temple',
                thumbnail: 'https://placehold.co/600x400/a17f64/FFFFFF?text=Konark+Sun+Temple',
                tour360Url: konarkUrl,
                description: 'Witness the architectural marvel of the giant stone chariot dedicated to the Sun God.'
            }
        ];
        const batch = writeBatch(db);
        seedTours.forEach(tour => {
            batch.set(doc(toursCollectionRef), tour);
        });
        await batch.commit();
        console.log("Seeded Tours V4");
    } catch (error) {
        console.error("Error seeding tours:", error);
    }
}

// --- AUTHENTICATION INIT ---
const initAuth = async () => {
  if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
    await signInWithCustomToken(auth, __initial_auth_token);
  } else {
    await signInAnonymously(auth);
  }
};

initAuth();

onAuthStateChanged(auth, (user) => {
  if (user) {
    setupFirestoreListeners();
  } else {
    console.log('Authentication not ready yet.');
  }
});

// --- NEW: CHATBOT FUNCTIONS ---

// Simple markdown to HTML
function formatText(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // bold
        .replace(/\n/g, '<br>'); // newlines
}

// Adds a message to the chat window
function addMessageToChat(role, message) {
    const chatMessages = document.getElementById('chat-messages');
    
    // Remove any existing loading bubble
    const loadingEl = document.getElementById('loading-bubble');
    if (loadingEl) {
        loadingEl.remove();
    }

    const msgDiv = document.createElement('div');
    
    if (message === 'loading') {
        msgDiv.id = 'loading-bubble';
        msgDiv.className = 'flex justify-start';
        msgDiv.innerHTML = `<div class="chat-bubble-bot p-3 rounded-lg max-w-xs"><span class="loading-dots">Thinking</span></div>`;
    } else {
        const bubbleClass = role === 'user' ? 'chat-bubble-user ml-auto' : 'chat-bubble-bot';
        const justifyClass = role === 'user' ? 'justify-end' : 'justify-start';
        
        msgDiv.className = `flex ${justifyClass}`;
        msgDiv.innerHTML = `<div class="${bubbleClass} p-3 rounded-xl max-w-xs shadow-sm">${formatText(message)}</div>`;
    }
    
    chatMessages.appendChild(msgDiv);
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Handles sending the message to the AI
async function handleSendMessage() {
    const chatInput = document.getElementById('chat-input');
    const userQuery = chatInput.value.trim();
    if (userQuery === '') return;

    addMessageToChat('user', userQuery);
    chatInput.value = '';
    addMessageToChat('bot', 'loading');

    try {
        const botText = await getBotResponse(userQuery);
        addMessageToChat('bot', botText);
    } catch (error) {
        console.error("Gemini API Error:", error);
        addMessageToChat('bot', "Sorry, I'm having trouble connecting to my brain right now. Please try again in a moment.");
    }
}

// Gets response from Gemini API
async function getBotResponse(userQuery) {
    // ============================= FIX =============================
    // 1. Get your API key from Google AI Studio: https://aistudio.google.com/app/apikey
    // 2. Paste your key between the quotes.
    const apiKey = "AIzaSyDuBeUF9Lsms_M6C5IW_KUWfyqeRYciZ9U"; // <-- PASTE YOUR API KEY HERE
    // ===============================================================

    // FIX: Check if the key is missing (for local testing)
    if (apiKey === "") {
        return "API Key is missing. Please add your Gemini API key to `app.js` in the `getBotResponse` function to test the chatbot locally.";
    }
    
    // UPDATED: Using the correct, specified model
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const systemPrompt = `You are "Echo," an expert AI travel guide for the "Echoes of the Past" digital archive website.
    Your mission is to help users plan exciting and practical trips to Indian heritage sites.
    
    RULES:
    1.  **Be Friendly & Expert:** Act like a knowledgeable and enthusiastic tour guide.
    2.  **Use Real-Time Data:** Use the provided Google Search tool to find practical, up-to-date information (e.g., "best time to visit Hampi," "Ajanta caves ticket price," "how to get from Mumbai to Ellora").
    3.  **Promote the Website:** When relevant, mention that they can explore the "360° Panoramic Views" or "Artifact Archives" on this website to get excited about their trip.
    4.  **Formatting (CRITICAL):**
        * **DO NOT** use markdown tables (e.g., | Day | ... |). They are hard to read.
        * **DO** format itineraries line-by-line with emojis.
        * **Good Example:**
            **📅 Day 1: Iconic Monuments**
            * 🏛️ **Must-See:** Eiffel Tower, Arc de Triomphe
            * ✨ **Highlight:** Evening Seine river cruise
            * 💡 **Tip:** Book Eiffel Tower tickets in advance!
        * Use **bold text** (\`**text**\`) for headings and important words.`;

            const payload = {
              contents: [
                {
                  parts: [{ text: userQuery }]
                }
              ]
            };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
    }

    const result = await response.json();
    const botText = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!botText) {
        throw new Error("No text response from API.");
    }
    
    return botText;
}


// --- Event Listeners ---
function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', filterAndRender);
  }

  const mobileMenuBtn = document.getElementById('mobile-menu-button');
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      document.getElementById('mobile-menu').classList.toggle('hidden');
    });
  }

  const closeModalBtn = document.getElementById('closeModal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      document
        .getElementById('artifactModal')
        .classList.replace('flex', 'hidden');
      destroy3DViewer();
    });
  }

  const adminLoginBtn = document.getElementById('admin-login-btn');
  if (adminLoginBtn) {
    adminLoginBtn.addEventListener('click', () =>
      document
        .getElementById('adminLoginModal')
        .classList.replace('hidden', 'flex')
    );
  }

  const cancelLoginBtn = document.getElementById('cancel-login-btn');
  if (cancelLoginBtn) {
    cancelLoginBtn.addEventListener('click', () =>
      document
        .getElementById('adminLoginModal')
        .classList.replace('flex', 'hidden')
    );
  }

  const submitLoginBtn = document.getElementById('submit-login-btn');
  if (submitLoginBtn) {
    submitLoginBtn.addEventListener('click', () => {
      const adminPasswordField = document.getElementById('admin-password');
      if (adminPasswordField.value === 'admin123') {
        document
          .getElementById('adminLoginModal')
          .classList.replace('flex', 'hidden');
        document.getElementById('main-app').classList.add('hidden');
        document.getElementById('admin-panel').classList.remove('hidden');
        adminPasswordField.value = '';
        document.getElementById('login-error').classList.add('hidden');
      } else {
        document.getElementById('login-error').classList.remove('hidden');
      }
    });
  }

  document.getElementById('admin-logout-btn').addEventListener('click', () => {
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('admin-panel').classList.add('hidden');
    currentFilter = 'All';
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.category-btn').forEach((btn) => {
      btn.classList.remove('active', 'bg-orange-600', 'text-white');
      btn.classList.add('bg-white', 'hover:bg-orange-100');
      if (btn.dataset.category === 'All') {
        btn.classList.add('active', 'bg-orange-600', 'text-white');
        btn.classList.remove('bg-white', 'hover:bg-orange-100');
      }
    });
    filterAndRender();
  });

  const tabArtifacts = document.getElementById('tab-artifacts');
  const tabTours = document.getElementById('tab-tours');
  const viewArtifacts = document.getElementById('admin-artifacts-view');
  const viewTours = document.getElementById('admin-tours-view');

  if (tabArtifacts && tabTours && viewArtifacts && viewTours) {
    tabArtifacts.addEventListener('click', () => {
        tabArtifacts.classList.add('text-orange-600', 'border-b-2', 'border-orange-600');
        tabArtifacts.classList.remove('text-gray-500');
        tabTours.classList.remove('text-orange-600', 'border-b-2', 'border-orange-600');
        tabTours.classList.add('text-gray-500');
        
        viewArtifacts.classList.remove('hidden');
        viewTours.classList.add('hidden');
    });

    tabTours.addEventListener('click', () => {
        tabTours.classList.add('text-orange-600', 'border-b-2', 'border-orange-600');
        tabTours.classList.remove('text-gray-500');
        tabArtifacts.classList.remove('text-orange-600', 'border-b-2', 'border-orange-600');
        tabArtifacts.classList.add('text-gray-500');

        viewTours.classList.remove('hidden');
        viewArtifacts.classList.add('hidden');
    });
  }

  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  if (cancelEditBtn) {
      cancelEditBtn.addEventListener('click', cancelArtifactEditMode);
  }

  const cancelTourEditBtn = document.getElementById('cancel-tour-edit-btn');
  if (cancelTourEditBtn) {
      cancelTourEditBtn.addEventListener('click', cancelTourEditMode);
  }

  const adminArtifactsList = document.getElementById('admin-artifacts-list');
  if (adminArtifactsList) {
    adminArtifactsList.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      if (e.target.classList.contains('delete-artifact-btn')) {
        if (!id || !confirm('Delete this artifact?')) return;
        try { await deleteDoc(doc(db, artifactsCollectionRef.path, id)); } catch (e) { console.error(e); }
      }
      if (e.target.classList.contains('edit-artifact-btn')) {
        const item = allArtifacts.find((a) => a.id === id);
        if (item) enterArtifactEditMode(item);
      }
    });
  }

  const adminToursList = document.getElementById('admin-tours-list');
  if (adminToursList) {
    adminToursList.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        if(e.target.classList.contains('delete-tour-btn')) {
            if(!id || !confirm("Delete this tour?")) return;
            try { await deleteDoc(doc(db, toursCollectionRef.path, id)); } catch(e) { console.error(e); }
        }
        if(e.target.classList.contains('edit-tour-btn')) {
            const item = allTours.find(t => t.id === id);
            if(item) enterTourEditMode(item);
        }
    });
  }

  const closeTourModalBtn = document.getElementById('closeTourModal');
  if (closeTourModalBtn) {
    closeTourModalBtn.addEventListener('click', () => {
        document.getElementById('tourModal').classList.replace('flex', 'hidden');
        destroy3DViewer();
    });
  }

  // --- NEW: CHATBOT EVENT LISTENERS (Corrected) ---
  const chatButton = document.getElementById('chat-toggle-button');
  const chatContainer = document.getElementById('chat-window-container'); // Targets the overlay
  const chatWindow = document.getElementById('chat-window'); // Targets the inner modal
  const chatCloseBtn = document.getElementById('chat-close-button');
  const chatSendBtn = document.getElementById('chat-send-button');
  const chatInput = document.getElementById('chat-input');

  if (chatButton && chatContainer && chatWindow && chatCloseBtn && chatSendBtn && chatInput) {
      
      // OPEN CHAT
      chatButton.addEventListener('click', () => {
          chatContainer.classList.remove('hidden');
          setTimeout(() => { // Start animation
              chatContainer.classList.remove('opacity-0');
              chatWindow.classList.remove('opacity-0', 'scale-95');
          }, 10);
      });

      // CLOSE CHAT
      const closeChat = () => {
          chatContainer.classList.add('opacity-0');
          chatWindow.classList.add('opacity-0', 'scale-95');
          setTimeout(() => { // Wait for animation
              chatContainer.classList.add('hidden');
          }, 300);
      };
      
      chatCloseBtn.addEventListener('click', closeChat);
      chatContainer.addEventListener('click', (e) => {
          // Close if clicking on the background overlay, but not the window itself
          if (e.target === chatContainer) {
              closeChat();
          }
      });

      // SEND MESSAGE
      chatSendBtn.addEventListener('click', handleSendMessage);
      chatInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) { // Send on Enter, not Shift+Enter
              e.preventDefault();
              handleSendMessage();
          }
      });
  }
}

function setupTourCardListeners() {
  document.querySelectorAll('.tour-card').forEach((card) => {
    card.addEventListener('click', () => {
      const tourName = card.dataset.tourName;
      const tourImage = card.dataset.tourImageUrl;
      
      if (!tourImage) {
        alert("Tour image not configured.");
        return;
      }

      document.getElementById('tourModalTitle').textContent = tourName;
      const loadingEl = document.getElementById('tour-loading-text');
      if(loadingEl) loadingEl.textContent = 'Loading 360° View...';

      document.getElementById('tourModal').classList.replace('hidden', 'flex');

      setTimeout(() => {
        initTourViewer(
          document.getElementById('tour-viewer-container'),
          tourImage
        );
      }, 50);
    });
  });
}

function filterAndRender() {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;
  const searchTerm = searchInput.value.toLowerCase();
  let filteredArtifacts = allArtifacts;
  if (currentFilter !== 'All') {
    filteredArtifacts = filteredArtifacts.filter(
      (a) => a.category === currentFilter
    );
  }
  if (searchTerm) {
    filteredArtifacts = filteredArtifacts.filter(
      (a) =>
        a.title.toLowerCase().includes(searchTerm) ||
        a.description.toLowerCase().includes(searchTerm)
    );
  }
  renderArtifacts(filteredArtifacts);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

function initApp() {
  if (typeof window.THREE === 'undefined') {
    console.error('THREE.js library is not loaded.');
    return;
  }
  setupFormHandlers();
  setupEventListeners();
}