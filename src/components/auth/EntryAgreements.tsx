import { acknowledgeLaunchReview, ADMISSION_KEY, clearTransientBirth, LAUNCH_REVIEW_VERSION } from '../../features/launch/adultLaunch';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ModalPortal } from '../ui/ModalPortal';
import { useModalFocus } from '../../hooks/useModalFocus';
import { useDialogViewport } from '../../hooks/useDialogViewport';
import './entryAgreements.css';

const agreements = ['A. Terms of Service', 'B. Privacy Policy', 'C. Content Licence', 'D. AI Access Terms'];
const testWarning = "DRAFT FOR REVIEW — CONTROLLED TEST ONLY. This wording is not yet approved for use. It applies only to invited adult testers in the United States after the test and its safeguards are separately authorized. It is not the public-launch agreement. Reviewing this draft does not start testing or authorize any system change.";
const testOverview = [
  "Portalink is operated personally by Avinaash Mangalmurti, not by an incorporated company. Questions about this test, these terms, or privacy can be sent to avi@portalinknetworks.com.",
  "The controlled test checks Google sign-in, eligibility screening, private account setup, security controls, and recovery. Participation is voluntary, invitation-only, free, and limited to people aged 18 or older who are in the United States and control the approved test accounts.",
  "Continuing accepts section A and the limited test-content licence in section C, and acknowledges the restrictions in section D. Section B is a privacy notice you acknowledge receiving; it is not consent to optional processing. No optional permission is requested or granted.",
  "Choose Disagree to leave without starting this signup. You may stop participating later and contact the operator about your account or data. Existing legal rights are preserved."
];
const testSections = [
  [
    "These terms govern only your participation in Portalink’s invited Google sign-in test. They take effect for you when you choose “Accept test Terms and acknowledge Privacy” after reviewing this version. The date in the version identifier identifies the draft, not a scheduled test date. They do not enroll you in a public launch or require payment.",
    "You must be at least 18, be in the United States, and use only test accounts you control or have explicit permission to use. Provide accurate eligibility information and do not share your credentials or let another person use your invitation. Participation may be declined or stopped if eligibility or account control cannot be established.",
    "Follow the agreed test instructions. Use synthetic content or your own non-sensitive work, keep test profiles and projects private, and do not contact other users or publish test projects. Do not upload identity documents, payment details, passwords, authentication codes, health information, other people’s personal information, or material you lack permission to use.",
    "Do not access another person’s account, bypass security controls, interfere with the service, or test outside the approved scope. Report unexpected access, exposure, account linking, or data changes to avi@portalinknetworks.com. Provide a short description without sending secrets, tokens, or private user records.",
    "This is experimental software. Sign-in, test data, and access may be interrupted or behave incorrectly. Keep your own copies of any work. The operator may pause or end the test for safety, security, technical or legal reasons, and will explain restrictions when appropriate without compromising an investigation or someone else’s information. You may ask the operator to review a restriction.",
    "Stopping participation or closing the test window does not automatically delete your account or test data. The data-request and retention information in section B continues to apply. Any later paid feature, public-launch agreement, or new optional use requires separate terms or permission as appropriate; continuing this test does not approve those changes.",
    "California law governs these test terms to the extent permitted by law, while mandatory consumer protections remain available. You may contact the operator to try to resolve a concern, but doing so is not a prerequisite to a claim or complaint and does not shorten a legal deadline. Access to courts, small claims and regulators is preserved. There is no mandatory arbitration, class-action waiver, exclusive San Francisco forum, or agreed financial liability cap in these test terms. Nothing excludes a right or liability that cannot lawfully be excluded."
  ],
  [
    "This notice describes processing for the controlled test by Avinaash Mangalmurti, operating Portalink personally. Privacy questions and requests go to avi@portalinknetworks.com. Read this notice before participating; acknowledgment records receipt of the notice, not permission for unrelated uses.",
    "The eligibility check uses your country and full birth date to assess the US/18+ requirement. The full birth date is used transiently for screening and the Google-start request, rather than being written to the test admission or handoff database. The recorded admission contains the US country designation, adult age band, agreement versions and timestamps. This is self-declared eligibility, not independent age or location verification.",
    "If you choose Google sign-in, Google authenticates you and supplies basic identity information, which may include your name, email address, profile picture and stable Google account identifier. Requested scopes are openid, email and profile. This test does not request access to Gmail messages, Drive files, contacts, or your Google password. Google separately handles your use of its sign-in service under its own terms and privacy policy.",
    "Portalink processes the test identity and linked account identifiers, profile details you enter, private test projects and uploads, agreement records, test results, and any support messages you send. Authentication cookies, browser storage and session tokens keep sign-in working; temporary state, nonce and PKCE values protect the sign-in exchange. Infrastructure providers may also process IP addresses, browser/device information, request times and security or error logs needed to operate and protect their services.",
    "We use this information to check eligibility and account control, authenticate you, maintain the account and private test content, record this version’s acceptance and notice acknowledgment, diagnose approved test results, prevent abuse, respond to your requests, and meet legal obligations. Test accounts and content start private. The operator and service providers may access information as needed for these purposes; private does not mean inaccessible to the operator.",
    "The test uses Google for sign-in, Supabase for authentication, database and file storage, and OpenAI Sites and its hosting infrastructure for the preview and server requests. Google Workspace processes messages sent to the contact address. These providers process information to deliver their services; their service-specific terms and privacy practices also apply. We may disclose information when legally required or reasonably necessary to address a security threat or protect legal rights. No new public audience or publication of your private work is authorized by this test.",
    "We will not sell test personal information, use it for targeted advertising, send marketing email, or use your personal information or content to train AI models. Optional analytics, reading-activity collection, marketing and promotional uses are disabled for this test. Essential authentication and security processing still occurs. This notice does not authorize any optional tracking or any use of your work in Portalink promotion.",
    "Browser eligibility staging lasts up to 30 minutes. Google handoffs expire after 10 minutes and cannot then be used to complete sign-in. Scheduled cleanup is intended to remove expired and finished handoffs, but logical expiry is not a guarantee of immediate physical deletion during a failure. The cleanup job’s own run history is intended to be retained for seven days; accounts, content and acceptance records are separate from that history.",
    "Test accounts, private test content, and agreement records remain after the test window so results can be reviewed and recovery can be checked. We review retained test information when the test closes and remove information no longer needed, subject to legitimate security, dispute and legal needs and provider backup constraints. This draft does not promise a fixed account-deletion or backup-expiry deadline. Closing the preview or signing out is not a deletion request. Providers may process and retain operational information under their own service arrangements.",
    "In-app account deletion is disabled. You may email a request for access, correction, export, or deletion of your test information, or ask to stop further participation. We may verify account ownership and must protect other people’s information. We will explain any legal, security, technical or backup limitation that affects fulfilling a request. Do not email passwords, identity documents, authentication codes or tokens. No service can guarantee absolute security; report a suspected problem promptly."
  ],
  [
    "You retain ownership of the content you submit. You must own it or have permission to use it in this controlled test. Use synthetic, non-sensitive test material whenever possible and keep it private. Submitting work does not transfer its ownership to Portalink.",
    "For this test, you grant Avinaash Mangalmurti, operating Portalink, a non-exclusive, royalty-free licence to host, store, copy, transmit, format and display that content only as reasonably needed to operate the private test, provide it to you, perform approved checks, maintain security, and review or recover test results. Service providers may process it on the operator’s behalf only for those functions.",
    "This licence does not authorize public distribution, sale, advertising, promotional use, AI training, optional AI retrieval, or optional AI reproduction. No other user receives permission to reuse your work through this test. Any later promotional or optional use requires a separate, specific permission.",
    "You may withdraw from further test use by contacting avi@portalinknetworks.com. The operator will stop new discretionary test uses of your content after receiving and verifying the request. Existing technical copies, backups, necessary security/dispute evidence and legally required records may remain subject to the retention and request process in section B. This licence continues only to the extent necessary to hold and manage those remaining copies; it does not permit new promotion or AI use.",
    "Feedback you send about bugs or the test may be used to understand and improve the service. That does not transfer ownership of your submitted work, authorize public attribution or endorsement, or permit AI training on your feedback or personal information."
  ],
  [
    "Optional AI retrieval and reproduction are unavailable in this controlled test. Accepting these test terms grants no permission to retrieve your work for an AI system, reproduce it in AI output, or make it available for model training. No opt-in to such uses is bundled with signup.",
    "Portalink will not use your submitted content, feedback or personal information to train AI models, or authorize others to do so through this test. The limited licence in section C is for operating the test, not an AI licence. The same restriction applies to information received through Google sign-in.",
    "Any future optional AI feature would need a separate review and a specific per-project choice before it could be enabled. Existing test acceptance would not count as permission. Automated processing required for sign-in, security or ordinary file delivery is not an authorization for model training, optional AI retrieval or AI reproduction.",
    "Private test controls cannot guarantee that material you independently disclose elsewhere will remain confidential or that copies outside Portalink’s control can be recovered. Do not publish test work or send it to an external AI service as part of this test. Report suspected unauthorized access or AI use to avi@portalinknetworks.com."
  ]
];
type Controls = { request: () => Promise<boolean>; show: () => void };
const Context = createContext<Controls>({ request: async () => false, show: () => undefined });
// eslint-disable-next-line react-refresh/only-export-components -- This consumer belongs to the same agreement provider boundary.
export const useEntryAgreements = () => useContext(Context);

/** UI acknowledgment is staged per tab; the authenticated backend records the receipt. */
export function EntryAgreements({ onDisagree, children }: { onDisagree: () => void; children: (controls: Controls) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolve = useRef<((value: boolean) => void) | null>(null);
  useEffect(() => () => { resolve.current?.(false); }, []);
  const controls: Controls = {
    show: () => setOpen(true),
    request: () => {
      if (accepted) return Promise.resolve(true);
      if (resolve.current) return Promise.resolve(false);
      setOpen(true);
      return new Promise<boolean>(complete => { resolve.current = complete; });
    },
  };
  function finish(agree: boolean) {
    if (agree) { try { acknowledgeLaunchReview(); setError(null); } catch { setError('Eligibility expired. Return to Welcome and check eligibility again.'); return; } }
    else { clearTransientBirth(); try { sessionStorage.removeItem(ADMISSION_KEY); } catch { /* Storage may be unavailable. */ } setError(null); }
    setOpen(false); setAccepted(agree);
    resolve.current?.(agree); resolve.current = null;
    if (!agree) onDisagree();
  }
  return <Context.Provider value={controls}>
    <div ref={element => { if (element) element.inert = open; }} aria-hidden={open || undefined}>{children(controls)}</div>
    {open && <AgreementSheet error={error} onAgree={() => finish(true)} onDisagree={() => finish(false)} />}
  </Context.Provider>;
}

export function EntryLegal() {
  const { show } = useEntryAgreements();
  return <p className="entry-legal">Before creating an account, read our <button type="button" onClick={show}>Terms</button> and <button type="button" onClick={show}>Privacy</button>.</p>;
}

function AgreementSheet({ onAgree, onDisagree, error }: { onAgree: () => void; onDisagree: () => void; error: string | null }) {
  const dialog = useRef<HTMLElement>(null), viewport = useDialogViewport();
  const [selected, setSelected] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  useModalFocus(true, dialog, onDisagree, true);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; heading.current?.focus({ preventScroll:true }); }, [selected]);
  return <ModalPortal><div ref={viewport} className="entry-agreements-overlay" style={{ top:'var(--dialog-viewport-top, 0px)', height:'var(--dialog-viewport-height, 100dvh)' }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="entry-agreement-title" tabIndex={-1} className="entry-agreements-sheet">
      <header>{selected !== null && <button type="button" onClick={() => setSelected(null)}>‹ Terms and Conditions</button>}
        <h1 id="entry-agreement-title" ref={heading} tabIndex={-1}>{selected === null ? 'Terms and Conditions' : agreements[selected]}</h1>
      </header>
      <div ref={scroller} className="entry-agreements-scroll">
        <div className="entry-agreements-card"><strong>IMPORTANT</strong><p>{testWarning}</p>
          {selected === null && <nav aria-label="Agreements">{agreements.map((title, index) => <button type="button" key={title} onClick={() => setSelected(index)}>{title}<span aria-hidden="true">›</span></button>)}</nav>}
        </div>
        <div className="entry-agreements-card"><h2>{selected === null ? 'Agreements overview' : agreements[selected]}</h2>
          <p>Test agreement bundle: <code>{LAUNCH_REVIEW_VERSION}</code></p>
          {(selected === null ? testOverview : testSections[selected]).map((paragraph,index) => <p key={index}>{paragraph}</p>)}
        </div>
        <p>Privacy is acknowledged as a notice. No marketing, analytics, promotional, AI-training, optional AI-retrieval or optional AI-reproduction permission is granted. Disagree returns you to Welcome without starting this signup.</p>
      </div>
      {error && <p role="alert">{error}</p>}
      <footer><button type="button" className="entry-agree" onClick={onAgree}>Accept test Terms and acknowledge Privacy</button><button type="button" onClick={onDisagree}>Disagree</button></footer>
    </section>
  </div></ModalPortal>;
}
