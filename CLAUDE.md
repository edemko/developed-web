# DevelopED Website - Project Documentation

## Project Overview
A modern, responsive landing page for DevelopED - a company specializing in custom business applications built with AI and modern technologies.

## Project Structure

```
developed-web/
├── index.html                          # Main HTML file with complete structure
├── styles.css                          # Comprehensive styling (1000 lines)
├── script.js                           # JavaScript functionality and interactions
├── translations.js                     # Translation service with EN/SK support
├── README.md                           # Project description
├── TRANSLATION_IMPLEMENTATION_GUIDE.md # Guide for translation system
├── CLAUDE.md                           # This file - project documentation
└── ai_instructions/                    # AI helper documentation
    └── translation_implementation.md   # Translation implementation details
```

## Technology Stack

### Frontend
- **HTML5**: Semantic markup with accessibility features
- **CSS3**: Custom styling with CSS Grid and Flexbox
- **Vanilla JavaScript**: No frameworks, pure ES6+
- **Font Awesome 6.4.0**: Icon library
- **Google Fonts**: Inter font family

### Features
- Responsive design (mobile-first approach)
- Dark theme by default
- Smooth scrolling navigation
- Animated elements on scroll
- Interactive project cards
- Contact form with validation
- Mobile hamburger menu
- Language switcher (EN/SK)

## Key Features

### 1. Multi-Language Support
- **Languages**: English (EN) and Slovak (SK)
- **Implementation**: Custom TranslationService class
- **Persistence**: localStorage for language preference
- **Coverage**: Complete translation of all UI elements
- **Dynamic Updates**: No page reload required

### 2. Responsive Navigation
- Fixed navbar with scroll effects
- Active section highlighting
- Mobile hamburger menu
- Smooth scroll to sections
- Language dropdown switcher

### 3. Hero Section
- Eye-catching headline with gradient
- Call-to-action buttons
- Tech stack visual showcase
- Animated on page load

### 4. About Section
- Company mission and approach
- Feature list with icons
- Statistics showcase (100% satisfaction, 3x faster, 50% cost savings)
- Responsive grid layout

### 5. Projects Showcase
- Three project cards with hover effects
- Live project links (My Clinic Portal, Filament Check)
- Technology tags
- "Coming Soon" state for KešTrek
- Clickable project cards

### 6. Contact Section
- Contact information display
- Contact form with validation
- Social media links
- Form submission handling (currently simulated)

### 7. Footer
- Company branding
- Services list
- Technologies list
- Copyright notice

## Translation System

### Architecture
The translation system uses a service-based approach:

```javascript
class TranslationService {
    - Store translations in nested objects
    - Manage current language state
    - Update DOM elements with data-translate attributes
    - Handle special cases (inputs, buttons)
    - Emit events for language changes
}
```

### Usage
Elements use `data-translate` attribute:
```html
<h1 data-translate="hero.title">Default Text</h1>
```

### Translation Keys Structure
```
section.subsection.key
```

Examples:
- `nav.home`, `nav.about`, `nav.projects`, `nav.contact`
- `hero.title`, `hero.subtitle`, `hero.description`
- `projects.kestrek.title`, `projects.kestrek.description`
- `contact.form.name`, `contact.form.email`

### Supported Languages
1. **English (en)** - Default
2. **Slovak (sk)** - Complete translation

## Pages and Sections

### Navigation
- Home (#home)
- About (#about)
- Projects (#projects)
- Contact (#contact)
- Language Switcher

### Main Content Sections

#### 1. Hero Section (#home)
- Main headline
- Subheadline
- Description
- Two CTA buttons
- Tech stack visualization

#### 2. About Section (#about)
- Section title and subtitle
- Mission statement
- Approach with 4 features
- 3 statistics cards

#### 3. Projects Section (#projects)
- Section title and subtitle
- Project 1: My Clinic Portal
  - Angular, Supabase, TypeScript
  - Link: https://my-clinic-three.vercel.app/auth/login
- Project 2: Filament Check
  - Python, FastAPI, Chart.js
  - Link: https://check.filamentree.eu
- Project 3: KešTrek (Coming Soon)
  - NestJS, Supabase, Angular

#### 4. Contact Section (#contact)
- Contact information
  - Name: Erik Demko, DiS.
  - Email: developed@developed.sk
  - Phone: +421 911 327 715
  - Location: Košice, Slovakia
- Contact form
  - Name, Email, Company, Message
  - Validation and submission handling
- Social media links

#### 5. Footer
- Company description
- Services list
- Technologies list
- Copyright notice

## Styling

### Color Scheme
- Dark theme focused
- Accent color: Blue gradient
- Text colors: White, gray variations
- Background: Dark blue/black gradients

### Typography
- Font: Inter (Google Fonts)
- Weights: 300, 400, 500, 600, 700
- Responsive sizing

### Layout
- Responsive breakpoints
- Flexbox and Grid layouts
- Container max-width: 1200px
- Mobile-first approach

## JavaScript Functionality

### Main Features
1. **Navigation**
   - Scroll effects on navbar
   - Active section highlighting
   - Smooth scrolling to anchors

2. **Language Switching**
   - Dropdown change handler
   - Update all translated elements
   - Update form placeholders
   - Save to localStorage

3. **Mobile Menu**
   - Hamburger toggle
   - Close on outside click
   - Close on window resize
   - Close on navigation

4. **Contact Form**
   - Field validation
   - Email validation
   - Submit handling
   - Success/error notifications

5. **Animations**
   - Intersection Observer for scroll animations
   - Element fade-in effects
   - Tech stack animations

6. **Performance**
   - Debounced scroll handlers
   - Optimized event listeners
   - Error handling

## Browser Support
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Accessibility
- Semantic HTML5 elements
- ARIA attributes where needed
- Keyboard navigation support
- Focus states on interactive elements
- Alt text for images (when implemented)

## SEO Features
- Meta description tag
- Dynamic page title
- Semantic HTML structure
- HTML lang attribute updates
- Open Graph tags (can be added)

## Performance Optimizations
- Minimal external dependencies
- Debounced scroll events
- Efficient DOM queries
- CSS animations over JS
- Font loading optimization

## Future Enhancements

### Potential Improvements
1. Add more project showcases
2. Implement blog section
3. Add testimonials
4. Create case studies
5. Add more languages (Czech, German)
6. Implement actual form submission (email service)
7. Add loading animations
8. Add favicon
9. Implement dark/light theme toggle
10. Add sitemap.xml
11. Add robots.txt
12. Implement analytics

### Technical Improvements
1. Add build process (webpack/vite)
2. Implement CSS preprocessing (SASS)
3. Add unit tests
4. Implement E2E tests
5. Add code linting
6. Optimize images
7. Add service worker for offline support
8. Implement lazy loading
9. Add performance monitoring

## Development Notes

### No Backend Required
This is a static website that can be hosted on:
- Vercel
- Netlify
- GitHub Pages
- Any static hosting service

### No Build Process
- Can be run directly in browser
- No npm/yarn required
- Pure HTML/CSS/JS

### Easy Updates
- Edit HTML for structure
- Edit styles.css for styling
- Edit translations.js for content
- Edit script.js for functionality

## Contact & Support

**Developer**: Erik Demko, DiS.  
**Email**: developed@developed.sk  
**Phone**: +421 911 327 715  
**Location**: Košice, Slovakia

## Version History

### Version 1.1 (Current)
- Complete translation implementation
- All UI elements translatable
- Form placeholder translations
- Meta tag translations
- Language persistence

### Version 1.0
- Initial website structure
- Basic translation service
- Responsive design
- Core functionality

## License
All rights reserved. © 2024 DevelopED

---

*Last updated: October 18, 2025*

