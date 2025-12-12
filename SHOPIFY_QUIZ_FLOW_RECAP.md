# Shopify Quiz Creation & Editing Flow - Complete Recap

## Overview
When a Shopify merchant creates or edits a quiz through your app, the system automatically creates/updates a Shopify page that displays the quiz as a full-page iframe experience on their store.

---

## 🆕 **Quiz Creation Flow**

### Step 1: Database Transaction Starts
- User submits quiz creation form (title, questions, options, styling, etc.)
- Backend starts a PostgreSQL transaction (`BEGIN`)
- Quiz is created in `quizzes` table with:
  - `quiz_id` (auto-generated)
  - `shop_id` (links to Shopify shop)
  - `user_id` = `null` (Shopify users don't have user_id)
  - All quiz metadata (colors, logo, product URL, etc.)

### Step 2: Questions & Options Created
- For each question in the payload:
  - Insert into `questions` table with `quiz_id` foreign key
  - Insert all answer options into `answer_options` table
- Questions are linked via `question_id` foreign key

### Step 3: Shopify Page Creation (if `shopId` exists)

#### **Current Implementation (Default Template Approach)**
The code currently uses the **default page template** approach because the exemption was pending:

1. **Generate Iframe HTML Content**
   - Calls `ShopifyTemplateGenerator.generateQuizIframeTemplate(quizId, shopDomain, frontendUrl)`
   - Returns HTML content with:
     - CSS to hide page title, header, footer
     - CSS to break out of theme containers (100vw, 100vh)
     - `<div id="quiz-container">` with iframe
     - JavaScript to:
       - Dynamically hide page titles
       - Override parent container constraints
       - Setup iframe with UTM parameter passing
       - Handle quiz completion redirects
       - Use MutationObserver for dynamic DOM changes

2. **Create Shopify Page**
   - Calls `ShopifyPagesService.createPage(shopDomain, accessToken, { title, body, handle })`
   - Uses GraphQL `pageCreate` mutation
   - **No `templateSuffix`** - uses default page template
   - The iframe HTML goes into the `body` field
   - Page is published immediately (`isPublished: true`)
   - Returns `pageId` and `handle`

3. **Update Quiz Record**
   - Updates `quizzes` table with:
     - `shopify_page_id` = numeric page ID
     - `shopify_page_handle` = URL handle (e.g., "quiz-19")

4. **Transaction Commits**
   - All database changes are committed
   - Quiz is now live with Shopify page URL: `{shopDomain}/pages/{handle}`

#### **⚠️ Note: After Exemption Approval**
Now that the exemption is approved, you should switch to the **custom template approach**:

1. **Get Active Theme**
   - Call `ShopifyThemesService.getActiveThemeGid(shopDomain, accessToken)`
   - Returns theme GID: `gid://shopify/Theme/{id}`

2. **Generate Full Liquid Template**
   - Call `ShopifyTemplateGenerator.generateFullLiquidTemplate(quizId, shopDomain, frontendUrl)`
   - Returns complete HTML document (with `<!DOCTYPE html>`, `<head>`, `<body>`)
   - This is a standalone template file

3. **Upload Template File**
   - Call `ShopifyThemeAssetsService.createQuizAppTemplate(shopDomain, accessToken, themeGid, templateContent)`
   - Uses GraphQL `themeFilesUpsert` mutation
   - Uploads file: `templates/page.quiz-app-iframe.liquid`
   - Converts theme GID from `gid://shopify/Theme/{id}` to `gid://shopify/OnlineStoreTheme/{id}`

4. **Create Shopify Page with Custom Template**
   - Call `ShopifyPagesService.createPage()` with `templateSuffix: "quiz-app-iframe"`
   - Shopify will use the custom template file instead of default
   - Page gets full control over layout (no theme header/footer)

---

## ✏️ **Quiz Editing Flow**

### Step 1: Ownership Verification
- Verify user owns the quiz (check `shop_id` matches)
- Start database transaction

### Step 2: Update Quiz Metadata
- Update `quizzes` table with new title, colors, product URL, etc.
- Encrypt Facebook Pixel token if provided

### Step 3: Questions & Options Update (Complex Logic)
- **Archive removed questions/options** (soft delete: `is_archived = true`)
- **Temporarily move existing questions** to negative `sequence_order` (prevents conflicts)
- **Update existing questions** or **insert new ones**
- **Update existing options** (preserve `associated_value` if they have user answers)
- **Insert new options** for new questions
- Verify at least one active question remains

### Step 4: Shopify Page Update (if `shopId` exists)

#### **Current Implementation (Default Template)**
1. Check if quiz has existing `shopify_page_id`
2. If exists:
   - Regenerate iframe HTML with `generateQuizIframeTemplate()`
   - Call `ShopifyPagesService.updatePage()` to update `body` field
   - Update page `title` if quiz name changed
3. If doesn't exist:
   - Create new page (same as creation flow)

#### **⚠️ After Exemption Approval**
1. Check if quiz has existing `shopify_page_id`
2. If exists:
   - Regenerate full Liquid template
   - Update template file via `themeFilesUpsert`
   - Update Shopify page (body and title)
3. If doesn't exist:
   - Follow full creation flow with custom template

---

## 🗑️ **Quiz Deletion Flow**

### Step 1: Ownership Verification
- Verify user owns the quiz

### Step 2: Delete Shopify Page (if exists)
- If `shopify_page_id` exists:
  - Call `ShopifyPagesService.deletePage(shopDomain, accessToken, pageId)`
  - Uses GraphQL `pageDelete` mutation
  - Converts numeric ID to GID: `gid://shopify/OnlineStorePage/{id}`
- **Note**: Template file is NOT deleted (can be reused for other quizzes)

### Step 3: Delete Quiz from Database
- Delete quiz record (CASCADE deletes questions, options, sessions, answers)
- Commit transaction

---

## 📋 **Key Services & Their Roles**

### `QuizCreationService`
- **Main orchestrator** for quiz CRUD operations
- Handles database transactions
- Coordinates Shopify page creation/update/deletion
- **Location**: `src/services/QuizCreationService.ts`

### `ShopifyPagesService`
- Handles Shopify page CRUD via GraphQL Admin API
- Methods:
  - `createPage()` - Creates page with `pageCreate` mutation
  - `updatePage()` - Updates page with `pageUpdate` mutation
  - `deletePage()` - Deletes page with `pageDelete` mutation
  - `getPage()` - Retrieves page data
- **Location**: `src/services/shopify/ShopifyPagesService.ts`

### `ShopifyThemesService`
- Retrieves active theme information
- Methods:
  - `getActiveThemeGid()` - Returns full theme GID string
  - `getActiveThemeId()` - Returns numeric theme ID (deprecated)
- **Location**: `src/services/shopify/ShopifyThemesService.ts`

### `ShopifyThemeAssetsService`
- Manages Liquid template files in themes
- Methods:
  - `upsertTemplateFile()` - Uploads/updates template file via `themeFilesUpsert`
  - `createQuizAppTemplate()` - Creates `page.quiz-app-iframe.liquid`
  - `deleteTemplateFile()` - Deletes template (sets content to empty)
  - `deleteQuizAppTemplate()` - Deletes quiz template
- **Location**: `src/services/shopify/ShopifyThemeAssetsService.ts`

### `ShopifyTemplateGenerator`
- Generates HTML/Liquid content for Shopify pages
- Methods:
  - `generateQuizIframeTemplate()` - Returns body HTML (for default template)
  - `generateFullLiquidTemplate()` - Returns complete HTML document (for custom template)
- **Location**: `src/services/shopify/ShopifyTemplateGenerator.ts`

---

## 🔑 **Key GraphQL Mutations Used**

### `pageCreate`
```graphql
mutation pageCreate($page: PageCreateInput!) {
  pageCreate(page: $page) {
    page { id, handle, title }
    userErrors { field, message }
  }
}
```
- Creates a new Shopify page
- Input: `title`, `body`, `handle`, `isPublished`, `templateSuffix` (optional)

### `pageUpdate`
```graphql
mutation pageUpdate($id: ID!, $page: PageUpdateInput!) {
  pageUpdate(id: $id, page: $page) {
    page { id, handle, title }
    userErrors { field, message }
  }
}
```
- Updates existing Shopify page
- Requires page GID: `gid://shopify/OnlineStorePage/{id}`

### `pageDelete`
```graphql
mutation pageDelete($id: ID!) {
  pageDelete(id: $id) {
    deletedId
    userErrors { field, message }
  }
}
```
- Deletes a Shopify page
- Requires page GID

### `themeFilesUpsert`
```graphql
mutation themeFilesUpsert($files: [OnlineStoreThemeFilesUpsertFileInput!]!, $themeId: ID!) {
  themeFilesUpsert(files: $files, themeId: $themeId) {
    upsertedThemeFiles { filename }
    userErrors { field, message }
  }
}
```
- Uploads/updates theme files (requires `write_themes` exemption)
- Requires theme GID: `gid://shopify/OnlineStoreTheme/{id}`

---

## 🎯 **Current State vs. Post-Exemption**

### **Current State (Default Template)**
- ✅ Quiz creation works
- ✅ Quiz editing works
- ✅ Quiz deletion works
- ⚠️ Uses default page template (iframe in `body_html`)
- ⚠️ Limited control over layout (CSS/JS tries to override theme)
- ⚠️ May have height/width issues with some themes

### **Post-Exemption (Custom Template)**
- ✅ Full control over page layout
- ✅ No theme header/footer (clean full-page experience)
- ✅ Reliable full-height/width iframe
- ✅ Better user experience
- ⚠️ Requires updating `QuizCreationService.createQuiz()` and `updateQuiz()`

---

## 📝 **Next Steps**

Now that the exemption is approved, you should:

1. **Update `QuizCreationService.createQuiz()`**:
   - Get active theme GID
   - Generate full Liquid template
   - Upload template file
   - Create page with `templateSuffix: "quiz-app-iframe"`

2. **Update `QuizCreationService.updateQuiz()`**:
   - Update template file if quiz changes
   - Ensure page uses custom template

3. **Test the custom template approach**:
   - Create a test quiz
   - Verify template file is created
   - Verify page uses custom template
   - Verify full-height iframe works

---

## 🔍 **Error Handling**

- All Shopify operations are wrapped in try-catch
- Errors are logged but **don't fail quiz creation/update**
- Quiz can exist without Shopify page (graceful degradation)
- Database transaction ensures data consistency

---

## 📊 **Database Schema**

### `quizzes` table
- `quiz_id` (PK)
- `shop_id` (FK to `shops` table)
- `shopify_page_id` (numeric Shopify page ID)
- `shopify_page_handle` (URL handle, e.g., "quiz-19")
- Other quiz metadata...

### `questions` table
- `question_id` (PK)
- `quiz_id` (FK)
- `sequence_order`
- Question content...

### `answer_options` table
- `option_id` (PK)
- `question_id` (FK)
- `associated_value`
- Option content...

---

## 🚀 **Example Flow**

1. Merchant creates quiz "Product Finder Quiz"
2. Backend creates quiz in database (ID: 19)
3. Backend creates Shopify page:
   - Title: "Product Finder Quiz"
   - Handle: "quiz-19"
   - Body: iframe HTML
4. Backend updates quiz record:
   - `shopify_page_id` = 123456
   - `shopify_page_handle` = "quiz-19"
5. Merchant can access quiz at:
   - `https://store.myshopify.com/pages/quiz-19`
6. Page displays full-screen quiz iframe

---

## 📚 **Related Files**

- `src/services/QuizCreationService.ts` - Main quiz CRUD logic
- `src/services/shopify/ShopifyPagesService.ts` - Page CRUD operations
- `src/services/shopify/ShopifyThemesService.ts` - Theme operations
- `src/services/shopify/ShopifyThemeAssetsService.ts` - Template file operations
- `src/services/shopify/ShopifyTemplateGenerator.ts` - Template generation
- `src/routes/admin.ts` - Express routes that call QuizCreationService

---

**Last Updated**: After exemption approval (Dec 9, 2025)

