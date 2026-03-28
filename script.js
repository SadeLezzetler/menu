// Main application state
let menuData = null;
let currentFilter = 'all';

/* ============================================
   ORDER MODE SYSTEM (online / restaurant)
   ============================================ */

// Read ?type=online or ?type=restaurant from URL; default to 'restaurant'
function getOrderMode() {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    return type === 'online' ? 'online' : 'restaurant';
}

// Cached order mode — set once at page load
const orderMode = getOrderMode();

// Return the correct price for the current order mode
function getPrice(item) {
    if (orderMode === 'online') {
        return item.priceOnline !== undefined ? item.priceOnline : item.priceRestaurant;
    }
    return item.priceRestaurant !== undefined ? item.priceRestaurant : item.priceOnline;
}

/* ============================================
   LANGUAGE / TRANSLATION SYSTEM
   ============================================ */

let currentLanguage = localStorage.getItem('language') || 'tr';
let translations = {};

// Load translations from JSON file
async function loadTranslations() {
    try {
        const response = await fetch('translations.json');
        if (!response.ok) throw new Error('Translations could not be loaded');
        translations = await response.json();
    } catch (error) {
        console.error('Error loading translations:', error);
        translations = {};
    }
}

// Get a translated string by dot-notation path, with optional fallback
function getTranslation(path, fallback) {
    const keys = path.split('.');
    let obj = translations[currentLanguage];
    for (const key of keys) {
        if (obj == null) return fallback !== undefined ? fallback : path;
        obj = obj[key];
    }
    return (obj !== undefined && obj !== null) ? obj : (fallback !== undefined ? fallback : path);
}

// Switch the active language and refresh all UI text
function setLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang;

    // Update the language switcher button to show the OTHER language
    const btn = document.getElementById('languageSwitcher');
    if (btn) btn.textContent = lang === 'tr' ? 'EN' : 'TR';

    // Update all static DOM text
    updateStaticText();

    // Re-render all dynamic content
    if (menuData) {
        createCategoryNav();
        renderMenu();
    }
    createFilterOptions();
    createPriceFilters();
}

// Update static DOM elements with translated strings
function updateStaticText() {
    // Header tagline
    const tagline = document.querySelector('.header .tagline');
    if (tagline) tagline.textContent = getTranslation('header.tagline');

    // Filter toggle button text
    const filterText = document.querySelector('#filterToggleBtn .filter-text');
    if (filterText) filterText.textContent = getTranslation('filters.toggleBtn');

    // Filter drawer header
    const drawerTitle = document.querySelector('.filter-drawer-header h3');
    if (drawerTitle) drawerTitle.textContent = getTranslation('filters.title');

    // Accordion toggle labels
    const proteinToggle = document.querySelector('#proteinToggle span:first-child');
    if (proteinToggle) proteinToggle.textContent = getTranslation('filters.protein');

    const carbToggle = document.querySelector('#carbToggle span:first-child');
    if (carbToggle) carbToggle.textContent = getTranslation('filters.carb');

    const allergenToggle = document.querySelector('#allergenToggle span:first-child');
    if (allergenToggle) allergenToggle.textContent = getTranslation('filters.allergen');

    // Price range section title
    const priceTitle = document.querySelector('.filter-section-title');
    if (priceTitle) priceTitle.textContent = getTranslation('filters.priceRange');

    // Allergen note
    const allergenNote = document.querySelector('.allergen-note');
    if (allergenNote) allergenNote.textContent = getTranslation('filters.allergenNote');

    // Footer buttons
    const clearBtn = document.getElementById('filterClearBtn');
    if (clearBtn) clearBtn.textContent = getTranslation('buttons.clear');

    const applyBtn = document.getElementById('filterApplyBtn');
    if (applyBtn) applyBtn.textContent = getTranslation('buttons.apply');

    // Warning banner
    const warningText = document.querySelector('.warning-text');
    if (warningText) {
        warningText.innerHTML = `<strong>${getTranslation('warning.important')}</strong> ${getTranslation('warning.celiac')}`;
    }

    // Footer
    const footerMain = document.querySelector('.footer p:first-child');
    if (footerMain) footerMain.textContent = getTranslation('footer.text');

    // Scroll-to-top aria-label
    const scrollBtn = document.getElementById('scrollToTop');
    if (scrollBtn) scrollBtn.setAttribute('aria-label', getTranslation('scrollToTop'));

    // Modal close aria-label
    const modalClose = document.getElementById('modalClose');
    if (modalClose) modalClose.setAttribute('aria-label', getTranslation('modalClose'));
}

const activeFilters = {
    protein: [],
    carb: [],
    allergens: [],
    price: 'all'
};

/* ============================================
   MANUAL FILTER GROUPS
   ============================================ */

const FILTER_GROUPS = {
    protein: [
        { id: 'tavuk', name: 'Tavuk', icon: '🍗' },
        { id: 'et', name: 'Et', icon: '🥩' },
        { id: 'balik', name: 'Balık', icon: '🐟' },
        { id: 'yumurta', name: 'Yumurta', icon: '🥚' },
        { id: 'tofu', name: 'Tofu', icon: '🟨' },
        { id: 'peynir', name: 'Peynir', icon: '🧀' }
    ],
    carb: [
        { id: 'pirinc-cesitleri', name: 'Pirinç Çeşitleri', icon: '🍚' },
        { id: 'makarna-noodle', name: 'Makarna/Noodle', icon: '🍝' },
        { id: 'kuskus', name: 'Kuskus', icon: '🌾' },
        { id: 'karabuday', name: 'Karabuğday', icon: '🌾' },
        { id: 'kinoa', name: 'Kinoa', icon: '🌾' },
        { id: 'baklagil', name: 'Baklagil', icon: '🫘' },
        { id: 'ekmek-cesitleri', name: 'Ekmek Çeşitleri', icon: '🍞' },
        { id: 'lavas', name: 'Lavaş', icon: '🌯' }
    ],
    allergens: [
        { id: 'gluten', name: 'Gluten', icon: '🌾' },
        { id: 'sut', name: 'Süt / Laktoz', icon: '🥛' },
        { id: 'yumurta-allergen', name: 'Yumurta', icon: '🥚' },
        { id: 'yer-fistigi', name: 'Yer Fıstığı', icon: '🥜' },
        { id: 'susam', name: 'Susam', icon: '🌿' },
        { id: 'bal', name: 'Bal', icon: '🍯' }
    ]
};

/* ============================================
   Category Warning (Çölyak Uyarısı)
   ============================================ */

// Categories that trigger the celiac disease warning banner
const WARNING_CATEGORIES = ['glutensiz-vegan'];

function checkAndShowWarning(categorySlug) {
    const warningBanner = document.getElementById('warning-banner');

    if (!warningBanner) return;

    if (WARNING_CATEGORIES.includes(categorySlug)) {
       warningBanner.style.display = 'block';
    } else {
       warningBanner.style.display = 'none';
    }
}

// Build menu data with auto-generated "En Sevilenler" category
function buildMenuData(data) {
    const menuData = JSON.parse(JSON.stringify(data)); // Deep copy

    // Collect all featured items
    const featuredItems = [];
    menuData.categories.forEach(category => {
        category.items.forEach(item => {
            if (item.featured === true) {
                featuredItems.push(JSON.parse(JSON.stringify(item)));
            }
        });
    });

    // If there are featured items, prepend the category
    if (featuredItems.length > 0) {
        const featuredCategory = {
            id: 'en-sevilenler',
            name: getTranslation('categories.en-sevilenler', 'En Sevilenler'),
            icon: '🌟',
            items: featuredItems
        };
        menuData.categories.unshift(featuredCategory);
    }

    return menuData;
}

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    await loadTranslations();

    // Apply saved language on first load
    const langBtn = document.getElementById('languageSwitcher');
    if (langBtn) {
        langBtn.textContent = currentLanguage === 'tr' ? 'EN' : 'TR';
        langBtn.addEventListener('click', () => {
            setLanguage(currentLanguage === 'tr' ? 'en' : 'tr');
        });
    }

    updateStaticText();
    loadMenuData();
    setupScrollToTop();
    initCategoryScroll();
    initImageModal();
    initializeFilters();
    initSquirrel();
});

// Load menu data from JSON file
async function loadMenuData() {
    try {
        const response = await fetch('menu-data.json');
        
        if (!response.ok) {
            throw new Error('Menü verisi yüklenemedi');
        }
        
        const rawData = await response.json();
        menuData = buildMenuData(rawData);
        initializeMenu();
    } catch (error) {
        console.error('Error loading menu data:', error);
        showError('Menü yüklenirken bir hata oluştu. Lütfen sayfayı yenileyin.');
    }
}

// Initialize menu after data is loaded
function initializeMenu() {
    if (!menuData) return;
    
    // Update cafe name in header
    const headerTitle = document.querySelector('.header h1');
    if (headerTitle) {
        headerTitle.textContent = `🌿 ${menuData.cafeName}`;
    }

    // Update page title and mode indicator based on order mode
    initOrderMode();
    
    // Create category navigation
    createCategoryNav();
    
    // Render all menu items
    renderMenu();
    
    // Setup category filtering
    setupCategoryFiltering();
}

// Apply order-mode-specific UI updates (title only)
function initOrderMode() {
    const cafeName = (menuData && menuData.cafeName) ? menuData.cafeName : 'Sade Lezzetler';

    // Update browser tab title
    document.title = `${cafeName} Menü - ${orderMode === 'online' ? 'Online Siparişler' : 'Restoran'}`;
}

// Create category navigation buttons
function createCategoryNav() {
    const nav = document.getElementById('categoryNav');
    if (!nav) return;

    nav.innerHTML = '';

    const featuredCategory = menuData.categories.find(cat => cat.id === 'en-sevilenler');
    if (featuredCategory) {
        const translatedName = getTranslation(`categories.${featuredCategory.id}`, featuredCategory.name);
        const btn = createCategoryButton(featuredCategory.id, translatedName, featuredCategory.icon);
        nav.appendChild(btn);
    }

    menuData.categories.forEach(category => {
        if (category.id !== 'en-sevilenler') {
            const translatedName = getTranslation(`categories.${category.id}`, category.name);
            const btn = createCategoryButton(category.id, translatedName, category.icon);
            nav.appendChild(btn);
        }
    });
}

// Create a single category button
function createCategoryButton(id, name, icon) {
    const button = document.createElement('button');
    button.className = 'category-btn';
    button.dataset.category = id;
    button.innerHTML = `<span class="category-icon">${icon}</span><span>${name}</span>`;
    
    if (id === 'all') {
        button.classList.add('active');
    }
    
    return button;
}

// Setup category filtering functionality
function setupCategoryFiltering() {
    const nav = document.getElementById('categoryNav');
    if (!nav) return;
    
    nav.addEventListener('click', (e) => {
        const button = e.target.closest('.category-btn');
        if (!button) return;
        
        const category = button.dataset.category;
        
        // Update active state
        nav.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');
        
        // Filter menu
        currentFilter = category;
        renderMenu();

        // Show/hide warning banner for gluten-free/vegan categories
        checkAndShowWarning(category);
        
        // Scroll to menu container
        const menuContainer = document.getElementById('menuContainer');
        if (menuContainer) {
            const headerHeight = document.querySelector('.header').offsetHeight;
            const navHeight = nav.offsetHeight;
            const offset = headerHeight + navHeight + 20;
            
            window.scrollTo({
                top: menuContainer.offsetTop - offset,
                behavior: 'smooth'
            });
        }
    });
}

// Render the menu based on current filter
function renderMenu() {
    const container = document.getElementById('menuContainer');
    if (!container) return;

    container.innerHTML = '';

    let categoriesToRender = menuData.categories;

    // STEP 1: Apply category filter (if selected and not 'all')
    if (currentFilter !== 'all') {
        categoriesToRender = categoriesToRender.filter(cat => cat.id === currentFilter);
    }

    // STEP 2: Apply ingredient and price filters to the selected categories
    const filtersActive = activeFilters.protein.length > 0 || activeFilters.carb.length > 0 ||
                          activeFilters.allergens.length > 0 || activeFilters.price !== 'all';

    if (filtersActive) {
        categoriesToRender = categoriesToRender.map(category => {
            const filteredItems = category.items.filter(item => {
                return itemMatchesFilters(item);
            });
            return { ...category, items: filteredItems };
        }).filter(category => category.items.length > 0);
    }

    // Render each category
    categoriesToRender.forEach(category => {
        const categorySection = createCategorySection(category);
        container.appendChild(categorySection);
    });

    // Show "no results" message if needed
    if (container.children.length === 0) {
        const filterActive = activeFilters.protein.length > 0 || activeFilters.carb.length > 0 ||
                             activeFilters.allergens.length > 0 || activeFilters.price !== 'all';
        const categoryName = currentFilter === 'all'
            ? getTranslation('menu.menuIn', 'menüde')
            : (getTranslation(`categories.${currentFilter}`, menuData.categories.find(c => c.id === currentFilter)?.name || ''));

        const noResultsMsg = filterActive
            ? getTranslation('menu.noResultsFiltered', '').replace('{category}', categoryName)
            : getTranslation('menu.noResultsCategory', '');

        container.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">🔍</div>
                <h3>${getTranslation('menu.noResults')}</h3>
                <p>${noResultsMsg}</p>
                ${filterActive ? `
                    <button onclick="clearContentFilters()" class="filter-btn-secondary" style="margin: 1rem 0.5rem 0 0; padding: 0.75rem 1.5rem;">
                        ${getTranslation('buttons.clearFilters')}
                    </button>
                ` : ''}
                ${currentFilter !== 'all' ? `
                    <button onclick="clearCategoryFilter()" class="filter-btn-primary" style="margin-top: 1rem; padding: 0.75rem 1.5rem;">
                        ${getTranslation('buttons.showAll')}
                    </button>
                ` : ''}
            </div>`;
    }
}

// Create a category section with all its items
function createCategorySection(category) {
    const section = document.createElement('section');
    section.className = 'category-section';
    section.id = category.id;
    
    // Category title
    const title = document.createElement('h2');
    title.className = 'category-title';
    const translatedCategoryName = getTranslation(`categories.${category.id}`, category.name);
    title.innerHTML = `<span class="category-icon">${category.icon}</span><span>${translatedCategoryName}</span>`;
    section.appendChild(title);
    
    // Menu grid
    const grid = document.createElement('div');
    grid.className = 'menu-grid';
    
    // Add menu items
    category.items.forEach(item => {
        const itemCard = createMenuItem(item);
        grid.appendChild(itemCard);
    });
    
    section.appendChild(grid);
    return section;
}

// Create a single menu item card
function createMenuItem(item) {
    const card = document.createElement('div');
    card.className = item.featured ? 'menu-item is-featured' : 'menu-item';

    // Featured badge
    if (item.featured) {
        const badge = document.createElement('span');
        badge.className = 'featured-badge';
        badge.setAttribute('aria-label', getTranslation('menu.featured', 'En Sevilen Ürün'));
        badge.textContent = getTranslation('menu.featured', 'En Sevilen');
        card.appendChild(badge);
    }

    // Create image
    const img = document.createElement('img');
    img.className = 'menu-item-image';
    img.alt = item.name;
    img.loading = 'lazy';
    
    // Auto-generate path from item ID: images/{id}.jpg
    const imagePath = `images/${item.id}.jpg`;

    // Handle image load errors (if image doesn't exist, show placeholder)
    img.onerror = function() {
        console.error('❌ Image not found:', imagePath);
        this.src = 'images/placeholder-food.svg';  // Food plate silhouette
        this.onerror = null; // Prevent infinite loop if placeholder also fails
    };

    // Log successful image loads
    img.onload = function() {
        console.log('✅ Image loaded:', imagePath);
    };

    // Set the auto-generated image path
    img.src = imagePath;

    // Make image clickable - open in modal
    img.addEventListener('click', function(e) {
        e.stopPropagation(); // Prevent card click if any
        openImageModal(this.src, item.name, item);
    });

    card.appendChild(img);
    
    // Create content section
    const content = document.createElement('div');
    content.className = 'menu-item-content';
    
    // Header with name and price
    const header = document.createElement('div');
    header.className = 'menu-item-header';
    
    const name = document.createElement('h3');
    name.className = 'menu-item-name';
    name.textContent = getTranslation(`items.${item.id}.name`, item.name);
    
    const price = document.createElement('div');
    price.className = 'menu-item-price';
    price.textContent = `₺${getPrice(item)}`;
    
    header.appendChild(name);
    header.appendChild(price);
    content.appendChild(header);
    
    // Description
    const translatedDescription = getTranslation(`items.${item.id}.description`, item.description || '');
    if (translatedDescription) {
        const description = document.createElement('p');
        description.className = 'menu-item-description';
        description.textContent = translatedDescription;
        content.appendChild(description);
    }

    // Badges
    if (item.badges && item.badges.length > 0) {
        const badgeContainer = document.createElement('div');
        badgeContainer.className = 'badge-container';
        badgeContainer.innerHTML = renderBadges(item.badges);
        content.appendChild(badgeContainer);
    }

    card.appendChild(content);
    return card;
}

// Render badge HTML string for a list of badge keys
function renderBadges(badges) {
    if (!badges || badges.length === 0) return '';

    const badgeIcons = {
        'vegan': '🌱',
        'glutensiz': '🌾',
        'sekersiz': '🍯',
        'organik': '☘️'
    };

    return badges.map(badge =>
        `<span class="badge badge-${badge}">${badgeIcons[badge] || ''} ${getTranslation('badges.' + badge, badge)}</span>`
    ).join('');
}

// Show error message
function showError(message) {
    const container = document.getElementById('menuContainer');
    if (!container) return;
    
    container.innerHTML = `<div class="error">${message}</div>`;
}

// Show loading state
function showLoading() {
    const container = document.getElementById('menuContainer');
    if (!container) return;
    
    container.innerHTML = `<div class="loading">${getTranslation('menu.loading', 'Menü yükleniyor')}</div>`;
}

// Setup scroll-to-top button
function setupScrollToTop() {
    const btn = document.getElementById('scrollToTop');
    if (!btn) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible');
        }
    });

    btn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

/* ============================================
   CATEGORY NAVIGATION - HORIZONTAL SCROLL
   ============================================ */

// Enable mouse wheel horizontal scroll on desktop
function initCategoryScroll() {
    const categoryNav = document.querySelector('.category-nav');

    if (!categoryNav) return;

    // Check if categories overflow and set data-overflow attribute for CSS
    function checkOverflow() {
        const isOverflowing = categoryNav.scrollWidth > categoryNav.clientWidth;

        if (isOverflowing) {
            categoryNav.setAttribute('data-overflow', 'true');
        } else {
            categoryNav.removeAttribute('data-overflow');
        }
    }

    // Check overflow on initial load
    checkOverflow();

    // Recheck on window resize (responsive)
    window.addEventListener('resize', checkOverflow);

    // Desktop: Mouse wheel scrolls horizontally
    categoryNav.addEventListener('wheel', function(e) {
        // Only if content overflows (scrollable)
        if (this.scrollWidth > this.clientWidth) {
            e.preventDefault();
            // Convert vertical scroll (deltaY) to horizontal
            this.scrollLeft += e.deltaY;
        }
    }, { passive: false });
}

/* ============================================
   IMAGE MODAL FUNCTIONS
   ============================================ */

// Convert allergen IDs to translated display names
function getAllergenNames(allergenIds) {
    if (!allergenIds || allergenIds.length === 0) return [];
    return allergenIds.map(id => {
        const match = FILTER_GROUPS.allergens.find(a => a.id === id);
        return match ? getTranslation(`filterOptions.allergens.${id}`, match.name) : id;
    });
}

// Open image modal
function openImageModal(imageSrc, caption, item) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const modalCaption = document.getElementById('modalCaption');
    const modalAllergens = document.getElementById('modalAllergens');

    if (!modal || !modalImg || !modalCaption) return;

    // Set content
    modalImg.src = imageSrc;
    modalImg.alt = caption;
    modalCaption.textContent = caption;

    // Display allergen information
    if (modalAllergens) {
        const allergenIds = item && item.categories && item.categories.allergens
            ? item.categories.allergens
            : [];
        const names = getAllergenNames(allergenIds);
        if (names.length > 0) {
            modalAllergens.textContent = getTranslation('modal.allergens', '⚠️ Allergens') + ': ' + names.join(', ');
            modalAllergens.className = 'modal-allergens modal-allergens--has-allergens';
        } else {
            modalAllergens.textContent = getTranslation('modal.noAllergens', '✅ No allergens');
            modalAllergens.className = 'modal-allergens modal-allergens--safe';
        }
    }

    // Show modal
    modal.classList.add('active');

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
}

// Close image modal
function closeImageModal() {
    const modal = document.getElementById('imageModal');
    if (!modal) return;

    // Hide modal
    modal.classList.remove('active');

    // Restore body scroll
    document.body.style.overflow = 'auto';
}

// Setup modal event listeners (run once on page load)
function initImageModal() {
    const modal = document.getElementById('imageModal');
    const closeBtn = document.getElementById('modalClose');

    if (!modal || !closeBtn) return;

    // Close button click
    closeBtn.addEventListener('click', closeImageModal);

    // Click outside image (on overlay)
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeImageModal();
        }
    });
}

// ESC key to close modal (attached once at document level)
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('imageModal');
        if (modal && modal.classList.contains('active')) {
            closeImageModal();
        }

        const drawer = document.getElementById('filterDrawer');
        if (drawer && drawer.classList.contains('open')) {
            closeFilterDrawer();
        }
    }
});

/* ============================================
   MANUAL FILTER SYSTEM
   ============================================ */

// Check if an item matches all active filters
function itemMatchesFilters(item) {
    const cats = item.categories || { protein: [], carb: [], allergens: [] };

    // Price filter
    if (activeFilters.price !== 'all') {
        const priceRanges = {
            '0-300':   { min: 0,   max: 300 },
            '300-450': { min: 300, max: 450 },
            '450-600': { min: 450, max: 600 },
            '600+':    { min: 600, max: Infinity }
        };
        const range = priceRanges[activeFilters.price];
        if (range) {
        const price = Number(getPrice(item)) || 0;
            if (price < range.min || price >= range.max) return false;
        }
    }

    // Protein filter: AND logic — item must contain ALL selected proteins
    if (activeFilters.protein.length > 0) {
        const hasAllProteins = activeFilters.protein.every(p => cats.protein.includes(p));
        if (!hasAllProteins) return false;
    }

    // Carb filter: AND logic — item must contain ALL selected carbs
    if (activeFilters.carb.length > 0) {
        const hasAllCarbs = activeFilters.carb.every(c => cats.carb.includes(c));
        if (!hasAllCarbs) return false;
    }

    // Allergen filter: NOT logic — exclude items containing any selected allergen
    if (activeFilters.allergens.length > 0) {
        const hasAllergen = activeFilters.allergens.some(a => cats.allergens.includes(a));
        if (hasAllergen) return false;
    }

    return true;
}

// Update badge showing number of active filters
function updateFilterCount() {
    const badge = document.getElementById('filterCount');
    if (!badge) return;
    const count = activeFilters.protein.length + activeFilters.carb.length +
                  activeFilters.allergens.length + (activeFilters.price !== 'all' ? 1 : 0);
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// Apply filters and re-render menu
function applyFilters() {
    const filtersActive = activeFilters.protein.length > 0 || activeFilters.carb.length > 0 ||
                          activeFilters.allergens.length > 0 || activeFilters.price !== 'all';
    if (filtersActive) {
        currentFilter = 'all';
        activateFirstCategoryButton();
    }
    updateFilterCount();
    renderMenu();
    closeFilterDrawer();
}

// Activate the first category button and deactivate all others
function activateFirstCategoryButton() {
    const categoryNav = document.getElementById('categoryNav');
    if (!categoryNav) return;
    categoryNav.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const firstBtn = categoryNav.querySelector('.category-btn:first-child');
    if (firstBtn) {
        firstBtn.classList.add('active');
    }
}

// Clear only content/price filters (keep category selection)
function clearContentFilters() {
    activeFilters.protein = [];
    activeFilters.carb = [];
    activeFilters.allergens = [];
    activeFilters.price = 'all';
    createFilterOptions();
    createPriceFilters();
    updateFilterCount();
    renderMenu();
}

// Clear only category filter (keep content/price filters)
function clearCategoryFilter() {
    currentFilter = 'all';
    activateFirstCategoryButton();
    renderMenu();
}

// Open filter drawer
function openFilterDrawer() {
    const drawer = document.getElementById('filterDrawer');
    if (drawer) {
        drawer.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
}

// Close filter drawer
function closeFilterDrawer() {
    const drawer = document.getElementById('filterDrawer');
    if (drawer) {
        drawer.classList.remove('open');
        document.body.style.overflow = 'auto';
    }
}

// Generate checkboxes for protein, carb, and allergen filter groups
function createFilterOptions() {
    const groups = ['protein', 'carb', 'allergens'];
    const containerIds = { protein: 'proteinOptions', carb: 'carbOptions', allergens: 'allergenOptions' };

    groups.forEach(group => {
        const container = document.getElementById(containerIds[group]);
        if (!container) return;
        container.innerHTML = '';
        FILTER_GROUPS[group].forEach(option => {
            const translatedName = getTranslation(`filterOptions.${group}.${option.id}`, option.name);
            const label = document.createElement('label');
            label.className = 'filter-option' + (activeFilters[group].includes(option.id) ? ' checked' : '');
            label.innerHTML = `
                <input type="checkbox" value="${option.id}" ${activeFilters[group].includes(option.id) ? 'checked' : ''}>
                <span>${option.icon} ${translatedName}</span>`;
            const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    if (!activeFilters[group].includes(option.id)) {
                        activeFilters[group].push(option.id);
                    }
                    label.classList.add('checked');
                } else {
                    activeFilters[group] = activeFilters[group].filter(id => id !== option.id);
                    label.classList.remove('checked');
                }
                updateFilterCount();
            });
            container.appendChild(label);
        });
        if (group === 'allergens') {
            const note = document.createElement('p');
            note.className = 'allergen-note';
            note.textContent = getTranslation('filters.allergenNote');
            container.appendChild(note);
        }
    });
}

// Generate price range radio buttons
function createPriceFilters() {
    const container = document.getElementById('priceFilters');
    if (!container) return;
    container.innerHTML = '';
    const priceOptionIds = ['all', '0-300', '300-450', '450-600', '600+'];
    priceOptionIds.forEach(id => {
        const label = document.createElement('label');
        label.className = 'price-option' + (activeFilters.price === id ? ' checked' : '');
        label.innerHTML = `
            <input type="radio" name="priceRange" value="${id}" ${activeFilters.price === id ? 'checked' : ''}>
            <span>${getTranslation(`priceOptions.${id}`, id)}</span>`;
        const radio = label.querySelector('input');
        radio.addEventListener('change', () => {
            activeFilters.price = id;
            container.querySelectorAll('.price-option').forEach(el => el.classList.remove('checked'));
            label.classList.add('checked');
            updateFilterCount();
        });
        container.appendChild(label);
    });
}

// Set up all event listeners for the filter system
function setupFilterEvents() {
    // Toggle button opens drawer
    const toggleBtn = document.getElementById('filterToggleBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', openFilterDrawer);
    }

    // Close button
    const closeBtn = document.getElementById('filterCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeFilterDrawer);
    }

    // Overlay closes drawer
    const overlay = document.querySelector('.filter-drawer-overlay');
    if (overlay) {
        overlay.addEventListener('click', closeFilterDrawer);
    }

    // Apply button
    const applyBtn = document.getElementById('filterApplyBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', applyFilters);
    }

    // Clear button
    const clearBtn = document.getElementById('filterClearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            clearContentFilters();
            closeFilterDrawer();
        });
    }

    // Accordion toggles for each filter category
    const accordionGroups = [
        { toggleId: 'proteinToggle',  optionsId: 'proteinOptions' },
        { toggleId: 'carbToggle',     optionsId: 'carbOptions' },
        { toggleId: 'allergenToggle', optionsId: 'allergenOptions' }
    ];
    accordionGroups.forEach(({ toggleId, optionsId }) => {
        const btn = document.getElementById(toggleId);
        const container = document.getElementById(optionsId);
        if (!btn || !container) return;
        btn.addEventListener('click', () => {
            const isOpen = container.classList.contains('open');
            container.classList.toggle('open', !isOpen);
            const icon = btn.querySelector('.toggle-icon');
            if (icon) {
                icon.classList.toggle('expanded', !isOpen);
                icon.textContent = isOpen ? '▶' : '▼';
            }
        });
    });
}

// Initialize the entire filter system
function initializeFilters() {
    createFilterOptions();
    createPriceFilters();
    setupFilterEvents();
}

/* =============================================
   SQUIRREL ANIMATION
   ============================================= */

function initSquirrel() {
    const squirrel = document.getElementById('squirrelContainer');
    if (!squirrel) return;

    // Slide up
    squirrel.classList.add('squirrel-enter');

    // Switch to idle bobbing after entrance completes
    setTimeout(() => {
        squirrel.classList.remove('squirrel-enter');
        squirrel.classList.add('squirrel-idle');
    }, 500);

    // Begin exit animation at 4.5 s
    setTimeout(() => {
        squirrel.classList.remove('squirrel-idle');
        squirrel.classList.add('squirrel-exit');
    }, 4500);

    // Remove from DOM after full 5 s cycle
    setTimeout(() => {
        squirrel.remove();
    }, 5000);
}
