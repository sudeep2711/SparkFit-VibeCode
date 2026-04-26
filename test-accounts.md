# SparkFit — Test Accounts

> Passwords are not stored in Supabase in plain text. Fill in the ones you remember.

---

## Onboarded (have workout plan)

| Email | Password | Created | Notes |
|-------|----------|---------|-------|
| `intermediate_sudeep@test.com` | ___________ | 2026-03-25 | Latest primary test account |
| `vaishutester@gmail.com` | ___________ | 2026-03-09 | |
| `tester123@test.com` | `password123` | 2026-03-09 | |
| `bug_hunter@example.com` | ___________ | 2026-03-09 | |
| `jetski_test@test.com` | ___________ | 2026-03-09 | |
| `test@test.com` | ___________ | 2026-03-09 | |
| `tester@gmail.com` | ___________ | 2026-03-08 | |
| `sudeeptest123@gmail.com` | ___________ | 2026-03-08 | |
| `test3@sparkfit.com` | ___________ | 2026-03-08 | |

## Not Onboarded (no workout plan)

| Email | Password | Created | Notes |
|-------|----------|---------|-------|
| `sudeep@test.com` | ___________ | 2026-03-25 | Will hit "No active plan" on dashboard |
| `test@example.com` | ___________ | 2026-03-24 | |
| `testuser_1773380634187@sparkfit-test.com` | ___________ | 2026-03-13 | Auto-generated test user |

## Early Test Accounts (no plan, from guided onboarding dev)

| Email | Password | Created | Notes |
|-------|----------|---------|-------|
| `test_guided_v6@sparkfit.com` | ___________ | 2026-03-08 | |
| `test_guided_v4@sparkfit.com` | ___________ | 2026-03-08 | |
| `test_guided_3@sparkfit.com` | ___________ | 2026-03-08 | |
| `test_guided_final_3@sparkfit.com` | ___________ | 2026-03-08 | |
| `test_guided_2@sparkfit.com` | ___________ | 2026-03-08 | |
| `test_guided@sparkfit.com` | ___________ | 2026-03-08 | |
| `test_new_user3@sparkfit.com` | ___________ | 2026-03-08 | |
| `test_new_user1@sparkfit.com` | ___________ | 2026-03-08 | |

---

## Supabase Project

- **Project ref:** `pojshuemshcdllrqkhog`
- **Dashboard:** https://supabase.com/dashboard/project/pojshuemshcdllrqkhog
- **Auth page:** https://supabase.com/dashboard/project/pojshuemshcdllrqkhog/auth/users

## How to Reset a Password

In the Supabase dashboard → Authentication → Users → click the user → "Send password recovery email" or update directly via SQL:

```sql
-- Reset via Supabase dashboard is preferred
-- Or use the CLI:
-- supabase auth admin update-user <user-id> --password "newpassword"
```
