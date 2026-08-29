/**
 * The company name as it is written in each language the product greets people
 * in.
 *
 * "Portalink" is a compound of PORTAL and LINK, so it is not held in English
 * while the words around it change — each rendering spells both halves in its
 * own language (portail + lien, Portal + Verbindung, ポータル + リンク), joined
 * the way that language joins a compound. The incorporation wording follows the
 * same rule.
 *
 * Scripts with no letter case are written as they are actually written; only
 * the Latin renderings are set in capitals.
 */
export type CompanyNameRendering = {
  /** The language this rendering is written in, in that language. */
  language: string;
  /** BCP 47 tag, so the text is announced and shaped in its own language. */
  locale: string;
  text: string;
};

export const companyNameRenderings: CompanyNameRendering[] = [{
  language: 'English',
  locale: 'en',
  text: 'PORTALINK NETWORKS INC.'
}, {
  language: 'Français',
  locale: 'fr',
  text: 'PORTAILLIEN RÉSEAUX SARL'
}, {
  language: 'Español',
  locale: 'es',
  text: 'PORTALENLACE REDES S.A.'
}, {
  language: 'Deutsch',
  locale: 'de',
  text: 'PORTALVERBINDUNG NETZWERKE GMBH'
}, {
  language: 'Português',
  locale: 'pt',
  text: 'PORTALLIGAÇÃO REDES LTDA.'
}, {
  language: 'Italiano',
  locale: 'it',
  text: 'PORTALECOLLEGAMENTO RETI S.P.A.'
}, {
  language: 'Nederlands',
  locale: 'nl',
  text: 'PORTAALSCHAKEL NETWERKEN B.V.'
}, {
  language: 'Polski',
  locale: 'pl',
  text: 'PORTALŁĄCZE SIECI SP. Z O.O.'
}, {
  language: 'Türkçe',
  locale: 'tr',
  text: 'PORTALBAĞ AĞLARI A.Ş.'
}, {
  language: 'Svenska',
  locale: 'sv',
  text: 'PORTALLÄNK NÄTVERK AB'
}, {
  language: 'Norsk',
  locale: 'nb',
  text: 'PORTALLENKE NETTVERK AS'
}, {
  language: 'Bahasa Indonesia',
  locale: 'id',
  text: 'PORTALTAUT JARINGAN PT'
}, {
  language: '日本語',
  locale: 'ja',
  text: 'ポータルリンク・ネットワークス株式会社'
}, {
  language: 'हिन्दी',
  locale: 'hi',
  text: 'पोर्टललिंक नेटवर्क्स प्रा. लि.'
}, {
  language: 'संस्कृतम्',
  locale: 'sa',
  text: 'द्वारसंयोग जालसंस्था'
}];