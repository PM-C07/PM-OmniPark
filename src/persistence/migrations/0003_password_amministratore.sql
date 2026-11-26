-- Reimposta la password dell'Amministratore dei dati di esempio (marco.esposito@omnipark.example).
-- Motivo: la password originale della migrazione 0002 non è più nota a nessuno, e serve per le
-- verifiche di OMP-62 (panoramica degli enti e account degli Ausiliari) e per la presentazione.
-- Decisione dei PM, fuori dal perimetro di COD-21.
-- Nel repository c'è solo l'hash scrypt (formato PHC, gli stessi parametri del dataset), mai la
-- password: la conoscono solo i PM, che la comunicano a chi deve accedere come Amministratore.
-- L'aggiornamento tocca solo l'utente 1 con l'email e il ruolo del dataset: su un database in cui
-- quell'utente non c'è o è diverso, non modifica nulla.
UPDATE utente
SET hash_password = '$scrypt$ln=15,r=8,p=3$ff+5IuCSDuv0AJd3HqfvFw$CujeLUHpwcaKfck7fLtsDle7U5jGtVRHJUUEOnn4GHU'
WHERE id = 1 AND email = 'marco.esposito@omnipark.example' AND ruolo = 'AMMINISTRATORE';
