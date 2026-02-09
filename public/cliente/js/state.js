// Objeto único que segura o estado da aplicação
export const state = {
    STORE_ID: null,
    FAV_KEY: "",
    lojaZapDestino: "",
    favorites: [],
    cart: [],
    allProducts: [],
    categories: [],
    deliveryAreas: [],
    storeConfigGlobal: {},
    
    // Filtros
    filters: { 
        search: "", 
        category: null, 
        maxPrice: null, 
        sizes: [], 
        colors: [] 
    },
    isFavoritesView: false,

    // Detalhes do Produto (Modal)
    currentDetailId: null,
    currentDetailQty: 1,
    currentDetailSelection: { size: null, color: null, image: null },
    currentDetailImages: [],
    currentDetailImageIndex: 0,

    // Controle de Cache e Analytics
    productViewBuffer: new Set(),
    failedSearchBuffer: new Set(),
    analyticsTimer: null,
    searchDebounceTimer: null,
    lastSearchRecordedAt: 0
};

// --- SETTERS E HELPERS DE ESTADO ---

export function setStoreId(id) {
    state.STORE_ID = id;
    state.FAV_KEY = `favs_v2_${id}`;
}

export function loadFavorites() {
    try {
        const saved = localStorage.getItem(state.FAV_KEY);
        state.favorites = saved ? JSON.parse(saved) : [];
    } catch (e) {
        state.favorites = [];
    }
}

export function saveFavorites() {
    localStorage.setItem(state.FAV_KEY, JSON.stringify(state.favorites));
}

export function loadCart() {
    if(!state.STORE_ID) return;
    const CART_KEY = `cart_${state.STORE_ID}`;
    try {
        const saved = localStorage.getItem(CART_KEY);
        state.cart = saved ? JSON.parse(saved) : [];
    } catch(e) {
        state.cart = [];
    }
}

export function saveCart() {
    const CART_KEY = `cart_${state.STORE_ID}`;
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}

export function resetFilters() {
    state.filters = { search: "", category: null, maxPrice: null, sizes: [], colors: [] };
    state.isFavoritesView = false;
}

