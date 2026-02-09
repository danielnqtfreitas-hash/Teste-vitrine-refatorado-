
import { state, saveCart } from './state.js';
import { showToast, db, doc, getDocFromServer, collection, query, where, getDocsFromServer, addDoc, writeBatch, serverTimestamp, increment, setDoc } from './config.js';
import { closeModalDetails } from './ui.js';

// --- HELPER: Preço Ativo (Pix vs Cartão) ---
function getActivePrice(p, method) {
    if (!p) return 0;
    const agora = Date.now();
    const isPromoValid = p.promoValue && p.promoValue < p.value && (p.promoUntil ? p.promoUntil > agora : true);
    
    const precoPixBase = p.priceCash || p.value;
    const precoCardBase = p.priceCard || p.value;
    const diferencaCartao = precoCardBase - precoPixBase;

    if (method === 'Cartão') {
        if (isPromoValid) return p.promoValue + diferencaCartao;
        return precoCardBase;
    }
    // Pix ou Dinheiro
    if (isPromoValid) return p.promoValue; 
    return precoPixBase;          
}

// --- ADICIONAR AO CARRINHO (Com verificação de estoque real) ---

export async function addToCart(p, q, v) {
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

    // 2. Busca Reservas Fantasmas (Shadow Stock)
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

    // 3. Define Preço e Estoque Específico
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
            price = isPromoAtiva ? (comb.price * fatorDesconto) : comb.price;
            skuFinal = comb.sku || skuFinal;
        }
    }

    // 4. Validação Final
    const stockDisponivelReal = stockEspecifico - totalReservado;
    const uid = `${p.id}-${(v.size || '').trim()}-${(v.color || '').trim()}`;
    const naSacola = state.cart.find(x => x.uid === uid);
    const totalDesejado = (naSacola ? naSacola.q : 0) + q;

    if (totalDesejado > stockDisponivelReal) {
        if (window.alertaEstoquePreso) window.alertaEstoquePreso(pAtualizado.name);
        else showToast("Estoque indisponível ou reservado.");
        return;
    }

    // 5. Atualiza Carrinho
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
    showToast(`<b>${pAtualizado.name}</b> na sacola!`); 
    closeModalDetails(); 
}

// --- GERENCIAMENTO VISUAL DA SACOLA ---

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
    const cnt = state.cart.reduce((a, b) => a + b.q, 0); 
    const b = document.getElementById('cartBadge'); 
    if(b) {
        b.textContent = cnt; 
        b.classList.toggle('scale-0', cnt === 0);
    }

    const l = document.getElementById('cartList');
    const empty = document.getElementById('cartEmptyMsg');
    const step1Footer = document.getElementById('footerStep1');
    const currentMethod = document.getElementById('checkPayment')?.value || "";

    if(!state.cart.length) { 
        if(l) l.innerHTML = ''; 
        if(empty) empty.classList.remove('hidden'); 
        if(step1Footer) step1Footer.classList.add('hidden');
    } else {
        if(empty) empty.classList.add('hidden'); 
        if(step1Footer) step1Footer.classList.remove('hidden');

        l.innerHTML = state.cart.map(i => {
            const pOriginal = state.allProducts.find(x => x.id === i.id);
            const precoDinamico = getActivePrice(pOriginal, currentMethod);
            
            return `
            <div class="flex gap-3 bg-white p-3 rounded-xl border border-slate-200">
                <img src="${i.img}" class="w-16 h-16 rounded-lg object-cover bg-slate-50">
                <div class="flex-1">
                    <div class="flex justify-between font-bold text-xs text-slate-800">
                        <span class="truncate pr-2">${i.name}</span>
                        <span class="shrink-0" id="cart-item-price-${i.uid}">
                            R$ ${(precoDinamico * i.q).toFixed(2).replace('.', ',')}
                        </span>
                    </div>
                    <div class="text-[10px] text-slate-400 mt-1 uppercase italic">
                        ${[i.v.size, i.v.color].filter(Boolean).join(' / ')}
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
        const produtoOriginal = state.allProducts.find(p => p.id === item.id);
        if (!produtoOriginal) return;

        let estoqueDisponivel = parseInt(produtoOriginal.stock) || 0;
        if (produtoOriginal.variations?.length > 0) {
            const variacao = produtoOriginal.variations.find(v => 
                v.size === item.v.size && v.color === item.v.color
            );
            if (variacao) estoqueDisponivel = parseInt(variacao.stock) || 0;
        }

        if (item.q + d > estoqueDisponivel) {
            showToast(`⚠️ Limite atingido! Temos apenas ${estoqueDisponivel} unidades.`);
            return; 
        }
    }

    item.q += d;
    if (item.q <= 0) {
        state.cart = state.cart.filter(x => x.uid !== u);
    }

    saveCart();
    updateCartUI();
}

// --- CHECKOUT E FINALIZAÇÃO (WHATSAPP) ---

export async function checkoutWhatsApp() { 
    if(!state.cart.length) return; 

    // 1. Captura e Validação
    const nome = document.getElementById('checkName').value.trim();
    const telefone = document.getElementById('checkPhone') ? document.getElementById('checkPhone').value.trim() : "";
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

    // 2. Feedback visual (Loading)
    const btn = document.querySelector('button[onclick="window.checkoutWhatsApp()"]');
    const oldBtnContent = btn ? btn.innerHTML : "Finalizar";
    if(btn) {
        btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-white/20 border-t-white rounded-full mr-2"></span> Validando...`;
        btn.disabled = true;
    }

    try {
        // 3. Validação FINAL de Estoque (Back-end Check)
        for (const item of state.cart) {
            const productRef = doc(db, `stores/${state.STORE_ID}/products/${item.id}`);
            const pSnap = await getDocFromServer(productRef);
            
            if (pSnap.exists()) {
                const pData = pSnap.data();
                let estoquePainel = parseInt(pData.stock) || 0;

                if (item.v.size || item.v.color) {
                    const v = pData.variations?.find(v => 
                        (v.size || "").trim().toLowerCase() === (item.v.size || "").trim().toLowerCase() && 
                        (v.color || "").trim().toLowerCase() === (item.v.color || "").trim().toLowerCase()
                    );
                    if (v) estoquePainel = parseInt(v.stock) || 0;
                }

                // Checa reservas pendentes
                const resRef = collection(db, `stores/${state.STORE_ID}/stock_reserves`);
                const q = query(resRef, where("productId", "==", item.id), where("status", "==", "pending"));
                const resSnap = await getDocsFromServer(q);

                let totalReservado = 0;
                resSnap.forEach(rdoc => {
                    const r = rdoc.data();
                    const rSize = (r.variation?.size || "").toString().toLowerCase().trim();
                    const rColor = (r.variation?.color || "").toString().toLowerCase().trim();
                    const itemSize = (item.v?.size || "").toString().toLowerCase().trim();
                    const itemColor = (item.v?.color || "").toString().toLowerCase().trim();

                    if (rSize === itemSize && rColor === itemColor) {
                        totalReservado += (parseInt(r.qty) || 0);
                    }
                });
                
                const estoqueDisponivelReal = estoquePainel - totalReservado;

                if (estoqueDisponivelReal < item.q) {
                    if (btn) { btn.innerHTML = oldBtnContent; btn.disabled = false; }
                    alertaEstoquePreso(item.name);
                    return; 
                }
            }
        }

        // 4. Cálculos Financeiros
        const subtotal = state.cart.reduce((total, item) => {
            const pOriginal = state.allProducts.find(x => x.id === item.id);
            if (!pOriginal) return total;
            const precoDinamico = getActivePrice(pOriginal, pagamento);
            return total + (precoDinamico * item.q);
        }, 0);

        const taxaEntrega = isRetirada ? 0 : (parseFloat(deliverySelect.value) || 0);
        const totalFinal = subtotal + taxaEntrega;

        let infoPagamento = pagamento;
        if(pagamento === 'Dinheiro' && trocoPara) {
            const valorTrocoDigitado = parseFloat(trocoPara);
            if(valorTrocoDigitado > totalFinal) infoPagamento += ` (Troco para R$ ${valorTrocoDigitado.toFixed(2).replace('.',',')})`;
        }
        if(pagamento === 'Cartão') {
            const parcelas = document.getElementById('checkInstallments')?.value || 1;
            if(parcelas > 1) infoPagamento += ` (${parcelas}x)`;
        }

        // 5. Registro no Firebase (Pedido)
        const orderData = {
            customer: { name: nome, phone: telefone, addressString: enderecoCompleto, addressDetails: isRetirada ? null : dadosEndereco },
            items: state.cart.map(item => {
                const pOrig = state.allProducts.find(x => x.id === item.id);
                const precoReal = getActivePrice(pOrig, pagamento);
                return {
                    id: item.id, name: item.name, sku: item.sku || "N/A", qty: item.q, price: precoReal, 
                    variationDetails: { color: item.v.color || null, size: item.v.size || null, image: item.img, sku: item.sku || "N/A" }
                };
            }),
            paymentMethod: infoPagamento,
            deliveryFee: taxaEntrega,
            total: totalFinal,
            status: 'pending_whatsapp', 
            createdAt: serverTimestamp(),
            platform: 'web_catalog',
            stockDeducted: false 
        };

        const docRef = await addDoc(collection(db, `stores/${state.STORE_ID}/orders`), orderData);
        const shortId = docRef.id.slice(-5).toUpperCase();

        // 6. Reserva Fantasma (Shadow Stock)
        const reserveBatch = writeBatch(db);
        const sID = shortId.toUpperCase(); 

        state.cart.forEach(item => {
            const s = (item.v.size && item.v.size !== "null") ? item.v.size.toString().toLowerCase().replace(/\s/g,'') : "";
            const c = (item.v.color && item.v.color !== "null") ? item.v.color.toString().toLowerCase().replace(/\s/g,'') : "";
            const resId = `res_${sID}_${item.id}_${s}_${c}`;
            const resRef = doc(db, `stores/${state.STORE_ID}/stock_reserves`, resId);

            reserveBatch.set(resRef, {
                productId: item.id, qty: item.q,
                variation: { size: item.v.size || null, color: item.v.color || null },
                createdAt: serverTimestamp(), orderId: sID, status: 'pending'
            });
        });
        await reserveBatch.commit();

        // 7. Montagem Mensagem WhatsApp
        let msg = `🛍️ *PEDIDO: #${shortId}*\n---------------------------\n`;
        msg += `👤 *Cliente:* ${nome}\n📦 *ITENS:*\n`;
        
        state.cart.forEach(item => {
            const pOriginal = state.allProducts.find(x => x.id === item.id);
            const precoDinâmico = getActivePrice(pOriginal, pagamento);
            const vars = [item.v.size, item.v.color].filter(Boolean).join('/');
            
            msg += `• ${item.q}x ${item.name} ${vars ? '('+vars+')' : ''}\n`;
            msg += `  Unit: R$ ${precoDinâmico.toFixed(2).replace('.',',')} | Sub: R$ ${(precoDinâmico * item.q).toFixed(2).replace('.',',')}\n`;
            if(pagamento === 'Cartão' && pOriginal.maxInstallments > 1) msg += `  (Até ${pOriginal.maxInstallments}x)\n`;
            msg += `  _Ref: ${item.sku}_\n`;
        });

        msg += `\n💰 *VALORES:*\nSubtotal: R$ ${subtotal.toFixed(2).replace('.',',')}\n`;
        if(!isRetirada) msg += `Entrega: R$ ${taxaEntrega.toFixed(2).replace('.',',')}\n`;
        msg += `*Total: R$ ${totalFinal.toFixed(2).replace('.',',')}*\n\n`;
        msg += `💳 *PAG:* ${infoPagamento}\n📍 *LOCAL:* ${enderecoCompleto}\n`;
        msg += `---------------------------\n_Pedido gerado via Vitrine Online_`;

        // 8. Limpeza e Redirecionamento
        const link = `https://wa.me/${state.lojaZapDestino}?text=${encodeURIComponent(msg)}`;
        
        // Limpa Estado
        state.filters.search = ""; 
        const desktopSearch = document.getElementById('desktopSearch');
        if(desktopSearch) desktopSearch.value = "";
        
        state.cart = [];
        saveCart();
        updateCartUI();

        window.closeCartModal(); 
        
        // Abre WhatsApp e recarrega para limpar tudo
        window.open(link, '_blank');
        setTimeout(() => { window.location.reload(); }, 1000); 
        
    } catch (error) {
        console.error("Erro no checkout:", error);
        showToast("❌ Erro ao processar pedido.");
    } finally {
        if(btn) { btn.innerHTML = oldBtnContent; btn.disabled = false; }
    }
}

// --- NAVEGAÇÃO DO MODAL DE CARRINHO ---

export function goToStep1() {
    document.getElementById('step1')?.classList.remove('hidden');
    document.getElementById('step2')?.classList.add('hidden');
    document.getElementById('btnBackStep')?.classList.add('hidden');
    document.getElementById('cartTitle').textContent = "Minha Sacola";
}

export function goToStep2() {
    if (state.cart.length === 0) {
        showToast("Sua sacola está vazia!");
        return;
    }
    
    document.getElementById('step1').classList.add('hidden');
    document.getElementById('step2').classList.remove('hidden');
    document.getElementById('btnBackStep').classList.remove('hidden');
    document.getElementById('cartTitle').textContent = "Dados de Entrega";
    
    setTimeout(() => { toggleAddressFields(); }, 50);
    if(window.lucide) window.lucide.createIcons();
}

export function toggleAddressFields() {
    const deliverySelect = document.getElementById('cartDeliverySelect');
    const addressFields = document.getElementById('addressFields');
    if (!deliverySelect || !addressFields) return;

    if (deliverySelect.value === "0" || deliverySelect.value === "") {
        addressFields.classList.add('hidden');
    } else {
        addressFields.classList.remove('hidden');
    }
    updateCartTotals();
}

// --- ALERTA DE ESTOQUE (SWEETALERT) ---

export function alertaEstoquePreso(nomeItem) {
    Swal.fire({
        title: 'Item em Processamento',
        html: `Ops! O item <b>${nomeItem}</b> acabou de ser reservado por outro cliente.<br><br>Se a compra dele não for concluída, o produto voltará a ficar disponível.`,
        icon: 'info',
        confirmButtonText: 'ENTENDIDO, ATUALIZAR LOJA',
        confirmButtonColor: getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#000000',
        allowOutsideClick: false,
        customClass: {
            container: 'z-[10000]',
            popup: 'rounded-[2rem]',
            confirmButton: 'rounded-xl px-10 py-4 font-bold text-xs uppercase tracking-widest'
        }
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.removeItem(`app_cache_v4_${state.STORE_ID}`);
            const urlLimpa = window.location.origin + window.location.pathname + '?t=' + Date.now();
            window.location.href = urlLimpa;
        }
    });
}
