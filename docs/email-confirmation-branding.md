# Portalink confirmation email — branded sender and inbox delivery verified

## Real password-reset delivery verified - October 21, 2026

The user explicitly requested a password-reset test at their existing Gmail address. The normal production reset API accepted one request at2026-10-22T04:52:21Z; Gmail received it at04:52:23Z (9:52pmPacific), labeledINBOX. Metadata confirms **Portalink <avi@portalinknetworks.com>** and **Portalink — Reset your password**, with DKIM/SPF pass. No password change or recovery-link/token access occurred. Safe external receipts: portalink-reset-email-test.json and portalink-reset-inbox-proof.json. This adds actual reset-email delivery proof to the earlier signup proof; no other account-email type was sent for this test.

## All account email subjects branded - October 21, 2026

The live production dashboard's13 account email subjects were saved/reloaded and verified. Twelve subjects changed; signup confirmation already included Portalink. All share the enabled project-wide **Portalink** SMTP sender, whose **avi@portalinknetworks.com** address was proven by the actual signup inbox receipt below. Existing security-notification enabled/disabled states are preserved: these7 optional notices remain disabled. No template body, secure link/code placeholder, Auth policy, redirect or private SMTP credential changed. No new message was sent during this branding update.

| Email | Saved subject |
| --- | --- |
| Signup confirmation | Portalink — Confirm your email address |
| Password reset | Portalink — Reset your password |
| Invitation | Portalink — You have been invited |
| Email sign-in | Portalink — Your sign-in link |
| Email-change confirmation | Portalink — Confirm your email change |
| Reauthentication | Portalink — {{ .Token }} is your verification code |
| Password changed | Portalink — Your password was changed |
| Email address changed | Portalink — Your email address was changed |
| Phone number changed | Portalink — Your phone number was changed |
| Sign-in method linked | Portalink — A new sign-in method was linked to your account |
| Sign-in method removed | Portalink — A sign-in method was removed from your account |
| MFA method added | Portalink — A new verification method was added to your account |
| MFA method removed | Portalink — A verification method was removed from your account |

Evidence: external visualization folder all-account-email-branding.json, account-email-subjects.json and portalink-password-reset-subject.png, with per-template screenshots for remaining security notices. Redacted subject fields were verified visually after reload. This configuration is active for shared MOBILE/WEB/public Auth; no app deployment or SQL was needed. Actual delivery was tested for signup confirmation only, as recorded below.

## Real signup delivery verified - October 21, 2026

The user approved a separate Gmail test-alias signup. The existing production signup API generated a confirmation at 2026-10-22T04:40:23Z; Gmail received it at 04:40:24Z (9:40pm Pacific on October 21), labeled INBOX. Metadata verifies **Portalink <avi@portalinknetworks.com>** as From and **Portalink — Confirm your email address** as Subject. Gmail DKIM and SPF both pass. This is the actual production signup email, separate from the earlier Gmail preview.

The authorized test signup remains unconfirmed; no confirmation link/token was read or opened. The existing account, provider configuration, templates, policy and redirects remain unchanged. Receipt: external visualization folder portalink-real-confirmation-test.json and portalink-confirmation-inbox-proof.json. Confirmation-link completion and real-phone mail rendering remain untested. Earlier delivery-pending sections below are historical and superseded by this section. Application source/live Sites497 were unchanged by this test.

## Sender activation verified - October 21, 2026

The owner completed the private key setup and saved custom SMTP in the existing production project. After a fresh reload at2026-10-22T03:38:55Z, custom SMTP remains enabled and public settings persist: **Portalink <avi@portalinknetworks.com>**, smtp.resend.com:465. Save changes is disabled, confirming there is no unsaved form draft. The agent did not read or capture the private key. The confirmation subject remains **Portalink — Confirm your email address**. Confirmation policy, redirects, other Auth templates, user accounts and existing DNS were not changed.

This verifies saved provider/sender configuration, not inbox delivery. The approved existing account is already verified, so its accepted signup-resend request generated no new confirmation. A separately requested preview was sent through connected Gmail, labeled Preview only with an inactive button; its me sender was a preview artifact. A fresh actual signup delivery and confirmation-link check remain pending. No new test account or additional email was created during activation verification.

Safe receipt and screenshot: external visualization folder portalink-sender-saved.json/png referenced in the current handoff; a credential-free copy of the activation receipt is ignored logs/email-confirmation-20261021/smtp-activation.json. Earlier disabled/draft notes below are historical and superseded by this section. Live Sites496 and the separate unpublished profile-photo changes are unchanged.

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
