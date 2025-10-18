# Testing Guide - Translation Implementation

## Quick Start Testing

### 1. Open the Website
Simply open `index.html` in a web browser (Chrome, Firefox, Safari, or Edge recommended).

### 2. Basic Translation Test

#### Test English to Slovak:
1. Page loads in English (or your browser's default language)
2. Look for the language dropdown in the top navigation
3. Click the dropdown and select "SK"
4. Observe all text immediately change to Slovak

#### Test Slovak to English:
1. Click the dropdown and select "EN"
2. Observe all text immediately change to English

### 3. Verify Elements Changed

Check these sections for translation:

✅ **Navigation Menu**
- Home → Domov
- About → O nás
- Projects → Projekty
- Contact → Kontakt

✅ **Hero Section**
- "Custom Business Applications" → "Aplikácie na mieru pre firmy"
- "Built with AI & Modern Technology" → "Vytvorené s AI a modernými technológiami"
- "View Projects" button → "Zobraziť projekty"
- "Get Started" button → "Začať"

✅ **About Section**
- "About DevelopED" → "O spoločnosti DevelopED"
- "Our Mission" → "Naša misia"
- "Our Approach" → "Náš prístup"
- All feature descriptions

✅ **Projects Section**
- "Our Projects" → "Naše projekty"
- All project titles remain the same (proper nouns)
- All project descriptions translate
- "Try out Now" button → "Vyskúšať teraz"
- "Coming Soon" button → "Už čoskoro"

✅ **Contact Section**
- "Get In Touch" → "Kontaktujte nás"
- "Contact Information" → "Kontaktné informácie"
- Form labels (Name → Meno, Email → Email, etc.)
- "Send Message" button → "Odoslať správu"

✅ **Footer**
- "Services" → "Služby"
- "Web Applications" → "Webové aplikácie"
- "Technologies" → "Technológie"
- "All rights reserved." → "Všetky práva vyhradené."

### 4. Form Placeholder Test

1. Navigate to Contact section
2. Change language to Slovak (SK)
3. Hover over/click on form fields
4. Verify placeholders show Slovak text
5. Change language to English (EN)
6. Verify placeholders show English text

### 5. Browser Title Test

1. Change language to Slovak
2. Look at browser tab title
3. Should show: "DevelopED - Aplikácie na mieru pre firmy"
4. Change language to English
5. Should show: "DevelopED - Custom Business Applications"

### 6. Persistence Test

1. Select Slovak (SK)
2. Refresh the page (F5)
3. Page should load in Slovak
4. Select English (EN)
5. Refresh the page
6. Page should load in English

### 7. Mobile Test

1. Open browser DevTools (F12)
2. Toggle device toolbar (responsive mode)
3. Select mobile device (iPhone, Android)
4. Click hamburger menu
5. Switch language
6. Verify all menu items translate
7. Verify mobile menu still works

## Browser Console Checks

### No Errors Expected
Open browser console (F12 → Console tab):
- Should see: "Language successfully changed to: en" or "sk"
- Should NOT see: Any red error messages
- Should NOT see: "Translation key not found"

### Language Change Events
When switching languages, you should see:
```
Language changed to: sk
Language successfully changed to: sk
```

## Common Issues and Solutions

### Issue 1: Translations Not Working
**Symptoms**: Text doesn't change when switching languages

**Check**:
1. Is `translations.js` loaded? (Check browser Network tab)
2. Is `script.js` loaded?
3. Are there any console errors?

**Solution**: Ensure files are in the same directory and properly linked in HTML

### Issue 2: Some Text Not Translating
**Symptoms**: Most text translates but some stays in English

**Check**:
1. Does the element have `data-translate` attribute?
2. Does the translation key exist in translations.js?
3. Check browser console for warnings

**Solution**: Add missing `data-translate` attribute or translation key

### Issue 3: Form Placeholders Not Translating
**Symptoms**: Form fields don't show translated placeholders

**Check**:
1. Do inputs have `data-translate` attribute?
2. Is the `updateDynamicContent()` function running?

**Solution**: Verify script.js is loaded and no JS errors exist

### Issue 4: Language Not Persisting
**Symptoms**: Page resets to English on refresh

**Check**:
1. Is localStorage working? (Check browser Privacy settings)
2. Are cookies disabled?

**Solution**: Enable localStorage or use normal browser mode (not incognito)

### Issue 5: Browser Title Not Changing
**Symptoms**: Tab title stays the same when switching languages

**Check**:
1. Are page.title keys defined in translations.js?
2. Is the updatePageTranslations() method working?

**Solution**: Verify the page.title translation keys exist

## Advanced Testing

### Test Different Browsers
1. Chrome
2. Firefox
3. Safari (if on Mac)
4. Edge
5. Mobile Safari (iOS)
6. Chrome Mobile (Android)

### Test Edge Cases
1. Switch languages multiple times rapidly
2. Switch languages while form is filled
3. Switch languages with mobile menu open
4. Switch languages while scrolling

### Performance Testing
1. Open browser Performance tab
2. Record page load
3. Check translation update speed
4. Should be < 50ms for language switch

## Automated Testing (Future)

### Unit Tests (Not Yet Implemented)
```javascript
// Example test structure
describe('TranslationService', () => {
  it('should translate keys correctly', () => {
    expect(service.translate('nav.home')).toBe('Home');
  });
  
  it('should switch languages', () => {
    service.setLanguage('sk');
    expect(service.getCurrentLanguage()).toBe('sk');
  });
});
```

### E2E Tests (Not Yet Implemented)
```javascript
// Example Cypress test
describe('Language Switching', () => {
  it('should translate all elements when switching to Slovak', () => {
    cy.visit('/');
    cy.get('#languageSelect').select('sk');
    cy.contains('Domov').should('be.visible');
  });
});
```

## Checklist for Manual Testing

Before marking translation implementation as complete:

- [ ] All navigation items translate
- [ ] Hero section fully translates
- [ ] About section fully translates
- [ ] All 3 project cards translate
- [ ] Contact form labels translate
- [ ] Contact form placeholders translate
- [ ] Footer sections translate
- [ ] Browser title updates
- [ ] Language persists after refresh
- [ ] No console errors
- [ ] Mobile menu works with translations
- [ ] Smooth scrolling still works
- [ ] Form validation still works
- [ ] All buttons are clickable
- [ ] Links work correctly
- [ ] Works on Chrome
- [ ] Works on Firefox
- [ ] Works on mobile devices

## Conclusion

If all tests pass, the translation implementation is complete and working correctly. The website should seamlessly switch between English and Slovak without any page reloads or errors.

For any issues encountered during testing, refer to the troubleshooting section or check the browser console for error messages.

