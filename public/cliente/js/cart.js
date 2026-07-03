/* * =========================================================================
 * CART & CHECKOUT SERVICE - VERSÃO INTEGRAL
 * Gerencia Sacola, Preços Dinâmicos, Shadow Stock e Checkout WhatsApp
 * =========================================================================
 */

import { state, saveCart } from './state.js';
import { 
    showToast, db, doc, getDocFromServer, collection, query, where, 
    getDocsFromServer, addDoc, writeBatch, serverTimestamp, increment, setDoc 
} from './config.js';
import { closeModalDetails } from './ui.js';

// --- HELPER: Preço Ativo (Pix vs Cartão vs Promo) ---
// Esta função garante que se o produto tiver preço diferenciado para cartão, 
// a promoção seja aplicada corretamente sobre a base certa.
function getActivePrice(p, method) {
    if (!p) return 0;
    const agora = Date.now();
    const isPromoValid = p.promoValue && p.promoValue < p.value && (p.promoUntil ? p.promoUntil > agora : true);
    
    const precoPixBase = p.priceCash || p.value;
    const precoCardBase = p.priceCard || p.value;
    const diferencaCartao = precoCardBase - precoPixBase;

    // Ajuste aqui: Verifica se o método contém "cart" ou "crédito"
    const isCard = method.toLowerCase().includes('cart') || method.toLowerCase().includes('crédito');

    if (isCard) {
        if (isPromoValid) return p.promoValue + (diferencaCartao > 0 ? diferencaCartao : 0);
        return precoCardBase;
    }
    
    if (isPromoValid) return p.promoValue; 
    return precoPixBase;                   
}

// --- ADICIONAR AO CARRINHO (Com verificação de estoque real e Shadow Stock) ---

export async function addToCart(p, q, v) {
    // --- PASSO 0: TRAVA DE LOJA FECHADA ---
    // Verifica se o status no estado global da loja está como 'closed'
    if (state.storeConfigGlobal && state.storeConfigGlobal.status === 'closed') {
        Swal.fire({
            title: 'Loja Fechada',
            text: 'No momento estamos apenas exibindo o catálogo. Não é possível adicionar itens à sacola.',
            icon: 'warning',
            confirmButtonColor: 'var(--color-primary)',
            confirmButtonText: 'Entendido'
        });
        return; // Interrompe a função aqui
    }

    // 1. Busca dados REAIS do servidor (ignora cache local para garantir estoque)
    let pAtualizado = p;
    try {
        const productRef = doc(db, `stores/${state.STORE_ID}/products/${p.id}`);
        const snapAtual = await getDocFromServer(productRef); 
        if (snapAtual.exists()) {
            pAtualizado = snapAtual.data();
            pAtualizado.id = p.id;
        }
    } catch (e) {
        console.warn("Falha ao buscar estoque em tempo real, usando dados locais.", e);
    }

    const matrix = pAtualizado.variations || [];
    let stockPainel = parseInt(pAtualizado.stock) || 0;

    // 2. Busca Reservas Fantasmas (Shadow Stock) para evitar venda duplicada
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
        console.warn("Erro ao buscar reservas:", e); 
    }

    // 3. Define Preço e Estoque Específico por Variação
    const agora = Date.now();
    const isPromoAtiva = pAtualizado.promoValue && pAtualizado.promoValue < pAtualizado.value && (!pAtualizado.promoUntil || pAtualizado.promoUntil > agora);
    const fatorDesconto = isPromoAtiva ? (pAtualizado.promoValue / pAtualizado.value) : 1;

    let price = isPromoAtiva ? pAtualizado.promoValue : (pAtualizado.priceCash || pAtualizado.value); 
    let skuFinal = pAtualizado.sku || 'N/A'; 
    let stockEspecifico = stockPainel;

    if(matrix.length && (v.size || v.color)) {
        const comb = matrix.find(varItem => 
            (!pAtualizado.sizes?.length || (varItem.size || "").trim().toLowerCase() === (v.size || "").trim().toLowerCase()) &&
            (!pAtualizado.colors?.length || (varItem.color || "").trim().toLowerCase() === (v.color || "").trim().toLowerCase())
        );
        if (comb) {
            stockEspecifico = parseInt(comb.stock) || 0;
            // Aplica o mesmo percentual de desconto do produto pai na variação
            price = isPromoAtiva ? (comb.price * fatorDesconto) : comb.price;
            skuFinal = comb.sku || skuFinal;
        }
    }

    // 4. Validação Final de Disponibilidade
    const stockDisponivelReal = stockEspecifico - totalReservado;
    const uid = `${p.id}-${(v.size || '').trim()}-${(v.color || '').trim()}`;
    const naSacola = state.cart.find(x => x.uid === uid);
    const totalDesejado = (naSacola ? naSacola.q : 0) + q;

    if (totalDesejado > stockDisponivelReal) {
        if (window.alertaEstoquePreso) window.alertaEstoquePreso(pAtualizado.name);
        else showToast("Estoque indisponível ou reservado.");
        return;
    }

    // 5. Atualiza Carrinho Local
    const imagemFinal = v.image || (pAtualizado.images && pAtualizado.images[0]) || 'https://placehold.co/100';

    if(naSacola) {
        naSacola.q += q; 
        naSacola.sku = skuFinal;
        naSacola.img = imagemFinal;
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
    
    if (window.updateNavigationBadges) window.updateNavigationBadges();
    
    showToast(`<b>${pAtualizado.name}</b> na sacola!`); 
    closeModalDetails(); 
}

// --- GERENCIAMENTO VISUAL DA SACOLA ---

export function updateCartTotals() { 
    // Se o catálogo ainda não carregou, não tenta calcular para não zerar a tela
    if (!state.allProducts || state.allProducts.length === 0) return;

    const method = document.getElementById('checkPayment')?.value || "";
    const deliveryFee = parseFloat(document.getElementById('cartDeliverySelect')?.value) || 0; 
    let subtotalGeral = 0;

    state.cart.forEach(item => {
        // 1. Busca o produto original para pegar o preço base (Pix/Cartão/Promo)
        const pOriginal = state.allProducts.find(x => x.id === (item.productId || item.id));
        
        if (pOriginal) {
            // 2. Calcula Preço Base
            const precoBase = getActivePrice(pOriginal, method);
            
            // 3. Soma Adicionais (Modo Restaurante)
            let precoAdicionais = 0;
            if (item.complements) {
                // Percorre o objeto de categorias de complementos
                Object.values(item.complements).forEach(escolhas => {
                    escolhas.forEach(c => {
                        precoAdicionais += parseFloat(c.preco || c.price || 0);
                    });
                });
            }

            const precoFinalUnitario = precoBase + precoAdicionais;
            const valorTotalLinha = precoFinalUnitario * item.q;
            subtotalGeral += valorTotalLinha;

            // 4. Atualiza o preço visual da linha na sacola (se o elemento existir)
            const priceEl = document.getElementById(`cart-item-price-${item.uid}`);
            if(priceEl) {
                priceEl.textContent = `R$ ${valorTotalLinha.toFixed(2).replace('.', ',')}`;
            }
        }
    });

    // 5. Atualiza os textos de subtotal em todos os lugares (.subtotal-display)
    document.querySelectorAll('.subtotal-display').forEach(d => {
        d.textContent = `R$ ${subtotalGeral.toFixed(2).replace('.', ',')}`;
    });
    
    // 6. Atualiza o Total Final (Subtotal + Frete)
    const totalDisplay = document.getElementById('cartFinalTotal');
    if(totalDisplay) {
        const valorFinal = subtotalGeral + deliveryFee;
        totalDisplay.textContent = `R$ ${valorFinal.toFixed(2).replace('.', ',')}`; 
    }

    // 7. Sincroniza badges e parcelamento
    if (window.updateNavigationBadges) window.updateNavigationBadges();
    
    // Se tiver função de renderizar parcelas (Varejo), ela lerá o subtotal atualizado
    if (typeof renderInstallments === 'function') {
        renderInstallments();
    }
}

// Gera as parcelas baseadas no subtotal atual
export function renderInstallments() {
    const select = document.getElementById('checkInstallments');
    const installmentsField = document.getElementById('cardInstallmentsField');
    if (!select || !installmentsField || installmentsField.classList.contains('hidden')) return;

    // Calcula o subtotal atual (usando o preço de cartão)
    const subtotal = state.cart.reduce((total, item) => {
        const pOrig = state.allProducts.find(x => x.id === item.id);
        return total + (getActivePrice(pOrig, 'Cartão') * item.q);
    }, 0);

    const maxInstallments = 3; // Ajuste conforme sua política
    let html = '';
    
    for (let i = 1; i <= maxInstallments; i++) {
        const valorParcela = subtotal / i;
        html += `<option value="${i}">${i}x de R$ ${valorParcela.toFixed(2).replace('.', ',')} ${i === 1 ? 'à vista' : 'sem juros'}</option>`;
    }
    
    select.innerHTML = html;
}
export function updateCartUI() {
    const list = document.getElementById('cartList');
    const emptyMsg = document.getElementById('cartEmptyMsg');
    const footer = document.getElementById('footerStep1');
    const badge = document.getElementById('cartBadge'); 
    const currentMethod = document.getElementById('checkPayment')?.value || "";

    // 1. Contador de Itens
    const totalItens = state.cart.reduce((a, b) => a + (b.q || 0), 0); 
    if(badge) {
        badge.textContent = totalItens; 
        badge.classList.toggle('scale-0', totalItens === 0);
    }

    // 2. Carrinho Vazio
    if(!state.cart.length) { 
        if(list) list.innerHTML = ''; 
        if(emptyMsg) emptyMsg.classList.remove('hidden'); 
        if(footer) footer.classList.add('hidden');
        updateCartTotals();
        return;
    }

    // 3. Aguarda Catálogo
    if (!state.allProducts || state.allProducts.length === 0) {
        return; 
    }

    if(emptyMsg) emptyMsg.classList.add('hidden'); 
    if(footer) footer.classList.remove('hidden');

    list.innerHTML = state.cart.map(i => {
        const pOriginal = state.allProducts.find(x => x.id === (i.productId || i.id));
        
        // LÓGICA DE PREÇO: Preço Base + Adicionais
        const precoBase = pOriginal ? getActivePrice(pOriginal, currentMethod) : (i.price || 0);
        
        let precoAdicionais = 0;
        let detalhesHtml = '';
        
        if (i.complements) {
            // Layout Restaurante: Soma preços e gera HTML dos opcionais
            const grupos = Object.entries(i.complements);
            detalhesHtml = grupos.map(([grupo, escolhas]) => {
                const nomes = escolhas.map(e => {
                    // Soma o preço de cada escolha ao total de adicionais
                    precoAdicionais += parseFloat(e.preco || e.price || 0);
                    return e.nome || e.name;
                }).join(', ');
                return `<div class="lowercase text-slate-500 not-italic"><b class="capitalize">${grupo}:</b> ${nomes}</div>`;
            }).join('');
        } else if (i.v) {
            // Layout Varejo/Moda
            detalhesHtml = [i.v.size, i.v.color].filter(Boolean).join(' / ') || 'PADRÃO';
        } else {
            detalhesHtml = 'PADRÃO';
        }

        const precoFinalUnitario = precoBase + precoAdicionais;
        const nomeFinal = pOriginal ? pOriginal.name : i.name;
        
        return `
        <div class="flex gap-3 bg-white p-3 rounded-xl border border-slate-200">
            <img src="${i.img || i.image}" class="w-16 h-16 rounded-lg object-cover bg-slate-50">
            <div class="flex-1 min-w-0">
                <div class="flex justify-between font-bold text-xs text-slate-800">
                    <span class="truncate pr-2">${nomeFinal}</span>
                    <span class="shrink-0">
                        R$ ${(precoFinalUnitario * i.q).toFixed(2).replace('.', ',')}
                    </span>
                </div>
                
                <div class="text-[10px] text-slate-400 mt-1 uppercase italic leading-tight">
                    ${detalhesHtml}
                </div>

                <div class="flex items-center justify-between mt-2">
                    <div class="flex items-center bg-slate-100 rounded h-7 border border-slate-200">
                        <button onclick="window.modQty('${i.uid}', -1)" class="w-7 h-full flex items-center justify-center text-slate-500 font-bold">-</button>
                        <span class="w-8 text-center text-xs font-black text-slate-700">${i.q}</span>
                        <button onclick="window.modQty('${i.uid}', 1)" class="w-7 h-full flex items-center justify-center text-slate-500 font-bold">+</button>
                    </div>
                    <span class="text-[10px] text-slate-400">un. R$ ${precoFinalUnitario.toFixed(2).replace('.', ',')}</span>
                </div>
            </div>
        </div>`;
    }).join('');

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
                showToast(`⚠️ Limite atingido! Temos apenas ${estoque} unidades.`);
                return; 
            }
        }
    }

    item.q += d;
    if (item.q <= 0) state.cart = state.cart.filter(x => x.uid !== u);

    saveCart();
    updateCartUI();
if (window.updateNavigationBadges) window.updateNavigationBadges();
}

// --- CHECKOUT E FINALIZAÇÃO (WHATSAPP + FIREBASE) ---

export async function checkoutWhatsApp() { 
    if(!state.cart.length) return; 

    // 1. CAPTURA E VALIDAÇÃO DE INPUTS
    const nome = document.getElementById('checkName').value.trim();
    const telefone = document.getElementById('checkPhone')?.value.trim();
    const pagamento = document.getElementById('checkPayment').value;
    const trocoPara = document.getElementById('checkChange').value;
    const deliverySelect = document.getElementById('cartDeliverySelect');
    const isRetirada = deliverySelect.value === "0";
    const tipoNegocio = window.state?.storeConfig?.tipoNegocio || 'varejo';
    
    if(!nome || !pagamento || !telefone || telefone.length < 10) {
        showToast("⚠️ Preencha nome, WhatsApp e pagamento.");
        return;
    }

    let enderecoCompleto = "Retirada na Loja";
    let dadosEndereco = {};
    
    if(!isRetirada) {
        const rua = document.getElementById('checkStreet').value.trim();
        const numero = document.getElementById('checkNumber').value.trim();
        const bairro = document.getElementById('checkNeighborhood').value.trim();
        const ref = document.getElementById('checkReference').value.trim();
        
        if(!rua || !numero || !bairro) {
            showToast("⚠️ Preencha o endereço completo.");
            return;
        }
        enderecoCompleto = `${rua}, ${numero} - ${bairro}${ref ? ' ('+ref+')' : ''}`;
        dadosEndereco = { street: rua, number: numero, neighborhood: bairro, reference: ref };
    }

    // 2. INTERFACE DE CONFIRMAÇÃO
    const { isConfirmed } = await Swal.fire({
        title: 'Confirmar Pedido?',
        html: `Você será redirecionado para o WhatsApp.<br><br><b>⚠️ IMPORTANTE:</b> Apenas envie a mensagem sem alterar o texto!`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#EA1D2C',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sim, finalizar!',
        cancelButtonText: 'Revisar',
        reverseButtons: true
    });

    if (!isConfirmed) return;

    const btn = document.querySelector('button[onclick="window.checkoutWhatsApp()"]');
    if(btn) { 
        btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full mr-2"></span> Processando...`;
        btn.disabled = true; 
    }

    try {
        // 4. VALIDAÇÃO DE ESTOQUE (Ignorada para Restaurante)
        if (tipoNegocio !== 'restaurante') {
            for (const item of state.cart) {
                const productRef = doc(db, `stores/${state.STORE_ID}/products/${item.id}`);
                const pSnap = await getDocFromServer(productRef);
                if (pSnap.exists()) {
                    const pData = pSnap.data();
                    let estoquePainel = parseInt(pData.stock) || 0;
                    if (item.v?.size || item.v?.color) {
                        const v = pData.variations?.find(v => v.size === item.v.size && v.color === item.v.color);
                        if (v) estoquePainel = parseInt(v.stock) || 0;
                    }
                    if (estoquePainel < item.q) {
                        alertaEstoquePreso(item.name);
                        throw new Error("Estoque insuficiente");
                    }
                }
            }
        }

       // 5. CÁLCULOS FINANCEIROS (Ajustado para o Mapa de Complementos do Restaurante)
const subtotal = state.cart.reduce((totalGeral, item) => {
    const pOrig = state.allProducts.find(x => x.id === (item.productId || item.id));
    let precoBase = typeof getActivePrice === 'function' ? getActivePrice(pOrig, pagamento) : (item.price || 0);
    
    let somaAdicionais = 0;
    if (item.complements && typeof item.complements === 'object') {
        // Percorre cada categoria (ex: "cremes")
        Object.values(item.complements).forEach(listaDeEscolhas => {
            if (Array.isArray(listaDeEscolhas)) {
                listaDeEscolhas.forEach(c => {
                    // Soma usando 'preco', conforme consta nos seus dados
                    somaAdicionais += parseFloat(c.preco || 0);
                });
            }
        });
    }
    
    return totalGeral + ((precoBase + somaAdicionais) * item.q);
}, 0);

const taxaEntrega = isRetirada ? 0 : parseFloat(deliverySelect.value);
const totalFinal = subtotal + taxaEntrega;

let infoPagamento = pagamento; 
if(pagamento === 'Dinheiro' && trocoPara) {
    infoPagamento += ` (Troco para R$ ${trocoPara})`;
}
        
// 6. PERSISTÊNCIA NO FIREBASE
const orderData = {
    customer: { 
        name: nome, 
        phone: telefone, 
        addressString: enderecoCompleto, 
        addressDetails: dadosEndereco 
    },
    items: state.cart.map(i => ({
        productId: i.productId || i.id,
        name: i.name,
        q: parseInt(i.q),
        price: parseFloat(i.price),
        complements: i.complements || {},
        img: i.img || ""
    })),
    paymentMethod: infoPagamento, // Agora ela existe aqui!
    deliveryFee: taxaEntrega,
    total: totalFinal,
    createdAt: serverTimestamp(),
    status: 'pending_whatsapp',
    tipo: tipoNegocio
};

        const docRef = await addDoc(collection(db, `stores/${state.STORE_ID}/orders`), orderData);
        const shortId = docRef.id.slice(-5).toUpperCase();

        // 7. CONSTRUÇÃO DA MENSAGEM WHATSAPP
        let msg = `*PEDIDO: #${shortId}*\n---------------------------\n`;
        msg += `👤 *Cliente:* ${nome}\n*ITENS:*\n`;
        
        state.cart.forEach(item => {
            const vars = [item.v?.size, item.v?.color].filter(Boolean).join('/');
            msg += `• ${item.q}x ${item.name} ${vars ? '('+vars+')' : ''}\n`;
            
            let somaAdicionaisItem = 0;
            if (tipoNegocio === 'restaurante' && item.complements) {
                Object.entries(item.complements).forEach(([categoria, escolhas]) => {
                    escolhas.forEach(c => {
                        const vAdicional = parseFloat(c.preco || c.price || 0);
                        msg += `  └ ${c.nome || c.name} (R$ ${vAdicional.toFixed(2)})\n`;
                        somaAdicionaisItem += vAdicional;
                    });
                });
            }
            
            const itemTotal = (parseFloat(item.price || 0) + somaAdicionaisItem) * item.q;
            msg += `  Sub: R$ ${itemTotal.toFixed(2).replace('.',',')}\n`;
        });

        msg += `\n*VALORES:*\nSubtotal: R$ ${subtotal.toFixed(2).replace('.',',')}\n`;
        if(!isRetirada) msg += `Taxa: R$ ${taxaEntrega.toFixed(2).replace('.',',')}\n`;
        msg += `Total: *R$ ${totalFinal.toFixed(2).replace('.',',')}*\n\n`;
        msg += `*PAG:* ${infoPagamento}\n*LOCAL:* ${enderecoCompleto}\n`;

        const link = `https://wa.me/${state.lojaZapDestino}?text=${encodeURIComponent(msg)}`;
        
        state.cart = [];
        if (typeof saveCart === 'function') saveCart();
        window.open(link, '_blank');
        setTimeout(() => { window.location.reload(); }, 500);

    } catch (e) {
        console.error("Erro no checkout:", e);
        if(btn) { btn.disabled = false; btn.innerHTML = "Finalizar Pedido"; }
        if(e.message !== "Estoque insuficiente") showToast("❌ Erro ao processar pedido.");
    }
}


// --- NAVEGAÇÃO, CONTROLE DA SACOLA E ALERTAS (VERSÃO UNIFICADA) ---

export function goToStep1() {
    const s1 = document.getElementById('step1');
    const s2 = document.getElementById('step2');
    const title = document.getElementById('cartTitle');

    if (s1) s1.classList.remove('hidden');
    if (s2) s2.classList.add('hidden');
    if (title) title.textContent = "Minha Sacola";
}

export function goToStep2() {
    if (!state.cart || !state.cart.length) return showToast("Sua sacola está vazia!");
    
    const s1 = document.getElementById('step1');
    const s2 = document.getElementById('step2');
    const title = document.getElementById('cartTitle');

    if (s1) s1.classList.add('hidden');
    if (s2) s2.classList.remove('hidden');
    if (title) title.textContent = "Dados de Entrega";
    
    toggleAddressFields();
}

export function toggleAddressFields() {
    const sel = document.getElementById('cartDeliverySelect');
    const fields = document.getElementById('addressFields');
    if (sel && fields) {
        sel.value === "0" ? fields.classList.add('hidden') : fields.classList.remove('hidden');
    }
    if (typeof updateCartTotals === 'function') updateCartTotals();
}

export function alertaEstoquePreso(nome) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: 'Item Esgotado ou Reservado',
            html: `O item <b>${nome}</b> acabou de ser reservado. Se a compra não for concluída, ele voltará ao estoque.`,
            icon: 'info',
            confirmButtonText: 'ENTENDIDO'
        }).then(() => window.location.reload());
    } else {
        alert("O item " + nome + " está reservado.");
        window.location.reload();
    }
}

// --- FUNÇÕES DE INTERFACE DA SACOLA ---

export function openCart() {
    const modal = document.getElementById('modalCart'); // O container pai (escurecimento)
    const drawer = document.getElementById('cartDrawer'); // O painel lateral
    
    if (modal && drawer) {
        // 1. Mostra o modal pai
        modal.classList.remove('hidden'); 
        
        // 2. Pequeno delay para a animação de slide (CSS translate) funcionar
        setTimeout(() => {
            drawer.classList.remove('translate-x-full');
            drawer.classList.add('translate-x-0');
        }, 10);
        
        // 3. Trava o scroll do site ao fundo
        document.body.style.overflow = 'hidden'; 
        
        // 4. Força a atualização dos itens e valores (Aqui corrigiremos os valores zerados no próximo bloco)
        if (typeof updateCartUI === 'function') {
            updateCartUI();
        }
    } else {
        console.warn("Elementos 'modalCart' ou 'cartDrawer' não encontrados no HTML.");
    }
}

export function closeCart() {
    const modal = document.getElementById('modalCart');
    const drawer = document.getElementById('cartDrawer');

    if (modal && drawer) {
        // 1. Inicia animação de saída
        drawer.classList.add('translate-x-full');
        drawer.classList.remove('translate-x-0');
        
        // 2. Espera a animação (300ms) para esconder o fundo e destravar o scroll
        setTimeout(() => {
            modal.classList.add('hidden');
            document.body.style.overflow = ''; 
        }, 300);
    }
}

// --- EXPOSIÇÃO GLOBAL ---
// Necessário para que os botões "onclick" (inclusive do Modo Restaurante) funcionem
window.openCart = openCart;
window.closeCart = closeCart;
window.closeCartModal = closeCart; // Atalho para compatibilidade com o seu HTML

// --- EXPOSIÇÃO GLOBAL (Obrigatório para módulos/onclick) ---
window.goToStep1 = goToStep1;
window.goToStep2 = goToStep2;
window.toggleAddressFields = toggleAddressFields;
window.toggleCart = openCart; // Atalho usado em alguns temas
window.alertaEstoquePreso = alertaEstoquePreso;

// Garante que funções externas de outros arquivos também sejam globais
if (typeof updateCartUI === 'function') window.updateCartUI = updateCartUI;
if (typeof modQty === 'function') window.modQty = modQty;
if (typeof addToCart === 'function') window.addToCart = addToCart;
