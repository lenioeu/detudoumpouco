import { listBrands, resolveAffiliateUrl } from './providers/lomadee.js';

export const URL_REGEX = /https?:\/\/[^\s]+/gi;

export function hostnameOf(url) {
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withScheme).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export async function buildDomainMap(apiKey) {
  const brands = await listBrands({ apiKey });
  const map = new Map();
  for (const brand of brands) {
    if (!brand.approved || !brand.site) continue;
    const host = hostnameOf(brand.site);
    if (host) map.set(host, brand);
  }
  return map;
}

// Acha o primeiro link no texto cujo domínio bate com uma marca aprovada na
// Lomadee, e troca pelo link de afiliado. Retorna null se não achar nenhum
// link reconhecido ou se a Lomadee não gerar o link.
export async function affiliateReplace(text, { apiKey, domainByHost }) {
  const url = text.match(URL_REGEX)?.[0];
  if (!url) return null;

  const host = hostnameOf(url);
  const brand = host && domainByHost.get(host);
  if (!brand) return null;

  const affiliateUrl = await resolveAffiliateUrl({ apiKey, organizationId: brand.organizationId, url });
  if (!affiliateUrl) return null;

  return { brand, originalUrl: url, affiliateUrl, text: text.replace(url, affiliateUrl) };
}
