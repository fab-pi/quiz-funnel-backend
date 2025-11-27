# Analytics Data Analysis Report
**Quiz ID:** 1  
**Date:** November 27, 2025

---

## Executive Summary

This report documents the findings from comprehensive testing of the analytics queries and data integrity for Quiz ID 1. **Critical issues were identified** that explain why the analytics page shows incorrect data (9 views vs 22 answers).

---

## 🚨 Critical Issues Found

### Issue #1: Multiple Answers Per Session Per Question
**Severity:** CRITICAL  
**Impact:** Incorrect answer counts and percentages

**Problem:**
- The same session can submit multiple answers to the same question
- This causes answer counts to exceed view counts
- Example: Question 1 shows 9 views but 22 answers

**Root Cause:**
The database allows multiple `user_answers` records for the same `session_id` and `question_id` combination. There is no unique constraint preventing duplicate answers.

**Evidence:**
- Session `1ba9e964-656a-4546-84ec-099a00e5b648`: 4 answers to Question 1
- Session `9ab402c2-d069-4c1b-9b0c-b39ad3993f52`: 2 answers to Question 1
- Session `9bb03c99-...`: 5 answers to Question 1
- Session `ccbaea7b-894f-4814-8d60-53e3f8cec0b0`: 8 answers to Question 1
- Session `ec581866-a02f-4363-88a3-77b03ed42503`: 2 answers to Question 1

**Current Behavior:**
- Query counts ALL answers: `COUNT(ua.answer_id)` = 22
- But only 6 unique sessions answered Question 1
- This results in: 22 answers / 9 views = 244.4% answer rate (impossible!)

**Expected Behavior:**
- Should count unique sessions that answered: `COUNT(DISTINCT ua.session_id)` = 6
- Or implement business logic to only count the latest answer per session

---

### Issue #2: Query Logic Mismatch
**Severity:** HIGH  
**Impact:** Incorrect metrics calculation

**Problem:**
The `getQuestionDetails` query uses `COUNT(ua.answer_id)` which counts all answer records, not unique sessions that answered. This creates a mismatch with the view calculation which correctly counts unique sessions.

**Current Query Logic:**
```sql
question_answers AS (
  SELECT 
    q.question_id,
    COUNT(ua.answer_id) as answers  -- ❌ Counts all answers, including duplicates
  FROM questions q
  LEFT JOIN user_answers ua ON ua.question_id = q.question_id
  LEFT JOIN filtered_sessions fs ON fs.session_id = ua.session_id
  ...
)
```

**Recommended Fix:**
```sql
question_answers AS (
  SELECT 
    q.question_id,
    COUNT(DISTINCT ua.session_id) as answers  -- ✅ Count unique sessions
  FROM questions q
  LEFT JOIN user_answers ua ON ua.question_id = q.question_id
  LEFT JOIN filtered_sessions fs ON fs.session_id = ua.session_id
  ...
)
```

**Alternative:** If business logic requires counting all answers (e.g., for A/B testing), then the view calculation should also be adjusted to match.

---

## ✅ Verified Correct Behaviors

### Date Range Filtering
**Status:** ✅ WORKING CORRECTLY

The date range selector is properly applied to:
- `getQuizStats` - Filters sessions by `start_timestamp`
- `getQuestionDetails` - Filters via `filtered_sessions` CTE
- `getAnswerDistribution` - Filters via session join
- `getDailyActivity` - Filters by `start_timestamp`

**Test Results:**
- Without date filter: 9 sessions, 22 answers
- With date filter (last 30 days): 9 sessions, 22 answers (all within range)

---

### View Calculation Logic
**Status:** ✅ WORKING CORRECTLY

The view calculation correctly counts unique sessions that reached each question:
```sql
COUNT(DISTINCT us.session_id) as views
WHERE (us.last_question_viewed >= q.question_id OR us.last_question_viewed IS NULL)
```

**Test Results for Question 1:**
- Total sessions: 9
- Sessions that reached question: 9
- Sessions that continued past question: 6
- Sessions that stopped at question: 0

This logic is correct and matches expected behavior.

---

### Data Integrity
**Status:** ✅ NO ORPHANED DATA

Tests confirmed:
- No orphaned answers (all answers have valid sessions)
- No cross-quiz answers (all answers belong to correct quiz)
- Foreign key constraints are working correctly

---

## 📊 Detailed Test Results

### Test 1: Raw Data Counts
- **Total Sessions:** 9
- **Total Answers:** 22 (across all questions)
- **Question 1 Answers:** 22
- **Question 2 Answers:** 0
- **Question 1 Views:** 9
- **Question 2 Views:** 9

### Test 2: Question Details Query Replication
**Question 1:**
- Views: 9 ✅
- Answers: 22 ❌ (should be 6 unique sessions)
- Answer Rate: 244.44% ❌ (impossible, should be 66.67%)
- Drop Rate: -144.44% ❌ (impossible, should be 33.33%)

**Question 2:**
- Views: 9 ✅
- Answers: 0 ✅
- Answer Rate: 0.00% ✅
- Drop Rate: 100.00% ✅

### Test 3: Data Integrity Check
- **Orphaned Answers:** 0 ✅
- **Cross-Quiz Answers:** 0 ✅
- **Answers > Views:** 1 question (Question 1) ❌

### Test 4: View Calculation Logic
- Logic correctly identifies sessions that reached each question
- Handles `last_question_viewed` NULL values correctly
- Correctly counts sessions that continued past questions

### Test 5: Answer Calculation Logic
- **Question 1:**
  - Total answers: 22
  - Unique sessions with answers: 6
  - This confirms the duplicate answer issue

### Test 6: Date Range Filtering
- Date filter correctly applied to all queries
- Filtering works for both start and end dates
- No issues with timezone handling

### Test 7: Session-Answer Relationship
- **Duplicate Answers Found:** 4 sessions with multiple answers to Question 1
- **Total Duplicate Answer Records:** 16 (22 total - 6 unique sessions = 16 duplicates)

---

## 🔍 Root Cause Analysis

### Why Multiple Answers Exist

The application allows users to submit multiple answers to the same question within the same session. This could be:
1. **Intentional Design:** For A/B testing or allowing users to change their answer
2. **Bug:** The frontend/backend should prevent duplicate submissions
3. **Testing:** Multiple test submissions from the same session

**Evidence from Timestamps:**
- Answers are submitted minutes apart (e.g., 22:38:01, 22:38:08, 22:39:59)
- Same session, same question, different timestamps
- Suggests users are actively changing their answers or the system allows re-submission

---

## 📋 Recommendations

### Immediate Fixes (High Priority)

1. **Fix Answer Counting Logic**
   - Change `COUNT(ua.answer_id)` to `COUNT(DISTINCT ua.session_id)` in `getQuestionDetails`
   - This will make answer counts match view counts (both count unique sessions)
   - Update answer rate calculation: `unique_sessions_answered / unique_sessions_viewed`

2. **Fix Answer Distribution Query**
   - Ensure it only counts unique sessions or latest answer per session
   - Currently may show inflated selection counts

3. **Add Business Logic Decision**
   - Decide: Should we count all answers or only unique sessions?
   - If counting all answers is intentional, update view calculation to match
   - Document the decision in code comments

### Long-term Improvements (Medium Priority)

1. **Database Constraint**
   - Consider adding a unique constraint: `(session_id, question_id)` if only one answer per session is allowed
   - Or add a `is_latest` flag to track the most recent answer

2. **Data Cleanup**
   - If duplicate answers are not intentional, create a migration to keep only the latest answer per session per question

3. **Frontend Prevention**
   - Add logic to prevent multiple submissions of the same question
   - Or clearly indicate when an answer is being updated vs. first submitted

---

## 📈 Expected Results After Fix

**Question 1 (After Fix):**
- Views: 9 ✅
- Answers: 6 ✅ (unique sessions that answered)
- Answer Rate: 66.67% ✅ (6/9)
- Drop Rate: 33.33% ✅ (3/9)

**Question 2:**
- Views: 9 ✅
- Answers: 0 ✅
- Answer Rate: 0.00% ✅
- Drop Rate: 100.00% ✅

---

## 🧪 Test Scripts Created

1. **`test-analytics-queries.ts`** - Comprehensive test suite
2. **`analyze-duplicate-answers.ts`** - Detailed duplicate answer analysis

Both scripts can be run with:
```bash
npx ts-node src/scripts/test-analytics-queries.ts
npx ts-node src/scripts/analyze-duplicate-answers.ts
```

---

## Conclusion

The analytics queries are **functionally correct** but use **incorrect counting logic** for answers. The date range filtering works correctly. The main issue is that the system allows and counts multiple answers per session per question, which creates impossible metrics (answer rate > 100%).

**Priority:** Fix the answer counting logic to use `COUNT(DISTINCT session_id)` instead of `COUNT(answer_id)` to align with the view counting logic.

---

**Report Generated:** November 27, 2025  
**Test Environment:** Production Database (Quiz ID: 1)

