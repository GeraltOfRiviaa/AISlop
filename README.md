# Jednoduchý Chat (Socket.IO)

Základní chatovací stránka pro komunikaci mezi lidmi. Server běží na Node.js + Express, realtime spojení zajišťuje Socket.IO.

## Rychlý start

1) Nainstaluj závislosti

```powershell
npm install
```

2) Spusť server

```powershell
npm start
```

3) Otevři v prohlížeči: http://localhost:3000

- Otevři stránku ve více oknech/prohlížečích a zkus posílat zprávy.
- Při připojení si zadáš zobrazované jméno (výchozí "Host").

## Struktura

- `server.js` – Express + Socket.IO server
- `public/index.html` – základní UI stránky
- `public/style.css` – jednoduché styly
- `public/client.js` – klientské Socket.IO události a logika

## Perzistence

- Přezdívky jsou trvalé: server přiřadí prohlížeči anonymní `uid` (cookie) a mapuje `uid -> přezdívka` v souboru `data/users.json`.
- Historie: posledních 100 zpráv se ukládá v `data/history.json` a posílá se klientovi při načtení (`/api/bootstrap`).
- Změna přezdívky: obnov stránku, budeš znovu vyzván k zadání (první zadání se uloží a příště se použije automaticky).

## Poznámky

- Výchozí port je `3000` (lze změnit pomocí proměnné prostředí `PORT`).
- Projekt je určen pro lokální použití / demo účely.
