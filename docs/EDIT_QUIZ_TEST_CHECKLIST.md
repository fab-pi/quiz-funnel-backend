# Checklist Completa: Test Edit Quiz

## ✅ Test già completati
- [x] Modificare nome quiz
- [x] Eliminare una domanda
- [x] Aggiungere una domanda
- [x] Aggiungere un'opzione in una domanda

---

## 📝 Test Quiz Base Info

### Test 1: Modifica Informazioni Base
- [ ] Modificare `quiz_name`
- [ ] Modificare `product_page_url`
- [ ] Modificare `is_active` (attivo/inattivo)
- [ ] Modificare tutti i colori (`color_primary`, `color_secondary`, `color_text_default`, `color_text_hover`)
- [ ] Modificare `brand_logo_url` (sostituire logo esistente con nuovo upload)
- [ ] Verificare che `quiz_id` rimanga identico dopo update
- [ ] Verificare che `quiz_start_url` rimanga identico (non cambia)

---

## ❓ Test Questions

### Test 2: Modifica Question Esistente
- [ ] Modificare testo di una question esistente
- [ ] Modificare `interaction_type` di una question esistente
- [ ] Modificare `sequence_order` di una question (riordinare)
- [ ] Modificare `image_url` di una question (sostituire con nuovo upload)
- [ ] Modificare `instructions_text` (se presente)
- [ ] Modificare `loader_text` (per fake_loader)
- [ ] Modificare `popup_question` (per fake_loader)
- [ ] Rimuovere immagine da una question che ne aveva una

### Test 3: Eliminare Question
- [ ] Eliminare prima question (sequence_order = 0)
- [ ] Eliminare question centrale (es. sequence_order = 1 in quiz con 3 questions)
- [ ] Eliminare ultima question
- [ ] Eliminare tutte le questions tranne una (deve fallire con errore "almeno 1 question attiva")
- [ ] Verificare che question eliminata NON appaia nel quiz pubblico
- [ ] Verificare che question eliminata NON conti nel totale questions della dashboard
- [ ] Verificare che question eliminata NON appaia nell'editor quando riapri il quiz

### Test 4: Aggiungere Question
- [ ] Aggiungere question all'inizio (usando frecce per spostare in alto)
- [ ] Aggiungere question al centro
- [ ] Aggiungere question alla fine
- [ ] Aggiungere question di ogni tipo:
  - [ ] `single_choice`
  - [ ] `multiple_choice`
  - [ ] `image_card`
  - [ ] `fake_loader` (con loader_text e popup_question)
  - [ ] `info_screen` (con Continue button)

### Test 5: Riordinare Questions
- [ ] Spostare prima question in fondo (sequence_order 0 → ultimo)
- [ ] Spostare ultima question in cima (ultimo → 0)
- [ ] Scambiare due questions adiacenti (su/giù)
- [ ] Spostare question centrale in cima
- [ ] Spostare question centrale in fondo
- [ ] Verificare che dopo save, le questions nel quiz pubblico seguano il nuovo ordine

### Test 6: Edge Cases Questions
- [ ] Modificare question e poi eliminarla (prima di salvare)
- [ ] Aggiungere question, poi eliminarla (prima di salvare)
- [ ] Eliminare question, poi aggiungerne una nuova nella stessa posizione
- [ ] Modificare question esistente E aggiungere nuova question nella stessa sessione

---

## 🔘 Test Options

### Test 7: Modifica Option Esistente
- [ ] Modificare `option_text` di un'option esistente
- [ ] Modificare `option_image_url` (sostituire con nuovo upload)
- [ ] Rimuovere immagine da un'option che ne aveva una
- [ ] Modificare option in question `single_choice`
- [ ] Modificare option in question `multiple_choice`
- [ ] Modificare option in question `image_card`

### Test 8: Eliminare Option
- [ ] Eliminare prima option in una question
- [ ] Eliminare option centrale
- [ ] Eliminare ultima option (deve rimanere almeno 1 option)
- [ ] Eliminare tutte le options tranne una
- [ ] Eliminare option che ha risposte utente (dovrebbe rimanere attiva per data integrity)
- [ ] Verificare che option eliminata NON appaia nel quiz pubblico
- [ ] Verificare che option eliminata NON appaia nell'editor quando riapri il quiz

### Test 9: Aggiungere Option
- [ ] Aggiungere option a question `single_choice`
- [ ] Aggiungere option a question `multiple_choice`
- [ ] Aggiungere option a question `image_card`
- [ ] Aggiungere multiple options in sequenza
- [ ] Aggiungere option con immagine

### Test 10: Riordinare Options
- [ ] Spostare prima option in fondo (usando frecce)
- [ ] Spostare ultima option in cima
- [ ] Scambiare due options adiacenti
- [ ] Spostare option centrale in cima
- [ ] Spostare option centrale in fondo
- [ ] Verificare che dopo save, le options nel quiz pubblico seguano il nuovo ordine

### Test 11: Edge Cases Options
- [ ] Modificare option e poi eliminarla (prima di salvare)
- [ ] Aggiungere option, poi eliminarla (prima di salvare)
- [ ] Eliminare option, poi aggiungerne una nuova nella stessa posizione
- [ ] Modificare option esistente E aggiungere nuova option nella stessa sessione

---

## 🖼️ Test File Upload

### Test 12: Upload Immagini
- [ ] Caricare nuovo brand logo (sostituendo uno esistente)
- [ ] Caricare immagine per question (nuova question)
- [ ] Sostituire immagine esistente di question con nuova
- [ ] Caricare immagine per option (nuova option)
- [ ] Sostituire immagine esistente di option con nuova
- [ ] Caricare multiple immagini in una sessione (logo + question image + option images)
- [ ] Verificare che immagini vengano mostrate correttamente nel preview durante editing
- [ ] Verificare che immagini vengano mostrate correttamente nel quiz pubblico dopo save

---

## 🔄 Test Combinazioni Complesse

### Test 13: Operazioni Multiple
- [ ] Eliminare 1 question + aggiungere 1 question nuova + modificare 1 question esistente
- [ ] Eliminare 2 questions + aggiungere 2 questions nuove + riordinare le rimanenti
- [ ] Modificare question + eliminare sua option + aggiungere nuova option + modificare altra option
- [ ] Eliminare question con options + aggiungere nuova question con options
- [ ] Modificare tutti i colori + modificare logo + aggiungere question + eliminare question

### Test 14: Validazioni
- [ ] Tentare di salvare quiz senza nome (deve dare errore)
- [ ] Tentare di salvare quiz senza `product_page_url` (deve dare errore)
- [ ] Tentare di salvare quiz senza questions (deve dare errore "almeno 1 question")
- [ ] Tentare di salvare question senza testo (deve dare errore)
- [ ] Tentare di salvare question senza options (per single/multiple choice, deve dare errore)
- [ ] Tentare di salvare con `sequence_order` duplicati (frontend dovrebbe riordinare automaticamente)
- [ ] Tentare di archiviare tutte le questions (deve dare errore "almeno 1 question attiva")

---

## 🌐 Test Integrazione Quiz Pubblico

### Test 15: Verifica Quiz Pubblico dopo Edit
- [ ] Dopo eliminare question, verificare che quiz pubblico mostri solo questions attive
- [ ] Dopo aggiungere question, verificare che appaia nel quiz pubblico
- [ ] Dopo modificare testo question, verificare che cambi nel quiz pubblico
- [ ] Dopo riordinare questions, verificare che ordine sia corretto nel quiz pubblico
- [ ] Dopo eliminare option, verificare che non appaia nel quiz pubblico
- [ ] Dopo modificare colore, verificare che cambi nel quiz pubblico
- [ ] Dopo modificare logo, verificare che cambi nel quiz pubblico
- [ ] Verificare che `quiz_id` rimanga identico (link quiz funziona ancora)

---

## 📊 Test Dashboard e Analytics

### Test 16: Verifica Dashboard
- [ ] Dopo eliminare question, verificare che conteggio `total_questions` diminuisca nella dashboard
- [ ] Dopo aggiungere question, verificare che conteggio `total_questions` aumenti nella dashboard
- [ ] Verificare che quiz con questions archiviate mostri conteggio corretto (solo attive)
- [ ] Verificare che "Quiz Dashboard" mostri metriche corrette dopo edit

### Test 17: Verifica Analytics
- [ ] Verificare che Drop Rate Analytics mostri solo questions attive (non archiviate)
- [ ] Verificare che Drop Rate Analytics con `?includeArchived=true` mostri anche archiviate
- [ ] Verificare che UTM Performance Analytics non cambi dopo edit (non dipende da questions)
- [ ] Verificare che Completion Rate non cambi dopo edit (basato su sessions)

---

## 💾 Test Preservazione Dati Storici

### Test 18: Dati Storici
- [ ] Creare quiz con 3 questions
- [ ] Ricevere alcune risposte utente (user_answers)
- [ ] Archiviare 1 question (eliminare dall'editor)
- [ ] Verificare che `user_answers` esistenti siano ancora nel database (non perse)
- [ ] Verificare che analytics storiche mostrino ancora i dati per question archiviata
- [ ] Modificare option che ha già risposte utente (verificare che `associated_value` non cambi se ci sono risposte)
- [ ] Eliminare option che ha risposte (verificare che rimanga attiva per data integrity)

---

## 🔗 Test Link e URL

### Test 19: Link Quiz
- [ ] Dopo edit, verificare che `quiz_start_url` rimanga identico
- [ ] Dopo edit, verificare che link `/quiz/[quizId]` funzioni ancora
- [ ] Dopo edit, verificare che iframe embed code rimanga valido
- [ ] Verificare che link condiviso funzioni ancora dopo edit

---

## 🔄 Test Ripristino e Rollback

### Test 20: Comportamento Save/Cancel
- [ ] Fare modifiche, poi cliccare "Cancel" (deve annullare senza salvare)
- [ ] Fare modifiche, salvare, poi verificare che modifiche siano persistenti
- [ ] Fare modifiche, ricaricare pagina (senza salvare), verificare che si perdano
- [ ] Fare modifiche, salvare, ricaricare pagina, verificare che rimangano

---

## 🎯 Test Casi Speciali per Tipo Question

### Test 21: Fake Loader
- [ ] Modificare `loader_text` di fake_loader esistente
- [ ] Modificare `popup_question` di fake_loader esistente
- [ ] Aggiungere immagine a fake_loader
- [ ] Eliminare fake_loader
- [ ] Aggiungere nuovo fake_loader

### Test 22: Info Screen
- [ ] Modificare testo di info_screen esistente
- [ ] Modificare testo del Continue button
- [ ] Aggiungere immagine a info_screen
- [ ] Eliminare info_screen
- [ ] Aggiungere nuovo info_screen

### Test 23: Image Card
- [ ] Modificare testo di image_card esistente
- [ ] Modificare immagini delle options
- [ ] Aggiungere nuove options con immagini
- [ ] Eliminare option con immagine

---

## ⚡ Test Performance e Edge Cases

### Test 24: Performance
- [ ] Edit quiz con molte questions (10+)
- [ ] Edit quiz con molte options per question (5+ options)
- [ ] Upload multiple immagini grandi simultaneamente
- [ ] Edit quiz mentre altri utenti stanno facendo il quiz (verificare che non si rompa)

### Test 25: Edge Cases Estremi
- [ ] Edit quiz vuoto (appena creato, nessuna question ancora)
- [ ] Edit quiz con tutte le questions archiviate (deve dare errore)
- [ ] Edit quiz con sequence_order non consecutivi dopo archiviazione
- [ ] Edit quiz mentre è inattivo (`is_active = false`)
- [ ] Cambiare `is_active` da true a false e viceversa

---

## ✅ Checklist Finale Post-Test

Dopo aver completato tutti i test, verifica:

- [ ] Tutti i test base passano
- [ ] Nessun dato storico perso
- [ ] Quiz pubblico mostra solo questions/options attive
- [ ] Dashboard mostra conteggi corretti
- [ ] Analytics funzionano correttamente
- [ ] Link quiz rimane identico
- [ ] Immagini vengono caricate e mostrate correttamente
- [ ] Validazioni bloccano input invalidi
- [ ] Error messages sono chiari e informativi
- [ ] Performance accettabile anche con molti elementi

---

## 📝 Note per il Testing

1. **Test sequenziali**: Alcuni test dipendono da altri (es. eliminare question richiede che ne esista una)
2. **Backup dati**: Prima di test estremi, fai backup del database
3. **Log console**: Controlla console browser e server per errori nascosti
4. **Network tab**: Verifica che le chiamate API siano corrette
5. **Database**: Verifica direttamente nel DB che `is_archived` sia settato correttamente

---

## 🐛 Segnalazione Problemi

Se trovi problemi durante i test, annota:
1. Quale test ha fallito
2. Cosa hai fatto esattamente
3. Quale errore hai ricevuto (screenshot/messaggio)
4. Stato del database prima e dopo l'operazione

