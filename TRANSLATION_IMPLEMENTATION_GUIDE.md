# Translation Implementation Guide for My Clinic Portal

## Overview
This guide provides step-by-step instructions for implementing translations in the My Clinic Portal Angular application. The application uses a custom translation service with real-time language switching between English and Slovak.

## Translation Architecture

### Core Components
1. **TranslationService** (`frontend/src/app/core/services/translation.service.ts`)
   - Central translation service with BehaviorSubject for real-time updates
   - Contains translation dictionaries for English and Slovak
   - Provides `translate()` method and `currentLanguage$` observable

2. **LanguageSwitcherComponent** (`frontend/src/app/shared/components/language-switcher/`)
   - Dropdown component for language selection
   - Triggers language changes via TranslationService

3. **Translation Keys Structure**
   - Hierarchical dot notation: `section.subsection.key`
   - Example: `dashboard.filters.from_date`, `nav.home`, `lab.table.patient`

## Step-by-Step Implementation Guide

### Step 1: Add Translation Keys

**Location**: `frontend/src/app/core/services/translation.service.ts`

Add translation keys to both English and Slovak dictionaries:

```typescript
// In English section
'component.section.key': 'English Text',
'component.table.column': 'Column Name',
'component.button.action': 'Action Button',

// In Slovak section  
'component.section.key': 'Slovenský text',
'component.table.column': 'Názov stĺpca',
'component.button.action': 'Akčné tlačidlo',
```

**Key Naming Convention:**
- `page.title` - Page titles
- `page.subtitle` - Page descriptions
- `page.table.column` - Table column headers
- `page.form.field` - Form field labels
- `page.button.action` - Button text
- `page.modal.title` - Modal titles
- `page.chart.title` - Chart titles
- `page.filters.label` - Filter labels
- `common.loading` - Common loading text
- `common.save` - Common save button
- `common.cancel` - Common cancel button

### Step 2: Update Component Imports

Add required imports to the component:

```typescript
import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { TranslationService } from '../../../core/services/translation.service';
```

### Step 3: Update Component Class

```typescript
export class YourComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  currentLanguage: string = 'en';
  
  constructor(
    // ... existing services
    private translationService: TranslationService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}
```

### Step 4: Implement Language Subscription

Add to `ngOnInit()`:

```typescript
ngOnInit(): void {
  // Get initial language
  this.currentLanguage = this.translationService.getCurrentLanguage();
  
  // Subscribe to language changes to update the UI
  this.translationService.currentLanguage$
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (languageCode) => {
        this.currentLanguage = languageCode;
        this.ngZone.run(() => {
          this.cdr.markForCheck();
          this.cdr.detectChanges();
        });
      },
      error: (error) => {
        console.error('Component: Language subscription error', error);
      }
    });
  
  window.addEventListener('languageChanged', this.handleLanguageChanged);

  // ... existing ngOnInit code
}
```

### Step 5: Add Cleanup and Event Handler

```typescript
ngOnDestroy(): void {
  this.destroy$.next();
  this.destroy$.complete();
  window.removeEventListener('languageChanged', this.handleLanguageChanged);
  
  // ... existing cleanup code
}

private handleLanguageChanged = (event: any) => {
  const languageCode = event.detail.language;
  this.currentLanguage = languageCode;
  this.ngZone.run(() => {
    this.cdr.detectChanges();
  });
}
```

### Step 6: Add Translation Helper Method

Add at the end of the component class:

```typescript
// Helper method to get translations for the template
getTranslation(key: string, params?: any): string {
  return this.translationService.translate(key, params);
}
```

### Step 7: Update Template

Replace hardcoded text with translation calls:

```html
<!-- Before -->
<h1>Page Title</h1>
<button>Save</button>
<th>Column Name</th>

<!-- After -->
<h1>{{ getTranslation('page.title') }}</h1>
<button>{{ getTranslation('common.save') }}</button>
<th>{{ getTranslation('page.table.column') }}</th>
```

## Common Translation Patterns

### Page Headers
```html
<h1 class="h3 mb-1 text-primary">{{ getTranslation('page.title') }}</h1>
<p class="text-muted mb-0">{{ getTranslation('page.subtitle') }}</p>
```

### Buttons
```html
<button class="btn btn-primary">{{ getTranslation('page.add_item') }}</button>
<button class="btn btn-secondary">{{ getTranslation('common.cancel') }}</button>
```

### Table Headers
```html
<th>{{ getTranslation('page.table.column_name') }}</th>
<th>{{ getTranslation('common.actions') }}</th>
```

### Form Labels
```html
<label class="form-label">
  {{ getTranslation('page.form.field') }} 
  <span class="text-danger">{{ getTranslation('common.required') }}</span>
</label>
```

### Form Placeholders
```html
<input [placeholder]="getTranslation('page.form.placeholder')" />
```

### Modal Titles
```html
<h5 class="modal-title">
  {{ showEditModal ? getTranslation('common.edit') : getTranslation('common.add') }} 
  {{ getTranslation('page.modal.item') }}
</h5>
```

### Loading States
```html
<span class="visually-hidden">{{ getTranslation('common.loading') }}</span>
<p class="text-muted">{{ getTranslation('page.loading_message') }}</p>
```

### Empty States
```html
<div class="text-muted">{{ getTranslation('page.no_data') }}</div>
<small class="text-muted">{{ getTranslation('page.empty_help') }}</small>
```

## Chart Translation Patterns

### Chart Titles
```html
<h6 class="card-title">{{ getTranslation('page.chart.title') }}</h6>
```

### Chart Legend Translation
For charts with dynamic data that needs translation, update the `getChartData()` method:

```typescript
getChartData(type: string): any {
  let data = this.getData(type);
  
  return {
    labels: data.map(item => {
      // Translate specific values if needed
      if (item.name === 'Loan') {
        return this.getTranslation('finance.loan');
      } else if (item.name === 'Monthly Recurring') {
        return this.getTranslation('services.monthly_recurring');
      }
      return item.name; // Keep user-generated content as-is
    }),
    data: data.map(item => item.amount),
    colors: this.generateColors(data.length)
  };
}
```

### Chart Table Data Cells
For tables showing translated values:

```html
<!-- For recurring types -->
<td>{{ translateRecurringType(item.name) }}</td>

<!-- For loan types -->
<td>{{ translateType(item.type) }}</td>

<!-- For regular data -->
<td>{{ item.name }}</td>
```

Create helper methods for specific translations:

```typescript
translateRecurringType(type: string): string {
  if (type === 'Monthly Recurring') {
    return this.getTranslation('services.monthly_recurring');
  } else if (type === 'One-time') {
    return this.getTranslation('services.one_time');
  }
  return type;
}
```

## Filter Translation Patterns

### Filter Labels
```html
<label class="form-label">{{ getTranslation('page.filters.label') }}</label>
```

### Filter Options
```html
<option value="">{{ getTranslation('page.filters.all_items') }}</option>
<option value="type1">{{ getTranslation('page.filters.type1') }}</option>
```

### Filter Placeholders
```html
<input [placeholder]="getTranslation('page.filters.search_placeholder')" />
```

## Common Translation Keys

### Universal Keys (Available Across App)
```typescript
// Common actions
'common.save': 'Save' / 'Uložiť'
'common.cancel': 'Cancel' / 'Zrušiť'
'common.edit': 'Edit' / 'Upraviť'
'common.delete': 'Delete' / 'Zmazať'
'common.create': 'Create' / 'Vytvoriť'
'common.loading': 'Loading...' / 'Načítavam...'
'common.actions': 'Actions' / 'Akcie'
'common.name': 'Name' / 'Názov'
'common.description': 'Description' / 'Popis'
'common.required': '*' / '*'

// Navigation
'nav.home': 'Home' / 'Domov'
'nav.lab': 'Lab' / 'Laboratórium'
'nav.employees': 'Employees' / 'Zamestnanci'

// Pagination
'pagination.previous': 'Previous' / 'Predchádzajúca'
'pagination.next': 'Next' / 'Ďalšia'
'pagination.page': 'Page' / 'Strana'
'pagination.of': 'of' / 'z'
```

## Testing Checklist

After implementing translations, verify:

### ✅ Component Setup
- [ ] TranslationService imported and injected
- [ ] OnDestroy interface implemented
- [ ] Language subscription added to ngOnInit
- [ ] Cleanup added to ngOnDestroy
- [ ] getTranslation() method added

### ✅ Template Updates
- [ ] Page titles and subtitles translated
- [ ] All button text translated
- [ ] All table headers translated
- [ ] All form labels translated
- [ ] All placeholders translated
- [ ] All modal titles translated
- [ ] All loading states translated
- [ ] All empty states translated

### ✅ Chart Elements
- [ ] Chart titles translated
- [ ] Chart legend items translated (if applicable)
- [ ] Chart table headers translated
- [ ] Chart table data cells translated (for system values)
- [ ] Chart axis labels translated

### ✅ Filter Elements
- [ ] Filter section titles translated
- [ ] All filter labels translated
- [ ] All filter options translated
- [ ] Filter placeholders translated
- [ ] Filter buttons translated

### ✅ Functionality Testing
- [ ] Language switching works without page reload
- [ ] All text updates immediately when language changes
- [ ] No TypeScript compilation errors
- [ ] No missing translation keys (check browser console)
- [ ] Charts regenerate with translated labels
- [ ] Forms and modals work properly in both languages

## Common Mistakes to Avoid

### ❌ Don't Do This:
```html
<!-- Hardcoded text -->
<h1>Products</h1>
<button>Save</button>

<!-- Missing change detection -->
ngOnInit() {
  // Missing language subscription
}

<!-- Forgetting chart legends -->
label: 'Hardcoded Chart Label'

<!-- Missing cleanup -->
ngOnDestroy() {
  // Missing destroy$.complete()
}
```

### ✅ Do This:
```html
<!-- Dynamic translations -->
<h1>{{ getTranslation('products.title') }}</h1>
<button>{{ getTranslation('common.save') }}</button>

<!-- Proper change detection -->
ngOnInit() {
  this.translationService.currentLanguage$.pipe(takeUntil(this.destroy$))...
}

<!-- Translated chart legends -->
label: this.getTranslation('chart.label')

<!-- Proper cleanup -->
ngOnDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}
```

## Translation Key Guidelines

### Naming Convention
- Use lowercase with dots: `section.subsection.key`
- Be descriptive: `employees.table.first_name` not `emp.tbl.fname`
- Group related keys: `modal.add`, `modal.edit`, `modal.delete`

### Slovak Translation Guidelines
- Use formal business language
- Common terms:
  - "Správa" for "Management"
  - "Prehľad" for "Overview"
  - "Analýza" for "Analysis"
  - "Filtre" for "Filters"
  - "Hľadať" for "Search"
  - "Resetovať" for "Reset"
  - "Akcie" for "Actions"

## File Structure

```
frontend/src/app/
├── core/services/translation.service.ts     # Main translation service
├── shared/components/language-switcher/     # Language dropdown component
└── features/[feature]/[component].ts        # Components with translations
```

## Quick Implementation Checklist

For any new component requiring translation:

1. **Add translation keys** to TranslationService (both English and Slovak)
2. **Import dependencies** (TranslationService, ChangeDetectorRef, NgZone, Subject, takeUntil)
3. **Update class** (add OnDestroy, destroy$, currentLanguage properties)
4. **Update constructor** (inject translation services)
5. **Add language subscription** to ngOnInit
6. **Add cleanup** to ngOnDestroy
7. **Add getTranslation() method**
8. **Update template** (replace all hardcoded text)
9. **Test language switching**
10. **Verify no TypeScript errors**

## Example Implementation

### Complete Component Example

```typescript
import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { TranslationService } from '../../../core/services/translation.service';

@Component({
  selector: 'app-example',
  template: `
    <h1>{{ getTranslation('example.title') }}</h1>
    <button>{{ getTranslation('example.add_item') }}</button>
    <table>
      <thead>
        <tr>
          <th>{{ getTranslation('example.table.name') }}</th>
          <th>{{ getTranslation('common.actions') }}</th>
        </tr>
      </thead>
    </table>
  `
})
export class ExampleComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  currentLanguage: string = 'en';

  constructor(
    private translationService: TranslationService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    this.currentLanguage = this.translationService.getCurrentLanguage();
    
    this.translationService.currentLanguage$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (languageCode) => {
          this.currentLanguage = languageCode;
          this.ngZone.run(() => {
            this.cdr.markForCheck();
            this.cdr.detectChanges();
          });
        }
      });
    
    window.addEventListener('languageChanged', this.handleLanguageChanged);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    window.removeEventListener('languageChanged', this.handleLanguageChanged);
  }
  
  private handleLanguageChanged = (event: any) => {
    const languageCode = event.detail.language;
    this.currentLanguage = languageCode;
    this.ngZone.run(() => this.cdr.detectChanges());
  }

  getTranslation(key: string, params?: any): string {
    return this.translationService.translate(key, params);
  }
}
```

## Special Cases

### Chart Legends with Dynamic Data
When chart legends contain system-generated values that need translation:

```typescript
getChartData(type: string): any {
  return {
    labels: data.map(item => {
      // Translate system values
      if (item.name === 'Loan') return this.getTranslation('finance.loan');
      if (item.name === 'Monthly Recurring') return this.getTranslation('services.monthly');
      return item.name; // Keep user data as-is
    }),
    data: data.map(item => item.amount)
  };
}
```

### Conditional Text
```html
{{ showFilters ? getTranslation('common.hide') : getTranslation('common.show') }}
{{ getTranslation('common.filters') }}
```

### Table Data Cells with System Values
```html
<td>{{ translateType(item.type) }}</td>
```

With helper method:
```typescript
translateType(type: string): string {
  if (type === 'loan') return this.getTranslation('finance.loan');
  if (type === 'leasing') return this.getTranslation('finance.leasing');
  return type;
}
```

## Debugging Translation Issues

### Common Problems and Solutions

1. **Translation not updating**: Check if language subscription is properly set up
2. **TypeScript errors**: Ensure getTranslation() method is added to component
3. **Chart legends not translating**: Update chart creation methods to use getTranslation()
4. **Memory leaks**: Ensure proper cleanup in ngOnDestroy
5. **Missing translations**: Check browser console for missing key warnings

### Debug Commands
```typescript
// Check current language
console.log('Current language:', this.translationService.getCurrentLanguage());

// Test translation key
console.log('Translation:', this.translationService.translate('test.key'));

// Check if subscription is working
this.translationService.currentLanguage$.subscribe(lang => 
  console.log('Language changed to:', lang)
);
```

## Performance Considerations

- Translation service uses BehaviorSubject for efficient updates
- Change detection is optimized with NgZone
- Subscriptions are properly cleaned up to prevent memory leaks
- Translation keys are cached for performance

## Summary

This translation system provides:
- ✅ Real-time language switching without page reloads
- ✅ Comprehensive coverage of all UI elements
- ✅ Consistent Slovak business terminology
- ✅ Efficient change detection and performance
- ✅ Proper memory management
- ✅ Type-safe implementation

Follow this guide systematically to ensure complete and consistent translation implementation across all components.
