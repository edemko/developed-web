// Translation Service for DevelopED Website
class TranslationService {
    constructor() {
        this.currentLanguage = 'en';
        this.listeners = [];
        this.translations = {
            en: {
                // Page Meta
                'page.title': 'DevelopED - Custom Web Application Development | OpenClaw AI Assistant | Slovakia',
                'page.description': 'Custom web application development for businesses. OpenClaw AI assistant installation and management via Telegram. Fast, affordable IT solutions using AI. Košice, Slovakia.',

                // Navigation
                'nav.home': 'Home',
                'nav.about': 'About',
                'nav.projects': 'Projects',
                'nav.openclaw': 'OpenClaw',
                'nav.contact': 'Contact',

                // Hero Section
                'hero.title': 'Custom Business Applications',
                'hero.subtitle': 'Built with AI & Modern Technology',
                'hero.description': 'Using cutting-edge technologies and artificial intelligence, we create and deliver applications according to your vision much faster and more cost-effectively than traditional development methods.',
                'hero.view_projects': 'View Projects',
                'hero.get_started': 'Get Started',

                // About Section
                'about.title': 'About DevelopED',
                'about.subtitle': 'Modern solutions for modern businesses',
                'about.mission.title': 'Our Mission',
                'about.mission.description': 'We specialize in creating tailored applications for small and middle businesses using the latest technologies including AI-assisted development, cloud databases, and modern hosting solutions. Our approach ensures faster delivery times and more affordable pricing compared to traditional development methods.',
                'about.approach.title': 'Our Approach',
                'about.approach.speed': 'Rapid Development with AI Assistance',
                'about.approach.cost': 'Cost-Effective Solutions',
                'about.approach.tailored': 'Fully Customized Applications',
                'about.approach.cloud': 'Modern Cloud Infrastructure',

                // Stats
                'stats.satisfaction': 'Client Satisfaction',
                'stats.faster': 'Faster Development',
                'stats.savings': 'Cost Savings',

                // Projects Section
                'projects.title': 'Our Projects',
                'projects.subtitle': 'Successful applications we\'ve built for our clients',
                'projects.view_details': 'Coming Soon',
                'projects.visit': 'Visit',
                'projects.business.title': 'My Clinic Portal',
                'projects.business.description': 'Dental clinic management application for tracking income, expenses, employee management, laboratory orders, and comprehensive business analytics. Multi-language support and role-based access control.',
                'projects.business.try_now': 'Try out Now',
                'projects.filament.title': 'Filament Check',
                'projects.filament.description': 'Quality control system for filament production. Enter serial number (starting from 1000 001) to access detailed production data including diameter charts, color sensor data, material type, and other information.',
                'projects.kestrek.title': 'KešTrek',
                'projects.kestrek.description': 'Track your money and get an overview of your expenses with the KešTrek app. Thanks to detailed statistics, nothing will slip through and you can better manage your finances.',
                'projects.3dprinted.title': '3D Print<span class="accent">ED</span>',
                'projects.3dprinted.description': 'A comprehensive platform dedicated to 3D printing enthusiasts. Features an online shop with printing materials and accessories, blog with tips and tutorials, and gallery showcasing creative printed projects.',
                'projects.promile.title': 'Promile Club',
                'projects.promile.description': 'Premium e-commerce platform offering both regular and premium alcohol brands at competitive prices. Features secure payments, user accounts with order tracking, SMS notifications, subscription model, and comprehensive admin tools for managing inventory, orders, and promotional campaigns.',

                // Contact Section
                'contact.title': 'Get In Touch',
                'contact.subtitle': 'Ready to start your project? Let\'s discuss your needs.',
                'contact.info.title': 'Contact Information',
                'contact.form.name': 'Name',
                'contact.form.email': 'Email',
                'contact.form.company': 'Company',
                'contact.form.message': 'Message',
                'contact.form.send': 'Send Message',

                // OpenClaw Section
                'openclaw.title': 'OpenClaw <span class="accent">AI</span>',
                'openclaw.subtitle': 'Your personal AI assistant — always available, always helpful',
                'openclaw.description': 'OpenClaw is an intelligent personal assistant that runs on your own server and communicates via Telegram. Powered by cutting-edge AI models (Google Gemini, Anthropic Claude), it automates tasks, processes information, and helps you stay organized — all while keeping your data private.',
                'openclaw.features.ai.title': 'Advanced AI',
                'openclaw.features.ai.description': 'Uses GPT-4 class models for natural conversations and complex tasks',
                'openclaw.features.privacy.title': 'Privacy First',
                'openclaw.features.privacy.description': 'Your data stays on your server in EU — no third-party cloud',
                'openclaw.features.telegram.title': 'Telegram Integration',
                'openclaw.features.telegram.description': 'Access your assistant from any device via Telegram',
                'openclaw.features.skills.title': 'Extensible Skills',
                'openclaw.features.skills.description': 'Add capabilities like web search, file processing, reminders',
                'openclaw.pricing.title': 'Pricing',
                'openclaw.pricing.basic.title': 'Basic',
                'openclaw.pricing.standard.title': 'Standard',
                'openclaw.pricing.complete.title': 'Complete',
                'openclaw.pricing.onetime': 'one-time',
                'openclaw.pricing.monthly': '/month',
                'openclaw.pricing.popular': 'Popular',
                'openclaw.pricing.basic.f1': 'Server setup & OpenClaw installation',
                'openclaw.pricing.basic.f2': 'Telegram bot configuration',
                'openclaw.pricing.basic.f3': '3 basic skills',
                'openclaw.pricing.basic.f4': '30 days email support',
                'openclaw.pricing.standard.f1': 'Everything in Basic',
                'openclaw.pricing.standard.f2': 'Custom personality setup',
                'openclaw.pricing.standard.f3': '6 skills of your choice',
                'openclaw.pricing.standard.f4': '90 days support (email + Telegram)',
                'openclaw.pricing.standard.f5': '1 free update',
                'openclaw.pricing.complete.f1': 'Everything in Standard',
                'openclaw.pricing.complete.f2': 'Unlimited skills',
                'openclaw.pricing.complete.f3': 'Monthly server management',
                'openclaw.pricing.complete.f4': 'Priority support',
                'openclaw.pricing.complete.f5': 'Monthly usage reports',
                'openclaw.pricing.note': 'Monthly operating costs: €30–65 (Hetzner server + API usage). You control your API accounts — no markup.',
                'openclaw.cta': 'Get Your AI Assistant',

                // Footer
                'footer.description': 'Custom business applications built with modern technology and AI assistance.',
                'footer.services.title': 'Services',
                'footer.services.web': 'Web Applications',
                'footer.services.mobile': 'Mobile Solutions',
                'footer.services.database': 'Database Design',
                'footer.services.hosting': 'Cloud Hosting',
                'footer.technologies.title': 'Technologies',
                'footer.rights': 'All rights reserved.'
            },
            sk: {
                // Page Meta
                'page.title': 'DevelopED - Vývoj webových aplikácií na mieru | OpenClaw AI asistent | Košice',
                'page.description': 'Vývoj webových aplikácií na mieru pre firmy. Inštalácia a správa OpenClaw AI asistenta cez Telegram. Rýchle, cenovo dostupné IT riešenia s využitím AI. Košice, Slovensko.',

                // Navigation
                'nav.home': 'Domov',
                'nav.about': 'O nás',
                'nav.projects': 'Projekty',
                'nav.openclaw': 'OpenClaw',
                'nav.contact': 'Kontakt',

                // Hero Section
                'hero.title': 'Aplikácie na mieru pre firmy',
                'hero.subtitle': 'Vytvorené s AI a modernými technológiami',
                'hero.description': 'Špecializujeme sa na vývoj webových aplikácií a softvéru na mieru pre firmy. S využitím AI a moderných technológií vám doručíme digitálne riešenie podľa vašich predstáv rýchlejšie a cenovo dostupnejšie. Digitalizujte svoju firmu ešte dnes.',
                'hero.view_projects': 'Zobraziť projekty',
                'hero.get_started': 'Začať',

                // About Section
                'about.title': 'O spoločnosti DevelopED',
                'about.subtitle': 'Vývoj softvéru na mieru a AI automatizácia pre slovenské firmy',
                'about.mission.title': 'Naša misia',
                'about.mission.description': 'Špecializujeme sa na vývoj webových aplikácií a softvéru na mieru pre malé a stredné firmy na Slovensku. Využívame AI-asistovaný vývoj, cloudové databázy a moderné hostingové riešenia pre rýchlejšie dodanie a nižšie náklady. Pomáhame firmám s digitalizáciou a automatizáciou — vrátane inštalácie a správy OpenClaw AI asistenta.',
                'about.approach.title': 'Náš prístup',
                'about.approach.speed': 'Rýchly vývoj s asistenciou AI',
                'about.approach.cost': 'Cenovo efektívne riešenia',
                'about.approach.tailored': 'Plne prispôsobené aplikácie',
                'about.approach.cloud': 'Moderná cloudová infraštruktúra',

                // Stats
                'stats.satisfaction': 'Spokojnosť klientov',
                'stats.faster': 'Rýchlejší vývoj',
                'stats.savings': 'Úspora nákladov',

                // Projects Section
                'projects.title': 'Naše projekty',
                'projects.subtitle': 'Úspešné aplikácie, ktoré sme vytvorili pre našich klientov',
                'projects.view_details': 'Už čoskoro',
                'projects.visit': 'Navštíviť',
                'projects.business.title': 'My Clinic Portal',
                'projects.business.description': 'Aplikácia pre správu zubných kliník na sledovanie príjmov, výdavkov, správu zamestnancov, laboratórne objednávky a komplexnú obchodnú analytiku. Podpora viacerých jazykov a riadenie prístupu podľa rolí.',
                'projects.business.try_now': 'Vyskúšať teraz',
                'projects.filament.title': 'Filament Check',
                'projects.filament.description': 'Systém kontroly kvality pre výrobu filamentov. Zadajte sériové číslo (začínajúce od 1000 001) a získajte prístup k detailným výrobným údajom vrátane grafov priemeru, dát farebných senzorov, typu materiálu a iných informácií.',
                'projects.kestrek.title': 'KešTrek',
                'projects.kestrek.description': 'Sledujte cestu vašich peňazí a získajte prehľad o svojich výdavkoch s aplikáciou KešTrek. Vďaka detailným štatistikám vám už nič neujde a vy tak môžete lepšie riadiť svoje financie.',
                'projects.3dprinted.title': '3D Print<span class="accent">ED</span>',
                'projects.3dprinted.description': 'Komplexná platforma venovaná nadšencom 3D tlače. Obsahuje online obchod s tlačovými materiálmi a príslušenstvom, blog s tipmi a návodmi a galériu prezentujúcu kreatívne vytlačené projekty.',
                'projects.promile.title': 'Promile Club',
                'projects.promile.description': 'Prémiová e-commerce platforma ponúkajúca bežné aj prémiové značky alkoholu za skvelé ceny. Obsahuje bezpečné platby, používateľské účty so sledovaním objednávok, SMS notifikácie, predplatné a komplexné admin nástroje pre správu skladu, objednávok a propagačných kampaní.',

                // Contact Section
                'contact.title': 'Kontaktujte nás',
                'contact.subtitle': 'Ste ripravení začať Váš projekt?',
                'contact.info.title': 'Kontaktné informácie',
                'contact.form.name': 'Meno',
                'contact.form.email': 'Email',
                'contact.form.company': 'Spoločnosť',
                'contact.form.message': 'Správa',
                'contact.form.send': 'Odoslať správu',

                // OpenClaw Section
                'openclaw.title': 'OpenClaw <span class="accent">AI</span>',
                'openclaw.subtitle': 'Osobný AI asistent pre firmy cez Telegram — vždy dostupný, vždy nápomocný',
                'openclaw.description': 'OpenClaw je inteligentný osobný AI asistent pre firmy, ktorý beží na vašom vlastnom serveri v EÚ a komunikuje cez Telegram bota. Využíva špičkové AI modely (Google Gemini, Anthropic Claude) na automatizáciu úloh, spracovanie informácií a organizáciu práce — pričom vaše dáta zostávajú súkromné a bezpečné.',
                'openclaw.features.ai.title': 'Pokročilá AI',
                'openclaw.features.ai.description': 'Využíva modely triedy GPT-4 prirodzené konverzácie a komplexné úlohy',
                'openclaw.features.privacy.title': 'Súkromie na prvom mieste',
                'openclaw.features.privacy.description': 'Vaše dáta zostávajú na vašom serveri v EÚ — žiadny tretí cloud',
                'openclaw.features.telegram.title': 'Telegram integrácia',
                'openclaw.features.telegram.description': 'Prístup k asistentovi z akéhokoľvek zariadenia cez Telegram',
                'openclaw.features.skills.title': 'Rozšíriteľné skills',
                'openclaw.features.skills.description': 'Pridajte schopnosti ako vyhľadávanie na webe, spracovanie súborov, pripomienky',
                'openclaw.pricing.title': 'Cenník',
                'openclaw.pricing.basic.title': 'Základný',
                'openclaw.pricing.standard.title': 'Štandard',
                'openclaw.pricing.complete.title': 'Kompletný',
                'openclaw.pricing.onetime': 'jednorazovo',
                'openclaw.pricing.monthly': '/mesiac',
                'openclaw.pricing.popular': 'Obľúbený',
                'openclaw.pricing.basic.f1': 'Nastavenie servera a inštalácia OpenClaw',
                'openclaw.pricing.basic.f2': 'Konfigurácia Telegram bota',
                'openclaw.pricing.basic.f3': '3 základné skills',
                'openclaw.pricing.basic.f4': '30 dní podpora emailom',
                'openclaw.pricing.standard.f1': 'Všetko zo Základného',
                'openclaw.pricing.standard.f2': 'Vlastná konfigurácia osobnosti',
                'openclaw.pricing.standard.f3': '6 skills podľa výberu',
                'openclaw.pricing.standard.f4': '90 dní podpora (email + Telegram)',
                'openclaw.pricing.standard.f5': '1 bezplatná aktualizácia',
                'openclaw.pricing.complete.f1': 'Všetko zo Štandardného',
                'openclaw.pricing.complete.f2': 'Neobmedzené skills',
                'openclaw.pricing.complete.f3': 'Mesačná správa servera',
                'openclaw.pricing.complete.f4': 'Prioritná podpora',
                'openclaw.pricing.complete.f5': 'Mesačné reporty využitia',
                'openclaw.pricing.note': 'Mesačné prevádzkové náklady: 30–65 € (Hetzner server + API). Vy kontrolujete svoje API účty — bez prirážky.',
                'openclaw.cta': 'Získajte svojho AI asistenta',

                // Footer
                'footer.description': 'Vývoj webových aplikácií a softvéru na mieru | OpenClaw AI asistent pre firmy | Košice, Slovensko',
                'footer.services.title': 'Služby',
                'footer.services.web': 'Webové aplikácie',
                'footer.services.mobile': 'Mobilné riešenia',
                'footer.services.database': 'Návrh databáz',
                'footer.services.hosting': 'Cloudový hosting',
                'footer.technologies.title': 'Technológie',
                'footer.rights': 'Všetky práva vyhradené.'
            }
        };
    }

    // Get current language
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    // Set language
    setLanguage(languageCode) {
        if (this.translations[languageCode]) {
            this.currentLanguage = languageCode;
            localStorage.setItem('selectedLanguage', languageCode);
            this.notifyListeners(languageCode);
            this.updatePageTranslations();
            
            // Dispatch custom event for any additional listeners
            window.dispatchEvent(new CustomEvent('languageChanged', {
                detail: { language: languageCode }
            }));
        }
    }

    // Translate a key
    translate(key, params = {}) {
        const translation = this.translations[this.currentLanguage][key] || key;
        
        // Simple parameter replacement
        return translation.replace(/\{\{(\w+)\}\}/g, (match, param) => {
            return params[param] || match;
        });
    }

    // Add listener for language changes
    addListener(callback) {
        this.listeners.push(callback);
    }

    // Remove listener
    removeListener(callback) {
        this.listeners = this.listeners.filter(listener => listener !== callback);
    }

    // Notify all listeners
    notifyListeners(languageCode) {
        this.listeners.forEach(callback => callback(languageCode));
    }

    // Update all page translations
    updatePageTranslations() {
        const elements = document.querySelectorAll('[data-translate]');
        elements.forEach(element => {
            const key = element.getAttribute('data-translate');
            const translation = this.translate(key);
            
            // Update text content, preserving HTML structure if needed
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                if (element.type === 'submit' || element.type === 'button') {
                    element.value = translation;
                } else {
                    element.placeholder = translation;
                }
            } else {
                // Use innerHTML to preserve HTML tags in translations (like <span class="accent">)
                element.innerHTML = translation;
            }
        });

        // Update page title and meta description
        const titleKey = 'page.title';
        const descriptionKey = 'page.description';
        
        if (this.translations[this.currentLanguage][titleKey]) {
            document.title = this.translate(titleKey);
        }
        
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription && this.translations[this.currentLanguage][descriptionKey]) {
            metaDescription.setAttribute('content', this.translate(descriptionKey));
        }

        // Update HTML lang attribute
        document.documentElement.setAttribute('lang', this.currentLanguage);
    }

    // Initialize the translation service
    init() {
        // Load saved language or detect browser language
        const savedLanguage = localStorage.getItem('selectedLanguage');
        const browserLanguage = navigator.language.split('-')[0];
        const defaultLanguage = savedLanguage || 
                               (this.translations[browserLanguage] ? browserLanguage : 'sk');
        
        this.setLanguage(defaultLanguage);
        
        // Update language selector
        const languageSelect = document.getElementById('languageSelect');
        if (languageSelect) {
            languageSelect.value = this.currentLanguage;
        }
    }
}

// Create global translation service instance
window.translationService = new TranslationService();
