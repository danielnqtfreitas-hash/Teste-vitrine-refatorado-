const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

module.exports = (db, admin) => {
    // --- ROTA DA VITRINE COM CACHE INTELIGENTE ---
    router.get('/:lojaId', async (req, res) => {
        const lojaId = req.params.lojaId;
        const pastaData = path.join(__dirname, '../data'); 
        const caminhoArquivo = path.join(pastaData, `${lojaId}.json`);
        const forceRefresh = req.query.refresh === 'true';

        try {
            const configDoc = await db.collection('stores').doc(lojaId).collection('config').doc('store').get();
            if (!configDoc.exists) return res.status(404).json({ erro: "Loja não encontrada" });

            const configData = configDoc.data();
            
            let serverLastUpdate = 0;
            if (configData.lastUpdate) {
                if (typeof configData.lastUpdate.toDate === 'function') {
                    serverLastUpdate = configData.lastUpdate.toDate().getTime();
                } else if (configData.lastUpdate.seconds) {
                    serverLastUpdate = configData.lastUpdate.seconds * 1000;
                } else {
                    serverLastUpdate = new Date(configData.lastUpdate).getTime() || 0;
                }
            }

            let deveAtualizar = !fs.existsSync(caminhoArquivo) || forceRefresh;

            if (!deveAtualizar && fs.existsSync(caminhoArquivo)) {
                try {
                    const cacheLocal = JSON.parse(fs.readFileSync(caminhoArquivo, 'utf8'));
                    const localLastUpdate = cacheLocal.config && cacheLocal.config.lastUpdate 
                        ? new Date(cacheLocal.config.lastUpdate).getTime() 
                        : 0;

                    if (serverLastUpdate > localLastUpdate) {
                        console.log(`✨ Mudança detectada para a loja ${lojaId}. Atualizando cache...`);
                        deveAtualizar = true;
                    }
                } catch (e) {
                    deveAtualizar = true;
                }
            }

            if (deveAtualizar) {
                console.log(`📥 Sincronizando dados completos: stores/${lojaId}`);

                const [heroSnap, prodSnap] = await Promise.all([
                    db.collection('stores').doc(lojaId).collection('hero_cards').get(),
                    db.collection('stores').doc(lojaId).collection('products').where('status', '==', 'active').get()
                ]);

                const banners = heroSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                const produtos = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                const pacoteCompleto = {
                    config: configData,
                    banners: banners,
                    produtos: produtos,
                    lastSync: new Date().toISOString()
                };

                if (!fs.existsSync(pastaData)) fs.mkdirSync(pastaData);
                fs.writeFileSync(caminhoArquivo, JSON.stringify(pacoteCompleto, null, 2));
                
                return res.json(pacoteCompleto);
            }

            const dataLocal = fs.readFileSync(caminhoArquivo, 'utf8');
            res.json(JSON.parse(dataLocal));

        } catch (error) {
            console.error("❌ Erro na rota da vitrine:", error);
            res.status(500).json({ erro: "Erro ao processar dados da loja" });
        }
    });

    // --- ROTA DE ANALYTICS (HÍBRIDA PARA COMPATIBILIDADE) ---
    router.post('/:lojaId/visit', async (req, res) => {
        const lojaId = req.params.lojaId;
        const hojeId = new Date().toLocaleDateString('en-CA'); // Formato: 2026-02-08
        const horaAtual = new Date().getHours(); // Pega a hora atual: 0-23

        try {
            const batch = db.batch();

            // 1. ATUALIZAÇÃO PARA LOJAS ANTIGAS (analytics_history)
            // Grava a hora usando apenas o número (ex: "14": +1)
            const historyRef = db.collection('stores').doc(lojaId).collection('analytics_history').doc(hojeId);
            batch.set(historyRef, { 
                visits: admin.firestore.FieldValue.increment(1), 
                [horaAtual]: admin.firestore.FieldValue.increment(1), // Padrão antigo
                date: admin.firestore.FieldValue.serverTimestamp() 
            }, { merge: true });

            // 2. ATUALIZAÇÃO PARA O PADRÃO NOVO (analytics/global)
            // Grava o total geral e a hora com prefixo visits_H (ex: "visits_14": +1)
            const globalRef = db.collection('stores').doc(lojaId).collection('analytics').doc('global');
            batch.set(globalRef, { 
                totalVisits: admin.firestore.FieldValue.increment(1), 
                [`visits_${horaAtual}`]: admin.firestore.FieldValue.increment(1), // Padrão novo
                lastUpdate: admin.firestore.FieldValue.serverTimestamp() 
            }, { merge: true });

            await batch.commit();
            res.status(200).json({ ok: true });
        } catch (error) {
            console.error("❌ Erro ao registrar visita no backend:", error);
            res.status(500).json({ erro: "Erro interno" });
        }
    });

    return router;
};