# Mini Marketplace API

Backend частина застосунку електронної комерції (маркетплейс) з адмін-панеллю, підтримкою черг, кешуванням та транзакційним списанням складу.

Застосунок реалізований на **NestJS + TypeScript**, використовує **PostgreSQL** як основну базу даних, **Prisma ORM** для роботи з нею, **Redis + BullMQ** для асинхронної обробки замовлень та **Socket.IO** для real-time оновлень.

---

## Стек

* NestJS
* TypeScript
* PostgreSQL
* Prisma ORM
* Redis & BullMQ
* Socket.IO
* JWT (Access + Refresh)
* bcrypt
* class-validator & class-transformer
* @nestjs/throttler
* Helmet
* Jest
* Docker & Docker Compose
* GitHub Actions

---

# Архітектура

Застосунок побудований за модульною клієнт-серверною архітектурою:

```text
React Frontend
      │
      │ REST API / WebSocket
      ▼
NestJS Backend ──(BullMQ)──► Redis (Async Queue)
      │
      │ Prisma ORM (Transactions)
      ▼
PostgreSQL
```

Backend відповідає за:

* аутентифікацію та рольову модель (RBAC: `CUSTOMER`, `ADMIN`);
* управління каталогом товарів (CRUD, пагінація, фільтрація, повнотекстовий пошук);
* управління категоріями;
* керування кошиком користувача;
* транзакційне оформлення замовлень із захистом від race conditions;
* асинхронну обробку замовлень через черги (BullMQ);
* симуляцію платежів;
* real-time оновлення статусів замовлень через Socket.IO;
* аналітику продажу та експорт звітів у CSV.

---

# База даних та транзакції

Для зберігання даних використовується **PostgreSQL**.

## Ключові особливості реалізації

### 1. Атомарність списання складу

Оформлення замовлення відбувається всередині єдиної транзакції бази даних через `prisma.$transaction`.

Перед списанням залишків перевіряється актуальна кількість товару на складі.

Це забезпечує коректне списання товарів навіть при одночасному оформленні декількох замовлень та захищає систему від race conditions і продажу товару понад наявний залишок.

### 2. Індексація

Для оптимізації пошуку та фільтрації за каталогом додано індекси на поля:

* `name`
* `categoryId`
* `price`
* `createdAt`

---

# Аутентифікація та RBAC

Для захисту роутів використовується двохрівнева система токенів.

### Access Token

**JWT Access Token** передається в заголовку:

```http
Authorization: Bearer <token>
```

### Refresh Token

**JWT Refresh Token** зберігається в безпечному `HTTP-only` cookie з підтримкою ротації.

---

## Ролі

### `CUSTOMER`

Покупець має можливість:

* переглядати каталог;
* переглядати товари;
* керувати власним кошиком;
* створювати замовлення;
* переглядати власні замовлення.

### `ADMIN`

Адміністратор має можливість:

* створювати товари;
* редагувати товари;
* видаляти товари;
* створювати та редагувати категорії;
* переглядати всі замовлення;
* змінювати статуси замовлень;
* переглядати аналітику продажів;
* експортувати звіти.

Для захисту від brute-force атак на authentication endpoints використовується `@nestjs/throttler`.

---

# Кешування та черги

Для роботи з Redis використовується **Redis + BullMQ**.

## Кешування каталогу

Запити на отримання публічного списку товарів кешуються в Redis.

Кеш автоматично інвалідується при адміністративних змінах каталогу:

* створення товару;
* оновлення товару;
* видалення товару.

Це дозволяє зменшити кількість запитів до PostgreSQL при частому перегляді каталогу.

---

## Асинхронна обробка замовлень

Після того як замовлення успішно створено та склад списано, задача передається в чергу **BullMQ** для фонової обробки.

Черга відповідає за асинхронні операції, зокрема:

* генерацію нотифікацій;
* подальшу обробку замовлення;
* переведення статусу з `NEW` у `PROCESSING`.

Таким чином, довгі або другорядні операції не блокують основний HTTP-запит користувача.

---

# Real-time оновлення

Для real-time комунікації використовується **Socket.IO Gateway**.

Клієнти можуть підключитися до WebSocket та отримувати миттєві оновлення про зміну статусів замовлення без необхідності перезавантажувати сторінку.

Життєвий цикл замовлення:

```text
NEW
 │
 ▼
PROCESSING
 │
 ▼
SHIPPED
 │
 ▼
COMPLETED
```

У випадку скасування:

```text
NEW / PROCESSING
        │
        ▼
    CANCELLED
```

---

# Environment Variables

Для запуску створіть `.env` на основі `.env.example`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/marketplace?schema=public"

REDIS_PORT=6379

JWT_ACCESS_SECRET="access_secret_key"
JWT_REFRESH_SECRET="refresh_secret_key"

PORT=3001
```

---

# Запуск через Docker

Усі необхідні сервіси:

* NestJS Backend
* PostgreSQL
* Redis

можна запустити через Docker Compose.

У директорії `backend` виконайте:

```bash
docker compose up --build
```

Після запуску будуть доступні:

```text
Backend API:  http://localhost:3001
PostgreSQL:   localhost:5432
Redis:        localhost:6379
```

Міграції Prisma застосовуються автоматично під час запуску контейнера.

---

## Зупинка Docker

```bash
docker compose down
```

Для повного очищення даних разом із Docker volumes:

```bash
docker compose down -v
```

> ⚠️ Команда `docker compose down -v` видаляє volume PostgreSQL, а разом із ним і дані бази.

---

# Локальний запуск без Docker

Для локального запуску необхідно встановити:

* Node.js
* PostgreSQL
* Redis

### 1. Встановлення залежностей

```bash
npm install
```

### 2. Створення `.env`

```bash
cp .env.example .env
```

Після цього налаштуйте необхідні environment variables.

### 3. Застосування Prisma migrations

```bash
npx prisma migrate dev
```

### 4. Запуск у development mode

```bash
npm run start:dev
```

---

# Prisma

Для роботи з базою даних використовується **Prisma ORM**.

Основна Prisma schema знаходиться за адресою:

```text
prisma/schema.prisma
```

Для створення нової migration:

```bash
npx prisma migrate dev --name migration_name
```

Для генерації Prisma Client:

```bash
npx prisma generate
```

Для відкриття Prisma Studio:

```bash
npx prisma studio
```

---

# Документація API

Для API використовується **Swagger**.

Після запуску backend документація доступна за адресою:

```text
http://localhost:3001/api
```

Swagger дозволяє:

* переглядати всі API endpoints;
* переглядати DTO;
* переглядати параметри запитів;
* тестувати API безпосередньо з браузера.

---

# API Features

## Authentication

Backend підтримує:

* реєстрацію;
* авторизацію;
* JWT Access Tokens;
* JWT Refresh Tokens;
* refresh token rotation;
* logout;
* захищені endpoints;
* RBAC;
* throttling authentication endpoints.

---

## Products

Підтримується:

* створення товарів;
* редагування товарів;
* видалення товарів;
* перегляд товару;
* отримання списку товарів;
* пагінація;
* фільтрація;
* сортування;
* пошук;
* категоризація;
* кешування каталогу.

Публічний каталог доступний без авторизації.

Адміністративні операції доступні тільки користувачам з роллю `ADMIN`.

---

## Categories

Адміністратор може:

* створювати категорії;
* редагувати категорії;
* видаляти категорії;
* переглядати категорії.

Категорії використовуються для організації каталогу товарів та фільтрації.

---

## Cart

Авторизований користувач може:

* додавати товари до кошика;
* змінювати кількість товару;
* видаляти товари;
* переглядати поточний кошик.

Для роботи з кошиком користувач повинен бути авторизований.

---

## Orders

Під час оформлення замовлення:

1. Перевіряється кошик користувача.
2. Перевіряється актуальний stock товарів.
3. Створюється замовлення.
4. Створюються order items.
5. Зі складу списується необхідна кількість товарів.
6. Всі операції виконуються в рамках транзакції.
7. Після успішної транзакції створюється BullMQ job.
8. Замовлення переходить до подальшої асинхронної обробки.
9. Клієнт отримує real-time оновлення через Socket.IO.

---

# Захист від Race Conditions

Критична частина системи — оформлення замовлення та списання товарів зі складу.

Приклад проблеми:

```text
Stock = 1

User A → купує товар
User B → купує товар одночасно
```

Без правильної транзакційної логіки обидва запити можуть побачити:

```text
stock = 1
```

і обидва успішно створити замовлення.

У результаті система продасть:

```text
2 товари
```

при фактичній наявності:

```text
1 товар
```

У цьому проєкті операції з перевірки та списання stock виконуються транзакційно через Prisma, що забезпечує узгодженість даних при паралельних запитах.

---

# Analytics

Backend містить модуль аналітики продажів.

Адміністратор може отримувати інформацію про:

* кількість замовлень;
* кількість проданих товарів;
* загальний обсяг продажів;
* статистику за періодами;
* популярні товари;
* статистику категорій.

Також реалізовано експорт звітів у форматі CSV.

---

# Тестування

## Unit Tests

Unit-тести покривають критичну бізнес-логіку:

* authentication;
* products;
* cart;
* orders;
* транзакційне списання stock;
* перевірку прав доступу;
* роботу сервісів.

Запуск:

```bash
npm test
```

---

## E2E Tests

E2E тести перевіряють повний користувацький flow:

```text
Registration
     ↓
Login
     ↓
Add product to cart
     ↓
Create order
     ↓
Check stock
     ↓
Transaction
     ↓
Order processing
```

Запуск:

```bash
npm run test:e2e
```

---

# CI / CD

У репозиторії налаштований **GitHub Actions workflow**.

Workflow автоматично запускається при:

* `push`;
* `pull request`.

Основні етапи:

```text
Install dependencies
        ↓
npm ci
        ↓
Lint
        ↓
Unit Tests
        ↓
Integration / E2E Tests
```

Це дозволяє автоматично перевіряти якість коду та працездатність backend перед внесенням змін у production branch.

---

# Security

У проєкті реалізовані базові механізми захисту:

* JWT authentication;
* Access + Refresh Tokens;
* HTTP-only cookies для Refresh Token;
* Refresh Token Rotation;
* bcrypt для хешування паролів;
* Role-Based Access Control;
* DTO validation;
* `class-validator`;
* `class-transformer`;
* `@nestjs/throttler` для rate limiting;
* Helmet для HTTP security headers;
* перевірка прав доступу на захищених endpoints.

---

# Docker Services

Основні сервіси проєкту:

```text
┌─────────────────────────────┐
│       React Frontend        │
└──────────────┬──────────────┘
               │
               │ REST / WebSocket
               ▼
┌─────────────────────────────┐
│       NestJS Backend        │
└──────┬───────────────┬──────┘
       │               │
       │ Prisma        │ BullMQ
       ▼               ▼
┌─────────────┐   ┌─────────────┐
│ PostgreSQL  │   │    Redis    │
└─────────────┘   └─────────────┘
```

---

# Development Workflow

Рекомендований workflow для розробки:

```text
Create feature branch
        ↓
Implement feature
        ↓
Write tests
        ↓
Run lint
        ↓
Run unit tests
        ↓
Run E2E tests
        ↓
Commit
        ↓
Push
        ↓
GitHub Actions
        ↓
Pull Request
```

---

# Future Improvements

У майбутньому проєкт можна розширити наступними можливостями:

### Payments

Додати реальну інтеграцію з платіжною системою:

* Stripe;
* LiqPay.

Поточна реалізація використовує mock/simulation payment flow.

### Search

Замінити поточний пошук через `ILIKE` на повнотекстовий пошук PostgreSQL із використанням:

```text
tsvector
tsquery
GIN index
```

Це дозволить ефективніше працювати з великим каталогом.

### WebSocket Scaling

При масштабуванні можна винести WebSocket Gateway в окремий мікросервіс.

Також можна використовувати Redis adapter для Socket.IO, щоб підтримувати WebSocket connections між декількома backend instances.

### Observability

Можна додати:

* structured logging;
* OpenTelemetry;
* Prometheus;
* Grafana;
* error tracking.

---

# Getting Started

Швидкий запуск проєкту:

```bash
# Clone repository
git clone <repository-url>

# Go to backend
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Start all services
docker compose up --build
```

Після запуску:

```text
API:      http://localhost:3001
Swagger:  http://localhost:3001/api
Postgres: localhost:5432
Redis:    localhost:6379
```

---

# Summary

**Mini Marketplace API** — backend для e-commerce marketplace, побудований на NestJS та TypeScript.

Проєкт демонструє реалізацію:

* REST API;
* JWT authentication;
* Access + Refresh Tokens;
* RBAC;
* PostgreSQL;
* Prisma ORM;
* транзакцій;
* race condition protection;
* Redis caching;
* BullMQ queues;
* Socket.IO;
* pagination;
* filtering;
* search;
* analytics;
* CSV export;
* rate limiting;
* security middleware;
* unit та E2E testing;
* Docker;
* GitHub Actions CI/CD.

Архітектура побудована таким чином, щоб backend залишався модульним, масштабованим та придатним для подальшого розширення.
