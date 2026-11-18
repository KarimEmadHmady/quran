
```
quran_app
├─ apps
│  ├─ backend
│  │  ├─ .prettierrc
│  │  ├─ eslint.config.mjs
│  │  ├─ jest.config.js
│  │  ├─ jest.db.config.js
│  │  ├─ nest-cli.json
│  │  ├─ package.json
│  │  ├─ prisma
│  │  │  └─ schema.prisma
│  │  ├─ src
│  │  │  ├─ admin
│  │  │  │  ├─ admin.module.ts
│  │  │  │  └─ auth
│  │  │  │     ├─ admin-auth.guard.spec.ts
│  │  │  │     ├─ admin-auth.guard.ts
│  │  │  │     ├─ admin-credentials.spec.ts
│  │  │  │     ├─ admin-credentials.ts
│  │  │  │     ├─ auth.constants.spec.ts
│  │  │  │     ├─ auth.constants.ts
│  │  │  │     ├─ auth.controller.ts
│  │  │  │     ├─ auth.service.spec.ts
│  │  │  │     ├─ auth.service.ts
│  │  │  │     ├─ dto
│  │  │  │     │  └─ login.dto.ts
│  │  │  │     ├─ login-lockout.spec.ts
│  │  │  │     └─ login-lockout.ts
│  │  │  ├─ app.module.ts
│  │  │  ├─ bootstrap
│  │  │  │  ├─ cors.spec.ts
│  │  │  │  ├─ cors.ts
│  │  │  │  ├─ setup-app.spec.ts
│  │  │  │  └─ setup-app.ts
│  │  │  ├─ common
│  │  │  │  ├─ filters
│  │  │  │  │  ├─ all-exceptions.filter.spec.ts
│  │  │  │  │  └─ all-exceptions.filter.ts
│  │  │  │  ├─ http
│  │  │  │  │  ├─ error-body.spec.ts
│  │  │  │  │  ├─ error-body.ts
│  │  │  │  │  ├─ request-id.middleware.spec.ts
│  │  │  │  │  ├─ request-id.middleware.ts
│  │  │  │  │  ├─ request-logger.middleware.spec.ts
│  │  │  │  │  ├─ request-logger.middleware.ts
│  │  │  │  │  ├─ url-length.middleware.spec.ts
│  │  │  │  │  └─ url-length.middleware.ts
│  │  │  │  ├─ pagination
│  │  │  │  │  ├─ pagination.spec.ts
│  │  │  │  │  └─ pagination.ts
│  │  │  │  ├─ throttling
│  │  │  │  │  ├─ app-throttler.guard.spec.ts
│  │  │  │  │  ├─ app-throttler.guard.ts
│  │  │  │  │  ├─ rate-limit.decorator.ts
│  │  │  │  │  ├─ throttler.config.spec.ts
│  │  │  │  │  └─ throttler.config.ts
│  │  │  │  └─ validation
│  │  │  │     ├─ transforms.spec.ts
│  │  │  │     ├─ transforms.ts
│  │  │  │     ├─ validation.pipe.spec.ts
│  │  │  │     └─ validation.pipe.ts
│  │  │  ├─ config
│  │  │  │  ├─ duration.spec.ts
│  │  │  │  ├─ duration.ts
│  │  │  │  ├─ env.validation.spec.ts
│  │  │  │  ├─ env.validation.ts
│  │  │  │  ├─ origins.spec.ts
│  │  │  │  ├─ origins.ts
│  │  │  │  ├─ trust-proxy.spec.ts
│  │  │  │  └─ trust-proxy.ts
│  │  │  ├─ export
│  │  │  │  ├─ assets
│  │  │  │  │  └─ fonts
│  │  │  │  │     ├─ AmiriQuran-Regular.ttf
│  │  │  │  │     └─ OFL.txt
│  │  │  │  ├─ dto
│  │  │  │  │  └─ export-pdf.dto.ts
│  │  │  │  ├─ export.controller.ts
│  │  │  │  ├─ export.module.ts
│  │  │  │  ├─ export.service.ts
│  │  │  │  ├─ export.spec.ts
│  │  │  │  ├─ pdf-renderer.service.ts
│  │  │  │  └─ pdf-template.ts
│  │  │  ├─ health
│  │  │  │  ├─ health.controller.spec.ts
│  │  │  │  ├─ health.controller.ts
│  │  │  │  └─ health.module.ts
│  │  │  ├─ main.ts
│  │  │  ├─ prisma
│  │  │  │  ├─ prisma.module.ts
│  │  │  │  ├─ prisma.service.spec.ts
│  │  │  │  └─ prisma.service.ts
│  │  │  ├─ quran
│  │  │  │  ├─ ayah.select.ts
│  │  │  │  ├─ ayahs
│  │  │  │  │  └─ ayahs.controller.ts
│  │  │  │  ├─ quran-dtos.spec.ts
│  │  │  │  ├─ quran.module.ts
│  │  │  │  ├─ suras
│  │  │  │  │  ├─ dto
│  │  │  │  │  │  └─ sura-params.dto.ts
│  │  │  │  │  ├─ suras.controller.ts
│  │  │  │  │  ├─ suras.service.spec.ts
│  │  │  │  │  └─ suras.service.ts
│  │  │  │  ├─ tafsirs
│  │  │  │  │  ├─ dto
│  │  │  │  │  │  └─ tafsirs-query.dto.ts
│  │  │  │  │  ├─ tafsir.constants.ts
│  │  │  │  │  ├─ tafsirs.controller.ts
│  │  │  │  │  ├─ tafsirs.service.spec.ts
│  │  │  │  │  └─ tafsirs.service.ts
│  │  │  │  └─ topics
│  │  │  │     ├─ dto
│  │  │  │     │  └─ topics.dto.ts
│  │  │  │     ├─ topic-tree.spec.ts
│  │  │  │     ├─ topic-tree.ts
│  │  │  │     ├─ topics.controller.ts
│  │  │  │     ├─ topics.service.spec.ts
│  │  │  │     └─ topics.service.ts
│  │  │  └─ search
│  │  │     ├─ admin-search.controller.ts
│  │  │     ├─ cache
│  │  │     │  ├─ lru-cache.spec.ts
│  │  │     │  └─ lru-cache.ts
│  │  │     ├─ dto
│  │  │     │  └─ search-query.dto.ts
│  │  │     ├─ golden
│  │  │     │  ├─ engine-search.ts
│  │  │     │  ├─ golden-queries.json
│  │  │     │  ├─ golden-set.spec.ts
│  │  │     │  ├─ golden-set.ts
│  │  │     │  ├─ index-phrase-search.spec.ts
│  │  │     │  ├─ index-phrase-search.ts
│  │  │     │  ├─ load-golden.ts
│  │  │     │  ├─ metrics.spec.ts
│  │  │     │  ├─ metrics.ts
│  │  │     │  ├─ phrase-baseline.spec.ts
│  │  │     │  └─ phrase-baseline.ts
│  │  │     ├─ index
│  │  │     │  ├─ alignment-exceptions.spec.ts
│  │  │     │  ├─ alignment-exceptions.ts
│  │  │     │  ├─ alignment-map.spec.ts
│  │  │     │  ├─ alignment-map.ts
│  │  │     │  ├─ alignment.spec.ts
│  │  │     │  ├─ alignment.ts
│  │  │     │  ├─ corpus-loader.service.spec.ts
│  │  │     │  ├─ corpus-loader.service.ts
│  │  │     │  ├─ inverted-index.spec.ts
│  │  │     │  ├─ inverted-index.ts
│  │  │     │  ├─ search-index.service.spec.ts
│  │  │     │  ├─ search-index.service.ts
│  │  │     │  ├─ tokenize.ts
│  │  │     │  ├─ vocabulary.spec.ts
│  │  │     │  └─ vocabulary.ts
│  │  │     ├─ query
│  │  │     │  ├─ reference-parser.spec.ts
│  │  │     │  ├─ reference-parser.ts
│  │  │     │  ├─ sura-catalog.spec.ts
│  │  │     │  ├─ sura-catalog.ts
│  │  │     │  ├─ token-corrector.spec.ts
│  │  │     │  └─ token-corrector.ts
│  │  │     ├─ ranking
│  │  │     │  ├─ stages.spec.ts
│  │  │     │  └─ stages.ts
│  │  │     ├─ search.controller.ts
│  │  │     ├─ search.module.ts
│  │  │     ├─ search.service.phase3.spec.ts
│  │  │     ├─ search.service.spec.ts
│  │  │     ├─ search.service.ts
│  │  │     ├─ search.service.voice.spec.ts
│  │  │     └─ text
│  │  │        ├─ edit-distance.spec.ts
│  │  │        ├─ edit-distance.ts
│  │  │        ├─ phonetic.spec.ts
│  │  │        └─ phonetic.ts
│  │  ├─ test
│  │  │  ├─ admin-search.e2e-spec.ts
│  │  │  ├─ auth.e2e-spec.ts
│  │  │  ├─ export.e2e-spec.ts
│  │  │  ├─ health.e2e-spec.ts
│  │  │  ├─ prisma.db-spec.ts
│  │  │  ├─ quran.db-spec.ts
│  │  │  ├─ quran.e2e-spec.ts
│  │  │  ├─ rate-limit.e2e-spec.ts
│  │  │  ├─ search-alignment.db-spec.ts
│  │  │  ├─ search-corrector.db-spec.ts
│  │  │  ├─ search-engine.db-spec.ts
│  │  │  ├─ search-golden.db-spec.ts
│  │  │  ├─ search-index.db-spec.ts
│  │  │  ├─ search-references.db-spec.ts
│  │  │  ├─ search.e2e-spec.ts
│  │  │  ├─ security.e2e-spec.ts
│  │  │  ├─ setup-db-env.ts
│  │  │  ├─ setup-env.ts
│  │  │  └─ support
│  │  │     ├─ suras.fixture.ts
│  │  │     ├─ test-app.ts
│  │  │     ├─ test.controller.ts
│  │  │     └─ trust-loopback-proxy.ts
│  │  ├─ tsconfig.build.json
│  │  └─ tsconfig.json
│  └─ frontend
│     ├─ e2e
│     │  └─ journeys.test.mjs
│     ├─ next-env.d.ts
│     ├─ next.config.ts
│     ├─ package.json
│     ├─ postcss.config.mjs
│     ├─ public
│     │  └─ fonts
│     │     ├─ AmiriQuran-Regular.ttf
│     │     └─ OFL.txt
│     ├─ src
│     │  ├─ app
│     │  │  ├─ cart
│     │  │  │  ├─ CartClient.tsx
│     │  │  │  └─ page.tsx
│     │  │  ├─ error.tsx
│     │  │  ├─ globals.css
│     │  │  ├─ icon.svg
│     │  │  ├─ khatma
│     │  │  │  ├─ KhatmaClient.tsx
│     │  │  │  └─ page.tsx
│     │  │  ├─ layout.tsx
│     │  │  ├─ not-found.tsx
│     │  │  ├─ page.tsx
│     │  │  ├─ search
│     │  │  │  ├─ page.tsx
│     │  │  │  └─ SearchClient.tsx
│     │  │  ├─ surah
│     │  │  │  ├─ page.tsx
│     │  │  │  ├─ SuraListClient.tsx
│     │  │  │  └─ [number]
│     │  │  │     └─ page.tsx
│     │  │  └─ topics
│     │  │     ├─ page.tsx
│     │  │     └─ [id]
│     │  │        └─ page.tsx
│     │  ├─ components
│     │  │  ├─ AppChrome.tsx
│     │  │  ├─ AyahCard.tsx
│     │  │  ├─ AyahList.tsx
│     │  │  ├─ BottomSheet.tsx
│     │  │  ├─ CartToggle.tsx
│     │  │  ├─ ExportPdfButton.tsx
│     │  │  ├─ FloatingCart.tsx
│     │  │  ├─ HighlightedText.tsx
│     │  │  ├─ HomeCards.tsx
│     │  │  ├─ Icon.tsx
│     │  │  ├─ KhatmaButton.tsx
│     │  │  ├─ Providers.tsx
│     │  │  ├─ ReadingSettingsPanel.tsx
│     │  │  ├─ SearchBox.tsx
│     │  │  ├─ ShareAsImageModal.tsx
│     │  │  ├─ TafsirPanel.tsx
│     │  │  ├─ useCartDetails.ts
│     │  │  └─ VoiceSearchButton.tsx
│     │  ├─ lib
│     │  │  ├─ api.ts
│     │  │  ├─ highlight.ts
│     │  │  ├─ khatma.test.ts
│     │  │  ├─ khatma.ts
│     │  │  ├─ localStore.ts
│     │  │  ├─ misc.test.ts
│     │  │  ├─ quran.ts
│     │  │  ├─ routeParams.ts
│     │  │  ├─ serverApi.ts
│     │  │  ├─ shapes.test.ts
│     │  │  ├─ shapes.ts
│     │  │  ├─ shareImage.ts
│     │  │  ├─ speech.ts
│     │  │  └─ testing
│     │  │     └─ suras.ts
│     │  └─ store
│     │     ├─ stores.test.ts
│     │     ├─ useBookmarkStore.ts
│     │     ├─ useCartStore.ts
│     │     ├─ useKhatmaStore.ts
│     │     ├─ useSettingsStore.ts
│     │     └─ useUiStore.ts
│     ├─ test
│     │  └─ server-only-stub.ts
│     ├─ tsconfig.json
│     └─ vitest.config.mts
├─ claude.md
├─ frontend design
│  ├─ 1.png
│  ├─ 2.png
│  ├─ 3.png
│  ├─ 4.png
│  ├─ 5.png
│  ├─ 6.png
│  ├─ 7.png
│  └─ app_showcase_v2.png
├─ package-lock.json
├─ package.json
├─ packages
│  └─ text-utils
│     ├─ .prettierrc
│     ├─ eslint.config.mjs
│     ├─ jest.config.js
│     ├─ jest.db.config.js
│     ├─ package.json
│     ├─ src
│     │  ├─ index.ts
│     │  ├─ normalize.spec.ts
│     │  └─ normalize.ts
│     ├─ test
│     │  ├─ normalize.db-spec.ts
│     │  └─ setup-db-env.ts
│     ├─ tsconfig.build.json
│     └─ tsconfig.json
├─ postman
│  ├─ local.postman_environment.json
│  └─ quran-api.postman_collection.json
└─ scripts
   ├─ package.json
   ├─ seed-admin.ts
   ├─ tsconfig.json
   └─ verify-db.ts

```

admin@quran.app
3352481900aA#

