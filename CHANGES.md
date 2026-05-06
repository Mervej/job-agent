# Job Agent Enhancement: Dual-Page Support

## Overview
The job agent now intelligently handles both scenarios where:
1. Job description and apply button are on the **same page**
2. Job description and application form are on **different pages**

## Key Changes

### 1. JobDescription Interface (`src/services/job-crawler.ts`)
Added optional `applyLink` field:
```typescript
export interface JobDescription {
  title: string;
  company: string;
  description: string;
  location?: string;
  salary?: string;
  requirements?: string[];
  benefits?: string[];
  url: string;
  applyLink?: string; // NEW: Link to apply page if different from job description page
}
```

### 2. Apply Link Detection (`src/services/job-crawler.ts`)
Enhanced `crawlJobDescription()` to detect apply buttons using multiple heuristics:

**Detection Strategy:**
- Button text containing "apply now" or "apply"
- Links with `/apply` in the URL
- Aria labels containing "apply"
- Data-testid attributes containing "apply"
- Class names containing "apply"
- Text containing "apply" or "submit application"

**Returns:**
- Non-empty `applyLink` if button links to different page
- Empty string if apply button is on same page (or no button found)

### 3. Dynamic Form Filling (`src/services/application-filler.ts`)

#### Updated Method Signature:
```typescript
async fillApplication(
  jobUrl: string,
  userProfile: UserProfile,
  coverLetter: string,
  resumePath: string,
  applyLink?: string  // NEW: Navigate here if different from jobUrl
): Promise<ApplicationResult>
```

#### Smart URL Routing:
```typescript
const formUrl = applyLink && applyLink !== jobUrl ? applyLink : jobUrl;
await page.goto(formUrl, { waitUntil: 'networkidle' });
```

#### Enhanced Form Field Detection (50+ selectors):
**Name Fields:**
- `input[name*="first"]`, `input[name="firstName"]`, `input[name="first_name"]`, etc.

**Email Fields:**
- `input[type="email"]`, `input[name*="email"]`, `input[name="emailAddress"]`, etc.

**Phone Fields:**
- `input[type="tel"]`, `input[name*="phone"]`, `input[name="phoneNumber"]`, etc.

**Cover Letter Fields:**
- `textarea[name*="cover"]`, `textarea[placeholder*="motivation"]`, `textarea[placeholder*="why"]`, etc.

**Location Fields:**
- `input[name*="location"]`, `input[placeholder*="city"]`, etc.

### 4. Robust Submit Button Detection
Implements multi-strategy approach:

**Strategy 1: Text-Based Matching**
```typescript
const findButtonByText = async (textPatterns: string[]): Promise<boolean> => {
  // Find button by matching text content
  // Checks: button text, value attribute, aria-label
}
```

**Priority Order:**
1. "Submit Application" (highest priority)
2. "Apply Now"
3. "Submit"
4. "Apply"
5. "Send"

**Strategy 2: CSS Selector Fallback**
- `button[type="submit"]`
- `input[type="submit"]`
- `[data-testid*="submit"]`
- `[data-testid*="apply"]`

### 5. API Updates (`src/api/apply.ts`)

#### Passing applyLink through workflow:

**Single Job Application:**
```typescript
const result = await applicationFiller.fillApplication(
  jobUrl,
  userProfile,
  coverLetter,
  resumePath,
  jobDescription.applyLink  // NEW
);
```

**Batch Job Applications:**
```typescript
const applications = coverLetters.map((cl, index) => ({
  jobUrl: cl.jobUrl,
  coverLetter: cl.coverLetter,
  resumePath: path.join(__dirname, '..', 'data', 'resumes', `${resumeId}.pdf`),
  applyLink: jobDescriptions[index].applyLink,  // NEW
}));
```

## Usage Examples

### Example 1: Same-Page Application
**Job Page:** https://example.com/jobs/123
- Contains job description AND application form
- Apply button is on same page

**Flow:**
1. Crawler extracts job info from page
2. Crawler looks for apply button → finds button on same page → returns empty `applyLink`
3. Filler navigates to same URL → fills form on same page

### Example 2: Different-Page Application
**Job Page:** https://stripe.com/jobs/listing/engineer/123
**Apply Page:** https://stripe.com/jobs/apply/123

**Flow:**
1. Crawler extracts job info from listing page
2. Crawler looks for apply button → finds link to `/apply/123` → returns `applyLink`
3. Filler navigates to apply link → fills form on apply page

## Benefits

✅ **Universal Compatibility:** Works with any job board layout
✅ **Automatic Detection:** No manual configuration needed
✅ **Robust Form Finding:** 50+ field selectors for various form styles
✅ **Intelligent Navigation:** Automatically routes to correct page
✅ **Graceful Fallbacks:** Multiple strategies for finding submit buttons
✅ **Error Handling:** Comprehensive error messages and logging

## Testing

### Test Case 1: Same-Page Form
```bash
curl -X POST http://localhost:3000/api/apply/job \
  -H "Content-Type: application/json" \
  -d '{
    "jobUrl": "https://example.com/jobs/123",
    "resumeId": 1
  }'
```

### Test Case 2: Different-Page Form
```bash
curl -X POST http://localhost:3000/api/apply/job \
  -H "Content-Type: application/json" \
  -d '{
    "jobUrl": "https://stripe.com/jobs/listing/...",
    "resumeId": 1
  }'
```

### Test Case 3: Batch with Mixed Scenarios
```bash
curl -X POST http://localhost:3000/api/apply/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "jobUrls": [
      "https://board1.com/jobs/123",
      "https://stripe.com/jobs/listing/...",
      "https://board2.com/jobs/456"
    ],
    "resumeId": 1
  }'
```

## Files Modified

1. **src/services/job-crawler.ts**
   - Added `applyLink` to `JobDescription` interface
   - Enhanced `crawlJobDescription()` with apply button detection

2. **src/services/application-filler.ts**
   - Updated `fillApplication()` to accept optional `applyLink`
   - Enhanced form field selectors (50+ patterns)
   - Implemented text-based submit button detection
   - Updated `processMultipleApplications()` signature

3. **src/api/apply.ts**
   - Single job endpoint: passes `jobDescription.applyLink`
   - Batch endpoint: includes `applyLink` in applications array

4. **USAGE.md**
   - Added comprehensive documentation
   - Included scenario explanations
   - Added implementation details
   - Provided API examples

5. **example-usage.sh**
   - Added examples for both scenarios
   - Mixed-scenario batch example
