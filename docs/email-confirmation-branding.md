# Portalink confirmation email — template applied; delivery pending

## Live reinspection - October 21, 2026

The production dashboard was rechecked for the current urgent confirmation-email request. Subject remains **Portalink — Confirm your email address**; the branded template is already saved. Email provider, new signups and Confirm email remain enabled. Custom SMTP is still disabled, and the dashboard shows the built-in delivery warning. Resend still shows portalinknetworks.com verified.

Prepared the same sender/SMTP draft and a domain-restricted Sending access key form without submitting either or handling any secret. The human must create/enter/submit the credential directly under browser security rules, then close its display before agent verification. A specific test recipient was requested separately. **Delivery is still pending; no confirmation email was sent or inbox receipt verified in this inspection.** Sixteen existing confirmation/session/return-origin checks pass. No application source, Auth policy, DNS, SQL, account or deployment changes were made; live Sites495 remains unchanged. Safe pre-credential form screenshots are in ignored logs/email-confirmation-20261021.

Subject: **Portalink — Confirm your email address**

The proposed HTML is `supabase/email-templates/confirmation.html`; the subject is stored separately in `confirmation.subject.txt`. It uses the existing public Hello World poster at https://portalinknetworks.com/portalink-splash-mobile-poster.png, ordinary email tables/inline styles, Portalink text branding and an explicit confirmation button. Static artwork keeps the email usable in clients that block animation/video; images can be blocked too, so the heading, explanation and action work independently of the artwork. No tracking pixels, scripts, forms, analytics or new assets are added.

The secure `{{ .ConfirmationURL }}` placeholder is retained unchanged for the button and copyable fallback. Do not replace it with a fixed site URL, real sample token or a new confirmation flow. No Auth callback or redirect changes are included.

## Provider receipt — 2026-10-16

The user released the earlier provider hold by requesting completion of email activation. The branded Confirm signup HTML and subject were saved in the existing Supabase project and verified after a dashboard reload. Preview links still contain the exact `{{ .ConfirmationURL }}` placeholder. No other Auth template, confirmation policy, callback or redirect was changed. No account was created and no confirmation email has been sent for verification.

The previous default subject/body were retained for rollback in ignored `logs/launch-readiness/confirmation-template-before.json` in the release checkout; screenshot evidence is `logs/launch-readiness/confirmation-template-applied.jpg`. These contain no real confirmation token or credential.

The user signed in to their free Resend account and explicitly approved its three sender-verification DNS records. TXT `resend._domainkey`, DNS-only CNAME `rsend` to `rsend.forge.rmta.net`, and DNS-only CNAME `send` to `send.forge.rmta.net` were added in Cloudflare, read back after reload, and all three were verified by Resend. The domain is ready to send in North Virginia with return path `send`; receiving remains off. Existing Google Workspace MX/SPF/DKIM, website records and DMARC were preserved. Resend Configuration offers **Enable tracking metrics**: no tracking subdomain was configured or created. Its separate new-tracking form was inspected and left unsubmitted. Delivered-link verification is still required. No paid plan, worker host or API-key disclosure is included in this receipt.

The owner handoff is prepared: a new Resend key form named `Portalink Supabase SMTP`, Sending access restricted to `portalinknetworks.com`, remains unsubmitted. Supabase's unsaved SMTP draft uses `Portalink <avi@portalinknetworks.com>`, `smtp.resend.com`, port `465`; Username and Password await owner entry. The owner was asked to create the key, enter `resend` and the key directly in Supabase, save, and close the key dialog before reporting completion. The agent must not read/reveal the key or claim SMTP is active from this draft. Proof: ignored `logs/launch-readiness/resend-domain-verified.jpg`, `resend-key-owner-handoff.jpg`, `smtp-draft-owner-handoff.jpg` in the release checkout.

Custom SMTP activation, delivered-link checks, delivery and real inbox rendering remain pending. The sender domain is verified; the proposed sender address/name still require the owner's review and save of the SMTP form.

## Delivery completion

Publishing the web app alone does not configure SMTP or verify delivery. Preserve the current SMTP configuration before connecting a verified sender; never put its password/API key into source, logs or chat.

After DNS verification and owner entry of the SMTP credential, check the official-domain artwork and unchanged confirmation placeholder, then use an explicitly approved recipient for an actual client/delivery check. Do not change the email-confirmation security policy or other Auth templates as part of branding.

The existing project currently uses Supabase's default delivery; custom SMTP has not been connected. Retain existing Google mail routing and avoid broad Cloudflare delegation. The owner must enter and submit the SMTP credential through the provider UI; do not copy it through this repository.

References: [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

Local preview: ignored `logs/portalink-confirmation-preview.html` uses a non-routable `.invalid` placeholder and local artwork. It cannot confirm an account. Real iPhone Mail/Gmail/Outlook delivery/rendering is not certified by local checks.
