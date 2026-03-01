Titre: Brief design pour Clinia

Objectif
- Donner une identité visuelle plus artistique et chaleureuse au produit tout en conservant l'efficacité et la lisibilité pour un contexte médical.

Livrables attendus
- Palette couleurs (5 teintes) : primary, secondary, accent, background, text
- Guide typographique (H1, H2, H3, body, small) + lien Google Fonts
- Logo SVG (variantes : full + icône)
- Pack d'icônes SVG (ou lien vers une librairie choisie)
- Composants designés : boutons, inputs, cartes, header/footer (états idle/focus/error)
- Illustrations/illustrative imagery (web-optimised webp/svg)
- Exports : PNG/SVG pour intégration et un fichier `spec.md` indiquant noms de tokens (hex, variables CSS)

Contraintes
- Respecter l'accessibilité (contraste minimum AA)
- Tailles d'assets optimisées (images < 200KB quand possible)
- Fournir noms hex et valeurs CSS variables pour chaque couleur

Organisation des fichiers à livrer
- `design/assets/` : SVG/PNG/WebP optimisés
- `design/spec.md` : tokens (couleurs, polices, tailles)
- Lien Figma : ajouter ici (ou indication d'accès)

Workflow recommandé
1. Partagez le fichier Figma (ou exportez les assets dans `design/assets/`).
2. Indiquez les tokens (ex : `--color-primary: #4F46E5;`).
3. Créez une PR sur la branche `design` contenant les assets et le `spec.md`.

Notes pour l'intégration
- Placer les assets finaux dans `frontend/src/assets/design/`.
- Mettre à jour `tailwind.config.js` pour refléter la palette (je peux aider sur ce point).
