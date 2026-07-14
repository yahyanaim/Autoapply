import React, { useState, useEffect, useRef } from "react";
import {
  User,
  Briefcase,
  FileCheck,
  Compass,
  LineChart,
  Terminal,
  Moon,
  Sun,
  Shield,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  ArrowRight,
  Database,
  RefreshCw,
  Cpu,
  Github,
  Award,
  BookOpen,
  Calendar,
  DollarSign,
  FileText,
  MapPin,
  Clock,
  Layers,
  ChevronRight,
  Send,
  ExternalLink,
  Upload,
  Download,
  Key
} from "lucide-react";
import { Candidate, JobListing, JobMatch, Application, AgentRun } from "./types";
import { PDFPreview } from "./components/PDFPreview";

export default function App() {
  // Theme dark mode check
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem("theme") !== "light"; // Default to eye-friendly responsive dark style, but support light mode
  });

  // Navigation tab
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // State values from API or mock initializers as fallback safely
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [costStats, setCostStats] = useState<any>({
    totalTokensUsed: 125000,
    totalCostUsd: 0.045,
    agentDistribution: []
  });

  // View modes for PDF Previews
  const [profileViewMode, setProfileViewMode] = useState<"json" | "pdf">("json");
  const [appViewMode, setAppViewMode] = useState<"text" | "pdf">("text");

  // Profile validation & correction states
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showValidationModal, setShowValidationModal] = useState<boolean>(false);
  const [validationTargetJobId, setValidationTargetJobId] = useState<string | null>(null);

  // Correction form states
  const [tempCandidateName, setTempCandidateName] = useState<string>("");
  const [tempCandidateEmail, setTempCandidateEmail] = useState<string>("");
  const [tempCandidatePhone, setTempCandidatePhone] = useState<string>("");
  const [tempCandidateLocation, setTempCandidateLocation] = useState<string>("");

  // UI Interactive States
  const [loading, setLoading] = useState<boolean>(true);
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<string | null>(null); // jobId representing active tailoring run
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);

  // Forms states
  const [cvText, setCvText] = useState<string>(`YASMINE SLIMANI
yasmine.slimani.emi@gmail.com | Casablanca, Maroc | https://linkedin.com/in/yasmine-slimani
  
RÉSUMÉ :
Ingénieure Full-Stack Senior avec 6 ans d'expérience dans la création d'applications web d'excellence avec React, Node.js et Next.js.

COMPÉTENCES :
React, TypeScript, Tailwind CSS, Next.js, Node.js, PostgreSQL, Docker, Gestion d'Équipe

EXPÉRIENCE :
InnovTech Maroc (2022 - Présent)
- Direction technique d'une équipe de 5 développeurs sur des solutions SaaS financières.
- Conception et déploiement d'un système de facturation conforme à la DGI Maroc.`);
  
  const [candidateName, setCandidateName] = useState<string>("Yasmine Slimani");
  const [scrapeQuery, setScrapeQuery] = useState<string>("Full-Stack Developer");
  const [scrapeLoc, setScrapeLoc] = useState<string>("Worldwide / Remote");
  const [gitUrl, setGitUrl] = useState<string>("");
  const [portfolioUrl, setPortfolioUrl] = useState<string>("");
  const [customRoleGoal, setCustomRoleGoal] = useState<string>("Architecte Cloud / Lead Developer");

  // Mining output suggestions / Learning roadmap
  const [miningResult, setMiningResult] = useState<any>(null);
  const [isMining, setIsMining] = useState<boolean>(false);
  const [roadmapResult, setRoadmapResult] = useState<any>(null);
  const [isUpskilling, setIsUpskilling] = useState<boolean>(false);

  // Secrets Guard warning
  const [showStatusBanner, setShowStatusBanner] = useState<boolean>(true);

  // File upload state variables
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileMimeType, setFileMimeType] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // User Gemini API Keys from browser local storage (supports multiple keys for rotation)
  const [apiKeys, setApiKeys] = useState<string[]>(() => {
    const stored = localStorage.getItem("user_api_keys");
    const single = localStorage.getItem("user_gemini_api_key");
    if (stored) return JSON.parse(stored);
    if (single) return [single];
    return [];
  });
  const [newApiKey, setNewApiKey] = useState<string>("");
  const [activeKeyIndex, setActiveKeyIndex] = useState<number>(() => {
    return parseInt(localStorage.getItem("active_key_index") || "0", 10);
  });

  const userGeminiKey = apiKeys[activeKeyIndex] || "";

  const getRequestHeaders = () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (userGeminiKey) {
      headers["x-gemini-key"] = userGeminiKey;
    }
    if (apiProvider === "openai-compatible") {
      headers["x-api-provider"] = "openai-compatible";
      headers["x-api-base-url"] = apiBaseUrl;
      headers["x-api-model"] = apiModel;
    }
    return headers;
  };

  const handleAddApiKey = () => {
    const trimmed = newApiKey.trim();
    if (!trimmed) return;
    if (apiKeys.includes(trimmed)) {
      alert("Cette clé est déjà ajoutée.");
      return;
    }
    // Validate based on provider
    if (apiProvider === "gemini") {
      if (!trimmed.startsWith("AIzaSy")) {
        alert("Clé invalide pour Google Gemini. Les clés Gemini commencent par 'AIzaSy...'.\n\nObtenez-en une gratuite sur https://aistudio.google.com/apikey");
        return;
      }
      if (trimmed.length < 30 || trimmed.length > 50) {
        alert("Clé de longueur inhabituelle. Vérifiez qu'elle est complète.\n\nLes clés valides font environ 39 caractères.");
        return;
      }
    } else {
      // OpenAI-compatible: accept any non-empty key with reasonable length
      if (trimmed.length < 10) {
        alert("Clé trop courte. Vérifiez qu'elle est complète.");
        return;
      }
    }
    const updated = [...apiKeys, trimmed];
    setApiKeys(updated);
    setNewApiKey("");
    localStorage.setItem("user_api_keys", JSON.stringify(updated));
    if (updated.length === 1) {
      setActiveKeyIndex(0);
      localStorage.setItem("active_key_index", "0");
    }
  };

  const handleRemoveApiKey = (index: number) => {
    const updated = apiKeys.filter((_, i) => i !== index);
    setApiKeys(updated);
    localStorage.setItem("user_api_keys", JSON.stringify(updated));
    if (activeKeyIndex >= updated.length) {
      const newIndex = Math.max(0, updated.length - 1);
      setActiveKeyIndex(newIndex);
      localStorage.setItem("active_key_index", String(newIndex));
    }
  };

  const handleSwitchKey = (index: number) => {
    setActiveKeyIndex(index);
    localStorage.setItem("active_key_index", String(index));
  };

  // API Provider selection (Gemini or OpenAI-compatible like Dahl)
  const [apiProvider, setApiProvider] = useState<string>(() => {
    return localStorage.getItem("api_provider") || "gemini";
  });
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(() => {
    return localStorage.getItem("api_base_url") || "https://inference.dahl.global/v1";
  });
  const [apiModel, setApiModel] = useState<string>(() => {
    return localStorage.getItem("api_model") || "MiniMaxAI/MiniMax-M2.7";
  });

  const handleSaveProvider = (provider: string, baseUrl?: string, model?: string) => {
    setApiProvider(provider);
    localStorage.setItem("api_provider", provider);
    if (baseUrl) {
      setApiBaseUrl(baseUrl);
      localStorage.setItem("api_base_url", baseUrl);
    }
    if (model) {
      setApiModel(model);
      localStorage.setItem("api_model", model);
    }
  };

  // Convert Sent Candidates listing to CSV format dynamically and trigger web download
  const handleDownloadCSV = () => {
    const submittedApps = applications.filter(a => a.status === "submitted");
    if (submittedApps.length === 0) {
      alert("Aucune candidature envoyée à exporter.");
      return;
    }

    const headers = ["Entreprise", "Poste de Recrutement", "Plateforme Source", "Score de Densité ATS (%)", "Date de Soumission", "Statut"];
    const rows = submittedApps.map(app => {
      const job = jobs.find(j => j.id === app.jobId);
      const companyRef = job?.company || "Wafasalaf";
      const titleRef = job?.title || "Ingénieur Logiciel";
      const sourceRef = job?.sourceBoard || "LinkedIn";
      const atsScoreRef = `${app.atsScore || 0}%`;
      const dateRef = app.submittedAt ? new Date(app.submittedAt).toLocaleDateString('fr-FR') : "Récemment";
      const statusRef = "Envoyée avec succès";

      return [companyRef, titleRef, sourceRef, atsScoreRef, dateRef, statusRef]
        .map(field => `"${field.replace(/"/g, '""')}"`)
        .join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "Candidatures_Soumises_AutoApply_AI.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Apply dark class on mount
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [darkMode]);

  // Load backend configurations and DB entries initially
  const fetchData = async () => {
    setLoading(true);
    try {
      // Profile
      const profileRes = await fetch("/api/v1/profile");
      if (profileRes.ok) {
        const pData = await profileRes.json();
        setCandidate(pData.candidate);
        if (pData.candidate.name) setCandidateName(pData.candidate.name);
        if (pData.candidate.githubUrl) setGitUrl(pData.candidate.githubUrl);
        if (pData.candidate.portfolioUrl) setPortfolioUrl(pData.candidate.portfolioUrl);
      }

      // Jobs and matches
      const jobsRes = await fetch("/api/v1/jobs");
      if (jobsRes.ok) {
        const jData = await jobsRes.json();
        setJobs(jData.jobs || []);
        setMatches(jData.matches || []);
        if (jData.jobs && jData.jobs.length > 0) {
          setSelectedJob(jData.jobs[0]);
        }
      }

      // Applications
      const appRes = await fetch("/api/v1/applications");
      if (appRes.ok) {
        const aData = await appRes.json();
        setApplications(aData.applications || []);
        if (aData.applications && aData.applications.length > 0) {
          setSelectedApp(aData.applications[0]);
        }
      }

      // Runs & costs
      await refreshTelemetry();

    } catch (e) {
      console.error("Telemetry connect failed. Operating in offline interactive state.", e);
    } finally {
      setLoading(false);
    }
  };

  const refreshTelemetry = async () => {
    try {
      const runsRes = await fetch("/api/v1/runs");
      if (runsRes.ok) {
        const rData = await runsRes.json();
        setAgentRuns(rData.runs || []);
      }
      const costRes = await fetch("/api/v1/costs");
      if (costRes.ok) {
        const cData = await costRes.json();
        setCostStats(cData);
      }
    } catch (err) {
      console.error("Error fetching run logs", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Convert and process uploaded file for parsing
  const processUploadedFile = (file: File) => {
    setUploadedFile(file);
    setFileMimeType(file.type);
    
    // For text-based formats, read client-side of the browser to populate the raw review textbox
    if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md") || file.name.endsWith(".json")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setCvText(e.target.result as string);
        }
      };
      reader.readAsText(file);
    }
    
    // Convert any file type (e.g. PDF/DOCX Word / TXT) to base64 for full AI server integration
    const reader = new FileReader();
    reader.onload = () => {
      const base64Str = reader.result?.toString().split(",")[1] || null;
      setFileBase64(base64Str);
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedFile(e.target.files[0]);
    }
  };

  // Set up Candidate profile from raw text or uploaded file
  const handleProfileSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/v1/profile/setup", {
        method: "POST",
        headers: getRequestHeaders(),
        body: JSON.stringify({ 
          resumeText: cvText, 
          candidateName,
          fileBase64,
          fileMimeType
        })
      });
      if (!response.ok) {
        const errMsg = await response.json();
        const msg = errMsg.error || "Failed to structure resume with Gemini API";
        if ((msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) && apiKeys.length > 1) {
          const nextIndex = (activeKeyIndex + 1) % apiKeys.length;
          setActiveKeyIndex(nextIndex);
          localStorage.setItem("active_key_index", String(nextIndex));
          setLoading(false);
          alert(`Clé #${activeKeyIndex + 1} atteint sa limite. Passage à la clé #${nextIndex + 1}. Cliquez à nouveau sur Extraction.`);
          return;
        }
        throw new Error(msg);
      }
      const data = await response.json();
      setCandidate(data.candidate);
      if (data.candidate && data.candidate.name) {
        setCandidateName(data.candidate.name);
      }
      setMatches(data.matches);
      
      // Update Jobs panel with the new AI-Discovered matched positions 
      if (data.jobs && Array.isArray(data.jobs)) {
        setJobs(data.jobs);
        if (data.jobs.length > 0) {
          setSelectedJob(data.jobs[0]);
        }
      }
      // Reset applications of previous dummy candidates
      setApplications([]);
      setSelectedApp(null);

      alert(`Success: Your resume has been parsed and matched! Discovered 3 highly aligned jobs based on your actual experience.`);
      await refreshTelemetry();
    } catch (err: any) {
      alert(err.message || "Execution error on AI parse.");
    } finally {
      setLoading(false);
    }
  };

  // Job Search command
  const handleJobScraping = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsScraping(true);
    try {
      const response = await fetch("/api/v1/jobs/scrape", {
        method: "POST",
        headers: getRequestHeaders(),
        body: JSON.stringify({ query: scrapeQuery, location: scrapeLoc })
      });
      if (!response.ok) {
        const err = await response.json();
        const errMsg = err.error || "Scraping tool error";
        if ((errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("RESOURCE_EXHAUSTED")) && apiKeys.length > 1) {
          const nextIndex = (activeKeyIndex + 1) % apiKeys.length;
          setActiveKeyIndex(nextIndex);
          localStorage.setItem("active_key_index", String(nextIndex));
          alert(`Clé #${activeKeyIndex + 1} atteint sa limite. Passage à la clé #${nextIndex + 1}. Relancez la recherche.`);
        } else {
          throw new Error(errMsg);
        }
        return;
      }
      const data = await response.json();
      setJobs(prev => [...data.jobs, ...prev]);
      setMatches(prev => [...data.matches, ...prev]);
      if (data.jobs && data.jobs.length > 0) {
        setSelectedJob(data.jobs[0]);
      }
      await refreshTelemetry();
    } catch (err: any) {
      alert(err.message || "Failed to trigger web job search");
    } finally {
      setIsScraping(false);
    }
  };

  // Verify that all candidate information is correct and matches raw CV
  const checkCandidateProfileMismatches = () => {
    const warnings: string[] = [];
    if (!candidate) {
      warnings.push("Aucun profil de candidat n'a été configuré sémantiquement. Veuillez d'abord extraire votre profil dans l'onglet 'Mon Profil & CV'.");
      return { isValid: false, warnings };
    }

    // Check required fields
    if (!candidate.name?.trim()) warnings.push("Le nom complet du candidat est requis.");
    if (!candidate.email?.trim()) warnings.push("L'adresse email est requise.");
    if (!candidate.phone?.trim()) warnings.push("Le numéro de téléphone est requis.");
    if (!candidate.location?.trim()) warnings.push("La localisation/ville est requise.");

    // Check for email mismatch
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
    const emailsInCv = cvText.match(emailRegex) || [];
    if (candidate.email && emailsInCv.length > 0) {
      const cleanCandEmail = candidate.email.trim().toLowerCase();
      const hasMatch = emailsInCv.some(email => email.trim().toLowerCase() === cleanCandEmail);
      if (!hasMatch) {
        warnings.push(`Mismatch d'Email : L'adresse email de votre profil (${candidate.email}) ne correspond pas à l'email trouvé dans le texte brut de votre CV (${emailsInCv[0]}).`);
      }
    }

    // Check for phone mismatch
    const phoneRegex = /(?:\+212|0)[5-7]\d{8}/g;
    const phonesInCv = cvText.match(phoneRegex) || [];
    if (candidate.phone && phonesInCv.length > 0) {
      const cleanCandPhone = candidate.phone.replace(/[\s.-]/g, "");
      const hasMatch = phonesInCv.some(phone => {
        const cleanPhone = phone.replace(/[\s.-]/g, "");
        return cleanPhone.includes(cleanCandPhone) || cleanCandPhone.includes(cleanPhone);
      });
      if (!hasMatch) {
        warnings.push(`Mismatch de Téléphone : Le numéro de téléphone de votre profil (${candidate.phone}) est différent de celui trouvé dans le texte brut de votre CV (${phonesInCv[0]}).`);
      }
    }

    // Check for name mismatch
    if (candidate.name && cvText) {
      const cleanCandName = candidate.name.toLowerCase();
      const words = cleanCandName.split(/\s+/).filter(w => w.length > 2);
      const hasSomeWord = words.some(word => cvText.toLowerCase().includes(word));
      if (words.length > 0 && !hasSomeWord) {
        warnings.push(`Mismatch de Nom : Le nom complet saisi (${candidate.name}) semble être différent de celui figurant sur votre CV.`);
      }
    }

    return {
      isValid: warnings.length === 0,
      warnings
    };
  };

  const handleApplyWithValidation = (jobId: string) => {
    const { isValid, warnings } = checkCandidateProfileMismatches();
    if (!isValid || warnings.length > 0) {
      setValidationErrors(warnings);
      setValidationTargetJobId(jobId);
      
      // Initialize form fields for correction modal
      setTempCandidateName(candidate?.name || candidateName || "");
      setTempCandidateEmail(candidate?.email || "");
      setTempCandidatePhone(candidate?.phone || "");
      setTempCandidateLocation(candidate?.location || "");
      
      setShowValidationModal(true);
    } else {
      handleInitiateApply(jobId);
    }
  };

  const handleSaveAndApply = async () => {
    setLoading(true);
    setShowValidationModal(false);
    try {
      const updatedCandidate = {
        ...candidate,
        id: candidate?.id || "cand_1",
        name: tempCandidateName,
        email: tempCandidateEmail,
        phone: tempCandidatePhone,
        location: tempCandidateLocation
      };

      const response = await fetch("/api/v1/profile", {
        method: "PUT",
        headers: getRequestHeaders(),
        body: JSON.stringify(updatedCandidate)
      });

      if (!response.ok) {
        throw new Error("Impossible de mettre à jour le profil.");
      }

      const data = await response.json();
      setCandidate(data.candidate);
      setCandidateName(tempCandidateName);

      alert("Profil mis à jour et réconcilié avec succès ! Lancement de l'ajustement du CV.");
      if (validationTargetJobId) {
        handleInitiateApply(validationTargetJobId);
      }
    } catch (err: any) {
      alert(err.message || "Erreur de mise à jour");
    } finally {
      setLoading(false);
    }
  };

  // Run dual-agent tailoring resume/critique cycle (Tailoring Agent + Critique Agent with LangGraph loop simulation)
  const handleInitiateApply = async (jobId: string) => {
    setIsApplying(jobId);
    try {
      const response = await fetch("/api/v1/apply", {
        method: "POST",
        headers: getRequestHeaders(),
        body: JSON.stringify({ jobId, candidateId: candidate?.id || "cand_1" })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Tailoring workflow failed");
      }
      const data = await response.json();
      setApplications(prev => [data.application, ...prev]);
      setSelectedApp(data.application);
      setActiveTab("applications");
      await refreshTelemetry();
    } catch (err: any) {
      const msg = err.message || "";
      const isKeyError = msg.includes("Clé API") || msg.includes("API key") || msg.includes("API_KEY") || msg.includes("configurée");
      const isQuotaError = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota") || msg.includes("exceeded");
      const isNetworkError = msg.includes("fetch failed") || msg.includes("Failed to fetch") || msg.includes("ConnectTimeout") || msg.includes("NetworkError");

      if (isQuotaError && apiKeys.length > 1) {
        const nextIndex = (activeKeyIndex + 1) % apiKeys.length;
        setActiveKeyIndex(nextIndex);
        localStorage.setItem("active_key_index", String(nextIndex));
        alert(`Clé API #${activeKeyIndex + 1} a atteint sa limite. Passage automatique à la clé #${nextIndex + 1}. Réessayez.`);
      } else if (isKeyError) {
        alert(
          "⚠️ Clé API requise\n\n" +
          "L'optimisation nécessite une clé API Google AI valide.\n\n" +
          "👉 Pour l'obtenir gratuitement :\n" +
          "1. Allez sur https://aistudio.google.com/apikey\n" +
          "2. Cliquez sur \"Create API key\"\n" +
          "3. Collez-la dans le champ Clé API à gauche\n\n" +
          "💡 Vous pouvez ajouter plusieurs clés pour rotation automatique."
        );
      } else if (isNetworkError) {
        alert("❌ Erreur réseau — Impossible de contacter l'API. Vérifiez votre connexion.");
      } else {
        alert(msg || "Erreur lors de l'optimisation. Veuillez réessayer.");
      }
    } finally {
      setIsApplying(null);
    }
  };

  // Submit Application physically
  const handleSubmitApplication = async (appId: string) => {
    try {
      const response = await fetch(`/api/v1/applications/${appId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      if (response.ok) {
        const data = await response.json();
        setApplications(prev => prev.map(a => a.id === appId ? data.application : a));
        setSelectedApp(data.application);
      } else {
        const err = await response.json().catch(() => ({}));
        alert(err.error || "Error submitting application. Please try again.");
      }
    } catch (err: any) {
      alert(err.message || "Error submitting application.");
    }
  };

  const handleSendApplicationEmail = async (appId: string, recipientEmail: string) => {
    try {
      const response = await fetch(`/api/v1/applications/${appId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientEmail, senderEmail: candidate?.email || "", senderPassword: "" })
      });
      const data = await response.json();
      if (response.ok) {
        alert(`Application sent to ${recipientEmail}!`);
        handleSubmitApplication(appId);
      } else {
        alert(data.error || "Failed to send email. You may need to configure SMTP credentials in .env.");
      }
    } catch (err: any) {
      alert(err.message || "Error sending email.");
    }
  };

  // Portfolio Scan Gitmining
  const handlePortfolioScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsMining(true);
    try {
      const response = await fetch("/api/v1/expand", {
        method: "POST",
        headers: getRequestHeaders(),
        body: JSON.stringify({ githubUrl: gitUrl, portfolioUrl })
      });
      if (response.ok) {
        const data = await response.json();
        setMiningResult(data.suggestions);
        await refreshTelemetry();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsMining(false);
    }
  };

  // Upskill gap analyzer
  const handleUpskillPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpskilling(true);
    try {
      const response = await fetch("/api/v1/upskill", {
        method: "POST",
        headers: getRequestHeaders(),
        body: JSON.stringify({ targetJobTitle: customRoleGoal })
      });
      if (response.ok) {
        const data = await response.json();
        setRoadmapResult(data.roadmap);
        await refreshTelemetry();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpskilling(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${darkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"}`}>
      
      {/* 1. Header & Telemetry Status */}
      <header className={`border-b ${darkMode ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"} sticky top-0 z-50 backdrop-blur-md`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          
          <div className="flex items-center gap-3">
            <img src="/job-hunt-logo.png" alt="Job Hunt Logo" className="w-10 h-10 rounded-xl object-contain shadow-lg" />
            <div>
              <span className="font-display font-bold text-xl tracking-tight bg-gradient-to-r from-orange-400 via-amber-500 to-amber-400 bg-clip-text text-transparent">
                Job Hunt
              </span>
              <p className="text-[10px] uppercase tracking-widest text-slate-400/80 font-mono">
                AI-Powered Job Search OS v1.1
              </p>
            </div>
          </div>

          {/* Quick Metrics & Settings wrapper */}
          <div className="flex flex-wrap items-center gap-4">
            <div className={`px-3 py-1.5 rounded-lg border font-mono text-xs flex items-center gap-2 ${darkMode ? "bg-slate-950 border-slate-800 text-slate-300" : "bg-slate-100 border-slate-300 text-slate-700"}`}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span>Tokens : <strong className="text-emerald-400">{costStats.totalTokensUsed?.toLocaleString() || "125,000"}</strong></span>
            </div>

            <div className={`px-3 py-1.5 rounded-lg border font-mono text-xs flex items-center gap-2 ${darkMode ? "bg-slate-950 border-slate-800 text-slate-300" : "bg-slate-100 border-slate-300 text-slate-700"}`}>
              <DollarSign className="w-3.5 h-3.5 text-amber-500" />
              <span>Coûts de l'API : <strong className={darkMode ? "text-amber-400" : "text-amber-700 font-bold"}>${Number(costStats.totalCostUsd || 0).toFixed(5)}</strong></span>
            </div>

            {/* Accessibility Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              id="theme-toggle"
              aria-label="Toggle dark mode"
              className={`p-2 rounded-xl border transition-all cursor-pointer ${darkMode ? "bg-slate-900 hover:bg-slate-800 border-slate-800 text-amber-400" : "bg-white hover:bg-slate-100 border-slate-200 text-slate-600"}`}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* 2. Security Guard warning */}
      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col lg:flex-row gap-8">
        
        {/* Navigation - Responsive Sidebar / Tab bar */}
        <aside className="lg:w-64 w-full shrink-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-2 scrollbar-thin">
          <nav className="flex lg:flex-col flex-wrap gap-2">
            
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all w-full justify-start cursor-pointer ${
                activeTab === "dashboard"
                  ? "bg-orange-600 text-white shadow-md shadow-orange-600/15"
                  : darkMode
                  ? "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                  : "text-slate-600 hover:bg-slate-200 hover:text-slate-950"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Tableau de Bord</span>
            </button>

            <button
              onClick={() => setActiveTab("profile")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all w-full justify-start cursor-pointer ${
                activeTab === "profile"
                  ? "bg-orange-600 text-white shadow-md shadow-orange-600/15"
                  : darkMode
                  ? "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                  : "text-slate-600 hover:bg-slate-200 hover:text-slate-950"
              }`}
            >
              <User className="w-4 h-4" />
              <span>Mon Profil & CV</span>
              {candidate ? (
                <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono">CV Configuré</span>
              ) : (
                <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-500 font-mono">Configurer</span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("jobs")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all w-full justify-start cursor-pointer ${
                activeTab === "jobs"
                  ? "bg-orange-600 text-white shadow-md shadow-orange-600/15"
                  : darkMode
                  ? "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                  : "text-slate-600 hover:bg-slate-200 hover:text-slate-950"
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>Offres d'Emploi</span>
              <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${darkMode ? "bg-slate-950 text-orange-400" : "bg-slate-100 text-orange-600 font-bold"}`}>{jobs.length}</span>
            </button>

            <button
              onClick={() => setActiveTab("applications")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all w-full justify-start cursor-pointer ${
                activeTab === "applications"
                  ? "bg-orange-600 text-white shadow-md shadow-orange-600/15"
                  : darkMode
                  ? "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                  : "text-slate-600 hover:bg-slate-200 hover:text-slate-950"
              }`}
            >
              <FileCheck className="w-4 h-4" />
              <span>Candidatures & Suivi</span>
              {applications.length > 0 && (
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold">{applications.filter(a => a.status === "draft").length} Brouillons</span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("expand")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all w-full justify-start cursor-pointer ${
                activeTab === "expand"
                  ? "bg-orange-600 text-white shadow-md shadow-orange-600/15"
                  : darkMode
                  ? "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                  : "text-slate-600 hover:bg-slate-200 hover:text-slate-950"
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Optimisation Portfolio</span>
            </button>

            <button
              onClick={() => setActiveTab("observability")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all w-full justify-start cursor-pointer ${
                activeTab === "observability"
                  ? "bg-orange-600 text-white shadow-md shadow-orange-600/15"
                  : darkMode
                  ? "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                  : "text-slate-600 hover:bg-slate-200 hover:text-slate-950"
              }`}
            >
              <Terminal className="w-4 h-4" />
              <span>Console d'Observabilité</span>
            </button>

          </nav>

          <div className={`mt-8 p-4 rounded-xl border ${darkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"} text-xs hidden lg:block`}>
            <span className="font-mono text-[10px] uppercase font-bold text-orange-400">Machine d'État Autonome</span>
            <p className={`mt-1 leading-relaxed ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Fonctionne avec un moteur d'état intelligent vérifiant l'adéquation de vos compétences. Optimisé pour le marché marocain.</p>
          </div>

          {/* API Provider Selection */}
          <div className={`mt-4 p-4 rounded-xl border ${darkMode ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"} text-xs space-y-3`}>
            <div className={`flex items-center gap-1.5 border-b pb-1.5 ${darkMode ? "border-slate-800/60" : "border-slate-200"}`}>
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span className={`font-mono text-[10px] uppercase font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Fournisseur IA</span>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleSaveProvider("gemini")}
                className={`w-full text-left p-2 rounded-lg border text-[11px] transition-all cursor-pointer ${
                  apiProvider === "gemini"
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : darkMode ? "border-slate-800 hover:border-slate-700" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className={`font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Google Gemini</span>
                <p className={`text-[10px] mt-0.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Gratuit - aistudio.google.com</p>
              </button>

              <button
                onClick={() => handleSaveProvider("openai-compatible", "https://inference.dahl.global/v1", "MiniMaxAI/MiniMax-M2.7")}
                className={`w-full text-left p-2 rounded-lg border text-[11px] transition-all cursor-pointer ${
                  apiProvider === "openai-compatible"
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : darkMode ? "border-slate-800 hover:border-slate-700" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className={`font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Dahl Inference (OpenAI)</span>
                <p className={`text-[10px] mt-0.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>inference.dahl.global</p>
              </button>
            </div>

            {apiProvider === "openai-compatible" && (
              <div className="space-y-2 pt-2 border-t border-slate-800/40">
                <div>
                  <label className={`block text-[10px] font-mono mb-0.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Base URL</label>
                  <input
                    type="text"
                    value={apiBaseUrl}
                    onChange={(e) => { setApiBaseUrl(e.target.value); localStorage.setItem("api_base_url", e.target.value); }}
                    className={`w-full px-2 py-1 text-[10px] font-mono rounded border focus:outline-none focus:ring-1 focus:ring-orange-500 ${darkMode ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                  />
                </div>
                <div>
                  <label className={`block text-[10px] font-mono mb-0.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Modèle</label>
                  <input
                    type="text"
                    value={apiModel}
                    onChange={(e) => { setApiModel(e.target.value); localStorage.setItem("api_model", e.target.value); }}
                    className={`w-full px-2 py-1 text-[10px] font-mono rounded border focus:outline-none focus:ring-1 focus:ring-orange-500 ${darkMode ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-900"}`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Card Configuration Clé API */}
          <div className={`mt-4 p-4 rounded-xl border ${darkMode ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200"} text-xs space-y-3`}>
            <div className={`flex items-center gap-1.5 border-b pb-1.5 ${darkMode ? "border-slate-800/60" : "border-slate-200"}`}>
              <Key className="w-3.5 h-3.5 text-orange-400" />
              <span className={`font-mono text-[10px] uppercase font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Clés API ({apiKeys.length})</span>
            </div>
            
            <p className={`text-[11px] leading-snug ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
              Ajoutez une ou plusieurs clés API Google AI. En cas de dépassement de quota, bascule automatique.
            </p>

            <div className="space-y-2">
              {apiKeys.map((key, idx) => (
                <div key={idx} className={`flex items-center gap-2 p-1.5 rounded border ${idx === activeKeyIndex ? "border-emerald-500/50 bg-emerald-500/5" : darkMode ? "border-slate-800" : "border-slate-200"}`}>
                  <button
                    onClick={() => handleSwitchKey(idx)}
                    className={`shrink-0 w-5 h-5 rounded-full text-[9px] font-mono font-bold flex items-center justify-center cursor-pointer ${
                      idx === activeKeyIndex ? "bg-emerald-500 text-white" : darkMode ? "bg-slate-800 text-slate-400" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {idx + 1}
                  </button>
                  <span className={`font-mono text-[10px] truncate flex-1 ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                    {key.substring(0, 8)}...{key.substring(key.length - 4)}
                  </span>
                  <button
                    onClick={() => handleRemoveApiKey(idx)}
                    className="text-[9px] text-red-500 hover:underline cursor-pointer shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-1.5">
              <input
                type="password"
                placeholder={apiProvider === "gemini" ? "AIzaSy... (clé de aistudio.google.com)" : "Clé API du fournisseur..."}
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddApiKey()}
                className={`flex-1 px-2 py-1.5 text-[11px] font-mono rounded border focus:outline-none focus:ring-1 focus:ring-orange-500 ${darkMode ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-slate-50 border-slate-300 text-slate-900"}`}
              />
              <button
                onClick={handleAddApiKey}
                className="px-2 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded text-[10px] font-bold cursor-pointer"
              >
                +
              </button>
            </div>

            <div className={`pt-1.5 border-t ${darkMode ? "border-slate-800/40" : "border-slate-200"}`}>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                referrerPolicy="no-referrer"
                rel="noopener noreferrer"
                className={`inline-flex items-center justify-center gap-1 w-full text-center text-[10px] py-1.5 rounded-lg font-medium transition-all cursor-pointer text-white ${darkMode ? "bg-orange-600 hover:bg-slate-850" : "bg-orange-600 hover:bg-orange-700"}`}
              >
                <span>Créer une Clé Gratuite</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
        </aside>

        {/* 3. Main Operational Content Panels */}
        <section className="flex-1 min-w-0">
          
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
              <p className="font-mono text-sm text-slate-400">Synchronisation des machines d'état locales avec Gemini...</p>
            </div>
          )}

          {!loading && (
            <>
              {/* TAB 1: DASHBOARD ORCHESTRATOR */}
              {activeTab === "dashboard" && (
                <div className="space-y-6">
                  
                  {/* Visual Brand Welcome */}
                  <div className={`p-6 rounded-2xl border ${darkMode ? "bg-gradient-to-br from-slate-900 to-orange-950/40 border-orange-950/80" : "bg-gradient-to-br from-orange-50 to-white border-orange-200/60"}`}>
                    <div className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
                      <div>
                        <h1 className="font-display font-bold text-2xl sm:text-3xl tracking-tight">Centre de Commandement Emploi</h1>
                        <p className={`text-sm mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                          Gérez l'extraction de CV, lancez des recherches d'offres ciblées au Maroc, suivez les critiques IA itératives et exportez vos dossiers de candidature.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setActiveTab("profile")}
                          className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-medium text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                        >
                          <User className="w-3.5 h-3.5" /> Configurer le Profil
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Operational Telemetry Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    
                    {/* Active Candidate stats */}
                    <div className={`p-4 rounded-xl border ${darkMode ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
                      <span className={`text-xs font-mono uppercase ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Candidat Ciblé</span>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-400 font-bold">
                          <User className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className={`font-bold text-sm tracking-tight ${darkMode ? "text-slate-100" : "text-slate-800"}`}>{candidate?.name || "Aucun Profil Configuré"}</h4>
                          <span className={`text-[11px] ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{candidate?.location || "Maroc"}</span>
                        </div>
                      </div>
                      <div className={`mt-3 pt-3 border-t flex items-center justify-between text-xs font-mono ${darkMode ? "border-slate-800/60 text-slate-400" : "border-slate-100 text-slate-500"}`}>
                        <span>Compétences</span>
                        <strong className={`px-1.5 py-0.5 rounded ${darkMode ? "text-white bg-orange-500/20" : "text-orange-600 bg-orange-50"}`}>{candidate?.skills.length || 0} Technologies</strong>
                      </div>
                    </div>

                    {/* Discovery engine stats */}
                    <div className={`p-4 rounded-xl border ${darkMode ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
                      <span className={`text-xs font-mono uppercase ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Offres d'Emploi Aspirées</span>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold">
                          <Compass className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className={`font-bold text-sm tracking-tight ${darkMode ? "text-slate-100" : "text-slate-800"}`}>{jobs.length} Postes Actifs</h4>
                          <span className="text-[10px] text-emerald-500 font-mono font-bold">Crawler en Ligne</span>
                        </div>
                      </div>
                      <div className={`mt-3 pt-3 border-t flex items-center justify-between text-xs font-mono ${darkMode ? "border-slate-800/60 text-slate-400" : "border-slate-100 text-slate-500"}`}>
                        <span>Correspondances (Adéquation &gt; 80%)</span>
                        <strong className={`px-1.5 py-0.5 rounded ${darkMode ? "text-emerald-400 bg-emerald-500/10" : "text-emerald-600 bg-emerald-50"}`}>{matches.filter(m => m.fitScore >= 80).length} Postes</strong>
                      </div>
                    </div>

                    {/* Tailor process status */}
                    <div className={`p-4 rounded-xl border ${darkMode ? "bg-slate-900/50 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
                      <span className={`text-xs font-mono uppercase ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Candidatures Adaptées</span>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 font-bold">
                          <FileCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className={`font-bold text-sm tracking-tight ${darkMode ? "text-slate-100" : "text-slate-800"}`}>{applications.length} Auto-générées</h4>
                          <span className="text-[10px] text-amber-600 font-mono font-bold">Évaluations IA Terminées</span>
                        </div>
                      </div>
                      <div className={`mt-3 pt-3 border-t flex items-center justify-between text-xs font-mono ${darkMode ? "border-slate-800/60 text-slate-300" : "border-slate-100 text-slate-500"}`}>
                        <span>Score ATS Moyen</span>
                        <strong className={`px-1.5 py-0.5 rounded ${darkMode ? "text-amber-400 bg-amber-500/10" : "text-amber-700 bg-amber-50"}`}>
                          {applications.length > 0 
                            ? Math.round(applications.reduce((acc, current) => acc + current.atsScore, 0) / applications.length)
                            : 88}%
                        </strong>
                      </div>
                    </div>

                  </div>

                  {/* Multi-Agent Live Execution Visual Stack */}
                  <div className={`p-6 rounded-xl border ${darkMode ? "bg-slate-900/30 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
                    <h3 className={`font-display font-semibold text-lg mb-4 flex items-center gap-2 ${darkMode ? "text-slate-100" : "text-slate-800"}`}>
                      <Cpu className="w-5 h-5 text-orange-500" /> Topologies des Flux Multi-Agents
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      
                      {/* Node 1 */}
                      <div className={`p-3 rounded-lg border flex flex-col justify-between ${darkMode ? "bg-slate-950 border-slate-800/80" : "bg-slate-50 border-slate-200"}`}>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-mono uppercase bg-orange-500/10 text-orange-400 px-1.5 py-0.5 rounded font-bold">Nœud 1</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-ping"></span>
                        </div>
                        <h5 className={`font-bold text-xs ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Analyse du Profil CV</h5>
                        <p className={`text-[11px] mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Convertit les CV bruts en structures de données standardisées.</p>
                      </div>

                      {/* Node 2 */}
                      <div className={`p-3 rounded-lg border flex flex-col justify-between ${darkMode ? "bg-slate-950 border-slate-800/80" : "bg-slate-50 border-slate-200"}`}>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-bold">Nœud 2</span>
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                        </div>
                        <h5 className={`font-bold text-xs ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Découverte & Alignement</h5>
                        <p className={`text-[11px] mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Calcule l'adéquation des compétences et classe les offres du marché.</p>
                      </div>

                      {/* Node 3 */}
                      <div className={`p-3 rounded-lg border flex flex-col justify-between ${darkMode ? "bg-slate-950 border-slate-800/80" : "bg-slate-50 border-slate-200"}`}>
                        <div className="flex justify-between items-center mb-2">
                          <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded font-bold ${darkMode ? "bg-amber-500/10 text-amber-400" : "bg-amber-100 text-amber-800"}`}>Nœud 3</span>
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                        </div>
                        <h5 className={`font-bold text-xs ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Ajustement Génératif</h5>
                        <p className={`text-[11px] mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Génère des variantes adaptées du CV et de la lettre en Markdown.</p>
                      </div>

                      {/* Node 4 */}
                      <div className={`p-3 rounded-lg border flex flex-col justify-between ${darkMode ? "bg-slate-950 border-slate-800/80" : "bg-slate-50 border-slate-200"}`}>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded font-bold">Nœud 4</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                        </div>
                        <h5 className={`font-bold text-xs ${darkMode ? "text-slate-200" : "text-slate-800"}`}>Critique & Évaluation ATS</h5>
                        <p className={`text-[11px] mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Évalue le score ATS et relance automatiquement le flux si &lt;85%.</p>
                      </div>

                    </div>
                  </div>

                  {/* API Costs Distribution Chart (Custom Vector Visualization) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    <div className={`p-6 rounded-xl border ${darkMode ? "bg-slate-900/30 border-slate-800" : "bg-white border-slate-200 shadow-sm"}`}>
                      <h3 className={`font-display font-semibold text-base mb-4 flex items-center gap-2 ${darkMode ? "text-slate-100" : "text-slate-800"}`}>
                        <TrendingUp className="w-4 h-4 text-amber-500" /> Analyse des Micro-Coûts LLM
                      </h3>
                      
                      <div className="space-y-4">
                        {costStats.agentDistribution?.map((item: any, idx: number) => (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className={`font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{item.name}</span>
                              <span className={`font-mono font-bold ${darkMode ? "text-slate-400" : "text-slate-600"}`}>${item.cost.toFixed(5)} ({item.share}%)</span>
                            </div>
                            <div className={`w-full rounded-full h-1.5 overflow-hidden ${darkMode ? "bg-slate-800" : "bg-slate-200"}`}>
                              <div 
                                className="bg-gradient-to-r from-orange-500 to-amber-500 h-1.5 rounded-full" 
                                style={{ width: `${item.share}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                        {(!costStats.agentDistribution || costStats.agentDistribution.length === 0) && (
                          <div className={`text-center py-6 text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                            Analysez un CV ou recherchez des offres d'emploi pour voir la répartition des coûts.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Operational Tips list */}
                    <div className={`p-6 rounded-xl border ${darkMode ? "bg-slate-900/30 border-slate-800" : "bg-white border-slate-200 shadow-sm"} flex flex-col justify-between`}>
                      <div>
                        <h3 className={`font-display font-semibold text-base mb-2 ${darkMode ? "text-slate-100" : "text-slate-800"}`}>Instructions & Commandes</h3>
                        <p className={`text-xs leading-relaxed mb-4 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                          Cet environnement représente un simulateur interactif du système **AutoApply AI**. Il communique de manière autonome à l'aide du SDK officiel <strong>@google/genai TypeScript</strong>.
                        </p>
                        <ul className={`space-y-2 text-xs ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                          <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5"></span>
                            <span><strong>Analyse :</strong> Ajoutez votre texte de CV dans l'onglet Profil pour tester l'extraction d'identité.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5"></span>
                            <span><strong>Découverte :</strong> Utilisez l'outil de recherche d'offres ciblées au Maroc pour identifier des correspondances sémantiques.</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5"></span>
                            <span><strong>Adaptation :</strong> Cliquez sur &quot;Lancer l'Ajustement&quot; pour tester le cycle de critique multi-agents.</span>
                          </li>
                        </ul>
                      </div>
                      <div className={`pt-4 border-t flex justify-between items-center ${darkMode ? "border-slate-800/50" : "border-slate-200"}`}>
                        <span className="text-[10px] font-mono text-orange-400 uppercase">Auto-Optimisation</span>
                        <button onClick={() => setActiveTab("jobs")} className="text-xs text-orange-400 hover:text-orange-300 font-medium flex items-center gap-1 cursor-pointer">
                          Analyser les Postes Offerts <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                  </div>

                </div>
              )}

              {/* TAB 2: CANDIDATE PROFILE */}
              {activeTab === "profile" && (
                <div className="space-y-6">
                  
                  {/* Tab header */}
                  <div className={`border-b pb-4 ${darkMode ? "border-slate-800" : "border-slate-200"}`}>
                    <h2 className="font-display font-bold text-2xl">Structuration de CV & Profil</h2>
                    <p className={`text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Convertissez du texte brut de CV en schéma de données structuré à l'aide de l'Agent de Profil.</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* Setup / Parse CV Form */}
                    <form onSubmit={handleProfileSetup} className={`p-6 rounded-xl border ${darkMode ? "bg-slate-900/30 border-slate-800" : "bg-white border-slate-200 shadow-sm"} space-y-4`}>
                      <h4 className={`font-display font-semibold text-base mb-2 ${darkMode ? "text-slate-100" : "text-slate-800"}`}>Étape 1 : Saisir les données de CV brutes</h4>
                      
                      <div>
                        <label className={`block text-xs font-mono uppercase mb-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Nom du Candidat Ciblé</label>
                        <input 
                          type="text" 
                          required
                          value={candidateName}
                          onChange={(e) => setCandidateName(e.target.value)}
                          className={`w-full p-2.5 rounded-lg border text-sm font-sans focus:outline-none focus:ring-1 focus:ring-orange-500 ${darkMode ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                        />
                      </div>

                      {/* Drag & Drop Resume File Upload */}
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-5 text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-2 ${
                          isDragging
                            ? "border-orange-500 bg-orange-500/10"
                            : darkMode
                            ? "border-slate-800 hover:border-orange-400 bg-slate-950/40 hover:bg-slate-950/80"
                            : "border-slate-300 hover:border-orange-500 bg-slate-50 hover:bg-slate-100 shadow-sm"
                        }`}
                      >
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept=".txt,.md,.json,.pdf,.doc,.docx"
                          className="hidden"
                        />
                        <div className={`p-2.5 rounded-full ${isDragging ? "bg-orange-500/20 text-orange-400" : darkMode ? "bg-slate-900 text-orange-400" : "bg-orange-50 text-orange-600"}`}>
                          <Upload className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-bold">
                            {uploadedFile ? `Sélectionné : ${uploadedFile.name}` : "Glissez-déposez votre fichier de CV ici"}
                          </p>
                          <p className={`text-[10px] mt-0.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                            {uploadedFile ? `${(uploadedFile.size / 1024).toFixed(1)} Ko | Cliquez pour en choisir un autre` : "ou parcourez les fichiers de votre ordinateur"}
                          </p>
                        </div>
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest leading-none">
                          PDF • Word • TXT • Markdown • JSON
                        </span>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className={`block text-xs font-mono uppercase ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Texte Brut du CV en Markdown</label>
                          <button 
                            type="button"
                            onClick={() => {
                              setCvText(`YASMINE EL AMRANI\nyasmine.elamrani@example.ma | Casablanca, Maroc\n\nRÉSUMÉ :\nIngénieure Full-Stack expérimentée avec 6 ans de pratique sur React et les bases SQL/NoSQL au Maroc.\n\nCOMPÉTENCES :\nReact, Node.js, Next.js, PostgreSQL, Docker, AWS, Français, Anglais.\n\nEXPÉRIENCE :\nTechSolutions Casablanca (2023 - Présent)\n- Refonte globale de l'ERP interne utilisant Next.js et Tailwind.\n- Réduction des temps de chargement des requêtes SQL de 30%.\n\nÉDUCATION :\nDiplôme d'Ingénieur d'État - EMI Rabat.`);
                            }}
                            className="text-[10px] text-orange-400 hover:underline"
                          >
                            Charger un exemple
                          </button>
                        </div>
                        <textarea
                          rows={12}
                          required
                          value={cvText}
                          onChange={(e) => setCvText(e.target.value)}
                          placeholder="Collez une version brute de votre CV pour voir comment Gemini normalise les différentes sections..."
                          className={`w-full p-2.5 rounded-lg border text-xs font-mono focus:outline-none focus:ring-1 focus:ring-orange-500 ${darkMode ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                        ></textarea>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3 bg-orange-600 hover:bg-orange-500 text-white font-medium text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-orange-500/10"
                      >
                        <Cpu className="w-4 h-4 animate-spin-slow" /> Extraction Structurelle du CV
                      </button>
                      <p className={`text-[10px] font-mono text-center ${darkMode ? "text-slate-400/80" : "text-slate-500"}`}>Appelle l'Agent de Profil avec Gemini 3.5-flash en imposant un schéma strict de validation.</p>
                    </form>

                    {/* Current Structured output */}
                    <div className="space-y-6">
                      
                      <div className={`p-6 rounded-xl border ${darkMode ? "bg-slate-900/30 border-slate-800" : "bg-white border-slate-200 shadow-sm"} space-y-4`}>
                        <div className={`flex justify-between items-center border-b pb-3 ${darkMode ? "border-slate-800/60" : "border-slate-100"}`}>
                          <h4 className={`font-display font-semibold text-base ${darkMode ? "text-slate-100" : "text-slate-800"}`}>Données d'Identité Extraites</h4>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setProfileViewMode("json")}
                              className={`text-[10px] px-2.5 py-1 rounded-lg font-bold font-mono transition-all cursor-pointer ${
                                profileViewMode === "json" 
                                  ? "bg-orange-600 text-white shadow" 
                                  : darkMode 
                                  ? "bg-slate-800 text-slate-400 hover:text-slate-200" 
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              Données
                            </button>
                            <button
                              type="button"
                              onClick={() => setProfileViewMode("pdf")}
                              className={`text-[10px] px-2.5 py-1 rounded-lg font-bold font-mono transition-all cursor-pointer ${
                                profileViewMode === "pdf" 
                                  ? "bg-orange-600 text-white shadow" 
                                  : darkMode 
                                  ? "bg-slate-800 text-slate-400 hover:text-slate-200" 
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              Aperçu PDF
                            </button>
                          </div>
                        </div>

                        {candidate ? (
                          profileViewMode === "pdf" ? (
                            <div className="pt-2">
                              <PDFPreview candidate={candidate} title={`CV_${candidate.name}`} />
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div>
                                <h3 className={`font-bold text-lg ${darkMode ? "text-slate-100" : "text-slate-800"}`}>{candidate.name}</h3>
                                <p className={`text-xs flex items-center gap-1.5 mt-0.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                                  <MapPin className={`w-3 h-3 ${darkMode ? "text-orange-400" : "text-orange-500"}`} /> {candidate.location} | {candidate.email} | {candidate.phone}
                                </p>
                              </div>

                              <div>
                                <span className={`block text-[10px] uppercase font-mono mb-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Résumé de Profil Synthétisé</span>
                                <p className={`text-xs leading-relaxed p-2.5 rounded border ${darkMode ? "text-slate-300 bg-slate-950/40 border-slate-800/40" : "text-slate-700 bg-slate-50 border-slate-200"}`}>
                                  {candidate.summary}
                                </p>
                              </div>

                              {/* Skills block */}
                              <div>
                                <span className={`block text-[10px] uppercase font-mono mb-1.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Inventaire des Compétences Détectées</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {candidate.skills.map((s, idx) => (
                                    <span 
                                      key={idx} 
                                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                                        s.proficiency === "expert" 
                                          ? "bg-orange-500/10 border-orange-500/40 text-orange-300 font-bold" 
                                          : darkMode
                                          ? "bg-slate-800/60 border-slate-700/60 text-slate-300"
                                          : "bg-slate-100 border-slate-200 text-slate-700"
                                      }`}
                                    >
                                      {s.skillName} • {s.proficiency}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* Work experiences */}
                              <div>
                                <span className={`block text-[10px] uppercase font-mono mb-2 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Historique Professionnel</span>
                                <div className="space-y-3">
                                  {candidate.workExperience.map((we, idx) => (
                                    <div key={idx} className="border-l-2 border-orange-500/50 pl-3 py-0.5">
                                      <div className="flex justify-between text-xs">
                                        <strong className={darkMode ? "text-slate-200" : "text-slate-800"}>{we.title} @ {we.company}</strong>
                                        <span className={`font-mono text-[10px] ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{we.startDate} à {we.endDate}</span>
                                      </div>
                                      <ul className={`mt-1 text-[11px] list-disc space-y-0.5 ml-4 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                        {we.achievements?.slice(0, 2).map((ach, aIdx) => (
                                          <li key={aIdx}>{ach}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  ))}
                                </div>
                              </div>

                            </div>
                          )
                        ) : (
                          <div className={`text-center py-12 text-xs font-mono ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                            Aucun profil structuré disponible. Chargez l'exemple puis lancez l'analyse !
                          </div>
                        )}

                      </div>

                    </div>

                  </div>

                </div>
              )}

              {/* TAB 3: JOB DISCOVERY */}
              {activeTab === "jobs" && (
                <div className="space-y-6">
                  
                  {/* Title Bar */}
                  <div className={`border-b pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${darkMode ? "border-slate-800" : "border-slate-200"}`}>
                    <div>
                      <h2 className="font-display font-bold text-2xl">Job Discovery</h2>
                      <p className={`text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Search international job listings from LinkedIn, Indeed, Glassdoor and more — including internships and remote roles.</p>
                    </div>
                    {/* Inline scraper query */}
                    <form onSubmit={handleJobScraping} className="flex flex-wrap gap-2 w-full sm:w-auto">
                      <input 
                        type="text" 
                        value={scrapeQuery}
                        placeholder="Job title (e.g., React Developer, Data Engineer)"
                        onChange={(e) => setScrapeQuery(e.target.value)}
                        className={`p-2 rounded-xl border text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none shrink ${darkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                      />
                      <input 
                        type="text" 
                        value={scrapeLoc}
                        placeholder="Location or Remote"
                        onChange={(e) => setScrapeLoc(e.target.value)}
                        className={`w-36 p-2 rounded-xl border text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none shrink ${darkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                      />
                      <button
                        type="submit"
                        disabled={isScraping}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-xl text-xs font-medium font-mono border border-transparent transition-all flex items-center gap-2 cursor-pointer text-white"
                      >
                        {isScraping ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                        <span>{isScraping ? "Searching..." : "Search Jobs"}</span>
                      </button>
                    </form>
                  </div>

                  {/* Dual Grid Layout */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Left Column: Listings Column */}
                    <div className="lg:col-span-1 space-y-3 max-h-[600px] overflow-y-auto pr-1">
                      {jobs.map((job) => {
                        const jobMatch = matches.find(m => m.jobId === job.id);
                        const isSelected = selectedJob?.id === job.id;
                        return (
                          <div
                            key={job.id}
                            onClick={() => setSelectedJob(job)}
                            className={`p-4 rounded-xl border transition-all cursor-pointer ${
                              isSelected 
                                ? "bg-orange-600/10 border-orange-500/80 shadow-md shadow-orange-500/5" 
                                : darkMode 
                                ? "bg-slate-900/40 border-slate-800 hover:border-slate-700" 
                                : "bg-white border-slate-200 hover:border-orange-300 shadow-sm"
                            }`}
                          >
                            <div className="flex justify-between items-start gap-1">
                              <span className={`text-[10px] font-mono uppercase font-semibold ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{job.company}</span>
                              {jobMatch && (
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                                  jobMatch.fitScore >= 85 
                                    ? (darkMode ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" : "bg-emerald-50 text-emerald-750 border-emerald-200") 
                                    : (darkMode ? "bg-amber-500/10 text-amber-400 border-amber-500/25" : "bg-amber-50 text-amber-800 border-amber-200")
                                }`}>
                                  {jobMatch.fitScore}% ADÉQUATION
                                </span>
                              )}
                            </div>
                            <h4 className={`font-bold text-sm tracking-tight mt-1 lines-clamp-1 ${darkMode ? "text-slate-100" : "text-slate-800"}`}>{job.title}</h4>
                            <div className={`flex items-center gap-3 text-[11px] mt-2 font-mono ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                              <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {job.location}</span>
                              <span className="capitalize">{job.remoteType}</span>
                              {job.sourceBoard && <span className="text-[9px] text-orange-500">{job.sourceBoard}</span>}
                            </div>
                            {job.sourceUrl && (
                              <a
                                href={job.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-0.5 mt-1.5 text-[9px] text-orange-500 hover:text-orange-400 font-mono"
                              >
                                <ExternalLink className="w-2.5 h-2.5" /> Search on {job.sourceBoard}
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Right Column: Active Job Description & Action Hub */}
                    <div className="lg:col-span-2">
                      {selectedJob ? (
                        <div className={`p-6 rounded-2xl border ${darkMode ? "bg-slate-900/30 border-slate-800" : "bg-white border-slate-200 shadow-sm"} space-y-6`}>
                          
                          {/* Header section */}
                          <div className={`flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 border-b ${darkMode ? "border-slate-800/60" : "border-slate-200"}`}>
                            <div>
                              <span className="text-xs uppercase font-mono text-orange-400">{selectedJob.company}</span>
                              <h3 className={`font-display font-bold text-xl sm:text-2xl mt-0.5 ${darkMode ? "text-slate-100" : "text-slate-800"}`}>{selectedJob.title}</h3>
                              <p className={`text-xs mt-1 font-mono flex items-center gap-2 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                <span>{selectedJob.location}</span> • 
                                <span className="capitalize">{selectedJob.remoteType}</span> • 
                                {selectedJob.salaryMin && <span>${selectedJob.salaryMin.toLocaleString()} - ${selectedJob.salaryMax?.toLocaleString()}</span>}
                              </p>
                              {selectedJob.sourceUrl && (
                                <a
                                  href={selectedJob.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 mt-2 text-[10px] font-mono text-orange-500 hover:text-orange-400 underline underline-offset-2"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Search for similar roles on {selectedJob.sourceBoard}
                                </a>
                              )}
                            </div>

                            <div className="flex gap-2 shrink-0">
                              <button
                                onClick={() => handleApplyWithValidation(selectedJob.id)}
                                disabled={isApplying !== null}
                                className="px-5 py-3 bg-orange-600 hover:bg-orange-500 font-semibold rounded-xl text-xs flex items-center gap-2 text-white transition-all shadow-lg shadow-orange-600/15 cursor-pointer"
                              >
                                {isApplying === selectedJob.id ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Generating CV &amp; Cover Letter...</span>
                                  </>
                                ) : (
                                  <>
                                    <Cpu className="w-4 h-4" />
                                    <span>Generate Tailored Application</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Fit scoring dashboard */}
                          {matches.find(m => m.jobId === selectedJob.id) && (
                            <div className={`p-4 rounded-xl border ${darkMode ? "bg-slate-950/40 border-slate-800/40" : "bg-slate-50 border-slate-200 shadow-inner"}`}>
                              <div className="flex justify-between items-center">
                                <span className={`text-xs font-mono uppercase ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Analyse de Recommandation par Réseau de Neurones</span>
                                <span className="text-xs font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">Calculé par l'Agent de Découverte</span>
                              </div>
                              <p className={`text-xs leading-relaxed mt-2 ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                                {matches.find(m => m.jobId === selectedJob.id)?.matchAnalysis}
                              </p>

                              {/* Mini ratings bar */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-[11px] font-mono">
                                <div>
                                  <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Compétences Clés</span>
                                  <div className="mt-0.5 text-xs text-emerald-400 font-bold">{matches.find(m => m.jobId === selectedJob.id)?.skillsScore}%</div>
                                </div>
                                <div>
                                  <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Expérience</span>
                                  <div className="mt-0.5 text-xs text-emerald-400 font-bold">{matches.find(m => m.jobId === selectedJob.id)?.experienceScore}%</div>
                                </div>
                                <div>
                                  <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Séniorité</span>
                                  <div className="mt-0.5 text-xs text-emerald-400 font-bold">{matches.find(m => m.jobId === selectedJob.id)?.seniorityScore}%</div>
                                </div>
                                <div>
                                  <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Secteur d'Activité</span>
                                  <div className="mt-0.5 text-xs text-emerald-400 font-bold">{matches.find(m => m.jobId === selectedJob.id)?.industryScore}%</div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Full specifications */}
                          <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 text-xs ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                            <div className="space-y-3">
                              <h5 className={`font-bold block border-b pb-1 font-mono uppercase text-[10px] ${darkMode ? "text-slate-200 border-slate-800" : "text-slate-800 border-slate-200"}`}>Description du Poste</h5>
                              <p className={`leading-relaxed ${darkMode ? "text-slate-400" : "text-slate-600"}`}>{selectedJob.description}</p>
                            </div>

                            <div className="space-y-4">
                              <div>
                                <h5 className={`font-bold block border-b pb-1 font-mono uppercase text-[10px] mb-2 ${darkMode ? "text-slate-200 border-slate-800" : "text-slate-800 border-slate-200"}`}>Compétences Requises</h5>
                                <div className="flex flex-wrap gap-1.5">
                                  {selectedJob.requiredSkills.map((sk, idx) => (
                                    <span key={idx} className={`px-2 py-0.5 rounded text-[10px] font-mono border ${darkMode ? "bg-slate-850 border-slate-850 text-slate-300" : "bg-slate-100 border-slate-200 text-slate-700"}`}>
                                      {sk}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <h5 className={`font-bold block border-b pb-1 font-mono uppercase text-[10px] mb-1.5 ${darkMode ? "text-slate-200 border-slate-800" : "text-slate-800 border-slate-200"}`}>Prérequis &amp; Qualifications</h5>
                                <ul className={`list-disc pl-4 space-y-1 leading-relaxed ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                  {selectedJob.requirements.map((req, idx) => (
                                    <li key={idx}>{req}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>

                        </div>
                      ) : (
                        <div className={`text-center py-20 text-sm font-mono ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                          Aucune offre d'emploi sélectionnée. Activez le crawler ci-dessus ou choisissez-en une dans la liste.
                        </div>
                      )}
                    </div>

                  </div>

                </div>
              )}

              {/* TAB 4: APPLICATIONS & HARVESTING */}
              {activeTab === "applications" && (
                <div className="space-y-6">
                  
                  {/* Title */}
                  <div className="border-b border-slate-800 pb-4">
                    <h2 className="font-display font-bold text-2xl">Registre des Candidatures Personnalisées</h2>
                    <p className="text-sm text-slate-400">Consultez, optimisez et téléchargez vos dossiers de candidature entièrement personnalisés.</p>
                  </div>

                  {/* Tableau des candidatures déjà envoyées / soumises */}
                  {applications.filter(a => a.status === "submitted").length > 0 && (
                    <div className={`p-5 rounded-2xl border ${darkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"} space-y-4`}>
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800/60 pb-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                          <h3 className="font-display font-semibold text-sm">Candidatures Envoyées &amp; Suivi de Candidat</h3>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleDownloadCSV}
                            className="inline-flex items-center gap-1.5 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 px-3 py-1.5 rounded-xl transition-all cursor-pointer font-sans"
                            title="Télécharger la liste complète sous forme de tableau Excel/CSV"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Télécharger en CSV (Excel)</span>
                          </button>
                          <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded font-bold uppercase">
                            {applications.filter(a => a.status === "submitted").length} Dossiers Soumis
                          </span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead>
                            <tr className="border-b border-slate-805/40 pb-1 text-slate-400 uppercase font-mono text-[9px] tracking-wider">
                              <th className="py-2 px-2">Entreprise</th>
                              <th className="py-2 px-2">Poste de Recrutement</th>
                              <th className="py-2 px-2">Plateforme Source</th>
                              <th className="py-2 px-2 text-center">Score de Densité ATS</th>
                              <th className="py-2 px-2">Date de Soumission</th>
                              <th className="py-2 px-2 text-right">Statut du Dossier</th>
                            </tr>
                          </thead>
                          <tbody>
                            {applications.filter(a => a.status === "submitted").map((app) => {
                              const job = jobs.find(j => j.id === app.jobId);
                              return (
                                <tr key={app.id} className={`border-b transition-colors ${darkMode ? "border-slate-800/30 hover:bg-slate-900/10" : "border-slate-200 hover:bg-slate-50"}`}>
                                  <td className={`py-2.5 px-2 font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>{job?.company || "Wafasalaf"}</td>
                                  <td className={`py-2.5 px-2 font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{job?.title || "Ingénieur Logiciel"}</td>
                                  <td className={`py-2.5 px-2 font-mono text-[10px] ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{job?.sourceBoard || "LinkedIn"}</td>
                                  <td className="py-2.5 px-2 text-center font-mono">
                                    <span className="bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded border border-emerald-500/20">{app.atsScore}%</span>
                                  </td>
                                  <td className={`py-2.5 px-2 font-mono text-[10px] ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                                    {app.submittedAt ? new Date(app.submittedAt).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short', year: 'numeric'}) : "Récemment"}
                                  </td>
                                  <td className="py-2.5 px-2 text-right">
                                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-mono text-[9px] font-bold uppercase tracking-wider">
                                      Envoyée avec succès
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {applications.length === 0 ? (
                    <div className={`text-center py-20 rounded-xl space-y-4 border ${darkMode ? "bg-slate-900/10 border-slate-800" : "bg-slate-50 border-slate-200 shadow-inner"}`}>
                      <FileCheck className="w-12 h-12 text-slate-400 mx-auto opacity-40" />
                      <div>
                        <h4 className={`font-bold ${darkMode ? "text-slate-100" : "text-slate-800"}`}>Aucune candidature générée pour le moment</h4>
                        <p className={`text-xs mt-1 max-w-md mx-auto ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                          Allez sur l'onglet Recherche d'Offres, sélectionnez le poste de votre choix et cliquez sur &quot;Générer la Candidature&quot; pour utiliser les modèles d'adaptation de Gemini.
                        </p>
                      </div>
                      <button 
                        onClick={() => setActiveTab("jobs")}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-500 font-semibold text-xs rounded-lg transition-all cursor-pointer text-white"
                      >
                        Explorer les Postes Offerts
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      
                      {/* Left Side: Draft list column */}
                      <div className="lg:col-span-1 space-y-3">
                        {applications.map((app) => {
                          const job = jobs.find(j => j.id === app.jobId);
                          const isSelected = selectedApp?.id === app.id;
                          return (
                            <div
                              key={app.id}
                              onClick={() => setSelectedApp(app)}
                              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                                isSelected 
                                  ? "bg-orange-600/10 border-orange-500/80 shadow-md shadow-orange-500/5" 
                                  : darkMode 
                                  ? "bg-slate-900/40 border-slate-800 hover:border-slate-705" 
                                  : "bg-white border-slate-200 hover:border-orange-300 shadow-sm"
                              }`}
                            >
                              <div className="flex justify-between items-center text-[10px] font-mono mb-1.5">
                                <span className={`uppercase ${darkMode ? "text-slate-400" : "text-slate-500"}`}>{job?.company || "Entreprise"}</span>
                                <span className={`px-2 py-0.5 rounded font-bold capitalize ${
                                  app.status === "submitting" || app.status === "submitted" 
                                    ? (darkMode ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-50 text-emerald-700") 
                                    : (darkMode ? "bg-amber-400/20 text-amber-500" : "bg-amber-50 text-amber-800")
                                }`}>
                                  {app.status === "submitted" ? "Soumise" : "Brouillon"}
                                </span>
                              </div>
                              <h4 className={`font-bold text-xs uppercase tracking-tight truncate ${darkMode ? "text-slate-100" : "text-slate-800"}`}>{job?.title || "Poste Ajusté"}</h4>
                              
                              {/* ATS indicator */}
                              <div className={`flex items-center justify-between mt-3 pt-2.5 border-t text-xs font-mono ${darkMode ? "border-slate-800/60" : "border-slate-200"}`}>
                                <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Score ATS :</span>
                                <strong className={`font-bold ${darkMode ? "text-emerald-400" : "text-emerald-700"}`}>{app.atsScore}%</strong>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Right Side: Detailed critique and Markdown text panel */}
                      <div className="lg:col-span-2">
                        {selectedApp ? (
                          <div className={`p-6 rounded-2xl border ${darkMode ? "bg-slate-900/30 border-slate-800" : "bg-white border-slate-200 shadow-sm"} space-y-6`}>
                            
                            {/* App header actions */}
                            <div className={`flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 border-b ${darkMode ? "border-slate-800/60" : "border-slate-200"}`}>
                              <div>
                                <span className={`text-xs font-mono uppercase ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Dossier de Candidature ID : {selectedApp.id}</span>
                                <h3 className="font-display font-bold text-lg text-orange-400">
                                  {jobs.find(j => j.id === selectedApp.jobId)?.title} @ {jobs.find(j => j.id === selectedApp.jobId)?.company}
                                </h3>
                                <p className={`text-xs mt-0.5 font-mono ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Ajustement multi-agents : {selectedApp.iterationCount} itérations d'audit</p>
                              </div>

                              <div className="flex gap-2 w-full sm:w-auto">
                                {selectedApp.status === "draft" ? (
                                  <>
                                    <button
                                      onClick={() => {
                                        const email = prompt("Enter the recipient's email address (HR / Hiring Manager):");
                                        if (email && email.includes("@")) {
                                          handleSendApplicationEmail(selectedApp.id, email);
                                        } else if (email) {
                                          alert("Please enter a valid email address.");
                                        }
                                      }}
                                      className="px-4 py-2 bg-orange-600 hover:bg-orange-500 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer text-white"
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                      <span>Send Application</span>
                                    </button>
                                  </>
                                ) : (
                                  <span className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                                    <CheckCircle className="w-4 h-4" /> Sent Successfully
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Critique metrics widget */}
                            <div className={`p-4 rounded-xl border ${darkMode ? "bg-slate-950/40 border-slate-800/40" : "bg-slate-50 border-slate-200 shadow-inner"} space-y-4`}>
                              <div className={`flex justify-between items-center text-xs font-mono border-b pb-2 ${darkMode ? "border-slate-800/40" : "border-slate-200"}`}>
                                <span className={`uppercase font-bold flex items-center gap-1 ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                                  <Award className="w-4 h-4 text-emerald-400" /> Rapport d'Audit par l'Agent d'Évaluation
                                </span>
                                <span className={darkMode ? "text-amber-400 font-bold" : "text-amber-700 font-bold"}>Score de Densité ATS : {selectedApp.atsScore}/100</span>
                              </div>

                              <div className="space-y-2">
                                <p className={`text-xs leading-relaxed ${darkMode ? "text-slate-300" : "text-slate-700"}`}><strong className={darkMode ? "text-slate-400" : "text-slate-600"}>Commentaires Généraux :</strong> {selectedApp.critiqueNotes.feedback}</p>
                                <p className={`text-xs ${darkMode ? "text-slate-300" : "text-slate-700"}`}><strong className={darkMode ? "text-slate-400" : "text-slate-600"}>Avis sur la Tonalité :</strong> {selectedApp.critiqueNotes.toneReview}</p>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-[11px] font-mono">
                                <div>
                                  <span className={`block uppercase text-[10px] mb-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Mots-clés Validés :</span>
                                  <div className="flex flex-wrap gap-1">
                                    {selectedApp.critiqueNotes.matchedKeywords?.map((kw, i) => (
                                      <span key={i} className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded text-[10px]">
                                        {kw}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <span className={`block uppercase text-[10px] mb-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Mots-clés Absents à Ajouter :</span>
                                  <div className="flex flex-wrap gap-1">
                                    {selectedApp.critiqueNotes.missingKeywords?.length > 0 ? (
                                      selectedApp.critiqueNotes.missingKeywords.map((kw, i) => (
                                        <span key={i} className="bg-orange-500/15 border border-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded text-[10px]">
                                          {kw}
                                        </span>
                                      ))
                                    ) : (
                                      <span className="text-emerald-400 text-[10px]">Aucun ! Densité de mots-clés parfaite.</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Visual Display Switcher */}
                            <div className={`flex justify-between items-center border-b pb-2 ${darkMode ? "border-slate-800" : "border-slate-200"}`}>
                              <span className={`text-xs font-mono uppercase ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Format des livrables</span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setAppViewMode("text")}
                                  className={`text-[10px] px-2.5 py-1 rounded-lg font-bold font-mono transition-all cursor-pointer ${
                                    appViewMode === "text" 
                                      ? "bg-orange-600 text-white shadow" 
                                      : darkMode 
                                      ? "bg-slate-800 text-slate-400 hover:text-slate-200" 
                                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                  }`}
                                >
                                  Code Brut Markdown / Texte
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAppViewMode("pdf")}
                                  className={`text-[10px] px-2.5 py-1 rounded-lg font-bold font-mono transition-all cursor-pointer ${
                                    appViewMode === "pdf" 
                                      ? "bg-orange-600 text-white shadow" 
                                      : darkMode 
                                      ? "bg-slate-800 text-slate-400 hover:text-slate-200" 
                                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                  }`}
                                >
                                  Aperçu PDF du CV
                                </button>
                              </div>
                            </div>

                            {appViewMode === "pdf" ? (
                              <div className="space-y-6">
                                <PDFPreview 
                                  markdownText={selectedApp.resumeText} 
                                  title={`CV_Ajuste_${jobs.find(j => j.id === selectedApp.jobId)?.company || "Export"}`} 
                                  jobTitle={jobs.find(j => j.id === selectedApp.jobId)?.title}
                                  companyName={jobs.find(j => j.id === selectedApp.jobId)?.company}
                                />
                                
                                <div className="space-y-2">
                                  <span className={`text-xs font-mono uppercase flex items-center gap-1.5 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                    <FileText className="w-3.5 h-3.5 text-amber-400" /> Cover Letter — Full Text
                                  </span>
                                  <div className={`p-4 rounded-xl border max-h-[600px] overflow-y-auto text-xs font-mono leading-relaxed ${darkMode ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200 shadow-inner"}`}>
                                    <pre className={`whitespace-pre-wrap text-[11px] font-sans ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{selectedApp.coverLetterText}</pre>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              /* Tailored Resumes / Cover Letters rendered */
                              <div className="space-y-6">
                                <div className="space-y-2">
                                  <span className={`text-xs font-mono uppercase flex items-center gap-1.5 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                    <FileText className="w-3.5 h-3.5 text-orange-400" /> Tailored Resume — Full Text
                                  </span>
                                  <div className={`p-4 rounded-xl border max-h-[800px] overflow-y-auto text-xs font-mono leading-relaxed ${darkMode ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200 shadow-inner"}`}>
                                    <pre className={`whitespace-pre-wrap text-[11px] font-sans ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{selectedApp.resumeText}</pre>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <span className={`text-xs font-mono uppercase flex items-center gap-1.5 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                                    <FileText className="w-3.5 h-3.5 text-amber-400" /> Cover Letter — Full Text
                                  </span>
                                  <div className={`p-4 rounded-xl border max-h-[600px] overflow-y-auto text-xs font-mono leading-relaxed ${darkMode ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200 shadow-inner"}`}>
                                    <pre className={`whitespace-pre-wrap text-[11px] font-sans ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{selectedApp.coverLetterText}</pre>
                                  </div>
                                </div>
                              </div>
                            )}

                          </div>
                        ) : (
                          <div className={`text-center py-20 text-sm font-mono ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                            Sélectionnez un ajustement à gauche pour voir son rapport d'évaluation IA et les pièces à exporter.
                          </div>
                        )}
                      </div>

                    </div>
                  )}

                </div>
              )}

              {/* TAB 5: PORTFOLIO MINING & UPSKILL */}
              {activeTab === "expand" && (
                <div className="space-y-6">
                  
                  {/* Title */}
                  <div className={`border-b pb-4 ${darkMode ? "border-slate-800" : "border-slate-200"}`}>
                    <h2 className="font-display font-bold text-2xl">Portefeuille &amp; Montée en Compétences</h2>
                    <p className={`text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Détectez vos projets à forte valeur ajoutée sur GitHub et concevez des modules de formation pour vos rôles cibles.</p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* Section 1: Git mining agent */}
                    <div className={`p-6 rounded-xl border ${darkMode ? "bg-slate-900/30 border-slate-800" : "bg-white border-slate-200 shadow-sm"} space-y-4`}>
                      <div className={`flex items-center gap-2 border-b pb-3 ${darkMode ? "border-slate-800" : "border-slate-200"}`}>
                        <Github className="w-5 h-5 text-orange-400" />
                        <h3 className={`font-display font-semibold text-base ${darkMode ? "text-slate-100" : "text-slate-800"}`}>Analyseur de Dépôt de Code</h3>
                      </div>
                      <p className={`text-xs leading-relaxed ${darkMode ? "text-slate-400" : "text-slate-650 text-slate-600"}`}>
                        L'Agent de Portefeuille parcourt vos dépôts connectés, identifie les frameworks, package.json et variables complexes pour en extraire des descriptions professionnelles à valoriser.
                      </p>

                      <form onSubmit={handlePortfolioScan} className="space-y-3 pt-2">
                        <div>
                          <label className={`block text-[10px] uppercase font-mono mb-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>URL GitHub du Développeur</label>
                          <input 
                            type="text" 
                            required
                            placeholder="https://github.com/yasmine-elamrani"
                            value={gitUrl}
                            onChange={(e) => setGitUrl(e.target.value)}
                            className={`w-full p-2 rounded-lg border text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none ${darkMode ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                          />
                        </div>

                        <div>
                          <label className={`block text-[10px] uppercase font-mono mb-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>URL de Portfolio Personnel (optionnel)</label>
                          <input 
                            type="text" 
                            placeholder="https://yasmine-elamrani.ma"
                            value={portfolioUrl}
                            onChange={(e) => setPortfolioUrl(e.target.value)}
                            className={`w-full p-2 rounded-lg border text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none ${darkMode ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={isMining}
                          className="w-full py-2.5 bg-orange-600 hover:bg-orange-500 text-white font-medium text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          {isMining ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                          <span>Lancer l'Analyse du Portefeuille</span>
                        </button>
                      </form>

                      {miningResult && (
                        <div className={`space-y-4 pt-3 border-t text-xs ${darkMode ? "border-slate-800/60" : "border-slate-200"}`}>
                          <div>
                            <span className="block text-[10px] uppercase font-mono text-emerald-400 font-bold mb-1">Projets suggérés à ajouter au CV :</span>
                            <div className="space-y-2">
                              {miningResult.suggestedProjects?.map((proj: any, idx: number) => (
                                <div key={idx} className={`p-3 rounded-lg border ${darkMode ? "bg-slate-950/50 border-slate-800/40" : "bg-slate-50 border-slate-200"}`}>
                                  <strong className={darkMode ? "text-slate-200" : "text-slate-800"}>{proj.name}</strong>
                                  <p className={`text-[11px] mt-0.5 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>{proj.description}</p>
                                  <div className="flex gap-1.5 mt-1.5">
                                    {proj.tech?.map((t: string, i: number) => (
                                      <span key={i} className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${darkMode ? "bg-slate-800 text-orange-300 border-slate-700" : "bg-slate-100 text-orange-700 border-slate-200"}`}>{t}</span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <span className="block text-[10px] uppercase font-mono text-amber-400 font-bold mb-1">Technologies détectées manquantes du CV :</span>
                            <div className="flex flex-wrap gap-1">
                              {miningResult.missingSkills?.map((sk: string, idx: number) => (
                                <span key={idx} className={`px-2 py-0.5 rounded text-[10px] font-mono border ${darkMode ? "bg-slate-800/60 border-slate-700/60 text-slate-300" : "bg-slate-100 border-slate-200 text-slate-700"}`}>
                                  {sk}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div>
                            <span className={`block text-[10px] uppercase font-mono mb-1 ${darkMode ? "text-slate-400" : "text-slate-555 text-slate-600"}`}>Suggestions de mise en page du portfolio :</span>
                            <ul className={`list-disc pl-4 space-y-1 text-[11px] ${darkMode ? "text-slate-400" : "text-slate-650 text-slate-600"}`}>
                              {miningResult.layoutSuggestions?.map((lay: string, idx: number) => (
                                <li key={idx}>{lay}</li>
                              ))}
                            </ul>
                          </div>

                        </div>
                      )}
                    </div>
                           {/* Section 2: Career upskill roadmapping agent */}
                    <div className={`p-6 rounded-xl border ${darkMode ? "bg-slate-900/30 border-slate-800" : "bg-white border-slate-200 shadow-sm"} space-y-4`}>
                      <div className={`flex items-center gap-2 border-b pb-3 ${darkMode ? "border-slate-800" : "border-slate-200"}`}>
                        <Award className="w-5 h-5 text-orange-400" />
                        <h3 className={`font-display font-semibold text-base ${darkMode ? "text-slate-100" : "text-slate-800"}`}>Moteur de Formation Personnalisé</h3>
                      </div>
                      <p className={`text-xs leading-relaxed ${darkMode ? "text-slate-400" : "text-slate-650 text-slate-600"}`}>
                        Saisissez un poste ciblé. L'Agent de Formation comparera votre profil aux prérequis réels du marché marocain pour vous dresser une feuille de route d'apprentissage sur-mesure.
                      </p>

                      <form onSubmit={handleUpskillPlan} className="space-y-3 pt-2">
                        <div>
                          <label className={`block text-[10px] uppercase font-mono mb-1 ${darkMode ? "text-slate-400" : "text-slate-650 text-slate-600"}`}>Saisir le Poste de Vos Rêves</label>
                          <input 
                            type="text" 
                            required
                            value={customRoleGoal}
                            onChange={(e) => setCustomRoleGoal(e.target.value)}
                            className={`w-full p-2 rounded-lg border text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none ${darkMode ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"}`}
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={isUpskilling}
                          className="w-full py-2.5 bg-orange-600 hover:bg-slate-800 hover:text-white text-white border border-transparent font-medium text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          {isUpskilling ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
                          <span>Générer la Feuille de Route d'Apprentissage</span>
                        </button>
                      </form>

                      {roadmapResult && (
                        <div className={`space-y-4 pt-4 border-t text-xs ${darkMode ? "border-slate-800/60" : "border-slate-200"}`}>
                          
                          <div className={`p-3 rounded-lg border ${darkMode ? "bg-orange-950/20 border-orange-950/60" : "bg-orange-50/50 border-orange-100 shadow-inner"}`}>
                            <span className={`block text-[10px] uppercase font-mono mb-1 font-bold ${darkMode ? "text-orange-400" : "text-orange-600"}`}>Rapport d'analyse d'écarts de compétences :</span>
                            <p className={`text-[11px] leading-relaxed ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{roadmapResult.gapReport}</p>
                          </div>

                          <div>
                            <span className={`block text-[10px] uppercase font-mono mb-2 font-bold p-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Plan hebdomadaire de formation recommandé :</span>
                            
                            <div className="space-y-3">
                              {roadmapResult.learningRoadmap?.map((item: any, idx: number) => (
                                <div key={idx} className="border-l-2 border-orange-500 pl-3 space-y-1">
                                  <div className="flex justify-between items-center text-[11px]">
                                    <strong className={darkMode ? "text-slate-200" : "text-slate-800"}>Semaine {idx + 1} : {item.focus}</strong>
                                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${darkMode ? "text-orange-300 bg-orange-500/10 border border-orange-500/20" : "text-orange-600 bg-orange-50 shadow-sm border border-orange-100"}`}>{item.estimatedHours} Heures</span>
                                  </div>
                                  <p className={`text-[11px] ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Projet d'application : {item.projectIdea}</p>
                                  <div className={`text-[10px] font-mono ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                                    Ressources de formation : {item.resources?.join(', ')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Suggested Courses / Suggestion de formations */}
                          <div className={`pt-4 border-t ${darkMode ? "border-slate-800/60" : "border-slate-200"}`}>
                            <span className={`block text-[10px] uppercase font-mono mb-3 font-bold p-1 ${darkMode ? "text-amber-400" : "text-amber-700 font-bold"}`}>Formations & Cours Recommandés :</span>
                            <div className="space-y-3">
                              {(roadmapResult.suggestedCourses || [
                                {
                                  title: `Spécialisation Architecte Cloud / Next.js Avancé pour ${customRoleGoal || 'Lead Developer'}`,
                                  platform: "Coursera / OpenClassrooms",
                                  duration: "24 heures d'apprentissage",
                                  difficulty: "Avancé",
                                  description: "Idéal pour maîtriser le Server Side Rendering (SSR), les micro-frontends et le déploiement sur infrastructures Cloud robustes.",
                                  url: "https://www.coursera.org"
                                },
                                {
                                  title: "Docker & Kubernetes de A à Z : Déployez comme un Pro",
                                  platform: "Udemy Maroc (Français)",
                                  duration: "18 heures d'apprentissage",
                                  difficulty: "Intermédiaire",
                                  description: "Comprenez l'orchestration de conteneurs, les pipelines CI/CD de bout-en-bout avec GitHub Actions et la sécurité active des conteneurs.",
                                  url: "https://www.udemy.com"
                                }
                              ]).map((course: any, cIdx: number) => (
                                <div 
                                  key={cIdx} 
                                  className={`p-3.5 rounded-xl border flex flex-col justify-between hover:scale-[1.01] transition-all ${
                                    darkMode 
                                      ? "bg-slate-950/40 border-slate-800/80 hover:border-slate-700" 
                                      : "bg-orange-50/15 border-slate-200 hover:border-orange-300 shadow-sm"
                                  }`}
                                >
                                  <div>
                                    <div className="flex justify-between items-start gap-2 mb-1.5">
                                      <h4 className={`font-bold text-xs ${darkMode ? "text-orange-300 hover:text-orange-200" : "text-orange-600 hover:text-orange-800"}`}>{course.title}</h4>
                                      <span className={`shrink-0 text-[9px] px-2 py-0.5 rounded-full font-mono font-black border ${darkMode ? "bg-orange-500/10 text-orange-400 border-orange-500/20" : "bg-orange-100/50 text-orange-700 border-orange-200"}`}>
                                        {course.platform || course.provider}
                                      </span>
                                    </div>
                                    <p className={`text-[11px] leading-normal ${darkMode ? "text-slate-400" : "text-slate-600"}`}>{course.description}</p>
                                  </div>
                                  <div className={`flex justify-between items-center mt-3 pt-2.5 border-t text-[10px] font-mono ${darkMode ? "border-slate-800/30 text-slate-400" : "border-slate-200 text-slate-500"}`}>
                                    <span>Niveau : <strong className={darkMode ? "text-amber-400" : "text-amber-700 font-bold"}>{course.difficulty}</strong></span>
                                    <span>Durée : <strong className={darkMode ? "text-slate-300" : "text-slate-700"}>{course.duration}</strong></span>
                                  </div>
                                  {course.url && (
                                    <div className="mt-2 text-right">
                                      <a 
                                        href={course.url} 
                                        target="_blank" 
                                        referrerPolicy="no-referrer"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-[10px] bg-orange-500/15 text-orange-300 border border-orange-500/20 hover:bg-orange-600 hover:text-white px-3 py-1 rounded transition-all cursor-pointer font-sans"
                                      >
                                        <span>Consulter le Cours</span>
                                        <ExternalLink className="w-2.5 h-2.5 animate-pulse" />
                                      </a>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                        </div>
                      )}

                    </div>

                  </div>

                </div>
              )}

              {/* TAB 6: OBSERVABILITY TERMINAL LOGS */}
              {activeTab === "observability" && (
                <div className="space-y-6">
                  
                  {/* Title */}
                  <div className={`border-b pb-4 flex justify-between items-center ${darkMode ? "border-slate-800" : "border-slate-200"}`}>
                    <div>
                      <h2 className="font-display font-bold text-2xl">Observabilité &amp; Traces de l'Agent IA</h2>
                      <p className={`text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Journaux d'audit transparents des exécutions de l'IA (jetons Gemini et coûts d'infrastructure).</p>
                    </div>
                    <button 
                      onClick={refreshTelemetry}
                      className={`p-2 border rounded-xl hover:text-white cursor-pointer ${darkMode ? "bg-slate-900 border-slate-800 text-orange-400 hover:bg-slate-800" : "bg-white border-slate-200 text-orange-600 hover:bg-orange-50"}`}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Operational Logs Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    {/* Runs Trace list */}
                    <div className="lg:col-span-1 space-y-3 max-h-[500px] overflow-y-auto pr-1">
                      {agentRuns.map((run) => (
                        <div
                          key={run.id}
                          onClick={() => setSelectedRun(run)}
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                            selectedRun?.id === run.id 
                              ? "bg-orange-500/10 border-orange-500/85" 
                              : darkMode 
                              ? "bg-slate-900/30 border-slate-800 hover:border-slate-700" 
                              : "bg-white border-slate-200 hover:border-orange-200 shadow-sm"
                          }`}
                        >
                          <div className="flex justify-between items-center text-[10px] font-mono mb-1.5">
                            <span className={`uppercase tracking-tight font-bold ${darkMode ? "text-slate-400" : "text-slate-600"}`}>{run.agentName}</span>
                            <span className={run.status === "success" ? "text-emerald-400 font-bold" : "text-orange-400 font-bold"}>
                               {run.status === "success" ? "SUCCÈS" : "ÉCHEC"}
                            </span>
                          </div>
                          
                          <div className={`flex justify-between items-center text-xs mt-3 font-mono ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                            <span>ID : {run.id}</span>
                            <span>${run.costUsd?.toFixed(5)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Node trace detailed specifications */}
                    <div className="lg:col-span-2">
                      {selectedRun ? (
                        <div className={`p-6 rounded-2xl border ${darkMode ? "bg-slate-900/30 border-slate-800" : "bg-white border-slate-200 shadow-sm"} space-y-5`}>
                          
                          <div className={`border-b pb-4 flex justify-between items-center ${darkMode ? "border-slate-800/40" : "border-slate-200"}`}>
                            <div>
                              <span className="text-[10px] uppercase font-mono text-orange-400 block pb-0.5">Détail du Nœud d'Exécution</span>
                              <h3 className={`font-display font-bold text-lg ${darkMode ? "text-slate-100" : "text-slate-800"}`}>{selectedRun.agentName} ({selectedRun.id})</h3>
                            </div>
                            <span className={`text-xs uppercase font-mono px-3 py-1 rounded-full font-bold ${
                              selectedRun.status === "success" ? "bg-emerald-500/20 text-emerald-400" : "bg-orange-500/20 text-orange-400"
                            }`}>
                              {selectedRun.status === "success" ? "Succès" : "Échec"}
                            </span>
                          </div>

                          <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono p-3 rounded-lg border ${darkMode ? "bg-slate-950/40 border-slate-800/40" : "bg-slate-50 border-slate-200 shadow-inner"}`}>
                            <div>
                              <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Jetons Gemini :</span>
                              <div className={`mt-0.5 font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>{selectedRun.tokensUsed || 500}</div>
                            </div>
                            <div>
                              <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Coût Estimé (USD) :</span>
                              <div className={`mt-0.5 font-bold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>${selectedRun.costUsd}</div>
                            </div>
                            <div>
                              <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Heure de Lancement :</span>
                              <div className={`mt-0.5 text-[10px] ${darkMode ? "text-slate-200" : "text-slate-700"}`} title={selectedRun.startedAt}>
                                {selectedRun.startedAt?.split("T")[1]?.substring(0, 8)}
                              </div>
                            </div>
                            <div>
                              <span className={darkMode ? "text-slate-400" : "text-slate-500"}>Type de Tâche :</span>
                              <div className={`mt-0.5 text-[10px] ${darkMode ? "text-slate-200" : "text-slate-700"}`}>Traitement IA Pipeline</div>
                            </div>
                          </div>

                          {/* Raw logs output */}
                          <div className="space-y-4 text-xs font-mono">
                            <div>
                              <span className={`block uppercase text-[10px] mb-1 ${darkMode ? "text-slate-400" : "text-slate-650 text-slate-600"}`}>Payload du Contexte d'Entrée (Input) :</span>
                              <textarea
                                readOnly
                                rows={5}
                                value={typeof selectedRun.inputData === 'object' ? JSON.stringify(selectedRun.inputData, null, 2) : selectedRun.inputData}
                                className={`w-full p-2.5 rounded border text-[11px] leading-relaxed select-all font-mono ${darkMode ? "border-slate-800 bg-slate-950/60 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"}`}
                              ></textarea>
                            </div>

                            <div>
                              <span className="block text-emerald-400 uppercase text-[10px] mb-1">Payload de la Structure de Sortie (Output) :</span>
                              <textarea
                                readOnly
                                rows={10}
                                value={typeof selectedRun.outputData === 'object' ? JSON.stringify(selectedRun.outputData, null, 2) : selectedRun.outputData}
                                className={`w-full p-2.5 rounded border text-[11px] leading-relaxed select-all font-mono ${darkMode ? "border-slate-800 bg-slate-950/60 text-emerald-400" : "border-slate-200 bg-slate-50 text-emerald-700"}`}
                              ></textarea>
                            </div>
                          </div>

                        </div>
                      ) : (
                        <div className={`text-center py-20 text-sm font-mono ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                          Sélectionnez une trace d'exécution pour voir ses données de télémétrie détaillées.
                        </div>
                      )}
                    </div>

                  </div>

                </div>
              )}

            </>
          )}

        </section>

      </main>

      {/* Footer copyright */}
      <footer className={`border-t py-6 mt-12 text-xs font-mono text-center ${darkMode ? "bg-slate-950/80 border-slate-800 text-slate-300" : "bg-slate-100 border-slate-200 text-slate-500"}`}>
        <p>Job Hunt AI — AI-Powered Job Search Platform built with @google/genai &amp; Tailwind CSS.</p>
      </footer>

      {/* 4. MODAL DE RECONCILIATION ET CORRECTION DU PROFIL */}
      {showValidationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-2xl rounded-2xl border p-6 space-y-6 shadow-2xl transition-all ${
            darkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-850"
          }`}>
            {/* Header */}
            <div className="flex items-start justify-between border-b pb-4 border-slate-800/20">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-orange-500 shrink-0" />
                <div>
                  <h3 className={`font-display font-bold text-lg ${darkMode ? "text-slate-100" : "text-slate-900"}`}>Validation &amp; Réconciliation des Données</h3>
                  <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Des incohérences ont été détectées entre vos données de profil et votre CV brut.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowValidationModal(false)}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${darkMode ? "hover:bg-slate-800 text-slate-400 hover:text-slate-200" : "hover:bg-slate-100 text-slate-500 hover:text-slate-800"}`}
              >
                ✕
              </button>
            </div>

            {/* Warnings Alert Boxes */}
            <div className="space-y-2">
              <span className={`block text-[10px] uppercase font-mono font-bold tracking-wider ${darkMode ? "text-orange-400" : "text-orange-600"}`}>Alertes de Cohérence</span>
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {validationErrors.map((error, idx) => (
                  <div key={idx} className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 leading-relaxed ${
                    darkMode 
                      ? "bg-amber-950/20 border-amber-900/40 text-amber-300" 
                      : "bg-amber-50 border-amber-200 text-amber-800"
                  }`}>
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Form Fields for Instant Correction */}
            <div className="space-y-4">
              <span className={`block text-[10px] uppercase font-mono font-bold tracking-wider ${darkMode ? "text-orange-400" : "text-orange-600"}`}>Corriger &amp; Synchroniser le Profil</span>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-[10px] uppercase font-mono mb-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Nom Complet</label>
                  <input
                    type="text"
                    value={tempCandidateName}
                    onChange={(e) => setTempCandidateName(e.target.value)}
                    className={`w-full p-2.5 rounded-lg border text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none ${
                      darkMode ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-[10px] uppercase font-mono mb-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Adresse Email</label>
                  <input
                    type="email"
                    value={tempCandidateEmail}
                    onChange={(e) => setTempCandidateEmail(e.target.value)}
                    className={`w-full p-2.5 rounded-lg border text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none ${
                      darkMode ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-[10px] uppercase font-mono mb-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Téléphone</label>
                  <input
                    type="text"
                    value={tempCandidatePhone}
                    onChange={(e) => setTempCandidatePhone(e.target.value)}
                    className={`w-full p-2.5 rounded-lg border text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none ${
                      darkMode ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-[10px] uppercase font-mono mb-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Ville / Localisation</label>
                  <input
                    type="text"
                    value={tempCandidateLocation}
                    onChange={(e) => setTempCandidateLocation(e.target.value)}
                    className={`w-full p-2.5 rounded-lg border text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none ${
                      darkMode ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-900"
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className={`flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t ${darkMode ? "border-slate-800" : "border-slate-100"}`}>
              <button
                type="button"
                onClick={() => {
                  setShowValidationModal(false);
                  if (validationTargetJobId) {
                    handleInitiateApply(validationTargetJobId);
                  }
                }}
                className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  darkMode 
                    ? "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800" 
                    : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Ignorer et Générer
              </button>

              <button
                type="button"
                onClick={handleSaveAndApply}
                className="px-5 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-orange-600/15 transition-all cursor-pointer"
              >
                Enregistrer &amp; Générer le CV
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
