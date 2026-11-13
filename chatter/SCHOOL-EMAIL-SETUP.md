# School email signup

The form derives the first initial and surname from the school email (30yua → A Yu). Email ownership is not verified in this flow; staff approval and the school-email format check control who can register. New accounts must use an address starting with `30` and ending with `@tesdk12.net`. Existing accounts are unchanged.

1. In Supabase → Authentication → Sign In / Providers, keep email signup enabled and turn **Confirm email** OFF. Once an approved student creates an account, Supabase starts their session immediately without an inbox confirmation link.
2. In Authentication → URL Configuration, set Site URL to `https://silkroadhistoryproject.onrender.com` and allow `https://silkroadhistoryproject.onrender.com/` as a redirect URL.
3. Run `chatter/migration-school-email-signup.sql` in SQL Editor after the existing migrations. Then run the current name-format migration described below; it derives names on the server while preserving roster and device checks.
4. Signup no longer sends a confirmation email. Keep a working production SMTP provider for password-reset messages and test reset delivery to a real school inbox.
5. Test a newly approved school email: submit email/password/CAPTCHA, and verify Orbit signs in immediately without sending a confirmation link. Confirm the profile uses the email-derived first initial and surname. Check that unapproved and incorrectly formatted addresses are rejected.

The website code cannot change Supabase Auth's Confirm email setting or configure SMTP using its public API key. Keep the dashboard setting OFF. Without email confirmation, an approved address does not prove inbox ownership; staff should verify applicants before approving them. Password-reset emails remain enabled. The Google button is for personal Gmail accounts; school accounts use email and password.

## Personal Gmail through Google

Run `chatter/migration-personal-google-signup.sql` after the school-email migration to allow any verified `@gmail.com` account using Continue with Google. Names come from the Google profile, not the Gmail address; they are not proof of legal identity. Gmail password signup is not enabled. School roster checks still apply to school signups. Existing device rules remain in force.

In Google Cloud → Google Auth Platform, set the audience to External and publish the app for general access (testing mode allows only added test users). Request only basic openid/email/profile permissions. Keep the authorized Supabase callback URL from the existing Google provider setup. Test with a personal Google account, then verify its Orbit profile name. School administrator restrictions still apply to managed school Google accounts.

## Current name format

Run `chatter/migration-email-derived-names.sql` last. It removes the server requirement for typed names and derives the first initial and surname from school email addresses, including numeric suffixes. It preserves personal Gmail sign-in using Google profile names and does not rename existing locked accounts. New school signup has no first/last-name fields.

The latest `migration-email-derived-names.sql` also restricts new OAuth accounts to personal `@gmail.com` addresses. Rerun it after updating to enforce this on the server.
