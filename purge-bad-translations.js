// Script de purge des traductions OpenAI mal stockées (prompt visible)
// Placez ce fichier à la racine du projet et lancez-le avec : node purge-bad-translations.js


const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// Lecture automatique du .env à la racine
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) {
        const key = match[1];
        let value = match[2];
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        process.env[key] = value;
      }
    }
  }
}
loadEnv();

const MONGO_URI = process.env.MONGO_URI || `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME || "root"}:${process.env.MONGO_INITDB_ROOT_PASSWORD || ""}@localhost:27017/clinia`;
const COLLECTION = "uitranslationcaches"; // Nom réel en base (souvent au pluriel/minuscule)

async function run() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const query = { "payload.text": { $regex: "^Translate this text into en-CA:" } };
  const toDelete = await db.collection(COLLECTION).find(query).toArray();
  if (toDelete.length === 0) {
    console.log("Aucune entrée à supprimer.");
  } else {
    console.log("Entrées supprimées :");
    toDelete.forEach((doc, idx) => {
      console.log(`- [${idx + 1}] ${doc.payload?.text?.slice(0, 120)}`);
    });
    const result = await db.collection(COLLECTION).deleteMany(query);
    console.log(`\nSupprimé ${result.deletedCount} entrées contenant le prompt OpenAI.`);
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
