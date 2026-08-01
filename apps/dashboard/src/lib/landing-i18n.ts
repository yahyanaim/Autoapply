export type LandingLocale = "en" | "ar";

export const LANDING_LOCALE_STORAGE_KEY = "applyai-landing-locale";

const arabicTranslations: Record<string, string> = {
  Technology: "التكنولوجيا",
  Finance: "المالية",
  Design: "التصميم",
  Marketing: "التسويق",
  Engineering: "الهندسة",
  Remote: "عن بُعد",
  Operations: "العمليات",
  Features: "المزايا",
  "How it works": "كيف يعمل",
  "Job matches": "الوظائف المناسبة",
  Pricing: "الأسعار",
  Extension: "الإضافة",
  "Sign in": "تسجيل الدخول",
  "Get started": "ابدأ الآن",
  Close: "إغلاق",
  Menu: "القائمة",
  "Main navigation": "التنقل الرئيسي",
  "ApplyAI home": "الصفحة الرئيسية لـ ApplyAI",
  "Close navigation": "إغلاق قائمة التنقل",
  "Open navigation": "فتح قائمة التنقل",
  "AI-powered applications. Human-approved decisions.":
    "طلبات توظيف مدعومة بالذكاء الاصطناعي. وقرارات يوافق عليها الإنسان.",
  "A Smarter Way To Make Every Application Stronger.":
    "طريقة أذكى لجعل كل طلب توظيف أقوى.",
  "Smarter Way": "طريقة أذكى",
  "ApplyAI understands your experience, explains job fit, creates truthful tailored materials, and keeps your entire application pipeline moving.":
    "يفهم ApplyAI خبرتك، ويشرح مدى ملاءمة الوظيفة، وينشئ مستندات مخصّصة وصادقة، ويحافظ على تقدّم جميع طلباتك.",
  "Search for jobs": "البحث عن وظائف",
  "Describe your ideal role, skill, company, or location":
    "صِف الوظيفة أو المهارة أو الشركة أو الموقع الذي تبحث عنه",
  "Search opportunities": "ابحث عن فرص",
  "Search from your resume": "ابحث انطلاقًا من سيرتك الذاتية",
  "Built for responsible, secure applications":
    "مصمم لطلبات توظيف مسؤولة وآمنة",
  "Human-approved": "بموافقة الإنسان",
  "You review every submission": "تراجع كل طلب قبل إرساله",
  "Truthful by design": "الصدق جزء من التصميم",
  "Unsupported claims are rejected": "تُرفض المعلومات غير المدعومة",
  "Encrypted storage": "تخزين مشفّر",
  "Resume data stays protected": "تبقى بيانات سيرتك الذاتية محمية",
  "Official sources first": "المصادر الرسمية أولًا",
  "Partner APIs, not risky scraping": "واجهات رسمية بدل الاستخراج غير الآمن",
  "One workspace, the complete application":
    "مساحة عمل واحدة لطلب توظيف متكامل",
  "See the whole opportunity. Build your strongest case.":
    "افهم الفرصة كاملة. وقدّم أفضل ما لديك.",
  "Bring search, fit analysis, truthful tailoring, browser assistance, and application tracking into one calm, focused workflow.":
    "اجمع البحث وتحليل الملاءمة والتخصيص الصادق ومساعدة المتصفح وتتبع الطلبات في مسار عمل واحد وواضح.",
  "Application workspace": "مساحة عمل الطلبات",
  "Prepare each application in one focused place":
    "حضّر كل طلب في مكان واحد ومنظّم",
  "Browser extension": "إضافة المتصفح",
  "Capture jobs and autofill with your approval":
    "احفظ الوظائف واملأ النماذج بعد موافقتك",
  "Explainable matching": "مطابقة قابلة للتفسير",
  "See strengths, gaps, and missing keywords":
    "اكتشف نقاط القوة والفجوات والكلمات الناقصة",
  "Resume optimization": "تحسين السيرة الذاتية",
  "Tailor your resume without inventing experience":
    "خصّص سيرتك من دون اختلاق خبرات",
  "Cover letters": "رسائل التقديم",
  "Create specific drafts grounded in your resume":
    "أنشئ مسودات مخصّصة تستند إلى سيرتك",
  "Application tracker": "متابعة الطلبات",
  "Keep every application and next step organized":
    "نظّم كل طلب وخطوته التالية",
  "A professional reviewing an application on her laptop":
    "محترفة تراجع طلب توظيف على حاسوبها المحمول",
  "Two colleagues talking while walking through a modern office":
    "زميلان يتحدثان في مكتب عصري",
  "A professional preparing notes beside a laptop":
    "محترف يحضّر ملاحظات بجانب حاسوب محمول",
  "A professional reviewing a resume and job description on a tablet":
    "محترف يراجع سيرة ذاتية ووصفًا وظيفيًا على جهاز لوحي",
  "Two professionals reviewing interview notes together":
    "محترفان يراجعان ملاحظات مقابلة معًا",
  "A team collaborating around a laptop in a bright office":
    "فريق يتعاون حول حاسوب محمول في مكتب مضيء",
  "Explore the ApplyAI workflow": "اكتشف مسار عمل ApplyAI",
  "From resume to a reviewed submission": "من السيرة الذاتية إلى طلب مُراجع",
  "From your resume to a stronger application.":
    "من سيرتك الذاتية إلى طلب أقوى.",
  "Four connected steps bring your verified experience, job analysis, tailored materials, and final review into one clear flow.":
    "أربع خطوات مترابطة تجمع خبرتك الموثقة وتحليل الوظيفة والمستندات المخصّصة والمراجعة النهائية في مسار واضح.",
  "Build your verified profile": "أنشئ ملفك المهني الموثّق",
  "Upload a PDF or DOCX once. ApplyAI parses your skills, experience, education, projects, certifications, and languages into a reusable profile.":
    "ارفع ملف PDF أو DOCX مرة واحدة. يحوّل ApplyAI مهاراتك وخبراتك وتعليمك ومشاريعك وشهاداتك ولغاتك إلى ملف مهني قابل لإعادة الاستخدام.",
  "Understand the opportunity": "افهم الفرصة",
  "Paste a job or capture it with the extension to get an explainable Application Match Score, missing keywords, and weak-section flags.":
    "ألصق عرض الوظيفة أو احفظه عبر الإضافة لتحصل على درجة ملاءمة قابلة للتفسير، والكلمات الناقصة، والأقسام التي تحتاج إلى تحسين.",
  "Create stronger materials": "أنشئ مستندات أقوى",
  "Optimize your resume and generate a specific cover letter. Fabrication checks flag unsupported titles, dates, skills, or experience for your review.":
    "حسّن سيرتك وأنشئ رسالة تقديم مخصّصة. تكشف فحوصات المصداقية المسميات والتواريخ والمهارات والخبرات غير المدعومة لتراجعها.",
  "Review, apply, and track": "راجع وقدّم وتابع",
  "Use assistive autofill on supported forms, inspect every field, submit the application yourself, and follow every status in one timeline.":
    "استخدم الملء المساعد في النماذج المدعومة، وراجع كل حقل، وأرسل الطلب بنفسك، ثم تابع حالته في خط زمني واحد.",
  "Opportunities worth your attention": "فرص تستحق اهتمامك",
  "Start with a better match.": "ابدأ بوظيفة أنسب لك.",
  "Compare roles against your selected resume before investing time in tailoring and forms.":
    "قارن الوظائف بسيرتك المختارة قبل استثمار وقتك في التخصيص وملء النماذج.",
  "Senior Product Designer": "مصمم منتجات أول",
  "Frontend Engineer": "مهندس واجهات أمامية",
  "Growth Associate": "أخصائي نمو",
  "Paris · Hybrid": "باريس · هجين",
  "Remote · Europe": "عن بُعد · أوروبا",
  "Dublin · Hybrid": "دبلن · هجين",
  "Full-time": "دوام كامل",
  match: "تطابق",
  "Analyze this opportunity": "حلّل هذه الفرصة",
  "Explore more opportunities": "اكتشف فرصًا أخرى",
  "Wall of confidence": "وضوح يمنحك الثقة",
  "Clarity at every part of the application.": "وضوح في كل جزء من طلب التوظيف.",
  "See the next step, understand the reason behind it, and keep the final decision in your hands.":
    "اعرف الخطوة التالية وافهم سببها، مع بقاء القرار النهائي بين يديك.",
  "A professional reviewing an application on a laptop":
    "محترف يراجع طلب توظيف على حاسوب محمول",
  "Candidate view": "واجهة المرشح",
  "Clear before you commit": "وضوح قبل أن تقرر",
  "“I can see what is worth my time before I start rewriting.”":
    "«أعرف ما يستحق وقتي قبل أن أبدأ إعادة الكتابة.»",
  "A calmer, more intentional search.": "بحث أهدأ وأكثر تركيزًا.",
  "ApplyAI guidance": "إرشادات ApplyAI",
  "Just now": "الآن",
  "Clear next step": "خطوة تالية واضحة",
  "I found a role I like. What should I focus on first?":
    "وجدت وظيفة تعجبني. على ماذا أركّز أولًا؟",
  "Your experience is a strong match. Review these three keywords, then tailor the summary using only your verified history.":
    "خبرتك مناسبة جدًا. راجع هذه الكلمات الثلاث، ثم خصّص الملخص باستخدام خبرتك الموثقة فقط.",
  "Understand the why, then choose the action.": "افهم السبب، ثم اختر الإجراء.",
  "Your application, your call": "طلبك وقرارك",
  "Helpful direction, without taking over your story.":
    "توجيه مفيد من دون أن يفقدك التحكم في قصتك.",
  "Explain the match": "اشرح الملاءمة",
  "Review before submitting": "راجع قبل الإرسال",
  "Two professionals reviewing notes together":
    "محترفان يراجعان الملاحظات معًا",
  "Review first": "راجع أولًا",
  "Truthful tailoring": "تخصيص صادق",
  "“Every suggested change stays connected to my real experience.”":
    "«كل تغيير مقترح يبقى مرتبطًا بخبرتي الحقيقية.»",
  "Keep your voice. Strengthen the evidence.": "حافظ على أسلوبك، وقوِّ الأدلة.",
  "Why this role fits": "لماذا تناسبك هذه الوظيفة",
  "See strengths, gaps, and application signals before writing a single line.":
    "شاهد نقاط القوة والفجوات وإشارات الطلب قبل كتابة أي سطر.",
  "Guidance only—employer screening systems and decisions vary.":
    "هذه إرشادات فقط؛ تختلف أنظمة الفرز وقرارات أصحاب العمل.",
  "Your words stay yours": "كلماتك تبقى كلماتك",
  "Improve clarity without adding experience you have not verified.":
    "حسّن الوضوح من دون إضافة خبرات لم توثّقها.",
  "You choose submit": "أنت من يقرر الإرسال",
  "Assistive autofill waits for your final review on every application.":
    "ينتظر الملء المساعد مراجعتك النهائية في كل طلب.",
  "Stop repeating the same": "توقف عن تكرار",
  "application work.": "العمل نفسه في كل طلب.",
  "Compare ApplyAI with the fragmented, repetitive way of applying manually.":
    "قارن ApplyAI بالطريقة اليدوية المتكررة والمشتتة لتقديم الطلبات.",
  "Application workflow": "مسار طلب التوظيف",
  "Career intelligence": "ذكاء مهني",
  "Verified profile": "ملف موثّق",
  "vs rebuilding every application": "بدل إعادة بناء كل طلب",
  Clear: "واضح",
  "Explainable match": "ملاءمة قابلة للتفسير",
  "vs guessing from a job title": "بدل التخمين من المسمى الوظيفي",
  "Invented claims": "معلومات مختلقة",
  "truthful materials by design": "مستندات صادقة بطبيعتها",
  You: "أنت",
  "Choose submit": "تقرر الإرسال",
  "the final action always stays yours": "الإجراء النهائي يبقى لك دائمًا",
  "Profile setup": "إعداد الملف",
  "Upload once and reuse a structured, verified candidate profile.":
    "ارفع بياناتك مرة واحدة وأعد استخدام ملف مرشح منظّم وموثّق.",
  "Re-enter the same experience and contact details on every site.":
    "أعد إدخال الخبرة ومعلومات الاتصال نفسها في كل موقع.",
  "Job fit": "ملاءمة الوظيفة",
  "See a score with strengths, missing keywords, and weaker sections.":
    "شاهد درجة تتضمن نقاط القوة والكلمات الناقصة والأقسام الأضعف.",
  "Read every description and guess whether the role is worth your time.":
    "اقرأ كل وصف وخمّن إن كانت الوظيفة تستحق وقتك.",
  Materials: "المستندات",
  "Tailor your resume and cover letter using only your real experience.":
    "خصّص سيرتك ورسالة التقديم باستخدام خبرتك الحقيقية فقط.",
  "Rewrite everything from scratch or accept generic, unverified output.":
    "أعد كتابة كل شيء من الصفر أو اقبل محتوى عامًا غير موثّق.",
  "Form filling": "ملء النماذج",
  "Autofill supported forms, review every field, and submit yourself.":
    "املأ النماذج المدعومة تلقائيًا، وراجع كل حقل، ثم أرسل بنفسك.",
  "Copy the same information between tabs for every application.":
    "انسخ المعلومات نفسها بين علامات التبويب لكل طلب.",
  "Follow-up": "المتابعة",
  "Keep status, activity, documents, and next steps in one timeline.":
    "اجمع الحالة والنشاط والمستندات والخطوات التالية في خط زمني واحد.",
  "Track progress across inboxes, bookmarks, notes, and spreadsheets.":
    "تابع التقدم بين البريد والإشارات المرجعية والملاحظات والجداول.",
  "Apply with ApplyAI": "قدّم باستخدام ApplyAI",
  "Manual workflow": "المسار اليدوي",
  "Simplify my applications": "بسّط طلباتي",
  "Spend your energy on the opportunity, not on repeating the form.":
    "استثمر طاقتك في الفرصة، لا في تكرار تعبئة النموذج.",
  "Complete product-spec pricing": "خطط واضحة وفق مواصفات المنتج",
  "Choose the support your search needs.": "اختر الدعم الذي يحتاجه بحثك.",
  "Every current limit and every planned AI capability from the ApplyAI product specification is represented below. Planned features stay tucked away until you choose to view them.":
    "ستجد أدناه جميع الحدود الحالية وقدرات الذكاء الاصطناعي المخطط لها في مواصفات ApplyAI. تبقى المزايا القادمة مخفية حتى تختار عرضها.",
  Free: "مجاني",
  Pro: "احترافي",
  Premium: "مميز",
  "Most popular": "الأكثر شعبية",
  "/month": "/شهريًا",
  Included: "المتضمن",
  "More features": "مزايا أكثر",
  Less: "أقل",
  "Features coming": "مزايا قادمة",
  More: "المزيد",
  "Build your verified profile and test CV-matched discovery.":
    "أنشئ ملفك الموثّق وجرّب اكتشاف الوظائف المطابقة لسيرتك.",
  "The complete assistive workflow for an active job search.":
    "مسار مساعد متكامل لبحث نشط عن عمل.",
  "Unlimited capacity plus advanced career intelligence.":
    "سعة غير محدودة مع ذكاء مهني متقدم.",
  "Professional planning a focused job search": "محترف يخطط لبحث وظيفي مركز",
  "Professional reviewing an application": "محترف يراجع طلب توظيف",
  "Professionals preparing for interviews": "محترفون يستعدون للمقابلات",
  "Build your foundation": "ابنِ أساسك",
  "Apply with confidence": "قدّم بثقة",
  "Take the next step": "اتخذ الخطوة التالية",
  "Start free": "ابدأ مجانًا",
  "Choose Pro": "اختر الاحترافي",
  "Choose Premium": "اختر المميز",
  "3 CV-matched discovery runs per month, with up to 20 ranked jobs each":
    "3 عمليات اكتشاف شهريًا مطابقة للسيرة، حتى 20 وظيفة مرتبة لكل عملية",
  "Explainable scores, verified-skill overlap, and keyword gaps":
    "درجات قابلة للتفسير، وتطابق المهارات الموثقة، وفجوات الكلمات المفتاحية",
  "Resume upload and structured PDF/DOCX parsing":
    "رفع السيرة وتحليل ملفات PDF وDOCX إلى بيانات منظّمة",
  "Manual application tracker and timeline": "متابعة يدوية للطلبات وخط زمني",
  "10 tracked applications per month": "متابعة 10 طلبات شهريًا",
  "5 AI requests per month": "5 طلبات ذكاء اصطناعي شهريًا",
  "1 truthful CV optimization per month": "تحسين صادق واحد للسيرة شهريًا",
  "1 stored resume and 5 MB encrypted storage":
    "سيرة واحدة محفوظة و5 ميغابايت تخزين مشفّر",
  "Profile, consent, export, and deletion controls":
    "أدوات التحكم في الملف والموافقة والتصدير والحذف",
  "50 CV-matched discovery runs per month, with up to 20 ranked jobs each":
    "50 عملية اكتشاف شهريًا مطابقة للسيرة، حتى 20 وظيفة مرتبة لكل عملية",
  "Unified job analysis, optimized CV, and cover-letter workflow":
    "مسار موحد لتحليل الوظيفة وتحسين السيرة وإنشاء رسالة التقديم",
  "Chrome extension job capture and approved-package autofill":
    "حفظ الوظائف عبر إضافة Chrome وملء الحزمة المعتمدة",
  "Everything in Free": "كل ما في الخطة المجانية",
  "Approved Greenhouse, Lever, and Ashby job aggregation":
    "تجميع وظائف Greenhouse وLever وAshby المعتمدة",
  "Unlimited truthful resume optimizations with fabrication checks":
    "تحسينات غير محدودة وصادقة للسيرة مع فحوصات منع الاختلاق",
  "Human review, editing, regeneration, and approval controls":
    "أدوات المراجعة والتعديل وإعادة الإنشاء والموافقة البشرية",
  "Unlimited tracked applications": "متابعة عدد غير محدود من الطلبات",
  "500 AI requests per month": "500 طلب ذكاء اصطناعي شهريًا",
  "Up to 5 stored resumes and 25 MB encrypted storage":
    "حتى 5 سير محفوظة و25 ميغابايت تخزين مشفّر",
  "Remote, location, salary, and visa profile preferences":
    "تفضيلات العمل عن بُعد والموقع والراتب والتأشيرة",
  "Application funnel and response analytics · V1":
    "تحليلات مسار الطلبات والردود · الإصدار 1",
  "Email and browser notifications · V1": "إشعارات البريد والمتصفح · الإصدار 1",
  "Additional job-site adapters after ToS and legal review · phased":
    "دعم مواقع وظائف إضافية بعد مراجعة الشروط والجوانب القانونية · تدريجيًا",
  "Everything in Pro": "كل ما في الخطة الاحترافية",
  "Unlimited CV-matched discovery runs":
    "عمليات اكتشاف غير محدودة مطابقة للسيرة",
  "Unlimited AI requests": "طلبات ذكاء اصطناعي غير محدودة",
  "Unlimited stored resumes": "عدد غير محدود من السير المحفوظة",
  "Up to 2 GB encrypted resume storage":
    "حتى 2 غيغابايت لتخزين السير بشكل مشفّر",
  "All shipped ApplyAI application tools": "جميع أدوات ApplyAI المتاحة للتقديم",
  "Interview Coach for behavioral, technical, system-design, and coding practice · V1":
    "مدرب مقابلات سلوكية وتقنية وتصميم أنظمة وبرمجة · الإصدار 1",
  "AI Career Advisor and learning paths · V2":
    "مستشار مهني بالذكاء الاصطناعي ومسارات تعلم · الإصدار 2",
  "Salary prediction · V2": "توقع الراتب · الإصدار 2",
  "AI Recruiter Chat with natural-language filters · V2":
    "محادثة مع مسؤول توظيف ذكي بفلاتر لغوية · الإصدار 2",
  "Voice mock interview mode · V2": "وضع مقابلة صوتية تجريبية · الإصدار 2",
  "Teams, universities, and career services":
    "الفرق والجامعات وخدمات التوجيه المهني",
  "Enterprise capabilities are planned and remain hidden until you choose to inspect them.":
    "قدرات المؤسسات مخطط لها وتبقى مخفية حتى تختار الاطلاع عليها.",
  "Team and organization accounts with seat management":
    "حسابات للفرق والمؤسسات مع إدارة المقاعد",
  "Career-services and university analytics":
    "تحليلات خدمات التوجيه المهني والجامعات",
  "SAML SSO and advanced audit logging":
    "تسجيل دخول موحد SAML وسجلات تدقيق متقدمة",
  "Volume pricing and a SOC 2 Type II readiness path":
    "أسعار حسب الحجم ومسار جاهزية SOC 2 Type II",
  "Companies in your job search": "شركات قد تجدها في بحثك",
  "Keep every opportunity organized, wherever you find it.":
    "نظّم كل فرصة أينما وجدتها.",
  "Companies you can include in your ApplyAI job search":
    "شركات يمكنك تضمينها في بحثك عن الوظائف عبر ApplyAI",
  "A responsible AI workspace for finding, preparing, submitting, and tracking your next opportunity.":
    "مساحة عمل مسؤولة بالذكاء الاصطناعي للعثور على فرصتك التالية وتحضير طلبها وإرساله ومتابعته.",
  "Human-approved by design": "مصمم ليعمل بموافقة الإنسان",
  Product: "المنتج",
  Account: "الحساب",
  Trust: "الثقة",
  "Create account": "إنشاء حساب",
  "Connect extension": "ربط الإضافة",
  Dashboard: "لوحة التحكم",
  Privacy: "الخصوصية",
  Terms: "الشروط",
  "Responsible autofill": "ملء تلقائي مسؤول",
  "Secure resume storage": "تخزين آمن للسيرة",
  "© 2026 ApplyAI. All rights reserved.": "© 2026 ApplyAI. جميع الحقوق محفوظة.",
  "AI support for a clearer, controlled job search.":
    "دعم ذكي لبحث وظيفي أوضح وتحت سيطرتك.",
  Applications: "الطلبات",
  "4 ready to review": "4 جاهزة للمراجعة",
  "Profile completion": "اكتمال الملف",
  "Two details to add": "تفصيلان متبقيان",
  "Average match": "متوسط التطابق",
  "Across saved roles": "عبر الوظائف المحفوظة",
  Replies: "الردود",
  "This week": "هذا الأسبوع",
  Overview: "نظرة عامة",
  Resumes: "السير الذاتية",
  Jobs: "الوظائف",
  "Candidate workspace": "مساحة المرشح",
  Workspace: "مساحة العمل",
  "Saved jobs": "الوظائف المحفوظة",
  Documents: "المستندات",
  Settings: "الإعدادات",
  "Search status": "حالة البحث",
  "Focused and active": "مركّز ونشط",
  "Three roles are ready for your review.": "ثلاث وظائف جاهزة لمراجعتك.",
  "Good morning, Amira.": "صباح الخير يا أميرة.",
  "Here is your live job-search overview.":
    "هذه نظرة مباشرة على بحثك عن وظيفة.",
  "3 applications ready": "3 طلبات جاهزة",
  "Best matches": "أفضل التطابقات",
  "Roles selected for your profile": "وظائف مختارة لملفك",
  "View all": "عرض الكل",
  "Application readiness": "جاهزية الطلب",
  "Your profile is almost ready.": "ملفك شبه جاهز.",
  Resume: "السيرة الذاتية",
  "Role fit": "ملاءمة الوظيفة",
  "Cover letter": "رسالة التقديم",
  "Every suggestion remains grounded in the information you provided.":
    "يبقى كل اقتراح مبنيًا على المعلومات التي قدمتها.",
  "Workspace focus": "محور مساحة العمل",
};

export function translateLanding(locale: LandingLocale, text: string): string {
  if (locale === "en") return text;
  return arabicTranslations[text] ?? text;
}

export function isLandingLocale(value: string | null): value is LandingLocale {
  return value === "en" || value === "ar";
}
