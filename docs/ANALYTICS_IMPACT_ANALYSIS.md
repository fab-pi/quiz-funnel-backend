# Impatto di `is_archived` sulle Analytics - Analisi

## Analytics Attuali

### 1. Drop Rate Analytics (`getDropRateAnalytics`)

**Query Attuale:**
```sql
SELECT 
  q.question_id,
  q.question_text,
  COUNT(us.session_id) as reached_count,
  CASE 
    WHEN COUNT(us.session_id) = 0 THEN 0
    ELSE ROUND(
      (COUNT(us.session_id) - COUNT(ua.answer_id))::numeric / COUNT(us.session_id)::numeric * 100, 
      2
    )
  END as drop_rate_percentage
FROM questions q
LEFT JOIN user_sessions us ON us.quiz_id = q.quiz_id 
  AND (us.last_question_viewed >= q.question_id OR us.last_question_viewed IS NULL)
LEFT JOIN user_answers ua ON ua.session_id = us.session_id 
  AND ua.question_id = q.question_id
WHERE q.quiz_id = $1
GROUP BY q.question_id, q.question_text, q.sequence_order
ORDER BY q.sequence_order
```

**Problema Identificato:**
- ❌ La query NON filtra per `is_archived`
- ❌ Le questions archiviate VERRANNO incluse nelle analytics
- ⚠️ Questo significa che l'admin vedrà analytics per questions che non sono più nel quiz attuale

**Impatto:**
- Se archiviamo una question, continuerà ad apparire nelle analytics
- Potrebbe essere confuso vedere drop rate per questions rimosse

### 2. UTM Performance Analytics (`getUTMPerformanceAnalytics`)

**Query Attuale:**
```sql
SELECT 
  COALESCE(utm_params->>'utm_source', 'Direct') as utm_source,
  COALESCE(utm_params->>'utm_campaign', 'N/A') as utm_campaign,
  COUNT(session_id) as total_sessions,
  ROUND(
    COUNT(CASE WHEN is_completed = true THEN 1 END)::numeric / COUNT(session_id)::numeric * 100, 
    2
  ) as completion_rate
FROM user_sessions 
WHERE quiz_id = $1
GROUP BY utm_params->>'utm_source', utm_params->>'utm_campaign'
ORDER BY total_sessions DESC
```

**Analisi:**
- ✅ **NON è influenzato** da `is_archived`
- ✅ Usa solo `user_sessions`, non dipende da questions archiviate
- ✅ Le analytics UTM rimangono accurate indipendentemente dalle questions archiviate

## Strategie Possibili

### Opzione A: Mostrare TUTTE le Questions (Incluse Archiviate)

**Vantaggi:**
- ✅ Dati storici completi visibili
- ✅ Utile per vedere performance storica di questions rimosse
- ✅ Admin può vedere perché una question è stata rimossa (basso drop rate?)

**Svantaggi:**
- ⚠️ Può essere confuso vedere analytics per questions non più attive
- ⚠️ Dashboard più affollata

**Query Modificata:**
```sql
-- Nessuna modifica: mostra tutte le questions
WHERE q.quiz_id = $1
```

### Opzione B: Mostrare Solo Questions Attive

**Vantaggi:**
- ✅ Dashboard più pulita
- ✅ Solo analytics per questions attualmente nel quiz
- ✅ Più intuitivo per l'admin

**Svantaggi:**
- ⚠️ Dati storici delle questions archiviate non visibili
- ⚠️ Se si vuole vedere perché una question è stata rimossa, bisogna cambiare query

**Query Modificata:**
```sql
WHERE q.quiz_id = $1
  AND (q.is_archived = false OR q.is_archived IS NULL)
```

### Opzione C: Filtro Parametrizzato (Raccomandata)

**Vantaggi:**
- ✅ Flessibilità: admin può scegliere cosa vedere
- ✅ Di default mostra solo attive (più pulito)
- ✅ Opzione per vedere anche archiviate (dati storici completi)

**Query Modificata:**
```sql
WHERE q.quiz_id = $1
  AND ($2 = true OR (q.is_archived = false OR q.is_archived IS NULL))
-- $2 = includeArchived (boolean, default false)
```

## Raccomandazione

**Strategia Consigliata: Opzione C con Default "Solo Attive"**

1. **Default**: Mostrare solo questions attive (`is_archived = false`)
2. **Opzione**: Parametro `includeArchived` per vedere anche quelle archiviate
3. **UI Admin**: Checkbox "Show Archived Questions" nell'analytics dashboard

### Modifiche Necessarie

1. **Backend**: Modificare `getDropRateAnalytics` per accettare parametro `includeArchived?`
2. **Backend**: Aggiungere filtro condizionale nella query
3. **Frontend**: Aggiungere checkbox nell'analytics dashboard
4. **Documentazione**: Spiegare che le questions archiviate possono essere incluse per dati storici

## Impact Summary

### ✅ NON Influenzato
- **UTM Performance Analytics**: Funziona indipendentemente da `is_archived`
- **User Sessions Analytics**: Basato su `user_sessions`, non su questions
- **Completion Rate**: Basato su `is_completed`, non su questions archiviate

### ⚠️ Influenzato (Richiede Modifica)
- **Drop Rate Analytics**: Attualmente mostra anche questions archiviate
  - Soluzione: Filtro per `is_archived = false` di default
  - Opzione: Parametro per includere archiviate

### 📊 Dati Storici

**Importante**: Anche se una question è archiviata:
- ✅ Le `user_answers` associate rimangono nel DB
- ✅ Le analytics storiche sono sempre calcolabili (basta includere archiviate)
- ✅ I dati non vengono mai persi

## Test Cases

1. ✅ Analytics con question attiva
2. ✅ Analytics con question archiviata (con `includeArchived = true`)
3. ✅ Analytics senza questions archiviate (con `includeArchived = false`)
4. ✅ Verificare che UTM analytics non cambiano
5. ✅ Verificare che completion rate non cambia

