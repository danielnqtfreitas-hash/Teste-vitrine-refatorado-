// 1. CARREGA AS VARIÁVEIS (Sempre a primeira linha)
require('dotenv').config(); 

const express = require("express");
const path = require("path");
const admin = require("firebase-admin");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());

// 2. INICIALIZAÇÃO BLINDADA DO FIREBASE
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  })
});

const db = admin.firestore();

// 3. EXPRESS CONFIG
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// 4. ROTAS API
// Enviamos 'db' e 'admin' para as rotas processarem os dados e analytics
const vitrineRoutes = require("./routes/vitrine")(db, admin);
app.use("/api/produtos", vitrineRoutes);

// 5. ROTAS DE PÁGINA
app.get("/", (req, res) => {
  res.redirect("/cliente");
});

app.get("/cliente", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "cliente", "index.html"));
});

// 6. START
app.listen(PORT, () => {
  console.log(`
==================================================
🚀 VITRINE ONLINE - SERVIDOR PROTEGIDO (.ENV)

🛒 CLIENTE: http://localhost:${PORT}/cliente?id=dandan
📊 ANALYTICS: Registro por hora habilitado.
🛡️ SEGURANÇA: Credenciais carregadas via Ambiente.
==================================================
  `);
});