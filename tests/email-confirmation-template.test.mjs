import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const body=readFileSync(new URL('../supabase/email-templates/confirmation.html',import.meta.url),'utf8');
const subject=readFileSync(new URL('../supabase/email-templates/confirmation.subject.txt',import.meta.url),'utf8').trim();
test('confirmation email identifies Portalink and keeps secure provider-generated URLs unchanged',()=>{
 assert.equal(subject,'Portalink — Confirm your email address');
 const links=[...body.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)];
 assert.equal(links.length,3);assert.equal(links[0][1],'{{ .ConfirmationURL }}');assert.match(links[0][2],/Confirm my Portalink email/);
 assert.equal(links[1][1],'{{ .ConfirmationURL }}');assert.equal(links[1][2],'{{ .ConfirmationURL }}');assert.equal(links[2][1],'https://portalinknetworks.com/');
 assert.match(body,/<h1[^>]*>Confirm your Portalink email address<\/h1>/);assert.doesNotMatch(body,/Supabase Auth|token_hash|access_token|<script|<form|<video|<iframe/i);
});
test('Hello World artwork is optional to understanding and uses the existing official-domain asset',()=>{
 const images=[...body.matchAll(/<img\b[^>]*>/g)];assert.equal(images.length,1);
 assert.match(images[0][0],/src="https:\/\/portalinknetworks.com\/portalink-splash-mobile-poster.png"/);assert.match(images[0][0],/alt="Hello World/);
 assert.ok(existsSync(new URL('../public/portalink-splash-mobile-poster.png',import.meta.url)));
 assert.match(body,/Welcome to Portalink/);assert.match(body,/If you did not create a Portalink account/);assert.match(body,/copy and paste this link/);
 assert.ok(body.length<15000);
});
