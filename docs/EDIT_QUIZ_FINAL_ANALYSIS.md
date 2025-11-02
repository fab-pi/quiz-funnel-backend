# Analisi Finale: Edit Quiz - Verifica Errori e Incongruenze

## Overview Sistema

Il sistema di edit quiz deve:
1. ✅ Permettere modifiche al quiz senza perdere dati storici
2. ✅ Nascondere questions/options rimosse (soft delete) senza cancellarle
3. ✅ Mantenere il `quiz_id` identico (link invariato)
4. ✅ Preservare tutte le `user_answers` esistenti
5. ✅ Mostrare analytics accurate

---

## Analisi Critica - Possibili Errori e Incongruenze

### 1. Database Schema & Constraints

#### ⚠️ PROBLEMA 1: Constraint `unique_quiz_sequence`

**Schema attuale:**
```sql
ALTER TABLE questions ADD CONSTRAINT unique_quiz_sequence 
UNIQUE (quiz_id, sequence_order);
```

**Scenario Problematico:**
- Question A: `sequence_order = 0`, `is_archived = true`
- Question B: `sequence_order = 1`, `is_archived = false`
- **Update**: Voglio ripristinare A con `sequence_order = 0`
- **ERRORE**: Constraint violation! B ha già `sequence_order = 0` (o no?)

**Analisi:**
- Il constraint `unique_quiz_sequence` NON considera `is_archived`
- Se archiviamo una question con `sequence_order = 0`, possiamo creare una nuova con `sequence_order = 0`
- Ma se ripristiniamo quella archiviata → CONFLITTO!

**Soluzione:**
- **Opzione A**: Modificare constraint per includere `is_archived`:
  ```sql
  CREATE UNIQUE INDEX unique_active_quiz_sequence 
  ON questions(quiz_id, sequence_order) 
  WHERE is_archived = false;
  ```
  Rimuovere constraint vecchio, aggiungere index parziale.

- **Opzione B**: Durante update, riordinare tutte le sequence_order delle questions attive prima di ripristinare

**Raccomandazione: Opzione A** (più pulita)

---

### 2. Update Quiz Logic - Matching Questions

#### ⚠️ PROBLEMA 2: Matching Questions Esistenti

**Scenario:**
- Quiz ha Question ID 5 con `sequence_order = 0`
- Editor invia question con `question_id = 5`, `sequence_order = 2`
- **Cosa facciamo?**
  - UPDATE question_id 5 con nuovo sequence_order?
  - O creiamo nuova question?

**Analisi:**
- Se `question_id` esiste nel payload → deve essere UPDATE, non INSERT
- Se `question_id` esiste nel DB ma NON nel payload → ARCHIVE
- Se `question_id` manca → INSERT nuova

**Soluzione Corretta:**
```typescript
if (question.question_id) {
  // Verifica che esista nel DB e appartenga a questo quiz
  const exists = await client.query(
    'SELECT question_id FROM questions WHERE question_id = $1 AND quiz_id = $2',
    [question.question_id, quizId]
  );
  
  if (exists.rows.length > 0) {
    // UPDATE existing
  } else {
    // Errore: question_id fornito ma non esiste
  }
} else {
  // INSERT new
}
```

---

### 3. Sequence Order - Gestione Archivio/Ripristino

#### ⚠️ PROBLEMA 3: Sequence Order dopo Archivio

**Scenario:**
- Quiz ha 3 questions: [0, 1, 2]
- Archiviamo question con `sequence_order = 1`
- Nuove questions attive: [0, 2]
- **Problema**: Gap nella sequenza! Ora abbiamo [0, 2] invece di [0, 1]

**Analisi:**
- I gap sono OK per il quiz pubblico (filtriamo per `is_archived = false`)
- Ma può essere confuso per l'analytics

**Soluzione:**
- **NON** riordinare automaticamente le sequence_order esistenti
- Quando carichiamo quiz per visualizzazione: filtriamo e mostriamo in base a `sequence_order` (i gap vengono saltati naturalmente)
- Quando ripristiniamo una question archiviata: assegnare `sequence_order` basato sulle questions attive correnti

---

### 4. Options con User Answers - Update Limitato

#### ⚠️ PROBLEMA 4: Update Options con Risposte Storiche

**Scenario:**
- Option ID 10 ha 100 user_answers associate
- Editor cambia `associated_value` da "sales" a "marketing"
- **Cosa succede ai dati storici?**

**Analisi:**
- Se aggiorniamo `associated_value`, i 100 user_answers storici puntano ancora all'option_id 10
- Ma l'`associated_value` è cambiato → i dati storici diventano inconsistenti
- Analytics basate su `associated_value` potrebbero essere errate

**Soluzione Corretta:**
- **NON aggiornare** `associated_value` se ci sono `user_answers` associate
- Aggiornare solo campi "sicuri": `option_text`, `option_image_url`
- Se user vuole cambiare `associated_value`, creare nuova option e archiviare vecchia

---

### 5. Options Archiviate - Logica Complessa

#### ⚠️ PROBLEMA 5: Quando Archiviare Options?

**Scenario:**
- Question ha Option A (100 risposte), Option B (50 risposte), Option C (0 risposte)
- Editor rimuove Option C
- Editor rimuove Option B (ha risposte!)
- **Cosa facciamo?**

**Strategia:**
1. **Option senza risposte** (Option C): ✅ ARCHIVIA (safe)
2. **Option con risposte** (Option B): ⚠️ **NON archiviare** - mantieni attiva per preservare dati storici
   - Oppure: archivia ma avvisa che i dati storici rimangono

**Soluzione:**
- Verificare COUNT di `user_answers` per option prima di archiviare
- Se count > 0: NON archiviare, mantieni attiva (anche se non più nell'editor)
- Se count = 0: ARCHIVIA

**Eccezione:** Se user vuole davvero rimuovere option con risposte, possiamo archiviare comunque (soft delete), ma avvisare che i dati storici sono preservati ma l'option non sarà più visibile nel quiz.

---

### 6. Quiz senza Questions Attive

#### ⚠️ PROBLEMA 6: Tutte Questions Archiviate

**Scenario:**
- Admin archivia tutte le questions per errore
- Quiz pubblico: `/quiz/15` non mostra nessuna question
- Utente vede quiz vuoto!

**Soluzione:**
- Validazione: Quiz deve avere almeno 1 question con `is_archived = false`
- Oppure: Impedire di salvare update che archivia tutte le questions
- Mostrare warning in editor se tutte le questions vengono archiviate

---

### 7. Sessioni Attive durante Update

#### ⚠️ PROBLEMA 7: Race Condition

**Scenario:**
- Utente sta facendo quiz (session attiva)
- Admin salva update che archivia la question corrente dell'utente
- Utente tenta di rispondere → Question non trovata!

**Analisi:**
- `getQuizContent` filtra `is_archived = false`
- Se archiviamo question durante sessione attiva, utente non la vedrà più
- Ma `user_sessions.last_question_viewed` punta ancora a quella question_id

**Soluzione:**
- **NON è un problema critico**: Session attive usano question_id, che esiste ancora (solo archiviata)
- `user_answers` possono ancora essere salvate perché question_id esiste
- Ma se archiviamo question PRIMA che utente la veda → gap nella sequenza
- **Miglioramento futuro**: Lock temporaneo durante update, o queue di update

**Raccomandazione**: Accettabile per ora, migliorabile in futuro

---

### 8. Sequence Order - Duplicati durante Update

#### ⚠️ PROBLEMA 8: Duplicate Sequence Order

**Scenario:**
- Quiz ha Question A (sequence_order = 0), Question B (sequence_order = 1)
- Editor invia: Question A (sequence_order = 0), Question C (sequence_order = 0), Question B (sequence_order = 2)
- **Errore**: Due questions con sequence_order = 0!

**Soluzione:**
- **Validazione nel backend**: Verificare che tutti i `sequence_order` siano unici per quiz (solo tra questions non archiviate)
- Prima di salvare, riordinare automaticamente se ci sono duplicati
- Oppure: Validare nel frontend prima di inviare

---

### 9. GetQuizForEditing vs GetQuizContent

#### ⚠️ PROBLEMA 9: Inconsistenza nelle Query

**Scenario:**
- `getQuizForEditing`: Mostra TUTTE le questions (incluse archiviate)
- `getQuizContent`: Mostra solo `is_archived = false`
- **Risultato**: Editor vede più questions di quante ne vede il quiz pubblico

**Analisi:**
- Questo è CORRETTO e VOLUTO
- Admin deve vedere anche archiviate per ripristinarle
- Quiz pubblico mostra solo attive

**Nessun Problema** ✅

---

### 10. Analytics - Questions Archiviate

#### ⚠️ PROBLEMA 10: Drop Rate con Questions Archiviate

**Scenario:**
- Quiz ha 5 questions attive + 2 archiviate
- Analytics mostra drop rate per tutte le 7?
- O solo per le 5 attive?

**Soluzione (già discussa):**
- Default: Solo attive (`is_archived = false`)
- Opzione: Parametro `includeArchived` per vedere anche archiviate

---

### 11. Foreign Key Constraints

#### ⚠️ PROBLEMA 11: CASCADE Delete Behavior

**Schema:**
```sql
user_answers.question_id → questions.question_id ON DELETE CASCADE
user_answers.selected_option_id → answer_options.option_id ON DELETE CASCADE
```

**Scenario:**
- Se per errore facciamo DELETE fisico invece di UPDATE `is_archived = true`
- Tutte le `user_answers` associate vengono CANCELLATE (CASCADE)

**Protezione:**
- ✅ **NON usare mai DELETE fisico** nelle queries di update
- ✅ Usare solo UPDATE `is_archived = true`
- ✅ Verificare nel codice che non ci sia DELETE sulle questions/options

---

### 12. Ripristinare Questions Archiviate

#### ⚠️ PROBLEMA 12: Ripristino Sequence Order

**Scenario:**
- Question A era `sequence_order = 0`, ora `is_archived = true`
- Question B è ora `sequence_order = 0` (attiva)
- Admin riaggiunge Question A nell'editor → quale `sequence_order` assegnare?

**Soluzione:**
- Se riaggiunta nell'editor: Assegnare `sequence_order` basato sulla posizione nell'editor
- UPDATE `is_archived = false` e `sequence_order` = nuova posizione
- Question B verrà riordinata automaticamente se necessario

---

## Piano di Implementazione

### Fase 1: Database Migration
1. ✅ Verificare che migration 004 esista e sia corretta
2. ✅ Eseguire migration: `npm run migrate`
3. ✅ Verificare che campi `is_archived` siano stati aggiunti
4. ⚠️ **CRITICO**: Modificare constraint `unique_quiz_sequence` per includere `is_archived`

### Fase 2: Backend - QuizContentService
1. Modificare `getQuizContent` per filtrare `is_archived = false`
2. Verificare che query non rompa nulla

### Fase 3: Backend - AnalyticsService
1. Modificare `getDropRateAnalytics` per filtrare `is_archived = false` di default
2. Aggiungere parametro opzionale `includeArchived`
3. Aggiornare route per accettare query param

### Fase 4: Backend - QuizCreationService
1. Creare metodo `updateQuiz(quizId, data)`
2. Implementare logica:
   - UPDATE quiz base info
   - Matching questions (existing vs new)
   - Matching options (existing vs new)
   - Archive questions/options rimosse
   - Validazione sequence_order unici
   - Gestione options con risposte (non aggiornare associated_value)

### Fase 5: Backend - Admin Route
1. Aggiungere route `PUT /admin/quiz/:quizId`
2. Validazione input
3. Chiamata a `updateQuiz`
4. Gestione errori

### Fase 6: Frontend - QuizCreationService
1. Aggiungere metodo `updateQuiz(quizId, formData, ...files)`
2. Logica simile a `createQuiz` ma con PUT request

### Fase 7: Frontend - QuizEditor
1. Modificare `handleSaveQuiz` per chiamare `updateQuiz` quando `mode='edit'`
2. Gestione success/error
3. Refresh dati dopo save

### Fase 8: Testing
1. Test update quiz base info
2. Test update questions esistenti
3. Test aggiungere nuove questions
4. Test archiviare questions (verificare che non appaiano nel quiz pubblico)
5. Test ripristinare questions archiviate
6. Test update options con/senza risposte
7. Test sequence_order duplicati
8. Test analytics con questions archiviate

---

## Checklist Finale - Verifica Errori

- [ ] Migration applicata correttamente
- [ ] Constraint `unique_quiz_sequence` modificato per `is_archived`
- [ ] `getQuizContent` filtra `is_archived = false`
- [ ] `getQuizForEditing` mostra tutte (incluse archiviate)
- [ ] Analytics filtra correttamente
- [ ] Update quiz non fa mai DELETE fisico
- [ ] Options con risposte: non aggiornare `associated_value`
- [ ] Validazione sequence_order unici
- [ ] Validazione almeno 1 question attiva dopo update
- [ ] Gestione ripristino questions archiviate
- [ ] Gestione options archiviate (solo se no risposte)

