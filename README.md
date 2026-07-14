# AutoApply AI - Job Search OS 🚀

<div align="center">
  <img width="1200" height="400" alt="AutoApply AI Banner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" style="border-radius: 12px; margin-bottom: 20px;" />
</div>

**AutoApply AI** est un système multi-agent complet et autonome d'optimisation de CV, de recherche d'offres et de génération de candidatures sur-mesure pour le marché marocain. Conçu sous la forme d'un **Single-Screen Operating System (OS)** unifié et élégant, le projet tire parti de la puissance de l'API Gemini et d'une interface réactive moderne stylisée avec Tailwind CSS.

---

## 🏗️ Architecture & Fonctionnalités Clés

L'application offre un contrôle absolu à travers six espaces de travail spécialisés :

### 1. Tableau de Bord Holistique & Supervision de l'Orchestrateur
* **Télémétrie en Temps Réel** : Suivi des statistiques d'exécution, telles que le nombre total de candidatures initiées, les brouillons prêts, le taux d'optimisation ATS moyen, ainsi que l'estimation financière du coût en jetons d'IA.
* **Visualiseur Multi-Agent** : Représentation visuelle et animée du cycle d'échanges d'informations en cours entre les agents clés (*Crawler*, *Tailor*, *Evaluator*).
* **Graphe SVG de Coûts** : Analyse en direct de la consommation de jetons (Tokens) et du coût cumulé en dollars USD.

### 2. Profil du Candidat & Analyse de CV par IA (CvParserAgent)
* **Parser Intelligent** : Téléchargement de fichiers (PDF, TXT) ou copier-coller de texte brut. L'API Gemini extrait et structure automatiquement les informations clés (coordonnées, compétences, expériences professionnelles, éducation et liens).
* **Auto-Découverte** : Dès que le profil est mis à jour, l'orchestrateur lance en arrière-plan une recherche ciblée pour générer et recommander immédiatement **3 opportunités d'emploi marocaines hautement pertinentes**.
* **Persistance Locale** : Modification manuelle des données du profil avec sauvegarde instantanée.

### 3. Recherche d'Offres & Moteur de Découverte (JobCrawlerAgent)
* **Recherche Personnalisée** : Filtres avancés par ville marocaine (Casablanca, Rabat, Tanger, Marrakech, Salé, etc.) et par compétences ou mots-clés technologiques (React, Node.js, DevOps, Python, AWS).
* **Scraping Réaliste Simulé** : Collecte intelligente d'offres sur les portails les plus populaires au Maroc (LinkedIn Maroc, Rekrute, Anapec, Indeed Maroc, MarocAnnonces).
* **ATS Scoring Unifié** : Calcul instantané des scores d'adéquation (Fit Score, Skills, Experience, Industry, Seniority) avec une analyse textuelle explicative en français.

### 4. Optimisation ATS & Suivi des Candidatures (ApplyAgent Loop)
* **Agent "Tailor" (Générateur)** : Rédige une version optimisée du CV en Markdown et une lettre de motivation ciblée (par exemple, adaptée à des entreprises comme Capgemini, OCP, Wafasalaf, Intelcia ou CGI) en mettant en valeur les réalisations liées à l'offre.
* **Agent "Evaluator" (Critique)** : Audit le CV généré selon les exigences du poste pour calculer un score ATS, identifier les mots-clés correspondants et manquants, évaluer la lisibilité et la tonalité professionnelle.
* **Boucle d'Optimisation Autonome (LangGraph-style)** : Si la note ATS est inférieure à **85/100**, le système réengage automatiquement l'agent d'optimisation pour injecter les mots-clés manquants et restructurer les sections critiques jusqu'à obtention d'un score conforme.

### 5. Portefeuille de Projets & Montée en Compétences (UpskillAgent)
* **Scan de Portfolio (GitMining)** : Analyse du dépôt GitHub et des liens de portfolio saisis pour repérer les compétences techniques démontrées et suggérer des projets d'expansion pour le CV.
* **Roadmap d'Auto-Formation** : Génération d'une feuille de route hebdomadaire d'apprentissage de 4 semaines avec estimation des heures requises, idées de projets pratiques et liens vers des cours ciblés (Coursera, Udemy, OpenClassrooms, YouTube).

### 6. Console d'Observabilité & Télémétrie
* **Logs Détaillés** : Audit exhaustif de chaque appel réseau effectué vers les agents Gemini.
* **Inspection des Payloads** : Visualisation des invites système (System Instructions), des payloads d'entrée (input payloads) et des réponses structurées (output JSON), ainsi que le statut, le temps d'exécution et les tokens consommés.

---

## 🎨 Design Visuel & Thèmes

* **Double Thème Persistant** : Support complet d'un mode sombre immersif (Ardoise Cosmique et accents Indigo/Violet) et d'un mode clair épuré (Blanc Pur, Gris Doux et contrastes profonds). Le choix est persisté automatiquement dans le `localStorage`.
* **Export de Données** : Module d'exportation permettant de télécharger la table exhaustive de vos candidatures et de leur statut de suivi au format standard `.csv` (parfaitement compatible avec Microsoft Excel ou Google Sheets).

---

## 🔧 Pile Technique

* **Frontend** : React 19, Vite, TypeScript.
* **Stylisation** : Tailwind CSS v4, Google Fonts (Inter, JetBrains Mono, Space Grotesk).
* **Iconographie** : `lucide-react`.
* **Modèles d'IA** : SDK officiel `@google/genai` avec intégration de **gemini-2.5-flash** côté serveur.
* **Backend Proxy** : Serveur Express avec `tsx` pour l'exécution dynamique de TypeScript sous Node.js.

---

## 🛡️ Résilience Technique & Robustesse du Code

Le serveur est conçu avec des mécanismes avancés pour garantir une exécution robuste des modèles LLM :
1. **Gestion des Limites de Quota (429/503)** : Un système de relance automatique avec délai d'attente exponentiel (`generateContentWithRetry`) protège les requêtes contre les interruptions réseau temporaires.
2. **Parseur JSON Tolérant aux Pannes** : Le nettoyeur `safeParseJSON` est capable de corriger les virgules de fin orphelines, de réparer les structures de chaînes mal échappées et d'éliminer les blocs markdown (` ```json `) générés accidentellement par l'IA.

---

## 🚀 Installation & Démarrage Local

### Prérequis
* **Node.js** (v18 ou supérieur recommandé)
* Un gestionnaire de paquets (`npm`, `yarn` ou `pnpm`)

### Étape 1 : Cloner et installer les dépendances
```bash
# Installer les modules Node.js
npm install
```

### Étape 2 : Configurer les Variables d'Environnement
Créez un fichier `.env` ou `.env.local` à la racine du projet et définissez votre clé API Gemini :
```env
PORT=3000
GEMINI_API_KEY=AIzaSy... # Votre clé API Google AI Studio (Optionnel si saisie via l'interface)
```

> [!TIP]
> **Pas de clé d'environnement ?** Vous pouvez également configurer votre clé d'API Gemini gratuite directement dans la colonne latérale de l'application. Elle sera mémorisée de manière sécurisée dans le stockage de session local (`localStorage`) de votre propre navigateur et passée en toute sécurité au serveur.

### Étape 3 : Démarrer l'Application
Lancez le serveur Express (qui gère également les middlewares de build et le rechargement à chaud Vite) :
```bash
npm run dev
```

Ouvrez ensuite votre navigateur à l'adresse : **[http://localhost:3000](http://localhost:3000)**.

---

## 🔑 Mode d'Emploi : Récupérer sa Clé Gemini Gratuite

1. Allez sur **[Google AI Studio](https://aistudio.google.com)**.
2. Connectez-vous avec votre compte Google standard.
3. Cliquez sur **"Get API key"** (Obtenir une clé API).
4. Cliquez sur **"Create API key"** (Créer une clé API).
5. Copiez la clé générée (commençant par `AIzaSy...`) et collez-la dans le module de configuration de l'application !
