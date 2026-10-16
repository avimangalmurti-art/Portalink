# Portalink confirmation email — prepared, not applied

Subject: **Portalink — Confirm your email address**

The proposed HTML is `supabase/email-templates/confirmation.html`; the subject is stored separately in `confirmation.subject.txt`. It uses the existing public Hello World poster at https://portalinknetworks.com/portalink-splash-mobile-poster.png, ordinary email tables/inline styles, Portalink text branding and an explicit confirmation button. Static artwork keeps the email usable in clients that block animation/video; images can be blocked too, so the heading, explanation and action work independently of the artwork. No tracking pixels, scripts, forms, analytics or new assets are added.

The secure `{{ .ConfirmationURL }}` placeholder is retained unchanged for the button and copyable fallback. Do not replace it with a fixed site URL, real sample token or a new confirmation flow. No Auth callback or redirect changes are included.

## Applying is a separate provider-settings action

The existing request holds provider changes. Nothing here changes live Supabase email delivery, templates, SMTP, DNS, sender identity, Google sign-in or SQL. Publishing the web app alone will not activate this email. No confirmation email was sent and no account was created for testing.

When provider changes are explicitly released for this specific task, first inspect and retain the current confirmation template/subject and SMTP sender configuration for rollback. Apply only this Confirm signup body and subject in the existing Supabase project. Verify artwork availability on the official domain and the unchanged confirmation URL placeholder, then use an explicitly approved disposable recipient for an actual client/delivery check. Do not change the email-confirmation security policy or other Auth templates as part of branding.

The inbox sender shown as Supabase Auth is separate from the email body/subject. Proposed display name: **Portalink**. Renaming the sender needs a separately reviewed existing/custom SMTP configuration. Do not invent a sender email address, change SMTP credentials, provision a provider or alter DNS to force this cosmetic update. Retain the current sender address unless the user explicitly approves a verified alternative. Current SMTP capability has not been inspected in this task.

References: [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

Local preview: ignored `logs/portalink-confirmation-preview.html` uses a non-routable `.invalid` placeholder and local artwork. It cannot confirm an account. Real iPhone Mail/Gmail/Outlook delivery/rendering is not certified by local checks.
