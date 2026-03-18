

## Plan: Branding "Advanced Marketing" + Fix Infinite Loading on Sign Up

### Problem 1: Infinite loading after sign up

The `AuthProvider` has a race condition. After `signUp`, Supabase may fire `onAuthStateChange` with a session (if email confirmation is disabled) or not fire at all (if confirmation is required). The `loading` state can get stuck at `true` if both `getSession` and `onAuthStateChange` resolve in an unexpected order or if `onAuthStateChange` fires before `getSession` completes.

**Fix**: Restructure `AuthProvider` to set up `onAuthStateChange` listener first, then call `getSession`. Use a ref to track if initial session has been loaded, ensuring `loading` is set to `false` exactly once. Also handle the sign-up flow in `LoginPage` to reset `submitting` and show proper feedback without waiting for a session that may never come (email confirmation required).

### Problem 2: Brand theming for "Advanced Marketing"

The logo is a bold blue (`#0A7CFF` / approximately `211 100% 50%`). Will update the color theme to match this blue across light and dark modes.

---

### Files to change

**1. Copy logo to project**
- Copy `user-uploads://Logo_Advanced_3.png` to `src/assets/logo.png`

**2. `src/components/auth/AuthProvider.tsx`**
- Set up `onAuthStateChange` before `getSession`
- Use a ref to prevent double `setLoading(false)` race
- Ensure `loading` becomes `false` reliably after initial session check

**3. `src/components/auth/LoginPage.tsx`**
- Add logo image above the card
- After successful sign-up, show toast and reset `submitting` (don't wait for redirect since email confirmation may be required)
- Brand name "Advanced Marketing" in the header

**4. `src/index.css`**
- Change `--primary` from purple (`243 75%`) to Advanced Marketing blue (`211 100% 50%`) in both light and dark modes
- Update `--ring`, `--sidebar-primary`, `--sidebar-ring` to match

**5. `src/components/layout/AppLayout.tsx`**
- Replace the "C" / "CRM" branding in the sidebar header with the logo image and "Advanced Marketing" text

