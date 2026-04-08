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

export { 
    app, db, auth, signInAnonymously, onAuthStateChanged,
    collection, doc, getDocFromCache, getDocFromServer, getDocs, getDocsFromServer, 
    query, where, addDoc, setDoc, updateDoc, increment, serverTimestamp, writeBatch, Timestamp 
};

// --- UTILS GERAIS (Funções de UI Animadas) ---

export function showToast(msg) {
    const t = document.createElement('div');
    // Design mais limpo e profissional para o Toast
    t.className = "bg-white border border-slate-100 text-slate-800 text-xs font-bold px-6 py-4 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.08)] flex items-center gap-3 toast-enter pointer-events-auto transform transition-all duration-500 mb-4";
    t.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <i data-lucide="check" class="w-4 h-4 text-primary"></i>
        </div>
        <span>${msg}</span>
    `;
    
    const container = document.getElementById('toastContainer');
    if(container) container.appendChild(t);
    
    if(window.lucide) window.lucide.createIcons();
    
    requestAnimationFrame(() => { t.classList.add('toast-enter-active'); });
    setTimeout(() => { 
        t.classList.add('opacity-0', 'translate-y-2'); 
        setTimeout(() => t.remove(), 500); 
    }, 3500);
}

export function hideLoader() { 
    // Usamos o ID 'loader' que definimos no novo HTML interativo
    const loader = document.getElementById('loader');
    const appMain = document.getElementById('app');
    
    if(loader) {
        // Aplica o efeito de "mergulho" (zoom out + fade)
        loader.style.opacity = '0'; 
        loader.style.transform = 'scale(1.1)';
        loader.style.transition = 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
        
        setTimeout(() => { 
            loader.classList.add('hidden'); 
            if(appMain) {
                appMain.classList.remove('hidden', 'opacity-0');
                // Pequena animação de entrada para o conteúdo do app
                appMain.classList.add('animate-fade-in-up');
            }
        }, 800); 
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
