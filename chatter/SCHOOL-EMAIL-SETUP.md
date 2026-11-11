# School email signup

The form collects first and last names as self-reported information. A confirmed school email verifies mailbox access, not a legal name. New accounts must use an address starting with `30` and ending with `@tesdk12.net`. Existing accounts are unchanged.

1. In Supabase → Authentication → Sign In / Providers → Email, enable **Confirm email** and email signup. This is required: the form refuses new signups while automatic confirmation is enabled.
2. In Authentication → URL Configuration, set Site URL to `https://silkroadhistoryproject.onrender.com` and allow `https://silkroadhistoryproject.onrender.com/` as a redirect URL.
3. Run `chatter/migration-school-email-signup.sql` in SQL Editor after the existing migrations. It validates names on the server while preserving the roster and device checks. Existing `lock_account_name()` uses the supplied first/last metadata on first login.
4. Configure production SMTP in Supabase for student signup delivery. The default mail service has recipient restrictions and rate limits; test a real school mailbox and its spam folder.
5. Test a new allowed school email: submit name/password/CAPTCHA, receive the email, confirm, then sign in. Before confirmation, password login must fail. Confirm the profile uses the entered name. Test a personal email and blank names are rejected.

The website code cannot enable email confirmation, configure SMTP or run SQL using its public API key. Those dashboard steps require project-owner access. Google sign-in remains available for accounts whose institution approves it.

## Personal Gmail through Google

Run `chatter/migration-personal-google-signup.sql` after the school-email migration to allow any verified `@gmail.com` account using Continue with Google. Names come from the Google profile, not the Gmail address; they are not proof of legal identity. Gmail password signup is not enabled. School roster checks still apply to school signups. Existing device rules remain in force.

In Google Cloud → Google Auth Platform, set the audience to External and publish the app for general access (testing mode allows only added test users). Request only basic openid/email/profile permissions. Keep the authorized Supabase callback URL from the existing Google provider setup. Test with a personal Google account, then verify its Orbit profile name. School administrator restrictions still apply to managed school Google accounts.
