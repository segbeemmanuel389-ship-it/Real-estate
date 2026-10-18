# Consultation submissions and email

The consultation form sends each submission to the `consultation-email`
Supabase Edge Function. After server-side validation, the function securely
saves the request to `public.consultation_requests` and emails the same details
to the registered email address(es) for the account(s) whose
`public.profiles.role` is `owner`. Owner addresses are resolved from Supabase
Auth at send time; they are not hard-coded or exposed to site visitors. The
function also opens a prefilled WhatsApp message, which the visitor must still
send themselves.

1. Verify a sending domain you control with Resend.
2. In Supabase **Edge Functions → Secrets**, set:
   - `RESEND_API_KEY`: your Resend API key.
   - `RESEND_FROM_EMAIL`: a sender on the verified domain, e.g.
     `Pacific Realty <consultations@your-verified-domain.com>`.
3. Apply `supabase/schema.sql` in the Supabase SQL Editor to create the
   consultation table and its locked-down permissions.
4. From the project directory, link and deploy the function:

   ```powershell
   supabase login
   supabase link --project-ref cxgommpajklksriljfsd
   supabase functions deploy consultation-email
   ```

Supabase provides the project URL and service-role key to Edge Functions. The
function uses the service-role key server-side to find owner profiles and their
registered Auth email addresses, and to insert consultation records. Anonymous
users cannot read or write customer records; authenticated owners can read
them under row-level security, while only the Edge Function's service role can
insert. Ensure the intended recipient has signed up and has the `owner` role in
`public.profiles`.

`supabase/config.toml` disables JWT verification because the public contact
form does not require a user account. The function validates form data and
keeps the Resend key and service-role key server-side. Never put either key in
frontend files or commit them. If email notification fails after a successful
database insert, the form reports that the request was saved and that email
delivery needs attention.
