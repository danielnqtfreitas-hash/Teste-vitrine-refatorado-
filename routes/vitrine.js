const express = require('express');
const router = express.Router();

module.exports = (db, admin) => {

    // --- ROTA DA VITRINE DEFINITIVA (OTIMIZADA PARA VERCEL) ---
    router.get('/:lojaId', async (req, res) => {
        const lojaId = req.params.lojaId;

        try {
            // Buscamos a configuração da loja
            const configDoc = await db.collection('stores').doc(lojaId).collection('config').doc('store').get();
            
            if (!configDoc.exists) {
                return res.status(404).json({ erro: "Loja não encontrada" });
            }

            const configData = configDoc.data();

            // 📥 BUSCA DIRETA E PARALELA (Alta Performance)
            // Usamos Promise.all para buscar Banners e Produtos ao mesmo tempo, economizando tempo de resposta
            const [heroSnap, prodSnap] = await Promise.all([
                db.collection('stores').doc(lojaId).collection('hero_cards').get(),
                db.collection('stores').doc(lojaId).collection('products')
                  .where('status', '==', 'active')
                  .get()
            ]);

            const banners = heroSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const produtos = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const pacoteCompleto = {
                config: configData,
                banners: banners,
                produtos: produtos,
                lastSync: new Date().toISOString(),
                ambiente: "Vercel Cloud"
            };

            // CONFIGURAÇÃO DE CACHE NO NAVEGADOR (O pulo do gato para custo zero)
            // Isso diz à Vercel e ao Google Chrome para guardarem os dados por 1 minuto
            // Assim, se o cliente der F5, não gasta uma nova leitura no seu Firebase.
            res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
            
            return res.json(pacoteCompleto);

        } catch (error) {
            console.error("❌ Erro na rota da vitrine:", error);
            res.status(500).json({ erro: "Erro ao processar dados da loja" });
        }
    });

    // --- ROTA DE ANALYTICS (VISITAS) ---
    router.post('/:lojaId/visit', async (req, res) => {
        const lojaId = req.params.lojaId;
        const hojeId = new Date().toLocaleDateString('en-CA'); 
        const horaAtual = new Date().getHours();

        try {
            const batch = db.batch();
            const historyRef = db.collection('stores').doc(lojaId).collection('analytics_history').doc(hojeId);
            const globalRef = db.collection('stores').doc(lojaId).collection('analytics').doc('global');

            batch.set(historyRef, { 
                visits: admin.firestore.FieldValue.increment(1), 
                [horaAtual]: admin.firestore.FieldValue.increment(1), 
                date: admin.firestore.FieldValue.serverTimestamp() 
            }, { merge: true });

            batch.set(globalRef, { 
                totalVisits: admin.firestore.FieldValue.increment(1), 
                [`visits_${horaAtual}`]: admin.firestore.FieldValue.increment(1), 
                lastUpdate: admin.firestore.FieldValue.serverTimestamp() 
            }, { merge: true });

            await batch.commit();
            res.status(200).json({ ok: true });
        } catch (error) {
            console.error("❌ Erro analytics:", error);
            res.status(500).json({ erro: "Erro interno" });
        }
    });

    // --- ROTA DE MÉTRICAS (VIEWS E CARRINHO) ---
    router.post('/metricas', async (req, res) => {
        try {
            const { lojaId, produtoId, acao } = req.body;
            if (!lojaId || !produtoId) return res.status(400).json({ error: "Dados incompletos" });

            const batch = db.batch();

            if (acao === 'fav' || acao === 'cart') {
                const globalRef = db.collection('stores').doc(lojaId).collection('analytics').doc('global');
                const campoDinamico = `stats.${produtoId}.${acao === 'fav' ? 'favs' : 'adds'}`;
                
                batch.set(globalRef, {
                    [campoDinamico]: admin.firestore.FieldValue.increment(1),
                    "totalInteracoes": admin.firestore.FieldValue.increment(1),
                    "ultimaInteracao": admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            if (acao === 'view') {
                const viewsRef = db.collection('stores').doc(lojaId).collection('analytics').doc('product_views');
                batch.set(viewsRef, {
                    stats: {
                        [produtoId]: {
                            views: admin.firestore.FieldValue.increment(1),
                            lastUpdate: admin.firestore.FieldValue.serverTimestamp()
                        }
                    }
                }, { merge: true });
            }

            await batch.commit();
            res.status(200).json({ success: true });
        } catch (error) {
            console.error("❌ Erro Métricas:", error); 
            res.status(500).json({ error: "Erro interno" });
        }
    });

    return router; 
};
