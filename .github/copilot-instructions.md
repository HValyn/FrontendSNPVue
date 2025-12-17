# Copilot Instructions - IBGE SNP Search Platform

## Project Overview
Vue 3 + Vite frontend for genetic variant search and analysis. The app enables researchers to query SNP data (dbSNP, ClinVar, dbNSFP) via a Python backend and interact with AI analysis through a sidebar chat interface.

**Tech Stack**: Vue 3 (Composition API), Pinia (state management), Tailwind CSS, Vite, Axios, @heroicons/vue

---

## Architecture Patterns

### Data Flow Architecture
1. **Search Input** (`SearchInput.vue`) → parses text or CSV files for rsID lists
2. **Store Action** (`useVariantStore.analyzeVariants()`) → chunks IDs (batch size: 200) and streams to backend
3. **Streaming Response** → Backend sends `variant_found` or `variant_missing` events via SSE
4. **Results Display** (`VariantTable.vue`) → paginated table (50 rows/page) with expandable rows
5. **Chat Context** (`ChatAssistant.vue`) → builds smart context from results and queries AI

**Key insight**: Chunking (200 IDs per batch) prevents UI freeze and timeouts. Progress updates happen after each chunk completes.

### State Management (Pinia)
- **`useVariantStore`** is the single source of truth for search results
- **State**: `variants[]`, `missing[]`, `loading`, `progress`, `totalProcessed`, `chatHistory[]`
- **Actions**: `analyzeVariants()`, `processChunk()`, `handleStreamEvent()`, `clearResults()`
- **Stream parsing**: Handles multi-line JSON events from SSE (splits by `\n\n`)

---

## Critical Workflows

### Running the App
```bash
npm run dev      # Start Vite dev server (http://localhost:5173)
npm run build    # Production build
npm run preview  # Test production build locally
```

### Backend Integration
- **Search endpoint**: `POST http://localhost:5000/api/stream_analysis`
  - Input: `{ rs_id_list: string[] }`
  - Output: SSE stream with `{ type: 'variant_found'|'variant_missing', ... }`
- **Chat endpoint**: `POST http://localhost:5000/api/chat_analysis`
  - Input: `{ user_question: string, variant_context: {...} }`
  - Output: `{ answer: string }`

---

## Project-Specific Patterns

### CSV/File Parsing
- Expects first column to contain rsIDs (format: `rs*`)
- Handles both quoted and unquoted values
- Drag-drop enabled; falls back to manual input tab

### UI Component Organization
```
HomeView (main layout grid)
├── SearchInput (input + file upload, col-span-8)
├── VariantTable (results table, col-span-8)
└── ChatAssistant (sticky sidebar, col-span-4, hidden on mobile)
```

### Responsive Design
- **Grid**: 1 col mobile → 12 col desktop (8-col data + 4-col chat)
- **Colors**: Custom `gen-primary` (indigo-500) and `gen-dark` (slate-800)
- **Icons**: @heroicons/vue/24/outline + /24/solid

### Stream Event Handling
In `variantStore.js`, the `handleStreamEvent()` function:
- `variant_found`: Pushes entire event object to `variants[]`
- `variant_missing`: Pushes only rsID to `missing[]`
- **Note**: Event payload structure must match backend exactly (e.g., `event.payload.data.clinvar.ucscNotes`)

### Chat Context Optimization
`ChatAssistant.buildSmartContext()` filters results before sending to AI:
- Calculates ClinVar/gene frequency stats
- Prioritizes pathogenic variants or those with functional data
- Limits sample variants to ~50 items (token efficiency)

---

## Key Files & Their Responsibilities

| File | Purpose |
|------|---------|
| `src/stores/variantStore.js` | Pinia store—handles chunking, streaming, and state |
| `src/components/SearchInput.vue` | Input parsing (text/CSV), file drag-drop, tab switching |
| `src/components/VariantTable.vue` | Paginated results display, row expansion, ClinVar color coding |
| `src/components/ChatAssistant.vue` | Chat UI, context building, AI interaction |
| `src/views/HomeView.vue` | Layout orchestration (grid: 8/4 split) |
| `tailwind.config.js` | Custom color tokens (`gen-primary`, `gen-dark`) |

---

## Common Development Tasks

### Adding a New Search Filter
- Extend `SearchInput.vue` with new input field
- Update `analyzeVariants()` to include filter params
- Modify backend payload structure accordingly

### Modifying Result Display
- Edit `VariantTable.vue` table template
- Update `getClinVarColor()` or `getFrequencyData()` helpers as needed
- Ensure sorting/pagination logic remains intact

### Extending Chat Context
- Edit `buildSmartContext()` in `ChatAssistant.vue`
- Add new computed stats or filter logic
- Test token count with backend

### Handling New Backend Event Types
- Add case in `handleStreamEvent()` switch statement
- Update variant object structure if needed
- Test with mock data

---

## Debugging Tips

- **Streaming issues**: Check browser DevTools Network tab for SSE stream; verify `Content-Type: text/event-stream`
- **State sync problems**: Use Vue Devtools Pinia tab to inspect store mutations
- **UI freeze during large queries**: Verify chunk size (200 is current limit)
- **CSS issues**: Check `tailwind.config.js` custom colors are applied; inspect compiled CSS
- **Backend connection errors**: Ensure `http://localhost:5000` is running and CORS is configured
