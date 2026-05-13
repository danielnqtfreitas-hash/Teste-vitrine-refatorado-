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

    // Atualiza os textos de subtotal e total
    document.querySelectorAll('.subtotal-display').forEach(d => {
        d.textContent = `R$ ${subtotalCalculado.toFixed(2).replace('.', ',')}`;
    });
    
    const totalDisplay = document.getElementById('cartFinalTotal');
    if(totalDisplay) {
        totalDisplay.textContent = `R$ ${(subtotalCalculado + deliveryFee).toFixed(2).replace('.', ',')}`; 
    }

    // --- ESSENCIAL: Atualiza o contador da barra inferior sempre que o total mudar ---
    if (window.updateNavigationBadges) window.updateNavigationBadges();
    
    renderInstallments();
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
    const totalItens = state.cart.reduce((a, b) => a + b.q, 0); 
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
        console.log("Aguardando carregamento do catálogo...");
        return; 
    }

    if(emptyMsg) emptyMsg.classList.add('hidden'); 
    if(footer) footer.classList.remove('hidden');

    list.innerHTML = state.cart.map(i => {
        // Busca o produto original (usa o i.productId se for restaurante ou i.id se for varejo)
        const pOriginal = state.allProducts.find(x => x.id === (i.productId || i.id));
        
        const precoDinamico = pOriginal ? getActivePrice(pOriginal, currentMethod) : i.price;
        const nomeFinal = pOriginal ? pOriginal.name : i.name;
        
        // --- Lógica de Opções (Moda vs Restaurante) ---
        let detalhesHtml = '';
        
        if (i.v) {
            // Layout Varejo/Moda
            detalhesHtml = [i.v.size, i.v.color].filter(Boolean).join(' / ') || 'PADRÃO';
        } else if (i.complements) {
            // Layout Restaurante (Mostra os opcionais escolhidos)
            detalhesHtml = Object.entries(i.complements).map(([grupo, escolhas]) => {
                const nomes = escolhas.map(e => e.nome).join(', ');
                return `<div class="lowercase text-slate-500 not-italic"><b class="capitalize">${grupo}:</b> ${nomes}</div>`;
            }).join('');
        } else {
            detalhesHtml = 'PADRÃO';
        }

        return `
        <div class="flex gap-3 bg-white p-3 rounded-xl border border-slate-200">
            <img src="${i.img}" class="w-16 h-16 rounded-lg object-cover bg-slate-50">
            <div class="flex-1 min-w-0">
                <div class="flex justify-between font-bold text-xs text-slate-800">
                    <span class="truncate pr-2">${nomeFinal}</span>
                    <span class="shrink-0">
                        R$ ${(precoDinamico * i.q).toFixed(2).replace('.', ',')}
                    </span>
                </div>
                
                <div class="text-[10px] text-slate-400 mt-1 uppercase italic leading-tight">
                    ${detalhesHtml}
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

    // 2. INTERFACE DE CONFIRMAÇÃO (UX DEFENSIVA)
    // O SweetAlert interrompe aqui antes de mexer no banco de dados ou estoque
    const { isConfirmed } = await Swal.fire({
        title: 'Confirmar Pedido?',
        html: `Você será redirecionado para o WhatsApp.<br><br><b>⚠️ IMPORTANTE:</b> Para sua segurança, apenas envie a mensagem que já aparecerá escrita. <br><br><span style="color: #e11d48; font-weight: bold;">NÃO APAGUE NEM ALTERE O TEXTO!</span>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: 'var(--color-primary)',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sim, finalizar no WhatsApp!',
        cancelButtonText: 'Revisar Pedido',
        reverseButtons: true
    });

    if (!isConfirmed) return; // Usuário desistiu ou quer revisar

    // 3. ESTADO DE CARREGAMENTO NO BOTÃO
    const btn = document.querySelector('button[onclick="window.checkoutWhatsApp()"]');
    if(btn) { 
        btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full mr-2"></span> Processando...`;
        btn.disabled = true; 
    }

    try {
        // 4. VALIDAÇÃO DE ESTOQUE (SERVER-SIDE CHECK)
        for (const item of state.cart) {
            const productRef = doc(db, `stores/${state.STORE_ID}/products/${item.id}`);
            const pSnap = await getDocFromServer(productRef);
            if (pSnap.exists()) {
                const pData = pSnap.data();
                let estoquePainel = parseInt(pData.stock) || 0;
                if (item.v.size || item.v.color) {
                    const v = pData.variations?.find(v => v.size === item.v.size && v.color === item.v.color);
                    if (v) estoquePainel = parseInt(v.stock) || 0;
                }
                if (estoquePainel < item.q) {
                    alertaEstoquePreso(item.name);
                    throw new Error("Estoque insuficiente");
                }
            }
        }

        // 5. CÁLCULOS FINANCEIROS FINAL
        // Assume-se a existência de getActivePrice no escopo ou importada
        const subtotal = state.cart.reduce((total, item) => {
            const pOrig = state.allProducts.find(x => x.id === item.id);
            // Fallback caso getActivePrice não esteja disponível globalmente
            const precoItem = typeof getActivePrice === 'function' ? getActivePrice(pOrig, pagamento) : item.price;
            return total + (precoItem * item.q);
        }, 0);

        const taxaEntrega = isRetirada ? 0 : parseFloat(deliverySelect.value);
        const totalFinal = subtotal + taxaEntrega;

        let infoPagamento = pagamento;
        if(pagamento === 'Dinheiro' && trocoPara) infoPagamento += ` (Troco para R$ ${trocoPara})`;
        if(pagamento === 'Cartão') {
            const parc = document.getElementById('checkInstallments')?.value || 1;
            if(parc > 1) infoPagamento += ` (${parc}x)`;
        }

        // 6. PERSISTÊNCIA NO FIREBASE (PEDIDO + SHADOW STOCK)
        const orderData = {
            customer: { name: nome, phone: telefone, addressString: enderecoCompleto, addressDetails: dadosEndereco },
            items: state.cart,
            paymentMethod: infoPagamento,
            deliveryFee: taxaEntrega,
            total: totalFinal,
            createdAt: serverTimestamp(),
            status: 'pending_whatsapp'
        };

        const docRef = await addDoc(collection(db, `stores/${state.STORE_ID}/orders`), orderData);
        const shortId = docRef.id.slice(-5).toUpperCase();

        const reserveBatch = writeBatch(db);
        state.cart.forEach(item => {
            const resId = `res_${shortId}_${item.uid.replace(/-/g,'_')}`;
            const resRef = doc(db, `stores/${state.STORE_ID}/stock_reserves`, resId);
            reserveBatch.set(resRef, {
                productId: item.id, qty: item.q, variation: item.v,
                createdAt: serverTimestamp(), orderId: shortId, status: 'pending'
            });
        });
        await reserveBatch.commit();

                    // 7. CONSTRUÇÃO DA MENSAGEM WHATSAPP
        let msg = `*PEDIDO: #${shortId}*\n---------------------------\n`;
        msg += `👤 *Cliente:* ${nome}\n*ITENS:*\n`;
        state.cart.forEach(item => {
            const vars = [item.v.size, item.v.color].filter(Boolean).join('/');
            msg += `• ${item.q}x ${item.name} ${vars ? '('+vars+')' : ''}\n`;
            msg += `  Sub: R$ ${(item.price * item.q).toFixed(2).replace('.',',')} | _SKU: ${item.sku}_\n`;
        });
        msg += `\n*VALORES:*\nSubtotal: R$ ${subtotal.toFixed(2).replace('.',',')}\n`;
        if(!isRetirada) msg += `Taxa: R$ ${taxaEntrega.toFixed(2).replace('.',',')}\n`;
        msg += `Total: *R$ ${totalFinal.toFixed(2).replace('.',',')}*\n\n`;
        msg += `*PAG:* ${infoPagamento}\n*LOCAL:* ${enderecoCompleto}\n`;

        const link = `https://wa.me/${state.lojaZapDestino}?text=${encodeURIComponent(msg)}`;
        
        // 8. FINALIZAÇÃO E LIMPEZA
        state.cart = [];
        if (typeof saveCart === 'function') saveCart(); // Se existir no state.js
        
        // Abre o WhatsApp
        window.open(link, '_blank');
        
        // Pequeno delay para garantir que o window.open não seja bloqueado antes do reload
        setTimeout(() => {
            window.location.reload();
        }, 500);

    } catch (e) {
        console.error("Erro no checkout:", e);
        if(btn) { 
            btn.disabled = false; 
            btn.innerHTML = "Finalizar Pedido"; 
        }
        // Se não for erro de estoque (já tratado pelo alertaEstoquePreso), mostra toast genérico
        if(e.message !== "Estoque insuficiente") {
            showToast("❌ Erro ao processar pedido. Tente novamente.");
        }
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

export function openCart() {
    // Busca os dois IDs possíveis (Varejo e Restaurante)
    const drawer = document.getElementById('cartDrawer') || document.getElementById('cartSection');
    
    if (!drawer) {
        console.warn("Elemento da sacola não encontrado.");
        return;
    }

    drawer.classList.remove('hidden');
    drawer.style.display = 'block'; // Força exibição caso o CSS falhe
    
    // 1. Trava a rolagem do fundo (body)
    document.body.style.overflow = 'hidden'; 
    
    // 2. Configura a rolagem interna da lista
    const list = document.getElementById('cartList');
    if (list) {
        list.style.maxHeight = '70vh';
        list.style.overflowY = 'auto';
    }

    // Sempre garante que começa no passo 1
    goToStep1();
    
    if (typeof updateCartUI === 'function') updateCartUI();
}

export function closeCart() {
    const drawer = document.getElementById('cartDrawer') || document.getElementById('cartSection');
    if (drawer) {
        drawer.classList.add('hidden');
        drawer.style.display = 'none';
    }
    
    // 3. Devolve a rolagem ao site
    document.body.style.overflow = 'auto'; 
}

// --- EXPOSIÇÃO GLOBAL (Obrigatório para módulos/onclick) ---
window.goToStep1 = goToStep1;
window.goToStep2 = goToStep2;
window.toggleAddressFields = toggleAddressFields;
window.openCart = openCart;
window.closeCart = closeCart;
window.toggleCart = openCart; // Atalho usado em alguns temas
window.alertaEstoquePreso = alertaEstoquePreso;

// Garante que funções externas de outros arquivos também sejam globais
if (typeof updateCartUI === 'function') window.updateCartUI = updateCartUI;
if (typeof modQty === 'function') window.modQty = modQty;
if (typeof addToCart === 'function') window.addToCart = addToCart;
