// Configuração do Tema iFood
const RestauranteTheme = {
    // Renderiza o produto em formato de linha (Lista)
    renderCard: (product) => {
        return `
            <div onclick="openProductModal('${product.id}')" 
                 class="flex items-center p-4 bg-white border-b border-gray-100 hover:bg-gray-50 transition-all cursor-pointer">
                
                <div class="flex-1 pr-3">
                    <h3 class="font-bold text-gray-800 text-base leading-tight">${product.name}</h3>
                    <p class="text-sm text-gray-500 mt-1 line-clamp-2">${product.description || ''}</p>
                    <div class="mt-2 flex items-center gap-2">
                        <span class="text-green-600 font-bold">R$ ${product.value.toFixed(2)}</span>
                        ${product.promoValue ? `<span class="text-xs text-gray-400 line-through">R$ ${product.promoValue.toFixed(2)}</span>` : ''}
                    </div>
                </div>

                ${product.images?.[0] ? `
                    <div class="relative w-24 h-24 flex-shrink-0">
                        <img src="${product.images[0]}" class="w-full h-full object-cover rounded-xl shadow-sm">
                    </div>
                ` : ''}
            </div>
        `;
    },

    // Renderiza os grupos de complementos no Modal
    renderComplements: (complements) => {
        if (!complements || complements.length === 0) return '';

        return complements.map(group => `
            <div class="mb-6 bg-white shadow-sm rounded-lg overflow-hidden border border-gray-100">
                <div class="bg-gray-50 p-3 border-b border-gray-100">
                    <h4 class="font-bold text-gray-800">${group.name}</h4>
                    <p class="text-xs text-gray-500 uppercase tracking-wider">
                        ${group.min > 0 ? `<span class="text-orange-500 font-bold">Obrigatório</span> • Mín: ${group.min}` : 'Opcional'} 
                        ${group.max ? ` • Máx: ${group.max}` : ''}
                    </p>
                </div>
                <div class="divide-y divide-gray-50">
                    ${group.items.map(item => `
                        <label class="flex justify-between items-center p-4 active:bg-gray-100 transition-colors cursor-pointer">
                            <div class="flex items-center gap-3">
                                <input type="${group.max === 1 ? 'radio' : 'checkbox'}" 
                                       name="group_${group.name.replace(/\s/g, '')}" 
                                       class="w-5 h-5 accent-purple-600 rounded-full"
                                       data-name="${item.name}"
                                       data-price="${item.price}"
                                       onchange="RestauranteTheme.handleSelection(this, ${group.max})">
                                <span class="text-gray-700 font-medium">${item.name}</span>
                            </div>
                            <span class="text-sm font-semibold ${item.price > 0 ? 'text-green-600' : 'text-gray-400'}">
                                ${item.price > 0 ? `+ R$ ${item.price.toFixed(2)}` : 'Grátis'}
                            </span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `).join('');
    },

    // Lógica para não deixar marcar mais que o máximo
    handleSelection: (el, max) => {
        const name = el.getAttribute('name');
        const checked = document.querySelectorAll(`input[name="${name}"]:checked`);
        if (max && checked.length > max) {
            el.checked = false;
            showToast(`Ops! O limite é de ${max} opções.`);
        }
        // Atualiza o preço total no modal
        updateModalTotal();
    }
};
