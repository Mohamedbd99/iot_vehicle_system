# 🚗 IoT Vehicle Simulator - Instructions

## Problème: Les données ne sont plus envoyées à Firebase

### Solution: Le simulateur doit être lancé manuellement

Le fichier `simulator.js` est un script Node.js qui doit être exécuté en continu pour envoyer des données à Firebase.

## Comment lancer le simulateur:

### Option 1: Via npm script (Recommandé)
```bash
npm run simulator
```
ou
```bash
npm start
```

### Option 2: Directement avec Node.js
```bash
node simulator.js
```

## ⚠️ Important:

1. **Le simulateur doit rester ouvert** - Ne fermez pas le terminal où il tourne
2. **Il envoie des données toutes les 2 secondes** à Firebase
3. **Si vous fermez le terminal, les données s'arrêtent**

## Vérification que ça fonctionne:

1. Ouvrez un terminal
2. Lancez: `npm run simulator`
3. Vous devriez voir:
   ```
   🚀 Starting IoT Vehicle Simulator...
   📡 Connected to Firebase: iot-pro-35cd1
   ⏱️  Pushing data every 2 seconds...
   [HH:MM:SS] Data Pushed: Temp=XX°C, Hum=XX%, Lat=XX.XXXXXX
   ```

4. Ouvrez `index.html` dans votre navigateur
5. Les données devraient apparaître en temps réel

## Si ça ne fonctionne pas:

### Erreur: "Cannot find module 'node-fetch'"
```bash
npm install
```

### Erreur: "Cannot find module 'firebase'"
```bash
npm install firebase
```

### Les données n'apparaissent pas dans le dashboard:
- Vérifiez que le simulateur tourne (terminal ouvert)
- Vérifiez la console du navigateur (F12) pour les erreurs
- Vérifiez que Firebase est bien configuré dans `app.js`

## Améliorations apportées:

✅ Gestion d'erreur améliorée - Le simulateur continue même si les capteurs ESP32 ne répondent pas
✅ Valeurs simulées de secours - Si les capteurs ne sont pas disponibles, utilise des valeurs aléatoires
✅ Logs améliorés - Messages plus clairs pour le débogage
✅ Script npm ajouté - Plus facile à lancer

