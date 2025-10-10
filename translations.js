// Translation Service for DevelopED Website
class TranslationService {
    constructor() {
        this.currentLanguage = 'en';
        this.listeners = [];
        this.translations = {
            en: {
                // Navigation
                'nav.home': 'Home',
                'nav.about': 'About',
                'nav.projects': 'Projects',
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
                'projects.business.title': 'My Clinic Portal',
                'projects.business.description': 'Dental clinic management application for tracking income, expenses, employee management, laboratory orders, and comprehensive business analytics. Multi-language support and role-based access control.',
                'projects.business.try_now': 'Try out Now',
                'projects.filament.title': 'Filament Check',
                'projects.filament.description': 'Quality control system for filament production. Enter serial number (starting from 1000 001) to access detailed production data including diameter charts, color sensor data, material type, and other information.',
                'projects.crm.title': 'KešTrek',
                'projects.crm.description': 'Track your money and get an overview of your expenses with the KešTrek app. Thanks to detailed statistics, nothing will slip through and you can better manage your finances.',

                // Contact Section
                'contact.title': 'Get In Touch',
                'contact.subtitle': 'Ready to start your project? Let\'s discuss your needs.',
                'contact.info.title': 'Contact Information',
                'contact.form.name': 'Name',
                'contact.form.email': 'Email',
                'contact.form.company': 'Company',
                'contact.form.message': 'Message',
                'contact.form.send': 'Send Message',

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
                // Navigation
                'nav.home': 'Domov',
                'nav.about': 'O nás',
                'nav.projects': 'Projekty',
                'nav.contact': 'Kontakt',

                // Hero Section
                'hero.title': 'Aplikácie na mieru pre firmy',
                'hero.subtitle': 'Vytvorené s AI a modernými technológiami',
                'hero.description': 'S využitím najmodernejších technológií a umelej inteligencie vám dokážeme vytvoriť a doručiť aplikáciu podľa vašich predstáv omnoho rýchlejšie a cenovo dostupnejšie ako použitím bežných metód.',
                'hero.view_projects': 'Zobraziť projekty',
                'hero.get_started': 'Začať',

                // About Section
                'about.title': 'O spoločnosti DevelopED',
                'about.subtitle': 'Moderné riešenia pre moderné firmy',
                'about.mission.title': 'Naša misia',
                'about.mission.description': 'Špecializujeme sa na vytváranie aplikácií na mieru pre malé a stredné firmy pomocou najnovších technológií vrátane AI-asistovaného vývoja, cloudových databáz a moderných hostingových riešení. Náš prístup zabezpečuje rýchlejšie dodanie a dostupnejšie ceny v porovnaní s tradičnými vývojárskymi metódami.',
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
                'projects.business.title': 'My Clinic Portal',
                'projects.business.description': 'Aplikácia pre správu zubných kliník na sledovanie príjmov, výdavkov, správu zamestnancov, laboratórne objednávky a komplexnú obchodnú analytiku. Podpora viacerých jazykov a riadenie prístupu podľa rolí.',
                'projects.business.try_now': 'Vyskúšať teraz',
                'projects.filament.title': 'Filament Check',
                'projects.filament.description': 'Systém kontroly kvality pre výrobu filamentov. Zadajte sériové číslo (začínajúce od 1000 001) a získajte prístup k detailným výrobným údajom vrátane grafov priemeru, dát farebných senzorov, typu materiálu a iných informácií.',
                'projects.crm.title': 'KešTrek',
                'projects.crm.description': 'Sledujte cestu vašich peňazí a získajte prehľad o svojich výdavkoch s aplikáciou KešTrek. Vďaka detailným štatistikám vám už nič neujde a vy tak môžete lepšie riadiť svoje financie.',

                // Contact Section
                'contact.title': 'Kontaktujte nás',
                'contact.subtitle': 'Ste ripravení začať Váš projekt?',
                'contact.info.title': 'Kontaktné informácie',
                'contact.form.name': 'Meno',
                'contact.form.email': 'Email',
                'contact.form.company': 'Spoločnosť',
                'contact.form.message': 'Správa',
                'contact.form.send': 'Odoslať správu',

                // Footer
                'footer.description': 'Aplikácie na mieru vytvorené s modernými technológiami a asistenciou AI.',
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
                element.textContent = translation;
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
                               (this.translations[browserLanguage] ? browserLanguage : 'en');
        
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
