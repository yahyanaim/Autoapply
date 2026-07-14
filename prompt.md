# AutoApply AI - Job Search OS 🚀

Un système multi-agent complet et autonome d'optimisation de CV, de recherche d'offres et de génération de candidatures sur-mesure pour le marché marocain, propulsé par l'API Gemini et Tailwind CSS.

---

## 🏗️ Architecture du Projet & Fonctionnalités Clés

Le projet est conçu comme une application web de pointe de type **Single-Screen Operating System (OS)**, offrant un contrôle absolu à travers une interface unifiée. Il intègre six espaces de travail principaux :

1. **Tableau de Bord Holistique & Supervision de l'Orchestrateur**
   - **Télémétrie en temps réel** : Suivi précis du nombre de candidatures initiées, complétées, taux de réussite moyen de l'optimisation ATS, et le coût global de l'infrastructure d'agents.
   - **Visualiseur Multi-Agent** : Représentation graphique animée des cycles d'échanges d'informations entre les agents (Scraper, Tailor, Evaluator).
   - **Indicateurs financiers** : Graphes SVG réactifs mesurant le coût d'exécution en jetons Gemini.

2. **Profil du Candidat & Alignement de CV**
   - **Yasmine Slimani** (`yasmine.slimani.emi@gmail.com` | `+212 661-987654`) : Profil de Développeur Full-Stack / Ingénieur Cloud.
   - **Générateur automatique de profil par l'IA** : L'API Gemini analyse en un clic un texte brut ou un CV existant pour restructurer proprement le profil (Nom, Titre, Contact, Compétences clés, Expériences et Éducation).

3. **Recherche d'Offres & Moteur de Découverte**
   - Recherche personnalisée basée sur des filtres de ville (Casablanca, Rabat, Tanger, etc.), de technologies (React, Node.js, Cloud, Python, DevOps) et d'expérience.
   - Intégration de l'**API de Découverte d'Offres** simulant la collecte en temps réel sur les plateformes marocaines (LinkedIn, Rekrute, Anapec).
   - Panneau de détails riche permettant de lancer le **processus d'optimisation multi-agent Gemini**.

4. **Optimisation ATS & Suivi des Candidatures**
   - **Agent "Tailor"** : Ajuste automatiquement le CV et rédige une lettre de motivation contextualisée pour maximiser l'impact vis-à-vis de l'offre d'emploi.
   - **Agent "Evaluator"** : Analyse la densité des mots-clés, donne une note ATS de 0 à 100%, met en valeur les compétences validées, et alerte sur les lacunes ou technologies manquantes.
   - Possibilité de visualiser et de copier le CV optimisé et la lettre de motivation.

5. **Portefeuille de Projets & Montée en Compétences (Upskilling)**
   - **Analyseur de Portefeuille** : Scan de dépôts GitHub pour en extraire des projets réels et suggérer des améliorations.
   - **Moteur de formation personnalisé** : Génération d'une feuille de route hebdomadaire d'auto-formation de 4 semaines avec estimation d'heures, plans de projets d'application et ressources pour n'importe quel poste cible.

6. **Observabilité Totale (Logs & Télémétrie)**
   - Audit complet de toutes les requêtes faites aux agents IA.
   - Journaux d'appels détaillés affichant les payloads d'entrée (input payload) et les réponses structurées obtenues de l'API Gemini (output payload), ainsi que le nombre exact de tokens consommés.

---

## 🎨 Design Visuel & Thèmes (Light / Dark Mode)

L'application bénéficie d'une interface utilisateur sophistiquée, fluide et entièrement réactive :
- **Double Thème Intégré** : Support complet d'un mode sombre (Ardoise Cosmique et accents Indigo/Violet) et d'un mode clair (Blanc Pur, Gris Doux et contrastes profonds et lisibles).
- **Persistance du Thème** : Le choix du thème de l'utilisateur est mémorisé automatiquement dans le `localStorage` pour les sessions futures.
- **Micro-Animations d'Interaction** : Retours visuels soignés sur tous les boutons, cartes interactives et transitions fluides.

---

## 🔧 Pile Technique du Projet

- **Frontend** : React 18, Vite, TypeScript.
- **Styling** : Tailwind CSS, Google Fonts (Inter, JetBrains Mono, Space Grotesk).
- **Icons** : `lucide-react`.
- **Modèles d'IA** : Intégration du SDK moderne `@google/genai` (modèle recommandé `gemini-2.5-flash`) exécuté de manière sécurisée côté serveur ou mocké de manière intelligente pour garantir une fluidité d'exécution sans blocages réseau.
