/* * =========================================================================
 * CART & CHECKOUT SERVICE
 * Gerencia Sacola, Cálculo de Preços Dinâmicos e Shadow Stock
 * =========================================================================
 */

import { state, saveCart } from './state.js';
import { 
    showToast, db, doc, getDocFromServer, collection, query, where, 
    getDocsFromServer, addDoc, writeBatch, serverTimestamp, increment, setDoc 
} from './config.js';
import { closeModalDetails } from './ui.js';

// --- HELPER: Preço Ativo (Pix vs Cartão vs Promo) ---
function getActivePrice(p, method) {
    if (!p) return 0;
    const agora = Date.now();
    const isPromoValid = p.promoValue && p.promoValue < p.value && (p.promoUntil ? p.promoUntil > agora : true);
    
    const precoPixBase = p.priceCash || p.value;
    const precoCardBase = p.priceCard || p.value;
    const diferencaCartao = precoCardBase - precoPixBase;

    if (method === 'Cartão') {
        if (isPromoValid) return p.promoValue + (diferencaCartao > 0 ? diferencaCartao : 0);
        return precoCardBase;
    }
    // Pix ou Dinheiro
    if (isPromoValid) return p.promoValue; 
    return precoPixBase;                   
}

// --- ADICIONAR AO CARRINHO (Com Shadow Stock Check) ---

export async function addToCart(p, q, v) {
    let pAtualizado = p;
    
    // 1. Validação de segurança: Busca estoque real do servidor antes de adicionar
    try {
        const productRef = doc(db, `stores/${state.STORE_ID}/products/${p.id}`);
        const snapAtual = await getDocFromServer(productRef); 
        if (snapAtual.exists()) {
            pAtualizado = snapAtual.data();
            pAtualizado.id = p.id;
        }
    } catch (e) {
        console.warn("Falha ao sincronizar estoque real. Usando dados locais.");
    }

    const matrix = pAtualizado.variations || [];
    let stockPainel = parseInt(pAtualizado.stock) || 0;

    // 2. Busca Reservas Temporárias (Shadow Stock)
    let totalReservado = 0;
    try {
        const resRef = collection(db, `stores/${state.STORE_ID}/stock_reserves`);
        const qRes = query(resRef, where("productId", "==", p.id), where("status", "==", "pending"));
        const resSnap = await getDocsFromServer(qRes); 

        resSnap.forEach(rdoc => {
            const r = rdoc.data();
            const isSameVar = (!v.size || (r.variation?.size || "").trim().toLowerCase() === (v.size || "").trim().toLowerCase()) && 
                              (!v.color || (r.variation?.color || "").trim().toLowerCase() === (v.color || "").trim().toLowerCase());
            if (isSameVar) totalReservado += r.qty;
        });
    } catch (e) { 
        console.warn("Erro ao buscar reservas de estoque."); 
    }

    // 3. Lógica de Preço e SKU
    const agora = Date.now();
    const isPromoAtiva = pAtualizado.promoValue && pAtualizado.promoValue < pAtualizado.value && (!pAtualizado.promoUntil || pAtualizado.promoUntil > agora);
    const fatorDesconto = isPromoAtiva ? (pAtualizado.promoValue / pAtualizado.value) : 1;

    let price = isPromoAtiva ? pAtualizado.promoValue : (pAtualizado.priceCash || pAtualizado.value); 
    let skuFinal = pAtualizado.sku || 'N/A'; 
    let stockEspecifico = stockPainel;

    // Ajuste para Variações (Tamanho/Cor)
    if(matrix.length && (v.size || v.color)) {
        const comb = matrix.find(varItem => 
            (!pAtualizado.sizes?.length || (varItem.size || "").trim().toLowerCase() === (v.size || "").trim().toLowerCase()) &&
            (!pAtualizado.colors?.length || (varItem.color || "").trim().toLowerCase() === (v.color || "").trim().toLowerCase())
        );
        if (comb) {
            stockEspecifico = parseInt(comb.stock) || 0;
            price = isPromoAtiva ? (comb.price * fatorDesconto) : comb.price;
            skuFinal = comb.sku || skuFinal;
        }
    }

    // 4. Validação de Disponibilidade
    const stockDisponivelReal = stockEspecifico - totalReservado;
    const uid = `${p.id}-${(v.size || '').trim()}-${(v.color || '').trim()}`;
    const naSacola = state.cart.find(x => x.uid === uid);
    const totalDesejado = (naSacola ? naSacola.q : 0) + q;

    if (totalDesejado > stockDisponivelReal) {
        if (window.alertaEstoquePreso) window.alertaEstoquePreso(pAtualizado.name);
        else showToast("❌ Estoque insuficiente no momento.");
        return;
    }

    // 5. Commit no Carrinho Local
    const imagemFinal = v.image || (pAtualizado.images && pAtualizado.images[0]) || 'https://placehold.co/100';

    if(naSacola) {
        naSacola.q += q; 
        naSacola.price = price; 
    } else {
        state.cart.push({
            uid, id: p.id, sku: skuFinal, name: pAtualizado.name, price: price, q, img: imagemFinal, 
            variationDetails: { size: v.size || null, color: v.color || null, image: imagemFinal, sku: skuFinal },
            v: {...v}
        }); 
    }

    saveCart();
    updateCartUI(); 
    showToast(`🛍️ <b>${pAtualizado.name}</b> adicionado!`); 
    closeModalDetails(); 
}

// --- ATUALIZAÇÃO DA INTERFACE ---

export function updateCartTotals() { 
    const method = document.getElementById('checkPayment')?.value || "";
    const deliveryFee = parseFloat(document.getElementById('cartDeliverySelect')?.value) || 0; 
    let subtotalCalculado = 0;

    state.cart.forEach(item => {
        const pOriginal = state.allProducts.find(x => x.id === item.id);
        if (pOriginal) {
            const precoCerto = getActivePrice(pOriginal, method);
            const valorLinha = precoCerto * item.q;
            subtotalCalculado += valorLinha;

            const priceEl = document.getElementById(`cart-item-price-${item.uid}`);
            if(priceEl) priceEl.textContent = `R$ ${valorLinha.toFixed(2).replace('.', ',')}`;
        }
    });

    document.querySelectorAll('.subtotal-display').forEach(d => {
        d.textContent = `R$ ${subtotalCalculado.toFixed(2).replace('.', ',')}`;
    });
    
    const totalDisplay = document.getElementById('cartFinalTotal');
    if(totalDisplay) {
        totalDisplay.textContent = `R$ ${(subtotalCalculado + deliveryFee).toFixed(2).replace('.', ',')}`; 
    }
}

export function updateCartUI() {
    const totalItens = state.cart.reduce((a, b) => a + b.q, 0); 
    const badge = document.getElementById('cartBadge'); 
    if(badge) {
        badge.textContent = totalItens; 
        badge.classList.toggle('scale-0', totalItens === 0);
    }

    const list = document.getElementById('cartList');
    const emptyMsg = document.getElementById('cartEmptyMsg');
    const footer = document.getElementById('footerStep1');
    const currentMethod = document.getElementById('checkPayment')?.value || "";

    if(!state.cart.length) { 
        if(list) list.innerHTML = ''; 
        if(emptyMsg) emptyMsg.classList.remove('hidden'); 
        if(footer) footer.classList.add('hidden');
    } else {
        if(emptyMsg) emptyMsg.classList.add('hidden'); 
        if(footer) footer.classList.remove('hidden');

        list.innerHTML = state.cart.map(i => {
            const pOriginal = state.allProducts.find(x => x.id === i.id);
            const precoDinamico = getActivePrice(pOriginal, currentMethod);
            
            return `
            <div class="flex gap-3 bg-white p-3 rounded-xl border border-slate-200">
                <img src="${i.img}" class="w-16 h-16 rounded-lg object-cover bg-slate-50">
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between font-bold text-xs text-slate-800">
                        <span class="truncate pr-2">${i.name}</span>
                        <span class="shrink-0" id="cart-item-price-${i.uid}">
                            R$ ${(precoDinamico * i.q).toFixed(2).replace('.', ',')}
                        </span>
                    </div>
                    <div class="text-[10px] text-slate-400 mt-1 uppercase italic">
                        ${[i.v.size, i.v.color].filter(Boolean).join(' / ') || 'Padrão'}
                    </div>
                    <div class="flex items-center gap-4 mt-2">
                        <div class="flex items-center bg-slate-100 rounded h-7 border border-slate-200">
                            <button onclick="window.modQty('${i.uid}', -1)" class="w-7 h-full flex items-center justify-center text-slate-500 font-bold">-</button>
                            <span class="w-8 text-center text-xs font-black text-slate-700">${i.q}</span>
                            <button onclick="window.modQty('${i.uid}', 1)" class="w-7 h-full flex items-center justify-center text-slate-500 font-bold">+</button>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    }
    updateCartTotals(); 
}

export function modQty(u, d) {
    const item = state.cart.find(x => x.uid === u);
    if (!item) return;

    if (d > 0) {
        const pOrig = state.allProducts.find(p => p.id === item.id);
        if (pOrig) {
            let estoque = parseInt(pOrig.stock) || 0;
            if (pOrig.variations?.length > 0) {
                const v = pOrig.variations.find(v => v.size === item.v.size && v.color === item.v.color);
                if (v) estoque = parseInt(v.stock) || 0;
            }
            if (item.q + d > estoque) {
                showToast(`⚠️ Máximo disponível: ${estoque} unidades.`);
                return; 
            }
        }
    }

    item.q += d;
    if (item.q <= 0) state.cart = state.cart.filter(x => x.uid !== u);

    saveCart();
    updateCartUI();
}

// --- CHECKOUT WHATSAPP ---

export async function checkoutWhatsApp() { 
    if(!state.cart.length) return; 

    const nome = document.getElementById('checkName').value.trim();
    const telefone = document.getElementById('checkPhone')?.value.trim();
    const pagamento = document.getElementById('checkPayment').value;
    const deliveryVal = document.getElementById('cartDeliverySelect').value;
    
    if(!nome || !pagamento || !telefone || telefone.length < 10) {
        showToast("⚠️ Preencha Nome, WhatsApp e Pagamento.");
        return;
    }

    const btn = document.querySelector('button[onclick="window.checkoutWhatsApp()"]');
    if(btn) { btn.disabled = true; btn.innerHTML = "Processando..."; }

    try {
        // Registro do Pedido e Reserva no Firebase
        const subtotal = state.cart.reduce((total, item) => {
            const p = state.allProducts.find(x => x.id === item.id);
            return total + (getActivePrice(p, pagamento) * item.q);
        }, 0);

        const taxa = deliveryVal === "0" ? 0 : parseFloat(deliveryVal);
        const total = subtotal + taxa;

        const orderData = {
            customer: { name: nome, phone: telefone },
            items: state.cart,
            total: total,
            createdAt: serverTimestamp(),
            status: 'pending_whatsapp'
        };

        const docRef = await addDoc(collection(db, `stores/${state.STORE_ID}/orders`), orderData);
        const orderId = docRef.id.slice(-5).toUpperCase();

        // Montagem da Mensagem
        let msg = `🛍️ *PEDIDO: #${orderId}*\n`;
        msg += `👤 *Cliente:* ${nome}\n\n*ITENS:*\n`;
        state.cart.forEach(i => {
            msg += `• ${i.q}x ${i.name} (R$ ${i.price.toFixed(2)})\n`;
        });
        msg += `\n*TOTAL: R$ ${total.toFixed(2)}*\n*PAG:* ${pagamento}`;

        const link = `https://wa.me/${state.lojaZapDestino}?text=${encodeURIComponent(msg)}`;
        
        state.cart = [];
        saveCart();
        window.open(link, '_blank');
        window.location.reload();

    } catch (e) {
        showToast("❌ Erve ao salvar pedido.");
        if(btn) { btn.disabled = false; btn.innerHTML = "Finalizar Pedido"; }
    }
}

export function goToStep1() {
    document.getElementById('step1')?.classList.remove('hidden');
    document.getElementById('step2')?.classList.add('hidden');
    document.getElementById('cartTitle').textContent = "Minha Sacola";
}

export function goToStep2() {
    if (!state.cart.length) return showToast("Sua sacola está vazia!");
    document.getElementById('step1').classList.add('hidden');
    document.getElementById('step2').classList.remove('hidden');
    document.getElementById('cartTitle').textContent = "Finalizar Pedido";
    toggleAddressFields();
}

export function toggleAddressFields() {
    const sel = document.getElementById('cartDeliverySelect');
    const fields = document.getElementById('addressFields');
    if (sel && fields) sel.value === "0" ? fields.classList.add('hidden') : fields.classList.remove('hidden');
    updateCartTotals();
}

export function alertaEstoquePreso(nome) {
    Swal.fire({
        title: 'Estoque Esgotado',
        text: `O item ${nome} não está mais disponível.`,
        icon: 'warning',
        confirmButtonText: 'OK'
    }).then(() => window.location.reload());
}
