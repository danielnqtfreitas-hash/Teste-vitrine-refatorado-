// js/theme-restaurante.js

export const RestauranteTheme = {
    // 1. Configuração inicial da interface
    setup() {
        const tipoNegocio = window.state?.storeConfig?.tipoNegocio || 'varejo';
        if (tipoNegocio !== 'restaurante') return;

        // Esconde elementos específicos de moda/varejo
        const selectorsToHide = [
            '#magicSections', 
            '#categoryContainer', 
            'nav.fixed.bottom-0', // Menu inferior (Amei, Provador)
            '#promoBanner'
        ];
        selectorsToHide.forEach(s => {
            const el = document.querySelector(s);
            if (el) el.style.display = 'none';
        });

        // Ajusta o Container para lista vertical (estilo cardápio)
        const container = document.getElementById('catalogContainer');
        if (container) {
            container.className = "flex flex-col w-full bg-white min-h-screen pb-32";
            container.style.padding = "0";
        }

        this.renderDeliveryHeader();
        this.renderFloatingCart();
    },

    // 2. Modal Completo com Complementos
    renderModal(p) {
        const modal = document.getElementById('modalDetails');
        if (!modal) return;

        // Inicializa o estado da seleção atual
        window.currentProductSelection = {
            ...p,
            basePrice: parseFloat(p.price || p.preco || 0),
            totalPrice: parseFloat(p.price || p.preco || 0),
            quantity: 1,
            selectedComplements: {} // Estrutura: { "Título do Grupo": [itens escolhidos] }
        };

        const imagem = (p.images && p.images.length > 0) ? p.images[0] : (p.imagem || 'https://placehold.co/400?text=Sem+Foto');
        
        modal.innerHTML = `
            <div class="fixed inset-0 bg-white z-[1001] overflow-y-auto animate-slide-up">
                <div class="relative h-64 w-full bg-gray-100">
                    <img src="${imagem}" class="w-full h-full object-cover">
                    <button onclick="window.closeModalDetails()" class="absolute top-4 left-4 bg-white/90 p-2 rounded-full shadow-md">
                        <i data-lucide="chevron-left" class="w-6 h-6 text-gray-800"></i>
                    </button>
                </div>

                <div class="p-4 border-b border-gray-100">
                    <h2 class="text-2xl font-bold text-gray-800">${p.name || p.nome}</h2>
                    <p class="text-gray-500 text-sm mt-1 leading-relaxed">${p.description || p.descricao || ''}</p>
                    <div class="mt-2 text-green-600 font-bold text-lg">
                        A partir de R$ ${window.currentProductSelection.basePrice.toFixed(2).replace('.', ',')}
                    </div>
                </div>

                <div id="complementsContainer" class="pb-32">
                    ${this.renderComplementGroups(p.complementos || [])}
                </div>

                <div class="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex items-center gap-4 z-[1002] shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                    <div class="flex items-center border border-gray-200 rounded-xl bg-gray-50 p-1">
                        <button onclick="RestauranteTheme.updateQty(-1)" class="p-2 text-[#EA1D2C]">
                            <i data-lucide="minus" class="w-5 h-5"></i>
                        </button>
                        <span id="modalQty" class="w-8 text-center font-bold text-gray-800">1</span>
                        <button onclick="RestauranteTheme.updateQty(1)" class="p-2 text-[#EA1D2C]">
                            <i data-lucide="plus" class="w-5 h-5"></i>
                        </button>
                    </div>
                    
                    <button id="btnAddRestaurante" onclick="RestauranteTheme.addToCartWithComplements()" 
                        class="flex-1 bg-[#EA1D2C] text-white py-4 rounded-xl font-bold flex justify-between px-6 shadow-lg disabled:bg-gray-300 disabled:shadow-none transition-all">
                        <span>Adicionar</span>
                        <span id="modalTotalPrice">R$ ${window.currentProductSelection.totalPrice.toFixed(2).replace('.', ',')}</span>
                    </button>
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        if(window.lucide) window.lucide.createIcons();
        this.validateSelection();
    },

    // 3. Renderizador de Grupos (Lógica de min/max)
    renderComplementGroups(groups) {
        if (!groups || groups.length === 0) return '';
        
        return groups.map(group => `
            <div class="bg-gray-50 p-4 border-b border-gray-100 flex justify-between items-center">
                <div>
                    <h3 class="font-bold text-gray-800 text-sm">${group.titulo}</h3>
                    <p class="text-[10px] text-gray-500 uppercase tracking-wider">
                        ${group.min > 0 ? `<span class="text-orange-600 font-bold">Obrigatório</span> • ` : ''} 
                        Escolha de ${group.min} a ${group.max}
                    </p>
                </div>
                ${(window.currentProductSelection.selectedComplements[group.titulo] || []).length >= group.min ? 
                    '<span class="bg-gray-800 text-white text-[8px] px-2 py-0.5 rounded uppercase">Ok</span>' : ''}
            </div>
            <div>
                ${group.itens.map(item => `
                    <label class="flex items-center justify-between p-4 border-b border-gray-50 active:bg-gray-100 cursor-pointer transition-colors">
                        <div class="flex flex-col">
                            <span class="text-sm text-gray-700 font-medium">${item.nome}</span>
                            ${item.preco > 0 ? `<span class="text-xs text-green-600">+ R$ ${item.preco.toFixed(2).replace('.', ',')}</span>` : ''}
                        </div>
                        <input type="${group.max === 1 ? 'radio' : 'checkbox'}" 
                               name="group_${group.titulo}" 
                               class="w-5 h-5 accent-[#EA1D2C]"
                               onchange="RestauranteTheme.handleComplementClick('${group.titulo}', '${item.nome}', ${item.preco}, ${group.max}, this)">
                    </label>
                `).join('')}
            </div>
        `).join('');
    },

    // 4. Lógica de Clique e Seleção
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
                    Swal.fire({ text: `Máximo de ${max} itens permitido.`, icon: 'warning', toast: true, position: 'top' });
                    return;
                }
            } else {
                window.currentProductSelection.selectedComplements[groupTitle] = selected.filter(i => i.nome !== itemName);
            }
        }
        
        this.calculateTotal();
        // Re-renderiza apenas a parte dos grupos para atualizar selos de "Ok" ou "Obrigatório"
        const container = document.getElementById('complementsContainer');
        if(container) container.innerHTML = this.renderComplementGroups(window.currentProductSelection.complementos || []);
    },

    // 5. Cálculos Dinâmicos
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
        
        const priceEl = document.getElementById('modalTotalPrice');
        if (priceEl) priceEl.innerText = `R$ ${window.currentProductSelection.totalPrice.toFixed(2).replace('.', ',')}`;
        this.validateSelection();
    },

    validateSelection() {
        const p = window.currentProductSelection;
        let isValid = true;

        if (p.complementos) {
            p.complementos.forEach(group => {
                const count = (p.selectedComplements[group.titulo] || []).length;
                if (count < group.min) isValid = false;
            });
        }

        const btn = document.getElementById('btnAddRestaurante');
        if (btn) btn.disabled = !isValid;
    },

    // 6. Adicionar ao Carrinho
    addToCartWithComplements() {
        const p = window.currentProductSelection;
        
        // Gera um ID único baseado na combinação de complementos para não misturar itens iguais com opções diferentes
        const compHash = btoa(JSON.stringify(p.selectedComplements)).substring(0, 8);
        const uniqueCartId = `${p.id}_${compHash}`;

        const cartItem = {
            id: uniqueCartId,
            productId: p.id,
            name: p.name || p.nome,
            price: (p.totalPrice / p.quantity), // Preço unitário (base + escolhidos)
            qty: p.quantity,
            image: (p.images && p.images.length > 0) ? p.images[0] : (p.imagem || ''),
            complements: p.selectedComplements
        };

        // Integração com o estado global do app
        if (window.state && window.state.cart) {
            const existingIndex = window.state.cart.findIndex(item => item.id === uniqueCartId);
            
            if (existingIndex > -1) {
                window.state.cart[existingIndex].qty += p.quantity;
            } else {
                window.state.cart.push(cartItem);
            }

            if (window.saveCart) window.saveCart();
            if (window.updateCartUI) window.updateCartUI();
            
            window.closeModalDetails();
            this.renderFloatingCart();
            
            Swal.fire({
                title: 'Adicionado!',
                icon: 'success',
                timer: 1000,
                showConfirmButton: false,
                toast: true,
                position: 'bottom'
            });
        }
    },

    // 7. Componentes de UI Adicionais
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
        const precoUnitario = p.price || p.preco || 0;
        const img = (p.images && p.images.length > 0) ? p.images[0] : (p.imagem || 'https://placehold.co/200?text=Produto');
        
        return `
            <div onclick="window.openProductModal('${p.id}')" class="flex items-center p-4 border-b border-gray-50 bg-white active:bg-gray-50 cursor-pointer">
                <div class="flex-1 pr-3">
                    <h3 class="font-bold text-gray-800 text-sm leading-tight mb-1">${p.name || p.nome}</h3>
                    <p class="text-[11px] text-gray-500 line-clamp-2 mb-2 leading-tight">${p.description || p.descricao || ''}</p>
                    <div class="flex items-center gap-2">
                        <span class="text-green-600 font-bold text-sm">R$ ${precoUnitario.toFixed(2).replace('.', ',')}</span>
                    </div>
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
            btn.className = "fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 z-[1000] animate-slide-up shadow-[0_-4px_15px_rgba(0,0,0,0.1)]";
            document.body.appendChild(btn);
        }

        const count = window.state.cart.reduce((acc, i) => acc + i.qty, 0);
        const total = window.state.cart.reduce((acc, i) => acc + (i.price * i.qty), 0);

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
};
