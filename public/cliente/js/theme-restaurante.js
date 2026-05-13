// js/theme-restaurante.js
export const RestauranteTheme = {
    // 1. Injeta a casca do iFood
    setup() {
        const tipoNegocio = window.state?.storeConfig?.tipoNegocio || 'varejo';
        if (tipoNegocio !== 'restaurante') return;

        const selectorsToHide = ['#magicSections', '#categoryContainer', 'nav.fixed.bottom-0', '#promoBanner'];
        selectorsToHide.forEach(s => {
            const el = document.querySelector(s);
            if (el) el.style.display = 'none';
        });

        const container = document.getElementById('catalogContainer');
        if (container) {
            container.className = "flex flex-col w-full bg-white min-h-screen pb-32";
            container.style.padding = "0";
        }

        this.renderDeliveryHeader();
        this.renderFloatingCart();
    },

    // 2. Modal estilo Restaurante
    renderModal(p) {
        const modal = document.getElementById('modalDetails');
        if (!modal) return;

        const precoBase = parseFloat(p.value || p.price || p.preco || 0);
        const nomeProd = p.name || p.nome || 'Produto';
        const descProd = p.description || p.descricao || '';
        const imagemProd = (p.images && p.images.length > 0) ? p.images[0] : 'https://placehold.co/400?text=Sem+Foto';
        
        const listaComplementos = Array.isArray(p.complements) ? p.complements : [];

        window.currentProductSelection = {
            ...p,
            basePrice: precoBase,
            totalPrice: precoBase,
            quantity: 1,
            selectedComplements: {} 
        };

        modal.innerHTML = `
            <div class="fixed inset-0 bg-white z-[1001] overflow-y-auto animate-slide-up pointer-events-auto">
                <div class="relative h-64 w-full bg-gray-100">
                    <img src="${imagemProd}" class="w-full h-full object-cover">
                    <button onclick="window.closeModalDetails()" class="absolute top-4 left-4 bg-white/90 p-2 rounded-full shadow-md z-[1002]">
                        <i data-lucide="chevron-left" class="w-6 h-6 text-gray-800"></i>
                    </button>
                </div>

                <div class="p-4 border-b border-gray-100">
                    <h2 class="text-2xl font-bold text-gray-800">${nomeProd}</h2>
                    <p class="text-gray-500 text-sm mt-1 leading-relaxed">${descProd}</p>
                    <div class="mt-2 text-green-600 font-bold text-lg">
                        R$ ${precoBase.toFixed(2).replace('.', ',')}
                    </div>
                </div>

                <div id="complementsContainer" class="pb-40">
                    ${this.renderComplementGroups(listaComplementos)}
                </div>

                <div class="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex items-center gap-4 z-[1002] shadow-lg">
                    <div class="flex items-center border border-gray-200 rounded-xl bg-gray-50 p-1">
                        <button onclick="RestauranteTheme.updateQty(-1)" class="p-2 text-[#EA1D2C]"><i data-lucide="minus" class="w-5 h-5"></i></button>
                        <span id="modalQty" class="w-8 text-center font-bold">1</span>
                        <button onclick="RestauranteTheme.updateQty(1)" class="p-2 text-[#EA1D2C]"><i data-lucide="plus" class="w-5 h-5"></i></button>
                    </div>
                    
                    <button id="btnAddRestaurante" onclick="RestauranteTheme.addToCartWithComplements()" 
                        class="flex-1 bg-[#EA1D2C] text-white py-4 rounded-xl font-bold flex justify-between px-6 shadow-lg disabled:bg-gray-300 transition-all">
                        <span>Adicionar</span>
                        <span id="modalTotalPrice">R$ ${precoBase.toFixed(2).replace('.', ',')}</span>
                    </button>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        if(window.lucide) window.lucide.createIcons();
        this.validateSelection();
    },

    renderComplementGroups(groups) {
        if (!groups || groups.length === 0) return '';
        return groups.map(group => {
            const tituloGrupo = group.name || group.titulo || "Opcionais";
            const itensDoGrupo = group.items || group.itens || [];
            return `
                <div class="bg-gray-50 p-4 border-b border-gray-100 mt-4">
                    <div class="flex flex-col">
                        <span class="font-bold text-gray-800 text-sm uppercase tracking-tight">${tituloGrupo}</span>
                        <span class="text-[10px] text-gray-500 font-medium">
                            ${group.min > 0 ? `<span class="text-red-500">OBRIGATÓRIO</span> • ` : ''} 
                            ESCOLHA DE ${group.min || 0} A ${group.max || 1}
                        </span>
                    </div>
                </div>
                <div>
                    ${itensDoGrupo.map(item => {
                        const precoItem = parseFloat(item.price || item.preco || 0);
                        const nomeItem = item.name || item.nome;
                        return `
                        <label class="flex items-center justify-between p-4 border-b border-gray-50 active:bg-gray-50 cursor-pointer">
                            <div class="flex flex-col">
                                <span class="text-sm text-gray-700 font-medium">${nomeItem}</span>
                                ${precoItem > 0 ? `<span class="text-xs text-green-600">+ R$ ${precoItem.toFixed(2).replace('.', ',')}</span>` : ''}
                            </div>
                            <input type="${(group.max || 1) === 1 ? 'radio' : 'checkbox'}" 
                                   name="group_${tituloGrupo}" 
                                   class="w-5 h-5 accent-[#EA1D2C]"
                                   onchange="RestauranteTheme.handleComplementClick('${tituloGrupo}', '${nomeItem}', ${precoItem}, ${group.max || 1}, this)">
                        </label>
                    `}).join('')}
                </div>
            `;
        }).join('');
    },

    handleComplementClick(groupTitle, itemName, itemPrice, max, input) {
        if (!window.currentProductSelection.selectedComplements[groupTitle]) {
            window.currentProductSelection.selectedComplements[groupTitle] = [];
        }
        let selected = window.currentProductSelection.selectedComplements[groupTitle];
        if (input.type === 'radio') {
            window.currentProductSelection.selectedComplements[groupTitle] = [{ nome: itemName, preco: itemPrice }];
        } else {
            if (input.checked) {
                if (selected.length < max) {
                    selected.push({ nome: itemName, preco: itemPrice });
                } else {
                    input.checked = false;
                    Swal.fire({ text: `Limite de ${max} atingido`, icon: 'warning', toast: true, position: 'top' });
                    return;
                }
            } else {
                window.currentProductSelection.selectedComplements[groupTitle] = selected.filter(i => i.nome !== itemName);
            }
        }
        this.calculateTotal();
    },

    updateQty(val) {
        const newQty = window.currentProductSelection.quantity + val;
        if (newQty < 1) return;
        window.currentProductSelection.quantity = newQty;
        document.getElementById('modalQty').innerText = newQty;
        this.calculateTotal();
    },

    calculateTotal() {
        let sumComplements = 0;
        Object.values(window.currentProductSelection.selectedComplements).forEach(group => {
            group.forEach(item => sumComplements += item.preco);
        });
        const unitPrice = window.currentProductSelection.basePrice + sumComplements;
        window.currentProductSelection.totalPrice = unitPrice * window.currentProductSelection.quantity;
        document.getElementById('modalTotalPrice').innerText = `R$ ${window.currentProductSelection.totalPrice.toFixed(2).replace('.', ',')}`;
        this.validateSelection();
    },

    validateSelection() {
        const p = window.currentProductSelection;
        let isValid = true;
        const listaComp = p.complements || [];
        listaComp.forEach(group => {
            const titulo = group.name || group.titulo;
            const count = (p.selectedComplements[titulo] || []).length;
            if (count < (group.min || 0)) isValid = false;
        });
        document.getElementById('btnAddRestaurante').disabled = !isValid;
    },

    addToCartWithComplements() {
        const p = window.currentProductSelection;
        const compHash = btoa(JSON.stringify(p.selectedComplements)).substring(0, 8);
        const uniqueCartId = `res_${p.id}_${compHash}`;

        const cartItem = {
            uid: uniqueCartId,       // Sincronizado com cart.js
            productId: p.id,
            name: p.name || p.nome,
            price: (p.totalPrice / p.quantity),
            q: p.quantity,           // Sincronizado com cart.js (usa q, não qty)
            img: (p.images && p.images.length > 0) ? p.images[0] : (p.imagem || ''), // Sincronizado com cart.js (usa img)
            complements: p.selectedComplements,
            v: null 
        };

        if (window.state && window.state.cart) {
            const existingIndex = window.state.cart.findIndex(item => item.uid === uniqueCartId);
            if (existingIndex > -1) {
                window.state.cart[existingIndex].q += p.quantity;
            } else {
                window.state.cart.push(cartItem);
            }
            if (window.saveCart) window.saveCart();
            if (window.updateCartUI) window.updateCartUI();
            window.closeModalDetails();
            this.renderFloatingCart(); // Atualiza a barra vermelha
        }
    },

    renderDeliveryHeader() {
        if (document.getElementById('deliveryHeader')) return;
        const app = document.getElementById('app');
        const header = document.createElement('div');
        header.id = 'deliveryHeader';
        header.className = "sticky top-0 z-[100] bg-white border-b border-gray-100 p-4 shadow-sm";
        header.innerHTML = `
            <div class="flex items-center gap-3 mb-4">
                <img src="${window.state.storeConfig.logo}" class="w-12 h-12 rounded-full border shadow-sm">
                <div>
                    <h1 class="font-bold text-gray-800 text-lg">${window.state.storeConfig.name}</h1>
                    <div class="flex items-center gap-1 text-[10px] font-bold text-green-600">
                        <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> Aberto agora
                    </div>
                </div>
            </div>
            <div class="relative">
                <input type="text" id="deliverySearch" oninput="window.handleSearchInput(this.value)" placeholder="Buscar no cardápio..." 
                       class="w-full bg-gray-100 border-none rounded-xl py-3 px-10 text-sm focus:ring-2 focus:ring-[#EA1D2C]">
                <i data-lucide="search" class="absolute left-3 top-3.5 w-4 h-4 text-gray-400"></i>
            </div>
        `;
        app.prepend(header);
        if(window.lucide) window.lucide.createIcons();
    },

    renderCard(p) {
        const preco = parseFloat(p.value || p.price || 0);
        const img = (p.images && p.images.length > 0) ? p.images[0] : 'https://placehold.co/200?text=Produto';
        return `
            <div onclick="window.openProductModal('${p.id}')" class="flex items-center p-4 border-b border-gray-50 bg-white active:bg-gray-50 transition-all cursor-pointer">
                <div class="flex-1 pr-3">
                    <h3 class="font-bold text-gray-800 text-[14px] leading-tight mb-1">${p.name || p.nome}</h3>
                    <p class="text-[11px] text-gray-500 line-clamp-2 mb-2 leading-tight">${p.description || ''}</p>
                    <span class="text-green-600 font-bold text-sm">R$ ${preco.toFixed(2).replace('.', ',')}</span>
                </div>
                <div class="w-20 h-20 flex-shrink-0">
                    <img src="${img}" class="w-full h-full object-cover rounded-lg shadow-sm" loading="lazy">
                </div>
            </div>
        `;
    },

renderFloatingCart() {
        let btn = document.getElementById('deliveryCartBar');
        if (!btn) {
            btn = document.createElement('div');
            btn.id = 'deliveryCartBar';
            btn.className = "fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 z-[1000] animate-slide-up shadow-lg";
            document.body.appendChild(btn);
        }

        const tipoNegocio = window.state?.storeConfig?.tipoNegocio || 'varejo';
        
        // 1. Quantidade total de itens (seja loja ou restaurante)
        const count = window.state.cart.reduce((acc, i) => acc + (i.q || 0), 0);

        // 2. Cálculo do Total com lógica de Adicionais para Restaurante
        const total = window.state.cart.reduce((acc, i) => {
            const precoBase = parseFloat(i.price || 0);
            
            // Se for restaurante, somamos os complementos ao preço unitário
            let precoAdicionais = 0;
            if (tipoNegocio === 'restaurante' && i.complements) {
                precoAdicionais = i.complements.reduce((sum, c) => sum + parseFloat(c.price || 0), 0);
            }
            
            return acc + ((precoBase + precoAdicionais) * (i.q || 0));
        }, 0);

        if (count > 0) {
            btn.innerHTML = `
                <button onclick="window.openCart()" class="w-full bg-[#EA1D2C] text-white flex items-center justify-between p-4 rounded-xl font-bold shadow-lg">
                    <div class="flex items-center gap-2">
                        <span class="bg-black/20 px-2 py-0.5 rounded text-xs">${count}</span>
                        <span>Ver sacola</span>
                    </div>
                    <span>R$ ${total.toFixed(2).replace('.', ',')}</span>
                </button>
            `;
            btn.style.display = 'block';
        } else {
            btn.style.display = 'none';
        }
    }
