# Vercel React Best Practices

1. **Avoid Derived State in `useEffect`**
Do not use `useEffect` to sync derived state. Calculate it during render.

2. **Memoization**
Use `useMemo` for expensive calculations. Use `useCallback` when passing functions to optimized child components.

3. **Context**
Memoize Context provider values to avoid unnecessary re-renders of consumers.

4. **Large Components**
Break down massive components into smaller, focused chunks for better maintainability and rendering performance.

5. **Key Prop**
Always use stable, unique keys in lists. Avoid using array indexes unless the list is truly static.

6. **Event Handlers**
Avoid defining inline functions in JSX if it causes performance issues in a frequently rendered list or tree, though this is secondary to proper memoization and state colocation.
