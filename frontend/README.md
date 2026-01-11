# ClinIA Frontend Prototype

Prototype React + Vite + Tailwind (v3.4.7) pour démontrer une interface possible
de l'application ClinIA destinée aux médecins. **Toutes les données sont simulées**
et ne doivent pas être utilisées en contexte clinique réel.

## Installation (dev local)

```bash
npm install
npm run dev
```

## Build + Docker

```bash
docker build -t clinia-frontend .
docker run -it --rm -p 8080:80 clinia-frontend
```

Ensuite, ouvrez http://localhost:8080 dans votre navigateur.

## Notes

- Tailwind CSS est verrouillé en version 3.4.7 pour compatibilité.
- Les graphiques utilisent Recharts.
- Le routage est géré par react-router-dom.
```
