### Dashboard
- **Live štatistiky** odpovedí
- **Leaderboard** v reálnom čase
- **Moderátorské ovládanie** (štart/stop otázok)

### Panel View (Projektor)
- **Veľké zobrazenie** otázok a odpovedí
- **Automatická synchronizácia** s hrou
- **Bez správnych odpovedí** (fair play)
- **Optimalizované pre projektory** a veľké monitory
- **Real-time timer** s vizuálnymi upozorneniami
- **Live leaderboard** - priebežné poradie hráčov# 🎯 Kvíz App

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
- **Panel (Projektor)**: http://localhost:3000/panel
- **Klient (Hráči)**: http://localhost:3000

## 📱 Ako používať

### Pre Moderátora:
1. Otvor dashboard: `http://localhost:3000/dashboard`
2. Vytvor novú hru (vybereš kategóriu)
3. Zdieľaj PIN kód hráčom
4. Spusti otázky jedna za druhou
5. Sleduj live štatistiky a leaderboard

### Pre Projektor/Veľký monitor:
1. Otvor panel: `http://localhost:3000/panel`
2. Automaticky zobrazí aktuálnu hru
3. Zobrazuje otázky a odpovede pre všetkých účastníkov
4. Bez označenia správnej odpovede (pre fair play)

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
- **Panel view pre projektory s live leaderboard**

### 📺 Panel View (Projektor)

Panel view je špeciálne rozhranie určené na zobrazenie na projektore alebo veľkom monitore pred všetkými súťažiacimi.

**Funkcie:**
- 📺 **Veľké písmo** optimalizované pre projektory
- ⏰ **Veľký timer** s vizuálnymi upozorneniami
- 🎯 **Zobrazenie PIN kódu** pre pripájanie hráčov
- 📋 **Otázky a odpovede** bez označenia správnej (fair play)
- 🏆 **Live leaderboard** - priebežné poradie hráčov
- 📊 **Výsledky po ukončení** otázky so štatistikami
- 🎨 **Plnohodnotný design** s gradientmi a animáciami

**Použitie:**
1. Pripoj projektor/TV k počítaču
2. Otvor: `http://localhost:3000/panel`
3. Panel sa automaticky synchronizuje s aktuálnou hrou
4. Zobrazuje sa v plnej obrazovke (stlač F11)

**Tip:** Panel môžeš otvoriť aj pred vytvorením hry - automaticky sa pripojí k novej hre keď ju moderátor vytvorí.

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
Moderátor                    Panel (Projektor)           Hráči
    |                             |                        |
    | 1. Vytvorí hru              |                        |
    | 2. Dostane PIN: 123456      |                        |
    |                             | 3. Zobrazí PIN + čaká  |
    |                             |                        | 4. Zadajú PIN + meno
    |                             |                        | 5. Pripoja sa k hre
    | 6. Spustí otázku            |                        |
    |                             | 7. Zobrazí otázku      | 8. Vidia otázku súčasne
    |                             | (bez správnej odpovede)|
    |                             |                        | 9. Odpovedajú (time bucketing)
    | 10. Vidí live štatistiky    |                        |
    | 11. Zobrazí výsledky        | 12. Zobrazí správnu    | 13. Vidia výsledok + skóre
    |                             | odpoveď + štatistiky   |
    | 14. Ďalšia otázka...        |                        |
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