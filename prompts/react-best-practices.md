# React Best Practices — Vercel Engineering (Version 1.0.0, January 2026)

> Source: https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices  
> This document contains 40+ performance optimization rules across 8 categories, prioritized by impact.

---

## 1. Eliminating Waterfalls — **CRITICAL**

Waterfalls are the #1 performance killer. Each sequential await adds full network latency.

### 1.1 Defer Await Until Needed — HIGH
Move `await` operations into the branches where they're actually used.

**❌ Blocks both branches:**
```ts
async function handleRequest(userId, skipProcessing) {
  const userData = await fetchUserData(userId) // always blocks
  if (skipProcessing) return { skipped: true }
  return processUserData(userData)
}
```
**✅ Only blocks when needed:**
```ts
async function handleRequest(userId, skipProcessing) {
  if (skipProcessing) return { skipped: true }
  const userData = await fetchUserData(userId)
  return processUserData(userData)
}
```

### 1.2 Dependency-Based Parallelization — CRITICAL (2-10× improvement)
Start each task as early as possible with `Promise.all`.

```ts
// ❌ Sequential
const user = await fetchUser()
const profile = await fetchProfile(user.id)

// ✅ Parallel
const userPromise = fetchUser()
const profilePromise = userPromise.then(u => fetchProfile(u.id))
const [user, profile] = await Promise.all([userPromise, profilePromise])
```

### 1.3 Prevent Waterfall Chains in API Routes — CRITICAL
In API routes and Server Actions, start independent operations immediately.

```ts
export async function GET(request) {
  const sessionPromise = auth()
  const configPromise = fetchConfig()
  const session = await sessionPromise
  const [config, data] = await Promise.all([configPromise, fetchData(session.user.id)])
  return Response.json({ data, config })
}
```

### 1.4 Promise.all() for Independent Operations — CRITICAL
Execute concurrent async operations that have no interdependencies.

### 1.5 Strategic Suspense Boundaries — HIGH
Use `<Suspense>` to show wrapper UI faster while data streams in,
instead of await-ing before returning JSX.

---

## 2. Bundle Size Optimization — **CRITICAL**

### 2.1 Avoid Barrel File Imports — CRITICAL (200-800ms import cost)
Import directly from source files, not from `index.js` barrel re-exports.

```ts
// ❌ Loads all of @mui/material
import { Button } from '@mui/material'

// ✅ Loads only Button
import Button from '@mui/material/Button'
```

### 2.2 Conditional Module Loading — HIGH
Load large data or modules only when a feature is activated (dynamic `import()` inside `useEffect`).

### 2.3 Defer Non-Critical Third-Party Libraries — MEDIUM
Load analytics, logging, and error tracking after hydration using `next/dynamic` with `ssr: false`.

### 2.4 Dynamic Imports for Heavy Components — CRITICAL
Use `next/dynamic` to lazy-load massive components (editors, maps) not needed for initial paint.

### 2.5 Preload Based on User Intent — MEDIUM
Preload modules on `onMouseEnter` or `onFocus` to reduce perceived latency.

---

## 3. Server-Side Performance — **HIGH**

### 3.1 Authenticate Server Actions Like API Routes — CRITICAL
Always verify authentication **inside** the Server Action. Never rely on page-level guards.

### 3.2 Avoid Duplicate Serialization in RSC Props — LOW
Don't send a sorted copy of an array already sent as a prop — this duplicates data in the RSC payload.

### 3.3 Cross-Request LRU Caching — HIGH
Use `lru-cache` to share computation across sequential requests in the same function instance.

### 3.4 Hoist Static I/O to Module Level — HIGH
Read fonts, configs, or templates once at module level, not inside the request handler.

### 3.5 Minimize Serialization at RSC Boundaries — HIGH
Only pass specific fields the client component needs. Don't send entire 50-field objects if the client uses only `id` and `name`.

### 3.6 Parallel Data Fetching with Component Composition — CRITICAL
Avoid cascading `await` in Server Components. Use composition so components fetch data in parallel.

### 3.7 Per-Request Deduplication with React.cache() — MEDIUM
Wrap database queries in `cache()` to ensure they run once per request even when called multiple times.

### 3.8 Use after() for Non-Blocking Operations — MEDIUM
Use Next.js `after()` to run logging/analytics after the response has been sent.

---

## 4. Client-Side Data Fetching — **MEDIUM-HIGH**

### 4.1 Deduplicate Global Event Listeners — LOW
Use `useSWRSubscription` or a module-level Map to ensure multiple component instances share one `window` event listener.

### 4.2 Use Passive Event Listeners for Scrolling — MEDIUM
Add `{ passive: true }` to wheel and touch listeners so the browser can scroll without waiting for `preventDefault`.

### 4.3 Use SWR for Automatic Deduplication — MEDIUM-HIGH
Benefit from automatic caching and request deduplication via `useSWR`.

### 4.4 Version and Minimize localStorage Data — MEDIUM
Prefix keys with a version (e.g. `userConfig:v2`) and wrap in `try-catch` to handle quota/private mode errors.

---

## 5. Re-render Optimization — **MEDIUM**

### 5.1 Calculate Derived State During Rendering — MEDIUM ⭐
Compute values like `fullName = first + last` during render. **Never use `useEffect` to sync state with props.**

```tsx
// ❌ Anti-pattern
const [fullName, setFullName] = useState('')
useEffect(() => { setFullName(first + ' ' + last) }, [first, last])

// ✅ Correct
const fullName = first + ' ' + last // or useMemo for expensive cases
```

### 5.2 Defer State Reads to Usage Point — MEDIUM
Don't subscribe to state at the top-level if you only need it inside an `onClick` handler. Read from DOM/window in the callback.

### 5.3 Avoid useMemo for Simple Primitives — LOW-MEDIUM
Don't wrap simple logical expressions or primitive results in `useMemo`. The hook overhead is often greater than the benefit.

### 5.4 Extract Default Non-primitive Values to Constants — MEDIUM
Extract default array/object values to constants outside the component to prevent breaking memoization of children.

```tsx
// ❌ Creates new array reference every render, breaks React.memo children
function List({ items = [] }) { ... }

// ✅ Stable reference
const DEFAULT_ITEMS: string[] = []
function List({ items = DEFAULT_ITEMS }) { ... }
```

### 5.5 Extract to Memoized Components — MEDIUM
Move expensive render work into a separate component wrapped in `React.memo()`.

### 5.6 Narrow Effect Dependencies — LOW
Depend on `user.id` instead of the whole `user` object to avoid unnecessary re-runs.

```tsx
// ❌ Re-runs on every user object reference change
useEffect(() => { fetchProfile(user.id) }, [user])

// ✅ Only re-runs when id actually changes
useEffect(() => { fetchProfile(userId) }, [userId])
```

### 5.7 Put Interaction Logic in Event Handlers — MEDIUM
Don't model user actions as state + effect. Execute actions (toast, fetch) directly in the `onClick` handler.

```tsx
// ❌ State + effect anti-pattern
const [submitted, setSubmitted] = useState(false)
useEffect(() => { if (submitted) sendAnalytics() }, [submitted])

// ✅ Direct handler
function handleSubmit() { sendAnalytics() }
```

### 5.8 Subscribe to Derived State — MEDIUM
Use `useMediaQuery` (boolean) instead of `useWindowWidth` (number) — only re-render when the breakpoint crosses, not every pixel.

### 5.9 Use Functional setState Updates — MEDIUM
Use `setCount(c => c + 1)` to keep callback references stable and avoid stale closure bugs.

### 5.10 Use Lazy State Initialization — MEDIUM
Pass a function to `useState` for expensive initial values:
```ts
useState(() => heavyTask()) // runs once on mount, not every render
```

### 5.11 Use Transitions for Non-Urgent Updates — MEDIUM
Wrap non-critical state updates (filter, search) in `startTransition` to keep the UI responsive.

### 5.12 Use useRef for Transient Values — MEDIUM
Use `useRef` for values that change frequently but don't need to trigger a re-render (mouse positions, interval IDs).

---

## 6. Rendering Performance — **MEDIUM**

### 6.1 Animate SVG Wrapper Instead of SVG Element — LOW
Animate a `div` wrapper instead of the `svg` element itself to enable GPU acceleration.

### 6.2 CSS content-visibility for Long Lists — HIGH
Use `content-visibility: auto` to skip rendering of off-screen list items.

### 6.3 Hoist Static JSX Elements — LOW
Extract static SVG or UI parts out of the component (or into a constant) to avoid recreation on every render.

### 6.4 Optimize SVG Precision — LOW
Reduce decimal places in SVG paths (use SVGO) to shrink file size and parse time.

### 6.5 Prevent Hydration Mismatch Without Flickering — MEDIUM
For values from `localStorage`, use an inline synchronous `<script>` to update the DOM before React hydrates.

### 6.6 Suppress Expected Hydration Mismatches — LOW-MEDIUM
Use `suppressHydrationWarning` for dates or random IDs that *must* differ between server and client.

### 6.7 Use Activity Component for Show/Hide — MEDIUM
Use `<Activity mode="hidden">` to preserve DOM/state of components that toggle visibility frequently.

### 6.8 Use Explicit Conditional Rendering — LOW
Use `count > 0 ? <Badge /> : null` instead of `count && <Badge />` to avoid rendering the number `0`.

### 6.9 Use useTransition Over Manual Loading States — LOW
Use the built-in `isPending` from `useTransition` instead of manual `isLoading` state.

---

## 7. JavaScript Performance — **LOW-MEDIUM**

### 7.1 Avoid Layout Thrashing — MEDIUM
Batch all DOM reads (`offsetWidth`) before all writes (style changes). Never interleave them.

### 7.2 Build Index Maps for Repeated Lookups — LOW-MEDIUM
Convert an array to a `Map` (O(1)) if performing multiple `.find()` (O(n)) lookups by the same key.

### 7.3 Cache Property Access in Loops — LOW-MEDIUM
Store `obj.very.long.path` in a variable before a loop to avoid repeated property lookups.

### 7.4 Cache Repeated Function Calls — MEDIUM
Use a module-level `Map` to cache results of expensive idempotent functions (e.g. slugifiers).

### 7.5 Cache Storage API Calls — LOW-MEDIUM
`localStorage` and `cookie` access is slow. Cache values in a module-scope variable.

### 7.6 Combine Multiple Array Iterations — LOW-MEDIUM
Combine `.filter()` + `.map()` into a single `for...of` loop.

### 7.7 Early Length Check for Array Comparisons — MEDIUM-HIGH
If `arr1.length !== arr2.length`, return `false` immediately before expensive deep comparisons.

### 7.8 Early Return from Functions — LOW-MEDIUM
Return as soon as the result is known to skip unnecessary logic.

### 7.9 Hoist RegExp Creation — LOW-MEDIUM
Define RegExps outside the render function. Be careful with the global (`/g`) flag's internal state.

### 7.10 Use Loop for Min/Max Instead of Sort — LOW
Find min/max with a single O(n) loop instead of `.sort()` at O(n log n).

### 7.11 Use Set/Map for O(1) Lookups — LOW-MEDIUM
Use `new Set(ids).has(id)` instead of `ids.includes(id)` for membership checks.

### 7.12 Use toSorted() for Immutability — MEDIUM-HIGH
Use `.toSorted()` (or `[...arr].sort()`) to avoid mutating React props or state in place.

---

## 8. Advanced Patterns — **LOW**

### 8.1 Initialize App Once, Not Per Mount — LOW-MEDIUM
Use a module-level `let didInit = false` guard for app-wide initialization (analytics setup) to prevent re-running on remounts or in Strict Mode.

### 8.2 Store Event Handlers in Refs — LOW
Store callbacks in a `ref` when used in effects that should not re-subscribe when the handler changes.

### 8.3 useEffectEvent for Stable Callback Refs — LOW
Use `useEffectEvent` (experimental) to access latest values in effects without adding them to the dependency array.

---

## References
1. https://react.dev
2. https://nextjs.org
3. https://swr.vercel.app
4. https://github.com/shuding/better-all
5. https://github.com/isaacs/node-lru-cache
6. https://vercel.com/blog/how-we-optimized-package-imports-in-next-js
7. https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast
