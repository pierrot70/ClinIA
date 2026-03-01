Design — mode d'emploi rapide

But
- Fournir un point d'entrée simple pour que le designer puisse livrer ses fichiers et faciliter l'intégration par l'équipe dev.

Structure recommandée
- `design/assets/` : SVG, PNG, WebP exportés depuis Figma
- `design/spec.md` : tokens de couleurs, polices, tailles

Comment travailler
1. Créer un fichier Figma et partager le lien (préférer 'Can edit' si elle doit pousser des exports).
2. Exporter les assets SVG/PNG et les déposer dans `design/assets/`.
3. Écrire `design/spec.md` avec :
   - noms des couleurs (+ hex)
   - nom de police + weights + lien Google Fonts
   - recommandations responsive

Intégration côté développeur
- Copier `design/assets/` vers `frontend/src/assets/design/`.
- Mettre à jour `src/index.css` et `tailwind.config.js` pour exposer les tokens.

Lancer le frontend localement (dev):
```bash
cd frontend
npm install
npm run dev
```

Notes pratiques
- Favoriser SVGs pour icônes et logo.
- Nommer les fichiers de façon lisible : `logo-full.svg`, `logo-icon.svg`, `illustration-hero.webp`.
- Fournir aussi un petit `spec.md` indiquant où chaque asset doit être utilisé.
