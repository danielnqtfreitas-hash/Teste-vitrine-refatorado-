import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    initializeFirestore, 
    persistentLocalCache, 
    persistentMultipleTabManager,
    collection,
    doc,
    getDocFromCache,
    getDocFromServer,
    getDocs,
    getDocsFromServer,
    query,
    where,
    addDoc,
    setDoc,
    updateDoc,
    increment,
    serverTimestamp,
    writeBatch,
    Timestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURAÇÃO FIREBASE ---
const FIREBASE_CONFIG = { 
    apiKey: "AIzaSyAdwsGBTApwOwqr37qCv72gdPRbipsZG0Q", 
    authDomain: "meuestoque-1badc.firebaseapp.com", 
    projectId: "meuestoque-1badc", 
    storageBucket: "meuestoque-1badc.firebasestorage.app", 
    messagingSenderId: "730003067834", 
    appId: "1:730003067834:web:b205f1ea59053345960383" 
};

const app = initializeApp(FIREBASE_CONFIG);
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
const auth = getAuth(app);

// --- EXPORTS DO FIREBASE ---
export { 
    app, db, auth, signInAnonymously, onAuthStateChanged,
    collection, doc, getDocFromCache, getDocFromServer, getDocs, getDocsFromServer, 
    query, where, addDoc, setDoc, updateDoc, increment, serverTimestamp, writeBatch, Timestamp 
};

// --- UTILS GERAIS (Funções puras) ---

export function showToast(msg) {
    const t = document.createElement('div');
    t.className = "bg-slate-900/90 text-white text-sm px-6 py-3 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-3 toast-enter pointer-events-auto transform transition-all duration-300";
    t.innerHTML = `<i data-lucide="shopping-bag" class="w-4 h-4 text-green-400"></i><span>${msg}</span>`;
    
    const container = document.getElementById('toastContainer');
    if(container) container.appendChild(t);
    
    if(window.lucide) window.lucide.createIcons();
    
    requestAnimationFrame(() => { t.classList.add('toast-enter-active'); });
    setTimeout(() => { 
        t.classList.add('toast-exit-active'); 
        setTimeout(() => t.remove(), 300); 
    }, 3000);
}

export function hideLoader() { 
    const loader = document.getElementById('initialLoader');
    const appMain = document.getElementById('app');
    
    if(loader) {
        loader.style.opacity = '0'; 
        setTimeout(() => { 
            loader.classList.add('hidden'); 
            if(appMain) appMain.classList.remove('hidden', 'opacity-0'); 
        }, 500); 
    }
}

export function formatarTempo(ms) {
    const dias = Math.floor(ms / (1000 * 60 * 60 * 24));
    const horas = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((ms % (1000 * 60)) / 1000);

    if (dias > 0) return `Expira em: ${dias}d ${horas}h`;
    return `Oferta termina em: ${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
}

export function sanitizeTerm(term) {
    const forbiddenChars = /[<>{}\[\]\\/|]/g;
    const maxSearchLength = 30;
    return term.trim().toLowerCase().replace(forbiddenChars, '').substring(0, maxSearchLength);
}

export function isBotLikely() {
    return navigator.webdriver === true;
}
