// Main JavaScript for DevelopED Website

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize translation service
    window.translationService.init();
    
    // Initialize all components
    initNavigation();
    initLanguageSwitcher();
    initSmoothScrolling();
    initContactForm();
    initAnimations();
    initMobileMenu();
});

// Navigation functionality
function initNavigation() {
    const navbar = document.querySelector('.navbar');
    
    // Add scroll effect to navbar
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
    
    // Highlight active nav item based on scroll position
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');
    
    window.addEventListener('scroll', function() {
        let current = '';
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (window.pageYOffset >= sectionTop - 100) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').substring(1) === current) {
                link.classList.add('active');
            }
        });
    });
}

// Language switcher functionality
function initLanguageSwitcher() {
    const languageSelect = document.getElementById('languageSelect');
    
    if (languageSelect) {
        languageSelect.addEventListener('change', function() {
            const selectedLanguage = this.value;
            window.translationService.setLanguage(selectedLanguage);
        });
    }
    
    // Listen for language changes
    window.addEventListener('languageChanged', function(event) {
        const languageCode = event.detail.language;
        console.log('Language changed to:', languageCode);
        
        // Update any dynamic content that might need special handling
        updateDynamicContent(languageCode);
    });
}

// Update dynamic content when language changes
function updateDynamicContent(languageCode) {
    // Update placeholders for form inputs
    const formInputs = document.querySelectorAll('input[data-translate], textarea[data-translate]');
    formInputs.forEach(input => {
        const key = input.getAttribute('data-translate');
        const translation = window.translationService.translate(key);
        
        if (input.tagName === 'INPUT' && input.type !== 'submit' && input.type !== 'button') {
            input.placeholder = translation;
        }
    });
    
    // Update any labels that might reference form fields
    const labels = document.querySelectorAll('label[data-translate]');
    labels.forEach(label => {
        const key = label.getAttribute('data-translate');
        label.textContent = window.translationService.translate(key);
    });
}

// Smooth scrolling for navigation links
function initSmoothScrolling() {
    const navLinks = document.querySelectorAll('a[href^="#"]');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href').substring(1);
            const targetSection = document.getElementById(targetId);
            
            if (targetSection) {
                const navbarHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = targetSection.offsetTop - navbarHeight;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
                
                // Close mobile menu if open
                const mobileMenu = document.querySelector('.nav-menu');
                const hamburger = document.querySelector('.hamburger');
                if (mobileMenu && hamburger) {
                    mobileMenu.classList.remove('active');
                    hamburger.classList.remove('active');
                }
            }
        });
    });
}

// Contact form functionality
function initContactForm() {
    const contactForm = document.getElementById('contactForm');
    
    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(this);
            const data = Object.fromEntries(formData);
            
            // Simple validation
            if (!data.name || !data.email || !data.message) {
                showNotification('Please fill in all required fields.', 'error');
                return;
            }
            
            if (!isValidEmail(data.email)) {
                showNotification('Please enter a valid email address.', 'error');
                return;
            }
            
            // Real form submission via Web3Forms
            const submitButton = this.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            
            submitButton.textContent = 'Sending...';
            submitButton.disabled = true;
            
            try {
                // Submit to Web3Forms API
                const response = await fetch('https://api.web3forms.com/submit', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showNotification('Message sent successfully! We\'ll get back to you soon.', 'success');
                    contactForm.reset();
                } else {
                    throw new Error(result.message || 'Failed to send message');
                }
            } catch (error) {
                console.error('Form submission error:', error);
                showNotification('Failed to send message. Please try again or contact us directly at dddpsk@gmail.com', 'error');
            } finally {
                submitButton.textContent = originalText;
                submitButton.disabled = false;
            }
        });
    }
}

// Email validation
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Show notification
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notification => notification.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 1000;
        opacity: 0;
        transform: translateY(-20px);
        transition: all 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    }, 100);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Animation on scroll
function initAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);
    
    // Observe elements for animation
    const animatedElements = document.querySelectorAll(
        '.hero-content, .about-text, .about-stats, .project-card, .contact-info, .contact-form'
    );
    
    animatedElements.forEach(element => {
        observer.observe(element);
    });
}

// Mobile menu functionality
function initMobileMenu() {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', function() {
            this.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            }
        });
        
        // Close menu on window resize
        window.addEventListener('resize', function() {
            if (window.innerWidth > 768) {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            }
        });
    }
}

// Project card interactions
document.addEventListener('click', function(e) {
    // Skip if clicking on a project card link (not a "coming soon" project)
    if (e.target.closest('.project-card-link')) {
        return;
    }
    
    if (e.target.matches('.project-card .btn') || e.target.closest('.project-card .btn')) {
        e.preventDefault();
        
        const projectCard = e.target.closest('.project-card');
        const projectTitle = projectCard.querySelector('h3').textContent;
        
        // You can implement a modal or redirect to project details page
        showNotification(`Project details for "${projectTitle}" - Coming soon!`, 'info');
    }
});

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Performance optimization for scroll events
const optimizedScrollHandler = debounce(function() {
    // Any heavy scroll operations can go here
}, 16); // ~60fps

window.addEventListener('scroll', optimizedScrollHandler);

// Tech stack animation
function initTechStackAnimation() {
    const techItems = document.querySelectorAll('.tech-item');
    
    techItems.forEach((item, index) => {
        item.style.animationDelay = `${index * 0.2}s`;
    });
}

// Initialize tech stack animation when page loads
document.addEventListener('DOMContentLoaded', initTechStackAnimation);

// Error handling for failed operations
window.addEventListener('error', function(e) {
    console.error('JavaScript error:', e.error);
    // Optionally show user-friendly error message
});

// Handle translation service errors
window.translationService.addListener(function(languageCode) {
    console.log('Language successfully changed to:', languageCode);
});

// Keyboard navigation support
document.addEventListener('keydown', function(e) {
    // ESC key closes mobile menu
    if (e.key === 'Escape') {
        const hamburger = document.querySelector('.hamburger');
        const navMenu = document.querySelector('.nav-menu');
        
        if (hamburger && navMenu) {
            hamburger.classList.remove('active');
            navMenu.classList.remove('active');
        }
    }
});
