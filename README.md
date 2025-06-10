# 🎯 Kvíz App

Interaktívna kvíz aplikácia v reálnom čase podobná Kahoot.com

## 🚀 Spustenie

### 1. Inštalácia
```bash
# Klonuj/vytvor projekt
mkdir kviz-app
cd kviz-app

# Vytvor potrebné adresáre
mkdir public
mkdir questions

# Skopíruj všetky súbory z artifacts
# - package.json (root)
# - server.js (root)
# - public/ súbory (index.html, dashboard.html, app.js, dashboard.js, style.css, manifest.json, sw.js)
# - questions/general.json

# Inštaluj dependencies
npm install
```

### 2. Spustenie servera
```bash
# Development s auto-restart
npm run dev

# Production
npm start
```

### 3. Prístup k aplikácii
- **Dashboard (Moderátor)**: http://localhost:3000/dashboard
- **Klient (Hráči)**: http://localhost:3000

## 📱 Ako používať

### Pre Moderátora:
1. Otvor dashboard: `http://localhost:3000/dashboard`
2. Vytvor novú hru (vybereš kategóriu)
3. Zdieľaj PIN kód hráčom
4. Spusti otázky jedna za druhou
5. Sleduj live štatistiky a leaderboard

### Pre Hráčov:
1. Otvor: `http://localhost:3000` (na telefóne/počítači)
2. Zadaj PIN kód od moderátora
3. Zadaj svoje meno
4. Čakaj na otázky a odpovedaj čo najrýchlejšie!

## 🏗️ Architektúra

### Server (Node.js + Socket.io)
- **Multi-game support** - viacero hier súčasne
- **WebSocket komunikácia** pre real-time updates
- **Time bucketing** (50ms) + latencia kompenzácia pre fair play
- **Automatické skóre** (1000 bodov + speed bonus)

### Klient
- **PWA** - možnosť inštalácie na telefón
- **Responzívny design** - funguje na všetkých zariadeniach  
- **Offline support** cez Service Worker
- **Real-time synchronizácia** otázok

### Dashboard
- **Live štatistiky** odpovedí
- **Leaderboard** v reálnom čase
- **Moderátorské ovládanie** (štart/stop otázok)

## 📊 Features

✅ **Implementované:**
- Vytvorenie hier s PIN kódmi
- Real-time otázky a odpovede
- Bodovací systém s rýchlostným bonusom
- Live leaderboard
- Automatické ukončenie otázok
- PWA support
- Responzívny design
- Latencia kompenzácia
- Multi-category otázky

## 🔧 Konfigurácia

### Pridanie nových otázok
Vytvor súbor `questions/nazov.json`:
```json
{
  "quiz": {
    "title": "Názov kategórie",
    "questions": [
      {
        "id": 1,
        "question": "Text otázky?",
        "options": ["A", "B", "C", "D"],
        "correct": 0,
        "timeLimit": 30
      }
    ]
  }
}
```

### Environment variables
```env
PORT=3000                    # Server port
NODE_ENV=development         # Environment
```

## 🌐 Produkčné nasadenie

### 1. Server setup
```bash
# PM2 pre process management
npm install -g pm2
pm2 start server.js --name quiz-app

# Nginx reverse proxy + Let's Encrypt SSL
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### 2. Nginx konfigurácia
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🎮 Game Flow

```
Moderátor                    Hráči
    |                          |
    | 1. Vytvorí hru            |
    | 2. Dostane PIN: 123456    |
    |                          | 3. Zadajú PIN + meno
    |                          | 4. Pripoja sa k hre
    | 5. Spustí otázku         |
    |                          | 6. Vidia otázku súčasne
    |                          | 7. Odpovedajú (time bucketing)
    | 8. Vidí live štatistiky  |
    | 9. Zobrazí výsledky      | 10. Vidia výsledok + skóre
    | 11. Ďalšia otázka...     |
```

## 🔧 Troubleshooting

### Časté problémy:
1. **Port 3000 obsadený**: Zmeň v `server.js` alebo nastav `PORT=3001`
2. **Socket.io connection failed**: Skontroluj firewall/proxy nastavenia
3. **PWA nefunguje**: Musí byť HTTPS (alebo localhost pre development)

### Debug:
```bash
# Spusti s debug logmi
DEBUG=socket.io* npm start
```

## 📝 TODO (Budúce vylepšenia)

- [ ] Databázové uloženie výsledkov
- [ ] Používateľské kontá a história
- [ ] Vlastné otázky cez UI
- [ ] Audio/video otázky
- [ ] Teamová hra
- [ ] Export výsledkov (CSV/PDF)
- [ ] Admin dashboard pre správu otázok

## 📄 Licencia

MIT License - môžeš použiť pre komerčné i nekomerčné účely.