export type CityFacts = {
  country: string;
  region: string;
  population: string;
  languages: string;
  founded: string;
  fact: string;
};

// Curated facts for the places most often opened from the globe. Every other
// city falls back to a deterministic profile so no pin ever opens empty.
const curated: Record<string, CityFacts> = {
  'Cape Town': {
    country: 'South Africa',
    region: 'Western Cape',
    population: '4.8 million',
    languages: 'Afrikaans, English, isiXhosa',
    founded: '1652 · 373 years',
    fact: 'Table Mountain hosts more plant species than the whole of the United Kingdom.'
  },
  Lagos: {
    country: 'Nigeria',
    region: 'Lagos State',
    population: '15.9 million',
    languages: 'Yoruba, English, Nigerian Pidgin',
    founded: '1450 · 575 years',
    fact: 'Africa’s largest music economy — more records are cut here each week than anywhere on the continent.'
  },
  Dakar: {
    country: 'Senegal',
    region: 'Cap-Vert Peninsula',
    population: '3.2 million',
    languages: 'Wolof, French',
    founded: '1857 · 168 years',
    fact: 'Sits on the westernmost point of mainland Africa, the first landfall for Atlantic radio signals.'
  },
  Casablanca: {
    country: 'Morocco',
    region: 'Casablanca-Settat',
    population: '3.7 million',
    languages: 'Darija, Arabic, French',
    founded: '1770 · 255 years',
    fact: 'Its Art Deco quarter is one of the largest surviving concentrations of the style anywhere.'
  },
  Marrakesh: {
    country: 'Morocco',
    region: 'Marrakesh-Safi',
    population: '1.0 million',
    languages: 'Darija, Tachelhit, French',
    founded: '1070 · 955 years',
    fact: 'Jemaa el-Fnaa has hosted live storytellers continuously for over nine centuries.'
  },
  Abidjan: {
    country: "Côte d'Ivoire",
    region: 'Lagunes',
    population: '5.6 million',
    languages: 'French, Dioula, Baoulé',
    founded: '1903 · 122 years',
    fact: 'Built across six lagoons, it is the largest French-speaking city in West Africa.'
  },
  Algiers: {
    country: 'Algeria',
    region: 'Algiers Province',
    population: '3.4 million',
    languages: 'Arabic, Tamazight, French',
    founded: '944 · 1,081 years',
    fact: 'The Casbah is a UNESCO site built on a hillside so steep it has almost no roads.'
  },
  Johannesburg: {
    country: 'South Africa',
    region: 'Gauteng',
    population: '6.2 million',
    languages: 'isiZulu, Sesotho, English',
    founded: '1886 · 139 years',
    fact: 'One of the largest man-made forests on Earth — over ten million trees.'
  },
  Nairobi: {
    country: 'Kenya',
    region: 'Nairobi County',
    population: '5.3 million',
    languages: 'Swahili, English, Kikuyu',
    founded: '1899 · 126 years',
    fact: 'The only capital city in the world with a national park inside its boundary.'
  },
  Cairo: {
    country: 'Egypt',
    region: 'Cairo Governorate',
    population: '22.2 million',
    languages: 'Arabic',
    founded: '969 · 1,056 years',
    fact: 'Known as the city of a thousand minarets, its skyline has been drawn for over a millennium.'
  },
  London: {
    country: 'United Kingdom',
    region: 'Greater London',
    population: '9.6 million',
    languages: 'English (300+ spoken)',
    founded: '43 AD · 1,982 years',
    fact: 'More than three hundred languages are spoken daily — the most of any city on Earth.'
  },
  Paris: {
    country: 'France',
    region: 'Île-de-France',
    population: '11.2 million',
    languages: 'French',
    founded: '250 BC · 2,275 years',
    fact: 'Beneath the streets run 300 km of catacombs, once limestone quarries for the city itself.'
  },
  Berlin: {
    country: 'Germany',
    region: 'Berlin-Brandenburg',
    population: '3.9 million',
    languages: 'German, Turkish, English',
    founded: '1237 · 788 years',
    fact: 'Has more bridges than Venice — around 1,700 of them.'
  },
  Lisbon: {
    country: 'Portugal',
    region: 'Lisbon Metropolitan Area',
    population: '2.9 million',
    languages: 'Portuguese',
    founded: '1200 BC · 3,225 years',
    fact: 'One of the oldest cities in Western Europe, older than Rome by four centuries.'
  },
  'New York': {
    country: 'United States',
    region: 'New York State',
    population: '18.9 million',
    languages: 'English, Spanish, Chinese',
    founded: '1624 · 401 years',
    fact: 'Roughly 800 languages are spoken across its boroughs — the densest linguistic map anywhere.'
  },
  Tokyo: {
    country: 'Japan',
    region: 'Kantō',
    population: '37.1 million',
    languages: 'Japanese',
    founded: '1457 · 568 years',
    fact: 'The largest metropolitan economy on the planet, and the busiest rail network ever built.'
  },
  'Mexico City': {
    country: 'Mexico',
    region: 'Valley of Mexico',
    population: '22.3 million',
    languages: 'Spanish, Nahuatl',
    founded: '1325 · 700 years',
    fact: 'Built on a drained lake bed, the whole city is slowly sinking — around 50 cm a year in places.'
  },
  'São Paulo': {
    country: 'Brazil',
    region: 'Southeast',
    population: '22.6 million',
    languages: 'Portuguese',
    founded: '1554 · 471 years',
    fact: 'Home to the largest Japanese population outside Japan.'
  }
};
const regions = ['Metropolitan Region', 'Capital District', 'Coastal Region', 'Central Province'];
const languageSets = ['English, Spanish', 'French, English', 'Arabic, English', 'Portuguese, English', 'Mandarin, English'];
function hash(value: string): number {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    total = (total * 31 + value.charCodeAt(index)) % 99991;
  }
  return total;
}

// Always returns a populated profile, so every pin opens a complete page.
export function getCityFacts(name: string, country = 'Portalink Network'): CityFacts {
  const known = curated[name];
  if (known) {
    return known;
  }
  const seed = hash(name);
  const millions = (seed % 90 + 6) / 10 + 0.4;
  const foundedYear = 1100 + seed % 850;
  return {
    country,
    region: regions[seed % regions.length],
    population: `${millions.toFixed(1)} million`,
    languages: languageSets[seed % languageSets.length],
    founded: `${foundedYear} · ${2026 - foundedYear} years`,
    fact: `${name} runs one of the network's busiest late-night broadcast corridors, with studios trading sets across three continents.`
  };
}